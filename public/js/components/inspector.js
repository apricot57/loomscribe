/**
 * inspector.js — Prompt Engine Inspector Pane & Scenario Settings
 */

import { state, setState, subscribe } from '../state.js';
import { updateConversation, compilePrompt, getEngineSchema, getEnginePresets, createEnginePreset, scaffoldWorld } from '../api.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../markdown.js';

let debounceTimer = null;
let activePreviewTab = 'slot1'; // 'slot1' | 'slot2'
let compiledCache = { systemPrompt: '', postHistory: '' };
let currentForgedBlueprint = null;
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
    // Quick-Add World Rule Event Handlers
    const ruleInput = document.getElementById('inspector-rule-input');
    const addRuleBtn = document.getElementById('inspector-add-rule-btn');
    const handleAddRule = () => {
        const text = ruleInput?.value.trim();
        if (!text || !state.activeConversation) return;
        const currentRules = Array.isArray(state.activeConversation.worldRules) ? [...state.activeConversation.worldRules] : [];
        const newRule = {
            id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text,
            enabled: true
        };
        currentRules.push(newRule);
        ruleInput.value = '';
        state.activeConversation.worldRules = currentRules;
        scheduleSave({ worldRules: currentRules });
        renderWorldRules(state.activeConversation);
        showToast('Added setting rule', 'success', 1200);
    };
    if (addRuleBtn) addRuleBtn.addEventListener('click', handleAddRule);
    if (ruleInput) {
        ruleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddRule();
            }
        });
    }

    // AI World Forge Modal Handlers
    const aiForgeBtn = document.getElementById('inspector-ai-forge-btn');
    const forgeModal = document.getElementById('world-forge-modal');
    const forgeCloseBtn = document.getElementById('world-forge-close-btn');
    const forgeSubmitBtn = document.getElementById('world-forge-submit-btn');
    const forgeApplyBtn = document.getElementById('world-forge-apply-btn');
    const forgeSavePresetBtn = document.getElementById('world-forge-save-preset-btn');
    const forgeBaseSelect = document.getElementById('world-forge-base-preset');
    const forgePromptInput = document.getElementById('world-forge-prompt');
    const forgePreviewContainer = document.getElementById('world-forge-preview-container');

    const openForgeModal = () => {
        if (!forgeModal) return;
        forgeModal.classList.remove('hidden');
        if (forgePreviewContainer) forgePreviewContainer.classList.add('hidden');
        currentForgedBlueprint = null;

        if (forgeBaseSelect) {
            const presets = state.enginePresets || [];
            let optionsHtml = '<option value="">-- No Base (Generate from Scratch) --</option>';
            presets.forEach(p => {
                const isCurrent = state.activeConversation?.presetId === p.id;
                optionsHtml += `<option value="${escapeHtml(p.id)}" ${isCurrent ? 'selected' : ''}>${escapeHtml(p.title)} (${escapeHtml(p.category || 'General')})</option>`;
            });
            forgeBaseSelect.innerHTML = optionsHtml;
        }
        if (forgePromptInput) {
            forgePromptInput.value = '';
            forgePromptInput.focus();
        }
    };

    const closeForgeModal = () => {
        if (forgeModal) forgeModal.classList.add('hidden');
    };

    if (aiForgeBtn) aiForgeBtn.addEventListener('click', openForgeModal);
    if (forgeCloseBtn) forgeCloseBtn.addEventListener('click', closeForgeModal);
    if (forgeModal) {
        forgeModal.addEventListener('click', (e) => {
            if (e.target === forgeModal) closeForgeModal();
        });
    }

    if (forgeSubmitBtn) {
        forgeSubmitBtn.addEventListener('click', async () => {
            const prompt = forgePromptInput?.value.trim();
            if (!prompt) {
                showToast('Please enter a world concept description', 'warning');
                return;
            }
            const basePresetId = forgeBaseSelect?.value || undefined;

            forgeSubmitBtn.disabled = true;
            forgeSubmitBtn.innerHTML = `<span>Forging Blueprint...</span>`;

            try {
                const res = await scaffoldWorld({ prompt, basePresetId });
                currentForgedBlueprint = res.world;

                const titleEl = document.getElementById('world-forge-preview-title');
                const catEl = document.getElementById('world-forge-preview-cat');
                const descEl = document.getElementById('world-forge-preview-desc');
                const rulesEl = document.getElementById('world-forge-preview-rules');

                if (titleEl) titleEl.textContent = currentForgedBlueprint.title;
                if (catEl) catEl.textContent = currentForgedBlueprint.category || 'Custom World';
                if (descEl) descEl.textContent = currentForgedBlueprint.description || '';
                if (rulesEl && Array.isArray(currentForgedBlueprint.world_rules)) {
                    rulesEl.innerHTML = currentForgedBlueprint.world_rules.map(r => `<li>${escapeHtml(r)}</li>`).join('');
                }

                if (forgePreviewContainer) forgePreviewContainer.classList.remove('hidden');
                showToast('World blueprint forged!', 'success');
            } catch (err) {
                console.error('World forge error:', err);
                showToast(err.message || 'Failed to forge world', 'error');
            } finally {
                forgeSubmitBtn.disabled = false;
                forgeSubmitBtn.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    <span>Generate Blueprint</span>
                `;
            }
        });
    }

    if (forgeApplyBtn) {
        forgeApplyBtn.addEventListener('click', async () => {
            if (!currentForgedBlueprint || !state.currentConversationId) return;

            const rules = (currentForgedBlueprint.world_rules || []).map((r, idx) => ({
                id: `r_${Date.now()}_${idx}`,
                text: typeof r === 'string' ? r : (r.text || ''),
                enabled: true
            }));

            const updatePayload = {
                title: currentForgedBlueprint.title || state.activeConversation.title,
                worldRules: rules
            };
            if (currentForgedBlueprint.defaults) {
                updatePayload.params = { ...(state.activeConversation.params || {}), ...currentForgedBlueprint.defaults };
            }

            try {
                const updated = await updateConversation(state.currentConversationId, updatePayload);
                setState('activeConversation', updated);
                renderInspector(updated);
                closeForgeModal();
                showToast(`Applied world: ${currentForgedBlueprint.title}`, 'success');
            } catch (err) {
                showToast('Failed to apply world blueprint', 'error');
            }
        });
    }

    if (forgeSavePresetBtn) {
        forgeSavePresetBtn.addEventListener('click', async () => {
            if (!currentForgedBlueprint) return;
            const safeId = (currentForgedBlueprint.title || 'custom_world')
                .toLowerCase()
                .replace(/[^a-z0-9_]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 32);

            try {
                await createEnginePreset({
                    id: safeId,
                    title: currentForgedBlueprint.title,
                    category: currentForgedBlueprint.category || 'Custom',
                    description: currentForgedBlueprint.description || '',
                    system_body: currentForgedBlueprint.system_body || '',
                    world_rules: currentForgedBlueprint.world_rules || [],
                    defaults: currentForgedBlueprint.defaults || {}
                });
                const presets = await getEnginePresets();
                setState('enginePresets', presets);
                showToast(`Saved preset "${currentForgedBlueprint.title}" globally`, 'success');
            } catch (err) {
                showToast(err.message || 'Failed to save preset', 'error');
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
    renderWorldRules(conv);
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
function renderWorldRules(conv) {
    const countBadge = document.getElementById('inspector-rules-count');
    const rulesList = document.getElementById('inspector-rules-list');
    if (!rulesList) return;

    const rules = Array.isArray(conv?.worldRules) ? conv.worldRules : [];
    const activeCount = rules.filter(r => r && r.enabled !== false).length;

    if (countBadge) {
        countBadge.textContent = String(activeCount);
    }

    if (rules.length === 0) {
        rulesList.innerHTML = `<div style="text-align:center; padding:12px 6px; color:var(--text-muted); font-size:0.75rem;">No world rules set yet. Add a rule above or use AI Forge.</div>`;
        return;
    }

    rulesList.innerHTML = rules.map((rule, idx) => {
        const isEnabled = rule.enabled !== false;
        const ruleId = escapeHtml(rule.id || `r_${idx}`);
        const ruleText = escapeHtml(rule.text || '');
        return `
            <div class="rule-item-card ${isEnabled ? '' : 'disabled'}" data-rule-id="${ruleId}">
                <input type="checkbox" class="rule-toggle-checkbox" ${isEnabled ? 'checked' : ''} title="Toggle active constraint" />
                <span class="rule-text-editable" contenteditable="true" spellcheck="false" title="Click to edit rule">${ruleText}</span>
                <button class="rule-delete-btn" title="Delete rule" type="button">×</button>
            </div>
        `;
    }).join('');

    // Attach event listeners for each rule card
    rulesList.querySelectorAll('.rule-item-card').forEach((card) => {
        const ruleId = card.dataset.ruleId;
        const ruleIndex = rules.findIndex(r => String(r.id) === ruleId);
        if (ruleIndex === -1) return;

        const checkbox = card.querySelector('.rule-toggle-checkbox');
        const textSpan = card.querySelector('.rule-text-editable');
        const deleteBtn = card.querySelector('.rule-delete-btn');

        if (checkbox) {
            checkbox.addEventListener('change', () => {
                const isChecked = checkbox.checked;
                rules[ruleIndex].enabled = isChecked;
                card.classList.toggle('disabled', !isChecked);
                const newActiveCount = rules.filter(r => r && r.enabled !== false).length;
                if (countBadge) countBadge.textContent = String(newActiveCount);
                scheduleSave({ worldRules: rules });
            });
        }

        if (textSpan) {
            const handleTextSave = () => {
                const newText = textSpan.textContent.trim();
                if (newText && newText !== rules[ruleIndex].text) {
                    rules[ruleIndex].text = newText;
                    scheduleSave({ worldRules: rules });
                } else if (!newText) {
                    textSpan.textContent = rules[ruleIndex].text;
                }
            };
            textSpan.addEventListener('blur', handleTextSave);
            textSpan.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    textSpan.blur();
                }
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                const updatedRules = rules.filter(r => String(r.id) !== ruleId);
                conv.worldRules = updatedRules;
                scheduleSave({ worldRules: updatedRules });
                renderWorldRules(conv);
                showToast('Rule removed', 'info', 1200);
            });
        }
    });
}

function renderParameterControls(params, schema) {
    const container = document.getElementById('inspector-params-container');
    if (!container) return;

    const povVal = params.pov || 'third';
    const wordCountVal = params.word_count !== undefined ? Number(params.word_count) : 1200;

    const povOptions = [
        { value: 'third', label: 'Close Third Person' },
        { value: 'first', label: 'Deep First Person' },
        { value: 'second', label: 'Second Person ("You")' },
        { value: 'author', label: 'Omniscient Narrator' },
        { value: 'off', label: 'Preset Default / Off' }
    ];

    const currentPovLabel = povOptions.find(o => o.value === povVal)?.label || 'Close Third Person';

    const outlineMode = params.outline_mode === true || params.outline_mode === 'true';
    const premisesMode = params.premises_mode === true || params.premises_mode === 'true';
    const complicationGen = params.complication_generator === true || params.complication_generator === 'true' || params.complication_gen === true || params.complication_gen === 'true';
    const suggestChoices = params.suggest_choices === true || params.suggest_choices === 'true';
    const proseBypassActive = outlineMode || premisesMode;
    const isPremisesMode = premisesMode;

    container.innerHTML = `
        <div class="param-group ${proseBypassActive ? 'bypassed' : ''}">
            <div class="param-header">
                <span>Narrative Perspective</span>
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
        <div class="param-group ${isPremisesMode ? 'bypassed' : ''}">
            <div class="param-header">
                <span>Target Length</span>
                <span class="param-value-tag ${isPremisesMode ? 'bypassed' : ''}" id="param-word-count-label">${isPremisesMode ? 'Fixed (6 premises)' : `${wordCountVal} words`}</span>
            </div>
            <input type="range" class="param-range" id="param-word-count" min="600" max="3000" step="100" value="${wordCountVal}" ${isPremisesMode ? 'disabled title="Target length is overridden in Premises Mode"' : ''}>
        </div>

        <div class="param-group">
            <div class="param-header" style="margin-bottom: 2px;">
                <span>Story & Interactive Modes</span>
            </div>
            <div class="param-toggle-grid">
                <div class="param-toggle-card ${suggestChoices ? 'checked' : ''}" id="toggle-suggest-choices" title="Generate 3 clickable continuation choices at the end of each turn">
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Suggest Choices</span>
                    <div class="toggle-switch-pill"></div>
                </div>
                <div class="param-toggle-card ${complicationGen ? 'checked' : ''} ${proseBypassActive ? 'bypassed' : ''}" id="toggle-complication-gen" ${proseBypassActive ? 'title="Complications bypassed in Narrative Mode"' : 'title="Inject unexpected friction or obstacles before scene resolution"'}>
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Complications</span>
                    <div class="toggle-switch-pill"></div>
                </div>
                <div class="param-toggle-card ${outlineMode ? 'checked' : ''}" id="toggle-outline-mode" title="Plot and brainstorm story beats without writing full prose">
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Outline Mode</span>
                    <div class="toggle-switch-pill"></div>
                </div>
                <div class="param-toggle-card ${premisesMode ? 'checked' : ''}" id="toggle-premises-mode" title="Generate 6 diverse premise setups and scene openers">
                    <span style="font-size:0.75rem; color:var(--text-primary); font-weight:500;">Premises Mode</span>
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
    const wordCountInput = document.getElementById('param-word-count');
    const wordCountLabel = document.getElementById('param-word-count-label');
    if (wordCountInput) {
        wordCountInput.addEventListener('input', () => {
            if (wordCountLabel) wordCountLabel.textContent = `${wordCountInput.value} words`;
            updateParamInState('word_count', parseInt(wordCountInput.value, 10));
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
        const { presetId, params, blockOverrides, directorNote, worldRules } = state.activeConversation;
        const result = await compilePrompt({
            presetId,
            params,
            blockOverrides,
            directorNote,
            worldRules: worldRules || []
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
