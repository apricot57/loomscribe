import { authFetch } from '../auth.js';
import { state, escapeHtml } from '../state.js';
import {
    buildApiPayload,
    buildApiPayloadUpTo,
    autoTitleConversation
} from '../api.js';
import { showToast } from './modals.js';
import { safeAsync, renderMarkdown } from './helpers.js';
import { createNewConversation, loadConversations, switchConversation } from './sidebar.js';
import { sendGenerate, sendAbort, socketEvents } from '../socket.js';

const ASSISTANT_DRAFT_STORAGE_PREFIX = 'loomscribe:assistant-drafts:';
let isSubmitting = false;

export function lockUIForSubmission() {
    isSubmitting = true;
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    if (userInput) userInput.disabled = true;
    if (sendBtn) sendBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');
}

export function unlockUIAfterSubmission() {
    isSubmitting = false;
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    if (userInput) {
        userInput.disabled = false;
        userInput.focus();
    }
    if (sendBtn) sendBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
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
                toggleReasoningBlock(reasoningBlock);
            });
            bodyDiv.appendChild(reasoningBlock);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = renderMarkdown(text);
        contentDiv.setAttribute('data-raw-content', text);

        bodyDiv.appendChild(contentDiv);

        if (msgMeta.error) {
            const errorBanner = document.createElement('div');
            errorBanner.className = 'message-error-banner';
            errorBanner.innerHTML = `⚠️ Error: ${escapeHtml(msgMeta.error)}`;
            bodyDiv.appendChild(errorBanner);
        }

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

export function addStreamingBotMessage(customId) {
    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (!container) return null;

    const id = customId || ('stream-msg-' + Date.now());
    let messageDiv = document.getElementById(id);
    if (messageDiv) {
        return id;
    }

    messageDiv = document.createElement('div');
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
        toggleReasoningBlock(reasoningBlock);
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
    const wasNear = isNearBottom();
    block.textContent = reasoning;
    const parent = msg.querySelector('.reasoning-block');
    if (parent) parent.classList.remove('collapsed');
    if (wasNear) scrollToBottom();
}

export function updateStreamingBotMessage(id, content) {
    const msg = document.getElementById(id);
    if (!msg) return;
    const contentDiv = msg.querySelector('.message-content');
    if (!contentDiv) return;
    const wasNear = isNearBottom();
    contentDiv.innerHTML = renderMarkdown(content || '');
    if (wasNear) scrollToBottom();
}

export function finalizeStreamingBotMessage(id, content, reasoning) {
    const msg = document.getElementById(id);
    if (!msg) return;

    const chatContainer = document.getElementById('chat-container');
    const wasNear = isNearBottom();

    const block = msg.querySelector('.reasoning-block');

    const header = msg.querySelector('.reasoning-header span');
    if (header) header.textContent = 'Thought';

    const reasoningContent = msg.querySelector('.reasoning-content');
    if (reasoningContent && reasoning) {
        reasoningContent.textContent = reasoning;
        if (block) block.classList.add('collapsed');
    } else if (reasoningContent) {
        if (block) block.remove();
    }

    const contentDiv = msg.querySelector('.message-content');
    const startTop = contentDiv ? contentDiv.getBoundingClientRect().top : 0;

    if (contentDiv) {
        contentDiv.classList.remove('streaming');
        contentDiv.innerHTML = renderMarkdown(content || '');
        contentDiv.setAttribute('data-raw-content', content || '');
    }

    if (chatContainer) {
        if (wasNear) {
            scrollToBottom();
        } else if (contentDiv) {
            const endTop = contentDiv.getBoundingClientRect().top;
            const diff = endTop - startTop;
            chatContainer.scrollTop += diff;
        }
    }
}

export function isNearBottom() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return false;
    const threshold = 15;
    const distanceToBottom = chatContainer.scrollHeight - chatContainer.clientHeight - chatContainer.scrollTop;
    return distanceToBottom <= threshold;
}

export function getRequiredHeight(textarea, fallbackWidth = null) {
    const clone = textarea.cloneNode(false);
    clone.style.position = 'absolute';
    clone.style.visibility = 'hidden';
    clone.style.height = 'auto';
    const width = textarea.clientWidth || fallbackWidth || 500;
    clone.style.width = width + 'px';
    clone.value = textarea.value;
    document.body.appendChild(clone);
    const height = clone.scrollHeight;
    document.body.removeChild(clone);
    return height;
}

