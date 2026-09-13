/**
 * empty-feed.js — Empty Chat Feed State & Preset Starters
 */

import { state, setState } from '../../state.js';
import { updateConversation } from '../../api.js';
import { showToast } from '../toast.js';
import { renderInspector } from '../inspector.js';

/**
 * Renders the empty state placeholder with starter preset cards into #messages-list.
 */
export function renderEmptyFeed() {
    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    listEl.innerHTML = `
        <div class="chat-empty-state">
            <div class="empty-logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L6 12C6 15 9 18 9 22H15C15 18 18 15 18 12L12 2Z" />
                    <line x1="12" y1="2" x2="12" y2="11" />
                    <circle cx="12" cy="11" r="1.5" />
                </svg>
            </div>
            <h2 class="empty-title">LoomScribe</h2>
            <p class="empty-desc">Interactive narrative workspace & prompt engine. Select a preset or type a prompt to begin.</p>
            <div class="preset-starters">
                <div class="starter-card" data-preset="base_writer">
                    <div class="starter-title">Creative Storyteller</div>
                    <div class="starter-desc">Rich narrative prose with immersive sensory depth and natural dialogue.</div>
                </div>
                <div class="starter-card" data-preset="outline_mode">
                    <div class="starter-title">Plot & Outline Generator</div>
                    <div class="starter-desc">Structural chapter breakdowns, character arcs, and narrative pacing.</div>
                </div>
            </div>
        </div>
    `;

    listEl.querySelectorAll('.starter-card').forEach(card => {
        card.addEventListener('click', () => {
            const presetId = card.dataset.preset;
            if (presetId && state.currentConversationId) {
                updateConversation(state.currentConversationId, { presetId }).then(updated => {
                    setState('activeConversation', updated);
                    renderInspector(updated);
                    const chatInput = document.getElementById('chat-input');
                    if (chatInput) {
                        chatInput.focus();
                    }
                    showToast(`Preset updated to ${card.querySelector('.starter-title').textContent}`, 'info');
                });
            }
        });
    });
}
