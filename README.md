# 🌌 LoomScribe

LoomScribe is a premium, highly specialized creative writing workspace designed specifically for DeepSeek models. It provides a dual-slot compiler architecture that maximizes API cache performance while putting granular writing controls (POV, sensory intensity, dialogue register, character pushback, complications, outline sandbox mode, and premises generation mode) directly in your hands.

Built with a lightweight Node.js/Express backend and a responsive, zero-build vanilla HTML/CSS/JS frontend, LoomScribe serves as a distraction-free desktop environment for drafting, brainstorming, and editing interactive fiction.

---

## ✨ Core Features

### 🧠 DeepSeek Optimization & Dual-Slot Prompting
DeepSeek models utilize a key-value (KV) cache of the prefix prompt. To prevent cache-busting, LoomScribe compiles your prompt into two distinct slots:
*   **Slot 1 (System Prompt - Stable)**: Contains the foundational character, prose, tone, and formatting rules. This stays byte-for-byte identical across turns to maximize cache hits, reducing cost and latency.
*   **Slot 2 (Post-History - Dynamic)**: Injected *after* all chat history, immediately before the model generates. This holds dynamic turn-based instructions such as word count targets, pushback, complications, premises-generation directives, and the Director's Note. Changes here never bust the cache.

### 🎛️ Dynamic Configuration Panel (Right Pane)
Loaded directly from a central JSON schema, the right pane provides a live suite of parameters:
*   **System-Slot Controls (Busts Cache - Amber Warning Dot)**:
    *   **Point of View**: Toggle between *Close Third*, *Deep First*, and *Omniscient* POV blocks.
    *   **Sensory Intensity**: Adjust from *Poetic*, *Tactile*, *Detailed*, to *Visceral* narrative tone and description level.
    *   **Dialogue Register**: Control dialogue styling (*Minimal*, *Playful*, *Candid*, *Commanding*).
    *   **POV Focus Spotlight**: Shift narrative focus between *Balanced*, *POV Interiority*, and *Partner Reaction*.
    *   **Outline / Brainstorm Mode**: Switch the model into planning mode instead of full prose.
    *   **Premises & Ideas Mode**: Switch the model into six-premise generation mode instead of prose.
*   **Post-History Controls (Cache Safe)**:
    *   **Response Length**: Slider targeting a word count between 600 and 3,000 words.
    *   **Pushback / Resistance**: Graded slider (1 to 5) controlling how cooperative the AI-controlled characters are (*Compliant*, *Realistic*, *Resistant*).
    *   **Complication Generator**: Toggle to introduce sudden external distractions, guilt, hesitations, or obstacles.
    *   **Director's Note**: Per-turn free text (e.g., `"Focus on the rain sound; build slow tension"`) appended at high recency.
*   **Advanced Block Overrides**: Manually override individual system-prompt markdown files inside your preset.
*   **Live Prompt Compiler Preview**: View compiled Slot 1 and Slot 2 prompt states in real-time.

### 📁 Interactive Preset Manager
A built-in preset manager interface allows you to create, edit, duplicate, delete, and import narrative presets directly.
*   **Two-Column Editor**: Modify system body prompts, metadata, categories, and parameter overrides.
*   **File Dropzone**: Drag and drop JSON preset files to import them instantly.
*   **Server CRUD Endpoints**: Fully backed by API routes for managing local presets on the fly.

### 📐 Outline & Brainstorm Mode
A dedicated toggle shifts LoomScribe from prose drafting into a planning sandbox. Enabling Outline Mode disables the prose-focused blocks, then injects directives that ask the model to expand on plot structure, scene beats, and character trajectories instead of writing finished chapters.

### 🧩 Premises & Ideas Mode
A separate toggle switches the engine into a six-premise brainstorming mode. When enabled, the compiler disables prose-focused blocks and appends a directive that asks the model to generate exactly six fully developed premises, each with a distinct tonal lane and a clear conflict axis. This is for ideation, not chapter writing.

### ⚡ Concurrency & Multi-Threaded Streaming
Switch between chat threads while other responses stream in the background. Generating threads show a pulsing `⚡` status dot in the sidebar and rebuild cleanly when revisited. Streaming now runs over WebSockets, which improves reconnects, background updates, and per-thread aborts.

### 🧷 Message Actions & Draft Recovery
Each message has quick actions for editing, regenerating, and copying raw content to the clipboard. User input drafts are preserved per conversation, so switching threads or refreshing the app does not wipe your draft.

