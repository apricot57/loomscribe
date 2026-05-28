const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file manually (zero-dependency)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const index = trimmed.indexOf('=');
            if (index !== -1) {
                const key = trimmed.substring(0, index).trim();
                let val = trimmed.substring(index + 1).trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.substring(1, val.length - 1);
                }
                process.env[key] = val;
            }
        }
    });
}

// Write server.pid file for safe process control
const pidPath = path.join(__dirname, 'server.pid');
fs.writeFileSync(pidPath, process.pid.toString());

function cleanupPid() {
    try {
        if (fs.existsSync(pidPath)) {
            fs.unlinkSync(pidPath);
        }
    } catch (e) {}
}

// Register process exit listeners to clean up PID file
process.on('exit', cleanupPid);
process.on('SIGINT', () => {
    cleanupPid();
    process.exit(0);
});
process.on('SIGTERM', () => {
    cleanupPid();
    process.exit(0);
});
process.on('uncaughtException', (err) => {
    console.error("Uncaught exception:", err);
    cleanupPid();
    process.exit(1);
});

const { handleApiRoutes } = require('./src/server/routes');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');

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
    const safeRoot = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    if (!filePath.startsWith(safeRoot) && filePath !== ROOT) {
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
    console.log(`LoomScribe server running at http://localhost:${PORT}`);
});
