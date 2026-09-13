/**
 * preset-manager.js — Preset Manager Modal (CRUD, JSON Import/Export & Live Editor)
 */

import { state, setState } from '../state.js';
import {
    getEnginePresets,
    getEnginePreset,
    createEnginePreset,
    updateEnginePreset,
    deleteEnginePreset
} from '../api.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../markdown.js';
import { formatCategoryTitle } from './preset-picker.js';

let pmCurrentPresetId = null;
let pmIsNew = false;

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

export function initPresetManagerEvents() {
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

export function renderPresetManagerList(query = '') {
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
                <div class="group-label" style="padding:4px 8px; font-size:0.68rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">${escapeHtml(formatCategoryTitle(cat))}</div>
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

export async function loadPresetIntoManager(id) {
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

export function startNewPresetInManager() {
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

export function resetPresetManagerEditor() {
    pmCurrentPresetId = null;
    pmIsNew = false;
    document.getElementById('pm-editor-empty')?.classList.remove('hidden');
    document.getElementById('pm-editor-form')?.classList.add('hidden');
}

export async function handleSavePreset() {
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

export async function handleDeletePreset() {
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

export function handleExportPreset() {
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

export function handleImportFile(file) {
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

export function updateWordCountIndicator(text) {
    const countEl = document.getElementById('pm-word-count-badge');
    if (!countEl) return;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    countEl.textContent = `${words} words`;
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}
