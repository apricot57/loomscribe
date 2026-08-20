const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');

const { initWebSocketServer } = require('../src/server/websocket');
const db = require('../src/server/db');

test.describe('WebSocket Dynamic API Proxy Routing', () => {
    const dbPath = path.resolve(__dirname, '../data/db.json');
    let originalDbContent = null;
    let mockHttpServer = null;
    let mockServerPort = 0;
    let mockRequests = [];

    test.before(async () => {
        if (fs.existsSync(dbPath)) {
            originalDbContent = fs.readFileSync(dbPath, 'utf-8');
        }

        // Setup a mock HTTP backend server to receive proxied API requests
        mockHttpServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                let jsonBody = null;
                try {
                    jsonBody = JSON.parse(body);
                } catch (e) {}

                mockRequests.push({
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body: jsonBody
                });

                if (req.url === '/v1/chat/completions') {
                    if (jsonBody && jsonBody.model === 'status-500-model') {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'Upstream server overloaded' } }));
                        return;
                    }

                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });

                    if (jsonBody && jsonBody.model === 'stream-error-model') {
                        res.write('data: {"choices":[{"delta":{"content":"Partial content before "}}]}\n\n');
                        res.write('data: {"error": {"message": "Context window exceeded"}}\n\n');
                        res.end();
                    } else if (jsonBody && jsonBody.model === 'guardrail-model') {
                        res.write('data: {"choices":[{"delta":{"content":"Partial safety "}}]}\n\n');
                        res.write('data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n');
                        res.end();
                    } else if (jsonBody && jsonBody.model === 'very-slow-model') {
                        res.write('data: {"choices":[{"delta":{"content":"Slow chunk 1"}}]}\n\n');
                        const interval = setInterval(() => {
                            if (!res.writableEnded) {
                                res.write('data: {"choices":[{"delta":{"content":"Slow chunk more"}}]}\n\n');
                            } else {
                                clearInterval(interval);
                            }
                        }, 100);
                        req.on('close', () => {
                            clearInterval(interval);
                        });
                    } else if (jsonBody && jsonBody.model === 'slow-model') {
                        res.write('data: {"choices":[{"delta":{"content":"Slow response start"}}]}\n\n');
                        setTimeout(() => {
                            res.write('data: {"choices":[{"delta":{"content":"Slow response end"}}]}\n\n');
                            res.write('data: [DONE]\n\n');
                            res.end();
                        }, 150);
                    } else {
                        res.write('data: {"choices":[{"delta":{"content":"Response from mock"}}]}\n\n');
                        res.write('data: [DONE]\n\n');
                        res.end();
                    }
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });
        });

        await new Promise((resolve) => {
            mockHttpServer.listen(0, '127.0.0.1', () => {
                mockServerPort = mockHttpServer.address().port;
                resolve();
            });
        });
    });

    test.beforeEach(() => {
        mockRequests = [];
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.afterEach(() => {
        mockRequests = [];
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.after(async () => {
        if (originalDbContent !== null) {
            fs.writeFileSync(dbPath, originalDbContent, 'utf-8');
        }
        if (mockHttpServer) {
            await new Promise((resolve) => mockHttpServer.close(resolve));
        }
    });

    test('Fails standard DeepSeek generation if no server API key is set', async () => {
        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            model: 'deepseek-chat',
                            messages: [{ role: 'user', content: 'Hi' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'error') {
                        assert.ok(msg.error.includes('API Key is missing on the server'));
                        ws.close();
                        server.close(resolve);
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Routes generate request for custom model to http backend with normalized endpoint and no thinking field', async () => {
        // Configure custom model in db
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-ollama',
                    name: 'Local Ollama',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'llama3:8b'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                const receivedTokens = [];

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            model: 'custom-ollama',
                            messages: [{ role: 'user', content: 'Hello custom!' }],
                            thinking: { type: 'enabled' }
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'token') {
                        receivedTokens.push(msg.text || msg.token || msg.reasoning || '');
                    }
                });

                ws.on('close', () => {
                    server.close(() => {
                        try {
                            assert.strictEqual(mockRequests.length, 1);
                            const mockReq = mockRequests[0];
                            assert.strictEqual(mockReq.method, 'POST');
                            assert.strictEqual(mockReq.url, '/v1/chat/completions');
                            assert.strictEqual(mockReq.headers['authorization'], 'Bearer test-custom-key');
                            assert.strictEqual(mockReq.body.model, 'llama3:8b');
                            assert.strictEqual(mockReq.body.stream, true);
                            assert.strictEqual(mockReq.body.thinking, undefined); // thinking field excluded for custom endpoints
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                });

                // Wait slightly then close client to end test
                setTimeout(() => {
                    ws.close();
                }, 300);
            });
        });
    });

    test('Sends error on invalid endpoint configured', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'bad-endpoint-model',
                    name: 'Bad',
                    endpoint: 'not-a-valid-url',
                    apiKey: '',
                    model: 'm1'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            model: 'bad-endpoint-model',
                            messages: [{ role: 'user', content: 'Hi' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'error') {
                        assert.ok(msg.error.includes('Invalid API endpoint configured'));
                        ws.close();
                        server.close(resolve);
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Saves partial message on stream error and broadcasts type: error', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-error-id',
                    name: 'Error Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'stream-error-model'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            model: 'custom-error-id',
                            messages: [{ role: 'user', content: 'test error' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'error') {
                        try {
                            assert.strictEqual(msg.error, 'Context window exceeded');
                            assert.ok(msg.message);
                            assert.strictEqual(msg.message.content, 'Partial content before ');
                            assert.strictEqual(msg.message.error, 'Context window exceeded');
                            
                            // Check DB was updated with partial message
                            const currentDb = db.readDb();
                            const saved = currentDb.messages.find(m => m.id === msg.message.id);
                            assert.ok(saved);
                            assert.strictEqual(saved.content, 'Partial content before ');
                            assert.strictEqual(saved.error, 'Context window exceeded');
                            
                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Terminates early on finish_reason: content_filter and saves partial message', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-guardrail-id',
                    name: 'Guardrail Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'guardrail-model'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            model: 'custom-guardrail-id',
                            messages: [{ role: 'user', content: 'test safety' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'error') {
                        try {
                            assert.strictEqual(msg.error, 'Response flagged by safety guardrails/content filter.');
                            assert.ok(msg.message);
                            assert.strictEqual(msg.message.content, 'Partial safety ');
                            assert.strictEqual(msg.message.error, 'Response flagged by safety guardrails/content filter.');
                            
                            // Check DB was updated with partial message
                            const currentDb = db.readDb();
                            const saved = currentDb.messages.find(m => m.id === msg.message.id);
                            assert.ok(saved);
                            assert.strictEqual(saved.content, 'Partial safety ');
                            
                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Handles concurrent generate requests by aborting the first and completing the second', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-slow',
                    name: 'Slow Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'slow-model'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                const receivedEvents = [];

                ws.on('open', () => {
                    // Send first generation request for conversation 1
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            conversationId: 1,
                            model: 'custom-slow',
                            messages: [{ role: 'user', content: 'Prompt 1' }]
                        }
                    }));

                    // Immediately send second generation request for conversation 1
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            type: 'generate',
                            payload: {
                                conversationId: 1,
                                model: 'custom-slow',
                                messages: [{ role: 'user', content: 'Prompt 2' }]
                            }
                        }));
                    }, 10); // Send request 2 almost immediately
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    receivedEvents.push(msg);

                    if (msg.type === 'done' && msg.message && msg.message.content.includes('Slow response end')) {
                        try {
                            const initEvents = receivedEvents.filter(e => e.type === 'init');
                            const doneEvents = receivedEvents.filter(e => e.type === 'done');
                            
                            // We should have seen 2 init events
                            assert.strictEqual(initEvents.length, 2);
                            // We should only see 1 done event (for stream 2)
                            assert.strictEqual(doneEvents.length, 1);
                            assert.strictEqual(doneEvents[0].streamMsgId, initEvents[1].streamMsgId);

                            // Verify DB only has the second message
                            const currentDb = db.readDb();
                            const assistantMsgs = currentDb.messages.filter(m => m.role === 'assistant');
                            assert.strictEqual(assistantMsgs.length, 1);
                            assert.strictEqual(assistantMsgs[0].content, 'Slow response startSlow response end');

                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Applies sliding context window (limits history to last 16 active messages)', async () => {
        db.writeDb({
            conversations: [
                { id: 50, title: 'Window Chat', presetId: 'detective_noir' }
            ],
            settings: {
                customModels: [{
                    id: 'custom-window',
                    name: 'Window Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'window-model'
                }]
            }
        });

        // Construct 20 historical messages
        const history = [];
        for (let i = 1; i <= 20; i++) {
            history.push({
                role: i % 2 === 1 ? 'user' : 'assistant',
                content: `Message ${i}`
            });
        }

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            conversationId: 50, // not in DB, so won't invoke compilePrompt but will window messages
                            model: 'custom-window',
                            messages: history
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'done') {
                        try {
                            assert.strictEqual(mockRequests.length, 1);
                            const sentMessages = mockRequests[0].body.messages;
                            // 1 system message + 20 messages sliced(-16) -> 17 messages
                            assert.strictEqual(sentMessages.length, 17);
                            assert.strictEqual(sentMessages[0].role, 'system');
                            assert.strictEqual(sentMessages[1].content, 'Message 5');
                            assert.ok(sentMessages[15].content.includes('Message 19'));
                            assert.ok(sentMessages[16].content.includes('Message 20'));
                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Integrates compilePrompt into WebSocket streaming (system prompt & system_note in last user message)', async () => {
        db.writeDb({
            conversations: [
                {
                    id: 99,
                    title: 'Engine Chat',
                    presetId: 'detective_noir',
                    directorNote: 'Keep it highly dramatic'
                }
            ],
            settings: {
                customModels: [{
                    id: 'custom-engine-model',
                    name: 'Engine Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'engine-model'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            conversationId: 99,
                            model: 'custom-engine-model',
                            messages: [
                                { role: 'user', content: 'Turn 1 prompt' },
                                { role: 'assistant', content: 'Turn 1 response' },
                                { role: 'user', content: 'Turn 2 prompt' }
                            ]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'done') {
                        try {
                            assert.strictEqual(mockRequests.length, 1);
                            const sentMessages = mockRequests[0].body.messages;
                            
                            // First message should be compiled system prompt
                            assert.strictEqual(sentMessages[0].role, 'system');
                            assert.ok(sentMessages[0].content.includes('Core Role & Frame'));

                            // Last user message should contain <system_note>
                            const lastMsg = sentMessages[sentMessages.length - 1];
                            assert.strictEqual(lastMsg.role, 'user');
                            assert.ok(lastMsg.content.includes('Turn 2 prompt'));
                            assert.ok(lastMsg.content.includes('<system_note>'));
                            assert.ok(lastMsg.content.includes('User Custom Directives: Keep it highly dramatic'));
                            assert.ok(lastMsg.content.includes('</system_note>'));

                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Handles client abort event and cleans up active stream', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-very-slow',
                    name: 'Very Slow Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'very-slow-model'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            conversationId: 77,
                            model: 'custom-very-slow',
                            messages: [{ role: 'user', content: 'Slow stream prompt' }]
                        }
                    }));
                });

                let receivedToken = false;
                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'token') {
                        if (!receivedToken) {
                            receivedToken = true;
                            // Once streaming has begun, send abort
                            ws.send(JSON.stringify({
                                type: 'abort',
                                payload: { conversationId: 77 }
                            }));
                        }
                    } else if (msg.type === 'done' && receivedToken) {
                        try {
                            assert.strictEqual(msg.aborted, true);
                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Handles upstream HTTP 500 error and broadcasts error event', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-500-model',
                    name: '500 Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'status-500-model'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            conversationId: 88,
                            model: 'custom-500-model',
                            messages: [{ role: 'user', content: 'Prompt that causes 500' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'error') {
                        try {
                            assert.ok(msg.error.includes('Upstream server overloaded') || msg.error.includes('status 500'));
                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Scopes streaming tokens and lifecycle events strictly to the requesting client socket', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-isolated',
                    name: 'Isolated Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-key',
                    model: 'standard-model'
                }]
            }
        });

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', async () => {
                const port = server.address().port;
                const clientA = new WebSocket(`ws://127.0.0.1:${port}`);
                const clientB = new WebSocket(`ws://127.0.0.1:${port}`);

                let clientAReceived = [];
                let clientBReceived = [];

                await Promise.all([
                    new Promise(r => clientA.on('open', r)),
                    new Promise(r => clientB.on('open', r))
                ]);

                clientA.on('message', (data) => {
                    clientAReceived.push(JSON.parse(data.toString()));
                });

                clientB.on('message', (data) => {
                    clientBReceived.push(JSON.parse(data.toString()));
                });

                // Client A sends generate request
                clientA.send(JSON.stringify({
                    type: 'generate',
                    payload: {
                        conversationId: 44,
                        model: 'custom-isolated',
                        messages: [{ role: 'user', content: 'Private message from Client A' }]
                    }
                }));

                // Wait for Client A to receive the 'done' event
                const checkDone = setInterval(() => {
                    const hasDone = clientAReceived.some(e => e.type === 'done');
                    if (hasDone) {
                        clearInterval(checkDone);
                        try {
                            // Client A received init, token, done
                            assert.ok(clientAReceived.length > 0);
                            assert.ok(clientAReceived.some(e => e.type === 'init'));
                            assert.ok(clientAReceived.some(e => e.type === 'token'));
                            assert.ok(clientAReceived.some(e => e.type === 'done'));

                            // Client B must NOT have received any stream messages from Client A's conversation
                            assert.strictEqual(clientBReceived.length, 0);

                            clientA.close();
                            clientB.close();
                            server.close(resolve);
                        } catch (err) {
                            clientA.close();
                            clientB.close();
                            server.close(() => reject(err));
                        }
                    }
                }, 20);

                setTimeout(() => {
                    clearInterval(checkDone);
                    clientA.close();
                    clientB.close();
                    server.close(() => reject(new Error('Timed out waiting for stream to complete')));
                }, 4000);
            });
        });
    });
});
