/**
 * Test execution runner for evaluating OpenRouter models against LoomScribe scenarios.
 */

const fs = require('fs');
const path = require('path');
const { SCENARIOS, buildScenarioPayload } = require('./eval-scenarios');
const heuristics = require('./eval-heuristics');

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Fetches model metadata and pricing from OpenRouter.
 */
async function getModelInfo(modelId, apiKey) {
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (!res.ok) return null;
        const json = await res.json();
        const model = (json.data || []).find(m => m.id === modelId);
        if (!model) return null;
        return {
            id: model.id,
            name: model.name,
            promptCostPerMillion: parseFloat(model.pricing?.prompt || '0') * 1000000,
            completionCostPerMillion: parseFloat(model.pricing?.completion || '0') * 1000000,
            contextLength: model.context_length
        };
    } catch (e) {
        return null;
    }
}

/**
 * Executes a single scenario against OpenRouter with streaming.
 */
async function executeScenario({ scenarioKey, model, apiKey, temperature = 0.7, maxTokens = 2000, enableThinking = false, reasoningEffort = 'minimal' }) {
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) throw new Error(`Unknown scenario: ${scenarioKey}`);

    const payload = buildScenarioPayload(scenario);

    const startTime = Date.now();
    let ttftMs = 0;
    let fullText = '';
    let fullReasoning = '';
    let reasoningTokens = 0;
    let firstTokenLogged = false;

    const requestBody = {
        model,
        messages: payload.messages,
        temperature,
        stream: true,
        reasoning: { effort: reasoningEffort }
    };

    if (enableThinking) {
        requestBody.include_reasoning = true;
    }

    if (scenario.params?.premises_mode) {
        requestBody.max_tokens = Math.max(maxTokens, 2500);
    } else if (maxTokens) {
        requestBody.max_tokens = maxTokens;
    }

    const response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'LoomScribe-Eval'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        let errDetail = `HTTP ${response.status}`;
        try {
            const errJson = await response.json();
            if (errJson.error?.metadata?.raw) {
                errDetail = errJson.error.metadata.raw;
            } else if (errJson.error?.message) {
                errDetail = errJson.error.message;
            }
        } catch (e) {}
        return {
            scenarioKey,
            scenarioName: scenario.name,
            category: scenario.category,
            passed: false,
            score: 0,
            error: errDetail,
            reason: errDetail,
            text: '',
            fullReasoning: '',
            reasoningTokens: 0,
            durationMs: Date.now() - startTime
        };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;
    let reportedCost = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!firstTokenLogged) {
            firstTokenLogged = true;
            ttftMs = Date.now() - startTime;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') continue;

            try {
                const parsed = JSON.parse(dataStr);
                if (parsed.usage?.cost !== undefined) {
                    reportedCost = parsed.usage.cost;
                }
                if (parsed.usage?.completion_tokens_details?.reasoning_tokens) {
                    reasoningTokens = parsed.usage.completion_tokens_details.reasoning_tokens;
                }
                const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning;
                if (reasoningDelta) {
                    fullReasoning += reasoningDelta;
                }
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                    fullText += delta;
                    tokenCount++;
                }
            } catch (e) {}
        }
    }

    // Check for inline <think> tags in content if reasoning field was omitted
    if (!fullReasoning && fullText.includes('<think>')) {
        const match = fullText.match(/<think>([\s\S]*?)<\/think>/i);
        if (match) {
            fullReasoning = match[1].trim();
            fullText = fullText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
        }
    }

    const totalDurationMs = Date.now() - startTime;
    const genDurationMs = Math.max(1, totalDurationMs - ttftMs);
    const tokensPerSec = tokenCount > 0 ? parseFloat(((tokenCount / genDurationMs) * 1000).toFixed(1)) : 0;
    const wordCount = heuristics.countWords(fullText);

    // Run scenario-specific evaluator
    const evalResult = scenario.evaluator(fullText, heuristics);

    // Run general slop evaluation
    const slopResult = heuristics.evaluateSlop(fullText);

    return {
        scenarioKey,
        scenarioName: scenario.name,
        category: scenario.category,
        passed: evalResult.passed,
        score: evalResult.score,
        reason: evalResult.reason,
        evalResult,
        slopResult,
        wordCount,
        tokenCount,
        ttftMs,
        totalDurationMs,
        tokensPerSec,
        reportedCost,
        hasReasoning: !!fullReasoning || reasoningTokens > 0,
        fullReasoning,
        reasoningTokens: reasoningTokens || (fullReasoning ? heuristics.countWords(fullReasoning) : 0),
        enableThinking,
        text: fullText,
        systemPromptLength: payload.systemPrompt?.length || 0,
        postHistoryLength: payload.postHistory?.length || 0
    };
}

/**
 * Probes whether a model supports reasoning/thinking tokens.
 */
async function checkThinkingSupport({ model, apiKey }) {
    try {
        const res = await fetch(OPENROUTER_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'What is 15 * 14? Answer in one sentence.' }],
                include_reasoning: true,
                reasoning: { effort: 'medium' }
            })
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const msg = errJson.error?.message || '';
            if (msg.includes('Reasoning is mandatory')) {
                return {
                    status: 'MANDATORY',
                    supported: true,
                    reason: 'Model enforces mandatory thinking on all requests.'
                };
            }
            return {
                status: 'ERROR',
                supported: false,
                reason: msg || `HTTP ${res.status}`
            };
        }

        const data = await res.json();
        const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
        const hasField = !!data.choices?.[0]?.message?.reasoning;
        const text = data.choices?.[0]?.message?.content || '';
        const hasTag = text.includes('<think>');

        if (reasoningTokens > 0 || hasField || hasTag) {
            return {
                status: 'SUPPORTED',
                supported: true,
                reasoningTokens,
                reasoningSample: data.choices?.[0]?.message?.reasoning?.slice(0, 160) || (hasTag ? 'Inline <think> tags' : ''),
                reason: `Thinking supported (${reasoningTokens} reasoning tokens emitted).`
            };
        }

        return {
            status: 'UNSUPPORTED',
            supported: false,
            reason: 'Model does not emit reasoning/thinking tokens (standard autoregressive).'
        };
    } catch (e) {
        return {
            status: 'ERROR',
            supported: false,
            reason: e.message
        };
    }
}

