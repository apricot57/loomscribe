document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.getElementById('chat-container');

    // Sidebar DOM Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

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

    // Active conversation state tracker
    let currentConversationId = null;

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
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteConversation(conv.id);
            });
            
            item.innerHTML = iconSvg;
            item.appendChild(titleSpan);
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

        // Fetch corresponding messages
        const messages = await db.messages.where('conversationId').equals(id).sortBy('timestamp');
        
        // Render messages
        const container = chatContainer.querySelector('.messages-container');
        if (container) {
            container.innerHTML = '';
            
            messages.forEach(msg => {
                if (msg.role !== 'system') {
                    const sender = msg.role === 'assistant' ? 'bot' : 'user';
                    addMessageToUI(sender, msg.content);
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
    async function createNewConversation() {
        const selectedModel = localStorage.getItem(MODEL_STORAGE_KEY) || 'deepseek-v4-pro';
        
        const newId = await db.conversations.add({
            title: 'New Chat',
            activeModel: selectedModel,
            createdAt: Date.now()
        });
        
        currentConversationId = newId;
        
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

    // Auto title based on first prompt
    async function autoTitleConversation(convId, promptText) {
        let title = promptText.trim();
        if (title.length > 25) {
            title = title.substring(0, 25) + '...';
        }
        await db.conversations.update(convId, { title: title });
        await loadConversations();
    }

    // New/Clear Chat History button triggers fresh empty chat creation
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', async () => {
            await createNewConversation();
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

        // Add user message to UI
        addMessageToUI('user', message);
        
        // Clear input early
        userInput.value = '';
        
        // Write message record to IndexedDB
        await db.messages.add({
            conversationId: currentConversationId,
            role: 'user',
            content: message,
            timestamp: Date.now()
        });

        // Trigger auto-titling if this is the very first message
        const count = await db.messages.where('conversationId').equals(currentConversationId).count();
        if (count === 1) {
            await autoTitleConversation(currentConversationId, message);
        }

        // Pull full conversation history records to sync with DeepSeek payload
        const messagesFromDb = await db.messages.where('conversationId').equals(currentConversationId).sortBy('timestamp');
        
        const payloadMessages = [
            { role: 'system', content: 'You are a helpful and concise AI assistant.' }
        ];
        
        messagesFromDb.forEach(msg => {
            payloadMessages.push({
                role: msg.role,
                content: msg.content
            });
        });

        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const selectedModel = localStorage.getItem(MODEL_STORAGE_KEY) || 'deepseek-v4-pro';
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeApiKey}`
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: payloadMessages,
                    temperature: 0.7
                })
            });

            removeTypingIndicator(typingId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("API Error:", errorData);
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const botMessage = data.choices[0].message.content;
            
            // Save bot response to IndexedDB
            await db.messages.add({
                conversationId: currentConversationId,
                role: 'assistant',
                content: botMessage,
                timestamp: Date.now()
            });

            // Render bot message to UI
            addMessageToUI('bot', botMessage);

        } catch (error) {
            console.error('Error fetching DeepSeek response:', error);
            removeTypingIndicator(typingId);
            addMessageToUI('bot', 'Sorry, I encountered an error connecting to the server. Please check your API key or try again later.');
        }
    });

    function addMessageToUI(sender, text) {
        const container = chatContainer.querySelector('.messages-container');
        if (!container) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = sender === 'bot' ? '🤖' : '👤';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        if (sender === 'bot') {
            contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
        } else {
            contentDiv.textContent = text;
        }
        
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        container.appendChild(messageDiv);
        
        scrollToBottom();
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

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // App Bootstrapper
    async function initApp() {
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
    }

    // Trigger Bootstrapper
    initApp();
});
