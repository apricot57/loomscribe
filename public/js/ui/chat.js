import { state, escapeHtml } from '../state.js';
import {
    fetchPromptContent,
    buildApiPayload,
    buildApiPayloadUpTo
} from '../api.js';
import { showToast } from './modals.js';

const ASSISTANT_DRAFT_STORAGE_PREFIX = 'loomscribe:assistant-drafts:';

export function addMessageToUI(sender, text, reasoning, msgMeta = {}, skipScroll = false) {
    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (!container) return null;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    if (sender === 'bot') {
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'message-body';

        if (reasoning) {
            const reasoningBlock = document.createElement('div');
            reasoningBlock.className = 'reasoning-block collapsed';
            const reasoningHeader = document.createElement('div');
            reasoningHeader.className = 'reasoning-header';
            reasoningHeader.innerHTML = `
                <svg class="reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <span>Thought</span>
            `;
            const reasoningContent = document.createElement('div');
            reasoningContent.className = 'reasoning-content';
            reasoningContent.textContent = reasoning;
            reasoningBlock.appendChild(reasoningHeader);
            reasoningBlock.appendChild(reasoningContent);
            reasoningHeader.addEventListener('click', () => {
                reasoningBlock.classList.toggle('collapsed');
            });
            bodyDiv.appendChild(reasoningBlock);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
        contentDiv.setAttribute('data-raw-content', text);

        bodyDiv.appendChild(contentDiv);
        messageDiv.appendChild(bodyDiv);
    } else {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = text;
        contentDiv.setAttribute('data-raw-content', text);
        messageDiv.appendChild(contentDiv);
    }

    if (msgMeta.id != null) {
        messageDiv.dataset.msgId = msgMeta.id;
        messageDiv.id = msgMeta.id;
    }
    if (msgMeta.versionGroupId != null) {
        messageDiv.dataset.versionGroupId = msgMeta.versionGroupId;
        messageDiv.dataset.version = msgMeta.version || 1;
    }
    if (msgMeta.unsaved) {
        messageDiv.dataset.unsaved = 'true';
        messageDiv.title = 'Draft message not saved to the server yet.';
    }

    container.appendChild(messageDiv);
    attachMessageActions(messageDiv, sender, msgMeta);
    if (!skipScroll) scrollToBottom();
    return messageDiv;
}

export function showTypingIndicator() {
    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (!container) return null;

    const id = 'typing-' + Date.now();
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = id;
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        indicator.appendChild(dot);
    }
    
    container.appendChild(indicator);
    scrollToBottom();
    return id;
}

export function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) {
        indicator.remove();
    }
}

export function addStreamingBotMessage() {
    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (!container) return null;

    const id = 'stream-msg-' + Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.id = id;

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'message-body';

    const reasoningBlock = document.createElement('div');
    reasoningBlock.className = 'reasoning-block';
    const reasoningHeader = document.createElement('div');
    reasoningHeader.className = 'reasoning-header';
    reasoningHeader.innerHTML = `
        <svg class="reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <span>Thinking...</span>
    `;
    const reasoningContent = document.createElement('div');
    reasoningContent.className = 'reasoning-content';
    reasoningBlock.appendChild(reasoningHeader);
    reasoningBlock.appendChild(reasoningContent);

    reasoningHeader.addEventListener('click', () => {
        reasoningBlock.classList.toggle('collapsed');
    });

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content streaming';

    const isThinkingEnabled = state.serverConfig?.thinkingMode !== 'disabled';
    if (isThinkingEnabled) {
        bodyDiv.appendChild(reasoningBlock);
    }
    bodyDiv.appendChild(contentDiv);
    messageDiv.appendChild(bodyDiv);
    container.appendChild(messageDiv);
    scrollToBottom();
    return id;
}

export function updateStreamingReasoning(id, reasoning) {
    const msg = document.getElementById(id);
    if (!msg) return;
    const block = msg.querySelector('.reasoning-content');
    if (!block) return;
    block.textContent = reasoning;
    const parent = msg.querySelector('.reasoning-block');
    if (parent) parent.classList.remove('collapsed');
    scrollToBottom();
}

