const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const registerMessagesRoutes = require('../src/server/endpoints/messages');
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

test.describe('Message Version Endpoints', () => {
    const dbPath = path.resolve(__dirname, '../data/db.json');
    let originalDbContent = null;

    test.before(() => {
        if (fs.existsSync(dbPath)) {
            originalDbContent = fs.readFileSync(dbPath, 'utf-8');
        }
    });

    test.beforeEach(() => {
        db.writeDb({ conversations: [], messages: [], settings: {} });
    });

    test.afterEach(() => {
        db.writeDb({ conversations: [], messages: [], settings: {} });
    });

    test.after(() => {
        if (originalDbContent !== null) {
            fs.writeFileSync(dbPath, originalDbContent, 'utf-8');
        }
    });

    test('GET /api/messages filters messages by conversationId', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 1, conversationId: 10, content: 'conv 10 msg' },
                { id: 2, conversationId: 20, content: 'conv 20 msg' },
                { id: 3, conversationId: 10, content: 'conv 10 msg 2' }
            ]
        });

        const res = await request(app, 'GET', '/api/messages?conversationId=10');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.length, 2);
        assert.strictEqual(res.body[0].id, 1);
        assert.strictEqual(res.body[1].id, 3);
    });

    test('POST /api/messages creates a raw message with defaults', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        const res = await request(app, 'POST', '/api/messages', {
            conversationId: 5,
            role: 'user',
            content: 'Hello world'
        });

        assert.strictEqual(res.status, 200);
        assert.ok(res.body.id);
        assert.strictEqual(res.body.conversationId, 5);
        assert.strictEqual(res.body.role, 'user');
        assert.strictEqual(res.body.content, 'Hello world');
        assert.strictEqual(res.body.isActive, true);
        assert.strictEqual(res.body.version, 1);

        const savedDb = db.readDb();
        assert.strictEqual(savedDb.messages.length, 1);
    });

    test('DELETE /api/messages deletes all messages for specified conversationId', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 1, conversationId: 10, content: 'm1' },
                { id: 2, conversationId: 20, content: 'm2' },
                { id: 3, conversationId: 10, content: 'm3' }
            ]
        });

        const res = await request(app, 'DELETE', '/api/messages?conversationId=10');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);

        const savedDb = db.readDb();
        assert.strictEqual(savedDb.messages.length, 1);
        assert.strictEqual(savedDb.messages[0].conversationId, 20);
    });

    test('POST /api/messages/:versionGroupId/navigate activates target version and handles error validation', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 1, conversationId: 1, role: 'assistant', versionGroupId: 1, version: 1, isActive: true },
                { id: 2, conversationId: 1, role: 'assistant', versionGroupId: 1, version: 2, isActive: false }
            ]
        });

        // 1. Missing version parameter -> 400
        const resNoParam = await request(app, 'POST', '/api/messages/1/navigate');
        assert.strictEqual(resNoParam.status, 400);

        // 2. Nonexistent target version -> 404
        const resMissingVersion = await request(app, 'POST', '/api/messages/1/navigate?version=99');
        assert.strictEqual(resMissingVersion.status, 404);

        // 3. Successful navigation to version 2
        const resSuccess = await request(app, 'POST', '/api/messages/1/navigate?version=2');
        assert.strictEqual(resSuccess.status, 200);
        assert.strictEqual(resSuccess.body.success, true);

        const savedDb = db.readDb();
        const m1 = savedDb.messages.find(m => m.id === 1);
        const m2 = savedDb.messages.find(m => m.id === 2);
        assert.strictEqual(m1.isActive, false);
        assert.strictEqual(m2.isActive, true);
    });

    test('POST /api/messages/navigate-turn switches active prompt and response', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 1, conversationId: 1, role: 'user', content: 'prompt 1', versionGroupId: 1, version: 1, isActive: false },
                { id: 2, conversationId: 1, role: 'assistant', content: 'response 1-1', parentMsgId: 1, versionGroupId: 2, version: 1, isActive: false },
                { id: 3, conversationId: 1, role: 'assistant', content: 'response 1-2', parentMsgId: 1, versionGroupId: 2, version: 2, isActive: false },
                { id: 4, conversationId: 1, role: 'user', content: 'prompt 2', versionGroupId: 1, version: 2, isActive: true },
                { id: 5, conversationId: 1, role: 'assistant', content: 'response 2-1', parentMsgId: 4, versionGroupId: 5, version: 1, isActive: true }
            ]
        });

        const res = await request(app, 'POST', '/api/messages/navigate-turn', {
            userMsgId: 1,
            assistantMsgId: 3
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);

        const updatedDb = db.readDb();
        const m1 = updatedDb.messages.find(m => m.id === 1);
        const m2 = updatedDb.messages.find(m => m.id === 2);
        const m3 = updatedDb.messages.find(m => m.id === 3);
        const m4 = updatedDb.messages.find(m => m.id === 4);
        const m5 = updatedDb.messages.find(m => m.id === 5);

        assert.strictEqual(m1.isActive, true);
        assert.strictEqual(m2.isActive, false);
        assert.strictEqual(m3.isActive, true);
        assert.strictEqual(m4.isActive, false);
        assert.strictEqual(m5.isActive, false);
    });

    test('POST /api/messages/navigate-turn handles string IDs and null assistantMsgId', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 1, conversationId: 1, role: 'user', content: 'prompt 1', versionGroupId: 1, version: 1, isActive: false },
                { id: 2, conversationId: 1, role: 'assistant', content: 'response 1-1', parentMsgId: 1, versionGroupId: 2, version: 1, isActive: false },
                { id: 4, conversationId: 1, role: 'user', content: 'prompt 2', versionGroupId: 1, version: 2, isActive: true },
                { id: 5, conversationId: 1, role: 'assistant', content: 'response 2-1', parentMsgId: 4, versionGroupId: 5, version: 1, isActive: true }
            ]
        });

        const res = await request(app, 'POST', '/api/messages/navigate-turn', {
            userMsgId: '1',
            assistantMsgId: null
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);

        const updatedDb = db.readDb();
        const m1 = updatedDb.messages.find(m => m.id === 1);
        const m4 = updatedDb.messages.find(m => m.id === 4);

        assert.strictEqual(m1.isActive, true);
        assert.strictEqual(m4.isActive, false);
    });

    test('POST /api/messages/navigate-turn validates missing or nonexistent userMsgId', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({ messages: [] });

        // Missing userMsgId -> 400
        const resMissing = await request(app, 'POST', '/api/messages/navigate-turn', {});
        assert.strictEqual(resMissing.status, 400);

        // Nonexistent userMsgId -> 404
        const resNotFound = await request(app, 'POST', '/api/messages/navigate-turn', { userMsgId: 999 });
        assert.strictEqual(resNotFound.status, 404);
    });

    test('POST /api/messages/navigate-turn does not deactivate assistant messages with same versionGroupId', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        // Assistant version group sharing ID '1' with User message
        db.writeDb({
            messages: [
                { id: 1, conversationId: 1, role: 'user', content: 'prompt 1', versionGroupId: 1, version: 1, isActive: false },
                { id: 2, conversationId: 1, role: 'assistant', content: 'response 1-1', parentMsgId: 1, versionGroupId: 1, version: 1, isActive: true },
                { id: 3, conversationId: 1, role: 'user', content: 'prompt 2', versionGroupId: 1, version: 2, isActive: true }
            ]
        });

        const res = await request(app, 'POST', '/api/messages/navigate-turn', {
            userMsgId: 1,
            assistantMsgId: null
        });

        assert.strictEqual(res.status, 200);
        const updatedDb = db.readDb();
        const m2 = updatedDb.messages.find(m => m.id === 2);
        // Assistant message should remain active (or at least not be deactivated via userVersions deactivation)
        assert.strictEqual(m2.isActive, true);
    });

    test('POST /api/messages/navigate-turn deactivates sibling subtrees during showDescendants traversal', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        // Setup message tree:
        // User 4 (active)
        //   ├─ Assistant 5 (active)
        //   │    └─ User 6 (active)
        //   └─ Assistant 7 (inactive)
        //        └─ User 8 (active)
        db.writeDb({
            messages: [
                { id: 4, conversationId: 1, role: 'user', content: 'prompt 2', versionGroupId: 4, version: 1, isActive: true },
                { id: 5, conversationId: 1, role: 'assistant', content: 'response 2-1', parentMsgId: 4, versionGroupId: 5, version: 1, isActive: true },
                { id: 6, conversationId: 1, role: 'user', content: 'prompt 3', parentMsgId: 5, versionGroupId: 6, version: 1, isActive: true },
                { id: 7, conversationId: 1, role: 'assistant', content: 'response 2-2', parentMsgId: 4, versionGroupId: 5, version: 2, isActive: false },
                { id: 8, conversationId: 1, role: 'user', content: 'prompt 3-alternate', parentMsgId: 7, versionGroupId: 8, version: 1, isActive: true }
            ]
        });

        // Navigate turn: activate User 4 and Assistant 7 (which has higher version)
        // Under showDescendants, it will choose Assistant 7 (bestChild of 4) and deactivate Assistant 5 and its child User 6.
        const res = await request(app, 'POST', '/api/messages/navigate-turn', {
            userMsgId: 4,
            assistantMsgId: 7
        });

        assert.strictEqual(res.status, 200);
        const updatedDb = db.readDb();
        const m5 = updatedDb.messages.find(m => m.id === 5);
        const m6 = updatedDb.messages.find(m => m.id === 6);
        const m7 = updatedDb.messages.find(m => m.id === 7);
        const m8 = updatedDb.messages.find(m => m.id === 8);

        assert.strictEqual(m7.isActive, true);
        assert.strictEqual(m8.isActive, true);
        assert.strictEqual(m5.isActive, false); // Siblings should be deactivated
        assert.strictEqual(m6.isActive, false); // Sibling's descendants should be deactivated
    });

    test('POST /api/messages/:id/version creates a new version, updates original versionGroupId, and deactivates others', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 1, conversationId: 1, role: 'user', content: 'original prompt', isActive: true }
            ]
        });

        const res = await request(app, 'POST', '/api/messages/1/version', {
            content: 'edited prompt',
            role: 'user'
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.content, 'edited prompt');
        assert.strictEqual(res.body.versionGroupId, 1);
        assert.strictEqual(res.body.version, 2);
        assert.strictEqual(res.body.isActive, true);

        const updatedDb = db.readDb();
        const m1 = updatedDb.messages.find(m => m.id === 1);
        assert.strictEqual(m1.versionGroupId, 1);
        assert.strictEqual(m1.version, 1);
        assert.strictEqual(m1.isActive, false); // Original should be deactivated

        // 404 for nonexistent message
        const resMissing = await request(app, 'POST', '/api/messages/999/version', { content: 'test' });
        assert.strictEqual(resMissing.status, 404);
    });

    test('POST /api/messages/:id/deactivate-tree deactivates the version group and returns next version', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 10, conversationId: 1, role: 'assistant', content: 'bot response', isActive: true }
            ]
        });

        const res = await request(app, 'POST', '/api/messages/10/deactivate-tree');

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.versionGroupId, 10);
        assert.strictEqual(res.body.nextVersion, 2);

        const updatedDb = db.readDb();
        const m10 = updatedDb.messages.find(m => m.id === 10);
        assert.strictEqual(m10.isActive, false); // Version group should be deactivated

        // 404 for nonexistent message
        const resMissing = await request(app, 'POST', '/api/messages/999/deactivate-tree');
        assert.strictEqual(resMissing.status, 404);
    });

    test('showDescendants picks child with higher ID when sibling versionGroupIds are null', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        // Setup message tree:
        // User 20 (active)
        //   ├─ Assistant 21 (inactive, versionGroupId: null, version: 1)
        //   └─ Assistant 22 (inactive, versionGroupId: null, version: 1)  <- Higher ID
        db.writeDb({
            messages: [
                { id: 20, conversationId: 1, role: 'user', content: 'prompt', versionGroupId: 20, version: 1, isActive: true },
                { id: 21, conversationId: 1, role: 'assistant', content: 'first response', parentMsgId: 20, versionGroupId: null, version: 1, isActive: false },
                { id: 22, conversationId: 1, role: 'assistant', content: 'second response', parentMsgId: 20, versionGroupId: null, version: 1, isActive: false }
            ]
        });

        // Navigate turn: activate User 20 and find the active assistant.
        // It should pick Assistant 22 because it has a higher ID, instead of getting stuck on 21.
        const res = await request(app, 'POST', '/api/messages/navigate-turn', {
            userMsgId: 20,
            assistantMsgId: null
        });

        assert.strictEqual(res.status, 200);
        const updatedDb = db.readDb();
        const m21 = updatedDb.messages.find(m => m.id === 21);
        const m22 = updatedDb.messages.find(m => m.id === 22);

        assert.strictEqual(m22.isActive, true);  // Higher ID should be activated
        assert.strictEqual(m21.isActive, false); // Sibling with lower ID should stay/become inactive
    });

    test('PUT /api/messages/:id modifies message content in-place without creating a new version', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 30, conversationId: 1, role: 'assistant', content: 'original bot content', versionGroupId: 30, version: 1, isActive: true }
            ]
        });

        const res = await request(app, 'PUT', '/api/messages/30', {
            content: 'edited bot content'
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.content, 'edited bot content');
        assert.strictEqual(res.body.versionGroupId, 30);
        assert.strictEqual(res.body.version, 1); // Version should remain unchanged
        assert.strictEqual(res.body.isActive, true);

        const updatedDb = db.readDb();
        assert.strictEqual(updatedDb.messages.length, 1); // No new message should be created
        const m30 = updatedDb.messages.find(m => m.id === 30);
        assert.strictEqual(m30.content, 'edited bot content');

        // 404 for nonexistent message
        const resMissing = await request(app, 'PUT', '/api/messages/999', { content: 'test' });
        assert.strictEqual(resMissing.status, 404);
    });

    test('DELETE /api/messages/:id/version-group deletes version group and descendants recursively', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 101, conversationId: 1, role: 'user', content: 'prompt 1', versionGroupId: 101, version: 1, isActive: true },
                { id: 102, conversationId: 1, role: 'assistant', content: 'response 1', parentMsgId: 101, versionGroupId: 102, version: 1, isActive: true },
                { id: 103, conversationId: 1, role: 'user', content: 'prompt 2', parentMsgId: 102, versionGroupId: 103, version: 1, isActive: true }
            ]
        });

        const res = await request(app, 'DELETE', '/api/messages/101/version-group');

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.deepStrictEqual(res.body.deletedIds.sort(), [101, 102, 103]);

        const updatedDb = db.readDb();
        assert.strictEqual(updatedDb.messages.length, 0);

        // 404 for nonexistent message
        const resMissing = await request(app, 'DELETE', '/api/messages/999/version-group');
        assert.strictEqual(resMissing.status, 404);
    });
});
