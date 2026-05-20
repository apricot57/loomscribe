# 🗺️ Implementation Plan: Dexie.js IndexedDB Chat History

We will migrate VibeChat's client-side storage from the synchronous, limited `localStorage` (5MB limit) to **IndexedDB** utilizing the lightweight wrapper **Dexie.js**. This enables robust, offline-first storage of unlimited chat threads, conversational history list features in the left sidebar, thread deletions, and dynamic UI loading.

---

## 🎨 Layout & UI Additions

### 1. Sidebar Chat History List
We will restructure the empty `.sidebar-menu` container into a dynamic, styled list of recent conversations.

*   **HTML Structure**: Link the Dexie.js library via CDN and add the `#chats-list` list structure in the sidebar.
*   **Aesthetic Styling (`style.css`)**:
    *   Style items as elegant, minimal navigation pill buttons with light-hover background transitions (`var(--accent-dim)`).
    *   Include a speech bubble icon on the left, an auto-truncating title in the center, and a hover-only trash icon on the right.
    *   Transition styling for active conversation list items to have high-contrast text and a soft highlight backdrop.

---

## 🛠️ Proposed Changes

### 1. Database Schema & API Setup
#### [MODIFY] [index.html](file:///c:/Users/Focus/Documents/Misc/vibe-api/index.html)
*   **CDN Link**: Include `<script src="https://cdn.jsdelivr.net/npm/dexie@latest/dist/dexie.min.js"></script>` right before `<script src="app.js"></script>`.
*   **Sidebar Refactoring**: Replace the placeholder `.sidebar-menu` structure with a structured `#chats-list` recent conversations container.

### 2. Styling the Sidebar History Item States
#### [MODIFY] [style.css](file:///c:/Users/Focus/Documents/Misc/vibe-api/style.css)
*   Create visual rules for `.chats-list-container`, `.chat-list-item`, `.chat-item-title`, `.chat-delete-btn`, and hover activations.
*   Add smooth slide-in animations for newly spawned conversation row items.

### 3. Dexie.js Store Layer & State Router
#### [MODIFY] [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js)
*   **Dexie Initialization**:
    ```javascript
    const db = new Dexie("VibeChatDatabase");
    db.version(1).stores({
        conversations: "++id, title, activeModel, createdAt",
        messages: "++id, conversationId, role, content, timestamp"
    });
    ```
*   **State Management**:
    *   `currentConversationId`: Keeps track of the active thread ID.
    *   `loadConversations()`: Fetches conversations from IndexedDB, populating the sidebar.
    *   `switchConversation(id)`: Loads and renders messages matching the target `conversationId`.
    *   `createNewConversation()`: Creates a new record in the database, updates the active state, and prompts a fresh visual conversation.
    *   `deleteConversation(id, event)`: Removes the conversation and all cascade messages from the database, reloading the active states gracefully.
    *   **Auto-Titling**: On the very first message sent in a new conversation, automatically update the thread title using the first few words of the user's prompt (e.g. 25 characters followed by `...`) and save to IndexedDB.

---

## 🔍 Verification Plan

### Manual Verification
1.  **Creation Mechanics**: Click the M3 Extended **New Chat** squircle button. Verify that it creates a blank conversation space and resets the chat container.
2.  **Auto-Titling Check**: Send a message (e.g. *"What is the speed of light in a vacuum?"*). Verify that the sidebar conversation item dynamically updates its title to *"What is the speed of lig..."*.
3.  **Persistence Review**: Refresh the browser page. Confirm that your conversation list and active message content are completely preserved and loaded via IndexedDB.
4.  **Cascade Deletion**: Hover over a conversation item, click the trash icon, and confirm deletion. Verify that the thread is removed and the interface falls back gracefully to a blank welcome state.
5.  **Offline Verification**: Ensure no errors occur when running without an active internet connection (other than deepseek completion timeouts).
