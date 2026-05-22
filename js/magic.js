import { state } from './state.js';
import { hideDescendants } from './api.js';
import { refreshConversationView } from './ui.js';

// 1. Listen for Selection Changes on Document
document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && selection.rangeCount > 0) {
        try {
            const range = selection.getRangeAt(0);
            const commonAncestor = range.commonAncestorContainer;
            const messageContent = commonAncestor.nodeType === Node.ELEMENT_NODE
                ? commonAncestor.closest('.bot-message .message-content')
                : commonAncestor.parentElement.closest('.bot-message .message-content');

            if (messageContent) {
                showFloatingMagicWand(selection, messageContent);
                return;
            }
        } catch (err) {
            // Handle occasional browser selection glitches safely
        }
    }
    
    // Hide button if selection is cleared or active outside bot message content
    const wand = document.getElementById('magic-wand-btn');
    if (wand) wand.classList.add('hidden');
});

// 2. Hide widgets on clicking outside
document.addEventListener('click', (e) => {
    const wand = document.getElementById('magic-wand-btn');
    const dialog = document.getElementById('magic-rewrite-dialog');

    const selection = window.getSelection();
    const hasSelection = selection && selection.toString().trim().length > 0;

    if (wand && !wand.contains(e.target) && !hasSelection) {
        wand.classList.add('hidden');
    }
    if (dialog && !dialog.contains(e.target) && e.target.id !== 'magic-wand-btn' && !e.target.closest('#magic-wand-btn')) {
        dialog.classList.add('hidden');
    }
});

