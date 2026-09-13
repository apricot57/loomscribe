const { readDb, mutateDb } = require('../db');
const { generateUniqueId } = require('../utils');
const {
    deactivateMessageTree,
    deactivateVersionGroupAndDescendants,
    showDescendants,
    deleteVersionGroupAndDescendants,
    deleteMessageAndDescendants
} = require('../services/version-tree');

const MESSAGE_ROLES = ['user', 'assistant'];

function isValidVersion(value) {
    return Number.isInteger(value) && value > 0;
}

function isValidContent(value) {
    return typeof value === 'string' && value.trim() !== '';
}


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

    app.post('/api/messages', async (req, res) => {
        const body = req.body || {};

        if (!MESSAGE_ROLES.includes(body.role)) {
            res.status(400).send('Invalid role');
            return;
        }
        if (!isValidContent(body.content)) {
            res.status(400).send('Missing or invalid content');
            return;
        }
        if (body.version !== undefined && !isValidVersion(body.version)) {
            res.status(400).send('Invalid version');
            return;
        }
        if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
            res.status(400).send('Invalid isActive');
            return;
        }

        const db = readDb();
        const conversationExists = (db.conversations || []).some(c => String(c.id) === String(body.conversationId));
        if (!conversationExists) {
            res.status(404).send('Conversation Not Found');
            return;
        }
        if (body.versionGroupId !== undefined && body.versionGroupId !== null &&
            !(db.messages || []).some(m => String(m.versionGroupId) === String(body.versionGroupId))) {
            res.status(400).send('Invalid versionGroupId');
            return;
        }

        const newMsg = await mutateDb((db) => {
            if (!db.messages) db.messages = [];
            const msg = {
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
            db.messages.push(msg);
            return msg;
        });
        res.json(newMsg);
    });

    app.delete('/api/messages', async (req, res) => {
        const conversationIdStr = req.query.conversationId;
        const conversationId = isNaN(conversationIdStr) ? conversationIdStr : parseInt(conversationIdStr, 10);
        await mutateDb((db) => {
            db.messages = (db.messages || []).filter(m => m.conversationId !== conversationId);
        });
        res.json({ success: true });
    });

    // Sub-route: /api/messages/:id/version
    app.post('/api/messages/:id/version', async (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        const body = req.body || {};
        let notFound = false;
        const newMsg = await mutateDb((db) => {
            if (!db.messages) db.messages = [];
            const idx = db.messages.findIndex(m => m.id === msgId);
            if (idx === -1) {
                notFound = true;
                return null;
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

            const created = {
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

            db.messages.push(created);
            return created;
        });

        if (notFound) {
            res.status(404).send('Message Not Found');
        } else {
            res.json(newMsg);
        }
    });

    // Sub-route: /api/messages/:id/deactivate-tree
    app.post('/api/messages/:id/deactivate-tree', async (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        let notFound = false;
        const result = await mutateDb((db) => {
            if (!db.messages) db.messages = [];
            const idx = db.messages.findIndex(m => m.id === msgId);
            if (idx === -1) {
                notFound = true;
                return null;
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
            return { versionGroupId, nextVersion };
        });

        if (notFound) {
            res.status(404).send('Message Not Found');
        } else {
            res.json(result);
        }
    });

    // Sub-route: /api/messages/:versionGroupId/navigate
    app.post('/api/messages/:versionGroupId/navigate', async (req, res) => {
        const versionGroupIdStr = req.params.versionGroupId;
        const versionGroupId = isNaN(versionGroupIdStr) ? versionGroupIdStr : parseInt(versionGroupIdStr, 10);
        const targetVersionRaw = req.query.version || req.body?.version || req.body?.targetVersion;
        const targetVersion = targetVersionRaw !== undefined && targetVersionRaw !== null ? parseInt(targetVersionRaw, 10) : null;

        if (targetVersion === null || isNaN(targetVersion)) {
            res.status(400).send('Invalid version parameter');
            return;
        }

        let notFound = false;
        await mutateDb((db) => {
            const versions = (db.messages || []).filter(m => m.versionGroupId === versionGroupId);
            const targetMsg = versions.find(v => (v.version || 1) === targetVersion);

            if (!targetMsg) {
                notFound = true;
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
        });

        if (notFound) {
            res.status(404).send('Version Not Found');
        } else {
            res.json({ success: true });
        }
    });

    // Sub-route: /api/messages/navigate-turn
    app.post('/api/messages/navigate-turn', async (req, res) => {
        const { userMsgId: userMsgIdRaw, assistantMsgId: assistantMsgIdRaw } = req.body || {};
        if (!userMsgIdRaw) {
            res.status(400).send('Missing userMsgId');
            return;
        }

        const userMsgId = isNaN(userMsgIdRaw) ? userMsgIdRaw : parseInt(userMsgIdRaw, 10);
        const assistantMsgId = assistantMsgIdRaw === undefined || assistantMsgIdRaw === null
            ? null
            : (isNaN(assistantMsgIdRaw) ? assistantMsgIdRaw : parseInt(assistantMsgIdRaw, 10));

        let notFound = false;
        await mutateDb((db) => {
            const userMsg = (db.messages || []).find(m => m.id === userMsgId);
            if (!userMsg) {
                notFound = true;
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
        });

        if (notFound) {
            res.status(404).send('User message not found');
        } else {
            res.json({ success: true });
        }
    });

    // Base route: /api/messages/:id (PUT)
    app.put('/api/messages/:id', async (req, res) => {
        const idStr = req.params.id;
        const id = isNaN(idStr) ? idStr : parseInt(idStr, 10);
        const body = req.body || {};

        if (body.content !== undefined && !isValidContent(body.content)) {
            res.status(400).send('Invalid content');
            return;
        }
        if (body.version !== undefined && !isValidVersion(body.version)) {
            res.status(400).send('Invalid version');
            return;
        }
        if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
            res.status(400).send('Invalid isActive');
            return;
        }
        if (body.versionGroupId !== undefined && body.versionGroupId !== null) {
            const currentDb = readDb();
            if (!(currentDb.messages || []).some(m => String(m.versionGroupId) === String(body.versionGroupId))) {
                res.status(400).send('Invalid versionGroupId');
                return;
            }
        }

        let notFound = false;
        const updatedMsg = await mutateDb((db) => {
            const idx = (db.messages || []).findIndex(m => m.id === id);
            if (idx === -1) {
                notFound = true;
                return null;
            }
            const { isActive, versionGroupId, version, content, reasoning } = body;
            const updateObj = {};
            if (isActive !== undefined) updateObj.isActive = isActive;
            if (versionGroupId !== undefined) updateObj.versionGroupId = versionGroupId;
            if (version !== undefined) updateObj.version = version;
            if (content !== undefined) updateObj.content = content;
            if (reasoning !== undefined) updateObj.reasoning = reasoning;
            db.messages[idx] = { ...db.messages[idx], ...updateObj };
            return db.messages[idx];
        });

        if (notFound) {
            res.status(404).send('Not Found');
        } else {
            res.json(updatedMsg);
        }
    });

    app.delete('/api/messages/:id', async (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        let notFound = false;
        const deletedIds = await mutateDb((db) => {
            const msg = (db.messages || []).find(m => m.id === msgId);
            if (!msg) {
                notFound = true;
                return null;
            }
            return deleteMessageAndDescendants(db, msgId);
        });

        if (notFound) {
            res.status(404).send('Message Not Found');
        } else {
            res.json({ success: true, deletedIds });
        }
    });

    app.delete('/api/messages/:id/version-group', async (req, res) => {
        const msgIdStr = req.params.id;
        const msgId = isNaN(msgIdStr) ? msgIdStr : parseInt(msgIdStr, 10);
        let notFound = false;
        const deletedIds = await mutateDb((db) => {
            const msg = (db.messages || []).find(m => m.id === msgId);
            if (!msg) {
                notFound = true;
                return null;
            }
            const versionGroupId = msg.versionGroupId || msg.id;
            return deleteVersionGroupAndDescendants(db, versionGroupId);
        });

        if (notFound) {
            res.status(404).send('Message Not Found');
        } else {
            res.json({ success: true, deletedIds });
        }
    });
}

module.exports = registerMessagesRoutes;
