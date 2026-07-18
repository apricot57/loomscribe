import { state } from '../state.js';
import { 
    getEngineSchema, 
    getEnginePresets, 
    getEnginePreset, 
    compilePromptPreview 
} from '../api.js';
import { safeAsync } from './helpers.js';
import { showToast } from './modals.js';
import { loadConversations } from './sidebar.js';

let debounceTimer = null;
let currentPreviewTab = 'slot1'; // 'slot1' or 'slot2'
let compiledData = { systemPrompt: '', postHistory: '' };

const PARAM_ICONS = {
    word_count: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="6.1" x2="3" y2="6.1"></line><line x1="21" y1="12.1" x2="3" y2="12.1"></line><line x1="15.1" y1="18" x2="3" y2="18"></line></svg>`,
    pov: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    scene_intensity: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`,
    dialogue_style: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
    pov_focus: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
    complication_generator: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>`,
    suggest_choices: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>`,
    pushback: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" y1="19" x2="19" y2="13"></line><line x1="16" y1="16" x2="20" y2="20"></line><line x1="19" y1="21" x2="21" y2="19"></line><polyline points="10 14.5 3 21 3 20"></polyline><line x1="14.5" y1="10" x2="21" y2="3"></line><line x1="20" y1="3" x2="21" y2="4"></line></svg>`,
    outline_mode: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>`,
    premises_mode: `<svg class="param-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path></svg>`
};

export function clearPendingSave() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
}

/**
 * Computes a signature of the system-slot configuration.
 * Used to compare against lastAppliedEngineSignature.
 */
function computeSignature(presetId, params, blockOverrides, schema) {
    if (!presetId) return '';
    const systemParams = {};
    if (schema) {
        for (const item of schema) {
            if (item.slot === 'system') {
                systemParams[item.id] = params[item.id] !== undefined ? params[item.id] : item.default;
            }
        }
    }
    return JSON.stringify({
        presetId,
        params: systemParams,
        blockOverrides: blockOverrides || {}
    });
}

/**
 * Saves conversation settings to database.
 */
