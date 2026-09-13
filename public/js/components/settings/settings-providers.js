/**
 * settings-providers.js — Provider API Keys, Discovery & Model Pinning Controller
 */

import { state, setState } from '../../state.js';
import {
    updateConfig,
    fetchOpenAIModels,
    fetchGlmModels
} from '../../api.js';
import { showToast } from '../toast.js';
import { escapeHtml } from '../../markdown.js';

export const GLM_THINKING_LABELS = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    max: 'Max',
    disabled: 'Disabled'
};

export function getCollapsedProviders() {
    try {
        const saved = localStorage.getItem('loomscribe_collapsed_providers');
        return saved ? JSON.parse(saved) : null;
    } catch (e) {
        return null;
    }
}

export function saveProviderCollapsedState() {
    try {
        const collapsed = [];
        document.querySelectorAll('.provider-card').forEach(card => {
            if (card.classList.contains('collapsed')) {
                collapsed.push(card.id);
            }
        });
        localStorage.setItem('loomscribe_collapsed_providers', JSON.stringify(collapsed));
    } catch (e) {}
}

export function restoreProviderCollapsedState() {
    const config = state.serverConfig || {};
    const saved = getCollapsedProviders();

    document.querySelectorAll('.provider-card').forEach(card => {
        const id = card.id;
        if (saved !== null && Array.isArray(saved)) {
            if (saved.includes(id)) {
                card.classList.add('collapsed');
            } else {
                card.classList.remove('collapsed');
            }
        } else {
            let shouldCollapse = false;
            if (id === 'provider-card-openai' && !config.hasOpenAIKey) {
                shouldCollapse = true;
            } else if (id === 'provider-card-deepseek' && !config.hasKey && !config.hasDeepSeekKey) {
                shouldCollapse = true;
            }
            if (shouldCollapse) {
                card.classList.add('collapsed');
            } else {
                card.classList.remove('collapsed');
            }
        }
    });
}

