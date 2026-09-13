/**
 * api.js — REST Client for LoomScribe Endpoints
 */

import { authFetch } from './auth.js';

// ==========================================================================
// Config & Settings API
// ==========================================================================

export async function getConfig() {
    const res = await authFetch('/api/config');
    if (!res.ok) throw new Error('Failed to load server configuration');
    return res.json();
}

export async function updateConfig(settings) {
    const res = await authFetch('/api/config', {
        method: 'POST',
        body: settings
    });
    if (!res.ok) throw new Error('Failed to save settings');
    return res.json();
}

export async function fetchOpenAIModels(apiKey = null) {
    const res = await authFetch('/api/config/fetch-openai-models', {
        method: 'POST',
        body: apiKey ? { apiKey } : {}
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch OpenAI models');
    }
    return res.json();
}

export async function fetchGlmModels(apiKey = null) {
    const res = await authFetch('/api/config/fetch-glm-models', {
        method: 'POST',
        body: apiKey ? { apiKey } : {}
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch GLM models');
    }
    return res.json();
}

export async function addCustomModel(modelData) {
    const res = await authFetch('/api/config/custom-models', {
        method: 'POST',
        body: modelData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add custom model');
    }
    return res.json();
}

export async function updateCustomModel(id, modelData) {
    const res = await authFetch(`/api/config/custom-models/${id}`, {
        method: 'PUT',
        body: modelData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update custom model');
    }
    return res.json();
}

export async function deleteCustomModel(id) {
    const res = await authFetch(`/api/config/custom-models/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete custom model');
    return res.json();
}

export async function fetchOpenRouterModels(force = false) {
    const res = await authFetch(`/api/openrouter/models${force ? '?force=true' : ''}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch OpenRouter models');
    }
    return res.json();
}

export async function fetchOpenRouterModelInfo(model, force = false, save = false) {
    const params = new URLSearchParams({ model });
    if (force) params.set('force', 'true');
    if (save) params.set('save', 'true');
    const res = await authFetch(`/api/openrouter/model-info?${params.toString()}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to fetch info for model ${model}`);
    }
    return res.json();
}

// ==========================================================================
// Conversations API
// ==========================================================================

export async function getConversations() {
    const res = await authFetch('/api/conversations');
    if (!res.ok) throw new Error('Failed to fetch conversations');
    return res.json();
}

export async function getConversation(id) {
    const res = await authFetch(`/api/conversations/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch conversation ${id}`);
    return res.json();
}

export async function createConversation(data = {}) {
    const res = await authFetch('/api/conversations', {
        method: 'POST',
        body: {
            title: data.title || 'New Chat',
            presetId: data.presetId || null,
            params: data.params || {},
            blockOverrides: data.blockOverrides || {},
            directorNote: data.directorNote || ''
        }
    });
    if (!res.ok) throw new Error('Failed to create conversation');
    return res.json();
}

export async function updateConversation(id, data) {
    const res = await authFetch(`/api/conversations/${id}`, {
        method: 'PUT',
        body: data
    });
    if (!res.ok) throw new Error(`Failed to update conversation ${id}`);
    return res.json();
}

export async function deleteConversation(id) {
    const res = await authFetch(`/api/conversations/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Failed to delete conversation ${id}`);
    return res.json();
}

export async function forkConversation(id, { messageId, title }) {
    const res = await authFetch(`/api/conversations/${id}/fork`, {
        method: 'POST',
        body: { messageId, title }
    });
    if (!res.ok) throw new Error('Failed to fork conversation');
    return res.json();
}

// ==========================================================================
// Messages & Version Branching API
// ==========================================================================

export async function getMessages(conversationId) {
    const res = await authFetch(`/api/messages?conversationId=${conversationId}`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
}

export async function createMessage(messageData) {
    const res = await authFetch('/api/messages', {
        method: 'POST',
        body: messageData
    });
    if (!res.ok) throw new Error('Failed to save message');
    return res.json();
}

export async function updateMessage(id, updates) {
    const res = await authFetch(`/api/messages/${id}`, {
        method: 'PUT',
        body: updates
    });
    if (!res.ok) throw new Error(`Failed to update message ${id}`);
    return res.json();
}

export async function createMessageVersion(id, data) {
    const res = await authFetch(`/api/messages/${id}/version`, {
        method: 'POST',
        body: data
    });
    if (!res.ok) throw new Error('Failed to create message version');
    return res.json();
}

export async function navigateMessageVersion(versionGroupId, targetVersion) {
    const res = await authFetch(`/api/messages/${versionGroupId}/navigate?version=${targetVersion}`, {
        method: 'POST',
        body: { version: targetVersion, targetVersion }
    });
    if (!res.ok) throw new Error('Failed to navigate version');
    return res.json();
}

export async function navigateTurn({ userMsgId, assistantMsgId }) {
    const res = await authFetch('/api/messages/navigate-turn', {
        method: 'POST',
        body: { userMsgId, assistantMsgId }
    });
    if (!res.ok) throw new Error('Failed to navigate turn');
    return res.json();
}
export async function deleteMessage(id) {
    const res = await authFetch(`/api/messages/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete message');
    return res.json();
}

export async function deleteMessageVersionGroup(id) {
    const res = await authFetch(`/api/messages/${id}/version-group`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete version group');
    return res.json();
}

export async function deactivateMessageTree(id) {
    const res = await authFetch(`/api/messages/${id}/deactivate-tree`, {
        method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to deactivate tree');
    return res.json();
}

export async function getEnginePresets() {
    const res = await authFetch('/api/engine/presets');
    if (!res.ok) throw new Error('Failed to fetch engine presets');
    const data = await res.json();
    if (Array.isArray(data)) return data;
    const list = [];
    if (data && typeof data === 'object') {
        for (const cat of Object.keys(data)) {
            if (Array.isArray(data[cat])) {
                list.push(...data[cat]);
            }
        }
    }
    return list;
}

export async function getEnginePreset(id) {
    const res = await authFetch(`/api/engine/presets/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch preset ${id}`);
    return res.json();
}

export async function createEnginePreset(presetData) {
    const res = await authFetch('/api/engine/presets', {
        method: 'POST',
        body: presetData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create preset');
    }
    return res.json();
}

export async function updateEnginePreset(id, presetData) {
    const res = await authFetch(`/api/engine/presets/${id}`, {
        method: 'PUT',
        body: presetData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to update preset ${id}`);
    }
    return res.json();
}

export async function deleteEnginePreset(id, force = false) {
    const url = `/api/engine/presets/${id}${force ? '?force=1' : ''}`;
    const res = await authFetch(url, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.error || 'Failed to delete preset');
        err.usedInConversations = !!(data.inUse || data.usedInConversations);
        throw err;
    }
    return res.json();
}

export async function getEngineSchema() {
    const res = await authFetch('/api/engine/schema');
    if (!res.ok) throw new Error('Failed to fetch engine schema');
    return res.json();
}

export async function compilePrompt(compilePayload) {
    const res = await authFetch('/api/engine/compile', {
        method: 'POST',
        body: compilePayload
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to compile prompt');
    }
    return res.json();
}
