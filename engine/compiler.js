const fs = require('fs');
const path = require('path');
const logger = require('../src/server/logger');

const REGISTRY_PATH = path.join(__dirname, 'blocks', 'index.json');
const SCHEMA_PATH = path.join(__dirname, 'schema.json');
const PRESETS_DIR = path.join(__dirname, 'presets');
const BLOCKS_DIR = path.join(__dirname, 'blocks');

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
        // User params override preset defaults
        let val = params && params[id] !== undefined ? params[id] : undefined;

        // Helper to get fallback (preset default -> schema default)
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
            // Unknown schema type fallback
            validParams[id] = val;
        }
    }

    // Stage 5: Start with registry blocks as baseline
    let registry;
    try {
        registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    } catch (err) {
        throw new Error('Failed to load block registry index.json');
    }

    const blockState = {};
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

    // Helper for applying rules safely
    const forceState = (blockId, enabled) => {
        if (blockState[blockId] !== undefined) {
            blockState[blockId].enabled = enabled;
        }
    };

    // Stage 6: Apply parameter-to-block mapping rules (system-slot params only)
    // The prose-bypass modes (premises_mode > outline_mode) disable all narrative blocks.
    const proseBypassActive = validParams.premises_mode === true || validParams.outline_mode === true;

    if (validParams.premises_mode === true) {
        forceState('premises_mode', true);
        forceState('outline_mode', false);

        // Force disable all prose/narrative blocks
        const blocksToDisable = [
            'pov_third', 'pov_first', 'pov_author',
            'intensity_tender', 'intensity_sensory', 'intensity_charged', 'intensity_raw',
            'dialogue_silent', 'dialogue_playful', 'dialogue_candid', 'dialogue_commanding',
            'focus_balanced', 'focus_self', 'focus_partner'
        ];
        for (const blockId of blocksToDisable) {
            forceState(blockId, false);
        }
    } else if (validParams.outline_mode === true) {
        forceState('outline_mode', true);
        forceState('premises_mode', false);

        // Force disable all prose/narrative blocks
        const blocksToDisable = [
            'pov_third', 'pov_first', 'pov_author',
            'intensity_tender', 'intensity_sensory', 'intensity_charged', 'intensity_raw',
            'dialogue_silent', 'dialogue_playful', 'dialogue_candid', 'dialogue_commanding',
            'focus_balanced', 'focus_self', 'focus_partner'
        ];
        for (const blockId of blocksToDisable) {
            forceState(blockId, false);
        }
    } else {
        forceState('outline_mode', false);
        forceState('premises_mode', false);

        // POV mapping
        if (validParams.pov === 'third') {
            forceState('pov_third', true);
            forceState('pov_first', false);
            forceState('pov_author', false);
        } else if (validParams.pov === 'first') {
            forceState('pov_first', true);
            forceState('pov_third', false);
            forceState('pov_author', false);
        } else if (validParams.pov === 'author') {
            forceState('pov_author', true);
            forceState('pov_third', false);
            forceState('pov_first', false);
        } else if (validParams.pov === 'off') {
            forceState('pov_third', false);
            forceState('pov_first', false);
            forceState('pov_author', false);
        }

        // Scene intensity mapping
        if (validParams.scene_intensity === 'tender') {
            forceState('intensity_tender', true);
            forceState('intensity_sensory', false);
            forceState('intensity_charged', false);
            forceState('intensity_raw', false);
        } else if (validParams.scene_intensity === 'sensory') {
            forceState('intensity_sensory', true);
            forceState('intensity_tender', false);
            forceState('intensity_charged', false);
            forceState('intensity_raw', false);
        } else if (validParams.scene_intensity === 'charged') {
            forceState('intensity_charged', true);
            forceState('intensity_tender', false);
            forceState('intensity_sensory', false);
            forceState('intensity_raw', false);
        } else if (validParams.scene_intensity === 'raw') {
            forceState('intensity_raw', true);
            forceState('intensity_tender', false);
            forceState('intensity_sensory', false);
            forceState('intensity_charged', false);
        } else if (validParams.scene_intensity === 'off') {
            forceState('intensity_tender', false);
            forceState('intensity_sensory', false);
            forceState('intensity_charged', false);
            forceState('intensity_raw', false);
        }

        // Dialogue style mapping
        if (validParams.dialogue_style === 'silent') {
            forceState('dialogue_silent', true);
            forceState('dialogue_playful', false);
            forceState('dialogue_candid', false);
            forceState('dialogue_commanding', false);
        } else if (validParams.dialogue_style === 'playful') {
            forceState('dialogue_playful', true);
            forceState('dialogue_silent', false);
            forceState('dialogue_candid', false);
            forceState('dialogue_commanding', false);
        } else if (validParams.dialogue_style === 'candid') {
            forceState('dialogue_candid', true);
            forceState('dialogue_silent', false);
            forceState('dialogue_playful', false);
            forceState('dialogue_commanding', false);
        } else if (validParams.dialogue_style === 'commanding') {
            forceState('dialogue_commanding', true);
            forceState('dialogue_silent', false);
            forceState('dialogue_playful', false);
            forceState('dialogue_candid', false);
        } else if (validParams.dialogue_style === 'off') {
            forceState('dialogue_silent', false);
            forceState('dialogue_playful', false);
            forceState('dialogue_candid', false);
            forceState('dialogue_commanding', false);
        }

        // POV focus mapping
        if (validParams.pov_focus === 'balanced') {
            forceState('focus_balanced', true);
            forceState('focus_self', false);
            forceState('focus_partner', false);
        } else if (validParams.pov_focus === 'self') {
            forceState('focus_self', true);
            forceState('focus_balanced', false);
            forceState('focus_partner', false);
        } else if (validParams.pov_focus === 'partner') {
            forceState('focus_partner', true);
            forceState('focus_balanced', false);
            forceState('focus_self', false);
        } else if (validParams.pov_focus === 'off') {
            forceState('focus_balanced', false);
            forceState('focus_self', false);
            forceState('focus_partner', false);
        }
    }

    // Stage 7: Apply manual overrides (always wins)
    if (blockOverrides && typeof blockOverrides === 'object') {
        for (const [blockId, overrideVal] of Object.entries(blockOverrides)) {
            if (blockState[blockId] !== undefined) {
                blockState[blockId].enabled = !!overrideVal;
            }
        }
    }

    // Stage 8: Filter and sort active blocks
    const activeBlocks = Object.entries(blockState)
        .filter(([_, info]) => info.enabled)
        .map(([id, info]) => ({ id, order: info.order }))
        .sort((a, b) => a.order - b.order);

    // Stage 9: Load each block's markdown file
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

    // Check for unknown placeholders in the block bodies and warn (error policy)
    for (const body of blockBodies) {
        const matches = body.match(/\{\{([^}]+)\}\}/g);
        if (matches) {
            for (const match of matches) {
                const paramName = match.slice(2, -2).trim();
                if (validParams[paramName] === undefined) {
                    logger.warn('compiler_unknown_placeholder', { placeholder: paramName, presetId });
                }
            }
        }
    }

    logger.debug('compiler_result', {
        presetId,
        validParams,
        activeBlocks: activeBlocks.map(b => b.id)
    });

    // Stage 10: Join block bodies and append preset.system_body
    let systemPrompt = blockBodies.join('\n\n---\n\n');
    if (preset.system_body && preset.system_body.trim()) {
        if (systemPrompt) {
            systemPrompt += '\n\n' + preset.system_body.trim();
        } else {
            systemPrompt = preset.system_body.trim();
        }
    }

    // Stage 11: Build postHistory
    const postParts = [];
    if (preset.post_history_body && preset.post_history_body.trim()) {
        postParts.push(preset.post_history_body.trim());
    }

    // Append mode-specific directives; in prose-bypass modes, skip the word-count instruction.
    if (validParams.premises_mode === true) {
        postParts.push("Generate exactly six fully developed story premises based on the user's input. Number them 1 through 6 with a bolded title for each.\n\nFor each premise, output:\n- **Scenario Setup**: 2-3 substantial paragraphs covering the specific characters, their relational dynamic, the psychological tension/desire, and the charged circumstances.\n- **Starting Prompt**: Highly specific scene-starting prompts using the 'Guidelines for Scene-Starting Prompts'. Ensure these prompts are concrete, immediate scene anchors featuring tactile details rather than plot summaries.\n\nVary tone and emotional dynamic across the six options to offer a diverse range of narrative styles. Do not write full prose chapters. Output only the six premises with their setups and starting prompts — no preamble, ranking, or meta-commentary.");
    } else if (validParams.outline_mode === true) {
        postParts.push("Focus on plotting, outlining, and brainstorming narrative directions or ideas based on the user's input. Do not write full-narrative prose chapters yet. Expand on plot beats, character details, and story structure with depth and detail.");
        const wordCount = validParams.word_count;
        postParts.push(`Write approximately ${wordCount} words.`);
    } else {
        const wordCount = validParams.word_count;
        postParts.push(`Write approximately ${wordCount} words.`);
    }

    // If complication_generator is enabled, append the complication instruction
    if (validParams.complication_generator === true) {
        postParts.push("Before the scene resolves or escalates cleanly, introduce one specific complication that creates friction. Choose the type that best fits the scene:\n- **External interruption:** A sound from outside the room, a phone notification, footsteps, a door — something that forces a pause or a decision.\n- **Emotional rupture:** A flash of guilt, doubt, or recognition of what they are doing — an internal moment that surfaces visibly and cannot be immediately suppressed.\n- **Physical hesitation:** A body that does not cooperate with intention — hands that stop, a voice that comes out wrong, a physical reaction that reveals something unintended.\n- **Power shift:** A moment where the dynamic between the characters tilts unexpectedly — something said or done that neither anticipated.\nWrite the complication as a scene beat, not an announcement. It must feel earned and specific to these characters in this moment.");
    }

    // If suggest_choices is enabled, append the choices instruction
    if (validParams.suggest_choices === true) {
        postParts.push("At the very end of your response, after a divider line (---), provide exactly 3 distinct, numbered choices (1, 2, 3) about how to proceed with the story. Keep each choice brief, specific, and evocative, offering diverse paths for the next scene or character actions.");
    }

    // Add pushback slider mapping
    const pushbackVal = validParams.pushback;
    if (pushbackVal === 0) {
        // Intentionally empty — pushback is turned off entirely (no instruction).
    } else if (pushbackVal >= 1 && pushbackVal <= 2) {
        postParts.push("Character Behavior: Receptive and highly compliant. The AI-controlled characters should easily go along with the user character's initiatives, suggestions, and physical advances with minimal hesitation.");
    } else if (pushbackVal === 3) {
        // Intentionally empty — level 3 is the model's natural default; no instruction needed.
    } else if (pushbackVal >= 4) {
        postParts.push("Character Behavior: Guarded and resistant. Characters prioritize their own secret motivations, strict boundaries, fears, or independent goals. They will actively push back, refuse, express doubt, or create friction against the user character's advances and suggestions.");
    }

    // If directorNote is non-empty, append it
    if (directorNote && directorNote.trim()) {
        postParts.push(directorNote.trim());
    }

    const postHistory = postParts.join('\n\n');

    // Stage 12: Return systemPrompt and postHistory
    return {
        systemPrompt,
        postHistory: postHistory.trim() ? postHistory : ""
    };
}

module.exports = {
    compilePrompt
};
