/**
 * chat.js — Chat Feed Controller, Input & Prompt Generation Engine
 *
 * Coordinates:
 * - messages.js: Message node rendering, inline editing, and turn version navigation
 * - streaming.js: WebSocket real-time token streaming and reasoning UI
 */

import { state, setState, subscribe } from '../state.js';
import {
    getConversation,
    getMessages,
    createConversation,
    createMessage,
    updateConversation
} from '../api.js';
import { sendGenerate, sendAbort, socketEvents } from '../socket.js';
import { showToast } from './toast.js';
import { renderInspector } from './inspector.js';
import { renderMessagesList, renderEmptyFeed, appendMessageNode } from './messages.js';
import {
    initSocketStreaming,
    createStreamingNode,
    removeStreamingNode,
    scrollToBottom,
    updateStreamingUI,
    isUserScrolledUp,
    resetUserScrolledUp
} from './streaming.js';

let latestConversationLoad = 0;

export function hasUsableActiveModel(config = state.serverConfig) {
    const activeModel = config?.activeModel;
    if (typeof activeModel !== 'string' || !activeModel) return false;

    const modelMatches = (models = []) => models.some(model => (typeof model === 'string' ? model : model?.id) === activeModel);
    if ((config.customModels || []).some(model => model.id === activeModel)) return true;
    if ((config.pinnedOpenRouterModels || []).includes(activeModel) || activeModel.includes('/')) return !!config.hasOpenRouterKey;
    if ((config.pinnedGlmModels || []).includes(activeModel) || modelMatches(config.glmModels) || activeModel.toLowerCase().startsWith('glm-')) return !!config.hasGlmKey;
    if ((config.pinnedOpenAIModels || []).includes(activeModel) || modelMatches(config.openaiModels) || /^(gpt-|o[1-9]|chatgpt-)/i.test(activeModel)) return !!config.hasOpenAIKey;
    return !!(config.hasDeepSeekKey || config.hasKey);
}

