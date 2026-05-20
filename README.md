# 🌌 VibeChat — DeepSeek V4 Workspace

A lightweight, visually stunning, and responsive vanilla HTML/CSS/JS frontend for interacting with the DeepSeek API. Featuring a premium **ChatGPT-style multi-pane layout** styled in a high-contrast **Neon Green (Cyberpunk / Matrix)** theme. No heavy frameworks, no build steps—just pure modern vibes.

![VibeChat Header](https://raw.githubusercontent.com/google/material-design-icons/master/png/action/visibility/white/2x/elg_visibility_white_48dp.png) *(Modern, clean, developer-focused chat workspace)*

---

## ✨ Features

- **Vivid Cyberpunk Aesthetics**: A sleek dark mode using deep charcoal and pitch black backdrops, highlighted by toxic glowing neon green accents (`#00ff66`), custom focus-ring glows, and smooth transitions.
- **DeepSeek V4 Support**: Fully integrated with the latest generation DeepSeek V4 models:
  - 🤖 **DeepSeek V4 Pro**: Flagship 1.6T parameter reasoning and high-intelligence model for advanced coding and deep analysis.
  - ⚡ **DeepSeek V4 Flash**: High-speed, highly-efficient 284B parameter variant for instant, low-latency completions.
- **Dynamic Model Selector**: Switch between models instantly through a custom dropdown in the chat header, automatically updating the active inference model.
- **Client-Side Key Management**: Securely input and save your DeepSeek API key in the sidebar settings menu (🔑). Your key is stored in your browser's private `localStorage` and never leaves your machine.
- **Real-Time API Status**: Dynamic green status dot in the sidebar pulses visually when an API Key is loaded and ready.
- **Persistent Chat History**: Automatically logs and restores conversations using local storage, keeping your threads intact between page refreshes.
- **Interactive Micro-Animations**: Features smooth message fade-ins, glowing outline button transitions, and a pulsing three-dot typing indicator.
- **ChatGPT-Style Layout**: Left-pane collapsible sidebar for settings and conversation actions, with a right-pane chat area centered around a `720px` highly readable conversation channel.

---

## 🚀 Getting Started

Get the application running locally in seconds:

### 1. Clone or Download the Workspace
Ensure you have the following core files in the same folder:
- `index.html`
- `style.css`
- `app.js`

### 2. Launch the Web App
Open `index.html` directly in any modern web browser (Double-click the file, or use a local dev server like VS Code's *Live Server* or `npx http-server`).

### 3. Enter Your DeepSeek API Key
1. In the left-hand sidebar under **Settings**, click on **DeepSeek API Key** (🔑).
2. Paste your DeepSeek API Key (e.g., `sk-...`) in the password-masked modal.
3. Click **Save Key**. The status indicator dot in the sidebar will immediately light up with a pulsing neon green glow!
4. Select your model of choice from the top-middle dropdown (**DeepSeek V4 Pro** or **DeepSeek V4 Flash**).
5. Send your message and start chatting!

> [!TIP]
> **API Key Safety**: Your API key is persisted strictly in the browser's `localStorage` and is dispatched directly to the official DeepSeek API endpoints. It is never synced to external cloud services or databases.

---

## 🛠️ Project Structure

```
vibe-api/
├── index.html           # HTML5 structure, settings sidebar, model selection menu, modals
├── style.css            # Custom CSS3 theme, glassmorphic effects, pulsing neon glows, responsive styles
├── app.js               # Event routing, local storage key binding, dynamic model toggling, API fetch logic
└── README.md            # Project documentation and setup guide
```

---

## 🔮 Future Roadmap

- [ ] **Secure Proxy Backend**: Shift API calls from client-side `fetch` to a lightweight Node.js/Express backend to safeguard API keys in team production environments.
- [ ] **Markdown Rendering**: Integrate a lightweight library like `marked.js` or `showdown` to support markdown tables, code blocks, lists, and bold text styling.
- [ ] **Chat Settings Adjuster**: Add temperature and system prompt sliders in the sidebar for customized response behaviors.
- [ ] **Conversation Exporter**: Provide options to download current threads as Markdown or JSON documents.
