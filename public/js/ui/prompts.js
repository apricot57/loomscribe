import { state } from '../state.js';
import {
    fetchPromptContent,
    getAllPromptCategories,
    lookupPromptName
} from '../api.js';
import { safeAsync } from './helpers.js';
import { showToast } from './modals.js';

export async function populatePromptDropdown(menuElement, currentSelectionId, onSelect) {
    menuElement.innerHTML = '';
    const categories = await getAllPromptCategories();

    const defaultBtn = document.createElement('button');
    defaultBtn.className = 'dropdown-item' + (currentSelectionId === null ? ' selected' : '');
    defaultBtn.textContent = 'None (Default)';
    defaultBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(null);
        menuElement.classList.add('hidden');
    });
    menuElement.appendChild(defaultBtn);

    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    menuElement.appendChild(divider);

    for (const [categoryLabel, prompts] of categories) {
        const section = document.createElement('div');
        section.className = 'dropdown-category-section';

        const header = document.createElement('div');
        header.className = 'dropdown-category-header';
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = categoryLabel;
        header.appendChild(labelSpan);

        const chevron = document.createElement('span');
        chevron.className = 'dropdown-category-chevron';
        header.appendChild(chevron);
        
        section.appendChild(header);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'dropdown-category-items';

        // Check if this category contains the currently selected prompt
        const hasSelectedPrompt = prompts.some(p => p.promptId === currentSelectionId);
        
        // Determine initial collapsed state
        const storedCollapsedState = localStorage.getItem('collapsed_cat_' + categoryLabel);
        const initiallyCollapsed = (storedCollapsedState === 'true') && !hasSelectedPrompt;

        if (initiallyCollapsed) {
            itemsContainer.classList.add('collapsed');
            chevron.textContent = '▶';
        } else {
            chevron.textContent = '▼';
        }

        header.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = itemsContainer.classList.toggle('collapsed');
            chevron.textContent = isCollapsed ? '▶' : '▼';
            localStorage.setItem('collapsed_cat_' + categoryLabel, isCollapsed ? 'true' : 'false');
        });

        for (const p of prompts) {
            if (p.source === 'user') {
                const wrapper = document.createElement('div');
                wrapper.className = 'dropdown-item dropdown-item-user' + (currentSelectionId === p.promptId ? ' selected' : '');

                const nameSpan = document.createElement('span');
                nameSpan.textContent = p.name;
                nameSpan.style.flex = '1';
                nameSpan.style.textAlign = 'left';
                nameSpan.style.cursor = 'pointer';
                nameSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onSelect(p.promptId);
                    menuElement.classList.add('hidden');
                });

                const actions = document.createElement('span');
                actions.className = 'user-prompt-actions';
                
                const editBtn = document.createElement('button');
                editBtn.className = 'user-prompt-action-btn';
                editBtn.textContent = '✎';
                editBtn.title = 'Edit';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menuElement.classList.add('hidden');
                    state.editingPromptId = p.dbId;
                    
                    const promptEditorTitle = document.getElementById('prompt-editor-title');
                    const promptNameInput = document.getElementById('prompt-name-input');
                    const promptCategoryInput = document.getElementById('prompt-category-input');
                    const promptContentInput = document.getElementById('prompt-content-input');
                    const promptEditorModal = document.getElementById('prompt-editor-modal');

                    if (promptEditorTitle) promptEditorTitle.textContent = 'Edit Prompt';
                    if (promptNameInput) promptNameInput.value = p.name;
                    if (promptCategoryInput) promptCategoryInput.value = categoryLabel;
                    if (promptContentInput) promptContentInput.value = '';
                    
                    fetchPromptContent(p.promptId).then(content => {
                        if (promptContentInput) promptContentInput.value = content;
                    });
                    populateCategoryDatalist();
                    if (promptEditorModal) promptEditorModal.classList.remove('hidden');
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'user-prompt-action-btn delete';
                deleteBtn.textContent = '✕';
                deleteBtn.title = 'Delete';
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    menuElement.classList.add('hidden');
                    if (confirm('Delete this prompt?')) {
                        await fetch(`/api/user-prompts/${p.dbId}`, {
                            method: 'DELETE'
                        });
                        state.promptContentCache.delete(`user/${p.dbId}`);
                        if (state.currentSystemPromptId === `user/${p.dbId}`) {
                            await setSystemPrompt(null);
                        }
                    }
                });
                
                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);

                wrapper.appendChild(nameSpan);
                wrapper.appendChild(actions);
                itemsContainer.appendChild(wrapper);
            } else {
                const btn = document.createElement('button');
                btn.className = 'dropdown-item' + (currentSelectionId === p.promptId ? ' selected' : '');
                btn.textContent = p.name;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onSelect(p.promptId);
                    menuElement.classList.add('hidden');
                });
                itemsContainer.appendChild(btn);
            }
        }
        section.appendChild(itemsContainer);
        menuElement.appendChild(section);
    }

    const createDiv = document.createElement('div');
    createDiv.className = 'dropdown-divider';
    menuElement.appendChild(createDiv);
    
    const createBtn = document.createElement('button');
    createBtn.className = 'dropdown-item create-prompt-item';
    createBtn.textContent = '+ Create New Prompt';
    createBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuElement.classList.add('hidden');
        state.editingPromptId = null;
        
        const promptEditorTitle = document.getElementById('prompt-editor-title');
        const promptNameInput = document.getElementById('prompt-name-input');
        const promptCategoryInput = document.getElementById('prompt-category-input');
        const promptContentInput = document.getElementById('prompt-content-input');
        const promptEditorModal = document.getElementById('prompt-editor-modal');

        if (promptEditorTitle) promptEditorTitle.textContent = 'Create Prompt';
        if (promptNameInput) promptNameInput.value = '';
        if (promptCategoryInput) promptCategoryInput.value = '';
        if (promptContentInput) promptContentInput.value = '';
        
        populateCategoryDatalist();
        if (promptEditorModal) promptEditorModal.classList.remove('hidden');
    });
    menuElement.appendChild(createBtn);
}

