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

test.describe('Conversation Fork Endpoint', () => {
    const dbPath = db.getDbFile();

    test.beforeEach(() => {
        db.writeDb({ conversations: [], messages: [], settings: {} });
    });

    test.afterEach(() => {
        db.writeDb({ conversations: [], messages: [], settings: {} });
    });

    test.after(() => {
        try {
            if (fs.existsSync(dbPath) && dbPath.endsWith('.test.json')) {
                fs.unlinkSync(dbPath);
            }
        } catch (_) {}
    });

    test('POST /api/conversations/:id/fork forks conversation up to target message', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        db.writeDb({
            conversations: [
                { id: 100, title: 'Original Chat', activeModel: 'test-model' }
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
});
