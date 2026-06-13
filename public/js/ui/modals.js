import { state, escapeHtml } from '../state.js';

// Close API Key Modal
export function closeModal() {
    const keyModal = document.getElementById('key-modal');
    if (keyModal) {
        keyModal.classList.add('hidden');
    }
}

// Close delete confirmation modal
export function closeDeleteConfirmModal() {
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    if (deleteConfirmModal) {
        deleteConfirmModal.classList.add('hidden');
    }
    state.conversationIdToDelete = null;
}

// UX & Toast Notifications
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'error') icon = '❌';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    // Smooth fade-in
    setTimeout(() => {
        toast.classList.add('visible');
    }, 10);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}
