const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const registerConfigRoutes = require('../src/server/endpoints/config');
const db = require('../src/server/db');

// Helper to make HTTP requests to the test app
function request(app, method, pathUrl, body = null) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
            const port = server.address().port;
            const payload = body ? JSON.stringify(body) : null;
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: pathUrl,
                method,
                headers: payload ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                } : {}
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    server.close();
                    try {
                        const json = JSON.parse(data);
                        resolve({ status: res.statusCode, body: json, headers: res.headers });
                    } catch (e) {
                        resolve({ status: res.statusCode, text: data, headers: res.headers });
                    }
                });
            });
            req.on('error', (err) => {
                server.close();
                reject(err);
            });
            if (payload) {
                req.write(payload);
            }
            req.end();
        });
    });
}

test.describe('Config Endpoints for Custom Models', () => {
    const dbPath = db.getDbFile();

    // Save API key env vars so tests are deterministic whether or not real keys are exported
    const originalApiKeys = {
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        GLM_API_KEY: process.env.GLM_API_KEY,
        ZAI_API_KEY: process.env.ZAI_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };

    test.beforeEach(() => {
        // Reset DB to clean state before each test
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
        for (const key of Object.keys(originalApiKeys)) {
            delete process.env[key];
        }
    });

    test.afterEach(() => {
        // Reset DB to clean state
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
        for (const [key, value] of Object.entries(originalApiKeys)) {
            if (value !== undefined) {
                process.env[key] = value;
            } else {
                delete process.env[key];
            }
        }
    });

    test.after(() => {
        try {
            if (fs.existsSync(dbPath) && dbPath.endsWith('.test.json')) {
                fs.unlinkSync(dbPath);
            }
        } catch (_) {}
    });

    test('GET /api/config returns customModels array', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        // Pre-populate db with a custom model
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-123',
                    name: 'My Local LLM',
                    endpoint: 'http://localhost:11434/v1',
                    apiKey: 'secret-key',
                    model: 'llama3'
                }]
            }
        });

        const res = await request(app, 'GET', '/api/config');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.hasKey, false);
        assert.strictEqual(res.body.activeModel, 'deepseek-v4-pro');
        assert.strictEqual(res.body.customModels.length, 1);
        assert.strictEqual(res.body.customModels[0].id, 'custom-123');
        assert.strictEqual(res.body.customModels[0].name, 'My Local LLM');
        assert.strictEqual(res.body.customModels[0].hasKey, true);
        assert.strictEqual(res.body.customModels[0].apiKey, undefined); // Ensure key is not exposed
    });

    test('POST /api/config returns updated customModels array', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-1',
                    name: 'Ollama',
                    endpoint: 'http://localhost:11434/v1',
                    apiKey: '',
                    model: 'mistral'
                }]
            }
        });

        const res = await request(app, 'POST', '/api/config', { activeModel: 'custom-1', theme: 'purple' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.activeModel, 'custom-1');
        assert.strictEqual(res.body.theme, 'purple');
        assert.strictEqual(res.body.customModels.length, 1);
        assert.strictEqual(res.body.customModels[0].hasKey, false);
    });

    test('POST /api/config/custom-models validates missing fields', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        const res = await request(app, 'POST', '/api/config/custom-models', {
            name: 'Incomplete Provider',
            endpoint: 'http://localhost:8000'
            // missing model
        });
        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error.includes('Missing required fields'));
    });

    test('POST /api/config/custom-models adds model and returns 201', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        const res = await request(app, 'POST', '/api/config/custom-models', {
            name: ' LM Studio ',
            endpoint: ' http://localhost:1234/v1 ',
            apiKey: ' test-key ',
            model: ' qwen-2.5 '
        });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.model.id.startsWith('custom-'));
        assert.strictEqual(res.body.model.name, 'LM Studio');
        assert.strictEqual(res.body.model.endpoint, 'http://localhost:1234/v1');
        assert.strictEqual(res.body.model.model, 'qwen-2.5');
        assert.strictEqual(res.body.model.hasKey, true);
        assert.strictEqual(res.body.model.apiKey, undefined);

        // Verify in DB
        const savedDb = db.readDb();
        assert.strictEqual(savedDb.settings.customModels.length, 1);
        assert.strictEqual(savedDb.settings.customModels[0].apiKey, 'test-key');
    });

    test('POST /api/config/custom-models clones model with API key when cloneFromId is passed', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-src-1',
                    name: 'Original Model',
                    endpoint: 'https://api.openai.com/v1',
                    apiKey: 'secret-token-999',
                    model: 'gpt-4o'
                }]
            }
        });

        const res = await request(app, 'POST', '/api/config/custom-models', {
            name: 'Cloned Model',
            endpoint: 'https://api.openai.com/v1',
            apiKey: '', // Left blank during clone
            model: 'gpt-4o-mini',
            cloneFromId: 'custom-src-1'
        });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.model.name, 'Cloned Model');
        assert.strictEqual(res.body.model.hasKey, true);

        const savedDb = db.readDb();
        assert.strictEqual(savedDb.settings.customModels.length, 2);
        const cloned = savedDb.settings.customModels.find(m => m.name === 'Cloned Model');
        assert.ok(cloned);
        assert.strictEqual(cloned.apiKey, 'secret-token-999'); // Key successfully copied
    });

    test('DELETE /api/config/custom-models/:id removes model from DB', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({
            settings: {
                customModels: [
                    { id: 'custom-1', name: 'Model 1', endpoint: 'http://a', apiKey: '', model: 'm1' },
                    { id: 'custom-2', name: 'Model 2', endpoint: 'http://b', apiKey: '', model: 'm2' }
                ]
            }
        });

        const res = await request(app, 'DELETE', '/api/config/custom-models/custom-1');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);

        const savedDb = db.readDb();
        assert.strictEqual(savedDb.settings.customModels.length, 1);
        assert.strictEqual(savedDb.settings.customModels[0].id, 'custom-2');
    });

    test('POST /api/config manages OpenAI keys, pinned models, and model lists', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: {} });

        const res = await request(app, 'POST', '/api/config', {
            openaiApiKey: 'sk-proj-test1234',
            pinnedOpenAIModels: ['gpt-5.6', 'gpt-4.5-preview'],
            openaiModels: ['gpt-5.6', 'gpt-4o', 'o3-mini']
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.hasOpenAIKey, true);
        assert.deepStrictEqual(res.body.pinnedOpenAIModels, ['gpt-5.6', 'gpt-4.5-preview']);
        assert.deepStrictEqual(res.body.openaiModels, ['gpt-5.6', 'gpt-4o', 'o3-mini']);

        const getRes = await request(app, 'GET', '/api/config');
        assert.strictEqual(getRes.body.hasOpenAIKey, true);
        assert.deepStrictEqual(getRes.body.pinnedOpenAIModels, ['gpt-5.6', 'gpt-4.5-preview']);
        assert.deepStrictEqual(getRes.body.openaiModels, ['gpt-5.6', 'gpt-4o', 'o3-mini']);
    });

    test('POST /api/config saves and retrieves GLM configuration', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: {} });

        const res = await request(app, 'POST', '/api/config', {
            glmApiKey: 'fake-glm-key-for-tests',
            pinnedGlmModels: ['glm-4.7-flash', 'glm-4.7'],
            glmModels: ['glm-4.7-flash', 'glm-4.7', 'glm-5.3-flash']
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.hasGlmKey, true);
        assert.deepStrictEqual(res.body.pinnedGlmModels, ['glm-4.7-flash', 'glm-4.7']);
        assert.deepStrictEqual(res.body.glmModels, ['glm-4.7-flash', 'glm-4.7', 'glm-5.3-flash']);

        const getRes = await request(app, 'GET', '/api/config');
        assert.strictEqual(getRes.body.hasGlmKey, true);
        assert.deepStrictEqual(getRes.body.pinnedGlmModels, ['glm-4.7-flash', 'glm-4.7']);
        assert.deepStrictEqual(getRes.body.glmModels, ['glm-4.7-flash', 'glm-4.7', 'glm-5.3-flash']);
    });

    test('POST /api/config saves and retrieves OpenRouter key and pinned models', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: {} });

        const res = await request(app, 'POST', '/api/config', {
            openrouterApiKey: 'sk-or-v1-test1234',
            pinnedOpenRouterModels: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o']
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.hasOpenRouterKey, true);
        assert.deepStrictEqual(res.body.pinnedOpenRouterModels, ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o']);

        const getRes = await request(app, 'GET', '/api/config');
        assert.strictEqual(getRes.body.hasOpenRouterKey, true);
        assert.deepStrictEqual(getRes.body.pinnedOpenRouterModels, ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o']);
    });

    test('POST /api/config saves and retrieves openrouterModelDetails cache', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: {} });

        const modelDetails = {
            'deepseek/deepseek-v4-flash': {
                name: 'DeepSeek V4 Flash',
                contextLength: 128000,
                promptCostPerMillion: 0.14,
                completionCostPerMillion: 0.28,
                lastUpdated: 1789210000000
            }
        };

        const res = await request(app, 'POST', '/api/config', {
            pinnedOpenRouterModels: ['deepseek/deepseek-v4-flash'],
            openrouterModelDetails: modelDetails
        });

        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.body.openrouterModelDetails, modelDetails);

        const getRes = await request(app, 'GET', '/api/config');
        assert.deepStrictEqual(getRes.body.openrouterModelDetails, modelDetails);
        assert.deepStrictEqual(getRes.body.pinnedOpenRouterModels, ['deepseek/deepseek-v4-flash']);
    });

    test('GET /api/openrouter/model-info validates query parameters', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        const res = await request(app, 'GET', '/api/openrouter/model-info');
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Missing required "model"/);
    });

    test('POST /api/config/fetch-glm-models rejects when no key is provided', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: {} });

        const res = await request(app, 'POST', '/api/config/fetch-glm-models');
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /No GLM API key/);
    });

    test('POST /api/config/fetch-openai-models rejects when no key is provided', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: {} });

        const res = await request(app, 'POST', '/api/config/fetch-openai-models');
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /No OpenAI API key/);
    });

    test('POST /api/config allows and persists slate theme', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: { theme: 'cyan' } });

        const res = await request(app, 'POST', '/api/config', { theme: 'slate' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.theme, 'slate');

        const getRes = await request(app, 'GET', '/api/config');
        assert.strictEqual(getRes.body.theme, 'slate');
    });
    test('GET and POST /api/config manages customizable sliding window and off toggle', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        // Default state
        db.writeDb({ settings: {} });
        const defaultRes = await request(app, 'GET', '/api/config');
        assert.strictEqual(defaultRes.status, 200);
        assert.strictEqual(defaultRes.body.slidingWindowEnabled, false);
        assert.strictEqual(defaultRes.body.slidingWindowSize, 16);

        // Update sliding window size
        const updateRes = await request(app, 'POST', '/api/config', {
            slidingWindowEnabled: true,
            slidingWindowSize: 32
        });
        assert.strictEqual(updateRes.status, 200);
        assert.strictEqual(updateRes.body.slidingWindowEnabled, true);
        assert.strictEqual(updateRes.body.slidingWindowSize, 32);

        // Turn off sliding window
        const offRes = await request(app, 'POST', '/api/config', {
            slidingWindowEnabled: false
        });
        assert.strictEqual(offRes.status, 200);
        assert.strictEqual(offRes.body.slidingWindowEnabled, false);
        assert.strictEqual(offRes.body.slidingWindowSize, 32);

        // Verify persistence via GET
        const verifyGet = await request(app, 'GET', '/api/config');
        assert.strictEqual(verifyGet.body.slidingWindowEnabled, false);
        assert.strictEqual(verifyGet.body.slidingWindowSize, 32);
    });
});
