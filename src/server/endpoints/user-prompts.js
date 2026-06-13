const { readDb, writeDb } = require('../db');
const { generateUniqueId } = require('../utils');

function registerUserPromptsRoutes(app) {
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
}

module.exports = registerUserPromptsRoutes;
