# 🌌 LoomScribe

LoomScribe is a premium, highly specialized creative writing workspace designed specifically for DeepSeek models. It provides a dual-slot compiler architecture that maximizes API cache performance while putting granular writing controls (POV, sensory intensity, dialogue register, partner pushback, complications, and outline sandbox mode) directly in your hands. 

Built with a lightweight Node.js/Express backend and a responsive, zero-build vanilla HTML/CSS/JS frontend, LoomScribe serves as a distraction-free desktop environment for drafting, brainstorming, and editing interactive fiction.

---

## ✨ Core Features

### 🧠 DeepSeek Optimization & Dual-Slot Prompting
DeepSeek models utilize a key-value (KV) cache of the prefix prompt. To prevent cache-busting, LoomScribe compiles your prompt into two distinct slots:
*   **Slot 1 (System Prompt - Stable)**: Contains the foundational character, prose, tone, and formatting rules. This stays byte-for-byte identical across turns to maximize cache hits, reducing cost and latency.
*   **Slot 2 (Post-History - Dynamic)**: Injected *after* all chat history, immediately before the model generates. This holds dynamic turn-based instructions (e.g., word count targets, pushback, complications, and the Director's Note). Changes here never bust the cache.

### 🎛️ Dynamic Configuration Panel (Right Pane)
Loaded directly from a central JSON schema, the right pane provides a live suite of parameters:
*   **System-Slot Controls (Busts Cache - Amber Warning Dot)**:
    *   **Point of View**: Toggle between *Close Third*, *Deep First*, and *Omniscient* POV blocks.
    *   **Sensory Intensity**: Adjust from *Romantic*, *Sensual*, *Explicit*, to *Hardcore* narrative tone.
    *   **Dialogue Register**: Control dialogue styling (*Minimal Dialogue / Silent*, *Playful Banter / Subtext*, *Candid / Direct*, *Power / Command*).
    *   **POV Focus Spotlight**: Shift narrative focus between *Balanced*, *POV Interiority*, and *Partner Reaction*.
*   **Post-History Controls (Cache Safe)**:
    *   **Response Length**: Slider targeting a word count between 600 and 3,000 words.
    *   **Pushback / Resistance**: Graded slider (1 to 5) controlling how cooperative the AI-controlled characters are (*Compliant*, *Realistic*, *Resistant*).
    *   **Complication Generator**: Toggle to introduce sudden external distractions, guilt, hesitations, or obstacles.
    *   **Director's Note**: Per-turn free text (e.g., `"Focus on the rain sound; build slow tension"`) appended at high recency.
*   **Advanced Block Overrides**: Manually override individual system-prompt markdown files inside your preset.
*   **Live Prompt Compiler Preview**: View compiled Slot 1 and Slot 2 prompt states in real-time.

### 📐 Outline & Brainstorm Mode
A dedicated toggle shifts LoomScribe from a prose drafting interface into a plotting sandbox. Enabling Outline Mode disables all prose, dialogue, and POV-focus blocks, injecting a custom planning directive that instructs the model to expand on plot structures, scene outline beats, and character trajectories instead of generating chapters.

### ⚡ Concurrency & Multi-Threaded Streaming
Switch between chat threads while other responses stream in the background. Generating threads show a pulsing `⚡` status dot in the sidebar and reconstruct their streaming views smoothly when revisited. Supports active stream abortion per thread.

### 🌿 Version Navigation & Sibling Trees
LoomScribe tracks conversation history as a branching version tree. Inline editing of any user message branches a new lineage. Travel back and forth between alternative timelines, drafts, and regenerations using intuitive prev/next traversal buttons on any edited turn.

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
loomscribe-prompt-engine/
├── data/
│   └── db.json                 # Server-side JSON database (settings, chats, messages)
├── engine/
│   ├── blocks/                 # Reusable Markdown prompt blocks
│   │   ├── index.json          # Block registry (id, file, group, order)
│   │   ├── base_writer.md      # Core AI identity
│   │   ├── tone_register.md    # Baseline prose standards
│   │   ├── format_rules.md     # Layout constraints (no emojis, etc.)
│   │   ├── no_meta.md          # Blocks out-of-character comments
│   │   ├── continuity.md       # Memory retention guidelines
│   │   ├── outline_mode.md     # Instructions for the brainstorming sandbox
│   │   ├── pov_*.md            # Point-of-view definitions (first, third, author)
│   │   ├── focus_*.md          # POV spotlight controls (self, partner, balanced)
│   │   ├── sensory_*.md         # Sensory intensity levels (romantic, sensual, sensory_detailed, hardcore)
│   │   └── dialogue_register_*.md     # Dialogue speech registers
│   ├── presets/                # Preset JSON files (defining categories & defaults)
│   ├── compiler.js             # Resolves schema parameters and compiles dual-slot output
│   ├── schema.json             # Parameter definitions loaded by the UI to render inputs
│   └── PRESET_CREATOR.md       # LLM prompt to generate new preset JSON structures
├── plans/                      # Architectural designs and roadmap
│   ├── DEFERRED_REFACTOR_PLAN.md
│   ├── FUTURE_ROADMAP.md       # Roadmap for Continuity Scaffolds and World Info
│   └── prompt_engine_plan.md
├── public/                     # Vanilla HTML/CSS/JS frontend
│   ├── css/                    # Modular theme and layout designs
│   │   ├── variables.css       # Neon dark theme tokens
│   │   ├── layout.css          # Core workspace 3-pane structure
│   │   ├── messages.css        # Chat bubbles and version trees
│   │   ├── input.css           # Model and text input areas
│   │   ├── modals.css          # Pop-up overlays (API key, presets, delete)
│   │   └── right-pane.css      # Live compiler panels and settings
│   ├── js/                     # Client application logic
│   │   ├── ui/                 # Component layout handlers
│   │   │   ├── chat.js         # Streaming, markdown, and tree traversal
│   │   │   ├── sidebar.js      # Chat list navigation and CRUD
│   │   │   ├── right-pane.js   # Parameter bindings & compiler preview
│   │   │   ├── input.js        # Model list, thinking state, & continue
│   │   │   ├── modals.js       # Popup overlays & notifications
│   │   │   └── helpers.js      # Timing and layout utilities
│   │   ├── api.js              # Fetch requests to backend routes
│   │   ├── state.js            # Reactive global client store
│   │   └── ui.js               # Frontend router and UI barrel file
│   ├── app.js                  # App initializer
│   ├── favicon.png
│   ├── index.html              # Main page template
│   └── style.css               # Stylesheet imports
├── src/                        # Node.js Express server
│   └── server/
│       ├── endpoints/          # Route controller layers
│       │   ├── config.js       # App configuration (API Key checks)
│       │   ├── conversations.js # Chat thread configurations
│       │   ├── messages.js     # Message logs and version mappings
│       │   ├── engine.js       # Presets, schema, and preview compiler
│       │   └── proxy.js        # SSE streaming proxy to DeepSeek API
│       ├── services/
│       │   └── version-tree.js # Prev/next branch traversal service
│       ├── db.js               # JSON DB read/write routines
│       ├── routes.js           # Express API router registration
│       └── utils.js            # Node utilities
├── server.js                   # Application entry point
└── start-loomscribe.bat        # Windows automation script
```

---

## ⚙️ Compilation & DeepSeek KV Cache Flow

When you send a message, the server processes the payload as follows:

```
[UI Settings State] ──> [compilePrompt()]
                           │
                           ├──> Compile Slot 1 (System Prompt)
                           │    [Registry Blocks] + [Preset System Body]
                           │
                           └──> Compile Slot 2 (Post-History)
                                [Preset Post-History Body] + [Outline/WordCount/Pushback/Complications] + [Director's Note]
```

### Prompt Assembly Order
The payload sent upstream to DeepSeek is reconstructed in this sequence:
1.  **Slot 1 (System Message)**: Foundation prompt block. *Must remain identical to reuse the KV Cache.*
2.  **Conversation History**: Alternating user and assistant messages.
3.  **Slot 2 (System Message)**: Word count targets, complication generation, pushback directives, and per-turn Director's Notes. *Highest recency.*

### Cache-Busting UI Indicators
*   **Amber dot next to settings**: Indicates that changing this slider/select controls Slot 1 blocks and **will invalidate** the KV cache on the next token request.
*   **Green/Safe controls**: Per-turn parameters and Director's Notes belong in Slot 2. They can change every turn without busting the KV cache.

---

## 🎭 Creating New Presets

A preset is a single JSON file dropped in `engine/presets/`. It will load into the preset picker automatically.

See [PROMPT_ENGINE.md](PROMPT_ENGINE.md) for instructions on creating new presets. You can use the provided [PRESET_CREATOR.md](engine/PRESET_CREATOR.md) prompt with any LLM to automatically generate a preset for any scenario.

---

## 📖 Related Documentation

*   **[PROMPT_ENGINE.md](PROMPT_ENGINE.md)**: Deep dive into the prompt compiler, block registry, and custom presets mapping.
*   **[plans/FUTURE_ROADMAP.md](plans/FUTURE_ROADMAP.md)**: Outline for planned Phase 1-3 features, including Story Continuity Scaffolds ( rolling summaries, pinned facts, character dossiers) and World Info context databases.
*   **[plans/DEFERRED_REFACTOR_PLAN.md](plans/DEFERRED_REFACTOR_PLAN.md)**: Details on the Express/Node server migration and modular UI structure.
