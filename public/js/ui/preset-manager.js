import { getEnginePresets, getEnginePreset, createOrImportPreset, updatePreset, deletePreset } from '../api.js';
import { showToast } from './modals.js';
import { safeAsync } from './helpers.js';

// ─── Module state ─────────────────────────────────────────────────────────────

let currentPresetId = null;   // id of the preset currently loaded in the editor
let isNewPreset = false;      // true = creating a new preset; false = editing existing
let isDirty = false;          // unsaved changes flag
let savedSnapshot = null;     // JSON snapshot of last-saved form state

// Pushback label map
const PUSHBACK_LABELS = ['Compliant', 'Hesitant', 'Realistic', 'Reluctant', 'Resistant'];

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function show(el)  { el.classList.remove('hidden'); }
function hide(el)  { el.classList.add('hidden'); }

// ─── Public: init ─────────────────────────────────────────────────────────────

export function initPresetManager() {
    // Open from preset picker's "Manage Presets" button
    const manageBtn = el('manage-presets-btn');
    if (manageBtn) {
        manageBtn.addEventListener('click', () => openManager());
    }

    // Close button
    const closeBtn = el('pm-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeManager());
    }

    // Click outside to close
    const overlay = el('preset-manager-modal');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeManager();
        });
    }

    // Header "New Preset" button
    const newBtn = el('pm-new-preset-btn');
    if (newBtn) {
        newBtn.addEventListener('click', () => startNewPreset());
    }

    // List search
    const searchInput = el('pm-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => filterList(searchInput.value.trim().toLowerCase()));
    }

    // Save / Discard buttons
    const saveBtn = el('pm-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', safeAsync(handleSave));
    }

    const discardBtn = el('pm-discard-btn');
    if (discardBtn) {
        discardBtn.addEventListener('click', () => handleDiscard());
    }

    // System body word count
    const systemBodyTA = el('pm-field-system-body');
    if (systemBodyTA) {
        systemBodyTA.addEventListener('input', () => {
            updateWordCountHint(systemBodyTA.value);
            markDirty();
        });
    }

    // Live dirty tracking on all inputs
    const watchedIds = [
        'pm-field-id', 'pm-field-title', 'pm-field-category', 'pm-field-description',
        'pm-field-post-history', 'pm-default-pov', 'pm-default-sensory',
        'pm-default-dirty-talk', 'pm-default-pov-focus',
        'pm-default-word-count', 'pm-default-pushback'
    ];
    watchedIds.forEach(id => {
        const input = el(id);
        if (!input) return;
        input.addEventListener('input', () => markDirty());
        input.addEventListener('change', () => markDirty());
    });

    // Slider live labels
    const wcSlider = el('pm-default-word-count');
    if (wcSlider) {
        wcSlider.addEventListener('input', () => {
            el('pm-word-count-val').textContent = `${wcSlider.value} words`;
        });
    }

    const pbSlider = el('pm-default-pushback');
    if (pbSlider) {
        pbSlider.addEventListener('input', () => {
            const idx = parseInt(pbSlider.value, 10) - 1;
            el('pm-pushback-val').textContent = `${pbSlider.value} — ${PUSHBACK_LABELS[idx] || ''}`;
        });
    }

    // Toggle pills
    ['pm-toggle-outline', 'pm-toggle-premises'].forEach(id => {
        const pill = el(id);
        if (!pill) return;
        pill.addEventListener('click', () => togglePill(pill));
        pill.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') togglePill(pill); });
    });

    // Import dropzone
    initImportZone();
}

// ─── Open / close ─────────────────────────────────────────────────────────────

async function openManager() {
    // Close the preset picker first
    const pickerModal = el('preset-picker-modal');
    if (pickerModal) pickerModal.classList.add('hidden');

    resetEditor();
    show(el('preset-manager-modal'));
    await renderList();
}

function closeManager() {
    if (isDirty) {
        if (!confirm('You have unsaved changes. Discard them and close?')) return;
    }
    hide(el('preset-manager-modal'));
    resetEditor();
}

