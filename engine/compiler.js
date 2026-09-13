const fs = require('fs');
const path = require('path');
const logger = require('../src/server/logger');

const REGISTRY_PATH = path.join(__dirname, 'blocks', 'index.json');
const SCHEMA_PATH = path.join(__dirname, 'schema.json');
const PRESETS_DIR = path.join(__dirname, 'presets');
const BLOCKS_DIR = path.join(__dirname, 'blocks');

/**
 * Interpolates {{param_name}} placeholders in text with values from params.
 * Logs a warning if an unknown placeholder is found, leaving it unchanged.
 *
 * @param {string} text
 * @param {Object} params
 * @param {string} presetId
 * @returns {string}
 */
function interpolatePlaceholders(text, params = {}, presetId = '') {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, paramName) => {
        const key = paramName.trim();
        if (params[key] !== undefined && params[key] !== null) {
            return String(params[key]);
        }
        logger.warn('compiler_unknown_placeholder', { placeholder: key, presetId });
        return match;
    });
}

// Declarative block activation mappings for select parameters
const SELECT_PARAM_BLOCK_RULES = {
    pov: {
        managedBlocks: ['pov_third', 'pov_first', 'pov_author'],
        valueMap: {
            third: ['pov_third'],
            first: ['pov_first'],
            author: ['pov_author'],
            off: []
        }
    },
    scene_intensity: {
        managedBlocks: ['intensity_tender', 'intensity_sensory', 'intensity_charged', 'intensity_raw'],
        valueMap: {
            tender: ['intensity_tender'],
            sensory: ['intensity_sensory'],
            charged: ['intensity_charged'],
            raw: ['intensity_raw'],
            off: []
        }
    },
    dialogue_style: {
        managedBlocks: ['dialogue_silent', 'dialogue_playful', 'dialogue_candid', 'dialogue_commanding'],
        valueMap: {
            silent: ['dialogue_silent'],
            playful: ['dialogue_playful'],
            candid: ['dialogue_candid'],
            commanding: ['dialogue_commanding'],
            off: []
        }
    },
    pov_focus: {
        managedBlocks: ['focus_balanced', 'focus_self', 'focus_partner'],
        valueMap: {
            balanced: ['focus_balanced'],
            self: ['focus_self'],
            partner: ['focus_partner'],
            off: []
        }
    }
};

// Narrative bypass modes that deactivate prose blocks
const PROSE_BYPASS_MODES = {
    premises_mode: {
        activeBlock: 'premises_mode',
        disabledGroups: ['scene_intensity', 'dialogue_style', 'pov_focus', 'pov'],
        disabledBlocks: ['format_rules', 'pov_third', 'pov_first', 'pov_author']
    },
    outline_mode: {
        activeBlock: 'outline_mode',
        disabledGroups: ['scene_intensity', 'dialogue_style', 'pov_focus', 'pov'],
        disabledBlocks: ['format_rules', 'pov_third', 'pov_first', 'pov_author']
    }
};

const POV_RECENCY_LABELS = {
    third: 'Close Third Person',
    first: 'Deep First Person',
    author: 'Omniscient'
};

const INTENSITY_RECENCY_LABELS = {
    tender: 'Tender & Atmospheric',
    sensory: 'Sensory & Tactile',
    charged: 'High-Tension & Charged',
    raw: 'Raw & Direct'
};

const DIALOGUE_RECENCY_LABELS = {
    silent: 'Subtext-Heavy & Minimalist',
    playful: 'Witty & Playful',
    candid: 'Direct & Candid',
    commanding: 'Dominant & Commanding'
};

const FOCUS_RECENCY_LABELS = {
    balanced: 'Balanced Dynamic',
    self: 'POV Character Interiority',
    partner: 'Partner Reactions & Behavioral Shifts'
};

/**
 * Compiles a two-slot prompt according to the prompt engine plan.
 * 
 * @param {Object} options
 * @param {string|null} options.presetId
 * @param {Object} [options.params]
 * @param {Object} [options.blockOverrides]
 * @param {string} [options.directorNote]
 * @returns {{ systemPrompt: string, postHistory: string }}
 */
