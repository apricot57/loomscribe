const { readDb, writeDb } = require('./db');
const { getPromptTree, getPromptContent } = require('./prompts');
const https = require('https');

function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', err => reject(err));
    });
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

function handleApiRoutes(req, res, pathname, url) {
    // --- API: GET /api/prompts ---
    if (pathname === '/api/prompts' && req.method === 'GET') {
        const tree = getPromptTree();
        res.writeHead(200, { 
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
        });
        res.end(JSON.stringify(tree));
        return true;
    }

    // --- API: GET /api/prompts/:category/:filename ---
    const promptMatch = pathname.match(/^\/api\/prompts\/([^/]+)\/([^/]+)$/);
    if (promptMatch && req.method === 'GET') {
        const category = decodeURIComponent(promptMatch[1]);
        const filename = decodeURIComponent(promptMatch[2]);

        try {
            const data = getPromptContent(category, filename);
            res.writeHead(200, { 
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            });
            res.end(JSON.stringify(data));
        } catch (err) {
            if (err.message === 'Forbidden') {
                res.writeHead(403);
                res.end('Forbidden');
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        }
        return true;
    }

    // --- API: Configurations & Key Management ---
    if (pathname === '/api/config') {
        if (req.method === 'GET') {
            const db = readDb();
            const hasKey = !!db.settings?.apiKey;
            const activeModel = db.settings?.activeModel || 'deepseek-v4-pro';
            const thinkingMode = db.settings?.thinkingMode || 'enabled';
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            });
            res.end(JSON.stringify({ hasKey, activeModel, thinkingMode }));
            return true;
        }
        if (req.method === 'POST') {
            getRequestBody(req).then((body) => {
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
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    hasKey: !!db.settings.apiKey, 
                    activeModel: db.settings.activeModel,
                    thinkingMode: db.settings.thinkingMode || 'enabled'
                }));
            }).catch(() => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return true;
        }
    }

    // --- API: Conversations CRUD ---
    if (pathname === '/api/conversations') {
        if (req.method === 'GET') {
            const db = readDb();
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            });
            res.end(JSON.stringify(db.conversations || []));
            return true;
        }
        if (req.method === 'POST') {
            getRequestBody(req).then((body) => {
                const db = readDb();
                if (!db.conversations) db.conversations = [];
                const newConv = {
                    id: Date.now(), // Generate numeric ID
                    title: body.title || 'New Chat',
                    activeModel: body.activeModel || 'deepseek-v4-pro',
                    systemPromptId: body.systemPromptId || null,
                    createdAt: Date.now()
                };
                db.conversations.push(newConv);
                writeDb(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(newConv));
            }).catch(() => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return true;
        }
    }

    if (pathname.startsWith('/api/conversations/')) {
        const idStr = pathname.slice('/api/conversations/'.length);
        const id = isNaN(idStr) ? idStr : parseInt(idStr);

        if (req.method === 'GET') {
            const db = readDb();
            const conv = (db.conversations || []).find(c => c.id === id);
            if (conv) {
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                });
                res.end(JSON.stringify(conv));
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
            return true;
        }

        if (req.method === 'PUT') {
            getRequestBody(req).then((body) => {
                const db = readDb();
                const idx = db.conversations.findIndex(c => c.id === id);
                if (idx !== -1) {
                    db.conversations[idx] = { ...db.conversations[idx], ...body };
                    writeDb(db);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.conversations[idx]));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            }).catch(() => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return true;
        }

        if (req.method === 'DELETE') {
            const db = readDb();
            db.conversations = (db.conversations || []).filter(c => c.id !== id);
            db.messages = (db.messages || []).filter(m => m.conversationId !== id);
            writeDb(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return true;
        }
    }

    // --- API: Messages CRUD ---
    if (pathname === '/api/messages') {
        if (req.method === 'GET') {
            const db = readDb();
            const conversationIdStr = url.searchParams.get('conversationId');
            const conversationId = isNaN(conversationIdStr) ? conversationIdStr : parseInt(conversationIdStr);
            const filtered = (db.messages || []).filter(m => m.conversationId === conversationId);
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            });
            res.end(JSON.stringify(filtered));
            return true;
        }
        if (req.method === 'POST') {
            getRequestBody(req).then((body) => {
                const db = readDb();
                if (!db.messages) db.messages = [];
                const newMsg = {
                    id: Date.now() + Math.floor(Math.random() * 1000), // Random/Unique dynamic ID
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
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(newMsg));
            }).catch(() => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return true;
        }
        if (req.method === 'DELETE') {
            const db = readDb();
            const conversationIdStr = url.searchParams.get('conversationId');
            const conversationId = isNaN(conversationIdStr) ? conversationIdStr : parseInt(conversationIdStr);
            db.messages = (db.messages || []).filter(m => m.conversationId !== conversationId);
            writeDb(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return true;
        }
    }

    if (pathname.startsWith('/api/messages/')) {
        // Sub-route: /api/messages/:id/version
        const matchVersion = pathname.match(/^\/api\/messages\/([^/]+)\/version$/);
        if (matchVersion && req.method === 'POST') {
            const msgId = isNaN(matchVersion[1]) ? matchVersion[1] : parseInt(matchVersion[1]);
            getRequestBody(req).then((body) => {
                const db = readDb();
                const idx = db.messages.findIndex(m => m.id === msgId);
                if (idx === -1) {
                    res.writeHead(404);
                    res.end('Message Not Found');
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
                    id: Date.now() + Math.floor(Math.random() * 1000),
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

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(newMsg));
            }).catch((e) => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return true;
        }

        // Sub-route: /api/messages/:id/deactivate-tree
        const matchDeactivate = pathname.match(/^\/api\/messages\/([^/]+)\/deactivate-tree$/);
        if (matchDeactivate && req.method === 'POST') {
            const msgId = isNaN(matchDeactivate[1]) ? matchDeactivate[1] : parseInt(matchDeactivate[1]);
            const db = readDb();
            const idx = db.messages.findIndex(m => m.id === msgId);
            if (idx === -1) {
                res.writeHead(404);
                res.end('Message Not Found');
                return true;
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

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ versionGroupId, nextVersion }));
            return true;
        }

        // Sub-route: /api/messages/:versionGroupId/navigate
        const matchNavigate = pathname.match(/^\/api\/messages\/([^/]+)\/navigate$/);
        if (matchNavigate && req.method === 'POST') {
            const versionGroupId = isNaN(matchNavigate[1]) ? matchNavigate[1] : parseInt(matchNavigate[1]);
            const targetVersionStr = url.searchParams.get('version');
            const targetVersion = targetVersionStr ? parseInt(targetVersionStr) : null;

            if (targetVersion === null || isNaN(targetVersion)) {
                res.writeHead(400);
                res.end('Invalid version parameter');
                return true;
            }

            const db = readDb();
            const versions = db.messages.filter(m => m.versionGroupId === versionGroupId);
            const targetMsg = versions.find(v => (v.version || 1) === targetVersion);

            if (!targetMsg) {
                res.writeHead(404);
                res.end('Version Not Found');
                return true;
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

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return true;
        }

        // Base route: /api/messages/:id (PUT)
        const idStr = pathname.slice('/api/messages/'.length);
        const id = isNaN(idStr) ? idStr : parseInt(idStr);

        if (req.method === 'PUT') {
            getRequestBody(req).then((body) => {
                const db = readDb();
                const idx = db.messages.findIndex(m => m.id === id);
                if (idx !== -1) {
                    db.messages[idx] = { ...db.messages[idx], ...body };
                    writeDb(db);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.messages[idx]));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            }).catch(() => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return true;
        }
    }

    // --- API: Custom User Prompts CRUD ---
    if (pathname === '/api/user-prompts') {
        if (req.method === 'GET') {
            const db = readDb();
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            });
            res.end(JSON.stringify(db.prompts || []));
            return true;
        }
        if (req.method === 'POST') {
            getRequestBody(req).then((body) => {
                const db = readDb();
                if (!db.prompts) db.prompts = [];
                let pRecord;
                if (body.id) {
                    // Update
                    const idx = db.prompts.findIndex(p => p.id === body.id);
                    if (idx !== -1) {
                        db.prompts[idx] = { ...db.prompts[idx], ...body };
                        pRecord = db.prompts[idx];
                    }
                } else {
                    // Add
                    pRecord = {
                        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
                        name: body.name,
                        category: body.category,
                        content: body.content,
                        createdAt: Date.now()
                    };
                    db.prompts.push(pRecord);
                }
                writeDb(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(pRecord));
            }).catch(() => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return true;
        }
    }

    if (pathname.startsWith('/api/user-prompts/')) {
        const idStr = pathname.slice('/api/user-prompts/'.length);
        const id = isNaN(idStr) ? idStr : parseInt(idStr);

        if (req.method === 'DELETE') {
            const db = readDb();
            db.prompts = (db.prompts || []).filter(p => p.id !== id);
            writeDb(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return true;
        }
    }

    // --- API: DeepSeek completions secure stream proxy ---
    if (pathname === '/api/chat/completions' && req.method === 'POST') {
        const db = readDb();
        const apiKey = db.settings?.apiKey;
        if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: "API Key is missing on the server. Please configure it in Settings." } }));
            return true;
        }

        getRequestBody(req).then((body) => {
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
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: "Failed to connect to DeepSeek API." } }));
            });

            req.on('close', () => {
                proxyReq.destroy();
            });

            proxyReq.write(JSON.stringify(body));
            proxyReq.end();
        }).catch((err) => {
            res.writeHead(400);
            res.end('Bad Request');
        });
        return true;
    }

    return false; // Not handled as an API route
}

module.exports = {
    handleApiRoutes
};
