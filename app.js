document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.getElementById('chat-container');

    // NOTE: For a real application, do NOT store your API key in the frontend.
    // This should ideally be passed through a secure backend proxy.
    const API_KEY = 'YOUR_DEEPSEEK_API_KEY'; 
    const API_URL = 'https://api.deepseek.com/chat/completions';

    let conversationHistory = [
        { role: 'system', content: 'You are a helpful and concise AI assistant.' }
    ];

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) return;

        // Add user message to UI
        addMessageToUI('user', message);
        conversationHistory.push({ role: 'user', content: message });
        
        // Clear input
        userInput.value = '';
        
        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
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

        } catch (error) {
            console.error('Error fetching DeepSeek response:', error);
            removeTypingIndicator(typingId);
            addMessageToUI('bot', 'Sorry, I encountered an error connecting to the server. Please check your API key or try again later.');
        }
    });

    function addMessageToUI(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Very basic sanitization, using textContent
        contentDiv.textContent = text;
        
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        scrollToBottom();
    }

    function showTypingIndicator() {
        const id = 'typing-' + Date.now();
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = id;
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            indicator.appendChild(dot);
        }
        
        chatContainer.appendChild(indicator);
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
