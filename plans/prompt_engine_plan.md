# Prompt Engine Plan

## Goal

Replace the current prompt card system with a schema-driven prompt engine. No
backwards compatibility with existing conversations is required. Old conversations
will simply have no `presetId` and run with no system prompt — the same behaviour
as today.

---

## Design Principles

- Prompt assembly is deterministic and server-side.
- One compiler for both live sends and prompt preview.
- The UI is data-driven from `schema.json`. No hardcoded parameter widgets.
- No build step.
- Old prompt-card code is deleted outright when the engine is live.

---

## Two-Slot Context Model

This is the core architectural decision, taken from the SillyTavern V2 spec.

A compiled prompt is not a flat string. It occupies two distinct positions in the
context window, each with different recency:

**Slot 1 — System Prompt**
Sent as the `system` role message at the top of every API call. Contains the writer
identity, all behavioural blocks, scenario framing, style, and format rules.
Low recency — foundational and stable.

**Slot 2 — Post-History**
Injected as a final `system` role message *after all chat history*, immediately
before generation. Contains the Director's Note and per-turn instructions.
Highest recency — the model reads this last.

The Director's Note is a separate field — not a block — because it lives in a
different injection position with different recency characteristics.

The compiler always returns two strings:

```js
{ systemPrompt: string, postHistory: string }
```

If `postHistory` is empty, the second system message is omitted from the API call.

---

## Caching

DeepSeek caches the KV state of the system prompt prefix. A cache hit requires
Slot 1 to be **byte-for-byte identical** to the previous call.

**Rule: Slot 1 is stable within a conversation, but can be deliberately recompiled.**

System-slot parameters (POV, pacing, prose style, sensory_detailed, internal monologue)
are selected when a chat starts and treated as conversation-level settings. The
UI may let the user change them later, but doing so changes Slot 1 and invalidates
the prompt cache on the next send.

Slot 2 (post-history) can change freely on every turn. It appears after the cached
prefix and never affects the cache.

| Parameter | Slot | Cache impact if changed mid-conversation |
|---|---|---|
| `pov` | System | Busts cache |
| `pacing` | System | Busts cache |
| `prose_style` | System | Busts cache |
| `sensory_detailed` | System | Busts cache |
| `internal_mono` | System | Busts cache |
| `word_count` | Post-history | No cache impact |
| Director's Note | Post-history | No cache impact |

`word_count` is never interpolated into any system block. The compiler appends
`"Write approximately {word_count} words."` to Slot 2 on every call.

---

## File Layout

```text
engine/
  blocks/
    index.json            ← block registry (single source of truth for block metadata)
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
    cuckolding.json
    orchestrated.json
    workplace.json
  schema.json
  compiler.js
  PRESET_CREATOR.md
```

There are no `scenario_*.md` block files. Scenario content lives inside each
preset JSON as `system_body` (see Preset Format below).

---

## Block Registry (`blocks/index.json`)

The registry is the single source of truth for block metadata. Blocks do not
carry metadata in their markdown bodies.

```json
[
  {
    "id": "base_writer",
    "title": "Base Writer",
    "file": "base_writer.md",
    "group": "core",
    "order": 10
  },
  {
    "id": "tone_register",
    "title": "Tone & Register",
    "file": "tone_register.md",
    "group": "core",
    "order": 20
  },
  {
    "id": "prose_grounded",
    "title": "Prose — Grounded",
    "file": "prose_grounded.md",
    "group": "prose",
    "order": 30
  },
  {
    "id": "prose_intimate",
    "title": "Prose — Intimate",
    "file": "prose_intimate.md",
    "group": "prose",
    "order": 31
  },
  {
    "id": "prose_pulp",
    "title": "Prose — Pulp",
    "file": "prose_pulp.md",
    "group": "prose",
    "order": 32
  },
  {
    "id": "sensory_detailed",
    "title": "Explicit Content",
    "file": "sensory_detailed.md",
    "group": "content",
    "order": 40
  },
  {
    "id": "format_rules",
    "title": "Format Rules",
    "file": "format_rules.md",
    "group": "core",
    "order": 50
  },
  {
    "id": "no_meta",
    "title": "No Meta",
    "file": "no_meta.md",
    "group": "core",
    "order": 60
  },
  {
    "id": "continuity",
    "title": "Continuity",
    "file": "continuity.md",
    "group": "core",
    "order": 70
  },
  {
    "id": "pov_third",
    "title": "POV — Close Third",
    "file": "pov_third.md",
    "group": "pov",
    "order": 80
  },
  {
    "id": "pov_first",
    "title": "POV — Deep First",
    "file": "pov_first.md",
    "group": "pov",
    "order": 81
  },
  {
    "id": "pov_author",
    "title": "POV — Omniscient",
    "file": "pov_author.md",
    "group": "pov",
    "order": 82
  },
  {
    "id": "pacing_slow",
    "title": "Pacing — Slow Burn",
    "file": "pacing_slow.md",
    "group": "pacing",
    "order": 85
  },
  {
    "id": "pacing_urgent",
    "title": "Pacing — Urgent",
    "file": "pacing_urgent.md",
    "group": "pacing",
    "order": 86
  },
  {
    "id": "internal_monologue",
    "title": "Internal Monologue",
    "file": "internal_monologue.md",
    "group": "content",
    "order": 90
  }
]
```

