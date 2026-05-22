# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeChat is a vanilla HTML/CSS/JS single-page chat app that talks to the DeepSeek API via a Node.js backend proxy. No bundlers or build steps are used. It leverages native ES6 modules (`type="module"`) on the frontend, standard `@import` rules in CSS, and a modular, zero-dependency Node.js server. The server is required — the app no longer works when opened via `file://`.

### File Structure & Architecture

```
vibe-api/
│
├── css/                     <-- Modular CSS stylesheets
│   ├── variables.css        <-- Design tokens, themes, global layout reset, helper utilities
│   ├── layout.css           <-- Sidebar drawer, main container header & footer frames
│   ├── messages.css         <-- Chat content, message bubbles, collapsible thoughts, edit inputs
│   ├── input.css            <-- Bottom chat input form, dropdown pill wrappers
│   ├── modals.css           <-- Centered dialog overlays (API Keys, prompts, deletion warnings)
│   └── magic.css            <-- Magic Wand floating coordinates, Glowing loader animations
│
├── js/                      <-- Modular ES6 Frontend logic files
│   ├── state.js             <-- Client-side read-write shared state objects and setters
│   ├── api.js               <-- Dedicated interface for REST API communication & AI stream proxy
│   ├── ui.js                <-- DOM references lookup, dynamic renderers, and custom animation triggers
│   └── magic.js             <-- Drag-selection hooks, wand coordinates, and magic inline rewrites
│
├── src/
│   └── server/              <-- Modular Backend logic files
│       ├── db.js            <-- Low-level filesystem read/write helpers for data/db.json
│       ├── prompts.js       <-- System prompt auto-discovery & markdown header parsing
│       └── routes.js        <-- REST API routes & DeepSeek server-sent events (SSE) stream proxy
│
├── server.js                <-- HTTP Server entrypoint (serves static assets, routes API calls)
├── app.js                   <-- Frontend entrypoint (binds global click listeners and starts app)
├── style.css                <-- Global CSS entrypoint (aggregates modular sheets using @import)
├── index.html               <-- App markup structure and script linking (loads app.js as type="module")
├── prompt_cards/            <-- Read-only markdown files grouped by categories
└── data/db.json             <-- Persistent server-side JSON database
```

## Development Commands

No build step, no package managers. To run the app:

```bash
node server.js
# Then open http://localhost:3000
```

Or double-click `start-vibechat.bat`.

## Architecture & Data Flow

1. **User interaction**: User submits input → `chatForm` event fires in `app.js`.
2. **Database Logging**: Message saved to backend database (`POST /api/messages`), and visually appended via `addMessageToUI()` in `js/ui.js`.
3. **AI Generation Proxy**: Server-side routes query DeepSeek's API. Response is piped back to the browser using Server-Sent Events (SSE).
4. **Markdown Rendering**: Real-time token streaming captures delta thoughts (`reasoning_content`) and content, renders it using `marked.js` library, and commits final text to database on streaming end.

### Storage & State Management
- **Server-side (data/db.json)**: Stores active conversations, full message version logs, user-created prompts, active model preference, and API key.
- **Client-side State (`js/state.js`)**: Exports a synchronized `state` object. Standardizes caching of system prompts, AbortControllers for cancelling calls, and tracks current conversation/message selection references.
- **localStorage**: Caches the last selected `activeConversationId` to auto-restore conversation history on browser reload.

## Coding Conventions

### JS Conventions (Native ES6 Modules)
- Import paths MUST use absolute relative paths with the `.js` extension (e.g. `import { state } from './state.js';`).
- State variables must be accessed and modified via the shared `state` object in `js/state.js`.
- DOM references must be retrieved dynamically or mapped to clean helper functions inside `js/ui.js`.
- The `js/magic.js` module automatically self-initializes by registering top-level window and document drag event listeners upon loading.
- Asynchronous API queries are grouped cleanly inside `js/api.js`.

### CSS Conventions
- Design tokens reside as CSS custom properties under `:root` inside `css/variables.css`.
- Main `style.css` acts only as a loader/aggregator of modular sheets using `@import url(...)` rules.
- Maintain Material 3 aesthetics with frosted glassmorphism overlays (`backdrop-filter`), smooth hover transitions, and glowing visual states.
- Mobile layout activates at `768px` media query width where the sidebar shifts to a toggleable collapsible menu.

### Working with the Code
- **Adding new styles**: Place them in the relevant CSS stylesheet inside `css/` rather than adding inline styles or polluting `style.css` directly.
- **Modifying UI rendering**: Edit `js/ui.js` to change how dynamic DOM components are generated.
- **Extending Server API**: Keep `server.js` clean; place additional API endpoint pathways or proxy handlers inside `src/server/routes.js` and call database methods from `src/server/db.js`.
- **Reasoning thought panels**: Collapsible sections showing `<details class="thought-block">` represent streamed deep reasoning before regular assistant responses. Keep their styling intact under `css/messages.css`.
