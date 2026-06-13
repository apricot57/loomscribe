import { state } from '../state.js';

// Model Selection UI Logic
export function initializeThinkingUI() {
    const thinkingBtn = document.getElementById('thinking-toggle-btn');
    const thinkingStatusText = document.getElementById('thinking-status-text');
    if (!thinkingBtn) return;

    const mode = state.serverConfig.thinkingMode || 'enabled';
    if (mode === 'enabled') {
        thinkingBtn.classList.add('active');
        if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: On';
    } else {
        thinkingBtn.classList.remove('active');
        if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: Off';
    }
}

export function initializeModelUI() {
    const activeModelName = document.getElementById('active-model-name');
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    if (!activeModelName || !dropdownItems.length) return;

    const storedModel = state.serverConfig.activeModel || 'deepseek-v4-pro';
    
    dropdownItems.forEach(item => {
        const itemModel = item.getAttribute('data-model');
        if (itemModel === storedModel) {
            item.classList.add('active');
            activeModelName.textContent = item.querySelector('.item-name').textContent;
        } else {
            item.classList.remove('active');
        }
    });
}

// Update the visual status of the key icon dot
export function updateKeyStatusUI() {
    const keyStatusDot = document.getElementById('key-status-dot');
    if (!keyStatusDot) return;
    if (state.serverConfig.hasKey) {
        keyStatusDot.classList.add('active');
    } else {
        keyStatusDot.classList.remove('active');
    }
}
