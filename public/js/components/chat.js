/**
 * chat.js — Chat Feed, Live Streaming Engine & Message Interactions
 */

import { state, setState, subscribe } from '../state.js';
import {
    getConversation,
    getMessages,
    createMessage,
    updateMessage,
    updateConversation,
    createMessageVersion,
    navigateMessageVersion,
    navigateTurn,
    deleteMessageVersionGroup,
    deactivateMessageTree,
    forkConversation
} from '../api.js';
import { sendGenerate, sendAbort, socketEvents } from '../socket.js';
import { renderMarkdown, escapeHtml } from '../markdown.js';
import { showToast } from './toast.js';
import { renderInspector } from './inspector.js';

let userScrolledUp = false;
let userScrolledReasoning = false;
let streamingMessageNode = null;
let currentStreamingContent = '';
let currentStreamingReasoning = '';
export function initChat() {
    const chatContainer = document.getElementById('chat-container');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-story-btn');
    const exportBtn = document.getElementById('export-chat-btn');
    const modelChipBtn = document.getElementById('active-model-chip');
    const thinkingChipBtn = document.getElementById('thinking-toggle-chip');
    const presetChipBtn = document.getElementById('active-preset-chip');
    const inspectorToggleBtn = document.getElementById('inspector-toggle-btn');
    const chatHeaderTitle = document.getElementById('chat-header-title');

    // Auto-scroll listener to detect manual scroll up
    if (chatContainer) {
        chatContainer.addEventListener('scroll', () => {
            const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
            userScrolledUp = distanceFromBottom > 60;
        });
    }

    // Auto-resize textarea as user types
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = `${Math.min(chatInput.scrollHeight, 200)}px`;
            updateSendButtonState();
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSendMessage();
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => handleStopGeneration());
    }

    if (continueBtn) {
        continueBtn.addEventListener('click', () => handleContinueGeneration());
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => handleExportChat());
    }

    if (inspectorToggleBtn) {
        inspectorToggleBtn.addEventListener('click', () => {
            toggleInspector();
        });
    }

    // Default inspector state on mobile is closed
    if (window.innerWidth <= 900) {
        toggleInspector(false);
    }

    if (presetChipBtn) {
        presetChipBtn.addEventListener('click', () => {
            import('./modals.js').then(m => m.openPresetPickerModal());
        });
    }

    if (thinkingChipBtn) {
        thinkingChipBtn.addEventListener('click', () => {
            const current = state.serverConfig.thinkingMode || 'enabled';
            const next = current === 'enabled' ? 'disabled' : 'enabled';
            import('../api.js').then(async ({ updateConfig }) => {
                try {
                    const cfg = await updateConfig({ thinkingMode: next });
                    setState('serverConfig', { ...state.serverConfig, thinkingMode: cfg.thinkingMode });
                    showToast(`Thinking mode ${next === 'enabled' ? 'enabled' : 'disabled'}`, 'info', 2000);
                } catch (err) {
                    showToast('Failed to toggle thinking mode', 'error');
                }
            });
        });
    }

    if (chatHeaderTitle) {
        chatHeaderTitle.addEventListener('click', () => {
            if (!state.currentConversationId) return;
            const currentTitle = state.activeConversation?.title || 'New Chat';
            const newTitle = prompt('Rename chat:', currentTitle);
            if (newTitle && newTitle.trim() && newTitle !== currentTitle) {
                updateConversation(state.currentConversationId, { title: newTitle.trim() }).then(updated => {
                    setState('activeConversation', updated);
                    const convs = state.conversations.map(c => c.id === updated.id ? { ...c, title: updated.title } : c);
                    setState('conversations', convs);
                    chatHeaderTitle.textContent = updated.title;
                    showToast('Chat renamed', 'success', 2000);
                }).catch(() => showToast('Failed to rename chat', 'error'));
            }
        });
    }
    // Initialize chat chips toggle (collapse/expand settings icon)
    initChatChipsToggle();

    // Subscribe to state changes
    subscribe('isStreaming', (streaming) => updateStreamingUI(streaming));
    subscribe('serverConfig', (config) => updateChipsUI(config));
    subscribe('activeConversation', (conv) => updateConversationHeader(conv));
    updateChipsUI(state.serverConfig);
    // Register WebSocket streaming handlers
    initSocketStreaming();
}

function initChatChipsToggle() {
    const chatSettingsBtn = document.getElementById('chat-settings-toggle-btn');
    const inputChips = document.getElementById('input-chips');
    if (!chatSettingsBtn || !inputChips) return;

    const savedState = localStorage.getItem('ls_chat_chips_expanded');
    let isExpanded = false;
    if (savedState !== null) {
        isExpanded = savedState === 'true';
    } else {
        // Default: collapse on mobile screens (<= 900px) to maximize vertical space
        isExpanded = window.innerWidth > 900;
    }

    const setVisibility = (expanded, persist = true) => {
        if (expanded) {
            inputChips.classList.remove('collapsed');
            chatSettingsBtn.classList.add('active');
            chatSettingsBtn.setAttribute('aria-expanded', 'true');
            chatSettingsBtn.setAttribute('title', 'Hide chat options');
        } else {
            inputChips.classList.add('collapsed');
            chatSettingsBtn.classList.remove('active');
            chatSettingsBtn.setAttribute('aria-expanded', 'false');
            chatSettingsBtn.setAttribute('title', 'Show chat options (model, thinking, presets)');
            // Close model dropdown if open
            const menu = document.getElementById('model-dropdown-menu');
            if (menu) menu.classList.add('hidden');
        }
        if (persist) {
            localStorage.setItem('ls_chat_chips_expanded', String(expanded));
        }
    };

    setVisibility(isExpanded, false);

    chatSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentlyExpanded = !inputChips.classList.contains('collapsed');
        setVisibility(!currentlyExpanded, true);
    });
}

