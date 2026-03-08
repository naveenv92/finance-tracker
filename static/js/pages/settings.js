/**
 * Settings Page - Database-level user settings
 */

import { AppState } from '../core/state.js';
import { SettingsAPI } from '../core/api.js';
import { Notification } from '../components/notification.js';

// Check for active database
if (!AppState.requireActiveDatabase()) {
  // Will redirect to landing page
} else {
  document.addEventListener('DOMContentLoaded', init);
}

/**
 * Initialize settings page
 */
async function init() {
  const database = await AppState.getActiveDatabase();
  if (!database) {
    Notification.error('Failed to load database');
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    return;
  }

  document.getElementById('db-name-desc').textContent = database.name;

  await loadSettings();

  document.getElementById('save-btn').addEventListener('click', saveSettings);
}

/**
 * Load current settings from backend
 */
async function loadSettings() {
  const dbId = AppState.getActiveDatabaseId();
  try {
    const settings = await SettingsAPI.get(dbId);
    document.getElementById('owner-name').value = settings.ownerName || '';
  } catch (error) {
    console.error('Error loading settings:', error);
    Notification.error('Failed to load settings');
  }
}

/**
 * Save settings to backend
 */
async function saveSettings() {
  const dbId = AppState.getActiveDatabaseId();
  const ownerName = document.getElementById('owner-name').value.trim();

  try {
    await SettingsAPI.update(dbId, { ownerName });
    Notification.success('Settings saved');
  } catch (error) {
    console.error('Error saving settings:', error);
    Notification.error('Failed to save settings');
  }
}
