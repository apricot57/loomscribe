# LoomScribe Rework Plan

Incremental refactor plan for cleaning up the current app while keeping it
working after every step.

**Constraint:** No build step. Runtime dependencies installed with `npm install`
are acceptable.

**Important:** The code examples below are implementation sketches, not complete
drop-in replacements. Preserve current behavior when migrating:

- Static assets currently return `Cache-Control: no-cache`.
- Invalid JSON currently returns `400 Bad Request`.
- Request bodies over 5 MB currently return `413 Payload Too Large`.
- The DeepSeek proxy currently streams the upstream response without buffering.
- `node server.js` and `start-loomscribe.bat` must continue to work.

---

## Current State

```
server.js               116 lines - entry point + static server + PID + .env parsing
src/server/
  routes.js             ~628 lines - all API logic in one handleApiRoutes() function
  db.js                 ~50 lines - readDb/writeDb; keep as-is for now
  prompts.js            ~100 lines - prompt file discovery; keep as-is for now
public/
  app.js                ~827 lines - DOMContentLoaded + event listeners + bootstrap
  js/
    ui.js               ~1,568 lines - rendering, streaming, modals, sidebar, prompts
    api.js              ~200 lines - fetch/payload helpers; keep as-is for now
    state.js            ~100 lines - shared state object; keep as-is for now
    magic.js            ~500 lines - text selection rewrite; keep as-is for now
```

Primary refactor targets:

- `src/server/routes.js`
- `public/app.js`
- `public/js/ui.js`

Secondary target:

- `server.js`, only to replace hand-rolled HTTP/static/body parsing with Express.

---

## Step 1 - Add Express Safely

Install both dependencies before changing code:

```bash
npm install express dotenv
```

Goal: keep `server.js` as the process entry point, but let Express handle route
registration, static serving, and JSON body parsing.

### Required Behavior To Preserve

- PID file creation and cleanup.
- `.env` loading.
- Static file serving from `public/`.
- `Cache-Control: no-cache` on static assets.
- JSON request body limit of 5 MB.
- `400` for malformed JSON.
- `413` for oversized JSON bodies.
- All current API endpoints and response bodies.
- Streaming behavior for `/api/chat/completions`.

### `server.js` Sketch

```js
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const { handleApiRoutes } = require('./src/server/routes');

const PORT = process.env.PORT || 3000;

const pidPath = path.join(__dirname, 'server.pid');
fs.writeFileSync(pidPath, process.pid.toString());

function cleanupPid() {
    try {
        if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
    } catch (_) {}
}

process.on('exit', cleanupPid);
process.on('SIGINT', () => {
    cleanupPid();
    process.exit(0);
});
process.on('SIGTERM', () => {
    cleanupPid();
    process.exit(0);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanupPid();
    process.exit(1);
});

const app = express();

app.use(express.json({ limit: '5mb' }));

handleApiRoutes(app);

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
    }
}));

app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
        res.status(413).send('Payload Too Large');
        return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).send('Bad Request');
        return;
    }
    next(err);
});

app.listen(PORT, () => {
    console.log(`LoomScribe server running at http://localhost:${PORT}`);
});
```

### Route Migration Guidance

Change `src/server/routes.js` from:

```js
function handleApiRoutes(req, res, pathname, url) {
    if (pathname === '/api/health' && req.method === 'GET') {
        // ...
        return true;
    }
}
```

To:

```js
function handleApiRoutes(app) {
    app.get('/api/health', (req, res) => {
        res.json({ status: 'OK', uptime: process.uptime() });
    });
}

