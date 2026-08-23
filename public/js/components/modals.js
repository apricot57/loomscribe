/**
 * modals.js — Modal Dialogs: Settings, Preset Picker, Preset Manager & Confirmations
 */

import { state, setState, subscribe } from '../state.js';
import {
    getConfig,
    updateConfig,
    fetchOpenAIModels,
    addCustomModel,
    updateCustomModel,
    deleteCustomModel,
    getEnginePresets,
    getEnginePreset,
    createEnginePreset,
    updateEnginePreset,
    deleteEnginePreset,
    updateConversation,
    deleteConversation,
    deleteMessage,
    deleteMessageVersionGroup
} from '../api.js';
import { showToast } from './toast.js';
import { renderInspector } from './inspector.js';
import { escapeHtml } from '../markdown.js';

let activeSettingsTab = 'general';
let deleteTarget = null; // { type: 'conversation' | 'message', id: number }
let pmCurrentPresetId = null;
let pmIsNew = false;
let editingCustomModelId = null;
let cloningFromModelId = null;
export function initModals() {
    initSettingsModalEvents();
    initPresetPickerEvents();
    initPresetManagerEvents();
    initDeleteModalEvents();
}

// ==========================================================================
// Settings Modal
// ==========================================================================

export async function openSettingsModal(tab = 'general') {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    switchSettingsTab(tab);
    populateSettingsValues();

    try {
        const freshConfig = await getConfig();
        setState('serverConfig', freshConfig);
        populateSettingsValues();
    } catch (err) {}
}

export function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
}

