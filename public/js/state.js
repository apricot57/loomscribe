const rawState = {
    serverConfig: { hasKey: false, activeModel: 'deepseek-v4-pro', thinkingMode: 'enabled' },
    currentConversationId: null,
    abortControllers: {},
    activeStreams: {},
    currentSystemPromptId: null,
    factoryPromptCategories: null,
    promptContentCache: new Map(),
    modalSelectedPromptId: null,
    editingPromptId: null,
    conversationIdToDelete: null,
    DEFAULT_SYSTEM_PROMPT: 'You are a helpful and concise AI assistant.',
    API_URL: '/api/chat/completions'
};

const subscribers = new Set();

export const stateEvents = {
    subscribe(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
    },
    emit(property, value, prevValue) {
        for (const cb of subscribers) {
            try { cb(property, value, prevValue); } catch (e) { console.error("stateEvents subscription error:", e); }
        }
    }
};

const proxyCache = new WeakMap();

function makeObservable(obj, path = '') {
    if (proxyCache.has(obj)) {
        return proxyCache.get(obj);
    }

    const proxy = new Proxy(obj, {
        set(target, prop, val) {
            const prev = target[prop];
            if (prev === val) return true;
            
            const fullPath = path ? `${path}.${prop}` : prop;
            
            // Enforce state invariants: sync activeConversationId to localStorage
            if (fullPath === 'currentConversationId') {
                if (val !== null) {
                    localStorage.setItem('activeConversationId', val);
                } else {
                    localStorage.removeItem('activeConversationId');
                }
            }
            
            target[prop] = val;
            stateEvents.emit(fullPath, val, prev);
            return true;
        },
        get(target, prop) {
            const val = target[prop];
            // Only deeply observe plain JSON objects, avoiding native/host/Array types
            if (val && typeof val === 'object' && Object.prototype.toString.call(val) === '[object Object]') {
                return makeObservable(val, path ? `${path}.${prop}` : prop);
            }
            return val;
        }
    });

    proxyCache.set(obj, proxy);
    return proxy;
}

export const state = makeObservable(rawState);

export function getSystemPromptContentSync() {
    if (!state.currentSystemPromptId) return state.DEFAULT_SYSTEM_PROMPT;
    return state.promptContentCache.get(state.currentSystemPromptId) || state.DEFAULT_SYSTEM_PROMPT;
}

export function prettifyCategory(str) {
    return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