export function initChat() {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const continueBtn = document.getElementById('continue-story-btn');
    const exportBtn = document.getElementById('export-chat-btn');
    const thinkingChipBtn = document.getElementById('thinking-toggle-chip');
    const modelChipBtn = document.getElementById('active-model-chip');
    const presetChipBtn = document.getElementById('active-preset-chip');
    const inspectorToggleBtn = document.getElementById('inspector-toggle-btn');
    const chatHeaderTitle = document.getElementById('chat-header-title');
    // Auto-resize textarea as user types
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = `${Math.min(chatInput.scrollHeight, 200)}px`;
            updateSendButtonState();
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSendMessage();
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => handleStopGeneration());
    }

    if (continueBtn) {
        continueBtn.addEventListener('click', () => handleContinueGeneration());
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => handleExportChat());
    }

    if (inspectorToggleBtn) {
        inspectorToggleBtn.addEventListener('click', () => {
            toggleInspector();
        });
    }

    // Default inspector state on mobile is closed
    if (window.innerWidth <= 900) {
        toggleInspector(false);
    }


    if (presetChipBtn) {
        presetChipBtn.addEventListener('click', () => {
            import('./preset-picker.js').then(m => m.openPresetPickerModal());
        });
    }

    if (thinkingChipBtn) {
        thinkingChipBtn.addEventListener('click', () => {
            const activeModel = state.serverConfig?.activeModel;
            const custom = state.serverConfig?.customModels?.find(m => m.id === activeModel);
            const isOpenRouter = (state.serverConfig?.pinnedOpenRouterModels || []).includes(activeModel) ||
                                 (typeof activeModel === 'string' && activeModel.includes('/') && !activeModel.startsWith('http'));
            const isGlm = !isOpenRouter && (
                (typeof activeModel === 'string' && activeModel.toLowerCase().startsWith('glm')) ||
                (custom && (custom.name.toLowerCase().includes('glm') || custom.model.toLowerCase().includes('glm') || (custom.endpoint && custom.endpoint.toLowerCase().includes('z.ai'))))
            );

            if (isOpenRouter) {
                const details = state.serverConfig?.openrouterModelDetails?.[activeModel] || {};
                const reasoning = details.reasoning;
                const isMandatory = reasoning?.mandatory === true;

                if (isMandatory) {
                    showToast(`Thinking is mandatory for ${details.name || activeModel}`, 'info', 2000);
                    return;
                }

                const currentEffort = details.reasoningEffort;
                const isCurrentlyActive = currentEffort !== 'disabled';
                const nextEffort = isCurrentlyActive
                    ? 'disabled'
                    : (reasoning?.default_effort || (Array.isArray(reasoning?.supported_efforts) && reasoning.supported_efforts[0]) || 'default');

                const updatedDetails = {
                    ...(state.serverConfig?.openrouterModelDetails || {}),
                    [activeModel]: {
                        ...details,
                        name: details.name || activeModel,
                        reasoningEffort: nextEffort
                    }
                };

                import('../api.js').then(async ({ updateConfig }) => {
                    try {
                        const cfg = await updateConfig({ openrouterModelDetails: updatedDetails });
                        setState('serverConfig', {
                            ...state.serverConfig,
                            openrouterModelDetails: cfg.openrouterModelDetails || updatedDetails
                        });
                        showToast(`Thinking ${nextEffort !== 'disabled' ? 'enabled (' + nextEffort + ')' : 'disabled'} for ${details.name || activeModel}`, 'info', 2000);
                    } catch (err) {
                        showToast('Failed to toggle thinking mode', 'error');
                    }
                });
            } else if (isGlm) {
                const current = state.serverConfig?.glmThinkingMode || 'low';
                const next = current !== 'disabled' ? 'disabled' : 'low';
                import('../api.js').then(async ({ updateConfig }) => {
                    try {
                        const cfg = await updateConfig({ glmThinkingMode: next });
                        setState('serverConfig', { ...state.serverConfig, glmThinkingMode: cfg.glmThinkingMode });
                        showToast(`GLM Thinking mode ${next !== 'disabled' ? next : 'disabled'}`, 'info', 2000);
                    } catch (err) {
                        showToast('Failed to toggle thinking mode', 'error');
                    }
                });
            } else {
                const current = state.serverConfig?.thinkingMode || 'disabled';
                const next = current === 'enabled' ? 'disabled' : 'enabled';
                import('../api.js').then(async ({ updateConfig }) => {
                    try {
                        const cfg = await updateConfig({ thinkingMode: next });
                        setState('serverConfig', { ...state.serverConfig, thinkingMode: cfg.thinkingMode });
                        showToast(`Thinking mode ${next === 'enabled' ? 'enabled' : 'disabled'}`, 'info', 2000);
                    } catch (err) {
                        showToast('Failed to toggle thinking mode', 'error');
                    }
                });
            }
        });
    }

    if (chatHeaderTitle) {
        chatHeaderTitle.addEventListener('click', () => {
            if (!state.currentConversationId) return;
            const currentTitle = state.activeConversation?.title || 'New Chat';
            const newTitle = prompt('Rename chat:', currentTitle);
            if (newTitle && newTitle.trim() && newTitle !== currentTitle) {
                updateConversation(state.currentConversationId, { title: newTitle.trim() }).then(updated => {
                    setState('activeConversation', updated);
                    const convs = state.conversations.map(c => c.id === updated.id ? { ...c, title: updated.title } : c);
                    setState('conversations', convs);
                    chatHeaderTitle.textContent = updated.title;
                    showToast('Chat renamed', 'success', 2000);
                }).catch(() => showToast('Failed to rename chat', 'error'));
            }
        });
    }

    const costChip = document.getElementById('conversation-cost-chip');
    if (costChip) {
        costChip.addEventListener('click', () => {
            const totalCost = parseFloat(costChip.dataset.totalCost || '0');
            const promptTokens = parseInt(costChip.dataset.promptTokens || '0', 10);
            const completionTokens = parseInt(costChip.dataset.completionTokens || '0', 10);
            const totalTokens = promptTokens + completionTokens;
            const costStr = totalCost < 0.0001 ? '< $0.0001' : `$${totalCost.toFixed(4)}`;
            showToast(`Conversation Cost: ${costStr} (Tokens: ${totalTokens.toLocaleString()} total — ${promptTokens.toLocaleString()} prompt, ${completionTokens.toLocaleString()} completion)`, 'info', 4000);
        });
    }

    // Initialize chat chips toggle (collapse/expand settings icon)
    initChatChipsToggle();

    // Subscribe to state changes
    subscribe('isStreaming', (streaming) => {
        updateStreamingUI(streaming);
        updateSendButtonState();
    });
    subscribe('serverConfig', (config) => {
        updateChipsUI(config);
        updateSendButtonState();
    });
    subscribe('activeConversation', (conv) => updateConversationHeader(conv));
    subscribe('enginePresets', () => updateConversationHeader(state.activeConversation));
    subscribe('activeMessages', (msgs) => updateConversationCostChip(msgs));
    updateChipsUI(state.serverConfig);
    updateSendButtonState();
    updateConversationCostChip(state.activeMessages);

    // Register WebSocket streaming handlers
    initSocketStreaming();

    // Listen to streaming 'done' event for immediate cost update
    socketEvents.subscribe((event) => {
        if (event.type === 'done') {
            if (event.message && (typeof event.message.cost === 'number' || typeof event.message.usage?.cost === 'number')) {
                const existingIdx = state.activeMessages.findIndex(m => m.id === event.message.id);
                const updated = existingIdx >= 0
                    ? state.activeMessages.map((m, idx) => idx === existingIdx ? event.message : m)
                    : [...state.activeMessages, event.message];
                updateConversationCostChip(updated);
            } else {
                updateConversationCostChip(state.activeMessages);
            }
        }
    });
}