export function updateStreamingBotMessage(id, content) {
    const msg = document.getElementById(id);
    if (!msg) return;
    const contentDiv = msg.querySelector('.message-content');
    if (!contentDiv) return;
    contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content || '') : (content || '');
}

export function finalizeStreamingBotMessage(id, content, reasoning) {
    const msg = document.getElementById(id);
    if (!msg) return;

    const header = msg.querySelector('.reasoning-header span');
    if (header) header.textContent = 'Thought';

    const reasoningContent = msg.querySelector('.reasoning-content');
    if (reasoningContent && reasoning) {
        reasoningContent.textContent = reasoning;
        const block = msg.querySelector('.reasoning-block');
        if (block) block.classList.add('collapsed');
    } else if (reasoningContent) {
        const block = msg.querySelector('.reasoning-block');
        if (block) block.remove();
    }

    const contentDiv = msg.querySelector('.message-content');
    if (!contentDiv) return;
    contentDiv.classList.remove('streaming');
    contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content || '') : (content || '');
    contentDiv.setAttribute('data-raw-content', content || '');
}

let scrollPending = false;

export function scrollToBottom() {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            const smooth = chatContainer.style.scrollBehavior;
            chatContainer.style.scrollBehavior = 'auto';
            chatContainer.scrollTop = chatContainer.scrollHeight;
            chatContainer.style.scrollBehavior = smooth;
        }
        scrollPending = false;
    });
}

export async function updateContinueButtonVisibility(activeMessages = null) {
    const continueBtn = document.getElementById('continue-btn');
    if (!continueBtn) return;

    if (state.currentConversationId === null || state.abortController !== null) {
        continueBtn.classList.add('hidden');
        return;
    }

    try {
        let messages = activeMessages;
        if (!messages) {
            const mRes = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
            const allMessages = mRes.ok ? await mRes.json() : [];
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            messages = allMessages.filter(m => m.isActive !== false);
        }

        if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            continueBtn.classList.remove('hidden');
        } else {
            continueBtn.classList.add('hidden');
        }
    } catch (err) {
        console.error('Error updating continue button visibility:', err);
        continueBtn.classList.add('hidden');
    }
}

