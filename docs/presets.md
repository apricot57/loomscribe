# Presets & Prompt Engine Blocks

Presets define the narrative scenario, tone, world rules, and default parameters for a conversation.

---

## 🎭 What is a Preset?

A preset is a single JSON structure containing metadata, baseline system instructions, and optional parameter defaults.

### JSON Structure

```json
{
  "id": "cyberpunk_neon",
  "title": "Cyberpunk Noir",
  "category": "speculative",
  "description": "Rain-soaked megacity intrigue with dense sensory detail and gritty slang.",
  "system_body": "You are a cyber-noir author. Write with clipped prose, high atmospheric tension, and vivid corporate-dystopian tech vocabulary.",
  "post_history_body": "",
  "defaults": {
    "pov": "first",
    "prose_style": "general",
    "word_count": 1500,
    "outline_mode": false,
    "premises_mode": false,
    "suggest_choices": false
  }
}
```

---

## 🛠️ Adding New Presets

You can add or modify presets in three ways:

1. **In-App Preset Manager**: Click the Preset Chip in the chat header → **Manage Presets** → **+ New Preset**.
2. **JSON Files in `engine/presets/`**: Place any `.json` preset file directly in `engine/presets/`. It will be automatically registered on server startup or reload.
3. **Preset Dropzone**: Drag and drop any `.json` preset file onto the dropzone in the Preset Manager modal.

---

## 🤖 Generating Presets with LLMs

To generate complete, schema-compliant presets using ChatGPT, Claude, or DeepSeek, copy the instructions from [`engine/PRESET_CREATOR.md`](../engine/PRESET_CREATOR.md) and prompt the model with your desired narrative genre or scenario.

---

## 📚 Deep Dive Documentation

For a comprehensive technical breakdown of prompt block resolution, registry ordering, and compiler details, see [`prompt-engine.md`](../prompt-engine.md).
