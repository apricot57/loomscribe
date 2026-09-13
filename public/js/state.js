/**
 * state.js — Reactive State Management for LoomScribe
 */

const listeners = new Map();

export const state = {
    // Current Active Chat
    currentConversationId: null,
    activeConversation: null,
    conversations: [],

    // Message History for Active Chat
    allMessages: [],
    activeMessages: [],

    // Server Configurations
    serverConfig: {
        hasKey: false,
        hasDeepSeekKey: false,
        hasOpenAIKey: false,
        hasGlmKey: false,
        hasOpenRouterKey: false,
        activeModel: 'deepseek-v4-pro',
        thinkingMode: 'disabled',
        glmThinkingMode: 'low',
        theme: 'cyan',
        openaiModels: [],
        pinnedOpenAIModels: [],
        glmModels: [],
        pinnedGlmModels: [],
        pinnedOpenRouterModels: [],
        openrouterModelDetails: {},
        slidingWindowEnabled: false,
        slidingWindowSize: 16,
        customModels: []
    },

    // Engine Presets & Schema
    enginePresets: [],
    engineSchema: null,

    // Live Streaming State
    isStreaming: false,
    activeStreamMsgId: null,
    activeStreamConvId: null,

    // UI Panel Toggles
    sidebarOpen: false,
    inspectorOpen: true,

    // Modals State
    modal: null // 'settings' | 'preset-picker' | 'preset-manager' | 'new-chat' | 'delete' | 'fork'
};

/**
 * Subscribe to state changes on specific property or '*' for any change.
 */
export function subscribe(prop, callback) {
    if (!listeners.has(prop)) {
        listeners.set(prop, new Set());
    }
    listeners.get(prop).add(callback);

    // Return unsubscribe function
    return () => {
        listeners.get(prop)?.delete(callback);
    };
}

/**
 * Update a state property and emit notifications to listeners.
 */
export function setState(prop, value) {
    const prevValue = state[prop];
    state[prop] = value;

    // Sync activeConversationId to localStorage
    if (prop === 'currentConversationId') {
        if (value) {
            localStorage.setItem('activeConversationId', value);
        } else {
            localStorage.removeItem('activeConversationId');
        }
    }

    // Notify specific listeners
    if (listeners.has(prop)) {
        for (const cb of listeners.get(prop)) {
            try {
                cb(value, prevValue);
            } catch (err) {
                console.error(`Error in state subscriber for ${prop}:`, err);
            }
        }
    }

    // Notify global wildcard listeners
    if (listeners.has('*')) {
        for (const cb of listeners.get('*')) {
            try {
                cb(prop, value, prevValue);
            } catch (err) {
                console.error('Error in wildcard state subscriber:', err);
            }
        }
    }
}

/**
 * Update multiple state properties at once.
 */
export function updateState(partialState) {
    for (const [key, value] of Object.entries(partialState)) {
        setState(key, value);
    }
}
