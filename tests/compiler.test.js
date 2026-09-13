const test = require('node:test');
const assert = require('node:assert');
const { compilePrompt, interpolatePlaceholders } = require('../engine/compiler');
const fs = require('fs');
const path = require('path');

test.describe('Prompt Engine Compiler (compilePrompt)', () => {

    test('Returns empty prompts when presetId is null or empty', () => {
        const resNull = compilePrompt({ presetId: null });
        assert.deepStrictEqual(resNull, { systemPrompt: '', postHistory: '' });

        const resEmpty = compilePrompt({ presetId: '' });
        assert.deepStrictEqual(resEmpty, { systemPrompt: '', postHistory: '' });

        const resUndefined = compilePrompt({});
        assert.deepStrictEqual(resUndefined, { systemPrompt: '', postHistory: '' });
    });

    test('Throws error for non-existent or invalid preset IDs', () => {
        assert.throws(() => {
            compilePrompt({ presetId: 'non_existent_preset_12345' });
        }, /Preset not found/);

        assert.throws(() => {
            compilePrompt({ presetId: '../../traversal' });
        }, /Preset not found/);

        assert.throws(() => {
            compilePrompt({ presetId: 123 });
        }, /Preset not found/);
    });

    test('Compiles standard detective_noir preset with defaults', () => {
        const { systemPrompt, postHistory } = compilePrompt({ presetId: 'detective_noir' });

        assert.ok(systemPrompt.length > 0);
        assert.ok(systemPrompt.includes('Narrative Engine & Interactivity'));
        assert.ok(systemPrompt.includes('Multi-Stance Reactivity'));
        assert.ok(systemPrompt.includes('Worldbuilding via Friction & Cost'));
        assert.ok(systemPrompt.includes('POV — Close Third'));

        assert.ok(postHistory.includes('Active POV: Close Third Person'));
        assert.ok(postHistory.includes('Write approximately 1200 words.'));
    });

    test('Validates and clamps slider parameters (word_count)', () => {
        const low = compilePrompt({
            presetId: 'detective_noir',
            params: { word_count: 100 }
        });
        assert.ok(low.postHistory.includes('Write approximately 600 words.'));

        const high = compilePrompt({
            presetId: 'detective_noir',
            params: { word_count: 5000 }
        });
        assert.ok(high.postHistory.includes('Write approximately 3000 words.'));

        const nonNum = compilePrompt({
            presetId: 'detective_noir',
            params: { word_count: 'invalid_number' }
        });
        assert.ok(nonNum.postHistory.includes('Write approximately 1200 words.'));
    });

    test('Validates select parameters against schema options with fallback', () => {
        const valid = compilePrompt({
            presetId: 'detective_noir',
            params: { pov: 'first' }
        });
        assert.ok(valid.postHistory.includes('Active POV: Deep First Person'));

        const validSecond = compilePrompt({
            presetId: 'detective_noir',
            params: { pov: 'second' }
        });
        assert.ok(validSecond.postHistory.includes('Active POV: Interactive Second Person ("You")'));

        const invalid = compilePrompt({
            presetId: 'detective_noir',
            params: { pov: 'second_person_nonexistent' }
        });
        assert.ok(invalid.postHistory.includes('Active POV: Close Third Person'));
    });

    test('Coerces toggle parameters (strings "true"/"false" and booleans)', () => {
        const toggleTrue = compilePrompt({
            presetId: 'detective_noir',
            params: { complication_generator: 'true', suggest_choices: true }
        });
        assert.ok(toggleTrue.postHistory.includes('introduce one specific complication that creates dramatic friction'));
        assert.ok(toggleTrue.postHistory.includes('MUST end this turn with exactly three numbered continuation choices'));

        const toggleFalse = compilePrompt({
            presetId: 'detective_noir',
            params: { complication_generator: 'false', suggest_choices: false }
        });
        assert.ok(!toggleFalse.postHistory.includes('introduce one specific complication that creates dramatic friction'));
        assert.ok(!toggleFalse.postHistory.includes('MUST end this turn with exactly three numbered continuation choices'));
    });

    test('Applies premises_mode prose bypass and disables narrative blocks', () => {
        const res = compilePrompt({
            presetId: 'detective_noir',
            params: {
                premises_mode: true,
                pov: 'first',
                complication_generator: true,
                suggest_choices: true
            }
        });

        assert.ok(res.systemPrompt.includes('Premises & Ideas Mode'));
        assert.ok(!res.systemPrompt.includes('Narrative Engine & Interactivity'));
        assert.ok(!res.systemPrompt.includes('POV — Deep First'));

        assert.ok(res.postHistory.includes('Generate exactly six fully developed story premises'));
        assert.ok(res.postHistory.includes('Scene Opener'));
        assert.ok(!res.postHistory.includes('Active POV:'));
    });

    test('Applies outline_mode prose bypass and disables narrative blocks', () => {
        const res = compilePrompt({
            presetId: 'detective_noir',
            params: {
                outline_mode: true,
                word_count: 2000,
                pov: 'author'
            }
        });

        assert.ok(res.systemPrompt.includes('Outline & Brainstorming Mode'));
        assert.ok(!res.systemPrompt.includes('POV — Omniscient'));
        assert.ok(res.postHistory.includes('Focus on plotting, outlining, and brainstorming narrative directions'));
        assert.ok(res.postHistory.includes('Write approximately 2000 words.'));
        assert.ok(!res.postHistory.includes('Active POV:'));
    });

    test('Maps all POV options accurately in standard mode', () => {
        const povs = [
            { id: 'third', expectedBlock: 'POV — Close Third', expectedLabel: 'Close Third Person' },
            { id: 'first', expectedBlock: 'POV — Deep First', expectedLabel: 'Deep First Person' },
            { id: 'second', expectedBlock: 'POV — Second Person', expectedLabel: 'Interactive Second Person ("You")' },
            { id: 'author', expectedBlock: 'POV — Omniscient', expectedLabel: 'Omniscient' },
            { id: 'off', expectedBlock: null, expectedLabel: null }
        ];

        for (const { id, expectedBlock, expectedLabel } of povs) {
            const res = compilePrompt({
                presetId: 'detective_noir',
                params: { pov: id }
            });
            if (expectedBlock) {
                assert.ok(res.systemPrompt.includes(expectedBlock), `Expected system prompt to contain ${expectedBlock}`);
            }
            if (expectedLabel) {
                assert.ok(res.postHistory.includes(`Active POV: ${expectedLabel}`), `Expected postHistory to contain ${expectedLabel}`);
            }
        }
    });

    test('Manual blockOverrides take precedence over preset and mapped settings', () => {
        const res = compilePrompt({
            presetId: 'detective_noir',
            params: {
                pov: 'third'
            },
            blockOverrides: {
                pov_third: false,
                pov_second: true
            }
        });

        assert.ok(!res.systemPrompt.includes('POV — Close Third'));
        assert.ok(res.systemPrompt.includes('POV — Second Person'));
    });

    test('Appends directorNote to postHistory', () => {
        const res = compilePrompt({
            presetId: 'detective_noir',
            directorNote: 'Keep dialogue snappy, include a rainstorm outside.'
        });

        assert.ok(res.postHistory.includes('User Custom Directives: Keep dialogue snappy, include a rainstorm outside.'));
    });

    test('interpolatePlaceholders replaces valid parameters and preserves unknown placeholders', () => {
        const text = 'Target is {{word_count}} words with {{pov}} POV and {{unknown_param}}.';
        const res = interpolatePlaceholders(text, { word_count: 1200, pov: 'first' }, 'test_preset');
        assert.strictEqual(res, 'Target is 1200 words with first POV and {{unknown_param}}.');
    });

    test('Rejects __proto__ keys in blockOverrides without polluting Object.prototype', () => {
        const baseline = compilePrompt({ presetId: 'detective_noir' });

        // JSON.parse (not an object literal) so __proto__ arrives as an own key
        const blockOverrides = JSON.parse('{"__proto__":{"junk":true},"story_engine":false}');
        const result = compilePrompt({ presetId: 'detective_noir', blockOverrides });

        assert.strictEqual(({}).junk, undefined);
        assert.strictEqual(({}).enabled, undefined);
        assert.strictEqual(({}).order, undefined);

        // Legitimate override still applies; output otherwise identical to baseline
        assert.ok(!result.systemPrompt.includes('Narrative Engine & Interactivity'));
        assert.strictEqual(result.postHistory, baseline.postHistory);
    });

    test('Ignores __proto__ entries in preset blocks without polluting Object.prototype', () => {
        const protoPresetId = 'test_proto_pollution_preset';
        const presetPath = path.join(__dirname, '..', 'engine', 'presets', `${protoPresetId}.json`);
        // Written as raw JSON text so __proto__ is an own key of the parsed preset
        const raw = '{"id":"' + protoPresetId + '","title":"Proto Pollution Test",' +
            '"system_body":"Custom system body.","post_history_body":"","blocks":' +
            '[{"id":"__proto__","enabled":true,"order":5},{"id":"story_engine","enabled":true,"order":10}],' +
            '"defaults":{}}';
        fs.writeFileSync(presetPath, raw, 'utf-8');
        try {
            const result = compilePrompt({ presetId: protoPresetId });

            assert.strictEqual(({}).enabled, undefined);
            assert.strictEqual(({}).order, undefined);
            assert.strictEqual(({}).junk, undefined);

            // The __proto__ pseudo-block must not contribute an active block
            assert.ok(result.systemPrompt.includes('Narrative Engine & Interactivity'));
            assert.ok(result.systemPrompt.includes('Custom system body.'));
        } finally {
            if (fs.existsSync(presetPath)) {
                fs.unlinkSync(presetPath);
            }
        }
        assert.strictEqual(({}).enabled, undefined);
    });

    test('Compiles worldRules into Slot 1 (systemPrompt) and Slot 2 (postHistory)', () => {
        const rules = [
            { id: 'r1', text: 'Direct sunlight burns vampire flesh within 10 seconds.', enabled: true },
            { id: 'r2', text: 'Silver causes immediate paralyzing agony.', enabled: false },
            { id: 'r3', text: 'Blood drinking creates a telepathic tether.', enabled: true }
        ];

        const { systemPrompt, postHistory } = compilePrompt({
            presetId: 'detective_noir',
            worldRules: rules
        });

        // Slot 1 (systemPrompt) checks
        assert.ok(systemPrompt.includes('## World Rules & Setting Laws'));
        assert.ok(systemPrompt.includes('Direct sunlight burns vampire flesh within 10 seconds.'));
        assert.ok(systemPrompt.includes('Blood drinking creates a telepathic tether.'));
        // Disabled rule must NOT appear
        assert.ok(!systemPrompt.includes('Silver causes immediate paralyzing agony.'));

        // Slot 2 (postHistory) recency reinforcement checks
        assert.ok(postHistory.includes('[Active World Constraints: Enforce established setting laws'));
        assert.ok(postHistory.includes('Direct sunlight burns vampire flesh within 10 seconds.'));
        assert.ok(postHistory.includes('Blood drinking creates a telepathic tether.'));
        // Disabled rule must NOT appear
        assert.ok(!postHistory.includes('Silver causes immediate paralyzing agony.'));
    });
});
