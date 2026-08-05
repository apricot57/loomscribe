const { readDb, writeDb } = require('../db');

function registerConfigRoutes(app) {
    // --- API: Configurations & Key Management ---
    app.get('/api/config', (req, res) => {
        const db = readDb();
        const hasKey = !!db.settings?.apiKey;
        const activeModel = db.settings?.activeModel || 'deepseek-v4-pro';
        const thinkingMode = db.settings?.thinkingMode || 'enabled';
        const theme = db.settings?.theme || 'cyan';
        const customModels = (db.settings?.customModels || []).map(m => ({
            id: m.id,
            name: m.name,
            endpoint: m.endpoint,
            model: m.model,
            hasKey: !!m.apiKey
        }));
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({ hasKey, activeModel, thinkingMode, theme, customModels });
    });

    app.post('/api/config', (req, res) => {
        const body = req.body;
        const db = readDb();
        if (!db.settings) db.settings = {};
        if (body.apiKey !== undefined) {
            db.settings.apiKey = body.apiKey;
        }
        if (body.activeModel !== undefined) {
            db.settings.activeModel = body.activeModel;
        }
        if (body.thinkingMode !== undefined) {
            db.settings.thinkingMode = body.thinkingMode;
        }
        const ALLOWED_THEMES = ['cyan', 'teal', 'purple', 'amber'];
        if (body.theme !== undefined && typeof body.theme === 'string' && ALLOWED_THEMES.includes(body.theme)) {
            db.settings.theme = body.theme;
        }
        writeDb(db);
        
        const customModels = (db.settings.customModels || []).map(m => ({
            id: m.id,
            name: m.name,
            endpoint: m.endpoint,
            model: m.model,
            hasKey: !!m.apiKey
        }));

        res.json({ 
            success: true, 
            hasKey: !!db.settings.apiKey, 
            activeModel: db.settings.activeModel,
            thinkingMode: db.settings.thinkingMode || 'enabled',
            theme: db.settings.theme || 'cyan',
            customModels
        });
    });

    app.post('/api/config/custom-models', (req, res) => {
        const { name, endpoint, apiKey, model } = req.body;
        if (!name || !endpoint || !model) {
            return res.status(400).json({ error: 'Missing required fields: name, endpoint, model' });
        }
        const db = readDb();
        if (!db.settings) db.settings = {};
        if (!db.settings.customModels) db.settings.customModels = [];
        
        const newModel = {
            id: 'custom-' + Date.now(),
            name: name.trim(),
            endpoint: endpoint.trim(),
            apiKey: (apiKey || '').trim(),
            model: model.trim()
        };
        db.settings.customModels.push(newModel);
        writeDb(db);
        
        res.status(201).json({
            success: true,
            model: {
                id: newModel.id,
                name: newModel.name,
                endpoint: newModel.endpoint,
                model: newModel.model,
                hasKey: !!newModel.apiKey
            }
        });
    });

    app.delete('/api/config/custom-models/:id', (req, res) => {
        const id = req.params.id;
        const db = readDb();
        if (db.settings && db.settings.customModels) {
            db.settings.customModels = db.settings.customModels.filter(m => m.id !== id);
            writeDb(db);
        }
        res.json({ success: true });
    });
}

module.exports = registerConfigRoutes;