export function toggleReasoningBlock(reasoningBlock) {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) {
        reasoningBlock.classList.toggle('collapsed');
        return;
    }
    const wasNear = isNearBottom();
    const previousScrollTop = chatContainer.scrollTop;
    const beforeHeight = reasoningBlock.offsetHeight;

    reasoningBlock.classList.toggle('collapsed');

    const afterHeight = reasoningBlock.offsetHeight;
    const heightDifference = beforeHeight - afterHeight;

    if (wasNear) {
        scrollToBottom();
    } else {
        chatContainer.scrollTop = previousScrollTop - heightDifference;
    }
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

    if (state.currentConversationId === null || state.abortControllers[state.currentConversationId]) {
        continueBtn.classList.add('hidden');
        return;
    }

    try {
        let messages = activeMessages;
        if (!messages) {
            const mRes = await authFetch(`/api/messages?conversationId=${state.currentConversationId}`);
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

export function enterInlineEditUser(messageDiv, msgId) {
    return startInlineEdit(messageDiv, msgId);
}

export function enterInlineEditAssistant(messageDiv, msgId) {
    return startBotInlineEdit(messageDiv, msgId);
}

export function attachMessageActions(messageDiv, sender, msgMeta) {
    const msgId = msgMeta.id;
    if (!msgId) return;

    const existingRow = messageDiv.querySelector('.message-action-row');
    if (existingRow) existingRow.remove();

    const actionRow = document.createElement('div');
    actionRow.className = 'message-action-row';

    const turnInfo = getTurnVersions(msgId, state.allMessages || [], state.activeMessages || []);
    if (turnInfo && turnInfo.totalCount > 1) {
        const versionNav = document.createElement('div');
        versionNav.className = 'version-nav';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'version-nav-btn';
        prevBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m15 18-6-6 6-6"></path>
            </svg>
        `;
        prevBtn.title = 'Previous version';
        if (turnInfo.currentIndex <= 1) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.4';
            prevBtn.style.cursor = 'not-allowed';
        }
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (turnInfo.currentIndex > 1) {
                const targetTurn = turnInfo.versions[turnInfo.currentIndex - 2];
                navigateTurn(targetTurn.userMsg.id, targetTurn.assistantMsg?.id);
            }
        });

        const label = document.createElement('span');
        label.className = 'version-nav-label';
        label.textContent = `${turnInfo.currentIndex}/${turnInfo.totalCount}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'version-nav-btn';
        nextBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6"></path>
            </svg>
        `;
        nextBtn.title = 'Next version';
        if (turnInfo.currentIndex >= turnInfo.totalCount) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.4';
            nextBtn.style.cursor = 'not-allowed';
        }
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (turnInfo.currentIndex < turnInfo.totalCount) {
                const targetTurn = turnInfo.versions[turnInfo.currentIndex];
                navigateTurn(targetTurn.userMsg.id, targetTurn.assistantMsg?.id);
            }
        });

        versionNav.appendChild(prevBtn);
        versionNav.appendChild(label);
        versionNav.appendChild(nextBtn);
        actionRow.appendChild(versionNav);
    }

    if (sender === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-btn';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;
        editBtn.title = 'Edit message';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startInlineEdit(messageDiv, msgId);
        });
        actionRow.appendChild(editBtn);
    } else {
        const regenBtn = document.createElement('button');
        regenBtn.className = 'message-action-btn regen-btn';
        regenBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
        `;
        regenBtn.title = 'Regenerate response';
        regenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            regenerateResponse(msgId);
        });
        actionRow.appendChild(regenBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-btn';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;
        editBtn.title = 'Edit assistant response';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startBotInlineEdit(messageDiv, msgId);
        });
        actionRow.appendChild(editBtn);
    }

    const forkBtn = document.createElement('button');
    forkBtn.className = 'message-action-btn fork-btn';
    forkBtn.title = 'Fork conversation from here';
    forkBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="18" cy="6" r="3"></circle>
            <path d="M18 9v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
            <path d="M12 12v3"></path>
        </svg>
    `;
    forkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!state.currentConversationId) return;
        try {
            const res = await authFetch(`/api/conversations/${state.currentConversationId}/fork`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: msgId })
            });
            if (res.ok) {
                const newConv = await res.json();
                showToast('Conversation forked');
                await loadConversations();
                await switchConversation(newConv.id);
            } else {
                const errText = await res.text();
                showToast(`Failed to fork conversation: ${errText}`, 'error');
            }
        } catch (err) {
            console.error('Error forking conversation:', err);
            showToast('Error forking conversation', 'error');
        }
    });
    actionRow.appendChild(forkBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn copy-btn';
    copyBtn.title = 'Copy to clipboard';
    const copyIcon = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
    `;
    const successIcon = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `;
    copyBtn.innerHTML = copyIcon;
    copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const contentDiv = messageDiv.querySelector('.message-content');
        const textToCopy = contentDiv ? contentDiv.getAttribute('data-raw-content') : '';
        if (textToCopy) {
            try {
                await navigator.clipboard.writeText(textToCopy);
                copyBtn.innerHTML = successIcon;
                copyBtn.title = 'Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = copyIcon;
                    copyBtn.title = 'Copy to clipboard';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
        }
    });
    actionRow.appendChild(copyBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'message-action-btn delete-btn';
    deleteBtn.title = 'Delete message';
    deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
    `;
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessageVersionGroup(msgId);
    });
    actionRow.appendChild(deleteBtn);

    if (actionRow.children.length > 0) {
        if (sender === 'bot') {
            const bodyDiv = messageDiv.querySelector('.message-body');
            if (bodyDiv) bodyDiv.appendChild(actionRow);
            else messageDiv.appendChild(actionRow);
        } else {
            const contentDiv = messageDiv.querySelector('.message-content');
            if (contentDiv) contentDiv.after(actionRow);
            else messageDiv.appendChild(actionRow);
        }
    }
}

