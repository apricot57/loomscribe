/**
 * streaming.js — Live WebSocket Streaming Engine & Streaming Node Lifecycle
 */

import { state, setState } from '../state.js';
import { socketEvents } from '../socket.js';
import { renderMarkdown, escapeHtml } from '../markdown.js';
import { showToast } from './toast.js';

let userScrolledUp = false;
let userScrolledReasoning = false;
let streamingMessageNode = null;
let currentStreamingContent = '';
let currentStreamingReasoning = '';

// Fluid Streaming & Adaptive Queue State
let renderedContentLength = 0;
let renderedReasoningLength = 0;
let animFrameId = null;
let scrollAnimFrameId = null;
let lastMarkdownRenderTime = 0;
let lastTickTime = 0;
let isStreamFinalized = false;
let isProgrammaticScroll = false;

// EWMA Token Velocity Tracking & Cadence State
let lastTokenArrivalTime = 0;
let rollingArrivalRate = 0.045; // chars/ms (~45 chars/sec baseline)
let charAccumulator = 0;
let cadencePauseUntil = 0;

const requestAnim = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
const cancelAnim = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : clearTimeout;

function cancelStreamAnimation() {
    if (animFrameId) {
        cancelAnim(animFrameId);
        animFrameId = null;
    }
    if (scrollAnimFrameId) {
        cancelAnim(scrollAnimFrameId);
        scrollAnimFrameId = null;
    }
}

function smoothScrollTick() {
    scrollAnimFrameId = null;
    const container = document.getElementById('chat-container');
    if (!container) return;

    if (userScrolledUp) return;

    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const diff = maxScroll - container.scrollTop;

    if (Math.abs(diff) > 0.8) {
        isProgrammaticScroll = true;
        // Fluid spring interpolation factor for silky smooth autoscroll
        container.scrollTop += diff * 0.2;
        scrollAnimFrameId = requestAnim(smoothScrollTick);
    } else {
        isProgrammaticScroll = true;
        container.scrollTop = maxScroll;
    }
}

function scheduleStreamRender() {
    if (animFrameId) return;
    animFrameId = requestAnim(streamAnimationTick);
}

function streamAnimationTick() {
    animFrameId = null;
    if (!streamingMessageNode) return;

    let hasMoreToRender = false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (!lastTickTime) lastTickTime = now;
    const frameDt = Math.min(50, Math.max(8, now - lastTickTime));
    lastTickTime = now;

    // 1. Fluid Reasoning Update (plain text with smooth pacing)
    if (renderedReasoningLength < currentStreamingReasoning.length) {
        const remainingReasoning = currentStreamingReasoning.length - renderedReasoningLength;
        const reasoningStep = isStreamFinalized ? remainingReasoning : Math.max(1, Math.ceil(remainingReasoning / 4));
        renderedReasoningLength = Math.min(currentStreamingReasoning.length, renderedReasoningLength + reasoningStep);
        updateStreamingReasoning(currentStreamingReasoning.slice(0, renderedReasoningLength));
        if (renderedReasoningLength < currentStreamingReasoning.length) {
            hasMoreToRender = true;
        }
    }

    // 2. Fluid Content Update (adaptive velocity queue + punctuation cadence)
    const remaining = currentStreamingContent.length - renderedContentLength;

    if (remaining > 0) {
        if (isStreamFinalized) {
            renderedContentLength = currentStreamingContent.length;
            charAccumulator = 0;
        } else if (now >= cadencePauseUntil) {
            // Adaptive target rate (chars/ms) based on EWMA rolling velocity
            let targetRate = Math.max(0.025, Math.min(rollingArrivalRate, 0.12));
            if (remaining > 180) {
                targetRate = Math.max(targetRate, remaining / 300);
            } else if (remaining > 60) {
                targetRate = targetRate * (1 + remaining / 80);
            }

            charAccumulator += targetRate * frameDt;
            const charsToAdvance = Math.floor(charAccumulator);

            if (charsToAdvance >= 1) {
                charAccumulator -= charsToAdvance;
                const newLength = Math.min(currentStreamingContent.length, renderedContentLength + charsToAdvance);

                // Natural punctuation cadence detection
                for (let i = renderedContentLength; i < newLength; i++) {
                    const ch = currentStreamingContent[i];
                    const next = currentStreamingContent[i + 1] || '';
                    if ((ch === '.' || ch === '!' || ch === '?') && (next === ' ' || next === '\n')) {
                        cadencePauseUntil = now + 40; // 40ms sentence cadence
                        break;
                    } else if (ch === '\n' && next === '\n') {
                        cadencePauseUntil = now + 65; // 65ms paragraph cadence
                        break;
                    }
                }

                renderedContentLength = newLength;
            }
        }

        const timeSinceLastRender = now - lastMarkdownRenderTime;
        const isCaughtUp = renderedContentLength === currentStreamingContent.length;

        // Render streamed text at ~50ms intervals, or immediately when caught up / finalized
        if (timeSinceLastRender >= 50 || isCaughtUp || isStreamFinalized) {
            lastMarkdownRenderTime = now;
            const sliceToDisplay = currentStreamingContent.slice(0, renderedContentLength);
            updateStreamingContent(sliceToDisplay);
            scrollToBottom();
        }

        if (renderedContentLength < currentStreamingContent.length) {
            hasMoreToRender = true;
        }
    }

    if (hasMoreToRender && !isStreamFinalized) {
        animFrameId = requestAnim(streamAnimationTick);
    }
}

