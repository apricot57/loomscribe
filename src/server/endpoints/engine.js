const fs = require('fs');
const path = require('path');
const { compilePrompt } = require('../../../engine/compiler');

const PRESETS_DIR = path.resolve(__dirname, '../../../engine/presets');
const SCHEMA_PATH = path.resolve(__dirname, '../../../engine/schema.json');

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