export function attachMessageActions(messageDiv, sender, msgMeta) {
    const msgId = msgMeta.id;
    if (!msgId) return;

    const existing = messageDiv.querySelector('.message-action-row');
    if (existing) existing.remove();

    const actionRow = document.createElement('div');
    actionRow.className = 'message-action-row';

    if (msgMeta.versionCount && msgMeta.versionCount > 1) {
        const versionNav = document.createElement('div');
        versionNav.className = 'version-nav';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'version-nav-btn';
        prevBtn.innerHTML = '&#9664;';
        prevBtn.title = 'Previous version';
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateVersion(msgMeta.versionGroupId, (msgMeta.version || 1) - 1);
        });

        const label = document.createElement('span');
        label.className = 'version-nav-label';
        label.textContent = `${msgMeta.version || 1}/${msgMeta.versionCount}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'version-nav-btn';
        nextBtn.innerHTML = '&#9654;';
        nextBtn.title = 'Next version';
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateVersion(msgMeta.versionGroupId, (msgMeta.version || 1) + 1);
        });

        versionNav.appendChild(prevBtn);
        versionNav.appendChild(label);
        versionNav.appendChild(nextBtn);
        actionRow.appendChild(versionNav);
    }

    if (sender === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-btn';
        editBtn.innerHTML = '&#9998;';
        editBtn.title = 'Edit message';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startInlineEdit(messageDiv, msgId);
        });
        actionRow.appendChild(editBtn);
    }

    if (sender === 'bot') {
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-btn';
        editBtn.innerHTML = '&#9998;';
        editBtn.title = 'Edit response';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startBotInlineEdit(messageDiv, msgId);
        });
        actionRow.appendChild(editBtn);
    }

    if (sender === 'bot') {
        const regenBtn = document.createElement('button');
        regenBtn.className = 'message-action-btn regen-btn';
        regenBtn.innerHTML = '&#8635;';
        regenBtn.title = 'Regenerate response';
        regenBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await regenerateResponse(msgId);
        });
        actionRow.appendChild(regenBtn);
    }

    if (actionRow.children.length > 0) {
        if (sender === 'bot') {
            const bodyDiv = messageDiv.querySelector('.message-body');
            if (bodyDiv) bodyDiv.insertBefore(actionRow, bodyDiv.firstChild);
        } else {
            const contentDiv = messageDiv.querySelector('.message-content');
            if (contentDiv) contentDiv.after(actionRow);
        }
    }
}

export function startInlineEdit(messageDiv, msgId) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    const actionRow = messageDiv.querySelector('.message-action-row');
    if (actionRow) actionRow.style.display = 'none';

    const originalContent = contentDiv.textContent;

    const textarea = document.createElement('textarea');
    textarea.className = 'inline-edit-textarea';
    textarea.value = originalContent;

    const editActions = document.createElement('div');
    editActions.className = 'inline-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'message-action-btn save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newText = textarea.value.trim();
        if (newText && newText !== originalContent) {
            await editMessageAndRegenerate(msgId, newText, messageDiv);
        } else {
            cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow);
        }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-action-btn cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow);
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            saveBtn.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelBtn.click();
        }
    });

    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);

    messageDiv.classList.add('editing');

    const editContainer = document.createElement('div');
    editContainer.className = 'inline-edit-container';
    editContainer.appendChild(textarea);
    editContainer.appendChild(editActions);

    contentDiv.replaceWith(editContainer);

    const adjustHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight + 4, 450) + 'px';
    };
    textarea.addEventListener('input', adjustHeight);
    adjustHeight();

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

export function cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow) {
    messageDiv.classList.remove('editing');
    const editContainer = messageDiv.querySelector('.inline-edit-container');
    if (editContainer) {
        editContainer.replaceWith(contentDiv);
    } else {
        textarea.replaceWith(contentDiv);
        editActions.remove();
    }
    if (actionRow) actionRow.style.display = '';
}

export async function startBotInlineEdit(messageDiv, msgId) {
    const mRes = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
    const allMessages = mRes.ok ? await mRes.json() : [];
    const botMsg = allMessages.find(m => String(m.id) === String(msgId));
    if (!botMsg) return;

    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    const actionRow = messageDiv.querySelector('.message-action-row');
    if (actionRow) actionRow.style.display = 'none';

    const originalRaw = botMsg.content;

    const textarea = document.createElement('textarea');
    textarea.className = 'inline-edit-textarea';
    textarea.value = originalRaw;

    const editActions = document.createElement('div');
    editActions.className = 'inline-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'message-action-btn save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newText = textarea.value.trim();
        if (newText && newText !== originalRaw) {
            await editBotMessageOnly(msgId, newText, messageDiv);
        } else {
            cancelBotInlineEdit(messageDiv, contentDiv, editActions, actionRow);
        }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'message-action-btn cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelBotInlineEdit(messageDiv, contentDiv, editActions, actionRow);
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            saveBtn.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelBtn.click();
        }
    });

    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);

    messageDiv.classList.add('editing');

    const editContainer = document.createElement('div');
    editContainer.className = 'inline-edit-container';
    editContainer.appendChild(textarea);
    editContainer.appendChild(editActions);

    contentDiv.replaceWith(editContainer);

    const adjustHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight + 4, 600) + 'px';
    };
    textarea.addEventListener('input', adjustHeight);
    adjustHeight();

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

export function cancelBotInlineEdit(messageDiv, contentDiv, editActions, actionRow) {
    messageDiv.classList.remove('editing');
    const editContainer = messageDiv.querySelector('.inline-edit-container');
    if (editContainer) {
        editContainer.replaceWith(contentDiv);
    } else {
        editActions.remove();
    }
    if (actionRow) actionRow.style.display = '';
}

export async function editBotMessageOnly(msgId, newText, messageDiv) {
    const res = await fetch(`/api/messages/${msgId}/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText, role: 'assistant' })
    });
    if (res.ok) {
        await refreshConversationView();
    }
}

