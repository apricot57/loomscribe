# 🌌 VibeChat — Premium Creative Writing & Storytelling Workspace

VibeChat is a lightweight, responsive, and visually stunning vanilla HTML/CSS/JS frontend specifically tailored for **collaborative storytelling, sensory fiction, and creative writing** powered by the DeepSeek API. 

Built on a premium **Material Design Expressive (Material 3)** aesthetic, VibeChat delivers a clean, immersive, and glassmorphic canvas with fluid micro-animations, customizable prompt profiles, and comprehensive timeline branching. Zero heavy frameworks, zero compilation—just pure responsive design.

---

## ✨ Primary Creative Features

### 🖋️ 1. Dynamic Story continuation (`[continue]` Button)
- **One-Click Sequel Triggers**: A premium glassmorphic **"Continue" button** (`#continue-btn`) appears right above the input text field. Clicking it instantly submits `[continue]`, letting you extend scenes, narratives, and story beats without manual typing.
- **Smart Visibility State**:
  - **Appears Automatically**: Shows up only when the last message in the thread is from the assistant.
  - **Suppressed During Generation**: Hides automatically while text is active and streaming.
  - **Hidden in Empty Chats**: Stays out of the way when starting fresh threads or user-only turns.

### 🌿 2. Deep Narrative Branching & History Versioning
- **Timeline Forking**: Edit any past prompt or story segment inline. VibeChat automatically forks the conversation history, creating distinct version groups (`versionGroupId`).
- **Interactive Pager Indicators**: Toggle back and forth between different story directions, alternate sensory endings, or plot deviations using neat in-message pager buttons.
- **Lossless History Preservation**: Your older story drafts, deleted pathways, and retries are kept safe in your local timeline database.

### 📖 3. Content-First Writing Canvas
- **Distraction-Free Layout**: Removed distracting person/robot avatars next to conversation blocks.
- **Widescreen Reading Comfort**: Expanded message containers to utilize the newly recovered space, ensuring paragraphs flow naturally with optimal horizontal rhythm.
- **Outfit Typography**: Google Fonts' **Outfit** geometric lines styled specifically for comfortable, long-form creative reading.

### 🔒 4. Premium In-App overlays & Privacy
- **Secure Key Management**: Enter your DeepSeek API key inside a password-masked modal. Keys are saved securely on the server-side database (`data/db.json`) and never exposed to the client-side browser logic.
- **In-App Custom Confirmation Overlays**: Replaced generic browser alert windows with a cohesive, glassmorphic deletion confirmation overlay (`#delete-confirm-modal`), protecting you from accidental draft deletions while matching the app's dark-slate styling.
- **Visual API Indicators**: Soft pulsing indicator dots (pulsing rose when keyless, pulsing green when configured) provide instant status updates.

### 📝 5. Prompt & Genre Profiles
- **System Prompts**: Select pre-set genre cards (e.g. *Creative Writing*) loaded from subfolders, or create, edit, and delete your own system prompts directly in-app.
- **Active Export**: Formats and exports the active line of your story as a clean Markdown (`.md`) file, stripping out unused branching alternatives and retries.

---

## 🛠️ Project Structure

```
vibe-api/
├── index.html           # HTML5 structure, control bar, settings sidebar, custom modals
├── style.css            # Material Expressive theme, M3 shapes, custom glassmorphism, animations
├── app.js               # Logic controller, SSE streaming, branching handlers, API key management
├── server.js            # Zero-dependency local Node.js server & JSON API manager
├── favicon.png          # App branding asset
├── start-vibechat.bat   # One-click launcher for Windows hosts
├── data/
│   └── db.json          # Portable local JSON database storing all chats, prompt cards, and settings
└── README.md            # App documentation & guides
```

---

## 🚀 Quick Start

### Method A: One-Click Launch (Windows)
Double-click `start-vibechat.bat` inside the workspace. This automatically boots the local Node.js server, initializes your local database, and launches VibeChat directly in your default web browser.

### Method B: Manual Command-Line Launch
1. Launch the server from your terminal:
   ```bash
   node server.js
   ```
2. Navigate to `http://localhost:3000` in your web browser.

### Configuring for Narrative Writing
1. Click **DeepSeek API Key** (🔑) in the sidebar drawer.
2. Paste your API Key (`sk-...`) and click **Save Key**. The key status indicator will turn green.
3. Select your model chip above the input box (**DeepSeek V4 Pro** for heavy reasoning, **DeepSeek V4 Flash** for faster narrative sketching).
4. Click **New Chat** (➕), name your scene, select your custom System Prompt, and start writing!

---

## 🔮 Active Roadmap

- [x] **Secure Backend Proxy**: Kept API keys hidden from client-side network inspectors.
- [x] **Streaming Generator**: Stream tokens block-by-block with full markdown rendering.
- [x] **Stop / Abort Signal**: Halt AI text generation instantly.
- [x] **Interactive Timelines**: Edit history and branch off into new story iterations.
- [x] **Dynamic Continuation**: Dedicated pill button to instantly trigger story sequels.
- [x] **In-App Modal Overlays**: Smooth custom alerts replacing browser popup boxes.
- [ ] **Multi-Author Collaboration**: Export/Import individual branch state databases to collaborate with other writers.
- [ ] **Dark/Light Expressive Themes**: Add an optional expressive warm vanilla light mode.
