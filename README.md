# 🌌 LoomScribe

**LoomScribe** is a creative writing workspace and dual-slot prompt engine. Designed for novelists, storytellers, and interactive fiction authors, LoomScribe pairs deep prose customization with prefix KV cache optimization.

Connect to **OpenAI**, **DeepSeek**, **OpenRouter**, **GLM / Z.AI**, or any local/custom endpoint (**Ollama**, **LM Studio**, **Groq**, **vLLM**) with real-time streaming, branching version trees, live parameter control, and token-cost profiling.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
git clone https://github.com/SriviharReddy/loomscribe.git
cd loomscribe
npm install
```

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
```
*(API keys and custom models can also be configured directly in the in-app Settings modal)*

### 3. Run
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

> **Windows Users:** Double-click `start-loomscribe.bat` for one-click startup and browser launch.

---

## ✨ Highlights

* **🧠 Dual-Slot Prompt Compiler**: Separates stable foundation rules (Slot 1) from dynamic turn-based instructions (Slot 2) to maximize LLM prefix KV cache hits.
* **🔌 Comprehensive Provider Ecosystem**: Native OpenAI, DeepSeek, OpenRouter (with real-time catalog search, pricing transparency, and custom reasoning effort), and GLM / Z.AI (with multi-level thinking control), plus arbitrary OpenAI-compatible custom endpoints.
* **🌊 Ultra-Smooth Fluid Streaming**: Fluid `requestAnimationFrame` token interpolator, adaptive EWMA velocity queue, natural punctuation cadence pauses, soft word entrance reveals, kinetic LERP autoscroll, and a glowing pulse caret.
* **📊 Real-Time Telemetry & Profiling**: Live Time-To-First-Token (TTFT), tokens/sec throughput, token usage counts, and dynamic per-turn generation cost estimation in the chat header.
* **🌿 Branching Version Trees**: Edit previous prompts, retry responses, and navigate alternative timelines (`‹ X / Y ›`) without losing history.
* **⚡ Multi-Threaded Background Streaming**: Background WebSocket streaming allows switching between conversations while responses generate concurrently.
* **🎛️ Dynamic Inspector Panel**: Live sliders and toggles for POV, scene intensity, dialogue style, mutually exclusive outline/brainstorming sandbox mode and six-premise generation, and Director's Notes.
* **📁 Preset Manager & Dropzone**: Visual two-column editor with drag-and-drop `.json` import/export for narrative scenarios.
* **🧪 Model Evaluation & Benchmarking Suite**: Automated CLI harness (`scripts/eval-models.js`) to benchmark toggle adherence, reasoning token cannibalization, and prose quality across models.

---

## 📚 Documentation

Detailed guides, protocols, and architecture references are available in the repository:

| Guide | Description |
|---|---|
| **[Architecture & Engine Design](docs/architecture.md)** | Dual-slot compiler, KV cache optimization, streaming pipeline, and codebase structure. |
| **[Features Guide](docs/features.md)** | Inspector panel, branching version trees, fluid streaming, telemetry, and OpenRouter integration. |
| **[Configuration & Providers](docs/configuration.md)** | Environment variables, OpenAI/GLM/OpenRouter keys, reasoning settings, and custom endpoints. |
| **[Model Evaluation & Benchmark Protocol](MODEL_TESTING.md)** | Automated testing harness, evaluation heuristics, adherence benchmarks, and model scorecards. |
| **[Presets & Prompt Blocks](docs/presets.md)** | Scenario presets, schema definitions, and automated preset creation. |
| **[Prompt Engine Technical Deep Dive](prompt-engine.md)** | Block registry ordering, placeholder resolution, adherence stabilization, and compiler mechanics. |

---

## 🧪 Testing

Run the automated test suite:
```bash
npm test
```
