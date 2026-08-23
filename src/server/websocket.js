const { WebSocketServer } = require('ws');
const { readDb, writeDb, mutateDb } = require('./db');
const { generateUniqueId } = require('./utils');
const { compilePrompt } = require('../../engine/compiler');
// Auth is required inline in the upgrade handler
const logger = require('./logger');

// Set of connected clients
const clients = new Set();

// Map of active streams: conversationId -> StreamState
const activeStreams = new Map();

function initWebSocketServer(server) {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        // Validate auth token from query string if APP_PASSWORD is set
        if (process.env.APP_PASSWORD) {
            const parsedUrl = new URL(request.url, 'http://localhost');
            const token = parsedUrl.searchParams.get('token') || '';
            const authHeader = `Bearer ${token}`;
            const fakeReq = { headers: { authorization: authHeader } };
            const fakeRes = {
                status: (code) => ({
                    json: () => {
                        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                        socket.destroy();
                    }
                })
            };
            let authorized = false;
            const next = () => { authorized = true; };
            // requireAuth is synchronous
            const { requireAuth } = require('./endpoints/auth');
            requireAuth(fakeReq, fakeRes, next);
            if (!authorized) return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    wss.on('connection', (ws) => {
        clients.add(ws);
        logger.info('ws_client_connected', { totalClients: clients.size });

        ws.on('message', async (messageData) => {
            try {
                const message = JSON.parse(messageData.toString());
                const { type, payload } = message;

                if (type === 'generate') {
                    await handleGenerate(ws, payload);
                } else if (type === 'abort') {
                    await handleAbort(payload);
                }
            } catch (err) {
                logger.error('ws_message_parse_error', { message: err.message });
                try {
                    ws.send(JSON.stringify({ type: 'error', error: 'Invalid message payload' }));
                } catch (e) {}
            }
        });

        ws.on('close', () => {
            clients.delete(ws);
            logger.info('ws_client_disconnected', { totalClients: clients.size });
            // Clean up any running streams associated with this connection
            for (const [conversationId, streamState] of activeStreams.entries()) {
                if (streamState.ws === ws) {
                    logger.info('ws_client_close_abort_stream', { conversationId, streamMsgId: streamState.streamMsgId });
                    handleStreamFinish(conversationId, streamState.streamMsgId, true, 'Client disconnected');
                }
            }
        });

        ws.on('error', (err) => {
            logger.error('ws_connection_error', { message: err.message });
            clients.delete(ws);
            // Clean up any running streams associated with this connection
            for (const [conversationId, streamState] of activeStreams.entries()) {
                if (streamState.ws === ws) {
                    logger.info('ws_client_error_abort_stream', { conversationId, streamMsgId: streamState.streamMsgId });
                    handleStreamFinish(conversationId, streamState.streamMsgId, true, 'Client disconnected with error');
                }
            }
        });
    });
}

// Broadcast message to all connected clients
function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            try {
                client.send(data);
            } catch (e) {
                console.error("Failed to broadcast message to client:", e);
            }
        }
    }
}

// Send message directly to the specific client socket
function sendToSocket(ws, message) {
    if (ws && ws.readyState === 1) { // WebSocket.OPEN
        try {
            ws.send(JSON.stringify(message));
        } catch (e) {
            logger.error('ws_send_error', { message: e.message });
        }
    }
}