/**
 * Runs a side-by-side Thinking vs Non-Thinking comparison on a scenario.
 */
async function runThinkingComparison({ model, apiKey, scenarioKey = 'suggest_choices' }) {
    const probe = await checkThinkingSupport({ model, apiKey });

    // Run with thinking enabled
    const withThinking = await executeScenario({
        scenarioKey,
        model,
        apiKey,
        enableThinking: true
    });

    // Run without thinking (if not mandatory)
    let withoutThinking = null;
    if (probe.status !== 'MANDATORY') {
        withoutThinking = await executeScenario({
            scenarioKey,
            model,
            apiKey,
            enableThinking: false
        });
    }

    return {
        model,
        scenarioKey,
        scenarioName: SCENARIOS[scenarioKey]?.name || scenarioKey,
        probe,
        withThinking,
        withoutThinking,
        timestamp: new Date().toISOString()
    };
}

/**
 * Runs a suite of scenarios against a model.
 */
async function runSuite({ model, apiKey, scenarioKeys, onProgress }) {
    const results = [];
    const modelInfo = await getModelInfo(model, apiKey);

    for (let i = 0; i < scenarioKeys.length; i++) {
        const key = scenarioKeys[i];
        if (typeof onProgress === 'function') {
            onProgress({ current: i + 1, total: scenarioKeys.length, scenarioKey: key, status: 'starting' });
        }

        try {
            const res = await executeScenario({ scenarioKey: key, model, apiKey });
            results.push(res);
            if (typeof onProgress === 'function') {
                onProgress({ current: i + 1, total: scenarioKeys.length, scenarioKey: key, status: 'done', result: res });
            }
        } catch (err) {
            const errResult = {
                scenarioKey: key,
                scenarioName: SCENARIOS[key]?.name || key,
                passed: false,
                score: 0,
                error: err.message,
                text: '',
                durationMs: 0
            };
            results.push(errResult);
            if (typeof onProgress === 'function') {
                onProgress({ current: i + 1, total: scenarioKeys.length, scenarioKey: key, status: 'error', result: errResult });
            }
        }
    }

    return {
        model,
        modelInfo,
        results,
        timestamp: new Date().toISOString()
    };
}

/**
 * Generates a clean Markdown Scorecard from test results.
 */
function generateMarkdownReport(suiteResult) {
    const { model, modelInfo, results, timestamp } = suiteResult;

    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const avgScore = Math.round(results.reduce((acc, r) => acc + (r.score || 0), 0) / (totalTests || 1));
    const avgTps = (results.reduce((acc, r) => acc + (r.tokensPerSec || 0), 0) / (totalTests || 1)).toFixed(1);
    const avgTtft = Math.round(results.reduce((acc, r) => acc + (r.ttftMs || 0), 0) / (totalTests || 1));

    let report = `# 🧪 LoomScribe Evaluation Scorecard: \`${model}\`\n\n`;
    report += `**Date:** ${timestamp}  \n`;
    if (modelInfo) {
        report += `**Pricing:** \$${modelInfo.promptCostPerMillion.toFixed(3)}/M input | \$${modelInfo.completionCostPerMillion.toFixed(3)}/M output  \n`;
    }
    report += `**Overall Pass Rate:** ${passedTests}/${totalTests} (${Math.round((passedTests / totalTests) * 100)}%)  \n`;
    report += `**Average Adherence Score:** ${avgScore}/100  \n`;
    report += `**Average Speed:** ${avgTps} tokens/sec (Avg TTFT: ${avgTtft}ms)  \n\n`;

    report += `## 📊 Test Results\n\n`;
    report += `| Test | Category | Status | Score | Speed | Slop Density | Key Verification Note |\n`;
    report += `|---|---|:---:|:---:|:---:|:---:|---|\n`;

    for (const r of results) {
        const badge = r.passed ? '✅ PASS' : (r.error ? '❌ ERROR' : '⚠️ FAIL');
        const score = r.score !== undefined ? `${r.score}/100` : '—';
        const speed = r.tokensPerSec ? `${r.tokensPerSec} tps` : '—';
        const slop = r.slopResult ? `${r.slopResult.slopDensity} (${r.slopResult.slopCount})` : '—';
        const note = r.error ? `**Error**: ${r.error}` : (r.reason || '');

        report += `| **${r.scenarioName}** | \`${r.category || 'toggle'}\` | ${badge} | ${score} | ${speed} | ${slop} | ${note} |\n`;
    }

    report += `\n---\n\n## 📝 Generated Output Excerpts\n\n`;

    for (const r of results) {
        report += `### ${r.scenarioName} (${r.passed ? 'PASSED' : 'FAILED'})\n`;
        if (r.text) {
            report += `> **Words:** ${r.wordCount} | **TTFT:** ${r.ttftMs}ms | **Speed:** ${r.tokensPerSec} tps  \n\n`;
            report += '```markdown\n' + r.text.trim() + '\n```\n\n';
        } else if (r.error) {
            report += `> ⚠️ **Execution Failed:** ${r.error}\n\n`;
        }
    }

    return report;
}

module.exports = {
    executeScenario,
    runSuite,
    generateMarkdownReport,
    getModelInfo,
    checkThinkingSupport,
    runThinkingComparison
};
