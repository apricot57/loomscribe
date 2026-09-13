const fs = require('fs');
const path = require('path');
const { compilePrompt } = require('../../../engine/compiler');
const { resolveProvider } = require('../websocket/provider-router');
const { readDb } = require('../db');
const logger = require('../logger');

const PRESETS_DIR = path.resolve(__dirname, '../../../engine/presets');
const SCHEMA_PATH = path.resolve(__dirname, '../../../engine/schema.json');

// Keys allowed in a preset file (strip everything else)
const ALLOWED_KEYS = ['id', 'title', 'category', 'description', 'system_body', 'post_history_body', 'blocks', 'defaults', 'world_rules'];
function sanitizePreset(body) {
    const out = {};
    for (const key of ALLOWED_KEYS) {
        if (body[key] !== undefined) out[key] = body[key];
    }
    return out;
}

function validatePresetId(id) {
    return /^[a-z0-9_]+$/.test(id);
}

// Type-checks preset fields; returns an error message or null when valid.
function validatePreset(body) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
        return 'Missing required field: title';
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
        return 'Invalid field: description must be a string.';
    }
    if (body.system_body !== undefined && typeof body.system_body !== 'string') {
        return 'Invalid field: system_body must be a string.';
    }
    if (body.post_history_body !== undefined && typeof body.post_history_body !== 'string') {
        return 'Invalid field: post_history_body must be a string.';
    }
    if (body.blocks !== undefined) {
        if (!Array.isArray(body.blocks)) {
            return 'Invalid field: blocks must be an array of block objects.';
        }
        for (const block of body.blocks) {
            if (!block || typeof block !== 'object' || Array.isArray(block)) {
                return 'Invalid field: blocks must contain block objects.';
            }
            if (typeof block.id !== 'string' || !block.id) {
                return 'Invalid field: each block must have a string id.';
            }
            if (block.enabled !== undefined && typeof block.enabled !== 'boolean') {
                return `Invalid field: block "${block.id}" enabled must be a boolean.`;
            }
            if ((block.order !== undefined && typeof block.order !== 'number') || Number.isNaN(block.order)) {
                return `Invalid field: block "${block.id}" order must be a number.`;
            }
        }
    }
    if (body.defaults !== undefined) {
        if (!body.defaults || typeof body.defaults !== 'object' || Array.isArray(body.defaults)) {
            return 'Invalid field: defaults must be an object.';
        }
        for (const [key, val] of Object.entries(body.defaults)) {
            // Booleans are accepted alongside numbers/strings: existing presets
            // (and the schema toggles) use them as defaults.
            if (typeof val !== 'number' && typeof val !== 'string' && typeof val !== 'boolean') {
                return `Invalid field: default "${key}" must be a number, string or boolean.`;
            }
        }
    }
    return null;
}

function isPresetUsedByConversation(id) {
    const db = readDb();
    return (db.conversations || []).some(c => c.presetId === id);
}

