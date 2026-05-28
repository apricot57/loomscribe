import { state, getSystemPromptContentSync } from './js/state.js';
import { loadFactoryPrompts, autoTitleConversation } from './js/api.js';
import {
    initializeThinkingUI,
    initializeModelUI,
    updateKeyStatusUI,
    loadConversations,
    switchConversation,
    createNewConversation,
    closeDeleteConfirmModal,
    populatePromptDropdown,
    setSystemPrompt,
    addMessageToUI,
    attachMessageActions,
    removeTypingIndicator,
    updateContinueButtonVisibility,
    closeModal,
    updatePromptSelectorDisplay,
    streamApiResponse,
    showToast
} from './js/ui.js';

// Load Magic module which automatically binds its selection & click listeners
import './js/magic.js';

function safeAsync(fn) {
    return function (...args) {
        Promise.resolve(fn(...args)).catch((err) => {
            console.error("Unhandled async error caught by safeAsync boundary:", err);
        });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const stopBtn = document.getElementById('stop-btn');
    const exportChatBtn = document.getElementById('export-chat-btn');

    // Model Selector DOM Elements
    const modelSelectBtn = document.getElementById('model-select-btn');
    const modelDropdownMenu = document.getElementById('model-dropdown-menu');
    const dropdownItems = document.querySelectorAll('.dropdown-item');

    // DOM Elements for API Key configuration
    const keyBtn = document.getElementById('key-btn');
    const keyModal = document.getElementById('key-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const deleteKeyBtn = document.getElementById('delete-key-btn');

    // New Chat Modal DOM Elements
    const newChatModal = document.getElementById('new-chat-modal');
    const newChatModalCloseBtn = document.getElementById('new-chat-modal-close-btn');
    const newChatTitleInput = document.getElementById('new-chat-title-input');
    const modalPromptSelectBtn = document.getElementById('modal-prompt-select-btn');
    const modalActivePromptName = document.getElementById('modal-active-prompt-name');
    const modalPromptDropdownMenu = document.getElementById('modal-prompt-dropdown-menu');
    const startChatBtn = document.getElementById('start-chat-btn');

    // Prompt Editor Modal DOM Elements
    const promptEditorModal = document.getElementById('prompt-editor-modal');
    const promptEditorCloseBtn = document.getElementById('prompt-editor-close-btn');
    const promptNameInput = document.getElementById('prompt-name-input');
    const promptCategoryInput = document.getElementById('prompt-category-input');
    const promptContentInput = document.getElementById('prompt-content-input');
    const savePromptBtn = document.getElementById('save-prompt-btn');

    // Delete Confirmation Modal DOM Elements
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    const deleteConfirmCloseBtn = document.getElementById('delete-confirm-close-btn');
    const deleteConfirmCancelBtn = document.getElementById('delete-confirm-cancel-btn');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

    // Footer Prompt Selector DOM Elements
    const promptSelectBtn = document.getElementById('prompt-select-btn');
    const promptDropdownMenu = document.getElementById('prompt-dropdown-menu');

    // Continue Button DOM Element
    const continueBtn = document.getElementById('continue-btn');

    // Toggle Sidebar on mobile viewports
    if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebar.classList.add('active');
        });
    }

    if (sidebarCloseBtn && sidebar) {
        sidebarCloseBtn.addEventListener('click', () => {
            sidebar.classList.remove('active');
        });
    }

    // Toggle model dropdown menu
    if (modelSelectBtn && modelDropdownMenu) {
        modelSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modelDropdownMenu.classList.toggle('hidden');
            modelSelectBtn.parentElement.classList.toggle('open');
        });

        // Close dropdowns when clicking anywhere else
        document.addEventListener('click', () => {
            modelDropdownMenu.classList.add('hidden');
            modelSelectBtn.parentElement.classList.remove('open');
            if (promptDropdownMenu && promptSelectBtn) {
                promptDropdownMenu.classList.add('hidden');
                promptSelectBtn.parentElement.classList.remove('open');
            }
        });
    }

    // Select model event handling
    dropdownItems.forEach(item => {
        item.addEventListener('click', safeAsync(async () => {
            const modelVal = item.getAttribute('data-model');
            state.serverConfig.activeModel = modelVal;
            
            // Update header button label
            const activeModelName = document.getElementById('active-model-name');
            if (activeModelName) {
                activeModelName.textContent = item.querySelector('.item-name').textContent;
            }
            
            // Set active class
            dropdownItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Close menu
            if (modelDropdownMenu && modelSelectBtn) {
                modelDropdownMenu.classList.add('hidden');
                modelSelectBtn.parentElement.classList.remove('open');
            }

            // Save active model configuration globally on server
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activeModel: modelVal })
            });

            // Save active model configuration for current conversation if active
            if (state.currentConversationId !== null) {
                await fetch(`/api/conversations/${state.currentConversationId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activeModel: modelVal })
                });
            }
        }));
    });

    // Thinking Mode Toggle event handling
    const thinkingToggleBtn = document.getElementById('thinking-toggle-btn');
    const thinkingStatusText = document.getElementById('thinking-status-text');
    if (thinkingToggleBtn) {
        thinkingToggleBtn.addEventListener('click', safeAsync(async () => {
            const currentMode = state.serverConfig.thinkingMode || 'enabled';
            const newMode = currentMode === 'enabled' ? 'disabled' : 'enabled';
            state.serverConfig.thinkingMode = newMode;

            // Update UI
            if (newMode === 'enabled') {
                thinkingToggleBtn.classList.add('active');
                if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: On';
            } else {
                thinkingToggleBtn.classList.remove('active');
                if (thinkingStatusText) thinkingStatusText.textContent = 'Thinking: Off';
            }

            // Save configuration globally on server
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ thinkingMode: newMode })
            });
        }));
    }

    // Show API Key Modal
    if (keyBtn) {
        keyBtn.addEventListener('click', () => {
            if (apiKeyInput) {
                apiKeyInput.value = '';
                if (state.serverConfig.hasKey) {
                    apiKeyInput.placeholder = 'Key is configured (hidden for security)';
                } else {
                    apiKeyInput.placeholder = 'Paste sk-... key here';
                }
                apiKeyInput.type = 'password';
            }
            
            // Reset eye icon SVG to default closed state
            const eyeIcon = toggleKeyVisibility?.querySelector('.eye-icon');
            if (eyeIcon) {
                eyeIcon.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `;
            }
            
            if (keyModal) {
                keyModal.classList.remove('hidden');
                apiKeyInput?.focus();
            }
            
            // Auto-close sidebar on mobile after clicking item
            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove('active');
            }
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }
    
    // Close modal when clicking outside of it
    if (keyModal) {
        keyModal.addEventListener('click', (e) => {
            if (e.target === keyModal) {
                closeModal();
            }
        });
    }

    // Toggle input field type (show/hide password mask)
    if (toggleKeyVisibility && apiKeyInput) {
        toggleKeyVisibility.addEventListener('click', () => {
            const eyeIcon = toggleKeyVisibility.querySelector('.eye-icon');
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                // Swap with cross-out eye SVG
                if (eyeIcon) {
                    eyeIcon.innerHTML = `
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2"></line>
                    `;
                }
            } else {
                apiKeyInput.type = 'password';
                // Restore regular eye SVG
                if (eyeIcon) {
                    eyeIcon.innerHTML = `
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    `;
                }
            }
        });
    }

    // Save key to Server-side storage
    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', safeAsync(async () => {
            const keyVal = apiKeyInput?.value.trim();
            if (!keyVal) {
                showToast('Please enter a valid DeepSeek API key.', 'warning');
                return;
            }
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: keyVal })
            });
            if (res.ok) {
                const data = await res.json();
                state.serverConfig.hasKey = data.hasKey;
                state.serverConfig.activeModel = data.activeModel;
                updateKeyStatusUI();
                closeModal();
            } else {
                showToast('Failed to save API key to server.', 'error');
            }
        }));
    }

    // Remove key from Server-side storage
    if (deleteKeyBtn) {
        deleteKeyBtn.addEventListener('click', safeAsync(async () => {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: "" })
            });
            if (res.ok) {
                const data = await res.json();
                state.serverConfig.hasKey = data.hasKey;
                state.serverConfig.activeModel = data.activeModel;
                if (apiKeyInput) apiKeyInput.value = '';
                updateKeyStatusUI();
                closeModal();
            } else {
                showToast('Failed to delete API key from server.', 'error');
            }
        }));
    }

    // New Chat button — shows modal instead of immediate creation
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (newChatTitleInput) newChatTitleInput.value = '';
            if (modalActivePromptName) modalActivePromptName.textContent = 'None (Default)';
            state.modalSelectedPromptId = null;
            if (newChatModal) {
                newChatModal.classList.remove('hidden');
                setTimeout(() => newChatTitleInput?.focus(), 100);
            }
        });
    }

    // New Chat Modal close
    if (newChatModalCloseBtn) {
        newChatModalCloseBtn.addEventListener('click', () => newChatModal?.classList.add('hidden'));
    }
    if (newChatModal) {
        newChatModal.addEventListener('click', (e) => {
            if (e.target === newChatModal) newChatModal.classList.add('hidden');
        });
    }

    // New Chat Modal — prompt dropdown toggle
    if (modalPromptSelectBtn && modalPromptDropdownMenu) {
        modalPromptSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !modalPromptDropdownMenu.classList.contains('hidden');
            if (isOpen) {
                modalPromptDropdownMenu.classList.add('hidden');
            } else {
                modalPromptDropdownMenu.classList.remove('hidden');
                populatePromptDropdown(modalPromptDropdownMenu, state.modalSelectedPromptId, (promptId) => {
                    state.modalSelectedPromptId = promptId;
                    if (state.factoryPromptCategories && promptId) {
                        for (const prompts of Object.values(state.factoryPromptCategories.categories)) {
                            for (const p of prompts) {
                                if (`${p.category}/${p.filename}` === promptId) {
                                    if (modalActivePromptName) modalActivePromptName.textContent = p.name;
                                    modalPromptDropdownMenu.classList.add('hidden');
                                    return;
                                }
                            }
                        }
                    }
                    if (modalActivePromptName) {
                        modalActivePromptName.textContent = promptId ? 'Selected' : 'None (Default)';
                    }
                    modalPromptDropdownMenu.classList.add('hidden');
                });
            }
        });
    }

    // Start Chat button in modal
    if (startChatBtn) {
        startChatBtn.addEventListener('click', safeAsync(async () => {
            const title = newChatTitleInput?.value.trim() || 'New Chat';
            await createNewConversation(title, state.modalSelectedPromptId);
            newChatModal?.classList.add('hidden');
        }));
    }

    // Prompt Editor Modal close
    if (promptEditorCloseBtn) {
        promptEditorCloseBtn.addEventListener('click', () => promptEditorModal?.classList.add('hidden'));
    }
    if (promptEditorModal) {
        promptEditorModal.addEventListener('click', (e) => {
            if (e.target === promptEditorModal) promptEditorModal.classList.add('hidden');
        });
    }

    // Delete Confirmation Modal close
    if (deleteConfirmCloseBtn) {
        deleteConfirmCloseBtn.addEventListener('click', closeDeleteConfirmModal);
    }
    if (deleteConfirmCancelBtn) {
        deleteConfirmCancelBtn.addEventListener('click', closeDeleteConfirmModal);
    }
    if (deleteConfirmModal) {
        deleteConfirmModal.addEventListener('click', (e) => {
            if (e.target === deleteConfirmModal) closeDeleteConfirmModal();
        });
    }

    // Delete Confirmation Modal Action
    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener('click', safeAsync(async () => {
            if (state.conversationIdToDelete === null) return;
            const id = state.conversationIdToDelete;
            closeDeleteConfirmModal();

            await fetch(`/api/conversations/${id}`, {
                method: 'DELETE'
            });
            
            if (state.currentConversationId === id) {
                const cRes = await fetch('/api/conversations');
                const conversations = cRes.ok ? await cRes.json() : [];
                conversations.sort((a, b) => b.createdAt - a.createdAt);
                const latest = conversations[0];
                if (latest) {
                    await switchConversation(latest.id);
                    await loadConversations();
                } else {
                    await createNewConversation();
                }
            } else {
                await loadConversations();
            }
        }));
    }

    // Save Prompt button
    if (savePromptBtn) {
        savePromptBtn.addEventListener('click', safeAsync(async () => {
            const name = promptNameInput?.value.trim();
            const category = promptCategoryInput?.value.trim();
            const content = promptContentInput?.value.trim();
            if (!name || !content) {
                showToast('Prompt name and content are required.', 'warning');
                return;
            }
            const payload = { name, category, content };
            if (state.editingPromptId) {
                payload.id = state.editingPromptId;
            }
            await fetch('/api/user-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            promptEditorModal?.classList.add('hidden');
            state.promptContentCache.clear();
        }));
    }

    // Prompt Import button and input
    const promptImportBtn = document.getElementById('prompt-import-btn');
    const promptImportFile = document.getElementById('prompt-import-file');

    if (promptImportBtn && promptImportFile) {
        promptImportBtn.addEventListener('click', () => {
            promptImportFile.click();
        });

        promptImportFile.addEventListener('change', safeAsync(async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Handle ZIP Import
            if (file.name.toLowerCase().endsWith('.zip')) {
                if (typeof JSZip === 'undefined') {
                    showToast('JSZip library is not loaded. Please reload the page.', 'error');
                    return;
                }
                const originalText = promptImportBtn.textContent;
                promptImportBtn.textContent = '⏳ Parsing ZIP...';
                promptImportBtn.disabled = true;

                try {
                    const zip = await JSZip.loadAsync(file);
                    const filePromises = [];
                    const categoriesSet = new Set();
                    let fileCount = 0;

                    zip.forEach((relativePath, zipEntry) => {
                        // Skip directories and non-markdown/non-text files
                        if (zipEntry.dir || (!relativePath.endsWith('.md') && !relativePath.endsWith('.txt'))) {
                            return;
                        }

                        // Determine category from folder structure inside the zip
                        const parts = relativePath.split('/');
                        let category = 'General';
                        if (parts.length > 1) {
                            category = parts.slice(0, -1)
                                .map(p => p.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
                                .join(' / ');
                        }
                        categoriesSet.add(category);
                        fileCount++;

                        const promise = zipEntry.async('string').then(async (text) => {
                            const firstLine = text.split('\n')[0].trim();
                            const nameMatch = firstLine.match(/^#\s+System Prompt:\s+(.+)/i) || firstLine.match(/^#\s+(.+)/);
                            
                            let extractedName = parts[parts.length - 1]
                                .replace(/\.[^/.]+$/, "")
                                .replace(/_sys_prompt$/, "")
                                .replace(/[_-]/g, " ")
                                .replace(/\b\w/g, c => c.toUpperCase());
                                
                            if (nameMatch) {
                                extractedName = nameMatch[1].trim();
                            }

                            let content = text.trim();
                            const lines = content.split('\n');
                            if (lines.length > 0 && lines[0].trim().startsWith('# ')) {
                                lines.shift();
                                if (lines[0] && lines[0].trim() === '---') lines.shift();
                                if (lines[0] && lines[0].trim() === '') lines.shift();
                                content = lines.join('\n').trim();
                            }

                            const payload = { name: extractedName, category, content };
                            await fetch('/api/user-prompts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                        });
                        filePromises.push(promise);
                    });

                    if (filePromises.length === 0) {
                        showToast('No valid .md or .txt prompt cards found inside the ZIP.', 'warning');
                    } else {
                        await Promise.all(filePromises);
                        showToast(`Successfully imported ${fileCount} prompt cards across ${categoriesSet.size} categories!`, 'success');
                        promptEditorModal?.classList.add('hidden');
                        state.promptContentCache.clear();
                    }
                } catch (err) {
                    console.error("ZIP import error:", err);
                    showToast('Error parsing ZIP file: ' + err.message, 'error');
                } finally {
                    promptImportBtn.textContent = originalText;
                    promptImportBtn.disabled = false;
                    promptImportFile.value = '';
                }
                return;
            }

            // Handle Single File Import (.md or .txt)
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                const firstLine = text.split('\n')[0].trim();
                const nameMatch = firstLine.match(/^#\s+System Prompt:\s+(.+)/i) || firstLine.match(/^#\s+(.+)/);
                
                let extractedName = file.name.replace(/\.[^/.]+$/, "").replace(/_sys_prompt$/, "").replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                if (nameMatch) {
                    extractedName = nameMatch[1].trim();
                }

                let extractedCategory = 'Story Writing';
                
                let content = text.trim();
                const lines = content.split('\n');
                if (lines.length > 0 && lines[0].trim().startsWith('# ')) {
                    lines.shift();
                    if (lines[0] && lines[0].trim() === '---') lines.shift();
                    if (lines[0] && lines[0].trim() === '') lines.shift();
                    content = lines.join('\n').trim();
                }

                if (promptNameInput) promptNameInput.value = extractedName;
                if (promptCategoryInput) promptCategoryInput.value = extractedCategory;
                if (promptContentInput) promptContentInput.value = content;
                
                promptImportFile.value = '';
            };
            reader.readAsText(file);
        }));
    }

    // Footer prompt selector toggle
    if (promptSelectBtn && promptDropdownMenu) {
        promptSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !promptDropdownMenu.classList.contains('hidden');
            if (isOpen) {
                promptDropdownMenu.classList.add('hidden');
            } else {
                promptDropdownMenu.classList.remove('hidden');
                populatePromptDropdown(promptDropdownMenu, state.currentSystemPromptId, (promptId) => {
                    setSystemPrompt(promptId);
                });
            }
        });
    }

    // Continue Button Action
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            if (userInput && chatForm) {
                continueBtn.classList.add('hidden');
                userInput.value = '[continue]';
                userInput.style.height = 'auto';
                chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    }

    // Stop generation button
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            if (state.abortController) {
                state.abortController.abort();
                state.abortController = null;
            }
            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) {
                const id = typingIndicator.id;
                if (id) removeTypingIndicator(id);
                else typingIndicator.remove();
            }
            stopBtn.classList.add('hidden');
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) sendBtn.classList.remove('hidden');
            if (userInput) {
                userInput.disabled = false;
                userInput.focus();
            }
            updateContinueButtonVisibility();
        });
    }

    // Handle Enter and Shift+Enter for textarea
    if (userInput && chatForm) {
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = userInput.value.trim();
                if (text) {
                    chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            }
        });

        userInput.addEventListener('input', () => {
            userInput.style.height = 'auto';
            userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
        });
    }

    // Message submit trigger
    if (chatForm) {
        chatForm.addEventListener('submit', safeAsync(async (e) => {
            e.preventDefault();
            
            if (continueBtn) continueBtn.classList.add('hidden');
            
            const message = userInput.value.trim();
            if (!message) return;

            // Verify API key configuration on backend
            if (!state.serverConfig.hasKey) {
                addMessageToUI('bot', '⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar under Settings (🔑).');
                return;
            }

            // Auto-create active thread if none exists
            if (state.currentConversationId === null) {
                await createNewConversation();
            }

            // Find the previous active message to set parentMsgId
            const mRes = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
            const prevMsgs = mRes.ok ? await mRes.json() : [];
            const lastActive = prevMsgs.filter(m => m.isActive !== false).sort((a, b) => a.timestamp - b.timestamp).pop();
            const parentMsgIdVal = lastActive ? lastActive.id : null;

            // Add user message to UI
            const userMsgDiv = addMessageToUI('user', message);

            // Clear input early
            userInput.value = '';
            userInput.style.height = 'auto';

            // Write message record to server side DB
            const addRes = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: state.currentConversationId,
                    role: 'user',
                    content: message,
                    timestamp: Date.now(),
                    parentMsgId: parentMsgIdVal,
                    isActive: true
                })
            });
            let newMsg = {};
            if (addRes.ok) {
                newMsg = await addRes.json();
            }
            const userMsgId = newMsg.id;

            // Attach edit actions directly to the user message div instead of re-rendering
            if (userMsgDiv && userMsgId) {
                userMsgDiv.id = userMsgId;
                userMsgDiv.dataset.msgId = userMsgId;
                attachMessageActions(userMsgDiv, 'user', { id: userMsgId });
            }

            // Trigger auto-titling if this is the very first message
            if (prevMsgs.length === 0) {
                await autoTitleConversation(state.currentConversationId, message);
            }

            // Stream AI response using shared function
            await streamApiResponse({
                conversationId: state.currentConversationId,
                parentMsgId: userMsgId
            });
        }));
    }

    // Export Conversation to Markdown Logic
    if (exportChatBtn) {
        exportChatBtn.addEventListener('click', safeAsync(async () => {
            if (state.currentConversationId === null) {
                showToast('No active conversation to export.', 'warning');
                return;
            }

            const cRes = await fetch('/api/conversations');
            const conversations = cRes.ok ? await cRes.json() : [];
            const conv = conversations.find(c => c.id === state.currentConversationId);
            if (!conv) return;

            const mRes = await fetch(`/api/messages?conversationId=${state.currentConversationId}`);
            const allMessages = mRes.ok ? await mRes.json() : [];
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            const activeMessages = allMessages.filter(m => m.isActive !== false);

            if (activeMessages.length === 0) {
                showToast('This conversation has no messages to export.', 'warning');
                return;
            }

            const title = conv.title || 'Untitled Conversation';
            const systemPrompt = getSystemPromptContentSync();

            let mdContent = `# ${title}\n\n`;
            if (systemPrompt) {
                mdContent += `> **System Prompt:** ${systemPrompt}\n\n`;
            }
            mdContent += `---\n\n`;

            activeMessages.forEach(msg => {
                if (msg.role !== 'system') {
                    const roleName = msg.role === 'assistant' ? 'Assistant' : 'User';
                    mdContent += `## ${roleName}\n\n${msg.content}\n\n---\n\n`;
                }
            });

            // Clean up trailing separators
            mdContent = mdContent.trim().replace(/---\s*$/, '').trim() + '\n';

            // Trigger download
            const slugify = (text) => {
                return text
                    .toString()
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]+/g, '')
                    .replace(/\-\-+/g, '-')
                    .replace(/^-+/, '')
                    .replace(/-+$/, '');
            };

            const filename = `${slugify(title) || 'conversation'}.md`;
            const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }));
    }

    // App Bootstrapper
    async function initApp() {
        // Fetch server config first
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
            state.serverConfig = await configRes.json();
        }

        await loadFactoryPrompts();
        initializeModelUI();
        initializeThinkingUI();
        updateKeyStatusUI();
        await loadConversations();

        // Restore active conversation from localStorage if valid
        const savedIdStr = localStorage.getItem('activeConversationId');
        const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null;

        const cRes = await fetch('/api/conversations');
        const conversations = cRes.ok ? await cRes.json() : [];
        conversations.sort((a, b) => b.createdAt - a.createdAt);

        const hasSavedConv = conversations.some(c => c.id === savedId);

        if (savedId && hasSavedConv) {
            await switchConversation(savedId);
        } else {
            // Auto select latest thread or create new one if starting clean
            const latest = conversations[0];
            if (latest) {
                await switchConversation(latest.id);
            } else {
                await createNewConversation();
            }
        }
        updatePromptSelectorDisplay();
    }

    // Trigger Bootstrapper
    initApp().catch(err => console.error("Unhandled error during app initialization:", err));
});