export function isUserScrolledUp() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return false;
    const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    return distanceFromBottom > 25;
}

export function resetUserScrolledUp() {
    userScrolledUp = false;
}

export function setUserScrolledUp(val) {
    userScrolledUp = !!val;
}

export function initScrollListener() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;

    // Detect user wheel events directly to respect user intent immediately
    chatContainer.addEventListener('wheel', (e) => {
        if (e.deltaY < 0) {
            userScrolledUp = true;
            if (scrollAnimFrameId) {
                cancelAnim(scrollAnimFrameId);
                scrollAnimFrameId = null;
            }
        } else {
            const dist = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
            if (dist <= 25) {
                userScrolledUp = false;
            }
        }
    }, { passive: true });

    // Detect touch drag on mobile
    chatContainer.addEventListener('touchmove', () => {
        const dist = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
        userScrolledUp = dist > 25;
        if (userScrolledUp && scrollAnimFrameId) {
            cancelAnim(scrollAnimFrameId);
            scrollAnimFrameId = null;
        }
    }, { passive: true });

    // General scroll listener with programmatic scroll protection
    chatContainer.addEventListener('scroll', () => {
        if (isProgrammaticScroll) {
            isProgrammaticScroll = false;
            return;
        }
        const dist = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
        if (dist > 25) {
            userScrolledUp = true;
            if (scrollAnimFrameId) {
                cancelAnim(scrollAnimFrameId);
                scrollAnimFrameId = null;
            }
        } else {
            userScrolledUp = false;
        }
    }, { passive: true });
}

export function initSocketStreaming() {
    initScrollListener();

    socketEvents.subscribe((event) => {
        if (event.conversationId && event.conversationId !== state.currentConversationId) {
            return;
        }

        if (event.type === 'init') {
            cancelStreamAnimation();
            isStreamFinalized = false;
            currentStreamingContent = '';
            currentStreamingReasoning = '';
            renderedContentLength = 0;
            renderedReasoningLength = 0;
            lastMarkdownRenderTime = 0;
            lastTickTime = 0;
            lastTokenArrivalTime = 0;
            rollingArrivalRate = 0.045;
            charAccumulator = 0;
            cadencePauseUntil = 0;
            createStreamingNode();
            scrollToBottom(true);
        } else if (event.type === 'token') {
            if (!streamingMessageNode) {
                createStreamingNode();
            }
            if (event.reasoning) {
                currentStreamingReasoning += event.reasoning;
                scheduleStreamRender();
            }
            if (event.content) {
                const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                if (lastTokenArrivalTime > 0) {
                    const dt = Math.max(12, now - lastTokenArrivalTime);
                    const instantRate = event.content.length / dt;
                    // Smooth EWMA: blend 70% historical, 30% instant
                    rollingArrivalRate = rollingArrivalRate * 0.7 + instantRate * 0.3;
                }
                lastTokenArrivalTime = now;
                currentStreamingContent += event.content;
                scheduleStreamRender();
            }
        } else if (event.type === 'done') {
            isStreamFinalized = true;
            cancelStreamAnimation();
            renderedContentLength = currentStreamingContent.length;
            renderedReasoningLength = currentStreamingReasoning.length;
            if (currentStreamingReasoning) {
                updateStreamingReasoning(currentStreamingReasoning);
            }
            if (currentStreamingContent) {
                if (streamingMessageNode) {
                    const body = streamingMessageNode.querySelector('.markdown-body');
                    if (body) {
                        body.innerHTML = renderMarkdown(currentStreamingContent);
                    }
                }
            }
            scrollToBottom();
            finalizeStreaming(event.message);
        } else if (event.type === 'error') {
            isStreamFinalized = true;
            cancelStreamAnimation();
            renderedContentLength = currentStreamingContent.length;
            if (currentStreamingContent) {
                if (streamingMessageNode) {
                    const body = streamingMessageNode.querySelector('.markdown-body');
                    if (body) {
                        body.innerHTML = renderMarkdown(currentStreamingContent);
                    }
                }
            }
            handleStreamingError(event.error, event.message);
        } else if (event.type === 'close') {
            if (!streamingMessageNode) return;
            isStreamFinalized = true;
            cancelStreamAnimation();
            renderedContentLength = currentStreamingContent.length;
            if (currentStreamingContent) {
                if (streamingMessageNode) {
                    const body = streamingMessageNode.querySelector('.markdown-body');
                    if (body) {
                        body.innerHTML = renderMarkdown(currentStreamingContent);
                    }
                }
            }
            handleStreamingError('Connection lost — partial response saved', event.message);
        }
    });
}

