const config = require('./endpoints/config');
const conversations = require('./endpoints/conversations');
const messages = require('./endpoints/messages');
const proxy = require('./endpoints/proxy');
const engine = require('./endpoints/engine');

function handleApiRoutes(app) {
    config(app);
    conversations(app);
    messages(app);
    proxy(app);
    engine(app);
}

module.exports = {
    handleApiRoutes
};