async function saveConversationSettings(convId, updateObj) {
    try {
        const res = await fetch(`/api/conversations/${convId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateObj)
        });
        if (!res.ok) {
            throw new Error(`Failed to save settings: ${res.statusText}`);
        }
        return await res.json();
    } catch (err) {
        console.error("Error saving settings:", err);
        showToast("Error saving settings", "error");
    }
}

function saveSettingsDebounced(convId, updateObj, delay = 500) {
    clearPendingSave();
    debounceTimer = setTimeout(async () => {
        await saveConversationSettings(convId, updateObj);
    }, delay);
}

/**
 * Initializes listeners for static buttons/headers in the right pane and preset picker.
 */
export function initRightPane() {
    const rightPaneToggleBtn = document.getElementById('right-pane-toggle-btn');
    const rightPaneCloseBtn = document.getElementById('right-pane-close-btn');
    const rightPane = document.getElementById('right-pane');
    const changePresetBtn = document.getElementById('change-preset-btn');
    const presetPickerModal = document.getElementById('preset-picker-modal');
    const presetPickerCloseBtn = document.getElementById('preset-picker-close-btn');
    const presetSearchInput = document.getElementById('preset-search-input');
    const refreshPreviewBtn = document.getElementById('refresh-preview-btn');
    const resetOverridesBtn = document.getElementById('reset-overrides-btn');
    const activePresetIndicatorBtn = document.getElementById('active-preset-indicator-btn');

    const updateBackdrop = () => {
        const backdrop = document.getElementById('layout-backdrop');
        if (!backdrop) return;
        const sidebar = document.getElementById('sidebar');
        const isSidebarActive = sidebar && sidebar.classList.contains('active');
        const isRightActive = rightPane && rightPane.classList.contains('active');
        if (isSidebarActive || isRightActive) {
            backdrop.classList.remove('hidden');
        } else {
            backdrop.classList.add('hidden');
        }
    };

    // Toggle right pane
    if (rightPaneToggleBtn && rightPane) {
        rightPaneToggleBtn.addEventListener('click', () => {
            rightPane.classList.toggle('collapsed');
            rightPane.classList.toggle('active'); // mobile toggle
            
            if (rightPane.classList.contains('active')) {
                // Ensure sidebar is closed when right pane opens on mobile
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.remove('active');
            }
            updateBackdrop();
        });
    }

    if (rightPaneCloseBtn && rightPane) {
        rightPaneCloseBtn.addEventListener('click', () => {
            rightPane.classList.add('collapsed');
            rightPane.classList.remove('active');
            updateBackdrop();
        });
    }

    // Indicator button in footer
    if (activePresetIndicatorBtn && rightPane) {
        activePresetIndicatorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rightPane.classList.remove('collapsed');
            rightPane.classList.add('active');
            
            // Ensure sidebar is closed when right pane opens on mobile
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('active');
            
            updateBackdrop();
        });
    }

    // Close right pane on backdrop click
    const backdrop = document.getElementById('layout-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            if (rightPane) {
                rightPane.classList.add('collapsed');
                rightPane.classList.remove('active');
            }
            updateBackdrop();
        });
    }

    // Modal close
    if (presetPickerCloseBtn && presetPickerModal) {
        presetPickerCloseBtn.addEventListener('click', () => {
            presetPickerModal.classList.add('hidden');
        });
    }

    if (presetPickerModal) {
        presetPickerModal.addEventListener('click', (e) => {
            if (e.target === presetPickerModal) {
                presetPickerModal.classList.add('hidden');
            }
        });
    }

    // Open preset picker modal
    if (changePresetBtn && presetPickerModal) {
        changePresetBtn.addEventListener('click', safeAsync(async () => {
            presetPickerModal.classList.remove('hidden');
            if (presetSearchInput) {
                presetSearchInput.value = '';
                presetSearchInput.focus();
            }
            await renderPresetPickerList();
        }));
    }

    // Search filter in preset picker
    if (presetSearchInput) {
        presetSearchInput.addEventListener('input', () => {
            filterPresetsList(presetSearchInput.value.trim().toLowerCase());
        });
    }

    // Collapsible panels
    const collapsibles = document.querySelectorAll('.collapsible-header');
    collapsibles.forEach(header => {
        header.addEventListener('click', () => {
            const section = header.parentElement;
            const body = section.querySelector('.collapsible-body');
            section.classList.toggle('open');
            body.classList.toggle('hidden');

            // Trigger compilation if preview panel is opened
            if (section.id === 'preview-collapsible' && !body.classList.contains('hidden')) {
                triggerPreviewCompile();
            }
        });
    });

    // Preview tab toggling
    const tabBtns = document.querySelectorAll('.preview-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPreviewTab = btn.dataset.tab;
            updatePreviewDisplay();
        });
    });

    // Refresh Preview Button
    if (refreshPreviewBtn) {
        refreshPreviewBtn.addEventListener('click', safeAsync(async () => {
            await triggerPreviewCompile();
        }));
    }

    // Reset Block Overrides Button
    if (resetOverridesBtn) {
        resetOverridesBtn.addEventListener('click', safeAsync(async () => {
            if (!state.currentConversationId) return;
            const updatedConv = await saveConversationSettings(state.currentConversationId, {
                blockOverrides: {}
            });
            if (updatedConv) {
                showToast("Block overrides reset to preset defaults", "success");
                await renderRightPane(updatedConv);
                triggerPreviewCompile();
            }
        }));
    }

    // Close custom dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-select-options').forEach(menu => {
                menu.classList.add('hidden');
                menu.parentElement.classList.remove('open');
            });
        }
    });
}

/**
 * Loads and renders the category-grouped presets in the picker modal.
 * Exported so it can be called by sidebar.js in the newChat context.
 */
export async function renderPresetPickerList() {
    const container = document.getElementById('preset-categories-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Loading presets...</div>';

    try {
        const presetsGrouped = await getEnginePresets();
        container.innerHTML = '';

        // Add 'None (Default)' item at the very top
        const noneSection = document.createElement('div');
        noneSection.className = 'preset-category-section';
        noneSection.innerHTML = '<div class="preset-category-title">Disable Prompt System</div>';
        const noneGrid = document.createElement('div');
        noneGrid.className = 'presets-grid';
        
        const noneBtn = document.createElement('button');
        noneBtn.className = 'preset-picker-item' + (!state.currentConversationPresetId ? ' selected' : '');
        noneBtn.innerHTML = `
            <strong>None (Default)</strong>
            <p>Runs conversation without system prompt instructions (raw chat).</p>
        `;
        noneBtn.addEventListener('click', safeAsync(async () => {
            await selectPreset(null);
        }));
        
        noneGrid.appendChild(noneBtn);
        noneSection.appendChild(noneGrid);
        container.appendChild(noneSection);

        // Grouped presets
        for (const [category, list] of Object.entries(presetsGrouped)) {
            const catSection = document.createElement('div');
            catSection.className = 'preset-category-section';
            catSection.dataset.categoryName = category.toLowerCase();
            
            const catTitle = document.createElement('div');
            catTitle.className = 'preset-category-title';
            catTitle.textContent = category.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            catSection.appendChild(catTitle);

            const grid = document.createElement('div');
            grid.className = 'presets-grid';

            for (const preset of list) {
                const item = document.createElement('button');
                item.className = 'preset-picker-item' + (state.currentConversationPresetId === preset.id ? ' selected' : '');
                item.dataset.presetTitle = preset.title.toLowerCase();
                item.dataset.presetDesc = preset.description.toLowerCase();
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom: 2px;">
                        <strong>${preset.title}</strong>
                        <span class="category-badge">${preset.category}</span>
                    </div>
                    <p>${preset.description}</p>
                `;
                item.addEventListener('click', safeAsync(async () => {
                    await selectPreset(preset.id);
                }));
                grid.appendChild(item);
            }
            catSection.appendChild(grid);
            container.appendChild(catSection);
        }
    } catch (err) {
        console.error("Failed to render presets picker:", err);
        container.innerHTML = `<div style="color: var(--accent-danger); text-align: center; padding: 20px;">Error: ${err.message}</div>`;
    }
}

