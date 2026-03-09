/**
 * Settings Page - Database-level user settings
 */

import { AppState } from '../core/state.js';
import { SettingsAPI, BackupAPI } from '../core/api.js';
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
  await loadBackups();

  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('create-backup-btn').addEventListener('click', createBackup);
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

/**
 * Load and render the list of all backups
 */
async function loadBackups() {
  try {
    const backups = await BackupAPI.list();
    renderBackups(backups);
  } catch (error) {
    console.error('Error loading backups:', error);
    Notification.error('Failed to load backups');
  }
}

/**
 * Render the backup list into the DOM
 */
function renderBackups(backups) {
  const list = document.getElementById('backups-list');
  const empty = document.getElementById('backups-empty');

  list.innerHTML = '';

  if (backups.length === 0) {
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';

  for (const backup of backups) {
    const li = document.createElement('li');
    li.className = 'backup-item';

    const info = document.createElement('div');
    info.className = 'backup-info';

    const name = document.createElement('span');
    name.className = 'backup-name';
    name.textContent = backup.databaseName;

    const meta = document.createElement('span');
    meta.className = 'backup-meta';
    meta.textContent = `${formatDate(backup.backedUpAt)} · ${formatSize(backup.size)}`;

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'backup-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-secondary btn-small';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => restoreBackup(backup.filename, backup.databaseName));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-small';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteBackup(backup.filename, li));

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  }
}

/**
 * Create a backup of the current database
 */
async function createBackup() {
  const dbId = AppState.getActiveDatabaseId();
  const btn = document.getElementById('create-backup-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    await BackupAPI.create(dbId);
    Notification.success('Backup created');
    await loadBackups();
  } catch (error) {
    console.error('Error creating backup:', error);
    Notification.error('Failed to create backup');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Backup';
  }
}

/**
 * Delete a backup file
 */
async function deleteBackup(filename, listItem) {
  if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) return;

  try {
    await BackupAPI.delete(filename);
    listItem.remove();
    const list = document.getElementById('backups-list');
    if (list.children.length === 0) {
      document.getElementById('backups-empty').style.display = '';
    }
    Notification.success('Backup deleted');
  } catch (error) {
    console.error('Error deleting backup:', error);
    Notification.error('Failed to delete backup');
  }
}

/**
 * Restore a database from a backup — creates a new database
 */
async function restoreBackup(filename, dbName) {
  if (!confirm(`Restore "${dbName}" from backup?\n\nThis will create a new database (the original is not affected).`)) return;

  try {
    const newDb = await BackupAPI.restore(filename);
    Notification.success(`Restored as "${newDb.name}"`);
  } catch (error) {
    console.error('Error restoring backup:', error);
    Notification.error('Failed to restore backup');
  }
}

/**
 * Format an ISO date string to a readable local date/time
 */
function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Format bytes to a human-readable size
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
