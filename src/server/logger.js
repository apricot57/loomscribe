const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../data/logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

function writeEntry(level, event, data) {
    if (LEVELS[level] < configuredLevel) return;

    const entry = {
        ts: new Date().toISOString(),
        level: level.toUpperCase(),
        event,
        ...data
    };

    const consoleFn = level === 'error' ? console.error
                    : level === 'warn'  ? console.warn
                    : console.log;

    consoleFn(`[${entry.ts}] [${entry.level}] ${event}`, data && Object.keys(data).length ? data : '');

    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (e) {
        // Suppress write errors to keep logging robust
    }
}

const logger = {
    debug: (event, data = {}) => writeEntry('debug', event, data),
    info:  (event, data = {}) => writeEntry('info',  event, data),
    warn:  (event, data = {}) => writeEntry('warn',  event, data),
    error: (event, data = {}) => writeEntry('error', event, data),

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

                const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|map)$/i.test(url) || url === '/favicon.ico';
                const shouldLog = !isStaticAsset || status >= 400 || LOG_LEVEL === 'debug';

                if (shouldLog) {
                    writeEntry(level, 'http_request', {
                        method,
                        url,
                        status,
                        ms,
                    });
                }
            });

            next();
        };
    }
};

module.exports = logger;
