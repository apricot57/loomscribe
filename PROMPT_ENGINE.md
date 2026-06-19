# LoomScribe Prompt Engine

The LoomScribe Prompt Engine is a schema-driven compilation system that constructs custom instruction prompts for DeepSeek models on every turn. It combines stable system blocks, preset-specific scenario guidance, and per-turn directives into a two-slot payload designed to balance narrative control with KV-cache efficiency.

---

## The Two-Slot Context Model

The compiler separates the instruction payload into two distinct positions in the API message array:

```
[Slot 1: system]  <── compiled from active system blocks + preset system_body
[user message]
[assistant message]
[user message]
...
[Slot 2: system]  <── compiled from word_count + pushback + complications + directorNote
```

### Slot 1 - System Prompt
Sent as the initial `system` role message at the top of the conversation payload. It contains the stable AI identity, prose rules, POV configuration, intensity register, and scenario-specific system guidance. This slot should change as rarely as possible because DeepSeek cache keys are prefix-sensitive.

### Slot 2 - Post-History
Injected as a trailing `system` role message after all chat history, immediately before generation. It contains high-recency directives that should govern the next response, such as response length, pushback, complication cues, or a Director's Note. If Slot 2 is empty, it is omitted.

---

## DeepSeek KV Cache Efficiency

DeepSeek models cache the key-value state of the prompt prefix. A cache hit requires the prompt prefix to be byte-for-byte identical to the previous call.

- Slot 1 changes bust the cache.
- Slot 2 changes are cache-safe because they are appended after chat history.

