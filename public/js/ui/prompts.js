import { state } from '../state.js';
import {
    fetchPromptContent,
    getAllPromptCategories,
    lookupPromptName
} from '../api.js';

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
