/**
 * settings-theme.js — Theme Chooser & Appearance Controller
 */

import { state, setState } from '../../state.js';
import { updateConfig } from '../../api.js';
import { showToast } from '../toast.js';

export function applyTheme(themeName) {
    const valid = ['cyan', 'teal', 'purple', 'amber', 'slate'];
    const activeTheme = valid.includes(themeName) ? themeName : 'cyan';

    valid.forEach(t => {
        document.documentElement.classList.remove(`theme-${t}`);
        document.body.classList.remove(`theme-${t}`);
    });

    document.documentElement.classList.add(`theme-${activeTheme}`);
    document.body.classList.add(`theme-${activeTheme}`);
    localStorage.setItem('ls_theme', activeTheme);
}

export function updateThemeButtonsActive(themeName) {
    document.querySelectorAll('.theme-card-btn').forEach(btn => {
        if (btn.dataset.theme === themeName) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

export function initThemeEvents() {
    document.querySelectorAll('.theme-card-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const themeName = btn.dataset.theme;
            applyTheme(themeName);
            try {
                await updateConfig({ theme: themeName });
                setState('serverConfig', { ...state.serverConfig, theme: themeName });
                updateThemeButtonsActive(themeName);
                showToast(`Theme changed to ${themeName}`, 'info', 1500);
            } catch (err) {
                console.error('Failed to save theme:', err);
            }
        });
    });
}
