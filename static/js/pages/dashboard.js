/**
 * Dashboard Page - Main hub for all operations
 */

import { AppState } from '../core/state.js';
import { TransactionAPI, CategoryAPI, TemplateAPI } from '../core/api.js';
import { Modal } from '../components/modal.js';
import { Notification } from '../components/notification.js';
import { CSVParser } from '../utils/csv-parser.js';
import { DateFormatter } from '../utils/date-formatter.js';
import { cleanMerchantName } from '../utils/helpers.js';
import {
  isValidCategoryName,
  isValidHexColor,
  isValidEmoji,
  isValidTemplateName,
  isValidColumnName,
  isValidDateFormat,
  isValidCSVFile
} from '../utils/validators.js';

// Check for active database
if (!AppState.requireActiveDatabase()) {
  // Will redirect to landing page
} else {
  document.addEventListener('DOMContentLoaded', init);
}

/**
 * Initialize dashboard
 */
async function init() {
  const database = await AppState.getActiveDatabase();

  if (!database) {
    Notification.error('Failed to load database');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
    return;
  }

  document.getElementById('db-name').textContent = database.name;

  await renderStats();
  renderActions();
  setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  document.getElementById('change-db-btn').addEventListener('click', async () => {
    await AppState.clearActiveDatabase();
    window.location.href = 'index.html';
  });
}

/**
 * Render statistics cards
 */
async function renderStats() {
  const dbId = AppState.getActiveDatabaseId();

  let transactions = [];
  let categories = [];
  let templates = [];

  try {
    [transactions, categories, templates] = await Promise.all([
      TransactionAPI.getAll(dbId),
      CategoryAPI.getAll(dbId),
      TemplateAPI.getAll(dbId),
    ]);
  } catch (error) {
    console.error('Error loading stats:', error);
  }

  const unreviewed = transactions.filter(t => !t.reviewed).length;

  const statsHTML = `
    <div class="card stats-card">
      <div class="stats-value">${transactions.length}</div>
      <div class="stats-label">Total Transactions</div>
    </div>
    <div class="card stats-card">
      <div class="stats-value" style="color: ${unreviewed > 0 ? 'var(--color-warning)' : 'var(--color-success)'}">
        ${unreviewed}
      </div>
      <div class="stats-label">Unreviewed</div>
    </div>
    <div class="card stats-card">
      <div class="stats-value">${categories.length}</div>
      <div class="stats-label">Categories</div>
    </div>
    <div class="card stats-card">
      <div class="stats-value">${templates.length}</div>
      <div class="stats-label">CSV Templates</div>
    </div>
  `;

  document.getElementById('stats-grid').innerHTML = statsHTML;
}

/**
 * Render action cards
 */
function renderActions() {
  const actionsHTML = `
    <div class="card action-card" onclick="showImportCSVModal()">
      <div class="action-card-icon">📥</div>
      <div class="action-card-title">Import CSV</div>
      <div class="action-card-description">Upload a CSV file to import transactions</div>
    </div>
    <div class="card action-card" onclick="window.location.href='review.html'">
      <div class="action-card-icon">✏️</div>
      <div class="action-card-title">Review Transactions</div>
      <div class="action-card-description">Categorize and review imported transactions</div>
    </div>
    <div class="card action-card" onclick="window.location.href='transactions.html'">
      <div class="action-card-icon">📊</div>
      <div class="action-card-title">View Transactions</div>
      <div class="action-card-description">Browse all transactions in table format</div>
    </div>
    <div class="card action-card" onclick="showTemplatesModal()">
      <div class="action-card-icon">📋</div>
      <div class="action-card-title">Manage Templates</div>
      <div class="action-card-description">Create and manage CSV import templates</div>
    </div>
    <div class="card action-card" onclick="showCategoriesModal()">
      <div class="action-card-icon">🏷️</div>
      <div class="action-card-title">Manage Categories</div>
      <div class="action-card-description">Create and organize transaction categories</div>
    </div>
    <div class="card action-card" onclick="window.location.href='analytics.html'">
      <div class="action-card-icon">📈</div>
      <div class="action-card-title">Analytics</div>
      <div class="action-card-description">View spending insights and charts</div>
    </div>
  `;

  document.getElementById('actions-grid').innerHTML = actionsHTML;
}

/**
 * Show CSV import modal
 */
