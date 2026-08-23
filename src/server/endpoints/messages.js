const { readDb, writeDb } = require('../db');
const { generateUniqueId } = require('../utils');
const {
    deactivateMessageTree,
    deactivateVersionGroupAndDescendants,
    showDescendants,
    deleteVersionGroupAndDescendants,
    deleteMessageAndDescendants
} = require('../services/version-tree');

function registerMessagesRoutes(app) {
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
        const targetVersionRaw = req.query.version || req.body?.version || req.body?.targetVersion;
        const targetVersion = targetVersionRaw !== undefined && targetVersionRaw !== null ? parseInt(targetVersionRaw, 10) : null;

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

    // Sub-route: /api/messages/navigate-turn
    app.post('/api/messages/navigate-turn', (req, res) => {
        const { userMsgId: userMsgIdRaw, assistantMsgId: assistantMsgIdRaw } = req.body;
        if (!userMsgIdRaw) {
            res.status(400).send('Missing userMsgId');
            return;
        }

        const userMsgId = isNaN(userMsgIdRaw) ? userMsgIdRaw : parseInt(userMsgIdRaw, 10);
        const assistantMsgId = assistantMsgIdRaw === undefined || assistantMsgIdRaw === null
            ? null
            : (isNaN(assistantMsgIdRaw) ? assistantMsgIdRaw : parseInt(assistantMsgIdRaw, 10));

        const db = readDb();
        const userMsg = db.messages.find(m => m.id === userMsgId);
        if (!userMsg) {
            res.status(404).send('User message not found');
            return;
        }

        // 1. Handle user message version group
        const userVGId = userMsg.versionGroupId || userMsg.id;
        const userVersions = db.messages.filter(m => m.role === 'user' && (m.versionGroupId === userVGId || m.id === userVGId));
        for (const u of userVersions) {
            u.isActive = (u.id === userMsg.id);
        }

        // 2. Handle assistant messages for the target user message
        const assistantVersions = db.messages.filter(m => m.role === 'assistant' && m.parentMsgId === userMsg.id);
        
        let targetAssistantMsg = null;
        if (assistantMsgId) {
            targetAssistantMsg = assistantVersions.find(m => m.id === assistantMsgId);
        }

        for (const r of assistantVersions) {
            r.isActive = (targetAssistantMsg && r.id === targetAssistantMsg.id);
        }

        // 3. Deactivate descendants of all deactivated versions
        for (const u of userVersions) {
            if (u.id !== userMsg.id) {
                deactivateMessageTree(db, u.id);
            }
        }
        for (const r of assistantVersions) {
            if (!targetAssistantMsg || r.id !== targetAssistantMsg.id) {
                deactivateMessageTree(db, r.id);
            }
        }

        // 4. Activate descendants of the active path
        if (targetAssistantMsg) {
            showDescendants(db, targetAssistantMsg.id);
        } else {
            showDescendants(db, userMsg.id);
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

    app.delete('/api/messages/:id', (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        const db = readDb();

        const msg = db.messages.find(m => m.id === msgId);
        if (!msg) {
            res.status(404).send('Message Not Found');
            return;
        }

        const deletedIds = deleteMessageAndDescendants(db, msgId);
        writeDb(db);
        res.json({ success: true, deletedIds });
    });

    app.delete('/api/messages/:id/version-group', (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        const db = readDb();
        
        const msg = db.messages.find(m => m.id === msgId);
        if (!msg) {
            res.status(404).send('Message Not Found');
            return;
        }
        
        const versionGroupId = msg.versionGroupId || msg.id;
        const deletedIds = deleteVersionGroupAndDescendants(db, versionGroupId);
        
        writeDb(db);
        res.json({ success: true, deletedIds });
    });
}

module.exports = registerMessagesRoutes;
