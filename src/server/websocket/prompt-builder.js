const { compilePrompt } = require('../../../engine/compiler');
const { readDb } = require('../db');
const logger = require('../logger');

/**
 * Compiles conversation prompt parameters, applies sliding context window rules,
 * and handles Slot 1 (systemPrompt) & Slot 2 (postHistory system_note injection).
 */
function buildPrompt({ conversationId, messages = [], db }) {
    const database = db || readDb();
    let apiMessages = messages || [];

    if (conversationId !== undefined && conversationId !== null) {
        const convId = typeof conversationId === 'string' && !isNaN(conversationId) ? parseInt(conversationId, 10) : conversationId;
        const conv = (database.conversations || []).find(c => c.id === convId);
        if (conv) {
            const { presetId, params, blockOverrides, directorNote } = conv;
            try {
                const { systemPrompt, postHistory } = compilePrompt({
                    presetId,
                    params,
                    blockOverrides,
                    directorNote
                });

                const history = apiMessages.filter(m => m.role !== 'system');

                // Sliding Context Window: Disabled by default to preserve prefix cache on modern LLM APIs (enabled only when explicitly true or set to number)
                const isWindowEnabled = database.settings?.slidingWindowEnabled === true ||
                    (database.settings?.slidingWindowEnabled === undefined && typeof database.settings?.slidingWindow === 'number' && database.settings.slidingWindow > 0);

                let windowSize = 16;
                if (typeof database.settings?.slidingWindowSize === 'number' && database.settings.slidingWindowSize > 0) {
                    windowSize = Math.floor(database.settings.slidingWindowSize);
                } else if (typeof database.settings?.slidingWindow === 'number' && database.settings.slidingWindow > 0) {
                    windowSize = Math.floor(database.settings.slidingWindow);
                }

                const windowedHistory = isWindowEnabled ? history.slice(-windowSize) : history;

                const finalMessages = [];

                if (systemPrompt && systemPrompt.trim()) {
                    finalMessages.push({ role: 'system', content: systemPrompt });
                }

                if (postHistory && postHistory.trim()) {
                    // Find the index of the last user message in the windowed array
                    let lastUserIdx = -1;
                    for (let i = windowedHistory.length - 1; i >= 0; i--) {
                        if (windowedHistory[i].role === 'user') {
                            lastUserIdx = i;
                            break;
                        }
                    }

                    if (lastUserIdx !== -1) {
                        // Copy and ephemerally mutate the last user message
                        const mutatedHistory = windowedHistory.map((m, idx) => {
                            if (idx === lastUserIdx) {
                                return {
                                    role: 'user',
                                    content: `${m.content}\n\n<system_note>\n${postHistory.trim()}\n</system_note>`
                                };
                            }
                            return m;
                        });
                        finalMessages.push(...mutatedHistory);
                    } else {
                        // Fallback if no user message exists
                        finalMessages.push(...windowedHistory);
                        finalMessages.push({ role: 'system', content: postHistory });
                    }
                } else {
                    finalMessages.push(...windowedHistory);
                }

                apiMessages = finalMessages;

                logger.debug('ws_prompt_compiled', {
                    conversationId,
                    presetId,
                    systemPromptLength: systemPrompt ? systemPrompt.length : 0,
                    postHistoryLength: postHistory ? postHistory.length : 0,
                    totalMessages: apiMessages.length
                });
            } catch (compileErr) {
                logger.error('ws_compile_failed', {
                    conversationId,
                    presetId,
                    params,
                    message: compileErr.message
                });
                return {
                    apiMessages: null,
                    error: `Prompt compilation failed: ${compileErr.message}`
                };
            }
        }
    }

    return {
        apiMessages,
        stream_options: { include_usage: true },
        error: null
    };
}

module.exports = {
    buildPrompt
};
