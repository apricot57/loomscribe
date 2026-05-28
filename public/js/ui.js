import { state, getSystemPromptContentSync } from './state.js';
import {
    fetchPromptContent,
    getAllUserPrompts,
    getAllPromptCategories,
    lookupPromptName,
    buildApiPayload,
    buildApiPayloadUpTo,
    autoTitleConversation
} from './api.js';

// Model Selection UI Logic
export function initializeThinkingUI() {
    const thinkingBtn = document.getElementById('thinking-toggle-btn');
    const thinkingStatusText = document.getElementById('thinking-status-text');
    if (!thinkingBtn) return;

    const mode = state.serverConfig.thinkingMode || 'enabled';
    if (mode === 'enabled') {
        thinkingBtn.classList.add('active');
        if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: On';
    } else {
        thinkingBtn.classList.remove('active');
        if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: Off';
    }
}

export function initializeModelUI() {
    const activeModelName = document.getElementById('active-model-name');
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    if (!activeModelName || !dropdownItems.length) return;

    const storedModel = state.serverConfig.activeModel || 'deepseek-v4-pro';
    
    dropdownItems.forEach(item => {
        const itemModel = item.getAttribute('data-model');
        if (itemModel === storedModel) {
            item.classList.add('active');
            activeModelName.textContent = item.querySelector('.item-name').textContent;
        } else {
            item.classList.remove('active');
        }
    });
}

// Update the visual status of the key icon dot
export function updateKeyStatusUI() {
    const keyStatusDot = document.getElementById('key-status-dot');
    if (!keyStatusDot) return;
    if (state.serverConfig.hasKey) {
        keyStatusDot.classList.add('active');
    } else {
        keyStatusDot.classList.remove('active');
    }
}

// Close API Key Modal
export function closeModal() {
    const keyModal = document.getElementById('key-modal');
    if (keyModal) {
        keyModal.classList.add('hidden');
    }
}

