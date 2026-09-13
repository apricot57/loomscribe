const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Globals stubbed per test — the frontend modules read these lazily at call time.
let api; // loaded once via dynamic import (public/js is ESM)

describe('markdown.js pure logic', () => {
    beforeEach(() => { delete globalThis.marked; delete globalThis.DOMPurify; delete globalThis.document; });
    afterEach(() => { delete globalThis.marked; delete globalThis.DOMPurify; delete globalThis.document; });

    test('escapeHtml escapes all HTML-significant characters', async () => {
        const { escapeHtml } = await import('../public/js/markdown.js');
        assert.strictEqual(escapeHtml('<img src=x onerror="p()" \'&>'), '&lt;img src=x onerror=&quot;p()&quot; &#039;&amp;&gt;');
    });

    test('escapeHtml maps empty and null input to empty string', async () => {
        const { escapeHtml } = await import('../public/js/markdown.js');
        assert.strictEqual(escapeHtml(''), '');
        assert.strictEqual(escapeHtml(null), '');
    });

    test('renderMarkdown without marked falls back to escaped HTML, never raw input', async () => {
        const { renderMarkdown } = await import('../public/js/markdown.js');
        const out = renderMarkdown('<script>alert(1)</script>\nnext **line**');
        assert.ok(out.startsWith('<p>'), 'wraps in paragraph');
        assert.ok(out.includes('&lt;script&gt;'), 'script tags escaped');
        assert.ok(!out.includes('<script'), 'no raw script element');
        assert.ok(out.includes('<br>'), 'newlines become <br>');
        assert.ok(out.includes('**line**'), 'markdown left unrendered when no parser');
    });

    test('renderMarkdown with marked but without DOMPurify falls back to escaped text, not raw parser output', async () => {
        // Regression: the DOMPurify-missing branch previously fell back to rawHtml.
        globalThis.marked = { setOptions() {}, parse: () => '<p>RAW</p><img src=x onerror=1>' };
        const { renderMarkdown } = await import('../public/js/markdown.js');
        const out = renderMarkdown('**hi**');
        assert.ok(!out.includes('RAW'), 'marked output discarded when sanitizer missing');
        assert.ok(!out.includes('<img'), 'no raw element injection');
        assert.ok(out.includes('**hi**'), 'content escaped into fallback paragraph');
    });

    test('renderMarkdown with marked and DOMPurify returns sanitized parser output', async () => {
        globalThis.marked = { setOptions() {}, parse: () => '<p>SAFE</p>' };
        globalThis.DOMPurify = { sanitize: (html) => html };
        globalThis.document = { createElement: () => ({ innerHTML: '', querySelectorAll: () => [] }) };
        const { renderMarkdown } = await import('../public/js/markdown.js');
        assert.strictEqual(renderMarkdown('hi'), '<p>SAFE</p>');
    });
});

describe('model configuration guard', () => {
    test('allows only active models backed by configured providers', async () => {
        const { hasUsableActiveModel } = await import('../public/js/components/chat.js');
        assert.strictEqual(hasUsableActiveModel({ activeModel: 'deepseek-chat', hasDeepSeekKey: false }), false);
        assert.strictEqual(hasUsableActiveModel({ activeModel: 'deepseek-chat', hasDeepSeekKey: true }), true);
        assert.strictEqual(hasUsableActiveModel({ activeModel: 'gpt-4o', hasOpenAIKey: true }), true);
        assert.strictEqual(hasUsableActiveModel({ activeModel: 'glm-4.7', hasGlmKey: true }), true);
        assert.strictEqual(hasUsableActiveModel({ activeModel: 'vendor/model', hasOpenRouterKey: true }), true);
        assert.strictEqual(hasUsableActiveModel({ activeModel: 'custom-local', customModels: [{ id: 'custom-local' }] }), true);
    });
});

describe('api.js error contract', () => {
    beforeEach(() => {
        globalThis.localStorage = {
            store: {},
            getItem(k) { return this.store[k] ?? null; },
            setItem(k, v) { this.store[k] = String(v); },
            removeItem(k) { delete this.store[k]; }
        };
        globalThis.localStorage.setItem('ls_auth_token', 'test-token');
    });
    afterEach(() => { delete globalThis.localStorage; delete globalThis.fetch; });

    async function loadApi() {
        if (!api) api = await import('../public/js/api.js');
        return api;
    }

    function stubFetch(response) {
        const calls = [];
        globalThis.fetch = async (url, options) => {
            calls.push({ url, options });
            return response;
        };
        return calls;
    }

    const errorResponse = { ok: false, status: 500, json: async () => ({ error: 'boom' }) };

    test('every exported API function rejects on a non-ok response', async () => {
        const mod = await loadApi();
        const calls = stubFetch(errorResponse);
        for (const [name, fn] of Object.entries(mod)) {
            if (typeof fn !== 'function') continue;
            calls.length = 0;
            // Extra args are ignored by functions with fewer parameters; destructure-only
            // params (forkConversation, navigateTurn) get the object they require.
            await assert.rejects(() => fn(1, {}, {}), Error, `${name} must reject on !res.ok`);
            assert.ok(calls.length > 0, `${name} must reach the network before failing`);
        }
    });

    test('createConversation resolves with the parsed body on success', async () => {
        const { createConversation } = await loadApi();
        const body = { id: 7, title: 'New Chat' };
        stubFetch({ ok: true, status: 200, json: async () => body });
        assert.deepEqual(await createConversation(), body);
    });

    test('model-fetch functions surface the server error message from the response body', async () => {
        const { fetchGlmModels, fetchOpenAIModels } = await loadApi();
        stubFetch({ ok: false, status: 400, json: async () => ({ error: 'No API key configured' }) });
        await assert.rejects(fetchGlmModels(), /No API key configured/);
        await assert.rejects(fetchOpenAIModels(), /No API key configured/);
    });

    test('deleteEnginePreset flags presets still referenced by conversations', async () => {
        const { deleteEnginePreset } = await loadApi();
        stubFetch({ ok: false, status: 409, json: async () => ({ error: 'in use', inUse: true }) });
        await assert.rejects(deleteEnginePreset('general'), (err) => {
            assert.ok(err instanceof Error);
            assert.strictEqual(err.usedInConversations, true);
            return true;
        });
    });

    test('getEnginePresets flattens categorized preset listings', async () => {
        const { getEnginePresets } = await loadApi();
        stubFetch({ ok: true, status: 200, json: async () => ({ General: [{ id: 'a' }], World: [{ id: 'b' }, { id: 'c' }] }) });
        assert.deepEqual(await getEnginePresets(), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    });

    test('authFetch sends the bearer token and JSON-serializes object bodies', async () => {
        const { authFetch } = await import('../public/js/auth.js');
        const calls = stubFetch({ ok: true, status: 200, json: async () => ({}) });
        await authFetch('/api/conversations', { method: 'POST', body: { title: 'x' } });
        assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer test-token');
        assert.strictEqual(calls[0].options.headers['Content-Type'], 'application/json');
        assert.strictEqual(calls[0].options.body, JSON.stringify({ title: 'x' }));
    });

    test('authFetch omits the Authorization header when no token is stored', async () => {
        const { authFetch } = await import('../public/js/auth.js');
        globalThis.localStorage.removeItem('ls_auth_token');
        const calls = stubFetch({ ok: true, status: 200, json: async () => ({}) });
        await authFetch('/api/conversations');
        assert.ok(!('Authorization' in calls[0].options.headers));
    });
});
