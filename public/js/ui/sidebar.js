import { state } from '../state.js';
import { fetchPromptContent } from '../api.js';
import { initializeModelUI } from './input.js';
import { updatePromptSelectorDisplay } from './prompts.js';
import {
    addMessageToUI,
    renderAssistantDrafts,
    scrollToBottom,
    updateContinueButtonVisibility
} from './chat.js';
import { showToast } from './modals.js';

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

        renderAssistantDrafts(id);
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
