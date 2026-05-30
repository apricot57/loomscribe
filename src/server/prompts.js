const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const PROMPTS_DIR = path.join(ROOT, 'prompt_cards');
const PROMPTS_DIR_RESOLVED = path.resolve(PROMPTS_DIR);

function extractNameFromFile(filePath) {
    try {
        const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n')[0].trim();
        const match = firstLine.match(/^#\s+System Prompt:\s+(.+)/i);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}

function getPromptTree() {
    const categories = {};
    let entries;
    try {
        entries = fs.readdirSync(PROMPTS_DIR, { withFileTypes: true });
    } catch {
        return { categories };
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (!entry.isDirectory()) continue;

        const categoryDir = entry.name;
        const dirPath = path.join(PROMPTS_DIR, categoryDir);
        let files;
        try {
            files = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            continue;
        }

        const prompts = [];
        for (const file of files) {
            if (!file.isFile() || !file.name.endsWith('.md') || file.name.startsWith('.')) continue;
            if (file.name === 'the_harlow_family.md') continue;
            const filePath = path.join(dirPath, file.name);
            const name = extractNameFromFile(filePath) || file.name.replace(/_sys_prompt\.md$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            prompts.push({ name, filename: file.name, category: categoryDir });
        }

        if (prompts.length > 0) {
            categories[categoryDir] = prompts;
        }
    }

    return { categories };
}

function getPromptContent(category, filename) {
    const filePath = path.resolve(PROMPTS_DIR, category, filename);

    // Safety check to prevent directory traversal
    const relativePath = path.relative(PROMPTS_DIR_RESOLVED, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Forbidden');
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    // Strip the H1 heading line from content (display name is extracted separately)
    const lines = content.split('\n');
    if (lines.length > 0 && lines[0].trim().startsWith('# ')) {
        lines.shift();
        if (lines[0] && lines[0].trim() === '---') lines.shift();
        if (lines[0] && lines[0].trim() === '') lines.shift();
        content = lines.join('\n').trim();
    }
    const name = extractNameFromFile(filePath) || filename;
    return { name, filename, category, content };
}

module.exports = {
    PROMPTS_DIR,
    getPromptTree,
    getPromptContent,
    extractNameFromFile
};
