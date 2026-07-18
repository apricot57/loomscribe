import { authFetch } from '../auth.js';
import { state } from '../state.js';
import { initializeModelUI } from './input.js';
import { renderRightPane, clearPendingSave } from './right-pane.js';
import {
    addMessageToUI,
    renderAssistantDrafts,
    scrollToBottom,
    updateContinueButtonVisibility,
    addStreamingBotMessage,
    updateStreamingReasoning,
    updateStreamingBotMessage
} from './chat.js';
import { showToast } from './modals.js';
import { safeAsync } from './helpers.js';

// Fetch and render the list of conversations in the sidebar
export async function loadConversations() {
    const chatsList = document.getElementById('chats-list');
    const sidebar = document.getElementById('sidebar');
    if (!chatsList) return;

    const res = await authFetch('/api/conversations');
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
        
        if (state.abortControllers[conv.id]) {
            const indicator = document.createElement('span');
            indicator.className = 'streaming-indicator-dot';
            indicator.textContent = '⚡';
            titleSpan.appendChild(indicator);
        }
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'chat-rename-btn';
        renameBtn.setAttribute('aria-label', 'Rename conversation');
        renameBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"></path>
            </svg>
        `;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-delete-btn';
        deleteBtn.setAttribute('aria-label', 'Delete conversation');
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                <line x1="10" x2="10" y1="11" y2="17"></line>
                <line x1="14" x2="14" y1="11" y2="17"></line>
            </svg>
        `;

        const actionGroup = document.createElement('div');
        actionGroup.className = 'chat-item-actions';
        actionGroup.appendChild(renameBtn);
        actionGroup.appendChild(deleteBtn);
        
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
        item.appendChild(actionGroup);
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

    const cRes = await authFetch(`/api/conversations/${id}`);
    const conv = cRes.ok ? await cRes.json() : null;

    if (conv && conv.activeModel) {
        state.serverConfig.activeModel = conv.activeModel;
        initializeModelUI();
    }

    clearPendingSave();
    await renderRightPane(conv);

    const mRes = await authFetch(`/api/messages?conversationId=${id}`);
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

        renderAssistantDrafts(id);

        // Reconstruct active background stream in UI if switching to a currently streaming conversation
        if (state.activeStreams[id]) {
            const activeStream = state.activeStreams[id];
            addStreamingBotMessage(activeStream.streamMsgId);
            if (activeStream.reasoning) {
                updateStreamingReasoning(activeStream.streamMsgId, activeStream.reasoning);
            }
            if (activeStream.content) {
                updateStreamingBotMessage(activeStream.streamMsgId, activeStream.content);
            }

            const stopBtn = document.getElementById('stop-btn');
            const sendBtn = document.getElementById('send-btn');
            const userInput = document.getElementById('user-input');
            if (stopBtn) stopBtn.classList.remove('hidden');
            if (sendBtn) sendBtn.classList.add('hidden');
            if (userInput) userInput.disabled = true;
        } else {
            const stopBtn = document.getElementById('stop-btn');
            const sendBtn = document.getElementById('send-btn');
            const userInput = document.getElementById('user-input');
            if (stopBtn) stopBtn.classList.add('hidden');
            if (sendBtn) sendBtn.classList.remove('hidden');
            if (userInput) userInput.disabled = false;
        }

        // Restore conversation draft if exists
        const userInput = document.getElementById('user-input');
        if (userInput) {
            const draft = localStorage.getItem(`loomscribe_draft_${id}`);
            userInput.value = draft || '';
            userInput.style.height = 'auto';
            userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
        }
    }
    
    scrollToBottom();
    await updateContinueButtonVisibility(activeMessages);

    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('active');
        const backdrop = document.getElementById('layout-backdrop');
        if (backdrop) {
            const rightPane = document.getElementById('right-pane');
            const isRightActive = rightPane && rightPane.classList.contains('active');
            if (!isRightActive) backdrop.classList.add('hidden');
        }
    }
}

