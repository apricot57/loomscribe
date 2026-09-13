/**
 * user-message.js — User Message Row Rendering, Inline Editing & Actions
 */

import { state } from '../../state.js';
import { createMessageVersion, deactivateMessageTree } from '../../api.js';
import { escapeHtml } from '../../markdown.js';
import { showToast } from '../toast.js';
import { openDeleteModal } from '../delete-modal.js';
import { getTurnVersions, renderVersionNavHtml, attachVersionNavEvents } from './message-versions.js';

/**
 * Builds user message DOM node (.msg-row.user), bubble, version nav, and action buttons.
 *
 * @param {Object} msg User message object
 * @param {Array} allMessages All messages in current conversation
 * @returns {HTMLElement}
 */
export function createUserMessageNode(msg, allMessages = []) {
    const row = document.createElement('div');
    row.className = `msg-row ${msg.role}`;
    row.dataset.id = msg.id;

    const hasActiveAssistant = (allMessages || []).some(
        m => m.role === 'assistant' && String(m.parentMsgId) === String(msg.id) && m.isActive !== false
    );
    const versions = getTurnVersions(msg, allMessages);
    let versionNavHtml = '';
    if (!hasActiveAssistant && versions.total > 1) {
        versionNavHtml = renderVersionNavHtml(versions);
    }

    row.innerHTML = `
        <div class="msg-bubble">
            <div class="user-content-text">${escapeHtml(msg.content)}</div>
        </div>
        <div class="msg-actions">
            ${versionNavHtml}
            <button class="action-btn retry-msg-btn" title="Retry / Regenerate response" aria-label="Retry">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>Retry</span>
            </button>
            <button class="action-btn edit-msg-btn" title="Edit and resend" aria-label="Edit message">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Edit</span>
            </button>
            <button class="action-btn copy-msg-btn" title="Copy" aria-label="Copy text">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                <span>Copy</span>
            </button>
            <button class="action-btn delete-msg-btn" title="Delete question and branches" aria-label="Delete question">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Delete</span>
            </button>
        </div>
    `;

    attachUserMessageEvents(row, msg, versions);
    return row;
}

/**
 * Handles action buttons (retry, edit, copy, delete) and version switching for a user message row.
 *
 * @param {HTMLElement} row
 * @param {Object} msg
 * @param {Object} [versions]
 */
export function attachUserMessageEvents(row, msg, versions) {
    const retryBtn = row.querySelector('.retry-msg-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
            if (state.isStreaming) return;
            try {
                const { triggerGenerateResponse } = await import('../chat.js');
                // Find direct child assistant response if any
                const directChildAssistant = state.activeMessages.find(
                    m => m.parentMsgId === msg.id && m.role === 'assistant'
                );
                if (directChildAssistant) {
                    const childRow = document.querySelector(`.msg-row[data-id="${directChildAssistant.id}"]`);
                    const treeData = await deactivateMessageTree(directChildAssistant.id);
                    await triggerGenerateResponse({
                        conversationId: state.currentConversationId,
                        parentMsgId: msg.id,
                        versionGroupId: treeData.versionGroupId || directChildAssistant.versionGroupId || directChildAssistant.id,
                        version: treeData.nextVersion,
                        replaceNode: childRow,
                        retriedMsgId: directChildAssistant.id
                    });
                } else {
                    // If no response yet or previous response was removed, regenerate from this prompt
                    await triggerGenerateResponse({
                        conversationId: state.currentConversationId,
                        parentMsgId: msg.id
                    });
                }
            } catch (err) {
                console.error('Failed to retry prompt response:', err);
                showToast('Failed to regenerate response', 'error');
            }
        });
    }

    const copyBtn = row.querySelector('.copy-msg-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(msg.content).then(() => {
                showToast('Message copied to clipboard', 'info', 1500);
            });
        });
    }

    const editBtn = row.querySelector('.edit-msg-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            enterUserInlineEdit(row, msg);
        });
    }

    const deleteBtn = row.querySelector('.delete-msg-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteModal({
                type: 'version-group',
                id: msg.id,
                role: 'user'
            });
        });
    }

    const effectiveVersions = versions || getTurnVersions(msg, state.allMessages || []);
    attachVersionNavEvents(row, effectiveVersions);
}

/**
 * Replaces user message bubble with an editable auto-resizing textarea and Send / Cancel controls.
 *
 * @param {HTMLElement} row
 * @param {Object} msg
 */
export function enterUserInlineEdit(row, msg) {
    const bubble = row.querySelector('.msg-bubble');
    if (!bubble) return;

    bubble.innerHTML = `
        <div class="inline-edit-box">
            <textarea class="inline-edit-textarea">${escapeHtml(msg.content)}</textarea>
            <div class="inline-edit-actions">
                <button class="btn btn-ghost cancel-edit-btn" type="button">Cancel</button>
                <button class="btn btn-primary save-resend-btn" type="button">Save & Resubmit</button>
            </div>
        </div>
    `;

    const textarea = bubble.querySelector('.inline-edit-textarea');
    const cancelBtn = bubble.querySelector('.cancel-edit-btn');
    const saveBtn = bubble.querySelector('.save-resend-btn');

    const adjustHeight = () => {
        const container = document.getElementById('chat-container');
        const prevScroll = container ? container.scrollTop : 0;

        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight + 4, 80)}px`;

        if (container && container.scrollTop !== prevScroll) {
            container.scrollTop = prevScroll;
        }
    };

    requestAnimationFrame(() => adjustHeight());
    textarea.addEventListener('input', adjustHeight);
    textarea.focus();
    textarea.selectionStart = textarea.value.length;

    cancelBtn.addEventListener('click', () => {
        bubble.innerHTML = `<div class="user-content-text">${escapeHtml(msg.content)}</div>`;
    });

    saveBtn.addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (!newText) return;

        try {
            // Create a new version of the user prompt and resubmit
            const newMsg = await createMessageVersion(msg.id, {
                content: newText,
                role: 'user'
            });
            const { loadActiveConversation, triggerGenerateResponse } = await import('../chat.js');
            await loadActiveConversation(state.currentConversationId);

            // Trigger AI response generation
            await triggerGenerateResponse({
                conversationId: state.currentConversationId,
                parentMsgId: newMsg.id
            });
        } catch (err) {
            console.error('Failed to edit and resend message:', err);
            showToast('Failed to resubmit message', 'error');
        }
    });
}
