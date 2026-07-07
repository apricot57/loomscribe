require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const { handleApiRoutes } = require('./src/server/routes');
const logger = require('./src/server/logger');

const PORT = process.env.PORT || 3000;

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
    logger.error('uncaught_exception', { message: err.message, stack: err.stack });
    cleanupPid();
    process.exit(1);
});

const app = express();

// Log every HTTP request/response
app.use(logger.requestMiddleware());

// Parse JSON bodies with a 5MB limit
app.use(express.json({ limit: '5mb' }));

// Custom middleware for handling body parsing errors
app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
        logger.warn('body_too_large', { method: req.method, url: req.url });
        res.status(413).send('Payload Too Large');
        return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
        logger.warn('body_parse_error', { method: req.method, url: req.url });
        res.status(400).send('Bad Request');
        return;
    }
    next(err);
});

// Setup API routes
handleApiRoutes(app);

// Serve static assets from public directory with no-cache header
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
    }
}));

// Fallback error handler for other errors
app.use((err, req, res, next) => {
    logger.error('server_error', { method: req.method, url: req.url, message: err.message, stack: err.stack });
    if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
    }
});

const server = app.listen(PORT, () => {
    logger.info('server_start', { port: PORT, url: `http://localhost:${PORT}` });
});

// Setup WebSocket server
const { initWebSocketServer } = require('./src/server/websocket');
initWebSocketServer(server);
