import { requireLogin, authFetch, logout } from './js/auth.js';
import { state } from './js/state.js';
import { initWebSocket } from './js/socket.js';
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
    initKeyModal,
    initDeleteModal,
    initChatForm,
    initStopButton,
    initContinueButton,
    initExportButton,
    initRightPane,
    initPresetManager
} from './js/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => console.error("Unhandled error during app initialization:", err));
});

async function initApp() {
    // Guard: redirect to login if not authenticated
    const authed = await requireLogin();
    if (!authed) return;

    // Expose logout helper globally so UI components can call it
    window.lsLogout = logout;

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to log out?')) {
                await logout();
            }
        });

        // Determine if auth is enabled and update logout button display
        try {
            const token = localStorage.getItem('ls_auth_token');
            const checkRes = await fetch('/api/auth/check', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                if (checkData.authEnabled !== false) {
                    logoutBtn.style.display = 'inline-flex';
                }
            }
        } catch (e) {
            console.error("Failed to fetch auth check for logout display:", e);
        }
    }

    // Initialize WebSocket connection
    initWebSocket();

    // Fetch server config first
    const configRes = await authFetch('/api/config');
    if (configRes.ok) {
        state.serverConfig = await configRes.json();
    }

    // Register all event listeners in respective UI modules
    initSidebar();
    initNewChatModal();
    initInputBar();
    initKeyModal();
    initDeleteModal();
    initChatForm();
    initStopButton();
    initContinueButton();
    initExportButton();
    initRightPane();
    initPresetManager();

    // Initialize UI visuals from serverConfig
    initializeModelUI();
    initializeThinkingUI();
    updateKeyStatusUI();

    // Load conversation lists in sidebar
    await loadConversations();

    // Restore active conversation from localStorage if valid
    const savedIdStr = localStorage.getItem('activeConversationId');
    const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null;

    const cRes = await authFetch('/api/conversations');
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
}
