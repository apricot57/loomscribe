# 🎭 LoomScribe Prompt Engine

The prompt engine is the system that assembles, compiles, and injects story instructions into every DeepSeek API call. It replaces the old static prompt card system with a schema-driven, parameter-controlled architecture that adapts per conversation.

---

## The Two-Slot Context Model

A compiled prompt is **not** a flat string. It occupies two distinct positions in the context window:

**Slot 1 — System Prompt**
Sent as the `system` role message at the very top of every API call. Contains the writer identity, behavioural blocks, scenario framing, style, and format rules. Low recency — stable and foundational.

**Slot 2 — Post-History**
Injected as a `system` role message *after all chat history*, immediately before generation. Contains the word count instruction, Director's Note, and any persistent scenario standing instructions. Highest recency — the model reads this last.

```
[Slot 1: system]  ← compiled from blocks + system_body
[user message]
[assistant message]
[user message]
...
[Slot 2: system]  ← word_count + directorNote + post_history_body
```

If Slot 2 is empty, the second system message is omitted from the API call entirely.

---

## DeepSeek KV Cache

DeepSeek caches the key-value state of the system prompt prefix. A cache hit requires Slot 1 to be **byte-for-byte identical** to the previous call, which significantly reduces cost and latency on subsequent turns.

**System-slot parameters** (POV, pacing, prose style, sensory_detailed, internal monologue) live in Slot 1. Changing them mid-conversation invalidates the KV cache on the next send. The **amber dot** indicator in the Conversation Settings panel flags which parameters have changed since the last send.