export function showFloatingMagicWand(selection, messageContent) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    let wand = document.getElementById('magic-wand-btn');
    if (!wand) {
        wand = document.createElement('button');
        wand.id = 'magic-wand-btn';
        wand.className = 'magic-wand-btn hidden';
        wand.title = 'Rewrite this selection...';
        wand.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <path d="M15 4V2m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-5.7 6.3L2 17.6V22h4.4l7.3-7.3-4.4-4.4z"></path>
            </svg>
            <span>Magic Rewrite</span>
        `;
        
        wand.addEventListener('click', (e) => {
            e.stopPropagation();
            const left = parseFloat(wand.dataset.rectLeft);
            const width = parseFloat(wand.dataset.rectWidth);
            const bottom = parseFloat(wand.dataset.rectBottom);
            const scrollX = parseFloat(wand.dataset.scrollX);
            const scrollY = parseFloat(wand.dataset.scrollY);
            
            const x = left + width / 2 + scrollX;
            const y = bottom + scrollY;

            showRewriteDialog(wand.dataset.selectedText, wand.dataset.msgId, x, y);
            wand.classList.add('hidden');
        });
        document.body.appendChild(wand);
    }

    const x = rect.left + rect.width / 2 + window.scrollX;
    const y = rect.top + window.scrollY;

    wand.style.left = `${x}px`;
    wand.style.top = `${y - 8}px`;
    wand.style.transform = 'translate(-50%, -100%)';
    wand.classList.remove('hidden');

    wand.dataset.selectedText = selection.toString();
    const messageDiv = messageContent.closest('.message');
    wand.dataset.msgId = messageDiv.dataset.msgId || messageDiv.id;
    wand.dataset.rectLeft = rect.left;
    wand.dataset.rectWidth = rect.width;
    wand.dataset.rectTop = rect.top;
    wand.dataset.rectBottom = rect.bottom;
    wand.dataset.scrollX = window.scrollX;
    wand.dataset.scrollY = window.scrollY;
}

export function showRewriteDialog(selectedText, msgId, x, y) {
    let dialog = document.getElementById('magic-rewrite-dialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'magic-rewrite-dialog';
        dialog.className = 'magic-rewrite-dialog glass-panel hidden';
        dialog.innerHTML = `
            <div class="rewrite-dialog-header">Magic Rewrite</div>
            <div class="rewrite-snippet-preview"></div>
            <div class="rewrite-input-row">
                <input type="text" id="rewrite-instruction-input" placeholder="e.g. 'more action', 'more descriptive'..." autocomplete="off">
                <button id="rewrite-submit-btn" class="rewrite-btn" title="Rewrite now">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </button>
                <button id="rewrite-cancel-btn" class="rewrite-cancel-btn" title="Cancel">
                    &times;
                </button>
            </div>
        `;
        document.body.appendChild(dialog);

        const input = dialog.querySelector('#rewrite-instruction-input');
        const submitBtn = dialog.querySelector('#rewrite-submit-btn');
        const cancelBtn = dialog.querySelector('#rewrite-cancel-btn');

        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                submitBtn.click();
            } else if (evt.key === 'Escape') {
                cancelBtn.click();
            }
        });

        cancelBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            hideRewriteDialog();
        });

        submitBtn.addEventListener('click', async (evt) => {
            evt.stopPropagation();
            const instruction = input.value.trim();
            if (instruction) {
                const sText = dialog.dataset.selectedText;
                const mId = dialog.dataset.msgId;
                hideRewriteDialog();
                await executeMagicRewrite(mId, sText, instruction);
            }
        });
    }

    dialog.dataset.selectedText = selectedText;
    dialog.dataset.msgId = msgId;

    const preview = dialog.querySelector('.rewrite-snippet-preview');
    const truncated = selectedText.length > 55 ? selectedText.slice(0, 52) + '...' : selectedText;
    preview.textContent = `"${truncated}"`;

    const input = dialog.querySelector('#rewrite-instruction-input');
    input.value = '';

    dialog.style.left = `${x}px`;
    dialog.style.top = `${y + 8}px`;
    dialog.style.transform = 'translate(-50%, 0)';
    dialog.classList.remove('hidden');

    setTimeout(() => input.focus(), 50);
}

export function hideRewriteDialog() {
    const dialog = document.getElementById('magic-rewrite-dialog');
    if (dialog) dialog.classList.add('hidden');
    window.getSelection().removeAllRanges();
}

export function findMarkdownSubstringRange(fullText, selectedText) {
    if (!selectedText || !fullText) return null;

    function cleanAndMap(str) {
        let cleanStr = '';
        const map = [];
        const skipChars = new Set(['*', '_', '~', '`', '#', '>', '\\']);

        for (let i = 0; i < str.length; i++) {
            let char = str[i];
            
            // Normalize curly quotes to straight quotes
            if (char === '“' || char === '”') {
                char = '"';
            } else if (char === '‘' || char === '’') {
                char = "'";
            }
            char = char.toLowerCase();

            // Skip whitespace and markdown symbols
            if (/\s/.test(char) || skipChars.has(char)) {
                continue;
            }

            cleanStr += char;
            map.push(i);
        }
        return { cleanStr, map };
    }

    const fullNormalized = cleanAndMap(fullText);
    const selNormalized = cleanAndMap(selectedText);

    if (selNormalized.cleanStr.length === 0) return null;

    const idx = fullNormalized.cleanStr.indexOf(selNormalized.cleanStr);
    if (idx === -1) return null;

    const startCleanIdx = idx;
    const endCleanIdx = idx + selNormalized.cleanStr.length - 1;

    const startIdx = fullNormalized.map[startCleanIdx];
    const endIdx = fullNormalized.map[endCleanIdx] + 1; // exclusive end index for substring slicing

    return { startIdx, endIdx };
}

