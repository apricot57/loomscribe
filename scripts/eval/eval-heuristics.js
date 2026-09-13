/**
 * Evaluation heuristics for LoomScribe model outputs.
 * Scores toggle adherence, layout constraints, creative quality, refusal detection, and AI slop.
 */

// Common AI creative writing clichés / slop patterns
const CLICHE_PATTERNS = [
    /\btestament to\b/i,
    /\bshiver ran down\b/i,
    /\bdance of shadows\b/i,
    /\bair crackled with\b/i,
    /\bcouldn't help but\b/i,
    /\bpalpable\b/i,
    /\btapestry of\b/i,
    /\bsymphony of\b/i,
    /\bbarely a whisper\b/i,
    /\btime seemed to stand still\b/i,
    /\belectric charge\b/i,
    /\bevery fiber of (?:his|her|their) being\b/i,
    /\bsent shivers\b/i,
    /\bheaved with\b/i,
    /\blabored breath\b/i,
    /\bpiercing gaze\b/i,
    /\bmuse on\b/i,
    /\buncharted waters\b/i,
    /\bheart hammering\b/i,
    /\bgilded cage\b/i
];

// Refusal / lecturing patterns
const REFUSAL_PATTERNS = [
    /I cannot fulfill this request/i,
    /I am unable to (?:fulfill|generate|comply|write)/i,
    /I cannot (?:generate|write|produce|create) (?:inappropriate|harmful)/i,
    /against my (?:safety|content|ethical) (?:guidelines|policies|policy)/i,
    /As an AI (?:language model|assistant)/i,
    /I must decline/i,
    /I apologize, but I cannot/i,
    /I cannot assist with/i,
    /It is important to remember/i
];

/**
 * Strips quoted dialogue to analyze pure narrative prose for POV and tone.
 */
function stripDialogue(text) {
    if (!text) return '';
    return text
        .replace(/"[^"]*"/g, ' ')
        .replace(/“[^”]*”/g, ' ')
        .replace(/‘[^’]*’/g, ' ')
        .replace(/\n\s*[-—]\s*[^—\n]+(?:\n|$)/g, ' '); // em-dash or dash-led dialogue lines
}

/**
 * Counts words accurately in text.
 */
function countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    return tokens.length;
}

/**
 * Evaluates POV compliance (Close Third vs Deep First).
 */
function evaluatePOV(text, expectedPOV) {
    if (!text) return { passed: false, score: 0, reason: 'Empty text', details: {} };

    const narration = stripDialogue(text);

    if (expectedPOV === 'third') {
        // Strict Third Person: narrative should contain ZERO 1st-person pronouns outside dialogue
        const firstPersonMatches = narration.match(/\b(I|me|my|mine|we|us|our|ours)\b/gi) || [];
        const thirdPersonMatches = narration.match(/\b(he|him|his|she|her|hers|they|them|their|theirs)\b/gi) || [];

        const leaks = firstPersonMatches.length;
        const thirdCount = thirdPersonMatches.length;

        if (thirdCount === 0 && leaks === 0) {
            return { passed: false, score: 30, reason: 'No clear third-person pronouns found in narrative.', details: { leaks, thirdCount } };
        }

        if (leaks > 0) {
            const score = Math.max(0, Math.round(100 - (leaks * 25)));
            return {
                passed: leaks <= 1,
                score,
                reason: `Found ${leaks} first-person pronoun leak(s) in narrative prose (${firstPersonMatches.slice(0, 5).join(', ')}).`,
                details: { leaks, firstPersonMatches, thirdCount }
            };
        }

        return {
            passed: true,
            score: 100,
            reason: `Strict Close Third Person respected (0 narrative 1st-person leaks, ${thirdCount} 3rd-person pronouns).`,
            details: { leaks: 0, thirdCount }
        };
    } else if (expectedPOV === 'first') {
        const firstPersonMatches = narration.match(/\b(I|me|my|mine|we|us|our|ours)\b/gi) || [];
        const count = firstPersonMatches.length;

        if (count < 3) {
            return { passed: false, score: 40, reason: `Too few first-person pronouns in narration (${count}).`, details: { count } };
        }

        return {
            passed: true,
            score: 100,
            reason: `Consistent Deep First Person maintained (${count} 1st-person pronouns).`,
            details: { count }
        };
    }

    return { passed: true, score: 100, reason: 'No strict POV evaluation defined for mode.', details: {} };
}

