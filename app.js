document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.getElementById('chat-container');

    // Sidebar DOM Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    // Stop Button DOM Element
    const stopBtn = document.getElementById('stop-btn');

    // Export Button DOM Element
    const exportChatBtn = document.getElementById('export-chat-btn');

    // Model Selector DOM Elements
    const modelSelectBtn = document.getElementById('model-select-btn');
    const modelDropdownMenu = document.getElementById('model-dropdown-menu');
    const activeModelName = document.getElementById('active-model-name');
    const dropdownItems = document.querySelectorAll('.dropdown-item');

    // DOM Elements for API Key configuration
    const keyBtn = document.getElementById('key-btn');
    const keyStatusDot = document.getElementById('key-status-dot');
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
    let modalSelectedPromptId = null;

    // Prompt Editor Modal DOM Elements
    const promptEditorModal = document.getElementById('prompt-editor-modal');
    const promptEditorCloseBtn = document.getElementById('prompt-editor-close-btn');
    const promptEditorTitle = document.getElementById('prompt-editor-title');
    const promptNameInput = document.getElementById('prompt-name-input');
    const promptCategoryInput = document.getElementById('prompt-category-input');
    const promptCategoryList = document.getElementById('prompt-category-list');
    const promptContentInput = document.getElementById('prompt-content-input');
    const savePromptBtn = document.getElementById('save-prompt-btn');
    let editingPromptId = null;

    // Delete Confirmation Modal DOM Elements
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    const deleteConfirmCloseBtn = document.getElementById('delete-confirm-close-btn');
    const deleteConfirmCancelBtn = document.getElementById('delete-confirm-cancel-btn');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
    let conversationIdToDelete = null;

    // Footer Prompt Selector DOM Elements
    const promptSelectBtn = document.getElementById('prompt-select-btn');
    const activePromptName = document.getElementById('active-prompt-name');
    const promptDropdownMenu = document.getElementById('prompt-dropdown-menu');

    // Continue Button DOM Element
    const continueBtn = document.getElementById('continue-btn');

    // Storage Keys & API configurations
    const API_URL = '/api/chat/completions';
    let serverConfig = { hasKey: false, activeModel: 'deepseek-v4-pro' };

    // Active conversation state tracker
    let currentConversationId = null;
    let abortController = null;
    const DEFAULT_SYSTEM_PROMPT = 'You are a helpful and concise AI assistant.';
    let currentSystemPromptId = null;
    let factoryPromptCategories = null;
    const promptContentCache = new Map();

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

    // Model Selection UI Logic
    function initializeModelUI() {
        const storedModel = serverConfig.activeModel || 'deepseek-v4-pro';
        
        dropdownItems.forEach(item => {
            const itemModel = item.getAttribute('data-model');
            if (itemModel === storedModel) {
                item.classList.add('active');
                activeModelName.textContent = item.querySelector('.item-name').textContent;
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Toggle model dropdown menu
    if (modelSelectBtn && modelDropdownMenu) {
        modelSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modelDropdownMenu.classList.toggle('hidden');
            modelSelectBtn.parentElement.classList.toggle('open');
        });

        // Close dropdown when clicking anywhere else
        document.addEventListener('click', () => {
            modelDropdownMenu.classList.add('hidden');
            modelSelectBtn.parentElement.classList.remove('open');
            promptDropdownMenu.classList.add('hidden');
            promptSelectBtn.parentElement.classList.remove('open');
        });
    }

    // Select model event handling
    dropdownItems.forEach(item => {
        item.addEventListener('click', async () => {
            const modelVal = item.getAttribute('data-model');
            serverConfig.activeModel = modelVal;
            
            // Update header button label
            activeModelName.textContent = item.querySelector('.item-name').textContent;
            
            // Set active class
            dropdownItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Close menu
            modelDropdownMenu.classList.add('hidden');
            modelSelectBtn.parentElement.classList.remove('open');

            // Save active model configuration globally on server
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activeModel: modelVal })
            });

            // Save active model configuration for current conversation if active
            if (currentConversationId !== null) {
                await fetch(`/api/conversations/${currentConversationId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activeModel: modelVal })
                });
            }
        });
    });

    // Update the visual status of the key icon dot
    function updateKeyStatusUI() {
        if (serverConfig.hasKey) {
            keyStatusDot.classList.add('active');
        } else {
            keyStatusDot.classList.remove('active');
        }
    }

    // Show API Key Modal
    keyBtn.addEventListener('click', () => {
        apiKeyInput.value = '';
        if (serverConfig.hasKey) {
            apiKeyInput.placeholder = 'Key is configured (hidden for security)';
        } else {
            apiKeyInput.placeholder = 'Paste sk-... key here';
        }
        apiKeyInput.type = 'password';
        
        // Reset eye icon SVG to default closed state
        const eyeIcon = toggleKeyVisibility.querySelector('.eye-icon');
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
        
        keyModal.classList.remove('hidden');
        apiKeyInput.focus();
        
        // Auto-close sidebar on mobile after clicking item
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }
    });

    // Close API Key Modal
    function closeModal() {
        keyModal.classList.add('hidden');
    }

    modalCloseBtn.addEventListener('click', closeModal);
    
    // Close modal when clicking outside of it
    keyModal.addEventListener('click', (e) => {
        if (e.target === keyModal) {
            closeModal();
        }
    });

    // Toggle input field type (show/hide password mask)
    toggleKeyVisibility.addEventListener('click', () => {
        const eyeIcon = toggleKeyVisibility.querySelector('.eye-icon');
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            // Swap with cross-out eye SVG
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
                <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2"></line>
            `;
        } else {
            apiKeyInput.type = 'password';
            // Restore regular eye SVG
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
        }
    });

    // Save key to Server-side storage
    saveKeyBtn.addEventListener('click', async () => {
        const keyVal = apiKeyInput.value.trim();
        if (!keyVal) {
            alert('Please enter a valid DeepSeek API key.');
            return;
        }
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: keyVal })
        });
        if (res.ok) {
            const data = await res.json();
            serverConfig.hasKey = data.hasKey;
            serverConfig.activeModel = data.activeModel;
            updateKeyStatusUI();
            closeModal();
        } else {
            alert('Failed to save API key to server.');
        }
    });

    // Remove key from Server-side storage
    deleteKeyBtn.addEventListener('click', async () => {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: "" })
        });
        if (res.ok) {
            const data = await res.json();
            serverConfig.hasKey = data.hasKey;
            serverConfig.activeModel = data.activeModel;
            apiKeyInput.value = '';
            updateKeyStatusUI();
            closeModal();
        } else {
            alert('Failed to delete API key from server.');
        }
    });

    // Fetch and render the list of conversations in the sidebar
    async function loadConversations() {
        const chatsList = document.getElementById('chats-list');
        if (!chatsList) return;

        const res = await fetch('/api/conversations');
        let conversations = [];
        if (res.ok) {
            conversations = await res.json();
        }
        conversations.sort((a, b) => b.createdAt - a.createdAt);
        chatsList.innerHTML = '';
        
        if (conversations.length === 0) {
            const noChats = document.createElement('div');
            noChats.style.padding = '12px 14px';
            noChats.style.fontSize = '0.8rem';
            noChats.style.color = 'var(--text-muted)';
            noChats.style.textAlign = 'center';
            noChats.textContent = 'No recent conversations';
            chatsList.appendChild(noChats);
            return;
        }

        conversations.forEach(conv => {
            const item = document.createElement('button');
            item.className = `chat-list-item ${conv.id === currentConversationId ? 'active' : ''}`;
            item.setAttribute('data-id', conv.id);
            item.title = conv.title || 'Untitled Conversation';
            
            // Speech bubble icon representation matching premium theme
            const iconSvg = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chat-item-icon">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            `;
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'chat-item-title';
            titleSpan.textContent = conv.title || 'Untitled Conversation';
            
            const renameBtn = document.createElement('button');
            renameBtn.className = 'chat-rename-btn';
            renameBtn.setAttribute('aria-label', 'Rename conversation');
            renameBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            `;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'chat-delete-btn';
            deleteBtn.setAttribute('aria-label', 'Delete conversation');
            deleteBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
            
            item.addEventListener('click', () => {
                switchConversation(conv.id);
            });

            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startInlineRename(item, titleSpan, conv.id, titleSpan.textContent);
            });
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteConversation(conv.id);
            });
            
            item.innerHTML = iconSvg;
            item.appendChild(titleSpan);
            item.appendChild(renameBtn);
            item.appendChild(deleteBtn);
            chatsList.appendChild(item);
        });
    }

    // Switch between conversation threads
    async function switchConversation(id) {
        currentConversationId = id;
        
        // Highlight active item in sidebar
        const items = document.querySelectorAll('.chat-list-item');
        items.forEach(item => {
            if (parseInt(item.getAttribute('data-id')) === id) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Retrieve active model preference for this thread
        const cRes = await fetch('/api/conversations');
        const conversations = cRes.ok ? await cRes.json() : [];
        const conv = conversations.find(c => c.id === id);

        if (conv && conv.activeModel) {
            serverConfig.activeModel = conv.activeModel;
            initializeModelUI();
        }

        // Restore system prompt for this conversation
        currentSystemPromptId = conv?.systemPromptId || null;
        if (currentSystemPromptId) {
            await fetchPromptContent(currentSystemPromptId);
        }
        updatePromptSelectorDisplay();

        // Fetch corresponding messages
        const mRes = await fetch(`/api/messages?conversationId=${id}`);
        const allMessages = mRes.ok ? await mRes.json() : [];
        allMessages.sort((a, b) => a.timestamp - b.timestamp);
        const activeMessages = allMessages.filter(m => m.isActive !== false);

        // Pre-compute version counts per group in one pass
        const versionCounts = new Map();
        for (const msg of allMessages) {
            if (msg.versionGroupId) {
                versionCounts.set(msg.versionGroupId, (versionCounts.get(msg.versionGroupId) || 0) + 1);
            }
        }

        // Render messages
        const container = chatContainer.querySelector('.messages-container');
        if (container) {
            container.innerHTML = '';

            activeMessages.forEach(msg => {
                if (msg.role !== 'system') {
                    const sender = msg.role === 'assistant' ? 'bot' : 'user';
                    const versionGroupId = msg.versionGroupId;
                    const versionCount = versionGroupId ? (versionCounts.get(versionGroupId) || 1) : 1;
                    addMessageToUI(sender, msg.content, msg.reasoning, {
                        id: msg.id,
                        versionGroupId: versionGroupId,
                        version: msg.version || 1,
                        versionCount: versionCount
                    });
                }
            });
        }
        
        scrollToBottom();

        await updateContinueButtonVisibility(activeMessages);

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }
    }

    // Spawn a new empty conversation
    async function createNewConversation(title = 'New Chat', systemPromptId = null) {
        const selectedModel = serverConfig.activeModel || 'deepseek-v4-pro';

        if (systemPromptId) {
            await fetchPromptContent(systemPromptId);
        }

        const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                activeModel: selectedModel,
                systemPromptId: systemPromptId || null
            })
        });

        let newConv = {};
        if (res.ok) {
            newConv = await res.json();
        }
        const newId = newConv.id;

        currentConversationId = newId;
        currentSystemPromptId = systemPromptId || null;
        updatePromptSelectorDisplay();

        await loadConversations();

        const container = chatContainer.querySelector('.messages-container');
        if (container) {
            container.innerHTML = '';
        }

        scrollToBottom();

        await updateContinueButtonVisibility([]);

        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }

        return newId;
    }

    // Delete a conversation thread
    function deleteConversation(id) {
        conversationIdToDelete = id;
        if (deleteConfirmModal) {
            deleteConfirmModal.classList.remove('hidden');
        }
    }

    // Rename a conversation thread inline in the sidebar UI
    function startInlineRename(item, titleSpan, id, currentTitle) {
        // Prevent multiple simultaneous rename inputs inside this item
        if (item.querySelector('.chat-item-rename-input')) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'chat-item-rename-input';
        input.value = currentTitle;
        
        // Save references to other buttons to temporarily hide them
        const renameBtn = item.querySelector('.chat-rename-btn');
        const deleteBtn = item.querySelector('.chat-delete-btn');
        
        if (renameBtn) renameBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';

        // Stop propagation of events to prevent parent button behavior (selection, clicks, active styling)
        const stopProp = (e) => e.stopPropagation();
        input.addEventListener('click', stopProp);
        input.addEventListener('mousedown', stopProp);
        input.addEventListener('mouseup', stopProp);
        input.addEventListener('dblclick', stopProp);

        let isFinished = false;

        const finishRename = async (commitChanges) => {
            if (isFinished) return;
            isFinished = true;

            const newTitle = input.value.trim();
            if (commitChanges && newTitle && newTitle !== currentTitle) {
                // Synchronously update UI elements
                titleSpan.textContent = newTitle;
                input.replaceWith(titleSpan);
                if (renameBtn) renameBtn.style.display = '';
                if (deleteBtn) deleteBtn.style.display = '';
                item.title = newTitle;
                
                // Update database on server
                await fetch(`/api/conversations/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle })
                });
            } else {
                // Restore original state
                input.replaceWith(titleSpan);
                if (renameBtn) renameBtn.style.display = '';
                if (deleteBtn) deleteBtn.style.display = '';
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishRename(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishRename(false);
            }
        });

        input.addEventListener('blur', () => {
            finishRename(true);
        });

        // Replace the titleSpan with the input field
        titleSpan.replaceWith(input);
        
        // Focus and select all text
        input.focus();
        input.select();
    }

    // Auto title based on first prompt
    async function autoTitleConversation(convId, promptText) {
        let title = promptText.trim();
        if (title.length > 25) {
            title = title.substring(0, 25) + '...';
        }
        await fetch(`/api/conversations/${convId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title })
        });
        await loadConversations();
    }

    // New Chat button — shows modal instead of immediate creation
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            newChatTitleInput.value = '';
            modalActivePromptName.textContent = 'None (Default)';
            modalSelectedPromptId = null;
            newChatModal.classList.remove('hidden');
            setTimeout(() => newChatTitleInput.focus(), 100);
        });
    }

    // New Chat Modal close
    newChatModalCloseBtn.addEventListener('click', () => newChatModal.classList.add('hidden'));
    newChatModal.addEventListener('click', (e) => {
        if (e.target === newChatModal) newChatModal.classList.add('hidden');
    });

    // New Chat Modal — prompt dropdown toggle
    modalPromptSelectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !modalPromptDropdownMenu.classList.contains('hidden');
        if (isOpen) {
            modalPromptDropdownMenu.classList.add('hidden');
        } else {
            populatePromptDropdown(modalPromptDropdownMenu, modalSelectedPromptId, (promptId) => {
                modalSelectedPromptId = promptId;
                if (promptCategories && promptId) {
                    for (const prompts of Object.values(promptCategories.categories)) {
                        for (const p of prompts) {
                            if (`${p.category}/${p.filename}` === promptId) {
                                modalActivePromptName.textContent = p.name;
                                modalPromptDropdownMenu.classList.add('hidden');
                                return;
                            }
                        }
                    }
                }
                modalActivePromptName.textContent = promptId ? 'Selected' : 'None (Default)';
                modalPromptDropdownMenu.classList.add('hidden');
            });
        }
    });

    // Start Chat button in modal
    startChatBtn.addEventListener('click', async () => {
        const title = newChatTitleInput.value.trim() || 'New Chat';
        await createNewConversation(title, modalSelectedPromptId);
        newChatModal.classList.add('hidden');
    });

    // Prompt Editor Modal close
    promptEditorCloseBtn.addEventListener('click', () => promptEditorModal.classList.add('hidden'));
    promptEditorModal.addEventListener('click', (e) => {
        if (e.target === promptEditorModal) promptEditorModal.classList.add('hidden');
    });

    // Delete Confirmation Modal close
    function closeDeleteConfirmModal() {
        if (deleteConfirmModal) {
            deleteConfirmModal.classList.add('hidden');
        }
        conversationIdToDelete = null;
    }

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
        deleteConfirmBtn.addEventListener('click', async () => {
            if (conversationIdToDelete === null) return;
            const id = conversationIdToDelete;
            closeDeleteConfirmModal();

            await fetch(`/api/conversations/${id}`, {
                method: 'DELETE'
            });
            
            if (currentConversationId === id) {
                const cRes = await fetch('/api/conversations');
                const conversations = cRes.ok ? await cRes.json() : [];
                conversations.sort((a, b) => b.createdAt - a.createdAt);
                const latest = conversations[0];
                if (latest) {
                    await switchConversation(latest.id);
                } else {
                    await createNewConversation();
                }
            } else {
                await loadConversations();
            }
        });
    }

    // Save Prompt button
    savePromptBtn.addEventListener('click', async () => {
        const name = promptNameInput.value.trim();
        const category = promptCategoryInput.value.trim();
        const content = promptContentInput.value.trim();
        if (!name || !content) {
            alert('Prompt name and content are required.');
            return;
        }
        const payload = { name, category, content };
        if (editingPromptId) {
            payload.id = editingPromptId;
        }
        await fetch('/api/user-prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        promptEditorModal.classList.add('hidden');
        promptContentCache.clear();
    });

    // Footer prompt selector toggle
    promptSelectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !promptDropdownMenu.classList.contains('hidden');
        if (isOpen) {
            promptDropdownMenu.classList.add('hidden');
        } else {
            promptDropdownMenu.classList.remove('hidden');
            populatePromptDropdown(promptDropdownMenu, currentSystemPromptId, (promptId) => {
                setSystemPrompt(promptId);
            });
        }
    });

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
            if (abortController) {
                abortController.abort();
                abortController = null;
            }
            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) {
                const id = typingIndicator.id;
                if (id) removeTypingIndicator(id);
                else typingIndicator.remove();
            }
            stopBtn.classList.add('hidden');
            document.getElementById('send-btn').classList.remove('hidden');
            userInput.disabled = false;
            userInput.focus();
            updateContinueButtonVisibility();
        });
    }

    // Handle Enter and Shift+Enter for textarea
    if (userInput) {
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
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (continueBtn) continueBtn.classList.add('hidden');
        
        const message = userInput.value.trim();
        if (!message) return;

        // Verify API key configuration on backend
        if (!serverConfig.hasKey) {
            addMessageToUI('bot', '⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar under Settings (🔑).');
            return;
        }

        // Auto-create active thread if none exists
        if (currentConversationId === null) {
            await createNewConversation();
        }

        // Find the previous active message to set parentMsgId
        const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
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
                conversationId: currentConversationId,
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

        // Sync with backend immediately to show edit actions for the user message
        await refreshConversationView();

        // Trigger auto-titling if this is the very first message
        if (prevMsgs.length === 0) {
            await autoTitleConversation(currentConversationId, message);
        }

        // Stream AI response using shared function
        await streamApiResponse({
            conversationId: currentConversationId,
            parentMsgId: userMsgId
        });

        // Sync with backend to finalize and show regenerate/retry actions for the bot response
        await refreshConversationView();
    });

    function addMessageToUI(sender, text, reasoning, msgMeta = {}) {
        const container = chatContainer.querySelector('.messages-container');
        if (!container) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        if (sender === 'bot') {
            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'message-body';

            // Add reasoning block if present
            if (reasoning) {
                const reasoningBlock = document.createElement('div');
                reasoningBlock.className = 'reasoning-block collapsed';
                const reasoningHeader = document.createElement('div');
                reasoningHeader.className = 'reasoning-header';
                reasoningHeader.innerHTML = `
                    <svg class="reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    <span>Thought</span>
                `;
                const reasoningContent = document.createElement('div');
                reasoningContent.className = 'reasoning-content';
                reasoningContent.textContent = reasoning;
                reasoningBlock.appendChild(reasoningHeader);
                reasoningBlock.appendChild(reasoningContent);
                reasoningHeader.addEventListener('click', () => {
                    reasoningBlock.classList.toggle('collapsed');
                });
                bodyDiv.appendChild(reasoningBlock);
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;

            bodyDiv.appendChild(contentDiv);
            messageDiv.appendChild(bodyDiv);
        } else {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = text;
            messageDiv.appendChild(contentDiv);
        }

        // Store metadata as data attributes for action buttons
        if (msgMeta.id != null) {
            messageDiv.dataset.msgId = msgMeta.id;
            messageDiv.id = msgMeta.id;
        }
        if (msgMeta.versionGroupId != null) {
            messageDiv.dataset.versionGroupId = msgMeta.versionGroupId;
            messageDiv.dataset.version = msgMeta.version || 1;
        }

        container.appendChild(messageDiv);
        attachMessageActions(messageDiv, sender, msgMeta);
        scrollToBottom();
        return messageDiv;
    }

    function showTypingIndicator() {
        const container = chatContainer.querySelector('.messages-container');
        if (!container) return null;

        const id = 'typing-' + Date.now();
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = id;
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            indicator.appendChild(dot);
        }
        
        container.appendChild(indicator);
        scrollToBottom();
        return id;
    }

    function removeTypingIndicator(id) {
        const indicator = document.getElementById(id);
        if (indicator) {
            indicator.remove();
        }
    }

    // Collapsible streaming thought block
    function addStreamingBotMessage() {
        const container = chatContainer.querySelector('.messages-container');
        if (!container) return null;

        const id = 'stream-msg-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.id = id;

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'message-body';

        // Collapsible reasoning block
        const reasoningBlock = document.createElement('div');
        reasoningBlock.className = 'reasoning-block';
        const reasoningHeader = document.createElement('div');
        reasoningHeader.className = 'reasoning-header';
        reasoningHeader.innerHTML = `
            <svg class="reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span>Thinking...</span>
        `;
        const reasoningContent = document.createElement('div');
        reasoningContent.className = 'reasoning-content';
        reasoningBlock.appendChild(reasoningHeader);
        reasoningBlock.appendChild(reasoningContent);

        reasoningHeader.addEventListener('click', () => {
            reasoningBlock.classList.toggle('collapsed');
        });

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content streaming';

        bodyDiv.appendChild(reasoningBlock);
        bodyDiv.appendChild(contentDiv);
        messageDiv.appendChild(bodyDiv);
        container.appendChild(messageDiv);
        scrollToBottom();
        return id;
    }

    function updateStreamingReasoning(id, reasoning) {
        const msg = document.getElementById(id);
        if (!msg) return;
        const block = msg.querySelector('.reasoning-content');
        if (!block) return;
        block.textContent = reasoning;
        // Auto-expand when new reasoning arrives
        const parent = msg.querySelector('.reasoning-block');
        if (parent) parent.classList.remove('collapsed');
        scrollToBottom();
    }

    function updateStreamingBotMessage(id, content) {
        const msg = document.getElementById(id);
        if (!msg) return;
        const contentDiv = msg.querySelector('.message-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content) : content;
        scrollToBottom();
    }

    function finalizeStreamingBotMessage(id, content, reasoning) {
        const msg = document.getElementById(id);
        if (!msg) return;

        // Update reasoning header label
        const header = msg.querySelector('.reasoning-header span');
        if (header) header.textContent = 'Thought';

        // Finalize reasoning content if present
        const reasoningContent = msg.querySelector('.reasoning-content');
        if (reasoningContent && reasoning) {
            reasoningContent.textContent = reasoning;
            // Default to collapsed when complete
            const block = msg.querySelector('.reasoning-block');
            if (block) block.classList.add('collapsed');
        } else if (reasoningContent) {
            // No reasoning — remove the whole block
            const block = msg.querySelector('.reasoning-block');
            if (block) block.remove();
        }

        // Finalize main content with markdown
        const contentDiv = msg.querySelector('.message-content');
        if (!contentDiv) return;
        contentDiv.classList.remove('streaming');
        contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content || '') : (content || '');
        scrollToBottom();
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // ============================================================
    // Message Editing — Helper Functions
    // ============================================================

    async function getDescendantIds(msgId) {
        const result = [];
        const queue = [msgId];
        const res = await fetch(`/api/messages?conversationId=${currentConversationId}`);
        const allMessages = res.ok ? await res.json() : [];
        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = allMessages.filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
            for (const child of children) {
                result.push(child.id);
                queue.push(child.id);
            }
        }
        return result;
    }

    async function hideDescendants(msgId) {
        const ids = await getDescendantIds(msgId);
        for (const id of ids) {
            await fetch(`/api/messages/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false })
            });
        }
    }

    async function showDescendants(msgId) {
        const res = await fetch(`/api/messages?conversationId=${currentConversationId}`);
        const allMessages = res.ok ? await res.json() : [];
        let currentId = msgId;
        while (true) {
            const children = allMessages.filter(m => m.parentMsgId === currentId);
            if (children.length === 0) break;
            
            let bestChild = children[0];
            for (let i = 1; i < children.length; i++) {
                if (children[i].versionGroupId === bestChild.versionGroupId) {
                    if ((children[i].version || 1) > (bestChild.version || 1)) {
                        bestChild = children[i];
                    }
                } else {
                    if (children[i].id > bestChild.id) {
                        bestChild = children[i];
                    }
                }
            }
            
            await fetch(`/api/messages/${bestChild.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: true })
            });
            currentId = bestChild.id;
        }
    }

    async function buildApiPayload(conversationId) {
        const mRes = await fetch(`/api/messages?conversationId=${conversationId}`);
        const all = mRes.ok ? await mRes.json() : [];
        all.sort((a, b) => a.timestamp - b.timestamp);
        const active = all.filter(m => m.isActive !== false);
        const payload = [{ role: 'system', content: getSystemPromptContentSync() }];
        for (const msg of active) {
            payload.push({ role: msg.role, content: msg.content });
        }
        return payload;
    }

    async function buildApiPayloadUpTo(conversationId, stopAfterMsgId) {
        const mRes = await fetch(`/api/messages?conversationId=${conversationId}`);
        const all = mRes.ok ? await mRes.json() : [];
        all.sort((a, b) => a.timestamp - b.timestamp);
        const active = all.filter(m => m.isActive !== false);
        const payload = [{ role: 'system', content: getSystemPromptContentSync() }];
        for (const msg of active) {
            payload.push({ role: msg.role, content: msg.content });
            if (msg.id === stopAfterMsgId) break;
        }
        return payload;
    }

    async function checkIsLastActiveAssistant(msgId) {
        if (!currentConversationId) return false;
        const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
        const all = mRes.ok ? await mRes.json() : [];
        all.sort((a, b) => a.timestamp - b.timestamp);
        const activeAssistants = all.filter(m => m.role === 'assistant' && m.isActive !== false);
        if (activeAssistants.length === 0) return false;
        return activeAssistants[activeAssistants.length - 1].id === msgId;
    }

    async function refreshConversationView() {
        if (currentConversationId !== null) {
            await switchConversation(currentConversationId);
        }
    }

    // Update continue button visibility dynamically
    async function updateContinueButtonVisibility(activeMessages = null) {
        if (!continueBtn) return;

        if (currentConversationId === null || abortController !== null) {
            continueBtn.classList.add('hidden');
            return;
        }

        try {
            let messages = activeMessages;
            if (!messages) {
                const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
                const allMessages = mRes.ok ? await mRes.json() : [];
                allMessages.sort((a, b) => a.timestamp - b.timestamp);
                messages = allMessages.filter(m => m.isActive !== false);
            }

            if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
                continueBtn.classList.remove('hidden');
            } else {
                continueBtn.classList.add('hidden');
            }
        } catch (err) {
            console.error('Error updating continue button visibility:', err);
            continueBtn.classList.add('hidden');
        }
    }

    // ============================================================
    // Message Editing — streamApiResponse (Shared Streaming Logic)
    // ============================================================

    async function streamApiResponse({ conversationId, parentMsgId, stopAfterMsgId, versionGroupId, version }) {
        if (!serverConfig.hasKey) {
            addMessageToUI('bot', '⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar under Settings (🔑).');
            return;
        }

        const payloadMessages = stopAfterMsgId
            ? await buildApiPayloadUpTo(conversationId, stopAfterMsgId)
            : await buildApiPayload(conversationId);

        // Abort any in-flight request before starting a new one
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();
        let streamMsgId = null;
        let fullContent = '';
        let fullReasoning = '';

        if (stopBtn) stopBtn.classList.remove('hidden');
        document.getElementById('send-btn').classList.add('hidden');
        userInput.disabled = true;

        try {
            const selectedModel = serverConfig.activeModel || 'deepseek-v4-pro';
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: abortController.signal,
                body: JSON.stringify({
                    model: selectedModel,
                    messages: payloadMessages,
                    temperature: 0.7,
                    stream: true
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("API Error:", errorData);
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            streamMsgId = addStreamingBotMessage();

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const payload = trimmed.slice(6);
                    if (payload === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(payload);
                        const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content;
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (reasoningDelta) {
                            fullReasoning += reasoningDelta;
                            updateStreamingReasoning(streamMsgId, fullReasoning);
                        }
                        if (delta) {
                            fullContent += delta;
                            updateStreamingBotMessage(streamMsgId, fullContent);
                        }
                    } catch (e) {
                        // Skip malformed JSON lines
                    }
                }
            }

            if (fullContent) {
                const saveRes = await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId,
                        role: 'assistant',
                        content: fullContent,
                        reasoning: fullReasoning || undefined,
                        timestamp: Date.now(),
                        parentMsgId: parentMsgId || null,
                        versionGroupId: versionGroupId || null,
                        version: version || 1,
                        isActive: true
                    })
                });
                let savedMsg = {};
                if (saveRes.ok) {
                    savedMsg = await saveRes.json();
                }

                finalizeStreamingBotMessage(streamMsgId, fullContent, fullReasoning);

                const streamMsgDiv = document.getElementById(streamMsgId);
                if (streamMsgDiv && savedMsg.id) {
                    streamMsgDiv.dataset.msgId = savedMsg.id;
                    if (savedMsg.versionGroupId) {
                        streamMsgDiv.dataset.versionGroupId = savedMsg.versionGroupId;
                        streamMsgDiv.dataset.version = savedMsg.version || 1;
                    }
                    
                    // Fetch version count dynamically to handle retry counts correctly
                    const vCountRes = await fetch(`/api/messages?conversationId=${conversationId}`);
                    const allMsgs = vCountRes.ok ? await vCountRes.json() : [];
                    const vGroup = savedMsg.versionGroupId;
                    const versionCount = vGroup ? allMsgs.filter(m => m.versionGroupId === vGroup).length : 1;

                    attachMessageActions(streamMsgDiv, 'bot', {
                        id: savedMsg.id,
                        versionGroupId: savedMsg.versionGroupId,
                        version: savedMsg.version || 1,
                        versionCount: versionCount
                    });
                }
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                if (streamMsgId) {
                    finalizeStreamingBotMessage(streamMsgId, fullContent, fullReasoning);
                }
                return;
            }
            console.error('Error fetching DeepSeek response:', error);
            addMessageToUI('bot', 'Sorry, I encountered an error connecting to the server. Please check your API key or try again later.');
        } finally {
            abortController = null;
            if (stopBtn) stopBtn.classList.add('hidden');
            document.getElementById('send-btn').classList.remove('hidden');
            userInput.disabled = false;
            userInput.focus();
            await updateContinueButtonVisibility();
        }
    }

    // ============================================================
    // Message Editing — UI Action Buttons
    // ============================================================

    function attachMessageActions(messageDiv, sender, msgMeta) {
        const msgId = msgMeta.id;
        if (!msgId) return;

        const existing = messageDiv.querySelector('.message-action-row');
        if (existing) existing.remove();

        const actionRow = document.createElement('div');
        actionRow.className = 'message-action-row';

        // Version navigation
        if (msgMeta.versionCount && msgMeta.versionCount > 1) {
            const versionNav = document.createElement('div');
            versionNav.className = 'version-nav';

            const prevBtn = document.createElement('button');
            prevBtn.className = 'version-nav-btn';
            prevBtn.innerHTML = '&#9664;';
            prevBtn.title = 'Previous version';
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateVersion(msgMeta.versionGroupId, (msgMeta.version || 1) - 1);
            });

            const label = document.createElement('span');
            label.className = 'version-nav-label';
            label.textContent = `${msgMeta.version || 1}/${msgMeta.versionCount}`;

            const nextBtn = document.createElement('button');
            nextBtn.className = 'version-nav-btn';
            nextBtn.innerHTML = '&#9654;';
            nextBtn.title = 'Next version';
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateVersion(msgMeta.versionGroupId, (msgMeta.version || 1) + 1);
            });

            versionNav.appendChild(prevBtn);
            versionNav.appendChild(label);
            versionNav.appendChild(nextBtn);
            actionRow.appendChild(versionNav);
        }

        // Edit button (user messages only)
        if (sender === 'user') {
            const editBtn = document.createElement('button');
            editBtn.className = 'message-action-btn edit-btn';
            editBtn.innerHTML = '&#9998;';
            editBtn.title = 'Edit message';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startInlineEdit(messageDiv, msgId);
            });
            actionRow.appendChild(editBtn);
        }

        // Regenerate button (bot messages only)
        if (sender === 'bot') {
            const regenBtn = document.createElement('button');
            regenBtn.className = 'message-action-btn regen-btn';
            regenBtn.innerHTML = '&#8635;';
            regenBtn.title = 'Regenerate response';
            regenBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await regenerateResponse(msgId);
            });
            actionRow.appendChild(regenBtn);
        }

        if (actionRow.children.length > 0) {
            if (sender === 'bot') {
                const bodyDiv = messageDiv.querySelector('.message-body');
                if (bodyDiv) bodyDiv.insertBefore(actionRow, bodyDiv.firstChild);
            } else {
                const contentDiv = messageDiv.querySelector('.message-content');
                if (contentDiv) contentDiv.after(actionRow);
            }
        }
    }

    // ============================================================
    // Message Editing — Inline Edit Flow
    // ============================================================

    function startInlineEdit(messageDiv, msgId) {
        const contentDiv = messageDiv.querySelector('.message-content');
        if (!contentDiv) return;

        const actionRow = messageDiv.querySelector('.message-action-row');
        if (actionRow) actionRow.style.display = 'none';

        const originalContent = contentDiv.textContent;

        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        textarea.value = originalContent;

        const editActions = document.createElement('div');
        editActions.className = 'inline-edit-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'message-action-btn save-btn';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newText = textarea.value.trim();
            if (newText && newText !== originalContent) {
                await editMessageAndRegenerate(msgId, newText, messageDiv);
            } else {
                cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow);
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'message-action-btn cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow);
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                saveBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
        });

        editActions.appendChild(saveBtn);
        editActions.appendChild(cancelBtn);

        // Apply editing state class to stretch container width
        messageDiv.classList.add('editing');

        // Wrap editing elements to stack vertically and expand horizontally
        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';
        editContainer.appendChild(textarea);
        editContainer.appendChild(editActions);

        contentDiv.replaceWith(editContainer);

        // Auto-expand textarea to fit large contents beautifully
        const adjustHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight + 4, 450) + 'px';
        };
        textarea.addEventListener('input', adjustHeight);
        adjustHeight(); // Initial calculation after mounting to DOM

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    function cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow) {
        messageDiv.classList.remove('editing');
        const editContainer = messageDiv.querySelector('.inline-edit-container');
        if (editContainer) {
            editContainer.replaceWith(contentDiv);
        } else {
            textarea.replaceWith(contentDiv);
            editActions.remove();
        }
        if (actionRow) actionRow.style.display = '';
    }

    async function editMessageAndRegenerate(msgId, newText, messageDiv) {
        const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
        const allMessages = mRes.ok ? await mRes.json() : [];
        const originalMsg = allMessages.find(m => m.id === msgId);
        if (!originalMsg) return;

        const versionGroupId = originalMsg.versionGroupId || originalMsg.id;

        // Mark original message with versionGroupId if first edit
        if (!originalMsg.versionGroupId) {
            await fetch(`/api/messages/${msgId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    versionGroupId: versionGroupId,
                    version: 1
                })
            });
            originalMsg.versionGroupId = versionGroupId;
            originalMsg.version = 1;
        }

        const existingVersions = allMessages.filter(m => m.versionGroupId === versionGroupId);
        const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version || 1), 0);
        const newVersion = maxVersion + 1;

        // Hide all descendants of old versions
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

        // Create new version of the edited message
        const addRes = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversationId: originalMsg.conversationId,
                role: 'user',
                content: newText,
                timestamp: Date.now(),
                versionGroupId: versionGroupId,
                version: newVersion,
                isActive: true,
                parentMsgId: originalMsg.parentMsgId || null
            })
        });
        let newMsg = {};
        if (addRes.ok) {
            newMsg = await addRes.json();
        }
        const newMsgId = newMsg.id;

        await refreshConversationView();

        // Regenerate AI response
        await streamApiResponse({
            conversationId: originalMsg.conversationId,
            parentMsgId: newMsgId,
            stopAfterMsgId: newMsgId
        });

        await refreshConversationView();
    }

    // ============================================================
    // Message Editing — Regenerate Response
    // ============================================================

    async function regenerateResponse(msgId) {
        const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
        const allMessages = mRes.ok ? await mRes.json() : [];
        const assistantMsg = allMessages.find(m => m.id === msgId);
        if (!assistantMsg || assistantMsg.role !== 'assistant') return;

        const parentUserMsg = assistantMsg.parentMsgId ? allMessages.find(m => m.id === assistantMsg.parentMsgId) : null;
        const stopAtId = parentUserMsg ? parentUserMsg.id : msgId;

        const versionGroupId = assistantMsg.versionGroupId || assistantMsg.id;

        // Mark original if first regenerate
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

        // Hide descendants and deactivate old versions
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

        await refreshConversationView();

        await streamApiResponse({
            conversationId: assistantMsg.conversationId,
            parentMsgId: stopAtId === msgId ? (parentUserMsg?.id || null) : stopAtId,
            stopAfterMsgId: stopAtId,
            versionGroupId,
            version: newVersion
        });

        await refreshConversationView();
    }

    // ============================================================
    // Message Editing — Version Navigation
    // ============================================================

    async function navigateVersion(versionGroupId, targetVersion) {
        const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
        const allMessages = mRes.ok ? await mRes.json() : [];
        const versions = allMessages.filter(m => m.versionGroupId === versionGroupId);
        versions.sort((a, b) => (a.version || 1) - (b.version || 1));

        if (targetVersion < 1 || targetVersion > versions.length) return;

        const targetMsg = versions.find(v => (v.version || 1) === targetVersion);
        if (!targetMsg) return;

        // Deactivate all versions in this group
        for (const v of versions) {
            await fetch(`/api/messages/${v.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false })
            });
        }

        // Activate target version then show its descendants
        await fetch(`/api/messages/${targetMsg.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: true })
        });
        await showDescendants(targetMsg.id);

        // Hide descendants of non-target versions
        for (const v of versions) {
            if (v.id !== targetMsg.id) {
                await hideDescendants(v.id);
            }
        }

        await refreshConversationView();
    }

    // ============================================================
    // Highlight & "Rewrite Selection" (Magic Wand)
    // ============================================================

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

    function showFloatingMagicWand(selection, messageContent) {
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

    function showRewriteDialog(selectedText, msgId, x, y) {
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

    function hideRewriteDialog() {
        const dialog = document.getElementById('magic-rewrite-dialog');
        if (dialog) dialog.classList.add('hidden');
        window.getSelection().removeAllRanges();
    }

    /**
     * Finds the start and end character indices of the selectedText inside fullText (raw markdown),
     * ignoring whitespaces, case, smart quotes, and markdown formatting characters.
     * Returns { startIdx, endIdx } if found, otherwise null.
     */
    function findMarkdownSubstringRange(fullText, selectedText) {
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

    async function executeMagicRewrite(msgId, selectedText, instruction) {
        if (!serverConfig.hasKey) {
            alert('⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar settings.');
            return;
        }

        const messageDiv = document.getElementById(msgId) || document.querySelector(`[data-msg-id="${msgId}"]`);
        if (messageDiv) messageDiv.classList.add('rewriting');

        try {
            const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
            const allMessages = mRes.ok ? await mRes.json() : [];
            const assistantMsg = allMessages.find(m => String(m.id) === String(msgId));
            if (!assistantMsg) throw new Error("Original message not found");

            const selectedModel = serverConfig.activeModel || 'deepseek-v4-pro';

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

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: rewriteMessages,
                    temperature: 0.7,
                    stream: false
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

    // App Bootstrapper
    async function initApp() {
        // Fetch server config first
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
            serverConfig = await configRes.json();
        }

        await loadFactoryPrompts();
        initializeModelUI();
        updateKeyStatusUI();
        await loadConversations();

        // Auto select latest thread or create new one if starting clean
        const cRes = await fetch('/api/conversations');
        const conversations = cRes.ok ? await cRes.json() : [];
        conversations.sort((a, b) => b.createdAt - a.createdAt);
        const latest = conversations[0];

        if (latest) {
            await switchConversation(latest.id);
        } else {
            await createNewConversation();
        }
        updatePromptSelectorDisplay();
    }

    // ============================================================
    // System Prompt Profiles — Helper Functions
    // ============================================================

    function prettifyCategory(str) {
        return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function loadFactoryPrompts() {
        try {
            const res = await fetch('/api/prompts');
            if (res.ok) {
                factoryPromptCategories = await res.json();
            }
        } catch {
            // Server not available (file:// protocol) — only user prompts + default
        }
    }

    async function getAllUserPrompts() {
        const res = await fetch('/api/user-prompts');
        let userPrompts = [];
        if (res.ok) {
            userPrompts = await res.json();
        }
        userPrompts.sort((a, b) => a.createdAt - b.createdAt);
        return userPrompts;
    }

    async function getAllPromptCategories() {
        const merged = new Map();

        if (factoryPromptCategories) {
            for (const [catDir, prompts] of Object.entries(factoryPromptCategories.categories)) {
                const label = prettifyCategory(catDir);
                if (!merged.has(label)) merged.set(label, []);
                for (const p of prompts) {
                    merged.get(label).push({
                        name: p.name,
                        promptId: `${p.category}/${p.filename}`,
                        source: 'factory'
                    });
                }
            }
        }

        const userPrompts = await getAllUserPrompts();
        for (const up of userPrompts) {
            const label = up.category || 'Uncategorized';
            if (!merged.has(label)) merged.set(label, []);
            merged.get(label).push({
                name: up.name,
                promptId: `user/${up.id}`,
                source: 'user',
                dbId: up.id
            });
        }

        return merged;
    }

    async function fetchPromptContent(promptId) {
        if (!promptId) return DEFAULT_SYSTEM_PROMPT;
        if (promptContentCache.has(promptId)) return promptContentCache.get(promptId);

        let content = null;
        if (promptId.startsWith('user/')) {
            const dbId = parseInt(promptId.split('/')[1]);
            const res = await fetch('/api/user-prompts');
            const userPrompts = res.ok ? await res.json() : [];
            const record = userPrompts.find(p => p.id === dbId);
            content = record?.content;
        } else {
            try {
                const res = await fetch(`/api/prompts/${promptId}`);
                if (res.ok) {
                    const data = await res.json();
                    content = data.content;
                }
            } catch {}
        }

        if (content) {
            promptContentCache.set(promptId, content);
            return content;
        }
        return DEFAULT_SYSTEM_PROMPT;
    }

    function getSystemPromptContentSync() {
        if (!currentSystemPromptId) return DEFAULT_SYSTEM_PROMPT;
        return promptContentCache.get(currentSystemPromptId) || DEFAULT_SYSTEM_PROMPT;
    }

    async function lookupPromptName(promptId) {
        if (!promptId) return null;
        if (promptId.startsWith('user/')) {
            const dbId = parseInt(promptId.split('/')[1]);
            const res = await fetch('/api/user-prompts');
            const userPrompts = res.ok ? await res.json() : [];
            const record = userPrompts.find(p => p.id === dbId);
            return record?.name || null;
        }
        if (factoryPromptCategories) {
            for (const prompts of Object.values(factoryPromptCategories.categories)) {
                for (const p of prompts) {
                    if (`${p.category}/${p.filename}` === promptId) return p.name;
                }
            }
        }
        return null;
    }

    async function populatePromptDropdown(menuElement, currentSelectionId, onSelect) {
        menuElement.innerHTML = '';
        const categories = await getAllPromptCategories();

        // "None (Default)" option
        const defaultBtn = document.createElement('button');
        defaultBtn.className = 'dropdown-item' + (currentSelectionId === null ? ' selected' : '');
        defaultBtn.textContent = 'None (Default)';
        defaultBtn.addEventListener('click', (e) => { e.stopPropagation(); onSelect(null); menuElement.classList.add('hidden'); });
        menuElement.appendChild(defaultBtn);

        // Divider
        const divider = document.createElement('div');
        divider.className = 'dropdown-divider';
        menuElement.appendChild(divider);

        // Each category
        for (const [categoryLabel, prompts] of categories) {
            const header = document.createElement('div');
            header.className = 'dropdown-category-header';
            header.textContent = categoryLabel;
            menuElement.appendChild(header);

            for (const p of prompts) {
                if (p.source === 'user') {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'dropdown-item dropdown-item-user' + (currentSelectionId === p.promptId ? ' selected' : '');

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = p.name;
                    nameSpan.style.flex = '1';
                    nameSpan.style.textAlign = 'left';
                    nameSpan.style.cursor = 'pointer';
                    nameSpan.addEventListener('click', (e) => { e.stopPropagation(); onSelect(p.promptId); menuElement.classList.add('hidden'); });

                    const actions = document.createElement('span');
                    actions.className = 'user-prompt-actions';
                    const editBtn = document.createElement('button');
                    editBtn.className = 'user-prompt-action-btn';
                    editBtn.textContent = '✎';
                    editBtn.title = 'Edit';
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        menuElement.classList.add('hidden');
                        editingPromptId = p.dbId;
                        promptEditorTitle.textContent = 'Edit Prompt';
                        promptNameInput.value = p.name;
                        promptCategoryInput.value = categoryLabel;
                        promptContentInput.value = '';
                        // Fetch full content for editing
                        fetchPromptContent(p.promptId).then(content => {
                            promptContentInput.value = content;
                        });
                        populateCategoryDatalist();
                        promptEditorModal.classList.remove('hidden');
                    });
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'user-prompt-action-btn delete';
                    deleteBtn.textContent = '✕';
                    deleteBtn.title = 'Delete';
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        menuElement.classList.add('hidden');
                        if (confirm('Delete this prompt?')) {
                            await fetch(`/api/user-prompts/${p.dbId}`, {
                                method: 'DELETE'
                            });
                            promptContentCache.delete(`user/${p.dbId}`);
                            if (currentSystemPromptId === `user/${p.dbId}`) {
                                await setSystemPrompt(null);
                            }
                        }
                    });
                    actions.appendChild(editBtn);
                    actions.appendChild(deleteBtn);

                    wrapper.appendChild(nameSpan);
                    wrapper.appendChild(actions);
                    menuElement.appendChild(wrapper);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'dropdown-item' + (currentSelectionId === p.promptId ? ' selected' : '');
                    btn.textContent = p.name;
                    btn.addEventListener('click', (e) => { e.stopPropagation(); onSelect(p.promptId); menuElement.classList.add('hidden'); });
                    menuElement.appendChild(btn);
                }
            }
        }

        // Create New Prompt option at bottom
        const createDiv = document.createElement('div');
        createDiv.className = 'dropdown-divider';
        menuElement.appendChild(createDiv);
        const createBtn = document.createElement('button');
        createBtn.className = 'dropdown-item create-prompt-item';
        createBtn.textContent = '+ Create New Prompt';
        createBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menuElement.classList.add('hidden');
            editingPromptId = null;
            promptEditorTitle.textContent = 'Create Prompt';
            promptNameInput.value = '';
            promptCategoryInput.value = '';
            promptContentInput.value = '';
            populateCategoryDatalist();
            promptEditorModal.classList.remove('hidden');
        });
        menuElement.appendChild(createBtn);
    }

    async function setSystemPrompt(promptId) {
        currentSystemPromptId = promptId;
        if (promptId) {
            await fetchPromptContent(promptId);
        }
        updatePromptSelectorDisplay();
        if (currentConversationId) {
            await fetch(`/api/conversations/${currentConversationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemPromptId: promptId || null })
            });
        }
    }

    function updatePromptSelectorDisplay() {
        if (!currentSystemPromptId) {
            activePromptName.textContent = 'Default';
            return;
        }
        lookupPromptName(currentSystemPromptId).then(name => {
            activePromptName.textContent = name || 'Default';
        });
    }

    function populateCategoryDatalist() {
        promptCategoryList.innerHTML = '';
        const seen = new Set();
        if (factoryPromptCategories) {
            for (const catDir of Object.keys(factoryPromptCategories.categories)) {
                const label = prettifyCategory(catDir);
                if (!seen.has(label)) {
                    seen.add(label);
                    const opt = document.createElement('option');
                    opt.value = label;
                    promptCategoryList.appendChild(opt);
                }
            }
        }
    }

    // Export Conversation to Markdown Logic
    if (exportChatBtn) {
        exportChatBtn.addEventListener('click', async () => {
            if (currentConversationId === null) {
                alert('No active conversation to export.');
                return;
            }

            const cRes = await fetch('/api/conversations');
            const conversations = cRes.ok ? await cRes.json() : [];
            const conv = conversations.find(c => c.id === currentConversationId);
            if (!conv) return;

            const mRes = await fetch(`/api/messages?conversationId=${currentConversationId}`);
            const allMessages = mRes.ok ? await mRes.json() : [];
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            const activeMessages = allMessages.filter(m => m.isActive !== false);

            if (activeMessages.length === 0) {
                alert('This conversation has no messages to export.');
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
        });
    }

    // Trigger Bootstrapper
    initApp();
});
