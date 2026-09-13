const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const registerConversationsRoutes = require('../src/server/endpoints/conversations');
const db = require('../src/server/db');

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

test.describe('Conversation Endpoints (/api/conversations)', () => {
    const dbPath = db.getDbFile();

    test.beforeEach(() => {
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.afterEach(() => {
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.after(() => {
        try {
            if (fs.existsSync(dbPath) && dbPath.endsWith('.test.json')) {
                fs.unlinkSync(dbPath);
            }
        } catch (_) {}
    });

    test('GET /api/conversations returns list of conversations', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        db.writeDb({
            conversations: [
                { id: 1, title: 'Chat 1', activeModel: 'deepseek-v4-pro' },
                { id: 2, title: 'Chat 2', activeModel: 'custom-model' }
            ]
        });

        const res = await request(app, 'GET', '/api/conversations');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.length, 2);
        assert.strictEqual(res.body[0].title, 'Chat 1');
        assert.strictEqual(res.body[1].title, 'Chat 2');
    });

    test('POST /api/conversations creates new conversation with defaults and custom engine properties', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        // 1. Create with defaults
        const resDefault = await request(app, 'POST', '/api/conversations', {});
        assert.strictEqual(resDefault.status, 200);
        assert.ok(resDefault.body.id);
        assert.strictEqual(resDefault.body.title, 'New Chat');
        assert.strictEqual(resDefault.body.activeModel, 'deepseek-v4-pro');
        assert.deepStrictEqual(resDefault.body.params, {});

        // 2. Create with custom settings
        const resCustom = await request(app, 'POST', '/api/conversations', {
            title: 'Sci-Fi Novel',
            activeModel: 'claude-3-5',
            presetId: 'general',
            params: { word_count: 2000, pov: 'first' },
            blockOverrides: { format_rules: false },
            directorNote: 'Keep it gritty'
        });

        assert.strictEqual(resCustom.status, 200);
        assert.strictEqual(resCustom.body.title, 'Sci-Fi Novel');
        assert.strictEqual(resCustom.body.activeModel, 'claude-3-5');
        assert.strictEqual(resCustom.body.presetId, 'general');
        assert.strictEqual(resCustom.body.params.word_count, 2000);
        assert.strictEqual(resCustom.body.blockOverrides.format_rules, false);
        assert.strictEqual(resCustom.body.directorNote, 'Keep it gritty');

        // Check in DB
        const savedDb = db.readDb();
        assert.strictEqual(savedDb.conversations.length, 2);
    });

    test('GET /api/conversations/:id returns conversation or 404', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        db.writeDb({
            conversations: [
                { id: 10, title: 'Existing Chat', activeModel: 'deepseek-v4-pro' }
            ]
        });

        // Found
        const resFound = await request(app, 'GET', '/api/conversations/10');
        assert.strictEqual(resFound.status, 200);
        assert.strictEqual(resFound.body.id, 10);
        assert.strictEqual(resFound.body.title, 'Existing Chat');

        // Not Found
        const resMissing = await request(app, 'GET', '/api/conversations/999');
        assert.strictEqual(resMissing.status, 404);
    });

    test('PUT /api/conversations/:id updates fields and merges params/blockOverrides', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        db.writeDb({
            conversations: [
                {
                    id: 20,
                    title: 'Original Title',
                    activeModel: 'deepseek-v4-pro',
                    params: { word_count: 1500, pov: 'third' },
                    blockOverrides: { base_writer: true }
                }
            ]
        });

        const resUpdate = await request(app, 'PUT', '/api/conversations/20', {
            title: 'Updated Title',
            params: { word_count: 2500 },
            blockOverrides: { format_rules: false },
            directorNote: 'Updated director note'
        });

        assert.strictEqual(resUpdate.status, 200);
        assert.strictEqual(resUpdate.body.title, 'Updated Title');
        // Merged params
        assert.strictEqual(resUpdate.body.params.word_count, 2500);
        assert.strictEqual(resUpdate.body.params.pov, 'third');
        // Merged blockOverrides
        assert.strictEqual(resUpdate.body.blockOverrides.base_writer, true);
        assert.strictEqual(resUpdate.body.blockOverrides.format_rules, false);
        assert.strictEqual(resUpdate.body.directorNote, 'Updated director note');

        // 404 for nonexistent
        const resMissing = await request(app, 'PUT', '/api/conversations/999', { title: 'New' });
        assert.strictEqual(resMissing.status, 404);
    });

    test('DELETE /api/conversations/:id deletes conversation AND cascade deletes associated messages', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        db.writeDb({
            conversations: [
                { id: 30, title: 'Chat to Delete' },
                { id: 31, title: 'Chat to Keep' }
            ],
            messages: [
                { id: 1, conversationId: 30, content: 'msg 1' },
                { id: 2, conversationId: 30, content: 'msg 2' },
                { id: 3, conversationId: 31, content: 'msg 3' }
            ]
        });

        const resDelete = await request(app, 'DELETE', '/api/conversations/30');
        assert.strictEqual(resDelete.status, 200);
        assert.strictEqual(resDelete.body.success, true);

        const updatedDb = db.readDb();
        assert.strictEqual(updatedDb.conversations.length, 1);
        assert.strictEqual(updatedDb.conversations[0].id, 31);
        // Cascade deleted messages of conversation 30
        assert.strictEqual(updatedDb.messages.length, 1);
        assert.strictEqual(updatedDb.messages[0].id, 3);
        assert.strictEqual(updatedDb.messages[0].conversationId, 31);
    });

    test('POST /api/conversations/:id/fork forks conversation up to target message', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        db.writeDb({
            conversations: [
                { id: 100, title: 'Original Chat', activeModel: 'test-model', presetId: 'general', params: { pov: 'first' } }
            ],
            messages: [
                { id: 1, conversationId: 100, role: 'user', content: 'hello', isActive: true, parentMsgId: null },
                { id: 2, conversationId: 100, role: 'assistant', content: 'hi there', isActive: true, parentMsgId: 1 },
                { id: 3, conversationId: 100, role: 'user', content: 'how are you?', isActive: true, parentMsgId: 2 },
                { id: 4, conversationId: 100, role: 'assistant', content: 'doing well', isActive: true, parentMsgId: 3 }
            ]
        });

        // Fork at message 2 ("hi there")
        const res = await request(app, 'POST', '/api/conversations/100/fork', {
            messageId: 2
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.title, 'Fork of Original Chat');
        assert.strictEqual(res.body.activeModel, 'test-model');
        assert.strictEqual(res.body.presetId, 'general');
        assert.strictEqual(res.body.params.pov, 'first');
        assert.notStrictEqual(res.body.id, 100);

        const updatedDb = db.readDb();
        const newConvId = res.body.id;
        const forkedMessages = updatedDb.messages.filter(m => m.conversationId === newConvId);

        assert.strictEqual(forkedMessages.length, 2);
        assert.strictEqual(forkedMessages[0].role, 'user');
        assert.strictEqual(forkedMessages[0].content, 'hello');
        assert.strictEqual(forkedMessages[1].role, 'assistant');
        assert.strictEqual(forkedMessages[1].content, 'hi there');
        assert.strictEqual(forkedMessages[1].parentMsgId, forkedMessages[0].id);
    });

    test('POST /api/conversations/:id/fork handles validation error branches', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        db.writeDb({
            conversations: [
                { id: 100, title: 'Original Chat' }
            ],
            messages: [
                { id: 1, conversationId: 100, role: 'user', content: 'hello', isActive: true, parentMsgId: null }
            ]
        });

        // Missing messageId -> 400
        const resNoMsg = await request(app, 'POST', '/api/conversations/100/fork', {});
        assert.strictEqual(resNoMsg.status, 400);

        // Non-existent conversation -> 404
        const resNoConv = await request(app, 'POST', '/api/conversations/999/fork', { messageId: 1 });
        assert.strictEqual(resNoConv.status, 404);

        // Target message not found in this conversation -> 404
        const resTargetMissing = await request(app, 'POST', '/api/conversations/100/fork', { messageId: 999 });
        assert.strictEqual(resTargetMissing.status, 404);
    });

    test('POST /api/conversations handles concurrent requests sequentially without lost updates', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        const count = 15;
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(request(app, 'POST', '/api/conversations', { title: `Concurrent Chat ${i}` }));
        }

        const results = await Promise.all(promises);
        for (const res of results) {
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.id);
        }

        const currentDb = db.readDb();
        assert.strictEqual(currentDb.conversations.length, count);
    });
});
