const test = require('node:test');
const assert = require('node:assert');
const { resolveProvider } = require('../src/server/websocket/provider-router');

test.describe('resolveProvider OpenRouter routing', () => {
    test('Routes vendor/model IDs to OpenRouter endpoint', () => {
        const config = resolveProvider({
            model: 'anthropic/claude-sonnet-4.5',
            settings: { openrouterApiKey: 'sk-or-v1-test', pinnedOpenRouterModels: [] }
        });

        assert.strictEqual(config.error, null);
        assert.strictEqual(config.apiEndpoint, 'https://openrouter.ai/api/v1/chat/completions');
        assert.strictEqual(config.apiAuthKey, 'sk-or-v1-test');
        assert.strictEqual(config.apiModel, 'anthropic/claude-sonnet-4.5');
    });

    test('Routes vendor/model IDs with colon tags (e.g. :free) to OpenRouter', () => {
        const config = resolveProvider({
            model: 'poolside/laguna-s-2.1:free',
            settings: { openrouterApiKey: 'sk-or-v1-test', pinnedOpenRouterModels: [] }
        });

        assert.strictEqual(config.error, null);
        assert.strictEqual(config.apiEndpoint, 'https://openrouter.ai/api/v1/chat/completions');
        assert.strictEqual(config.apiAuthKey, 'sk-or-v1-test');
        assert.strictEqual(config.apiModel, 'poolside/laguna-s-2.1:free');
    });

    test('Routes pinned OpenRouter models even without a vendor prefix', () => {
        const config = resolveProvider({
            model: 'my-custom-alias',
            settings: { openrouterApiKey: 'sk-or-v1-test', pinnedOpenRouterModels: ['my-custom-alias'] }
        });

        assert.strictEqual(config.error, null);
        assert.strictEqual(config.apiEndpoint, 'https://openrouter.ai/api/v1/chat/completions');
    });

    test('Returns key error for OpenRouter model when key is missing', () => {
        const savedEnv = process.env.OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        try {
            const config = resolveProvider({
                model: 'openai/gpt-4o',
                settings: { pinnedOpenRouterModels: [] }
            });

            assert.match(config.error, /OpenRouter API Key is missing on the server/);
            assert.strictEqual(config.apiEndpoint, null);
        } finally {
            if (savedEnv !== undefined) process.env.OPENROUTER_API_KEY = savedEnv;
        }
    });

    test('Vendor/model detection does not hijack DeepSeek built-in models', () => {
        const config = resolveProvider({
            model: 'deepseek-v4-pro',
            settings: { apiKey: 'ds-key' }
        });

        assert.strictEqual(config.error, null);
        assert.strictEqual(config.apiEndpoint, 'https://api.deepseek.com/chat/completions');
    });

    test('Includes stream_options: { include_usage: true } for OpenRouter models', () => {
        const config = resolveProvider({
            model: 'meta/muse-spark-1.3-contributor',
            settings: { openrouterApiKey: 'sk-or-v1-test' }
        });

        assert.strictEqual(config.error, null);
        assert.deepStrictEqual(config.requestBodyObj.stream_options, { include_usage: true });
    });

    test('Attaches configured reasoning effort for OpenRouter model from model details', () => {
        const config = resolveProvider({
            model: 'deepseek/deepseek-v4-flash',
            settings: {
                openrouterApiKey: 'sk-or-v1-test',
                openrouterModelDetails: {
                    'deepseek/deepseek-v4-flash': {
                        reasoning: { mandatory: false, supported_efforts: ['high', 'xhigh'] },
                        reasoningEffort: 'xhigh'
                    }
                }
            }
        });

        assert.strictEqual(config.error, null);
        assert.deepStrictEqual(config.requestBodyObj.reasoning, { effort: 'xhigh' });
    });

    test('Applies mandatory default reasoning effort when model mandates reasoning', () => {
        const config = resolveProvider({
            model: 'meta/muse-spark-1.3-contributor',
            settings: {
                openrouterApiKey: 'sk-or-v1-test',
                openrouterModelDetails: {
                    'meta/muse-spark-1.3-contributor': {
                        reasoning: { mandatory: true, default_effort: 'minimal' }
                    }
                }
            }
        });

        assert.strictEqual(config.error, null);
        assert.deepStrictEqual(config.requestBodyObj.reasoning, { effort: 'minimal' });
    });

    test('Resolves reasoning effort "default" to model default_effort', () => {
        const config = resolveProvider({
            model: 'deepseek/deepseek-v4-flash',
            settings: {
                openrouterApiKey: 'sk-or-v1-test',
                openrouterModelDetails: {
                    'deepseek/deepseek-v4-flash': {
                        reasoning: { mandatory: false, supported_efforts: ['high', 'xhigh'], default_effort: 'high' },
                        reasoningEffort: 'default'
                    }
                }
            }
        });

        assert.strictEqual(config.error, null);
        assert.deepStrictEqual(config.requestBodyObj.reasoning, { effort: 'high' });
    });

    test('Omits reasoning parameter when reasoning is optional and effort is disabled', () => {
        const config = resolveProvider({
            model: 'deepseek/deepseek-v4-flash',
            settings: {
                openrouterApiKey: 'sk-or-v1-test',
                openrouterModelDetails: {
                    'deepseek/deepseek-v4-flash': {
                        reasoning: { mandatory: false, supported_efforts: ['high', 'xhigh'], default_effort: 'high' },
                        reasoningEffort: 'disabled'
                    }
                }
            }
        });

        assert.strictEqual(config.error, null);
        assert.strictEqual(config.requestBodyObj.reasoning, undefined);
    });
});
