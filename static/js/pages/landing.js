/**
 * Landing Page - Database selection and creation
 */

import { DatabaseAPI } from '../core/api.js';
import { AppState } from '../core/state.js';
import { Modal } from '../components/modal.js';
import { Notification } from '../components/notification.js';
import { isValidDatabaseName } from '../utils/validators.js';
import { DateFormatter } from '../utils/date-formatter.js';

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await renderDatabaseList();
  setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const createDbBtn = document.getElementById('create-db-btn');
  createDbBtn.addEventListener('click', showCreateDatabaseModal);
}

/**
 * Render the list of existing databases
 */
async function renderDatabaseList() {
  const listContainer = document.getElementById('database-list');

  try {
    const databases = await DatabaseAPI.getAll();

    if (!databases || databases.length === 0) {
      listContainer.innerHTML = `
        <div class="database-empty">
          No databases yet. Create one to get started!
        </div>
      `;
      return;
    }

    const listHTML = `
      <div class="database-list">
        ${databases.map(db => {
          // Parse createdAt - handle both ISO string and Date object
          const createdDate = typeof db.createdAt === 'string'
            ? db.createdAt.split('T')[0]
            : new Date(db.createdAt).toISOString().split('T')[0];

          return `
            <div class="database-item">
              <div class="database-info">
                <div class="database-name">${db.name}</div>
                <div class="database-meta">
                  Created ${DateFormatter.toDisplay(createdDate)}
                </div>
              </div>
              <div class="database-actions">
                <button class="btn btn-primary btn-small" onclick="openDatabase('${db.id}')">Open</button>
                <button class="btn btn-danger btn-small" onclick="deleteDatabase('${db.id}', '${db.name}')">Delete</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    listContainer.innerHTML = listHTML;
  } catch (error) {
    console.error('Error loading databases:', error);
    Notification.error('Failed to load databases. Make sure the server is running.');
    listContainer.innerHTML = `
      <div class="database-empty">
        Failed to load databases. Make sure the server is running on port 8080.
      </div>
    `;
  }
}

/**
 * Show create database modal
 */
function showCreateDatabaseModal() {
  const contentHTML = `
    <form id="create-db-form">
      <div class="form-group">
        <label for="db-name" class="form-label required">Database Name</label>
        <input
          type="text"
          id="db-name"
          name="name"
          class="form-input"
          placeholder="e.g., Personal Finance 2026"
          required
          maxlength="100"
        >
        <span class="form-help">Give your database a descriptive name</span>
      </div>
    </form>
  `;

  const modal = Modal.create('create-db-modal', 'Create New Database', contentHTML);

  modal.setSubmitHandler(async () => {
    const form = document.getElementById('create-db-form');
    const nameInput = document.getElementById('db-name');
    const name = nameInput.value.trim();

    // Validate
    if (!isValidDatabaseName(name)) {
      nameInput.classList.add('error');
      Notification.error('Please enter a valid database name');
      return false; // Don't close modal
    }

    try {
      // Create database via API
      const database = await DatabaseAPI.create(name);
      await AppState.setActiveDatabase(database.id);

      Notification.success('Database created successfully!');

      // Redirect to dashboard
      window.location.href = 'dashboard.html';
    } catch (error) {
      console.error('Error creating database:', error);
      Notification.error('Failed to create database: ' + error.message);
      return false; // Don't close modal
    }
  });

  modal.show();
}

/**
 * Open a database
 * @param {string} dbId - Database ID
 */
window.openDatabase = async function(dbId) {
  try {
    await AppState.setActiveDatabase(dbId);
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error('Error opening database:', error);
    Notification.error('Failed to open database: ' + error.message);
  }
};

/**
 * Delete a database
 * @param {string} dbId - Database ID
 * @param {string} dbName - Database name
 */
window.deleteDatabase = async function(dbId, dbName) {
  const confirmed = confirm(`Are you sure you want to delete "${dbName}"? This action cannot be undone.`);

  if (!confirmed) return;

  try {
    await DatabaseAPI.delete(dbId);
    Notification.success('Database deleted');
    await renderDatabaseList();
  } catch (error) {
    console.error('Error deleting database:', error);
    Notification.error('Failed to delete database: ' + error.message);
  }
};
