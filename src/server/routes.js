const { auth, requireAuth } = require('./endpoints/auth');
const config = require('./endpoints/config');
const conversations = require('./endpoints/conversations');
const messages = require('./endpoints/messages');
const engine = require('./endpoints/engine');

function handleApiRoutes(app) {
    // Auth routes (no protection needed)
    auth(app);

    // Protect all other API routes
    app.use('/api', requireAuth);

    config(app);
    conversations(app);
    messages(app);
    engine(app);
}

module.exports = {
    handleApiRoutes
};
