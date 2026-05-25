# 🌌 LoomScribe System Prompt Cards

System Prompt Cards are modular, plain-text Markdown (.md) templates that define the persona, tone, guidelines, and behavioral boundaries of your DeepSeek writing companion. They enable writers to instantly hot-swap story environments, narrative styles, text generators, and character roleplay profiles.

---

## 📁 Directory Structure (Desktop Mode)

On the desktop version, LoomScribe dynamically scans the `prompt_cards/` folder in the root directory at startup. The subdirectories under `prompt_cards/` automatically define the **categories** in the UI dropdown selector.

Here is an example layout:

```text
loomscribe/
└── prompt_cards/
    ├── story-writing/          <-- Category: "Story Writing"
    │   ├── dark_fantasy.md     <-- Prompt Card File
    │   └── sci_fi_hard.md
    │
    └── generators/             <-- Category: "Generators"
        ├── premise_generator.md
        └── name_generator.md
```

> [!NOTE]
> - Category directories and prompt files starting with a dot `.` are automatically ignored.
> - On Windows/Linux, dropping a new `.md` card or folder into `prompt_cards/` and refreshing the page/server immediately registers it in the dropdown.

---

## 📝 File Formatting Standard

To be recognized and parsed correctly by the auto-discovery engine, each prompt card must strictly adhere to the following Markdown format:

```markdown
# System Prompt: Dark Fantasy Storyteller

You are a master novelist of dark, gritty fantasy stories. Guide the narrative with high stakes, complex moral dilemmas, and rich, sensory-driven prose. Avoid clichés, keep descriptions tactile and atmospheric, and let characters speak in distinct voices.
```

### 🔍 Anatomy of a Prompt Card:
1. **The Header Line:** The first line of the file must start with `# System Prompt: ` followed by the **Display Name** of your prompt.
   * *Regex pattern matched:* `/^#\s+System Prompt:\s+(.+)/i`
   * *Fallback:* If this header line is missing, the engine will fallback to formatting the file name (e.g. `dark_fantasy_sys_prompt.md` becomes "Dark Fantasy Sys Prompt").
2. **Body:** The content that immediately follows the header (optionally separated by `---` or empty lines) represents the actual system instructions injected into the DeepSeek chat session. 

> [!IMPORTANT]
> When sending your history to the DeepSeek API, the LoomScribe engine **automatically strips** the `# System Prompt:` header line and any trailing dividers so that the model receives only the clean, raw instruction block.

---

## ⚡ How They Work Across Runtimes

LoomScribe supports two distinct database runtimes, both sharing the same visual interface:

### 1. Desktop Mode (Node.js)
* **Storage:** Files are read directly from the host filesystem in `prompt_cards/`.
* **Discovery:** The server's file scanner (`src/server/prompts.js`) crawls the subfolders, extracts headers, and serves them via the `GET /api/prompts` endpoint on page refresh.

### 2. Standalone Mobile Mode (Android WebView)
Because mobile WebViews restrict direct access to local phone directories for security, LoomScribe implements a serverless local approach:
* **Pre-bundled Starters:** An offline starter pack is bundled directly inside `js/starter_prompts.js` so the app is immediately populated with cards on first install.
* **IndexedDB User Prompts:** Custom cards are saved and edited directly inside the device's secure local IndexedDB (`loomscribe_db`).
* **Direct File Imports:** You can load single `.md` files using the app's settings drawer file picker. It reads the file locally, parses the header title, and saves it instantly as an active prompt profile.
* **Bulk ZIP Imports:** You can select a `.zip` file containing organized folders of prompt cards. LoomScribe will dynamically extract the archive, reconstruct the folder structures into categorised dropdown keys, and import them all in bulk.

---

## 💡 Best Practices for Writing Prompts

When crafting system profiles, take full advantage of DeepSeek’s reasoning capabilities:
1. **Define the POV and Style:** Instruct the model on tense, perspective (e.g. "Third Person Limited"), and prose limitations (e.g. "Write in short, sharp sentences").
2. **Establish the "Anti-Goals":** Explicitly outline what the storyteller should *never* do (e.g. "Do not summarize active conversations," "Do not resolve conflicts quickly").
3. **Use Markdown inside the Prompt:** You can use bullet points or blockquotes within the card file to make the rules easier for the model to parse.
