const { readDb, writeDb } = require('../db');
const { generateUniqueId } = require('../utils');

function registerConversationsRoutes(app) {
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
}

module.exports = registerConversationsRoutes;
