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
    const dbPath = path.resolve(__dirname, '../data/db.json');
    let originalDbContent = null;

    test.before(() => {
        if (fs.existsSync(dbPath)) {
            originalDbContent = fs.readFileSync(dbPath, 'utf-8');
        }
    });

    test.beforeEach(() => {
        // Reset DB to clean state before each test
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.afterEach(() => {
        // Reset DB to clean state
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.after(() => {
        if (originalDbContent !== null) {
            fs.writeFileSync(dbPath, originalDbContent, 'utf-8');
        }
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

    test('POST /api/config/fetch-openai-models rejects when no key is provided', async () => {
        const app = express();
        app.use(express.json());
        registerConfigRoutes(app);

        db.writeDb({ settings: {} });

        const res = await request(app, 'POST', '/api/config/fetch-openai-models');
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /No OpenAI API key/);
    });
});