export function initProviderEvents(onRefresh) {
    // --- GLM Thinking / Reasoning Mode Selection (Custom App Dropdown) ---
    const glmThinkingTrigger = document.getElementById('glm-thinking-trigger');
    const glmThinkingMenu = document.getElementById('glm-thinking-menu');
    const glmThinkingValue = document.getElementById('glm-thinking-value');
    const glmThinkingBadge = document.getElementById('glm-thinking-badge');

    if (glmThinkingTrigger && glmThinkingMenu) {
        glmThinkingTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !glmThinkingMenu.classList.contains('hidden');
            if (isOpen) {
                glmThinkingMenu.classList.add('hidden');
                glmThinkingTrigger.classList.remove('open');
            } else {
                glmThinkingMenu.classList.remove('hidden');
                glmThinkingTrigger.classList.add('open');
            }
        });

        glmThinkingMenu.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                const val = opt.dataset.value;
                glmThinkingMenu.classList.add('hidden');
                glmThinkingTrigger.classList.remove('open');
                try {
                    const updated = await updateConfig({ glmThinkingMode: val });
                    setState('serverConfig', {
                        ...state.serverConfig,
                        glmThinkingMode: updated.glmThinkingMode || val
                    });
                    if (glmThinkingValue) glmThinkingValue.textContent = GLM_THINKING_LABELS[val] || val;
                    if (glmThinkingBadge) glmThinkingBadge.textContent = val.toUpperCase();
                    glmThinkingMenu.querySelectorAll('.custom-select-option').forEach(o => {
                        o.classList.toggle('selected', o.dataset.value === val);
                    });
                    showToast(`GLM Thinking level set to ${val}`, 'success');
                } catch (err) {
                    showToast('Failed to update GLM thinking level', 'error');
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!glmThinkingMenu.contains(e.target) && !glmThinkingTrigger.contains(e.target)) {
                glmThinkingMenu.classList.add('hidden');
                glmThinkingTrigger.classList.remove('open');
            }
        });
    }

    // --- Collapsible Provider Cards ---
    document.querySelectorAll('.provider-card-header').forEach(header => {
        header.addEventListener('click', () => {
            const card = header.closest('.provider-card');
            if (!card) return;
            card.classList.toggle('collapsed');
            saveProviderCollapsedState();
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
                if (typeof onRefresh === 'function') onRefresh();
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
                if (typeof onRefresh === 'function') onRefresh();
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
                if (typeof onRefresh === 'function') onRefresh();
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
            if (typeof onRefresh === 'function') onRefresh();
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

    // --- GLM (Z.AI) Key Save / Remove / Visibility / Fetch / Pin ---
    const saveGlmBtn = document.getElementById('save-glm-key-btn');
    const removeGlmBtn = document.getElementById('remove-glm-key-btn');
    const toggleGlmBtn = document.getElementById('toggle-glm-key-visibility-btn');
    const fetchGlmBtn = document.getElementById('fetch-glm-models-btn');
    const addPinnedGlmBtn = document.getElementById('add-pinned-glm-btn');
    const pinnedGlmInput = document.getElementById('add-pinned-glm-input');

    if (saveGlmBtn) {
        saveGlmBtn.addEventListener('click', async () => {
            const keyInput = document.getElementById('settings-glm-key-input');
            const key = keyInput?.value.trim();
            if (!key) {
                showToast('Please enter a GLM API key', 'warning');
                return;
            }
            try {
                const updated = await updateConfig({ glmApiKey: key });
                setState('serverConfig', { 
                    ...state.serverConfig, 
                    hasGlmKey: updated.hasGlmKey,
                    glmModels: updated.glmModels,
                    pinnedGlmModels: updated.pinnedGlmModels
                });
                keyInput.value = '';
                showToast('GLM API Key saved', 'success');
                if (typeof onRefresh === 'function') onRefresh();
            } catch (err) {
                showToast('Failed to save GLM API key', 'error');
            }
        });
    }

    if (removeGlmBtn) {
        removeGlmBtn.addEventListener('click', async () => {
            if (!confirm('Remove GLM API key from server?')) return;
            try {
                const updated = await updateConfig({ glmApiKey: '' });
                setState('serverConfig', { 
                    ...state.serverConfig, 
                    hasGlmKey: updated.hasGlmKey
                });
                showToast('GLM API Key removed', 'info');
                if (typeof onRefresh === 'function') onRefresh();
            } catch (err) {
                showToast('Failed to remove GLM API key', 'error');
            }
        });
    }

    if (toggleGlmBtn) {
        toggleGlmBtn.addEventListener('click', () => {
            const input = document.getElementById('settings-glm-key-input');
            if (input) input.type = input.type === 'password' ? 'text' : 'password';
        });
    }

    if (fetchGlmBtn) {
        fetchGlmBtn.addEventListener('click', async () => {
            fetchGlmBtn.disabled = true;
            fetchGlmBtn.innerHTML = `<span>Fetching...</span>`;
            try {
                const data = await fetchGlmModels();
                const models = data.models || [];
                setState('serverConfig', {
                    ...state.serverConfig,
                    glmModels: models,
                    hasGlmKey: true
                });
                showToast(`Found ${models.length} active GLM models!`, 'success');
                if (typeof onRefresh === 'function') onRefresh();
            } catch (err) {
                showToast(err.message || 'Failed to fetch GLM models', 'error');
            } finally {
                fetchGlmBtn.disabled = false;
                fetchGlmBtn.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    <span>Fetch Models</span>
                `;
            }
        });
    }

    const handleAddPinnedGlmModel = async () => {
        if (!pinnedGlmInput) return;
        const modelName = pinnedGlmInput.value.trim();
        if (!modelName) return;
        const currentPinned = state.serverConfig?.pinnedGlmModels || [];
        if (currentPinned.includes(modelName)) {
            showToast(`Model ${modelName} is already pinned`, 'warning');
            return;
        }
        const updatedList = [...currentPinned, modelName];
        try {
            const res = await updateConfig({ pinnedGlmModels: updatedList });
            setState('serverConfig', {
                ...state.serverConfig,
                pinnedGlmModels: res.pinnedGlmModels || updatedList
            });
            pinnedGlmInput.value = '';
            showToast(`Pinned model ${modelName} added`, 'success');
            if (typeof onRefresh === 'function') onRefresh();
        } catch (err) {
            showToast('Failed to pin model', 'error');
        }
    };

    if (addPinnedGlmBtn) {
        addPinnedGlmBtn.addEventListener('click', handleAddPinnedGlmModel);
    }
    if (pinnedGlmInput) {
        pinnedGlmInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddPinnedGlmModel();
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
                if (typeof onRefresh === 'function') onRefresh();
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
                if (typeof onRefresh === 'function') onRefresh();
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
}

export function populateProviderValues(config, onRefresh) {
    // GLM Thinking / Reasoning Mode (Custom Select)
    const glmThinkingValueEl = document.getElementById('glm-thinking-value');
    const glmThinkingBadgeEl = document.getElementById('glm-thinking-badge');
    const glmThinkingMenuEl = document.getElementById('glm-thinking-menu');
    const currentGlmThinking = config.glmThinkingMode || 'low';
    if (glmThinkingValueEl) glmThinkingValueEl.textContent = GLM_THINKING_LABELS[currentGlmThinking] || currentGlmThinking;
    if (glmThinkingBadgeEl) glmThinkingBadgeEl.textContent = currentGlmThinking.toUpperCase();
    if (glmThinkingMenuEl) {
        glmThinkingMenuEl.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === currentGlmThinking);
        });
    }

    // Restore provider card collapsed state
    restoreProviderCollapsedState();

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
                        if (typeof onRefresh === 'function') onRefresh();
                        showToast(`Unpinned ${target}`, 'info', 1500);
                    } catch (err) {
                        showToast('Failed to unpin model', 'error');
                    }
                });
            });
        }
    }

    // OpenAI Models Count Status & Datalist
    const countStatusEl = document.getElementById('openai-models-count-status');
    const openaiDatalist = document.getElementById('openai-discovered-datalist');
    const discoveredOpenAI = config.openaiModels || [];
    if (openaiDatalist) {
        openaiDatalist.innerHTML = discoveredOpenAI.map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
    }
    if (countStatusEl) {
        if (discoveredOpenAI.length > 0) {
            countStatusEl.innerHTML = `⚡ <strong>${discoveredOpenAI.length}</strong> active models discovered (select suggestions from input or type to pin)`;
        } else if (config.hasOpenAIKey) {
            countStatusEl.innerHTML = `Click "Fetch Models" above to query all available models for your API key.`;
        } else {
            countStatusEl.innerHTML = ``;
        }
    }

    // GLM Key Status
    const glmStatusEl = document.getElementById('glm-key-status');
    if (glmStatusEl) {
        if (config.hasGlmKey) {
            glmStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--success); font-size:0.75rem; font-weight:500;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Configured</span>
                </div>
            `;
        } else {
            glmStatusEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--text-muted); font-size:0.75rem;">
                    <span>Missing</span>
                </div>
            `;
        }
    }

    // Pinned GLM Models Tags
    const pinnedGlmContainer = document.getElementById('glm-pinned-tags');
    if (pinnedGlmContainer) {
        const pinnedGlmList = config.pinnedGlmModels || [];
        if (pinnedGlmList.length === 0) {
            pinnedGlmContainer.innerHTML = `<span style="font-size:0.72rem; color:var(--text-muted);">No pinned models yet (e.g. glm-4.7-flash).</span>`;
        } else {
            pinnedGlmContainer.innerHTML = pinnedGlmList.map(model => `
                <span class="pinned-tag">
                    <span>${escapeHtml(model)}</span>
                    <span class="pinned-tag-remove" data-model="${escapeHtml(model)}" title="Unpin model">✕</span>
                </span>
            `).join('');

            pinnedGlmContainer.querySelectorAll('.pinned-tag-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const target = btn.dataset.model;
                    const updated = (config.pinnedGlmModels || []).filter(m => m !== target);
                    try {
                        const res = await updateConfig({ pinnedGlmModels: updated });
                        setState('serverConfig', { ...state.serverConfig, pinnedGlmModels: res.pinnedGlmModels || updated });
                        if (typeof onRefresh === 'function') onRefresh();
                        showToast(`Unpinned ${target}`, 'info', 1500);
                    } catch (err) {
                        showToast('Failed to unpin model', 'error');
                    }
                });
            });
        }
    }

    // GLM Models Count Status & Datalist
    const glmCountStatusEl = document.getElementById('glm-models-count-status');
    const glmDatalist = document.getElementById('glm-discovered-datalist');
    const discoveredGlm = config.glmModels || [];
    if (glmDatalist) {
        glmDatalist.innerHTML = discoveredGlm.map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
    }
    if (glmCountStatusEl) {
        if (discoveredGlm.length > 0) {
            glmCountStatusEl.innerHTML = `⚡ <strong>${discoveredGlm.length}</strong> active models discovered (select suggestions from input or type to pin)`;
        } else if (config.hasGlmKey) {
            glmCountStatusEl.innerHTML = `Click "Fetch Models" above to query all available models for your API key.`;
        } else {
            glmCountStatusEl.innerHTML = ``;
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
}
