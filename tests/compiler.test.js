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
        assert.ok(systemPrompt.includes('Core Role & Frame'));
        assert.ok(systemPrompt.includes('Tone & Register'));
        assert.ok(systemPrompt.includes('Format Rules'));

        assert.ok(postHistory.includes('Active POV: Close Third Person'));
        assert.ok(postHistory.includes('Active Intensity: Sensory & Tactile'));
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
            params: { pov: 'first', scene_intensity: 'raw', dialogue_style: 'commanding' }
        });
        assert.ok(valid.postHistory.includes('Active POV: Deep First Person'));
        assert.ok(valid.postHistory.includes('Active Intensity: Raw & Direct'));
        assert.ok(valid.postHistory.includes('Active Dialogue: Dominant & Commanding'));

        const invalid = compilePrompt({
            presetId: 'detective_noir',
            params: { pov: 'second_person_nonexistent', scene_intensity: 'ultra_crazy' }
        });
        assert.ok(invalid.postHistory.includes('Active POV: Close Third Person'));
        assert.ok(invalid.postHistory.includes('Active Intensity: Sensory & Tactile'));
    });

    test('Coerces toggle parameters (strings "true"/"false" and booleans)', () => {
        const toggleTrue = compilePrompt({
            presetId: 'detective_noir',
            params: { complication_generator: 'true', suggest_choices: true }
        });
        assert.ok(toggleTrue.postHistory.includes('introduce one specific complication that creates friction'));
        assert.ok(toggleTrue.postHistory.includes('MUST end this turn with exactly three numbered choices'));

        const toggleFalse = compilePrompt({
            presetId: 'detective_noir',
            params: { complication_generator: 'false', suggest_choices: false }
        });
        assert.ok(!toggleFalse.postHistory.includes('introduce one specific complication that creates friction'));
        assert.ok(!toggleFalse.postHistory.includes('MUST end this turn with exactly three numbered choices'));
    });

    test('Applies premises_mode prose bypass and disables narrative blocks', () => {
        const res = compilePrompt({
            presetId: 'detective_noir',
            params: {
                premises_mode: true,
                pov: 'first',
                scene_intensity: 'raw',
                complication_generator: true,
                suggest_choices: true
            }
        });

        assert.ok(res.systemPrompt.includes('Premises & Ideas Mode'));
        assert.ok(!res.systemPrompt.includes('Format Rules'));
        assert.ok(!res.systemPrompt.includes('POV — Deep First'));

        assert.ok(res.postHistory.includes('Generate exactly six fully developed story premises'));
        assert.ok(res.postHistory.includes('Scene Opener'));
        assert.ok(!res.postHistory.includes('Active POV:'));
        assert.ok(!res.postHistory.includes('Active Intensity:'));
    });

    test('Applies outline_mode prose bypass and disables narrative blocks', () => {
        const res = compilePrompt({
            presetId: 'detective_noir',
            params: {
                outline_mode: true,
                word_count: 2000,
                pov: 'author',
                scene_intensity: 'raw'
            }
        });

        assert.ok(res.systemPrompt.includes('Outline & Brainstorming Mode'));
        assert.ok(!res.systemPrompt.includes('Format Rules'));
        assert.ok(res.postHistory.includes('Focus on plotting, outlining, and brainstorming narrative directions'));
        assert.ok(res.postHistory.includes('Write approximately 2000 words.'));
        assert.ok(!res.postHistory.includes('Active POV:'));
        assert.ok(!res.postHistory.includes('Active Intensity:'));
    });

    test('Maps all POV options accurately in standard mode', () => {
        const povs = [
            { id: 'third', expectedBlock: 'POV — Close Third', expectedLabel: 'Close Third Person' },
            { id: 'first', expectedBlock: 'POV — Deep First', expectedLabel: 'Deep First Person' },
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

    test('Maps scene_intensity options accurately to blocks', () => {
        const intensities = [
            { id: 'tender', expectedBlock: 'Intensity — Tender' },
            { id: 'sensory', expectedBlock: 'Intensity — Sensory' },
            { id: 'charged', expectedBlock: 'Intensity — Charged' },
            { id: 'raw', expectedBlock: 'Intensity — Raw' }
        ];

        for (const { id, expectedBlock } of intensities) {
            const res = compilePrompt({
                presetId: 'detective_noir',
                params: { scene_intensity: id }
            });
            assert.ok(res.systemPrompt.includes(expectedBlock), `Intensity ${id} should include block ${expectedBlock}`);
        }
    });

    test('Manual blockOverrides take precedence over preset and mapped settings', () => {
        const res = compilePrompt({
            presetId: 'detective_noir',
            params: {
                scene_intensity: 'sensory'
            },
            blockOverrides: {
                intensity_sensory: false,
                intensity_raw: true,
                format_rules: false
            }
        });

        assert.ok(!res.systemPrompt.includes('Intensity — Sensory'));
        assert.ok(res.systemPrompt.includes('Intensity — Raw'));
        assert.ok(!res.systemPrompt.includes('Format Rules'));
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
        const blockOverrides = JSON.parse('{"__proto__":{"junk":true},"base_writer":false}');
        const result = compilePrompt({ presetId: 'detective_noir', blockOverrides });

        assert.strictEqual(({}).junk, undefined);
        assert.strictEqual(({}).enabled, undefined);
        assert.strictEqual(({}).order, undefined);

        // Legitimate override still applies; output otherwise identical to baseline
        assert.ok(!result.systemPrompt.includes('Core Role & Frame'));
        assert.strictEqual(result.postHistory, baseline.postHistory);
    });

    test('Ignores __proto__ entries in preset blocks without polluting Object.prototype', () => {
        const protoPresetId = 'test_proto_pollution_preset';
        const presetPath = path.join(__dirname, '..', 'engine', 'presets', `${protoPresetId}.json`);
        // Written as raw JSON text so __proto__ is an own key of the parsed preset
        const raw = '{"id":"' + protoPresetId + '","title":"Proto Pollution Test",' +
            '"system_body":"Custom system body.","post_history_body":"","blocks":' +
            '[{"id":"__proto__","enabled":true,"order":5},{"id":"base_writer","enabled":true,"order":10}],' +
            '"defaults":{}}';
        fs.writeFileSync(presetPath, raw, 'utf-8');
        try {
            const result = compilePrompt({ presetId: protoPresetId });

            assert.strictEqual(({}).enabled, undefined);
            assert.strictEqual(({}).order, undefined);
            assert.strictEqual(({}).junk, undefined);

            // The __proto__ pseudo-block must not contribute an active block
            assert.ok(result.systemPrompt.includes('Core Role & Frame'));
            assert.ok(result.systemPrompt.includes('Custom system body.'));
        } finally {
            if (fs.existsSync(presetPath)) {
                fs.unlinkSync(presetPath);
            }
        }
        assert.strictEqual(({}).enabled, undefined);
    });
});
