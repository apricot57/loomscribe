/**
 * Defines standardized test scenarios using LoomScribe's compiler and prompt building.
 */

const { compilePrompt } = require('../../engine/compiler');

/**
 * Builds standard LoomScribe chat completion payload for a given scenario.
 */
function buildScenarioPayload({ presetId = 'detective_noir', params = {}, directorNote = '', userPrompt = '' }) {
    const { systemPrompt, postHistory } = compilePrompt({
        presetId,
        params,
        directorNote
    });

    const messages = [];
    if (systemPrompt && systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    let finalUserContent = userPrompt.trim();
    if (postHistory && postHistory.trim()) {
        finalUserContent = `${finalUserContent}\n\n<system_note>\n${postHistory.trim()}\n</system_note>`;
    }

    messages.push({ role: 'user', content: finalUserContent });

    return {
        systemPrompt,
        postHistory,
        messages
    };
}

const SCENARIOS = {
    // --- Toggle Adherence Tests ---
    pov_third: {
        id: 'pov_third',
        name: 'POV: Strict Close Third Person',
        category: 'toggle',
        presetId: 'detective_noir',
        params: { pov: 'third', word_count: 500 },
        userPrompt: 'Detective Thomas stepped out of the precinct into the wet midnight mist, lighting a cigarette beneath the rusted fire escape.',
        evaluator: (text, h) => h.evaluatePOV(text, 'third')
    },

    pov_first: {
        id: 'pov_first',
        name: 'POV: Deep First Person',
        category: 'toggle',
        presetId: 'detective_noir',
        params: { pov: 'first', word_count: 500 },
        userPrompt: 'The phone in my desk drawer rang three times before I reached for it, knowing who was calling before I even touched the receiver.',
        evaluator: (text, h) => h.evaluatePOV(text, 'first')
    },

    suggest_choices: {
        id: 'suggest_choices',
        name: 'Toggle: Suggest Next Choices',
        category: 'toggle',
        presetId: 'detective_noir',
        params: { suggest_choices: true, word_count: 500 },
        userPrompt: 'The informant slumps against the steering wheel, slipping an envelope into my coat pocket before warning me that we are being watched.',
        evaluator: (text, h) => h.evaluateSuggestChoices(text)
    },

    premises_mode: {
        id: 'premises_mode',
        name: 'Mode: 6 Creative Premises & Scene Openers',
        category: 'toggle',
        presetId: 'detective_noir',
        params: { premises_mode: true },
        userPrompt: 'An disgraced private investigator discovers that a wealthy client\'s missing person case is tied to a corrupt municipal syndicate.',
        evaluator: (text, h) => h.evaluatePremisesMode(text)
    },

    outline_mode: {
        id: 'outline_mode',
        name: 'Mode: Outline & Brainstorming',
        category: 'toggle',
        presetId: 'detective_noir',
        params: { outline_mode: true, word_count: 500 },
        userPrompt: 'A disgraced palace bodyguard must escort a defiant noblewoman through hostile territory to save her family.',
        evaluator: (text, h) => h.evaluateOutlineMode(text)
    },

    complication_generator: {
        id: 'complication_generator',
        name: 'Toggle: Complication Generator',
        category: 'toggle',
        presetId: 'detective_noir',
        params: { complication_generator: true, word_count: 500 },
        userPrompt: 'They had retreated to the candlelit wine cellar, inches apart, seconds away from crossing a line they promised never to touch.',
        evaluator: (text, h) => h.evaluateComplication(text)
    },

    // --- Creative Fiction Quality & Style Benchmarks ---
    creative_tier1_romance: {
        id: 'creative_tier1_romance',
        name: 'Creative Tier 1: Slow Burn Romance',
        category: 'creative',
        presetId: 'slow_burn_romance',
        params: { pov: 'third', scene_intensity: 'tender', dialogue_style: 'playful', word_count: 500 },
        userPrompt: 'After months of distance, Clara and Thomas are caught in a summer downpour under the gazebo, breathless and soaked.',
        evaluator: (text, h) => h.evaluateCreativeStyle(text, 'romance')
    },

    creative_tier2_noir: {
        id: 'creative_tier2_noir',
        name: 'Creative Tier 2: Hardboiled Detective Fiction',
        category: 'creative',
        presetId: 'detective_noir',
        params: { pov: 'third', scene_intensity: 'charged', dialogue_style: 'candid', word_count: 500 },
        userPrompt: 'Nathan corners the ledger runner behind the abandoned meatpacking plant as the city harbor fog rolls in.',
        evaluator: (text, h) => h.evaluateCreativeStyle(text, 'noir')
    },

    creative_tier3_thriller: {
        id: 'creative_tier3_thriller',
        name: 'Creative Tier 3: Psychological Thriller',
        category: 'creative',
        presetId: 'psychological_thriller',
        params: { pov: 'third', scene_intensity: 'raw', dialogue_style: 'commanding', word_count: 500 },
        userPrompt: 'Sophia realizes that the guest in the adjoining study has been listening to every word spoken in the dining room.',
        evaluator: (text, h) => h.evaluateCreativeStyle(text, 'thriller')
    },

    creative_tier4_dystopia: {
        id: 'creative_tier4_dystopia',
        name: 'Creative Tier 4: Neon Dystopia Sci-Fi',
        category: 'creative',
        presetId: 'neon_dystopia',
        params: { pov: 'third', scene_intensity: 'charged', dialogue_style: 'silent', word_count: 500 },
        userPrompt: 'Kael hacks the sub-orbital transit gate while surveillance drones circle the lower industrial sector.',
        evaluator: (text, h) => h.evaluateCreativeStyle(text, 'dystopia')
    }
};

module.exports = {
    SCENARIOS,
    buildScenarioPayload
};
