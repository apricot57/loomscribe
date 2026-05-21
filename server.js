const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PROMPTS_DIR = path.join(ROOT, 'prompt_cards');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function readDb() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ conversations: [], messages: [], prompts: [], settings: {} }, null, 4));
        }
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error("DB Read Error:", e);
        return { conversations: [], messages: [], prompts: [], settings: {} };
    }
}

function writeDb(data) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const tempFile = DB_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 4), 'utf-8');
        fs.renameSync(tempFile, DB_FILE);
        return true;
    } catch (e) {
        console.error("DB Write Error:", e);
        return false;
    }
}

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

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

function getMime(ext) {
    return MIME[ext] || 'application/octet-stream';
}

function extractNameFromFile(filePath) {
    try {
        const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n')[0].trim();
        const match = firstLine.match(/^#\s+System Prompt:\s+(.+)/i);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}

function getPromptTree() {
    const categories = {};
    let entries;
    try {
        entries = fs.readdirSync(PROMPTS_DIR, { withFileTypes: true });
    } catch {
        return { categories };
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (!entry.isDirectory()) continue;

        const categoryDir = entry.name;
        const dirPath = path.join(PROMPTS_DIR, categoryDir);
        let files;
        try {
            files = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            continue;
        }

        const prompts = [];
        for (const file of files) {
            if (!file.isFile() || !file.name.endsWith('.md') || file.name.startsWith('.')) continue;
            if (file.name === 'the_harlow_family.md') continue;
            const filePath = path.join(dirPath, file.name);
            const name = extractNameFromFile(filePath) || file.name.replace(/_sys_prompt\.md$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            prompts.push({ name, filename: file.name, category: categoryDir });
        }

        if (prompts.length > 0) {
            categories[categoryDir] = prompts;
        }
    }

    return { categories };
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // --- API: GET /api/prompts ---
    if (pathname === '/api/prompts' && req.method === 'GET') {
        const tree = getPromptTree();
        res.writeHead(200, { 
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
        });
        res.end(JSON.stringify(tree));
        return;
    }

    // --- API: GET /api/prompts/:category/:filename ---
    const apiMatch = pathname.match(/^\/api\/prompts\/([^/]+)\/([^/]+)$/);
    if (apiMatch && req.method === 'GET') {
        const category = decodeURIComponent(apiMatch[1]);
        const filename = decodeURIComponent(apiMatch[2]);
        const filePath = path.join(PROMPTS_DIR, category, filename);

        if (!filePath.startsWith(PROMPTS_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        try {
            let content = fs.readFileSync(filePath, 'utf-8');
            // Strip the H1 heading line from content (display name is extracted separately)
            const lines = content.split('\n');
            if (lines.length > 0 && lines[0].trim().startsWith('# ')) {
                lines.shift();
                if (lines[0] && lines[0].trim() === '---') lines.shift();
                if (lines[0] && lines[0].trim() === '') lines.shift();
                content = lines.join('\n').trim();
            }
            const name = extractNameFromFile(filePath) || filename;
            res.writeHead(200, { 
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            });
            res.end(JSON.stringify({ name, filename, category, content }));
        } catch {
            res.writeHead(404);
            res.end('Not found');
        }
        return;
    }

    // --- API: Configurations & Key Management ---
    if (pathname === '/api/config') {
        if (req.method === 'GET') {
            const db = readDb();
            const hasKey = !!db.settings?.apiKey;
            const activeModel = db.settings?.activeModel || 'deepseek-v4-pro';
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            });
            res.end(JSON.stringify({ hasKey, activeModel }));
            return;
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
                writeDb(db);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, hasKey: !!db.settings.apiKey, activeModel: db.settings.activeModel }));
            }).catch(() => {
                res.writeHead(400);
                res.end('Bad Request');
            });
            return;
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
            return;
        }
        if (req.method === 'POST') {
            getRequestBody(req).then((body) => {
                const db = readDb();
                if (!db.conversations) db.conversations = [];
                const newConv = {
                    id: Date.now(), // Generate numeric ID like Dexie
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
            return;
        }
    }

    if (pathname.startsWith('/api/conversations/')) {
        const idStr = pathname.slice('/api/conversations/'.length);
        const id = isNaN(idStr) ? idStr : parseInt(idStr);

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
            return;
        }

        if (req.method === 'DELETE') {
            const db = readDb();
            db.conversations = (db.conversations || []).filter(c => c.id !== id);
            db.messages = (db.messages || []).filter(m => m.conversationId !== id);
            writeDb(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
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
            return;
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
            return;
        }
        if (req.method === 'DELETE') {
            // Delete all messages in a conversation
            const db = readDb();
            const conversationIdStr = url.searchParams.get('conversationId');
            const conversationId = isNaN(conversationIdStr) ? conversationIdStr : parseInt(conversationIdStr);
            db.messages = (db.messages || []).filter(m => m.conversationId !== conversationId);
            writeDb(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    if (pathname.startsWith('/api/messages/')) {
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
            return;
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
            return;
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
                        id: Date.now(),
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
            return;
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
            return;
        }
    }

    // --- API: DeepSeek completions secure stream proxy ---
    if (pathname === '/api/chat/completions' && req.method === 'POST') {
        const db = readDb();
        const apiKey = db.settings?.apiKey;
        if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: "API Key is missing on the server. Please configure it in Settings." } }));
            return;
        }

        getRequestBody(req).then((body) => {
            const https = require('https');
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
        return;
    }

    // --- Static file serving ---
    let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not found');
            } else {
                res.writeHead(500);
                res.end('Internal server error');
            }
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': getMime(ext),
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`VibeChat server running at http://localhost:${PORT}`);
});