function registerEngineRoutes(app) {
    // GET /api/engine/presets
    app.get('/api/engine/presets', (req, res) => {
        try {
            if (!fs.existsSync(PRESETS_DIR)) {
                res.json({});
                return;
            }
            const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json'));
            const presets = [];
            for (const f of files) {
                try {
                    const content = fs.readFileSync(path.join(PRESETS_DIR, f), 'utf-8');
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        presets.push(parsed);
                    }
                } catch (err) {
                    // One malformed file must not break the whole listing.
                    logger.warn('preset_list_parse_failed', { file: f, error: err.message });
                }
            }

            // Group by category
            const grouped = {};
            for (const preset of presets) {
                const cat = preset.category || 'general';
                if (!grouped[cat]) {
                    grouped[cat] = [];
                }
                grouped[cat].push({
                    id: preset.id,
                    title: preset.title,
                    description: preset.description,
                    category: cat,
                    defaults: preset.defaults,
                    world_rules: preset.world_rules || []
                });
            }

            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.json(grouped);
        } catch (err) {
            console.error("Error reading presets:", err);
            res.status(500).send("Internal Server Error");
        }
    });

    // GET /api/engine/presets/:id
    app.get('/api/engine/presets/:id', (req, res) => {
        const id = req.params.id;
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            res.status(400).send("Invalid preset ID");
            return;
        }

        const filePath = path.join(PRESETS_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) {
            res.status(404).send("Preset not found");
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const preset = JSON.parse(content);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.json(preset);
        } catch (err) {
            console.error(`Error reading preset ${id}:`, err);
            res.status(500).send("Internal Server Error");
        }
    });

    // POST /api/engine/presets — create or import a new preset
    app.post('/api/engine/presets', (req, res) => {
        try {
            const body = req.body;
            const id = (body.id || '').trim();

            if (!id || !validatePresetId(id)) {
                return res.status(400).json({ error: 'Invalid or missing preset ID. Use lowercase letters, numbers and underscores only.' });
            }
            const validationError = validatePreset(body);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            const filePath = path.join(PRESETS_DIR, `${id}.json`);
            if (fs.existsSync(filePath) && !body.overwrite) {
                return res.status(409).json({ error: `A preset with id "${id}" already exists.` });
            }

            const preset = sanitizePreset(body);
            preset.id = id; // ensure id field is correct

            if (!fs.existsSync(PRESETS_DIR)) {
                fs.mkdirSync(PRESETS_DIR, { recursive: true });
            }

            fs.writeFileSync(filePath, JSON.stringify(preset, null, 2), 'utf-8');
            res.status(201).json(preset);
        } catch (err) {
            console.error("Error creating preset:", err);
            res.status(500).send("Internal Server Error");
        }
    });

    // PUT /api/engine/presets/:id — update an existing preset
    app.put('/api/engine/presets/:id', (req, res) => {
        try {
            const id = req.params.id;
            if (!validatePresetId(id)) {
                return res.status(400).json({ error: 'Invalid preset ID.' });
            }

            const filePath = path.join(PRESETS_DIR, `${id}.json`);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: `Preset "${id}" not found.` });
            }

            const body = req.body;
            const validationError = validatePreset(body);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }

            const preset = sanitizePreset(body);
            preset.id = id; // never allow changing the id via PUT

            fs.writeFileSync(filePath, JSON.stringify(preset, null, 2), 'utf-8');
            res.json(preset);
        } catch (err) {
            console.error(`Error updating preset ${req.params.id}:`, err);
            res.status(500).send("Internal Server Error");
        }
    });

    // DELETE /api/engine/presets/:id — delete a preset
    app.delete('/api/engine/presets/:id', (req, res) => {
        try {
            const id = req.params.id;
            if (!validatePresetId(id)) {
                return res.status(400).json({ error: 'Invalid preset ID.' });
            }

            const filePath = path.join(PRESETS_DIR, `${id}.json`);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: `Preset "${id}" not found.` });
            }

            // Warn if this preset is referenced by active conversations
            const inUse = isPresetUsedByConversation(id);
            if (inUse && !req.query.force) {
                return res.status(409).json({
                    error: `Preset "${id}" is used by one or more conversations. Pass ?force=1 to delete anyway.`,
                    inUse: true
                });
            }

            fs.unlinkSync(filePath);
            res.json({ deleted: id });
        } catch (err) {
            console.error(`Error deleting preset ${req.params.id}:`, err);
            res.status(500).send("Internal Server Error");
        }
    });

    // GET /api/engine/schema
    app.get('/api/engine/schema', (req, res) => {
        try {
            if (!fs.existsSync(SCHEMA_PATH)) {
                res.status(404).send("Schema file not found");
                return;
            }
            const content = fs.readFileSync(SCHEMA_PATH, 'utf-8');
            const schema = JSON.parse(content);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.json(schema);
        } catch (err) {
            console.error("Error reading schema:", err);
            res.status(500).send("Internal Server Error");
        }
    });

    // POST /api/engine/compile
    app.post('/api/engine/compile', (req, res) => {
        try {
            const { presetId, params, blockOverrides, directorNote, worldRules } = req.body;
            const compiled = compilePrompt({ presetId, params, blockOverrides, directorNote, worldRules });
            res.json(compiled);
        } catch (err) {
            console.error("Compilation error:", err);
            if (err.message.startsWith("Preset not found") || err.message.startsWith("Block file missing")) {
                res.status(400).json({ error: err.message });
            } else {
                res.status(500).send("Internal Server Error");
            }
        }
    });
    // POST /api/engine/scaffold-world — LLM-driven world lore & setting rule generator
    app.post('/api/engine/scaffold-world', async (req, res) => {
        try {
            const { prompt, basePresetId, model } = req.body || {};
            if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
                return res.status(400).json({ error: 'Missing or empty "prompt" in request body.' });
            }

            const db = readDb();
            const settings = db.settings || {};
            const activeModel = model || settings.activeModel || 'deepseek-v4-pro';

            const resolved = resolveProvider({
                model: activeModel,
                settings
            });

            if (resolved.error) {
                return res.status(400).json({ error: resolved.error });
            }

            let basePresetContext = '';
            if (basePresetId && typeof basePresetId === 'string') {
                const safeBaseId = path.basename(basePresetId).replace(/\.json$/i, '');
                const basePath = path.join(PRESETS_DIR, `${safeBaseId}.json`);
                if (fs.existsSync(basePath)) {
                    try {
                        const parsedBase = JSON.parse(fs.readFileSync(basePath, 'utf8'));
                        basePresetContext = `\nBase Preset Reference:\n- Title: ${parsedBase.title}\n- System Atmosphere: ${parsedBase.system_body}\n- Base World Rules:\n${(parsedBase.world_rules || []).map(r => `  * ${r}`).join('\n')}\n`;
                    } catch (_) {}
                }
            }

            const systemInstruction = `You are an elite speculative fiction worldbuilding architect and narrative designer.
Your task is to generate a rich, grounded worldbuilding blueprint with unbreakable world axioms based on the user's concept.

Design principles:
1. Worldbuilding via Friction, Not Exposition: Rules must be material constraints, costs, bodily consequences, or social contracts that create dramatic conflict.
2. Sensory & Environmental Texture: The atmosphere must be physical, tactile, and grounded (temperatures, smells, mechanical sounds, biological reactions).
3. Inviolable World Axioms: Provide 4 to 6 specific, enforceable setting constraints that the narrative cannot break.

You MUST reply with ONLY a valid, parseable JSON object matching this exact structure:
{
  "title": "Evocative Setting Title",
  "category": "Genre Category (e.g. Gothic Horror, Steampunk, Temporal Sci-Fi, Dark Fantasy)",
  "description": "Punchy 1-sentence dramatic hook.",
  "system_body": "300 to 450 words of rich narrative atmosphere, faction tensions, sensory texture, and roleplay framing.",
  "world_rules": [
    "Rule 1: Specific, non-negotiable physical, supernatural, or technical law with explicit consequences.",
    "Rule 2: Specific law...",
    "Rule 3: Specific law...",
    "Rule 4: Specific law..."
  ],
  "defaults": {
    "pov": "third",
    "scene_intensity": "raw",
    "dialogue_style": "commanding",
    "pushback": 4,
    "suggest_choices": true
  }
}
Do not include any explanation or markdown wrapping other than strict JSON.`;

            const userPromptText = `Story Concept & World Direction:\n${prompt.trim()}${basePresetContext ? `\n${basePresetContext}` : ''}`;

            const headers = { 'Content-Type': 'application/json' };
            if (resolved.apiAuthKey) {
                headers['Authorization'] = `Bearer ${resolved.apiAuthKey}`;
            }

            const requestBody = {
                ...resolved.requestBodyObj,
                stream: false,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: userPromptText }
                ]
            };
            delete requestBody.stream_options;

            const upstreamRes = await fetch(resolved.apiEndpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            if (!upstreamRes.ok) {
                let errText = `Upstream AI provider returned status ${upstreamRes.status}`;
                try {
                    const errBody = await upstreamRes.json();
                    if (errBody.error && errBody.error.message) {
                        errText = errBody.error.message;
                    }
                } catch (_) {}
                return res.status(502).json({ error: errText });
            }

            const resJson = await upstreamRes.json();
            const rawContent = resJson.choices?.[0]?.message?.content || '';
            if (!rawContent) {
                return res.status(502).json({ error: 'Upstream AI provider returned an empty response.' });
            }

            // Clean markdown code fences if present
            let cleaned = rawContent.trim();
            if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            }

            let parsedWorld;
            try {
                parsedWorld = JSON.parse(cleaned);
            } catch (jsonErr) {
                // Attempt regex extraction of JSON object if surrounded by preamble
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) {
                    parsedWorld = JSON.parse(match[0]);
                } else {
                    return res.status(502).json({ error: 'Failed to parse AI response as JSON.', raw: rawContent });
                }
            }

            if (!parsedWorld.title || !parsedWorld.system_body || !Array.isArray(parsedWorld.world_rules)) {
                return res.status(502).json({ error: 'AI response is missing required blueprint fields.', raw: parsedWorld });
            }

            res.json({ world: parsedWorld });
        } catch (err) {
            logger.error('scaffold_world_failed', { error: err.message });
            res.status(500).json({ error: err.message || 'Internal Server Error' });
        }
    });
}

module.exports = registerEngineRoutes;