export function createStreamingNode(replaceNode = null) {
    removeStreamingNode();

    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    // Remove empty state if present
    const emptyState = listEl.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = 'msg-row assistant streaming';
    row.id = 'active-streaming-node';

    row.innerHTML = `
        <div class="msg-bubble">
            <div class="reasoning-box hidden">
                <div class="reasoning-header">
                    <div class="reasoning-label">
                        <span class="reasoning-pulse"></span>
                        <span>Thinking...</span>
                    </div>
                    <svg class="reasoning-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
                <div class="reasoning-content"></div>
            </div>
            <div class="markdown-body">
                <span class="streaming-cursor" aria-hidden="true"></span>
            </div>
        </div>
    `;

    if (replaceNode && replaceNode.parentNode) {
        replaceNode.replaceWith(row);
    } else {
        listEl.appendChild(row);
    }

    streamingMessageNode = row;
    userScrolledReasoning = false;

    const reasoningContent = row.querySelector('.reasoning-content');
    if (reasoningContent) {
        reasoningContent.addEventListener('scroll', () => {
            const distFromBottom = reasoningContent.scrollHeight - reasoningContent.scrollTop - reasoningContent.clientHeight;
            userScrolledReasoning = distFromBottom > 25;
        }, { passive: true });
    }

    const reasoningHeader = row.querySelector('.reasoning-header');
    if (reasoningHeader) {
        reasoningHeader.addEventListener('click', () => {
            const box = row.querySelector('.reasoning-box');
            box?.classList.toggle('collapsed');
        });
    }
}

export function updateStreamingReasoning(reasoning) {
    if (!streamingMessageNode) return;
    const box = streamingMessageNode.querySelector('.reasoning-box');
    const contentEl = streamingMessageNode.querySelector('.reasoning-content');
    if (box && contentEl) {
        box.classList.remove('hidden');
        contentEl.textContent = reasoning;
        if (!userScrolledReasoning) {
            contentEl.scrollTop = contentEl.scrollHeight;
        }
    }
}

export function updateStreamingContent(content) {
    if (!streamingMessageNode) return;
    const body = streamingMessageNode.querySelector('.markdown-body');
    if (!body) return;

    if (!content) {
        body.innerHTML = '<span class="streaming-cursor" aria-hidden="true"></span>';
        return;
    }

    // Rendering full Markdown on every token repeatedly reparses all prior content.
    // Stream plain text, then render and sanitize Markdown once at completion.
    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    body.replaceChildren(document.createTextNode(content), cursor);
}

export async function finalizeStreaming(savedMessage) {
    cancelStreamAnimation();
    isStreamFinalized = true;
    const chatContainer = document.getElementById('chat-container');
    const wasScrolledUp = userScrolledUp || isUserScrolledUp();
    const prevScrollTop = chatContainer ? chatContainer.scrollTop : 0;

    // Retain node until renderMessagesList replaces it to prevent scroll height collapse
    streamingMessageNode = null;

    const { loadActiveConversation, updateContinueButton } = await import('./chat.js');
    await loadActiveConversation(state.currentConversationId, false, wasScrolledUp, prevScrollTop);
    userScrolledUp = wasScrolledUp;
    if (!wasScrolledUp) {
        scrollToBottom();
    }
    updateContinueButton(state.activeMessages);
}

export function handleStreamingError(errorText, savedMessage) {
    cancelStreamAnimation();
    isStreamFinalized = true;
    showToast(errorText || 'Generation encountered an error', 'error', 4000);

    if (streamingMessageNode) {
        const body = streamingMessageNode.querySelector('.markdown-body');
        if (body) {
            body.innerHTML += `
                <div class="error-msg-banner" style="margin-top: 10px; color: var(--danger); font-size: 0.85rem;">
                    ⚠️ ${escapeHtml(errorText || 'Generation stopped with error')}
                </div>
            `;
        }
        streamingMessageNode.classList.remove('streaming');
    }

    if (savedMessage) {
        const updated = [...state.activeMessages, savedMessage];
        setState('activeMessages', updated);
    }
}

export function removeStreamingNode() {
    cancelStreamAnimation();
    isStreamFinalized = true;
    if (streamingMessageNode) {
        streamingMessageNode.remove();
        streamingMessageNode = null;
    }
}

export function scrollToBottom(force = false) {
    const container = document.getElementById('chat-container');
    if (!container) return;

    if (force) {
        if (scrollAnimFrameId) {
            cancelAnim(scrollAnimFrameId);
            scrollAnimFrameId = null;
        }
        userScrolledUp = false;
        container.scrollTop = container.scrollHeight;
        return;
    }

    if (!userScrolledUp) {
        if (!scrollAnimFrameId) {
            scrollAnimFrameId = requestAnim(smoothScrollTick);
        }
    }
}

export function updateStreamingUI(isStreaming) {
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const chatInput = document.getElementById('chat-input');

    if (isStreaming) {
        if (sendBtn) sendBtn.classList.add('hidden');
        if (stopBtn) stopBtn.classList.remove('hidden');
        if (chatInput) chatInput.placeholder = 'Generating response...';
    } else {
        if (sendBtn) sendBtn.classList.remove('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');
        if (chatInput) chatInput.placeholder = 'Message Assistant or specify direction...';
    }
}