/**
 * Client-side search filtering in presets list.
 */
function filterPresetsList(query) {
    const sections = document.querySelectorAll('.preset-category-section');
    sections.forEach(sec => {
        let hasVisiblePresets = false;
        const items = sec.querySelectorAll('.preset-picker-item');
        items.forEach(item => {
            // "None" option can always be visible or match search
            const title = item.dataset.presetTitle || 'none';
            const desc = item.dataset.presetDesc || '';
            if (title.includes(query) || desc.includes(query) || query === '') {
                item.style.display = '';
                hasVisiblePresets = true;
            } else {
                item.style.display = 'none';
            }
        });
        if (hasVisiblePresets) {
            sec.style.display = '';
        } else {
            sec.style.display = 'none';
        }
    });
}

/**
 * Handles selecting a preset from the picker.
 * Behaviour differs based on state.presetPickerContext:
 *   'changePreset' — updates the current conversation (existing behaviour).
 *   'newChat'      — stores the preset id and opens the title modal (step 2).
 */
async function selectPreset(presetId) {
    const modal = document.getElementById('preset-picker-modal');
    if (modal) modal.classList.add('hidden');

    const ctx = state.presetPickerContext;
    state.presetPickerContext = 'changePreset'; // always reset

    if (ctx === 'newChat') {
        // Step 2: store the chosen preset and open the title modal
        state.modalSelectedPresetId = presetId;
        const newChatModal = document.getElementById('new-chat-modal');
        const titleInput = document.getElementById('new-chat-title-input');
        if (newChatModal) {
            newChatModal.classList.remove('hidden');
            setTimeout(() => titleInput?.focus(), 100);
        }
        return;
    }

    // 'changePreset' context: update the current conversation
    if (!state.currentConversationId) return;

    let defaults = {};
    if (presetId) {
        try {
            const p = await getEnginePreset(presetId);
            defaults = p.defaults || {};
        } catch (err) {
            console.error("Error getting preset defaults:", err);
        }
    }

    const updatedConv = await saveConversationSettings(state.currentConversationId, {
        presetId,
        params: defaults,
        blockOverrides: {}
    });

    if (updatedConv) {
        showToast(presetId ? `Switched preset to: ${updatedConv.presetId}` : "Prompt engine disabled for this chat", "success");
        await renderRightPane(updatedConv);
        triggerPreviewCompile();
    }
}

