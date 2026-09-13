/**
 * Resolves upstream AI provider, validates API credentials,
 * normalizes endpoint URLs, and prepares the request body configuration.
 */

function resolveProvider({
    model,
    messages = [],
    temperature,
    thinking,
    settings = {}
}) {
    const customModelConfig = (settings.customModels || []).find(m => m.id === model);
    const deepseekApiKey = settings.apiKey || settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    const openaiApiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
    const glmApiKey = settings.glmApiKey || process.env.GLM_API_KEY || process.env.ZAI_API_KEY;
    const openrouterApiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;

    const isOpenAI = !customModelConfig && (
        (settings.openaiModels || []).some(m => (typeof m === 'string' ? m : m.id) === model) ||
        (settings.pinnedOpenAIModels || []).includes(model) ||
        /^gpt-|^o[1-9]|^chatgpt-/i.test(model)
    );

    const isGlm = !customModelConfig && !isOpenAI && (
        (settings.glmModels || []).some(m => (typeof m === 'string' ? m : m.id) === model) ||
        (settings.pinnedGlmModels || []).includes(model) ||
        /^glm-/i.test(model)
    );

    const isOpenRouter = !customModelConfig && !isOpenAI && !isGlm && (
        (settings.pinnedOpenRouterModels || []).includes(model) ||
        /^[a-z0-9][a-z0-9._-]*\/[a-z0-9._:-]+$/i.test(model)
    );

    // Validate missing API keys with exact error messages expected by tests
    if (customModelConfig) {
        // Handled via custom endpoint
    } else if (isOpenAI) {
        if (!openaiApiKey) {
            return {
                apiModel: model,
                apiEndpoint: null,
                apiAuthKey: null,
                isCustomEndpoint: false,
                isGlmEndpoint: false,
                requestBodyObj: null,
                error: "OpenAI API Key is missing on the server. Please configure it in Settings."
            };
        }
    } else if (isGlm) {
        if (!glmApiKey) {
            return {
                apiModel: model,
                apiEndpoint: null,
                apiAuthKey: null,
                isCustomEndpoint: false,
                isGlmEndpoint: false,
                requestBodyObj: null,
                error: "GLM API Key is missing on the server. Please configure it in Settings."
            };
        }
    } else if (isOpenRouter) {
        if (!openrouterApiKey) {
            return {
                apiModel: model,
                apiEndpoint: null,
                apiAuthKey: null,
                isCustomEndpoint: false,
                isGlmEndpoint: false,
                requestBodyObj: null,
                error: "OpenRouter API Key is missing on the server. Please configure it in Settings."
            };
        }
    } else {
        if (!deepseekApiKey) {
            return {
                apiModel: model || 'deepseek-chat',
                apiEndpoint: null,
                apiAuthKey: null,
                isCustomEndpoint: false,
                isGlmEndpoint: false,
                requestBodyObj: null,
                error: "API Key is missing on the server. Please configure it in Settings."
            };
        }
    }

    let apiModel = model || 'deepseek-chat';
    let apiEndpoint = 'https://api.deepseek.com/chat/completions';
    let apiAuthKey = deepseekApiKey;
    let isCustomEndpoint = false;
    let isGlmEndpoint = false;

    // Check if the selected model matches a custom model configuration
    if (customModelConfig) {
        apiModel = customModelConfig.model;
        apiEndpoint = customModelConfig.endpoint;
        apiAuthKey = customModelConfig.apiKey;
        isCustomEndpoint = true;
    } else if (isOpenAI) {
        apiModel = model;
        apiEndpoint = 'https://api.openai.com/v1/chat/completions';
        apiAuthKey = openaiApiKey;
        isCustomEndpoint = true;
    } else if (isGlm) {
        apiModel = model;
        apiEndpoint = 'https://api.z.ai/api/paas/v4/chat/completions';
        apiAuthKey = glmApiKey;
        isGlmEndpoint = true;
    } else if (isOpenRouter) {
        apiModel = model;
        apiEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
        apiAuthKey = openrouterApiKey;
        isCustomEndpoint = true;
    }

    const isZaiCustom = customModelConfig && (
        (customModelConfig.endpoint && customModelConfig.endpoint.toLowerCase().includes('z.ai')) ||
        (customModelConfig.model && customModelConfig.model.toLowerCase().startsWith('glm'))
    );

    // Normalize endpoint url to ensure pathname ends with chat/completions while preserving query strings
    try {
        const targetUrl = new URL(apiEndpoint);
        if (!targetUrl.pathname.endsWith('/chat/completions') && !targetUrl.pathname.endsWith('/chat/completions/')) {
            const cleanedPath = targetUrl.pathname.endsWith('/') ? targetUrl.pathname.slice(0, -1) : targetUrl.pathname;
            targetUrl.pathname = `${cleanedPath}/chat/completions`;
        }
        apiEndpoint = targetUrl.toString();
    } catch (urlErr) {
        return {
            apiModel,
            apiEndpoint,
            apiAuthKey,
            isCustomEndpoint,
            isGlmEndpoint,
            requestBodyObj: null,
            error: `Invalid API endpoint configured: ${apiEndpoint}`
        };
    }

    const requestBodyObj = {
        model: apiModel,
        messages,
        stream: true
    };
    if (isOpenAI || isOpenRouter) {
        requestBodyObj.stream_options = { include_usage: true };
    }
    // OpenAI o-series models (o1, o3, o4-*, chatgpt-*) only accept the default
    // temperature and respond 400 to anything else — omit the field entirely.
    if (!/^o[1-9]|^chatgpt-/i.test(apiModel)) {
        requestBodyObj.temperature = temperature !== undefined ? temperature : 0.7;
    }

    const isGlmModel = isGlm || isGlmEndpoint || isZaiCustom || /^glm-/i.test(apiModel);
    const isGlmAlwaysThinking = /^glm-5\.3-flash/i.test(apiModel);

    // Reasoning / Thinking level handling (low, medium, high, max, disabled)
    const rawLevel = typeof thinking === 'string'
        ? thinking
        : (thinking?.type || (isGlmModel ? (settings.glmThinkingMode || 'low') : (settings.thinkingMode || 'disabled')));
    const thinkingLevel = (rawLevel || (isGlmModel ? 'low' : 'disabled')).toLowerCase();

    if (isOpenAI) {
        if (/^o[1-9]|^chatgpt-/i.test(apiModel)) {
            if (thinkingLevel !== 'disabled') {
                requestBodyObj.reasoning_effort = thinkingLevel === 'medium' ? 'medium' : (thinkingLevel === 'high' || thinkingLevel === 'max' ? 'high' : 'low');
            }
        }
    } else if (isOpenRouter) {
        const details = settings.openrouterModelDetails?.[apiModel];
        const modelReasoning = details?.reasoning;
        const selectedEffort = details?.reasoningEffort;

        if (selectedEffort && selectedEffort !== 'disabled') {
            if (selectedEffort === 'default' || selectedEffort === 'enabled') {
                if (modelReasoning?.default_effort) {
                    requestBodyObj.reasoning = { effort: modelReasoning.default_effort };
                } else {
                    requestBodyObj.reasoning = {};
                }
            } else {
                requestBodyObj.reasoning = { effort: selectedEffort };
            }
        } else if (selectedEffort === 'disabled') {
            if (modelReasoning?.mandatory) {
                requestBodyObj.reasoning = { effort: modelReasoning.default_effort || 'minimal' };
            }
        } else if (modelReasoning) {
            if (modelReasoning.mandatory) {
                requestBodyObj.reasoning = { effort: modelReasoning.default_effort || 'minimal' };
            } else if (thinkingLevel && thinkingLevel !== 'disabled') {
                const effort = (thinkingLevel === 'enabled' || thinkingLevel === 'default') ? (modelReasoning.default_effort || 'low') : thinkingLevel;
                requestBodyObj.reasoning = effort ? { effort } : {};
            }
        }

        if (requestBodyObj.reasoning && Object.keys(requestBodyObj.reasoning).length >= 0) {
            requestBodyObj.include_reasoning = true;
        }
    } else if (!isCustomEndpoint || isGlmEndpoint || isZaiCustom) {
        if (isGlmModel) {
            if (thinkingLevel === 'disabled' && !isGlmAlwaysThinking) {
                requestBodyObj.thinking = { type: 'disabled' };
            } else {
                const effort = thinkingLevel === 'medium' ? 'medium' : (thinkingLevel === 'high' ? 'high' : (thinkingLevel === 'max' ? 'max' : 'low'));
                requestBodyObj.reasoning_effort = effort;
                requestBodyObj.thinking = { type: 'enabled', clear_thinking: false };
            }
        } else {
            // DeepSeek
            requestBodyObj.thinking = { type: thinkingLevel === 'enabled' ? 'enabled' : 'disabled' };
        }
    }

    return {
        apiModel,
        apiEndpoint,
        apiAuthKey,
        isCustomEndpoint,
        isGlmEndpoint,
        requestBodyObj,
        error: null
    };
}

module.exports = {
    resolveProvider
};