// Fetch and render the list of conversations in the sidebar
export async function loadConversations() {
    const chatsList = document.getElementById('chats-list');
    const sidebar = document.getElementById('sidebar');
    if (!chatsList) return;

    const res = await fetch('/api/conversations');
    let conversations = [];
    if (res.ok) {
        conversations = await res.json();
    }
    conversations.sort((a, b) => b.createdAt - a.createdAt);
    chatsList.innerHTML = '';
    
    if (conversations.length === 0) {
        const noChats = document.createElement('div');
        noChats.style.padding = '12px 14px';
        noChats.style.fontSize = '0.8rem';
        noChats.style.color = 'var(--text-muted)';
        noChats.style.textAlign = 'center';
        noChats.textContent = 'No recent conversations';
        chatsList.appendChild(noChats);
        return;
    }

    conversations.forEach(conv => {
        const item = document.createElement('button');
        item.className = `chat-list-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
        item.setAttribute('data-id', conv.id);
        item.title = conv.title || 'Untitled Conversation';
        
        const iconSvg = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chat-item-icon">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        `;
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'chat-item-title';
        titleSpan.textContent = conv.title || 'Untitled Conversation';
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'chat-rename-btn';
        renameBtn.setAttribute('aria-label', 'Rename conversation');
        renameBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-delete-btn';
        deleteBtn.setAttribute('aria-label', 'Delete conversation');
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `;
        
        item.addEventListener('click', () => {
            switchConversation(conv.id);
        });

        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startInlineRename(item, titleSpan, conv.id, titleSpan.textContent);
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        });
        
        item.innerHTML = iconSvg;
        item.appendChild(titleSpan);
        item.appendChild(renameBtn);
        item.appendChild(deleteBtn);
        chatsList.appendChild(item);
    });
}

// Switch between conversation threads
export async function switchConversation(id) {
    state.currentConversationId = id;
    localStorage.setItem('activeConversationId', id);
    
    // Highlight active item in sidebar
    const items = document.querySelectorAll('.chat-list-item');
    items.forEach(item => {
        if (parseInt(item.getAttribute('data-id')) === id) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    const cRes = await fetch(`/api/conversations/${id}`);
    const conv = cRes.ok ? await cRes.json() : null;

    if (conv && conv.activeModel) {
        state.serverConfig.activeModel = conv.activeModel;
        initializeModelUI();
    }

    state.currentSystemPromptId = conv?.systemPromptId || null;
    if (state.currentSystemPromptId) {
        await fetchPromptContent(state.currentSystemPromptId);
    }
    updatePromptSelectorDisplay();

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

    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (container) {
        container.innerHTML = '';

        activeMessages.forEach(msg => {
            if (msg.role !== 'system') {
                const sender = msg.role === 'assistant' ? 'bot' : 'user';
                const versionGroupId = msg.versionGroupId;
                const versionCount = versionGroupId ? (versionCounts.get(versionGroupId) || 1) : 1;
                addMessageToUI(sender, msg.content, msg.reasoning, {
                    id: msg.id,
                    versionGroupId: versionGroupId,
                    version: msg.version || 1,
                    versionCount: versionCount
                }, true);
            }
        });
    }
    
    scrollToBottom();
    await updateContinueButtonVisibility(activeMessages);

    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('active');
    }
}

// Spawn a new empty conversation
export async function createNewConversation(title = 'New Chat', systemPromptId = null) {
    const selectedModel = state.serverConfig.activeModel || 'deepseek-v4-pro';

    if (systemPromptId) {
        await fetchPromptContent(systemPromptId);
    }

    const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: title,
            activeModel: selectedModel,
            systemPromptId: systemPromptId || null
        })
    });

    let newConv = {};
    if (res.ok) {
        newConv = await res.json();
    }
    const newId = newConv.id;

    state.currentConversationId = newId;
    localStorage.setItem('activeConversationId', newId);
    state.currentSystemPromptId = systemPromptId || null;
    updatePromptSelectorDisplay();

    await loadConversations();

    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (container) {
        container.innerHTML = '';
    }

    scrollToBottom();
    await updateContinueButtonVisibility([]);

    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('active');
    }

    return newId;
}

// Delete a conversation thread
export function deleteConversation(id) {
    state.conversationIdToDelete = id;
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    if (deleteConfirmModal) {
        deleteConfirmModal.classList.remove('hidden');
    }
}

// Rename conversation thread inline in the sidebar UI
export function startInlineRename(item, titleSpan, id, currentTitle) {
    if (item.querySelector('.chat-item-rename-input')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-item-rename-input';
    input.value = currentTitle;
    
    const renameBtn = item.querySelector('.chat-rename-btn');
    const deleteBtn = item.querySelector('.chat-delete-btn');
    
    if (renameBtn) renameBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';

    const stopProp = (e) => e.stopPropagation();
    input.addEventListener('click', stopProp);
    input.addEventListener('mousedown', stopProp);
    input.addEventListener('mouseup', stopProp);
    input.addEventListener('dblclick', stopProp);

    let isFinished = false;

    const finishRename = async (commitChanges) => {
        if (isFinished) return;
        isFinished = true;

        const newTitle = input.value.trim();
        if (commitChanges && newTitle && newTitle !== currentTitle) {
            titleSpan.textContent = newTitle;
            input.replaceWith(titleSpan);
            if (renameBtn) renameBtn.style.display = '';
            if (deleteBtn) deleteBtn.style.display = '';
            item.title = newTitle;
            
            await fetch(`/api/conversations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
        } else {
            input.replaceWith(titleSpan);
            if (renameBtn) renameBtn.style.display = '';
            if (deleteBtn) deleteBtn.style.display = '';
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishRename(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishRename(false);
        }
    });

    input.addEventListener('blur', () => {
        finishRename(true);
    });

    titleSpan.replaceWith(input);
    input.focus();
    input.select();
}

export function closeDeleteConfirmModal() {
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    if (deleteConfirmModal) {
        deleteConfirmModal.classList.add('hidden');
    }
    state.conversationIdToDelete = null;
}

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
        contentDiv.dataset.rawContent = text;

        bodyDiv.appendChild(contentDiv);
        messageDiv.appendChild(bodyDiv);
    } else {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = text;
        contentDiv.dataset.rawContent = text;
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

    bodyDiv.appendChild(reasoningBlock);
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
    contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content) : content;
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
}