export function deleteMessageVersionGroup(msgId) {
    state.messageIdToDelete = msgId;
    state.conversationIdToDelete = null;
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    if (deleteConfirmModal) {
        deleteConfirmModal.querySelector('h2').textContent = 'Delete Message?';
        deleteConfirmModal.querySelector('.modal-description').textContent = 'Are you sure you want to delete this message? This will permanently erase all versions of it and all subsequent messages in this thread. This action cannot be undone.';
        deleteConfirmModal.querySelector('#delete-confirm-btn').textContent = 'Delete Message';
        deleteConfirmModal.classList.remove('hidden');
    }
}

export function startInlineEdit(messageDiv, msgId) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    const actionRow = messageDiv.querySelector('.message-action-row');
    if (actionRow) actionRow.style.display = 'none';

    // Save scroll state before any DOM modification
    const chatContainer = document.getElementById('chat-container');
    const startTop = messageDiv.getBoundingClientRect().top;

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
        const chatContainer = document.getElementById('chat-container');
        const previousScrollTop = chatContainer ? chatContainer.scrollTop : 0;
        const wasNear = isNearBottom();

        const targetHeight = getRequiredHeight(textarea, contentDiv.clientWidth);
        textarea.style.height = (targetHeight + 6) + 'px';
        textarea.style.overflowY = 'hidden';

        if (chatContainer) {
            if (wasNear) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            } else {
                chatContainer.scrollTop = previousScrollTop;
            }
        }
    };
    textarea.addEventListener('input', adjustHeight);
    adjustHeight();

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Restore scroll state by anchoring to message top coordinate
    if (chatContainer) {
        const endTop = messageDiv.getBoundingClientRect().top;
        chatContainer.scrollTop += (endTop - startTop);
    }
}

export function cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow) {
    const chatContainer = document.getElementById('chat-container');
    const startTop = messageDiv.getBoundingClientRect().top;

    messageDiv.classList.remove('editing');
    const editContainer = messageDiv.querySelector('.inline-edit-container');
    if (editContainer) {
        editContainer.replaceWith(contentDiv);
    } else {
        textarea.replaceWith(contentDiv);
        editActions.remove();
    }
    if (actionRow) actionRow.style.display = '';

    if (chatContainer) {
        const endTop = messageDiv.getBoundingClientRect().top;
        chatContainer.scrollTop += (endTop - startTop);
    }
}

