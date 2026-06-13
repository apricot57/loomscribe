const { readDb } = require('../db');
const https = require('https');

function registerProxyRoutes(app) {
    // --- API: DeepSeek completions secure stream proxy ---
    app.post('/api/chat/completions', (req, res) => {
        const db = readDb();
        const apiKey = db.settings?.apiKey;
        if (!apiKey) {
            res.status(400).json({ error: { message: "API Key is missing on the server. Please configure it in Settings." } });
            return;
        }

        const body = req.body;
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
            if (!res.headersSent) {
                res.status(500).json({ error: { message: "Failed to connect to DeepSeek API." } });
            } else {
                res.end();
            }
        });

        res.on('close', () => {
            if (!res.writableEnded) {
                proxyReq.destroy();
            }
        });

        proxyReq.write(JSON.stringify(body));
        proxyReq.end();
    });
}

module.exports = registerProxyRoutes;