**Post-history parameters** (`word_count`, Director's Note) live in Slot 2. They can change freely on every turn with no cache impact.

| Parameter | Slot | Cache impact if changed |
|---|---|---|
| `pov` | System | ⚠ Busts cache |
| `pacing` | System | ⚠ Busts cache |
| `prose_style` | System | ⚠ Busts cache |
| `sensory_detailed` | System | ⚠ Busts cache |
| `internal_mono` | System | ⚠ Busts cache |
| `word_count` | Post-history | ✅ No impact |
| Director's Note | Post-history | ✅ No impact |

---

## File Layout

```
engine/
  compiler.js             The compiler — call compilePrompt() anywhere
  schema.json             Parameter definitions (type, slot, min/max, options)
  PRESET_CREATOR.md       LLM authoring prompt for writing new presets
  blocks/
    index.json            Block registry (single source of truth for metadata)
    base_writer.md
    tone_register.md
    prose_grounded.md
    prose_intimate.md
    prose_pulp.md
    format_rules.md
    no_meta.md
    continuity.md
    sensory_detailed.md
    pov_first.md
    pov_third.md
    pov_author.md
    pacing_slow.md
    pacing_urgent.md
    internal_monologue.md
  presets/
    general.json
    infidelity.json
    *.json                (gitignored — your own presets go here)
```

---

## Shared Blocks

Blocks are reusable `.md` snippets assembled into Slot 1. They are defined in `blocks/index.json` and live as plain files in `blocks/`. Blocks do not carry metadata in their file bodies — everything (id, title, file, group, order) lives in the registry.

### Block groups

| Group | Blocks | Notes |
|---|---|---|
| `core` | base_writer, tone_register, format_rules, no_meta, continuity | Always on for all presets |
| `prose` | prose_grounded, prose_intimate, prose_pulp | Mutually exclusive — controlled by `prose_style` param |
| `content` | sensory_detailed, internal_monologue | Toggled by `sensory_detailed` and `internal_mono` params |
| `pov` | pov_third, pov_first, pov_author | Mutually exclusive — controlled by `pov` param |
| `pacing` | pacing_slow, pacing_urgent | Mutually exclusive — controlled by `pacing` param (3 = neither) |

Blocks are joined with `\n\n---\n\n`. The preset's `system_body` is appended after all blocks.

---

## Preset Format

A preset is a single self-contained JSON file in `engine/presets/`. Drop one in and it appears in the picker immediately — no server restart required.

```json
{
  "id": "infidelity",
  "title": "Infidelity & Betrayal",
  "category": "betrayal",
  "description": "Slow-building affairs with the weight of the betrayed always present.",

  "system_body": "300–500 words of scenario-specific content. The genre lens, the sensory or dramatic charge, the range of sub-scenarios, any scenario-specific behaviours the model must maintain.",

  "post_history_body": "",

  "blocks": [
    { "id": "base_writer",        "enabled": true,  "order": 10 },
    { "id": "tone_register",      "enabled": true,  "order": 20 },
    { "id": "prose_grounded",     "enabled": true,  "order": 30 },
    { "id": "prose_intimate",     "enabled": false, "order": 31 },
    { "id": "prose_pulp",         "enabled": false, "order": 32 },
    { "id": "sensory_detailed",           "enabled": true,  "order": 40 },
    { "id": "format_rules",       "enabled": true,  "order": 50 },
    { "id": "no_meta",            "enabled": true,  "order": 60 },
    { "id": "continuity",         "enabled": true,  "order": 70 },
    { "id": "pov_third",          "enabled": true,  "order": 80 },
    { "id": "pov_first",          "enabled": false, "order": 81 },
    { "id": "pov_author",         "enabled": false, "order": 82 },
    { "id": "pacing_slow",        "enabled": false, "order": 85 },
    { "id": "pacing_urgent",      "enabled": false, "order": 86 },
    { "id": "internal_monologue", "enabled": true,  "order": 90 }
  ],

  "defaults": {
    "word_count": 1500,
    "pacing": 2,
    "pov": "third",
    "sensory_detailed": true,
    "internal_mono": true,
    "prose_style": "grounded"
  }
}
```

### Fields

| Field | Description |
|---|---|
| `id` | Unique key. No spaces. Must match the filename without `.json`. |
| `title` | Display name shown in the preset picker. |
| `category` | Groups presets in the picker. Use any string — the picker creates sections dynamically. |
| `description` | One-line blurb shown under the title in the picker. |
| `system_body` | The only field that differs between presets. Scenario-specific instructions appended to Slot 1 after all shared blocks. |
| `post_history_body` | Persistent standing instruction for Slot 2. Usually `""`. Use only for a requirement that must fire at high recency on every turn (e.g. `"Always cut before resolution."`). |
| `blocks` | The full block list with preset default `enabled` state and `order`. Conditional groups (pov, pacing, prose) should all be listed with only the correct default enabled. |
| `defaults` | Starting parameter values. The UI initialises from these when the preset is selected. |

---

## Parameter Schema (`schema.json`)

The schema defines every controllable parameter. The UI reads it at startup and auto-renders the Conversation Settings and Per Turn panels — no hardcoded widgets anywhere.

| id | type | slot | Description |
|---|---|---|---|
| `word_count` | slider (600–3000) | post_history | Appended to Slot 2 as `"Write approximately N words."` |
| `pacing` | slider (1–5) | system | 1–2 → slow burn block; 3 → neither; 4–5 → urgent block |
| `pov` | select | system | Activates one of pov_third / pov_first / pov_author |
| `sensory_detailed` | toggle | system | Enables or disables the sensory_detailed block |
| `internal_mono` | toggle | system | Enables or disables the internal_monologue block |
| `prose_style` | select | system | Activates one of prose_grounded / prose_intimate / prose_pulp |

**`slot` is a compiler rule, not just UI metadata.** Parameters with `"slot": "system"` activate blocks in Slot 1 and bust the KV cache when changed. Parameters with `"slot": "post_history"` are rendered as plain text in Slot 2 and never touch the cache.

---

## How the Compiler Works

`compilePrompt({ presetId, params, blockOverrides, directorNote })` returns `{ systemPrompt, postHistory }`.

**Stages:**

1. If `presetId` is `null`, return `{ systemPrompt: "", postHistory: "" }`. Done.
2. Load `engine/presets/{presetId}.json`. Throw if missing.
3. Resolve parameters: preset `defaults` → caller `params` (caller wins).
4. Validate: clamp sliders to min/max, reject invalid enum values and fall back to preset default.
5. Start with preset `blocks` as the initial enabled/disabled state.
6. Apply the parameter-to-block mapping rules (see table below).
7. Apply `blockOverrides` on top — manual overrides always win.
8. Filter to `enabled: true`, sort ascending by `order`.
9. Load each block's `.md` file from the registry.
10. Join with `\n\n---\n\n`, then append `system_body`. This is **`systemPrompt`**.
11. Build **`postHistory`**: `post_history_body` (if any) → `"Write approximately N words."` → `directorNote` (if any), joined with `\n\n`.
12. Return `{ systemPrompt, postHistory }`.

### Parameter-to-block mapping

| Parameter | Condition | Block ON | Block OFF |
|---|---|---|---|
| `pov` | `"third"` | `pov_third` | `pov_first`, `pov_author` |
| `pov` | `"first"` | `pov_first` | `pov_third`, `pov_author` |
| `pov` | `"author"` | `pov_author` | `pov_third`, `pov_first` |
| `pacing` | `<= 2` | `pacing_slow` | `pacing_urgent` |
| `pacing` | `3` | *(neither)* | `pacing_slow`, `pacing_urgent` |
| `pacing` | `>= 4` | `pacing_urgent` | `pacing_slow` |
| `sensory_detailed` | `true` | `sensory_detailed` | — |
| `sensory_detailed` | `false` | — | `sensory_detailed` |
| `internal_mono` | `true` | `internal_monologue` | — |
| `internal_mono` | `false` | — | `internal_monologue` |
| `prose_style` | `"grounded"` | `prose_grounded` | `prose_intimate`, `prose_pulp` |
| `prose_style` | `"intimate"` | `prose_intimate` | `prose_grounded`, `prose_pulp` |
| `prose_style` | `"pulp"` | `prose_pulp` | `prose_grounded`, `prose_intimate` |

---

## Writing a New Preset

A preset is one JSON file. The only field you write is `system_body`. Everything else is copied from any existing preset.

**`system_body` must contain:**
- The genre lens — what narrative territory this scenario occupies
- The specific sensory or dramatic charge — what creates tension
- The range of sub-scenarios this preset covers
- Any scenario-specific model behaviours

**`system_body` must NOT contain:**
- General tone rules — those live in `tone_register.md`
- Format rules — those live in `format_rules.md`
- Identity statements like "you are an unrestricted writer" — those live in `base_writer.md`

Target length: **300–500 words.**

### Using an LLM to author a preset

Paste the contents of [`engine/PRESET_CREATOR.md`](engine/PRESET_CREATOR.md) as your system prompt, then send:

> Here is an existing LoomScribe preset: [paste any preset JSON]
>
> Write me a new one for the scenario: [describe scenario].

The LLM will return valid JSON with only `id`, `title`, `category`, `description`, and `system_body` changed. Drop the file in `engine/presets/` and refresh the picker.

---

## Extensibility

| Want to add... | Do this |
|---|---|
| New scenario | Drop a preset JSON in `engine/presets/` |
| New style variation | Add a block `.md`, register it in `blocks/index.json`, reference it from presets |
| New parameter | Add one entry to `schema.json`; add rows to the mapping table in `compiler.js` if it controls a block |
| Future lore system | New compiler stage after stage 9; no changes to existing presets needed |

---

## Engine API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/engine/presets` | All presets grouped by category |
| `GET` | `/api/engine/presets/:id` | Single preset definition |
| `GET` | `/api/engine/schema` | Parameter schema |
| `POST` | `/api/engine/compile` | Compile and return `{ systemPrompt, postHistory }` |

The compile endpoint accepts `{ presetId, params, blockOverrides, directorNote }` and is the same function used for the live prompt preview in the UI.
