# 🌌 LoomScribe

A premium single-page chat interface for collaborative fiction writing with DeepSeek models. Vanilla HTML/CSS/JS on the frontend (no build tools, no frameworks, no bundlers) powered by a lightweight Node.js/Express backend. Runs as a **desktop web app** or as a standalone **serverless Android APK**.

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
- **Multi-threaded background streaming** — Switch conversation threads while other responses generate concurrently in the background. Generating threads show a pulsing `⚡` in the sidebar and reconstruct their streaming view smoothly when revisited

### Prompt Engine
- **Scenario presets** — Choose a narrative scenario preset when starting a new chat. Each preset configures writing style, POV, pacing, and sensory_detailed content defaults
- **Two-slot system prompt** — System instructions occupy two distinct context positions: a stable *System Prompt* slot (Slot 1) and a high-recency *Post-History* slot (Slot 2) injected after all chat history, immediately before generation
- **Conversation Settings panel** — Right-side pane with live controls for POV, pacing, prose style, sensory_detailed content, and internal monologue. Amber indicators flag system-slot changes that will bust the DeepSeek KV cache
- **Per-turn controls** — Response length slider and Director's Note textarea that can change freely every turn without affecting the prompt cache
- **Compiled prompt preview** — Inspect the exact Slot 1 and Slot 2 strings that will be sent to the model before each response
- **Advanced block overrides** — Toggle individual shared prompt blocks on or off for the current conversation
- **Drop-in preset authoring** — Add a new preset by dropping a single JSON file into `engine/presets/`. It appears in the picker immediately, no server restart needed. See **[PROMPT_ENGINE.md](PROMPT_ENGINE.md)**

### Writing Tools
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

Install dependencies:
```bash
npm install
```

Start the server:
```bash
node server.js
```

Open http://localhost:3000 in your browser.

On Windows, double-click `start-loomscribe.bat` — it starts the server, opens the browser, and shuts down when you press any key.

### First-time setup

1. Click **DeepSeek API Key** in the sidebar and paste your `sk-...` key
2. Click **New Chat** — the preset picker opens
3. Choose a scenario preset (or *None* for raw chat), enter a title, and start writing

Your API key is stored server-side in `data/db.json` and is never exposed to the browser. All DeepSeek API calls are proxied through the server.

---

## 🌿 Branches

