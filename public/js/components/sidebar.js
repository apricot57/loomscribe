/**
 * sidebar.js — Sidebar Navigation & Conversation Thread Management
 */

import { state, setState, subscribe } from '../state.js';
import { getConversations, createConversation, updateConversation } from '../api.js';
import { showToast } from './toast.js';
import { openDeleteModal } from './modals.js';
import { loadActiveConversation } from './chat.js';
import { escapeHtml } from '../markdown.js';

let searchQuery = '';

export function initSidebar() {
    const newChatBtn = document.getElementById('new-chat-btn');
    const searchInput = document.getElementById('conv-search-input');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const layoutBackdrop = document.getElementById('layout-backdrop');
    const settingsBtn = document.getElementById('settings-btn');

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => handleNewChat());
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderConversationList();
        });
    }

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => toggleSidebar());
    }

    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => toggleSidebar(false));
    }

    if (layoutBackdrop) {
        layoutBackdrop.addEventListener('click', () => {
            toggleSidebar(false);
            import('./chat.js').then(m => m.toggleInspector(false));
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            import('./modals.js').then(m => m.openSettingsModal());
        });
    }

    // Subscribe to state updates
    subscribe('conversations', () => renderConversationList());
    subscribe('currentConversationId', (id) => updateActiveHighlight(id));
    subscribe('serverConfig', (config) => updateKeyStatus(config));
    updateKeyStatus(state.serverConfig);
}

export function toggleSidebar(forceState = null) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('layout-backdrop');
    if (!sidebar) return;

    const isOpen = forceState !== null ? forceState : !sidebar.classList.contains('open');
    if (isOpen) {
        sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('active');
        // Close inspector if open on mobile
        import('./chat.js').then(m => m.toggleInspector(false));
    } else {
        sidebar.classList.remove('open');
        const inspector = document.getElementById('inspector-pane');
        const inspectorOpen = inspector && inspector.classList.contains('open');
        if (backdrop && !inspectorOpen) {
            backdrop.classList.remove('active');
        }
    }
    setState('sidebarOpen', isOpen);
}

export async function fetchAndLoadConversations(targetId = null) {
    try {
        const convs = await getConversations();
        convs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setState('conversations', convs);

        // Determine active conversation
        let activeId = targetId || state.currentConversationId;
        if (!activeId) {
            const savedIdStr = localStorage.getItem('activeConversationId');
            activeId = savedIdStr ? parseInt(savedIdStr, 10) : null;
        }

        const validActive = convs.find(c => c.id === activeId);
        if (validActive) {
            await selectConversation(validActive.id);
        } else if (convs.length > 0) {
            await selectConversation(convs[0].id);
        } else {
            // No conversations exist, create the initial new chat
            await handleNewChat(false);
        }
    } catch (err) {
        console.error('Failed to load conversations:', err);
        showToast('Failed to load conversation history', 'error');
    }
}

export async function selectConversation(id) {
    if (state.isStreaming && state.currentConversationId !== id) {
        showToast('Please wait or stop generation before switching chats', 'warning');
        return;
    }

    setState('currentConversationId', id);
    updateActiveHighlight(id);

    // On mobile, close the sidebar after selection
    if (window.innerWidth <= 900) {
        toggleSidebar(false);
    }

    await loadActiveConversation(id);
}

export async function handleNewChat(notify = true) {
    if (state.isStreaming) {
        showToast('Generation in progress. Stop before creating new chat.', 'warning');
        return;
    }

    try {
        // Pick default preset if available
        const defaultPreset = state.enginePresets?.length ? state.enginePresets[0].id : null;
        const newConv = await createConversation({
            title: 'New Chat',
            presetId: defaultPreset
        });

        const updated = [newConv, ...state.conversations];
        setState('conversations', updated);
        await selectConversation(newConv.id);

        if (notify) {
            showToast('New chat created', 'info', 2000);
        }
    } catch (err) {
        console.error('Failed to create new chat:', err);
        showToast('Could not create new chat', 'error');
    }
}

