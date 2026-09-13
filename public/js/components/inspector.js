/**
 * inspector.js — Prompt Engine Inspector Pane & Scenario Settings
 */

import { state, setState, subscribe } from '../state.js';
import { updateConversation, compilePrompt, getEngineSchema, getEnginePresets } from '../api.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../markdown.js';

let debounceTimer = null;
let activePreviewTab = 'slot1'; // 'slot1' | 'slot2'
let compiledCache = { systemPrompt: '', postHistory: '' };

export function initInspector() {
    const inspectorCloseBtn = document.getElementById('inspector-close-btn');
    const changePresetBtn = document.getElementById('inspector-change-preset-btn');
    const compileBtn = document.getElementById('compile-preview-btn');
    const tabSlot1 = document.getElementById('tab-slot1');
    const tabSlot2 = document.getElementById('tab-slot2');
    const copyPreviewBtn = document.getElementById('copy-preview-btn');

    if (inspectorCloseBtn) {
        inspectorCloseBtn.addEventListener('click', () => {
            import('./chat.js').then(m => m.toggleInspector(false));
        });
    }

    if (changePresetBtn) {
        changePresetBtn.addEventListener('click', () => {
            import('./modals.js').then(m => m.openPresetPickerModal());
        });
    }

    if (compileBtn) {
        compileBtn.addEventListener('click', () => triggerCompilePreview());
    }

    if (tabSlot1 && tabSlot2) {
        tabSlot1.addEventListener('click', () => switchPreviewTab('slot1'));
        tabSlot2.addEventListener('click', () => switchPreviewTab('slot2'));
    }

    if (copyPreviewBtn) {
        copyPreviewBtn.addEventListener('click', () => {
            const text = activePreviewTab === 'slot1' ? compiledCache.systemPrompt : compiledCache.postHistory;
            if (text) {
                navigator.clipboard.writeText(text).then(() => {
                    showToast('Prompt preview copied to clipboard', 'info', 1500);
                });
            }
        });
    }

    // Close dropdowns on outside click — registered once at init, not per render
    document.addEventListener('click', () => {
        closeAllCustomDropdowns();
    });
}

