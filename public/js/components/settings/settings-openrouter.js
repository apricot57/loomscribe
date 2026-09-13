/**
 * settings-openrouter.js — OpenRouter Settings & Model Management Controller
 *
 * Coordinates:
 * - API Key management (save, remove, toggle visibility, status badge)
 * - Pinned model addition and quick suggestion pills
 * - Live model pricing and context window metadata rows
 * - Single-model and bulk pricing refresh against OpenRouter API
 */

import { state, setState } from '../../state.js';
import { updateConfig, fetchOpenRouterModels, fetchOpenRouterModelInfo } from '../../api.js';
import { showToast } from '../toast.js';
import { escapeHtml } from '../../markdown.js';

const POPULAR_SUGGESTIONS = [
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'meta/muse-spark-1.3-contributor', label: 'Muse Spark 1.3' },
    { id: 'sao10k/l3-lunaris-8b', label: 'Lunaris 8B' },
    { id: 'xiaomi/mimo-v2.5', label: 'Xiaomi MiMo-V2.5' }
];

export function formatContextLength(len) {
    if (!len || isNaN(len)) return '—';
    if (len >= 1000000) {
        const m = (len / 1000000).toFixed(len % 1000000 === 0 ? 0 : 1);
        return `${m}M`;
    }
    return `${Math.round(len / 1000)}k`;
}

