# 🎭 LoomScribe Prompt Engine

The LoomScribe Prompt Engine is a schema-driven compilation system that dynamically constructs custom instruction prompts for DeepSeek models on every message turn. It compiles a granular set of settings, manual overrides, and preset parameters into a structured payload designed to optimize context retention, narrative focus, and API cache reuse.

---

## The Two-Slot Context Model

To balance stable system instructions against highly dynamic per-turn directives, the compiler separates the instruction payload into two distinct positions in the API message array:

```
[Slot 1: system]  <── compiled from active system blocks + preset system_body
[user message]
[assistant message]
[user message]
...
[Slot 2: system]  <── compiled from word_count + pushback + complications + directorNote
```

### Slot 1 — System Prompt
Sent as the initial `system` role message at the very top of the conversation API payload. It contains the primary AI persona (`base_writer`), writing standards (`tone_register`), formatting parameters, POV configurations, and thematic scenarios. This slot represents low-recency, high-stability context.

### Slot 2 — Post-History
Injected as a trailing `system` role message *after all chat history*, immediately preceding the final generation request. It contains high-recency instructions that must govern the next immediate response (e.g., specific length commands, character pushback traits, random complications, or manual Director's Notes). The model reads this last, ensuring compliance with immediate narrative goals. If Slot 2 resolves to an empty string, it is omitted from the API call entirely.

---

## DeepSeek KV Cache Efficiency

DeepSeek models cache the key-value (KV) state of prefix prompt messages. A cache hit requires the prompt prefix to be **byte-for-byte identical** to the previous call.

*   **Slot 1 (System Slot) changes bust the cache.** Changing POV, Sensory Intensity, Dialogue Register, POV Focus, or Outline Mode mid-conversation forces DeepSeek to re-process the entire system prompt. In the UI, these parameters are marked with an **amber dot** to alert you to cache-busting changes.
*   **Slot 2 (Post-History Slot) changes are cache-safe.** Because Slot 2 is injected *after* the chat history at the end of the context window, changing the word count, pushback level, complications, or Director's Note has no impact on the KV cache prefix. These can change freely on every turn.

| Parameter | UI Location | Slot | Cache impact if changed |
|---|---|---|---|
| `pov` | Writing Settings | Slot 1 (System) | ⚠ Busts cache (Amber dot) |
| `sensory_intensity` | Writing Settings | Slot 1 (System) | ⚠ Busts cache (Amber dot) |
| `dialogue_register` | Writing Settings | Slot 1 (System) | ⚠ Busts cache (Amber dot) |
| `pov_focus` | Writing Settings | Slot 1 (System) | ⚠ Busts cache (Amber dot) |
| `outline_mode` | Writing Settings | Slot 1 (System) | ⚠ Busts cache (Amber dot) |
| `word_count` | Per-Turn Directives | Slot 2 (Post-Hist) | ✅ Cache safe |
| `pushback` | Per-Turn Directives | Slot 2 (Post-Hist) | ✅ Cache safe |
| `complication_generator` | Per-Turn Directives | Slot 2 (Post-Hist) | ✅ Cache safe |
| Director's Note | Per-Turn Directives | Slot 2 (Post-Hist) | ✅ Cache safe |

---

## File Layout

```
engine/
├── compiler.js             # Compiler engine: exports compilePrompt()
├── schema.json             # Parameter schema definitions (slot, types, min/max, options)
├── PRESET_CREATOR.md       # Writing guide for authoring new presets
├── blocks/                 # Reusable Markdown prompt snippets
│   ├── index.json          # Block registry index (id, file, group, order)
│   ├── base_writer.md      # Core writer instructions
│   ├── tone_register.md    # Baseline prose styling rules
│   ├── format_rules.md     # Layout, markdown, and token controls
│   ├── no_meta.md          # Disables out-of-character AI chatter
│   ├── continuity.md       # Memory coherence guidelines
│   ├── outline_mode.md     # Structural outline directives
│   ├── pov_*.md            # Close Third, Deep First, Omniscient POV blocks
│   ├── focus_*.md          # POV Focus (Balanced, Self, Partner Reaction)
│   ├── sensory_*.md         # Sensory Intensity registers (Romantic, Sensual, Explicit, Hardcore)
│   └── dialogue_register_*.md     # Dialogue register speech registers (None, Teasing, Filthy, Degrading)
└── presets/                # Preset JSON files (general.json, infidelity.json, etc.)
```

---

## Shared Blocks & Block Groups

Individual prompt snippets (blocks) are listed in `engine/blocks/index.json` and loaded from `engine/blocks/`. They are classified into functional groups:

| Group | Member Blocks | Description / Compilation Rule |
|---|---|---|
| `core` | `base_writer`, `tone_register`, `format_rules`, `no_meta`, `continuity` | Always active in presets. |
| `pov` | `pov_third`, `pov_first`, `pov_author` | Mutually exclusive. Enabled based on `pov` param. |
| `sensory_intensity` | `sensory_poetic`, `sensory_tactile`, `sensory_detailed`, `sensory_visceral` | Mutually exclusive. Enabled based on `sensory_intensity` param. |
| `dialogue_register` | `dialogue_register_none`, `dialogue_register_teasing`, `dialogue_register_filthy`, `dialogue_register_degrading` | Mutually exclusive. Enabled based on `dialogue_register` param. |
| `pov_focus` | `focus_balanced`, `focus_self`, `focus_partner` | Mutually exclusive. Enabled based on `pov_focus` param. |
| `outline` | `outline_mode` | Activated via `outline_mode` param. **Forces disable** on all `pov`, `sensory_intensity`, `dialogue_register`, and `pov_focus` blocks. |

During compilation, active blocks are sorted in ascending order by their `order` value and joined using `\n\n---\n\n`.

---

## How the Compiler Works

The central function `compilePrompt({ presetId, params, blockOverrides, directorNote })` outputs `{ systemPrompt, postHistory }` through these stages:

1.  **Preset Validation**: If `presetId` is empty or null, returns empty prompts.
2.  **Preset Loading**: Reads `engine/presets/{presetId}.json`.
3.  **Schema Validation**: Loads `engine/schema.json`, resolves defaults (User overrides > Preset defaults > Schema defaults), and validates types (clamps sliders, validates select enums, standardizes booleans).
4.  **Baseline Setup**: Loads the block registry and overlays preset-defined block overrides.
5.  **Parameter-to-Block Mapping**:
    *   If `outline_mode` is `true`: Enables the `outline_mode` block and disables all POV, Sensory, Dialogue Register, and Focus blocks.
    *   If `outline_mode` is `false`: Maps parameters to their respective mutually exclusive blocks based on the table below.
6.  **Manual Overrides**: Overlays `blockOverrides` from the UI checkboxes (user preferences override parameters).
7.  **Block Concatenation**: Filters enabled blocks, sorts them by `order`, loads their markdown files, and joins them with `\n\n---\n\n`. Appends the preset's `system_body` at the end to create `systemPrompt` (Slot 1).
8.  **Post-History Construction**: Assembles `postHistory` (Slot 2) by combining:
    *   Preset's `post_history_body` (if defined).
    *   If `outline_mode` is enabled: appends plotting/outline directives.
    *   Response length instructions: `"Write approximately {word_count} words."`
    *   If `complication_generator` is enabled: appends immediate conflict/hesitation directives.
    *   Character Pushback instructions: Appends behavior profiles based on the `pushback` slider value.
    *   User's custom `directorNote` (if defined).
9.  **Output**: Returns `{ systemPrompt, postHistory }`.

### Parameter-to-Block Mappings

| Parameter | Checked Value | Block Enabled | Block Disabled |
|---|---|---|---|
| `pov` | `"third"` | `pov_third` | `pov_first`, `pov_author` |
| `pov` | `"first"` | `pov_first` | `pov_third`, `pov_author` |
| `pov` | `"author"` | `pov_author` | `pov_third`, `pov_first` |
| `sensory_intensity` | `"romantic"` | `sensory_poetic` | `sensory_tactile`, `sensory_detailed`, `sensory_visceral` |
| `sensory_intensity` | `"sensual"` | `sensory_tactile` | `sensory_poetic`, `sensory_detailed`, `sensory_visceral` |
| `sensory_intensity` | `"sensory_detailed"` | `sensory_detailed` | `sensory_poetic`, `sensory_tactile`, `sensory_visceral` |
| `sensory_intensity` | `"hardcore"` | `sensory_visceral` | `sensory_poetic`, `sensory_tactile`, `sensory_detailed` |
| `dialogue_register` | `"none"` | `dialogue_register_none` | `dialogue_register_teasing`, `dialogue_register_filthy`, `dialogue_register_degrading` |
| `dialogue_register` | `"teasing"` | `dialogue_register_teasing` | `dialogue_register_none`, `dialogue_register_filthy`, `dialogue_register_degrading` |
| `dialogue_register` | `"filthy"` | `dialogue_register_filthy` | `dialogue_register_none`, `dialogue_register_teasing`, `dialogue_register_degrading` |
| `dialogue_register` | `"dominant_degrading"`| `dialogue_register_degrading`| `dialogue_register_none`, `dialogue_register_teasing`, `dialogue_register_filthy` |
| `pov_focus` | `"balanced"` | `focus_balanced` | `focus_self`, `focus_partner` |
| `pov_focus` | `"self"` | `focus_self` | `focus_balanced`, `focus_partner` |
| `pov_focus` | `"partner"` | `focus_partner` | `focus_balanced`, `focus_self` |

---

## Dynamic Slot 2 Character Pushback Profiles

The compiler maps the `pushback` slider parameter to one of three target character directives in Slot 2:

*   **Compliant (Values 1–2)**:
    `"Character Behavior: Receptive and highly compliant. The AI-controlled characters should easily go along with the user character's initiatives, suggestions, and physical advances with minimal hesitation."`
*   **Realistic (Value 3)**:
    `"Character Behavior: Realistic agency. Characters act on their own beliefs, immediate mood, and comfort levels. They will show natural hesitation, boundary checks, or mild pushback if the user character pushes them too fast or acts out of character."`
*   **Resistant (Values 4–5)**:
    `"Character Behavior: Guarded and resistant. Characters prioritize their own secret motivations, strict boundaries, fears, or independent goals. They will actively push back, refuse, express doubt, or create friction against the user character's advances and suggestions."`
