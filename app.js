document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.getElementById('chat-container');

    // Sidebar DOM Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

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
    const STORAGE_KEY = 'vibe_chat_history';
    const API_KEY_STORAGE_KEY = 'vibe_chat_api_key';
    const API_URL = 'https://api.deepseek.com/chat/completions';

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

    // Update the visual status of the key icon dot
    function updateKeyStatusUI() {
        const key = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (key && key.trim() !== '') {
            keyStatusDot.classList.add('active');
        } else {
            keyStatusDot.classList.remove('active');
        }
    }

    // Initialize key status on load
    updateKeyStatusUI();

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
    
    // Load history from localStorage or initialize with system prompt
    const storedHistory = localStorage.getItem(STORAGE_KEY);
    let conversationHistory = storedHistory ? JSON.parse(storedHistory) : [
        { role: 'system', content: 'You are a helpful and concise AI assistant.' }
    ];

    // Restore UI from history
    if (storedHistory && conversationHistory.length > 1) {
        const container = chatContainer.querySelector('.messages-container');
        if (container) {
            container.innerHTML = ''; // clear default message
            conversationHistory.forEach(msg => {
                if (msg.role !== 'system') {
                    const sender = msg.role === 'assistant' ? 'bot' : 'user';
                    addMessageToUI(sender, msg.content);
                }
            });
        }
    }

    // New/Clear Chat History logic
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear your current conversation?')) {
                localStorage.removeItem(STORAGE_KEY);
                conversationHistory = [
                    { role: 'system', content: 'You are a helpful and concise AI assistant.' }
                ];
                
                const container = chatContainer.querySelector('.messages-container');
                if (container) {
                    container.innerHTML = '';
                    addMessageToUI('bot', "Hello! I'm your DeepSeek AI assistant configured with a stunning Neon Green workspace. How can I help you customize your code today?");
                }
                
                // Auto-close sidebar on mobile
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                }
            }
        });
    }
    
    function saveHistory() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory));
    }

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

        // Add user message to UI
        addMessageToUI('user', message);
        conversationHistory.push({ role: 'user', content: message });
        saveHistory();
        
        // Clear input
        userInput.value = '';
        
        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeApiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: conversationHistory,
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
            
            // Add bot message to UI and history
            conversationHistory.push({ role: 'assistant', content: botMessage });
            addMessageToUI('bot', botMessage);
            saveHistory();

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
        contentDiv.textContent = text;
        
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
});
