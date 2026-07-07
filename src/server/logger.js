/**
 * logger.js — Structured JSON logger for LoomScribe
 *
 * Writes timestamped, levelled log entries to:
 *   - stdout/stderr (human-readable)
 *   - data/logs/server.log (structured JSON, one entry per line)
 *
 * Log files rotate when they exceed LOG_MAX_BYTES. Up to LOG_MAX_FILES
 * rotated archives are kept before the oldest is deleted.
 *
 * No external dependencies — uses only Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration (can be overridden via environment variables)
// ---------------------------------------------------------------------------
const LOG_DIR     = path.resolve(__dirname, '../../data/logs');
const LOG_FILE    = path.join(LOG_DIR, 'server.log');
const LOG_LEVEL   = (process.env.LOG_LEVEL  || 'info').toLowerCase();   // debug | info | warn | error
const LOG_MAX_BYTES  = parseInt(process.env.LOG_MAX_BYTES  || String(5 * 1024 * 1024), 10); // 5 MB
const LOG_MAX_FILES  = parseInt(process.env.LOG_MAX_FILES  || '5', 10);

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

// ---------------------------------------------------------------------------
// Ensure log directory exists
// ---------------------------------------------------------------------------
function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

// ---------------------------------------------------------------------------
// Log rotation
// ---------------------------------------------------------------------------
function rotateLogs() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;
        const { size } = fs.statSync(LOG_FILE);
        if (size < LOG_MAX_BYTES) return;

        // Shift existing rotated files: .4 -> .5 (and delete .5 if it exists)
        for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
            const src  = `${LOG_FILE}.${i}`;
            const dest = `${LOG_FILE}.${i + 1}`;
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            if (fs.existsSync(src))  fs.renameSync(src, dest);
        }

        // Rename current log to .1
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch (e) {
        // Rotation errors are non-fatal; swallow silently
    }
}

// ---------------------------------------------------------------------------
// Core write function
// ---------------------------------------------------------------------------
function writeEntry(level, event, data) {
    if (LEVELS[level] < configuredLevel) return;

    const entry = {
        ts:    new Date().toISOString(),
        level: level.toUpperCase(),
        event,
        ...data
    };

    // Pretty-print to console
    const consoleFn = level === 'error' ? console.error
                    : level === 'warn'  ? console.warn
                    : console.log;

    consoleFn(`[${entry.ts}] [${entry.level}] ${event}`, data && Object.keys(data).length ? data : '');

    // Append JSON line to log file
    try {
        ensureLogDir();
        rotateLogs();
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (e) {
        // File write errors must never crash the server
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const logger = {
    debug: (event, data = {}) => writeEntry('debug', event, data),
    info:  (event, data = {}) => writeEntry('info',  event, data),
    warn:  (event, data = {}) => writeEntry('warn',  event, data),
    error: (event, data = {}) => writeEntry('error', event, data),

    /**
     * Returns an Express middleware that logs every HTTP request/response.
     * Usage: app.use(logger.requestMiddleware())
     */
    requestMiddleware() {
        return function logRequest(req, res, next) {
            const start = Date.now();
            const { method, url } = req;

            res.on('finish', () => {
                const ms     = Date.now() - start;
                const status = res.statusCode;
                const level  = status >= 500 ? 'error'
                             : status >= 400 ? 'warn'
                             : 'info';

                writeEntry(level, 'http_request', {
                    method,
                    url,
                    status,
                    ms,
                });
            });

            next();
        };
    }
};

module.exports = logger;
