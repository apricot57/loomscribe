# 🚀 LoomScribe — Feature Suggestions

Based on a deep dive into your codebase, here's what I think would meaningfully improve the app. I've organized these by impact tier, with the most transformative ideas first.

---

## 🔥 Tier 1: High-Impact Features

### 1. Story Continuity Scaffolds (from your roadmap — still unbuilt)
Your [FUTURE_ROADMAP.md](FUTURE_ROADMAP.md) already describes this brilliantly, but none of it is implemented yet. This is easily the single most impactful feature you could add:

- **Rolling Story Summary** — an editable "Story So Far" box per conversation that gets injected into the prompt context
- **Pinned Continuity Facts** — user-managed list of facts the model must not contradict (character names, relationships, locations, rules)
- **Character Dossiers** — compact name + traits + voice notes for each character, injected as reference

**Why it matters:** Long sessions with DeepSeek *will* drift. Characters change eye color, forget motivations, contradict earlier scenes. These scaffolds solve that with minimal user effort and no RAG complexity.

**Implementation approach:** Store as separate collections in `db.json` keyed by `conversationId`. Inject into Slot 2 (post-history) to avoid cache-busting Slot 1. Add a new "Story Context" tab/section in the right pane.

---

### 2. Conversation Search & Filtering
Right now the sidebar is a flat chronological list. Once a user has 30+ chats, finding anything is painful.

- **Full-text search** across chat titles and message content
- **Filter by preset** — show only conversations using a specific preset
- **Sort options** — by date, by title alphabetically, by preset/category
- **Sidebar grouping** — auto-group chats by day ("Today", "Yesterday", "This Week", etc.)

---

### 3. Multi-Provider Support
The proxy is hardcoded to `api.deepseek.com`. Expanding to support other providers would massively increase the app's utility:

- **OpenAI / Anthropic / OpenRouter** — add a provider selector alongside the model selector
- **Custom API endpoints** — let users point to any OpenAI-compatible endpoint (local LLMs via Ollama, LM Studio, etc.)
- **Per-provider API key storage** — extend the settings modal to store multiple keys

The `src/server/endpoints/proxy.js` is a simple HTTPS passthrough — refactoring it to accept a configurable hostname/path would be straightforward.

---

### 4. Export & Import System
Currently you have an export button in the header, but there's no import capability:

- **Export conversation as Markdown/JSON** (appears partially implemented)
- **Export preset + settings bundle** — package a conversation's preset, params, block overrides, and character notes into a shareable `.json` file
- **Import conversations** — restore from exported JSON
- **Import preset packs** — drag-and-drop new `.json` presets into the app without touching the filesystem

---

## ⚡ Tier 2: Quality-of-Life Improvements

### 5. Word Count Display
You target specific word counts (600–3000) but never show the user how many words the model actually produced. Adding a **live word count badge** on each assistant message would close the feedback loop and help users tune the slider.

### 6. Conversation Folders / Tags
Beyond search, let users organize chats into folders or tag them:
- `#romance`, `#sci-fi`, `#character-study`
- Drag-and-drop into folders
- Filter sidebar by tag/folder

### 7. Keyboard Shortcuts
Power users would benefit from:
- `Ctrl+Enter` — Send message (already works)
- `Ctrl+Shift+N` — New chat
- `Ctrl+/` — Toggle right pane
- `Ctrl+.` — Continue story
- `Ctrl+R` — Regenerate last response
- `Escape` — Close any open modal

### 8. Temperature / Top-P / Frequency Penalty Controls
The proxy passes `body` straight through to DeepSeek, but there's no UI to control sampling parameters. Adding a collapsible "Model Parameters" section with:
- **Temperature** slider (0.0–2.0)
- **Top-P** slider
- **Frequency Penalty** slider
- **Max Tokens** override

These could live in the right pane under a new "Model Tuning" collapsible, saved per-conversation like the other params.

### 9. Message Copy Button ✅
Each bot and user message has a one-click **copy to clipboard** button (raw markdown) alongside the message action buttons (edit and regenerate/navigate).

### 10. Auto-Save Drafts for User Input ✅
If the user is mid-composition and accidentally navigates away or switches chats, their unsaved text input is preserved. Stored per-conversation in `localStorage` and restored automatically when they return.

---

## 🎨 Tier 3: Polish & Delight