/**
 * Compiles a preview using the engine API and updates preview textareas.
 */
async function triggerPreviewCompile() {
    if (!state.currentConversationId) return;

    const previewBody = document.querySelector('#preview-collapsible .collapsible-body');
    if (!previewBody || previewBody.classList.contains('hidden')) return;

    const textarea = document.getElementById('prompt-preview-textarea');
    if (textarea) textarea.placeholder = "⏳ Compiling...";

    try {
        // Fetch current database conversation details to ensure perfect accuracy
        const res = await fetch(`/api/conversations/${state.currentConversationId}`);
        if (!res.ok) throw new Error("Conversation not found");
        const conv = await res.json();

        const data = await compilePromptPreview({
            presetId: conv.presetId,
            params: conv.params,
            blockOverrides: conv.blockOverrides,
            directorNote: conv.directorNote
        });

        compiledData = data;
        updatePreviewDisplay();
    } catch (err) {
        console.error("Preview compile failed:", err);
        if (textarea) textarea.value = `Error: ${err.message}`;
    }
}

function updatePreviewDisplay() {
    const textarea = document.getElementById('prompt-preview-textarea');
    if (!textarea) return;

    if (currentPreviewTab === 'slot1') {
        textarea.value = compiledData.systemPrompt || '(Empty Slot 1)';
    } else {
        textarea.value = compiledData.postHistory || '(Empty Slot 2)';
    }
}

/**
 * Core rendering function for the right settings pane.
 * Handles parameters generation and state updates.
 */
