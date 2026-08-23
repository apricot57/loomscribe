const { readDb, writeDb } = require('../db');

function registerConfigRoutes(app) {
    // --- API: Configurations & Key Management ---
    app.get('/api/config', (req, res) => {
        const db = readDb();
        const hasKey = !!(db.settings?.apiKey || db.settings?.deepseekApiKey);
        const hasDeepSeekKey = hasKey;
        const hasOpenAIKey = !!db.settings?.openaiApiKey;
        const openaiModels = db.settings?.openaiModels || [];
        const pinnedOpenAIModels = db.settings?.pinnedOpenAIModels || [];
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
        res.json({ 
            hasKey, 
            hasDeepSeekKey, 
            hasOpenAIKey, 
            openaiModels, 
            pinnedOpenAIModels, 
            activeModel, 
            thinkingMode, 
            theme, 
            customModels 
        });
    });

    app.post('/api/config', (req, res) => {
        const body = req.body;
        const db = readDb();
        if (!db.settings) db.settings = {};
        if (body.apiKey !== undefined) {
            db.settings.apiKey = body.apiKey;
        }
        if (body.deepseekApiKey !== undefined) {
            db.settings.apiKey = body.deepseekApiKey;
        }
        if (body.openaiApiKey !== undefined) {
            db.settings.openaiApiKey = body.openaiApiKey;
        }
        if (body.openaiModels !== undefined && Array.isArray(body.openaiModels)) {
            db.settings.openaiModels = body.openaiModels;
        }
        if (body.pinnedOpenAIModels !== undefined && Array.isArray(body.pinnedOpenAIModels)) {
            db.settings.pinnedOpenAIModels = body.pinnedOpenAIModels;
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

        const hasKey = !!(db.settings.apiKey || db.settings.deepseekApiKey);
        const hasDeepSeekKey = hasKey;
        const hasOpenAIKey = !!db.settings.openaiApiKey;

        res.json({ 
            success: true, 
            hasKey,
            hasDeepSeekKey,
            hasOpenAIKey,
            openaiModels: db.settings.openaiModels || [],
            pinnedOpenAIModels: db.settings.pinnedOpenAIModels || [],
            activeModel: db.settings.activeModel,
            thinkingMode: db.settings.thinkingMode || 'enabled',
            theme: db.settings.theme || 'cyan',
            customModels
        });
    });

    app.post('/api/config/fetch-openai-models', async (req, res) => {
        const db = readDb();
        const apiKey = req.body?.apiKey || db.settings?.openaiApiKey;
        if (!apiKey) {
            return res.status(400).json({ error: 'No OpenAI API key provided or configured.' });
        }

        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                let errMsg = `OpenAI API returned status ${response.status}`;
                try {
                    const errJson = await response.json();
                    if (errJson.error && errJson.error.message) {
                        errMsg = errJson.error.message;
                    }
                } catch (e) {}
                return res.status(response.status).json({ error: errMsg });
            }

            const data = await response.json();
            const rawList = Array.isArray(data.data) ? data.data : [];

            const EXCLUDE_TERMS = [
                'embedding', 'whisper', 'tts', 'dall-e', 'audio', 'moderation',
                'babbage', 'davinci', 'realtime', 'search', 'transcription', 'similarity',
                'edit', 'insert'
            ];

            const filtered = rawList
                .map(m => m.id)
                .filter(id => {
                    const lower = id.toLowerCase();
                    if (EXCLUDE_TERMS.some(term => lower.includes(term))) return false;
                    return lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4') || lower.startsWith('o5') || lower.startsWith('chatgpt');
                })
                .sort((a, b) => {
                    // Place newer models and flagships at top
                    return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
                });

            if (!db.settings) db.settings = {};
            db.settings.openaiModels = filtered;
            writeDb(db);

            res.json({ success: true, models: filtered });
        } catch (err) {
            res.status(500).json({ error: `Failed to fetch OpenAI models: ${err.message}` });
        }
    });

    app.post('/api/config/custom-models', (req, res) => {
        const { name, endpoint, apiKey, model, cloneFromId } = req.body;
        if (!name || !endpoint || !model) {
            return res.status(400).json({ error: 'Missing required fields: name, endpoint, model' });
        }
        const db = readDb();
        if (!db.settings) db.settings = {};
        if (!db.settings.customModels) db.settings.customModels = [];
        
        let finalApiKey = (apiKey || '').trim();
        if (!finalApiKey && cloneFromId) {
            const sourceModel = db.settings.customModels.find(m => m.id === cloneFromId);
            if (sourceModel && sourceModel.apiKey) {
                finalApiKey = sourceModel.apiKey;
            }
        }

        const newModel = {
            id: 'custom-' + Date.now(),
            name: name.trim(),
            endpoint: endpoint.trim(),
            apiKey: finalApiKey,
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
    app.put('/api/config/custom-models/:id', (req, res) => {
        const id = req.params.id;
        const { name, endpoint, apiKey, model } = req.body;
        const db = readDb();
        if (!db.settings || !db.settings.customModels) {
            return res.status(404).json({ error: 'Custom model not found' });
        }
        const idx = db.settings.customModels.findIndex(m => m.id === id);
        if (idx === -1) {
            return res.status(404).json({ error: 'Custom model not found' });
        }
        const existing = db.settings.customModels[idx];
        const updated = {
            id,
            name: name !== undefined ? name.trim() : existing.name,
            endpoint: endpoint !== undefined ? endpoint.trim() : existing.endpoint,
            apiKey: apiKey !== undefined ? apiKey.trim() : existing.apiKey,
            model: model !== undefined ? model.trim() : existing.model
        };
        db.settings.customModels[idx] = updated;
        writeDb(db);
        res.json({
            success: true,
            model: {
                id: updated.id,
                name: updated.name,
                endpoint: updated.endpoint,
                model: updated.model,
                hasKey: !!updated.apiKey
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
