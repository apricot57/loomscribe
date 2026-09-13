#!/usr/bin/env node

/**
 * CLI Tool: Evaluate models on OpenRouter for LoomScribe toggle adherence,
 * prose quality, AI slop density, and creative writing fidelity.
 * 
 * Usage:
 *   node scripts/eval-models.js --model poolside/laguna-s-2.1:free --quick
 *   node scripts/eval-models.js --model meta-llama/llama-3.3-70b-instruct --creative
 *   node scripts/eval-models.js --model anthropic/claude-3.5-sonnet --all
 */

const fs = require('fs');
const path = require('path');
const { SCENARIOS } = require('./eval/eval-scenarios');
const { runSuite, generateMarkdownReport, getModelInfo } = require('./eval/eval-runner');

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

// Load API key from CLI flag, db.json settings, or env
let apiKey = getArg('--key');
if (!apiKey) {
    try {
        const dbPath = path.join(__dirname, '../data/db.json');
        if (fs.existsSync(dbPath)) {
            const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
            apiKey = db.settings?.openrouterApiKey;
        }
    } catch (e) {}
}
if (!apiKey) {
    apiKey = process.env.OPENROUTER_API_KEY;
}

if (!apiKey) {
    console.error('\x1b[31m[ERROR] No OpenRouter API key provided. Set OPENROUTER_API_KEY env or use --key <api-key>\x1b[0m');
    process.exit(1);
}

const model = getArg('--model', 'poolside/laguna-s-2.1:free');

// Determine scenarios to run
let scenarioKeys = [];
const specificTest = getArg('--test');

if (specificTest) {
    if (!SCENARIOS[specificTest]) {
        console.error(`\x1b[31m[ERROR] Unknown test '${specificTest}'. Available tests:\x1b[0m`, Object.keys(SCENARIOS).join(', '));
        process.exit(1);
    }
    scenarioKeys = [specificTest];
} else if (hasFlag('--creative') || hasFlag('--style')) {
    scenarioKeys = ['creative_tier1_romance', 'creative_tier2_noir', 'creative_tier3_thriller', 'creative_tier4_dystopia'];
} else if (hasFlag('--toggles')) {
    scenarioKeys = ['pov_third', 'pov_first', 'suggest_choices', 'premises_mode', 'outline_mode', 'complication_generator'];
} else if (hasFlag('--all')) {
    scenarioKeys = Object.keys(SCENARIOS);
} else {
    // Default to --quick
    scenarioKeys = ['pov_third', 'suggest_choices', 'creative_tier2_noir'];
}

