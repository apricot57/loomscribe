/**
 * settings-modal.js — Settings Dialog Coordinator
 *
 * Orchestrates modular settings subsystems:
 * - ./settings/settings-theme.js: Theme chooser & appearance
 * - ./settings/settings-providers.js: Provider keys, discovery & pinning
 * - ./settings/settings-sliding-window.js: Sliding context window controls
 * - ./settings/settings-custom-models.js: Custom models CRUD & list rendering
 */

import { state, setState } from '../state.js';
import { getConfig } from '../api.js';
import { applyTheme, updateThemeButtonsActive, initThemeEvents } from './settings/settings-theme.js';
import { initProviderEvents, populateProviderValues } from './settings/settings-providers.js';
import { initOpenRouterEvents, populateOpenRouterValues } from './settings/settings-openrouter.js';
import { initSlidingWindowEvents, populateSlidingWindowValues } from './settings/settings-sliding-window.js';
import {
    renderCustomModelsList,
    resetCustomModelForm,
    initCustomModelEvents
} from './settings/settings-custom-models.js';

let activeSettingsTab = 'providers';

export async function openSettingsModal(tab = 'providers') {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    switchSettingsTab(tab);
    populateSettingsValues();

    try {
        const freshConfig = await getConfig();
        setState('serverConfig', freshConfig);
        populateSettingsValues();
    } catch (err) {}
}

export function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
}

export function switchSettingsTab(tabName) {
    activeSettingsTab = tabName;
    document.querySelectorAll('.settings-nav-item, .settings-tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.settings-tab-panel').forEach(panel => {
        if (panel.id === `tab-panel-${tabName}`) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
}

export function populateSettingsValues() {
    const config = state.serverConfig || {};

    populateProviderValues(config, populateSettingsValues);
    populateOpenRouterValues(config, populateSettingsValues);
    populateSlidingWindowValues(config);
    renderCustomModelsList();
    updateThemeButtonsActive(config.theme || 'cyan');
}

export function initSettingsModalEvents() {
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-modal-close-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeSettingsModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSettingsModal();
        });
    }

    // Tabs switching
    document.querySelectorAll('.settings-nav-item, .settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchSettingsTab(btn.dataset.tab);
        });
    });

    // Initialize sub-modules
    initProviderEvents(populateSettingsValues);
    initOpenRouterEvents(populateSettingsValues);
    initSlidingWindowEvents(populateSettingsValues);
    initCustomModelEvents();
    initThemeEvents();
}

// Re-export public API for seamless backwards compatibility
export {
    renderCustomModelsList,
    resetCustomModelForm,
    applyTheme,
    updateThemeButtonsActive
};
