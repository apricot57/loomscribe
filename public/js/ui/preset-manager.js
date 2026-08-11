import { authFetch } from '../auth.js';
import { getEnginePresets, showToast } from './helpers.js';
import { state } from '../state.js';

let allPresets = [];          // cached list of all presets from server
let activePresetId = null;    // currently selected preset in manager (string | null)
let isNewPreset = false;      // true = creating a new preset; false = editing existing
let isDirty = false;          // unsaved changes flag
let savedSnapshot = null;     // JSON snapshot of last-saved form state

// Pushback label map
const PUSHBACK_LABELS = ['Off', 'Compliant', 'Hesitant', 'Realistic', 'Reluctant', 'Resistant'];

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function setPillState(pill, active) {
    if (!pill) return;
    if (active) {
        pill.classList.add('on');
        pill.setAttribute('aria-checked', 'true');
    } else {
        pill.classList.remove('on');
        pill.setAttribute('aria-checked', 'false');
    }
}

function togglePill(pill) {
    if (!pill) return;
    const nowActive = !pill.classList.contains('on');
    setPillState(pill, nowActive);
    markDirty();
}

function countWords(str) {
    if (!str || !str.trim()) return 0;
    return str.trim().split(/\s+/).length;
}

function updateWordCountHint(text) {
    const hint = el('pm-word-count-hint');
    if (!hint) return;
    const count = countWords(text);
    hint.textContent = count === 0 ? '0 words' : `${count} words`;
    hint.className = 'pm-label-hint pm-word-count-hint' +
        (count === 0 ? ' empty' : count >= 200 && count <= 600 ? ' good' : ' warn');
}

// ─── Lifecycle & Initialization ──────────────────────────────────────────────

export function initPresetManager() {
    // Open / Close triggers
    const manageBtn = el('manage-presets-btn');
    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            // Close picker, open manager
            const pickerModal = el('preset-picker-modal');
            if (pickerModal) pickerModal.classList.add('hidden');
            openPresetManager();
        });
    }

    const closeBtn = el('pm-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closePresetManager);

    const newBtn = el('pm-new-preset-btn');
    if (newBtn) newBtn.addEventListener('click', () => handleNewPreset());

    const saveBtn = el('pm-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', handleSavePreset);

    const discardBtn = el('pm-discard-btn');
    if (discardBtn) discardBtn.addEventListener('click', handleDiscard);

    // Search filter in list panel
    const searchInput = el('pm-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterPresetList(e.target.value));
    }

    // Word count slider live readout
    const wcSlider = el('pm-default-word-count');
    if (wcSlider) {
        wcSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            const hint = el('pm-word-count-val');
            if (hint) hint.textContent = `${val} words`;
            markDirty();
        });
    }

    // Pushback slider live readout
    const pbSlider = el('pm-default-pushback');
    if (pbSlider) {
        pbSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            const hint = el('pm-pushback-val');
            if (hint) hint.textContent = `${val} — ${PUSHBACK_LABELS[val] || ''}`;
            markDirty();
        });
    }

    // Toggle pills
    ['pm-toggle-outline', 'pm-toggle-premises', 'pm-toggle-complication', 'pm-toggle-choices'].forEach(id => {
        const pill = el(id);
        if (!pill) return;
        pill.addEventListener('click', () => togglePill(pill));
        pill.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                togglePill(pill);
            }
        });
    });

    // System body live word count and auto-resize
    const sysBody = el('pm-field-system-body');
    if (sysBody) {
        sysBody.addEventListener('input', (e) => {
            updateWordCountHint(e.target.value);
            autoResizeTextarea(e.target);
            markDirty();
        });
    }

    const postHist = el('pm-field-post-history');
    if (postHist) {
        postHist.addEventListener('input', (e) => {
            autoResizeTextarea(e.target);
            markDirty();
        });
    }

    // Mark dirty on any other input
    ['pm-field-id', 'pm-field-title', 'pm-field-category', 'pm-field-description',
     'pm-default-pov', 'pm-default-intensity', 'pm-default-dialogue-style',
     'pm-default-pov-focus'].forEach(id => {
        const input = el(id);
        if (!input) return;
        input.addEventListener('input', markDirty);
        input.addEventListener('change', markDirty);
    });

    // Setup import dropzone
    setupImportZone();
}

function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, 80) + 'px';
}

