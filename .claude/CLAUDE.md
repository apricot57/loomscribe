# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeChat is a vanilla HTML/CSS/JS single-page chat app that talks to the DeepSeek API. No build tools, no framework. The app can be served via a zero-dependency Node.js server (for prompt cards) or opened directly in a browser (basic mode).

### Key Files

- `index.html` — HTML structure, sidebar, modals, CDN-loaded scripts
- `style.css` — Material 3 dark theme via CSS custom properties, responsive layout
- `app.js` — All application logic in one file, wrapped in `DOMContentLoaded`
- `server.js` — Zero-dependency Node.js server (static files + prompt API)
- `favicon.png` — App icon asset
- `prompt_cards/` — System prompt markdown files organized into category subfolders
- `start-vibechat.bat` — Double-click to start server + open browser, press any key to stop

## Development Commands

No build step, no package managers. To run the app:

```bash
# Run with server (enables factory prompt cards — recommended)
node server.js

# Or open in browser directly (basic mode — only user-created prompts + default)
start index.html
```

## Architecture

### Data Flow
1. User types message → `chatForm submit` event
2. Message saved to IndexedDB via Dexie.js, rendered to UI
3. Full conversation history fetched from DB, sent to DeepSeek API
4. Response saved to IndexedDB, rendered to UI with `marked.parse()`

### Storage
- **IndexedDB** (Dexie.js): Three tables — `conversations` (id, title, activeModel, systemPromptId, createdAt), `messages` (id, conversationId, role, content, timestamp), `prompts` (id, name, category, content, createdAt)
- **localStorage**: API key (`vibe_chat_api_key`) and selected model (`vibe_chat_model`)

### System Prompt Profiles
- System prompt is no longer hardcoded — it's selected per-conversation
- **Factory prompts**: Read-only prompts from `prompt_cards/` subfolders, auto-discovered via `server.js` API. Drop `.md` files into a subfolder, restart server, they appear.
- **User prompts**: Created/edited/deleted through the app UI, stored in IndexedDB `prompts` table. Persist locally. Work even when opened via `file://`.
- Both sources merged at runtime in the prompt selector dropdown
- `systemPromptId` stored on each conversation: `"category/filename"` for factory prompts, `"user/id"` for user prompts

### CSS Conventions
- Design tokens as CSS custom properties in `:root` (prefixes: `--bg-`, `--accent-`, `--text-`, `--border-radius-`, `--shadow-m3-`, `--transition-`)
- Organized into section blocks delimited by `/* ====== */` comments
- Mobile breakpoint at 768px (sidebar becomes overlay)
- Classes use kebab-case. IDs used for unique interactive elements.

### JS Conventions
- All code inside a single `DOMContentLoaded` listener
- DOM element references collected at the top, then event listeners, then function definitions
- State variables: `currentConversationId`, `abortController`, `currentSystemPromptId`, `factoryPromptCategories`, `promptContentCache`
- Functions: `async/await` for DB and API operations
- API calls use `fetch` with `AbortController` for cancellation
- CDN dependencies loaded via `<script>`: Dexie.js and marked.js (checked via `typeof marked`)

### API Integration
- Endpoint: `POST https://api.deepseek.com/chat/completions`
- Models: `deepseek-v4-pro` (default), `deepseek-v4-flash`
- System prompt: Selected per-conversation from factory prompts (server) or user prompts (IndexedDB). Falls back to "You are a helpful and concise AI assistant."
- Temperature: 0.7

## Working with the Code

- **New features**: Add interactive elements to `index.html` first, then style in `style.css`, then logic in `app.js`
- **Styling patterns**: Buttons use `--border-radius-pill` (9999px). Messages are pill-shaped. User bubbles use `--bg-message-user`, bot messages are transparent.
- **Conversation management**: `switchConversation(id)`, `createNewConversation(title, systemPromptId)`, `deleteConversation(id)` manage full lifecycle including DB cascade
- **Inline rename**: Conversations are renamed via `startInlineRename()` which swaps the title span for an input
- **Abort pattern**: `abortController` is the global state for fetch cancellation; the stop button calls `abortController.abort()`
- **System prompts**: Add a `.md` file to any subfolder in `prompt_cards/`, restart the server, and it appears in the prompt selector. Or create/edit/delete via the app UI (stored in IndexedDB).
- **Server**: `server.js` auto-scans `prompt_cards/` subfolders. First line of each `.md` file (H1) is used as the display name. Subfolder names become category labels.
