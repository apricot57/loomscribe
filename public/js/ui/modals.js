import { state, escapeHtml } from '../state.js';
import { safeAsync } from './helpers.js';
import { updateKeyStatusUI } from './input.js';
import { loadConversations, switchConversation, createNewConversation } from './sidebar.js';

// Close API Key Modal
export function closeModal() {
    const keyModal = document.getElementById('key-modal');
    if (keyModal) {
        keyModal.classList.add('hidden');
    }
}

// Close delete confirmation modal
export function closeDeleteConfirmModal() {
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    if (deleteConfirmModal) {
        deleteConfirmModal.classList.add('hidden');
    }
    state.conversationIdToDelete = null;
}

// UX & Toast Notifications
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'error') icon = '❌';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    // Smooth fade-in
    setTimeout(() => {
        toast.classList.add('visible');
    }, 10);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

export function initKeyModal() {
    const keyBtn = document.getElementById('key-btn');
    const keyModal = document.getElementById('key-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const deleteKeyBtn = document.getElementById('delete-key-btn');
    const sidebar = document.getElementById('sidebar');

    if (keyBtn) {
        keyBtn.addEventListener('click', () => {
            if (apiKeyInput) {
                apiKeyInput.value = '';
                if (state.serverConfig.hasKey) {
                    apiKeyInput.placeholder = 'Key is configured (hidden for security)';
                } else {
                    apiKeyInput.placeholder = 'Paste sk-... key here';
                }
                apiKeyInput.type = 'password';
            }
            
            // Reset eye icon SVG to default closed state
            const eyeIcon = toggleKeyVisibility?.querySelector('.eye-icon');
            if (eyeIcon) {
                eyeIcon.innerHTML = `
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `;
            }
            
            if (keyModal) {
                keyModal.classList.remove('hidden');
                apiKeyInput?.focus();
            }
            
            // Auto-close sidebar on mobile after clicking item
            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove('active');
            }
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }
    
    if (keyModal) {
        keyModal.addEventListener('click', (e) => {
            if (e.target === keyModal) {
                closeModal();
            }
        });
    }

    if (toggleKeyVisibility && apiKeyInput) {
        toggleKeyVisibility.addEventListener('click', () => {
            const eyeIcon = toggleKeyVisibility.querySelector('.eye-icon');
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                if (eyeIcon) {
                    eyeIcon.innerHTML = `
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                        <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2"></line>
                    `;
                }
            } else {
                apiKeyInput.type = 'password';
                if (eyeIcon) {
                    eyeIcon.innerHTML = `
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    `;
                }
            }
        });
    }

    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', safeAsync(async () => {
            const keyVal = apiKeyInput?.value.trim();
            if (!keyVal) {
                showToast('Please enter a valid DeepSeek API key.', 'warning');
                return;
            }
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyVal })
            });
            if (res.ok) {
                const data = await res.json();
                state.serverConfig.hasKey = data.hasKey;
                state.serverConfig.activeModel = data.activeModel;
                updateKeyStatusUI();
                closeModal();
            } else {
                showToast('Failed to save API key to server.', 'error');
            }
        }));
    }

    if (deleteKeyBtn) {
        deleteKeyBtn.addEventListener('click', safeAsync(async () => {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: "" })
            });
            if (res.ok) {
                const data = await res.json();
                state.serverConfig.hasKey = data.hasKey;
                state.serverConfig.activeModel = data.activeModel;
                if (apiKeyInput) apiKeyInput.value = '';
                updateKeyStatusUI();
                closeModal();
            } else {
                showToast('Failed to delete API key from server.', 'error');
            }
        }));
    }
}

export function initPromptEditorModal() {
    const promptEditorModal = document.getElementById('prompt-editor-modal');
    const promptEditorCloseBtn = document.getElementById('prompt-editor-close-btn');
    const promptNameInput = document.getElementById('prompt-name-input');
    const promptCategoryInput = document.getElementById('prompt-category-input');
    const promptContentInput = document.getElementById('prompt-content-input');
    const savePromptBtn = document.getElementById('save-prompt-btn');

    if (promptEditorCloseBtn) {
        promptEditorCloseBtn.addEventListener('click', () => promptEditorModal?.classList.add('hidden'));
    }
    if (promptEditorModal) {
        promptEditorModal.addEventListener('click', (e) => {
            if (e.target === promptEditorModal) promptEditorModal.classList.add('hidden');
        });
    }

    if (savePromptBtn) {
        savePromptBtn.addEventListener('click', safeAsync(async () => {
            const name = promptNameInput?.value.trim();
            const category = promptCategoryInput?.value.trim();
            const content = promptContentInput?.value.trim();
            if (!name || !content) {
                showToast('Prompt name and content are required.', 'warning');
                return;
            }
            const payload = { name, category, content };
            if (state.editingPromptId) {
                payload.id = state.editingPromptId;
            }
            await fetch('/api/user-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            promptEditorModal?.classList.add('hidden');
            state.promptContentCache.clear();
        }));
    }
}

export function initDeleteModal() {
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    const deleteConfirmCloseBtn = document.getElementById('delete-confirm-close-btn');
    const deleteConfirmCancelBtn = document.getElementById('delete-confirm-cancel-btn');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

    if (deleteConfirmCloseBtn) {
        deleteConfirmCloseBtn.addEventListener('click', closeDeleteConfirmModal);
    }
    if (deleteConfirmCancelBtn) {
        deleteConfirmCancelBtn.addEventListener('click', closeDeleteConfirmModal);
    }
    if (deleteConfirmModal) {
        deleteConfirmModal.addEventListener('click', (e) => {
            if (e.target === deleteConfirmModal) closeDeleteConfirmModal();
        });
    }

    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener('click', safeAsync(async () => {
            if (state.conversationIdToDelete === null) return;
            const id = state.conversationIdToDelete;
            closeDeleteConfirmModal();

            await fetch(`/api/conversations/${id}`, {
                method: 'DELETE'
            });
            
            if (state.currentConversationId === id) {
                const cRes = await fetch('/api/conversations');
                const conversations = cRes.ok ? await cRes.json() : [];
                conversations.sort((a, b) => b.createdAt - a.createdAt);
                const latest = conversations[0];
                if (latest) {
                    await switchConversation(latest.id);
                    await loadConversations();
                } else {
                    await createNewConversation();
                }
            } else {
                await loadConversations();
            }
        }));
    }
}
