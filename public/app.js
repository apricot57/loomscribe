/**
 * app.js — Main LoomScribe Application Bootstrap
 */

import { checkAuth, logout } from './js/auth.js';
import { state, setState, updateState } from './js/state.js';
import { getConfig, getEnginePresets, getEngineSchema, updateConfig } from './js/api.js';
import { initWebSocket } from './js/socket.js';
import { initSidebar, fetchAndLoadConversations } from './js/components/sidebar.js';
import { initChat } from './js/components/chat.js';
import { initInspector } from './js/components/inspector.js';
import { initModals, applyTheme } from './js/components/modals.js';
import { initCodeCopyHandler, escapeHtml } from './js/markdown.js';
import { showToast } from './js/components/toast.js';

document.addEventListener('DOMContentLoaded', () => {
    bootstrapApp().catch(err => {
        console.error('Fatal initialization error:', err);
    });
});

async function bootstrapApp() {
    // 1. Guard authentication check
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;

    // Expose global logout helper
    window.lsLogout = logout;

    // 2. Fetch server configuration, presets, and schema in parallel
    try {
        const [config, presets, schema] = await Promise.all([
            getConfig().catch(() => ({ hasKey: false, hasDeepSeekKey: false, hasOpenAIKey: false, openaiModels: [], pinnedOpenAIModels: [], activeModel: 'deepseek-v4-pro', thinkingMode: 'enabled', theme: 'cyan' })),
            getEnginePresets().catch(() => []),
            getEngineSchema().catch(() => null)
        ]);

        updateState({
            serverConfig: config,
            enginePresets: presets,
            engineSchema: schema
        });

        // 3. Apply cached or configured theme
        const savedTheme = localStorage.getItem('ls_theme') || config.theme || 'cyan';
        applyTheme(savedTheme);
    } catch (err) {
        console.error('Failed to load initial server configurations:', err);
    }

    // 4. Initialize WebSocket real-time connection
    initWebSocket();

    // 5. Initialize UI Subsystems
    initSidebar();
    initChat();
    initInspector();
    initModals();
    initCodeCopyHandler();
    initModelDropdownEvents();
    initKeyboardShortcuts();

    // 6. Fetch and load conversations
    await fetchAndLoadConversations();
}

function initModelDropdownEvents() {
    const modelChip = document.getElementById('active-model-chip');
    const menu = document.getElementById('model-dropdown-menu');

    if (!modelChip || !menu) return;

    modelChip.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !menu.classList.contains('hidden');
        if (isOpen) {
            menu.classList.add('hidden');
        } else {
            renderModelDropdownItems();
            menu.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== modelChip) {
            menu.classList.add('hidden');
        }
    });
}

