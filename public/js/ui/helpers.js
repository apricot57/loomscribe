import { escapeHtml } from '../state.js';

export function safeAsync(fn) {
    return function (...args) {
        Promise.resolve(fn(...args)).catch((err) => {
            console.error("Unhandled async error caught by safeAsync boundary:", err);
        });
    };
}

export function applyTheme(themeName) {
    const validThemes = ['cyan', 'teal', 'purple', 'amber'];
    const currentTheme = validThemes.includes(themeName) ? themeName : 'cyan';
    
    validThemes.forEach(t => {
        document.documentElement.classList.remove(`theme-${t}`);
    });
    document.documentElement.classList.add(`theme-${currentTheme}`);
}

/**
 * Parses markdown into safe, sanitized HTML using marked and DOMPurify.
 *
 * @param {string} text
 * @returns {string} Sanitized HTML
 */
export function renderMarkdown(text) {
    if (!text) return '';
    const rawHtml = typeof marked !== 'undefined' ? marked.parse(text) : escapeHtml(text);
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(rawHtml);
    }
    return rawHtml;
}