export function toggleInspector(forceOpen = null) {
    const pane = document.getElementById('inspector-pane');
    const btn = document.getElementById('inspector-toggle-btn');
    const backdrop = document.getElementById('layout-backdrop');
    if (!pane) return;

    const isMobile = window.innerWidth <= 900;
    const currentlyOpen = isMobile
        ? pane.classList.contains('open')
        : !pane.classList.contains('collapsed');

    const nextOpen = forceOpen !== null ? forceOpen : !currentlyOpen;

    if (nextOpen) {
        pane.classList.remove('collapsed');
        pane.classList.add('open');
        if (btn) btn.classList.add('active');
        if (isMobile && backdrop) {
            backdrop.classList.add('active');
            // Close mobile sidebar if open
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('open');
        }
    } else {
        pane.classList.add('collapsed');
        pane.classList.remove('open');
        if (btn) btn.classList.remove('active');
        if (backdrop) {
            const sidebar = document.getElementById('sidebar');
            const sidebarOpen = sidebar && sidebar.classList.contains('open');
            if (!sidebarOpen) {
                backdrop.classList.remove('active');
            }
        }
    }
    setState('inspectorOpen', nextOpen);
}

export async function loadActiveConversation(convId) {
    if (!convId) {
        renderEmptyFeed();
        return;
    }

    try {
        const [conv, messages] = await Promise.all([
            getConversation(convId),
            getMessages(convId)
        ]);

        setState('activeConversation', conv);
        setState('allMessages', messages);

        // Filter active tree messages
        const activeMessages = messages.filter(m => m.isActive !== false);
        activeMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setState('activeMessages', activeMessages);

        renderMessagesList(activeMessages, messages);
        renderInspector(conv);
        updateContinueButton(activeMessages);
        scrollToBottom(true);
    } catch (err) {
        console.error('Failed to load conversation details:', err);
        showToast('Could not load chat history', 'error');
    }
}

function renderMessagesList(activeMessages, allMessages) {
    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    if (activeMessages.length === 0) {
        renderEmptyFeed();
        return;
    }

    listEl.innerHTML = '';

    activeMessages.forEach((msg) => {
        const msgNode = createMessageNode(msg, allMessages);
        listEl.appendChild(msgNode);
    });
}

function renderEmptyFeed() {
    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    const activePreset = state.enginePresets?.find(p => p.id === state.activeConversation?.presetId);
    const presetName = activePreset?.title || 'Creative Workspace';

    listEl.innerHTML = `
        <div class="chat-empty-state">
            <div class="empty-logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L6 12C6 15 9 18 9 22H15C15 18 18 15 18 12L12 2Z" />
                    <line x1="12" y1="2" x2="12" y2="11" />
                    <circle cx="12" cy="11" r="1.5" />
                </svg>
            </div>
            <h2 class="empty-title">LoomScribe</h2>
            <p class="empty-desc">Interactive narrative workspace & prompt engine. Select a preset or type a prompt to begin.</p>
            <div class="preset-starters">
                <div class="starter-card" data-preset="base_writer">
                    <div class="starter-title">Creative Storyteller</div>
                    <div class="starter-desc">Rich narrative prose with immersive sensory depth and natural dialogue.</div>
                </div>
                <div class="starter-card" data-preset="outline_mode">
                    <div class="starter-title">Plot & Outline Generator</div>
                    <div class="starter-desc">Structural chapter breakdowns, character arcs, and narrative pacing.</div>
                </div>
            </div>
        </div>
    `;

    listEl.querySelectorAll('.starter-card').forEach(card => {
        card.addEventListener('click', () => {
            const presetId = card.dataset.preset;
            if (presetId && state.currentConversationId) {
                updateConversation(state.currentConversationId, { presetId }).then(updated => {
                    setState('activeConversation', updated);
                    renderInspector(updated);
                    const chatInput = document.getElementById('chat-input');
                    if (chatInput) {
                        chatInput.focus();
                    }
                    showToast(`Preset updated to ${card.querySelector('.starter-title').textContent}`, 'info');
                });
            }
        });
    });
}

