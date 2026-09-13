/**
 * message-versions.js — Turn Versions Calculation & Version Navigation
 */

import { state } from '../../state.js';
import { navigateTurn } from '../../api.js';
import { showToast } from '../toast.js';

/**
 * Computes sibling message versions, current active index, total count, and turn pairs.
 *
 * @param {Object} msg Target message
 * @param {Array} allMessages All messages in current conversation
 * @returns {{ total: number, currentIndex: number, all: Array }}
 */
export function getTurnVersions(msg, allMessages = []) {
    // 1. Identify the user message associated with this turn
    let userMsg = null;
    if (msg.role === 'user') {
        userMsg = msg;
    } else if (msg.role === 'assistant') {
        if (msg.parentMsgId != null) {
            userMsg = (allMessages || []).find(m => String(m.id) === String(msg.parentMsgId) && m.role === 'user');
        }
    }

    // 2. Find all user message versions in this turn's version group
    let userVersions = [];
    if (userMsg) {
        const userVGId = userMsg.versionGroupId || userMsg.id;
        userVersions = (allMessages || []).filter(m => m.role === 'user' && (
            (m.versionGroupId && String(m.versionGroupId) === String(userVGId)) ||
            String(m.id) === String(userVGId) ||
            (userMsg.versionGroupId && (String(m.id) === String(userMsg.versionGroupId) || String(m.versionGroupId) === String(userMsg.versionGroupId))) ||
            (m.versionGroupId && String(m.versionGroupId) === String(userMsg.id))
        )).sort((a, b) => (a.version || 1) - (b.version || 1) || (a.timestamp || 0) - (b.timestamp || 0));
    }

    // 3. Fallback for standalone / orphaned assistant messages
    if (userVersions.length === 0) {
        if (msg.role === 'assistant') {
            const asstVGId = msg.versionGroupId || msg.id;
            const asstVersions = (allMessages || []).filter(m => m.role === 'assistant' && (
                (m.versionGroupId && String(m.versionGroupId) === String(asstVGId)) ||
                String(m.id) === String(asstVGId)
            )).sort((a, b) => (a.version || 1) - (b.version || 1) || (a.timestamp || 0) - (b.timestamp || 0));

            const uniqueAsst = [];
            const seen = new Set();
            for (const v of asstVersions) {
                const verNum = v.version || 1;
                if (!seen.has(verNum)) {
                    seen.add(verNum);
                    uniqueAsst.push(v);
                }
            }

            const pairs = uniqueAsst.map(a => ({
                userMsgId: a.parentMsgId,
                assistantMsgId: a.id,
                userMsg: null,
                assistantMsg: a,
                timestamp: a.timestamp || a.id || 0
            }));
            const currIdx = pairs.findIndex(p => p.assistantMsgId === msg.id);
            return {
                total: pairs.length,
                currentIndex: currIdx >= 0 ? currIdx : 0,
                all: pairs
            };
        }
        return { total: 1, currentIndex: 0, all: [] };
    }

    // 4. Build combined turn pairs (userMsg, assistantMsg) across all prompt edits and response retries
    const pairs = [];
    const seenPairs = new Set();

    for (const u of userVersions) {
        const childAssistants = (allMessages || [])
            .filter(m => m.role === 'assistant' && String(m.parentMsgId) === String(u.id))
            .sort((a, b) => (a.version || 1) - (b.version || 1) || (a.timestamp || 0) - (b.timestamp || 0));

        if (childAssistants.length > 0) {
            for (const a of childAssistants) {
                const key = `${u.id}_${a.id}`;
                if (!seenPairs.has(key)) {
                    seenPairs.add(key);
                    pairs.push({
                        userMsgId: u.id,
                        assistantMsgId: a.id,
                        userMsg: u,
                        assistantMsg: a,
                        timestamp: a.timestamp || u.timestamp || a.id || u.id || 0
                    });
                }
            }
        } else {
            const hasOtherFilledVersions = userVersions.some(otherU =>
                (allMessages || []).some(m => m.role === 'assistant' && String(m.parentMsgId) === String(otherU.id))
            );
            if (userVersions.length === 1 || u.isActive !== false || !hasOtherFilledVersions) {
                const key = `${u.id}_null`;
                if (!seenPairs.has(key)) {
                    seenPairs.add(key);
                    pairs.push({
                        userMsgId: u.id,
                        assistantMsgId: null,
                        userMsg: u,
                        assistantMsg: null,
                        timestamp: u.timestamp || u.id || 0
                    });
                }
            }
        }
    }

    // Sort chronologically
    pairs.sort((a, b) => a.timestamp - b.timestamp);

    // 5. Determine current active index
    let currentIndex = -1;
    if (msg.role === 'assistant') {
        currentIndex = pairs.findIndex(p => p.assistantMsgId === msg.id);
    }
    if (currentIndex === -1 && userMsg) {
        currentIndex = pairs.findIndex(p => p.userMsgId === userMsg.id && p.assistantMsg && p.assistantMsg.isActive !== false);
        if (currentIndex === -1) {
            currentIndex = pairs.findIndex(p => p.userMsgId === userMsg.id);
        }
    }
    if (currentIndex === -1) {
        currentIndex = pairs.length > 0 ? pairs.length - 1 : 0;
    }

    return {
        total: pairs.length,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        all: pairs
    };
}

/**
 * Generates version switcher markup HTML.
 *
 * @param {Object} versions Output from getTurnVersions
 * @returns {string}
 */
export function renderVersionNavHtml(versions) {
    if (!versions || versions.total <= 1) return '';
    return `
        <div class="version-nav">
            <button class="version-btn prev-ver-btn" ${versions.currentIndex <= 0 ? 'disabled' : ''} aria-label="Previous version">‹</button>
            <span>${versions.currentIndex + 1} / ${versions.total}</span>
            <button class="version-btn next-ver-btn" ${versions.currentIndex >= versions.total - 1 ? 'disabled' : ''} aria-label="Next version">›</button>
        </div>
    `;
}

/**
 * Switches the active turn version via API and refreshes the conversation.
 *
 * @param {Object|number|string} target Turn target pair or userMsgId
 * @param {number|string|null} [assistantMsgId] Optional assistant message ID if target is userMsgId
 */
export async function switchTurnVersion(target, assistantMsgId = null) {
    if (!target) return;
    try {
        const payload = (typeof target === 'object' && target !== null)
            ? { userMsgId: target.userMsgId, assistantMsgId: target.assistantMsgId }
            : { userMsgId: target, assistantMsgId };

        await navigateTurn(payload);
        const { loadActiveConversation } = await import('../chat.js');
        await loadActiveConversation(state.currentConversationId);
    } catch (err) {
        console.error('Failed to switch version:', err);
        showToast('Failed to switch version', 'error');
    }
}

/**
 * Binds click events to previous and next version buttons on a message row.
 *
 * @param {HTMLElement} row
 * @param {Object} versions
 */
export function attachVersionNavEvents(row, versions) {
    const prevVerBtn = row.querySelector('.prev-ver-btn');
    const nextVerBtn = row.querySelector('.next-ver-btn');

    if (prevVerBtn && versions) {
        prevVerBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (state.isStreaming) return;
            const target = versions.all[versions.currentIndex - 1];
            if (target) {
                await switchTurnVersion(target);
            }
        });
    }

    if (nextVerBtn && versions) {
        nextVerBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (state.isStreaming) return;
            const target = versions.all[versions.currentIndex + 1];
            if (target) {
                await switchTurnVersion(target);
            }
        });
    }
}
