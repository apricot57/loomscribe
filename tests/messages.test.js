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
    test('PUT /api/messages/:id updates content and isActive flag after tree deactivation', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 40, conversationId: 1, role: 'user', content: 'original prompt', versionGroupId: 40, version: 1, isActive: true },
                { id: 41, conversationId: 1, role: 'assistant', content: 'response 1', parentMsgId: 40, versionGroupId: 41, version: 1, isActive: true },
                { id: 42, conversationId: 1, role: 'user', content: 'prompt 2', parentMsgId: 41, versionGroupId: 42, version: 1, isActive: true }
            ]
        });

        // 1. Deactivate tree starting from user message 40
        const resDeactivate = await request(app, 'POST', '/api/messages/40/deactivate-tree');
        assert.strictEqual(resDeactivate.status, 200);

        // 2. Update user message 40 with new content and isActive: true
        const resUpdate = await request(app, 'PUT', '/api/messages/40', {
            content: 'edited prompt',
            isActive: true
        });
        assert.strictEqual(resUpdate.status, 200);
        assert.strictEqual(resUpdate.body.content, 'edited prompt');
        assert.strictEqual(resUpdate.body.isActive, true);

        // Verify DB: Message 40 is active with new content, but children 41 and 42 remain inactive
        const updatedDb = db.readDb();
        const m40 = updatedDb.messages.find(m => m.id === 40);
        const m41 = updatedDb.messages.find(m => m.id === 41);
        const m42 = updatedDb.messages.find(m => m.id === 42);

        assert.strictEqual(m40.content, 'edited prompt');
        assert.strictEqual(m40.isActive, true);
        assert.strictEqual(m41.isActive, false);
        assert.strictEqual(m42.isActive, false);
    });
    test('POST /api/messages/:id/version and :versionGroupId/navigate support user message versioning and timeline switching', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        // Initial conversation turn: User 50 -> Assistant 51
        db.writeDb({
            messages: [
                { id: 50, conversationId: 1, role: 'user', content: 'What is the capital of France?', versionGroupId: 50, version: 1, isActive: true },
                { id: 51, conversationId: 1, role: 'assistant', content: 'Paris', parentMsgId: 50, versionGroupId: 51, version: 1, isActive: true }
            ]
        });

        // 1. Create version 2 of user message 50
        const resVer = await request(app, 'POST', '/api/messages/50/version', {
            content: 'What is the capital of Germany?',
            role: 'user'
        });
        assert.strictEqual(resVer.status, 200);
        assert.strictEqual(resVer.body.content, 'What is the capital of Germany?');
        assert.strictEqual(resVer.body.versionGroupId, 50);
        assert.strictEqual(resVer.body.version, 2);
        assert.strictEqual(resVer.body.isActive, true);

        const v2Id = resVer.body.id;

        // Add assistant response for v2
        const curDb = db.readDb();
        curDb.messages.push({
            id: 52,
            conversationId: 1,
            role: 'assistant',
            content: 'Berlin',
            parentMsgId: v2Id,
            versionGroupId: 52,
            version: 1,
            isActive: true
        });
        db.writeDb(curDb);

        // 2. Navigate back to user version 1
        const resNav1 = await request(app, 'POST', '/api/messages/50/navigate?version=1');
        assert.strictEqual(resNav1.status, 200);

        const dbNav1 = db.readDb();
        const m50_v1 = dbNav1.messages.find(m => m.id === 50);
        const m51 = dbNav1.messages.find(m => m.id === 51);
        const m50_v2 = dbNav1.messages.find(m => m.id === v2Id);
        const m52 = dbNav1.messages.find(m => m.id === 52);

        assert.strictEqual(m50_v1.isActive, true);
        assert.strictEqual(m51.isActive, true);
        assert.strictEqual(m50_v2.isActive, false);
        assert.strictEqual(m52.isActive, false);

        // 3. Navigate forward to user version 2
        const resNav2 = await request(app, 'POST', '/api/messages/50/navigate?version=2');
        assert.strictEqual(resNav2.status, 200);

        const dbNav2 = db.readDb();
        const m50_v1_after = dbNav2.messages.find(m => m.id === 50);
        const m51_after = dbNav2.messages.find(m => m.id === 51);
        const m50_v2_after = dbNav2.messages.find(m => m.id === v2Id);
        const m52_after = dbNav2.messages.find(m => m.id === 52);

        assert.strictEqual(m50_v1_after.isActive, false);
        assert.strictEqual(m51_after.isActive, false);
        assert.strictEqual(m50_v2_after.isActive, true);
        assert.strictEqual(m52_after.isActive, true);
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

    test('DELETE /api/messages/:id deletes single versioned response and activates remaining sibling version', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 201, conversationId: 1, role: 'user', content: 'prompt 1', versionGroupId: 201, version: 1, isActive: true },
                { id: 202, conversationId: 1, role: 'assistant', content: 'response v1', parentMsgId: 201, versionGroupId: 202, version: 1, isActive: false },
                { id: 203, conversationId: 1, role: 'assistant', content: 'response v2', parentMsgId: 201, versionGroupId: 202, version: 2, isActive: true },
                { id: 204, conversationId: 1, role: 'user', content: 'prompt 2 (from v2)', parentMsgId: 203, versionGroupId: 204, version: 1, isActive: true }
            ]
        });

        const res = await request(app, 'DELETE', '/api/messages/203');

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.deepStrictEqual(res.body.deletedIds.sort(), [203, 204]);

        const updatedDb = db.readDb();
        assert.strictEqual(updatedDb.messages.length, 2);

        const v1Msg = updatedDb.messages.find(m => m.id === 202);
        assert.ok(v1Msg);
        assert.strictEqual(v1Msg.isActive, true, 'Remaining sibling version should be activated');

        const deletedV2 = updatedDb.messages.find(m => m.id === 203);
        assert.strictEqual(deletedV2, undefined);

        const deletedChild = updatedDb.messages.find(m => m.id === 204);
        assert.strictEqual(deletedChild, undefined);
    });

    test('DELETE /api/messages/:id deletes edited prompt version when its assistant is deleted', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        db.writeDb({
            messages: [
                { id: 301, conversationId: 1, role: 'user', content: 'prompt v1', versionGroupId: 301, version: 1, isActive: false },
                { id: 302, conversationId: 1, role: 'assistant', content: 'response v1', parentMsgId: 301, versionGroupId: 302, version: 1, isActive: false },
                { id: 303, conversationId: 1, role: 'user', content: 'prompt v2', versionGroupId: 301, version: 2, isActive: true },
                { id: 304, conversationId: 1, role: 'assistant', content: 'response v2', parentMsgId: 303, versionGroupId: 304, version: 1, isActive: true }
            ]
        });

        const res = await request(app, 'DELETE', '/api/messages/304');

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.deepStrictEqual(res.body.deletedIds.sort(), [303, 304]);

        const updatedDb = db.readDb();
        assert.strictEqual(updatedDb.messages.length, 2);

        const userV1 = updatedDb.messages.find(m => m.id === 301);
        const asstV1 = updatedDb.messages.find(m => m.id === 302);
        assert.ok(userV1);
        assert.ok(asstV1);
        assert.strictEqual(userV1.isActive, true, 'User prompt v1 should be activated');
        assert.strictEqual(asstV1.isActive, true, 'Assistant response v1 should be activated');
    });

    test('DELETE /api/messages/:id returns 404 for nonexistent message', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        const res = await request(app, 'DELETE', '/api/messages/88888');
        assert.strictEqual(res.status, 404);
    });

    test('Full lifecycle: retry, version navigation, version deletion without leaving blank entries', async () => {
        const app = express();
        app.use(express.json());
        registerMessagesRoutes(app);

        // 1. Initial conversation with User 1 and Assistant 1
        db.writeDb({
            messages: [
                { id: 10, conversationId: 1, role: 'user', content: 'What is 2+2?', versionGroupId: 10, version: 1, isActive: true },
                { id: 11, conversationId: 1, role: 'assistant', content: 'It is 4.', parentMsgId: 10, versionGroupId: 11, version: 1, isActive: true }
            ]
        });

        // 2. User clicks Retry on Assistant 1 -> deactivate-tree is called
        const deactRes = await request(app, 'POST', '/api/messages/11/deactivate-tree');
        assert.strictEqual(deactRes.status, 200);
        assert.strictEqual(deactRes.body.versionGroupId, 11);
        assert.strictEqual(deactRes.body.nextVersion, 2);

        // 3. New Assistant 2 version is generated and saved
        const curDb = db.readDb();
        curDb.messages.push({
            id: 12,
            conversationId: 1,
            role: 'assistant',
            content: '2 + 2 = 4 (alternative)',
            parentMsgId: 10,
            versionGroupId: 11,
            version: 2,
            isActive: true
        });
        db.writeDb(curDb);

        // Verify state: Assistant 1 is inactive, Assistant 2 is active
        const midDb = db.readDb();
        const a1 = midDb.messages.find(m => m.id === 11);
        const a2 = midDb.messages.find(m => m.id === 12);
        assert.strictEqual(a1.isActive, false);
        assert.strictEqual(a2.isActive, true);

        // 4. User deletes Assistant 2 (version 2)
        const delA2Res = await request(app, 'DELETE', '/api/messages/12');
        assert.strictEqual(delA2Res.status, 200);
        assert.deepStrictEqual(delA2Res.body.deletedIds, [12]);

        // Verify state: Assistant 2 is gone, Assistant 1 is reactivated!
        const afterDelA2Db = db.readDb();
        assert.strictEqual(afterDelA2Db.messages.length, 2);
        const a1After = afterDelA2Db.messages.find(m => m.id === 11);
        assert.ok(a1After);
        assert.strictEqual(a1After.isActive, true, 'Assistant 1 should be active after Assistant 2 is deleted');

        // 5. User deletes Assistant 1 (only remaining answer)
        const delA1Res = await request(app, 'DELETE', '/api/messages/11');
        assert.strictEqual(delA1Res.status, 200);
        assert.deepStrictEqual(delA1Res.body.deletedIds, [11]);

        // Verify state: Only User 1 remains, active
        const afterDelA1Db = db.readDb();
        assert.strictEqual(afterDelA1Db.messages.length, 1);
        assert.strictEqual(afterDelA1Db.messages[0].id, 10);
        assert.strictEqual(afterDelA1Db.messages[0].isActive, true);
    });
});