function createMessageNode(msg, allMessages = []) {
    const row = document.createElement('div');
    row.className = `msg-row ${msg.role}`;
    row.dataset.id = msg.id;

    if (msg.role === 'user') {
        const hasActiveAssistant = (allMessages || []).some(m => m.role === 'assistant' && String(m.parentMsgId) === String(msg.id) && m.isActive !== false);
        const versions = getTurnVersions(msg, allMessages);
        let versionNavHtml = '';
        if (!hasActiveAssistant && versions.total > 1) {
            versionNavHtml = `
                <div class="version-nav">
                    <button class="version-btn prev-ver-btn" ${versions.currentIndex <= 0 ? 'disabled' : ''} aria-label="Previous version">‹</button>
                    <span>${versions.currentIndex + 1} / ${versions.total}</span>
                    <button class="version-btn next-ver-btn" ${versions.currentIndex >= versions.total - 1 ? 'disabled' : ''} aria-label="Next version">›</button>
                </div>
            `;
        }
        row.innerHTML = `
            <div class="msg-bubble">
                <div class="user-content-text">${escapeHtml(msg.content)}</div>
            </div>
            <div class="msg-actions">
                ${versionNavHtml}
                <button class="action-btn retry-msg-btn" title="Retry / Regenerate response" aria-label="Retry">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                    <span>Retry</span>
                </button>
                <button class="action-btn edit-msg-btn" title="Edit and resend" aria-label="Edit message">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span>Edit</span>
                </button>
                <button class="action-btn copy-msg-btn" title="Copy" aria-label="Copy text">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                    </svg>
                    <span>Copy</span>
                </button>
                <button class="action-btn delete-msg-btn" title="Delete question and branches" aria-label="Delete question">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    <span>Delete</span>
                </button>
            </div>
        `;

        attachUserMessageEvents(row, msg, versions);
    } else {
        // Assistant Message
        let reasoningHtml = '';
        if (msg.reasoning) {
            reasoningHtml = `
                <div class="reasoning-box collapsed">
                    <div class="reasoning-header">
                        <div class="reasoning-label">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                            <span>Thought Process</span>
                        </div>
                        <svg class="reasoning-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="reasoning-content">${escapeHtml(msg.reasoning)}</div>
                </div>
            `;
        }

        // Versioning switcher info
        const versions = getTurnVersions(msg, allMessages);
        let versionNavHtml = '';
        if (versions.total > 1) {
            versionNavHtml = `
                <div class="version-nav">
                    <button class="version-btn prev-ver-btn" ${versions.currentIndex <= 0 ? 'disabled' : ''} aria-label="Previous version">‹</button>
                    <span>${versions.currentIndex + 1} / ${versions.total}</span>
                    <button class="version-btn next-ver-btn" ${versions.currentIndex >= versions.total - 1 ? 'disabled' : ''} aria-label="Next version">›</button>
                </div>
            `;
        }

        row.innerHTML = `
            <div class="msg-bubble">
                ${reasoningHtml}
                <div class="markdown-body">${renderMarkdown(msg.content)}</div>
            </div>
            <div class="msg-actions">
                ${versionNavHtml}
                <button class="action-btn edit-msg-btn" title="Edit bot message" aria-label="Edit message">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span>Edit</span>
                </button>
                <button class="action-btn copy-msg-btn" title="Copy response" aria-label="Copy response">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                    </svg>
                    <span>Copy</span>
                </button>
                <button class="action-btn retry-msg-btn" title="Regenerate alternative" aria-label="Regenerate">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                    <span>Retry</span>
                </button>
                <button class="action-btn fork-msg-btn" title="Fork chat from this point" aria-label="Fork chat">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>
                    </svg>
                    <span>Fork</span>
                </button>
                <button class="action-btn delete-ver-btn" title="${versions && versions.total > 1 ? 'Delete this version' : 'Delete message'}" aria-label="Delete message">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;

        attachAssistantMessageEvents(row, msg, versions);
    }

    return row;
}

function attachUserMessageEvents(row, msg, versions) {
    const retryBtn = row.querySelector('.retry-msg-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
            if (state.isStreaming) return;
            try {
                // Find direct child assistant response if any
                const directChildAssistant = state.activeMessages.find(m => m.parentMsgId === msg.id && m.role === 'assistant');
                if (directChildAssistant) {
                    const childRow = document.querySelector(`.msg-row[data-id="${directChildAssistant.id}"]`);
                    const treeData = await deactivateMessageTree(directChildAssistant.id);
                    await triggerGenerateResponse({
                        conversationId: state.currentConversationId,
                        parentMsgId: msg.id,
                        versionGroupId: treeData.versionGroupId || directChildAssistant.versionGroupId || directChildAssistant.id,
                        version: treeData.nextVersion,
                        replaceNode: childRow,
                        retriedMsgId: directChildAssistant.id
                    });
                } else {
                    // If no response yet or previous response was removed, regenerate from this prompt
                    await triggerGenerateResponse({
                        conversationId: state.currentConversationId,
                        parentMsgId: msg.id
                    });
                }
            } catch (err) {
                console.error('Failed to retry prompt response:', err);
                showToast('Failed to regenerate response', 'error');
            }
        });
    }

    const copyBtn = row.querySelector('.copy-msg-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(msg.content).then(() => {
                showToast('Message copied to clipboard', 'info', 1500);
            });
        });
    }
    const editBtn = row.querySelector('.edit-msg-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            enterUserInlineEdit(row, msg);
        });
    }

    const deleteBtn = row.querySelector('.delete-msg-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./modals.js').then(m => {
                m.openDeleteModal({
                    type: 'version-group',
                    id: msg.id,
                    role: 'user'
                });
            });
        });
    }
    // Version switcher navigation
    const prevVerBtn = row.querySelector('.prev-ver-btn');
    const nextVerBtn = row.querySelector('.next-ver-btn');

    if (prevVerBtn && versions) {
        prevVerBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (state.isStreaming) return;
            const target = versions.all[versions.currentIndex - 1];
            if (target) {
                try {
                    await navigateTurn({ userMsgId: target.userMsgId, assistantMsgId: target.assistantMsgId });
                    await loadActiveConversation(state.currentConversationId);
                } catch (err) {
                    console.error('Failed to switch to previous version:', err);
                    showToast('Failed to switch version', 'error');
                }
            }
        });
    }

    if (nextVerBtn && versions) {
        nextVerBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (state.isStreaming) return;
            const target = versions.all[versions.currentIndex + 1];
            if (target) {
                try {
                    await navigateTurn({ userMsgId: target.userMsgId, assistantMsgId: target.assistantMsgId });
                    await loadActiveConversation(state.currentConversationId);
                } catch (err) {
                    console.error('Failed to switch to next version:', err);
                    showToast('Failed to switch version', 'error');
                }
            }
        });
    }
}

function enterUserInlineEdit(row, msg) {
    const bubble = row.querySelector('.msg-bubble');
    if (!bubble) return;
    bubble.innerHTML = `
        <div class="inline-edit-box">
            <textarea class="inline-edit-textarea">${escapeHtml(msg.content)}</textarea>
            <div class="inline-edit-actions">
                <button class="btn btn-ghost cancel-edit-btn" type="button">Cancel</button>
                <button class="btn btn-primary save-resend-btn" type="button">Save & Resubmit</button>
            </div>
        </div>
    `;

    const textarea = bubble.querySelector('.inline-edit-textarea');
    const cancelBtn = bubble.querySelector('.cancel-edit-btn');
    const saveBtn = bubble.querySelector('.save-resend-btn');

    const adjustHeight = () => {
        const container = document.getElementById('chat-container');
        const prevScroll = container ? container.scrollTop : 0;

        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight + 4, 80)}px`;

        if (container && container.scrollTop !== prevScroll) {
            container.scrollTop = prevScroll;
        }
    };

    requestAnimationFrame(() => adjustHeight());
    textarea.addEventListener('input', adjustHeight);
    textarea.focus();
    textarea.selectionStart = textarea.value.length;

    cancelBtn.addEventListener('click', () => {
        bubble.innerHTML = `<div class="user-content-text">${escapeHtml(msg.content)}</div>`;
    });

    saveBtn.addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (!newText) return;

        try {
            // Create a new version of the user prompt and resubmit
            const newMsg = await createMessageVersion(msg.id, {
                content: newText,
                role: 'user'
            });
            await loadActiveConversation(state.currentConversationId);

            // Trigger AI response generation
            await triggerGenerateResponse({
                conversationId: state.currentConversationId,
                parentMsgId: newMsg.id
            });
        } catch (err) {
            console.error('Failed to edit and resend message:', err);
            showToast('Failed to resubmit message', 'error');
        }
    });
}