export function startBotInlineEdit(messageDiv, msgId) {
    const contentDiv = messageDiv.querySelector('.message-content');
    if (!contentDiv) return;

    const actionRow = messageDiv.querySelector('.message-action-row');
    if (actionRow) actionRow.style.display = 'none';

    // Save scroll state before any DOM modification
    const chatContainer = document.getElementById('chat-container');
    const startTop = messageDiv.getBoundingClientRect().top;

    const originalRaw = contentDiv.getAttribute('data-raw-content') || '';

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
            await editBotMessageOnly(msgId, newText, messageDiv, contentDiv, editActions, actionRow);
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
        const chatContainer = document.getElementById('chat-container');
        const previousScrollTop = chatContainer ? chatContainer.scrollTop : 0;
        const wasNear = isNearBottom();

        const targetHeight = getRequiredHeight(textarea, contentDiv.clientWidth);
        textarea.style.height = (targetHeight + 6) + 'px';
        textarea.style.overflowY = 'hidden';

        if (chatContainer) {
            if (wasNear) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            } else {
                chatContainer.scrollTop = previousScrollTop;
            }
        }
    };
    textarea.addEventListener('input', adjustHeight);
    adjustHeight();

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Restore scroll state by anchoring to message top coordinate
    if (chatContainer) {
        const endTop = messageDiv.getBoundingClientRect().top;
        chatContainer.scrollTop += (endTop - startTop);
    }
}

export function cancelBotInlineEdit(messageDiv, contentDiv, editActions, actionRow) {
    const chatContainer = document.getElementById('chat-container');
    const startTop = messageDiv.getBoundingClientRect().top;

    messageDiv.classList.remove('editing');
    const editContainer = messageDiv.querySelector('.inline-edit-container');
    if (editContainer) {
        editContainer.replaceWith(contentDiv);
    } else {
        editActions.remove();
    }
    if (actionRow) actionRow.style.display = '';

    if (chatContainer) {
        const endTop = messageDiv.getBoundingClientRect().top;
        chatContainer.scrollTop += (endTop - startTop);
    }
}

export async function editBotMessageOnly(msgId, newText, messageDiv, contentDiv, editActions, actionRow) {
    const res = await authFetch(`/api/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText })
    });
    if (res.ok) {
        if (contentDiv) {
            contentDiv.setAttribute('data-raw-content', newText);
            contentDiv.innerHTML = renderMarkdown(newText);
        }
        cancelBotInlineEdit(messageDiv, contentDiv, editActions, actionRow);
        await refreshConversationView();
    }
}

export async function editMessageAndRegenerate(msgId, newText, messageDiv) {
    if (isSubmitting) return;
    lockUIForSubmission();
    try {
        const res = await authFetch(`/api/messages/${msgId}/version`, {
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
        } else {
            unlockUIAfterSubmission();
        }
    } catch (err) {
        console.error(err);
        unlockUIAfterSubmission();
    }
}

export async function regenerateResponse(msgId) {
    if (isSubmitting) return;
    lockUIForSubmission();
    try {
        const res = await authFetch(`/api/messages/${msgId}/deactivate-tree`, {
            method: 'POST'
        });
        if (res.ok) {
            const data = await res.json();
            
            const mRes = await authFetch(`/api/messages?conversationId=${state.currentConversationId}`);
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
        } else {
            unlockUIAfterSubmission();
        }
    } catch (err) {
        console.error(err);
        unlockUIAfterSubmission();
    }
}

export function getTurnVersions(msgId, allMessages, activeMessages) {
    const msg = allMessages.find(m => m.id === msgId);
    if (!msg) return null;

    let userMsg = null;
    let activeAssistantMsg = null;

    if (msg.role === 'user') {
        userMsg = msg;
        activeAssistantMsg = activeMessages.find(m => m.role === 'assistant' && m.parentMsgId === msg.id) || null;
    } else if (msg.role === 'assistant') {
        userMsg = allMessages.find(m => m.id === msg.parentMsgId) || null;
        activeAssistantMsg = msg;
    }

    if (!userMsg) return null;

    const userVGId = userMsg.versionGroupId || userMsg.id;
    const U = allMessages.filter(m => m.role === 'user' && (m.versionGroupId === userVGId || m.id === userVGId));
    U.sort((a, b) => (a.version || 1) - (b.version || 1) || a.timestamp - b.timestamp);

    const T = [];
    for (const u of U) {
        const responses = allMessages.filter(m => m.role === 'assistant' && m.parentMsgId === u.id);
        responses.sort((a, b) => (a.version || 1) - (b.version || 1) || a.timestamp - b.timestamp);
        if (responses.length === 0) {
            T.push({ userMsg: u, assistantMsg: null });
        } else {
            for (const r of responses) {
                T.push({ userMsg: u, assistantMsg: r });
            }
        }
    }

    const activeIdx = T.findIndex(item => 
        item.userMsg.id === userMsg.id && 
        (!item.assistantMsg || item.assistantMsg.id === activeAssistantMsg?.id)
    );

    return {
        versions: T,
        currentIndex: activeIdx !== -1 ? activeIdx + 1 : 1,
        totalCount: T.length
    };
}

export async function navigateTurn(userMsgId, assistantMsgId) {
    try {
        const res = await authFetch(`/api/messages/navigate-turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userMsgId, assistantMsgId })
        });
        if (res.ok) {
            await refreshConversationView();
        } else {
            const errText = await res.text();
            console.error('Failed to navigate version turn:', errText);
            alert(`Error navigating version: ${errText}`);
        }
    } catch (err) {
        console.error('Error during turn navigation:', err);
        alert('Network error during version navigation.');
    }
}

