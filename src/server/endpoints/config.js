const { readDb, writeDb } = require('../db');

function registerConfigRoutes(app) {
    // --- API: GET /api/health ---
    app.get('/api/health', (req, res) => {
        res.json({ status: 'OK', uptime: process.uptime() });
    });

    // --- API: Configurations & Key Management ---
    app.get('/api/config', (req, res) => {
        const db = readDb();
        const hasKey = !!db.settings?.apiKey;
        const activeModel = db.settings?.activeModel || 'deepseek-v4-pro';
        const thinkingMode = db.settings?.thinkingMode || 'enabled';
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({ hasKey, activeModel, thinkingMode });
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
        writeDb(db);
        res.json({ 
            success: true, 
            hasKey: !!db.settings.apiKey, 
            activeModel: db.settings.activeModel,
            thinkingMode: db.settings.thinkingMode || 'enabled'
        });
    });
}

module.exports = registerConfigRoutes;