export async function setSystemPrompt(promptId) {
    state.currentSystemPromptId = promptId;
    if (promptId) {
        await fetchPromptContent(promptId);
    }
    updatePromptSelectorDisplay();
    if (state.currentConversationId) {
        await fetch(`/api/conversations/${state.currentConversationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPromptId: promptId || null })
        });
    }
}

export function updatePromptSelectorDisplay() {
    const activePromptName = document.getElementById('active-prompt-name');
    if (!activePromptName) return;

    if (!state.currentSystemPromptId) {
        activePromptName.textContent = 'Default';
        return;
    }
    lookupPromptName(state.currentSystemPromptId).then(name => {
        activePromptName.textContent = name || 'Default';
    });
}

export function populateCategoryDatalist() {
    const promptCategoryList = document.getElementById('prompt-category-list');
    if (!promptCategoryList) return;

    promptCategoryList.innerHTML = '';
    const seen = new Set();
    if (state.factoryPromptCategories) {
        for (const catDir of Object.keys(state.factoryPromptCategories.categories)) {
            const label = catDir.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (!seen.has(label)) {
                seen.add(label);
                const opt = document.createElement('option');
                opt.value = label;
                promptCategoryList.appendChild(opt);
            }
        }
    }
}

export function initPromptSelector() {
    const promptSelectBtn = document.getElementById('prompt-select-btn');
    const promptDropdownMenu = document.getElementById('prompt-dropdown-menu');

    // Footer prompt selector toggle
    if (promptSelectBtn && promptDropdownMenu) {
        promptSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !promptDropdownMenu.classList.contains('hidden');
            if (isOpen) {
                promptDropdownMenu.classList.add('hidden');
            } else {
                promptDropdownMenu.classList.remove('hidden');
                populatePromptDropdown(promptDropdownMenu, state.currentSystemPromptId, (promptId) => {
                    setSystemPrompt(promptId);
                });
            }
        });
    }
}

export function initPromptEditorImport() {
    const promptImportBtn = document.getElementById('prompt-import-btn');
    const promptImportFile = document.getElementById('prompt-import-file');
    const promptNameInput = document.getElementById('prompt-name-input');
    const promptCategoryInput = document.getElementById('prompt-category-input');
    const promptContentInput = document.getElementById('prompt-content-input');
    const promptEditorModal = document.getElementById('prompt-editor-modal');

    if (promptImportBtn && promptImportFile) {
        promptImportBtn.addEventListener('click', () => {
            promptImportFile.click();
        });

        promptImportFile.addEventListener('change', safeAsync(async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Handle ZIP Import
            if (file.name.toLowerCase().endsWith('.zip')) {
                if (typeof JSZip === 'undefined') {
                    showToast('JSZip library is not loaded. Please reload the page.', 'error');
                    return;
                }
                const originalText = promptImportBtn.textContent;
                promptImportBtn.textContent = '⏳ Parsing ZIP...';
                promptImportBtn.disabled = true;

                try {
                    const zip = await JSZip.loadAsync(file);
                    const filePromises = [];
                    const categoriesSet = new Set();
                    let fileCount = 0;

                    zip.forEach((relativePath, zipEntry) => {
                        // Skip directories and non-markdown/non-text files
                        if (zipEntry.dir || (!relativePath.endsWith('.md') && !relativePath.endsWith('.txt'))) {
                            return;
                        }

                        // Determine category from folder structure inside the zip
                        const parts = relativePath.split('/');
                        let category = 'General';
                        if (parts.length > 1) {
                            category = parts.slice(0, -1)
                                .map(p => p.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
                                .join(' / ');
                        }
                        categoriesSet.add(category);
                        fileCount++;

                        const promise = zipEntry.async('string').then(async (text) => {
                            const firstLine = text.split('\n')[0].trim();
                            const nameMatch = firstLine.match(/^#\s+System Prompt:\s+(.+)/i) || firstLine.match(/^#\s+(.+)/);
                            
                            let extractedName = parts[parts.length - 1]
                                .replace(/\.[^/.]+$/, "")
                                .replace(/_sys_prompt$/, "")
                                .replace(/[_-]/g, " ")
                                .replace(/\b\w/g, c => c.toUpperCase());
                                
                            if (nameMatch) {
                                extractedName = nameMatch[1].trim();
                            }

                            let content = text.trim();
                            const lines = content.split('\n');
                            if (lines.length > 0 && lines[0].trim().startsWith('# ')) {
                                lines.shift();
                                if (lines[0] && lines[0].trim() === '---') lines.shift();
                                if (lines[0] && lines[0].trim() === '') lines.shift();
                                content = lines.join('\n').trim();
                            }

                            const payload = { name: extractedName, category, content };
                            await fetch('/api/user-prompts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                        });
                        filePromises.push(promise);
                    });

                    if (filePromises.length === 0) {
                        showToast('No valid .md or .txt prompt cards found inside the ZIP.', 'warning');
                    } else {
                        await Promise.all(filePromises);
                        showToast(`Successfully imported ${fileCount} prompt cards across ${categoriesSet.size} categories!`, 'success');
                        promptEditorModal?.classList.add('hidden');
                        state.promptContentCache.clear();
                    }
                } catch (err) {
                    console.error("ZIP import error:", err);
                    showToast('Error parsing ZIP file: ' + err.message, 'error');
                } finally {
                    promptImportBtn.textContent = originalText;
                    promptImportBtn.disabled = false;
                    promptImportFile.value = '';
                }
                return;
            }

            // Handle Single File Import (.md or .txt)
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                const firstLine = text.split('\n')[0].trim();
                const nameMatch = firstLine.match(/^#\s+System Prompt:\s+(.+)/i) || firstLine.match(/^#\s+(.+)/);
                
                let extractedName = file.name.replace(/\.[^/.]+$/, "").replace(/_sys_prompt$/, "").replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                if (nameMatch) {
                    extractedName = nameMatch[1].trim();
                }

                let extractedCategory = 'Story Writing';
                
                let content = text.trim();
                const lines = content.split('\n');
                if (lines.length > 0 && lines[0].trim().startsWith('# ')) {
                    lines.shift();
                    if (lines[0] && lines[0].trim() === '---') lines.shift();
                    if (lines[0] && lines[0].trim() === '') lines.shift();
                    content = lines.join('\n').trim();
                }

                if (promptNameInput) promptNameInput.value = extractedName;
                if (promptCategoryInput) promptCategoryInput.value = extractedCategory;
                if (promptContentInput) promptContentInput.value = content;
                
                promptImportFile.value = '';
            };
            reader.readAsText(file);
        }));
    }
}