function initSettingsModalEvents() {
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-modal-close-btn');
    const addModelForm = document.getElementById('add-custom-model-form');

    if (closeBtn) closeBtn.addEventListener('click', closeSettingsModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSettingsModal();
        });
    }

    // Tabs switching
    document.querySelectorAll('.settings-nav-item, .settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchSettingsTab(btn.dataset.tab);
        });
    });

    // --- OpenAI Key Save / Remove / Visibility ---
    const saveOpenAIBtn = document.getElementById('save-openai-key-btn');
    const removeOpenAIBtn = document.getElementById('remove-openai-key-btn');
    const toggleOpenAIBtn = document.getElementById('toggle-openai-key-visibility-btn');
    const fetchOpenAIBtn = document.getElementById('fetch-openai-models-btn');
    const addPinnedOpenAIBtn = document.getElementById('add-pinned-openai-btn');
    const pinnedInput = document.getElementById('add-pinned-openai-input');

    if (saveOpenAIBtn) {
        saveOpenAIBtn.addEventListener('click', async () => {
            const keyInput = document.getElementById('settings-openai-key-input');
            const key = keyInput?.value.trim();
            if (!key) {
                showToast('Please enter an OpenAI API key', 'warning');
                return;
            }
            try {
                const updated = await updateConfig({ openaiApiKey: key });
                setState('serverConfig', { 
                    ...state.serverConfig, 
                    hasOpenAIKey: updated.hasOpenAIKey,
                    hasKey: updated.hasKey,
                    openaiModels: updated.openaiModels,
                    pinnedOpenAIModels: updated.pinnedOpenAIModels
                });
                keyInput.value = '';
                showToast('OpenAI API Key saved', 'success');
                populateSettingsValues();
            } catch (err) {
                showToast('Failed to save OpenAI API key', 'error');
            }
        });
    }

    if (removeOpenAIBtn) {
        removeOpenAIBtn.addEventListener('click', async () => {
            if (!confirm('Remove OpenAI API key from server?')) return;
            try {
                const updated = await updateConfig({ openaiApiKey: '' });
                setState('serverConfig', { 
                    ...state.serverConfig, 
                    hasOpenAIKey: updated.hasOpenAIKey,
                    hasKey: updated.hasKey
                });
                showToast('OpenAI API Key removed', 'info');
                populateSettingsValues();
            } catch (err) {
                showToast('Failed to remove OpenAI API key', 'error');
            }
        });
    }

    if (toggleOpenAIBtn) {
        toggleOpenAIBtn.addEventListener('click', () => {
            const input = document.getElementById('settings-openai-key-input');
            if (input) input.type = input.type === 'password' ? 'text' : 'password';
        });
    }

    if (fetchOpenAIBtn) {
        fetchOpenAIBtn.addEventListener('click', async () => {
            fetchOpenAIBtn.disabled = true;
            fetchOpenAIBtn.innerHTML = `<span>Fetching...</span>`;
            try {
                const data = await fetchOpenAIModels();
                const models = data.models || [];
                setState('serverConfig', {
                    ...state.serverConfig,
                    openaiModels: models,
                    hasOpenAIKey: true
                });
                showToast(`Found ${models.length} active OpenAI models!`, 'success');
                populateSettingsValues();
            } catch (err) {
                showToast(err.message || 'Failed to fetch OpenAI models', 'error');
            } finally {
                fetchOpenAIBtn.disabled = false;
                fetchOpenAIBtn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    <span>Fetch Models</span>
                `;
            }
        });
    }

    const handleAddPinnedModel = async () => {
        if (!pinnedInput) return;
        const modelName = pinnedInput.value.trim();
        if (!modelName) return;
        const currentPinned = state.serverConfig?.pinnedOpenAIModels || [];
        if (currentPinned.includes(modelName)) {
            showToast(`Model ${modelName} is already pinned`, 'warning');
            return;
        }
        const updatedList = [...currentPinned, modelName];
        try {
            const res = await updateConfig({ pinnedOpenAIModels: updatedList });
            setState('serverConfig', {
                ...state.serverConfig,
                pinnedOpenAIModels: res.pinnedOpenAIModels || updatedList
            });
            pinnedInput.value = '';
            showToast(`Pinned model ${modelName} added`, 'success');
            populateSettingsValues();
        } catch (err) {
            showToast('Failed to pin model', 'error');
        }
    };

    if (addPinnedOpenAIBtn) {
        addPinnedOpenAIBtn.addEventListener('click', handleAddPinnedModel);
    }
    if (pinnedInput) {
        pinnedInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddPinnedModel();
            }
        });
    }

    // --- DeepSeek Key Save / Remove / Visibility ---
    const saveDeepSeekBtn = document.getElementById('save-deepseek-key-btn');
    const removeDeepSeekBtn = document.getElementById('remove-deepseek-key-btn');
    const toggleDeepSeekBtn = document.getElementById('toggle-deepseek-key-visibility-btn');

    if (saveDeepSeekBtn) {
        saveDeepSeekBtn.addEventListener('click', async () => {
            const keyInput = document.getElementById('settings-deepseek-key-input');
            const key = keyInput?.value.trim();
            if (!key) {
                showToast('Please enter a DeepSeek API key', 'warning');
                return;
            }
            try {
                const updated = await updateConfig({ apiKey: key });
                setState('serverConfig', { 
                    ...state.serverConfig, 
                    hasKey: updated.hasKey,
                    hasDeepSeekKey: updated.hasDeepSeekKey
                });
                keyInput.value = '';
                showToast('DeepSeek API Key saved', 'success');
                populateSettingsValues();
            } catch (err) {
                showToast('Failed to save DeepSeek API key', 'error');
            }
        });
    }

    if (removeDeepSeekBtn) {
        removeDeepSeekBtn.addEventListener('click', async () => {
            if (!confirm('Remove DeepSeek API key from server?')) return;
            try {
                const updated = await updateConfig({ apiKey: '' });
                setState('serverConfig', { 
                    ...state.serverConfig, 
                    hasKey: updated.hasKey,
                    hasDeepSeekKey: updated.hasDeepSeekKey
                });
                showToast('DeepSeek API Key removed', 'info');
                populateSettingsValues();
            } catch (err) {
                showToast('Failed to remove DeepSeek API key', 'error');
            }
        });
    }

    if (toggleDeepSeekBtn) {
        toggleDeepSeekBtn.addEventListener('click', () => {
            const input = document.getElementById('settings-deepseek-key-input');
            if (input) input.type = input.type === 'password' ? 'text' : 'password';
        });
    }

    // Custom Model Add/Edit Form
    const cancelModelBtn = document.getElementById('custom-model-cancel-btn');
    if (cancelModelBtn) {
        cancelModelBtn.addEventListener('click', () => {
            resetCustomModelForm();
        });
    }

    if (addModelForm) {
        addModelForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('custom-model-name')?.value.trim();
            const endpoint = document.getElementById('custom-model-endpoint')?.value.trim();
            const apiKey = document.getElementById('custom-model-key')?.value.trim();
            const model = document.getElementById('custom-model-identifier')?.value.trim();

            if (!name || !endpoint || !model) {
                showToast('Please fill all required model fields', 'warning');
                return;
            }

            try {
                if (editingCustomModelId) {
                    const res = await updateCustomModel(editingCustomModelId, { name, endpoint, apiKey, model });
                    const currentModels = state.serverConfig?.customModels || [];
                    const updatedModels = currentModels.map(m => m.id === editingCustomModelId ? { ...m, ...res.model } : m);
                    setState('serverConfig', { ...state.serverConfig, customModels: updatedModels });
                    showToast(`Custom model "${name}" updated`, 'success');
                } else {
                    const payload = { name, endpoint, apiKey, model };
                    if (cloningFromModelId) {
                        payload.cloneFromId = cloningFromModelId;
                    }
                    const res = await addCustomModel(payload);
                    if (res.model) {
                        const currentModels = state.serverConfig?.customModels || [];
                        const updatedModels = [...currentModels.filter(m => m.id !== res.model.id), res.model];
                        setState('serverConfig', { ...state.serverConfig, customModels: updatedModels });
                    } else {
                        const cfg = await getConfig();
                        setState('serverConfig', cfg);
                    }
                    showToast(cloningFromModelId ? `Custom model cloned as "${name}"` : `Custom model "${name}" added`, 'success');
                }
                renderCustomModelsList();
            } catch (err) {
                showToast(err.message || 'Failed to save custom model', 'error');
            }
        });
    }

    // Theme Chooser Buttons
    document.querySelectorAll('.theme-card-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const themeName = btn.dataset.theme;
            applyTheme(themeName);
            try {
                await updateConfig({ theme: themeName });
                setState('serverConfig', { ...state.serverConfig, theme: themeName });
                updateThemeButtonsActive(themeName);
                showToast(`Theme changed to ${themeName}`, 'info', 1500);
            } catch (err) {
                console.error('Failed to save theme:', err);
            }
        });
    });
}

function switchSettingsTab(tabName) {
    activeSettingsTab = tabName;
    document.querySelectorAll('.settings-nav-item, .settings-tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.settings-tab-panel').forEach(panel => {
        if (panel.id === `tab-panel-${tabName}`) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
}

function populateSettingsValues() {
    const config = state.serverConfig || {};

    // OpenAI Key Status
    const openaiStatusEl = document.getElementById('openai-key-status');
    if (openaiStatusEl) {
        if (config.hasOpenAIKey) {
            openaiStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--success); font-size:0.75rem; font-weight:500;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Configured</span>
                </div>
            `;
        } else {
            openaiStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--text-muted); font-size:0.75rem;">
                    <span>Missing</span>
                </div>
            `;
        }
    }

    // Pinned OpenAI Models Tags
    const pinnedContainer = document.getElementById('openai-pinned-tags');
    if (pinnedContainer) {
        const pinnedList = config.pinnedOpenAIModels || [];
        if (pinnedList.length === 0) {
            pinnedContainer.innerHTML = `<span style="font-size:0.72rem; color:var(--text-muted);">No pinned models yet (e.g. gpt-5.6).</span>`;
        } else {
            pinnedContainer.innerHTML = pinnedList.map(model => `
                <span class="pinned-tag">
                    <span>${escapeHtml(model)}</span>
                    <span class="pinned-tag-remove" data-model="${escapeHtml(model)}" title="Unpin model">✕</span>
                </span>
            `).join('');

            pinnedContainer.querySelectorAll('.pinned-tag-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const target = btn.dataset.model;
                    const updated = (config.pinnedOpenAIModels || []).filter(m => m !== target);
                    try {
                        const res = await updateConfig({ pinnedOpenAIModels: updated });
                        setState('serverConfig', { ...state.serverConfig, pinnedOpenAIModels: res.pinnedOpenAIModels || updated });
                        populateSettingsValues();
                        showToast(`Unpinned ${target}`, 'info', 1500);
                    } catch (err) {
                        showToast('Failed to unpin model', 'error');
                    }
                });
            });
        }
    }

    // OpenAI Models Count Status
    const countStatusEl = document.getElementById('openai-models-count-status');
    if (countStatusEl) {
        const discovered = config.openaiModels || [];
        if (discovered.length > 0) {
            countStatusEl.innerHTML = `⚡ <strong>${discovered.length}</strong> active models discovered (e.g. ${discovered.slice(0, 4).map(escapeHtml).join(', ')}${discovered.length > 4 ? ', ...' : ''})`;
        } else if (config.hasOpenAIKey) {
            countStatusEl.innerHTML = `Click "Fetch Models" above to query all available models for your API key.`;
        } else {
            countStatusEl.innerHTML = ``;
        }
    }

    // DeepSeek Key Status
    const deepseekStatusEl = document.getElementById('deepseek-key-status');
    if (deepseekStatusEl) {
        if (config.hasKey || config.hasDeepSeekKey) {
            deepseekStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--success); font-size:0.75rem; font-weight:500;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Configured</span>
                </div>
            `;
        } else {
            deepseekStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--text-muted); font-size:0.75rem;">
                    <span>Missing</span>
                </div>
            `;
        }
    }

    renderCustomModelsList();
    updateThemeButtonsActive(config.theme || 'cyan');
}

function renderCustomModelsList() {
    const container = document.getElementById('custom-models-list-container');
    if (!container) return;

    const models = state.serverConfig?.customModels || [];
    if (models.length === 0) {
        container.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted);">No custom models configured.</span>`;
        return;
    }

    container.innerHTML = models.map(m => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:var(--radius-md); background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); gap:8px;">
            <div style="min-width:0; flex:1;">
                <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(m.name)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(m.endpoint)} (${escapeHtml(m.model)})</div>
            </div>
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                <button class="icon-btn edit-custom-model-btn" data-id="${m.id}" title="Edit model" style="color:var(--text-secondary);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="icon-btn clone-custom-model-btn" data-id="${m.id}" title="Clone model" style="color:var(--text-secondary);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                    </svg>
                </button>
                <button class="icon-btn delete-custom-model-btn" data-id="${m.id}" title="Delete model" style="color:var(--danger);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');

    // Edit model handler
    // Edit model handler
    container.querySelectorAll('.edit-custom-model-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const model = (state.serverConfig?.customModels || []).find(m => m.id === id);
            if (!model) return;

            editingCustomModelId = id;
            cloningFromModelId = null;
            const nameInput = document.getElementById('custom-model-name');
            const endpointInput = document.getElementById('custom-model-endpoint');
            const keyInput = document.getElementById('custom-model-key');
            const identifierInput = document.getElementById('custom-model-identifier');
            const titleEl = document.getElementById('custom-model-form-title');
            const submitBtn = document.getElementById('custom-model-submit-btn');
            const cancelBtn = document.getElementById('custom-model-cancel-btn');
            const keyHint = document.getElementById('custom-model-key-hint');

            if (nameInput) nameInput.value = model.name || '';
            if (endpointInput) endpointInput.value = model.endpoint || '';
            if (keyInput) {
                keyInput.value = '';
                keyInput.placeholder = model.hasKey ? '•••••••• (Leave blank to keep existing key)' : 'Leave empty for local instances';
            }
            if (keyHint) {
                keyHint.innerHTML = model.hasKey ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Stored API key is preserved. Type a new key to replace it.</div>` : '';
            }
            if (identifierInput) identifierInput.value = model.model || '';
            if (titleEl) titleEl.textContent = 'Edit Custom Model';
            if (submitBtn) submitBtn.textContent = 'Save Changes';
            if (cancelBtn) cancelBtn.classList.remove('hidden');

            nameInput?.focus();
            nameInput?.select();
        });
    });

    // Clone model handler
    container.querySelectorAll('.clone-custom-model-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const model = (state.serverConfig?.customModels || []).find(m => m.id === id);
            if (!model) return;

            editingCustomModelId = null;
            cloningFromModelId = model.id;
            const nameInput = document.getElementById('custom-model-name');
            const endpointInput = document.getElementById('custom-model-endpoint');
            const keyInput = document.getElementById('custom-model-key');
            const identifierInput = document.getElementById('custom-model-identifier');
            const titleEl = document.getElementById('custom-model-form-title');
            const submitBtn = document.getElementById('custom-model-submit-btn');
            const cancelBtn = document.getElementById('custom-model-cancel-btn');
            const keyHint = document.getElementById('custom-model-key-hint');

            if (nameInput) nameInput.value = `${model.name} (Copy)`;
            if (endpointInput) endpointInput.value = model.endpoint || '';
            if (keyInput) {
                keyInput.value = '';
                keyInput.placeholder = model.hasKey ? 'API Key copied (Leave blank to preserve)' : 'Leave empty for local instances';
            }
            if (keyHint) {
                if (model.hasKey) {
                    keyHint.innerHTML = `
                        <div style="display:flex; align-items:center; gap:5px; font-size:0.75rem; color:var(--success); margin-top:3px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>API key copied from <strong>${escapeHtml(model.name)}</strong> (Leave blank to preserve)</span>
                        </div>
                    `;
                } else {
                    keyHint.innerHTML = '';
                }
            }
            if (identifierInput) identifierInput.value = model.model || '';
            if (titleEl) titleEl.textContent = 'Clone Custom Model';
            if (submitBtn) submitBtn.textContent = 'Clone & Add Model';
            if (cancelBtn) cancelBtn.classList.remove('hidden');

            nameInput?.focus();
            nameInput?.select();
        });
    });

    // Delete model handler
    container.querySelectorAll('.delete-custom-model-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            try {
                await deleteCustomModel(id);
                const currentModels = state.serverConfig?.customModels || [];
                const updatedModels = currentModels.filter(m => m.id !== id);
                setState('serverConfig', { ...state.serverConfig, customModels: updatedModels });
                if (editingCustomModelId === id) {
                    resetCustomModelForm();
                }
                renderCustomModelsList();
                showToast('Custom model removed', 'info');
            } catch (err) {
                showToast('Failed to delete custom model', 'error');
            }
        });
    });
}

function resetCustomModelForm() {
    editingCustomModelId = null;
    cloningFromModelId = null;
    document.getElementById('add-custom-model-form')?.reset();
    const titleEl = document.getElementById('custom-model-form-title');
    const submitBtn = document.getElementById('custom-model-submit-btn');
    const cancelBtn = document.getElementById('custom-model-cancel-btn');
    const keyHint = document.getElementById('custom-model-key-hint');
    const keyInput = document.getElementById('custom-model-key');

    if (titleEl) titleEl.textContent = 'Add Endpoint';
    if (submitBtn) submitBtn.textContent = 'Add Model';
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (keyHint) keyHint.innerHTML = '';
    if (keyInput) keyInput.placeholder = 'Leave empty for local instances';
}
export function applyTheme(themeName) {
    const valid = ['cyan', 'teal', 'purple', 'amber', 'slate'];
    const activeTheme = valid.includes(themeName) ? themeName : 'cyan';

    valid.forEach(t => {
        document.documentElement.classList.remove(`theme-${t}`);
        document.body.classList.remove(`theme-${t}`);
    });

    document.documentElement.classList.add(`theme-${activeTheme}`);
    document.body.classList.add(`theme-${activeTheme}`);
    localStorage.setItem('ls_theme', activeTheme);
}

function updateThemeButtonsActive(themeName) {
    document.querySelectorAll('.theme-card-btn').forEach(btn => {
        if (btn.dataset.theme === themeName) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

// ==========================================================================
// Preset Picker Modal
// ==========================================================================

let activePickerCategory = 'all';

function formatCategoryTitle(cat) {
    if (!cat) return 'General';
    return cat
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

export function openPresetPickerModal() {
    const modal = document.getElementById('preset-picker-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    renderPresetPickerGrid();
}

export function closePresetPickerModal() {
    const modal = document.getElementById('preset-picker-modal');
    if (modal) modal.classList.add('hidden');
}

function initPresetPickerEvents() {
    const modal = document.getElementById('preset-picker-modal');
    const closeBtn = document.getElementById('preset-picker-close-btn');
    const searchInput = document.getElementById('preset-picker-search');
    const manageBtn = document.getElementById('picker-manage-presets-btn');

    if (closeBtn) closeBtn.addEventListener('click', closePresetPickerModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closePresetPickerModal();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderPresetPickerGrid(e.target.value.trim().toLowerCase());
        });
    }

    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            closePresetPickerModal();
            openPresetManagerModal();
        });
    }
}

function renderPresetPickerGrid(query = '') {
    const container = document.getElementById('preset-picker-grid');
    const tabsContainer = document.getElementById('preset-category-tabs');
    if (!container) return;

    const allPresets = state.enginePresets || [];

    // Extract all unique categories and counts
    const categoryCounts = {};
    allPresets.forEach(p => {
        const cat = p.category || 'general';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const uniqueCategories = Object.keys(categoryCounts).sort();

    // Render Category Filter Tabs
    if (tabsContainer) {
        let tabsHtml = `
            <button class="category-tab-chip ${activePickerCategory === 'all' ? 'active' : ''}" data-cat="all" type="button">
                <span>All</span>
                <span class="tab-badge">${allPresets.length}</span>
            </button>
        `;
        uniqueCategories.forEach(cat => {
            tabsHtml += `
                <button class="category-tab-chip ${activePickerCategory === cat ? 'active' : ''}" data-cat="${cat}" type="button">
                    <span>${formatCategoryTitle(cat)}</span>
                    <span class="tab-badge">${categoryCounts[cat]}</span>
                </button>
            `;
        });
        tabsContainer.innerHTML = tabsHtml;

        tabsContainer.querySelectorAll('.category-tab-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                activePickerCategory = chip.dataset.cat;
                renderPresetPickerGrid(query);
            });
        });
    }

    // Filter presets
    let filtered = allPresets;
    if (activePickerCategory !== 'all') {
        filtered = filtered.filter(p => (p.category || 'general') === activePickerCategory);
    }

    if (query) {
        filtered = filtered.filter(p =>
            (p.title || '').toLowerCase().includes(query) ||
            (p.description || '').toLowerCase().includes(query) ||
            (p.category || '').toLowerCase().includes(query)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:0.85rem;">No presets found matching current filter</div>`;
        return;
    }

    // Group by category
    const grouped = {};
    filtered.forEach(p => {
        const cat = p.category || 'general';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    let sectionsHtml = '';

    // If searching or in 'all' / 'general', show the "None / Default" preset option
    const showNone = activePickerCategory === 'all' || activePickerCategory === 'general' || (query && ('none'.includes(query) || 'standard'.includes(query) || 'default'.includes(query)));
    if (showNone) {
        const isNoneActive = !state.activeConversation?.presetId;
        sectionsHtml += `
            <div class="preset-category-section">
                <div class="preset-category-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="category-section-title">Standard / Default</span>
                    </div>
                    <div class="category-section-divider"></div>
                </div>
                <div class="preset-starters">
                    <div class="starter-card preset-picker-item ${isNoneActive ? 'selected' : ''}" data-id="none" style="${isNoneActive ? 'border-color:var(--accent); background:var(--accent-subtle);' : ''}">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                            <span class="starter-title">None (Standard Chat)</span>
                            <span class="preset-badge-cat" style="background:rgba(255,255,255,0.06); color:var(--text-muted); border-color:var(--border-subtle);">No Preset</span>
                        </div>
                        <div class="starter-desc">Standard AI assistant with no scenario-specific prompt instructions or block overrides.</div>
                    </div>
                </div>
            </div>
        `;
    }

    for (const cat of Object.keys(grouped).sort()) {
        const list = grouped[cat];
        sectionsHtml += `
            <div class="preset-category-section">
                <div class="preset-category-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="category-section-title">${formatCategoryTitle(cat)}</span>
                        <span class="category-badge-count">${list.length}</span>
                    </div>
                    <div class="category-section-divider"></div>
                </div>
                <div class="preset-starters">
                    ${list.map(p => {
                        const isCurrent = state.activeConversation?.presetId === p.id;
                        return `
                            <div class="starter-card preset-picker-item ${isCurrent ? 'selected' : ''}" data-id="${p.id}" style="${isCurrent ? 'border-color:var(--accent); background:var(--accent-subtle);' : ''}">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                                    <span class="starter-title">${escapeHtml(p.title)}</span>
                                    <span class="preset-badge-cat">${formatCategoryTitle(p.category || 'General')}</span>
                                </div>
                                <div class="starter-desc">${escapeHtml(p.description || '')}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = sectionsHtml;

    container.querySelectorAll('.preset-picker-item').forEach(card => {
        card.addEventListener('click', async () => {
            const presetId = card.dataset.id;
            if (!state.currentConversationId) return;

            if (presetId === 'none') {
                try {
                    const updated = await updateConversation(state.currentConversationId, {
                        presetId: null,
                        params: {},
                        blockOverrides: {},
                        directorNote: ''
                    });
                    setState('activeConversation', updated);
                    renderInspector(updated);
                    closePresetPickerModal();
                    showToast('Preset cleared (Standard Chat)', 'info');
                } catch (err) {
                    showToast('Failed to clear preset', 'error');
                }
                return;
            }

            const chosen = state.enginePresets?.find(p => p.id === presetId);
            if (!chosen) return;

            try {
                const updated = await updateConversation(state.currentConversationId, {
                    presetId,
                    params: { ...(chosen.defaults || {}) }
                });
                setState('activeConversation', updated);
                renderInspector(updated);
                closePresetPickerModal();
                showToast(`Applied preset: ${chosen.title}`, 'success');
            } catch (err) {
                showToast('Failed to apply preset', 'error');
            }
        });
    });
}
// ==========================================================================
// Preset Manager Modal (CRUD + JSON Import / Export)
// ==========================================================================

export function openPresetManagerModal() {
    const modal = document.getElementById('preset-manager-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    renderPresetManagerList();
    resetPresetManagerEditor();
}

export function closePresetManagerModal() {
    const modal = document.getElementById('preset-manager-modal');
    if (modal) modal.classList.add('hidden');
}

function initPresetManagerEvents() {
    const modal = document.getElementById('preset-manager-modal');
    const closeBtn = document.getElementById('preset-manager-close-btn');
    const newBtn = document.getElementById('pm-new-preset-btn');
    const saveBtn = document.getElementById('pm-save-btn');
    const deleteBtn = document.getElementById('pm-delete-btn');
    const exportBtn = document.getElementById('pm-export-btn');
    const importInput = document.getElementById('pm-import-file-input');
    const importDropzone = document.getElementById('pm-import-dropzone');
    const searchInput = document.getElementById('pm-search-input');
    const sysBody = document.getElementById('pm-field-system-body');

    if (closeBtn) closeBtn.addEventListener('click', closePresetManagerModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closePresetManagerModal();
        });
    }

    if (newBtn) {
        newBtn.addEventListener('click', () => startNewPresetInManager());
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => handleSavePreset());
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeletePreset());
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => handleExportPreset());
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderPresetManagerList(e.target.value.trim().toLowerCase());
        });
    }

    if (sysBody) {
        sysBody.addEventListener('input', () => {
            updateWordCountIndicator(sysBody.value);
        });
    }

    // Import file handler
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
        });
    }

    if (importDropzone) {
        importDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            importDropzone.classList.add('dragover');
        });
        importDropzone.addEventListener('dragleave', () => {
            importDropzone.classList.remove('dragover');
        });
        importDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            importDropzone.classList.remove('dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file) handleImportFile(file);
        });
    }
}

