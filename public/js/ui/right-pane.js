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

    // Toggle right pane
    if (rightPaneToggleBtn && rightPane) {
        rightPaneToggleBtn.addEventListener('click', () => {
            rightPane.classList.toggle('collapsed');
            rightPane.classList.toggle('active'); // mobile toggle
        });
    }

    if (rightPaneCloseBtn && rightPane) {
        rightPaneCloseBtn.addEventListener('click', () => {
            rightPane.classList.add('collapsed');
            rightPane.classList.remove('active');
        });
    }

    // Indicator button in footer
    if (activePresetIndicatorBtn && rightPane) {
        activePresetIndicatorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rightPane.classList.remove('collapsed');
            rightPane.classList.add('active');
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

            // Parameter Label Row
            const labelRow = document.createElement('div');
            labelRow.className = 'param-label-row';

            const labelEl = document.createElement('label');
            labelEl.htmlFor = `param-control-${item.id}`;
            labelEl.innerHTML = `${item.label}`;
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
                const select = document.createElement('select');
                select.id = `param-control-${item.id}`;
                select.className = 'param-select';

                for (const opt of item.options) {
                    const optEl = document.createElement('option');
                    optEl.value = opt.value;
                    optEl.textContent = opt.label;
                    if (opt.value === val) optEl.selected = true;
                    select.appendChild(optEl);
                }

                select.addEventListener('change', safeAsync(async () => {
                    const updateObj = { params: { [item.id]: select.value } };
                    const newConv = await saveConversationSettings(convId, updateObj);
                    if (newConv) {
                        await renderRightPane(newConv);
                        triggerPreviewCompile();
                    }
                }));

                paramEl.appendChild(select);
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