async function handleGenerate(ws, payload) {
    const {
        conversationId,
        model,
        messages,
        temperature,
        thinking,
        parentMsgId,
        versionGroupId,
        version
    } = payload;

    const streamMsgId = 'stream-msg-' + Date.now();

    // Abort existing stream for this conversation if any
    if (activeStreams.has(conversationId)) {
        const oldState = activeStreams.get(conversationId);
        logger.info('ws_stream_abort_existing', { conversationId, streamMsgId: oldState.streamMsgId });
        if (oldState.controller) {
            try {
                oldState.controller.abort();
            } catch (e) {}
        }
        activeStreams.delete(conversationId);
    }

    // Read DB configuration
    const db = readDb();
    const customModelConfig = (db.settings?.customModels || []).find(m => m.id === model);
    const deepseekApiKey = db.settings?.apiKey || db.settings?.deepseekApiKey;
    const openaiApiKey = db.settings?.openaiApiKey;

    const isOpenAI = !customModelConfig && (
        (db.settings?.openaiModels || []).some(m => (typeof m === 'string' ? m : m.id) === model) ||
        (db.settings?.pinnedOpenAIModels || []).includes(model) ||
        /^gpt-|^o[1-9]|^chatgpt-/i.test(model)
    );

    if (customModelConfig) {
        // Handled via custom endpoint
    } else if (isOpenAI) {
        if (!openaiApiKey) {
            ws.send(JSON.stringify({
                type: 'error',
                conversationId,
                streamMsgId,
                error: "OpenAI API Key is missing on the server. Please configure it in Settings."
            }));
            return;
        }
    } else {
        if (!deepseekApiKey) {
            ws.send(JSON.stringify({
                type: 'error',
                conversationId,
                streamMsgId,
                error: "API Key is missing on the server. Please configure it in Settings."
            }));
            return;
        }
    }
    // Wrap prompt and compile it
    let apiMessages = messages || [];
    if (conversationId !== undefined && conversationId !== null) {
        const convId = typeof conversationId === 'string' && !isNaN(conversationId) ? parseInt(conversationId, 10) : conversationId;
        const conv = (db.conversations || []).find(c => c.id === convId);
        if (conv) {
            const { presetId, params, blockOverrides, directorNote } = conv;
            try {
                const { systemPrompt, postHistory } = compilePrompt({
                    presetId,
                    params,
                    blockOverrides,
                    directorNote
                });

                const history = apiMessages.filter(m => m.role !== 'system');
                
                // Sliding Context Window: Keep only the last 16 messages of active history
                const windowedHistory = history.slice(-16);
                
                const finalMessages = [];

                if (systemPrompt && systemPrompt.trim()) {
                    finalMessages.push({ role: 'system', content: systemPrompt });
                }

                if (postHistory && postHistory.trim()) {
                    // Find the index of the last user message in the windowed array
                    let lastUserIdx = -1;
                    for (let i = windowedHistory.length - 1; i >= 0; i--) {
                        if (windowedHistory[i].role === 'user') {
                            lastUserIdx = i;
                            break;
                        }
                    }

                    if (lastUserIdx !== -1) {
                        // Copy and ephemerally mutate the last user message
                        const mutatedHistory = windowedHistory.map((m, idx) => {
                            if (idx === lastUserIdx) {
                                return {
                                    role: 'user',
                                    content: `${m.content}\n\n<system_note>\n${postHistory.trim()}\n</system_note>`
                                };
                            }
                            return m;
                        });
                        finalMessages.push(...mutatedHistory);
                    } else {
                        // Fallback if no user message exists
                        finalMessages.push(...windowedHistory);
                        finalMessages.push({ role: 'system', content: postHistory });
                    }
                } else {
                    finalMessages.push(...windowedHistory);
                }
                
                apiMessages = finalMessages;

                logger.debug('ws_prompt_compiled', {
                    conversationId,
                    presetId,
                    systemPromptLength: systemPrompt ? systemPrompt.length : 0,
                    postHistoryLength: postHistory ? postHistory.length : 0,
                    totalMessages: apiMessages.length
                });
            } catch (compileErr) {
                logger.error('ws_compile_failed', {
                    conversationId,
                    presetId,
                    params,
                    message: compileErr.message
                });
                ws.send(JSON.stringify({
                    type: 'error',
                    conversationId,
                    streamMsgId,
                    error: `Prompt compilation failed: ${compileErr.message}`
                }));
                return;
            }
        }
    }

    // Set up active stream state
    const controller = new AbortController();
    const streamState = {
        ws,
        controller,
        streamMsgId,
        fullContent: '',
        fullReasoning: '',
        parentMsgId: parentMsgId || null,
        versionGroupId: versionGroupId || null,
        version: version || 1
    };

    activeStreams.set(conversationId, streamState);
    logger.info('ws_stream_start', {
        conversationId,
        streamMsgId,
        model: model || 'deepseek-chat',
        messageCount: apiMessages.length
    });

    // Send stream initialization directly to the requesting client socket
    sendToSocket(ws, {
        type: 'init',
        conversationId,
        streamMsgId
    });

    let apiModel = model || 'deepseek-chat';
    let apiEndpoint = 'https://api.deepseek.com/chat/completions';
    let apiAuthKey = deepseekApiKey;
    let isCustomEndpoint = false;

    // Check if the selected model matches a custom model configuration
    if (customModelConfig) {
        apiModel = customModelConfig.model;
        apiEndpoint = customModelConfig.endpoint;
        apiAuthKey = customModelConfig.apiKey;
        isCustomEndpoint = true;
    } else if (isOpenAI) {
        apiModel = model;
        apiEndpoint = 'https://api.openai.com/v1/chat/completions';
        apiAuthKey = openaiApiKey;
        isCustomEndpoint = true;
    }
    // Normalize endpoint url to ends with chat/completions
    if (apiEndpoint && !apiEndpoint.endsWith('/chat/completions') && !apiEndpoint.endsWith('/chat/completions/')) {
        const cleaned = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
        apiEndpoint = `${cleaned}/chat/completions`;
    }

    try {
        new URL(apiEndpoint);
    } catch (urlErr) {
        logger.error('ws_invalid_endpoint', { conversationId, apiEndpoint, message: urlErr.message });
        ws.send(JSON.stringify({
            type: 'error',
            conversationId,
            streamMsgId,
            error: `Invalid API endpoint configured: ${apiEndpoint}`
        }));
        return;
    }

    const requestBodyObj = {
        model: apiModel,
        messages: apiMessages,
        temperature: temperature !== undefined ? temperature : 0.7,
        stream: true
    };

    // Exclude DeepSeek thinking field if we are using a custom endpoint provider
    if (!isCustomEndpoint) {
        requestBodyObj.thinking = thinking || { type: 'enabled' };
    }

    const headers = {
        'Content-Type': 'application/json'
    };
    if (apiAuthKey) {
        headers['Authorization'] = `Bearer ${apiAuthKey}`;
    }

    (async () => {
        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBodyObj),
                signal: controller.signal
            });

            if (!response.ok) {
                const providerName = isCustomEndpoint ? 'custom endpoint' : 'Upstream API';
                let errMsg = `${providerName} returned status ${response.status}`;
                try {
                    const errBody = await response.text();
                    const parsedErr = JSON.parse(errBody);
                    if (parsedErr.error && parsedErr.error.message) {
                        errMsg = parsedErr.error.message;
                    }
                } catch (e) {}

                sendToSocket(ws, {
                    type: 'error',
                    conversationId,
                    streamMsgId,
                    error: errMsg
                });
                const activeState = activeStreams.get(conversationId);
                if (activeState && activeState.streamMsgId === streamMsgId) {
                    activeStreams.delete(conversationId);
                }
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const dataPayload = trimmed.slice(6);
                    if (dataPayload === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(dataPayload);
                        if (parsed.error) {
                            const errMsg = parsed.error.message || 'Stream error occurred';
                            handleStreamFinish(conversationId, streamMsgId, false, errMsg);
                            return;
                        }

                        const choice = parsed.choices?.[0];
                        const reasoningDelta = choice?.delta?.reasoning_content;
                        const delta = choice?.delta?.content;
                        const finishReason = choice?.finish_reason;

                        if (reasoningDelta) {
                            streamState.fullReasoning += reasoningDelta;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                reasoning: reasoningDelta
                            });
                        }
                        if (delta) {
                            streamState.fullContent += delta;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                content: delta
                            });
                        }

                        if (finishReason === 'content_filter' || finishReason === 'guardrail') {
                            handleStreamFinish(conversationId, streamMsgId, false, 'Response flagged by safety guardrails/content filter.');
                            return;
                        }
                    } catch (e) {
                        // Ignore malformed JSON lines
                    }
                }
            }

            handleStreamFinish(conversationId, streamMsgId, false);
        } catch (e) {
            if (e.name === 'AbortError') {
                return;
            }
            const activeState = activeStreams.get(conversationId);
            if (activeState && activeState.streamMsgId === streamMsgId) {
                logger.error('ws_api_request_error', { conversationId, message: e.message });
                const providerName = isCustomEndpoint ? `custom endpoint (${apiEndpoint})` : 'Upstream API';
                sendToSocket(ws, {
                    type: 'error',
                    conversationId,
                    streamMsgId,
                    error: `Failed to connect to the ${providerName}. Error: ${e.message}`
                });
                activeStreams.delete(conversationId);
            }
        }
    })();
}

