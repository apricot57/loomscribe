const fs = require('fs');
const path = require('path');
const { SCENARIOS, buildScenarioPayload } = require('./eval/eval-scenarios');
const heuristics = require('./eval/eval-heuristics');
const { getModelInfo, checkThinkingSupport, executeScenario, generateMarkdownReport } = require('./eval/eval-runner');

const dbPath = path.join(__dirname, '../data/db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
const apiKey = db.settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY;

if (!apiKey) {
    console.error('No API Key found!');
    process.exit(1);
}

const TARGET_MODELS = [
    'google/gemma-4-26b-a4b-it',
    'google/gemma-4-31b-it',
    'mistralai/mistral-small-2603'
];

async function evaluateModel(modelId) {
    console.log(`\n======================================================`);
    console.log(`🔍 EVALUATING: ${modelId}`);
    console.log(`======================================================`);

    const info = await getModelInfo(modelId, apiKey);
    if (info) {
        console.log(`💰 Pricing: $${info.promptCostPerMillion.toFixed(3)}/M in, $${info.completionCostPerMillion.toFixed(3)}/M out | Context: ${info.contextLength}`);
    }

    // 1. Probe reasoning
    console.log(`🧠 Probing reasoning support...`);
    const thinkingProbe = await checkThinkingSupport({ model: modelId, apiKey });
    console.log(`   Status: ${thinkingProbe.status} (${thinkingProbe.reason})`);
    if (thinkingProbe.reasoningSample) {
        console.log(`   Sample: "${thinkingProbe.reasoningSample.slice(0, 100)}..."`);
    }

    // 2. Run Scenarios: suggest_choices, creative_tier2_noir, pov_third
    const scenariosToRun = ['suggest_choices', 'creative_tier2_noir', 'pov_third'];
    const results = [];

    for (const sKey of scenariosToRun) {
        process.stdout.write(`⚡ Running ${sKey} ... `);
        try {
            const res = await executeScenario({
                scenarioKey: sKey,
                model: modelId,
                apiKey,
                enableThinking: thinkingProbe.status === 'SUPPORTED'
            });

            if (res.error) {
                console.log(`❌ ERROR: ${res.error}`);
                results.push({ scenarioKey: sKey, passed: false, error: res.error, text: '' });
            } else {
                console.log(`✅ ${res.passed ? 'PASSED' : 'FAILED'} (${res.tokensPerSec} tps, TTFT: ${res.ttftMs}ms, Words: ${res.wordCount})`);
                if (sKey === 'creative_tier2_noir') {
                    console.log(`   Style Compliance: ${res.evalResult?.status || 'OK'}`);
                }
                if (res.evalResult?.reason) {
                    console.log(`   Note: ${res.evalResult.reason}`);
                }
                results.push(res);
            }
        } catch (err) {
            console.log(`❌ EXCEPTION: ${err.message}`);
            results.push({ scenarioKey: sKey, passed: false, error: err.message, text: '' });
        }
    }

    // Write individual markdown report
    const reportsDir = path.join(__dirname, '../data/eval-reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const safeModel = modelId.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `eval_${safeModel}_${Date.now()}.md`;
    try {
        const reportMd = generateMarkdownReport({
            model: modelId,
            modelInfo: info,
            results,
            timestamp: new Date().toISOString()
        });
        fs.writeFileSync(path.join(reportsDir, filename), reportMd);
        console.log(`📄 Wrote report to data/eval-reports/${filename}`);
    } catch (e) {
        console.error('Failed to write report:', e.message);
    }

    return {
        modelId,
        info,
        thinkingProbe,
        results
    };
}

async function runAll() {
    const allSummary = [];
    for (const m of TARGET_MODELS) {
        const res = await evaluateModel(m);
        allSummary.push(res);
    }

    const outputPath = path.join(__dirname, '../data/MODEL_TESTING_BATCH3.json');
    fs.writeFileSync(outputPath, JSON.stringify(allSummary, null, 2));
    console.log(`\n\n🎉 Completed all evaluations. Saved detailed results to ${outputPath}`);
}

runAll().catch(console.error);
