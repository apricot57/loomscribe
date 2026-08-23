# LoomScribe Prompt Engine Architecture

The LoomScribe Prompt Engine is a dual-slot compiler architecture designed to optimize prompt adherence and instruction execution for modern LLMs while maximizing API Key-Value (KV) prefix cache reuse.

---

## 1. Dual-Slot Architecture & KV Cache Optimization

Modern LLMs cache prompt prefixes to save cost and latency. If the prompt prefix remains identical byte-for-byte, it hits the KV cache. To prevent configuration modifications from busting this cache on every turn, the LoomScribe compiler splits instructions into two separate zones:

```
[System Core (Slot 1)] ──> [Chat Message History (Sliding Window)] ──> [Turn Instructions (Slot 2)]
```

### 1. Slot 1: Stable System Prompt
* **Location**: Sent upstream as the initial `system` role message.
* **Content**: Foundational character identities, baseline writing styles, formatting constraints, point-of-view definitions, scene intensity, dialogue style, and POV focus.
* **KV Cache Impact**: **Busts cache if modified.** When you change a Slot 1 parameter (like Point of View or Scene Intensity) mid-chat, LoomScribe triggers an amber warning dot in the settings panel to notify you that the next response will invalidate the KV cache.

### 2. Slot 2: Safe Post-History Instructions
* **Location**: Attached ephemerally to the end of the conversation history.
* **Content**: Response length targets, context sliding window, pushback/resistance levels, complication triggers, choice suggestions, and your custom **Director's Note**.
* **KV Cache Impact**: **Cache-safe.** Since Slot 2 instructions are appended *after* the chat history, they reside at the very end of the prompt payload. You can modify these settings or write new Director's Notes every turn without ever busting the preceding history's KV cache.

### 3. Provider & Model Compatibility
The dual-slot compiler payload is natively compatible with standard OpenAI and DeepSeek chat completion formats:
* **OpenAI Endpoints**: Discovers available models dynamically and supports direct model pinning (e.g. `gpt-5.6`, `gpt-4o`, `o3-mini`, previews) via `https://api.openai.com/v1/chat/completions`.
* **DeepSeek Endpoints**: Supports reasoning/thinking blocks and fast streaming via `https://api.deepseek.com/chat/completions`.
* **Custom OpenAI-Compatible Endpoints**: Compatible with local and cloud providers including Ollama, LM Studio, Groq, OpenRouter, and vLLM.

---

## 2. Parameter Schema & Recency Stabilization

LoomScribe stabilizes prompt parameters across long contexts by generating an ephemeral **Recency Anchor block** at the conclusion of Slot 2 on every turn:

| Parameter Key | Slot | Cache Impact | Description |
| :--- | :--- | :--- | :--- |
| `word_count` | Slot 2 (Post-History) | Safe | Target response length (600–3000 words). |
| `sliding_window` | Slot 2 (Post-History) | Safe | Number of message turns included in context window. |
| `pov` | Slot 1 (System) | Busts Cache | Perspective (*Close Third*, *Deep First*, *Omniscient*, or *Off*). |
| `scene_intensity` | Slot 1 (System) | Busts Cache | Tone & sensory pacing (*Tender*, *Sensory*, *Charged*, *Raw*, *Off*). |
| `dialogue_style` | Slot 1 (System) | Busts Cache | Spoken tone (*Silent*, *Playful*, *Candid*, *Commanding*, *Off*). |
| `pov_focus` | Slot 1 (System) | Busts Cache | Narrative camera spotlight (*Balanced*, *POV Interiority*, *Partner Reactions*, *Off*). |
| `pushback` | Slot 2 (Post-History) | Safe | Character resistance / compliance slider (0–5). |
| `complication_generator`| Slot 2 (Post-History) | Safe | Injects spontaneous narrative obstacles and twists. |
| `suggest_choices` | Slot 2 (Post-History) | Safe | Generates 3 numbered branching choices at response end. |
| `outline_mode` | Slot 1 & 2 (Bypass) | Cache Notice | Swaps prose rules for structural narrative synopses. |
| `premises_mode` | Slot 1 & 2 (Bypass) | Cache Notice | Generates premise pitches and scene-starting openers. |

---

## 3. Presets & Modular Block Architecture

Presets configure the engine for specific narrative scenarios by bundling default parameter values, scenario-specific system body instructions, and an active set of reusable Markdown blocks (`engine/blocks/*.md`).

### Built-in Scenarios
* **Detective Noir**: Hardboiled investigative mystery with internal monologue and gritty atmospheric tension.
* **Heist Crew**: Tactical coordination, high stakes, planning, and real-time execution friction.
* **High Fantasy Journey**: Expansive world-building, magical elements, and immersive travel dynamics.
* **Neon Dystopia**: Cyberpunk gritty sci-fi with corporate intrigue and street-level tech.
* **Psychological Thriller**: Unreliable narrators, psychological tension, suspicion, and claustrophobic stakes.
* **Slow Burn Romance**: Emotional intimacy, character friction, unspoken desires, and gradual escalation.

---

## 4. Compilation Pipeline

When a turn is generated, LoomScribe processes the payload through five discrete compilation stages:

1. **Preset & Parameter Resolution**: Merges schema defaults, preset defaults, and conversation-specific overrides.
2. **Bypass Mode Evaluation**: If `outline_mode` or `premises_mode` is enabled, standard prose and style blocks are bypassed in favor of structural synopsis directives.
3. **Slot 1 Assembly**: Combines base writer identity, tone register, format rules, scenario system body, and active narrative blocks into a clean system prompt.
4. **Context Window Slicing**: Trims message history according to the `sliding_window` parameter.
5. **Slot 2 Ephemeral Injection**: Appends dynamic turn directives, word count targets, complications, choices, and Director's Notes directly after the message history.