function renderModelDropdownItems() {
    const menu = document.getElementById('model-dropdown-menu');
    if (!menu) return;

    const hasDeepSeek = !!(state.serverConfig?.hasDeepSeekKey || state.serverConfig?.hasKey);
    const hasOpenAI = !!state.serverConfig?.hasOpenAIKey;
    const currentModel = state.serverConfig?.activeModel || '';
    const customModels = state.serverConfig?.customModels || [];
    const pinnedOpenAI = state.serverConfig?.pinnedOpenAIModels || [];
    const discoveredOpenAI = state.serverConfig?.openaiModels || [];

    // Combine OpenAI models: pinned first, then discovered
    const allOpenAI = Array.from(new Set([...pinnedOpenAI, ...discoveredOpenAI]));
    if (allOpenAI.length === 0 && hasOpenAI) {
        allOpenAI.push('gpt-4o', 'gpt-4o-mini', 'o3-mini');
    }

    let html = '';
    let hasAnyGroup = false;

    // --- 1. OpenAI Section ---
    if (hasOpenAI && allOpenAI.length > 0) {
        html += `<div class="dropdown-section-title">OpenAI</div>`;
        allOpenAI.forEach(m => {
            const isPinned = pinnedOpenAI.includes(m);
            html += `
                <button type="button" class="dropdown-item ${currentModel === m ? 'selected' : ''}" data-model="${escapeHtml(m)}">
                    <span>${escapeHtml(m)}</span>
                    <span class="dropdown-badge">${isPinned ? 'Pinned' : 'OpenAI'}</span>
                </button>
            `;
        });
        hasAnyGroup = true;
    }

    // --- 2. DeepSeek Section ---
    if (hasDeepSeek) {
        if (hasAnyGroup) {
            html += `<div style="height:1px; background:var(--border-subtle); margin:4px 0;"></div>`;
        }
        html += `<div class="dropdown-section-title">DeepSeek</div>`;
        html += `
            <button type="button" class="dropdown-item ${currentModel === 'deepseek-v4-pro' ? 'selected' : ''}" data-model="deepseek-v4-pro">
                <span>DeepSeek V4 Pro</span>
                <span class="dropdown-badge">Max Intelligence</span>
            </button>
            <button type="button" class="dropdown-item ${currentModel === 'deepseek-v4-flash' ? 'selected' : ''}" data-model="deepseek-v4-flash">
                <span>DeepSeek V4 Flash</span>
                <span class="dropdown-badge">High Speed</span>
            </button>
        `;
        hasAnyGroup = true;
    }

    // --- 3. Custom Models Section ---
    if (customModels.length > 0) {
        if (hasAnyGroup) {
            html += `<div style="height:1px; background:var(--border-subtle); margin:4px 0;"></div>`;
        }
        html += `<div class="dropdown-section-title">Custom Endpoints</div>`;
        customModels.forEach(m => {
            html += `
                <button type="button" class="dropdown-item ${currentModel === m.id ? 'selected' : ''}" data-model="${m.id}">
                    <span>${escapeHtml(m.name)}</span>
                    <span class="dropdown-badge">Custom</span>
                </button>
            `;
        });
        hasAnyGroup = true;
    }

    if (!hasAnyGroup) {
        html = `
            <div class="dropdown-empty-item" style="padding: 10px 14px; font-size: 0.78rem; color: var(--text-muted); text-align: center;">
                <div>No active models available.</div>
                <div style="margin-top: 6px;">
                    <button type="button" class="btn btn-secondary btn-sm" id="dropdown-settings-btn" style="font-size: 0.72rem; padding: 3px 8px;">Configure in Settings</button>
                </div>
            </div>
        `;
    }

    menu.innerHTML = html;

    const settingsBtn = menu.querySelector('#dropdown-settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            menu.classList.add('hidden');
            import('./js/components/modals.js').then(m => m.openSettingsModal());
        });
    }

    menu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const model = item.dataset.model;
            menu.classList.add('hidden');
            try {
                const updated = await updateConfig({ activeModel: model });
                setState('serverConfig', { ...state.serverConfig, activeModel: updated.activeModel });
                showToast(`Switched active model to ${item.querySelector('span').textContent}`, 'info', 1500);
            } catch (err) {
                showToast('Failed to switch model', 'error');
            }
        });
    });
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? e.metaKey : e.ctrlKey;

        // Mod + N -> New Chat
        if (modKey && e.key.toLowerCase() === 'n' && !e.shiftKey) {
            e.preventDefault();
            import('./js/components/sidebar.js').then(m => m.handleNewChat());
        }

        // Mod + B -> Toggle Sidebar
        if (modKey && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            import('./js/components/sidebar.js').then(m => m.toggleSidebar());
        }

        // Mod + / -> Toggle Inspector
        if (modKey && e.key === '/') {
            e.preventDefault();
            import('./js/components/chat.js').then(m => m.toggleInspector());
        }

        // Escape -> Close Modals / Menus
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-backdrop').forEach(modal => modal.classList.add('hidden'));
            document.getElementById('model-dropdown-menu')?.classList.add('hidden');
        }
    });
}