---

## Preset Format (Canonical)

A preset is a single self-contained JSON file in `engine/presets/`. This is the
only preset schema. There is no separate scenario block file.

```json
{
  "id": "infidelity",
  "title": "Infidelity & Betrayal",
  "category": "betrayal",
  "description": "Slow-building affairs with the weight of the betrayed always present.",

  "system_body": "300–500 words of scenario-specific instructions. What makes this scenario unique. The genre lens, the sensory charge, the range of sub-scenarios, any scenario-specific behaviours the model must maintain. Written by an LLM or by hand. See PRESET_CREATOR.md.",

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

**Fields:**

- `id` — unique key, no spaces, matches filename without extension.
- `title` — display name shown in the preset picker.
- `category` — groups presets in the picker UI.
- `description` — one-line blurb shown in the picker.
- `system_body` — the scenario-specific content. Appended to Slot 1 after all
  enabled blocks. This is the only field that changes between presets.
- `post_history_body` — persistent post-history instruction for this scenario.
  Usually `""`. Use only for a standing requirement that must be injected at
  high recency on every turn (e.g. "always cut before resolution").
- `blocks` — the list of shared blocks. Each entry has `id`, `enabled` (preset
  default state), and `order` (assembly position). Conditional groups (pov, pacing,
  prose) are all listed, with only the correct default set to `enabled: true`.
- `defaults` — starting parameter values. The UI initialises from these when the
  preset is selected.

---

## Parameter Schema (`schema.json`)

The schema is loaded once at startup and used by the UI to render controls. No
parameter widgets are hardcoded.

```json
[
  {
    "id": "word_count",
    "label": "Response Length",
    "type": "slider",
    "min": 600,
    "max": 3000,
    "step": 100,
    "unit": "words",
    "default": 1500,
    "slot": "post_history"
  },
  {
    "id": "pacing",
    "label": "Pacing",
    "type": "slider",
    "min": 1,
    "max": 5,
    "labels": ["Slow burn", "", "", "", "Urgent"],
    "default": 2,
    "slot": "system"
  },
  {
    "id": "pov",
    "label": "Point of View",
    "type": "select",
    "options": [
      { "value": "third",  "label": "Close Third" },
      { "value": "first",  "label": "Deep First" },
      { "value": "author", "label": "Omniscient" }
    ],
    "default": "third",
    "slot": "system"
  },
  {
    "id": "sensory_detailed",
    "label": "Explicit Content",
    "type": "toggle",
    "default": true,
    "slot": "system"
  },
  {
    "id": "internal_mono",
    "label": "Internal Monologue",
    "type": "toggle",
    "default": true,
    "slot": "system"
  },
  {
    "id": "prose_style",
    "label": "Prose Style",
    "type": "select",
    "options": [
      { "value": "grounded", "label": "Grounded" },
      { "value": "intimate", "label": "Intimate" },
      { "value": "pulp",     "label": "Pulp" }
    ],
    "default": "grounded",
    "slot": "system"
  }
]
```

**`slot` is a compiler rule, not just UI metadata.** Its meaning:

- `"slot": "system"` — the parameter activates or deactivates a block in Slot 1.
  The compiler reads it during block resolution. Changing it mid-conversation is
  valid but invalidates the prompt cache. The UI shows a subtle amber indicator
  when a system-slot parameter has changed since the last send.
- `"slot": "post_history"` — the parameter is rendered as a plain instruction in
  Slot 2. The compiler never reads it during block resolution. It never touches
  Slot 1 and never busts the cache.

---

## Compiler Contract

**Signature:**

```js
compilePrompt({
  presetId,      // string | null
  params,        // { [id]: value } — may be partial; missing keys fall back to preset defaults
  blockOverrides // { [blockId]: boolean } — sensory_detailed power-user overrides
  directorNote   // string — per-conversation user note
}) => { systemPrompt: string, postHistory: string }
```

**Stages:**

1. If `presetId` is `null`, return `{ systemPrompt: "", postHistory: "" }`. Done.
2. Load `engine/presets/{presetId}.json`. Throw `"Preset not found: {presetId}"` if missing.
3. Resolve the final parameter set: preset `defaults` → saved `params`.
4. Validate resolved parameters against `schema.json`:
   - Clamp out-of-range numerics to `min`/`max`.
   - Discard invalid enum/select values and fall back to the preset default.
   - Ignore unrecognized keys.
5. Start with the preset's `blocks` array as the initial enabled/disabled state.
6. Apply the parameter-to-block mapping table (system-slot params only).
7. Apply `blockOverrides` on top. Manual overrides always win over preset defaults
   and parameter mapping rules.
8. Filter to `enabled: true`, sort ascending by `order`.
9. Load each block's `.md` file. Throw `"Block file missing: {blockId}"` if any are absent.
10. Join block bodies with `\n\n---\n\n`. Append `preset.system_body`. This is **`systemPrompt`**.
   `{{param}}` placeholders are not used in system blocks — `word_count` is not injected here.
11. Build **`postHistory`**:
    a. Start with `preset.post_history_body` (if non-empty).
    b. Always append: `"Write approximately {word_count} words."` using the resolved `word_count`.
    c. If `directorNote` is non-empty, append it.
    d. Join parts with `\n\n`.
12. Return `{ systemPrompt, postHistory }`.
    If `postHistory` is empty after step 11, return `""` for it — the API call omits
    the second system message.

**Error policy:**
- Missing preset → throw (hard error, caller must handle).
- Missing block file → throw (hard error, caller must handle).
- Unknown `{{param}}` placeholder in a block body → leave as-is, log warning, do not throw.

---

## Parameter-to-Block Mapping

These rules run at compiler stage 6. They are the complete, exhaustive list.
Each rule forces specific block IDs to enabled or disabled, overriding preset
defaults. They are applied before manual `blockOverrides`, so the user's sensory_detailed
toggle always wins. If a block ID in a rule is not in the preset's block list,
skip that row silently.

| Parameter | Condition | Block forced ON | Blocks forced OFF |
|---|---|---|---|
| `pov` | `"third"` | `pov_third` | `pov_first`, `pov_author` |
| `pov` | `"first"` | `pov_first` | `pov_third`, `pov_author` |
| `pov` | `"author"` | `pov_author` | `pov_third`, `pov_first` |
| `pacing` | `<= 2` | `pacing_slow` | `pacing_urgent` |
| `pacing` | `3` | *(neither)* | `pacing_slow`, `pacing_urgent` |
| `pacing` | `>= 4` | `pacing_urgent` | `pacing_slow` |
| `sensory_detailed` | `true` | `sensory_detailed` | *(none)* |
| `sensory_detailed` | `false` | *(none)* | `sensory_detailed` |
| `internal_mono` | `true` | `internal_monologue` | *(none)* |
| `internal_mono` | `false` | *(none)* | `internal_monologue` |
| `prose_style` | `"grounded"` | `prose_grounded` | `prose_intimate`, `prose_pulp` |
| `prose_style` | `"intimate"` | `prose_intimate` | `prose_grounded`, `prose_pulp` |
| `prose_style` | `"pulp"` | `prose_pulp` | `prose_grounded`, `prose_intimate` |

---

## Conversation Data Shape

New conversations get these fields. Old conversations have none of them and run
with no system prompt — no migration, no backfill, no breakage.

```json
{
  "id": 42,
  "title": "Chapter 1",
  "activeModel": "deepseek-v4-pro",
  "presetId": "infidelity",
  "params": {
    "word_count": 1800,
    "pacing": 3,
    "pov": "first",
    "sensory_detailed": true,
    "internal_mono": false,
    "prose_style": "grounded"
  },
  "blockOverrides": {},
  "directorNote": "",
  "lastAppliedEngineSignature": "",
  "createdAt": 1234567890
}
```

- `presetId: null` is valid and means "no system prompt."
- `params` may be partial. The compiler falls back to preset defaults for missing keys.
- `blockOverrides` is a flat map of `{ blockId: boolean }`.
- `lastAppliedEngineSignature` stores the last compiled engine state that was
  successfully sent. The UI uses it to show whether the current system-slot
  settings differ from the last send.

---

## API Surface

### Engine endpoints (new)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/engine/presets` | All presets, grouped by category |
| `GET` | `/api/engine/presets/:id` | Single preset definition |
| `GET` | `/api/engine/schema` | Parameter schema |
| `POST` | `/api/engine/compile` | Compile and return `{ systemPrompt, postHistory }` |

