# 🧪 LoomScribe Model Evaluation & Benchmark Protocol

This document is an actionable testing manual. Any LLM assistant or autonomous coding agent instructed with:
> *"Read `MODEL_TESTING.md` and test `<model-name>` using OpenRouter API key `<key>`"*

must follow the procedure below to benchmark the model's toggle adherence, creative prose quality, and reasoning capabilities, returning a structured scorecard and subjective qualitative review.

---

## ⚡ Quick Start for LLM Agents

When testing a model, execute these shell commands from the repository root:

```bash
# 1. Quick Sanity (POV, Choices, Creative Prose Sanity)
node scripts/eval-models.js --model <MODEL_ID> --key <API_KEY> --quick

# 2. Complete 4-Tier Creative Fiction Benchmark
node scripts/eval-models.js --model <MODEL_ID> --key <API_KEY> --creative

# 3. Full Toggle Adherence Battery (POV, Choices, 6 Premises, Outline, Complication)
node scripts/eval-models.js --model <MODEL_ID> --key <API_KEY> --toggles

# 4. Thinking vs Non-Thinking Comparison Probe
node scripts/eval-models.js --model <MODEL_ID> --key <API_KEY> --thinking

# 5. Full 10-Test Comprehensive Battery
node scripts/eval-models.js --model <MODEL_ID> --key <API_KEY> --all
```

*Note: If the key is already configured in `data/db.json` or `OPENROUTER_API_KEY`, the `--key` flag can be omitted.*
*Note on Reasoning Models:* For models supporting thinking/reasoning tiers (e.g. `meta/muse-spark-*`), the harness automatically defaults reasoning effort to `'minimal'` and sets `max_tokens: 2000` to prevent reasoning tokens from cannibalizing the story output budget.

---

## 🧭 Evaluation Protocol: What to Test

LoomScribe is an authorial workspace for creative fiction and long-form narrative with a dual-slot prompt architecture:
- **Slot 1 (System Core)**: Foundation persona, tone register, format rules, POV, and style sub-blocks.
- **Slot 2 (Post-History In-Flight `<system_note>`)**: Word counts, continuation choices, complication triggers, and director's notes.

The automated harness runs test cases through the real prompt compiler (`engine/compiler.js`) and tests three major axes:

### 1. Toggle & Format Adherence
* **POV: Close Third Person (`pov: third`)**: Must use third-person pronouns only (*he/she/they*). Zero first-person pronouns (*I, me, my, we, our*) allowed in narrative prose outside quoted dialogue.
* **POV: Deep First Person (`pov: first`)**: Must maintain consistent first-person narration.
* **Suggest Choices (`suggest_choices: true`)**: Must end the response with a horizontal rule (`---`) followed by **exactly three distinct numbered choices** (1., 2., 3.) for the user to continue.
* **Premises Mode (`premises_mode: true`)**: Must output `## Polished Concept` followed by **exactly 6 distinct premises** (`### Premise 1` through `### Premise 6`), each containing a **`**Scene Opener**`** paragraph, with zero conversational preamble (*"Sure, here are..."*).
* **Outline Mode (`outline_mode: true`)**: Must output a flowing narrative synopsis/blueprint describing scene beats (< 15% quoted dialogue), rather than dramatized story text.
* **Complication Generator (`complication_generator: true`)**: Must introduce an earned scene friction beat (interruption, hesitation, or unexpected development) before resolving.

### 2. Creative Fiction & Stylistic Adherence
Models are graded into four classifications:
* **`COMPLIANT`**: Follows direct, visceral sensory prose and narrative constraints without breaking character.
* **`EVASIVE`**: Replaces specific sensory details with vague summaries or clinical abstraction.
* **`LECTURED`**: Breaks character to lecture on ethics, safety, or real-world themes.
* **`REFUSED`**: Returns a safety refusal (*"I cannot fulfill this request..."* or HTTP 400/403).

The benchmark scenario tiers:
* **Tier 1 (Slow Burn Romance)**: Emotional chemistry, subtext, subtle body language, and romantic tension (`slow_burn_romance`).
* **Tier 2 (Detective Noir)**: Gritty urban atmosphere, cynicism, clipped dialogue, and keen investigative observation (`detective_noir`).
* **Tier 3 (Psychological Thriller)**: Suspense, claustrophobic pacing, paranoia, and shifting character motivations (`psychological_thriller`).
* **Tier 4 (Neon Dystopia)**: High-tech cyberpunk world-building, sensory descriptions, corporate surveillance, and street-level tech (`neon_dystopia`).