export function formatCostPerMillion(cost) {
    if (cost === undefined || cost === null || isNaN(cost)) return '—';
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${Number(cost).toFixed(4)}`;
    return `$${Number(cost).toFixed(2)}`;
}

let refreshCallback = null;

export function initOpenRouterEvents(onRefresh) {
    refreshCallback = onRefresh;

    const saveKeyBtn = document.getElementById('save-openrouter-key-btn');
    const removeKeyBtn = document.getElementById('remove-openrouter-key-btn');
    const toggleKeyBtn = document.getElementById('toggle-openrouter-key-visibility-btn');
    const addModelBtn = document.getElementById('add-openrouter-model-btn') || document.getElementById('add-pinned-openrouter-btn');
    const addModelInput = document.getElementById('add-openrouter-model-input') || document.getElementById('add-pinned-openrouter-input');
    const refreshAllBtn = document.getElementById('refresh-all-openrouter-btn');

    // Save Key
    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', async () => {
            const keyInput = document.getElementById('settings-openrouter-key-input');
            const key = keyInput?.value.trim();
            if (!key) {
                showToast('Please enter an OpenRouter API key', 'warning');
                return;
            }
            try {
                const updated = await updateConfig({ openrouterApiKey: key });
                setState('serverConfig', {
                    ...state.serverConfig,
                    hasOpenRouterKey: updated.hasOpenRouterKey,
                    pinnedOpenRouterModels: updated.pinnedOpenRouterModels || state.serverConfig.pinnedOpenRouterModels,
                    openrouterModelDetails: updated.openrouterModelDetails || state.serverConfig.openrouterModelDetails
                });
                if (keyInput) keyInput.value = '';
                showToast('OpenRouter API Key saved', 'success');
                if (typeof refreshCallback === 'function') refreshCallback();
            } catch (err) {
                showToast('Failed to save OpenRouter API key', 'error');
            }
        });
    }

    // Remove Key
    if (removeKeyBtn) {
        removeKeyBtn.addEventListener('click', async () => {
            if (!confirm('Remove OpenRouter API key from server?')) return;
            try {
                const updated = await updateConfig({ openrouterApiKey: '' });
                setState('serverConfig', {
                    ...state.serverConfig,
                    hasOpenRouterKey: updated.hasOpenRouterKey
                });
                showToast('OpenRouter API Key removed', 'info');
                if (typeof refreshCallback === 'function') refreshCallback();
            } catch (err) {
                showToast('Failed to remove OpenRouter API key', 'error');
            }
        });
    }

    // Toggle Key Visibility
    if (toggleKeyBtn) {
        toggleKeyBtn.addEventListener('click', () => {
            const input = document.getElementById('settings-openrouter-key-input');
            if (input) input.type = input.type === 'password' ? 'text' : 'password';
        });
    }

    // Add Model Handler
    const handleAddModel = async (specifiedId = null) => {
        const inputEl = addModelInput || document.getElementById('add-openrouter-model-input');
        const modelId = (specifiedId || inputEl?.value || '').trim();

        if (!modelId) {
            showToast('Please enter a model identifier (e.g. deepseek/deepseek-v4-flash)', 'warning');
            return;
        }

        const currentPinned = state.serverConfig?.pinnedOpenRouterModels || [];
        if (currentPinned.includes(modelId)) {
            showToast(`Model ${modelId} is already added`, 'warning');
            return;
        }

        const currentDetails = { ...(state.serverConfig?.openrouterModelDetails || {}) };
        const updatedPinned = [...currentPinned, modelId];

        // Optimistically add and fetch pricing
        if (inputEl) inputEl.value = '';
        showToast(`Adding ${modelId}...`, 'info', 1500);

        try {
            // Attempt to fetch model info from OpenRouter
            let fetchedDetails = null;
            try {
                const infoRes = await fetchOpenRouterModelInfo(modelId);
                if (infoRes.success && infoRes.model) {
                    fetchedDetails = {
                        name: infoRes.model.name,
                        contextLength: infoRes.model.contextLength,
                        promptCostPerMillion: infoRes.model.promptCostPerMillion,
                        completionCostPerMillion: infoRes.model.completionCostPerMillion,
                        reasoning: infoRes.model.reasoning,
                        reasoningEffort: infoRes.model.reasoning?.mandatory ? (infoRes.model.reasoning.default_effort || 'minimal') : undefined,
                        supportedParameters: infoRes.model.supportedParameters || [],
                        lastUpdated: infoRes.model.lastUpdated
                    };
                }
            } catch (e) {
                // If specific fetch failed, attempt fallback direct OpenRouter API
                try {
                    const fallback = await fetch(`https://openrouter.ai/api/v1/models`);
                    if (fallback.ok) {
                        const fbJson = await fallback.json();
                        const found = (fbJson.data || []).find(m => m.id === modelId || m.id.toLowerCase() === modelId.toLowerCase());
                        if (found) {
                            fetchedDetails = {
                                name: found.name || found.id,
                                contextLength: found.context_length || 0,
                                promptCostPerMillion: Number(((parseFloat(found.pricing?.prompt) || 0) * 1000000).toFixed(6)),
                                completionCostPerMillion: Number(((parseFloat(found.pricing?.completion) || 0) * 1000000).toFixed(6)),
                                reasoning: found.reasoning || (found.supported_parameters?.includes('reasoning') ? { mandatory: false } : undefined),
                                reasoningEffort: found.reasoning?.mandatory ? (found.reasoning.default_effort || 'minimal') : undefined,
                                supportedParameters: found.supported_parameters || [],
                                lastUpdated: Date.now()
                            };
                        }
                    }
                } catch (e2) {}
            }

            if (fetchedDetails) {
                currentDetails[modelId] = fetchedDetails;
            } else {
                currentDetails[modelId] = {
                    name: modelId,
                    contextLength: 0,
                    promptCostPerMillion: 0,
                    completionCostPerMillion: 0,
                    lastUpdated: Date.now()
                };
            }

            const res = await updateConfig({
                pinnedOpenRouterModels: updatedPinned,
                openrouterModelDetails: currentDetails
            });

            setState('serverConfig', {
                ...state.serverConfig,
                pinnedOpenRouterModels: res.pinnedOpenRouterModels || updatedPinned,
                openrouterModelDetails: res.openrouterModelDetails || currentDetails
            });

            showToast(`Added model ${modelId}`, 'success');
            if (typeof refreshCallback === 'function') refreshCallback();
        } catch (err) {
            console.error('Failed to add OpenRouter model:', err);
            showToast('Failed to add model: ' + err.message, 'error');
        }
    };

    if (addModelBtn) {
        addModelBtn.addEventListener('click', () => handleAddModel());
    }

    if (addModelInput) {
        addModelInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddModel();
            }
        });
    }

    // Refresh All Models
    if (refreshAllBtn) {
        refreshAllBtn.addEventListener('click', async () => {
            const pinned = state.serverConfig?.pinnedOpenRouterModels || [];
            if (pinned.length === 0) {
                showToast('No OpenRouter models to refresh', 'info');
                return;
            }

            refreshAllBtn.classList.add('loading');
            showToast('Refreshing pricing for all models...', 'info', 2000);

            try {
                const res = await fetchOpenRouterModels(true);
                const allModels = res.models || res.data || [];
                const currentDetails = { ...(state.serverConfig?.openrouterModelDetails || {}) };

                let updatedCount = 0;
                pinned.forEach(id => {
                    const match = allModels.find(m => m.id === id || m.id.toLowerCase() === id.toLowerCase());
                    if (match) {
                        const prev = currentDetails[id] || {};
                        const reasoning = match.reasoning || (match.supported_parameters?.includes('reasoning') ? { mandatory: false } : prev.reasoning);
                        currentDetails[id] = {
                            ...prev,
                            name: match.name || id,
                            contextLength: match.contextLength || match.context_length || 0,
                            promptCostPerMillion: match.promptCostPerMillion !== undefined 
                                ? match.promptCostPerMillion 
                                : Number(((parseFloat(match.pricing?.prompt) || 0) * 1000000).toFixed(6)),
                            completionCostPerMillion: match.completionCostPerMillion !== undefined 
                                ? match.completionCostPerMillion 
                                : Number(((parseFloat(match.pricing?.completion) || 0) * 1000000).toFixed(6)),
                            reasoning,
                            reasoningEffort: prev.reasoningEffort || (reasoning?.mandatory ? (reasoning.default_effort || 'minimal') : undefined),
                            supportedParameters: match.supportedParameters || match.supported_parameters || prev.supportedParameters || [],
                            lastUpdated: Date.now()
                        };
                        updatedCount++;
                    }
                });

                const saved = await updateConfig({ openrouterModelDetails: currentDetails });
                setState('serverConfig', {
                    ...state.serverConfig,
                    openrouterModelDetails: saved.openrouterModelDetails || currentDetails
                });

                showToast(`Refreshed pricing for ${updatedCount} model(s)`, 'success');
                if (typeof refreshCallback === 'function') refreshCallback();
            } catch (err) {
                console.error('Refresh all error:', err);
                showToast('Failed to refresh models: ' + err.message, 'error');
            } finally {
                refreshAllBtn.classList.remove('loading');
            }
        });
    }

    // Suggestions click delegation
    const suggestionsWrap = document.getElementById('openrouter-suggestions');
    if (suggestionsWrap) {
        suggestionsWrap.addEventListener('click', (e) => {
            const pill = e.target.closest('.suggestion-pill');
            if (!pill) return;
            const modelId = pill.dataset.model;
            if (modelId) {
                handleAddModel(modelId);
            }
        });
    }
}