async function handleAbort(payload) {
    const { conversationId } = payload;
    const streamState = activeStreams.get(conversationId);
    if (streamState) {
        await handleStreamFinish(conversationId, streamState.streamMsgId, true);
    }
}

async function handleStreamFinish(conversationId, streamMsgId, aborted = false, errorMsg = null) {
    const streamState = activeStreams.get(conversationId);
    if (!streamState || streamState.streamMsgId !== streamMsgId) return;

    activeStreams.delete(conversationId);

    // Abort the fetch request if it's still active
    if (streamState.controller) {
        try {
            streamState.controller.abort();
        } catch (e) {}
    }
    if (streamState.fullContent || errorMsg) {
        try {
            let newMsg = null;
            if (streamState.fullContent) {
                newMsg = await mutateDb((db) => {
                    if (!db.messages) db.messages = [];
                    const msg = {
                        id: generateUniqueId(db, 'messages'),
                        conversationId,
                        role: 'assistant',
                        content: streamState.fullContent,
                        reasoning: streamState.fullReasoning || undefined,
                        timestamp: Date.now(),
                        parentMsgId: streamState.parentMsgId || null,
                        versionGroupId: streamState.versionGroupId || null,
                        version: streamState.version || 1,
                        isActive: true
                    };
                    if (errorMsg) {
                        msg.error = errorMsg;
                    }
                    db.messages.push(msg);
                    return msg;
                });

                logger.info('ws_stream_done', {
                    conversationId,
                    streamMsgId: streamState.streamMsgId,
                    aborted,
                    contentLength: streamState.fullContent.length,
                    reasoningLength: streamState.fullReasoning.length,
                    savedMsgId: newMsg.id,
                    error: errorMsg || undefined
                });
            }

            if (errorMsg) {
                sendToSocket(streamState.ws, {
                    type: 'error',
                    conversationId,
                    streamMsgId: streamState.streamMsgId,
                    error: errorMsg,
                    message: newMsg || undefined,
                    aborted
                });
            } else {
                sendToSocket(streamState.ws, {
                    type: 'done',
                    conversationId,
                    streamMsgId: streamState.streamMsgId,
                    message: newMsg,
                    aborted
                });
            }
        } catch (saveErr) {
            logger.error('ws_save_message_failed', { conversationId, message: saveErr.message });
        }
    } else {
        sendToSocket(streamState.ws, {
            type: 'done',
            conversationId,
            streamMsgId: streamState.streamMsgId,
            aborted
        });
    }
}

module.exports = {
    initWebSocketServer
};