function renderConversationList() {
    const container = document.getElementById('sidebar-history');
    if (!container) return;

    const convs = state.conversations || [];
    let filtered = convs;

    if (searchQuery) {
        filtered = convs.filter(c => (c.title || '').toLowerCase().includes(searchQuery));
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 0.8rem;">
                ${searchQuery ? 'No chats match your search' : 'No recent chats'}
            </div>
        `;
        return;
    }

    // Chronological grouping
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const groups = {
        today: [],
        yesterday: [],
        previous7Days: [],
        older: []
    };

    filtered.forEach(c => {
        const time = c.createdAt || 0;
        const diff = now - time;
        if (diff < ONE_DAY) {
            groups.today.push(c);
        } else if (diff < 2 * ONE_DAY) {
            groups.yesterday.push(c);
        } else if (diff < 7 * ONE_DAY) {
            groups.previous7Days.push(c);
        } else {
            groups.older.push(c);
        }
    });

    let html = '';

    const groupDefs = [
        { key: 'today', label: 'Today' },
        { key: 'yesterday', label: 'Yesterday' },
        { key: 'previous7Days', label: 'Previous 7 Days' },
        { key: 'older', label: 'Older' }
    ];

    groupDefs.forEach(({ key, label }) => {
        const list = groups[key];
        if (list && list.length > 0) {
            html += `
                <div class="history-group">
                    <div class="group-label">${label}</div>
                    ${list.map(c => renderConvItem(c)).join('')}
                </div>
            `;
        }
    });

    container.innerHTML = html;
    attachConvItemListeners(container);
}

function renderConvItem(conv) {
    const isActive = conv.id === state.currentConversationId;
    return `
        <div class="conv-item ${isActive ? 'active' : ''}" data-id="${conv.id}">
            <div class="conv-info">
                <svg class="conv-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="conv-title" data-role="title">${escapeHtml(conv.title || 'Untitled')}</span>
            </div>
            <div class="conv-actions">
                <button class="conv-action-btn edit-btn" title="Rename" data-action="rename" aria-label="Rename chat">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="conv-action-btn delete-btn" title="Delete" data-action="delete" aria-label="Delete chat">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function attachConvItemListeners(container) {
    container.querySelectorAll('.conv-item').forEach(item => {
        const id = parseInt(item.dataset.id, 10);

        item.addEventListener('click', (e) => {
            if (e.target.closest('.conv-action-btn')) return;
            selectConversation(id);
        });

        const renameBtn = item.querySelector('[data-action="rename"]');
        if (renameBtn) {
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startInlineRename(item, id);
            });
        }

        const deleteBtn = item.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteModal({ type: 'conversation', id });
            });
        }
    });
}

function startInlineRename(item, id) {
    const titleSpan = item.querySelector('[data-role="title"]');
    if (!titleSpan) return;

    const currentTitle = titleSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'conv-title-edit-input';
    input.style.cssText = 'width: 100%; height: 24px; background: var(--bg-surface-elevated); border: 1px solid var(--border-hover); border-radius: 4px; color: var(--text-primary); padding: 0 4px; font-size: 0.85rem; outline: none;';

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = async (save) => {
        if (finished) return;
        finished = true;
        const newTitle = input.value.trim();
        if (save && newTitle && newTitle !== currentTitle) {
            try {
                await updateConversation(id, { title: newTitle });
                const convs = state.conversations.map(c => c.id === id ? { ...c, title: newTitle } : c);
                setState('conversations', convs);
                if (state.currentConversationId === id) {
                    const headerTitle = document.getElementById('chat-header-title');
                    if (headerTitle) headerTitle.textContent = newTitle;
                }
            } catch (err) {
                showToast('Failed to update chat title', 'error');
            }
        }
        renderConversationList();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
        }
    });

    input.addEventListener('blur', () => finish(true));
}

function updateActiveHighlight(activeId) {
    document.querySelectorAll('.conv-item').forEach(item => {
        const id = parseInt(item.dataset.id, 10);
        if (id === activeId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}
function updateKeyStatus(config) {
    const dot = document.getElementById('key-status-dot');
    if (!dot) return;

    const hasOpenAI = !!config?.hasOpenAIKey;
    const hasDeepSeek = !!(config?.hasDeepSeekKey || config?.hasKey);
    const hasGlm = !!config?.hasGlmKey;
    const hasOpenRouter = !!config?.hasOpenRouterKey;
    const hasCustom = (config?.customModels || []).length > 0;
    const isConfigured = hasOpenAI || hasDeepSeek || hasGlm || hasOpenRouter || hasCustom;

    if (isConfigured) {
        dot.classList.add('configured');
        dot.title = 'Model Provider configured';
    } else {
        dot.classList.remove('configured');
        dot.title = 'No models configured';
    }
}
