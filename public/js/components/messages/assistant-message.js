/**
 * assistant-message.js — Assistant Message Row Rendering, Reasoning Box & Inline Editing
 */

import { state, setState } from '../../state.js';
import { updateMessage, deactivateMessageTree, forkConversation } from '../../api.js';
import { renderMarkdown, escapeHtml } from '../../markdown.js';
import { showToast } from '../toast.js';
import { openDeleteModal } from '../delete-modal.js';
import { getTurnVersions, renderVersionNavHtml, attachVersionNavEvents } from './message-versions.js';

/**
 * Builds assistant message DOM node (.msg-row.assistant), reasoning box, markdown body, version nav, and action buttons.
 *
 * @param {Object} msg Assistant message object
 * @param {Array} allMessages All messages in current conversation
 * @returns {HTMLElement}
 */
export function createAssistantMessageNode(msg, allMessages = []) {
    const row = document.createElement('div');
    row.className = `msg-row ${msg.role}`;
    row.dataset.id = msg.id;

    let reasoningHtml = '';
    if (msg.reasoning) {
        reasoningHtml = `
            <div class="reasoning-box collapsed">
                <div class="reasoning-header">
                    <div class="reasoning-label">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        <span>Thought Process</span>
                    </div>
                    <svg class="reasoning-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
                <div class="reasoning-content">${escapeHtml(msg.reasoning)}</div>
            </div>
        `;
    }

    // Versioning switcher info
    const versions = getTurnVersions(msg, allMessages);
    let versionNavHtml = '';
    if (versions.total > 1) {
        versionNavHtml = renderVersionNavHtml(versions);
    }

    row.innerHTML = `
        <div class="msg-bubble">
            ${reasoningHtml}
            <div class="markdown-body">${renderMarkdown(msg.content)}</div>
        </div>
        <div class="msg-actions">
            ${versionNavHtml}
            <button class="action-btn edit-msg-btn" title="Edit bot message" aria-label="Edit message">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Edit</span>
            </button>
            <button class="action-btn copy-msg-btn" title="Copy response" aria-label="Copy response">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                <span>Copy</span>
            </button>
            <button class="action-btn retry-msg-btn" title="Regenerate alternative" aria-label="Regenerate">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>Retry</span>
            </button>
            <button class="action-btn fork-msg-btn" title="Fork chat from this point" aria-label="Fork chat">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>
                </svg>
                <span>Fork</span>
            </button>
            <button class="action-btn delete-ver-btn" title="${versions && versions.total > 1 ? 'Delete this version' : 'Delete message'}" aria-label="Delete message">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        </div>
    `;

    attachAssistantMessageEvents(row, msg, versions);
    return row;
}

/**
 * Replaces assistant markdown body with an editable auto-resizing textarea and Save / Cancel buttons.
 *
 * @param {HTMLElement} row
 * @param {Object} msg
 */
export function enterAssistantInlineEdit(row, msg) {
    const bubble = row.querySelector('.msg-bubble');
    const markdownBody = bubble?.querySelector('.markdown-body');
    if (!bubble || !markdownBody) return;

    const originalContent = msg.content;

    markdownBody.innerHTML = `
        <div class="inline-edit-box" style="margin-top: 4px;">
            <textarea class="inline-edit-textarea">${escapeHtml(msg.content)}</textarea>
            <div class="inline-edit-actions">
                <button class="btn btn-ghost cancel-edit-btn" type="button">Cancel</button>
                <button class="btn btn-primary save-edit-btn" type="button">Save</button>
            </div>
        </div>
    `;

    const textarea = markdownBody.querySelector('.inline-edit-textarea');
    const cancelBtn = markdownBody.querySelector('.cancel-edit-btn');
    const saveBtn = markdownBody.querySelector('.save-edit-btn');

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
        markdownBody.innerHTML = renderMarkdown(originalContent);
    });

    saveBtn.addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (!newText) return;

        try {
            await updateMessage(msg.id, { content: newText });
            msg.content = newText;
            const updatedActive = state.activeMessages.map(m => m.id === msg.id ? { ...m, content: newText } : m);
            setState('activeMessages', updatedActive);
            markdownBody.innerHTML = renderMarkdown(newText);
            showToast('Bot message updated', 'success', 1500);
        } catch (err) {
            console.error('Failed to update bot message:', err);
            showToast('Failed to update message', 'error');
        }
    });
}

/**
 * Wires thought process collapsible header, action buttons (edit, copy, retry, fork, delete), and version switching.
 *
 * @param {HTMLElement} row
 * @param {Object} msg
 * @param {Object} [versions]
 */
export function attachAssistantMessageEvents(row, msg, versions) {
    const reasoningBox = row.querySelector('.reasoning-box');
    if (reasoningBox) {
        const header = reasoningBox.querySelector('.reasoning-header');
        header.addEventListener('click', () => {
            reasoningBox.classList.toggle('collapsed');
        });
    }

    const editBtn = row.querySelector('.edit-msg-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            enterAssistantInlineEdit(row, msg);
        });
    }

    const copyBtn = row.querySelector('.copy-msg-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(msg.content).then(() => {
                showToast('Response copied to clipboard', 'info', 1500);
            });
        });
    }

    const retryBtn = row.querySelector('.retry-msg-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
            if (state.isStreaming) return;
            try {
                // Deactivate current tree & get next version number without creating duplicate DB records
                const treeData = await deactivateMessageTree(msg.id);
                const { triggerGenerateResponse } = await import('../chat.js');

                await triggerGenerateResponse({
                    conversationId: state.currentConversationId,
                    parentMsgId: msg.parentMsgId,
                    versionGroupId: treeData.versionGroupId || msg.versionGroupId || msg.id,
                    version: treeData.nextVersion,
                    replaceNode: row,
                    retriedMsgId: msg.id
                });
            } catch (err) {
                console.error('Failed to retry version:', err);
                showToast('Failed to regenerate response', 'error');
            }
        });
    }

    const forkBtn = row.querySelector('.fork-msg-btn');
    if (forkBtn) {
        forkBtn.addEventListener('click', async () => {
            const title = `${state.activeConversation?.title || 'Chat'} (Fork)`;
            try {
                const forked = await forkConversation(state.currentConversationId, {
                    messageId: msg.id,
                    title
                });
                const updatedConvs = [forked, ...state.conversations];
                setState('conversations', updatedConvs);
                setState('currentConversationId', forked.id);
                const { loadActiveConversation } = await import('../chat.js');
                await loadActiveConversation(forked.id);
                showToast('Chat forked successfully', 'success');
            } catch (err) {
                showToast('Failed to fork chat', 'error');
            }
        });
    }

    const deleteBtn = row.querySelector('.delete-ver-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteModal({
                type: 'message',
                id: msg.id,
                isVersion: versions && versions.total > 1
            });
        });
    }

    const effectiveVersions = versions || getTurnVersions(msg, state.allMessages || []);
    attachVersionNavEvents(row, effectiveVersions);
}