function enterAssistantInlineEdit(row, msg) {
    const bubble = row.querySelector('.msg-bubble');
    const markdownBody = bubble?.querySelector('.markdown-body');
    if (!bubble || !markdownBody) return;

    const originalContent = msg.content;

    markdownBody.innerHTML = `
        <div class="inline-edit-box" style="margin-top: 4px;">
            <textarea class="inline-edit-textarea">${escapeHtml(msg.content)}</textarea>
            <div class="inline-edit-actions">
                <button class="btn btn-ghost cancel-edit-btn" type="button">Cancel</button>
                <button class="btn btn-primary save-edit-btn" type="button">Save</button>
            </div>
        </div>
    `;

    const textarea = markdownBody.querySelector('.inline-edit-textarea');
    const cancelBtn = markdownBody.querySelector('.cancel-edit-btn');
    const saveBtn = markdownBody.querySelector('.save-edit-btn');

    const adjustHeight = () => {
        const container = document.getElementById('chat-container');
        const prevScroll = container ? container.scrollTop : 0;

        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight + 4, 80)}px`;

        if (container && container.scrollTop !== prevScroll) {
            container.scrollTop = prevScroll;
        }
    };

    requestAnimationFrame(() => adjustHeight());
    textarea.addEventListener('input', adjustHeight);
    textarea.focus();
    textarea.selectionStart = textarea.value.length;

    cancelBtn.addEventListener('click', () => {
        markdownBody.innerHTML = renderMarkdown(originalContent);
    });
    saveBtn.addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (!newText) return;

        try {
            await updateMessage(msg.id, { content: newText });
            msg.content = newText;
            const updatedActive = state.activeMessages.map(m => m.id === msg.id ? { ...m, content: newText } : m);
            setState('activeMessages', updatedActive);
            markdownBody.innerHTML = renderMarkdown(newText);
            showToast('Bot message updated', 'success', 1500);
        } catch (err) {
            console.error('Failed to update bot message:', err);
            showToast('Failed to update message', 'error');
        }
    });
}

function attachAssistantMessageEvents(row, msg, versions) {
    const reasoningBox = row.querySelector('.reasoning-box');
    if (reasoningBox) {
        const header = reasoningBox.querySelector('.reasoning-header');
        header.addEventListener('click', () => {
            reasoningBox.classList.toggle('collapsed');
        });
    }
    const editBtn = row.querySelector('.edit-msg-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            enterAssistantInlineEdit(row, msg);
        });
    }

    const copyBtn = row.querySelector('.copy-msg-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(msg.content).then(() => {
                showToast('Response copied to clipboard', 'info', 1500);
            });
        });
    }
    const retryBtn = row.querySelector('.retry-msg-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
            if (state.isStreaming) return;
            try {
                // Deactivate current tree & get next version number without creating duplicate DB records
                const treeData = await deactivateMessageTree(msg.id);

                await triggerGenerateResponse({
                    conversationId: state.currentConversationId,
                    parentMsgId: msg.parentMsgId,
                    versionGroupId: treeData.versionGroupId || msg.versionGroupId || msg.id,
                    version: treeData.nextVersion,
                    replaceNode: row,
                    retriedMsgId: msg.id
                });
            } catch (err) {
                console.error('Failed to retry version:', err);
                showToast('Failed to regenerate response', 'error');
            }
        });
    }

    const forkBtn = row.querySelector('.fork-msg-btn');
    if (forkBtn) {
        forkBtn.addEventListener('click', async () => {
            const title = `${state.activeConversation?.title || 'Chat'} (Fork)`;
            try {
                const forked = await forkConversation(state.currentConversationId, {
                    messageId: msg.id,
                    title
                });
                const updatedConvs = [forked, ...state.conversations];
                setState('conversations', updatedConvs);
                setState('currentConversationId', forked.id);
                await loadActiveConversation(forked.id);
                showToast('Chat forked successfully', 'success');
            } catch (err) {
                showToast('Failed to fork chat', 'error');
            }
        });
    }

    const deleteBtn = row.querySelector('.delete-ver-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            import('./modals.js').then(m => {
                m.openDeleteModal({
                    type: 'message',
                    id: msg.id,
                    isVersion: versions && versions.total > 1
                });
            });
        });
    }

    // Version switcher navigation
    const prevVerBtn = row.querySelector('.prev-ver-btn');
    const nextVerBtn = row.querySelector('.next-ver-btn');

    if (prevVerBtn && versions) {
        prevVerBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (state.isStreaming) return;
            const target = versions.all[versions.currentIndex - 1];
            if (target) {
                try {
                    await navigateTurn({ userMsgId: target.userMsgId, assistantMsgId: target.assistantMsgId });
                    await loadActiveConversation(state.currentConversationId);
                } catch (err) {
                    console.error('Failed to switch to previous version:', err);
                    showToast('Failed to switch version', 'error');
                }
            }
        });
    }

    if (nextVerBtn && versions) {
        nextVerBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (state.isStreaming) return;
            const target = versions.all[versions.currentIndex + 1];
            if (target) {
                try {
                    await navigateTurn({ userMsgId: target.userMsgId, assistantMsgId: target.assistantMsgId });
                    await loadActiveConversation(state.currentConversationId);
                } catch (err) {
                    console.error('Failed to switch to next version:', err);
                    showToast('Failed to switch version', 'error');
                }
            }
        });
    }
}

function getTurnVersions(msg, allMessages = []) {
    // 1. Identify the user message associated with this turn
    let userMsg = null;
    if (msg.role === 'user') {
        userMsg = msg;
    } else if (msg.role === 'assistant') {
        if (msg.parentMsgId != null) {
            userMsg = (allMessages || []).find(m => String(m.id) === String(msg.parentMsgId) && m.role === 'user');
        }
    }

    // 2. Find all user message versions in this turn's version group
    let userVersions = [];
    if (userMsg) {
        const userVGId = userMsg.versionGroupId || userMsg.id;
        userVersions = (allMessages || []).filter(m => m.role === 'user' && (
            (m.versionGroupId && String(m.versionGroupId) === String(userVGId)) ||
            String(m.id) === String(userVGId) ||
            (userMsg.versionGroupId && (String(m.id) === String(userMsg.versionGroupId) || String(m.versionGroupId) === String(userMsg.versionGroupId))) ||
            (m.versionGroupId && String(m.versionGroupId) === String(userMsg.id))
        )).sort((a, b) => (a.version || 1) - (b.version || 1) || (a.timestamp || 0) - (b.timestamp || 0));
    }

    // 3. Fallback for standalone / orphaned assistant messages
    if (userVersions.length === 0) {
        if (msg.role === 'assistant') {
            const asstVGId = msg.versionGroupId || msg.id;
            const asstVersions = (allMessages || []).filter(m => m.role === 'assistant' && (
                (m.versionGroupId && String(m.versionGroupId) === String(asstVGId)) ||
                String(m.id) === String(asstVGId)
            )).sort((a, b) => (a.version || 1) - (b.version || 1) || (a.timestamp || 0) - (b.timestamp || 0));

            const uniqueAsst = [];
            const seen = new Set();
            for (const v of asstVersions) {
                const verNum = v.version || 1;
                if (!seen.has(verNum)) {
                    seen.add(verNum);
                    uniqueAsst.push(v);
                }
            }

            const pairs = uniqueAsst.map(a => ({
                userMsgId: a.parentMsgId,
                assistantMsgId: a.id,
                userMsg: null,
                assistantMsg: a,
                timestamp: a.timestamp || a.id || 0
            }));
            const currIdx = pairs.findIndex(p => p.assistantMsgId === msg.id);
            return {
                total: pairs.length,
                currentIndex: currIdx >= 0 ? currIdx : 0,
                all: pairs
            };
        }
        return { total: 1, currentIndex: 0, all: [] };
    }

    // 4. Build combined turn pairs (userMsg, assistantMsg) across all prompt edits and response retries
    const pairs = [];
    const seenPairs = new Set();

    for (const u of userVersions) {
        const childAssistants = (allMessages || [])
            .filter(m => m.role === 'assistant' && String(m.parentMsgId) === String(u.id))
            .sort((a, b) => (a.version || 1) - (b.version || 1) || (a.timestamp || 0) - (b.timestamp || 0));

        if (childAssistants.length > 0) {
            for (const a of childAssistants) {
                const key = `${u.id}_${a.id}`;
                if (!seenPairs.has(key)) {
                    seenPairs.add(key);
                    pairs.push({
                        userMsgId: u.id,
                        assistantMsgId: a.id,
                        userMsg: u,
                        assistantMsg: a,
                        timestamp: a.timestamp || u.timestamp || a.id || u.id || 0
                    });
                }
            }
        } else {
            const hasOtherFilledVersions = userVersions.some(otherU =>
                (allMessages || []).some(m => m.role === 'assistant' && String(m.parentMsgId) === String(otherU.id))
            );
            if (userVersions.length === 1 || u.isActive !== false || !hasOtherFilledVersions) {
                const key = `${u.id}_null`;
                if (!seenPairs.has(key)) {
                    seenPairs.add(key);
                    pairs.push({
                        userMsgId: u.id,
                        assistantMsgId: null,
                        userMsg: u,
                        assistantMsg: null,
                        timestamp: u.timestamp || u.id || 0
                    });
                }
            }
        }
    }
    // Sort chronologically
    pairs.sort((a, b) => a.timestamp - b.timestamp);

    // 5. Determine current active index
    let currentIndex = -1;
    if (msg.role === 'assistant') {
        currentIndex = pairs.findIndex(p => p.assistantMsgId === msg.id);
    }
    if (currentIndex === -1 && userMsg) {
        currentIndex = pairs.findIndex(p => p.userMsgId === userMsg.id && p.assistantMsg && p.assistantMsg.isActive !== false);
        if (currentIndex === -1) {
            currentIndex = pairs.findIndex(p => p.userMsgId === userMsg.id);
        }
    }
    if (currentIndex === -1) {
        currentIndex = pairs.length > 0 ? pairs.length - 1 : 0;
    }

    return {
        total: pairs.length,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        all: pairs
    };
}

// ==========================================================================
// Send & Generate Actions
// ==========================================================================

export async function handleSendMessage() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput || state.isStreaming) return;

    const content = chatInput.value.trim();
    if (!content) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';
    updateSendButtonState();

    let convId = state.currentConversationId;
    if (!convId) {
        // Create new conversation first
        const autoTitle = buildAutoTitle(content);
        const newConv = await createConversation({
            title: autoTitle,
            activeModel: state.serverConfig?.activeModel || 'deepseek-v4-pro',
            presetId: state.enginePresets?.[0]?.id || null
        });
        convId = newConv.id;
        setState('conversations', [newConv, ...state.conversations]);
        setState('currentConversationId', convId);
        setState('activeConversation', newConv);
    }
    // Determine parentMsgId
    const lastActive = state.activeMessages[state.activeMessages.length - 1];
    const parentMsgId = lastActive ? lastActive.id : null;

    try {
        // Save user message to DB
        const userMsg = await createMessage({
            conversationId: convId,
            role: 'user',
            content,
            parentMsgId,
            isActive: true
        });

        // Update local active messages and render
        const updated = [...state.activeMessages, userMsg];
        setState('activeMessages', updated);
        appendMessageNode(userMsg);

        // Auto-title conversation if default title
        if (state.activeConversation?.title === 'New Chat' || !state.activeConversation?.title) {
            const autoTitle = buildAutoTitle(content);
            updateConversation(convId, { title: autoTitle }).then(updatedConv => {
                setState('activeConversation', updatedConv);
                const convs = state.conversations.map(c => c.id === convId ? { ...c, title: autoTitle } : c);
                setState('conversations', convs);
            }).catch(() => {});
        }
        // Trigger AI Generation
        await triggerGenerateResponse({
            conversationId: convId,
            parentMsgId: userMsg.id
        });
    } catch (err) {
        console.error('Failed to send user message:', err);
        showToast('Failed to send message', 'error');
    }
}

async function triggerGenerateResponse({ conversationId, parentMsgId, versionGroupId = null, version = 1, replaceNode = null, retriedMsgId = null }) {
    // Filter active messages to exclude the retried assistant message so prompt only includes history up to parent
    let messages = state.activeMessages;
    if (retriedMsgId) {
        messages = messages.filter(m => m.id !== retriedMsgId);
    }
    const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content
    }));

    // Create live streaming placeholder node in UI (replaces the retried node in-place if provided)
    currentStreamingContent = '';
    currentStreamingReasoning = '';
    createStreamingNode(replaceNode);
    scrollToBottom(true);

    try {
        sendGenerate({
            conversationId,
            model: state.serverConfig.activeModel,
            messages: apiMessages,
            thinking: { type: state.serverConfig.thinkingMode || 'enabled' },
            parentMsgId,
            versionGroupId,
            version
        });
    } catch (err) {
        showToast(err.message || 'Failed to start generation', 'error');
        removeStreamingNode();
    }
}

function handleStopGeneration() {
    if (!state.isStreaming || !state.currentConversationId) return;
    sendAbort(state.currentConversationId);
    showToast('Generation stopped', 'info', 1500);
}

function handleContinueGeneration() {
    if (state.isStreaming || !state.currentConversationId) return;
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = 'Continue writing the narrative smoothly from the exact point you left off.';
        handleSendMessage();
    }
}

function handleExportChat() {
    if (!state.activeConversation || state.activeMessages.length === 0) {
        showToast('No messages to export', 'warning');
        return;
    }

    let markdown = `# ${state.activeConversation.title || 'Conversation Export'}\n\n`;
    markdown += `*Exported from LoomScribe on ${new Date().toLocaleString()}*\n\n---\n\n`;

    state.activeMessages.forEach(msg => {
        const sender = msg.role === 'user' ? 'User' : 'Assistant';
        markdown += `### ${sender}\n\n`;
        if (msg.reasoning) {
            markdown += `> **Thought Process:**\n> ${msg.reasoning.replace(/\n/g, '\n> ')}\n\n`;
        }
        markdown += `${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.activeConversation.title || 'chat').replace(/[^a-z0-9_-]/gi, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export downloaded as Markdown', 'success');
}

// ==========================================================================
// WebSocket Streaming Handlers
// ==========================================================================

function initSocketStreaming() {
    socketEvents.subscribe((event) => {
        if (event.conversationId && event.conversationId !== state.currentConversationId) {
            return;
        }

        if (event.type === 'init') {
            currentStreamingContent = '';
            currentStreamingReasoning = '';
            createStreamingNode();
            scrollToBottom(true);
        } else if (event.type === 'token') {
            if (!streamingMessageNode) {
                createStreamingNode();
            }
            if (event.reasoning) {
                currentStreamingReasoning += event.reasoning;
                updateStreamingReasoning(currentStreamingReasoning);
            }
            if (event.content) {
                currentStreamingContent += event.content;
                updateStreamingContent(currentStreamingContent);
            }
            scrollToBottom();
        } else if (event.type === 'done') {
            finalizeStreaming(event.message);
        } else if (event.type === 'error') {
            handleStreamingError(event.error, event.message);
        }
    });
}

function createStreamingNode(replaceNode = null) {
    removeStreamingNode();

    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    // Remove empty state if present
    const emptyState = listEl.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = 'msg-row assistant streaming';
    row.id = 'active-streaming-node';

    row.innerHTML = `
        <div class="msg-bubble">
            <div class="reasoning-box hidden">
                <div class="reasoning-header">
                    <div class="reasoning-label">
                        <span class="reasoning-pulse"></span>
                        <span>Thinking...</span>
                    </div>
                    <svg class="reasoning-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
                <div class="reasoning-content"></div>
            </div>
            <div class="markdown-body">
                <span class="streaming-cursor">▋</span>
            </div>
        </div>
    `;

    if (replaceNode && replaceNode.parentNode) {
        replaceNode.replaceWith(row);
    } else {
        listEl.appendChild(row);
    }

    streamingMessageNode = row;
    userScrolledReasoning = false;

    const reasoningContent = row.querySelector('.reasoning-content');
    if (reasoningContent) {
        reasoningContent.addEventListener('scroll', () => {
            const distFromBottom = reasoningContent.scrollHeight - reasoningContent.scrollTop - reasoningContent.clientHeight;
            userScrolledReasoning = distFromBottom > 25;
        });
    }

    const reasoningHeader = row.querySelector('.reasoning-header');
    if (reasoningHeader) {
        reasoningHeader.addEventListener('click', () => {
            const box = row.querySelector('.reasoning-box');
            box?.classList.toggle('collapsed');
        });
    }
}

function updateStreamingReasoning(reasoning) {
    if (!streamingMessageNode) return;
    const box = streamingMessageNode.querySelector('.reasoning-box');
    const contentEl = streamingMessageNode.querySelector('.reasoning-content');
    if (box && contentEl) {
        box.classList.remove('hidden');
        contentEl.textContent = reasoning;
        if (!userScrolledReasoning) {
            contentEl.scrollTop = contentEl.scrollHeight;
        }
    }
}
function updateStreamingContent(content) {
    if (!streamingMessageNode) return;
    const body = streamingMessageNode.querySelector('.markdown-body');
    if (body) {
        body.innerHTML = renderMarkdown(content) + '<span class="streaming-cursor">▋</span>';
    }
}

async function finalizeStreaming(savedMessage) {
    if (streamingMessageNode) {
        streamingMessageNode.remove();
        streamingMessageNode = null;
    }
    await loadActiveConversation(state.currentConversationId);
    updateContinueButton(state.activeMessages);
    scrollToBottom(true);
}

function handleStreamingError(errorText, savedMessage) {
    showToast(errorText || 'Generation encountered an error', 'error', 4000);

    if (streamingMessageNode) {
        const body = streamingMessageNode.querySelector('.markdown-body');
        if (body) {
            body.innerHTML += `
                <div class="error-msg-banner" style="margin-top: 10px; color: var(--danger); font-size: 0.85rem;">
                    ⚠️ ${escapeHtml(errorText || 'Generation stopped with error')}
                </div>
            `;
        }
        streamingMessageNode.classList.remove('streaming');
    }

    if (savedMessage) {
        const updated = [...state.activeMessages, savedMessage];
        setState('activeMessages', updated);
    }
}

function removeStreamingNode() {
    if (streamingMessageNode) {
        streamingMessageNode.remove();
        streamingMessageNode = null;
    }
}

function appendMessageNode(msg) {
    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    const empty = listEl.querySelector('.chat-empty-state');
    if (empty) empty.remove();

    const node = createMessageNode(msg, state.allMessages);
    listEl.appendChild(node);
}

function scrollToBottom(force = false) {
    const container = document.getElementById('chat-container');
    if (!container) return;

    if (force || !userScrolledUp) {
        container.scrollTop = container.scrollHeight;
    }
}

function updateStreamingUI(isStreaming) {
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const chatInput = document.getElementById('chat-input');

    if (isStreaming) {
        if (sendBtn) sendBtn.classList.add('hidden');
        if (stopBtn) stopBtn.classList.remove('hidden');
        if (chatInput) chatInput.placeholder = 'Generating response...';
    } else {
        if (sendBtn) sendBtn.classList.remove('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');
        if (chatInput) chatInput.placeholder = 'Message Assistant or specify direction...';
    }
}

function updateSendButtonState() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    if (!chatInput || !sendBtn) return;

    const hasText = chatInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || state.isStreaming;
}

function updateConversationHeader(conv) {
    const titleEl = document.getElementById('chat-header-title');
    if (titleEl && conv) {
        titleEl.textContent = conv.title || 'New Chat';
    }

    const presetChip = document.getElementById('active-preset-chip');
    if (presetChip && conv) {
        const preset = state.enginePresets?.find(p => p.id === conv.presetId);
        const nameEl = presetChip.querySelector('.chip-name');
        if (nameEl) {
            nameEl.textContent = preset ? preset.title : 'No Preset';
        }
    }
}

function updateChipsUI(config) {
    const modelChip = document.getElementById('active-model-chip');
    const activeModel = config?.activeModel || '';

    if (modelChip && config) {
        const nameEl = modelChip.querySelector('.chip-name');
        if (nameEl) {
            const custom = config.customModels?.find(m => m.id === activeModel);
            if (custom) {
                nameEl.textContent = custom.name;
            } else if (activeModel) {
                nameEl.textContent = activeModel;
            } else if (config.hasOpenAIKey && config.openaiModels?.length > 0) {
                nameEl.textContent = config.openaiModels[0];
            } else if (config.hasKey || config.hasDeepSeekKey) {
                nameEl.textContent = 'DeepSeek V4 Pro';
            } else if (config.customModels && config.customModels.length > 0) {
                nameEl.textContent = config.customModels[0].name;
            } else {
                nameEl.textContent = 'Select Model';
            }
        }
    }

    const thinkingChip = document.getElementById('thinking-toggle-chip');
    if (thinkingChip) {
        const custom = config?.customModels?.find(m => m.id === activeModel);
        const isDeepSeek = activeModel === 'deepseek-v4-pro' || 
                           activeModel === 'deepseek-v4-flash' || 
                           (typeof activeModel === 'string' && activeModel.toLowerCase().startsWith('deepseek')) ||
                           (custom && (custom.name.toLowerCase().includes('deepseek') || custom.model.toLowerCase().includes('deepseek')));
        if (isDeepSeek) {
            thinkingChip.classList.remove('hidden');
            if (config?.thinkingMode === 'enabled') {
                thinkingChip.classList.add('active');
            } else {
                thinkingChip.classList.remove('active');
            }
        } else {
            thinkingChip.classList.add('hidden');
        }
    }
}

function updateContinueButton(activeMessages) {
    const continueBtn = document.getElementById('continue-story-btn');
    if (!continueBtn) return;

    if (activeMessages && activeMessages.length > 0) {
        const last = activeMessages[activeMessages.length - 1];
        if (last.role === 'assistant' && !state.isStreaming) {
            continueBtn.classList.remove('hidden');
            return;
        }
    }
    continueBtn.classList.add('hidden');
}

function buildAutoTitle(content) {
    if (!content) return 'New Chat';
    const cleaned = content.trim().replace(/\s+/g, ' ');
    return cleaned.slice(0, 100);
}
