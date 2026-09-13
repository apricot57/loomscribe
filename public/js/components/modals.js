/**
 * modals.js — Modal Dialogs Aggregator & Orchestrator
 *
 * Re-exports and initializes modular modal components:
 * - settings-modal.js: Settings dialog (Providers, Parameters, Custom Models, Appearance)
 * - preset-picker.js: Scenario & Prompt Engine Preset Picker
 * - preset-manager.js: Preset CRUD, JSON Import/Export & Editor
 * - delete-modal.js: Confirmation dialog for deletions
 */

import { initSettingsModalEvents, openSettingsModal, closeSettingsModal, applyTheme } from './settings-modal.js';
import { initPresetPickerEvents, openPresetPickerModal, closePresetPickerModal } from './preset-picker.js';
import { initPresetManagerEvents, openPresetManagerModal, closePresetManagerModal } from './preset-manager.js';
import { initDeleteModalEvents, openDeleteModal, closeDeleteModal } from './delete-modal.js';

export function initModals() {
    initSettingsModalEvents();
    initPresetPickerEvents();
    initPresetManagerEvents();
    initDeleteModalEvents();
}

export {
    openSettingsModal,
    closeSettingsModal,
    applyTheme,
    openPresetPickerModal,
    closePresetPickerModal,
    openPresetManagerModal,
    closePresetManagerModal,
    openDeleteModal,
    closeDeleteModal
};
