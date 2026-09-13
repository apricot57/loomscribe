/**
 * preset-picker.js — Preset Picker Dialog & Categorized Selection Grid
 */

import { state, setState } from '../state.js';
import { updateConversation } from '../api.js';
import { showToast } from './toast.js';
import { renderInspector } from './inspector.js';
import { escapeHtml } from '../markdown.js';

let activePickerCategory = 'all';

export function formatCategoryTitle(cat) {
    if (!cat) return 'General';
    return cat
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

export function openPresetPickerModal() {
    const modal = document.getElementById('preset-picker-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    renderPresetPickerGrid();
}

export function closePresetPickerModal() {
    const modal = document.getElementById('preset-picker-modal');
    if (modal) modal.classList.add('hidden');
}

export function initPresetPickerEvents() {
    const modal = document.getElementById('preset-picker-modal');
    const closeBtn = document.getElementById('preset-picker-close-btn');
    const searchInput = document.getElementById('preset-picker-search');
    const manageBtn = document.getElementById('picker-manage-presets-btn');

    if (closeBtn) closeBtn.addEventListener('click', closePresetPickerModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closePresetPickerModal();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderPresetPickerGrid(e.target.value.trim().toLowerCase());
        });
    }

    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            closePresetPickerModal();
            import('./preset-manager.js').then(m => m.openPresetManagerModal());
        });
    }
}

export function renderPresetPickerGrid(query = '') {
    const container = document.getElementById('preset-picker-grid');
    const tabsContainer = document.getElementById('preset-category-tabs');
    if (!container) return;

    const allPresets = state.enginePresets || [];

    // Extract all unique categories and counts
    const categoryCounts = {};
    allPresets.forEach(p => {
        const cat = p.category || 'general';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const uniqueCategories = Object.keys(categoryCounts).sort();

    // Render Category Filter Tabs
    if (tabsContainer) {
        let tabsHtml = `
            <button class="category-tab-chip ${activePickerCategory === 'all' ? 'active' : ''}" data-cat="all" type="button">
                <span>All</span>
                <span class="tab-badge">${allPresets.length}</span>
            </button>
        `;
        uniqueCategories.forEach(cat => {
            tabsHtml += `
                <button class="category-tab-chip ${activePickerCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}" type="button">
                    <span>${escapeHtml(formatCategoryTitle(cat))}</span>
                    <span class="tab-badge">${categoryCounts[cat]}</span>
                </button>
            `;
        });
        tabsContainer.innerHTML = tabsHtml;

        tabsContainer.querySelectorAll('.category-tab-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                activePickerCategory = chip.dataset.cat;
                renderPresetPickerGrid(query);
            });
        });
    }

    // Filter presets
    let filtered = allPresets;
    if (activePickerCategory !== 'all') {
        filtered = filtered.filter(p => (p.category || 'general') === activePickerCategory);
    }

    if (query) {
        filtered = filtered.filter(p =>
            (p.title || '').toLowerCase().includes(query) ||
            (p.description || '').toLowerCase().includes(query) ||
            (p.category || '').toLowerCase().includes(query)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:0.85rem;">No presets found matching current filter</div>`;
        return;
    }

    // Group by category
    const grouped = {};
    filtered.forEach(p => {
        const cat = p.category || 'general';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    let sectionsHtml = '';

    // If searching or in 'all' / 'general', show the "None / Default" preset option
    const showNone = activePickerCategory === 'all' || activePickerCategory === 'general' || (query && ('none'.includes(query) || 'standard'.includes(query) || 'default'.includes(query)));
    if (showNone) {
        const isNoneActive = !state.activeConversation?.presetId;
        sectionsHtml += `
            <div class="preset-category-section">
                <div class="preset-category-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="category-section-title">Standard / Default</span>
                    </div>
                    <div class="category-section-divider"></div>
                </div>
                <div class="preset-starters">
                    <div class="starter-card preset-picker-item ${isNoneActive ? 'selected' : ''}" data-id="none" style="${isNoneActive ? 'border-color:var(--accent); background:var(--accent-subtle);' : ''}">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                            <span class="starter-title">None (Standard Chat)</span>
                            <span class="preset-badge-cat" style="background:rgba(255,255,255,0.06); color:var(--text-muted); border-color:var(--border-subtle);">No Preset</span>
                        </div>
                        <div class="starter-desc">Standard AI assistant with no scenario-specific prompt instructions or block overrides.</div>
                    </div>
                </div>
            </div>
        `;
    }

    for (const cat of Object.keys(grouped).sort()) {
        const list = grouped[cat];
        sectionsHtml += `
            <div class="preset-category-section">
                <div class="preset-category-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="category-section-title">${escapeHtml(formatCategoryTitle(cat))}</span>
                        <span class="category-badge-count">${list.length}</span>
                    </div>
                    <div class="category-section-divider"></div>
                </div>
                <div class="preset-starters">
                    ${list.map(p => {
                        const isCurrent = state.activeConversation?.presetId === p.id;
                        return `
                            <div class="starter-card preset-picker-item ${isCurrent ? 'selected' : ''}" data-id="${p.id}" style="${isCurrent ? 'border-color:var(--accent); background:var(--accent-subtle);' : ''}">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                                    <span class="starter-title">${escapeHtml(p.title)}</span>
                                    <span class="preset-badge-cat">${escapeHtml(formatCategoryTitle(p.category || 'General'))}</span>
                                </div>
                                <div class="starter-desc">${escapeHtml(p.description || '')}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = sectionsHtml;

    container.querySelectorAll('.preset-picker-item').forEach(card => {
        card.addEventListener('click', async () => {
            const presetId = card.dataset.id;
            if (!state.currentConversationId) return;

            if (presetId === 'none') {
                try {
                    const updated = await updateConversation(state.currentConversationId, {
                        presetId: null,
                        params: {},
                        blockOverrides: {},
                        directorNote: ''
                    });
                    setState('activeConversation', updated);
                    renderInspector(updated);
                    closePresetPickerModal();
                    showToast('Preset cleared (Standard Chat)', 'info');
                } catch (err) {
                    showToast('Failed to clear preset', 'error');
                }
                return;
            }

            const chosen = state.enginePresets?.find(p => p.id === presetId);
            if (!chosen) return;

            try {
                let worldRulesPayload = undefined;
                if (Array.isArray(chosen.world_rules) && chosen.world_rules.length > 0) {
                    worldRulesPayload = chosen.world_rules.map((rule, idx) => ({
                        id: `r_${Date.now()}_${idx}`,
                        text: typeof rule === 'string' ? rule : (rule.text || ''),
                        enabled: rule.enabled !== false
                    }));
                }

                const updateData = {
                    presetId,
                    params: { ...(chosen.defaults || {}) }
                };
                if (worldRulesPayload) {
                    updateData.worldRules = worldRulesPayload;
                }

                const updated = await updateConversation(state.currentConversationId, updateData);
                setState('activeConversation', updated);
                renderInspector(updated);
                closePresetPickerModal();
                showToast(`Applied preset: ${chosen.title}`, 'success');
            } catch (err) {
                showToast('Failed to apply preset', 'error');
            }
        });
    });
}
