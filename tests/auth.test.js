const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const { WebSocket } = require('ws');

const { auth, requireAuth } = require('../src/server/endpoints/auth');
const { initWebSocketServer } = require('../src/server/websocket');

function request(app, method, pathUrl, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
            const port = server.address().port;
            const payload = body ? JSON.stringify(body) : null;
            const reqHeaders = { ...headers };
            if (payload) {
                reqHeaders['Content-Type'] = 'application/json';
                reqHeaders['Content-Length'] = Buffer.byteLength(payload);
            }

            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: pathUrl,
                method,
                headers: reqHeaders
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

test.describe('Authentication and Security (/api/auth & WebSocket upgrade)', () => {
    const originalAppPassword = process.env.APP_PASSWORD;

    test.afterEach(() => {
        if (originalAppPassword !== undefined) {
            process.env.APP_PASSWORD = originalAppPassword;
        } else {
            delete process.env.APP_PASSWORD;
        }
    });

    test('Disabled Auth Mode (APP_PASSWORD unset)', async () => {
        delete process.env.APP_PASSWORD;

        const app = express();
        app.use(express.json());
        auth(app);
        app.use('/api/protected', requireAuth, (req, res) => res.json({ secret: 'data' }));

        // Login returns dummy token
        const resLogin = await request(app, 'POST', '/api/auth/login');
        assert.strictEqual(resLogin.status, 200);
        assert.strictEqual(resLogin.body.token, 'no-auth');

        // Check returns authEnabled: false
        const resCheck = await request(app, 'GET', '/api/auth/check');
        assert.strictEqual(resCheck.status, 200);
        assert.strictEqual(resCheck.body.valid, true);
        assert.strictEqual(resCheck.body.authEnabled, false);

        // Protected endpoint is accessible without credentials
        const resProtected = await request(app, 'GET', '/api/protected');
        assert.strictEqual(resProtected.status, 200);
        assert.strictEqual(resProtected.body.secret, 'data');
    });

    test('Enabled Auth Mode (APP_PASSWORD set) - Login, requireAuth, Check, and Logout', async () => {
        process.env.APP_PASSWORD = 'my-secret-passphrase';

        const app = express();
        app.use(express.json());
        auth(app);
        app.use('/api/protected', requireAuth, (req, res) => res.json({ secret: 'data' }));

        // 1. Login with incorrect password -> 401
        const resBadLogin = await request(app, 'POST', '/api/auth/login', { password: 'wrong-password' });
        assert.strictEqual(resBadLogin.status, 401);
        assert.strictEqual(resBadLogin.body.error, 'Invalid password');

        // 2. Login with correct password -> 200 with token
        const resGoodLogin = await request(app, 'POST', '/api/auth/login', { password: 'my-secret-passphrase' });
        assert.strictEqual(resGoodLogin.status, 200);
        assert.ok(resGoodLogin.body.token);
        const token = resGoodLogin.body.token;
        assert.strictEqual(token.length, 64); // 32 bytes in hex

        // 3. requireAuth blocks unauthenticated requests -> 401
        const resNoAuth = await request(app, 'GET', '/api/protected');
        assert.strictEqual(resNoAuth.status, 401);

        // 4. requireAuth blocks invalid tokens -> 401
        const resInvalidToken = await request(app, 'GET', '/api/protected', null, {
            'Authorization': 'Bearer bad-token-xyz'
        });
        assert.strictEqual(resInvalidToken.status, 401);

        // 5. requireAuth allows valid token -> 200
        const resValidToken = await request(app, 'GET', '/api/protected', null, {
            'Authorization': `Bearer ${token}`
        });
        assert.strictEqual(resValidToken.status, 200);
        assert.strictEqual(resValidToken.body.secret, 'data');

        // 6. Check token status
        const resCheckValid = await request(app, 'GET', '/api/auth/check', null, {
            'Authorization': `Bearer ${token}`
        });
        assert.strictEqual(resCheckValid.status, 200);
        assert.strictEqual(resCheckValid.body.valid, true);
        assert.strictEqual(resCheckValid.body.authEnabled, true);

        // 7. Logout invalidates token
        const resLogout = await request(app, 'POST', '/api/auth/logout', null, {
            'Authorization': `Bearer ${token}`
        });
        assert.strictEqual(resLogout.status, 200);
        assert.strictEqual(resLogout.body.ok, true);

        // 8. Subsequent requests with the logged-out token fail with 401
        const resAfterLogout = await request(app, 'GET', '/api/protected', null, {
            'Authorization': `Bearer ${token}`
        });
        assert.strictEqual(resAfterLogout.status, 401);
    });

    test('WebSocket upgrade auth enforces token validation when APP_PASSWORD is set', async () => {
        process.env.APP_PASSWORD = 'ws-test-password';

        const app = express();
        app.use(express.json());
        auth(app);

        // Login to get a valid token
        const resLogin = await request(app, 'POST', '/api/auth/login', { password: 'ws-test-password' });
        const validToken = resLogin.body.token;

        const server = http.createServer(app);
        initWebSocketServer(server);

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', async () => {
                const port = server.address().port;

                // 1. Connecting without token should fail with 401
                await new Promise((wsResolve) => {
                    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
                    ws.on('error', (err) => {
                        assert.ok(err.message.includes('401') || err.message.includes('Unexpected server response'));
                        wsResolve();
                    });
                    ws.on('open', () => {
                        ws.close();
                        assert.fail('Should not connect without token');
                    });
                });

                // 2. Connecting with invalid token should fail
                await new Promise((wsResolve) => {
                    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=invalid-token`);
                    ws.on('error', (err) => {
                        assert.ok(err.message.includes('401') || err.message.includes('Unexpected server response'));
                        wsResolve();
                    });
                    ws.on('open', () => {
                        ws.close();
                        assert.fail('Should not connect with invalid token');
                    });
                });

                // 3. Connecting with valid token should succeed
                await new Promise((wsResolve) => {
                    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${validToken}`);
                    ws.on('open', () => {
                        ws.close();
                        wsResolve();
                    });
                    ws.on('error', (err) => {
                        assert.fail(`Should connect with valid token: ${err.message}`);
                    });
                });

                server.close(resolve);
            });
        });
    });
});
