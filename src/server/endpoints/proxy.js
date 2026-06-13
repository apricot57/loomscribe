const { readDb } = require('../db');
const https = require('https');
const { compilePrompt } = require('../../../engine/compiler');

function registerProxyRoutes(app) {
    // --- API: DeepSeek completions secure stream proxy ---
    app.post('/api/chat/completions', (req, res) => {
        const db = readDb();
        const apiKey = db.settings?.apiKey;
        if (!apiKey) {
            res.status(400).json({ error: { message: "API Key is missing on the server. Please configure it in Settings." } });
            return;
        }

        const body = { ...req.body };
        const conversationId = body.conversationId;
        delete body.conversationId;

        let messages = body.messages || [];

        if (conversationId !== undefined && conversationId !== null) {
            // Convert string ID if needed
            const convId = typeof conversationId === 'string' && !isNaN(conversationId) ? parseInt(conversationId, 10) : conversationId;
            const conv = (db.conversations || []).find(c => c.id === convId);
            if (conv) {
                const { presetId, params, blockOverrides, directorNote } = conv;
                try {
                    const { systemPrompt, postHistory } = compilePrompt({
                        presetId,
                        params,
                        blockOverrides,
                        directorNote
                    });

                    const history = messages.filter(m => m.role !== 'system');
                    const finalMessages = [];
                    
                    if (systemPrompt && systemPrompt.trim()) {
                        finalMessages.push({ role: 'system', content: systemPrompt });
                    }
                    finalMessages.push(...history);
                    if (postHistory && postHistory.trim()) {
                        finalMessages.push({ role: 'system', content: postHistory });
                    }
                    body.messages = finalMessages;
                } catch (compileErr) {
                    console.error("Proxy prompt compilation failed:", compileErr);
                    res.status(400).json({ error: { message: `Prompt compilation failed: ${compileErr.message}` } });
                    return;
                }
            }
        }

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