### 11. Token & Cost Estimation
Since DeepSeek pricing is known, show a running estimate of:
- Tokens used in the current turn (prompt + completion)
- Approximate cost per message
- Session total

This could live as a subtle footer stat or a popover from the header.

### 12. Conversation Statistics Panel
A small stats popover showing:
- Total messages / words written
- Average response length
- Number of regenerations
- Session duration
- Most-used preset settings

### 13. Preset Editor in the UI
Right now creating presets requires editing JSON files on disk. A **visual preset editor** modal would let users:
- Duplicate and customize an existing preset
- Edit the `system_body` and `post_history_body` inline
- Toggle default blocks
- Set default parameter values
- Save to `engine/presets/` via a new API endpoint

### 14. Theme Customization
The dark neon theme is gorgeous, but some users will want options:
- Light mode toggle
- Accent color picker (swap the neon cyan for any hue)
- Font size scaling
- Stored in `localStorage` or `db.json`

### 15. Notification Sounds
Optional audio feedback when:
- A background stream completes (user is in another tab/chat)
- An error occurs
- Subtle UI interaction sounds (toggle clicks, etc.)

### 16. "Bookmark" Key Moments
Let users bookmark specific messages (pin icon) within a conversation. Bookmarked messages get highlighted and can be quickly jumped to from a bookmarks panel. Useful for marking turning points, favorite passages, or reference scenes.

---

## 🏗️ Tier 4: Architecture & Technical

### 17. SQLite Migration
`db.json` will become a bottleneck as conversations grow. Migrating to SQLite (via `better-sqlite3`) would give you:
- Faster queries on large datasets
- Full-text search support (`FTS5`)
- Proper concurrent access
- Transaction safety

### 18. WebSocket for Streaming
The current SSE proxy pipes `proxyRes` directly to the client response. Moving to WebSockets would enable:
- Bidirectional communication
- Better reconnection handling
- Multiplexed streams for concurrent generations
- Real-time updates (e.g., another tab/instance sees new messages)

### 19. Rate Limiting & Error Recovery
- **Retry with exponential backoff** on DeepSeek 429/500 errors
- **Rate limit indicator** in the UI
- **Graceful degradation** — queue requests if rate limited rather than failing

### 20. Automated Backup System
- Periodic JSON export of the full database
- Configurable backup interval (hourly, daily)
- Backup rotation (keep last N backups)
- One-click restore from backup

---

## 📋 Summary Matrix

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|-------------|
| 1 | Story Continuity Scaffolds | High | 🔥🔥🔥 | DB schema, right pane, compiler |
| 2 | Conversation Search | Medium | 🔥🔥🔥 | Sidebar refactor |
| 3 | Multi-Provider Support | Medium | 🔥🔥🔥 | Proxy refactor, settings |
| 4 | Export/Import System | Medium | 🔥🔥 | API endpoints |
| 5 | Word Count Display | Low | 🔥🔥 | CSS + chat.js |
| 6 | Folders / Tags | Medium | 🔥🔥 | DB schema, sidebar |
| 7 | Keyboard Shortcuts | Low | 🔥 | Event listeners |
| 8 | Sampling Controls | Low | 🔥🔥 | Schema + right pane |
| 9 | Copy Button ✅ | Low | 🔥 | chat.js |
| 10 | Auto-Save Drafts ✅ | Low | 🔥 | localStorage |
| 11 | Token/Cost Estimate | Medium | 🔥 | Tokenizer lib |
| 12 | Conversation Stats | Low | 🔥 | UI panel |
| 13 | Visual Preset Editor | High | 🔥🔥 | New modal + API |
| 14 | Theme Customization | Medium | 🔥 | CSS variables |
| 15 | Notification Sounds | Low | 🔥 | Audio API |
| 16 | Bookmarks | Medium | 🔥🔥 | DB, chat.js |
| 17 | SQLite Migration | High | 🔥🔥 | DB rewrite |
| 18 | WebSocket Streaming | High | 🔥 | Server refactor |
| 19 | Rate Limit Recovery | Low | 🔥🔥 | Proxy logic |
| 20 | Automated Backups | Low | 🔥 | Node cron job |

---

> **💡 Top 5 picks for maximum bang-for-buck:** **Story Continuity Scaffolds** (#1), **Word Count Display** (#5), **Copy Button** (#9), **Sampling Controls** (#8), and **Conversation Search** (#2). The first transforms long-form quality, and the others are low-effort wins that immediately improve daily use.
