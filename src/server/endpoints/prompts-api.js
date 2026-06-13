const { getPromptTree, getPromptContent } = require('../prompts');

function registerPromptsApiRoutes(app) {
    // --- API: GET /api/prompts ---
    app.get('/api/prompts', (req, res) => {
        const tree = getPromptTree();
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(tree);
    });

    // --- API: GET /api/prompts/:category/:filename ---
    app.get('/api/prompts/:category/:filename', (req, res) => {
        const category = req.params.category;
        const filename = req.params.filename;

        try {
            const data = getPromptContent(category, filename);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.json(data);
        } catch (err) {
            if (err.message === 'Forbidden') {
                res.status(403).send('Forbidden');
            } else {
                res.status(404).send('Not found');
            }
        }
    });
}

module.exports = registerPromptsApiRoutes;