window.showImportCSVModal = async function() {
  const dbId = AppState.getActiveDatabaseId();

  let templates = [];
  try {
    templates = await TemplateAPI.getAll(dbId);
  } catch (error) {
    Notification.error('Failed to load templates');
    return;
  }

  if (templates.length === 0) {
    Notification.warning('Please create a CSV template first');
    showTemplatesModal();
    return;
  }

  const contentHTML = `
    <form id="import-csv-form">
      <div class="form-group">
        <label class="form-label required">CSV File</label>
        <div class="file-upload-area" id="csv-drop-zone" role="button" tabindex="0" aria-label="Upload CSV file">
          <div class="file-upload-icon">📄</div>
          <div class="file-upload-text">Drop your CSV here or <span style="color:var(--color-primary);font-weight:var(--font-weight-medium)">browse</span></div>
          <div class="file-upload-hint" id="csv-file-hint">Accepts .csv files</div>
        </div>
        <input type="file" id="csv-file" name="file" accept=".csv" required style="display:none">
      </div>
      <div class="form-group">
        <label for="template-select" class="form-label required">CSV Template</label>
        <select id="template-select" name="templateId" class="form-select" required>
          <option value="">Select a template...</option>
          ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
        <span class="form-help">Choose the template that matches your CSV format</span>
      </div>
    </form>
  `;

  const modal = Modal.create('import-csv-modal', 'Import CSV File', contentHTML);
  modal.setSubmitText('Import');

  modal.setSubmitHandler(async () => {
    const fileInput = document.getElementById('csv-file');
    const templateSelect = document.getElementById('template-select');
    const file = fileInput.files[0];
    const templateId = templateSelect.value;

    if (!file || !templateId) {
      Notification.error('Please select a file and template');
      return false;
    }

    if (!isValidCSVFile(file)) {
      Notification.error('Please select a valid CSV file');
      return false;
    }

    const template = templates.find(t => t.id === templateId);
    if (!template) {
      Notification.error('Template not found');
      return false;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvText = e.target.result;
        const { headers, rows } = CSVParser.parse(csvText);

        // Validate columns
        const validation = CSVParser.validateColumns(headers, template);
        if (!validation.isValid) {
          Notification.error(`Missing columns: ${validation.missing.join(', ')}`);
          resolve(false);
          return;
        }

        // Convert rows to transactions
        const debitSign = template.debitSign || 'positive';
        const transactions = rows.map(row => {
          const rawAmount = parseFloat(CSVParser.getValue(row, template.amountColumn).replace(/[,$]/g, ''));
          const amount = debitSign === 'negative' ? rawAmount * -1 : rawAmount;
          return {
            date: DateFormatter.standardize(CSVParser.getValue(row, template.dateColumn), template.dateFormat),
            merchant: cleanMerchantName(CSVParser.getValue(row, template.merchantColumn)),
            originalMerchant: CSVParser.getValue(row, template.merchantColumn),
            amount,
            categoryId: null,
            splits: '[]',
            reviewed: false,
            notes: '',
            source: template.name
          };
        });

        try {
          const result = await TransactionAPI.importMany(dbId, transactions);
          const { imported, duplicates } = result;
          if (duplicates > 0) {
            Notification.success(`Imported ${imported} transaction${imported !== 1 ? 's' : ''} (${duplicates} flagged as possible duplicate${duplicates !== 1 ? 's' : ''})`);
          } else {
            Notification.success(`Imported ${imported} transaction${imported !== 1 ? 's' : ''}`);
          }
          await renderStats();
          resolve(true);
        } catch (error) {
          Notification.error('Failed to import transactions: ' + error.message);
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  });

  modal.show();

  // Wire up the styled file drop zone — must be after show() so elements are in the DOM
  const dropZone = document.getElementById('csv-drop-zone');
  const fileInput = document.getElementById('csv-file');
  const fileHint = document.getElementById('csv-file-hint');

  const updateDropZone = (file) => {
    if (file) {
      fileHint.textContent = `✓ ${file.name}`;
      fileHint.style.color = 'var(--color-success)';
      dropZone.style.borderColor = 'var(--color-success)';
      dropZone.style.backgroundColor = 'rgba(16, 185, 129, 0.05)';
    } else {
      fileHint.textContent = 'Accepts .csv files';
      fileHint.style.color = '';
      dropZone.style.borderColor = '';
      dropZone.style.backgroundColor = '';
    }
  };

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  fileInput.addEventListener('change', () => updateDropZone(fileInput.files[0] || null));
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      updateDropZone(file);
    }
  });
};

/**
 * Show templates management modal
 */