export async function editMessageAndRegenerate(msgId, newText, messageDiv) {
    const res = await fetch(`/api/messages/${msgId}/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText, role: 'user' })
    });
    if (res.ok) {
        const newMsg = await res.json();
        await refreshConversationView();
        await streamApiResponse({
            conversationId: newMsg.conversationId,
            parentMsgId: newMsg.id,
            stopAfterMsgId: newMsg.id
        });
        await refreshConversationView();
    }
}

export async function regenerateResponse(msgId) {
    const res = await fetch(`/api/messages/${msgId}/deactivate-tree`, {
        method: 'POST'
    });
    if (res.ok) {
        const data = await res.json();
        
        const mRes = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
        const allMessages = mRes.ok ? await mRes.json() : [];
        const assistantMsg = allMessages.find(m => String(m.id) === String(msgId));
        const parentUserMsg = assistantMsg && assistantMsg.parentMsgId ? allMessages.find(m => m.id === assistantMsg.parentMsgId) : null;
        const stopAtId = parentUserMsg ? parentUserMsg.id : msgId;

        await refreshConversationView();

        await streamApiResponse({
            conversationId: state.currentConversationId,
            parentMsgId: stopAtId === msgId ? (parentUserMsg?.id || null) : stopAtId,
            stopAfterMsgId: stopAtId,
            versionGroupId: data.versionGroupId,
            version: data.nextVersion
        });

        await refreshConversationView();
    }
}

export async function navigateVersion(versionGroupId, targetVersion) {
    const res = await fetch(`/api/messages/${versionGroupId}/navigate?version=${targetVersion}`, {
        method: 'POST'
    });
    if (res.ok) {
        await refreshConversationView();
    }
}

export function updateMessageNodeInPlace(node, msg) {
    const contentDiv = node.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.setAttribute('data-raw-content', msg.content);
        if (msg.role === 'assistant') {
            contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(msg.content) : msg.content;
        } else {
            contentDiv.textContent = msg.content;
        }
    }

    let reasoningBlock = node.querySelector('.reasoning-block');
    if (msg.reasoning) {
        if (!reasoningBlock) {
            reasoningBlock = document.createElement('div');
            reasoningBlock.className = 'reasoning-block collapsed';
            const reasoningHeader = document.createElement('div');
            reasoningHeader.className = 'reasoning-header';
            reasoningHeader.innerHTML = `
                <svg class="reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <span>Thought</span>
            `;
            const reasoningContent = document.createElement('div');
            reasoningContent.className = 'reasoning-content';
            reasoningContent.textContent = msg.reasoning;
            reasoningBlock.appendChild(reasoningHeader);
            reasoningBlock.appendChild(reasoningContent);
            reasoningHeader.addEventListener('click', () => {
                reasoningBlock.classList.toggle('collapsed');
            });
            const bodyDiv = node.querySelector('.message-body');
            if (bodyDiv) bodyDiv.insertBefore(reasoningBlock, bodyDiv.firstChild);
        } else {
            const content = reasoningBlock.querySelector('.reasoning-content');
            if (content) content.textContent = msg.reasoning;
        }
    } else if (reasoningBlock) {
        reasoningBlock.remove();
    }

    node.dataset.version = msg.version || 1;
    if (msg.id != null) {
        node.dataset.msgId = msg.id;
        node.id = msg.id;
    }

    const sender = msg.role === 'assistant' ? 'bot' : 'user';
    attachMessageActions(node, sender, {
        id: msg.id,
        versionGroupId: msg.versionGroupId,
        version: msg.version || 1,
        versionCount: msg.versionCount || 1
    });
}

export function reconcileMessages(activeMessages) {
    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (!container) return;

    const currentNodes = Array.from(container.children);
    const maxLength = Math.max(activeMessages.length, currentNodes.length);

    for (let i = 0; i < maxLength; i++) {
        const msg = activeMessages[i];
        const node = currentNodes[i];

        if (!msg) {
            if (node) node.remove();
            continue;
        }

        if (!node) {
            const sender = msg.role === 'assistant' ? 'bot' : 'user';
            addMessageToUI(sender, msg.content, msg.reasoning, {
                id: msg.id,
                versionGroupId: msg.versionGroupId,
                version: msg.version || 1,
                versionCount: msg.versionCount || 1
            }, true);
            continue;
        }

        const nodeId = node.dataset.msgId || node.id;

        if (String(nodeId) !== String(msg.id)) {
            while (container.children.length > i) {
                container.lastChild.remove();
            }

            for (let j = i; j < activeMessages.length; j++) {
                const m = activeMessages[j];
                const sender = m.role === 'assistant' ? 'bot' : 'user';
                addMessageToUI(sender, m.content, m.reasoning, {
                    id: m.id,
                    versionGroupId: m.versionGroupId,
                    version: m.version || 1,
                    versionCount: m.versionCount || 1
                }, true);
            }
            break;
        }

        const nodeVersion = node.dataset.version;
        if (nodeVersion && String(nodeVersion) !== String(msg.version)) {
            updateMessageNodeInPlace(node, msg);
        } else {
            const contentDiv = node.querySelector('.message-content');
            if (contentDiv && contentDiv.getAttribute('data-raw-content') !== msg.content) {
                updateMessageNodeInPlace(node, msg);
            }
        }
    }
}

export async function refreshConversationMessages() {
    if (state.currentConversationId === null) return;
    
    const id = state.currentConversationId;
    const mRes = await fetch(`/api/messages?conversationId=${id}`);
    const allMessages = mRes.ok ? await mRes.json() : [];
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    const activeMessages = allMessages.filter(m => m.isActive !== false);

    const versionCounts = new Map();
    for (const msg of allMessages) {
        if (msg.versionGroupId) {
            versionCounts.set(msg.versionGroupId, (versionCounts.get(msg.versionGroupId) || 0) + 1);
        }
    }

    activeMessages.forEach(msg => {
        msg.versionCount = msg.versionGroupId ? (versionCounts.get(msg.versionGroupId) || 1) : 1;
    });

    reconcileMessages(activeMessages);
    
    scrollToBottom();
    await updateContinueButtonVisibility(activeMessages);
}

export async function refreshConversationView() {
    await refreshConversationMessages();
}

function getAssistantDraftStorageKey(conversationId) {
    return `${ASSISTANT_DRAFT_STORAGE_PREFIX}${conversationId}`;
}

function loadAssistantDrafts(conversationId) {
    if (conversationId == null) return [];
    try {
        const raw = localStorage.getItem(getAssistantDraftStorageKey(conversationId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveAssistantDraft(conversationId, draft) {
    if (conversationId == null || !draft?.tempId) return;
    const drafts = loadAssistantDrafts(conversationId).filter(item => item.tempId !== draft.tempId);
    drafts.push(draft);
    localStorage.setItem(getAssistantDraftStorageKey(conversationId), JSON.stringify(drafts));
}

function removeAssistantDraft(conversationId, tempId) {
    if (conversationId == null || !tempId) return;
    const drafts = loadAssistantDrafts(conversationId).filter(item => item.tempId !== tempId);
    if (drafts.length === 0) {
        localStorage.removeItem(getAssistantDraftStorageKey(conversationId));
    } else {
        localStorage.setItem(getAssistantDraftStorageKey(conversationId), JSON.stringify(drafts));
    }
}

function renderAssistantDrafts(conversationId) {
    const drafts = loadAssistantDrafts(conversationId);
    if (drafts.length === 0) return;

    for (const draft of drafts) {
        addMessageToUI('bot', draft.content || '', draft.reasoning || '', {
            id: draft.serverId || draft.tempId,
            versionGroupId: draft.versionGroupId || null,
            version: draft.version || 1,
            versionCount: draft.versionCount || 1,
            unsaved: true
        }, true);
    }
}

async function persistAssistantMessage(payload, conversationId, tempId) {
    const saveRes = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!saveRes.ok) {
        saveAssistantDraft(conversationId, {
            tempId,
            content: payload.content,
            reasoning: payload.reasoning || '',
            parentMsgId: payload.parentMsgId || null,
            versionGroupId: payload.versionGroupId || null,
            version: payload.version || 1,
            timestamp: payload.timestamp || Date.now()
        });
        return null;
    }

    removeAssistantDraft(conversationId, tempId);
    return saveRes.json();
}

export async function streamApiResponse({ conversationId, parentMsgId, stopAfterMsgId, versionGroupId, version }) {
    if (!state.serverConfig.hasKey) {
        addMessageToUI('bot', '⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar under Settings (🔑).');
        return;
    }

    const payloadMessages = stopAfterMsgId
        ? await buildApiPayloadUpTo(conversationId, stopAfterMsgId)
        : await buildApiPayload(conversationId);

    if (state.abortController) {
        state.abortController.abort();
    }
    state.abortController = new AbortController();
    let streamMsgId = null;
    let fullContent = '';
    let fullReasoning = '';

    const stopBtn = document.getElementById('stop-btn');
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');

    if (stopBtn) stopBtn.classList.remove('hidden');
    if (sendBtn) sendBtn.classList.add('hidden');
    if (userInput) userInput.disabled = true;

    try {
        const selectedModel = state.serverConfig.activeModel || 'deepseek-v4-pro';
        const thinkingMode = state.serverConfig.thinkingMode || 'enabled';
        const response = await fetch(state.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: state.abortController.signal,
            body: JSON.stringify({
                model: selectedModel,
                messages: payloadMessages,
                temperature: 0.7,
                stream: true,
                thinking: {
                    type: thinkingMode
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("API Error:", errorData);
            throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
        }

        streamMsgId = addStreamingBotMessage();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                const payload = trimmed.slice(6);
                if (payload === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(payload);
                    const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content;
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (reasoningDelta) {
                        fullReasoning += reasoningDelta;
                        updateStreamingReasoning(streamMsgId, fullReasoning);
                    }
                    if (delta) {
                        fullContent += delta;
                        updateStreamingBotMessage(streamMsgId, fullContent);
                    }
                } catch (e) {
                    // Skip malformed JSON lines
                }
            }
        }

        if (fullContent) {
            const savedMsg = await persistAssistantMessage({
                conversationId,
                role: 'assistant',
                content: fullContent,
                reasoning: fullReasoning || undefined,
                timestamp: Date.now(),
                parentMsgId: parentMsgId || null,
                versionGroupId: versionGroupId || null,
                version: version || 1,
                isActive: true
            }, conversationId, streamMsgId);

            finalizeStreamingBotMessage(streamMsgId, fullContent, fullReasoning);

            const streamMsgDiv = document.getElementById(streamMsgId);
            if (streamMsgDiv && savedMsg.id) {
                streamMsgDiv.dataset.msgId = savedMsg.id;
                if (savedMsg.versionGroupId) {
                    streamMsgDiv.dataset.versionGroupId = savedMsg.versionGroupId;
                    streamMsgDiv.dataset.version = savedMsg.version || 1;
                }
                
                const vCountRes = await fetch(`/api/messages?conversationId=${conversationId}`);
                const allMsgs = vCountRes.ok ? await vCountRes.json() : [];
                const vGroup = savedMsg.versionGroupId;
                const versionCount = vGroup ? allMsgs.filter(m => m.versionGroupId === vGroup).length : 1;

                attachMessageActions(streamMsgDiv, 'bot', {
                    id: savedMsg.id,
                    versionGroupId: savedMsg.versionGroupId,
                    version: savedMsg.version || 1,
                    versionCount: versionCount
                });
            } else if (streamMsgDiv && !savedMsg) {
                streamMsgDiv.dataset.unsaved = 'true';
                streamMsgDiv.title = 'Draft message not saved to the server yet.';
                showToast('Assistant response was saved locally because the server save failed.', 'warning');
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            if (fullContent && conversationId) {
                await persistAssistantMessage({
                    conversationId,
                    role: 'assistant',
                    content: fullContent,
                    reasoning: fullReasoning || undefined,
                    timestamp: Date.now(),
                    parentMsgId: parentMsgId || null,
                    versionGroupId: versionGroupId || null,
                    version: version || 1,
                    isActive: true
                }, conversationId, streamMsgId);
            }
            if (streamMsgId) {
                finalizeStreamingBotMessage(streamMsgId, fullContent, fullReasoning);
            }
            return;
        }
        console.error('Error fetching DeepSeek response:', error);
        addMessageToUI('bot', 'Sorry, I encountered an error connecting to the server. Please check your API key or try again later.');
    } finally {
        state.abortController = null;
        if (stopBtn) stopBtn.classList.add('hidden');
        if (sendBtn) sendBtn.classList.remove('hidden');
        if (userInput) {
            userInput.disabled = false;
            userInput.focus();
        }
        await updateContinueButtonVisibility();
    }
}