export function scrollToBottom() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;
    const smooth = chatContainer.style.scrollBehavior;
    chatContainer.style.scrollBehavior = 'auto';
    chatContainer.scrollTop = chatContainer.scrollHeight;
    chatContainer.style.scrollBehavior = smooth;
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

export async function populatePromptDropdown(menuElement, currentSelectionId, onSelect) {
    menuElement.innerHTML = '';
    const categories = await getAllPromptCategories();

    const defaultBtn = document.createElement('button');
    defaultBtn.className = 'dropdown-item' + (currentSelectionId === null ? ' selected' : '');
    defaultBtn.textContent = 'None (Default)';
    defaultBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(null);
        menuElement.classList.add('hidden');
    });
    menuElement.appendChild(defaultBtn);

    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    menuElement.appendChild(divider);

    for (const [categoryLabel, prompts] of categories) {
        const section = document.createElement('div');
        section.className = 'dropdown-category-section';

        const header = document.createElement('div');
        header.className = 'dropdown-category-header';
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = categoryLabel;
        header.appendChild(labelSpan);

        const chevron = document.createElement('span');
        chevron.className = 'dropdown-category-chevron';
        header.appendChild(chevron);
        
        section.appendChild(header);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'dropdown-category-items';

        // Check if this category contains the currently selected prompt
        const hasSelectedPrompt = prompts.some(p => p.promptId === currentSelectionId);
        
        // Determine initial collapsed state
        const storedCollapsedState = localStorage.getItem('collapsed_cat_' + categoryLabel);
        const initiallyCollapsed = (storedCollapsedState === 'true') && !hasSelectedPrompt;

        if (initiallyCollapsed) {
            itemsContainer.classList.add('collapsed');
            chevron.textContent = '▶';
        } else {
            chevron.textContent = '▼';
        }

        header.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = itemsContainer.classList.toggle('collapsed');
            chevron.textContent = isCollapsed ? '▶' : '▼';
            localStorage.setItem('collapsed_cat_' + categoryLabel, isCollapsed ? 'true' : 'false');
        });

        for (const p of prompts) {
            if (p.source === 'user') {
                const wrapper = document.createElement('div');
                wrapper.className = 'dropdown-item dropdown-item-user' + (currentSelectionId === p.promptId ? ' selected' : '');

                const nameSpan = document.createElement('span');
                nameSpan.textContent = p.name;
                nameSpan.style.flex = '1';
                nameSpan.style.textAlign = 'left';
                nameSpan.style.cursor = 'pointer';
                nameSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onSelect(p.promptId);
                    menuElement.classList.add('hidden');
                });

                const actions = document.createElement('span');
                actions.className = 'user-prompt-actions';
                
                const editBtn = document.createElement('button');
                editBtn.className = 'user-prompt-action-btn';
                editBtn.textContent = '✎';
                editBtn.title = 'Edit';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menuElement.classList.add('hidden');
                    state.editingPromptId = p.dbId;
                    
                    const promptEditorTitle = document.getElementById('prompt-editor-title');
                    const promptNameInput = document.getElementById('prompt-name-input');
                    const promptCategoryInput = document.getElementById('prompt-category-input');
                    const promptContentInput = document.getElementById('prompt-content-input');
                    const promptEditorModal = document.getElementById('prompt-editor-modal');

                    if (promptEditorTitle) promptEditorTitle.textContent = 'Edit Prompt';
                    if (promptNameInput) promptNameInput.value = p.name;
                    if (promptCategoryInput) promptCategoryInput.value = categoryLabel;
                    if (promptContentInput) promptContentInput.value = '';
                    
                    fetchPromptContent(p.promptId).then(content => {
                        if (promptContentInput) promptContentInput.value = content;
                    });
                    populateCategoryDatalist();
                    if (promptEditorModal) promptEditorModal.classList.remove('hidden');
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'user-prompt-action-btn delete';
                deleteBtn.textContent = '✕';
                deleteBtn.title = 'Delete';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    menuElement.classList.add('hidden');
                    if (confirm('Delete this prompt?')) {
                        await fetch(`/api/user-prompts/${p.dbId}`, {
                            method: 'DELETE'
                        });
                        state.promptContentCache.delete(`user/${p.dbId}`);
                        if (state.currentSystemPromptId === `user/${p.dbId}`) {
                            await setSystemPrompt(null);
                        }
                    }
                });
                
                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);

                wrapper.appendChild(nameSpan);
                wrapper.appendChild(actions);
                itemsContainer.appendChild(wrapper);
            } else {
                const btn = document.createElement('button');
                btn.className = 'dropdown-item' + (currentSelectionId === p.promptId ? ' selected' : '');
                btn.textContent = p.name;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onSelect(p.promptId);
                    menuElement.classList.add('hidden');
                });
                itemsContainer.appendChild(btn);
            }
        }
        section.appendChild(itemsContainer);
        menuElement.appendChild(section);
    }

    const createDiv = document.createElement('div');
    createDiv.className = 'dropdown-divider';
    menuElement.appendChild(createDiv);
    
    const createBtn = document.createElement('button');
    createBtn.className = 'dropdown-item create-prompt-item';
    createBtn.textContent = '+ Create New Prompt';
    createBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuElement.classList.add('hidden');
        state.editingPromptId = null;
        
        const promptEditorTitle = document.getElementById('prompt-editor-title');
        const promptNameInput = document.getElementById('prompt-name-input');
        const promptCategoryInput = document.getElementById('prompt-category-input');
        const promptContentInput = document.getElementById('prompt-content-input');
        const promptEditorModal = document.getElementById('prompt-editor-modal');

        if (promptEditorTitle) promptEditorTitle.textContent = 'Create Prompt';
        if (promptNameInput) promptNameInput.value = '';
        if (promptCategoryInput) promptCategoryInput.value = '';
        if (promptContentInput) promptContentInput.value = '';
        
        populateCategoryDatalist();
        if (promptEditorModal) promptEditorModal.classList.remove('hidden');
    });
    menuElement.appendChild(createBtn);
}

