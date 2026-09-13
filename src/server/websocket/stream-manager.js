const { mutateDb } = require('../db');
const { generateUniqueId } = require('../utils');
const logger = require('../logger');

// Map of active streams: conversationId -> StreamState
const activeStreams = new Map();

// Above this many bytes queued for a client that is not reading, treat the socket as
// dead and terminate it: the resulting 'close' runs cleanupClientStreams, which persists
// partial content. Prevents a stalled client from buffering an entire generation in
// server memory.
const MAX_SOCKET_BUFFERED_BYTES = 4 * 1024 * 1024;

// Send message directly to the specific client socket
function sendToSocket(ws, message) {
    if (ws && ws.readyState === 1) { // WebSocket.OPEN
        try {
            ws.send(JSON.stringify(message));
        } catch (e) {
            logger.error('ws_send_error', { message: e.message });
            return;
        }
        if (ws.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
            logger.error('ws_backpressure_terminate', { bufferedBytes: ws.bufferedAmount });
            // Terminate (not close): a stalled client would stall the graceful close handshake.
            ws.terminate();
        }
    }
}

/**
 * Aborts any existing stream for a given conversation.
 */
function abortConversationStream(conversationId) {
    if (activeStreams.has(conversationId)) {
        const oldState = activeStreams.get(conversationId);
        logger.info('ws_stream_abort_existing', { conversationId, streamMsgId: oldState.streamMsgId });
        // Supersede via the shared finish path: handleStreamFinish guards on streamMsgId,
        // aborts the controller, persists partial content, and delivers the same terminal
        // event an explicit abort delivers — so the old stream never hangs its viewer.
        handleStreamFinish(conversationId, oldState.streamMsgId, true);
    }
}

/**
 * Cleans up running streams associated with a disconnecting or errored client WebSocket.
 */
function cleanupClientStreams(ws, reason = 'close') {
    for (const [conversationId, streamState] of activeStreams.entries()) {
        if (streamState.ws === ws) {
            const isError = reason === 'error';
            const logEvent = isError ? 'ws_client_error_abort_stream' : 'ws_client_close_abort_stream';
            const logReason = isError ? 'Client disconnected with error' : 'Client disconnected';
            logger.info(logEvent, { conversationId, streamMsgId: streamState.streamMsgId });
            handleStreamFinish(conversationId, streamState.streamMsgId, true, logReason);
        }
    }
}

/**
 * Handles incoming client abort request for a conversation.
 */
async function handleAbort(payload) {
    const { conversationId } = payload;
    const streamState = activeStreams.get(conversationId);
    if (streamState) {
        await handleStreamFinish(conversationId, streamState.streamMsgId, true);
    }
}

/**
 * Initializes and registers a new active stream state.
 */
function createStreamState({
    ws,
    conversationId,
    streamMsgId,
    parentMsgId,
    versionGroupId,
    version
}) {
    const controller = new AbortController();
    const startTime = Date.now();
    const streamState = {
        ws,
        controller,
        streamMsgId,
        startTime,
        headersMs: null,
        ttftMs: null,
        fullContent: '',
        fullReasoning: '',
        inThinkTag: false,
        parentMsgId: parentMsgId || null,
        versionGroupId: versionGroupId || null,
        version: version || 1
    };

    activeStreams.set(conversationId, streamState);
    return streamState;
}

/**
 * Handles stream completion, persists assistant messages, calculates metrics,
 * and sends terminal WebSocket events.
 */
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

    // Safeguard: extract and strip inline <think> tags if reasoning was emitted inside content
    if (streamState.fullContent) {
        if (!streamState.fullReasoning && streamState.fullContent.includes('<think>')) {
            const thinkMatch = streamState.fullContent.match(/<think>([\s\S]*?)<\/think>/i);
            if (thinkMatch) {
                streamState.fullReasoning = thinkMatch[1].trim();
                streamState.fullContent = streamState.fullContent.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
            } else {
                const openIdx = streamState.fullContent.indexOf('<think>');
                if (openIdx !== -1) {
                    streamState.fullReasoning = streamState.fullContent.slice(openIdx + 7).trim();
                    streamState.fullContent = streamState.fullContent.slice(0, openIdx).trim();
                }
            }
        }
    }

    if (streamState.fullContent || streamState.fullReasoning || errorMsg) {
        let newMsg = null;
        let persistError = null;
        if (streamState.fullContent || streamState.fullReasoning) {
            try {
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
                    if (streamState.usage) {
                        msg.usage = streamState.usage;
                    }
                    if (typeof streamState.cost === 'number') {
                        msg.cost = streamState.cost;
                    }
                    if (errorMsg) {
                        msg.error = errorMsg;
                    }
                    db.messages.push(msg);
                    return msg;
                });

                const durationMs = Date.now() - (streamState.startTime || Date.now());
                const streamSec = streamState.ttftMs ? Math.max(0.01, (durationMs - streamState.ttftMs) / 1000) : (durationMs / 1000);
                const approxTokens = Math.round((streamState.fullContent.length + streamState.fullReasoning.length) / 3.5);
                const tokensPerSec = approxTokens > 0 && streamSec > 0 ? Number((approxTokens / streamSec).toFixed(1)) : null;

                logger.info('ws_stream_done', {
                    conversationId,
                    streamMsgId: streamState.streamMsgId,
                    aborted,
                    durationMs,
                    headersMs: streamState.headersMs,
                    ttftMs: streamState.ttftMs,
                    tokensPerSec,
                    contentLength: streamState.fullContent.length,
                    reasoningLength: streamState.fullReasoning.length,
                    savedMsgId: newMsg.id,
                    error: errorMsg || undefined
                });
            } catch (saveErr) {
                persistError = saveErr;
                logger.error('ws_save_message_failed', { conversationId, message: saveErr.message });
            }
        }

        // A terminal event is delivered exactly once on every path: error on stream or
        // persistence failure, done otherwise — persistence failure must never leave the
        // client waiting forever for a terminal event that never arrives.
        const terminalError = errorMsg ||
            (persistError ? `Failed to persist assistant message: ${persistError.message}` : null);
        if (terminalError) {
            sendToSocket(streamState.ws, {
                type: 'error',
                conversationId,
                streamMsgId: streamState.streamMsgId,
                error: terminalError,
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
    activeStreams,
    sendToSocket,
    abortConversationStream,
    cleanupClientStreams,
    handleAbort,
    createStreamState,
    handleStreamFinish
};
