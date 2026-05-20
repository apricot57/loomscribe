# 🗺️ VibeChat Implementation & Roadmap Plan

Build a lightweight, aesthetically stunning chatbot frontend using vanilla HTML, CSS, and JS that integrates with the DeepSeek API. This document details the completed components (Phase 1) and outlines the plans for upcoming features.

---

## 🏁 Phase 1: Core Client-Side Application (COMPLETED)

Successfully implemented a standalone, highly aesthetic web app running on pure client-side vanilla code.

### Completed Structural Features
- **[index.html](file:///c:/Users/Focus/Documents/Misc/vibe-api/index.html)**: Added clean semantic markup, custom SVG send button, responsive container framework, and styling hooks.
- **[style.css](file:///c:/Users/Focus/Documents/Misc/vibe-api/style.css)**: Implemented premium glassmorphic dark theme variables, responsive layout handling (full-height mobile vs floating desktop card), scroll styling, message alignments, and custom typing animations.
- **[app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js)**: Formulated conversation state array, `localStorage` persistence, dynamically updating UI nodes, automatic scroll alignment, typing state triggers, and DeepSeek connection protocol.

### Manual Verification Status
- [x] Responsive layout renders seamlessly down to mobile screen sizes.
- [x] Dynamic typing indicator starts before the fetch request and dismounts cleanly when the response is processed.
- [x] Chat history persists on browser refresh and defaults to a helpful system message if `localStorage` is empty.

---

## 🛡️ Phase 2: Security & Backend API Proxy (IN REVIEW)

Stashing the DeepSeek API Key in client-side code introduces serious credential leakage issues. To scale this app, we need to proxy calls through a backend node server.

### Proposed Changes

#### [NEW] `server.js` (Root Directory)
Create a minimal Express server in the root directory that handles key injection.
- Endpoint `POST /api/chat` takes client message history, appends the server's environment variable `DEEPSEEK_API_KEY`, and sends the request to DeepSeek.
- Serves the static assets (`index.html`, `style.css`, `app.js`) securely.

#### [MODIFY] [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js)
- Modify the `API_URL` variable to point to our local proxy endpoint: `const API_URL = '/api/chat';`
- Completely remove the `API_KEY` definition from front-end Javascript.

> [!CAUTION]
> **Credential Exposure Risk**: Direct client-to-API requests should only be run in local/sandbox development. Moving to Phase 2 is **highly recommended** before hoisting the site to any public hosting provider (Vercel, Netlify, Render, etc.).

---

## 📈 Phase 3: Advanced UX Enhancements (PROPOSED)

Once the foundation is secure, these enhancements will push the user experience from MVP to a production-grade product.

### 1. Markdown Response Formatting
- **Implementation**: Reference `marked.js` from a CDN (or install via npm for the backend) inside [index.html](file:///c:/Users/Focus/Documents/Misc/vibe-api/index.html).
- **Modification**: Update `addMessageToUI` in [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js) to parse the bot's markdown strings into valid formatted HTML instead of using plain `textContent`.

### 2. Conversational Controls
- **Trash / Clear Button**: Add an elegant trash SVG button next to the title in `<header>`. Clicking it clears `localStorage` and resets `conversationHistory` to the default system message.
- **System Prompt Customization**: Let users toggle settings or customize system-level rules (e.g. changing the bot from "helpful assistant" to "code refactoring assistant").
- **Parameter Control**: Add slider components for `temperature` adjustment to let users tune prompt creativity.

---

## 📝 User Feedback & Next Action

Please let me know if you would like to:
1. **Proceed to Phase 2** and spin up a lightweight, highly secure backend proxy for your DeepSeek API key.
2. **Proceed to Phase 3** and focus strictly on front-end aesthetics (such as implementing Markdown rendering for responses and system settings).

