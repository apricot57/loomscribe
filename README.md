# 🌌 VibeChat — Material Expressive DeepSeek Workspace

A lightweight, visually gorgeous, and responsive vanilla HTML/CSS/JS frontend for interacting with the DeepSeek API. Fully customized using a premium **Material Design Expressive (Material 3)** system, featuring organic contours, a vibrant Sky Blue & Turquoise expressive dark theme, and fluid transitions. Zero heavy frameworks, zero compilation—pure responsive design.

![VibeChat Header](https://raw.githubusercontent.com/google/material-design-icons/master/png/action/visibility/white/2x/elg_visibility_white_48dp.png) *(Tactile, premium developer-focused chat workspace)*

---

## ✨ Features

- **Material Expressive Aesthetics**: Sleek organic dark mode built on deep oceanic obsidian and slate backdrops, styled with dynamic sky blue highlights (`#38bdf8`), vibrant teal/turquoise secondary highlights (`#2dd4bf`), and clean cyan gradients.
- **Organic Tactile Shapes**: Styled with playfulness and character:
  - **M3 Sidebar Drawer**: Rounded drawer panel featuring navigation pill settings and connections.
  - **M3 Squircle Extended FAB**: Fully customized squircle Floating Action Button (`border-radius: 20px`) with vibrant sky-blue/cyan depth for chat resets.
  - **ChatGPT-style Message Layout**: Flat, borderless, transparent bot rows next to circular avatars, and user message bubbles styled as flat, symmetric pill bubbles in sleek slate grey-blue (`#1e293b`) with no tails.
  - **Giant Pill Chat Input**: A massive, tactile cozy pill container (`border-radius: 9999px`) floating centered inside the reading viewport.
- **Outfit Typography**: Features Google Fonts' **Outfit** for all titles, messages, and configurations, offering highly readable and tailored sans-serif geometric lines.
- **DeepSeek V4 Integration**: Ready for the latest DeepSeek V4 dynamic model endpoints:
  - 🤖 **DeepSeek V4 Pro**: Flagship 1.6T parameter reasoning model optimized for deep coding and complex intelligence.
  - ⚡ **DeepSeek V4 Flash**: High-speed, efficient 284B parameter variant for latency-critical generations.
- **Dynamic Model Selector Pill**: A cute rounded chip selector floating directly above the bottom chat box. Opens upwards cleanly so it never covers your input fields or clips off-screen.
- **Client-Side Key Management**: Input and clear your DeepSeek API key securely through the sidebar settings menu (🔑). Keys persist exclusively in your private browser `localStorage`.
- **API Connection Indicators**: Tonal pulsing rose warning light turns to a soft green pulsing glow when an API key is saved and active.
- **IndexedDB Multi-Thread Chat History**: Powered by the lightweight `Dexie.js` wrapper, VibeChat supports unlimited local-first conversation logs, a dynamic sidebar navigation drawer listing recent chats, first-prompt auto-titling, thread-specific model restoration, and clean thread deletion cascade actions.
- **System Prompt Profiles**: Choose from categorized factory prompts (auto-discovered from `prompt_cards/` subfolders) or create/edit/delete your own through the UI. Per-conversation prompt selection with a footer selector dropdown.
- **New Chat Dialog**: Click "New Chat" to open a modal where you name the conversation and pick a system prompt before starting.
- **Markdown Conversation Export**: Download the active path of the conversation thread at any time as a formatted `.md` file, complete with conversation title and the active system prompt, excluding any inactive retries or alternate paths.

---

## 🚀 Getting Started

### Option A: One-Click Launch (Recommended)
Double-click `start-vibechat.bat` — it starts the server, opens the app in your browser, and waits for you to press any key to stop.

### Option B: Manual Server
```bash
node server.js
```
Then open `http://localhost:3000`. The server enables automatic discovery of factory system prompts from `prompt_cards/` subfolders.

### Option C: Basic Mode (No Server)
Double-click `index.html` in your file explorer. Works without a server, but factory prompt cards won't be available (user-created prompts and the default prompt still work).

### Enter Your Credentials
1. In the rounded left sidebar drawer under **Settings**, click on **DeepSeek API Key** (🔑).
2. Paste your private DeepSeek API Key (e.g., `sk-...`) inside the password-masked modal.
3. Click **Save Key**. The status indicator dot in the sidebar will immediately turn into a pulsing soft green light!
4. Select your preferred inference model from the bottom-left dropdown pill (**DeepSeek V4 Pro** or **DeepSeek V4 Flash**).
5. Message DeepSeek and enjoy the fluid, tactile responses!

---

## 🛠️ Project Structure

```
vibe-api/
├── index.html           # HTML5 structure, settings sidebar, Outfit fonts, modals
├── style.css            # Material Expressive theme, variables, pill/FAB shapes, transitions
├── app.js               # Event routing, API key storage, model payloads, system prompt profiles
├── server.js            # Zero-dependency Node.js server (static files + prompt API)
├── favicon.png          # App icon asset
├── start-vibechat.bat   # One-click launcher for Windows
├── prompt_cards/        # Factory system prompts in category subfolders (gitignored)
└── README.md            # Setup guide and documentation
```

---

## 🔮 Future Roadmap

- [ ] **Secure Proxy Backend**: Move client-side `fetch` routines to a lightweight Node.js/Express proxy server to safeguard credentials in public deployments.
- [x] **Markdown Renderer**: Link a lightweight script like `marked.js` to parse bullet lists, bold highlights, and code formatting blocks inside the assistant bubbles.
- [ ] **Dynamic Prompt Sliders**: Add settings panel sliders to adjust temperature, max tokens, or system-level developer instructions.
- [x] **Stop Generation Button**: Cancel an in-progress AI response with an abort signal on the fetch request.
- [x] **Streaming Responses**: Switch from awaiting the full response to real-time token streaming via the DeepSeek SSE endpoint for a more responsive chat feel.
- [ ] **Code Syntax Highlighting**: Integrate a lightweight highlighter (e.g. highlight.js) to colorize code blocks within rendered markdown.
- [x] **Conversation Export**: Download individual chat threads as `.md` files for portability.
- [ ] **Dark / Light Theme Toggle**: Add a Material You light theme variant with a toggle in the sidebar settings.
- [ ] **Token Usage & Cost Tracker**: Display token counts per message and estimate cost per conversation session.
- [x] **System Prompt Profiles**: Categorized factory prompts auto-discovered from subfolders, plus user-created prompts via the UI. Per-conversation selection.
