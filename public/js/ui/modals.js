import { authFetch } from '../auth.js';
import { state, escapeHtml } from '../state.js';
import { safeAsync, applyTheme } from './helpers.js';
import { updateKeyStatusUI } from './input.js';
import { loadConversations, switchConversation, createNewConversation } from './sidebar.js';

// Close Settings Modal
export function closeSettingsModal() {
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.classList.add('hidden');
    }
}

// Close delete confirmation modal
export function closeDeleteConfirmModal() {
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    if (deleteConfirmModal) {
        deleteConfirmModal.classList.add('hidden');
    }
    state.conversationIdToDelete = null;
    state.messageIdToDelete = null;
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

// Render custom models list in settings dialog
export function renderCustomModelsInSettings() {
    const container = document.getElementById('custom-models-list');
    if (!container) return;
    
    const customModels = state.serverConfig?.customModels || [];
    if (customModels.length === 0) {
        container.innerHTML = '<p class="section-placeholder" style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">No custom models configured yet.</p>';
        return;
    }
    
    container.innerHTML = customModels.map(m => `
        <div class="custom-model-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.02);">
            <div style="flex: 1; min-width: 0; margin-right: 12px;">
                <div style="font-weight: 600; font-size: 0.85rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.name)}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(m.model)}</div>
            </div>
            <button class="delete-custom-model-btn btn-danger" data-id="${m.id}" style="border: none; padding: 6px 10px; font-size: 0.75rem; border-radius: 6px; cursor: pointer; flex-shrink: 0;">Delete</button>
        </div>
    `).join('');
    
    // Bind delete handlers
    container.querySelectorAll('.delete-custom-model-btn').forEach(btn => {
        btn.addEventListener('click', safeAsync(async () => {
            const id = btn.getAttribute('data-id');
            const res = await authFetch(`/api/config/custom-models/${id}`, { method: 'DELETE' });
            if (res.ok) {
                state.serverConfig.customModels = state.serverConfig.customModels.filter(item => item.id !== id);
                renderCustomModelsInSettings();
                
                // Re-render main model selector dropdown
                const { renderModelDropdown } = await import('./input.js');
                renderModelDropdown();
                showToast('Custom model deleted.', 'success');
            } else {
                showToast('Failed to delete custom model.', 'error');
            }
        }));
    });
}

export function initSettingsModal() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const deleteKeyBtn = document.getElementById('delete-key-btn');
    const sidebar = document.getElementById('sidebar');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (apiKeyInput) {
                apiKeyInput.value = '';
                if (state.serverConfig?.hasKey) {
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
            
            // Highlight active theme option in modal
            const activeTheme = state.serverConfig?.theme || 'cyan';
            document.querySelectorAll('.theme-option-btn').forEach(btn => {
                if (btn.getAttribute('data-theme') === activeTheme) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Reset tabs to General when opened
            const tabButtons = settingsModal ? settingsModal.querySelectorAll('.settings-tab-btn') : [];
            const panels = settingsModal ? settingsModal.querySelectorAll('.settings-panel') : [];
            tabButtons.forEach((btn, idx) => {
                if (idx === 0) btn.classList.add('active');
                else btn.classList.remove('active');
            });
            panels.forEach((panel, idx) => {
                if (idx === 0) panel.classList.remove('hidden');
                else panel.classList.add('hidden');
            });

            if (settingsModal) {
                settingsModal.classList.remove('hidden');
                renderCustomModelsInSettings();
                apiKeyInput?.focus();
            }
            
            // Auto-close sidebar on mobile after clicking item
            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove('active');
            }
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeSettingsModal);
    }
    
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                closeSettingsModal();
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
            const res = await authFetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyVal })
            });
            if (res.ok) {
                const data = await res.json();
                Object.assign(state.serverConfig, data);
                updateKeyStatusUI();
                closeSettingsModal();
            } else {
                showToast('Failed to save API key to server.', 'error');
            }
        }));
    }

    if (deleteKeyBtn) {
        deleteKeyBtn.addEventListener('click', safeAsync(async () => {
            const res = await authFetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: "" })
            });
            if (res.ok) {
                const data = await res.json();
                Object.assign(state.serverConfig, data);
                if (apiKeyInput) apiKeyInput.value = '';
                updateKeyStatusUI();
                closeSettingsModal();
            } else {
                showToast('Failed to delete API key from server.', 'error');
            }
        }));
    }

    // Add Theme Button click listeners
    const themeButtons = document.querySelectorAll('.theme-option-btn');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', safeAsync(async () => {
            const chosenTheme = btn.getAttribute('data-theme');
            applyTheme(chosenTheme);
            
            // Update active state in UI
            themeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Save to state & cache
            state.serverConfig.theme = chosenTheme;
            localStorage.setItem('ls_theme', chosenTheme);

            // Send configuration to server
            const res = await authFetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: chosenTheme })
            });

            if (!res.ok) {
                showToast('Failed to save theme setting to server.', 'error');
            }
        }));
    });

    // Bind Add Custom Model form submission
    const addForm = document.getElementById('add-custom-model-form');
    if (addForm) {
        addForm.addEventListener('submit', safeAsync(async (e) => {
            e.preventDefault();
            const name = document.getElementById('add-model-name')?.value.trim();
            const endpoint = document.getElementById('add-model-endpoint')?.value.trim();
            const apiKey = document.getElementById('add-model-key')?.value.trim();
            const model = document.getElementById('add-model-identifier')?.value.trim();
            
            if (!name || !endpoint || !model) {
                showToast('Please fill out all required fields.', 'warning');
                return;
            }
            
            try {
                new URL(endpoint);
            } catch (urlErr) {
                showToast('Please enter a valid Endpoint URL.', 'warning');
                return;
            }
            
            const res = await authFetch('/api/config/custom-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, endpoint, apiKey, model })
            });
            
            if (res.ok) {
                const data = await res.json();
                state.serverConfig.customModels.push(data.model);
                renderCustomModelsInSettings();
                
                // Reset form inputs
                addForm.reset();
                
                // Re-render main model selector dropdown
                const { renderModelDropdown } = await import('./input.js');
                renderModelDropdown();
                showToast('Custom model added successfully.', 'success');
            } else {
                showToast('Failed to add custom model.', 'error');
            }
        }));
    }

    // Tabs switching logic
    const tabButtons = settingsModal ? settingsModal.querySelectorAll('.settings-tab-btn') : [];
    const panels = settingsModal ? settingsModal.querySelectorAll('.settings-panel') : [];

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            // Toggle active button state
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle panel visibility
            panels.forEach(p => {
                if (p.id === targetId) {
                    p.classList.remove('hidden');
                } else {
                    p.classList.add('hidden');
                }
            });
        });
    });
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
            await authFetch('/api/user-prompts', {
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
            if (state.conversationIdToDelete !== null) {
                const id = state.conversationIdToDelete;
                closeDeleteConfirmModal();

                // Clear draft from localStorage on delete
                localStorage.removeItem(`loomscribe_draft_${id}`);

                await authFetch(`/api/conversations/${id}`, {
                    method: 'DELETE'
                });
                
                if (state.currentConversationId === id) {
                    const cRes = await authFetch('/api/conversations');
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
            } else if (state.messageIdToDelete !== null) {
                const msgId = state.messageIdToDelete;
                closeDeleteConfirmModal();

                const res = await authFetch(`/api/messages/${msgId}/version-group`, {
                    method: 'DELETE'
                });
                
                if (res.ok) {
                    const { refreshConversationMessages } = await import('./chat.js');
                    showToast('Message deleted');
                    await refreshConversationMessages(true);
                } else {
                    const errText = await res.text();
                    showToast(`Failed to delete message: ${errText}`, 'error');
                }
            }
        }));
    }
}
