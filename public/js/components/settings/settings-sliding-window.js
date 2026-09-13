/**
 * settings-sliding-window.js — Sliding Context Window Controller
 */

import { state, setState } from '../../state.js';
import { updateConfig } from '../../api.js';
import { showToast } from '../toast.js';

let draftSlidingWindowEnabled = false;

export function updateSwDraftUI(enabled, size) {
    draftSlidingWindowEnabled = enabled;
    const swToggleBtn = document.getElementById('sliding-window-toggle-btn');
    const swBadge = document.getElementById('sliding-window-badge');
    const swStatus = document.getElementById('sliding-window-status');
    const swControlsWrap = document.getElementById('sliding-window-controls-wrap');
    const swDisabledBanner = document.getElementById('sliding-window-disabled-banner');
    const swToggleDesc = document.getElementById('sliding-window-toggle-desc');

    if (swToggleBtn) {
        swToggleBtn.textContent = enabled ? 'ON' : 'OFF';
        swToggleBtn.className = enabled ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }
    if (swBadge) {
        swBadge.textContent = enabled ? `${size} msgs` : 'Off';
    }
    if (swStatus) {
        if (enabled) {
            swStatus.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--success); font-size:0.75rem; font-weight:500;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>${size} Messages</span>
                </div>
            `;
        } else {
            swStatus.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; color:var(--warning); font-size:0.75rem; font-weight:500;">
                    <span>Full History</span>
                </div>
            `;
        }
    }
    if (swToggleDesc) {
        swToggleDesc.textContent = enabled
            ? `Enabled (limits history to last ${size} messages)`
            : 'Disabled (sends complete chat history)';
    }
    if (swControlsWrap) {
        if (enabled) {
            swControlsWrap.classList.remove('hidden');
        } else {
            swControlsWrap.classList.add('hidden');
        }
    }
    if (swDisabledBanner) {
        if (enabled) {
            swDisabledBanner.classList.add('hidden');
        } else {
            swDisabledBanner.classList.remove('hidden');
        }
    }
}

export function initSlidingWindowEvents(onRefresh) {
    const swToggleBtn = document.getElementById('sliding-window-toggle-btn');
    const swSizeSlider = document.getElementById('sliding-window-size-slider');
    const swSizeInput = document.getElementById('sliding-window-size-input');
    const saveSwBtn = document.getElementById('save-sliding-window-btn');
    const resetSwBtn = document.getElementById('reset-sliding-window-btn');

    if (swToggleBtn) {
        swToggleBtn.addEventListener('click', () => {
            const newEnabled = !draftSlidingWindowEnabled;
            const curSize = parseInt(swSizeInput?.value, 10) || 16;
            updateSwDraftUI(newEnabled, curSize);
        });
    }

    if (swSizeSlider && swSizeInput) {
        swSizeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10) || 16;
            swSizeInput.value = val;
            updateSwDraftUI(draftSlidingWindowEnabled, val);
        });

        swSizeInput.addEventListener('input', (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val)) return;
            if (val < 1) val = 1;
            if (val > 200) val = 200;
            swSizeSlider.value = Math.min(Math.max(val, 2), 100);
            updateSwDraftUI(draftSlidingWindowEnabled, val);
        });
    }

    if (saveSwBtn) {
        saveSwBtn.addEventListener('click', async () => {
            let sizeVal = parseInt(swSizeInput?.value, 10);
            if (isNaN(sizeVal) || sizeVal < 1) sizeVal = 16;
            if (sizeVal > 500) sizeVal = 500;

            try {
                const updated = await updateConfig({
                    slidingWindowEnabled: draftSlidingWindowEnabled,
                    slidingWindowSize: sizeVal
                });
                setState('serverConfig', {
                    ...state.serverConfig,
                    slidingWindowEnabled: updated.slidingWindowEnabled,
                    slidingWindowSize: updated.slidingWindowSize
                });
                if (typeof onRefresh === 'function') onRefresh();
                showToast(
                    draftSlidingWindowEnabled
                        ? `Sliding context window set to ${sizeVal} messages`
                        : 'Sliding window disabled (full history mode active)',
                    'success'
                );
            } catch (err) {
                showToast('Failed to save context window settings', 'error');
            }
        });
    }

    if (resetSwBtn) {
        resetSwBtn.addEventListener('click', async () => {
            try {
                const updated = await updateConfig({
                    slidingWindowEnabled: true,
                    slidingWindowSize: 16
                });
                setState('serverConfig', {
                    ...state.serverConfig,
                    slidingWindowEnabled: updated.slidingWindowEnabled,
                    slidingWindowSize: updated.slidingWindowSize
                });
                if (typeof onRefresh === 'function') onRefresh();
                showToast('Context window reset to default (16 messages)', 'info', 1500);
            } catch (err) {
                showToast('Failed to reset context window settings', 'error');
            }
        });
    }
}

export function populateSlidingWindowValues(config) {
    const isSwEnabled = config.slidingWindowEnabled === true;
    const swSize = typeof config.slidingWindowSize === 'number' && config.slidingWindowSize > 0 ? config.slidingWindowSize : 16;
    draftSlidingWindowEnabled = isSwEnabled;

    const swSizeInputEl = document.getElementById('sliding-window-size-input');
    const swSizeSliderEl = document.getElementById('sliding-window-size-slider');

    if (swSizeInputEl) swSizeInputEl.value = swSize;
    if (swSizeSliderEl) swSizeSliderEl.value = Math.min(Math.max(swSize, 2), 100);

    updateSwDraftUI(isSwEnabled, swSize);
}
