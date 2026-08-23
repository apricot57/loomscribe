# 🌌 LoomScribe

LoomScribe is a premium, highly specialized creative writing workspace and prompt engine. Built with native support for **OpenAI** and **DeepSeek** by default, plus seamless connectivity for any **custom OpenAI-compatible API providers** (such as Ollama, OpenRouter, Groq, vLLM, and LM Studio), it provides a dual-slot compiler architecture that maximizes API cache performance while putting granular writing controls (POV, scene intensity, dialogue style, character focus, pushback resistance, complications, outline sandbox mode, and premises generation mode) directly in your hands.

Built with a lightweight Node.js/Express backend and a responsive, zero-build vanilla HTML/CSS/JS frontend, LoomScribe serves as a distraction-free desktop environment for drafting, brainstorming, and editing interactive fiction.

---

## 🖼️ User Interface Preview

| Main Workspace & Prompt Controls | Interactive Preset Manager |
| :---: | :---: |
| ![Main Interface](screenshots/main_interface.png) | ![Preset Manager](screenshots/preset_manager.png) |

| Genre Scenario Picker | Custom Models & Endpoint Config |
| :---: | :---: |
| ![Preset Selection](screenshots/preset_selection_modal.png) | ![API Config](screenshots/api_config_modal.png) |

---

## ✨ Core Features

### 🧠 KV Cache Optimization & Dual-Slot Prompting
Modern LLMs utilize a key-value (KV) cache of the prefix prompt. To prevent cache-busting, LoomScribe compiles your prompt into two distinct slots:
*   **Slot 1 (System Prompt - Stable)**: Contains the foundational character, prose, tone, and formatting rules. This stays byte-for-byte identical across turns to maximize cache hits, reducing cost and latency.
*   **Slot 2 (Post-History - Dynamic)**: Injected *after* all chat history, immediately before the model generates. This holds dynamic turn-based instructions such as word count targets, complications, choice suggestions, and the Director's Note. Changes here never bust the cache.

### 🎛️ Dynamic Configuration Panel (Inspector Pane)
Loaded directly from a central JSON schema, the right pane provides a live suite of parameters:
*   **System-Slot Controls (Busts Cache - Amber Warning Dot)**:
    *   **Point of View**: Toggle between *Close Third*, *Deep First*, *Omniscient*, or *Off*.
    *   **Scene Intensity**: Select narrative pacing and emotional charge (*Tender*, *Sensory*, *Charged*, or *Raw*).
    *   **Dialogue Style**: Configure speech dynamics (*Silent / Subtext*, *Playful / Witty*, *Candid*, or *Commanding*).
    *   **POV Focus Spotlight**: Direct narrative camera focus (*Balanced*, *POV Interiority*, or *Partner Reactions*).
*   **Post-History Controls (Cache-Safe)**:
    *   **Response Length**: Slider target ranging from 600 to 3,000 words.
    *   **Context Window (Sliding Window)**: Configurable history depth (2–30 turns) for tight memory management.
    *   **Pushback / Resistance**: Slider (0–5) to control how characters resist or challenge user inputs.
    *   **Complication Generator**: Toggle unexpected narrative obstacles and plot shifts.
    *   **Suggest Next Choices**: Directs the engine to propose 3 distinct branching options at the conclusion of each generation.
    *   **Outline / Brainstorm Mode**: Temporarily converts generation into structural story synopses and outlines.
    *   **Premises & Ideas Mode**: Generates multi-option premise pitches and scene-starting openers.
    *   **Director's Note**: Per-turn directive injected right before completion for real-time guidance.

### 🔌 Multi-Provider Support & Dynamic Model Discovery
*   **Native OpenAI Integration**: Automatic model discovery via `/api/config/fetch-openai-models` with custom model pinning (`gpt-5.6`, `gpt-4o`, `o3-mini`, reasoning models).
*   **DeepSeek Integration**: Support for `deepseek-chat` (v3) and `deepseek-reasoner` (v4/R1) with live streaming thinking blocks and reasoning collapse.
*   **Custom OpenAI-Compatible Endpoints**: Connect to local and remote providers (Ollama, LM Studio, Groq, OpenRouter, vLLM) with custom headers, API key cloning, and individual parameter overrides.

