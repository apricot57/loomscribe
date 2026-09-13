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
    const dbPath = db.getDbFile();
    let mockHttpServer = null;
    let mockServerPort = 0;
    let mockRequests = [];

    test.before(async () => {

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
                    } else if (jsonBody && jsonBody.model === 'abrupt-close-model') {
                        // Stream one partial chunk, then destroy the connection without
                        // completing the response body (simulates a mid-stream network failure).
                        res.write('data: {"choices":[{"delta":{"content":"Partial before net failure "}}]}\n\n');
                        setTimeout(() => res.destroy(), 50);
                        return;
                    } else if (jsonBody && jsonBody.model === 'usage-cost-model') {
                        res.write('data: {"choices":[{"delta":{"content":"Response with cost"}}]}\n\n');
                        res.write('data: {"choices":[],"usage":{"prompt_tokens":15,"completion_tokens":10,"total_tokens":25,"cost":0.00042}}\n\n');
                        res.write('data: [DONE]\n\n');
                        res.end();
                    } else if (jsonBody && jsonBody.model === 'openrouter-reasoning-model') {
                        res.write('data: {"choices":[{"delta":{"role":"assistant","reasoning":"Thinking step 1... "}}]}\n\n');
                        res.write('data: {"choices":[{"delta":{"reasoning":"Thinking step 2."}}]}\n\n');
                        res.write('data: {"choices":[{"delta":{"content":"Final answer."}}]}\n\n');
                        res.write('data: [DONE]\n\n');
                        res.end();
                    } else if (jsonBody && jsonBody.model === 'inline-think-model') {
                        res.write('data: {"choices":[{"delta":{"content":"<think>Inline thoughts</think>Inline answer."}}]}\n\n');
                        res.write('data: [DONE]\n\n');
                        res.end();
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

    // Provider API keys exported in the host environment would turn the 'missing key'
    // tests below into real outbound requests (the DeepSeek one has no timeout and hangs),
    // so save, delete, and restore them around every test (pattern from tests/auth.test.js).
    const PROVIDER_ENV_KEYS = ['DEEPSEEK_API_KEY', 'GLM_API_KEY', 'ZAI_API_KEY', 'OPENAI_API_KEY'];
    let savedProviderEnv = null;

    test.beforeEach(() => {
        savedProviderEnv = {};
        for (const key of PROVIDER_ENV_KEYS) {
            savedProviderEnv[key] = process.env[key];
            delete process.env[key];
        }
        mockRequests = [];
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.afterEach(() => {
        for (const key of PROVIDER_ENV_KEYS) {
            if (savedProviderEnv[key] !== undefined) {
                process.env[key] = savedProviderEnv[key];
            } else {
                delete process.env[key];
            }
        }
        savedProviderEnv = null;
        mockRequests = [];
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.after(async () => {
        try {
            if (fs.existsSync(dbPath) && dbPath.endsWith('.test.json')) {
                fs.unlinkSync(dbPath);
            }
        } catch (_) {}
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

    test('Preserves query parameters on custom endpoints (e.g. Azure OpenAI api-version)', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-azure',
                    name: 'Azure OpenAI',
                    endpoint: `http://127.0.0.1:${mockServerPort}/openai/deployments/test-dep/chat/completions?api-version=2024-02-01`,
                    apiKey: 'azure-key',
                    model: 'gpt-4o'
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
                            model: 'custom-azure',
                            messages: [{ role: 'user', content: 'Hello azure!' }]
                        }
                    }));
                });

                ws.on('close', () => {
                    server.close(() => {
                        try {
                            assert.strictEqual(mockRequests.length, 1);
                            const mockReq = mockRequests[0];
                            assert.strictEqual(mockReq.method, 'POST');
                            assert.strictEqual(mockReq.url, '/openai/deployments/test-dep/chat/completions?api-version=2024-02-01');
                            assert.strictEqual(mockReq.headers['authorization'], 'Bearer azure-key');
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                });

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
                    }, 100); // First stream has received its first chunk but is still active
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
                            // Both streams must reach a terminal event: the superseded stream
                            // gets its own done (aborted) with the persisted partial content,
                            // the replacement stream completes normally.
                            assert.strictEqual(doneEvents.length, 2);
                            const supersededDone = doneEvents.find(e => e.streamMsgId === initEvents[0].streamMsgId);
                            assert.ok(supersededDone, 'superseded streamMsgId must receive a terminal event');
                            assert.strictEqual(supersededDone.aborted, true);
                            assert.ok(supersededDone.message);
                            assert.strictEqual(supersededDone.message.content, 'Slow response start');
                            const finalDone = doneEvents.find(e => e.streamMsgId === initEvents[1].streamMsgId);
                            assert.ok(finalDone, 'replacement stream must receive a terminal event');
                            assert.strictEqual(finalDone.aborted, false);

                            // Verify DB keeps both the superseded partial and the final message
                            const currentDb = db.readDb();
                            const assistantMsgs = currentDb.messages.filter(m => m.role === 'assistant');
                            assert.strictEqual(assistantMsgs.length, 2);
                            assert.ok(assistantMsgs.some(m => m.content === 'Slow response start'));
                            assert.ok(assistantMsgs.some(m => m.content === 'Slow response startSlow response end'));

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
                slidingWindowEnabled: true,
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
    test('Applies custom sliding context window size (limits history to custom N messages)', async () => {
        db.writeDb({
            conversations: [
                { id: 51, title: 'Custom Window Chat', presetId: 'detective_noir' }
            ],
            settings: {
                slidingWindowEnabled: true,
                slidingWindowSize: 6,
                customModels: [{
                    id: 'custom-window-6',
                    name: 'Window Model 6',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'window-model'
                }]
            }
        });

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
                            conversationId: 51,
                            model: 'custom-window-6',
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
                            // 1 system message + 6 sliced messages -> 7 messages
                            assert.strictEqual(sentMessages.length, 7);
                            assert.strictEqual(sentMessages[0].role, 'system');
                            assert.strictEqual(sentMessages[1].content, 'Message 15');
                            assert.ok(sentMessages[6].content.includes('Message 20'));
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

    test('Sends complete history without slicing when sliding context window is off', async () => {
        db.writeDb({
            conversations: [
                { id: 52, title: 'Unlimited Window Chat', presetId: 'detective_noir' }
            ],
            settings: {
                slidingWindowEnabled: false,
                customModels: [{
                    id: 'custom-window-off',
                    name: 'Window Off Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'window-model'
                }]
            }
        });

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
                            conversationId: 52,
                            model: 'custom-window-off',
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
                            // 1 system message + all 20 historical messages -> 21 messages
                            assert.strictEqual(sentMessages.length, 21);
                            assert.strictEqual(sentMessages[0].role, 'system');
                            assert.strictEqual(sentMessages[1].content, 'Message 1');
                            assert.ok(sentMessages[20].content.includes('Message 20'));
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

    test('Sends error when GLM model is selected but GLM API key is missing', async () => {
        db.writeDb({
            settings: {
                glmModels: ['glm-4.7-flash']
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
                            model: 'glm-4.7-flash',
                            messages: [{ role: 'user', content: 'Hello GLM!' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'error') {
                        ws.close();
                        server.close(() => {
                            try {
                                assert.match(msg.error, /GLM API Key is missing on the server/);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        });
                    }
                });

                setTimeout(() => {
                    ws.close();
                    server.close(() => reject(new Error('Timed out waiting for error message')));
                }, 2000);
            });
        });
    });

    test('Forwards thinking: disabled parameter for GLM / Z.AI endpoints', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-glm',
                    name: 'GLM 4.7 Flash Endpoint',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-glm-key',
                    model: 'glm-4.7-flash'
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
                            model: 'custom-glm',
                            messages: [{ role: 'user', content: 'Hello GLM thinking test' }],
                            thinking: { type: 'disabled' }
                        }
                    }));
                });

                ws.on('close', () => {
                    server.close(() => {
                        try {
                            const glmReq = mockRequests.find(r => r.body && r.body.model === 'glm-4.7-flash');
                            assert.ok(glmReq, 'Expected request to be made for glm-4.7-flash');
                            assert.deepStrictEqual(glmReq.body.thinking, { type: 'disabled' });
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    });
                });

                setTimeout(() => {
                    ws.close();
                }, 300);
            });
        });
    });

    test('Omits temperature from the upstream request body for OpenAI o-series models', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-oseries',
                    name: 'OpenAI o-series',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-oseries-key',
                    model: 'o4-mini'
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
                            model: 'custom-oseries',
                            messages: [{ role: 'user', content: 'Hello o-series' }],
                            temperature: 0.5
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'done') {
                        try {
                            assert.strictEqual(mockRequests.length, 1);
                            const sentBody = mockRequests[0].body;
                            assert.strictEqual(sentBody.model, 'o4-mini');
                            // o-series rejects non-default temperature with a 400 — the
                            // field must be omitted entirely, even when the client sends one.
                            assert.strictEqual(sentBody.temperature, undefined);
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

    test('Persists partial content with error flag when the upstream connection dies mid-stream', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-abrupt',
                    name: 'Abrupt Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'abrupt-close-model'
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
                            conversationId: 9,
                            model: 'custom-abrupt',
                            messages: [{ role: 'user', content: 'Hello abrupt' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'error') {
                        try {
                            // The partial content the client already displayed must be
                            // persisted with the error flag, not discarded.
                            const currentDb = db.readDb();
                            const saved = currentDb.messages.find(m => m.role === 'assistant' && m.conversationId === 9);
                            assert.ok(saved, 'partial content must be persisted on mid-stream failure');
                            assert.strictEqual(saved.content, 'Partial before net failure ');
                            assert.ok(saved.error, 'persisted message must carry the error flag');
                            assert.ok(msg.error);
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

    test('Sends a terminal error event when persisting the final message fails', { timeout: 10000 }, async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-ok',
                    name: 'OK Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'normal-model'
                }]
            }
        });

        // Force persistence failure: point DB_FILE into a directory that does not exist,
        // so mutateDb's rename always fails and rejects.
        const os = require('os');
        const originalDbFile = process.env.DB_FILE;
        process.env.DB_FILE = path.join(os.tmpdir(), `loomscribe-nonexistent-${Date.now()}`, 'db.json');

        const app = express();
        const server = http.createServer(app);
        initWebSocketServer(server);

        try {
            await new Promise((resolve, reject) => {
                server.listen(0, '127.0.0.1', () => {
                    const port = server.address().port;
                    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                    ws.on('open', () => {
                        ws.send(JSON.stringify({
                            type: 'generate',
                            payload: {
                                conversationId: 10,
                                model: 'custom-ok',
                                messages: [{ role: 'user', content: 'Hello persist fail' }]
                            }
                        }));
                    });

                    ws.on('message', (data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === 'error') {
                            try {
                                assert.match(msg.error, /Failed to persist assistant message/);
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
        } finally {
            if (originalDbFile !== undefined) {
                process.env.DB_FILE = originalDbFile;
            } else {
                delete process.env.DB_FILE;
            }
        }
    });

    test('Persists usage and cost on assistant message and delivers them in done event', async () => {
        db.writeDb({
            conversations: [
                { id: 42, title: 'Cost Chat', presetId: 'detective_noir' }
            ],
            settings: {
                customModels: [{
                    id: 'custom-cost-model',
                    name: 'Cost Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'usage-cost-model'
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
                            conversationId: 42,
                            model: 'custom-cost-model',
                            messages: [{ role: 'user', content: 'Calculate cost please' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'done') {
                        try {
                            assert.strictEqual(msg.aborted, false);
                            assert.ok(msg.message);
                            assert.strictEqual(msg.message.content, 'Response with cost');
                            assert.strictEqual(msg.message.cost, 0.00042);
                            assert.deepStrictEqual(msg.message.usage, {
                                prompt_tokens: 15,
                                completion_tokens: 10,
                                total_tokens: 25,
                                cost: 0.00042
                            });

                            // Verify database has message with cost and usage
                            const currentDb = db.readDb();
                            const savedMsg = currentDb.messages.find(m => m.id === msg.message.id);
                            assert.ok(savedMsg);
                            assert.strictEqual(savedMsg.cost, 0.00042);
                            assert.deepStrictEqual(savedMsg.usage, {
                                prompt_tokens: 15,
                                completion_tokens: 10,
                                total_tokens: 25,
                                cost: 0.00042
                            });

                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    } else if (msg.type === 'error') {
                        ws.close();
                        server.close(() => reject(new Error(msg.error || 'Stream error')));
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Streams OpenRouter delta.reasoning tokens, persists reasoning, and includes it in done event', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-openrouter-reasoning',
                    name: 'OpenRouter Reasoning Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'openrouter-reasoning-model'
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
                const receivedReasoning = [];
                const receivedContent = [];

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            conversationId: 55,
                            model: 'custom-openrouter-reasoning',
                            messages: [{ role: 'user', content: 'Explain with reasoning' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'token') {
                        if (msg.reasoning) receivedReasoning.push(msg.reasoning);
                        if (msg.content) receivedContent.push(msg.content);
                    } else if (msg.type === 'done') {
                        try {
                            assert.strictEqual(msg.aborted, false);
                            assert.ok(msg.message);
                            assert.strictEqual(msg.message.content, 'Final answer.');
                            assert.strictEqual(msg.message.reasoning, 'Thinking step 1... Thinking step 2.');
                            assert.strictEqual(receivedReasoning.join(''), 'Thinking step 1... Thinking step 2.');
                            assert.strictEqual(receivedContent.join(''), 'Final answer.');

                            // Verify database has message with reasoning
                            const currentDb = db.readDb();
                            const savedMsg = currentDb.messages.find(m => m.id === msg.message.id);
                            assert.ok(savedMsg);
                            assert.strictEqual(savedMsg.reasoning, 'Thinking step 1... Thinking step 2.');
                            assert.strictEqual(savedMsg.content, 'Final answer.');

                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    } else if (msg.type === 'error') {
                        ws.close();
                        server.close(() => reject(new Error(msg.error || 'Stream error')));
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });

    test('Extracts and streams inline think tags into reasoning tokens and separates content', async () => {
        db.writeDb({
            settings: {
                customModels: [{
                    id: 'custom-inline-think',
                    name: 'Inline Think Model',
                    endpoint: `http://127.0.0.1:${mockServerPort}/v1`,
                    apiKey: 'test-custom-key',
                    model: 'inline-think-model'
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
                const receivedReasoning = [];
                const receivedContent = [];

                ws.on('open', () => {
                    ws.send(JSON.stringify({
                        type: 'generate',
                        payload: {
                            conversationId: 56,
                            model: 'custom-inline-think',
                            messages: [{ role: 'user', content: 'Inline think please' }]
                        }
                    }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'token') {
                        if (msg.reasoning) receivedReasoning.push(msg.reasoning);
                        if (msg.content) receivedContent.push(msg.content);
                    } else if (msg.type === 'done') {
                        try {
                            assert.strictEqual(msg.aborted, false);
                            assert.ok(msg.message);
                            assert.strictEqual(msg.message.content, 'Inline answer.');
                            assert.strictEqual(msg.message.reasoning, 'Inline thoughts');

                            // Verify database has message with reasoning
                            const currentDb = db.readDb();
                            const savedMsg = currentDb.messages.find(m => m.id === msg.message.id);
                            assert.ok(savedMsg);
                            assert.strictEqual(savedMsg.reasoning, 'Inline thoughts');
                            assert.strictEqual(savedMsg.content, 'Inline answer.');

                            ws.close();
                            server.close(resolve);
                        } catch (err) {
                            ws.close();
                            server.close(() => reject(err));
                        }
                    } else if (msg.type === 'error') {
                        ws.close();
                        server.close(() => reject(new Error(msg.error || 'Stream error')));
                    }
                });

                ws.on('error', (err) => {
                    server.close();
                    reject(err);
                });
            });
        });
    });
});

test.describe('WebSocket sendToSocket backpressure', () => {
    const { sendToSocket } = require('../src/server/websocket/stream-manager');

    test('Terminates the socket when bufferedAmount exceeds the backpressure threshold', () => {
        let sentCount = 0;
        let terminated = false;
        const stalled = {
            readyState: 1,
            bufferedAmount: 4 * 1024 * 1024 + 1,
            send: () => { sentCount++; },
            terminate: () => { terminated = true; }
        };
        sendToSocket(stalled, { type: 'token', content: 'x' });
        assert.strictEqual(sentCount, 1);
        assert.strictEqual(terminated, true);

        let healthyTerminated = false;
        const healthy = {
            readyState: 1,
            bufferedAmount: 1024,
            send: () => {},
            terminate: () => { healthyTerminated = true; }
        };
        sendToSocket(healthy, { type: 'token', content: 'x' });
        assert.strictEqual(healthyTerminated, false);
    });
});
