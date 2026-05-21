# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeChat is a vanilla HTML/CSS/JS single-page chat app that talks to the DeepSeek API via a Node.js backend proxy. No build tools, no framework. The server is required — the app no longer works when opened via `file://`.

### Key Files

- `index.html` — HTML structure, sidebar, modals, CDN-loaded scripts (marked.js only)
- `style.css` — Sky-blue Material 3 dark theme via CSS custom properties, responsive layout
- `app.js` — All application logic in one file, wrapped in `DOMContentLoaded`
- `server.js` — Node.js server: static files + full REST API + DeepSeek API proxy
- `favicon.png` — App icon asset
- `prompt_cards/` — System prompt markdown files organized into category subfolders
- `data/db.json` — Server-side JSON file database (all persistent state)
- `start-vibechat.bat` — Double-click to start server + open browser, press any key to stop

## Development Commands

No build step, no package managers. To run the app:

```bash
node server.js
# Then open http://localhost:3000
```

Or double-click `start-vibechat.bat`.

## Architecture

### Data Flow
1. User types message → `chatForm submit` event
2. Message saved to server DB (`POST /api/messages`), rendered to UI
3. Full conversation history fetched from server (`GET /api/messages`), sent via proxy to DeepSeek API (`POST /api/chat/completions`)
4. Response streamed to UI as SSE chunks, saved to server DB on completion

### Storage
- **Server-side (data/db.json)**: Everything — conversations, messages, user prompts, API key, model preference
- **localStorage**: Only `activeConversationId` (to restore the last active conversation on reload)

### Server API Endpoints
- `GET /api/config` — Get server config (hasKey, activeModel)
- `POST /api/config` — Save API key and/or active model
- `GET|POST /api/conversations` — List all conversations or create new
- `PUT|DELETE /api/conversations/:id` — Update or delete a conversation (cascade deletes messages)
- `GET|POST /api/messages?conversationId=` — Get or create messages
- `PUT /api/messages/:id` — Update a message (edit content, toggle isActive, set versionGroupId)
- `DELETE /api/messages?conversationId=` — Delete all messages in a conversation
- `GET|POST /api/user-prompts` — List or create/update user-created system prompts
- `DELETE /api/user-prompts/:id` — Delete a user prompt
- `GET /api/prompts` — List factory prompt cards from `prompt_cards/` subfolders
- `GET /api/prompts/:category/:filename` — Get a specific factory prompt content
- `POST /api/chat/completions` — Proxies to DeepSeek API (key stays server-side)

### System Prompt Profiles
- **Factory prompts**: Read-only prompts from `prompt_cards/` subfolders, auto-discovered via `GET /api/prompts`. Drop `.md` files into a subfolder, restart server, they appear.
- **User prompts**: Created/edited/deleted through the app UI, stored in server DB. Persist across restarts.
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
- State variables: `currentConversationId`, `abortController`, `serverConfig`, `currentSystemPromptId`, `factoryPromptCategories`, `promptContentCache`, `modalSelectedPromptId`, `editingPromptId`, `conversationIdToDelete`
- Functions: `async/await` for server API and API calls
- API calls use `fetch` with `AbortController` for cancellation
- Only CDN dependency: `marked.js` (loaded via `<script>`, checked via `typeof marked`)

### API Integration
- API calls proxied through the server: `POST /api/chat/completions` → `https://api.deepseek.com/chat/completions`
- API key is stored server-side only (never sent to the browser)
- Models: `deepseek-v4-pro` (default), `deepseek-v4-flash`
- System prompt: Selected per-conversation. Falls back to "You are a helpful and concise AI assistant."
- Temperature: 0.7

## Features

### Message Editing
- **User messages**: Inline edit via textarea, saving creates a new version and regenerates the AI response
- **Bot messages**: Inline edit via textarea (raw markdown), saving creates a new version (no regeneration)
- **Regenerate**: Bot messages can be regenerated, creating a new version branch
- **Version navigation**: Messages with multiple versions show prev/next controls to switch between them
- **Magic Rewrite**: Select text in a bot message, click the "Magic Rewrite" button, enter an instruction, and the AI rewrites just that section

### Conversation Management
- `switchConversation(id)` — Switch active conversation, restore messages and model
- `createNewConversation(title, systemPromptId)` — Create conversation via server API
- `deleteConversation(id)` — Shows confirmation modal, then deletes via server API (cascade)
- **Inline rename**: Conversations renamed via `startInlineRename()` which swaps the title span for an input
- **Auto-titling**: First user message auto-titles the conversation (truncated to 25 chars)

### Other
- **Continue button**: Appears when last active message is an assistant response — sends `[continue]` as the next user message
- **Export to Markdown**: Downloads the active conversation as a `.md` file
- **Streaming response**: Real-time token streaming with "Thinking..." reasoning block (collapsible)

## Working with the Code

- **New features**: Add interactive elements to `index.html` first, then style in `style.css`, then logic in `app.js`
- **Styling patterns**: Buttons use `--border-radius-pill` (9999px). User bubbles use `--bg-input`, bot messages are transparent with full-width layout.
- **Abort pattern**: `abortController` is the global state for fetch cancellation; the stop button calls `abortController.abort()`
- **Server-side storage**: All persistent state goes into `server.js` via `data/db.json`. Add new API endpoints to `server.js` and call them from `app.js`.
- **Reasoning content**: Streaming responses parse `reasoning_content` from DeepSeek's delta. Displayed in a collapsible "Thought" block.
- **System prompts**: Add a `.md` file to any subfolder in `prompt_cards/`, restart the server, and it appears in the prompt selector. Or create/edit/delete via the app UI (stored in server DB).
- **Server**: `server.js` auto-scans `prompt_cards/` subfolders. First line of each `.md` file (H1 with "System Prompt: Name" format) is used as the display name. Subfolder names become category labels.
