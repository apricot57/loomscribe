const { readDb, writeDb } = require('./db');
const { getPromptTree, getPromptContent } = require('./prompts');
const https = require('https');

function generateUniqueId(db, table) {
    while (true) {
        const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        const exists = (db[table] || []).some(item => item.id === id);
        if (!exists) return id;
    }
}

function deactivateMessageTree(db, msgId) {
    const queue = [msgId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const descendants = (db.messages || []).filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
        for (const child of descendants) {
            child.isActive = false;
            queue.push(child.id);
        }
    }
}

function deactivateVersionGroupAndDescendants(db, versionGroupId) {
    const versions = (db.messages || []).filter(m => m.versionGroupId === versionGroupId || m.id === versionGroupId);
    for (const v of versions) {
        v.isActive = false;
        deactivateMessageTree(db, v.id);
    }
}

function showDescendants(db, msgId) {
    let currentId = msgId;
    while (true) {
        const children = (db.messages || []).filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
        if (children.length === 0) break;
        
        let bestChild = children[0];
        for (let i = 1; i < children.length; i++) {
            if (children[i].versionGroupId === bestChild.versionGroupId) {
                if ((children[i].version || 1) > (bestChild.version || 1)) {
                    bestChild = children[i];
                }
            } else {
                if (children[i].id > bestChild.id) {
                    bestChild = children[i];
                }
            }
        }
        
        bestChild.isActive = true;
        currentId = bestChild.id;
    }
}