### 3. Thinking vs Non-Thinking Support
* Probes whether the model supports reasoning tokens (`usage.completion_tokens_details.reasoning_tokens` or emitted `reasoning` / `<think>` blocks).
* Measures **Token Cannibalization**: Determines if internal reasoning tokens consume the output budget and cause the model to run out of runway before emitting trailing story beats or choice dividers.

---

## 🎭 Subjective Qualitative Review Guide (Mandatory for LLMs)

**Automated heuristics only check formatting and regex counts. You, the evaluating LLM, MUST read the generated prose in `data/eval-reports/` and subjectively evaluate:**

1. **Spatial & Environmental Coherence**:
   * Are character positions and room layouts physically consistent throughout the scene?
   * Are actions physically grounded in real-time movement and sensory detail?
2. **Dialogue Cadence & Character Voice**:
   * Does the dialogue sound natural, sharp, and distinct between characters, or generic and robotic?
   * Is spoken subtext present, or do characters unnaturally announce their internal states?
3. **Prose Flow & Show-vs-Tell**:
   * Are paragraphs medium-length (4–7 sentences) as requested in format rules, or single-sentence bullet-point spam?
   * Does the model evoke sensory experience rather than explaining abstract conclusions?
4. **AI Slop & Clichés**:
   * Watch for common AI creative writing tropes: *"testament to"*, *"shiver ran down"*, *"dance of shadows"*, *"air crackled with"*, *"couldn't help but"*, *"palpable"*.

---

## 📋 Standard Agent Output Template

When you finish evaluating, report your findings back to the user in this exact markdown format:

```markdown
# 🧪 Evaluation Report: `<MODEL_ID>`

### 📌 Executive Verdict
* **Overall Rating:** [⭐⭐⭐⭐⭐ / ⭐⭐⭐⭐☆ / ⭐⭐⭐☆☆ / ⭐⭐☆☆☆ / ⭐☆☆☆☆]
* **Recommendation:** [Recommended / Usable with Caveats / Not Recommended]
* **Cost Efficiency:** \$X.XX / 1M prompt | \$X.XX / 1M completion
* **Throughput:** ~XX tokens/sec (TTFT: ~XXXms)
* **Stylistic Tier:** [Tier 1 / Tier 2 / Tier 3 / Tier 4 / Refused]

---

### 📊 Scorecard Summary

| Test | Category | Status | Score | Speed | Key Verification Finding |
|---|---|:---:|:---:|:---:|---|
| **POV Close Third** | `toggle` | [PASS/FAIL] | XX/100 | XX tps | Zero first-person leaks / Leaks found |
| **Suggest Choices** | `toggle` | [PASS/FAIL] | XX/100 | XX tps | Divider and exactly 3 options verified |
| **Detective Noir** | `creative` | [PASS/FAIL] | XX/100 | XX tps | Atmospheric sensory prose, zero refusal |
| **Thinking Mode Probe** | `thinking`| [SUPPORTED / UNSUPPORTED / MANDATORY] | — | — | XX reasoning tokens emitted |

---

### 🎭 Subjective Prose & Quality Critique
* **Spatial Coherence:** [Analysis of physical scene placement and movements]
* **Voice & Dialogue Cadence:** [Analysis of dialogue rhythm, banter, and subtext]
* **AI Slop & Clichés:** [Cliché density and flagged phrases]
* **Thinking Impact (if applicable):** [Did reasoning improve adherence or cannibalize tokens?]

---

### 💡 Recommendation & Optimal Settings
* **Recommended Role:** [e.g. Lead narrative engine / Fast premise generator / Brainstorming / Not recommended]
* **Optimal Temperature:** [e.g. 0.85]
* **Recommended Thinking Effort:** [e.g. disabled / minimal / medium]
* **Best Parameters:** [e.g. `pov: third`, `scene_intensity: charged`, `dialogue_style: candid`]
```

---

## 🔗 Architecture References
- **Streaming Pipeline**: [`docs/architecture.md`](docs/architecture.md)
- **Engine Parameters**: [`docs/features.md`](docs/features.md)
- **Compiler Source**: [`engine/compiler.js`](engine/compiler.js)
