const { readDb, mutateDb } = require('../db');

function registerConfigRoutes(app) {
    // --- API: Configurations & Key Management ---
    app.get('/api/config', (req, res) => {
        const db = readDb();
        const hasKey = !!(db.settings?.apiKey || db.settings?.deepseekApiKey || process.env.DEEPSEEK_API_KEY);
        const hasDeepSeekKey = hasKey;
        const hasOpenAIKey = !!(db.settings?.openaiApiKey || process.env.OPENAI_API_KEY);
        const hasGlmKey = !!(db.settings?.glmApiKey || process.env.GLM_API_KEY || process.env.ZAI_API_KEY);
        const hasOpenRouterKey = !!(db.settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY);
        const openaiModels = db.settings?.openaiModels || [];
        const pinnedOpenAIModels = db.settings?.pinnedOpenAIModels || [];
        const glmModels = db.settings?.glmModels || [];
        const pinnedGlmModels = db.settings?.pinnedGlmModels || [];
        const pinnedOpenRouterModels = db.settings?.pinnedOpenRouterModels || [];
        const openrouterModelDetails = db.settings?.openrouterModelDetails || {};
        const activeModel = db.settings?.activeModel || 'deepseek-v4-pro';
        const thinkingMode = db.settings?.thinkingMode || 'disabled';
        const glmThinkingMode = db.settings?.glmThinkingMode || 'low';
        const theme = db.settings?.theme || 'cyan';
        const slidingWindowEnabled = db.settings?.slidingWindowEnabled === true ||
                                     (db.settings?.slidingWindowEnabled === undefined && typeof db.settings?.slidingWindow === 'number' && db.settings.slidingWindow > 0);
        const slidingWindowSize = typeof db.settings?.slidingWindowSize === 'number' && db.settings.slidingWindowSize > 0
            ? db.settings.slidingWindowSize
            : (typeof db.settings?.slidingWindow === 'number' && db.settings.slidingWindow > 0
                ? db.settings.slidingWindow
                : 16);
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
            hasGlmKey,
            hasOpenRouterKey,
            openaiModels, 
            pinnedOpenAIModels, 
            glmModels,
            pinnedGlmModels,
            pinnedOpenRouterModels,
            openrouterModelDetails,
            activeModel, 
            thinkingMode,
            glmThinkingMode,
            theme,
            slidingWindowEnabled,
            slidingWindowSize,
            customModels 
        });
    });

    app.post('/api/config', async (req, res) => {
        const body = req.body || {};
        const updatedConfig = await mutateDb((db) => {
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
            if (body.glmApiKey !== undefined) {
                db.settings.glmApiKey = body.glmApiKey;
            }
            if (body.openrouterApiKey !== undefined) {
                db.settings.openrouterApiKey = body.openrouterApiKey;
            }
            if (body.openaiModels !== undefined && Array.isArray(body.openaiModels)) {
                db.settings.openaiModels = body.openaiModels;
            }
            if (body.pinnedOpenAIModels !== undefined && Array.isArray(body.pinnedOpenAIModels)) {
                db.settings.pinnedOpenAIModels = body.pinnedOpenAIModels;
            }
            if (body.glmModels !== undefined && Array.isArray(body.glmModels)) {
                db.settings.glmModels = body.glmModels;
            }
            if (body.pinnedGlmModels !== undefined && Array.isArray(body.pinnedGlmModels)) {
                db.settings.pinnedGlmModels = body.pinnedGlmModels;
            }
            if (body.pinnedOpenRouterModels !== undefined && Array.isArray(body.pinnedOpenRouterModels)) {
                db.settings.pinnedOpenRouterModels = body.pinnedOpenRouterModels;
            }
            if (body.openrouterModelDetails !== undefined && typeof body.openrouterModelDetails === 'object' && body.openrouterModelDetails !== null) {
                db.settings.openrouterModelDetails = body.openrouterModelDetails;
            }
            if (body.activeModel !== undefined) {
                db.settings.activeModel = body.activeModel;
            }
            if (body.thinkingMode !== undefined) {
                db.settings.thinkingMode = body.thinkingMode;
            }
            if (body.glmThinkingMode !== undefined) {
                db.settings.glmThinkingMode = body.glmThinkingMode;
            }
            const ALLOWED_THEMES = ['cyan', 'teal', 'purple', 'amber', 'slate'];
            if (body.theme !== undefined && typeof body.theme === 'string' && ALLOWED_THEMES.includes(body.theme)) {
                db.settings.theme = body.theme;
            }
            if (body.slidingWindowEnabled !== undefined) {
                db.settings.slidingWindowEnabled = body.slidingWindowEnabled === true || body.slidingWindowEnabled === 'true';
            }
            if (body.slidingWindowSize !== undefined) {
                const parsedSize = parseInt(body.slidingWindowSize, 10);
                if (!isNaN(parsedSize) && parsedSize > 0) {
                    db.settings.slidingWindowSize = parsedSize;
                }
            }
            if (body.slidingWindow !== undefined) {
                if (body.slidingWindow === 'off' || body.slidingWindow === false || body.slidingWindow === 0) {
                    db.settings.slidingWindowEnabled = false;
                } else {
                    const parsed = parseInt(body.slidingWindow, 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        db.settings.slidingWindowEnabled = true;
                        db.settings.slidingWindowSize = parsed;
                    }
                }
            }
            
            const customModels = (db.settings.customModels || []).map(m => ({
                id: m.id,
                name: m.name,
                endpoint: m.endpoint,
                model: m.model,
                hasKey: !!m.apiKey
            }));

            const hasKey = !!(db.settings.apiKey || db.settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY);
            const hasDeepSeekKey = hasKey;
            const hasOpenAIKey = !!(db.settings.openaiApiKey || process.env.OPENAI_API_KEY);
            const hasGlmKey = !!(db.settings.glmApiKey || process.env.GLM_API_KEY || process.env.ZAI_API_KEY);
            const hasOpenRouterKey = !!(db.settings.openrouterApiKey || process.env.OPENROUTER_API_KEY);

            return { 
                success: true, 
                hasKey,
                hasDeepSeekKey,
                hasOpenAIKey,
                hasGlmKey,
                hasOpenRouterKey,
                openaiModels: db.settings.openaiModels || [],
                pinnedOpenAIModels: db.settings.pinnedOpenAIModels || [],
                glmModels: db.settings.glmModels || [],
                pinnedGlmModels: db.settings.pinnedGlmModels || [],
                pinnedOpenRouterModels: db.settings.pinnedOpenRouterModels || [],
                openrouterModelDetails: db.settings.openrouterModelDetails || {},
                activeModel: db.settings.activeModel,
                thinkingMode: db.settings.thinkingMode || 'disabled',
                glmThinkingMode: db.settings.glmThinkingMode || 'low',
                theme: db.settings.theme || 'cyan',
                slidingWindowEnabled: db.settings.slidingWindowEnabled === true || (db.settings.slidingWindowEnabled === undefined && typeof db.settings.slidingWindow === 'number' && db.settings.slidingWindow > 0),
                slidingWindowSize: typeof db.settings.slidingWindowSize === 'number' && db.settings.slidingWindowSize > 0 ? db.settings.slidingWindowSize : (typeof db.settings.slidingWindow === 'number' && db.settings.slidingWindow > 0 ? db.settings.slidingWindow : 16),
                customModels
            };
        });

        res.json(updatedConfig);
    });

    app.post('/api/config/fetch-glm-models', async (req, res) => {
        const db = readDb();
        const apiKey = req.body?.apiKey || db.settings?.glmApiKey || process.env.GLM_API_KEY || process.env.ZAI_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ error: 'No GLM API key provided or configured.' });
        }

        try {
            const response = await fetch('https://api.z.ai/api/paas/v4/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                let errMsg = `GLM (Z.AI) API returned status ${response.status}`;
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
                'embedding', 'rerank', 'cogview', 'cogvideox', 'audio', 'whisper'
            ];

            const filtered = rawList
                .map(m => m.id)
                .filter(id => {
                    const lower = id.toLowerCase();
                    if (EXCLUDE_TERMS.some(term => lower.includes(term))) return false;
                    return lower.startsWith('glm');
                })
                .sort((a, b) => {
                    // Place newer models and flagships at top
                    return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
                });

            const finalModels = filtered.length > 0 ? filtered : [
                'glm-4.7-flash', 'glm-4.7', 'glm-5.3-flash', 'glm-4.5-air', 'glm-4.5'
            ];

            await mutateDb((db) => {
                if (!db.settings) db.settings = {};
                db.settings.glmModels = finalModels;
            });

            res.json({ success: true, models: finalModels });
        } catch (err) {
            res.status(500).json({ error: `Failed to fetch GLM models: ${err.message}` });
        }
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

            await mutateDb((db) => {
                if (!db.settings) db.settings = {};
                db.settings.openaiModels = filtered;
            });

            res.json({ success: true, models: filtered });
        } catch (err) {
            res.status(500).json({ error: `Failed to fetch OpenAI models: ${err.message}` });
        }
    });

    app.post('/api/config/custom-models', async (req, res) => {
        const { name, endpoint, apiKey, model, cloneFromId } = req.body || {};
        if (!name || !endpoint || !model) {
            return res.status(400).json({ error: 'Missing required fields: name, endpoint, model' });
        }
        
        const newModel = await mutateDb((db) => {
            if (!db.settings) db.settings = {};
            if (!db.settings.customModels) db.settings.customModels = [];
            
            let finalApiKey = (apiKey || '').trim();
            if (!finalApiKey && cloneFromId) {
                const sourceModel = db.settings.customModels.find(m => m.id === cloneFromId);
                if (sourceModel && sourceModel.apiKey) {
                    finalApiKey = sourceModel.apiKey;
                }
            }

            const created = {
                id: 'custom-' + Date.now(),
                name: name.trim(),
                endpoint: endpoint.trim(),
                apiKey: finalApiKey,
                model: model.trim()
            };
            db.settings.customModels.push(created);
            return created;
        });

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

    app.put('/api/config/custom-models/:id', async (req, res) => {
        const id = req.params.id;
        const { name, endpoint, apiKey, model } = req.body || {};
        let notFound = false;

        const updated = await mutateDb((db) => {
            if (!db.settings || !db.settings.customModels) {
                notFound = true;
                return null;
            }
            const idx = db.settings.customModels.findIndex(m => m.id === id);
            if (idx === -1) {
                notFound = true;
                return null;
            }
            const existing = db.settings.customModels[idx];
            const item = {
                id,
                name: name !== undefined ? name.trim() : existing.name,
                endpoint: endpoint !== undefined ? endpoint.trim() : existing.endpoint,
                apiKey: apiKey !== undefined ? apiKey.trim() : existing.apiKey,
                model: model !== undefined ? model.trim() : existing.model
            };
            db.settings.customModels[idx] = item;
            return item;
        });

        if (notFound) {
            return res.status(404).json({ error: 'Custom model not found' });
        }

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

    app.delete('/api/config/custom-models/:id', async (req, res) => {
        const id = req.params.id;
        await mutateDb((db) => {
            if (db.settings && db.settings.customModels) {
                db.settings.customModels = db.settings.customModels.filter(m => m.id !== id);
            }
        });
        res.json({ success: true });
    });

    // --- OpenRouter Models & Metadata API ---
    let openrouterCache = {
        timestamp: 0,
        models: null
    };

    async function fetchOpenRouterModelsList(force = false, apiKey = null) {
        const now = Date.now();
        if (!force && openrouterCache.models && (now - openrouterCache.timestamp < 5 * 60 * 1000)) {
            return openrouterCache.models;
        }

        const headers = {
            'HTTP-Referer': 'https://loomscribe.app',
            'X-Title': 'LoomScribe'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch('https://openrouter.ai/api/v1/models', { headers });
        if (!response.ok) {
            throw new Error(`OpenRouter API returned status ${response.status}`);
        }

        const data = await response.json();
        const rawList = Array.isArray(data.data) ? data.data : [];

        const formatted = rawList.map(m => {
            const promptPerToken = parseFloat(m.pricing?.prompt) || 0;
            const completionPerToken = parseFloat(m.pricing?.completion) || 0;
            return {
                id: m.id,
                name: m.name || m.id,
                contextLength: m.context_length || 0,
                promptCostPerMillion: Number((promptPerToken * 1000000).toFixed(6)),
                completionCostPerMillion: Number((completionPerToken * 1000000).toFixed(6)),
                description: m.description || '',
                reasoning: m.reasoning || (m.supported_parameters?.includes('reasoning') ? { mandatory: false } : undefined),
                supportedParameters: m.supported_parameters || [],
                lastUpdated: Date.now()
            };
        });

        openrouterCache = {
            timestamp: now,
            models: formatted
        };

        return formatted;
    }

    app.get('/api/openrouter/models', async (req, res) => {
        const db = readDb();
        const apiKey = db.settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY;
        const force = req.query.force === 'true';
        const targetModel = req.query.model;

        try {
            const models = await fetchOpenRouterModelsList(force, apiKey);

            if (targetModel) {
                const found = models.find(m => m.id === targetModel || m.id.toLowerCase() === targetModel.toLowerCase());
                if (!found) {
                    return res.status(404).json({ error: `Model '${targetModel}' not found on OpenRouter.` });
                }
                return res.json({ success: true, model: found });
            }

            res.json({ success: true, models, data: models });
        } catch (err) {
            res.status(500).json({ error: `Failed to fetch OpenRouter models: ${err.message}` });
        }
    });

    app.get('/api/openrouter/model-info', async (req, res) => {
        const modelId = req.query.model;
        if (!modelId) {
            return res.status(400).json({ error: 'Missing required "model" query parameter.' });
        }

        const db = readDb();
        const apiKey = db.settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY;
        const force = req.query.force === 'true';

        try {
            const models = await fetchOpenRouterModelsList(force, apiKey);
            const found = models.find(m => m.id === modelId || m.id.toLowerCase() === modelId.toLowerCase());

            if (!found) {
                return res.status(404).json({ error: `Model '${modelId}' not found on OpenRouter.` });
            }

            if (req.query.save === 'true') {
                await mutateDb((database) => {
                    if (!database.settings) database.settings = {};
                    if (!database.settings.openrouterModelDetails) database.settings.openrouterModelDetails = {};
                    const prev = database.settings.openrouterModelDetails[found.id] || {};
                    database.settings.openrouterModelDetails[found.id] = {
                        name: found.name,
                        contextLength: found.contextLength,
                        promptCostPerMillion: found.promptCostPerMillion,
                        completionCostPerMillion: found.completionCostPerMillion,
                        reasoning: found.reasoning || prev.reasoning || undefined,
                        reasoningEffort: prev.reasoningEffort || (found.reasoning?.mandatory ? (found.reasoning.default_effort || 'minimal') : undefined),
                        supportedParameters: found.supportedParameters || prev.supportedParameters || [],
                        lastUpdated: found.lastUpdated
                    };
                });
            }

            res.json({ success: true, model: found });
        } catch (err) {
            res.status(500).json({ error: `Failed to fetch OpenRouter model info: ${err.message}` });
        }
    });
}

module.exports = registerConfigRoutes;