function compilePrompt({ presetId, params, blockOverrides, directorNote }) {
    // Stage 1: If presetId is null/falsy, return empty strings
    if (!presetId) {
        return { systemPrompt: "", postHistory: "" };
    }

    // Stage 2: Load preset file safely
    if (typeof presetId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(presetId)) {
        throw new Error(`Preset not found: ${presetId}`);
    }

    const presetPath = path.join(PRESETS_DIR, `${presetId}.json`);
    if (!fs.existsSync(presetPath)) {
        throw new Error(`Preset not found: ${presetId}`);
    }

    let preset;
    try {
        preset = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));
    } catch (err) {
        throw new Error(`Preset not found: ${presetId}`);
    }

    // Stages 3 & 4: Resolve and validate parameters against schema.json
    let schema;
    try {
        schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    } catch (err) {
        throw new Error('Failed to load parameter schema.json');
    }

    const validParams = {};

    for (const schemaItem of schema) {
        const id = schemaItem.id;
        let val = params && params[id] !== undefined ? params[id] : undefined;

        const getPresetDefault = () => {
            if (preset.defaults && preset.defaults[id] !== undefined) {
                return preset.defaults[id];
            }
            return schemaItem.default;
        };

        if (val === undefined) {
            val = getPresetDefault();
        }

        if (schemaItem.type === 'slider') {
            let num = Number(val);
            if (isNaN(num)) {
                num = Number(getPresetDefault());
            }
            if (schemaItem.min !== undefined && num < schemaItem.min) {
                num = schemaItem.min;
            }
            if (schemaItem.max !== undefined && num > schemaItem.max) {
                num = schemaItem.max;
            }
            validParams[id] = num;
        } else if (schemaItem.type === 'select') {
            const allowedValues = schemaItem.options.map(opt => opt.value);
            if (!allowedValues.includes(val)) {
                val = getPresetDefault();
                if (!allowedValues.includes(val)) {
                    val = schemaItem.default;
                }
            }
            validParams[id] = val;
        } else if (schemaItem.type === 'toggle') {
            if (typeof val === 'string') {
                if (val.toLowerCase() === 'true') val = true;
                else if (val.toLowerCase() === 'false') val = false;
            }
            if (typeof val !== 'boolean') {
                val = getPresetDefault();
                if (typeof val === 'string') {
                    if (val.toLowerCase() === 'true') val = true;
                    else if (val.toLowerCase() === 'false') val = false;
                }
                if (typeof val !== 'boolean') {
                    val = !!schemaItem.default;
                }
            }
            validParams[id] = val;
        } else {
            validParams[id] = val;
        }
    }

    // Stage 5: Load block registry
    let registry;
    try {
        registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    } catch (err) {
        throw new Error('Failed to load block registry index.json');
    }

    const blockState = Object.create(null);
    for (const entry of registry) {
        blockState[entry.id] = { enabled: false, order: entry.order };
    }

    // Overlay preset block overrides if any are defined
    if (preset.blocks && Array.isArray(preset.blocks)) {
        for (const b of preset.blocks) {
            if (blockState[b.id] !== undefined) {
                blockState[b.id].enabled = !!b.enabled;
                if (b.order !== undefined) {
                    blockState[b.id].order = b.order;
                }
            }
        }
    }

    const forceState = (blockId, enabled) => {
        if (blockState[blockId] !== undefined) {
            blockState[blockId].enabled = enabled;
        }
    };

    // Stage 6: Apply parameter-to-block mappings
    const activeBypassKey = Object.keys(PROSE_BYPASS_MODES).find(mode => validParams[mode] === true);

    if (activeBypassKey) {
        const bypassConfig = PROSE_BYPASS_MODES[activeBypassKey];
        forceState(bypassConfig.activeBlock, true);

        // Turn off alternative bypass modes
        for (const mode of Object.keys(PROSE_BYPASS_MODES)) {
            if (mode !== activeBypassKey) {
                forceState(PROSE_BYPASS_MODES[mode].activeBlock, false);
            }
        }

        // Disable standard prose blocks
        for (const blockId of bypassConfig.disabledBlocks) {
            forceState(blockId, false);
        }
    } else {
        // Disable bypass mode blocks
        for (const mode of Object.keys(PROSE_BYPASS_MODES)) {
            forceState(PROSE_BYPASS_MODES[mode].activeBlock, false);
        }

        // Enable default core format rules
        forceState('format_rules', true);

        // Apply declarative mappings for select parameters
        for (const [paramKey, rule] of Object.entries(SELECT_PARAM_BLOCK_RULES)) {
            const paramVal = validParams[paramKey];
            const activeForParam = rule.valueMap[paramVal] || [];

            for (const blockId of rule.managedBlocks) {
                forceState(blockId, activeForParam.includes(blockId));
            }
        }
    }

    // Stage 7: Manual overrides
    if (blockOverrides && typeof blockOverrides === 'object') {
        for (const [blockId, overrideVal] of Object.entries(blockOverrides)) {
            if (blockState[blockId] !== undefined) {
                blockState[blockId].enabled = !!overrideVal;
            }
        }
    }

    // Stage 8: Sort and load active blocks
    const activeBlocks = Object.entries(blockState)
        .filter(([_, info]) => info.enabled)
        .map(([id, info]) => ({ id, order: info.order }))
        .sort((a, b) => a.order - b.order);

    const blockRegistryMap = {};
    for (const entry of registry) {
        blockRegistryMap[entry.id] = entry;
    }

    const blockBodies = [];
    for (const block of activeBlocks) {
        const regEntry = blockRegistryMap[block.id];
        if (!regEntry || !regEntry.file) {
            throw new Error(`Block file missing: ${block.id}`);
        }
        const blockFilePath = path.join(BLOCKS_DIR, regEntry.file);
        if (!fs.existsSync(blockFilePath)) {
            throw new Error(`Block file missing: ${block.id}`);
        }
        try {
            const content = fs.readFileSync(blockFilePath, 'utf-8');
            blockBodies.push(content.trim());
        } catch (err) {
            throw new Error(`Block file missing: ${block.id}`);
        }
    }

    logger.debug('compiler_result', {
        presetId,
        validParams,
        activeBlocks: activeBlocks.map(b => b.id)
    });

    // Stage 9: Join block bodies and append preset.system_body with interpolation
    let systemPrompt = blockBodies.join('\n\n---\n\n');
    if (preset.system_body && preset.system_body.trim()) {
        const interpolatedSystemBody = interpolatePlaceholders(preset.system_body.trim(), validParams, presetId);
        if (systemPrompt) {
            systemPrompt += '\n\n' + interpolatedSystemBody;
        } else {
            systemPrompt = interpolatedSystemBody;
        }
    }

    // Stage 10: Build postHistory
    const postParts = [];
    if (preset.post_history_body && preset.post_history_body.trim()) {
        const interpolatedPostHistoryBody = interpolatePlaceholders(preset.post_history_body.trim(), validParams, presetId);
        postParts.push(interpolatedPostHistoryBody);
    }

    if (validParams.premises_mode === true) {
        postParts.push("Generate exactly six fully developed story premises based on the user's input. Number them 1 through 6 with a bolded title for each.\n\nFor each premise, output:\n- **Scenario Setup**: 2-3 substantial paragraphs covering the specific characters, their relational dynamic, the psychological tension/desire, and the charged circumstances.\n- **Scene Opener**: Concrete, immediate scene anchor featuring tactile details and clear tension rather than a plot summary.\n\nVary tone and emotional dynamic across the six options to offer a diverse range of narrative styles. Do not write full prose chapters. Output only the six premises with their setups and openers — no preamble, ranking, or meta-commentary.");
    } else if (validParams.outline_mode === true) {
        postParts.push("Focus on plotting, outlining, and brainstorming narrative directions or ideas based on the user's input. Do not write full-narrative prose chapters yet. Expand on plot beats, character details, and story structure with depth and detail.");
        const wordCount = validParams.word_count;
        postParts.push(`Write approximately ${wordCount} words.`);
    } else {
        const wordCount = validParams.word_count;
        postParts.push(`Write approximately ${wordCount} words.`);

        // Recency anchors for long-context stability
        if (POV_RECENCY_LABELS[validParams.pov]) {
            postParts.push(`[Active POV: ${POV_RECENCY_LABELS[validParams.pov]}]`);
        }
        if (INTENSITY_RECENCY_LABELS[validParams.scene_intensity]) {
            postParts.push(`[Active Intensity: ${INTENSITY_RECENCY_LABELS[validParams.scene_intensity]}]`);
        }
        if (DIALOGUE_RECENCY_LABELS[validParams.dialogue_style]) {
            postParts.push(`[Active Dialogue: ${DIALOGUE_RECENCY_LABELS[validParams.dialogue_style]}]`);
        }
        if (FOCUS_RECENCY_LABELS[validParams.pov_focus]) {
            postParts.push(`[Active Focus: ${FOCUS_RECENCY_LABELS[validParams.pov_focus]}]`);
        }
    }

    // Complication generator
    if (validParams.complication_generator === true) {
        postParts.push("Before the scene resolves or escalates cleanly, introduce one specific complication that creates friction. Choose the type that best fits the scene:\n- **External interruption:** A sound from outside the room, a phone notification, footsteps, a door — something that forces a pause or a decision.\n- **Emotional rupture:** A flash of guilt, doubt, or recognition of what they are doing — an internal moment that surfaces visibly and cannot be immediately suppressed.\n- **Physical hesitation:** A body that does not cooperate with intention — hands that stop, a voice that comes out wrong, a physical reaction that reveals something unintended.\n- **Power shift:** A moment where the dynamic between the characters tilts unexpectedly — something said or done that neither anticipated.\nWrite the complication as a scene beat, not an announcement. It must feel earned and specific to these characters in this moment.");
    }

    // Suggest next choices with counter-pressure directive
    if (validParams.suggest_choices === true) {
        postParts.push("IMPORTANT: Regardless of whether previous turns had options, you MUST end this turn with exactly three numbered choices (1., 2., 3.) about how to proceed with the story. Keep each choice brief, specific, and evocative, offering diverse paths for the next scene or character actions.");
    }

    // Pushback / resistance slider
    const pushbackVal = validParams.pushback;
    if (pushbackVal === 1 || pushbackVal === 2) {
        postParts.push("Character Behavior: Receptive and highly compliant. The AI-controlled characters should easily go along with the user character's initiatives, suggestions, and actions with minimal hesitation.");
    } else if (pushbackVal >= 4) {
        postParts.push("Character Behavior: Guarded and resistant. Characters prioritize their own secret motivations, strict boundaries, fears, or independent goals. They will actively push back, refuse, express doubt, or create friction against the user character's advances and suggestions.");
    }

    // User Director's Note
    if (directorNote && directorNote.trim()) {
        postParts.push(`User Custom Directives: ${directorNote.trim()}`);
    }

    const postHistory = postParts.join('\n\n');

    return {
        systemPrompt,
        postHistory: postHistory.trim() ? postHistory : ""
    };
}

module.exports = {
    compilePrompt,
    interpolatePlaceholders
};
