# Architecture & Engine Design

LoomScribe is built on a high-throughput, low-latency client-server architecture designed for zero-build desktop responsiveness and real-time LLM inference control.

---

## 🏛️ High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Frontend                        │
│   Vanilla ES Modules + Modern Cyberpunk/Pastel Theme Tokens │
├──────────────────────────────┬──────────────────────────────┤
│  State Store (state.js)      │  Streaming Engine (fluid RAF)│
│  UI Controllers (chat, etc.) │  Inspector & Preset Manager  │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │ HTTP REST (CRUD)             │ WebSocket (Full-Duplex)
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express & WS Server                       │
├──────────────────────────────┬──────────────────────────────┤
│  Route Endpoints (routes.js) │  WebSocket Hub (websocket.js)│
│  Version Tree Engine         │  Provider Router (Multi-LLM) │
│  Atomic DB Queue (db.js)     │  Stream Manager & Telemetry  │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
               ▼                              ▼
      Local JSON Store               Upstream AI Providers
      (data/db.json)              (OpenAI, GLM, DeepSeek, OpenRouter)
```

---

## 📁 Repository Structure

```
loomscribe/
├── data/
│   ├── db.json                 # JSON database (settings, chats, messages)
│   └── logs/
│       └── server.log          # Structured application logs
├── engine/
│   ├── blocks/                 # Reusable Markdown prompt blocks
│   │   ├── index.json          # Block registry (id, file, group, order)
│   │   ├── base_writer.md      # Core AI identity
│   │   ├── tone_register.md    # Baseline prose standards
│   │   ├── format_rules.md     # Layout constraints (no emojis, etc.)
│   │   ├── outline_mode.md     # Instructions for the brainstorming sandbox
│   │   ├── premises_mode.md    # Instructions for six-premise generation
│   │   ├── pov_*.md            # Point-of-view definitions (first, third, author)
│   │   ├── intensity_*.md      # Scene intensity styles (tender, sensory, charged, raw)
│   │   ├── dialogue_*.md       # Dialogue registers (silent, playful, candid, commanding)
│   │   └── focus_*.md          # POV focus spotlights (balanced, self, partner)
│   ├── presets/                # Preset JSON files (defining categories & defaults)
│   ├── compiler.js             # Resolves schema parameters and compiles dual-slot output
│   ├── schema.json             # Parameter definitions loaded by the UI to render inputs
│   └── PRESET_CREATOR.md       # LLM prompt to generate new preset JSON structures
├── public/                     # Vanilla HTML/CSS/JS frontend
│   ├── css/
│   │   ├── style.css           # Workspace stylesheet entry point (@import modules)
│   │   ├── login.css           # Standalone authentication page styling
│   │   └── modules/            # Modular CSS partials
│   │       ├── variables.css   # Global design tokens, typography, radii, shadows
│   │       ├── themes.css      # Accent themes (cyan, teal, purple, amber, slate)
│   │       ├── base.css        # CSS reset, base typography & scrollbars
│   │       ├── layout.css      # App root layout and backdrop
│   │       ├── sidebar.css     # Navigation sidebar & conversation lists
│   │       ├── chat.css        # Main chat viewport & model selector
│   │       ├── messages.css    # Message items, reasoning disclosures & versions
│   │       ├── input.css       # Chat input dock & textarea controls
│   │       ├── inspector.css   # Prompt engine inspector pane & sliders
│   │       ├── modals.css      # Modal dialogs, form styles & toasts
│   │       └── responsive.css  # Mobile drawers & touch breakpoints
│   ├── js/                     # Client application logic
│   │   ├── components/         # Modular UI component controllers
│   │   │   ├── chat.js         # Chat feed controller, prompt dispatch & header controls
│   │   │   ├── messages.js     # Message feed coordinator & facade
│   │   │   ├── messages/       # Modular message subsystems
│   │   │   │   ├── message-versions.js  # Turn versioning & branch navigation
│   │   │   │   ├── user-message.js      # User message DOM & inline editing
│   │   │   │   ├── assistant-message.js # Assistant DOM, reasoning & inline editing
│   │   │   │   └── empty-feed.js        # Empty state view & starter cards
│   │   │   ├── streaming.js    # WebSocket token streaming & reasoning node lifecycle
│   │   │   ├── inspector.js    # Parameter sliders, block overrides & live compiler preview
│   │   │   ├── sidebar.js      # Conversation list navigation & CRUD
│   │   │   ├── modals.js       # Modal aggregator & orchestrator
│   │   │   ├── settings-modal.js # Settings modal coordinator & facade
│   │   │   ├── settings/       # Modular settings subsystems
│   │   │   │   ├── settings-theme.js          # Theme selection & appearance
│   │   │   │   ├── settings-sliding-window.js # Sliding context window controls
│   │   │   │   ├── settings-providers.js      # Providers keys, discovery & pinning
│   │   │   │   ├── settings-openrouter.js     # OpenRouter models search, pricing & pinning
│   │   │   │   └── settings-custom-models.js  # Custom models CRUD & list rendering
│   │   │   ├── preset-picker.js  # Preset picker & category grid
│   │   │   ├── preset-manager.js # Preset CRUD, JSON import/export & live editor
│   │   │   ├── delete-modal.js   # Deletion confirmation dialogs
│   │   │   └── toast.js        # Floating notifications
│   │   ├── api.js              # Fetch requests to backend REST routes
│   │   ├── auth.js             # Client-side bearer token management & login guards
│   │   ├── markdown.js         # Markdown rendering & escaping helpers
│   │   ├── socket.js           # WebSocket connection manager & event dispatcher
│   │   └── state.js            # Reactive global client store
│   ├── app.js                  # App initializer & lifecycle coordinator
│   ├── index.html              # Main application interface
│   ├── login.html              # Dedicated password sign-in interface
│   └── vendor/                 # Local vendored client libraries (Marked, DOMPurify)
├── scripts/                    # Automated model evaluation & benchmark harness
│   ├── eval-models.js          # CLI benchmark runner
│   └── eval/                   # Test scenarios, heuristics & execution engine
│       ├── eval-heuristics.js  # Deterministic adherence & style scoring regexes
│       ├── eval-runner.js      # Upstream streaming, metrics calculation & report generator
│       └── eval-scenarios.js   # Standard scenario prompts (quick, creative, toggles, thinking)
├── src/                        # Node.js Express server
│   └── server/
│       ├── endpoints/          # Route controller layers
│       │   ├── auth.js         # Session token verification & login endpoints
│       │   ├── config.js       # App configuration, provider models & OpenRouter routes
│       │   ├── conversations.js # Chat thread CRUD & conversation forking
│       │   ├── messages.js     # Message versioning, branch navigation & CRUD
│       │   └── engine.js       # Presets, schema, and live compile preview
│       ├── services/
│       │   └── version-tree.js # Branch traversal and subtree deactivation service
│       ├── websocket/          # Modular WebSocket streaming engines
│       │   ├── provider-router.js # Provider resolution, API keys & URL normalization
│       │   ├── prompt-builder.js  # Dual-slot prompt compilation & sliding window
│       │   ├── stream-handler.js  # Upstream fetch, SSE decoding & TTFT measurement
│       │   └── stream-manager.js  # Active streams, message persistence & socket dispatch
│       ├── db.js               # JSON DB read/write routines
│       ├── logger.js           # Structured JSON logging library
│       ├── routes.js           # Express API router registration
│       ├── utils.js            # Node utilities (ID generation, etc.)
│       └── websocket.js        # WebSocket coordinator & server lifecycle
├── tests/                      # Automated test suite (node:test)
├── server.js                   # Application entry point
├── MODEL_TESTING.md            # Benchmark manual, testing instructions & model scorecards
└── start-loomscribe.bat        # Windows one-click startup script
```

---

## 🔀 Multi-Provider Routing Layer (`provider-router.js`)

LoomScribe abstracts differences across LLM inference backends behind a unified routing layer:

1. **Resolution Hierarchy**:
   * **Custom Endpoints**: Explicitly configured endpoints in `db.settings.customModels` match first.
   * **OpenAI**: Matches configured models, pinned models, or prefix patterns (`gpt-*`, `o1-*`, `o3-*`, `o4-*`, `chatgpt-*`).
   * **GLM (Z.AI)**: Matches GLM model lists, pinned GLM models, or `glm-*` prefixes.
   * **OpenRouter**: Matches pinned OpenRouter models or vendor/model identifier patterns (e.g. `meta-llama/*`, `anthropic/*`, `google/*`).
   * **DeepSeek**: Default fallback for standard chat models (`deepseek-chat`, `deepseek-reasoner`).

2. **Endpoint Normalization**:
   * Endpoints are safely parsed via `new URL()`. If `/chat/completions` is omitted, it is appended while strictly preserving existing query parameters or sub-paths.

3. **Protocol & Parameter Adapters**:
   * **OpenAI o-series**: `temperature` is automatically omitted (OpenAI returns HTTP 400 if temperature is passed for reasoning models). `reasoning_effort` is mapped to `low`, `medium`, or `high`.
   * **GLM / Z.AI**: When thinking is active, passes `reasoning_effort` and `{ thinking: { type: 'enabled', clear_thinking: false } }`. When disabled, explicitly passes `{ thinking: { type: 'disabled' } }`.
   * **OpenRouter**: Translates reasoning settings into `{ reasoning: { effort } }` and sets `include_reasoning: true` while forwarding `stream_options: { include_usage: true }` for exact cost tracking.
   * **DeepSeek**: Translates thinking mode toggle into `{ thinking: { type: 'enabled' | 'disabled' } }`.

---

## 🌊 Streaming Architecture & Fluid Animation Pipeline

LoomScribe delivers an ultra-smooth, responsive reader experience through coordinated server and client processing stages:

```
[Upstream SSE Stream]
        │
        ▼ (SSE decoding, TTFT tracking, inline <think> tag separation)
[StreamHandler (server)]
        │
        ▼ (TCP packet coalescing & backpressure check)
[WebSocket Dispatch]
        │
        ▼ (Raw token arrival)
[Streaming Engine (client)]
        │
        ├──> [Adaptive EWMA Velocity Queue] ──> Calculates character display speed
        │
        ├──> [Punctuation Cadence Pauser]  ──> 40ms on '.?!', 65ms on '\n\n'
        │
        ├──> [Markdown Stabilizer]         ──> Closes unclosed ``` fences and backticks
        │
        ├──> [Soft Word Entrance Reveal]   ──> Wraps trailing word in .streaming-tail
        │
        └──> [Kinetic LERP Autoscroll]     ──> Spring interpolation (scrollTop += diff * 0.2)
```

1. **Server Stream Decoding (`stream-handler.js`)**:
   * Measures `ttftMs` (Time-To-First-Token) upon receiving the very first chunk.
   * Transparently demultiplexes reasoning tokens (`choice.delta.reasoning`, `reasoning_content`, or inline `<think>` tags) from standard story prose.
   * Gathers token usage and generation cost from upstream completion payloads.

2. **Client Velocity & Pacing (`streaming.js`)**:
   * **EWMA Rolling Velocity**: Tracks arrival frequency via `rollingArrivalRate` to smoothly scale character progression across fast and slow networks.
   * **Punctuation Cadence**: Detects natural sentence and paragraph boundaries, temporarily halting consumption for 40–65ms to mirror natural reading cadence.
   * **Markdown Stabilization**: Analyzes streaming chunks for unclosed code fences or backticks and temporarily closes them to avoid layout breaks during generation.
   * **Kinetic Autoscroll**: Uses a lightweight LERP loop running on `requestAnimationFrame` to follow text without jumping or overriding user scroll interactions.
