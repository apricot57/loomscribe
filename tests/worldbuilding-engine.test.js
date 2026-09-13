const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');

const { compilePrompt } = require('../engine/compiler');
const db = require('../src/server/db');
const registerConversationsRoutes = require('../src/server/endpoints/conversations');
const registerEngineRoutes = require('../src/server/endpoints/engine');

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
                        resolve({ status: res.statusCode, body: json });
                    } catch (e) {
                        resolve({ status: res.statusCode, text: data });
                    }
                });
            });
            req.on('error', (err) => {
                server.close();
                reject(err);
            });
            if (payload) req.write(payload);
            req.end();
        });
    });
}

test.describe('Interactive Story & Worldbuilding Engine', () => {
    test.beforeEach(() => {
        db.writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

    test('All speculative genre presets are present and contain valid world_rules', () => {
        const presetsDir = path.resolve(__dirname, '../engine/presets');
        const requiredPresets = [
            'vampire_gothic',
            'steampunk_locomotive',
            'chrono_paradox',
            'post_apocalyptic_wasteland',
            'urban_fantasy_underworld',
            'dark_fantasy_frontier'
        ];

        for (const presetId of requiredPresets) {
            const filePath = path.join(presetsDir, `${presetId}.json`);
            assert.ok(fs.existsSync(filePath), `Preset file ${presetId}.json should exist`);

            const preset = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            assert.ok(preset.title && preset.title.length > 0);
            assert.ok(preset.system_body && preset.system_body.length > 200);
            assert.ok(Array.isArray(preset.world_rules) && preset.world_rules.length >= 4);

            for (const rule of preset.world_rules) {
                assert.strictEqual(typeof rule, 'string');
                assert.ok(rule.trim().length > 10);
            }
        }
    });

    test('Creating a conversation with vampire_gothic initializes worldRules', async () => {
        const app = express();
        app.use(express.json());
        registerConversationsRoutes(app);

        const res = await request(app, 'POST', '/api/conversations', {
            title: 'Blood & Shadow in Prague',
            presetId: 'vampire_gothic'
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.presetId, 'vampire_gothic');
        assert.ok(Array.isArray(res.body.worldRules));
        assert.strictEqual(res.body.worldRules.length, 5);
        assert.ok(res.body.worldRules[0].text.includes('Direct sunlight'));
        assert.strictEqual(res.body.worldRules[0].enabled, true);
    });

    test('Dual-slot compilation includes world axioms in Slot 1 and active enforcement in Slot 2', () => {
        const rules = [
            { id: 'r1', text: 'Vampires ignite in direct sunlight within seconds.', enabled: true },
            { id: 'r2', text: 'Silver disrupts blood telepathy.', enabled: false },
            { id: 'r3', text: 'Threshold invitation is required for occupied homes.', enabled: true }
        ];

        const { systemPrompt, postHistory } = compilePrompt({
            presetId: 'vampire_gothic',
            worldRules: rules
        });

        // Slot 1 (systemPrompt)
        assert.ok(systemPrompt.includes('## World Rules & Setting Laws'));
        assert.ok(systemPrompt.includes('Vampires ignite in direct sunlight within seconds.'));
        assert.ok(systemPrompt.includes('Threshold invitation is required for occupied homes.'));
        assert.ok(!systemPrompt.includes('Silver disrupts blood telepathy.'));

        // Slot 2 (postHistory)
        assert.ok(postHistory.includes('[Active World Constraints: Enforce established setting laws'));
        assert.ok(postHistory.includes('Vampires ignite in direct sunlight within seconds.'));
        assert.ok(postHistory.includes('Threshold invitation is required for occupied homes.'));
        assert.ok(!postHistory.includes('Silver disrupts blood telepathy.'));
    });

    test('Trailing numbered choices extraction parses options cleanly', () => {
        const sampleNarrative = `The vampire lord leans back against the high-backed velvet armchair, steepled fingers glistening with ruby rings.

"You have three heartbeats to decide your fate," he whispers.

1. **Draw the consecrated blade**: Step into the moonlight where he cannot pursue.
2. **Offer a blood tithe**: Pledge two vials of your vital essence for safe passage.
3. **Trigger the incendiary charge**: Shatter the stained glass and leap into the canal.`;

        const lines = sampleNarrative.trim().split('\n');
        const choiceRegex = /^\s*([1-9])[\.\)]\s+(.+)$/;
        const trailingChoices = [];

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            const match = line.match(choiceRegex);
            if (match) {
                trailingChoices.unshift({
                    number: parseInt(match[1], 10),
                    text: match[2].trim()
                });
            } else {
                break;
            }
        }

        assert.strictEqual(trailingChoices.length, 3);
        assert.strictEqual(trailingChoices[0].number, 1);
        assert.ok(trailingChoices[0].text.includes('Draw the consecrated blade'));
        assert.strictEqual(trailingChoices[1].number, 2);
        assert.ok(trailingChoices[1].text.includes('Offer a blood tithe'));
        assert.strictEqual(trailingChoices[2].number, 3);
        assert.ok(trailingChoices[2].text.includes('Trigger the incendiary charge'));
    });
    test('Second person POV and interactive world constraints compile accurately', () => {
        const result = compilePrompt({
            presetId: 'vampire_gothic',
            params: {
                pov: 'second'
            }
        });

        // Slot 1 checks
        assert.ok(result.systemPrompt.includes('POV — Second Person'));
        assert.ok(result.systemPrompt.includes('Write strictly from a second-person ("you") perspective'));
        assert.ok(result.systemPrompt.includes('Narrative Engine & Interactivity'));

        // Slot 2 checks
        assert.ok(result.postHistory.includes('[Active POV: Interactive Second Person ("You")]'));
    });
});
