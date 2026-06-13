import { state } from '../state.js';
import { safeAsync } from './helpers.js';

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

export function initInputBar() {
    const modelSelectBtn = document.getElementById('model-select-btn');
    const modelDropdownMenu = document.getElementById('model-dropdown-menu');
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    const thinkingToggleBtn = document.getElementById('thinking-toggle-btn');
    const thinkingStatusText = document.getElementById('thinking-status-text');

    // Toggle model dropdown menu
    if (modelSelectBtn && modelDropdownMenu) {
        modelSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modelDropdownMenu.classList.toggle('hidden');
            modelSelectBtn.parentElement.classList.toggle('open');
        });

        // Close dropdowns when clicking anywhere else
        document.addEventListener('click', () => {
            modelDropdownMenu.classList.add('hidden');
            modelSelectBtn.parentElement.classList.remove('open');
            const promptDropdownMenu = document.getElementById('prompt-dropdown-menu');
            const promptSelectBtn = document.getElementById('prompt-select-btn');
            if (promptDropdownMenu && promptSelectBtn) {
                promptDropdownMenu.classList.add('hidden');
                promptSelectBtn.parentElement.classList.remove('open');
            }
        });
    }

    // Select model event handling
    dropdownItems.forEach(item => {
        item.addEventListener('click', safeAsync(async () => {
            const modelVal = item.getAttribute('data-model');
            state.serverConfig.activeModel = modelVal;
            
            // Update header button label
            const activeModelName = document.getElementById('active-model-name');
            if (activeModelName) {
                activeModelName.textContent = item.querySelector('.item-name').textContent;
            }
            
            // Set active class
            dropdownItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Close menu
            if (modelDropdownMenu && modelSelectBtn) {
                modelDropdownMenu.classList.add('hidden');
                modelSelectBtn.parentElement.classList.remove('open');
            }

            // Save active model configuration globally on server
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activeModel: modelVal })
            });

            // Save active model configuration for current conversation if active
            if (state.currentConversationId !== null) {
                await fetch(`/api/conversations/${state.currentConversationId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activeModel: modelVal })
                });
            }
        }));
    });

    // Thinking Mode Toggle event handling
    if (thinkingToggleBtn) {
        thinkingToggleBtn.addEventListener('click', safeAsync(async () => {
            const currentMode = state.serverConfig.thinkingMode || 'enabled';
            const newMode = currentMode === 'enabled' ? 'disabled' : 'enabled';
            state.serverConfig.thinkingMode = newMode;

            // Update UI
            if (newMode === 'enabled') {
                thinkingToggleBtn.classList.add('active');
                if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: On';
            } else {
                thinkingToggleBtn.classList.remove('active');
                if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: Off';
            }

            // Save configuration globally on server
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ thinkingMode: newMode })
            });
        }));
    }
}