export function initChatChipsToggle() {
    const chatSettingsBtn = document.getElementById('chat-settings-toggle-btn');
    const inputChips = document.getElementById('input-chips');
    if (!chatSettingsBtn || !inputChips) return;

    const savedState = localStorage.getItem('ls_chat_chips_expanded');
    let isExpanded = false;

    if (savedState !== null) {
        isExpanded = savedState === 'true';
    } else {
        isExpanded = window.innerWidth > 600;
    }

    const applyChipsState = (expanded) => {
        if (expanded) {
            inputChips.classList.remove('collapsed');
            chatSettingsBtn.classList.add('active');
            chatSettingsBtn.setAttribute('title', 'Collapse quick options');
        } else {
            inputChips.classList.add('collapsed');
            chatSettingsBtn.classList.remove('active');
            chatSettingsBtn.setAttribute('title', 'Expand quick options');
        }
    };

    applyChipsState(isExpanded);

    chatSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isExpanded = !isExpanded;
        localStorage.setItem('ls_chat_chips_expanded', String(isExpanded));
        applyChipsState(isExpanded);
    });
}

export function toggleInspector(forceOpen = null) {
    const pane = document.getElementById('inspector-pane');
    const btn = document.getElementById('inspector-toggle-btn');
    const backdrop = document.getElementById('layout-backdrop');
    if (!pane) return;

    const isOpen = pane.classList.contains('open');
    const nextOpen = forceOpen !== null ? forceOpen : !isOpen;

    if (nextOpen) {
        pane.classList.add('open');
        btn?.classList.add('active');
        if (backdrop && window.innerWidth <= 900) {
            backdrop.classList.add('active');
        }
        if (state.activeConversation) {
            renderInspector(state.activeConversation);
        }
    } else {
        pane.classList.remove('open');
        btn?.classList.remove('active');
        if (backdrop) {
            const sidebar = document.getElementById('sidebar');
            const sidebarOpen = sidebar && sidebar.classList.contains('open');
            if (!sidebarOpen) {
                backdrop.classList.remove('active');
            }
        }
    }
    setState('inspectorOpen', nextOpen);
}

