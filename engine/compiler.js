const fs = require('fs');
const path = require('path');

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
    if (validParams.outline_mode === true) {
        forceState('outline_mode', true);
        
        // Force disable all prose/narrative blocks
        const blocksToDisable = [
            'pov_third', 'pov_first', 'pov_author',
            'pacing_slow', 'pacing_urgent',
            'prose_grounded', 'prose_intimate', 'prose_pulp',
            'sensory_poetic', 'sensory_tactile', 'sensory_detailed', 'sensory_visceral',
            'dialogue_register_none', 'dialogue_register_teasing', 'dialogue_register_filthy', 'dialogue_register_degrading',
            'focus_balanced', 'focus_self', 'focus_partner',
            'internal_monologue'
        ];
        for (const blockId of blocksToDisable) {
            forceState(blockId, false);
        }
    } else {
        forceState('outline_mode', false);
        
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
        }

        // Pacing mapping
        if (validParams.pacing <= 2) {
            forceState('pacing_slow', true);
            forceState('pacing_urgent', false);
        } else if (validParams.pacing === 3) {
            forceState('pacing_slow', false);
            forceState('pacing_urgent', false);
        } else if (validParams.pacing >= 4) {
            forceState('pacing_urgent', true);
            forceState('pacing_slow', false);
        }

        // Sensory intensity mapping
        if (validParams.sensory_intensity === 'romantic') {
            forceState('sensory_poetic', true);
            forceState('sensory_tactile', false);
            forceState('sensory_detailed', false);
            forceState('sensory_visceral', false);
        } else if (validParams.sensory_intensity === 'sensual') {
            forceState('sensory_tactile', true);
            forceState('sensory_poetic', false);
            forceState('sensory_detailed', false);
            forceState('sensory_visceral', false);
        } else if (validParams.sensory_intensity === 'sensory_detailed') {
            forceState('sensory_detailed', true);
            forceState('sensory_poetic', false);
            forceState('sensory_tactile', false);
            forceState('sensory_visceral', false);
        } else if (validParams.sensory_intensity === 'hardcore') {
            forceState('sensory_visceral', true);
            forceState('sensory_poetic', false);
            forceState('sensory_tactile', false);
            forceState('sensory_detailed', false);
        }

        // Dialogue register mapping
        if (validParams.dialogue_register === 'none') {
            forceState('dialogue_register_none', true);
            forceState('dialogue_register_teasing', false);
            forceState('dialogue_register_filthy', false);
            forceState('dialogue_register_degrading', false);
        } else if (validParams.dialogue_register === 'teasing') {
            forceState('dialogue_register_teasing', true);
            forceState('dialogue_register_none', false);
            forceState('dialogue_register_filthy', false);
            forceState('dialogue_register_degrading', false);
        } else if (validParams.dialogue_register === 'filthy') {
            forceState('dialogue_register_filthy', true);
            forceState('dialogue_register_none', false);
            forceState('dialogue_register_teasing', false);
            forceState('dialogue_register_degrading', false);
        } else if (validParams.dialogue_register === 'dominant_degrading') {
            forceState('dialogue_register_degrading', true);
            forceState('dialogue_register_none', false);
            forceState('dialogue_register_teasing', false);
            forceState('dialogue_register_filthy', false);
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
        }

        // Internal monologue mapping
        if (validParams.internal_mono === true) {
            forceState('internal_monologue', true);
        } else if (validParams.internal_mono === false) {
            forceState('internal_monologue', false);
        }

        // Prose style mapping
        if (validParams.prose_style === 'grounded') {
            forceState('prose_grounded', true);
            forceState('prose_intimate', false);
            forceState('prose_pulp', false);
        } else if (validParams.prose_style === 'intimate') {
            forceState('prose_intimate', true);
            forceState('prose_grounded', false);
            forceState('prose_pulp', false);
        } else if (validParams.prose_style === 'pulp') {
            forceState('prose_pulp', true);
            forceState('prose_grounded', false);
            forceState('prose_intimate', false);
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
                    console.warn(`Warning: Unknown placeholder {{${paramName}}} in block body.`);
                }
            }
        }
    }

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

    // Always append the word count instruction, but add outlining directives if in Outline Mode
    if (validParams.outline_mode === true) {
        postParts.push("Write a structured outline, plot points, or brainstorm ideas based on the user's prompt. Do not write full-narrative prose chapters. Keep the format organized.");
    }
    const wordCount = validParams.word_count;
    postParts.push(`Write approximately ${wordCount} words.`);

    // If complication_generator is enabled, append the complication instruction
    if (validParams.complication_generator === true) {
        postParts.push("Introduce a minor immediate complication, hesitation, or external distraction (e.g., a sudden sound, a flash of guilt, a boundary hesitation, or a realization) to disrupt the smooth flow of the scene.");
    }

    // Add pushback slider mapping
    const pushbackVal = validParams.pushback;
    if (pushbackVal <= 2) {
        postParts.push("Character Behavior: Receptive and highly compliant. The AI-controlled characters should easily go along with the user character's initiatives, suggestions, and physical advances with minimal hesitation.");
    } else if (pushbackVal === 3) {
        postParts.push("Character Behavior: Realistic agency. Characters act on their own beliefs, immediate mood, and comfort levels. They will show natural hesitation, boundary checks, or mild pushback if the user character pushes them too fast or acts out of character.");
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