// Spawn a new empty conversation
export async function createNewConversation(title = 'New Chat', presetId = null) {
    const selectedModel = state.serverConfig.activeModel || 'deepseek-v4-pro';

    let defaults = {};
    if (presetId) {
        try {
            const { getEnginePreset } = await import('../api.js');
            const p = await getEnginePreset(presetId);
            defaults = p.defaults || {};
        } catch (err) {
            console.error("Error fetching preset defaults on creation:", err);
        }
    }

    const res = await authFetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: title,
            activeModel: selectedModel,
            presetId: presetId || null,
            params: defaults,
            blockOverrides: {},
            directorNote: '',
            lastAppliedEngineSignature: ''
        })
    });

    if (!res.ok) {
        let errorMessage = `Failed to create conversation (${res.status})`;
        try {
            const errorData = await res.json();
            errorMessage = errorData?.error?.message || errorMessage;
        } catch {
            // Fall back to the HTTP status message.
        }
        showToast(errorMessage, 'error');
        throw new Error(errorMessage);
    }

    const newConv = await res.json();
    const newId = newConv.id;

    if (newId == null) {
        const errorMessage = 'Conversation creation returned an invalid id.';
        showToast(errorMessage, 'error');
        throw new Error(errorMessage);
    }

    state.currentConversationId = newId;
    localStorage.setItem('activeConversationId', newId);
    await renderRightPane(newConv);

    await loadConversations();

    const chatContainer = document.getElementById('chat-container');
    const container = chatContainer ? chatContainer.querySelector('.messages-container') : null;
    if (container) {
        container.innerHTML = '';
    }

    // Clear input area for the new conversation
    const userInput = document.getElementById('user-input');
    if (userInput) {
        userInput.value = '';
        userInput.style.height = 'auto';
    }

    scrollToBottom();
    await updateContinueButtonVisibility([]);

    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('active');
        const backdrop = document.getElementById('layout-backdrop');
        if (backdrop) {
            const rightPane = document.getElementById('right-pane');
            const isRightActive = rightPane && rightPane.classList.contains('active');
            if (!isRightActive) backdrop.classList.add('hidden');
        }
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
            
            await authFetch(`/api/conversations/${id}`, {
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

export function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const backdrop = document.getElementById('layout-backdrop');

    const updateBackdrop = () => {
        if (!backdrop) return;
        const rightPane = document.getElementById('right-pane');
        const isRightActive = rightPane && rightPane.classList.contains('active');
        const isSidebarActive = sidebar && sidebar.classList.contains('active');
        if (isRightActive || isSidebarActive) {
            backdrop.classList.remove('hidden');
        } else {
            backdrop.classList.add('hidden');
        }
    };

    // Toggle Sidebar on mobile viewports
    if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebar.classList.add('active');
            // Ensure right-pane is closed when sidebar opens on mobile
            const rightPane = document.getElementById('right-pane');
            if (rightPane) {
                rightPane.classList.add('collapsed');
                rightPane.classList.remove('active');
            }
            updateBackdrop();
        });
    }

    if (sidebarCloseBtn && sidebar) {
        sidebarCloseBtn.addEventListener('click', () => {
            sidebar.classList.remove('active');
            updateBackdrop();
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', () => {
            if (sidebar) {
                sidebar.classList.remove('active');
            }
            updateBackdrop();
        });
    }
}

/**
 * Initialises the New Chat flow: two steps.
 *   Step 1 — New Chat button opens the preset-picker-modal with context='newChat'.
 *   Step 2 — After preset selection, selectPreset() (right-pane.js) stores the id
 *             and opens new-chat-modal (title only).
 */
export function initNewChatModal() {
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const presetPickerModal = document.getElementById('preset-picker-modal');
    const presetSearchInput = document.getElementById('preset-search-input');
    const newChatModal = document.getElementById('new-chat-modal');
    const newChatModalCloseBtn = document.getElementById('new-chat-modal-close-btn');
    const newChatTitleInput = document.getElementById('new-chat-title-input');
    const startChatBtn = document.getElementById('start-chat-btn');

    // Step 1: New Chat button opens the preset picker in newChat mode
    if (clearChatBtn && presetPickerModal) {
        clearChatBtn.addEventListener('click', () => {
            state.presetPickerContext = 'newChat';
            state.modalSelectedPresetId = null;
            presetPickerModal.classList.remove('hidden');
            if (presetSearchInput) {
                presetSearchInput.value = '';
                presetSearchInput.focus();
            }
            // Populate the preset list via right-pane module
            import('./right-pane.js').then(m => m.renderPresetPickerList());
        });
    }

    // Step 2a: Close button on title modal
    if (newChatModalCloseBtn && newChatModal) {
        newChatModalCloseBtn.addEventListener('click', () => newChatModal.classList.add('hidden'));
    }
    if (newChatModal) {
        newChatModal.addEventListener('click', (e) => {
            if (e.target === newChatModal) newChatModal.classList.add('hidden');
        });
    }

    // Step 2b: Start Chat button creates the conversation
    if (startChatBtn) {
        startChatBtn.addEventListener('click', safeAsync(async () => {
            const title = newChatTitleInput?.value.trim() || 'New Chat';
            await createNewConversation(title, state.modalSelectedPresetId);
            newChatModal?.classList.add('hidden');
        }));
    }
}
