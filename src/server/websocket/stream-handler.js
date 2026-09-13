const logger = require('../logger');
const {
    activeStreams,
    sendToSocket,
    handleStreamFinish
} = require('./stream-manager');

/**
 * Executes upstream HTTP fetch with SSE stream decoding, buffering,
 * latency measurement, token dispatching, and error handling.
 */
async function executeStream({
    ws,
    streamState,
    conversationId,
    streamMsgId,
    apiModel,
    apiEndpoint,
    apiAuthKey,
    isCustomEndpoint,
    isGlmEndpoint,
    requestBodyObj
}) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (apiAuthKey) {
        headers['Authorization'] = `Bearer ${apiAuthKey}`;
    }

    try {
        const fetchStartTime = Date.now();
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBodyObj),
            signal: streamState.controller.signal
        });

        const headersReceivedTime = Date.now();
        streamState.headersMs = headersReceivedTime - fetchStartTime;

        if (!response.ok) {
            const providerName = isGlmEndpoint ? 'GLM (Z.AI)' : (isCustomEndpoint ? 'custom endpoint' : 'Upstream API');
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
        let firstTokenLogged = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (!firstTokenLogged) {
                firstTokenLogged = true;
                streamState.ttftMs = Date.now() - fetchStartTime;
                logger.info('ws_stream_first_token', {
                    conversationId,
                    streamMsgId,
                    model: apiModel,
                    headersMs: streamState.headersMs,
                    ttftMs: streamState.ttftMs
                });
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            let batchReasoning = '';
            let batchContent = '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                const dataPayload = trimmed.slice(6);
                if (dataPayload === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(dataPayload);
                    if (parsed.usage) {
                        streamState.usage = parsed.usage;
                        streamState.cost = parsed.usage.cost;
                    }
                    if (parsed.error) {
                        if (batchReasoning) {
                            streamState.fullReasoning += batchReasoning;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                reasoning: batchReasoning
                            });
                            batchReasoning = '';
                        }
                        if (batchContent) {
                            streamState.fullContent += batchContent;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                content: batchContent
                            });
                            batchContent = '';
                        }
                        const errMsg = parsed.error.message || 'Stream error occurred';
                        await handleStreamFinish(conversationId, streamMsgId, false, errMsg);
                        return;
                    }

                    const choice = parsed.choices?.[0];
                    const rawReasoning = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content;
                    let reasoningDelta = '';
                    if (typeof rawReasoning === 'string') {
                        reasoningDelta = rawReasoning;
                    } else if (rawReasoning && typeof rawReasoning === 'object' && typeof rawReasoning.text === 'string') {
                        reasoningDelta = rawReasoning.text;
                    } else if (Array.isArray(choice?.delta?.reasoning_details) && choice.delta.reasoning_details[0]?.text) {
                        reasoningDelta = choice.delta.reasoning_details[0].text;
                    }
                    let delta = choice?.delta?.content || '';
                    const finishReason = choice?.finish_reason;

                    // Extract inline <think> tags if delta arrives in content without a reasoning field
                    if (!reasoningDelta && delta) {
                        if (streamState.inThinkTag) {
                            const closeIdx = delta.indexOf('</think>');
                            if (closeIdx !== -1) {
                                reasoningDelta = delta.slice(0, closeIdx);
                                delta = delta.slice(closeIdx + 8);
                                streamState.inThinkTag = false;
                            } else {
                                reasoningDelta = delta;
                                delta = '';
                            }
                        } else if (delta.includes('<think>')) {
                            const openIdx = delta.indexOf('<think>');
                            const before = delta.slice(0, openIdx);
                            const after = delta.slice(openIdx + 7);
                            const closeIdx = after.indexOf('</think>');
                            if (closeIdx !== -1) {
                                reasoningDelta = after.slice(0, closeIdx);
                                delta = before + after.slice(closeIdx + 8);
                            } else {
                                reasoningDelta = after;
                                delta = before;
                                streamState.inThinkTag = true;
                            }
                        }
                    }

                    if (reasoningDelta) {
                        if (batchContent) {
                            streamState.fullContent += batchContent;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                content: batchContent
                            });
                            batchContent = '';
                        }
                        batchReasoning += reasoningDelta;
                    }
                    if (delta) {
                        if (batchReasoning) {
                            streamState.fullReasoning += batchReasoning;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                reasoning: batchReasoning
                            });
                            batchReasoning = '';
                        }
                        batchContent += delta;
                    }

                    if (finishReason === 'content_filter' || finishReason === 'guardrail') {
                        if (batchReasoning) {
                            streamState.fullReasoning += batchReasoning;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                reasoning: batchReasoning
                            });
                            batchReasoning = '';
                        }
                        if (batchContent) {
                            streamState.fullContent += batchContent;
                            sendToSocket(ws, {
                                type: 'token',
                                conversationId,
                                streamMsgId,
                                content: batchContent
                            });
                            batchContent = '';
                        }
                        await handleStreamFinish(conversationId, streamMsgId, false, 'Response flagged by safety guardrails/content filter.');
                        return;
                    }
                } catch (e) {
                    // Ignore malformed JSON lines
                }
            }

            if (batchReasoning) {
                streamState.fullReasoning += batchReasoning;
                sendToSocket(ws, {
                    type: 'token',
                    conversationId,
                    streamMsgId,
                    reasoning: batchReasoning
                });
            }
            if (batchContent) {
                streamState.fullContent += batchContent;
                sendToSocket(ws, {
                    type: 'token',
                    conversationId,
                    streamMsgId,
                    content: batchContent
                });
            }
        }

        await handleStreamFinish(conversationId, streamMsgId, false);
    } catch (e) {
        if (e.name === 'AbortError') {
            return;
        }
        const activeState = activeStreams.get(conversationId);
        if (activeState && activeState.streamMsgId === streamMsgId) {
            logger.error('ws_api_request_error', { conversationId, message: e.message });
            const providerName = isGlmEndpoint ? 'GLM (Z.AI)' : (isCustomEndpoint ? `custom endpoint (${apiEndpoint})` : 'Upstream API');
            // Route through the shared finish path so partial content the client already
            // displayed is persisted with the error flag instead of being discarded.
            await handleStreamFinish(
                conversationId,
                streamMsgId,
                false,
                `Failed to connect to the ${providerName}. Error: ${e.message}`
            );
        }
    }
}

module.exports = {
    executeStream
};
