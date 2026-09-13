/**
 * messages.js — Chat Message Item Rendering, Inline Editing & Version Branching Coordinator
 *
 * High-level coordinator module that orchestrates:
 * - ./messages/message-versions.js: Turn versions calculation, switching & version navigation
 * - ./messages/user-message.js: User message node rendering, inline edit, event wiring
 * - ./messages/assistant-message.js: Assistant message node rendering, thought process box, inline edit, event wiring
 * - ./messages/empty-feed.js: Empty chat state rendering & starter preset cards
 */

import { state } from '../state.js';
import {
    getTurnVersions,
    renderVersionNavHtml,
    attachVersionNavEvents,
    switchTurnVersion
} from './messages/message-versions.js';
import {
    createUserMessageNode,
    attachUserMessageEvents,
    enterUserInlineEdit
} from './messages/user-message.js';
import {
    createAssistantMessageNode,
    attachAssistantMessageEvents,
    enterAssistantInlineEdit
} from './messages/assistant-message.js';
import { renderEmptyFeed } from './messages/empty-feed.js';

/**
 * Creates a message DOM element (delegating to user or assistant submodules).
 *
 * @param {Object} msg
 * @param {Array} [allMessages=[]]
 * @returns {HTMLElement}
 */
function createMessageNode(msg, allMessages = []) {
    if (msg.role === 'user') {
        return createUserMessageNode(msg, allMessages);
    }
    return createAssistantMessageNode(msg, allMessages);
}

/**
 * Renders full active messages list into #messages-list.
 *
 * @param {Array} activeMessages
 * @param {Array} allMessages
 */
function renderMessagesList(activeMessages, allMessages) {
    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    if (activeMessages.length === 0) {
        renderEmptyFeed();
        return;
    }

    listEl.innerHTML = '';
    const fragment = document.createDocumentFragment();

    activeMessages.forEach((msg) => {
        const msgNode = createMessageNode(msg, allMessages);
        fragment.appendChild(msgNode);
    });
    listEl.appendChild(fragment);
}

/**
 * Appends a single message node to #messages-list.
 *
 * @param {Object} msg
 */
function appendMessageNode(msg) {
    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    const empty = listEl.querySelector('.chat-empty-state');
    if (empty) empty.remove();

    const node = createMessageNode(msg, state.allMessages);
    listEl.appendChild(node);
}

// Full public API re-exports for 100% backwards compatibility
export {
    renderMessagesList,
    renderEmptyFeed,
    createMessageNode,
    appendMessageNode,
    attachUserMessageEvents,
    enterUserInlineEdit,
    enterAssistantInlineEdit,
    attachAssistantMessageEvents,
    getTurnVersions,
    createUserMessageNode,
    createAssistantMessageNode,
    renderVersionNavHtml,
    attachVersionNavEvents,
    switchTurnVersion
};