export async function loadActiveConversation(convId, forceScroll = true, forceWasScrolledUp = null, forcePrevScrollTop = null) {
    const loadId = ++latestConversationLoad;
    if (!convId) {
        renderEmptyFeed();
        updateConversationCostChip([]);
        return;
    }

    const chatContainer = document.getElementById('chat-container');
    const wasScrolledUp = forceWasScrolledUp !== null ? forceWasScrolledUp : isUserScrolledUp();
    const prevScrollTop = forcePrevScrollTop !== null ? forcePrevScrollTop : (chatContainer ? chatContainer.scrollTop : 0);
    try {
        const [conv, messages] = await Promise.all([
            getConversation(convId),
            getMessages(convId)
        ]);

        if (loadId !== latestConversationLoad || String(state.currentConversationId) !== String(convId)) return;

        setState('activeConversation', conv);
        setState('allMessages', messages);

        // Filter active tree messages
        const activeMessages = messages.filter(m => m.isActive !== false);
        activeMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setState('activeMessages', activeMessages);

        renderMessagesList(activeMessages, messages);
        renderInspector(conv);
        updateContinueButton(activeMessages);
        updateConversationCostChip(activeMessages);

        if (forceScroll) {
            scrollToBottom(true);
        } else if (chatContainer && wasScrolledUp) {
            chatContainer.scrollTop = prevScrollTop;
        } else {
            scrollToBottom(false);
        }
    } catch (err) {
        if (loadId !== latestConversationLoad || String(state.currentConversationId) !== String(convId)) return;
        console.error('Failed to load conversation details:', err);
        showToast('Could not load chat history', 'error');
    }
}

export async function handleSendMessage() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput || state.isStreaming) return;
    if (!hasUsableActiveModel()) {
        showToast('Configure a model provider before sending a message', 'warning');
        updateSendButtonState();
        return;
    }

    const content = chatInput.value.trim();
    if (!content) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';
    updateSendButtonState();

    let convId = state.currentConversationId;
    if (!convId) {
        // Create new conversation first
        const autoTitle = buildAutoTitle(content);
        const newConv = await createConversation({
            title: autoTitle,
            activeModel: state.serverConfig?.activeModel || 'deepseek-v4-pro',
            presetId: state.enginePresets?.[0]?.id || null
        });
        convId = newConv.id;
        setState('conversations', [newConv, ...state.conversations]);
        setState('currentConversationId', convId);
        setState('activeConversation', newConv);
    }

    // Determine parentMsgId
    const lastActive = state.activeMessages[state.activeMessages.length - 1];
    const parentMsgId = lastActive ? lastActive.id : null;

    try {
        // Save user message to DB
        const userMsg = await createMessage({
            conversationId: convId,
            role: 'user',
            content,
            parentMsgId,
            isActive: true
        });

        // Update local active messages and render
        const updated = [...state.activeMessages, userMsg];
        setState('activeMessages', updated);
        appendMessageNode(userMsg);

        // Auto-title conversation if default title
        if (state.activeConversation?.title === 'New Chat' || !state.activeConversation?.title) {
            const autoTitle = buildAutoTitle(content);
            updateConversation(convId, { title: autoTitle }).then(updatedConv => {
                setState('activeConversation', updatedConv);
                const convs = state.conversations.map(c => c.id === convId ? { ...c, title: autoTitle } : c);
                setState('conversations', convs);
            }).catch(() => {});
        }

        // Trigger AI Generation
        await triggerGenerateResponse({
            conversationId: convId,
            parentMsgId: userMsg.id
        });
    } catch (err) {
        console.error('Failed to send user message:', err);
        showToast('Failed to send message', 'error');
    }
}