### 🌿 Version Navigation & Sibling Trees
LoomScribe tracks conversation history as a branching version tree. Inline editing of any user message branches a new lineage, and prev/next controls let you move between alternative timelines, drafts, and regenerations.

### 📊 Structured JSON Logging
A server-side logger format writes HTTP requests, WebSocket connection updates, and prompt compilation details as structured JSON events. This standardizes local application logging and eases troubleshooting.

---

## 🚀 Desktop Quick Start

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (LoomScribe works on any recent LTS version).

### 1. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 2. Configuration
Copy the template environment file:
```bash
cp .env.example .env
```
Open `.env` and configure your settings:
*   `PORT`: Port to host the app (defaults to `3000`).
*   `DEEPSEEK_API_KEY`: Set your `sk-...` API key here. (Alternatively, configure it securely in the UI sidebar settings).

### 3. Running LoomScribe
Run the development command:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

**On Windows:** Simply double-click `start-loomscribe.bat`. It will start the server, open the browser automatically, and cleanly shut down the background processes when you press any key in the console window.

---

## 📁 Project Structure

```
loomscribe/
├── data/
│   └── db.json                 # Server-side JSON database (settings, chats, messages)
├── engine/
│   ├── blocks/                 # Reusable Markdown prompt blocks
│   │   ├── index.json          # Block registry (id, file, group, order)
│   │   ├── base_writer.md      # Core AI identity
│   │   ├── tone_register.md    # Baseline prose standards
│   │   ├── format_rules.md     # Layout, markdown formatting, paragraph structures
│   │   ├── no_meta.md          # Avoid disclaimers, notes, and AI warnings
│   │   ├── continuity.md       # Adhere to story state
│   │   ├── premises_mode.md    # Instructions for six-premise generation
│   │   ├── pov_*.md            # Point-of-view definitions (first, third, author)
│   │   ├── focus_*.md          # POV spotlight controls (self, partner, balanced)
│   │   ├── sensory_*.md        # Sensory intensity levels (poetic, tactile, detailed, visceral)
│   │   └── dialogue_*.md       # Dialogue speech registers (minimal, playful, candid, commanding)
│   ├── presets/                # Preset JSON files (defining categories & defaults)
│   ├── compiler.js             # Resolves schema parameters and compiles dual-slot output
│   ├── schema.json             # Parameter definitions loaded by the UI to render inputs
├── public/                     # Zero-build frontend files
│   ├── css/                    # Modular stylesheet components (layout, chat, sidebar, right-pane)
│   ├── js/                     # Domain modules (api, ui, chat, version-tree, preset-manager)
│   ├── index.html              # Main application entry point
├── src/server/                 # Express backend source code
│   ├── endpoints/              # Modular REST endpoint routes (conversations, config, presets)
│   └── routes.js               # API router integration
└── server.js                   # Application main runner file
```

---

## 🎨 Dual-Slot Compiler Detail

When compiling a turn's prompt, `engine/compiler.js` automatically groups instructions to maximize caching:

1.  **Block Selection**: The compiler selects the appropriate POV, sensory intensity, dialogue register, and focus spotlight blocks based on settings.
2.  **Concat Slot 1**: Integrates the stable preset body and foundational blocks.
3.  **Concat Slot 2**: Integrates the dynamic length targets, character pushback settings, complications, and the user's Director's Note.

### Cache-Busting UI Indicators
*   **Amber dot next to settings**: Indicates that changing this slider/select controls Slot 1 blocks and **will invalidate** the KV cache on the next token request.
*   **Green/Safe controls**: Per-turn parameters and Director's Notes belong in Slot 2. They can change every turn without busting the KV cache.

---

## 🎭 Creating New Presets

A preset is a single JSON file dropped in `engine/presets/`. It will load into the preset picker automatically.

See [PROMPT_ENGINE.md](PROMPT_ENGINE.md) for instructions on creating new presets. You can use the provided [PRESET_CREATOR.md](engine/PRESET_CREATOR.md) prompt with any LLM to automatically generate a preset for any scenario.

Use `outline_mode` for brainstorming/plotting presets and `premises_mode` for presets that should generate exactly six fully developed premises instead of chapter prose.

---

## 📖 Related Documentation

*   **[PROMPT_ENGINE.md](PROMPT_ENGINE.md)**: Deep dive into the prompt compiler, block registry, and custom presets mapping.