export async function openPresetManager(presetToSelect = null) {
    const modal = el('preset-manager-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    await refreshPresetList();

    if (presetToSelect) {
        selectPreset(presetToSelect);
    } else if (allPresets.length > 0) {
        // Select first preset by default
        selectPreset(allPresets[0].id);
    } else {
        showEmptyState();
    }
}

export function closePresetManager() {
    if (isDirty) {
        const confirm = window.confirm('You have unsaved changes. Discard them?');
        if (!confirm) return;
    }
    const modal = el('preset-manager-modal');
    if (modal) modal.classList.add('hidden');
    resetEditor();
}

// ─── Preset List (Left Panel) ─────────────────────────────────────────────────

async function refreshPresetList() {
    try {
        const grouped = await getEnginePresets(true); // force refresh
        allPresets = [];
        for (const [catKey, list] of Object.entries(grouped)) {
            for (const p of list) {
                allPresets.push({ ...p, _categoryKey: catKey });
            }
        }
        renderList(allPresets);
        populateCategoryDatalist();
    } catch (err) {
        console.error('Failed to load presets for Preset Manager:', err);
    }
}

function renderList(presets) {
    const container = el('pm-list-scroll');
    if (!container) return;
    container.innerHTML = '';

    if (presets.length === 0) {
        container.innerHTML = '<div class="pm-list-empty">No presets found</div>';
        return;
    }

    // Group by category for display
    const byCategory = {};
    for (const p of presets) {
        const cat = p.category || 'General';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
    }

    for (const [catName, list] of Object.entries(byCategory)) {
        const section = document.createElement('div');
        section.className = 'pm-list-category';

        const header = document.createElement('div');
        header.className = 'pm-list-category-header';
        header.textContent = catName;
        section.appendChild(header);

        for (const preset of list) {
            const row = document.createElement('div');
            row.className = 'pm-list-item' + (preset.id === activePresetId ? ' active' : '');
            row.dataset.id = preset.id;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'pm-list-item-title';
            titleSpan.textContent = preset.title;

            // Row actions (hover): Duplicate, Delete
            const actions = document.createElement('div');
            actions.className = 'pm-list-item-actions';

            const dupBtn = document.createElement('button');
            dupBtn.className = 'pm-list-action-btn';
            dupBtn.title = 'Duplicate Preset';
            dupBtn.textContent = '⎘';
            dupBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleDuplicatePreset(preset.id);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'pm-list-action-btn danger';
            delBtn.title = 'Delete Preset';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleDeletePreset(preset.id, preset.title, row);
            });

            actions.appendChild(dupBtn);
            actions.appendChild(delBtn);

            row.appendChild(titleSpan);
            row.appendChild(actions);

            row.addEventListener('click', () => {
                if (row.dataset.id === activePresetId && !isNewPreset) return;
                if (isDirty) {
                    const confirm = window.confirm('You have unsaved changes. Discard them?');
                    if (!confirm) return;
                }
                selectPreset(row.dataset.id);
            });

            section.appendChild(row);
        }

        container.appendChild(section);
    }
}

function filterPresetList(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderList(allPresets);
        return;
    }
    const filtered = allPresets.filter(p =>
        p.id.toLowerCase().includes(q) ||
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
    renderList(filtered);
}

function populateCategoryDatalist() {
    const datalist = el('pm-category-datalist');
    if (!datalist) return;
    const categories = new Set(allPresets.map(p => p.category).filter(Boolean));
    datalist.innerHTML = '';
    for (const cat of categories) {
        const opt = document.createElement('option');
        opt.value = cat;
        datalist.appendChild(opt);
    }
}

// ─── Preset Selection & Form Population ──────────────────────────────────────

async function selectPreset(presetId) {
    activePresetId = presetId;
    isNewPreset = false;

    // Highlight row in list
    document.querySelectorAll('.pm-list-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === presetId);
    });

    let preset = null;
    try {
        const res = await authFetch(`/api/engine/presets/${presetId}`);
        if (!res.ok) throw new Error('Preset not found');
        preset = await res.json();
    } catch (err) {
        showToast('Failed to load preset details');
        return;
    }

    showEditorForm();
    populateForm(preset);
    setClean();
}

