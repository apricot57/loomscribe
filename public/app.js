import { state } from './js/state.js';
import { loadFactoryPrompts } from './js/api.js';
import {
    initInputBar,
    initializeModelUI,
    initializeThinkingUI,
    updateKeyStatusUI,
    initSidebar,
    initNewChatModal,
    loadConversations,
    switchConversation,
    createNewConversation,
    initPromptSelector,
    initPromptEditorImport,
    updatePromptSelectorDisplay,
    initKeyModal,
    initPromptEditorModal,
    initDeleteModal,
    initChatForm,
    initStopButton,
    initContinueButton,
    initExportButton
} from './js/ui.js';

// Load Magic module which automatically binds its selection & click listeners
import './js/magic.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => console.error("Unhandled error during app initialization:", err));
});

async function initApp() {
    // Fetch server config first
    const configRes = await fetch('/api/config');
    if (configRes.ok) {
        state.serverConfig = await configRes.json();
    }

    await loadFactoryPrompts();

    // Register all event listeners in respective UI modules
    initSidebar();
    initNewChatModal();
    initInputBar();
    initPromptSelector();
    initPromptEditorImport();
    initKeyModal();
    initPromptEditorModal();
    initDeleteModal();
    initChatForm();
    initStopButton();
    initContinueButton();
    initExportButton();

    // Initialize UI visuals from serverConfig
    initializeModelUI();
    initializeThinkingUI();
    updateKeyStatusUI();

    // Load conversation lists in sidebar
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