export function updateMessageNodeInPlace(node, msg) {
    const contentDiv = node.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.setAttribute('data-raw-content', msg.content);
        if (msg.role === 'assistant') {
            contentDiv.innerHTML = renderMarkdown(msg.content);
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
                toggleReasoningBlock(reasoningBlock);
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

    let errorBanner = node.querySelector('.message-error-banner');
    if (msg.error) {
        if (!errorBanner) {
            errorBanner = document.createElement('div');
            errorBanner.className = 'message-error-banner';
            const bodyDiv = node.querySelector('.message-body');
            if (bodyDiv) bodyDiv.appendChild(errorBanner);
        }
        errorBanner.innerHTML = `⚠️ Error: ${escapeHtml(msg.error)}`;
    } else if (errorBanner) {
        errorBanner.remove();
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
                versionCount: msg.versionCount || 1,
                error: msg.error
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
                    versionCount: m.versionCount || 1,
                    error: m.error
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

export async function refreshConversationMessages(forceScroll = false) {
    if (state.currentConversationId === null) return;
    
    const wasNear = isNearBottom();
    
    const id = state.currentConversationId;
    const mRes = await authFetch(`/api/messages?conversationId=${id}`);
    const allMessages = mRes.ok ? await mRes.json() : [];
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    const activeMessages = allMessages.filter(m => m.isActive !== false);

    // Sync to state
    state.allMessages = allMessages;
    state.activeMessages = activeMessages;

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
    
    if (forceScroll || wasNear) {
        scrollToBottom();
    }
    await updateContinueButtonVisibility(activeMessages);
}

export async function refreshConversationView(forceScroll = false) {
    await refreshConversationMessages(forceScroll);
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

export function renderAssistantDrafts(conversationId) {
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
    const saveRes = await authFetch('/api/messages', {
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
        addMessageToUI('bot', '⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar under Settings (⚙️).');
        return;
    }

    const payloadMessages = stopAfterMsgId
        ? await buildApiPayloadUpTo(conversationId, stopAfterMsgId)
        : await buildApiPayload(conversationId);

    // Update lastAppliedEngineSignature on successful preparation
    try {
        const { getEngineSchema } = await import('../api.js');
        const { renderRightPane } = await import('./right-pane.js');
        const convRes = await authFetch(`/api/conversations/${conversationId}`);
        if (convRes.ok) {
            const conv = await convRes.json();
            if (conv && conv.presetId) {
                const schema = await getEngineSchema();
                const systemParams = {};
                for (const item of schema) {
                    if (item.slot === 'system') {
                        systemParams[item.id] = conv.params?.[item.id] !== undefined ? conv.params[item.id] : item.default;
                    }
                }
                const signature = JSON.stringify({
                    presetId: conv.presetId,
                    params: systemParams,
                    blockOverrides: conv.blockOverrides || {}
                });
                
                const updatedConv = await authFetch(`/api/conversations/${conversationId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lastAppliedEngineSignature: signature })
                }).then(r => r.json());
                
                if (conversationId === state.currentConversationId) {
                    await renderRightPane(updatedConv);
                }
            }
        }
    } catch (sigErr) {
        console.error("Failed to update engine signature:", sigErr);
    }

    const selectedModel = state.serverConfig.activeModel || 'deepseek-v4-pro';
    const thinkingMode = state.serverConfig.thinkingMode || 'enabled';

    sendGenerate({
        conversationId,
        model: selectedModel,
        messages: payloadMessages,
        temperature: 0.7,
        thinking: {
            type: thinkingMode
        },
        parentMsgId,
        versionGroupId,
        version
    });
}

export function initChatForm() {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const continueBtn = document.getElementById('continue-btn');

    // Handle Enter and Shift+Enter for textarea
    if (userInput && chatForm) {
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = userInput.value.trim();
                if (text) {
                    chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            }
        });

        userInput.addEventListener('input', () => {
            const chatContainer = document.getElementById('chat-container');
            const previousScrollTop = chatContainer ? chatContainer.scrollTop : 0;
            const wasNear = isNearBottom();

            const targetHeight = getRequiredHeight(userInput);
            userInput.style.height = Math.min(targetHeight, 150) + 'px';
            
            if (chatContainer) {
                if (wasNear) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                } else {
                    chatContainer.scrollTop = previousScrollTop;
                }
            }

            const draftKey = state.currentConversationId !== null ? `loomscribe_draft_${state.currentConversationId}` : 'loomscribe_draft_null';
            if (userInput.value) {
                localStorage.setItem(draftKey, userInput.value);
            } else {
                localStorage.removeItem(draftKey);
            }
        });
    }

    // Message submit trigger
    if (chatForm) {
        chatForm.addEventListener('submit', safeAsync(async (e) => {
            e.preventDefault();
            
            if (isSubmitting) return;
            
            if (continueBtn) continueBtn.classList.add('hidden');
            
            const message = userInput.value.trim();
            if (!message) return;

            lockUIForSubmission();

            const draftKey = state.currentConversationId !== null ? `loomscribe_draft_${state.currentConversationId}` : 'loomscribe_draft_null';
            localStorage.removeItem(draftKey);

            // Verify API key configuration on backend
            if (!state.serverConfig.hasKey) {
                addMessageToUI('bot', '⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar under Settings (⚙️).');
                unlockUIAfterSubmission();
                return;
            }

            try {
                // Auto-create active thread if none exists
                if (state.currentConversationId === null) {
                    await createNewConversation();
                }

                // Find the previous active message to set parentMsgId
                const mRes = await authFetch(`/api/messages?conversationId=${state.currentConversationId}`);
                const prevMsgs = mRes.ok ? await mRes.json() : [];
                const lastActive = prevMsgs.filter(m => m.isActive !== false).sort((a, b) => a.timestamp - b.timestamp).pop();
                const parentMsgIdVal = lastActive ? lastActive.id : null;

                // Add user message to UI
                const userMsgDiv = addMessageToUI('user', message);

                // Clear input early
                userInput.value = '';
                userInput.style.height = 'auto';

                // Write message record to server side DB
                const addRes = await authFetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId: state.currentConversationId,
                        role: 'user',
                        content: message,
                        timestamp: Date.now(),
                        parentMsgId: parentMsgIdVal,
                        isActive: true
                    })
                });
                let newMsg = {};
                if (addRes.ok) {
                    newMsg = await addRes.json();
                }
                const userMsgId = newMsg.id;

                // Attach edit actions directly to the user message div instead of re-rendering
                if (userMsgDiv && userMsgId) {
                    userMsgDiv.id = userMsgId;
                    userMsgDiv.dataset.msgId = userMsgId;
                    
                    // Fetch and sync state to ensure switcher computes immediately
                    const mRes = await authFetch(`/api/messages?conversationId=${state.currentConversationId}`);
                    if (mRes.ok) {
                        const allMessages = await mRes.json();
                        allMessages.sort((a, b) => a.timestamp - b.timestamp);
                        state.allMessages = allMessages;
                        state.activeMessages = allMessages.filter(m => m.isActive !== false);
                    }
                    
                    attachMessageActions(userMsgDiv, 'user', { id: userMsgId });
                }

                // Trigger auto-titling if this is the very first message
                if (prevMsgs.length === 0) {
                    await autoTitleConversation(state.currentConversationId, message);
                }

                // Stream AI response using shared function
                await streamApiResponse({
                    conversationId: state.currentConversationId,
                    parentMsgId: userMsgId
                });
            } catch (err) {
                console.error("Submission failed:", err);
                showToast("Failed to submit message", "error");
                unlockUIAfterSubmission();
            }
        }));
    }
}

export function initStopButton() {
    const stopBtn = document.getElementById('stop-btn');

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            const activeId = state.currentConversationId;
            if (activeId !== null) {
                sendAbort(activeId);
            }
        });
    }
}

export function initContinueButton() {
    const continueBtn = document.getElementById('continue-btn');
    const userInput = document.getElementById('user-input');
    const chatForm = document.getElementById('chat-form');

    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            if (userInput && chatForm) {
                continueBtn.classList.add('hidden');
                userInput.value = '[continue]';
                userInput.style.height = 'auto';
                chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    }
}

export function initExportButton() {
    const exportChatBtn = document.getElementById('export-chat-btn');

    if (exportChatBtn) {
        exportChatBtn.addEventListener('click', safeAsync(async () => {
            if (state.currentConversationId === null) {
                showToast('No active conversation to export.', 'warning');
                return;
            }

            const cRes = await authFetch('/api/conversations');
            const conversations = cRes.ok ? await cRes.json() : [];
            const conv = conversations.find(c => c.id === state.currentConversationId);
            if (!conv) return;

            const mRes = await authFetch(`/api/messages?conversationId=${state.currentConversationId}`);
            const allMessages = mRes.ok ? await mRes.json() : [];
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            const activeMessages = allMessages.filter(m => m.isActive !== false);

            if (activeMessages.length === 0) {
                showToast('This conversation has no messages to export.', 'warning');
                return;
            }

            const title = conv.title || 'Untitled Conversation';
            let mdContent = `# ${title}\n\n---\n\n`;

            activeMessages.forEach(msg => {
                if (msg.role !== 'system') {
                    const roleName = msg.role === 'assistant' ? 'Assistant' : 'User';
                    mdContent += `## ${roleName}\n\n${msg.content}\n\n---\n\n`;
                }
            });

            // Clean up trailing separators
            mdContent = mdContent.trim().replace(/---\s*$/, '').trim() + '\n';

            // Trigger download
            const slugify = (text) => {
                return text
                    .toString()
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]+/g, '')
                    .replace(/\-\-+/g, '-')
                    .replace(/^-+/, '')
                    .replace(/-+$/, '');
            };

            const filename = `${slugify(title) || 'conversation'}.md`;
            const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }));
    }
}

// Register WebSocket event listener to reactively handle response streaming
socketEvents.subscribe(async (event) => {
    const { type, conversationId, streamMsgId, content, reasoning, message, error } = event;

    // 0. Handle Close/Disconnect
    if (type === 'close') {
        const wasStreaming = Object.keys(state.activeStreams || {}).length > 0;
        state.activeStreams = {};
        unlockUIAfterSubmission();
        const typingIndicator = document.querySelector('.typing-indicator');
        if (typingIndicator) typingIndicator.remove();
        document.querySelectorAll('.message.bot-message[id^="stream-msg-"]').forEach(el => el.remove());
        if (wasStreaming) {
            showToast("Connection lost. Stream aborted.", "error");
        }
        return;
    }

    // 1. Handle Init
    if (type === 'init') {
        state.activeStreams[conversationId] = {
            content: '',
            reasoning: '',
            streamMsgId: streamMsgId
        };
        await loadConversations();

        if (conversationId === state.currentConversationId) {
            addStreamingBotMessage(streamMsgId);
            lockUIForSubmission();
        }
    }

    // 2. Handle Token
    else if (type === 'token') {
        const streamState = state.activeStreams[conversationId];
        if (!streamState) return;

        if (reasoning) {
            streamState.reasoning = (streamState.reasoning || '') + reasoning;
            if (conversationId === state.currentConversationId) {
                updateStreamingReasoning(streamMsgId, streamState.reasoning);
            }
        }
        if (content) {
            streamState.content = (streamState.content || '') + content;
            if (conversationId === state.currentConversationId) {
                updateStreamingBotMessage(streamMsgId, streamState.content);
            }
        }
    }

    // 3. Handle Done
    else if (type === 'done') {
        delete state.activeStreams[conversationId];
        await loadConversations();

        if (conversationId === state.currentConversationId) {
            unlockUIAfterSubmission();
            await updateContinueButtonVisibility();

            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) typingIndicator.remove();

            if (message) {
                finalizeStreamingBotMessage(streamMsgId, message.content, message.reasoning);
                const streamMsgDiv = document.getElementById(streamMsgId);
                if (streamMsgDiv) {
                    streamMsgDiv.id = message.id;
                    streamMsgDiv.dataset.msgId = message.id;
                    if (message.versionGroupId) {
                        streamMsgDiv.dataset.versionGroupId = message.versionGroupId;
                        streamMsgDiv.dataset.version = message.version || 1;
                    }
                    
                    const vCountRes = await authFetch(`/api/messages?conversationId=${conversationId}`);
                    const allMsgs = vCountRes.ok ? await vCountRes.json() : [];
                    const vGroup = message.versionGroupId;
                    const versionCount = vGroup ? allMsgs.filter(m => m.versionGroupId === vGroup).length : 1;

                    attachMessageActions(streamMsgDiv, 'bot', {
                        id: message.id,
                        versionGroupId: message.versionGroupId,
                        version: message.version || 1,
                        versionCount: versionCount
                    });
                }
            } else {
                const streamMsgDiv = document.getElementById(streamMsgId);
                if (streamMsgDiv) {
                    streamMsgDiv.remove();
                }
            }
        }
    }

    // 4. Handle Error
    else if (type === 'error') {
        delete state.activeStreams[conversationId];
        await loadConversations();

        if (conversationId === state.currentConversationId) {
            unlockUIAfterSubmission();
            await updateContinueButtonVisibility();

            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) typingIndicator.remove();

            const streamMsgDiv = document.getElementById(streamMsgId);

            if (message) {
                // Case B: Finalize message content with partial text and reasoning
                finalizeStreamingBotMessage(streamMsgId, message.content, message.reasoning);
                if (streamMsgDiv) {
                    streamMsgDiv.id = message.id;
                    streamMsgDiv.dataset.msgId = message.id;
                    if (message.versionGroupId) {
                        streamMsgDiv.dataset.versionGroupId = message.versionGroupId;
                        streamMsgDiv.dataset.version = message.version || 1;
                    }
                    
                    // Render error banner
                    let errorBanner = streamMsgDiv.querySelector('.message-error-banner');
                    if (!errorBanner) {
                        errorBanner = document.createElement('div');
                        errorBanner.className = 'message-error-banner';
                        const bodyDiv = streamMsgDiv.querySelector('.message-body');
                        if (bodyDiv) bodyDiv.appendChild(errorBanner);
                    }
                    errorBanner.innerHTML = `⚠️ Error: ${escapeHtml(error)}`;
                    
                    // Attach actions so user can copy, edit prompt, or regenerate
                    attachMessageActions(streamMsgDiv, 'bot', {
                        id: message.id,
                        versionGroupId: message.versionGroupId,
                        version: message.version || 1,
                        versionCount: 1
                    });
                }
            } else {
                // Case A: No content was generated. Cleanly delete empty loading bubble.
                if (streamMsgDiv) {
                    streamMsgDiv.remove();
                }
                // Render a standalone error card
                addMessageToUI('bot', `<div class="standalone-error-card">
                    <div class="error-card-title">⚠️ Generation Error</div>
                    <div class="error-card-body">${escapeHtml(error)}</div>
                </div>`, null, { unsaved: true });
            }
        }
    }
});
