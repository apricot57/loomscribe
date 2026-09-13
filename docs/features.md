# Features Guide

LoomScribe provides specialized creative workspace capabilities tailored for drafting, exploring branching narratives, fine-tuning prompt behaviors, and profiling LLM inference.

---

## 🎛️ Dual-Slot Prompting & Inspector Panel

Loaded dynamically from `engine/schema.json`, the right Inspector panel provides interactive control over prompt composition:

* **Point of View**: Switch between *Close Third*, *Deep First*, and *Omniscient* perspective blocks.
* **Scene Intensity & Dialogue Style**: Fine-tune sensory tension (*Tender*, *Sensory*, *Charged*, *Raw*) and dialogue delivery (*Subtext-Heavy*, *Playful*, *Candid*, *Commanding*).
* **POV Focus Spotlight**: Direct narrative camera focus (*Balanced*, *POV Interiority*, *Partner Reaction*).
* **Pushback / Resistance**: Control character friction and reluctance along a graded 5-point spectrum.
* **Outline / Brainstorm Mode**: Shifts the engine from narrative prose into structured plot breakdown, beat outlining, and character trajectory exploration.
* **Premises & Ideas Mode**: Instructs the model to generate exactly six fully developed creative premises, each featuring a distinct tone and conflict axis.
* **Mutual Exclusivity & Bypassed Fields**: Outline Mode and Premises Mode are mutually exclusive. When an architectural mode is enabled, narrative controls display visual bypassed states to make prompt composition crystal clear.
* **Response Length Target**: Slider dynamically targeting word counts between 600 and 3,000 words.
* **Complication Generator**: Injects sudden obstacles, hesitation, or environmental distractions.
* **Suggest Next Choices**: Forces the model to append three narrative continuation choices at the end of each response.
* **Director's Note**: Per-turn steering instruction (e.g. `"Focus on the rain sound; build slow tension"`) injected with high recency into Slot 2.
* **Advanced Block Overrides**: Override specific system markdown blocks on a per-conversation basis.
* **Live Compiler Preview**: Inspect the fully resolved Slot 1 (System Prompt) and Slot 2 (Post-History) text before generation, with amber/green cache-busting indicator dots.

---

## 🌊 Ultra-Smooth Fluid Streaming & Concurrency

LoomScribe's streaming engine provides a polished, editorial reading experience powered by request-animation physics:

* **Background Streaming**: Switch between conversations freely while generations stream concurrently in the background. Generating threads display a live `⚡` indicator in the sidebar.
* **Adaptive EWMA Velocity Queue**: Employs an exponentially weighted moving average queue to track token arrival velocity, eliminating visual stutter and token burst jitter.
* **Natural Punctuation Cadence**: Injects organic micro-delays on sentence terminations (40ms for periods, exclamation points, question marks) and paragraph breaks (65ms) to mirror human reading rhythm.
* **Soft Word Entrance Reveals**: Trailing words smoothly fade into view (`.streaming-tail`) rather than snapping onto the screen.
* **Kinetic LERP Autoscroll**: Uses a spring-interpolated autoscroll loop (`scrollTop += diff * 0.2`) that tracks generation without fighting user scroll interaction.
* **Glowing Pulse Caret**: An accent-colored, pulsing caret guides reading during live generation.
* **Thought Process Collapsible**: DeepSeek reasoning, OpenRouter `delta.reasoning`, GLM thinking, and inline `<think>` tags stream into an interactive collapsible accordion that auto-scrolls during inference.
* **Per-Thread Cancellation**: Abort active streams independently at any time without corrupting the message tree.

---

## 📊 Live Telemetry & Inference Profiling

Real-time telemetry gives complete visibility into model responsiveness and economics:

* **TTFT (Time-To-First-Token)**: Real-time latency tracking in milliseconds from request send to the first emitted token.
* **Throughput Profiling**: Live generation speed displayed in tokens per second (`tok/s`).
* **Token Counts**: Real-time breakdown of prompt tokens, reasoning tokens, and completion tokens.
* **Dynamic Turn Cost**: Calculates exact generation cost in USD (e.g. `\$0.0008`) for OpenRouter and usage-reporting providers.

---

## 🌐 OpenRouter Ecosystem & Model Discovery

* **In-App Search**: Filter and search across 300+ models directly in **Settings → OpenRouter**.
* **Pricing Transparency**: Real-time prompt and completion pricing per million tokens ($/1M).
* **One-Click Pinning**: Pin frequently used models to the top-bar selector dropdown.
* **Reasoning Effort Configuration**: Tune reasoning effort (`disabled`, `minimal`, `low`, `medium`, `high`) and custom token budgets to prevent reasoning from consuming generation budgets.

---

## 🌿 Branching Version Trees & Navigation

LoomScribe preserves conversational timelines as a directed acyclic tree:

* **Inline User Edits**: Editing any earlier user prompt automatically deactivates descendant branches and spawns a new version lineage.
* **Response Retries**: Regenerating a bot response creates alternative sibling versions without duplicating prior prompt history.
* **Turn Navigation (`‹ X / Y ›`)**: Switch between alternative prompt edits and model completions at any turn.
* **Conversation Forking**: Fork a new independent thread starting from any specific assistant message.

---

## 📁 Preset Manager & Dropzone

* **Two-Column Editor**: Create and customize presets directly in the UI.
* **Drag-and-Drop Import**: Drop any `.json` preset file onto the manager dropzone for instant loading.
* **Exporting**: Download any preset as a standalone JSON file to share or back up.
* **Live Word Count**: Real-time word count calculation for system prompt bodies.

---

## 🧪 Model Evaluation & Benchmark Protocol

LoomScribe includes a full automated test harness for evaluating model performance:

* **CLI Runner (`scripts/eval-models.js`)**: Run standardized test suites against any OpenRouter model:
  * `--quick`: Fast sanity check (POV Close Third, Suggest Choices, Dialogue Styling).
  * `--creative`: Tone and prose quality benchmarks across scenario genres.
  * `--toggles`: Format and toggle adherence suite (POV, Choices, 6 Premises, Outline Mode, Complications).
  * `--thinking`: Probes reasoning token support and measures token cannibalization.
  * `--all`: Full benchmark battery.
* **Automated Heuristics**: Deterministic scoring of stylistic rules, perspective pronoun leaks, choice dividers, and premise structure.
* **Manual Protocol & Guidelines**: See [`MODEL_TESTING.md`](../MODEL_TESTING.md) for benchmark scorecards, batch results, and subjective review instructions.