function handleApiRoutes(app) {
    // --- API: GET /api/health ---
    app.get('/api/health', (req, res) => {
        res.json({ status: 'OK', uptime: process.uptime() });
    });

    // --- API: GET /api/prompts ---
    app.get('/api/prompts', (req, res) => {
        const tree = getPromptTree();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(tree);
    });

    // --- API: GET /api/prompts/:category/:filename ---
    app.get('/api/prompts/:category/:filename', (req, res) => {
        const category = req.params.category;
        const filename = req.params.filename;

        try {
            const data = getPromptContent(category, filename);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.json(data);
        } catch (err) {
            if (err.message === 'Forbidden') {
                res.status(403).send('Forbidden');
            } else {
                res.status(404).send('Not found');
            }
        }
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

    // --- API: Conversations CRUD ---
    app.get('/api/conversations', (req, res) => {
        const db = readDb();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(db.conversations || []);
    });

    app.post('/api/conversations', (req, res) => {
        const body = req.body;
        const db = readDb();
        if (!db.conversations) db.conversations = [];
        const newConv = {
            id: generateUniqueId(db, 'conversations'),
            title: body.title || 'New Chat',
            activeModel: body.activeModel || 'deepseek-v4-pro',
            systemPromptId: body.systemPromptId || null,
            createdAt: Date.now()
        };
        db.conversations.push(newConv);
        writeDb(db);
        res.json(newConv);
    });

    app.get('/api/conversations/:id', (req, res) => {
        const idStr = req.params.id;
        const id = isNaN(idStr) ? idStr : parseInt(idStr, 10);
        const db = readDb();
        const conv = (db.conversations || []).find(c => c.id === id);
        if (conv) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.json(conv);
        } else {
            res.status(404).send('Not Found');
        }
    });

    app.put('/api/conversations/:id', (req, res) => {
        const idStr = req.params.id;
        const id = isNaN(idStr) ? idStr : parseInt(idStr, 10);
        const body = req.body;
        const db = readDb();
        const idx = db.conversations.findIndex(c => c.id === id);
        if (idx !== -1) {
            const { title, activeModel, systemPromptId } = body;
            const updateObj = {};
            if (title !== undefined) updateObj.title = title;
            if (activeModel !== undefined) updateObj.activeModel = activeModel;
            if (systemPromptId !== undefined) updateObj.systemPromptId = systemPromptId;
            db.conversations[idx] = { ...db.conversations[idx], ...updateObj };
            writeDb(db);
            res.json(db.conversations[idx]);
        } else {
            res.status(404).send('Not Found');
        }
    });

    app.delete('/api/conversations/:id', (req, res) => {
        const idStr = req.params.id;
        const id = isNaN(idStr) ? idStr : parseInt(idStr, 10);
        const db = readDb();
        db.conversations = (db.conversations || []).filter(c => c.id !== id);
        db.messages = (db.messages || []).filter(m => m.conversationId !== id);
        writeDb(db);
        res.json({ success: true });
    });

    // --- API: Messages CRUD & Sub-routes ---
    app.get('/api/messages', (req, res) => {
        const db = readDb();
        const conversationIdStr = req.query.conversationId;
        const conversationId = isNaN(conversationIdStr) ? conversationIdStr : parseInt(conversationIdStr, 10);
        const filtered = (db.messages || []).filter(m => m.conversationId === conversationId);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(filtered);
    });

    app.post('/api/messages', (req, res) => {
        const body = req.body;
        const db = readDb();
        if (!db.messages) db.messages = [];
        const newMsg = {
            id: generateUniqueId(db, 'messages'),
            conversationId: body.conversationId,
            role: body.role,
            content: body.content,
            reasoning: body.reasoning,
            timestamp: body.timestamp || Date.now(),
            parentMsgId: body.parentMsgId || null,
            versionGroupId: body.versionGroupId || null,
            version: body.version || 1,
            isActive: body.isActive !== undefined ? body.isActive : true
        };
        db.messages.push(newMsg);
        writeDb(db);
        res.json(newMsg);
    });

    app.delete('/api/messages', (req, res) => {
        const db = readDb();
        const conversationIdStr = req.query.conversationId;
        const conversationId = isNaN(conversationIdStr) ? conversationIdStr : parseInt(conversationIdStr, 10);
        db.messages = (db.messages || []).filter(m => m.conversationId !== conversationId);
        writeDb(db);
        res.json({ success: true });
    });

    // Sub-route: /api/messages/:id/version
    app.post('/api/messages/:id/version', (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        const body = req.body;
        const db = readDb();
        const idx = db.messages.findIndex(m => m.id === msgId);
        if (idx === -1) {
            res.status(404).send('Message Not Found');
            return;
        }
        const originalMsg = db.messages[idx];
        const versionGroupId = originalMsg.versionGroupId || originalMsg.id;

        if (!originalMsg.versionGroupId) {
            originalMsg.versionGroupId = versionGroupId;
            originalMsg.version = 1;
        }

        const existingVersions = db.messages.filter(m => m.versionGroupId === versionGroupId);
        const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version || 1), 0);
        const newVersion = maxVersion + 1;

        deactivateVersionGroupAndDescendants(db, versionGroupId);

        const newMsg = {
            id: generateUniqueId(db, 'messages'),
            conversationId: originalMsg.conversationId,
            role: body.role || originalMsg.role,
            content: body.content,
            reasoning: body.reasoning || undefined,
            timestamp: Date.now(),
            parentMsgId: originalMsg.parentMsgId,
            versionGroupId: versionGroupId,
            version: newVersion,
            isActive: true
        };

        db.messages.push(newMsg);
        writeDb(db);
        res.json(newMsg);
    });

    // Sub-route: /api/messages/:id/deactivate-tree
    app.post('/api/messages/:id/deactivate-tree', (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        const db = readDb();
        const idx = db.messages.findIndex(m => m.id === msgId);
        if (idx === -1) {
            res.status(404).send('Message Not Found');
            return;
        }
        const originalMsg = db.messages[idx];
        const versionGroupId = originalMsg.versionGroupId || originalMsg.id;

        if (!originalMsg.versionGroupId) {
            originalMsg.versionGroupId = versionGroupId;
            originalMsg.version = 1;
        }

        const existingVersions = db.messages.filter(m => m.versionGroupId === versionGroupId);
        const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.version || 1), 0);
        const nextVersion = maxVersion + 1;

        deactivateVersionGroupAndDescendants(db, versionGroupId);
        writeDb(db);

        res.json({ versionGroupId, nextVersion });
    });

    // Sub-route: /api/messages/:versionGroupId/navigate
    app.post('/api/messages/:versionGroupId/navigate', (req, res) => {
        const versionGroupIdStr = req.params.versionGroupId;
        const versionGroupId = isNaN(versionGroupIdStr) ? versionGroupIdStr : parseInt(versionGroupIdStr, 10);
        const targetVersionStr = req.query.version;
        const targetVersion = targetVersionStr ? parseInt(targetVersionStr, 10) : null;

        if (targetVersion === null || isNaN(targetVersion)) {
            res.status(400).send('Invalid version parameter');
            return;
        }

        const db = readDb();
        const versions = db.messages.filter(m => m.versionGroupId === versionGroupId);
        const targetMsg = versions.find(v => (v.version || 1) === targetVersion);

        if (!targetMsg) {
            res.status(404).send('Version Not Found');
            return;
        }

        for (const v of versions) {
            v.isActive = false;
        }

        targetMsg.isActive = true;
        showDescendants(db, targetMsg.id);

        for (const v of versions) {
            if (v.id !== targetMsg.id) {
                deactivateMessageTree(db, v.id);
            }
        }

        writeDb(db);
        res.json({ success: true });
    });

    // Base route: /api/messages/:id (PUT)
    app.put('/api/messages/:id', (req, res) => {
        const idStr = req.params.id;
        const id = isNaN(idStr) ? idStr : parseInt(idStr, 10);
        const body = req.body;
        const db = readDb();
        const idx = db.messages.findIndex(m => m.id === id);
        if (idx !== -1) {
            const { isActive, versionGroupId, version, content, reasoning } = body;
            const updateObj = {};
            if (isActive !== undefined) updateObj.isActive = isActive;
            if (versionGroupId !== undefined) updateObj.versionGroupId = versionGroupId;
            if (version !== undefined) updateObj.version = version;
            if (content !== undefined) updateObj.content = content;
            if (reasoning !== undefined) updateObj.reasoning = reasoning;
            db.messages[idx] = { ...db.messages[idx], ...updateObj };
            writeDb(db);
            res.json(db.messages[idx]);
        } else {
            res.status(404).send('Not Found');
        }
    });

    // --- API: Custom User Prompts CRUD ---
    app.get('/api/user-prompts', (req, res) => {
        const db = readDb();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(db.prompts || []);
    });

    app.post('/api/user-prompts', (req, res) => {
        const body = req.body;
        const db = readDb();
        if (!db.prompts) db.prompts = [];
        let pRecord;
        if (body.id) {
            // Update
            const idx = db.prompts.findIndex(p => p.id === body.id);
            if (idx === -1) {
                res.status(404).send('Not Found');
                return;
            }

            const { name, category, content } = body;
            const updateObj = {};
            if (name !== undefined) updateObj.name = name;
            if (category !== undefined) updateObj.category = category;
            if (content !== undefined) updateObj.content = content;
            db.prompts[idx] = { ...db.prompts[idx], ...updateObj };
            pRecord = db.prompts[idx];
        } else {
            // Add
            pRecord = {
                id: generateUniqueId(db, 'prompts'),
                name: body.name,
                category: body.category,
                content: body.content,
                createdAt: Date.now()
            };
            db.prompts.push(pRecord);
        }
        writeDb(db);
        res.json(pRecord);
    });

    app.delete('/api/user-prompts/:id', (req, res) => {
        const idStr = req.params.id;
        const id = isNaN(idStr) ? idStr : parseInt(idStr, 10);
        const db = readDb();
        db.prompts = (db.prompts || []).filter(p => p.id !== id);
        writeDb(db);
        res.json({ success: true });
    });

    // --- API: DeepSeek completions secure stream proxy ---
    app.post('/api/chat/completions', (req, res) => {
        const db = readDb();
        const apiKey = db.settings?.apiKey;
        if (!apiKey) {
            res.status(400).json({ error: { message: "API Key is missing on the server. Please configure it in Settings." } });
            return;
        }

        const body = req.body;
        const options = {
            hostname: 'api.deepseek.com',
            port: 443,
            path: '/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (e) => {
            console.error("Proxy request error:", e);
            if (!res.headersSent) {
                res.status(500).json({ error: { message: "Failed to connect to DeepSeek API." } });
            } else {
                res.end();
            }
        });

        req.on('close', () => {
            proxyReq.destroy();
        });

        proxyReq.write(JSON.stringify(body));
        proxyReq.end();
    });
}

module.exports = {
    handleApiRoutes
};