export async function triggerGenerateResponse({ conversationId, parentMsgId, versionGroupId = null, version = 1, replaceNode = null, retriedMsgId = null }) {
    resetUserScrolledUp();
    // Filter active messages to exclude the retried assistant message so prompt only includes history up to parent
    let messages = state.activeMessages;
    if (retriedMsgId) {
        messages = messages.filter(m => m.id !== retriedMsgId);
    }
    const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content
    }));

    // Create live streaming placeholder node in UI (replaces the retried node in-place if provided)
    createStreamingNode(replaceNode);
    scrollToBottom(true);
    try {
        const activeModel = state.serverConfig.activeModel;
        const custom = state.serverConfig?.customModels?.find(m => m.id === activeModel);
        const isOpenRouter = (state.serverConfig?.pinnedOpenRouterModels || []).includes(activeModel) ||
                             (typeof activeModel === 'string' && activeModel.includes('/') && !activeModel.startsWith('http'));
        const isGlm = !isOpenRouter && (
                      (typeof activeModel === 'string' && activeModel.toLowerCase().startsWith('glm')) ||
                      (custom && (custom.name.toLowerCase().includes('glm') || custom.model.toLowerCase().includes('glm') || (custom.endpoint && custom.endpoint.toLowerCase().includes('z.ai')))));
        
        let modelThinking;
        if (isOpenRouter) {
            const orDetails = state.serverConfig?.openrouterModelDetails?.[activeModel];
            const effort = orDetails?.reasoningEffort || (orDetails?.reasoning?.mandatory ? (orDetails?.reasoning?.default_effort || 'minimal') : (orDetails?.reasoning ? 'default' : 'disabled'));
            modelThinking = { type: effort };
        } else if (isGlm) {
            modelThinking = { type: state.serverConfig.glmThinkingMode || 'low' };
        } else {
            modelThinking = { type: state.serverConfig.thinkingMode || 'disabled' };
        }

        sendGenerate({
            conversationId,
            model: state.serverConfig.activeModel,
            messages: apiMessages,
            thinking: modelThinking,
            parentMsgId,
            versionGroupId,
            version
        });
    } catch (err) {
        showToast(err.message || 'Failed to start generation', 'error');
        removeStreamingNode();
    }
}

export function handleStopGeneration() {
    if (!state.isStreaming || !state.currentConversationId) return;
    sendAbort(state.currentConversationId);
    showToast('Generation stopped', 'info', 1500);
}

export function handleContinueGeneration() {
    if (state.isStreaming || !state.currentConversationId) return;
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = 'Continue writing the narrative smoothly from the exact point you left off.';
        handleSendMessage();
    }
}