export async function renderRightPane(conversation) {
    if (!conversation) {
        document.getElementById('preset-active-info').innerHTML = `
            <strong>No active conversation</strong>
            <p class="preset-desc">Create or open a chat thread.</p>
        `;
        document.getElementById('preset-settings-container').classList.add('hidden');
        document.getElementById('active-preset-indicator-name').textContent = 'No Preset';
        return;
    }

    const convId = conversation.id;
    const presetId = conversation.presetId;
    state.currentConversationPresetId = presetId; // Cache preset ID

    // Update active preset indicator button in footer
    const indicatorName = document.getElementById('active-preset-indicator-name');
    if (indicatorName) {
        if (presetId) {
            indicatorName.textContent = presetId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        } else {
            indicatorName.textContent = 'No Preset';
        }
    }

    const presetTitle = document.getElementById('preset-title');
    const presetCatBadge = document.getElementById('preset-category-badge');
    const presetDesc = document.getElementById('preset-desc');
    const settingsContainer = document.getElementById('preset-settings-container');

    if (!presetId) {
        // No preset selected
        if (presetTitle) presetTitle.textContent = 'No Preset Selected';
        if (presetCatBadge) presetCatBadge.classList.add('hidden');
        if (presetDesc) presetDesc.textContent = 'System instructions are disabled. General chat rules apply.';
        if (settingsContainer) settingsContainer.classList.add('hidden');
        return;
    }

    try {
        const [schema, preset] = await Promise.all([
            getEngineSchema(),
            getEnginePreset(presetId)
        ]);

        if (presetTitle) presetTitle.textContent = preset.title;
        if (presetCatBadge) {
            presetCatBadge.textContent = preset.category || 'general';
            presetCatBadge.classList.remove('hidden');
        }
        if (presetDesc) presetDesc.textContent = preset.description;
        if (settingsContainer) settingsContainer.classList.remove('hidden');

        // Parse last applied signature to identify dirty parameters
        let signatureObj = null;
        if (conversation.lastAppliedEngineSignature) {
            try {
                signatureObj = JSON.parse(conversation.lastAppliedEngineSignature);
            } catch (e) {
                // Ignore corrupt signature
            }
        }

        // Compute current signature and show/hide the warning banner
        const curSignature = computeSignature(presetId, conversation.params || {}, conversation.blockOverrides || {}, schema);
        const warningBanner = document.getElementById('settings-warning-banner');
        if (warningBanner) {
            if (signatureObj && conversation.lastAppliedEngineSignature !== curSignature) {
                warningBanner.classList.remove('hidden');
            } else {
                warningBanner.classList.add('hidden');
            }
        }

        const systemContainer = document.getElementById('system-params-container');
        const postContainer = document.getElementById('post-history-params-container');

        if (systemContainer) systemContainer.innerHTML = '';
        if (postContainer) postContainer.innerHTML = '';

        // Dynamically build parameter UI from schema
        for (const item of schema) {
            const container = item.slot === 'system' ? systemContainer : postContainer;
            if (!container) continue;

            const val = conversation.params?.[item.id] !== undefined
                ? conversation.params[item.id]
                : (preset.defaults?.[item.id] !== undefined ? preset.defaults[item.id] : item.default);

            // Check if value changed from last sent signature
            const isDirty = signatureObj && signatureObj.presetId === presetId &&
                signatureObj.params && signatureObj.params[item.id] !== undefined &&
                signatureObj.params[item.id] !== val;

            const paramEl = document.createElement('div');
            paramEl.className = 'param-item';

            // If prose bypass is active, disable narrative-specific inputs to align with compiler behavior
            const getParamVal = (id) => {
                return conversation.params?.[id] !== undefined
                    ? conversation.params[id]
                    : (preset.defaults?.[id] !== undefined ? preset.defaults[id] : schema.find(s => s.id === id)?.default);
            };
            const currentOutlineMode = getParamVal('outline_mode') === true;
            const currentPremisesMode = getParamVal('premises_mode') === true;
            const proseBypassActive = currentOutlineMode || currentPremisesMode;
            
            const isNarrativeField = ['pov', 'scene_intensity', 'dialogue_style', 'pov_focus', 'pushback'].includes(item.id);
            if (proseBypassActive && isNarrativeField) {
                paramEl.classList.add('disabled');
            }

            // Parameter Label Row
            const labelRow = document.createElement('div');
            labelRow.className = 'param-label-row';

            const labelEl = document.createElement('label');
            labelEl.htmlFor = `param-control-${item.id}`;
            const iconHtml = PARAM_ICONS[item.id] || '';
            labelEl.innerHTML = `${iconHtml}${item.label}`;
            if (isDirty) {
                const dot = document.createElement('span');
                dot.className = 'warning-dot';
                dot.title = "Settings changed since last message. DeepSeek KV cache will bust.";
                labelEl.prepend(dot);
                labelEl.innerHTML += ' ';
            }
            labelRow.appendChild(labelEl);

            const valSpan = document.createElement('span');
            valSpan.className = 'param-value';
            labelRow.appendChild(valSpan);

            paramEl.appendChild(labelRow);

            // Parameter Control
            if (item.type === 'slider') {
                const wrapper = document.createElement('div');
                wrapper.className = 'param-slider-wrapper';

                const slider = document.createElement('input');
                slider.type = 'range';
                slider.id = `param-control-${item.id}`;
                slider.className = 'param-range';
                slider.min = item.min;
                slider.max = item.max;
                slider.step = item.step || 1;
                slider.value = val;

                // Update text representation
                const updateValText = (v) => {
                    if (item.labels) {
                        const idx = Math.round(v) - item.min;
                        valSpan.textContent = item.labels[idx] || v;
                    } else {
                        valSpan.textContent = `${v}${item.unit ? ' ' + item.unit : ''}`;
                    }
                };
                updateValText(val);

                // Slider events
                slider.addEventListener('input', () => {
                    updateValText(slider.value);
                });

                slider.addEventListener('change', safeAsync(async () => {
                    const numVal = Number(slider.value);
                    const updateObj = { params: { [item.id]: numVal } };
                    const newConv = await saveConversationSettings(convId, updateObj);
                    if (newConv) {
                        await renderRightPane(newConv);
                        triggerPreviewCompile();
                    }
                }));

                wrapper.appendChild(slider);

                // Slider Labels (min/max boundaries)
                if (item.labels) {
                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'param-slider-labels';
                    const left = document.createElement('span');
                    left.textContent = item.labels[0] || '';
                    const right = document.createElement('span');
                    right.textContent = item.labels[item.labels.length - 1] || '';
                    labelDiv.appendChild(left);
                    labelDiv.appendChild(right);
                    wrapper.appendChild(labelDiv);
                }

                paramEl.appendChild(wrapper);

            } else if (item.type === 'select') {
                const dropdownWrapper = document.createElement('div');
                dropdownWrapper.className = 'custom-select-wrapper';
                dropdownWrapper.id = `param-wrapper-${item.id}`;

                const triggerBtn = document.createElement('button');
                triggerBtn.type = 'button';
                triggerBtn.className = 'custom-select-trigger';
                triggerBtn.id = `param-control-${item.id}`;

                // Find active option label
                const activeOpt = item.options.find(opt => opt.value === val) || item.options[0];
                const activeLabel = activeOpt ? activeOpt.label : val;

                const triggerText = document.createElement('span');
                triggerText.className = 'custom-select-trigger-text';
                triggerText.textContent = activeLabel;
                triggerBtn.appendChild(triggerText);

                // Add a chevron icon
                const chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                chevronSvg.setAttribute('class', 'dropdown-chevron');
                chevronSvg.setAttribute('viewBox', '0 0 24 24');
                chevronSvg.setAttribute('fill', 'none');
                chevronSvg.setAttribute('stroke', 'currentColor');
                chevronSvg.setAttribute('stroke-width', '2');
                chevronSvg.setAttribute('stroke-linecap', 'round');
                chevronSvg.setAttribute('stroke-linejoin', 'round');
                
                const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                polyline.setAttribute('points', '6 9 12 15 18 9');
                chevronSvg.appendChild(polyline);
                triggerBtn.appendChild(chevronSvg);

                // Create custom options menu
                const optionsMenu = document.createElement('div');
                optionsMenu.className = 'custom-select-options hidden';

                for (const opt of item.options) {
                    const optBtn = document.createElement('button');
                    optBtn.type = 'button';
                    optBtn.className = 'custom-select-option';
                    if (opt.value === val) optBtn.classList.add('active');
                    optBtn.textContent = opt.label;
                    optBtn.dataset.value = opt.value;

                    optBtn.addEventListener('click', safeAsync(async (e) => {
                        e.stopPropagation();
                        const updateObj = { params: { [item.id]: opt.value } };
                        const newConv = await saveConversationSettings(convId, updateObj);
                        if (newConv) {
                            await renderRightPane(newConv);
                            triggerPreviewCompile();
                        }
                    }));
                    optionsMenu.appendChild(optBtn);
                }

                // Toggle menu on trigger click
                triggerBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close all other open custom select options first
                    document.querySelectorAll('.custom-select-options').forEach(menu => {
                        if (menu !== optionsMenu) {
                            menu.classList.add('hidden');
                            menu.parentElement.classList.remove('open');
                        }
                    });
                    
                    const isOpen = !optionsMenu.classList.contains('hidden');
                    if (isOpen) {
                        optionsMenu.classList.add('hidden');
                        dropdownWrapper.classList.remove('open');
                    } else {
                        optionsMenu.classList.remove('hidden');
                        dropdownWrapper.classList.add('open');
                    }
                });

                dropdownWrapper.appendChild(triggerBtn);
                dropdownWrapper.appendChild(optionsMenu);
                paramEl.appendChild(dropdownWrapper);
                valSpan.textContent = ''; // Select hides value span since option is visible

            } else if (item.type === 'toggle') {
                paramEl.classList.add('param-toggle-row');

                const labelToggle = document.createElement('label');
                labelToggle.className = 'switch';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `param-control-${item.id}`;
                checkbox.checked = !!val;

                const sliderSpan = document.createElement('span');
                sliderSpan.className = 'slider-toggle';

                checkbox.addEventListener('change', safeAsync(async () => {
                    const updateObj = { params: { [item.id]: checkbox.checked } };
                    const newConv = await saveConversationSettings(convId, updateObj);
                    if (newConv) {
                        await renderRightPane(newConv);
                        triggerPreviewCompile();
                    }
                }));

                labelToggle.appendChild(checkbox);
                labelToggle.appendChild(sliderSpan);
                paramEl.appendChild(labelToggle);
                valSpan.textContent = val ? 'ON' : 'OFF';
            }

            container.appendChild(paramEl);
        }

        // Render Director's Note
        const directorNoteTextarea = document.getElementById('director-note-textarea');
        if (directorNoteTextarea) {
            directorNoteTextarea.value = conversation.directorNote || '';
            
            // Clean listeners and re-bind input with debounced save
            directorNoteTextarea.oninput = () => {
                saveSettingsDebounced(convId, { directorNote: directorNoteTextarea.value }, 800);
            };
        }

        // Render Advanced Blocks list
        await renderAdvancedBlocks(preset, conversation.blockOverrides || {}, signatureObj);

    } catch (err) {
        console.error("Failed to render right pane:", err);
        if (settingsContainer) {
            settingsContainer.innerHTML = `<div style="color:var(--accent-danger); font-size:0.85rem; padding: 10px;">Error rendering settings: ${err.message}</div>`;
        }
    }
}