module.exports = { handleApiRoutes };
```

Mapping rules:

- `req.body` replaces `await getRequestBody(req)`.
- `req.params` replaces regex extraction from `pathname`.
- `req.query` replaces `url.searchParams`.
- `res.status(404).send('Not Found')` replaces `res.writeHead(404); res.end(...)`.
- `res.json(data)` replaces manual JSON headers and `JSON.stringify`.
- Add `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` on API
  routes where the current code sets it.

### DeepSeek Proxy Caveat

Do not rewrite the proxy into a buffered request. It must keep streaming.

The current behavior:

- Sends a POST to `api.deepseek.com/chat/completions`.
- Forwards the upstream status and headers.
- Pipes the upstream response directly to the client.
- Destroys the upstream request if the client disconnects.

Express route sketch:

```js
app.post('/api/chat/completions', (req, res) => {
    const db = readDb();
    const apiKey = db.settings?.apiKey;
    if (!apiKey) {
        res.status(400).json({
            error: { message: 'API Key is missing on the server. Please configure it in Settings.' }
        });
        return;
    }

    const proxyReq = https.request({
        hostname: 'api.deepseek.com',
        port: 443,
        path: '/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    }, (proxyRes) => {
        res.status(proxyRes.statusCode || 500);
        for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value !== undefined) res.setHeader(key, value);
        }
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: { message: 'Failed to connect to DeepSeek API.' } });
        } else {
            res.end();
        }
    });

    req.on('close', () => {
        proxyReq.destroy();
    });

    proxyReq.write(JSON.stringify(req.body));
    proxyReq.end();
});
```

### Verify

Run:

```bash
node server.js
```

Smoke test:

- App loads at `http://localhost:3000`.
- Static assets load.
- `/api/health` returns JSON.
- Conversations can be created, renamed, deleted, and loaded.
- Settings save and reload.
- Prompt cards load.
- Chat streaming still streams incrementally.
- Invalid JSON returns `400`.
- A body over 5 MB returns `413`.

---

## Step 2 - Split Server Routes By Domain

After Express is in place, split `routes.js` by domain. Do one domain at a time
and verify after each extraction.

### Target Structure

```
src/server/
  routes.js
  db.js
  prompts.js
  utils.js
  endpoints/
    config.js
    conversations.js
    messages.js
    prompts-api.js
    proxy.js
  services/
    version-tree.js
```

Use `prompts-api.js` instead of `prompts.js` for the endpoint file to avoid
confusion with the existing prompt file-discovery module.

### Final `routes.js`

```js
const config = require('./endpoints/config');
const conversations = require('./endpoints/conversations');
const messages = require('./endpoints/messages');
const promptsApi = require('./endpoints/prompts-api');
const proxy = require('./endpoints/proxy');

function handleApiRoutes(app) {
    config(app);
    conversations(app);
    messages(app);
    promptsApi(app);
    proxy(app);
}

module.exports = { handleApiRoutes };
```

### Extraction Order

1. `config.js` - `/api/health`, `/api/config`
2. `prompts-api.js` - `/api/prompts`, `/api/prompts/:category/:filename`
3. `conversations.js` - `/api/conversations`, `/api/conversations/:id`
4. `proxy.js` - `/api/chat/completions`
5. `messages.js` - `/api/messages`, message versions, tree navigation

This order minimizes risk. `messages.js` should be last because it contains the
version-tree behavior.

### Extract Shared Server Logic

Move ID generation to `src/server/utils.js`:

```js
function generateUniqueId(db, table) {
    while (true) {
        const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        const exists = (db[table] || []).some(item => item.id === id);
        if (!exists) return id;
    }
}

module.exports = { generateUniqueId };
```

Move message version-tree logic to `src/server/services/version-tree.js`:

```js
function deactivateMessageTree(db, msgId) {
    // Move existing implementation here unchanged.
}

function deactivateVersionGroupAndDescendants(db, versionGroupId) {
    // Move existing implementation here unchanged.
}

function showDescendants(db, msgId) {
    // Move existing implementation here unchanged.
}

module.exports = {
    deactivateMessageTree,
    deactivateVersionGroupAndDescendants,
    showDescendants
};
```

Keep these service functions pure. They should accept `db` and IDs, mutate the
in-memory object as they do today, and avoid importing Express or HTTP objects.

### Verify After Each Extraction

Run:

```bash
node server.js
```

Smoke test the extracted domain before moving to the next file.

---

## Step 3 - Split `public/js/ui.js` Carefully

`ui.js` is the largest client file, but it is not four independent chunks. It has
cross-calls between chat rendering, sidebar behavior, prompt selection, drafts,
version navigation, and modals.

Do not treat this as a simple copy/paste split. First identify shared helpers,
then move exports.

### Target Structure

```
public/js/
  ui.js
  ui/
    chat.js
    sidebar.js
    input.js
    modals.js
    prompts.js
    helpers.js
```

`ui.js` remains a compatibility barrel while `app.js` still imports from it:

