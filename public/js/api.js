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
            } else {
                console.warn(`Failed to fetch prompt content: ${res.status} ${res.statusText}`);
            }
        } catch (err) {
            console.error("Error fetching prompt content:", err);
        }
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
        } else {
            console.warn(`Failed to load factory prompts: ${res.status} ${res.statusText}`);
        }
    } catch (err) {
        console.error("Error loading factory prompts from server:", err);
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
    const title = buildAutoTitle(promptText);
    if (!title) return;

    try {
        const convRes = await fetch(`/api/conversations/${convId}`);
        if (convRes.ok) {
            const conv = await convRes.json();
            const currentTitle = (conv?.title || '').trim();
            if (currentTitle && currentTitle !== 'New Chat') {
                return;
            }
        }
    } catch (err) {
        console.warn('Skipping auto-title check because conversation lookup failed:', err);
    }

    await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
    });

    syncConversationTitleInUI(convId, title);
}

function buildAutoTitle(promptText) {
    if (!promptText) return null;

    const cleaned = promptText
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_`>#\[\]()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return null;

    let title = cleaned;

    const prefixes = [
        /^can you\s+/i,
        /^could you\s+/i,
        /^would you\s+/i,
        /^will you\s+/i,
        /^please\s+/i,
        /^help me\s+/i,
        /^i need you to\s+/i,
        /^i need\s+/i,
        /^i want you to\s+/i,
        /^write\s+/i,
        /^draft\s+/i,
        /^create\s+/i,
        /^make\s+/i,
        /^generate\s+/i,
        /^summarize\s+/i,
        /^summarise\s+/i,
        /^explain\s+/i,
        /^analyze\s+/i,
        /^analyse\s+/i,
        /^review\s+/i,
        /^rewrite\s+/i,
        /^improve\s+/i,
        /^fix\s+/i,
        /^convert\s+/i
    ];

    for (const prefix of prefixes) {
        title = title.replace(prefix, '');
    }

    title = title
        .replace(/^(a|an|the)\s+/i, '')
        .replace(/^(for|to|about)\s+/i, '')
        .replace(/\s+[?.!]+$/, '')
        .replace(/[?.!,;:]+$/g, '')
        .trim();

    if (!title) return null;

    const words = title.split(' ');
    const maxWords = 6;
    if (words.length > maxWords) {
        title = words.slice(0, maxWords).join(' ');
    }

    const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'over', 'per', 'the', 'to', 'up', 'via', 'with']);
    title = title
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
            if (!word) return word;
            if (index > 0 && smallWords.has(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');

    if (title.length > 40) {
        title = title.slice(0, 40).trim();
        const lastSpace = title.lastIndexOf(' ');
        if (lastSpace > 20) {
            title = title.slice(0, lastSpace);
        }
    }

    return title || null;
}

function syncConversationTitleInUI(convId, title) {
    const item = document.querySelector(`.chat-list-item[data-id="${convId}"]`);
    if (!item) return;

    item.title = title;
    const titleNode = item.querySelector('.chat-item-title');
    if (titleNode) {
        titleNode.textContent = title;
    }
}

export async function getEngineSchema() {
    if (state.engineSchema) return state.engineSchema;
    const res = await fetch('/api/engine/schema');
    if (res.ok) {
        state.engineSchema = await res.json();
        return state.engineSchema;
    }
    throw new Error("Failed to load parameters schema");
}

export async function getEnginePresets() {
    if (state.enginePresets) return state.enginePresets;
    const res = await fetch('/api/engine/presets');
    if (res.ok) {
        state.enginePresets = await res.json();
        return state.enginePresets;
    }
    throw new Error("Failed to load presets");
}

export async function getEnginePreset(presetId) {
    const res = await fetch(`/api/engine/presets/${presetId}`);
    if (res.ok) {
        return await res.json();
    }
    throw new Error(`Failed to load preset: ${presetId}`);
}

export async function compilePromptPreview({ presetId, params, blockOverrides, directorNote }) {
    const res = await fetch('/api/engine/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId, params, blockOverrides, directorNote })
    });
    if (res.ok) {
        return await res.json();
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to compile prompt preview");
}
