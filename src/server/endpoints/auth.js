const crypto = require('crypto');
const logger = require('../logger');

// In-memory token store: token -> expiry timestamp
const validTokens = new Map();
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function pruneExpiredTokens() {
    const now = Date.now();
    for (const [token, expiry] of validTokens.entries()) {
        if (now > expiry) validTokens.delete(token);
    }
}

/**
 * Middleware: verifies Bearer token from Authorization header.
 * Skips auth if APP_PASSWORD is not set.
 */
function requireAuth(req, res, next) {
    if (!process.env.APP_PASSWORD) return next();

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    pruneExpiredTokens();
    const expiry = validTokens.get(token);
    if (!expiry || Date.now() > expiry) {
        validTokens.delete(token);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

function auth(app) {
    // POST /api/auth/login
    app.post('/api/auth/login', (req, res) => {
        const { password } = req.body || {};
        const appPassword = process.env.APP_PASSWORD;

        if (!appPassword) {
            // No password configured — auth is disabled, return a dummy token
            return res.json({ token: 'no-auth', message: 'Auth disabled' });
        }

        if (!password || password !== appPassword) {
            logger.warn('auth_login_fail', { ip: req.ip });
            return res.status(401).json({ error: 'Invalid password' });
        }

        pruneExpiredTokens();
        const token = generateToken();
        validTokens.set(token, Date.now() + TOKEN_TTL_MS);
        logger.info('auth_login_success', { ip: req.ip });
        res.json({ token });
    });

    // GET /api/auth/check — validates a token
    app.get('/api/auth/check', (req, res) => {
        if (!process.env.APP_PASSWORD) {
            return res.json({ valid: true, authEnabled: false });
        }

        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        pruneExpiredTokens();
        const expiry = token ? validTokens.get(token) : null;
        const valid = !!(expiry && Date.now() <= expiry);

        res.json({ valid, authEnabled: true });
    });

    // POST /api/auth/logout
    app.post('/api/auth/logout', (req, res) => {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (token) validTokens.delete(token);
        res.json({ ok: true });
    });
}

module.exports = { auth, requireAuth };
