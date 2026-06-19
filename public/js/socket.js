const listeners = new Set();
let socket = null;
let reconnectDelay = 1000;

export const socketEvents = {
    subscribe(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
    },
    emit(event) {
        for (const cb of listeners) {
            try {
                cb(event);
            } catch (e) {
                console.error("socketEvents subscription error:", e);
            }
        }
    }
};

export function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log(`Connecting to WebSocket: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket connected.');
        reconnectDelay = 1000; // Reset reconnect delay on successful connection
    };

    socket.onmessage = (event) => {
        try {
            const parsed = JSON.parse(event.data);
            socketEvents.emit(parsed);
        } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
        }
    };

    socket.onclose = () => {
        console.warn(`WebSocket connection closed. Reconnecting in ${reconnectDelay}ms...`);
        socket = null;
        setTimeout(initWebSocket, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000); // Exponential backoff capped at 30s
    };

    socket.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
}

export function sendGenerate(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'generate', payload }));
    } else {
        console.error("WebSocket is not connected. Cannot send generate request.");
        socketEvents.emit({
            type: 'error',
            conversationId: payload.conversationId,
            error: "Connection lost. Please check server availability."
        });
    }
}

export function sendAbort(conversationId) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'abort', payload: { conversationId } }));
    }
}
