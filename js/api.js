import { state, getSystemPromptContentSync, prettifyCategory } from './state.js';

export async function fetchPromptContent(promptId) {
    if (!promptId) return state.DEFAULT_SYSTEM_PROMPT;
    if (state.promptContentCache.has(promptId)) return state.promptContentCache.get(promptId);

    let content = null;
    if (promptId.startsWith('user/')) {
        const dbId = parseInt(promptId.split('/')[1]);
        const res = await fetch('/api/user-prompts');
        const userPrompts = res.ok ? await res.json() : [];
        const record = userPrompts.find(p => p.id === dbId);
        content = record?.content;
    } else {
        try {
            const res = await fetch(`/api/prompts/${promptId}`);
            if (res.ok) {
                const data = await res.json();
                content = data.content;
            }
        } catch {}
    }

    if (content) {
        state.promptContentCache.set(promptId, content);
        return content;
    }
    return state.DEFAULT_SYSTEM_PROMPT;
}

export async function getAllUserPrompts() {
    const res = await fetch('/api/user-prompts');
    let userPrompts = [];
    if (res.ok) {
        userPrompts = await res.json();
    }
    userPrompts.sort((a, b) => a.createdAt - b.createdAt);
    return userPrompts;
}

export async function getAllPromptCategories() {
    const merged = new Map();

    if (state.factoryPromptCategories) {
        for (const [catDir, prompts] of Object.entries(state.factoryPromptCategories.categories)) {
            const label = prettifyCategory(catDir);
            if (!merged.has(label)) merged.set(label, []);
            for (const p of prompts) {
                merged.get(label).push({
                    name: p.name,
                    promptId: `${p.category}/${p.filename}`,
                    source: 'factory'
                });
            }
        }
    }

    const userPrompts = await getAllUserPrompts();
    for (const up of userPrompts) {
        const label = up.category || 'Uncategorized';
        if (!merged.has(label)) merged.set(label, []);
        merged.get(label).push({
            name: up.name,
            promptId: `user/${up.id}`,
            source: 'user',
            dbId: up.id
        });
    }

    return merged;
}

export async function lookupPromptName(promptId) {
    if (!promptId) return null;
    if (promptId.startsWith('user/')) {
        const dbId = parseInt(promptId.split('/')[1]);
        const res = await fetch('/api/user-prompts');
        const userPrompts = res.ok ? await res.json() : [];
        const record = userPrompts.find(p => p.id === dbId);
        return record?.name || null;
    }
    if (state.factoryPromptCategories) {
        for (const prompts of Object.values(state.factoryPromptCategories.categories)) {
            for (const p of prompts) {
                if (`${p.category}/${p.filename}` === promptId) return p.name;
            }
        }
    }
    return null;
}

export async function loadFactoryPrompts() {
    try {
        const res = await fetch('/api/prompts');
        if (res.ok) {
            state.factoryPromptCategories = await res.json();
        }
    } catch {
        // Server not available
    }
}

export async function getDescendantIds(msgId) {
    const result = [];
    const queue = [msgId];
    const res = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
    const allMessages = res.ok ? await res.json() : [];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = allMessages.filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
        for (const child of children) {
            result.push(child.id);
            queue.push(child.id);
        }
    }
    return result;
}

export async function hideDescendants(msgId) {
    const ids = await getDescendantIds(msgId);
    for (const id of ids) {
        await fetch(`/api/messages/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: false })
        });
    }
}

export async function showDescendants(msgId) {
    const res = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
    const allMessages = res.ok ? await res.json() : [];
    let currentId = msgId;
    while (true) {
        const children = allMessages.filter(m => m.parentMsgId === currentId);
        if (children.length === 0) break;
        
        let bestChild = children[0];
        for (let i = 1; i < children.length; i++) {
            if (children[i].versionGroupId === bestChild.versionGroupId) {
                if ((children[i].version || 1) > (bestChild.version || 1)) {
                    bestChild = children[i];
                }
            } else {
                if (children[i].id > bestChild.id) {
                    bestChild = children[i];
                }
            }
        }
        
        await fetch(`/api/messages/${bestChild.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: true })
        });
        currentId = bestChild.id;
    }
}

export async function buildApiPayload(conversationId) {
    const mRes = await fetch(`/api/messages?conversationId=${conversationId}`);
    const all = mRes.ok ? await mRes.json() : [];
    all.sort((a, b) => a.timestamp - b.timestamp);
    const active = all.filter(m => m.isActive !== false);
    const payload = [{ role: 'system', content: getSystemPromptContentSync() }];
    for (const msg of active) {
        payload.push({ role: msg.role, content: msg.content });
    }
    return payload;
}

export async function buildApiPayloadUpTo(conversationId, stopAfterMsgId) {
    const mRes = await fetch(`/api/messages?conversationId=${conversationId}`);
    const all = mRes.ok ? await mRes.json() : [];
    all.sort((a, b) => a.timestamp - b.timestamp);
    const active = all.filter(m => m.isActive !== false);
    const payload = [{ role: 'system', content: getSystemPromptContentSync() }];
    for (const msg of active) {
        payload.push({ role: msg.role, content: msg.content });
        if (msg.id === stopAfterMsgId) break;
    }
    return payload;
}

export async function checkIsLastActiveAssistant(msgId) {
    if (!state.currentConversationId) return false;
    const mRes = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
    const all = mRes.ok ? await mRes.json() : [];
    all.sort((a, b) => a.timestamp - b.timestamp);
    const activeAssistants = all.filter(m => m.role === 'assistant' && m.isActive !== false);
    if (activeAssistants.length === 0) return false;
    return activeAssistants[activeAssistants.length - 1].id === msgId;
}

export async function autoTitleConversation(convId, promptText) {
    let title = promptText.trim();
    if (title.length > 25) {
        title = title.substring(0, 25) + '...';
    }
    await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title })
    });
}
