const config = require('./endpoints/config');
const conversations = require('./endpoints/conversations');
const messages = require('./endpoints/messages');
const promptsApi = require('./endpoints/prompts-api');
const proxy = require('./endpoints/proxy');
const userPrompts = require('./endpoints/user-prompts');

function handleApiRoutes(app) {
    config(app);
    conversations(app);
    messages(app);
    promptsApi(app);
    proxy(app);
    userPrompts(app);
}

module.exports = {
    handleApiRoutes
};
