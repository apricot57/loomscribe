# ⚙️ LoomScribe Prompt Engine

The LoomScribe Prompt Engine is a dual-slot compiler architecture designed to optimize prompt adherence and instruction execution for DeepSeek and OpenAI-compatible LLMs while maximizing API Key-Value (KV) prefix cache reuse. 

---

## 🧠 Cache-Safe Dual-Slot Compilation

DeepSeek models cache prompt prefixes to save cost and latency. If the prompt prefix remains identical byte-for-byte, it hits the KV cache. To prevent configuration modifications from busting this cache on every turn, the LoomScribe compiler splits instructions into two separate zones:

```
[System Core (Slot 1)] ──> [Chat Message History (Sliding Window)] ──> [Turn Instructions (Slot 2)]
```

### 1. Slot 1: Stable System Prompt
* **Location**: Sent upstream as the initial `system` role message.
* **Content**: Character identities, baseline writing styles, formatting constraints, point-of-view definitions, scene intensity, dialogue style, and POV focus.
* **KV Cache Impact**: **Busts cache if modified.** When you change a Slot 1 parameter (like Point of View or Scene Intensity) mid-chat, LoomScribe triggers an amber warning dot in the settings panel to notify you that the next response will invalidate the KV cache.

### 2. Slot 2: Safe Post-History Instructions
* **Location**: Attached ephemerally to the end of the conversation history.
* **Content**: Response length targets, sliding context window, pushback/resistance levels, complication triggers, outline directives, and your custom **Director's Note**.
* **KV Cache Impact**: **Cache-safe.** Since Slot 2 instructions are appended *after* the chat history, they reside at the very end of the prompt payload. You can modify these settings or write new Director's Notes every turn without ever busting the preceding history's KV cache.

---

## 🎛️ Parameters Schema (`engine/schema.json`)

The user interface settings panel is generated dynamically from [schema.json](engine/schema.json). Each parameter defines its UI type, bounds, default value, and prompt slot assignment:

* **`word_count`** (Slot 2): Target response length (600 to 3,000 words).
* **`sliding_window`** (Slot 2): Active turn context window (2 to 30 turns).
* **`pov`** (Slot 1): Narrator perspective (*Close Third*, *Deep First*, *Omniscient*, or *Off*).
* **`scene_intensity`** (Slot 1): Scene pacing and tension (*Tender*, *Sensory*, *Charged*, *Raw*, or *Off*).
* **`dialogue_style`** (Slot 1): Speech dynamics (*Silent*, *Playful*, *Candid*, *Commanding*, or *Off*).
* **`pov_focus`** (Slot 1): Perspective spotlight (*Balanced*, *POV Interiority*, *Partner Reaction*, or *Off*).
* **`pushback`** (Slot 2): Character resistance vs compliance slider (0 to 5).
* **`complication_generator`** (Slot 2): Toggle to force external plot obstacles, interruptions, or hesitations.
* **`suggest_choices`** (Slot 2): Toggle to append three continuation choices at the end of the turn.
* **`outline_mode`** (Slot 1): Shifts compiler from narrative prose into structured scene planning.
* **`premises_mode`** (Slot 1): Shifts compiler into generating exactly 6 plot ideas.

---

## 🗃️ Block Registry & File Structure

Foundational instruction segments are stored as independent Markdown files in [engine/blocks/](engine/blocks/). Their inclusion, order, and groups are managed via the [index.json](engine/blocks/index.json) registry:

* **Core Rules**:
  * [base_writer.md](engine/blocks/base_writer.md): Establishes the AI's persona as a creative fiction author.
  * [tone_register.md](engine/blocks/tone_register.md): Sets baseline vocabulary and descriptive standards.
  * [format_rules.md](engine/blocks/format_rules.md): Enforces text layout structure (no emojis, asterisks, or markdown lists).
* **POV Blocks**:
  * [pov_third.md](engine/blocks/pov_third.md): Limits narration strictly to close third-person.
  * [pov_first.md](engine/blocks/pov_first.md): Limits narration to deep first-person.
  * [pov_author.md](engine/blocks/pov_author.md): Enables classic omniscient authorial voice.
* **Scene Intensity Blocks**:
  * [intensity_tender.md](engine/blocks/intensity_tender.md): Gentle, atmospheric pacing.
  * [intensity_sensory.md](engine/blocks/intensity_sensory.md): Tactile, physical sensory immersion.
  * [intensity_charged.md](engine/blocks/intensity_charged.md): High-tension, fast emotional/physical escalation.
  * [intensity_raw.md](engine/blocks/intensity_raw.md): Direct, visceral prose.
* **Dialogue Style Blocks**:
  * [dialogue_silent.md](engine/blocks/dialogue_silent.md): Minimalist, subtext-heavy dialogue.
  * [dialogue_playful.md](engine/blocks/dialogue_playful.md): Witty, banter-focused dialogue.
  * [dialogue_candid.md](engine/blocks/dialogue_candid.md): Direct, vulnerable dialogue.
  * [dialogue_commanding.md](engine/blocks/dialogue_commanding.md): Dominant, authoritative tone.

---

## 🛡️ Adherence Stabilization Mechanisms

To prevent instruction decay and ensure the LLM respects your toggles over long chat sessions, the LoomScribe engine implements three stabilization mechanisms:

### 1. Dual-Anchored Recency Settings
As conversation history grows, Slot 1 rules decay in the model's attention span. To combat this attention drift, when not in outline/premises bypass mode, the compiler appends active style and perspective labels directly into the high-recency Slot 2:
```markdown
[Active POV: Close Third Person]
[Active Intensity: High-Tension & Charged]
[Active Dialogue: Witty & Playful]
[Active Focus: Balanced Dynamic]
```

### 2. In-Flight XML `<system_note>` Wrapping
Standard markdown headers often blend in-context rules with story text, causing the model to write instructions as narration. LoomScribe solves this by wrapping Slot 2 instructions in XML tags:
```xml
<system_note>
[Turn Instructions: Write 1500 words, include complication...]
</system_note>
```
LoomScribe attaches this system note to the tail of the final `user` message **strictly in-flight**. The database remains completely clean and contains only raw user input, while the outgoing API payload receives the structured wrapper.

### 3. Choice Counter-Pressure Directive
When `Suggest Next Choices` is enabled mid-chat, models tend to ignore it because the preceding conversation history sets a pattern of not generating choices. To break this in-context bias, LoomScribe injects an authoritative counter-pressure instruction:
> **"IMPORTANT: Regardless of whether previous turns had options, you MUST end this turn with exactly three numbered choices (1., 2., 3.) about how to proceed with the story."**

---

## 🎭 Creating Preset Configurations

Presets are stored as JSON files under `engine/presets/`. Here is a standard configuration example:

```json
{
  "id": "slow_burn_romance",
  "title": "Slow Burn Romance",
  "category": "Romance",
  "description": "Slow pacing emphasizing chemistry and high emotional stakes.",
  "system_body": "You are writing a slow-burn romance novel...",
  "post_history_body": "Maintain slow emotional pacing.",
  "defaults": {
    "word_count": 1200,
    "sliding_window": 10,
    "pov": "third",
    "scene_intensity": "sensory",
    "dialogue_style": "playful",
    "pov_focus": "balanced",
    "pushback": 3,
    "outline_mode": false,
    "premises_mode": false,
    "complication_generator": false,
    "suggest_choices": true
  }
}
```

Any preset JSON placed in `engine/presets/` is automatically discovered by the server, listed in the Preset Manager, and ready to use.