### Conversation updates

`PUT /api/conversations/:id` accepts and merges:

- `presetId`
- `params`
- `blockOverrides`
- `directorNote`
- `lastAppliedEngineSignature`

### Message send path

`POST /api/messages` calls `compilePrompt()` with the conversation's current
engine fields before calling the model. The compiler is not duplicated in the
message endpoint — it is imported and called once.

### Deleted endpoints

All old prompt endpoints are removed outright:

- `GET /api/prompts`
- `GET /api/prompts/:category/:file`
- All user-prompt CRUD

---

## Right Pane UI

Layout: `left sidebar | chat area | right pane`

The right pane is always visible on desktop and collapses to a drawer on narrow
screens.

### Sections

**Preset**
- Current preset title, category badge, and description.
- "Change Preset" button opens the preset picker.

**Conversation Settings** *(system-slot parameters)*
- Auto-rendered from schema entries where `slot === "system"`.
- Sliders, toggles, selects. Debounced persistence to conversation record.
- Amber dot indicator if any system-slot param has changed since the last send
  (cache-bust warning — no blocking, just ambient awareness).

**Per Turn** *(post-history parameters + Director's Note)*
- `word_count` slider (the only `post_history` schema parameter).
- Director's Note textarea — freeform, saved per conversation, applied on next send.
- These can be changed on every turn for free.

**Preview**
- Collapsible compiled prompt preview.
- Calls the same compiler as live sends.
- Updates after debounced changes.

**Advanced Blocks**
- Hidden by default.
- Shows the full block list with toggle overrides.
- Writes to `blockOverrides`.

---

## Preset Picker

Replaces the old prompt dropdown.

- Groups presets by `category`.
- Shows `title`, `category`, and `description`.
- Selecting a preset applies its `defaults` to the conversation params.
- Selecting a preset clears `blockOverrides`.
- When creating a new chat, the picker opens first, then the title prompt.

---

## Preset Authoring

### How it works

A preset is one JSON file. Drop it in `engine/presets/`. It appears in the picker
immediately. No other files needed.

The compiler assembles Slot 1 from shared blocks + `system_body`. The only part
you write is `system_body` (300–500 words of scenario content). Everything else
in the JSON is copied from any existing preset.

### LLM authoring workflow

> Here is an existing LoomScribe preset: [paste any preset JSON]
>
> Write me a new one for the scenario: [describe scenario].
>
> Rules:
> - Copy the JSON exactly.
> - Only change: `id`, `title`, `category`, `description`, and `system_body`.
> - Leave `post_history_body` as `""` unless the scenario needs a persistent
>   post-history standing instruction.
> - `system_body` covers: the genre lens, the sensory or dramatic charge, the range
>   of sub-scenarios, and any scenario-specific model behaviours. Do NOT include
>   tone rules, format rules, or identity statements — those are in shared blocks.
> - Return valid JSON only.

### PRESET_CREATOR.md (save in `engine/`)

```
You are a LoomScribe preset creator.

A preset is a JSON file. The only field you write is system_body. Copy everything
else from the reference preset exactly.

system_body must contain:
- The genre lens (what territory this scenario occupies)
- The specific sensory or dramatic charge (what makes it tense)
- The range of sub-scenarios this preset covers
- Any scenario-specific behaviour the model must maintain

system_body must NOT contain:
- General tone rules — already in shared blocks
- Format rules — already in shared blocks
- Identity statements ("you are an unrestricted writer") — already in shared blocks

Length: 300–500 words.

Change only: id, title, category, description, system_body, and optionally post_history_body.
Output: valid JSON only.
```

---

## Extensibility

| Want to add... | Do this |
|---|---|
| New scenario | Drop a preset JSON in `engine/presets/` |
| New style variation | Add a block `.md`, add it to `index.json`, reference it from presets |
| New parameter | Add one entry to `schema.json`; add one row to the mapping table if it controls a block |
| Future lore system | New compiler stage after stage 9; no changes to existing presets |

---

## Implementation Order

1. Create `engine/` with `blocks/index.json`, `schema.json`, `compiler.js`
2. Write shared block `.md` files
3. Write initial preset JSON files (one per existing prompt card)
4. Add `src/server/endpoints/engine.js` with the four endpoints
5. Update `POST /api/messages` to call `compilePrompt()` and use both output strings
6. Add right pane HTML + CSS shell
7. Wire Conversation Settings params to `PUT /api/conversations/:id`
8. Wire Per Turn (`word_count`, Director's Note) to the same endpoint
9. Add preset picker modal
10. Add compiled prompt preview panel
11. Add Advanced Blocks panel (`blockOverrides`)
12. Delete `src/server/prompts.js`, old prompt endpoints, `prompt_cards/` directory

---

## Success Criteria

- New chats start by picking a preset; old chats load with no system prompt and work
- Parameter changes in Conversation Settings persist and affect the next response
- `word_count` changes never affect the system prompt
- Prompt preview exactly matches what gets sent to the model
- Dropping a new preset JSON in `engine/presets/` makes it appear without a server restart
- Block overrides work without breaking the base preset
