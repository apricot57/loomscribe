const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PROMPTS_DIR = path.join(ROOT, 'prompt_cards');

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
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
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
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ name, filename, category, content }));
        } catch {
            res.writeHead(404);
            res.end('Not found');
        }
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
