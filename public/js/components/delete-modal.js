/**
 * delete-modal.js — Confirmation dialog for deleting conversations, messages, and version groups
 */

import { state, setState } from '../state.js';
import {
    deleteConversation,
    deleteMessage,
    deleteMessageVersionGroup
} from '../api.js';
import { showToast } from './toast.js';

let deleteTarget = null; // { type: 'conversation' | 'message' | 'version-group', id: number, role?: string, isVersion?: boolean }

export function openDeleteModal(target) {
    deleteTarget = target;
    const modal = document.getElementById('delete-modal');
    const descEl = document.getElementById('delete-modal-desc');

    if (descEl) {
        if (target.type === 'conversation') {
            descEl.textContent = 'Are you sure you want to delete this chat thread? All messages and branch versions inside it will be permanently removed.';
        } else if (target.type === 'version-group' || target.role === 'user') {
            descEl.textContent = 'Are you sure you want to delete this question and all its versions, responses, and branches?';
        } else if (target.isVersion) {
            descEl.textContent = 'Are you sure you want to delete this message version?';
        } else {
            descEl.textContent = 'Are you sure you want to delete this message?';
        }
    }

    if (modal) modal.classList.remove('hidden');
}

export function closeDeleteModal() {
    deleteTarget = null;
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.add('hidden');
}

export function initDeleteModalEvents() {
    const modal = document.getElementById('delete-modal');
    const closeBtn = document.getElementById('delete-modal-close-btn');
    const cancelBtn = document.getElementById('delete-modal-cancel-btn');
    const confirmBtn = document.getElementById('delete-modal-confirm-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeDeleteModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeleteModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDeleteModal();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!deleteTarget) return;

            try {
                if (deleteTarget.type === 'conversation') {
                    await deleteConversation(deleteTarget.id);
                    const updated = state.conversations.filter(c => c.id !== deleteTarget.id);
                    setState('conversations', updated);

                    if (state.currentConversationId === deleteTarget.id) {
                        const next = updated.length > 0 ? updated[0].id : null;
                        setState('currentConversationId', next);
                        import('./sidebar.js').then(m => m.fetchAndLoadConversations(next));
                    }
                    showToast('Chat deleted', 'info');
                } else if (deleteTarget.type === 'version-group' || deleteTarget.role === 'user') {
                    await deleteMessageVersionGroup(deleteTarget.id);
                    if (state.currentConversationId) {
                        const { loadActiveConversation } = await import('./chat.js');
                        await loadActiveConversation(state.currentConversationId);
                    }
                    showToast('Question and branches deleted', 'info');
                } else if (deleteTarget.type === 'message') {
                    await deleteMessage(deleteTarget.id);
                    if (state.currentConversationId) {
                        const { loadActiveConversation } = await import('./chat.js');
                        await loadActiveConversation(state.currentConversationId);
                    }
                    showToast(deleteTarget.isVersion ? 'Version deleted' : 'Message deleted', 'info');
                }
            } catch (err) {
                console.error('Failed to delete target:', err);
                showToast('Failed to delete', 'error');
            } finally {
                closeDeleteModal();
            }
        });
    }
}
