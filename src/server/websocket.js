const { WebSocketServer } = require('ws');
const { readDb } = require('./db');
const logger = require('./logger');

const { resolveProvider } = require('./websocket/provider-router');
const { buildPrompt } = require('./websocket/prompt-builder');
const { executeStream } = require('./websocket/stream-handler');
const {
    activeStreams,
    sendToSocket,
    abortConversationStream,
    cleanupClientStreams,
    handleAbort,
    createStreamState
} = require('./websocket/stream-manager');

// Set of connected clients
const clients = new Set();

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
            cleanupClientStreams(ws, 'close');
        });

        ws.on('error', (err) => {
            logger.error('ws_connection_error', { message: err.message });
            clients.delete(ws);
            cleanupClientStreams(ws, 'error');
        });
    });
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
    abortConversationStream(conversationId);

    // Read DB configuration
    const db = readDb();

    // Build & compile prompt
    const { apiMessages, error: promptError } = buildPrompt({
        conversationId,
        messages,
        db
    });

    if (promptError) {
        sendToSocket(ws, {
            type: 'error',
            conversationId,
            streamMsgId,
            error: promptError
        });
        return;
    }

    // Resolve provider endpoint, keys, and request configuration
    const providerConfig = resolveProvider({
        model,
        messages: apiMessages,
        temperature,
        thinking,
        settings: db.settings
    });

    if (providerConfig.error) {
        if (providerConfig.error.startsWith('Invalid API endpoint configured')) {
            logger.error('ws_invalid_endpoint', {
                conversationId,
                apiEndpoint: providerConfig.apiEndpoint,
                message: providerConfig.error
            });
        }
        sendToSocket(ws, {
            type: 'error',
            conversationId,
            streamMsgId,
            error: providerConfig.error
        });
        return;
    }

    // Register active stream and send init event
    const streamState = createStreamState({
        ws,
        conversationId,
        streamMsgId,
        parentMsgId,
        versionGroupId,
        version
    });

    logger.info('ws_stream_start', {
        conversationId,
        streamMsgId,
        model: model || 'deepseek-chat',
        messageCount: apiMessages.length
    });

    sendToSocket(ws, {
        type: 'init',
        conversationId,
        streamMsgId
    });

    // Execute upstream fetch and SSE streaming
    executeStream({
        ws,
        streamState,
        conversationId,
        streamMsgId,
        ...providerConfig
    });
}

module.exports = {
    initWebSocketServer
};