| Branch | Description |
|---|---|
| [`main`](https://github.com/apricot57/vibe-api/tree/main) | Desktop app — Node.js backend, `data/db.json` persistence |
| [`feature/prompt-engine`](https://github.com/apricot57/vibe-api/tree/feature/prompt-engine) | Schema-driven prompt engine with preset picker, right settings pane, and two-slot compilation |
| [`feature/android-serverless-port`](https://github.com/apricot57/vibe-api/tree/feature/android-serverless-port) | Standalone Android APK — Capacitor + IndexedDB, zero backend |

---

## 📁 Project Structure

```
loomscribe/
├── engine/                     Prompt engine (runtime files, no build step)
│   ├── compiler.js             Compiles { systemPrompt, postHistory } from a preset + params
│   ├── schema.json             Parameter schema loaded by UI to auto-render controls
│   ├── PRESET_CREATOR.md       LLM authoring guide for writing new presets
│   ├── blocks/                 Shared, reusable prompt blocks
│   │   ├── index.json          Block registry (id, file, group, order)
│   │   ├── base_writer.md
│   │   ├── tone_register.md
│   │   ├── prose_grounded.md   (+ prose_intimate.md, prose_pulp.md)
│   │   ├── format_rules.md
│   │   ├── no_meta.md
│   │   ├── continuity.md
│   │   ├── sensory_detailed.md
│   │   ├── pov_third.md        (+ pov_first.md, pov_author.md)
│   │   ├── pacing_slow.md      (+ pacing_urgent.md)
│   │   └── internal_monologue.md
│   └── presets/                One JSON file per scenario (gitignored — add your own)
│       ├── general.json
│       └── *.json
│
├── public/                     Frontend (served by Node.js)
│   ├── index.html              App markup and modals
│   ├── app.js                  Frontend bootstrapper and initializer
│   ├── style.css               CSS entrypoint (imports css/ modules)
│   ├── css/
│   │   ├── variables.css       Design tokens, dark theme, global reset
│   │   ├── layout.css          Sidebar drawer, header & footer frames
│   │   ├── messages.css        Chat bubbles, reasoning blocks, message actions
│   │   ├── input.css           Input form, model dropdown, continue button
│   │   ├── modals.css          Dialog overlays (API key, delete confirmation)
│   │   ├── magic.css           Magic Rewrite floating wand and dialog
│   │   └── right-pane.css      Settings pane, preset picker, parameter controls
│   └── js/
│       ├── state.js            Shared reactive client state
│       ├── api.js              REST API helpers (engine, conversations, messages)
│       ├── magic.js            Text selection, floating wand, inline rewrite logic
│       ├── ui.js               Barrel file re-exporting UI modules
│       └── ui/
│           ├── chat.js         Chat rendering, streaming, version traversal, drafts
│           ├── sidebar.js      Conversation CRUD, new-chat flow, background status
│           ├── right-pane.js   Preset picker, Conversation Settings, preview panel
│           ├── input.js        Thinking mode toggles, model dropdown
│           ├── modals.js       Settings modal, delete confirmation, toasts
│           └── helpers.js      Shared async utilities
│
├── server.js                   Node.js server entrypoint
├── start-loomscribe.bat        Windows one-click launcher
├── src/
│   └── server/
│       ├── db.js               Read/write helpers for data/db.json
│       ├── routes.js           Main router mounting modular endpoints
│       ├── utils.js            Shared server utilities
│       ├── services/
│       │   └── version-tree.js Message tree deactivation and navigation logic
│       └── endpoints/
│           ├── config.js       API key status, model config
│           ├── conversations.js Conversation CRUD (stores engine fields)
│           ├── messages.js     Messages and version navigation
│           ├── engine.js       Prompt engine API (presets, schema, compile)
│           └── proxy.js        DeepSeek SSE proxy — calls compilePrompt() per send
│
├── data/
│   └── db.json                 Server-side JSON database
└── plans/                      Design documents
    └── prompt_engine_plan.md
```

---

## ⚙️ How It Works

### API endpoints

| Endpoint | Description |
|---|---|
| `GET/POST /api/config` | API key status, active model, thinking mode |
| `GET/POST /api/conversations` | List or create conversations |
| `PUT/DELETE /api/conversations/:id` | Update or delete a conversation |
| `GET/POST /api/messages` | Get or create messages (by `conversationId`) |
| `PUT /api/messages/:id` | Update content, active state, or versioning |
| `GET /api/engine/presets` | All presets grouped by category |
| `GET /api/engine/presets/:id` | Single preset definition |
| `GET /api/engine/schema` | Parameter schema (drives the Settings UI) |
| `POST /api/engine/compile` | Compile and return `{ systemPrompt, postHistory }` |
| `POST /api/chat/completions` | Proxy to `api.deepseek.com` with stored API key |

### Data flow per message

1. Your message is saved to `db.json` and rendered in the UI
2. The proxy reads the conversation's `presetId`, `params`, `blockOverrides`, and `directorNote` from `db.json`
3. `compilePrompt()` assembles **Slot 1** (system prompt) and **Slot 2** (post-history instruction)
4. The final message array is: `[Slot 1 system] → [chat history] → [Slot 2 system]`
5. This is forwarded to DeepSeek; the response streams back as SSE and is saved on completion

### DeepSeek KV cache

DeepSeek caches the key-value state of the system prompt prefix. A cache hit requires Slot 1 to be byte-for-byte identical to the previous call. Parameters in the **Conversation Settings** section (POV, pacing, prose style, sensory_detailed, internal monologue) all live in Slot 1 — changing them mid-conversation busts the cache. The amber dot indicator in the UI flags this. Parameters in the **Per Turn** section (`word_count`, Director's Note) live in Slot 2 and never affect the cache.

---

## 🎭 Prompt Engine

See **[PROMPT_ENGINE.md](PROMPT_ENGINE.md)** for the full authoring guide covering:

- The two-slot context model and what goes where
- How the compiler assembles a prompt from blocks + preset + params
- The parameter-to-block mapping rules
- How to write and drop in a new preset JSON file
- Using `PRESET_CREATOR.md` with an LLM to author presets quickly

---

## 🤖 Models

- **DeepSeek V4 Pro** — Maximum reasoning and intelligence (default)
- **DeepSeek V4 Flash** — High-speed, efficient generation

Toggle **Thinking Mode** (chain-of-thought reasoning) on or off via the brain icon in the input area.

---

## 💾 Data

All persistent data lives in `data/db.json` — conversations, messages, API key, model preferences, and per-conversation engine settings (`presetId`, `params`, `blockOverrides`, `directorNote`, `lastAppliedEngineSignature`). Human-readable JSON, easy to back up or inspect.

Preset files in `engine/presets/` are gitignored so your personal scenario library stays local.