export async function renderInspector(conv = state.activeConversation) {
    const container = document.getElementById('inspector-content');
    if (!container) return;

    if (!conv) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:0.85rem;">
                Select a conversation to configure prompt engine settings.
            </div>
        `;
        return;
    }

    const presetId = conv.presetId;
    const preset = presetId ? state.enginePresets?.find(p => p.id === presetId) : null;
    const schema = state.engineSchema;
    const params = { ...(preset?.defaults || {}), ...(conv.params || {}) };
    const overrides = conv.blockOverrides || {};

    updatePresetCardUI(preset);
    renderParameterControls(params, schema);
    renderDirectorNote(conv.directorNote || '');
    renderAdvancedBlocks(preset, overrides);
}

function updatePresetCardUI(preset) {
    const titleEl = document.getElementById('inspector-preset-title');
    const catEl = document.getElementById('inspector-preset-cat');
    const descEl = document.getElementById('inspector-preset-desc');

    if (titleEl) titleEl.textContent = preset ? preset.title : 'None (No Preset)';
    if (catEl) {
        if (preset?.category) {
            catEl.textContent = preset.category;
            catEl.classList.remove('hidden');
        } else {
            catEl.textContent = 'Standard Chat';
            catEl.classList.remove('hidden');
        }
    }
    if (descEl) descEl.textContent = preset?.description || 'Standard AI assistant without scenario-specific prompt engine instructions.';
}

const PUSHBACK_LABELS = ['Off', 'Compliant', 'Hesitant', 'Realistic', 'Reluctant', 'Resistant'];

function renderParameterControls(params, schema) {
    const container = document.getElementById('inspector-params-container');
    if (!container) return;

    const povVal = params.pov || 'third';
    const intensityVal = params.scene_intensity || 'charged';
    const dialogueVal = params.dialogue_style || 'playful';
    const focusVal = params.pov_focus || 'balanced';
    const pushbackVal = params.pushback !== undefined ? Number(params.pushback) : 3;
    const wordCountVal = params.word_count !== undefined ? Number(params.word_count) : 1500;
    const slidingWindowVal = params.sliding_window !== undefined ? Number(params.sliding_window) : 10;

    const povOptions = [
        { value: 'third', label: 'Close Third Person' },
        { value: 'first', label: 'Deep First Person' },
        { value: 'author', label: 'Omniscient Narrator' },
        { value: 'off', label: 'Off / Default' }
    ];

    const intensityOptions = [
        { value: 'tender', label: 'Tender & Atmospheric' },
        { value: 'sensory', label: 'Sensory & Tactile' },
        { value: 'charged', label: 'High-Tension & Charged' },
        { value: 'raw', label: 'Raw & Direct' },
        { value: 'off', label: 'Off / Default' }
    ];

    const dialogueOptions = [
        { value: 'silent', label: 'Subtext-Heavy & Minimalist' },
        { value: 'playful', label: 'Witty & Playful' },
        { value: 'candid', label: 'Direct & Candid' },
        { value: 'commanding', label: 'Dominant & Commanding' },
        { value: 'off', label: 'Off / Default' }
    ];

    const focusOptions = [
        { value: 'balanced', label: 'Balanced Dynamic' },
        { value: 'self', label: 'POV Interiority' },
        { value: 'partner', label: 'Partner Reaction' },
        { value: 'off', label: 'Off / Default' }
    ];

    const currentPovLabel = povOptions.find(o => o.value === povVal)?.label || 'Close Third Person';
    const currentIntensityLabel = intensityOptions.find(o => o.value === intensityVal)?.label || 'High-Tension & Charged';
    const currentDialogueLabel = dialogueOptions.find(o => o.value === dialogueVal)?.label || 'Witty & Playful';
    const currentFocusLabel = focusOptions.find(o => o.value === focusVal)?.label || 'Balanced Dynamic';

    const outlineMode = params.outline_mode === true || params.outline_mode === 'true';
    const premisesMode = params.premises_mode === true || params.premises_mode === 'true';
    const complicationGen = params.complication_generator === true || params.complication_generator === 'true' || params.complication_gen === true || params.complication_gen === 'true';
    const suggestChoices = params.suggest_choices === true || params.suggest_choices === 'true';
    const proseBypassActive = outlineMode || premisesMode;
    const isPremisesMode = premisesMode;

    container.innerHTML = `
        <div class="param-group ${proseBypassActive ? 'bypassed' : ''}">
            <div class="param-header">
                <span>Point of View</span>
                <span class="param-value-tag ${proseBypassActive ? 'bypassed' : ''}" id="pov-value-tag">${proseBypassActive ? 'Bypassed' : povVal}</span>
            </div>
            <div class="custom-select-wrap" id="wrap-param-pov">
                <button type="button" class="custom-select-trigger" id="param-pov-trigger" ${proseBypassActive ? 'disabled' : ''}>
                    <span class="custom-select-value">${escapeHtml(currentPovLabel)}</span>
                    <svg class="custom-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="custom-select-menu hidden" id="param-pov-menu">
                    ${povOptions.map(o => `
                        <button type="button" class="custom-select-option ${o.value === povVal ? 'selected' : ''}" data-value="${o.value}">
                            <span>${escapeHtml(o.label)}</span>
                            ${o.value === povVal ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="param-group ${proseBypassActive ? 'bypassed' : ''}">
            <div class="param-header">
                <span>Scene Intensity</span>
                <span class="param-value-tag ${proseBypassActive ? 'bypassed' : ''}" id="intensity-value-tag">${proseBypassActive ? 'Bypassed' : intensityVal}</span>
            </div>
            <div class="custom-select-wrap" id="wrap-param-intensity">
                <button type="button" class="custom-select-trigger" id="param-intensity-trigger" ${proseBypassActive ? 'disabled' : ''}>
                    <span class="custom-select-value">${escapeHtml(currentIntensityLabel)}</span>
                    <svg class="custom-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="custom-select-menu hidden" id="param-intensity-menu">
                    ${intensityOptions.map(o => `
                        <button type="button" class="custom-select-option ${o.value === intensityVal ? 'selected' : ''}" data-value="${o.value}">
                            <span>${escapeHtml(o.label)}</span>
                            ${o.value === intensityVal ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="param-group ${proseBypassActive ? 'bypassed' : ''}">
            <div class="param-header">
                <span>Dialogue Style</span>
                <span class="param-value-tag ${proseBypassActive ? 'bypassed' : ''}" id="dialogue-value-tag">${proseBypassActive ? 'Bypassed' : dialogueVal}</span>
            </div>
            <div class="custom-select-wrap" id="wrap-param-dialogue">
                <button type="button" class="custom-select-trigger" id="param-dialogue-trigger" ${proseBypassActive ? 'disabled' : ''}>
                    <span class="custom-select-value">${escapeHtml(currentDialogueLabel)}</span>
                    <svg class="custom-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="custom-select-menu hidden" id="param-dialogue-menu">
                    ${dialogueOptions.map(o => `
                        <button type="button" class="custom-select-option ${o.value === dialogueVal ? 'selected' : ''}" data-value="${o.value}">
                            <span>${escapeHtml(o.label)}</span>
                            ${o.value === dialogueVal ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="param-group ${proseBypassActive ? 'bypassed' : ''}">
            <div class="param-header">
                <span>POV Focus Spotlight</span>
                <span class="param-value-tag ${proseBypassActive ? 'bypassed' : ''}" id="focus-value-tag">${proseBypassActive ? 'Bypassed' : focusVal}</span>
            </div>
            <div class="custom-select-wrap" id="wrap-param-focus">
                <button type="button" class="custom-select-trigger" id="param-focus-trigger" ${proseBypassActive ? 'disabled' : ''}>
                    <span class="custom-select-value">${escapeHtml(currentFocusLabel)}</span>
                    <svg class="custom-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
                <div class="custom-select-menu hidden" id="param-focus-menu">
                    ${focusOptions.map(o => `
                        <button type="button" class="custom-select-option ${o.value === focusVal ? 'selected' : ''}" data-value="${o.value}">
                            <span>${escapeHtml(o.label)}</span>
                            ${o.value === focusVal ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="param-group ${proseBypassActive ? 'bypassed' : ''}">
            <div class="param-header">
                <span>Pushback / Resistance</span>
                <span class="param-value-tag ${proseBypassActive ? 'bypassed' : ''}" id="param-pushback-label">${proseBypassActive ? 'Bypassed' : (PUSHBACK_LABELS[pushbackVal] || pushbackVal)}</span>
            </div>
            <input type="range" class="param-range" id="param-pushback" min="0" max="5" step="1" value="${pushbackVal}" ${proseBypassActive ? 'disabled' : ''}>
        </div>

        <div class="param-group ${isPremisesMode ? 'bypassed' : ''}">
            <div class="param-header">
                <span>Target Length</span>
                <span class="param-value-tag ${isPremisesMode ? 'bypassed' : ''}" id="param-word-count-label">${isPremisesMode ? 'Fixed (6 premises)' : `${wordCountVal} words`}</span>
            </div>
            <input type="range" class="param-range" id="param-word-count" min="600" max="3000" step="100" value="${wordCountVal}" ${isPremisesMode ? 'disabled title="Target length is overridden in Premises Mode"' : ''}>
        </div>


        <div class="param-group">
            <div class="param-header">
                <span>Context Window</span>
                <span class="param-value-tag" id="param-sliding-window-label">${slidingWindowVal} turns</span>
            </div>
            <input type="range" class="param-range" id="param-sliding-window" min="2" max="30" step="1" value="${slidingWindowVal}">
        </div>

        <div class="param-group">
            <div class="param-header" style="margin-bottom: 2px;">
                <span>Narrative Modes</span>
            </div>
            <div class="param-toggle-grid">
                <div class="param-toggle-card ${outlineMode ? 'checked' : ''}" id="toggle-outline-mode">
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Outline Mode</span>
                    <div class="toggle-switch-pill"></div>
                </div>
                <div class="param-toggle-card ${premisesMode ? 'checked' : ''}" id="toggle-premises-mode">
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Premises Mode</span>
                    <div class="toggle-switch-pill"></div>
                </div>
                <div class="param-toggle-card ${complicationGen ? 'checked' : ''} ${proseBypassActive ? 'bypassed' : ''}" id="toggle-complication-gen" ${proseBypassActive ? 'title="Complications bypassed in Narrative Mode"' : ''}>
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Complications</span>
                    <div class="toggle-switch-pill"></div>
                </div>
                <div class="param-toggle-card ${suggestChoices ? 'checked' : ''}" id="toggle-suggest-choices">
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Suggest Choices</span>
                    <div class="toggle-switch-pill"></div>
                </div>
            </div>
        </div>
    `;

    attachParameterListeners();
}

function attachParameterListeners() {
    const povTrigger = document.getElementById('param-pov-trigger');
    const povMenu = document.getElementById('param-pov-menu');
    const intensityTrigger = document.getElementById('param-intensity-trigger');
    const intensityMenu = document.getElementById('param-intensity-menu');
    const dialogueTrigger = document.getElementById('param-dialogue-trigger');
    const dialogueMenu = document.getElementById('param-dialogue-menu');
    const focusTrigger = document.getElementById('param-focus-trigger');
    const focusMenu = document.getElementById('param-focus-menu');

    // Setup custom dropdown toggling
    const setupDropdown = (trigger, menu, onSelect) => {
        if (!trigger || !menu) return;
        trigger.addEventListener('click', (e) => {
            if (trigger.disabled || trigger.closest('.bypassed')) return;
            e.stopPropagation();
            const isOpen = !menu.classList.contains('hidden');
            closeAllCustomDropdowns();
            if (!isOpen) {
                menu.classList.remove('hidden');
                trigger.classList.add('open');
            }
        });

        menu.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = opt.dataset.value;
                const label = opt.querySelector('span')?.textContent;
                const triggerVal = trigger.querySelector('.custom-select-value');
                if (triggerVal && label) triggerVal.textContent = label;
                menu.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                closeAllCustomDropdowns();
                onSelect(val);
            });
        });
    };

    setupDropdown(povTrigger, povMenu, (val) => {
        const tag = document.getElementById('pov-value-tag');
        if (tag) tag.textContent = val;
        updateParamInState('pov', val);
    });

    setupDropdown(intensityTrigger, intensityMenu, (val) => {
        const tag = document.getElementById('intensity-value-tag');
        if (tag) tag.textContent = val;
        updateParamInState('scene_intensity', val);
    });

    setupDropdown(dialogueTrigger, dialogueMenu, (val) => {
        const tag = document.getElementById('dialogue-value-tag');
        if (tag) tag.textContent = val;
        updateParamInState('dialogue_style', val);
    });

    setupDropdown(focusTrigger, focusMenu, (val) => {
        const tag = document.getElementById('focus-value-tag');
        if (tag) tag.textContent = val;
        updateParamInState('pov_focus', val);
    });


    const pushbackInput = document.getElementById('param-pushback');
    const pushbackLabel = document.getElementById('param-pushback-label');
    if (pushbackInput) {
        pushbackInput.addEventListener('input', () => {
            const num = Number(pushbackInput.value);
            if (pushbackLabel) pushbackLabel.textContent = PUSHBACK_LABELS[num] || num;
            updateParamInState('pushback', num);
        });
    }

    const wordCountInput = document.getElementById('param-word-count');
    const wordCountLabel = document.getElementById('param-word-count-label');
    if (wordCountInput) {
        wordCountInput.addEventListener('input', () => {
            if (wordCountLabel) wordCountLabel.textContent = `${wordCountInput.value} words`;
            updateParamInState('word_count', parseInt(wordCountInput.value, 10));
        });
    }

    const slidingWindowInput = document.getElementById('param-sliding-window');
    const slidingWindowLabel = document.getElementById('param-sliding-window-label');
    if (slidingWindowInput) {
        slidingWindowInput.addEventListener('input', () => {
            if (slidingWindowLabel) slidingWindowLabel.textContent = `${slidingWindowInput.value} turns`;
            updateParamInState('sliding_window', parseInt(slidingWindowInput.value, 10));
        });
    }

    const attachToggle = (el, paramKey, isMutuallyExclusiveWith = null) => {
        if (!el) return;
        el.addEventListener('click', () => {
            const isChecked = el.classList.toggle('checked');
            const updates = { [paramKey]: isChecked };
            if (isChecked && isMutuallyExclusiveWith) {
                updates[isMutuallyExclusiveWith] = false;
            }
            updateMultipleParamsInState(updates);
        });
    };

    attachToggle(document.getElementById('toggle-outline-mode'), 'outline_mode', 'premises_mode');
    attachToggle(document.getElementById('toggle-premises-mode'), 'premises_mode', 'outline_mode');
    attachToggle(document.getElementById('toggle-complication-gen'), 'complication_generator');
    attachToggle(document.getElementById('toggle-suggest-choices'), 'suggest_choices');
}

function closeAllCustomDropdowns() {
    document.querySelectorAll('.custom-select-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.custom-select-trigger').forEach(t => t.classList.remove('open'));
}

function renderDirectorNote(note) {
    const textarea = document.getElementById('director-note-input');
    if (!textarea) return;

    textarea.value = note || '';

    // Remove prior listener by replacing with clone
    const newTextarea = textarea.cloneNode(true);
    textarea.parentNode.replaceChild(newTextarea, textarea);

    newTextarea.addEventListener('input', () => {
        scheduleSave({ directorNote: newTextarea.value });
    });
}

function renderAdvancedBlocks(preset, overrides) {
    const container = document.getElementById('inspector-blocks-list');
    if (!container) return;

    const blocks = preset?.blocks || [];
    if (blocks.length === 0) {
        container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted);">No custom block modules in this preset.</span>`;
        return;
    }

    container.innerHTML = blocks.map(b => {
        const blockId = typeof b === 'object' ? b.id : b;
        const isEnabled = overrides[blockId] !== undefined ? overrides[blockId] !== false : (typeof b === 'object' ? b.enabled !== false : true);
        return `
            <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-secondary); cursor:pointer;">
                <input type="checkbox" data-block="${escapeHtml(blockId)}" ${isEnabled ? 'checked' : ''} style="accent-color:var(--accent);">
                <span>${escapeHtml(blockId)}</span>
            </label>
        `;
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', () => {
            const blockKey = box.dataset.block;
            const updatedOverrides = { ...(state.activeConversation?.blockOverrides || {}), [blockKey]: box.checked };
            scheduleSave({ blockOverrides: updatedOverrides });
        });
    });
}

function updateParamInState(key, val) {
    const currentParams = { ...(state.activeConversation?.params || {}) };
    currentParams[key] = val;
    scheduleSave({ params: currentParams });
}

function updateMultipleParamsInState(updates) {
    const currentParams = { ...(state.activeConversation?.params || {}), ...updates };
    scheduleSave({ params: currentParams });
    renderInspector();
}

function scheduleSave(partialUpdate) {
    if (!state.currentConversationId) return;

    // Immediately update local activeConversation state
    const updated = { ...state.activeConversation, ...partialUpdate };
    setState('activeConversation', updated);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        try {
            await updateConversation(state.currentConversationId, partialUpdate);
        } catch (err) {
            console.error('Failed to autosave conversation settings:', err);
            showToast('Failed to save settings', 'error');
        }
    }, 400);
}

// ==========================================================================
// Prompt Preview Compilation
// ==========================================================================

async function triggerCompilePreview() {
    if (!state.activeConversation) return;

    const compileBtn = document.getElementById('compile-preview-btn');
    const previewTextarea = document.getElementById('inspector-preview-textarea');

    if (compileBtn) {
        compileBtn.disabled = true;
        compileBtn.textContent = 'Compiling...';
    }

    try {
        const { presetId, params, blockOverrides, directorNote } = state.activeConversation;
        const result = await compilePrompt({
            presetId,
            params,
            blockOverrides,
            directorNote
        });

        compiledCache = {
            systemPrompt: result.systemPrompt || '(Empty system prompt)',
            postHistory: result.postHistory || '(Empty post-history prompt)'
        };

        if (previewTextarea) {
            previewTextarea.value = activePreviewTab === 'slot1' ? compiledCache.systemPrompt : compiledCache.postHistory;
        }

        showToast('Prompt compiled successfully', 'success', 1500);
    } catch (err) {
        console.error('Failed to compile prompt preview:', err);
        showToast(err.message || 'Compilation failed', 'error');
    } finally {
        if (compileBtn) {
            compileBtn.disabled = false;
            compileBtn.textContent = 'Compile Preview';
        }
    }
}

function switchPreviewTab(tab) {
    activePreviewTab = tab;
    const tabSlot1 = document.getElementById('tab-slot1');
    const tabSlot2 = document.getElementById('tab-slot2');
    const previewTextarea = document.getElementById('inspector-preview-textarea');

    if (tab === 'slot1') {
        tabSlot1?.classList.add('active');
        tabSlot2?.classList.remove('active');
    } else {
        tabSlot2?.classList.add('active');
        tabSlot1?.classList.remove('active');
    }

    if (previewTextarea) {
        previewTextarea.value = tab === 'slot1' ? compiledCache.systemPrompt : compiledCache.postHistory;
    }
}