export function handleExportChat() {
    if (!state.activeConversation || state.activeMessages.length === 0) {
        showToast('No messages to export', 'warning');
        return;
    }

    let markdown = `# ${state.activeConversation.title || 'Conversation Export'}\n\n`;
    markdown += `*Exported from LoomScribe on ${new Date().toLocaleString()}*\n\n---\n\n`;

    state.activeMessages.forEach(msg => {
        const sender = msg.role === 'user' ? 'User' : 'Assistant';
        markdown += `### ${sender}\n\n`;
        if (msg.reasoning) {
            markdown += `> **Thought Process:**\n> ${msg.reasoning.replace(/\n/g, '\n> ')}\n\n`;
        }
        markdown += `${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.activeConversation.title || 'chat').replace(/[^a-z0-9_-]/gi, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export downloaded as Markdown', 'success');
}

export function updateSendButtonState() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    if (!chatInput || !sendBtn) return;

    const hasText = chatInput.value.trim().length > 0;
    const canGenerate = hasUsableActiveModel();
    sendBtn.disabled = !hasText || state.isStreaming || !canGenerate;
    sendBtn.title = canGenerate ? '' : 'Configure a model provider before sending a message';
}

export function updateConversationHeader(conv) {
    const titleEl = document.getElementById('chat-header-title');
    if (titleEl && conv) {
        titleEl.textContent = conv.title || 'New Chat';
    }

    const presetChip = document.getElementById('active-preset-chip');
    if (presetChip && conv) {
        const preset = state.enginePresets?.find(p => p.id === conv.presetId);
        const nameEl = presetChip.querySelector('.chip-name');
        if (nameEl) {
            nameEl.textContent = preset ? preset.title : 'No Preset';
        }
    }
}
export function updateChipsUI(config) {
    const modelChip = document.getElementById('active-model-chip');
    const activeModel = config?.activeModel || '';

    if (modelChip && config) {
        const nameEl = modelChip.querySelector('.chip-name');
        if (nameEl) {
            const custom = config.customModels?.find(m => m.id === activeModel);
            if (custom) {
                nameEl.textContent = custom.name;
            } else if (config.openrouterModelDetails?.[activeModel]?.name) {
                nameEl.textContent = config.openrouterModelDetails[activeModel].name;
            } else if (activeModel) {
                if (activeModel === 'deepseek-v4-pro') nameEl.textContent = 'DeepSeek V4 Pro';
                else if (activeModel === 'deepseek-v4-flash') nameEl.textContent = 'DeepSeek V4 Flash';
                else if (activeModel === 'glm-4.7-flashx') nameEl.textContent = 'GLM-4.7 FlashX';
                else if (activeModel === 'glm-4.7-flash') nameEl.textContent = 'GLM-4.7 Flash';
                else if (activeModel === 'glm-4.7') nameEl.textContent = 'GLM-4.7';
                else if (activeModel === 'glm-5.3-flash') nameEl.textContent = 'GLM-5.3 Flash';
                else nameEl.textContent = activeModel;
            } else if (config.hasGlmKey && config.glmModels?.length > 0) {
                nameEl.textContent = config.glmModels[0];
            } else if (config.hasOpenAIKey && config.openaiModels?.length > 0) {
                nameEl.textContent = config.openaiModels[0];
            } else if (config.hasKey || config.hasDeepSeekKey) {
                nameEl.textContent = 'DeepSeek V4 Pro';
            } else if (config.customModels && config.customModels.length > 0) {
                nameEl.textContent = config.customModels[0].name;
            } else {
                nameEl.textContent = 'Select Model';
            }
        }
    }

    const thinkingChip = document.getElementById('thinking-toggle-chip');
    if (thinkingChip) {
        const custom = config?.customModels?.find(m => m.id === activeModel);
        const isOpenRouter = (config?.pinnedOpenRouterModels || []).includes(activeModel) ||
                             (typeof activeModel === 'string' && activeModel.includes('/') && !activeModel.startsWith('http'));
        const isDeepSeek = !isOpenRouter && (
                           activeModel === 'deepseek-v4-pro' || 
                           activeModel === 'deepseek-v4-flash' || 
                           (typeof activeModel === 'string' && activeModel.toLowerCase().startsWith('deepseek')) ||
                           (custom && (custom.name.toLowerCase().includes('deepseek') || custom.model.toLowerCase().includes('deepseek'))));
        const isGlm = !isOpenRouter && (
                      (typeof activeModel === 'string' && activeModel.toLowerCase().startsWith('glm')) ||
                      (custom && (custom.name.toLowerCase().includes('glm') || custom.model.toLowerCase().includes('glm') || (custom.endpoint && custom.endpoint.toLowerCase().includes('z.ai')))));

        const orDetails = isOpenRouter ? config?.openrouterModelDetails?.[activeModel] : null;
        const hasReasoningParam = Array.isArray(orDetails?.supportedParameters) &&
            orDetails.supportedParameters.some(p => p === 'reasoning' || p === 'reasoning_effort' || p === 'include_reasoning');
        const isOpenRouterReasoning = isOpenRouter && (
            !!orDetails?.reasoning ||
            hasReasoningParam ||
            (!orDetails && /(?:deepseek-r1|reason|thinking|qwq|o1|o3|o4)/i.test(activeModel))
        );

        if (isOpenRouterReasoning || isDeepSeek || isGlm) {
            thinkingChip.classList.remove('hidden');

            let isThinkingActive = false;
            if (isOpenRouterReasoning) {
                const isMandatory = orDetails?.reasoning?.mandatory === true;
                const effort = orDetails?.reasoningEffort;
                if (isMandatory) {
                    isThinkingActive = true;
                    thinkingChip.title = `Thinking is mandatory for ${orDetails?.name || activeModel}`;
                } else if (effort === 'disabled') {
                    isThinkingActive = false;
                    thinkingChip.title = 'Thinking mode disabled — click to enable';
                } else {
                    isThinkingActive = true;
                    const effortLabel = (effort && effort !== 'default') ? effort : (orDetails?.reasoning?.default_effort || 'Auto');
                    thinkingChip.title = `Thinking mode active (${effortLabel}) — click to disable`;
                }
            } else if (isGlm) {
                isThinkingActive = !!(config?.glmThinkingMode && config.glmThinkingMode !== 'disabled');
                thinkingChip.title = isThinkingActive ? `GLM Thinking active (${config.glmThinkingMode}) — click to toggle` : 'GLM Thinking disabled — click to enable';
            } else {
                isThinkingActive = (config?.thinkingMode === 'enabled');
                thinkingChip.title = isThinkingActive ? 'Thinking mode enabled — click to toggle' : 'Thinking mode disabled — click to enable';
            }

            if (isThinkingActive) {
                thinkingChip.classList.add('active');
            } else {
                thinkingChip.classList.remove('active');
            }
        } else {
            thinkingChip.classList.add('hidden');
        }
    }
}

export function updateContinueButton(activeMessages) {
    const continueBtn = document.getElementById('continue-story-btn');
    if (!continueBtn) return;

    if (activeMessages && activeMessages.length > 0) {
        const last = activeMessages[activeMessages.length - 1];
        if (last.role === 'assistant' && !state.isStreaming) {
            continueBtn.classList.remove('hidden');
            return;
        }
    }
    continueBtn.classList.add('hidden');
}

export function buildAutoTitle(content) {
    if (!content) return 'New Chat';
    const cleaned = content.trim().replace(/\s+/g, ' ');
    return cleaned.slice(0, 100);
}

export function updateConversationCostChip(messages = state.activeMessages) {
    const costChip = document.getElementById('conversation-cost-chip');
    const costText = document.getElementById('conversation-cost-text');
    if (!costChip || !costText) return;

    const msgs = messages || [];
    let totalCost = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for (const m of msgs) {
        const cost = typeof m.cost === 'number' ? m.cost : (typeof m.usage?.cost === 'number' ? m.usage.cost : 0);
        totalCost += cost;
        if (m.usage) {
            if (typeof m.usage.prompt_tokens === 'number') totalPromptTokens += m.usage.prompt_tokens;
            if (typeof m.usage.completion_tokens === 'number') totalCompletionTokens += m.usage.completion_tokens;
        }
    }

    if (totalCost > 0) {
        costChip.style.display = 'inline-flex';
        let formattedCost = '';
        if (totalCost < 0.0001) {
            formattedCost = '< $0.0001';
        } else {
            formattedCost = `$${totalCost.toFixed(4)}`;
        }
        costText.textContent = formattedCost;
        costChip.title = `Total Cost: ${formattedCost}\nPrompt Tokens: ${totalPromptTokens.toLocaleString()}\nCompletion Tokens: ${totalCompletionTokens.toLocaleString()}\nClick for breakdown`;
        costChip.dataset.promptTokens = String(totalPromptTokens);
        costChip.dataset.completionTokens = String(totalCompletionTokens);
        costChip.dataset.totalCost = String(totalCost);
    } else {
        costChip.style.display = 'none';
        costChip.dataset.promptTokens = '0';
        costChip.dataset.completionTokens = '0';
        costChip.dataset.totalCost = '0';
    }
}