// ─── List rendering ───────────────────────────────────────────────────────────

async function renderList(selectId = null) {
    const scroll = el('pm-list-scroll');
    scroll.innerHTML = '<div style="padding: 20px; color: var(--text-muted); font-size:0.85rem;">Loading…</div>';

    let grouped;
    try {
        grouped = await getEnginePresets(true); // always fresh
    } catch (err) {
        scroll.innerHTML = `<div style="padding:20px;color:var(--accent-danger);font-size:0.82rem;">Failed to load presets.</div>`;
        return;
    }

    // Populate category datalist for the editor
    const datalist = el('pm-category-datalist');
    if (datalist) {
        datalist.innerHTML = '';
        Object.keys(grouped).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            datalist.appendChild(opt);
        });
    }

    scroll.innerHTML = '';

    const sortedCategories = Object.keys(grouped).sort();
    for (const cat of sortedCategories) {
        const catLabel = document.createElement('div');
        catLabel.className = 'pm-category-label';
        catLabel.textContent = cat.replace(/-/g, ' ');
        scroll.appendChild(catLabel);

        const presets = grouped[cat].slice().sort((a, b) => a.title.localeCompare(b.title));
        for (const preset of presets) {
            scroll.appendChild(buildPresetRow(preset));
        }
    }

    if (selectId) {
        const row = scroll.querySelector(`[data-id="${selectId}"]`);
        if (row) row.classList.add('active');
    } else if (currentPresetId) {
        const row = scroll.querySelector(`[data-id="${currentPresetId}"]`);
        if (row) row.classList.add('active');
    }
}

function buildPresetRow(preset) {
    const row = document.createElement('div');
    row.className = 'pm-preset-row' + (preset.id === currentPresetId ? ' active' : '');
    row.dataset.id = preset.id;
    row.title = preset.description || '';

    row.innerHTML = `
        <span class="pm-preset-row-title">${escHtml(preset.title)}</span>
        <div class="pm-preset-row-actions">
            <button class="pm-row-action-btn" title="Edit" data-action="edit" aria-label="Edit ${escHtml(preset.title)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="pm-row-action-btn" title="Duplicate" data-action="duplicate" aria-label="Duplicate ${escHtml(preset.title)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
            </button>
            <button class="pm-row-action-btn danger" title="Delete" data-action="delete" aria-label="Delete ${escHtml(preset.title)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
            </button>
        </div>
    `;

    // Main row click → edit
    row.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        loadPresetIntoEditor(preset.id);
    });

    // Action buttons
    row.querySelector('[data-action="edit"]').addEventListener('click', () => loadPresetIntoEditor(preset.id));
    row.querySelector('[data-action="duplicate"]').addEventListener('click', () => duplicatePreset(preset.id));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDeletePreset(preset.id, preset.title, row));

    return row;
}

function filterList(query) {
    const rows = el('pm-list-scroll').querySelectorAll('.pm-preset-row');
    rows.forEach(row => {
        const title = (row.querySelector('.pm-preset-row-title')?.textContent || '').toLowerCase();
        row.style.display = !query || title.includes(query) ? '' : 'none';
    });

    // Hide category labels if all their presets are hidden
    const labels = el('pm-list-scroll').querySelectorAll('.pm-category-label');
    labels.forEach(label => {
        let next = label.nextElementSibling;
        let allHidden = true;
        while (next && !next.classList.contains('pm-category-label')) {
            if (next.style.display !== 'none') { allHidden = false; break; }
            next = next.nextElementSibling;
        }
        label.style.display = allHidden ? 'none' : '';
    });
}

// ─── Editor: load / populate ──────────────────────────────────────────────────