/**
 * Evaluates Suggest Choices formatting:
 * - Must end with horizontal rule / divider (---)
 * - Must list exactly 3 numbered options (1., 2., 3.)
 */
function evaluateSuggestChoices(text) {
    if (!text) return { passed: false, score: 0, reason: 'Empty text' };

    // Check for divider
    const hasDivider = /---|\*{3,}|_{3,}/.test(text);

    // Look for numbered options (e.g. 1. ... 2. ... 3. ...)
    const numberedMatches = text.match(/(?:^|\n)\s*(?:\d+\.|\(\d+\)|\[\d+\])\s+[^\n]+/g) || [];
    const optionCount = numberedMatches.length;

    let score = 0;
    if (hasDivider) score += 40;
    if (optionCount === 3) score += 60;
    else if (optionCount > 0) score += Math.max(0, 40 - Math.abs(3 - optionCount) * 15);

    const passed = hasDivider && optionCount === 3;
    let reason = '';
    if (passed) {
        reason = 'Divider and exactly 3 continuation choices present.';
    } else if (!hasDivider && optionCount === 3) {
        reason = 'Exactly 3 choices present, but missing standard divider (---).';
    } else if (hasDivider && optionCount !== 3) {
        reason = `Divider present, but found ${optionCount} choices instead of 3.`;
    } else {
        reason = `No divider and found ${optionCount} choices instead of 3.`;
    }

    return {
        passed,
        score,
        reason,
        details: { hasDivider, optionCount, choices: numberedMatches }
    };
}

/**
 * Evaluates Premises Mode:
 * - Starts with ## Polished Concept
 * - Exactly 6 premises (### Premise 1 through 6)
 * - Each premise includes Scene Opener
 * - No conversational filler
 */
