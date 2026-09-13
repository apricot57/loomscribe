/**
 * settings-custom-models.js — Custom Models CRUD & List Rendering Controller
 */

import { state, setState } from '../../state.js';
import {
    getConfig,
    addCustomModel,
    updateCustomModel,
    deleteCustomModel
} from '../../api.js';
import { showToast } from '../toast.js';
import { escapeHtml } from '../../markdown.js';

let editingCustomModelId = null;
let cloningFromModelId = null;

export function renderCustomModelsList() {
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

export function resetCustomModelForm() {
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

export function initCustomModelEvents() {
    const cancelModelBtn = document.getElementById('custom-model-cancel-btn');
    const addModelForm = document.getElementById('add-custom-model-form');

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
}