### 🌳 Branching, Turn Versioning & In-Place Editing
*   **Turn-Level Version Navigation**: Cycle between alternate continuations and prompt branches with pagination controls.
*   **In-Place User & AI Message Editing**: Modify prompts or responses with full descendant tree preservation.
*   **Branch Deletion & Tree Pruning**: Cleanly remove entire alternative branches or specific messages.
*   **Conversation Forking**: Branch off an existing thread into a brand new conversation from any message turn.

### 🎨 Modular ES Frontend & Cyber Dark Theme
*   **Modular ES Component Architecture**: Decoupled domain components (`sidebar.js`, `chat.js`, `inspector.js`, `modals.js`, `toast.js`).
*   **Obsidian Cyberpunk Styling**: Unified glassmorphic styling, cyan-to-indigo spectrum gradients, responsive drawer menus, and custom scrollbars.
*   **Streaming Markdown Engine**: Sanitized live rendering via marked + DOMPurify with code block copying and LaTeX math support.

---

## 🚀 Quick Start

### Prerequisites
*   Node.js v20.0.0 or higher.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/SriviharReddy/loomscribe.git
   cd loomscribe
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Set up environment variables in `.env`:
   ```env
   PORT=3000
   OPENAI_API_KEY=your_openai_api_key_here
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   APP_PASSWORD=your_secure_password_here
   ```
4. Start the server:
   ```bash
   npm start
   ```
   Or on Windows:
   ```bash
   start-loomscribe.bat
   ```
5. Open your browser and navigate to `http://localhost:3000`.

---

## 🧪 Testing

Run the automated test suite covering endpoints, compiler, database serialization, and websocket streaming:

```bash
npm test
```

---

## 📂 Project Architecture

```
loomscribe/
├── data/                       # Local JSON database & server logs
│   ├── db.json
│   └── logs/
├── engine/                     # Prompt Engine compiler & blocks
│   ├── blocks/                 # Reusable prompt modules (.md)
│   ├── presets/                # Scenario configurations (.json)
│   ├── compiler.js             # Dual-slot compiler logic
│   ├── schema.json             # Engine parameters & UI schema
│   └── PRESET_CREATOR.md       # Preset creation guidelines
├── public/                     # Frontend client assets
│   ├── css/
│   │   └── style.css           # Glassmorphic cyber theme
│   ├── js/
│   │   ├── components/         # Modular UI components
│   │   │   ├── chat.js         # Chat feed & streaming interactions
│   │   │   ├── inspector.js    # Prompt engine inspector pane
│   │   │   ├── modals.js       # Settings, preset manager & dialogs
│   │   │   ├── sidebar.js      # Thread management & drawer navigation
│   │   │   └── toast.js        # Notification toasts
│   │   ├── api.js              # REST client endpoints
│   │   ├── auth.js             # Authentication helper
│   │   ├── markdown.js         # Streaming markdown & math parser
│   │   ├── socket.js           # WebSocket connection manager
│   │   └── state.js            # Reactive state management
│   ├── app.js                  # Application bootstrap
│   ├── index.html              # Main application markup
│   ├── login.html              # Authentication landing
│   ├── favicon.svg             # Brand vector icon
│   └── favicon.png
├── src/server/                 # Backend Node.js server
│   ├── endpoints/              # Express route modules
│   │   ├── config.js           # Settings & custom model management
│   │   ├── conversations.js    # Thread CRUD & fork routes
│   │   ├── engine.js           # Preset management & compile endpoints
│   │   └── messages.js         # Message & tree versioning endpoints
│   ├── services/
│   │   └── version-tree.js     # Message hierarchy & branch operations
│   ├── db.js                   # Atomic file DB with serialized queue
│   ├── logger.js               # Structured JSON logger
│   ├── utils.js                # Utilities & ID generation
│   └── websocket.js            # Streaming proxy for LLM endpoints
├── tests/                      # Automated test suite
│   ├── auth.test.js
│   ├── compiler.test.js
│   ├── config.test.js
│   ├── conversations.test.js
│   ├── db.test.js
│   ├── engine-endpoints.test.js
│   ├── fork.test.js
│   ├── messages.test.js
│   └── websocket.test.js
├── prompt-engine.md            # In-depth Prompt Engine technical guide
├── server.js                   # Express application entrypoint
└── package.json
```

---

## 📄 License
MIT License.