export function populateOpenRouterValues(config, onRefresh) {
    if (onRefresh) refreshCallback = onRefresh;

    // 1. Key Status Indicator
    const keyStatusEl = document.getElementById('openrouter-key-status');
    if (keyStatusEl) {
        if (config.hasOpenRouterKey) {
            keyStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--success); font-size:0.75rem;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Configured</span>
                </div>
            `;
        } else {
            keyStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--text-muted); font-size:0.75rem;">
                    <span>Missing</span>
                </div>
            `;
        }
    }

    // 2. Render Suggestions Pills
    const suggestionsContainer = document.getElementById('openrouter-suggestions');
    if (suggestionsContainer) {
        const pinnedList = config.pinnedOpenRouterModels || [];
        suggestionsContainer.innerHTML = POPULAR_SUGGESTIONS.map(s => {
            const isPinned = pinnedList.includes(s.id);
            return `
                <button type="button" class="suggestion-pill ${isPinned ? 'is-pinned' : ''}" data-model="${escapeHtml(s.id)}" title="${isPinned ? 'Already added' : 'Click to add ' + escapeHtml(s.id)}">
                    <span>${escapeHtml(s.label)}</span>
                    ${isPinned ? '<span class="pill-check">✓</span>' : '<span class="pill-add">+</span>'}
                </button>
            `;
        }).join('');
    }

    // 3. Render Models List Rows
    const listContainer = document.getElementById('openrouter-models-list');
    if (listContainer) {
        const pinnedList = config.pinnedOpenRouterModels || [];
        const detailsMap = config.openrouterModelDetails || {};

        if (pinnedList.length === 0) {
            listContainer.innerHTML = `
                <div class="openrouter-empty-state">
                    <div style="font-weight: 500; margin-bottom: 4px;">No OpenRouter Models Pinned</div>
                    <div style="font-size: 0.74rem; color: var(--text-muted);">
                        Select any popular suggestion above or paste any OpenRouter model identifier to add it to your model list.
                    </div>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = pinnedList.map(modelId => {
            const details = detailsMap[modelId] || {};
            const displayName = details.name || modelId;
            const contextStr = formatContextLength(details.contextLength);
            const isFree = details.promptCostPerMillion === 0 && details.completionCostPerMillion === 0 && details.lastUpdated;
            const promptCostStr = isFree ? 'Free' : formatCostPerMillion(details.promptCostPerMillion) + '/M';
            const compCostStr = isFree ? 'Free' : formatCostPerMillion(details.completionCostPerMillion) + '/M';

            const reasoning = details.reasoning;
            const hasReasoning = !!reasoning || (Array.isArray(details.supportedParameters) && details.supportedParameters.includes('reasoning'));
            const isMandatory = reasoning?.mandatory === true;
            const supportedEfforts = Array.isArray(reasoning?.supported_efforts) ? reasoning.supported_efforts : [];
            const currentEffort = details.reasoningEffort || (isMandatory ? (reasoning?.default_effort || 'minimal') : 'default');

            let reasoningHtml = '';
            if (!hasReasoning) {
                reasoningHtml = `<span class="metric-val text-muted" style="font-size:0.72rem; font-weight:normal;">Not supported</span>`;
            } else if (supportedEfforts.length > 0) {
                const options = [
                    ...(!isMandatory ? [`<option value="disabled" ${currentEffort === 'disabled' ? 'selected' : ''}>Off</option>`] : []),
                    `<option value="default" ${currentEffort === 'default' ? 'selected' : ''}>Default (${escapeHtml(reasoning?.default_effort || 'auto')})</option>`,
                    ...supportedEfforts.map(eff => `<option value="${escapeHtml(eff)}" ${currentEffort === eff ? 'selected' : ''}>${escapeHtml(eff)}</option>`)
                ];
                reasoningHtml = `
                    <div style="display:flex; align-items:center; gap:4px;">
                        <select class="form-select reasoning-select" data-model="${escapeHtml(modelId)}">
                            ${options.join('')}
                        </select>
                        ${isMandatory ? '<span class="reasoning-mandatory-badge" title="Reasoning is mandatory for this model">Req</span>' : ''}
                    </div>
                `;
            } else {
                const isEnabled = currentEffort !== 'disabled';
                reasoningHtml = `
                    <div style="display:flex; align-items:center; gap:4px;">
                        <select class="form-select reasoning-select" data-model="${escapeHtml(modelId)}">
                            ${!isMandatory ? `<option value="disabled" ${!isEnabled ? 'selected' : ''}>Off</option>` : ''}
                            <option value="enabled" ${isEnabled ? 'selected' : ''}>On</option>
                        </select>
                        ${isMandatory ? '<span class="reasoning-mandatory-badge" title="Reasoning is mandatory for this model">Req</span>' : ''}
                    </div>
                `;
            }

            return `
                <div class="openrouter-model-card" data-model="${escapeHtml(modelId)}">
                    <div class="openrouter-model-info-wrap">
                        <div class="openrouter-model-title-row">
                            <span class="openrouter-model-name">${escapeHtml(displayName)}</span>
                            ${isFree ? '<span class="free-badge">Free</span>' : ''}
                        </div>
                        <div class="openrouter-model-id" title="Model Identifier">${escapeHtml(modelId)}</div>
                    </div>

                    <div class="openrouter-model-metrics">
                        <div class="metric-item">
                            <span class="metric-label">Context</span>
                            <span class="metric-val">${escapeHtml(contextStr)}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Prompt</span>
                            <span class="metric-val ${isFree ? 'text-free' : ''}">${escapeHtml(promptCostStr)}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Completion</span>
                            <span class="metric-val ${isFree ? 'text-free' : ''}">${escapeHtml(compCostStr)}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Reasoning</span>
                            <span class="metric-val">${reasoningHtml}</span>
                        </div>
                    </div>

                    <div class="openrouter-model-actions">
                        <button type="button" class="btn btn-secondary btn-sm refresh-model-btn" data-model="${escapeHtml(modelId)}" title="Refresh pricing & capabilities" aria-label="Refresh model">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        </button>
                        <button type="button" class="btn btn-ghost btn-sm remove-model-btn" data-model="${escapeHtml(modelId)}" title="Remove model" aria-label="Remove model">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach Row Event Listeners: Reasoning change, Refresh & Remove
        listContainer.querySelectorAll('.reasoning-select').forEach(select => {
            select.addEventListener('change', async () => {
                const targetModel = select.dataset.model;
                const newEffort = select.value;
                if (!targetModel) return;

                const currentDetails = { ...(state.serverConfig?.openrouterModelDetails || {}) };
                if (currentDetails[targetModel]) {
                    currentDetails[targetModel] = {
                        ...currentDetails[targetModel],
                        reasoningEffort: newEffort
                    };
                } else {
                    currentDetails[targetModel] = {
                        name: targetModel,
                        reasoningEffort: newEffort
                    };
                }

                try {
                    const saved = await updateConfig({ openrouterModelDetails: currentDetails });
                    setState('serverConfig', {
                        ...state.serverConfig,
                        openrouterModelDetails: saved.openrouterModelDetails || currentDetails
                    });
                    showToast(`Updated reasoning for ${targetModel} to ${newEffort}`, 'success', 1500);
                } catch (err) {
                    showToast('Failed to update reasoning setting', 'error');
                }
            });
        });

        listContainer.querySelectorAll('.refresh-model-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetModel = btn.dataset.model;
                if (!targetModel) return;

                btn.classList.add('loading');
                try {
                    const infoRes = await fetchOpenRouterModelInfo(targetModel, true, true);
                    if (infoRes.success && infoRes.model) {
                        const currentDetails = { ...(state.serverConfig?.openrouterModelDetails || {}) };
                        const prev = currentDetails[targetModel] || {};
                        currentDetails[targetModel] = {
                            ...prev,
                            name: infoRes.model.name,
                            contextLength: infoRes.model.contextLength,
                            promptCostPerMillion: infoRes.model.promptCostPerMillion,
                            completionCostPerMillion: infoRes.model.completionCostPerMillion,
                            reasoning: infoRes.model.reasoning || prev.reasoning,
                            reasoningEffort: prev.reasoningEffort || (infoRes.model.reasoning?.mandatory ? (infoRes.model.reasoning.default_effort || 'minimal') : undefined),
                            supportedParameters: infoRes.model.supportedParameters || prev.supportedParameters || [],
                            lastUpdated: infoRes.model.lastUpdated
                        };

                        const saved = await updateConfig({ openrouterModelDetails: currentDetails });
                        setState('serverConfig', {
                            ...state.serverConfig,
                            openrouterModelDetails: saved.openrouterModelDetails || currentDetails
                        });
                        showToast(`Updated pricing for ${targetModel}`, 'success');
                        if (typeof refreshCallback === 'function') refreshCallback();
                    }
                } catch (err) {
                    showToast(`Failed to refresh ${targetModel}: ${err.message}`, 'error');
                } finally {
                    btn.classList.remove('loading');
                }
            });
        });

        listContainer.querySelectorAll('.remove-model-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetModel = btn.dataset.model;
                if (!targetModel) return;

                const currentPinned = state.serverConfig?.pinnedOpenRouterModels || [];
                const updatedPinned = currentPinned.filter(m => m !== targetModel);
                const currentDetails = { ...(state.serverConfig?.openrouterModelDetails || {}) };
                delete currentDetails[targetModel];

                try {
                    const res = await updateConfig({
                        pinnedOpenRouterModels: updatedPinned,
                        openrouterModelDetails: currentDetails
                    });

                    setState('serverConfig', {
                        ...state.serverConfig,
                        pinnedOpenRouterModels: res.pinnedOpenRouterModels || updatedPinned,
                        openrouterModelDetails: res.openrouterModelDetails || currentDetails
                    });

                    showToast(`Removed model ${targetModel}`, 'info', 1500);
                    if (typeof refreshCallback === 'function') refreshCallback();
                } catch (err) {
                    showToast('Failed to remove model', 'error');
                }
            });
        });
    }
}