function populateForm(preset) {
    el('pm-editor-mode-label').textContent = `Editing: ${preset.title}`;

    // ID field is read-only when editing existing preset
    const idInput = el('pm-field-id');
    idInput.value = preset.id || '';
    idInput.disabled = true;

    el('pm-field-title').value = preset.title || '';
    el('pm-field-category').value = preset.category || '';
    el('pm-field-description').value = preset.description || '';
    el('pm-field-system-body').value = preset.system_body || '';
    el('pm-field-post-history').value = preset.post_history_body || '';

    // Defaults
    const d = preset.defaults || {};
    el('pm-default-pov').value             = d.pov || 'third';
    el('pm-default-intensity').value       = d.scene_intensity || 'charged';
    el('pm-default-dialogue-style').value   = d.dialogue_style || 'playful';
    el('pm-default-pov-focus').value       = d.pov_focus || 'balanced';

    const wc = d.word_count || 1500;
    el('pm-default-word-count').value = wc;
    el('pm-word-count-val').textContent = `${wc} words`;

    const pb = d.pushback !== undefined ? d.pushback : 3;
    el('pm-default-pushback').value = pb;
    el('pm-pushback-val').textContent = `${pb} — ${PUSHBACK_LABELS[pb] || ''}`;

    setPillState(el('pm-toggle-outline'), !!d.outline_mode);
    setPillState(el('pm-toggle-premises'), !!d.premises_mode);
    setPillState(el('pm-toggle-complication'), !!d.complication_generator);
    setPillState(el('pm-toggle-choices'), !!d.suggest_choices);

    updateWordCountHint(preset.system_body || '');
    autoResizeTextarea(el('pm-field-system-body'));
    autoResizeTextarea(el('pm-field-post-history'));

    // Hide import dropzone when editing existing
    el('pm-import-zone').classList.add('hidden');

    savedSnapshot = collectFormData();
}

function showEditorForm() {
    el('pm-editor-empty').classList.add('hidden');
    el('pm-editor-form').classList.remove('hidden');
    el('pm-save-btn').classList.remove('hidden');
    el('pm-discard-btn').classList.remove('hidden');
}

function showEmptyState() {
    el('pm-editor-empty').classList.remove('hidden');
    el('pm-editor-form').classList.add('hidden');
    el('pm-save-btn').classList.add('hidden');
    el('pm-discard-btn').classList.add('hidden');
    el('pm-editor-mode-label').textContent = 'Select a preset to edit';
    setClean();
}

function resetEditor() {
    activePresetId = null;
    isNewPreset = false;
    showEmptyState();

    // Reset form fields
    const idInput = el('pm-field-id');
    if (idInput) {
        idInput.value = '';
        idInput.disabled = false;
    }
    el('pm-field-title').value = '';
    el('pm-field-category').value = '';
    el('pm-field-description').value = '';
    el('pm-field-system-body').value = '';
    el('pm-field-post-history').value = '';
    el('pm-default-pov').value = 'third';
    el('pm-default-intensity').value = 'charged';
    el('pm-default-dialogue-style').value = 'playful';
    el('pm-default-pov-focus').value = 'balanced';
    el('pm-default-word-count').value = 1500;
    el('pm-word-count-val').textContent = '1500 words';
    el('pm-default-pushback').value = 3;
    el('pm-pushback-val').textContent = '3 — Realistic';
    setPillState(el('pm-toggle-outline'), false);
    setPillState(el('pm-toggle-premises'), false);
    setPillState(el('pm-toggle-complication'), false);
    setPillState(el('pm-toggle-choices'), false);
    updateWordCountHint('');

    document.querySelectorAll('.pm-list-item').forEach(el => el.classList.remove('active'));
}

// ─── New Preset & Duplication ─────────────────────────────────────────────────

function handleNewPreset() {
    if (isDirty) {
        const confirm = window.confirm('You have unsaved changes. Discard them?');
        if (!confirm) return;
    }

    resetEditor();
    isNewPreset = true;
    activePresetId = null;

    showEditorForm();
    el('pm-editor-mode-label').textContent = 'New Preset';

    // Enable ID input for new presets
    const idInput = el('pm-field-id');
    idInput.disabled = false;
    idInput.focus();

    // Show import dropzone
    el('pm-import-zone').classList.remove('hidden');

    savedSnapshot = collectFormData();
    setClean();
}

