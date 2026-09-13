/**
 * markdown.js — Safe Markdown Parser & Formatter
 */

export function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function renderMarkdown(content) {
    if (!content) return '';

    if (typeof marked === 'undefined') {
        return `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
    }

    try {
        // Configure marked options
        marked.setOptions({
            gfm: true,
            breaks: true
        });

        const rawHtml = marked.parse(content);
        const cleanHtml = typeof DOMPurify !== 'undefined'
            ? DOMPurify.sanitize(rawHtml)
            : `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;

        // Process code blocks to add header and copy buttons
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cleanHtml;

        const preBlocks = tempDiv.querySelectorAll('pre');
        preBlocks.forEach((pre) => {
            const code = pre.querySelector('code');
            const langClass = code ? Array.from(code.classList).find(c => c.startsWith('language-')) : null;
            const lang = langClass ? langClass.replace('language-', '') : 'code';

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `
                <span>${escapeHtml(lang)}</span>
                <button class="code-copy-btn" type="button" aria-label="Copy code">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                    </svg>
                    <span>Copy</span>
                </button>
            `;

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });

        return tempDiv.innerHTML;
    } catch (err) {
        console.error('Markdown rendering error:', err);
        return `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
    }
}

/**
 * Global delegate handler for code copy buttons
 */
export function initCodeCopyHandler() {
    document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.code-copy-btn');
        if (!copyBtn) return;

        const wrapper = copyBtn.closest('.code-block-wrapper');
        const codeEl = wrapper ? wrapper.querySelector('pre code') : null;
        if (!codeEl) return;

        const text = codeEl.innerText || codeEl.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const label = copyBtn.querySelector('span');
            if (label) {
                const originalText = label.textContent;
                label.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    label.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy code to clipboard:', err);
        });
    });
}