async function main() {
    console.log('\n\x1b[1m\x1b[36m====================================================\x1b[0m');
    console.log(`\x1b[1m\x1b[36m   🌌 LoomScribe OpenRouter Model Evaluation   \x1b[0m`);
    console.log('\x1b[1m\x1b[36m====================================================\x1b[0m');
    console.log(`\x1b[33mModel:\x1b[0m \x1b[1m${model}\x1b[0m`);
    console.log(`\x1b[33mTests queued:\x1b[0m ${scenarioKeys.length} (${scenarioKeys.join(', ')})`);

    const modelInfo = await getModelInfo(model, apiKey);
    if (modelInfo) {
        console.log(`\x1b[33mPricing:\x1b[0m \$${modelInfo.promptCostPerMillion.toFixed(3)}/M in, \$${modelInfo.completionCostPerMillion.toFixed(3)}/M out`);
    }
    console.log('----------------------------------------------------\n');

    // Handle Thinking vs Non-Thinking Comparison Mode
    if (hasFlag('--thinking')) {
        const testTarget = specificTest || 'suggest_choices';
        console.log(`\x1b[35m[Thinking Mode Evaluation]\x1b[0m Probing reasoning support for \x1b[1m${model}\x1b[0m ...`);
        
        const { checkThinkingSupport, runThinkingComparison } = require('./eval/eval-runner');
        const probe = await checkThinkingSupport({ model, apiKey });
        
        console.log(`\x1b[33mSupport Status:\x1b[0m \x1b[1m${probe.status}\x1b[0m (${probe.reason})`);
        if (probe.reasoningSample) {
            console.log(`\x1b[90m↳ Sample thoughts: "${probe.reasoningSample}..."\x1b[0m`);
        }
        
        console.log(`\nRunning A/B Comparison on scenario: \x1b[1m${SCENARIOS[testTarget]?.name || testTarget}\x1b[0m ...`);
        
        process.stdout.write(`[\x1b[33m1/2\x1b[0m] Generating \x1b[1mWITH Thinking\x1b[0m ... `);
        const comp = await runThinkingComparison({ model, apiKey, scenarioKey: testTarget });
        if (comp.withThinking.passed) {
            console.log(`\x1b[32m✔ PASS\x1b[0m (${comp.withThinking.score}/100) [${comp.withThinking.tokensPerSec} tps, TTFT: ${comp.withThinking.ttftMs}ms, Reasoning Tokens: ${comp.withThinking.reasoningTokens}]`);
        } else {
            console.log(`\x1b[31m✖ FAIL/ERR\x1b[0m (${comp.withThinking.error || comp.withThinking.reason})`);
        }
        
        if (comp.withoutThinking) {
            process.stdout.write(`[\x1b[33m2/2\x1b[0m] Generating \x1b[1mWITHOUT Thinking\x1b[0m ... `);
            if (comp.withoutThinking.passed) {
                console.log(`\x1b[32m✔ PASS\x1b[0m (${comp.withoutThinking.score}/100) [${comp.withoutThinking.tokensPerSec} tps, TTFT: ${comp.withoutThinking.ttftMs}ms]`);
            } else {
                console.log(`\x1b[31m✖ FAIL/ERR\x1b[0m (${comp.withoutThinking.error || comp.withoutThinking.reason})`);
            }
        } else {
            console.log(`\x1b[90m↳ Standard run skipped (model enforces mandatory reasoning).\x1b[0m`);
        }

        console.log('\n----------------------------------------------------');
        console.log('\x1b[1m📊 Thinking vs Non-Thinking Comparison Table:\x1b[0m');
        console.table([
            {
                Mode: 'With Thinking',
                Passed: comp.withThinking.passed ? 'Yes' : 'No',
                Score: comp.withThinking.score,
                TTFT: `${comp.withThinking.ttftMs}ms`,
                Speed: `${comp.withThinking.tokensPerSec} tps`,
                'Reasoning Tokens': comp.withThinking.reasoningTokens || 0,
                Words: comp.withThinking.wordCount,
                'Slop Density': comp.withThinking.slopResult?.slopDensity || 0
            },
            ...(comp.withoutThinking ? [{
                Mode: 'Without Thinking',
                Passed: comp.withoutThinking.passed ? 'Yes' : 'No',
                Score: comp.withoutThinking.score,
                TTFT: `${comp.withoutThinking.ttftMs}ms`,
                Speed: `${comp.withoutThinking.tokensPerSec} tps`,
                'Reasoning Tokens': 0,
                Words: comp.withoutThinking.wordCount,
                'Slop Density': comp.withoutThinking.slopResult?.slopDensity || 0
            }] : [])
        ]);

        if (comp.withThinking.fullReasoning) {
            console.log('\n\x1b[35m🧠 Thinking Transcript Excerpt:\x1b[0m');
            console.log('\x1b[90m' + comp.withThinking.fullReasoning.slice(0, 400).trim() + '...\x1b[0m');
        }

        // Save comparison report
        const reportDir = path.join(__dirname, '../data/eval-reports');
        if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
        const safeModelName = model.replace(/[^a-zA-Z0-9_-]/g, '_');
        const reportFile = path.join(reportDir, `eval_thinking_${safeModelName}_${Date.now()}.md`);
        
        let reportMd = `# 🧠 LoomScribe Thinking Evaluation: \`${model}\`\n\n`;
        reportMd += `**Date:** ${comp.timestamp}  \n`;
        reportMd += `**Support Status:** \`${comp.probe.status}\` (${comp.probe.reason})  \n`;
        reportMd += `**Tested Scenario:** \`${comp.scenarioName}\`  \n\n`;
        reportMd += `## 📊 Comparison Summary\n\n`;
        reportMd += `| Metric | With Thinking | Without Thinking | Delta / Overhead |\n`;
        reportMd += `|---|---|---|---|\n`;
        reportMd += `| **Latency (TTFT)** | ${comp.withThinking.ttftMs}ms | ${comp.withoutThinking ? comp.withoutThinking.ttftMs + 'ms' : 'N/A'} | ${comp.withoutThinking ? (comp.withThinking.ttftMs - comp.withoutThinking.ttftMs) + 'ms' : '—'} |\n`;
        reportMd += `| **Speed (tps)** | ${comp.withThinking.tokensPerSec} tps | ${comp.withoutThinking ? comp.withoutThinking.tokensPerSec + ' tps' : 'N/A'} | — |\n`;
        reportMd += `| **Reasoning Tokens** | ${comp.withThinking.reasoningTokens} tokens | 0 tokens | +${comp.withThinking.reasoningTokens} tokens |\n`;
        reportMd += `| **Adherence Score** | ${comp.withThinking.score}/100 | ${comp.withoutThinking ? comp.withoutThinking.score + '/100' : 'N/A'} | — |\n`;
        reportMd += `| **Output Word Count** | ${comp.withThinking.wordCount} words | ${comp.withoutThinking ? comp.withoutThinking.wordCount + ' words' : 'N/A'} | — |\n\n`;
        
        if (comp.withThinking.fullReasoning) {
            reportMd += `### 🧠 Model Internal Reasoning (Chain of Thought)\n\n`;
            reportMd += `\`\`\`text\n${comp.withThinking.fullReasoning.trim()}\n\`\`\`\n\n`;
        }

        reportMd += `### 📝 Output With Thinking\n\n`;
        reportMd += `\`\`\`markdown\n${comp.withThinking.text.trim()}\n\`\`\`\n\n`;

        if (comp.withoutThinking) {
            reportMd += `### 📝 Output Without Thinking\n\n`;
            reportMd += `\`\`\`markdown\n${comp.withoutThinking.text.trim()}\n\`\`\`\n\n`;
        }

        fs.writeFileSync(reportFile, reportMd);
        console.log(`\n\x1b[32mThinking comparison report saved to:\x1b[0m ${reportFile}\n`);
        return;
    }

    const suiteResult = await runSuite({
        model,
        apiKey,
        scenarioKeys,
        onProgress: ({ current, total, scenarioKey, status, result }) => {
            if (status === 'starting') {
                process.stdout.write(`[\x1b[33m${current}/${total}\x1b[0m] Running \x1b[1m${SCENARIOS[scenarioKey].name}\x1b[0m ... `);
            } else if (status === 'done') {
                if (result.passed) {
                    process.stdout.write(`\x1b[32m✔ PASS\x1b[0m (${result.score}/100) \x1b[90m[${result.tokensPerSec} tps, ${result.ttftMs}ms]\x1b[0m\n`);
                } else {
                    process.stdout.write(`\x1b[31m✖ FAIL\x1b[0m (${result.score}/100) \x1b[90m[${result.tokensPerSec} tps]\x1b[0m\n`);
                }
                if (result.reason) {
                    console.log(`   \x1b[90m↳ ${result.reason}\x1b[0m`);
                }
                if (result.slopResult?.slopCount > 0) {
                    console.log(`   \x1b[33m↳ Cliché warnings:\x1b[0m ${result.slopResult.matches.join(', ')} (${result.slopResult.slopDensity}/500w)`);
                }
            } else if (status === 'error') {
                process.stdout.write(`\x1b[31m✖ ERROR\x1b[0m: ${result.error}\n`);
            }
        }
    });

    console.log('\n----------------------------------------------------');
    const totalPassed = suiteResult.results.filter(r => r.passed).length;
    const totalTests = suiteResult.results.length;
    const avgScore = Math.round(suiteResult.results.reduce((acc, r) => acc + (r.score || 0), 0) / (totalTests || 1));
    const avgTps = (suiteResult.results.reduce((acc, r) => acc + (r.tokensPerSec || 0), 0) / (totalTests || 1)).toFixed(1);

    console.log(`\x1b[1mSummary:\x1b[0m ${totalPassed}/${totalTests} Passed | Avg Score: ${avgScore}/100 | Speed: ${avgTps} tps`);

    // Save report
    const reportDir = path.join(__dirname, '../data/eval-reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const safeModelName = model.replace(/[^a-zA-Z0-9_-]/g, '_');
    const reportFile = path.join(reportDir, `eval_${safeModelName}_${Date.now()}.md`);
    const markdown = generateMarkdownReport(suiteResult);
    fs.writeFileSync(reportFile, markdown);

    console.log(`\x1b[32mScorecard saved to:\x1b[0m ${reportFile}\n`);
}

main().catch(err => {
    console.error('\x1b[31mFatal error:\x1b[0m', err);
    process.exit(1);
});
