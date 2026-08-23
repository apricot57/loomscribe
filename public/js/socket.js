/**
 * socket.js — Resilient WebSocket Connection Manager
 */

import { getToken } from './auth.js';
import { setState, state } from './state.js';

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 16000;

const listeners = new Set();

export const socketEvents = {
    subscribe(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
    },
    emit(event) {
        for (const cb of listeners) {
            try {
                cb(event);
            } catch (err) {
                console.error('WebSocket event listener error:', err);
            }
        }
    }
};

export function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    clearTimeout(reconnectTimer);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken() || '';
    const wsUrl = `${protocol}//${window.location.host}?token=${encodeURIComponent(token)}`;

    try {
        ws = new WebSocket(wsUrl);
    } catch (err) {
        console.error('Failed to construct WebSocket:', err);
        scheduleReconnect();
        return;
    }

    ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectDelay = 1000;
        socketEvents.emit({ type: 'open' });
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleIncomingMessage(data);
            socketEvents.emit(data);
        } catch (err) {
            console.error('[WebSocket] Failed to parse message JSON:', err, event.data);
        }
    };

    ws.onclose = () => {
        console.warn('[WebSocket] Connection closed');
        ws = null;
        if (state.isStreaming) {
            setState('isStreaming', false);
            setState('activeStreamMsgId', null);
        }
        socketEvents.emit({ type: 'close' });
        scheduleReconnect();
    };

    ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
    };
}

function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        initWebSocket();
    }, reconnectDelay);
}

function handleIncomingMessage(msg) {
    if (msg.type === 'init') {
        setState('isStreaming', true);
        setState('activeStreamMsgId', msg.streamMsgId);
        setState('activeStreamConvId', msg.conversationId);
    } else if (msg.type === 'done' || msg.type === 'error') {
        setState('isStreaming', false);
        setState('activeStreamMsgId', null);
        setState('activeStreamConvId', null);
    }
}

export function sendGenerate(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        initWebSocket();
        throw new Error('Connecting to server... Please retry in a moment.');
    }

    ws.send(JSON.stringify({
        type: 'generate',
        payload
    }));
}

export function sendAbort(conversationId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: 'abort',
        payload: { conversationId }
    }));
}
