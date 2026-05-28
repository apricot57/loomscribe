# LoomScribe — Technical Improvement Spec

> Comprehensive audit of technical debt, performance bottlenecks, and architectural improvements.  
> Scope: backend, frontend, data layer, developer experience. **Not** features or aesthetics.

---

## Table of Contents

1. [Database & Persistence Layer](#1-database--persistence-layer)
2. [Architecture & Module Structure](#2-architecture--module-structure)
3. [API Design & Network Efficiency](#3-api-design--network-efficiency)
4. [Error Handling & Resilience](#4-error-handling--resilience)
5. [Security](#5-security)
6. [Frontend Performance](#6-frontend-performance)
7. [Developer Experience & Maintainability](#7-developer-experience--maintainability)
8. [Deployment & Operations](#8-deployment--operations)

---

## 1. Database & Persistence Layer

> [!CAUTION]
> The current data layer is the single biggest scaling risk in the application. Every read and write touches the entire database.

### 1.1 — Full-File Read/Write on Every Operation

**Files:** [db.js](file:///c:/Users/Focus/Desktop/loomscribe/src/server/db.js#L8-L36), [routes.js](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js)

| Aspect | Current State |
|--------|--------------|
| `readDb()` | Reads + parses the **entire** `db.json` file synchronously on every single API call |
| `writeDb()` | Serializes + writes the **entire** `db.json` file on every mutation |
| `db.json` size | Already **~1 MB** and growing with every message |

**Impact:** Every chat message send triggers: read full file → parse JSON → push 1 object → serialize entire structure → write full file. At 100+ conversations with long threads, this becomes a real I/O bottleneck and a data corruption risk under concurrent writes.

**Remediation options (pick one):**

| Option | Effort | Benefit |
|--------|--------|---------|
| **SQLite via `better-sqlite3`** | Medium | Proper indexing, atomic writes, concurrent-safe, no serialization overhead. Zero-config embedded DB. Best fit for this project. |
| **In-memory cache + debounced flush** | Low | Keep current JSON file but cache the parsed object in memory. Only `readDb()` on startup; only `writeDb()` on a debounce timer (e.g. 2s after last mutation). Eliminates 95% of disk I/O. |
| **LowDB / json-server** | Low | Drop-in replacement with the same JSON file format but with in-memory caching and atomic writes built in. |

### 1.2 — ID Generation via `Date.now()` Collisions

**Files:** [routes.js:L116](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js#L116), [routes.js:L188](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js#L188), [routes.js:L272](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js#L272)

```js
// Conversation IDs
id: Date.now()

// Message IDs — slightly better but still fragile
id: Date.now() + Math.floor(Math.random() * 1000)

// Prompt IDs — different strategy entirely
id: Date.now() * 1000 + Math.floor(Math.random() * 1000)
```

**Problems:**
- Three different ID generation strategies across the codebase with no consistency
- `Date.now()` for conversations has zero collision protection — two rapid creates will overwrite
- Message ID adds `random(0..999)` — still collides at ~2.2% probability for two simultaneous creates
- Prompt IDs use `Date.now() * 1000` which creates massive numbers that may lose precision in JavaScript's float64

**Remediation:** Use a consistent UUID generator (e.g., `crypto.randomUUID()` available in Node 19+, or the `uuid` npm package). Alternatively, maintain an auto-incrementing counter persisted in settings.

### 1.3 — No Data Indexing

**File:** [routes.js:L175](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js#L175)

Every message query filters the *entire* messages array:
```js
const filtered = (db.messages || []).filter(m => m.conversationId === conversationId);
```

With a flat JSON array, there are no indexes. As message count grows into the thousands, every query is O(n) over all messages across all conversations.

**Remediation:** If staying with JSON — restructure to a nested format: `{ conversations: { [id]: { messages: [...] } } }`. If migrating to SQLite — add indexes on `conversationId`, `versionGroupId`, and `parentMsgId`.

### 1.4 — No Data Migration / Schema Versioning

There is no schema version marker in `db.json`. If the data format changes in a future update, there's no way to detect or migrate old data gracefully.

**Remediation:** Add a `schemaVersion` field to `db.json` root, and a migration runner on server startup that can transform old formats to new ones.

---

## 2. Architecture & Module Structure

### 2.1 — Monolithic `ui.js` (1,437 lines)

**File:** [ui.js](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js)

This single file handles:
- Model/thinking UI initialization
- Conversation list rendering
- Conversation switching & creation
- Message rendering (add, stream, finalize)
- Inline editing (user + bot, two separate flows)
- Version navigation
- Prompt dropdown population
- System prompt management
- Full streaming API response handling
- Scroll management

**Remediation:** Split into focused modules:

| New Module | Responsibility | Approx. Lines |
|-----------|----------------|---------------|
| `js/conversations.js` | CRUD, switching, sidebar list rendering | ~200 |
| `js/messages.js` | addMessageToUI, streaming, finalize | ~200 |
| `js/editing.js` | Inline edit (user + bot), version navigation | ~300 |
| `js/prompts-ui.js` | Dropdown population, system prompt display | ~200 |
| `js/streaming.js` | `streamApiResponse` + SSE parsing | ~200 |

### 2.2 — CJS / ESM Module Mismatch

**Files:** Server uses `require()` (CommonJS), frontend uses `import` (ES Modules)

```js
// server.js — CommonJS
const { handleApiRoutes } = require('./src/server/routes');

// app.js — ES Modules
import { state } from './js/state.js';
```

This isn't broken per se (server runs in Node CJS, browser uses native ESM), but it prevents:
- Sharing utility code between server and client (e.g. validation, types)
- Using a unified build tool or test runner
- Using modern Node ESM features

**Remediation:** Add `"type": "module"` to `package.json` (once created — see 2.3) and convert server files to ESM `import`/`export`. Or use a bundler that handles both.

### 2.3 — No `package.json`

**Critical finding.** The project has no `package.json` at all. This means:
- No dependency declaration or lock file
- No `npm start` / `npm run dev` scripts
- No version metadata
- No way to install future dependencies (if e.g. adding `better-sqlite3`, `uuid`, etc.)
- The `.gitignore` references `node_modules/` but there's nothing to install

**Remediation:** Create a `package.json` with:
```json
{
  "name": "loomscribe",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

### 2.4 — Global State is a Mutable Object

**File:** [state.js](file:///c:/Users/Focus/Desktop/loomscribe/js/state.js)

```js
export const state = {
    serverConfig: { ... },
    currentConversationId: null,
    abortController: null,
    // ...
};
```

Any module can mutate any field at any time with no traceability. There's no change notification system, so the UI can get out of sync with state.

**Remediation:** 
- **Minimum:** Add setter functions that enforce invariants (e.g., `setCurrentConversation(id)` that also updates localStorage)
- **Better:** Implement a simple pub/sub event emitter pattern — state changes emit events, UI components subscribe to relevant changes
- This would eliminate many manual DOM updates scattered across files

---

## 3. API Design & Network Efficiency

> [!WARNING]
> The frontend makes a staggering number of redundant fetch calls. A single "version navigate" operation can trigger 15+ sequential HTTP requests.

### 3.1 — N+1 Fetch Storms on Version Operations

**Files:** [api.js:L119-L127](file:///c:/Users/Focus/Desktop/loomscribe/js/api.js#L119-L127) (`hideDescendants`), [ui.js:L974-L981](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L974-L981) (`regenerateResponse`)

```js
// hideDescendants: fetches ALL messages, then does 1 PUT per descendant
export async function hideDescendants(msgId) {
    const ids = await getDescendantIds(msgId);   // ← fetches all messages
    for (const id of ids) {
        await fetch(`/api/messages/${id}`, { ... }); // ← sequential PUTs, one per descendant
    }
}
```

And in `regenerateResponse`, the call pattern is:
1. `fetch /api/messages` — get all messages
2. `fetch /api/messages/:id` PUT — update versionGroupId (1 call)
3. Loop: `fetch /api/messages/:id` PUT × N — deactivate each version
4. Loop: `hideDescendants()` × N — each calls fetch ALL + PUT per child
5. Another PUT to deactivate the original
6. Another `hideDescendants()` on the original
7. `refreshConversationView()` — fetches conversations + messages again
8. `streamApiResponse()` — fetches messages again to build payload

**For a message with 3 versions and 2 children each, this is ~25+ sequential HTTP requests.**

**Remediation:**
- Add a **batch update** endpoint: `POST /api/messages/batch` that accepts `{ updates: [{ id, changes }] }`
- Add a server-side `hideDescendants` endpoint: `POST /api/messages/:id/hide-tree`
- The `refreshConversationView` → `switchConversation` call re-fetches everything and rebuilds the entire DOM — this should be avoided (see 6.1)

### 3.2 — Redundant Full Conversation Fetches

**File:** [ui.js:L152-L168](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L152-L168) (`switchConversation`)

```js
export async function switchConversation(id) {
    // ...
    const cRes = await fetch('/api/conversations');        // ← fetches ALL conversations
    const conversations = cRes.ok ? await cRes.json() : [];
    const conv = conversations.find(c => c.id === id);     // ← just to find one
```

It fetches the entire conversation list just to look up one conversation by ID. This happens on every conversation switch, every version navigate, and every regenerate.

**Remediation:** Add `GET /api/conversations/:id` endpoint that returns a single conversation.

### 3.3 — `lookupPromptName` Fetches All User Prompts Every Time

**File:** [api.js:L73-L80](file:///c:/Users/Focus/Desktop/loomscribe/js/api.js#L73-L80)

```js
export async function lookupPromptName(promptId) {
    if (promptId.startsWith('user/')) {
        const res = await fetch('/api/user-prompts');  // ← fetches ALL prompts
        const userPrompts = res.ok ? await res.json() : [];
        const record = userPrompts.find(p => p.id === dbId);
        return record?.name || null;
    }
```

This fetches the full prompt list every time we just need one name. Same pattern exists in `fetchPromptContent`.

**Remediation:** Cache user prompts on load (they don't change often) and invalidate on save/delete. Or add `GET /api/user-prompts/:id`.

### 3.4 — No HTTP Response Caching Strategy

The server sets `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` on everything. While this ensures freshness, it means the browser can't cache *anything* — even static data like factory prompts that never change during a session.

**Remediation:** Use appropriate cache headers per endpoint:
- Factory prompts: `Cache-Control: public, max-age=3600`
- Config: `no-cache` (revalidate but can cache)
- Messages/Conversations: `no-store` (correct, truly dynamic)

---

## 4. Error Handling & Resilience

### 4.1 — Silent Error Swallowing

**Files:** Multiple locations

```js
// api.js:L21 — silently swallows fetch errors for prompt content
} catch {}

// api.js:L98 — silently swallows factory prompt load failure
} catch {
    // Server not available
}
```

Empty catch blocks hide real bugs. If the server returns a 500 or the network drops, the user gets no feedback.

**Remediation:** At minimum, log errors to console. Better: surface a toast notification system (not `alert()`) for transient errors.

### 4.2 — `alert()` for User-Facing Errors

**Files:** [app.js](file:///c:/Users/Focus/Desktop/loomscribe/app.js) (8 uses), [magic.js](file:///c:/Users/Focus/Desktop/loomscribe/js/magic.js) (2 uses)

```js
alert('Please enter a valid DeepSeek API key.');
alert('Failed to save API key to server.');
alert('No active conversation to export.');
```

`alert()` blocks the main thread and is a jarring UX. It's also untestable.

**Remediation:** Implement a lightweight toast/snackbar system. One reusable `showToast(message, type)` function with CSS transitions.

### 4.3 — No Retry Logic on API Proxy

**File:** [routes.js:L306-L348](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js#L306-L348)

If the DeepSeek API returns a 429 (rate limit) or a 503 (temporarily unavailable), the error is passed through raw to the client with no retry, no backoff, and no user-friendly message.

**Remediation:** Add exponential backoff retry (2-3 attempts) for 429/503 responses from the upstream API. Surface rate limit information to the user.

### 4.4 — Unhandled Promise Rejections in Event Handlers

**File:** [app.js](file:///c:/Users/Focus/Desktop/loomscribe/app.js) — many `async` event handlers

```js
dropdownItems.forEach(item => {
    item.addEventListener('click', async () => {  // ← no .catch()
        await fetch('/api/config', { ... });       // ← if this fails, silent unhandled rejection
    });
});
```

Most async event handlers have no try/catch wrapper. A network failure in any of them produces an unhandled promise rejection.

**Remediation:** Wrap all async event handlers in try/catch, or create a helper: `const safeAsync = (fn) => (...args) => fn(...args).catch(console.error);`

---

## 5. Security

### 5.1 — API Key Stored in Plaintext JSON

**File:** [db.js](file:///c:/Users/Focus/Desktop/loomscribe/src/server/db.js) — `data/db.json`

The DeepSeek API key is stored as a raw string in `db.json`:
```json
{ "settings": { "apiKey": "sk-..." } }
```

Anyone with file access can read it. The `data/` directory is gitignored, which is good, but the key has zero encryption at rest.

**Remediation:** 
- **Minimum:** Use environment variables (`process.env.DEEPSEEK_API_KEY`) instead of persisting in the JSON file
- **Better:** Encrypt at rest using Node's `crypto.createCipheriv` with a machine-specific key
- **Best:** Use the OS keychain (Windows Credential Manager via `keytar`)

### 5.2 — Open Object Merge on PUT Endpoints

**File:** [routes.js:L143](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js#L143)

```js
db.conversations[idx] = { ...db.conversations[idx], ...body };
```

The PUT endpoints blindly spread the request body into the stored object. A client could inject arbitrary fields like `{ "id": 999, "__proto__": { "polluted": true } }`.

**Remediation:** Explicitly pick allowed fields:
```js
const { title, activeModel, systemPromptId } = body;
Object.assign(db.conversations[idx], 
  title !== undefined && { title },
  activeModel !== undefined && { activeModel },
  // ...
);
```

### 5.3 — Directory Traversal Protection is Incomplete

**File:** [server.js:L34-L41](file:///c:/Users/Focus/Desktop/loomscribe/server.js#L34-L41)

```js
let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
if (!filePath.startsWith(ROOT)) { ... }
```

`path.join` resolves `..` sequences, so this check works for basic traversal. But on Windows, the check doesn't account for case differences or alternate path separators. Also, the check doesn't prevent serving sensitive files like `data/db.json` (which contains the API key) via `http://localhost:3000/data/db.json`.

**Remediation:** 
- Add an sensory_detailed deny list for the `data/` directory and `.git/`, `.claude/` directories
- Or better: serve only from an sensory_detailed `public/` directory instead of the project root

### 5.4 — No Request Size Limits

**File:** [routes.js:L5-L18](file:///c:/Users/Focus/Desktop/loomscribe/src/server/routes.js#L5-L18)

```js
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        // No size limit — can accumulate unbounded data
```

There's no limit on request body size. A malicious or buggy client could send a multi-GB payload and crash the server with an out-of-memory error.

**Remediation:** Add a size check: abort and return 413 if accumulated body exceeds a threshold (e.g. 5MB).

---

## 6. Frontend Performance

### 6.1 — Full DOM Rebuild on Every State Change

**File:** [ui.js:L1258-L1261](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L1258-L1261)

```js
export async function refreshConversationView() {
    if (state.currentConversationId !== null) {
        await switchConversation(state.currentConversationId);
    }
}
```

`refreshConversationView` is called after:
- Every edit + regenerate (×2: before and after streaming)
- Every version navigation
- Every magic rewrite

Each call to `switchConversation` does:
1. Fetch all conversations (to find model settings)
2. Fetch all messages
3. **Nuke entire `.messages-container` innerHTML**
4. Rebuild every message DOM node from scratch
5. Re-attach all event listeners
6. Re-parse all markdown

**For a conversation with 50 messages, that's 50× markdown parse + DOM build on a simple version switch.**

**Remediation:**
- **Targeted updates:** Instead of full rebuild, update only the changed message DOM node
- **Virtual list / DOM recycling:** For conversations >50 messages, render only visible messages
- **Separate refresh scope:** `refreshConversationView` should diff the message list and patch, not replace

### 6.2 — Markdown Re-Parsed on Every Streaming Chunk

**File:** [ui.js:L498-L504](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L498-L504)

```js
export function updateStreamingBotMessage(id, content) {
    const contentDiv = msg.querySelector('.message-content');
    contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(content) : content;
}
```

During streaming, every single SSE chunk triggers a full `marked.parse()` of the *entire accumulated content*. For a 2000-word response, the last chunk re-parses all 2000 words.

**Remediation:**
- During streaming, use `textContent` (plain text) and only parse markdown on `finalizeStreamingBotMessage`
- Or implement incremental markdown rendering that appends to the existing parsed output
- Consider using `requestAnimationFrame` to throttle DOM updates during fast streaming

### 6.3 — `scrollToBottom` Called Excessively

**File:** [ui.js:L529-L536](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L529-L536)

`scrollToBottom()` queries the DOM (`getElementById`) and mutates scroll position. It's called:
- Every `addMessageToUI` (unless `skipScroll`)
- Every `showTypingIndicator`
- Every `addStreamingBotMessage`
- Every `updateStreamingReasoning` — **on every reasoning chunk**
- Every `updateStreamingBotMessage` would benefit from it too

During fast streaming, this can fire 100+ times per second.

**Remediation:** Throttle scroll updates to ~60fps using `requestAnimationFrame`:
```js
let scrollPending = false;
export function scrollToBottom() {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
        const el = document.getElementById('chat-container');
        if (el) el.scrollTop = el.scrollHeight;
        scrollPending = false;
    });
}
```

### 6.4 — CDN-Loaded Libraries Without Fallbacks

**File:** [index.html:L265-L266](file:///c:/Users/Focus/Desktop/loomscribe/index.html#L265-L266)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
```

- `marked` is loaded from CDN — if the CDN is down or the user is offline, **all bot messages render as raw text** (the `typeof marked !== 'undefined'` check is the only guard)
- `JSZip` is loaded from CDN — if unavailable, ZIP import silently fails
- No SRI (Subresource Integrity) hashes — vulnerable to CDN compromise
- No version pinning on `marked` — `npm/marked/marked.min.js` fetches latest, which could break

**Remediation:**
- Vendor both libraries locally (copy into a `lib/` or `vendor/` directory)
- Or pin specific versions AND add `integrity` attributes
- Add `crossorigin="anonymous"` for CORS compliance

---

## 7. Developer Experience & Maintainability

### 7.1 — Duplicated Version Management Logic

The version management pattern (establish versionGroupId → find existing versions → calculate maxVersion → deactivate old → create new) is copy-pasted across **four separate locations**:

| Location | Function |
|----------|----------|
| [ui.js:L824-L876](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L824-L876) | `editBotMessageOnly` |
| [ui.js:L878-L947](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L878-L947) | `editMessageAndRegenerate` |
| [ui.js:L949-L999](file:///c:/Users/Focus/Desktop/loomscribe/js/ui.js#L949-L999) | `regenerateResponse` |
| [magic.js:L314-L362](file:///c:/Users/Focus/Desktop/loomscribe/js/magic.js#L314-L362) | `executeMagicRewrite` |

Each copy is ~40 lines of nearly identical code. A bug fix in one must be replicated in all four.

**Remediation:** Extract a shared `createNewVersion({ msgId, newContent, newRole, conversationId })` utility in `api.js` that handles the full lifecycle.

### 7.2 — Excessive `document.getElementById` Lookups

**File:** [app.js](file:///c:/Users/Focus/Desktop/loomscribe/app.js) — first 77 lines

The app queries 30+ elements by ID on page load, many of which are also re-queried inside functions in `ui.js`:
```js
// app.js line 27
const chatForm = document.getElementById('chat-form');

// ui.js line 355 — queries it again
const chatContainer = document.getElementById('chat-container');
```

**Remediation:** Create a single `dom.js` module that caches and exports all DOM references:
```js
export const dom = {
    chatForm: document.getElementById('chat-form'),
    chatContainer: document.getElementById('chat-container'),
    // ...
};
```

### 7.3 — Inline Styles in HTML

**File:** [index.html:L240-L243](file:///c:/Users/Focus/Desktop/loomscribe/index.html#L240-L243)

```html
<div class="import-prompt-wrapper" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
    <label style="display: block; margin-bottom: 8px; color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
    <button style="width: 100%; border: 1px dashed rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.05); color: #fff;">
```

Inline styles scattered throughout the HTML override the well-organized CSS architecture and make visual consistency harder to maintain.

**Remediation:** Move all inline styles to the appropriate CSS file (likely `modals.css`).

### 7.4 — No Linting or Formatting

No `.eslintrc`, `.prettierrc`, or `jsconfig.json`. Code style varies across files (trailing semicolons, quote types, brace styles are mostly consistent but unenforceable).

**Remediation:** Add ESLint + Prettier configs. This is a 10-minute setup that pays off immediately.

### 7.5 — No Tests

Zero test files. The version navigation, markdown substring matching, and streaming parser are all complex enough to warrant unit tests.

**Minimum test targets:**
- `findMarkdownSubstringRange` — critical for magic rewrite accuracy
- `getDescendantIds` / `showDescendants` — tree traversal logic
- Server route handlers — CRUD operations
- SSE stream parser — edge cases (partial chunks, malformed JSON)

### 7.6 — CSS `@import` Chain

**File:** [style.css](file:///c:/Users/Focus/Desktop/loomscribe/style.css)

```css
@import url('./css/variables.css');
@import url('./css/layout.css');
@import url('./css/messages.css');
/* ... 6 imports total */
```

CSS `@import` is render-blocking and sequential — each file is fetched only after the previous one finishes parsing. With 6 files, this creates a waterfall of 6 sequential HTTP requests before the page can render.

**Remediation:** 
- **Quick fix:** Add all 6 `<link>` tags directly in `index.html` — they'll load in parallel
- **Better:** Use a CSS bundler/concatenator in a build step to produce a single `style.css`

---

## 8. Deployment & Operations

### 8.1 — `start-loomscribe.bat` Uses `taskkill /f /im node.exe`

**File:** [start-loomscribe.bat:L45](file:///c:/Users/Focus/Desktop/loomscribe/start-loomscribe.bat#L45)

```batch
taskkill /f /im node.exe
```

This kills **all** Node.js processes on the machine, not just LoomScribe. If the user is running any other Node app (VS Code extensions, other servers, etc.), they'll all die.

**Remediation:** Track the PID of the spawned `node server.js` process and kill only that PID:
```batch
start /b "" node server.js > "%TEMP%\loomscribe-server.log" 2>&1
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr PID') do set LOOM_PID=%%a
:: ... later:
taskkill /f /pid %LOOM_PID%
```

### 8.2 — No `.env` Support

Hardcoded defaults for port (`3000`), API hostname (`api.deepseek.com`), and model names are scattered across multiple files. There's `process.env.PORT` in `server.js` but no `.env` file or `dotenv` integration.

**Remediation:** Create a `.env.example` file documenting all configurable values, and use `dotenv` or manual `process.env` reads on server startup.

### 8.3 — No Health Check Endpoint

There's no `GET /api/health` or similar. This makes it harder to verify the server is running in scripts, monitoring, or container environments.

### 8.4 — Static File Server Serves Entire Project Root

**File:** [server.js:L34](file:///c:/Users/Focus/Desktop/loomscribe/server.js#L34)

The static file server resolves paths relative to the project root (`__dirname`). This means:
- `http://localhost:3000/server.js` → serves the server source code
- `http://localhost:3000/.gitignore` → serves the gitignore
- `http://localhost:3000/src/server/routes.js` → serves backend routes with API logic
- `http://localhost:3000/data/db.json` → **serves the database including the API key**

**Remediation:** Create a `public/` directory and serve only from there. Move `index.html`, `style.css`, `css/`, `js/`, `app.js`, and `favicon.png` into `public/`.

---

## Priority Matrix

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| 🔴 Critical | 5.3/8.4 — Serve `data/db.json` (API key exposure) | Security | Low |
| 🔴 Critical | 1.1 — Full-file DB read/write | Perf / Data integrity | Medium |
| 🟠 High | 3.1 — N+1 fetch storms | Performance | Medium |
| 🟠 High | 6.1 — Full DOM rebuild per state change | Performance | Medium |
| 🟠 High | 7.1 — Duplicated version management logic | Maintainability | Low |
| 🟠 High | 2.3 — No `package.json` | Dev experience | Low |
| 🟡 Medium | 1.2 — ID collision risk | Data integrity | Low |
| 🟡 Medium | 5.2 — Open object merge | Security | Low |
| 🟡 Medium | 5.4 — No request size limits | Security | Low |
| 🟡 Medium | 6.2 — Markdown re-parse on every chunk | Performance | Low |
| 🟡 Medium | 6.3 — Scroll thrashing | Performance | Low |
| 🟡 Medium | 4.1/4.4 — Silent error swallowing | Reliability | Low |
| 🟡 Medium | 7.6 — CSS @import waterfall | Load time | Low |
| 🟢 Low | 4.2 — `alert()` usage | UX / Testing | Low |
| 🟢 Low | 2.1 — Monolithic ui.js | Maintainability | Medium |
| 🟢 Low | 2.4 — Mutable global state | Maintainability | Medium |
| 🟢 Low | 6.4 — CDN libs without fallback | Resilience | Low |
| 🟢 Low | 7.4/7.5 — No linting or tests | Dev experience | Low-Med |
| 🟢 Low | 8.1 — `taskkill /f /im node.exe` | Safety | Low |
| 🟢 Low | 8.2/8.3 — No .env or health check | Operations | Low |
