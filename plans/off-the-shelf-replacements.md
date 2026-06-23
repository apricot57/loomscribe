# LoomScribe — Off-the-Shelf Replacement Opportunities

> Constraint: The app must remain directly runnable (`node server.js` / `npm start`) — no build step required.

---

## 1. `src/server/db.js` → **`lowdb`** ⭐ High Impact

**What exists:** A hand-rolled JSON file store with a temp-file-swap write strategy, in-memory caching, and directory auto-creation.

**What to use:** [`lowdb`](https://github.com/typicode/lowdb) — a tiny, zero-dependency JSON database for Node. Handles atomic writes, in-memory caching, and file creation out of the box.

> **Important:** Use `lowdb` **v1** (CommonJS) not v5+ (ESM-only). `npm install lowdb@1`.

**Files affected:**
- ❌ Delete `src/server/db.js` entirely
- ✏️ Replace all `readDb()` / `writeDb()` callsites (conversations.js, messages.js, config.js, websocket.js) with `db.get('conversations')`, `db.set(...)`, `db.write()`

**Before:**
```js
const { readDb, writeDb } = require('../db');
const db = readDb();
db.conversations.push(newConv);
writeDb(db);
```

**After:**
```js
const db = require('../db'); // now exports lowdb instance
db.get('conversations').push(newConv).write();
```

---

## 2. `src/server/utils.js` → **`uuid`** ⭐ Medium Impact

**What exists:** A custom `generateUniqueId()` that loops collision-checking `Date.now() * 1000 + random` against the whole DB table.

**What to use:** [`uuid`](https://github.com/uuidjs/uuid) (v4 random UUIDs, guaranteed unique).

> **Note:** If you switch to uuid, IDs become strings, not numbers. The `isNaN(idStr) ? idStr : parseInt(idStr, 10)` ID-coercion code in all endpoints can then be simplified to just `req.params.id` directly.

**Files affected:**
- ❌ Delete `src/server/utils.js` entirely
- ✏️ Replace `generateUniqueId(db, 'messages')` → `uuidv4()` across conversations.js, messages.js, websocket.js

---

## 3. `server.js` PID file management → Remove ⭐ Low Impact

**What exists:** ~25 lines of manual PID file writing/cleanup across `exit`, `SIGINT`, `SIGTERM`, `uncaughtException` handlers.

**What to do:** Drop entirely. Since this is a local personal tool, PID management for `.bat` file process control adds noise with minimal benefit. The `uncaughtException` logger can stay.

**Files affected:**
- ✏️ Trim `server.js` lines 10–36 down to just the exception logger

---

## 4. `websocket.js` + `proxy.js` raw `https.request` streaming → **`openai` SDK** ⭐⭐⭐ Highest Impact

**What exists:** A fully manual SSE stream parser (`buffer.split('\n')`, `data: ` prefix stripping, `[DONE]` detection) inside the WebSocket handler — duplicated across `websocket.js` and `proxy.js`.

**What to use:** The [`openai`](https://github.com/openai/openai-node) Node SDK. DeepSeek's API is fully OpenAI-compatible. The SDK handles streaming, retries, error parsing, and SSE parsing natively.

```js
const OpenAI = require('openai');
const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey });

const stream = await client.chat.completions.create({
    model, messages, stream: true, temperature
});

for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) broadcast({ type: 'token', content: delta });
}
```

**Files affected:**
- ✏️ Rewrite the `handleGenerate` function in `websocket.js` (~110 lines → ~20 lines)
- ✏️ Rewrite `proxy.js` (`/api/chat/completions`) — can pipe the SDK stream directly

---

## 5. `engine/compiler.js` `{{placeholder}}` interpolation → **`mustache`** (Optional / Future)

**What exists:** A `body.match(/\{\{([^}]+)\}\}/g)` check that currently only *warns* on unknown placeholders but doesn't actually substitute them.

**What to use:** [`mustache`](https://github.com/janl/mustache.js) if you ever want actual `{{param}}` → value substitution in block markdown files. Today blocks contain no active placeholders so this is optional.

---

## Summary Table

| # | Custom Code | Replacement | Package | Lines Saved | Impact |
|---|---|---|---|---|---|
| 1 | `db.js` (JSON file store) | `lowdb@1` | `lowdb` | ~52 lines | ⭐⭐ High |
| 2 | `utils.js` (ID generation) | `uuid` v4 | `uuid` | ~12 lines | ⭐ Medium |
| 3 | `server.js` PID management | Remove / simplify | — | ~25 lines | ⭐ Low |
| 4 | `websocket.js` + `proxy.js` SSE parser | `openai` SDK | `openai` | ~100 lines | ⭐⭐⭐ Highest |
| 5 | `compiler.js` placeholder warn | `mustache` | `mustache` | future-only | Optional |

---

## What Stays Custom (and Should)

These are legitimately unique to this app — no off-the-shelf replacement makes sense:

- **`engine/compiler.js`** — the block-assembly pipeline, preset resolution, parameter-to-block mapping logic. This *is* the app's core value.
- **`engine/blocks/*.md`** and **`engine/presets/*.json`** — domain content.
- **`src/server/services/version-tree.js`** — the branching conversation tree logic. There's no general-purpose package for this pattern.
- **`src/server/routes.js`** — trivial route aggregator.
- **`src/server/endpoints/*`** — the REST API design is specific to this app's data model.

---

## Recommended Install

```bash
npm install lowdb@1 uuid openai
```

No build step, no transpiler — all CommonJS, directly runnable.