async function loadPresetIntoEditor(id) {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;

    // Highlight in list
    el('pm-list-scroll').querySelectorAll('.pm-preset-row').forEach(r => r.classList.remove('active'));
    const row = el('pm-list-scroll').querySelector(`[data-id="${id}"]`);
    if (row) row.classList.add('active');

    let preset;
    try {
        preset = await getEnginePreset(id);
    } catch {
        showToast('Failed to load preset', 'error');
        return;
    }

    currentPresetId = id;
    isNewPreset = false;

    populateForm(preset);
    lockIdField(true);
    hide(el('pm-import-zone'));
    showEditorForm();
    setModeLabel(`Editing: ${preset.title}`);
    clearDirty();
}

function populateForm(preset) {
    const d = preset.defaults || {};

    el('pm-field-id').value          = preset.id || '';
    el('pm-field-title').value       = preset.title || '';
    el('pm-field-category').value    = preset.category || '';
    el('pm-field-description').value = preset.description || '';
    el('pm-field-system-body').value = preset.system_body || '';
    el('pm-field-post-history').value = preset.post_history_body || '';

    // Defaults
    el('pm-default-pov').value          = d.pov || 'third';
    el('pm-default-sensory').value       = d.sensory_intensity || 'sensory_detailed';
    el('pm-default-dirty-talk').value   = d.dialogue_register || 'teasing';
    el('pm-default-pov-focus').value    = d.pov_focus || 'balanced';

    const wc = d.word_count || 1500;
    el('pm-default-word-count').value = wc;
    el('pm-word-count-val').textContent = `${wc} words`;

    const pb = d.pushback !== undefined ? d.pushback : 3;
    el('pm-default-pushback').value = pb;
    el('pm-pushback-val').textContent = `${pb} — ${PUSHBACK_LABELS[pb - 1] || ''}`;

    setPillState(el('pm-toggle-outline'), !!d.outline_mode);
    setPillState(el('pm-toggle-premises'), !!d.premises_mode);

    updateWordCountHint(preset.system_body || '');

    // Snapshot
    savedSnapshot = serializeForm();
}

function showEditorForm() {
    hide(el('pm-editor-empty'));
    show(el('pm-editor-form'));
    show(el('pm-save-btn'));
    show(el('pm-discard-btn'));
}

function resetEditor() {
    currentPresetId = null;
    isNewPreset = false;
    isDirty = false;
    savedSnapshot = null;

    show(el('pm-editor-empty'));
    hide(el('pm-editor-form'));
    hide(el('pm-save-btn'));
    hide(el('pm-discard-btn'));
    hide(el('pm-import-zone'));
    setModeLabel('Select a preset to edit');
    el('pm-dirty-indicator').classList.remove('visible');

    // Clear form
    ['pm-field-id','pm-field-title','pm-field-category','pm-field-description',
     'pm-field-system-body','pm-field-post-history'].forEach(id => {
        const el_ = el(id);
        if (el_) el_.value = '';
    });
    el('pm-default-pov').value = 'third';
    el('pm-default-sensory').value = 'sensory_detailed';
    el('pm-default-dirty-talk').value = 'teasing';
    el('pm-default-pov-focus').value = 'balanced';
    el('pm-default-word-count').value = 1500;
    el('pm-word-count-val').textContent = '1500 words';
    el('pm-default-pushback').value = 3;
    el('pm-pushback-val').textContent = '3 — Realistic';
    setPillState(el('pm-toggle-outline'), false);
    setPillState(el('pm-toggle-premises'), false);
    updateWordCountHint('');

    if (el('pm-search-input')) el('pm-search-input').value = '';
}

// ─── New preset ───────────────────────────────────────────────────────────────

function startNewPreset() {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;

    // Deselect list
    el('pm-list-scroll').querySelectorAll('.pm-preset-row').forEach(r => r.classList.remove('active'));

    currentPresetId = null;
    isNewPreset = true;

    // Reset to blank
    resetEditor();

    // Now show form + import zone
    showEditorForm();
    show(el('pm-import-zone'));
    lockIdField(false);
    setModeLabel('New Preset');
    clearDirty();

    el('pm-field-id').focus();
}