function renderPresetManagerList(query = '') {
    const listEl = document.getElementById('pm-presets-scroll-list');
    if (!listEl) return;

    let presets = state.enginePresets || [];
    if (query) {
        presets = presets.filter(p => (p.title || '').toLowerCase().includes(query) || (p.id || '').toLowerCase().includes(query) || (p.category || '').toLowerCase().includes(query));
    }

    if (presets.length === 0) {
        listEl.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted); padding:10px;">No presets found</span>`;
        return;
    }

    // Group by category
    const grouped = {};
    presets.forEach(p => {
        const cat = p.category || 'general';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    let html = '';
    for (const cat of Object.keys(grouped).sort()) {
        const list = grouped[cat];
        html += `
            <div class="pm-category-section" style="display:flex; flex-direction:column; gap:2px; margin-bottom:8px;">
                <div class="group-label" style="padding:4px 8px; font-size:0.68rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">${formatCategoryTitle(cat)}</div>
                ${list.map(p => `
                    <div class="conv-item pm-list-item ${p.id === pmCurrentPresetId ? 'active' : ''}" data-id="${p.id}" style="padding:6px 8px;">
                        <div class="conv-info">
                            <span class="conv-title" style="font-size:0.8rem;">${escapeHtml(p.title || p.id)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.pm-list-item').forEach(item => {
        item.addEventListener('click', () => {
            loadPresetIntoManager(item.dataset.id);
        });
    });
}

async function loadPresetIntoManager(id) {
    try {
        const preset = await getEnginePreset(id);
        pmCurrentPresetId = id;
        pmIsNew = false;

        document.getElementById('pm-editor-empty')?.classList.add('hidden');
        document.getElementById('pm-editor-form')?.classList.remove('hidden');
        document.getElementById('pm-delete-btn')?.classList.remove('hidden');
        document.getElementById('pm-export-btn')?.classList.remove('hidden');

        const idField = document.getElementById('pm-field-id');
        if (idField) {
            idField.value = preset.id;
            idField.disabled = true;
        }

        setValue('pm-field-title', preset.title || '');
        setValue('pm-field-category', preset.category || '');
        setValue('pm-field-description', preset.description || '');
        setValue('pm-field-system-body', preset.system_body || '');
        setValue('pm-field-post-history', preset.post_history_body || '');

        updateWordCountIndicator(preset.system_body || '');
        renderPresetManagerList();
    } catch (err) {
        showToast('Failed to load preset', 'error');
    }
}

function startNewPresetInManager() {
    pmCurrentPresetId = null;
    pmIsNew = true;

    document.getElementById('pm-editor-empty')?.classList.add('hidden');
    document.getElementById('pm-editor-form')?.classList.remove('hidden');
    document.getElementById('pm-delete-btn')?.classList.add('hidden');
    document.getElementById('pm-export-btn')?.classList.add('hidden');

    const idField = document.getElementById('pm-field-id');
    if (idField) {
        idField.value = '';
        idField.disabled = false;
        idField.focus();
    }

    setValue('pm-field-title', '');
    setValue('pm-field-category', 'general');
    setValue('pm-field-description', '');
    setValue('pm-field-system-body', '');
    setValue('pm-field-post-history', '');

    updateWordCountIndicator('');
    renderPresetManagerList();
}

function resetPresetManagerEditor() {
    pmCurrentPresetId = null;
    pmIsNew = false;
    document.getElementById('pm-editor-empty')?.classList.remove('hidden');
    document.getElementById('pm-editor-form')?.classList.add('hidden');
}

async function handleSavePreset() {
    const id = document.getElementById('pm-field-id')?.value.trim();
    const title = document.getElementById('pm-field-title')?.value.trim();
    const category = document.getElementById('pm-field-category')?.value.trim();
    const description = document.getElementById('pm-field-description')?.value.trim();
    const system_body = document.getElementById('pm-field-system-body')?.value.trim();
    const post_history_body = document.getElementById('pm-field-post-history')?.value.trim();

    if (!id || !title) {
        showToast('ID and Title are required', 'warning');
        return;
    }

    if (!/^[a-z0-9_]+$/.test(id)) {
        showToast('Preset ID must be lowercase letters, numbers, or underscores', 'warning');
        return;
    }

    const payload = {
        id,
        title,
        category: category || 'general',
        description: description || '',
        system_body: system_body || '',
        post_history_body: post_history_body || ''
    };

    try {
        if (pmIsNew) {
            await createEnginePreset(payload);
            showToast(`Preset "${title}" created`, 'success');
        } else {
            await updateEnginePreset(id, payload);
            showToast(`Preset "${title}" updated`, 'success');
        }

        // Refresh global presets list
        const updatedList = await getEnginePresets();
        setState('enginePresets', updatedList);
        pmCurrentPresetId = id;
        pmIsNew = false;
        renderPresetManagerList();
    } catch (err) {
        showToast(err.message || 'Failed to save preset', 'error');
    }
}

async function handleDeletePreset() {
    if (!pmCurrentPresetId) return;

    if (!confirm(`Are you sure you want to delete preset "${pmCurrentPresetId}"?`)) return;

    try {
        await deleteEnginePreset(pmCurrentPresetId);
        showToast('Preset deleted', 'info');
        const updatedList = await getEnginePresets();
        setState('enginePresets', updatedList);
        resetPresetManagerEditor();
        renderPresetManagerList();
    } catch (err) {
        if (err.usedInConversations) {
            if (confirm(`${err.message}\nForce delete anyway?`)) {
                try {
                    await deleteEnginePreset(pmCurrentPresetId, true);
                    showToast('Preset force deleted', 'info');
                    const updatedList = await getEnginePresets();
                    setState('enginePresets', updatedList);
                    resetPresetManagerEditor();
                    renderPresetManagerList();
                } catch (e) {
                    showToast('Failed to force delete preset', 'error');
                }
            }
        } else {
            showToast(err.message || 'Failed to delete preset', 'error');
        }
    }
}

function handleExportPreset() {
    if (!pmCurrentPresetId) return;
    const preset = state.enginePresets?.find(p => p.id === pmCurrentPresetId);
    if (!preset) return;

    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Preset exported as ${preset.id}.json`, 'success');
}

function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.id || !data.title) {
                showToast('Invalid preset JSON structure (missing id or title)', 'error');
                return;
            }

            startNewPresetInManager();
            setValue('pm-field-id', data.id);
            setValue('pm-field-title', data.title);
            setValue('pm-field-category', data.category || 'general');
            setValue('pm-field-description', data.description || '');
            setValue('pm-field-system-body', data.system_body || '');
            setValue('pm-field-post-history', data.post_history_body || '');
            updateWordCountIndicator(data.system_body || '');
            showToast(`Preset "${data.title}" imported into editor. Click Save to persist.`, 'info');
        } catch (err) {
            showToast('Could not parse JSON file', 'error');
        }
    };
    reader.readAsText(file);
}

function updateWordCountIndicator(text) {
    const countEl = document.getElementById('pm-word-count-badge');
    if (!countEl) return;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    countEl.textContent = `${words} words`;
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

// ==========================================================================
// Delete Confirmation Modal
// ==========================================================================

export function openDeleteModal(target) {
    deleteTarget = target;
    const modal = document.getElementById('delete-modal');
    const descEl = document.getElementById('delete-modal-desc');

    if (descEl) {
        if (target.type === 'conversation') {
            descEl.textContent = 'Are you sure you want to delete this chat thread? All messages and branch versions inside it will be permanently removed.';
        } else if (target.type === 'version-group' || target.role === 'user') {
            descEl.textContent = 'Are you sure you want to delete this question and all its versions, responses, and branches?';
        } else if (target.isVersion) {
            descEl.textContent = 'Are you sure you want to delete this message version?';
        } else {
            descEl.textContent = 'Are you sure you want to delete this message?';
        }
    }

    if (modal) modal.classList.remove('hidden');
}

export function closeDeleteModal() {
    deleteTarget = null;
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.add('hidden');
}

function initDeleteModalEvents() {
    const modal = document.getElementById('delete-modal');
    const closeBtn = document.getElementById('delete-modal-close-btn');
    const cancelBtn = document.getElementById('delete-modal-cancel-btn');
    const confirmBtn = document.getElementById('delete-modal-confirm-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeDeleteModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeleteModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDeleteModal();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!deleteTarget) return;

            try {
                if (deleteTarget.type === 'conversation') {
                    await deleteConversation(deleteTarget.id);
                    const updated = state.conversations.filter(c => c.id !== deleteTarget.id);
                    setState('conversations', updated);

                    if (state.currentConversationId === deleteTarget.id) {
                        const next = updated.length > 0 ? updated[0].id : null;
                        setState('currentConversationId', next);
                        import('./sidebar.js').then(m => m.fetchAndLoadConversations(next));
                    }
                    showToast('Chat deleted', 'info');
                } else if (deleteTarget.type === 'version-group' || deleteTarget.role === 'user') {
                    await deleteMessageVersionGroup(deleteTarget.id);
                    if (state.currentConversationId) {
                        const { loadActiveConversation } = await import('./chat.js');
                        await loadActiveConversation(state.currentConversationId);
                    }
                    showToast('Question and branches deleted', 'info');
                } else if (deleteTarget.type === 'message') {
                    await deleteMessage(deleteTarget.id);
                    if (state.currentConversationId) {
                        const { loadActiveConversation } = await import('./chat.js');
                        await loadActiveConversation(state.currentConversationId);
                    }
                    showToast(deleteTarget.isVersion ? 'Version deleted' : 'Message deleted', 'info');
                }
            } catch (err) {
                console.error('Failed to delete target:', err);
                showToast('Failed to delete', 'error');
            } finally {
                closeDeleteModal();
            }
        });
    }
}