```js
export * from './ui/chat.js';
export * from './ui/sidebar.js';
export * from './ui/input.js';
export * from './ui/modals.js';
export * from './ui/prompts.js';
```

Use `helpers.js` only for private shared utilities that multiple UI modules need.
Do not export helpers through the barrel unless `app.js` or another external
module needs them.

### Suggested Ownership

`ui/modals.js`:

- `closeModal`
- `closeDeleteConfirmModal`
- `showToast`
- key modal init in Step 4
- prompt editor modal init in Step 4
- delete confirmation modal init in Step 4

`ui/input.js`:

- `initializeModelUI`
- `initializeThinkingUI`
- `updateKeyStatusUI`
- model dropdown init in Step 4
- thinking toggle init in Step 4

`ui/prompts.js`:

- `populatePromptDropdown`
- `setSystemPrompt`
- `updatePromptSelectorDisplay`
- `populateCategoryDatalist`
- prompt selector init in Step 4
- prompt import logic in Step 4

`ui/sidebar.js`:

- `loadConversations`
- `switchConversation`
- `createNewConversation`
- `deleteConversation`
- `startInlineRename`
- sidebar toggle init in Step 4
- new chat modal init in Step 4

`ui/chat.js`:

- `addMessageToUI`
- `attachMessageActions`
- `removeTypingIndicator`
- `updateContinueButtonVisibility`
- `streamApiResponse`
- `refreshConversationMessages`
- `refreshConversationView`
- streaming message helpers
- assistant draft helpers
- form submit / stop / continue / export init in Step 4

### Migration Order

1. Create `ui/modals.js`; move only modal/toast functions.
2. Create `ui/input.js`; move model/key/thinking display functions.
3. Create `ui/prompts.js`; move prompt dropdown and prompt selector functions.
4. Create `ui/sidebar.js`; move conversation list and conversation switching.
5. Create `ui/chat.js`; move rendering, streaming, versions, and drafts.
6. Replace `public/js/ui.js` with the barrel exports.

After each move, update imports inside the moved module sensory_detailedly. Avoid circular
imports where possible. If two modules need the same helper, move the helper to
`ui/helpers.js`.

### Verify After Each Move

Open the app and test:

- Initial conversation restore.
- New chat creation.
- Conversation switching.
- Rename/delete conversation.
- Prompt dropdown.
- Prompt editor.
- Prompt import, including ZIP import.
- Model selector.
- Thinking toggle.
- API key modal.
- Sending a message.
- Stopping generation.
- Continuing generation.
- Editing a message.
- Version navigation.
- Export to Markdown.

---

## Step 4 - Thin Out `public/app.js`

After `ui.js` has been split, move event listener setup into the module that owns
the related UI. `app.js` should become a bootstrapper, but it must preserve all
current startup behavior.

### Target Init Functions

```
ui/input.js
  initInputBar()

ui/sidebar.js
  initSidebar()
  initNewChatModal()

ui/prompts.js
  initPromptSelector()
  initPromptEditorImport()

ui/modals.js
  initKeyModal()
  initPromptEditorModal()
  initDeleteModal()

ui/chat.js
  initChatForm()
  initStopButton()
  initContinueButton()
  initExportButton()
```

### Bootstrap Responsibilities

`app.js` should still do all of this:

- Fetch `/api/config`.
- Load factory prompts.
- Initialize model UI.
- Initialize thinking UI.
- Initialize key status UI.
- Register all event listeners.
- Load conversations.
- Restore `activeConversationId` from `localStorage` when valid.
- Select the latest conversation when no saved conversation is valid.
- Create a first conversation when none exist.
- Update the prompt selector display.
- Import `magic.js` so its selection listeners still bind.

### `app.js` Sketch

