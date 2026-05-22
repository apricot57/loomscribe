export const state = {
    serverConfig: { hasKey: false, activeModel: 'deepseek-v4-pro' },
    currentConversationId: null,
    abortController: null,
    currentSystemPromptId: null,
    factoryPromptCategories: null,
    promptContentCache: new Map(),
    modalSelectedPromptId: null,
    editingPromptId: null,
    conversationIdToDelete: null,
    DEFAULT_SYSTEM_PROMPT: 'You are a helpful and concise AI assistant.',
    API_URL: '/api/chat/completions'
};

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