export async function executeMagicRewrite(msgId, selectedText, instruction) {
    if (!state.serverConfig.hasKey) {
        alert('⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar settings.');
        return;
    }

    const messageDiv = document.getElementById(msgId) || document.querySelector(`[data-msg-id="${msgId}"]`);
    if (messageDiv) messageDiv.classList.add('rewriting');

    try {
        const mRes = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
        const allMessages = mRes.ok ? await mRes.json() : [];
        const assistantMsg = allMessages.find(m => String(m.id) === String(msgId));
        if (!assistantMsg) throw new Error("Original message not found");

        const selectedModel = state.serverConfig.activeModel || 'deepseek-v4-pro';

        // Find match range inside raw markdown
        const range = findMarkdownSubstringRange(assistantMsg.content, selectedText);
        let demarcatedText = '';
        if (range) {
            const before = assistantMsg.content.substring(0, range.startIdx);
            const match = assistantMsg.content.substring(range.startIdx, range.endIdx);
            const after = assistantMsg.content.substring(range.endIdx);
            demarcatedText = `${before}<<<HIGHLIGHT>>>${match}<<<HIGHLIGHT>>>${after}`;
        } else {
            demarcatedText = assistantMsg.content.replace(selectedText, `<<<HIGHLIGHT>>>${selectedText}<<<HIGHLIGHT>>>`);
        }

        const rewriteMessages = [
            {
                role: 'system',
                content: 'You are a highly precise writing assistant. Your task is to rewrite a SPECIFIC highlighted section of a narrative text based on a user\'s instruction. You must preserve the surrounding context perfectly. You must output ONLY the rewritten replacement block itself, with NO explanations, NO introductory sentences, and NO markdown code block wrappers around the text, as it will be directly swapped back into the original narrative. Do not output anything else.'
            },
            {
                role: 'user',
                content: `Here is the full text of the story segment, with the section to rewrite demarcated inside <<<HIGHLIGHT>>>...<<<HIGHLIGHT>>>:\n\n"""\n${demarcatedText}\n"""\n\nHighlighted text to replace:\n"${selectedText}"\n\nRewrite Instruction:\n"${instruction}"\n\nRemember: Output ONLY the rewritten replacement string for that highlighted section. Do not include quotes, intro, or formatting blocks.`
            }
        ];

        const thinkingMode = state.serverConfig.thinkingMode || 'enabled';
        const response = await fetch(state.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: rewriteMessages,
                temperature: 0.7,
                stream: false,
                thinking: {
                    type: thinkingMode
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Inference request failed: ${response.statusText}`);
        }

        const data = await response.json();
        const choiceContent = data.choices?.[0]?.message?.content;
        if (!choiceContent) throw new Error("Received empty completion from inference");

        let cleanedText = choiceContent.trim();
        // Remove markdown code block markers
        if (cleanedText.startsWith('```')) {
            const lines = cleanedText.split('\n');
            if (lines[0].startsWith('```')) {
                lines.shift();
            }
            if (lines[lines.length - 1].startsWith('```')) {
                lines.pop();
            }
            cleanedText = lines.join('\n').trim();
        }
        // Remove outer quotes and backticks if returned by the AI
        if (cleanedText.startsWith('"') && cleanedText.endsWith('"')) {
            cleanedText = cleanedText.slice(1, -1);
        }
        if (cleanedText.startsWith('`') && cleanedText.endsWith('`')) {
            cleanedText = cleanedText.slice(1, -1);
        }

        let newContent = '';
        if (range) {
            newContent = assistantMsg.content.substring(0, range.startIdx) + cleanedText + assistantMsg.content.substring(range.endIdx);
        } else {
            newContent = assistantMsg.content.replace(selectedText, cleanedText);
        }

        // Establish or preserve Version Group ID
        const versionGroupId = assistantMsg.versionGroupId || assistantMsg.id;

        if (!assistantMsg.versionGroupId) {
            await fetch(`/api/messages/${msgId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionGroupId, version: 1 })
            });
            assistantMsg.versionGroupId = versionGroupId;
            assistantMsg.version = 1;
        }

        const existingVersions = allMessages.filter(m => m.versionGroupId === versionGroupId);
        const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version || 1), 0);
        const newVersion = maxVersion + 1;

        // Deactivate older version references
        for (const v of existingVersions) {
            await fetch(`/api/messages/${v.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false })
            });
            await hideDescendants(v.id);
        }
        await fetch(`/api/messages/${msgId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: false })
        });
        await hideDescendants(msgId);

        // Save new rewritten branch version!
        await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversationId: assistantMsg.conversationId,
                role: 'assistant',
                content: newContent,
                reasoning: assistantMsg.reasoning || undefined,
                timestamp: Date.now(),
                versionGroupId: versionGroupId,
                version: newVersion,
                isActive: true,
                parentMsgId: assistantMsg.parentMsgId || null
            })
        });

        await refreshConversationView();

    } catch (err) {
        console.error("Magic Rewrite Error:", err);
        alert("Sorry, could not complete rewrite: " + err.message);
    } finally {
        if (messageDiv) messageDiv.classList.remove('rewriting');
    }
}
