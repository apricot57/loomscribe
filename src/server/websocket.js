const { WebSocketServer } = require('ws');
const https = require('https');
const { readDb, writeDb } = require('./db');
const { generateUniqueId } = require('./utils');
const { compilePrompt } = require('../../engine/compiler');
const logger = require('./logger');

// Set of connected clients
const clients = new Set();

// Map of active streams: conversationId -> StreamState
const activeStreams = new Map();

function initWebSocketServer(server) {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
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
        });

        ws.on('error', (err) => {
            logger.error('ws_connection_error', { message: err.message });
            clients.delete(ws);
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

    // Read DB configuration
    const db = readDb();
    const apiKey = db.settings?.apiKey;
    if (!apiKey) {
        ws.send(JSON.stringify({
            type: 'error',
            conversationId,
            streamMsgId,
            error: "API Key is missing on the server. Please configure it in Settings."
        }));
        return;
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
                const finalMessages = [];

                if (systemPrompt && systemPrompt.trim()) {
                    finalMessages.push({ role: 'system', content: systemPrompt });
                }
                finalMessages.push(...history);
                if (postHistory && postHistory.trim()) {
                    finalMessages.push({ role: 'system', content: postHistory });
                }
                apiMessages = finalMessages;

                logger.debug('ws_prompt_compiled', {
                    conversationId,
                    presetId,
                    systemPromptLength: systemPrompt.length,
                    postHistoryLength: postHistory.length,
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
    const streamState = {
        req: null,
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

    // Broadcast stream initialization
    broadcast({
        type: 'init',
        conversationId,
        streamMsgId
    });

    const requestBody = JSON.stringify({
        model: model || 'deepseek-chat',
        messages: apiMessages,
        temperature: temperature !== undefined ? temperature : 0.7,
        stream: true,
        thinking: thinking || { type: 'enabled' }
    });

    const options = {
        hostname: 'api.deepseek.com',
        port: 443,
        path: '/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        if (proxyRes.statusCode !== 200) {
            let errBody = '';
            proxyRes.on('data', (d) => errBody += d.toString());
            proxyRes.on('end', () => {
                let errMsg = `DeepSeek API returned status ${proxyRes.statusCode}`;
                try {
                    const parsedErr = JSON.parse(errBody);
                    if (parsedErr.error && parsedErr.error.message) {
                        errMsg = parsedErr.error.message;
                    }
                } catch (e) {}

                broadcast({
                    type: 'error',
                    conversationId,
                    streamMsgId,
                    error: errMsg
                });
                activeStreams.delete(conversationId);
            });
            return;
        }

        let buffer = '';
        proxyRes.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                const dataPayload = trimmed.slice(6);
                if (dataPayload === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(dataPayload);
                    const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content;
                    const delta = parsed.choices?.[0]?.delta?.content;

                    if (reasoningDelta) {
                        streamState.fullReasoning += reasoningDelta;
                        broadcast({
                            type: 'token',
                            conversationId,
                            streamMsgId,
                            reasoning: reasoningDelta
                        });
                    }
                    if (delta) {
                        streamState.fullContent += delta;
                        broadcast({
                            type: 'token',
                            conversationId,
                            streamMsgId,
                            content: delta
                        });
                    }
                } catch (e) {
                    // Ignore malformed JSON lines
                }
            }
        });

        proxyRes.on('end', () => {
            if (activeStreams.has(conversationId)) {
                handleStreamFinish(conversationId, false);
            }
        });
    });

    proxyReq.on('error', (e) => {
        if (activeStreams.has(conversationId)) {
            logger.error('ws_api_request_error', { conversationId, message: e.message });
            broadcast({
                type: 'error',
                conversationId,
                streamMsgId,
                error: "Failed to connect to DeepSeek API."
            });
            activeStreams.delete(conversationId);
        }
    });

    streamState.req = proxyReq;
    proxyReq.write(requestBody);
    proxyReq.end();
}

async function handleAbort(payload) {
    const { conversationId } = payload;
    if (activeStreams.has(conversationId)) {
        await handleStreamFinish(conversationId, true);
    }
}

async function handleStreamFinish(conversationId, aborted = false) {
    const streamState = activeStreams.get(conversationId);
    if (!streamState) return;

    activeStreams.delete(conversationId);

    // Abort the request if it's still active
    if (streamState.req && !streamState.req.destroyed) {
        try {
            streamState.req.destroy();
        } catch (e) {}
    }

    if (streamState.fullContent) {
        try {
            const db = readDb();
            if (!db.messages) db.messages = [];
            const newMsg = {
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
            db.messages.push(newMsg);
            writeDb(db);

            logger.info('ws_stream_done', {
                conversationId,
                streamMsgId: streamState.streamMsgId,
                aborted,
                contentLength: streamState.fullContent.length,
                reasoningLength: streamState.fullReasoning.length,
                savedMsgId: newMsg.id
            });

            broadcast({
                type: 'done',
                conversationId,
                streamMsgId: streamState.streamMsgId,
                message: newMsg,
                aborted
            });
        } catch (saveErr) {
            logger.error('ws_save_message_failed', { conversationId, message: saveErr.message });
        }
    } else {
        broadcast({
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