function evaluatePremisesMode(text) {
    if (!text) return { passed: false, score: 0, reason: 'Empty text' };

    const hasPolishedConcept = /##?\s*Polished Concept/i.test(text);

    // Count premises
    const premiseMatches = text.match(/###?\s*Premise\s*\d+/gi) || [];
    const premiseCount = premiseMatches.length;

    // Check for Scene Openers
    const openerMatches = text.match(/\*{0,2}Scene Opener\*{0,2}:?/gi) || [];
    const openerCount = openerMatches.length;

    // Check for conversational preamble
    const hasPreamble = /^(?:Sure|Certainly|Here are|Below are|As requested)/i.test(text.trim());

    let score = 0;
    if (hasPolishedConcept) score += 20;
    if (premiseCount === 6) score += 50;
    else if (premiseCount > 0) score += Math.max(0, 30 - Math.abs(6 - premiseCount) * 10);

    if (openerCount >= 6) score += 30;
    else if (openerCount > 0) score += Math.round((openerCount / 6) * 30);

    if (hasPreamble) score = Math.max(0, score - 20);

    const passed = premiseCount === 6 && openerCount >= 6 && !hasPreamble;

    return {
        passed,
        score,
        reason: `Generated ${premiseCount}/6 premises with ${openerCount}/6 Scene Openers.${hasPreamble ? ' Conversational preamble detected.' : ''}`,
        details: {
            hasPolishedConcept,
            premiseCount,
            openerCount,
            hasPreamble
        }
    };
}

/**
 * Evaluates Outline Mode:
 * - Description rather than quoted dialogue (< 15% dialogue ratio)
 * - Flowing structure with narrative beats
 */
function evaluateOutlineMode(text) {
    if (!text) return { passed: false, score: 0, reason: 'Empty text' };

    const wordCount = countWords(text);
    const narration = stripDialogue(text);
    const narrationWordCount = countWords(narration);

    const dialogueWords = Math.max(0, wordCount - narrationWordCount);
    const dialoguePct = wordCount > 0 ? (dialogueWords / wordCount) * 100 : 0;

    const dialoguePassed = dialoguePct <= 15;
    const lengthPassed = wordCount >= 250;

    let score = 100;
    if (!dialoguePassed) score -= Math.min(50, Math.round((dialoguePct - 15) * 2));
    if (!lengthPassed) score -= 30;

    return {
        passed: dialoguePassed && lengthPassed,
        score: Math.max(0, score),
        reason: `Outline mode dialogue ratio: ${dialoguePct.toFixed(1)}% (target < 15%). Total words: ${wordCount}.`,
        details: { wordCount, dialogueWords, dialoguePct }
    };
}

/**
 * Evaluates Complication Generator:
 * - Checks for narrative friction / hesitation / interruption keywords
 */
function evaluateComplication(text) {
    if (!text) return { passed: false, score: 0, reason: 'Empty text' };

    const complicationKeywords = [
        /\b(?:hesitat|pause|stop|freeze|interrupt|knock|sound|creak|footstep|shadow|voice)\b/i,
        /\b(?:guilt|doubt|dread|fear|shame|realiz|remember|consequence)\b/i,
        /\b(?:sudden|abrupt|unexpected|caught|intervene|distance|pull back)\b/i
    ];

    let matches = 0;
    for (const pat of complicationKeywords) {
        if (pat.test(text)) matches++;
    }

    const passed = matches >= 2;
    const score = Math.min(100, matches * 40);

    return {
        passed,
        score,
        reason: `Found ${matches} complication/friction markers in prose.`,
        details: { matches }
    };
}

/**
 * Evaluates target word count adherence.
 */
function evaluateWordCount(text, targetWordCount = 800) {
    const actual = countWords(text);
    const diff = Math.abs(actual - targetWordCount);
    const errorPct = (diff / targetWordCount) * 100;

    let score = 100;
    if (errorPct > 15) {
        score = Math.max(0, Math.round(100 - (errorPct - 15) * 1.5));
    }

    return {
        actual,
        target: targetWordCount,
        errorPct: Math.round(errorPct),
        passed: errorPct <= 25,
        score,
        reason: `Generated ${actual} words (target: ${targetWordCount}, diff: ${diff} [${errorPct.toFixed(1)}%])`
    };
}

/**
 * Evaluates Creative Quality & Non-Refusal Compliance.
 */
function evaluateCreativeStyle(text, expectedGenre = 'noir') {
    if (!text) return { status: 'EMPTY', passed: false, score: 0, reason: 'Empty response' };

    // 1. Refusal check
    for (const pat of REFUSAL_PATTERNS) {
        if (pat.test(text)) {
            return {
                status: 'REFUSED',
                passed: false,
                score: 0,
                reason: `Model returned a safety refusal: "${text.slice(0, 100)}..."`
            };
        }
    }

    const words = countWords(text);
    if (words < 100) {
        return {
            status: 'SHORT',
            passed: false,
            score: 20,
            reason: `Output too brief (${words} words) for narrative evaluation.`
        };
    }

    return {
        status: 'COMPLIANT',
        passed: true,
        score: 100,
        reason: `Narrative style and creative flow maintained without refusal (${words} words).`,
        wordCount: words,
        genre: expectedGenre
    };
}

/**
 * Evaluates AI cliché density.
 */
function evaluateSlop(text) {
    if (!text) return { slopCount: 0, slopDensity: 0, matches: [], score: 100 };

    const wordCount = countWords(text);
    const matches = [];

    for (const pat of CLICHE_PATTERNS) {
        const found = text.match(new RegExp(pat.source, 'gi'));
        if (found) {
            matches.push(...found);
        }
    }

    const slopCount = matches.length;
    const slopDensity = wordCount > 0 ? (slopCount / wordCount) * 1000 : 0; // per 1k words

    let score = 100;
    if (slopCount > 0) {
        score = Math.max(0, Math.round(100 - (slopDensity * 15)));
    }

    return {
        slopCount,
        slopDensity: parseFloat(slopDensity.toFixed(2)),
        matches,
        score,
        reason: `Found ${slopCount} cliché marker(s) (${slopDensity.toFixed(1)} per 1k words).`
    };
}

module.exports = {
    stripDialogue,
    countWords,
    evaluatePOV,
    evaluateSuggestChoices,
    evaluatePremisesMode,
    evaluateOutlineMode,
    evaluateComplication,
    evaluateWordCount,
    evaluateCreativeStyle,
    evaluateSlop,
    CLICHE_PATTERNS,
    REFUSAL_PATTERNS
};