export async function setSystemPrompt(promptId) {
    state.currentSystemPromptId = promptId;
    if (promptId) {
        await fetchPromptContent(promptId);
    }
    updatePromptSelectorDisplay();
    if (state.currentConversationId) {
        await fetch(`/api/conversations/${state.currentConversationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPromptId: promptId || null })
        });
    }
}

export function updatePromptSelectorDisplay() {
    const activePromptName = document.getElementById('active-prompt-name');
    if (!activePromptName) return;

    if (!state.currentSystemPromptId) {
        activePromptName.textContent = 'Default';
        return;
    }
    lookupPromptName(state.currentSystemPromptId).then(name => {
        activePromptName.textContent = name || 'Default';
    });
}

export function populateCategoryDatalist() {
    const promptCategoryList = document.getElementById('prompt-category-list');
    if (!promptCategoryList) return;

    promptCategoryList.innerHTML = '';
    const seen = new Set();
    if (state.factoryPromptCategories) {
        for (const catDir of Object.keys(state.factoryPromptCategories.categories)) {
            const label = catDir.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (!seen.has(label)) {
                seen.add(label);
                const opt = document.createElement('option');
                opt.value = label;
                promptCategoryList.appendChild(opt);
            }
        }
    }
}

export function updateMessageNodeInPlace(node, msg) {
    const contentDiv = node.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.dataset.rawContent = msg.content;
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
            if (contentDiv && contentDiv.dataset.rawContent !== msg.content) {
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
            const saveRes = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    role: 'assistant',
                    content: fullContent,
                    reasoning: fullReasoning || undefined,
                    timestamp: Date.now(),
                    parentMsgId: parentMsgId || null,
                    versionGroupId: versionGroupId || null,
                    version: version || 1,
                    isActive: true
                })
            });
            let savedMsg = {};
            if (saveRes.ok) {
                savedMsg = await saveRes.json();
            }

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
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            if (fullContent && conversationId) {
                await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId,
                        role: 'assistant',
                        content: fullContent,
                        reasoning: fullReasoning || undefined,
                        timestamp: Date.now(),
                        parentMsgId: parentMsgId || null,
                        versionGroupId: versionGroupId || null,
                        version: version || 1,
                        isActive: true
                    })
                });
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