| Parameter | UI Location | Slot | Cache impact if changed |
|---|---|---|---|
| `pov` | Writing Settings | Slot 1 (System) | Busts cache (amber dot) |
| `sensory_intensity` | Writing Settings | Slot 1 (System) | Busts cache (amber dot) |
| `dialogue_register` | Writing Settings | Slot 1 (System) | Busts cache (amber dot) |
| `pov_focus` | Writing Settings | Slot 1 (System) | Busts cache (amber dot) |
| `outline_mode` | Writing Settings | Slot 1 (System) | Busts cache (amber dot) |
| `premises_mode` | Writing Settings | Slot 1 (System) | Busts cache (amber dot) |
| `word_count` | Per-Turn Directives | Slot 2 (Post-History) | Cache safe |
| `pushback` | Per-Turn Directives | Slot 2 (Post-History) | Cache safe |
| `complication_generator` | Per-Turn Directives | Slot 2 (Post-History) | Cache safe |
| Director's Note | Per-Turn Directives | Slot 2 (Post-History) | Cache safe |

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
│   ├── premises_mode.md    # Six-premise brainstorming directives
│   ├── pov_*.md            # Close Third, Deep First, Omniscient POV blocks
│   ├── focus_*.md          # POV Focus (Balanced, Self, Partner Reaction)
│   ├── sensory_*.md         # Sensory Intensity levels (Romantic, Sensual, Explicit, Hardcore)
│   └── dialogue_register_*.md     # Dialogue speech registers
└── presets/                # Preset JSON files (general.json, infidelity.json, etc.)
```

---

## Shared Blocks & Block Groups

Individual prompt snippets are listed in `engine/blocks/index.json` and loaded from `engine/blocks/`. They are classified into functional groups:

| Group | Member Blocks | Description / Compilation Rule |
|---|---|---|
| `core` | `base_writer`, `tone_register`, `format_rules`, `no_meta`, `continuity` | Always active in prose presets. |
| `pov` | `pov_third`, `pov_first`, `pov_author` | Mutually exclusive. Enabled based on `pov`. |
| `sensory_intensity` | `sensory_poetic`, `sensory_tactile`, `sensory_detailed`, `sensory_visceral` | Mutually exclusive. Enabled based on `sensory_intensity`. |
| `dialogue_register` | `dialogue_register_none`, `dialogue_register_teasing`, `dialogue_register_filthy`, `dialogue_register_degrading` | Mutually exclusive. Enabled based on `dialogue_register`. |
| `pov_focus` | `focus_balanced`, `focus_self`, `focus_partner` | Mutually exclusive. Enabled based on `pov_focus`. |
| `outline` | `outline_mode` | Activated via `outline_mode`. Disables all POV, intensity, dialogue register, and focus blocks. |
| `premises` | `premises_mode` | Activated via `premises_mode`. Disables all POV, intensity, dialogue register, and focus blocks. |

During compilation, active blocks are sorted by ascending `order` and joined with `\n\n---\n\n`.

---

## How the Compiler Works

The central function `compilePrompt({ presetId, params, blockOverrides, directorNote })` outputs `{ systemPrompt, postHistory }` through these stages:

1. **Preset validation**: If `presetId` is empty or null, return empty prompts.
2. **Preset loading**: Read `engine/presets/{presetId}.json`.
3. **Schema validation**: Load `engine/schema.json`, resolve defaults, and validate types. Parameter precedence is user overrides > preset defaults > schema defaults.
4. **Baseline setup**: Load the block registry and overlay preset-defined block overrides.
5. **Parameter-to-block mapping**:
   - If `premises_mode` is `true`, enable `premises_mode` and disable all POV, intensity, dialogue register, and focus blocks.
   - Else if `outline_mode` is `true`, enable `outline_mode` and disable all POV, intensity, dialogue register, and focus blocks.
   - Else, map the active `pov`, `sensory_intensity`, `dialogue_register`, and `pov_focus` values to their mutually exclusive blocks.
6. **Manual overrides**: Apply `blockOverrides` from the UI. User overrides win over the mapped state.
7. **Block concatenation**: Filter enabled blocks, sort by `order`, load their markdown files, and join them with `\n\n---\n\n`. Append the preset's `system_body` to create `systemPrompt`.
8. **Post-History construction**: Build `postHistory` by combining:
   - The preset's `post_history_body`, if present.
   - If `premises_mode` is enabled, append the six-premise generation directive and skip the normal word-count instruction.
   - Else if `outline_mode` is enabled, append plotting/outline directives and still include the word-count instruction.
   - Else, append `Write approximately {word_count} words.`
   - If `complication_generator` is enabled, append the immediate conflict or hesitation directive.
   - Append the pushback profile selected by the `pushback` slider.
   - Append the user's custom `directorNote`, if provided.
9. **Output**: Return `{ systemPrompt, postHistory }`.

---

## Parameter-to-Block Mappings

| Parameter | Checked Value | Block Enabled | Block Disabled |
|---|---|---|---|
| `pov` | `third` | `pov_third` | `pov_first`, `pov_author` |
| `pov` | `first` | `pov_first` | `pov_third`, `pov_author` |
| `pov` | `author` | `pov_author` | `pov_third`, `pov_first` |
| `sensory_intensity` | `romantic` | `sensory_poetic` | `sensory_tactile`, `sensory_detailed`, `sensory_visceral` |
| `sensory_intensity` | `sensual` | `sensory_tactile` | `sensory_poetic`, `sensory_detailed`, `sensory_visceral` |
| `sensory_intensity` | `sensory_detailed` | `sensory_detailed` | `sensory_poetic`, `sensory_tactile`, `sensory_visceral` |
| `sensory_intensity` | `hardcore` | `sensory_visceral` | `sensory_poetic`, `sensory_tactile`, `sensory_detailed` |
| `dialogue_register` | `none` | `dialogue_register_none` | `dialogue_register_teasing`, `dialogue_register_filthy`, `dialogue_register_degrading` |
| `dialogue_register` | `teasing` | `dialogue_register_teasing` | `dialogue_register_none`, `dialogue_register_filthy`, `dialogue_register_degrading` |
| `dialogue_register` | `filthy` | `dialogue_register_filthy` | `dialogue_register_none`, `dialogue_register_teasing`, `dialogue_register_degrading` |
| `dialogue_register` | `dominant_degrading` | `dialogue_register_degrading` | `dialogue_register_none`, `dialogue_register_teasing`, `dialogue_register_filthy` |
| `pov_focus` | `balanced` | `focus_balanced` | `focus_self`, `focus_partner` |
| `pov_focus` | `self` | `focus_self` | `focus_balanced`, `focus_partner` |
| `pov_focus` | `partner` | `focus_partner` | `focus_balanced`, `focus_self` |

---

## Dynamic Slot 2 Character Pushback Profiles

The compiler maps the `pushback` slider to one of three character-behavior directives in Slot 2:

- **Compliant (1-2)**: Receptive and highly compliant. Characters easily go along with the user character's initiatives and physical advances with minimal hesitation.
- **Realistic (3)**: Characters act on their own beliefs, mood, and comfort levels. They show natural hesitation, boundary checks, or mild pushback when pushed too fast or out of character.
- **Resistant (4-5)**: Characters prioritize their own motives, boundaries, fears, or goals. They actively push back, refuse, express doubt, or create friction.

---

## Preset Authoring Notes

When authoring a new preset, keep `system_body` focused on what is unique about that preset. General prose style, format, POV, and no-meta rules should stay in shared blocks so presets remain composable.

For generator presets:

- Use `premises_mode` when the preset should return exactly six fully developed premises instead of prose.
- Use `outline_mode` when the preset should return planning notes, scene beats, or brainstorming without full prose.
- Disable blocks that do not make sense for the mode rather than trying to override them in prose.

For story presets:

- Keep `system_body` specific to the scenario's dramatic engine, recurring tensions, and characteristic scene situations.
- Prefer concrete behavioral rules over broad thematic restatements.
- Avoid repeating shared block instructions unless the preset needs a special exception.