```js
import { state } from './js/state.js';
import { loadFactoryPrompts } from './js/api.js';
import {
    initInputBar,
    initializeModelUI,
    initializeThinkingUI,
    updateKeyStatusUI
} from './js/ui/input.js';
import {
    initSidebar,
    initNewChatModal,
    loadConversations,
    switchConversation,
    createNewConversation
} from './js/ui/sidebar.js';
import {
    initPromptSelector,
    initPromptEditorImport,
    updatePromptSelectorDisplay
} from './js/ui/prompts.js';
import {
    initKeyModal,
    initPromptEditorModal,
    initDeleteModal
} from './js/ui/modals.js';
import {
    initChatForm,
    initStopButton,
    initContinueButton,
    initExportButton
} from './js/ui/chat.js';
import './js/magic.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => {
        console.error('Unhandled error during app initialization:', err);
    });
});

async function initApp() {
    const configRes = await fetch('/api/config');
    if (configRes.ok) {
        state.serverConfig = await configRes.json();
    }

    await loadFactoryPrompts();

    initSidebar();
    initNewChatModal();
    initInputBar();
    initPromptSelector();
    initPromptEditorImport();
    initKeyModal();
    initPromptEditorModal();
    initDeleteModal();
    initChatForm();
    initStopButton();
    initContinueButton();
    initExportButton();

    initializeModelUI();
    initializeThinkingUI();
    updateKeyStatusUI();

    await loadConversations();

    const savedIdStr = localStorage.getItem('activeConversationId');
    const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null;

    const cRes = await fetch('/api/conversations');
    const conversations = cRes.ok ? await cRes.json() : [];
    conversations.sort((a, b) => b.createdAt - a.createdAt);

    const hasSavedConv = conversations.some(c => c.id === savedId);
    if (savedId && hasSavedConv) {
        await switchConversation(savedId);
    } else if (conversations[0]) {
        await switchConversation(conversations[0].id);
    } else {
        await createNewConversation();
    }

    updatePromptSelectorDisplay();
}
```

### Verify

Run a full UI smoke test. This step is where regressions are most likely because
event listeners are being moved.

---

## Step 5 - Optional Quality Improvements

These are independent. Do them only when they solve a real problem.

### Replace CDN `marked.js` With A Local Asset

Current `index.html` uses CDN scripts for `JSZip` and `marked`. If offline or
local-only usage matters, serve `marked` locally.

Install:

```bash
npm install marked
```

Add this static mount in `server.js`:

```js
app.use('/vendor/marked', express.static(
    path.join(__dirname, 'node_modules/marked/dist'),
    {
        setHeaders(res) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
));
```

Then change `index.html`:

```html
<script src="/vendor/marked/marked.min.js"></script>
```

Prefer this over importing from `/node_modules/marked/src/marked.js`; the `dist`
file is the browser-ready artifact.

If ZIP prompt import also needs to work offline, repeat the same pattern for
`jszip`.

### Add JSDoc Types To Version Tree Service

After extracting `src/server/services/version-tree.js`, add JSDoc to make the
data shape sensory_detailed without adding TypeScript:

```js
/**
 * @param {{ messages: Array<{
 *   id: number|string,
 *   parentMsgId?: number|string|null,
 *   versionGroupId?: number|string|null,
 *   version?: number,
 *   isActive?: boolean
 * }> }} db
 * @param {number|string} msgId
 */
function deactivateMessageTree(db, msgId) {
    // ...
}
```

### Consider SQLite Later

Only consider replacing `data/db.json` if the file becomes slow or fragile in
real use. A rough threshold is thousands to tens of thousands of messages.

If this becomes necessary, `better-sqlite3` is a reasonable fit because the
current server code is already synchronous.

Do not assume the rest of the server can remain unchanged unless `db.js` keeps
the exact same high-level interface:

```js
readDb()  -> returns { conversations, messages, prompts, settings }
writeDb(data) -> persists that same object shape
```

That compatibility layer is simple, but it means every write still rewrites or
reconciles the whole logical object. For a proper SQLite migration, endpoint code
should eventually move to query-level operations instead.

---

## Suggested Order

```
Week 1: Step 1 + Step 2
        Server becomes easier to reason about.

Week 2: Step 3
        UI modules become manageable while app.js stays stable.

Week 3: Step 4
        app.js becomes a real bootstrapper.

Anytime: Step 5
        Only when the optional improvement is worth the added dependency.
```

Each step should produce a working, committable app.

---

## What Should Not Change During The Main Refactor

- `data/db.json` format and location.
- `prompt_cards/` structure.
- `public/js/state.js` behavior.
- `public/js/api.js` behavior.
- `public/js/magic.js` behavior.
- `public/css/` behavior.
- `public/index.html`, except optional vendor script changes.
- `start-loomscribe.bat`.
- The browser-visible API contract.
- The DeepSeek streaming behavior.