/**
 * Renders the block override options under Advanced Blocks section.
 */
async function renderAdvancedBlocks(preset, overrides, signatureObj) {
    const listContainer = document.getElementById('advanced-blocks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const presetBlocks = preset.blocks || [];
    if (presetBlocks.length === 0) {
        listContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.78rem; text-align:center; padding:10px;">No blocks in preset.</div>';
        return;
    }

    for (const pb of presetBlocks) {
        const val = overrides[pb.id] !== undefined ? overrides[pb.id] : !!pb.enabled;

        // Check if override state is dirty compared to lastAppliedEngineSignature overrides
        let isDirty = false;
        if (signatureObj && signatureObj.blockOverrides) {
            const sigVal = signatureObj.blockOverrides[pb.id] !== undefined 
                ? signatureObj.blockOverrides[pb.id] 
                : !!pb.enabled;
            if (sigVal !== val) {
                isDirty = true;
            }
        }

        const blockEl = document.createElement('div');
        blockEl.className = 'block-override-item';

        const metaDiv = document.createElement('div');
        metaDiv.className = 'block-meta';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'block-title';
        titleSpan.innerHTML = pb.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (isDirty) {
            const dot = document.createElement('span');
            dot.className = 'warning-dot';
            dot.style.marginRight = '6px';
            dot.title = "Override state modified since last message. DeepSeek KV cache will bust.";
            titleSpan.prepend(dot);
        }
        metaDiv.appendChild(titleSpan);

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'block-badge';
        // Show indicator if active due to user override or preset default
        if (overrides[pb.id] !== undefined) {
            badgeSpan.textContent = 'User Overridden';
            badgeSpan.style.color = 'var(--accent-color)';
        } else {
            badgeSpan.textContent = pb.enabled ? 'Enabled by Default' : 'Disabled by Default';
        }
        metaDiv.appendChild(badgeSpan);

        blockEl.appendChild(metaDiv);

        // Toggle switch
        const labelToggle = document.createElement('label');
        labelToggle.className = 'switch';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = val;

        const sliderSpan = document.createElement('span');
        sliderSpan.className = 'slider-toggle';

        checkbox.addEventListener('change', safeAsync(async () => {
            const newOverrides = { ...overrides, [pb.id]: checkbox.checked };
            const newConv = await saveConversationSettings(state.currentConversationId, {
                blockOverrides: newOverrides
            });
            if (newConv) {
                await renderRightPane(newConv);
                triggerPreviewCompile();
            }
        }));

        labelToggle.appendChild(checkbox);
        labelToggle.appendChild(sliderSpan);
        blockEl.appendChild(labelToggle);

        listContainer.appendChild(blockEl);
    }
}