// ─── Duplicate ────────────────────────────────────────────────────────────────

async function duplicatePreset(id) {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;

    let preset;
    try {
        preset = await getEnginePreset(id);
    } catch {
        showToast('Failed to load preset for duplication', 'error');
        return;
    }

    currentPresetId = null;
    isNewPreset = true;

    const copy = JSON.parse(JSON.stringify(preset));
    copy.id = id + '_copy';
    copy.title = preset.title + ' (Copy)';

    populateForm(copy);
    lockIdField(false);
    show(el('pm-import-zone'));
    showEditorForm();
    setModeLabel('New Preset (Duplicated)');
    markDirty(); // it's unsaved by definition

    el('pm-list-scroll').querySelectorAll('.pm-preset-row').forEach(r => r.classList.remove('active'));
    el('pm-field-id').focus();
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function handleSave() {
    const data = collectFormData();

    if (!data.id) {
        showToast('Preset ID is required', 'error');
        el('pm-field-id').focus();
        return;
    }
    if (!/^[a-z0-9_]+$/.test(data.id)) {
        showToast('ID must be lowercase letters, numbers, and underscores only', 'error');
        el('pm-field-id').focus();
        return;
    }
    if (!data.title.trim()) {
        showToast('Title is required', 'error');
        el('pm-field-title').focus();
        return;
    }

    const saveBtn = el('pm-save-btn');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled = true;

    try {
        let saved;
        if (isNewPreset) {
            saved = await createOrImportPreset(data);
            currentPresetId = saved.id;
            isNewPreset = false;
            hide(el('pm-import-zone'));
            lockIdField(true);
        } else {
            saved = await updatePreset(currentPresetId, data);
        }

        savedSnapshot = serializeForm();
        clearDirty();
        setModeLabel(`Editing: ${saved.title}`);

        await renderList(saved.id);
        showToast(`Preset "${saved.title}" saved`, 'success');
    } catch (err) {
        showToast(err.message || 'Save failed', 'error');
    } finally {
        saveBtn.textContent = 'Save Preset';
        saveBtn.disabled = false;
    }
}

// ─── Discard ──────────────────────────────────────────────────────────────────

function handleDiscard() {
    if (!isDirty) return;
    if (!confirm('Discard all unsaved changes?')) return;

    if (isNewPreset) {
        resetEditor();
        el('pm-list-scroll').querySelectorAll('.pm-preset-row').forEach(r => r.classList.remove('active'));
    } else {
        // Reload from snapshot
        const snap = JSON.parse(savedSnapshot);
        populateFormFromSnapshot(snap);
        clearDirty();
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

function confirmDeletePreset(id, title, rowEl) {
    // Remove any existing confirm banner anywhere in the list
    el('pm-list-scroll').querySelectorAll('.pm-delete-confirm').forEach(b => b.remove());

    const banner = document.createElement('div');
    banner.className = 'pm-delete-confirm';
    banner.style.margin = '4px 0 6px';
    banner.innerHTML = `
        <p>Delete <strong>${escHtml(title)}</strong>? This cannot be undone.</p>
        <div class="pm-delete-confirm-actions">
            <button class="btn-sm secondary pm-del-cancel">Cancel</button>
            <button class="btn-sm danger pm-del-confirm">Delete</button>
        </div>
    `;

    // Insert right after the row in the list panel
    rowEl.insertAdjacentElement('afterend', banner);
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    banner.querySelector('.pm-del-cancel').addEventListener('click', () => banner.remove());
    banner.querySelector('.pm-del-confirm').addEventListener('click', safeAsync(async () => {
        const confirmBtn = banner.querySelector('.pm-del-confirm');
        confirmBtn.textContent = 'Deleting…';
        confirmBtn.disabled = true;

        try {
            await deletePreset(id);
            banner.remove();

            // If we were editing the deleted preset, reset the editor
            if (currentPresetId === id) {
                resetEditor();
            }
            await renderList();
            showToast(`Preset "${title}" deleted`, 'success');
        } catch (err) {
            banner.remove();
            if (err.message && err.message.includes('conversations')) {
                confirmForceDelete(id, title, rowEl);
            } else {
                showToast(err.message || 'Delete failed', 'error');
            }
        }
    }));
}

function confirmForceDelete(id, title, rowEl) {
    el('pm-list-scroll').querySelectorAll('.pm-delete-confirm').forEach(b => b.remove());

    const banner = document.createElement('div');
    banner.className = 'pm-delete-confirm';
    banner.style.margin = '4px 0 6px';
    banner.innerHTML = `
        <p><strong>${escHtml(title)}</strong> is used by existing conversations. Force delete anyway?</p>
        <div class="pm-delete-confirm-actions">
            <button class="btn-sm secondary pm-fd-cancel">Cancel</button>
            <button class="btn-sm danger pm-fd-confirm">Force Delete</button>
        </div>
    `;

    // Try to find the row; fall back to appending to the list scroll
    const targetRow = rowEl || el('pm-list-scroll').querySelector(`[data-id="${id}"]`);
    if (targetRow) {
        targetRow.insertAdjacentElement('afterend', banner);
    } else {
        el('pm-list-scroll').appendChild(banner);
    }
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    banner.querySelector('.pm-fd-cancel').addEventListener('click', () => banner.remove());
    banner.querySelector('.pm-fd-confirm').addEventListener('click', safeAsync(async () => {
        const confirmBtn = banner.querySelector('.pm-fd-confirm');
        confirmBtn.textContent = 'Deleting…';
        confirmBtn.disabled = true;
        try {
            await deletePreset(id, true);
            banner.remove();
            if (currentPresetId === id) resetEditor();
            await renderList();
            showToast(`Preset "${title}" force-deleted`, 'success');
        } catch (err) {
            showToast(err.message || 'Force delete failed', 'error');
            banner.remove();
        }
    }));
}

// ─── Import dropzone ──────────────────────────────────────────────────────────

function initImportZone() {
    const zone = el('pm-import-zone');
    const fileInput = el('pm-import-file');
    if (!zone || !fileInput) return;

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processImportFile(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) processImportFile(fileInput.files[0]);
        fileInput.value = ''; // reset so re-selecting same file works
    });
}

function processImportFile(file) {
    if (!file.name.endsWith('.json')) {
        showToast('Only .json files are supported', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        let parsed;
        try {
            parsed = JSON.parse(e.target.result);
        } catch {
            showToast('Invalid JSON file — could not parse', 'error');
            return;
        }

        // Validate required keys
        const required = ['id', 'title'];
        const missing = required.filter(k => !parsed[k]);
        if (missing.length) {
            showToast(`Import missing required fields: ${missing.join(', ')}`, 'error');
            return;
        }

        // Pre-fill form; ensure it's treated as new
        isNewPreset = true;
        currentPresetId = null;
        populateForm(parsed);
        lockIdField(false);
        setModeLabel('New Preset (Imported)');
        markDirty();
        showToast(`Preset "${parsed.title}" loaded — review and save`, 'success');
    };
    reader.readAsText(file);
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function collectFormData() {
    return {
        id: slugify(el('pm-field-id').value),
        title: el('pm-field-title').value.trim(),
        category: el('pm-field-category').value.trim() || 'general',
        description: el('pm-field-description').value.trim(),
        system_body: el('pm-field-system-body').value,
        post_history_body: el('pm-field-post-history').value,
        blocks: getDefaultBlocks(),
        defaults: {
            word_count: parseInt(el('pm-default-word-count').value, 10),
            pov: el('pm-default-pov').value,
            sensory_intensity: el('pm-default-sensory').value,
            dialogue_register: el('pm-default-dirty-talk').value,
            pov_focus: el('pm-default-pov-focus').value,
            pushback: parseInt(el('pm-default-pushback').value, 10),
            outline_mode: el('pm-toggle-outline').classList.contains('on'),
            premises_mode: el('pm-toggle-premises').classList.contains('on'),
        }
    };
}

function serializeForm() {
    return JSON.stringify(collectFormData());
}

function populateFormFromSnapshot(snap) {
    // snap is the plain object from collectFormData
    el('pm-field-id').value           = snap.id || '';
    el('pm-field-title').value        = snap.title || '';
    el('pm-field-category').value     = snap.category || '';
    el('pm-field-description').value  = snap.description || '';
    el('pm-field-system-body').value  = snap.system_body || '';
    el('pm-field-post-history').value = snap.post_history_body || '';

    const d = snap.defaults || {};
    el('pm-default-pov').value        = d.pov || 'third';
    el('pm-default-sensory').value     = d.sensory_intensity || 'sensory_detailed';
    el('pm-default-dirty-talk').value = d.dialogue_register || 'teasing';
    el('pm-default-pov-focus').value  = d.pov_focus || 'balanced';

    const wc = d.word_count || 1500;
    el('pm-default-word-count').value = wc;
    el('pm-word-count-val').textContent = `${wc} words`;

    const pb = d.pushback !== undefined ? d.pushback : 3;
    el('pm-default-pushback').value = pb;
    el('pm-pushback-val').textContent = `${pb} — ${PUSHBACK_LABELS[pb - 1] || ''}`;

    setPillState(el('pm-toggle-outline'), !!d.outline_mode);
    setPillState(el('pm-toggle-premises'), !!d.premises_mode);

    updateWordCountHint(snap.system_body || '');
}

function getDefaultBlocks() {
    return [
        { id: 'base_writer',  enabled: true,  order: 10 },
        { id: 'tone_register', enabled: true,  order: 20 },
        { id: 'format_rules', enabled: true,  order: 50 },
        { id: 'no_meta',      enabled: true,  order: 60 },
        { id: 'continuity',   enabled: true,  order: 70 },
        { id: 'pov_third',    enabled: true,  order: 80 },
        { id: 'pov_first',    enabled: false, order: 81 },
        { id: 'pov_author',   enabled: false, order: 82 },
    ];
}

function lockIdField(locked) {
    const idInput = el('pm-field-id');
    if (locked) {
        idInput.classList.add('id-locked');
        idInput.readOnly = true;
        idInput.title = 'ID cannot be changed for existing presets. Duplicate to create a renamed copy.';
    } else {
        idInput.classList.remove('id-locked');
        idInput.readOnly = false;
        idInput.title = '';
    }
}

// ─── Dirty state ──────────────────────────────────────────────────────────────

function markDirty() {
    isDirty = true;
    el('pm-dirty-indicator').classList.add('visible');
}

function clearDirty() {
    isDirty = false;
    el('pm-dirty-indicator').classList.remove('visible');
}

// ─── Word count hint ─────────────────────────────────────────────────────────

function updateWordCountHint(text) {
    const hint = el('pm-word-count-hint');
    if (!hint) return;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    hint.textContent = `${words} words`;
    hint.className = 'pm-label-hint pm-word-count-hint';
    if (words === 0)       hint.classList.add('empty');
    else if (words < 250)  hint.classList.add('low');
    else if (words > 550)  hint.classList.add('high');
    else                   hint.classList.add('ok');
}

// ─── Toggle pills ─────────────────────────────────────────────────────────────

function togglePill(pill) {
    const isOn = pill.classList.toggle('on');
    pill.setAttribute('aria-checked', isOn ? 'true' : 'false');
    markDirty();
}

function setPillState(pill, on) {
    if (!pill) return;
    pill.classList.toggle('on', on);
    pill.setAttribute('aria-checked', on ? 'true' : 'false');
}

// ─── Label helper ─────────────────────────────────────────────────────────────

function setModeLabel(text) {
    const label = el('pm-editor-mode-label');
    if (label) label.textContent = text;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function slugify(str) {
    return (str || '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
