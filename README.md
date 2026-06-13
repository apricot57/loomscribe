# 🌌 LoomScribe

A premium single-page chat interface for collaborative fiction writing with DeepSeek models. Vanilla HTML/CSS/JS — no build tools, no frameworks, no bundlers. Runs as a **desktop web app** (Node.js backend) or as a standalone **serverless Android APK**.

[![Download APK](https://img.shields.io/badge/Download-LoomScribe.apk-blue?style=for-the-badge&logo=android)](https://github.com/apricot57/vibe-api/releases/latest)
[![Android Branch](https://img.shields.io/badge/Branch-Android%20Port-green?style=for-the-badge&logo=git)](https://github.com/apricot57/vibe-api/tree/feature/android-serverless-port)

---

## 📱 Android APK

A fully standalone, serverless Android build is available — no Node.js, no server, nothing to install.

**[⬇ Download LoomScribe.apk from Releases](https://github.com/apricot57/vibe-api/releases/latest)**

- API key and all chat history stored on-device in IndexedDB
- Streams directly from DeepSeek — no proxy, no middleman
- Collapsible settings drawer for comfortable one-handed mobile use

See the [`feature/android-serverless-port`](https://github.com/apricot57/vibe-api/tree/feature/android-serverless-port) branch for the full Android implementation details.

---

## ✨ Features

### Core
- **Streaming responses** — Real-time token streaming with markdown rendering and collapsible reasoning blocks
- **Thinking mode** — Toggle DeepSeek chain-of-thought reasoning on or off per session
- **Model selection** — Switch between DeepSeek V4 Pro and V4 Flash
- **Multi-threaded background streaming** — Switch conversation threads while other responses generate concurrently in the background. Generating threads display a pulsing `⚡` in the sidebar and reconstruct their real-time streaming view smoothly when active.

### Writing Tools
- **System prompt profiles** — Curated factory prompts for fiction genres and world-building, plus user-created prompts editable in-app. See **[PROMPT_CARDS.md](PROMPT_CARDS.md)** for a full formatting and usage guide.
- **Message editing** — Inline edit any message (user or AI). Editing a user message triggers regeneration; editing an AI message saves the rewrite in-place
- **Version navigation** — Edited and regenerated messages are tracked as version groups with prev/next navigation controls
- **Regenerate** — Re-roll any AI response, creating a new version branch
- **Magic Rewrite** — Select text within an AI response and rewrite *just that section* via a floating instruction dialog
- **Continue** — One-click button to continue the last AI response without typing

### Management
- **Conversation management** — Create, rename, and delete conversations with persistent history
- **Export to Markdown** — Download any conversation as a `.md` file
- **Abort** — Stop generation mid-stream per conversation

---

## 🚀 Desktop Quick Start

Prerequisites: [Node.js](https://nodejs.org/) (any recent version).

```bash
node server.js
```

Open http://localhost:3000 in your browser.

On Windows, double-click `start-loomscribe.bat` — it starts the server, opens the browser, and shuts down when you press any key.

### First-time setup

1. Click **DeepSeek API Key** in the sidebar
2. Paste your `sk-...` key and click **Save Key**
3. Click **New Chat**, optionally select a system prompt, then start writing

Your API key is stored server-side in `data/db.json` and is never exposed to the browser. All DeepSeek API calls are proxied through the server.

---

## 🌿 Branches

| Branch | Description |
|---|---|
| [`main`](https://github.com/apricot57/vibe-api/tree/main) | Desktop app — Node.js backend, `data/db.json` persistence |
| [`feature/android-serverless-port`](https://github.com/apricot57/vibe-api/tree/feature/android-serverless-port) | Standalone Android APK — Capacitor + IndexedDB, zero backend |

---

## 📁 Project Structure

```
loomscribe/
├── public/                     Frontend (served by Node in desktop mode)
│   ├── index.html              App markup and modals
│   ├── app.js                  Frontend bootstrapper and initializer
│   ├── style.css               CSS entrypoint
│   ├── css/
│   │   ├── variables.css       Design tokens, dark theme, global reset
│   │   ├── layout.css          Sidebar drawer, header & footer frames, pulsing indicator
│   │   ├── messages.css        Chat bubbles, reasoning blocks, message actions
│   │   ├── input.css           Input form, model/prompt dropdowns, continue button
│   │   ├── modals.css          Dialog overlays (API key, prompts, deletion)
│   │   └── magic.css           Magic Rewrite floating wand and dialog
│   └── js/
│       ├── state.js            Shared client-side state and helpers
│       ├── api.js              REST API helpers and payload builders
│       ├── magic.js            Text selection, floating wand, inline rewrite logic
│       ├── ui.js               Barrel file re-exporting UI modules
│       └── ui/                 Modularized UI components
│           ├── chat.js         Chat rendering, streaming responses, version traversal, drafts
│           ├── sidebar.js      Conversation threads CRUD, list loading, background status
│           ├── input.js        Thinking mode toggles, model dropdown updates, key status
│           ├── modals.js       Settings modal, deletion confirmations, toasts
│           ├── prompts.js      Prompt select and prompt edit modals
│           └── helpers.js      Shared async utilities
│
├── server.js                   Node.js server entrypoint
├── start-loomscribe.bat        Windows one-click launcher
├── src/
│   └── server/
│       ├── db.js               Read/write helpers for data/db.json
│       ├── prompts.js          Factory prompt auto-discovery from prompt_cards/
│       ├── routes.js           Main router mounting modular endpoints
│       ├── utils.js            Shared server utility functions
│       ├── services/
│       │   └── version-tree.js Message tree deactivation and navigation logic
│       └── endpoints/          Modularized REST API endpoint handlers
│           ├── config.js       API key status, model configurations
│           ├── conversations.js Conversation CRUD endpoints
│           ├── messages.js     Messages and version navigation endpoints
│           ├── prompts-api.js  Factory prompt file loaders
│           ├── proxy.js        DeepSeek SSE streams proxy
│           └── user-prompts.js Custom user-saved prompts CRUD
│
├── data/
│   └── db.json                 Server-side JSON database
├── prompt_cards/               System prompt markdown files by category
│   └── generators/
└── README.md
```

---

## ⚙️ How It Works

The server provides a REST API and proxies requests to DeepSeek:

| Endpoint | Description |
|---|---|
| `GET/POST /api/config` | API key status, active model, thinking mode |
| `GET/POST /api/conversations` | List or create conversations |
| `PUT/DELETE /api/conversations/:id` | Update or delete a conversation |
| `GET/POST /api/messages` | Get or create messages (by `conversationId`) |
| `PUT /api/messages/:id` | Update content, active state, or versioning |
| `GET/POST /api/user-prompts` | List or upsert user-created prompts |
| `DELETE /api/user-prompts/:id` | Delete a user prompt |
| `GET /api/prompts` | List factory prompts from `prompt_cards/` |
| `GET /api/prompts/:category/:file` | Fetch a specific factory prompt's content |
| `POST /api/chat/completions` | Proxy to `api.deepseek.com` with stored API key |

**Data flow per message:**
1. Your message is saved to `db.json` and rendered in the UI
2. Full conversation history is sent through the proxy to DeepSeek
3. The response streams back as SSE tokens, rendered in real time with markdown
4. On completion, the full response is saved to `db.json`

---

## 📝 System Prompts

LoomScribe system storyteller profiles are driven by modular plain-text Markdown (.md) cards.

See the dedicated **[PROMPT_CARDS.md](PROMPT_CARDS.md)** guide to learn:
- How to structure category folders on Desktop.
- How to format cards with the `# System Prompt:` header rule.
- How to perform single file and bulk ZIP card imports on Android.
- Best practices for prompting narrative and tone anti-goals.

---

## 🤖 Models

- **DeepSeek V4 Pro** — Maximum reasoning and intelligence (default)
- **DeepSeek V4 Flash** — High-speed, efficient generation

Toggle **Thinking Mode** (chain-of-thought reasoning) on or off via the brain icon in the input area.

---

## 💾 Data

All persistent data lives in `data/db.json` — conversations, messages, user prompts, API key, and model preferences. Human-readable JSON, easy to back up or inspect.