window.showTemplatesModal = async function() {
  const dbId = AppState.getActiveDatabaseId();

  let templates = [];
  try {
    templates = await TemplateAPI.getAll(dbId);
  } catch (error) {
    Notification.error('Failed to load templates');
    return;
  }

  const contentHTML = generateTemplatesModalContent(templates);
  const modal = Modal.create('templates-modal', 'Manage CSV Templates', contentHTML);
  modal.setSubmitText('Create Template');

  modal.setSubmitHandler(async () => {
    const form = document.getElementById('template-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Validate
    if (!isValidTemplateName(data.name) || !isValidColumnName(data.dateColumn) ||
        !isValidColumnName(data.merchantColumn) || !isValidColumnName(data.amountColumn) ||
        !isValidDateFormat(data.dateFormat)) {
      Notification.error('Please fill in all fields correctly');
      return false;
    }

    try {
      await TemplateAPI.create(dbId, data);
      Notification.success('Template created successfully');

      // Refresh list and update modal content
      const updatedTemplates = await TemplateAPI.getAll(dbId);
      modal.updateContent(generateTemplatesModalContent(updatedTemplates));
      return false; // Keep modal open
    } catch (error) {
      Notification.error('Failed to create template: ' + error.message);
      return false;
    }
  });

  modal.show();
};

/**
 * Generate templates modal content HTML
 */
function generateTemplatesModalContent(templates) {
  return `
    <div style="margin-bottom: var(--spacing-lg);">
      <h4 style="margin-bottom: var(--spacing-md);">Existing Templates</h4>
      ${templates.length === 0 ? '<p class="text-muted">No templates created yet</p>' : `
        <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
          ${templates.map(t => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); border: 1px solid var(--gray-200); border-radius: var(--radius-md);">
              <div>
                <div style="font-weight: var(--font-weight-medium);">${t.name}</div>
                <div style="font-size: var(--font-size-xs); color: var(--gray-500);">
                  Date: ${t.dateColumn}, Merchant: ${t.merchantColumn}, Amount: ${t.amountColumn} (debits are ${t.debitSign || 'negative'})
                </div>
              </div>
              <button class="btn btn-danger btn-small" onclick="deleteTemplate('${t.id}')">Delete</button>
            </div>
          `).join('')}
        </div>
      `}
    </div>
    <div class="divider"></div>
    <h4 style="margin-bottom: var(--spacing-md);">Create New Template</h4>
    <form id="template-form">
      <div class="form-group">
        <label for="template-name" class="form-label required">Template Name</label>
        <input type="text" id="template-name" name="name" class="form-input" placeholder="e.g., Chase Sapphire" required>
      </div>
      <div class="form-group">
        <label for="date-column" class="form-label required">Date Column Name</label>
        <input type="text" id="date-column" name="dateColumn" class="form-input" placeholder="e.g., Transaction Date" required>
      </div>
      <div class="form-group">
        <label for="merchant-column" class="form-label required">Merchant Column Name</label>
        <input type="text" id="merchant-column" name="merchantColumn" class="form-input" placeholder="e.g., Description" required>
      </div>
      <div class="form-group">
        <label for="amount-column" class="form-label required">Amount Column Name</label>
        <input type="text" id="amount-column" name="amountColumn" class="form-input" placeholder="e.g., Amount" required>
      </div>
      <div class="form-group">
        <label for="date-format" class="form-label required">Date Format</label>
        <select id="date-format" name="dateFormat" class="form-select" required>
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          <option value="M/D/YYYY">M/D/YYYY</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label required">Debit Sign in CSV</label>
        <div style="display: flex; flex-direction: column; gap: var(--spacing-xs); margin-top: var(--spacing-xs);">
          <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
            <input type="radio" name="debitSign" value="negative">
            Debits are negative (e.g., -5.75)
          </label>
          <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
            <input type="radio" name="debitSign" value="positive" checked>
            Debits are positive (e.g., 5.75)
          </label>
        </div>
      </div>
    </form>
  `;
}

/**
 * Delete template
 */
window.deleteTemplate = async function(templateId) {
  const dbId = AppState.getActiveDatabaseId();

  if (!confirm('Delete this template?')) return;

  try {
    await TemplateAPI.delete(dbId, templateId);
    Notification.success('Template deleted');

    // Refresh list and update modal content
    const templates = await TemplateAPI.getAll(dbId);
    const modal = document.querySelector('.modal');
    if (modal) {
      const modalBody = modal.querySelector('.modal-body');
      if (modalBody) {
        modalBody.innerHTML = generateTemplatesModalContent(templates);
      }
    }
  } catch (error) {
    Notification.error('Failed to delete template: ' + error.message);
  }
};

/**
 * Generate categories modal content HTML
 */
function generateCategoriesModalContent(categories) {
  return `
    <div style="margin-bottom: var(--spacing-lg);">
      <h4 style="margin-bottom: var(--spacing-md);">Existing Categories</h4>
      ${categories.length === 0 ? '<p class="text-muted">No categories created yet</p>' : `
        <div style="display: flex; flex-wrap: wrap; gap: var(--spacing-sm);">
          ${categories.map(c => `
            <div style="display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); border: 1px solid var(--gray-200); border-radius: var(--radius-md);">
              <span class="category-badge" style="background-color: ${c.color};">
                ${c.emoji || ''} ${c.name}
              </span>
              <button class="btn btn-danger btn-small" onclick="deleteCategory('${c.id}')" style="padding: var(--spacing-xs);">✕</button>
            </div>
          `).join('')}
        </div>
      `}
    </div>
    <div class="divider"></div>
    <h4 style="margin-bottom: var(--spacing-md);">Create New Category</h4>
    <form id="category-form">
      <div class="form-group">
        <label for="category-name" class="form-label required">Category Name</label>
        <input type="text" id="category-name" name="name" class="form-input" placeholder="e.g., Food & Dining" required>
      </div>
      <div class="form-group">
        <label for="category-color" class="form-label required">Color</label>
        <div class="color-picker-wrapper">
          <input type="color" id="category-color" name="color" value="#FF6B6B" required>
          <input type="text" id="category-color-hex" class="form-input" value="#FF6B6B" pattern="^#[0-9A-Fa-f]{6}$" style="flex: 1;">
        </div>
      </div>
      <div class="form-group">
        <label for="category-emoji" class="form-label">Emoji (optional)</label>
        <div style="position: relative;">
          <div style="display: flex; gap: var(--spacing-sm);">
            <input type="text" id="category-emoji" name="emoji" class="form-input" placeholder="" maxlength="2" style="flex: 1;" readonly>
            <button type="button" class="btn btn-secondary" onclick="toggleEmojiPicker()" style="white-space: nowrap;">Pick Emoji</button>
            <button type="button" class="btn btn-secondary" onclick="clearEmoji()" style="white-space: nowrap;">Clear</button>
          </div>
          <div id="emoji-picker" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; z-index: 1000; background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: var(--spacing-sm); width: 300px; max-height: 220px; overflow-y: auto; box-shadow: var(--shadow-lg);">
            ${[
              { label: 'Food & Drink', emojis: ['🍔','🍕','🍜','🍣','🌮','🥗','☕','🍺','🍷','🥤','🍰','🛒'] },
              { label: 'Transport',   emojis: ['🚗','🚌','✈️','🚂','🚕','🛵','🚲','⛽','🅿️','🛳️'] },
              { label: 'Shopping',    emojis: ['🛍️','👗','👟','💄','🎮','📱','💻','📷','🎁','💍'] },
              { label: 'Home',        emojis: ['🏠','🔧','💡','📦','🧹','🪴','🛋️','🔑','🪣'] },
              { label: 'Health',      emojis: ['💊','🏥','🏋️','🧴','🩺','🦷','🧘','🩹'] },
              { label: 'Entertainment', emojis: ['🎬','🎵','🎮','📚','🎭','🎨','🎯','🎪','🎤'] },
              { label: 'Finance',     emojis: ['💰','💳','💵','📈','🏦','💹','🧾','📊','🪙'] },
              { label: 'Utilities',   emojis: ['📱','🌐','🔌','📡','💧','🔥','♻️'] },
              { label: 'People',      emojis: ['👤','👨‍👩‍👧','🧑‍💼','👶','🐶','🐱'] },
              { label: 'Other',       emojis: ['⭐','✅','❗','🔴','🟢','🔵','⚡','🎯','📝','🗓️'] },
            ].map(section => `
              <div style="margin-bottom: var(--spacing-sm);">
                <div style="font-size: var(--font-size-xs); color: var(--gray-500); margin-bottom: 2px; font-weight: var(--font-weight-medium);">${section.label}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 1px;">
                  ${section.emojis.map(e => `<button type="button" title="${e}" onclick="selectEmoji('${e}')" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 3px 5px; border-radius: var(--radius-sm);" onmouseover="this.style.background='var(--gray-100)'" onmouseout="this.style.background='none'">${e}</button>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </form>
  `;
}

/**
 * Toggle emoji picker visibility
 */
window.toggleEmojiPicker = function() {
  const picker = document.getElementById('emoji-picker');
  if (!picker) return;
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
};

/**
 * Select an emoji from the picker
 */
window.selectEmoji = function(emoji) {
  const input = document.getElementById('category-emoji');
  if (input) input.value = emoji;
  const picker = document.getElementById('emoji-picker');
  if (picker) picker.style.display = 'none';
};

/**
 * Clear the emoji input
 */
window.clearEmoji = function() {
  const input = document.getElementById('category-emoji');
  if (input) input.value = '';
};

/**
 * Setup color picker synchronization
 */
let emojiPickerListenerAdded = false;

function setupColorSync() {
  setTimeout(() => {
    // Close emoji picker when clicking outside (register once)
    if (!emojiPickerListenerAdded) {
      emojiPickerListenerAdded = true;
      document.addEventListener('click', (e) => {
        const picker = document.getElementById('emoji-picker');
        if (!picker) return;
        if (!picker.contains(e.target) && !e.target.closest('[onclick="toggleEmojiPicker()"]')) {
          picker.style.display = 'none';
        }
      }, { capture: true, passive: true });
    }

    const colorInput = document.getElementById('category-color');
    const colorHexInput = document.getElementById('category-color-hex');

    if (!colorInput || !colorHexInput) return;

    colorInput.addEventListener('input', () => {
      colorHexInput.value = colorInput.value.toUpperCase();
    });

    colorHexInput.addEventListener('input', () => {
      if (isValidHexColor(colorHexInput.value)) {
        colorInput.value = colorHexInput.value;
      }
    });
  }, 100);
}

/**
 * Show categories management modal
 */
window.showCategoriesModal = async function() {
  const dbId = AppState.getActiveDatabaseId();

  try {
    const categories = await CategoryAPI.getAll(dbId);

    const contentHTML = generateCategoriesModalContent(categories);
    const modal = Modal.create('categories-modal', 'Manage Categories', contentHTML);
    modal.setSubmitText('Create Category');

    modal.setSubmitHandler(async () => {
      // Sync color inputs
      const colorInput = document.getElementById('category-color');
      const colorHexInput = document.getElementById('category-color-hex');
      if (colorInput && colorHexInput) {
        colorInput.value = colorHexInput.value;
      }

      const form = document.getElementById('category-form');
      if (!form) return false;

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      // Validate
      if (!isValidCategoryName(data.name) || !isValidHexColor(data.color) || !isValidEmoji(data.emoji)) {
        Notification.error('Please fill in all fields correctly');
        return false;
      }

      try {
        await CategoryAPI.create(dbId, {
          name: data.name,
          color: data.color.toUpperCase(),
          emoji: data.emoji
        });

        Notification.success('Category created successfully');

        // Refresh categories and update modal content
        const updatedCategories = await CategoryAPI.getAll(dbId);
        modal.updateContent(generateCategoriesModalContent(updatedCategories));

        setupColorSync();

        // Reset the form
        const newForm = document.getElementById('category-form');
        if (newForm) {
          newForm.reset();
          const ci = document.getElementById('category-color');
          const chi = document.getElementById('category-color-hex');
          if (ci) ci.value = '#FF6B6B';
          if (chi) chi.value = '#FF6B6B';
        }

        return false; // Don't close modal
      } catch (error) {
        Notification.error('Failed to create category: ' + error.message);
        return false;
      }
    });

    setupColorSync();
    modal.show();
  } catch (error) {
    Notification.error('Failed to load categories: ' + error.message);
  }
};

/**
 * Delete category
 */
window.deleteCategory = async function(categoryId) {
  const dbId = AppState.getActiveDatabaseId();

  if (!confirm('Delete this category?')) return;

  try {
    await CategoryAPI.delete(dbId, categoryId);
    Notification.success('Category deleted');

    // Refresh categories and update modal content
    const categories = await CategoryAPI.getAll(dbId);
    const modal = document.querySelector('.modal');
    if (modal) {
      const modalBody = modal.querySelector('.modal-body');
      if (modalBody) {
        modalBody.innerHTML = generateCategoriesModalContent(categories);
        setupColorSync();
      }
    }
  } catch (error) {
    Notification.error('Failed to delete category: ' + error.message);
  }
};
