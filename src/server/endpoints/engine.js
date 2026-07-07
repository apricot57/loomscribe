const fs = require('fs');
const path = require('path');
const { compilePrompt } = require('../../../engine/compiler');

const PRESETS_DIR = path.resolve(__dirname, '../../../engine/presets');
const SCHEMA_PATH = path.resolve(__dirname, '../../../engine/schema.json');
const DB_PATH = path.resolve(__dirname, '../../../data/db.json');

// Keys allowed in a preset file (strip everything else)
const ALLOWED_KEYS = ['id', 'title', 'category', 'description', 'system_body', 'post_history_body', 'blocks', 'defaults'];

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

function isPresetUsedByConversation(id) {
    try {
        if (!fs.existsSync(DB_PATH)) return false;
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        const conversations = db.conversations || [];
        return conversations.some(c => c.presetId === id);
    } catch {
        return false;
    }
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
            const presets = files.map(f => {
                const content = fs.readFileSync(path.join(PRESETS_DIR, f), 'utf-8');
                return JSON.parse(content);
            });

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
                    defaults: preset.defaults
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
            if (!body.title || !body.title.trim()) {
                return res.status(400).json({ error: 'Missing required field: title' });
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
            if (!body.title || !body.title.trim()) {
                return res.status(400).json({ error: 'Missing required field: title' });
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
            const { presetId, params, blockOverrides, directorNote } = req.body;
            const compiled = compilePrompt({ presetId, params, blockOverrides, directorNote });
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
}

module.exports = registerEngineRoutes;
