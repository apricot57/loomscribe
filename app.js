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

    // Footer Prompt Selector DOM Elements
    const promptSelectBtn = document.getElementById('prompt-select-btn');
    const activePromptName = document.getElementById('active-prompt-name');
    const promptDropdownMenu = document.getElementById('prompt-dropdown-menu');

    // Storage Keys & API configurations
    const API_KEY_STORAGE_KEY = 'vibe_chat_api_key';
    const MODEL_STORAGE_KEY = 'vibe_chat_model';
    const API_URL = 'https://api.deepseek.com/chat/completions';

    // Dexie.js Database Initialization
    const db = new Dexie("VibeChatDatabase");
    db.version(1).stores({
        conversations: "++id, title, activeModel, createdAt",
        messages: "++id, conversationId, role, content, timestamp"
    });
    db.version(2).stores({
        conversations: "++id, title, activeModel, systemPromptId, createdAt",
        messages: "++id, conversationId, role, content, timestamp"
    });
    db.version(3).stores({
        conversations: "++id, title, activeModel, systemPromptId, createdAt",
        messages: "++id, conversationId, role, content, timestamp",
        prompts: "++id, name, category, content, createdAt"
    });
    db.version(4).stores({
        conversations: "++id, title, activeModel, systemPromptId, createdAt",
        messages: "++id, conversationId, role, content, timestamp, versionGroupId, version, isActive, parentMsgId",
        prompts: "++id, name, category, content, createdAt"
    });

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
        const storedModel = localStorage.getItem(MODEL_STORAGE_KEY) || 'deepseek-v4-pro';
        localStorage.setItem(MODEL_STORAGE_KEY, storedModel);
        
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
            localStorage.setItem(MODEL_STORAGE_KEY, modelVal);
            
            // Update header button label
            activeModelName.textContent = item.querySelector('.item-name').textContent;
            
            // Set active class
            dropdownItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Close menu
            modelDropdownMenu.classList.add('hidden');
            modelSelectBtn.parentElement.classList.remove('open');

            // Save active model configuration for current conversation if active
            if (currentConversationId !== null) {
                await db.conversations.update(currentConversationId, { activeModel: modelVal });
            }
        });
    });

    // Update the visual status of the key icon dot
    function updateKeyStatusUI() {
        const key = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (key && key.trim() !== '') {
            keyStatusDot.classList.add('active');
        } else {
            keyStatusDot.classList.remove('active');
        }
    }

    // Show API Key Modal
    keyBtn.addEventListener('click', () => {
        const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
        apiKeyInput.value = storedKey;
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

    // Save key to LocalStorage
    saveKeyBtn.addEventListener('click', () => {
        const keyVal = apiKeyInput.value.trim();
        if (!keyVal) {
            alert('Please enter a valid DeepSeek API key.');
            return;
        }
        localStorage.setItem(API_KEY_STORAGE_KEY, keyVal);
        updateKeyStatusUI();
        closeModal();
    });

    // Remove key from LocalStorage
    deleteKeyBtn.addEventListener('click', () => {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        apiKeyInput.value = '';
        updateKeyStatusUI();
        closeModal();
    });

    // Fetch and render the list of conversations in the sidebar
    async function loadConversations() {
        const chatsList = document.getElementById('chats-list');
        if (!chatsList) return;

        const conversations = await db.conversations.orderBy('createdAt').reverse().toArray();
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
        const conv = await db.conversations.get(id);
        if (conv && conv.activeModel) {
            localStorage.setItem(MODEL_STORAGE_KEY, conv.activeModel);
            initializeModelUI();
        }

        // Restore system prompt for this conversation
        currentSystemPromptId = conv?.systemPromptId || null;
        if (currentSystemPromptId) {
            await fetchPromptContent(currentSystemPromptId);
        }
        updatePromptSelectorDisplay();

        // Fetch corresponding messages
        const allMessages = await db.messages.where('conversationId').equals(id).sortBy('timestamp');
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

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }
    }

    // Spawn a new empty conversation
    async function createNewConversation(title = 'New Chat', systemPromptId = null) {
        const selectedModel = localStorage.getItem(MODEL_STORAGE_KEY) || 'deepseek-v4-pro';

        if (systemPromptId) {
            await fetchPromptContent(systemPromptId);
        }

        const newId = await db.conversations.add({
            title: title,
            activeModel: selectedModel,
            systemPromptId: systemPromptId || null,
            createdAt: Date.now()
        });

        currentConversationId = newId;
        currentSystemPromptId = systemPromptId || null;
        updatePromptSelectorDisplay();

        await loadConversations();

        const container = chatContainer.querySelector('.messages-container');
        if (container) {
            container.innerHTML = '';
        }

        scrollToBottom();

        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
        }

        return newId;
    }

    // Delete a conversation thread
    async function deleteConversation(id) {
        if (confirm('Are you sure you want to delete this conversation?')) {
            await db.conversations.delete(id);
            await db.messages.where('conversationId').equals(id).delete();
            
            if (currentConversationId === id) {
                const latest = await db.conversations.orderBy('createdAt').reverse().first();
                if (latest) {
                    await switchConversation(latest.id);
                } else {
                    await createNewConversation();
                }
            } else {
                await loadConversations();
            }
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
                
                // Update database in background
                await db.conversations.update(id, { title: newTitle });
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
        await db.conversations.update(convId, { title: title });
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

    // Save Prompt button
    savePromptBtn.addEventListener('click', async () => {
        const name = promptNameInput.value.trim();
        const category = promptCategoryInput.value.trim();
        const content = promptContentInput.value.trim();
        if (!name || !content) {
            alert('Prompt name and content are required.');
            return;
        }
        if (editingPromptId) {
            await db.prompts.update(editingPromptId, { name, category, content });
        } else {
            await db.prompts.add({ name, category, content, createdAt: Date.now() });
        }
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
        });
    }

    // Message submit trigger
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) return;

        // Retrieve current key from storage
        const activeApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (!activeApiKey || activeApiKey.trim() === '') {
            addMessageToUI('bot', '⚠️ API Key is missing! Please configure your DeepSeek API key in the sidebar under Settings (🔑).');
            return;
        }

        // Auto-create active thread if none exists
        if (currentConversationId === null) {
            await createNewConversation();
        }

        // Find the previous active message to set parentMsgId
        const prevMsgs = await db.messages.where('conversationId').equals(currentConversationId).toArray();
        const lastActive = prevMsgs.filter(m => m.isActive !== false).sort((a, b) => a.timestamp - b.timestamp).pop();
        const parentMsgIdVal = lastActive ? lastActive.id : null;

        // Add user message to UI
        addMessageToUI('user', message);

        // Clear input early
        userInput.value = '';

        // Write message record to IndexedDB with new fields
        const userMsgId = await db.messages.add({
            conversationId: currentConversationId,
            role: 'user',
            content: message,
            timestamp: Date.now(),
            parentMsgId: parentMsgIdVal,
            isActive: true
        });

        // Trigger auto-titling if this is the very first message
        const count = await db.messages.where('conversationId').equals(currentConversationId).count();
        if (count === 1) {
            await autoTitleConversation(currentConversationId, message);
        }

        // Stream AI response using shared function
        await streamApiResponse({
            conversationId: currentConversationId,
            parentMsgId: userMsgId
        });
    });

    function addMessageToUI(sender, text, reasoning, msgMeta = {}) {
        const container = chatContainer.querySelector('.messages-container');
        if (!container) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = sender === 'bot' ? '🤖' : '👤';

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
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(bodyDiv);
        } else {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = text;
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);
        }

        // Store metadata as data attributes for action buttons
        if (msgMeta.id != null) {
            messageDiv.dataset.msgId = msgMeta.id;
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

    function addStreamingBotMessage() {
        const container = chatContainer.querySelector('.messages-container');
        if (!container) return null;

        const id = 'stream-msg-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.id = id;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = '🤖';

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
        messageDiv.appendChild(avatarDiv);
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
        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = await db.messages.where('parentMsgId').equals(currentId).toArray();
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
            await db.messages.update(id, { isActive: false });
        }
    }

    async function showDescendants(msgId) {
        const ids = await getDescendantIds(msgId);
        for (const id of ids) {
            await db.messages.update(id, { isActive: true });
        }
    }

    async function buildApiPayload(conversationId) {
        const all = await db.messages.where('conversationId').equals(conversationId).sortBy('timestamp');
        const active = all.filter(m => m.isActive !== false);
        const payload = [{ role: 'system', content: getSystemPromptContentSync() }];
        for (const msg of active) {
            payload.push({ role: msg.role, content: msg.content });
        }
        return payload;
    }

    async function buildApiPayloadUpTo(conversationId, stopAfterMsgId) {
        const all = await db.messages.where('conversationId').equals(conversationId).sortBy('timestamp');
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
        const all = await db.messages.where('conversationId').equals(currentConversationId).sortBy('timestamp');
        const activeAssistants = all.filter(m => m.role === 'assistant' && m.isActive !== false);
        if (activeAssistants.length === 0) return false;
        return activeAssistants[activeAssistants.length - 1].id === msgId;
    }

    async function refreshConversationView() {
        if (currentConversationId !== null) {
            await switchConversation(currentConversationId);
        }
    }

    // ============================================================
    // Message Editing — streamApiResponse (Shared Streaming Logic)
    // ============================================================

    async function streamApiResponse({ conversationId, parentMsgId, stopAfterMsgId, versionGroupId, version }) {
        const activeApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (!activeApiKey || activeApiKey.trim() === '') {
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
            const selectedModel = localStorage.getItem(MODEL_STORAGE_KEY) || 'deepseek-v4-pro';
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeApiKey}`
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
                await db.messages.add({
                    conversationId,
                    role: 'assistant',
                    content: fullContent,
                    reasoning: fullReasoning || undefined,
                    timestamp: Date.now(),
                    parentMsgId: parentMsgId || null,
                    versionGroupId: versionGroupId || null,
                    version: version || 1,
                    isActive: true
                });
                finalizeStreamingBotMessage(streamMsgId, fullContent, fullReasoning);
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
        textarea.rows = Math.min(originalContent.split('\n').length + 1, 12);

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

        contentDiv.replaceWith(textarea);
        textarea.after(editActions);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    function cancelInlineEdit(messageDiv, contentDiv, textarea, editActions, actionRow) {
        textarea.replaceWith(contentDiv);
        editActions.remove();
        if (actionRow) actionRow.style.display = '';
    }

    async function editMessageAndRegenerate(msgId, newText, messageDiv) {
        const originalMsg = await db.messages.get(msgId);
        if (!originalMsg) return;

        const versionGroupId = originalMsg.versionGroupId || originalMsg.id;
        const existingVersions = await db.messages
            .where('versionGroupId').equals(versionGroupId)
            .toArray();
        const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version || 1), 0);
        const newVersion = maxVersion + 1;

        // Mark original message with versionGroupId if first edit
        if (!originalMsg.versionGroupId) {
            await db.messages.update(msgId, {
                versionGroupId: versionGroupId,
                version: 1,
                isActive: false
            });
        }

        // Hide all descendants of old versions
        for (const v of existingVersions) {
            await db.messages.update(v.id, { isActive: false });
            await hideDescendants(v.id);
        }
        await hideDescendants(msgId);

        // Create new version of the edited message
        const newMsgId = await db.messages.add({
            conversationId: originalMsg.conversationId,
            role: 'user',
            content: newText,
            timestamp: Date.now(),
            versionGroupId: versionGroupId,
            version: newVersion,
            isActive: true,
            parentMsgId: originalMsg.parentMsgId || null
        });

        // Remove the edit UI elements (full view refresh follows)
        const te = messageDiv.querySelector('.inline-edit-textarea');
        const ea = messageDiv.querySelector('.inline-edit-actions');
        if (te) te.remove();
        if (ea) ea.remove();
        const ar = messageDiv.querySelector('.message-action-row');
        if (ar) ar.style.display = '';

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
        const assistantMsg = await db.messages.get(msgId);
        if (!assistantMsg || assistantMsg.role !== 'assistant') return;

        const parentUserMsg = assistantMsg.parentMsgId ? await db.messages.get(assistantMsg.parentMsgId) : null;
        const stopAtId = parentUserMsg ? parentUserMsg.id : msgId;

        const versionGroupId = assistantMsg.versionGroupId || assistantMsg.id;
        const existingVersions = await db.messages
            .where('versionGroupId').equals(versionGroupId)
            .toArray();
        const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version || 1), 0);
        const newVersion = maxVersion + 1;

        // Mark original if first regenerate
        if (!assistantMsg.versionGroupId) {
            await db.messages.update(msgId, { versionGroupId, version: 1, isActive: false });
        }

        // Hide descendants and deactivate old versions
        for (const v of existingVersions) {
            await db.messages.update(v.id, { isActive: false });
            await hideDescendants(v.id);
        }
        await hideDescendants(msgId);

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
        const versions = await db.messages
            .where('versionGroupId').equals(versionGroupId)
            .sortBy('version');

        if (targetVersion < 1 || targetVersion > versions.length) return;

        const targetMsg = versions.find(v => (v.version || 1) === targetVersion);
        if (!targetMsg) return;

        // Deactivate all versions in this group
        for (const v of versions) {
            await db.messages.update(v.id, { isActive: false });
        }

        // Activate target version then show its descendants
        await db.messages.update(targetMsg.id, { isActive: true });
        await showDescendants(targetMsg.id);

        // Hide descendants of non-target versions
        for (const v of versions) {
            if (v.id !== targetMsg.id) {
                await hideDescendants(v.id);
            }
        }

        await refreshConversationView();
    }

    // App Bootstrapper
    async function initApp() {
        await loadFactoryPrompts();
        initializeModelUI();
        updateKeyStatusUI();
        await loadConversations();

        // Auto select latest thread or create new one if starting clean
        const latest = await db.conversations.orderBy('createdAt').reverse().first();
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
        return await db.prompts.orderBy('createdAt').toArray();
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
            const record = await db.prompts.get(dbId);
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
            const record = await db.prompts.get(dbId);
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
                            await db.prompts.delete(p.dbId);
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
            await db.conversations.update(currentConversationId, { systemPromptId: promptId || null });
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

    // Trigger Bootstrapper
    initApp();
});