function handleDuplicatePreset(sourcePresetId) {
    if (isDirty) {
        const confirm = window.confirm('You have unsaved changes. Discard them?');
        if (!confirm) return;
    }

    const source = allPresets.find(p => p.id === sourcePresetId);
    if (!source) return;

    authFetch(`/api/engine/presets/${sourcePresetId}`)
        .then(res => res.json())
        .then(preset => {
            isNewPreset = true;
            activePresetId = null;

            showEditorForm();
            populateForm(preset);

            // Modify ID and Title for duplicate
            const idInput = el('pm-field-id');
            idInput.disabled = false;
            idInput.value = `${sourcePresetId}_copy`;

            el('pm-field-title').value = `${preset.title} (Copy)`;
            el('pm-editor-mode-label').textContent = `Duplicate: ${preset.title}`;

            // Keep import zone hidden for duplicates
            el('pm-import-zone').classList.add('hidden');

            markDirty();
            idInput.focus();
        })
        .catch(err => {
            console.error('Failed to duplicate preset:', err);
            showToast('Failed to duplicate preset');
        });
}

// ─── Save & Discard ───────────────────────────────────────────────────────────

async function handleSavePreset() {
    const data = collectFormData();

    // Validation
    if (!data.id || !data.id.trim()) {
        showToast('Preset ID is required');
        el('pm-field-id').focus();
        return;
    }
    if (!/^[a-z0-9_]+$/.test(data.id.trim())) {
        showToast('ID must be lowercase letters, numbers, and underscores only');
        el('pm-field-id').focus();
        return;
    }
    if (!data.title || !data.title.trim()) {
        showToast('Title is required');
        el('pm-field-title').focus();
        return;
    }

    const saveBtn = el('pm-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        let res;
        if (isNewPreset) {
            // POST /api/engine/presets
            res = await authFetch('/api/engine/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            // PUT /api/engine/presets/:id
            res = await authFetch(`/api/engine/presets/${data.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        if (res.status === 409) {
            showToast(`Preset "${data.id}" already exists. Choose a different ID.`);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Preset';
            return;
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to save preset');
        }

        const savedPreset = await res.json();
        showToast(`Preset "${savedPreset.title}" saved successfully!`);

        setClean();
        savedSnapshot = collectFormData();

        // Refresh list and select the saved preset
        await refreshPresetList();
        selectPreset(savedPreset.id);

    } catch (err) {
        console.error('Error saving preset:', err);
        showToast(err.message || 'Failed to save preset');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Preset';
    }
}

function handleDiscard() {
    if (!isDirty) return;
    if (savedSnapshot) {
        populateFormFromSnapshot(savedSnapshot);
        setClean();
    } else {
        resetEditor();
    }
}

// ─── Delete Preset ────────────────────────────────────────────────────────────

async function handleDeletePreset(presetId, presetTitle, rowElement) {
    // Show inline confirm inside the list row
    const originalActions = rowElement.querySelector('.pm-list-item-actions');
    if (!originalActions) return;

    originalActions.style.display = 'none';

    const confirmContainer = document.createElement('div');
    confirmContainer.className = 'pm-list-item-confirm';
    confirmContainer.innerHTML = `
        <span style="font-size:11px; color:var(--accent-danger);">Delete?</span>
        <button class="pm-btn-inline danger" id="pm-del-yes">Yes</button>
        <button class="pm-btn-inline" id="pm-del-no">No</button>
    `;

    rowElement.appendChild(confirmContainer);

    confirmContainer.querySelector('#pm-del-no').addEventListener('click', (e) => {
        e.stopPropagation();
        confirmContainer.remove();
        originalActions.style.display = '';
    });

    confirmContainer.querySelector('#pm-del-yes').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const res = await authFetch(`/api/engine/presets/${presetId}`, {
                method: 'DELETE'
            });

            if (res.status === 409) {
                // In use by active conversation
                const force = window.confirm(
                    `"${presetTitle}" is currently in use by one or more chats.\n\nDelete anyway? Those chats will keep their current settings.`
                );
                if (force) {
                    const forceRes = await authFetch(`/api/engine/presets/${presetId}?force=1`, {
                        method: 'DELETE'
                    });
                    if (forceRes.ok) {
                        showToast(`Preset "${presetTitle}" deleted`);
                        if (activePresetId === presetId) resetEditor();
                        await refreshPresetList();
                    }
                } else {
                    confirmContainer.remove();
                    originalActions.style.display = '';
                }
                return;
            }

            if (res.ok) {
                showToast(`Preset "${presetTitle}" deleted`);
                if (activePresetId === presetId) resetEditor();
                await refreshPresetList();
            } else {
                showToast('Failed to delete preset');
            }
        } catch (err) {
            console.error('Delete preset failed:', err);
            showToast('Delete preset failed');
        }
    });
}

// ─── Import Dropzone ──────────────────────────────────────────────────────────

function setupImportZone() {
    const zone = el('pm-import-zone');
    const fileInput = el('pm-import-file');
    if (!zone || !fileInput) return;

    zone.addEventListener('click', () => fileInput.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files && files[0]) processImportFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            processImportFile(e.target.files[0]);
        }
    });
}

function processImportFile(file) {
    if (!file.name.endsWith('.json')) {
        showToast('Please select a valid .json file');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.id && !data.title) {
                showToast('Invalid preset file: missing id or title');
                return;
            }

            // Derive ID from file name if missing
            if (!data.id) {
                data.id = file.name.replace(/\.json$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
            }

            // Pre-fill form for review
            populateForm(data);

            // Enable ID field since it's a new import
            const idInput = el('pm-field-id');
            idInput.disabled = false;
            isNewPreset = true;
            activePresetId = null;

            el('pm-editor-mode-label').textContent = `Importing: ${data.title || data.id}`;
            markDirty();
            showToast('Preset loaded from file! Review and click Save.');
        } catch (err) {
            console.error('Failed to parse preset JSON:', err);
            showToast('Failed to parse JSON file');
        }
    };
    reader.readAsText(file);
}

// ─── Dirty / Clean State ──────────────────────────────────────────────────────

function markDirty() {
    isDirty = true;
    const ind = el('pm-dirty-indicator');
    if (ind) ind.classList.add('visible');
}

function setClean() {
    isDirty = false;
    const ind = el('pm-dirty-indicator');
    if (ind) ind.classList.remove('visible');
}

function collectFormData() {
    return {
        id: (el('pm-field-id').value || '').trim(),
        title: (el('pm-field-title').value || '').trim(),
        category: (el('pm-field-category').value || '').trim() || 'General',
        description: (el('pm-field-description').value || '').trim(),
        system_body: el('pm-field-system-body').value || '',
        post_history_body: el('pm-field-post-history').value || '',
        defaults: {
            word_count: parseInt(el('pm-default-word-count').value, 10),
            pov: el('pm-default-pov').value,
            scene_intensity: el('pm-default-intensity').value,
            dialogue_style: el('pm-default-dialogue-style').value,
            pov_focus: el('pm-default-pov-focus').value,
            pushback: parseInt(el('pm-default-pushback').value, 10),
            outline_mode: el('pm-toggle-outline').classList.contains('on'),
            premises_mode: el('pm-toggle-premises').classList.contains('on'),
            complication_generator: el('pm-toggle-complication').classList.contains('on'),
            suggest_choices: el('pm-toggle-choices').classList.contains('on'),
        }
    };
}

function populateFormFromSnapshot(snap) {
    el('pm-field-id').value = snap.id || '';
    el('pm-field-title').value = snap.title || '';
    el('pm-field-category').value = snap.category || '';
    el('pm-field-description').value = snap.description || '';
    el('pm-field-system-body').value = snap.system_body || '';
    el('pm-field-post-history').value = snap.post_history_body || '';

    const d = snap.defaults || {};
    el('pm-default-pov').value             = d.pov || 'third';
    el('pm-default-intensity').value       = d.scene_intensity || 'charged';
    el('pm-default-dialogue-style').value   = d.dialogue_style || 'playful';
    el('pm-default-pov-focus').value       = d.pov_focus || 'balanced';

    const wc = d.word_count || 1500;
    el('pm-default-word-count').value = wc;
    el('pm-word-count-val').textContent = `${wc} words`;

    const pb = d.pushback !== undefined ? d.pushback : 3;
    el('pm-default-pushback').value = pb;
    el('pm-pushback-val').textContent = `${pb} — ${PUSHBACK_LABELS[pb] || ''}`;

    setPillState(el('pm-toggle-outline'), !!d.outline_mode);
    setPillState(el('pm-toggle-premises'), !!d.premises_mode);
    setPillState(el('pm-toggle-complication'), !!d.complication_generator);
    setPillState(el('pm-toggle-choices'), !!d.suggest_choices);

    updateWordCountHint(snap.system_body || '');
    autoResizeTextarea(el('pm-field-system-body'));
    autoResizeTextarea(el('pm-field-post-history'));
}
