# 🗺️ Implementation Plan: ChatGPT-Style Workspace & DeepSeek V4 Integration

We have successfully overhauled VibeChat from a centered, mobile-style floating card layout into a full-viewport, spacious workspace modeled after **ChatGPT**, featuring a **Vivid Neon Green (Cyberpunk/Matrix)** theme and full dynamic integration with the latest **DeepSeek V4 Pro** and **DeepSeek V4 Flash** models.

---

## 🎨 Visual Design & Theming System (COMPLETED)

We established a premium dark mode using pitch black and dark charcoal backdrops, styled with glowing neon green highlights:

```css
:root {
    --bg-main: #141414;           /* Dark slate black main workspace background */
    --bg-sidebar: #0b0b0b;        /* Onyx black sidebar background */
    --bg-input: #1e1e1e;          /* Charcoal grey input field */
    --bg-message-user: #222222;   /* Subtly lighter slate for user messages */
    
    --border-color: rgba(255, 255, 255, 0.08); /* Minimal divider line */
    --border-glow: rgba(0, 255, 102, 0.1);
    
    /* Neon Green Palette */
    --accent-color: #00ff66;      /* High-intensity toxic neon green */
    --accent-hover: #10b981;      /* Emerald green for hover transitions */
    --accent-glow: rgba(0, 255, 102, 0.3);
    
    --text-primary: #e3e3e3;      /* Off-white readable text */
    --text-secondary: #8e8e8e;    /* Cool grey description text */
}
```

---

## 🛠️ Structure & Layout Overhaul (COMPLETED)

### 1. Multi-Column Layout
#### [index.html](file:///c:/Users/Focus/Documents/Misc/vibe-api/index.html)
We rewrote the DOM layout to support a split-pane sidebar system:
*   **`.app-layout`**: Main viewport container spanning `100vw` and `100vh` in flex row orientation.
*   **`.sidebar`**: Left-anchored panel (`260px` wide) housing:
    *   **New Chat Button**: Glowing outline neon green button to reset the conversational state.
    *   **Settings / API Key Panel**: A dedicated collapsible box inside the sidebar to configure the DeepSeek API Key, containing a password input field, visibility icon, and save/delete controls.
    *   **App Status Info**: Aesthetic connection info with glowing green connection state indicators.
*   **`.main-content`**: Main scrollable canvas on the right containing:
    *   **`.chat-header`**: Minimalist header bar containing the sidebar mobile hamburger toggle and active model information.
    *   **`.messages-wrapper`**: Expansive message viewport centering conversation cards inside a constrained reading grid (`max-width: 768px`).
    *   **`.input-wrapper-outer`**: Bottom input station housing a centered, auto-resizing text-input box with glowing green borders.

### 2. DeepSeek V4 Model Integration
#### [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js)
*   **Dynamic Model Selector**: Added support for selecting between the latest models:
    *   `deepseek-v4-pro` (Flagship reasoning model)
    *   `deepseek-v4-flash` (Efficient, low-latency model)
*   **API Payloads**: Updated the API fetch logic to read the active model from `localStorage` (`MODEL_STORAGE_KEY`) and dispatch it dynamically under the `model` payload parameter, eliminating hardcoded legacies.

---

## 🛡️ Next Roadmap Phase: Security & Backend API Proxy (PROPOSED)

Stashing the DeepSeek API Key in client-side code introduces credential leakage issues if shared publicly. To secure the app further, we can proxy calls through a backend node server.

### Proposed Changes

#### [NEW] `server.js` (Root Directory)
Create a minimal Express server in the root directory that handles key injection.
- Endpoint `POST /api/chat` takes client message history, appends the server's environment variable `DEEPSEEK_API_KEY`, and sends the request to DeepSeek.
- Serves the static assets (`index.html`, `style.css`, `app.js`) securely.

#### [MODIFY] [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js)
- Modify the `API_URL` variable to point to our local proxy endpoint: `const API_URL = '/api/chat';`
- Completely remove the `API_KEY_STORAGE_KEY` and UI input if desired, or let users choose between self-hosting key mode and backend proxy mode.

---

## 📈 Advanced UX Enhancements (PROPOSED)

### 1. Markdown Response Formatting
- **Implementation**: Reference `marked.js` from a CDN inside [index.html](file:///c:/Users/Focus/Documents/Misc/vibe-api/index.html).
- **Modification**: Update `addMessageToUI` in [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js) to parse the bot's markdown strings into formatted HTML instead of using plain text.

### 2. Advanced Parameter Sliders
- Let users customize the `temperature` parameter dynamically in the settings sidebar to adjust the response creativity and determinism.
