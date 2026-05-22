const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApiRoutes } = require('./src/server/routes');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

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

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Delegate API routes to modular router
    const isApiRequest = handleApiRoutes(req, res, pathname, url);
    if (isApiRequest) {
        return;
    }

    // --- Static file serving ---
    let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);

    // Safety check to prevent directory traversal
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
