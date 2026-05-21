# VibeChat

A lightweight, single-page chat interface for collaborative fiction writing with DeepSeek models. Vanilla HTML/CSS/JS — no build tools, no frameworks, no package managers.

## Features

- **Streaming responses** — Real-time token streaming with markdown rendering and collapsible reasoning blocks
- **System prompt profiles** — Factory prompts from `prompt_cards/` subfolders, plus user-created prompts editable in-app
- **Message editing** — Inline edit any message (user or AI). Editing a user message triggers regeneration; editing an AI message saves the rewrite in-place
- **Version navigation** — Edited and regenerated messages are tracked as version groups. Navigate between versions with prev/next controls
- **Regenerate** — Re-roll any AI response, creating a new version branch
- **Magic Rewrite** — Select text within an AI response and rewrite just that section via instruction
- **Continue** — One-click button to continue the last AI response without typing
- **Conversation management** — Create, rename, delete conversations. Conversations persist across sessions
- **Export to Markdown** — Download the active conversation as a `.md` file
- **Model selection** — Switch between DeepSeek V4 Pro and V4 Flash per-conversation
- **Abort** — Stop generation mid-stream

## Quick Start

Prerequisites: [Node.js](https://nodejs.org/) (any recent version).

```bash
node server.js
```

Open http://localhost:3000 in your browser.

Or on Windows, double-click `start-vibechat.bat` — it starts the server, opens the browser, and shuts down the server when you press any key.

### First-time setup

1. Click **DeepSeek API Key** in the sidebar
2. Paste your API key (`sk-...`) and click **Save Key**
3. Click **New Chat**, optionally name the conversation and select a system prompt, then start writing

Your API key is stored server-side in `data/db.json` and is never exposed to the browser. All API calls are proxied through the server, so the key stays off the client.

## Project Structure

```
vibe-api/
├── index.html            HTML structure, sidebar, modals
├── style.css             Dark theme via CSS custom properties
├── app.js                All application logic
├── server.js             Node.js server (static files + REST API + DeepSeek proxy)
├── favicon.png           App icon
├── start-vibechat.bat    Windows launcher
├── data/
│   └── db.json           Server-side JSON database (conversations, messages, prompts, config)
├── prompt_cards/         System prompt markdown files organized into category subfolders
│   ├── story-writing/    Fiction genre prompts
│   └── generators/       Premise and world-building generators
└── README.md
```

## How It Works

The server provides a REST API and proxies requests to the DeepSeek API:

- `GET /api/config` — Server config (API key status, active model)
- `POST /api/config` — Save API key and/or model preference
- `GET|POST /api/conversations` — List or create conversations
- `PUT|DELETE /api/conversations/:id` — Update or delete a conversation
- `GET|POST /api/messages?conversationId=` — Get or create messages
- `PUT /api/messages/:id` — Update a message (edit content, toggle active state, set versioning)
- `GET|POST /api/user-prompts` — List or create/update user-created prompts
- `DELETE /api/user-prompts/:id` — Delete a user prompt
- `GET /api/prompts` — List factory prompts from `prompt_cards/`
- `GET /api/prompts/:category/:filename` — Get a specific factory prompt
- `POST /api/chat/completions` — Proxies to `api.deepseek.com/chat/completions` with your stored key

The data flow on each message:

1. Your message is saved to the server DB and rendered in the UI
2. Full conversation history is fetched from the server and sent through the proxy to DeepSeek
3. The response streams back as tokens, rendered in real time with markdown
4. On completion, the full response is saved to the server DB

## System Prompts

Factory prompts are loaded from `prompt_cards/` subfolders. Drop a `.md` file into any subfolder, restart the server, and it appears in the prompt selector. The first line of each file should be formatted as:

```markdown
# System Prompt: Your Display Name
```

The subfolder name becomes the category label. Files starting with `.` are ignored.

User-created prompts are stored in the server DB and can be created, edited, and deleted through the app UI.

## Models

DeepSeek V4 Pro (default) and V4 Flash. The selected model is stored per-conversation on the server.

## Data

All persistent data lives in `data/db.json`. This includes conversations, messages, user prompts, API key, and model preferences. The file is human-readable JSON.
