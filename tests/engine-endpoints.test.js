const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const registerEngineRoutes = require('../src/server/endpoints/engine');
const db = require('../src/server/db');

const PRESETS_DIR = path.resolve(__dirname, '../engine/presets');
const DB_PATH = db.getDbFile();

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

test.describe('Engine Endpoints (/api/engine)', () => {
    const testPresetId = 'test_temp_preset_crud';
    const testPresetPath = path.join(PRESETS_DIR, `${testPresetId}.json`);
    test.before(() => {
        // Ensure isolated test DB exists
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test.beforeEach(() => {
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
        if (fs.existsSync(testPresetPath)) {
            fs.unlinkSync(testPresetPath);
        }
    });

    test.afterEach(() => {
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
        if (fs.existsSync(testPresetPath)) {
            fs.unlinkSync(testPresetPath);
        }
    });

    test.after(() => {
        try {
            if (fs.existsSync(DB_PATH) && DB_PATH.endsWith('.test.json')) {
                fs.unlinkSync(DB_PATH);
            }
        } catch (e) {
            // Ignore cleanup failure
        }
        if (fs.existsSync(testPresetPath)) {
            fs.unlinkSync(testPresetPath);
        }
    });

    test('GET /api/engine/presets returns grouped presets', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        const res = await request(app, 'GET', '/api/engine/presets');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(typeof res.body, 'object');
        
        // Check that at least one category exists (e.g. Mystery & Thriller)
        const categories = Object.keys(res.body);
        assert.ok(categories.length > 0);
        
        // Find general preset
        const generalCategory = categories.find(cat => res.body[cat].some(p => p.id === 'detective_noir'));
        assert.ok(generalCategory, 'Should have category containing general preset');
    });

    test('GET /api/engine/presets/:id returns preset data or appropriate error status', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        // Valid preset
        const resValid = await request(app, 'GET', '/api/engine/presets/detective_noir');
        assert.strictEqual(resValid.status, 200);
        assert.strictEqual(resValid.body.id, 'detective_noir');
        assert.ok(resValid.body.title);

        // Non-existent preset
        const resMissing = await request(app, 'GET', '/api/engine/presets/nonexistent_preset_999');
        assert.strictEqual(resMissing.status, 404);

        // Invalid preset ID characters
        const resInvalid = await request(app, 'GET', '/api/engine/presets/bad%20id!@#$');
        assert.strictEqual(resInvalid.status, 400);
    });

    test('POST /api/engine/presets validates ID and creates new preset with sanitization', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        // Missing/invalid ID
        const resBadId = await request(app, 'POST', '/api/engine/presets', {
            id: 'Invalid-ID-With-Capitals',
            title: 'Bad ID Preset'
        });
        assert.strictEqual(resBadId.status, 400);
        assert.ok(resBadId.body.error.includes('Invalid or missing preset ID'));

        // Missing title
        const resMissingTitle = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId
        });
        assert.strictEqual(resMissingTitle.status, 400);
        assert.ok(resMissingTitle.body.error.includes('Missing required field: title'));

        // Successful creation
        const resCreate = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Test Temp Preset',
            category: 'test_category',
            description: 'A temporary preset for testing',
            system_body: 'Custom system body',
            extra_unallowed_field: 'should be stripped'
        });

        assert.strictEqual(resCreate.status, 201);
        assert.strictEqual(resCreate.body.id, testPresetId);
        assert.strictEqual(resCreate.body.title, 'Test Temp Preset');
        assert.strictEqual(resCreate.body.extra_unallowed_field, undefined); // Sanitized
        assert.ok(fs.existsSync(testPresetPath));

        // Attempt duplicate creation without overwrite -> 409 Conflict
        const resDuplicate = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Duplicate'
        });
        assert.strictEqual(resDuplicate.status, 409);
        assert.ok(resDuplicate.body.error.includes('already exists'));

        // Duplicate with overwrite -> 201 Success
        const resOverwrite = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Overwritten Preset',
            overwrite: true
        });
        assert.strictEqual(resOverwrite.status, 201);
        assert.strictEqual(resOverwrite.body.title, 'Overwritten Preset');
    });

    test('PUT /api/engine/presets/:id updates existing preset and validates inputs', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        // Pre-create preset
        fs.writeFileSync(testPresetPath, JSON.stringify({
            id: testPresetId,
            title: 'Original Title',
            category: 'test'
        }));

        // 404 on non-existent preset
        const resMissing = await request(app, 'PUT', '/api/engine/presets/nonexistent_preset_999', {
            title: 'Title'
        });
        assert.strictEqual(resMissing.status, 404);

        // 400 on missing title
        const resNoTitle = await request(app, 'PUT', `/api/engine/presets/${testPresetId}`, {
            title: '   '
        });
        assert.strictEqual(resNoTitle.status, 400);

        // Successful update
        const resUpdate = await request(app, 'PUT', `/api/engine/presets/${testPresetId}`, {
            title: 'Updated Title',
            description: 'Updated Description'
        });
        assert.strictEqual(resUpdate.status, 200);
        assert.strictEqual(resUpdate.body.id, testPresetId);
        assert.strictEqual(resUpdate.body.title, 'Updated Title');
        assert.strictEqual(resUpdate.body.description, 'Updated Description');
    });

    test('DELETE /api/engine/presets/:id deletes preset with in-use guard', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        // Pre-create preset
        fs.writeFileSync(testPresetPath, JSON.stringify({
            id: testPresetId,
            title: 'Preset to Delete'
        }));

        // Attach preset to an active conversation in DB
        db.writeDb({
            conversations: [
                { id: 1, title: 'Chat using test preset', presetId: testPresetId }
            ],
            messages: []
        });

        // Attempt delete without ?force=1 -> 409 Conflict
        const resConflict = await request(app, 'DELETE', `/api/engine/presets/${testPresetId}`);
        assert.strictEqual(resConflict.status, 409);
        assert.strictEqual(resConflict.body.inUse, true);
        assert.ok(fs.existsSync(testPresetPath));

        // Delete with ?force=1 -> 200 Success
        const resForce = await request(app, 'DELETE', `/api/engine/presets/${testPresetId}?force=1`);
        assert.strictEqual(resForce.status, 200);
        assert.strictEqual(resForce.body.deleted, testPresetId);
        assert.ok(!fs.existsSync(testPresetPath));

        // Deleting non-existent preset -> 404
        const resMissing = await request(app, 'DELETE', `/api/engine/presets/${testPresetId}`);
        assert.strictEqual(resMissing.status, 404);
    });

    test('GET /api/engine/schema returns schema.json array', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        const res = await request(app, 'GET', '/api/engine/schema');
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.some(item => item.id === 'word_count'));
        assert.ok(res.body.some(item => item.id === 'pov'));
    });

    test('POST /api/engine/compile compiles prompt via HTTP and handles errors', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        // Successful compile
        const resValid = await request(app, 'POST', '/api/engine/compile', {
            presetId: 'detective_noir',
            params: { word_count: 1200, pov: 'first' },
            directorNote: 'Fast pacing'
        });
        assert.strictEqual(resValid.status, 200);
        assert.ok(resValid.body.systemPrompt.includes('Core Role & Frame'));
        assert.ok(resValid.body.postHistory.includes('Active POV: Deep First Person'));
        assert.ok(resValid.body.postHistory.includes('User Custom Directives: Fast pacing'));

        // Invalid preset ID -> 400 Bad Request
        const resInvalid = await request(app, 'POST', '/api/engine/compile', {
            presetId: 'non_existent_preset'
        });
        assert.strictEqual(resInvalid.status, 400);
        assert.ok(resInvalid.body.error.includes('Preset not found'));
    });

    test('POST/PUT /api/engine/presets reject type-invalid fields with 400', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        // system_body must be a string (a number previously crashed compilePrompt)
        const resBadBody = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Bad system_body',
            system_body: 123
        });
        assert.strictEqual(resBadBody.status, 400);
        assert.ok(resBadBody.body.error.includes('system_body'));

        // description must be a string
        const resBadDesc = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Bad description',
            description: 42
        });
        assert.strictEqual(resBadDesc.status, 400);
        assert.ok(resBadDesc.body.error.includes('description'));

        // blocks must be an array
        const resBadBlocks = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Bad blocks',
            blocks: { id: 'base_writer' }
        });
        assert.strictEqual(resBadBlocks.status, 400);
        assert.ok(resBadBlocks.body.error.includes('blocks'));

        // each block needs a string id
        const resBadBlockId = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Bad block id',
            blocks: [{ id: 123, enabled: true, order: 1 }]
        });
        assert.strictEqual(resBadBlockId.status, 400);
        assert.ok(resBadBlockId.body.error.includes('string id'));

        // block enabled must be boolean
        const resBadBlockEnabled = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Bad block enabled',
            blocks: [{ id: 'base_writer', enabled: 'yes', order: 1 }]
        });
        assert.strictEqual(resBadBlockEnabled.status, 400);
        assert.ok(resBadBlockEnabled.body.error.includes('boolean'));

        // block order must be numeric
        const resBadBlockOrder = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Bad block order',
            blocks: [{ id: 'base_writer', enabled: true, order: 'first' }]
        });
        assert.strictEqual(resBadBlockOrder.status, 400);
        assert.ok(resBadBlockOrder.body.error.includes('number'));

        // defaults must be flat with scalar values
        const resBadDefaults = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Bad defaults',
            defaults: { word_count: { nested: 1 } }
        });
        assert.strictEqual(resBadDefaults.status, 400);
        assert.ok(resBadDefaults.body.error.includes('default'));

        // Unknown extra keys are still stripped, valid fields accepted
        const resValid = await request(app, 'POST', '/api/engine/presets', {
            id: testPresetId,
            title: 'Valid preset',
            system_body: 'Custom system body',
            blocks: [{ id: 'base_writer', enabled: true, order: 10 }],
            defaults: { word_count: 800, pov: 'first', complication_generator: false },
            extra_unallowed_field: 'should be stripped'
        });
        assert.strictEqual(resValid.status, 201);
        assert.strictEqual(resValid.body.extra_unallowed_field, undefined);
        assert.deepStrictEqual(resValid.body.blocks, [{ id: 'base_writer', enabled: true, order: 10 }]);

        // PUT enforces the same type checks
        const resPutBad = await request(app, 'PUT', `/api/engine/presets/${testPresetId}`, {
            title: 'Still valid title',
            post_history_body: []
        });
        assert.strictEqual(resPutBad.status, 400);
        assert.ok(resPutBad.body.error.includes('post_history_body'));
    });

    test('GET /api/engine/presets skips malformed preset files instead of failing', async () => {
        const app = express();
        app.use(express.json());
        registerEngineRoutes(app);

        const corruptPath = path.join(PRESETS_DIR, 'test_corrupt_preset.json');
        fs.writeFileSync(corruptPath, '{ this is not valid json', 'utf-8');
        try {
            const res = await request(app, 'GET', '/api/engine/presets');
            assert.strictEqual(res.status, 200);

            // Healthy presets are still listed
            const categories = Object.keys(res.body);
            assert.ok(categories.some(cat => res.body[cat].some(p => p.id === 'detective_noir')));

            // The corrupt file is skipped entirely
            for (const cat of categories) {
                assert.ok(!res.body[cat].some(p => p.id === 'test_corrupt_preset'));
            }
        } finally {
            fs.unlinkSync(corruptPath);
        }
    });
});
