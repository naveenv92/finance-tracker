/**
 * Dashboard Page - Main hub for all operations
 */

import { AppState } from '../core/state.js';
import { TransactionAPI, CategoryAPI, TemplateAPI, MerchantMappingAPI } from '../core/api.js';
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

  // Auto-open modal from sidebar link (e.g. ?modal=import)
  const urlModal = new URLSearchParams(window.location.search).get('modal');
  if (urlModal === 'import') window.showImportCSVModal();
  else if (urlModal === 'categories') window.showCategoriesModal();
  else if (urlModal === 'templates') window.showTemplatesModal();
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
    <div class="card action-card" onclick="window.location.href='analytics.html'">
      <div class="action-card-icon">📈</div>
      <div class="action-card-title">Analytics</div>
      <div class="action-card-description">View spending insights and charts</div>
    </div>
    <div class="card action-card" onclick="window.location.href='settle.html'">
      <div class="action-card-icon">🤝</div>
      <div class="action-card-title">Settle Debts</div>
      <div class="action-card-description">See who owes who and record settlements</div>
    </div>
    <div class="card action-card" onclick="showCategoriesModal()">
      <div class="action-card-icon">🏷️</div>
      <div class="action-card-title">Manage Categories</div>
      <div class="action-card-description">Create and organize transaction categories</div>
    </div>
    <div class="card action-card" onclick="showTemplatesModal()">
      <div class="action-card-icon">📋</div>
      <div class="action-card-title">Manage Templates</div>
      <div class="action-card-description">Create and manage CSV import templates</div>
    </div>
    <div class="card action-card" onclick="showMerchantMappingsModal()">
      <div class="action-card-icon">🏪</div>
      <div class="action-card-title">Manage Merchant Mappings</div>
      <div class="action-card-description">Auto-rename merchants and fix them everywhere</div>
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
        <input type="file" id="csv-file" name="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" required style="display:none">
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
          // App convention: expenses negative, income/refunds positive. If debits are
          // recorded as positive in the CSV, negate so they land negative internally;
          // if debits are already negative in the CSV, they already match and pass through.
          const amount = debitSign === 'positive' ? rawAmount * -1 : rawAmount;
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

  let editingTemplate = null;
  const getEditingTemplate = () => editingTemplate;
  const setEditingTemplate = (t) => { editingTemplate = t; };

  let templates = [];
  try {
    templates = await TemplateAPI.getAll(dbId);
  } catch (error) {
    Notification.error('Failed to load templates');
    return;
  }

  const contentHTML = generateTemplatesModalContent(templates, null);
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
      if (editingTemplate) {
        await TemplateAPI.update(dbId, { id: editingTemplate.id, ...data });
        Notification.success('Template updated');
        setEditingTemplate(null);
        modal.setSubmitText('Create Template');
      } else {
        await TemplateAPI.create(dbId, data);
        Notification.success('Template created successfully');
      }

      const updatedTemplates = await TemplateAPI.getAll(dbId);
      modal.updateContent(generateTemplatesModalContent(updatedTemplates, null));
      setupTemplateItemListeners(dbId, modal, getEditingTemplate, setEditingTemplate);
      return false; // Keep modal open
    } catch (error) {
      Notification.error('Failed to save template: ' + error.message);
      return false;
    }
  });

  modal.show();
  setupTemplateItemListeners(dbId, modal, getEditingTemplate, setEditingTemplate);
};

/**
 * Generate templates modal content HTML
 */
function generateTemplatesModalContent(templates, editingTemplate) {
  const formTitle = editingTemplate ? 'Edit Template' : 'Create New Template';
  const t = editingTemplate;

  return `
    <div style="margin-bottom: var(--spacing-lg);">
      <h4 style="margin-bottom: var(--spacing-md);">Existing Templates</h4>
      ${templates.length === 0 ? '<p class="text-muted">No templates created yet</p>' : `
        <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
          ${templates.map(tmpl => `
            <div class="template-item-selectable${editingTemplate && editingTemplate.id === tmpl.id ? ' selected' : ''}"
                 data-id="${tmpl.id}"
                 data-name="${tmpl.name.replace(/"/g, '&quot;')}"
                 data-date-column="${tmpl.dateColumn.replace(/"/g, '&quot;')}"
                 data-merchant-column="${tmpl.merchantColumn.replace(/"/g, '&quot;')}"
                 data-amount-column="${tmpl.amountColumn.replace(/"/g, '&quot;')}"
                 data-date-format="${tmpl.dateFormat}"
                 data-debit-sign="${tmpl.debitSign || 'positive'}"
                 data-owner-name="${(tmpl.ownerName || '').replace(/"/g, '&quot;')}">
              <div>
                <div style="font-weight: var(--font-weight-medium);">${tmpl.name}</div>
                <div style="font-size: var(--font-size-xs); color: var(--gray-500);">
                  Date: ${tmpl.dateColumn}, Merchant: ${tmpl.merchantColumn}, Amount: ${tmpl.amountColumn} (debits are ${tmpl.debitSign || 'positive'})
                  ${tmpl.ownerName ? `<br>Owner: ${tmpl.ownerName}` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <p class="form-hint" style="margin-top: var(--spacing-sm);">Click a template to edit or delete it.</p>
      `}
    </div>
    <div class="divider"></div>
    <div id="template-form-section">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
        <h4>${formTitle}</h4>
        ${editingTemplate ? `<button type="button" class="btn btn-secondary btn-small" id="cancel-template-edit-btn">Cancel</button>` : ''}
      </div>
      <form id="template-form">
        <div class="form-group">
          <label for="template-name" class="form-label required">Template Name</label>
          <input type="text" id="template-name" name="name" class="form-input" placeholder="e.g., Chase Sapphire" value="${t ? t.name : ''}" required>
        </div>
        <div class="form-group">
          <label for="date-column" class="form-label required">Date Column Name</label>
          <input type="text" id="date-column" name="dateColumn" class="form-input" placeholder="e.g., Transaction Date" value="${t ? t.dateColumn : ''}" required>
        </div>
        <div class="form-group">
          <label for="merchant-column" class="form-label required">Merchant Column Name</label>
          <input type="text" id="merchant-column" name="merchantColumn" class="form-input" placeholder="e.g., Description" value="${t ? t.merchantColumn : ''}" required>
        </div>
        <div class="form-group">
          <label for="amount-column" class="form-label required">Amount Column Name</label>
          <input type="text" id="amount-column" name="amountColumn" class="form-input" placeholder="e.g., Amount" value="${t ? t.amountColumn : ''}" required>
        </div>
        <div class="form-group">
          <label for="date-format" class="form-label required">Date Format</label>
          <select id="date-format" name="dateFormat" class="form-select" required>
            <option value="MM/DD/YYYY" ${!t || t.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option>
            <option value="DD/MM/YYYY" ${t && t.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY</option>
            <option value="YYYY-MM-DD" ${t && t.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
            <option value="M/D/YYYY" ${t && t.dateFormat === 'M/D/YYYY' ? 'selected' : ''}>M/D/YYYY</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Debit Sign in CSV</label>
          <div style="display: flex; flex-direction: column; gap: var(--spacing-xs); margin-top: var(--spacing-xs);">
            <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
              <input type="radio" name="debitSign" value="negative" ${t && t.debitSign === 'negative' ? 'checked' : ''}>
              Debits are negative (e.g., -5.75)
            </label>
            <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
              <input type="radio" name="debitSign" value="positive" ${!t || t.debitSign === 'positive' ? 'checked' : ''}>
              Debits are positive (e.g., 5.75)
            </label>
          </div>
        </div>
        <div class="form-group">
          <label for="template-owner-name" class="form-label">Owner Name</label>
          <input type="text" id="template-owner-name" name="ownerName" class="form-input" placeholder="e.g., Alex" value="${t ? t.ownerName || '' : ''}">
          <span class="form-help">The person auto-assigned 100% when reviewing transactions imported with this template. Leave blank to use the Owner Name from Settings.</span>
        </div>
      </form>
    </div>
  `;
}

let activeTemplateMenu = null;

function closeTemplateMenu() {
  if (activeTemplateMenu) {
    activeTemplateMenu.remove();
    activeTemplateMenu = null;
  }
  document.querySelectorAll('.template-item-selectable.menu-open').forEach(el => el.classList.remove('menu-open'));
}

/**
 * Attach click listeners to template items for the popup menu
 */
function setupTemplateItemListeners(dbId, modal, getEditingTemplate, setEditingTemplate) {
  document.querySelectorAll('.template-item-selectable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();

      const alreadyOpen = el.classList.contains('menu-open');
      closeTemplateMenu();
      if (alreadyOpen) return;

      el.classList.add('menu-open');

      const template = {
        id: el.dataset.id,
        name: el.dataset.name,
        dateColumn: el.dataset.dateColumn,
        merchantColumn: el.dataset.merchantColumn,
        amountColumn: el.dataset.amountColumn,
        dateFormat: el.dataset.dateFormat,
        debitSign: el.dataset.debitSign,
        ownerName: el.dataset.ownerName,
      };

      const menu = document.createElement('div');
      menu.className = 'category-context-menu';
      menu.innerHTML = `
        <button class="category-menu-btn" data-action="edit">Edit</button>
        <button class="category-menu-btn category-menu-btn--delete" data-action="delete">Delete</button>
      `;
      el.appendChild(menu);
      activeTemplateMenu = menu;

      menu.querySelector('[data-action="edit"]').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeTemplateMenu();
        setEditingTemplate(template);
        const templates = await TemplateAPI.getAll(dbId);
        modal.updateContent(generateTemplatesModalContent(templates, template));
        modal.setSubmitText('Save Changes');
        setupTemplateItemListeners(dbId, modal, getEditingTemplate, setEditingTemplate);
        document.getElementById('cancel-template-edit-btn')?.addEventListener('click', async () => {
          setEditingTemplate(null);
          const refreshed = await TemplateAPI.getAll(dbId);
          modal.updateContent(generateTemplatesModalContent(refreshed, null));
          modal.setSubmitText('Create Template');
          setupTemplateItemListeners(dbId, modal, getEditingTemplate, setEditingTemplate);
        });
      });

      menu.querySelector('[data-action="delete"]').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeTemplateMenu();
        if (!confirm('Delete this template?')) return;
        try {
          await TemplateAPI.delete(dbId, template.id);
          Notification.success('Template deleted');
          if (getEditingTemplate()?.id === template.id) setEditingTemplate(null);
          const templates = await TemplateAPI.getAll(dbId);
          modal.updateContent(generateTemplatesModalContent(templates, getEditingTemplate()));
          modal.setSubmitText(getEditingTemplate() ? 'Save Changes' : 'Create Template');
          setupTemplateItemListeners(dbId, modal, getEditingTemplate, setEditingTemplate);
        } catch (error) {
          Notification.error('Failed to delete template: ' + error.message);
        }
      });
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', closeTemplateMenu, { once: true, capture: true });
}

/**
 * Show merchant mappings management modal
 */
window.showMerchantMappingsModal = async function() {
  const dbId = AppState.getActiveDatabaseId();

  let editingMapping = null;
  const getEditingMapping = () => editingMapping;
  const setEditingMapping = (m) => { editingMapping = m; };

  let conflicts = [];
  const getConflicts = () => conflicts;
  const setConflicts = (c) => { conflicts = c; };

  let mappings = [];
  try {
    mappings = await MerchantMappingAPI.getAll(dbId);
  } catch (error) {
    Notification.error('Failed to load merchant mappings');
    return;
  }

  const contentHTML = generateMerchantMappingsModalContent(mappings, null, conflicts);
  const modal = Modal.create('merchant-mappings-modal', 'Manage Merchant Mappings', contentHTML);
  modal.setSubmitText('Create Mapping');

  modal.setSubmitHandler(async () => {
    const form = document.getElementById('merchant-mapping-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.originalMerchant?.trim() || !data.mappedMerchant?.trim()) {
      Notification.error('Please fill in both fields');
      return false;
    }

    try {
      let result;
      if (editingMapping) {
        result = await MerchantMappingAPI.update(dbId, { id: editingMapping.id, ...data });
        Notification.success(mappingSavedMessage('Mapping updated', result.appliedCount));
        setEditingMapping(null);
        modal.setSubmitText('Create Mapping');
      } else {
        result = await MerchantMappingAPI.create(dbId, data);
        Notification.success(mappingSavedMessage('Mapping created', result.appliedCount));
      }

      const updatedMappings = await MerchantMappingAPI.getAll(dbId);
      modal.updateContent(generateMerchantMappingsModalContent(updatedMappings, null, getConflicts()));
      setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts);
      return false; // Keep modal open
    } catch (error) {
      Notification.error('Failed to save mapping: ' + error.message);
      return false;
    }
  });

  modal.show();
  setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts);
};

function mappingSavedMessage(prefix, appliedCount) {
  return appliedCount > 0
    ? `${prefix} — applied to ${appliedCount} transaction${appliedCount !== 1 ? 's' : ''}`
    : prefix;
}

/**
 * Generate merchant mappings modal content HTML
 */
function generateMerchantMappingsModalContent(mappings, editingMapping, conflicts) {
  const formTitle = editingMapping ? 'Edit Mapping' : 'Create New Mapping';
  const m = editingMapping;

  return `
    <div style="margin-bottom: var(--spacing-lg);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
        <h4 style="margin: 0;">Existing Mappings</h4>
        <button type="button" class="btn btn-secondary btn-small" id="scan-mappings-btn">Scan Existing Transactions</button>
      </div>
      ${mappings.length === 0 ? '<p class="text-muted">No merchant mappings saved yet</p>' : `
        <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
          ${mappings.map(mp => `
            <div class="template-item-selectable${editingMapping && editingMapping.id === mp.id ? ' selected' : ''}"
                 data-id="${mp.id}"
                 data-original-merchant="${mp.originalMerchant.replace(/"/g, '&quot;')}"
                 data-mapped-merchant="${mp.mappedMerchant.replace(/"/g, '&quot;')}">
              <div style="font-weight: var(--font-weight-medium);">${mp.originalMerchant} &rarr; ${mp.mappedMerchant}</div>
            </div>
          `).join('')}
        </div>
        <p class="form-hint" style="margin-top: var(--spacing-sm);">Click a mapping to edit or delete it.</p>
      `}
    </div>
    ${conflicts && conflicts.length > 0 ? `
    <div class="divider"></div>
    <div style="margin-bottom: var(--spacing-lg);">
      <h4 style="margin-bottom: var(--spacing-sm);">Needs Review (${conflicts.length})</h4>
      <p class="form-hint" style="margin-bottom: var(--spacing-md);">These merchants were renamed to more than one spelling in the past. Pick the correct one to apply everywhere.</p>
      <div style="display: flex; flex-direction: column; gap: var(--spacing-md);">
        ${conflicts.map((c, idx) => `
          <div class="mapping-conflict-item" data-original-merchant="${c.originalMerchant.replace(/"/g, '&quot;')}" data-conflict-index="${idx}">
            <div style="font-weight: var(--font-weight-medium); margin-bottom: var(--spacing-xs);">${c.originalMerchant}</div>
            <div style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
              ${c.variants.map(v => `
                <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
                  <input type="radio" name="conflict-${idx}" value="${v.merchant.replace(/"/g, '&quot;')}">
                  ${v.merchant} <span class="text-muted">(${v.count})</span>
                </label>
              `).join('')}
              <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                <input type="radio" name="conflict-${idx}" value="__other__" class="conflict-other-radio">
                <input type="text" class="form-input conflict-other-input" placeholder="Other spelling..." style="max-width: 200px;">
              </label>
            </div>
            <button type="button" class="btn btn-secondary btn-small resolve-conflict-btn" data-conflict-index="${idx}" style="margin-top: var(--spacing-sm);">Resolve</button>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
    <div class="divider"></div>
    <div id="merchant-mapping-form-section">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
        <h4>${formTitle}</h4>
        ${editingMapping ? `<button type="button" class="btn btn-secondary btn-small" id="cancel-mapping-edit-btn">Cancel</button>` : ''}
      </div>
      <form id="merchant-mapping-form">
        <div class="form-group">
          <label for="mapping-original-merchant" class="form-label required">Original Merchant Name</label>
          <input type="text" id="mapping-original-merchant" name="originalMerchant" class="form-input" placeholder="e.g., AMAZON MKTPLACE PMTS" value="${m ? m.originalMerchant : ''}" required>
          <span class="form-help">The auto-cleaned name as it appears before editing (see "Original" on the Review page).</span>
        </div>
        <div class="form-group">
          <label for="mapping-mapped-merchant" class="form-label required">Canonical Name</label>
          <input type="text" id="mapping-mapped-merchant" name="mappedMerchant" class="form-input" placeholder="e.g., Amazon" value="${m ? m.mappedMerchant : ''}" required>
        </div>
      </form>
    </div>
  `;
}

let activeMappingMenu = null;

function closeMappingMenu() {
  if (activeMappingMenu) {
    activeMappingMenu.remove();
    activeMappingMenu = null;
  }
  document.querySelectorAll('.template-item-selectable.menu-open').forEach(el => el.classList.remove('menu-open'));
}

/**
 * Attach listeners for the merchant mappings modal: item edit/delete popup
 * menu, the scan button, and conflict-resolution rows.
 */
function setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts) {
  document.querySelectorAll('.template-item-selectable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();

      const alreadyOpen = el.classList.contains('menu-open');
      closeMappingMenu();
      if (alreadyOpen) return;

      el.classList.add('menu-open');

      const mapping = {
        id: el.dataset.id,
        originalMerchant: el.dataset.originalMerchant,
        mappedMerchant: el.dataset.mappedMerchant,
      };

      const menu = document.createElement('div');
      menu.className = 'category-context-menu';
      menu.innerHTML = `
        <button class="category-menu-btn" data-action="edit">Edit</button>
        <button class="category-menu-btn category-menu-btn--delete" data-action="delete">Delete</button>
      `;
      el.appendChild(menu);
      activeMappingMenu = menu;

      menu.querySelector('[data-action="edit"]').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeMappingMenu();
        setEditingMapping(mapping);
        const mappings = await MerchantMappingAPI.getAll(dbId);
        modal.updateContent(generateMerchantMappingsModalContent(mappings, mapping, getConflicts()));
        modal.setSubmitText('Save Changes');
        setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts);
        document.getElementById('cancel-mapping-edit-btn')?.addEventListener('click', async () => {
          setEditingMapping(null);
          const refreshed = await MerchantMappingAPI.getAll(dbId);
          modal.updateContent(generateMerchantMappingsModalContent(refreshed, null, getConflicts()));
          modal.setSubmitText('Create Mapping');
          setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts);
        });
      });

      menu.querySelector('[data-action="delete"]').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeMappingMenu();
        if (!confirm('Delete this mapping? Existing transactions keep their current merchant name — this only stops future auto-apply.')) return;
        try {
          await MerchantMappingAPI.delete(dbId, mapping.id);
          Notification.success('Mapping deleted');
          if (getEditingMapping()?.id === mapping.id) setEditingMapping(null);
          const mappings = await MerchantMappingAPI.getAll(dbId);
          modal.updateContent(generateMerchantMappingsModalContent(mappings, getEditingMapping(), getConflicts()));
          modal.setSubmitText(getEditingMapping() ? 'Save Changes' : 'Create Mapping');
          setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts);
        } catch (error) {
          Notification.error('Failed to delete mapping: ' + error.message);
        }
      });
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', closeMappingMenu, { once: true, capture: true });

  document.getElementById('scan-mappings-btn')?.addEventListener('click', async () => {
    try {
      const { migrated, conflicts } = await MerchantMappingAPI.scan(dbId);
      setConflicts(conflicts || []);

      const appliedTotal = (migrated || []).reduce((sum, m) => sum + m.appliedCount, 0);
      if (migrated.length === 0 && conflicts.length === 0) {
        Notification.success('No new historical renames found');
      } else {
        Notification.success(`Migrated ${migrated.length} merchant name${migrated.length !== 1 ? 's' : ''}, applied to ${appliedTotal} transaction${appliedTotal !== 1 ? 's' : ''}${conflicts.length > 0 ? ` — ${conflicts.length} need${conflicts.length === 1 ? 's' : ''} your review` : ''}`);
      }

      const mappings = await MerchantMappingAPI.getAll(dbId);
      modal.updateContent(generateMerchantMappingsModalContent(mappings, getEditingMapping(), getConflicts()));
      setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts);
    } catch (error) {
      Notification.error('Failed to scan transactions: ' + error.message);
    }
  });

  document.querySelectorAll('.resolve-conflict-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.conflictIndex);
      const item = document.querySelector(`.mapping-conflict-item[data-conflict-index="${idx}"]`);
      const selected = item.querySelector(`input[name="conflict-${idx}"]:checked`);
      if (!selected) {
        Notification.error('Please choose a spelling to resolve this conflict');
        return;
      }

      const mappedMerchant = selected.value === '__other__'
        ? item.querySelector('.conflict-other-input').value.trim()
        : selected.value;

      if (!mappedMerchant) {
        Notification.error('Please enter a spelling to resolve this conflict');
        return;
      }

      try {
        const originalMerchant = item.dataset.originalMerchant;
        const result = await MerchantMappingAPI.create(dbId, { originalMerchant, mappedMerchant });
        Notification.success(mappingSavedMessage('Conflict resolved', result.appliedCount));

        const remainingConflicts = getConflicts().filter((_, i) => i !== idx);
        setConflicts(remainingConflicts);

        const mappings = await MerchantMappingAPI.getAll(dbId);
        modal.updateContent(generateMerchantMappingsModalContent(mappings, getEditingMapping(), getConflicts()));
        setupMerchantMappingItemListeners(dbId, modal, getEditingMapping, setEditingMapping, getConflicts, setConflicts);
      } catch (error) {
        Notification.error('Failed to resolve conflict: ' + error.message);
      }
    });
  });
}

const CATEGORY_COLORS = [
  '#EF4444','#DC2626','#F97316','#FB923C','#F59E0B',
  '#FBBF24','#EAB308','#84CC16','#A3E635','#22C55E',
  '#16A34A','#10B981','#34D399','#14B8A6','#2DD4BF',
  '#06B6D4','#0EA5E9','#3B82F6','#60A5FA','#6366F1',
  '#818CF8','#8B5CF6','#A855F7','#C084FC','#EC4899',
  '#F472B6','#F43F5E','#FB7185','#78716C','#6B7280',
];

const EMOJI_SECTIONS = [
  { label: 'Food & Drink', emojis: ['🍔','🍕','🍜','🍣','🌮','🥗','☕','🍺','🍷','🥤','🍰','🛒'] },
  { label: 'Transport',    emojis: ['🚗','🚌','✈️','🚂','🚕','🛵','🚲','⛽','🅿️','🛳️'] },
  { label: 'Shopping',     emojis: ['🛍️','👗','👟','💄','🎮','📱','💻','📷','🎁','💍'] },
  { label: 'Home',         emojis: ['🏠','🔧','💡','📦','🧹','🪴','🛋️','🔑','🪣'] },
  { label: 'Health',       emojis: ['💊','🏥','🏋️','🧴','🩺','🦷','🧘','🩹'] },
  { label: 'Entertainment',emojis: ['🎬','🎵','🎮','📚','🎭','🎨','🎯','🎪','🎤'] },
  { label: 'Finance',      emojis: ['💰','💳','💵','📈','🏦','💹','🧾','📊','🪙'] },
  { label: 'Utilities',    emojis: ['📱','🌐','🔌','📡','💧','🔥','♻️'] },
  { label: 'People',       emojis: ['👤','👨‍👩‍👧','🧑‍💼','👶','🐶','🐱'] },
  { label: 'Other',        emojis: ['⭐','✅','❗','🔴','🟢','🔵','⚡','🎯','📝','🗓️'] },
];

function buildColorSwatches(selectedColor = null) {
  return `<div class="color-swatches">
    ${CATEGORY_COLORS.map((c, i) => `
      <label class="color-swatch-label" title="${c}">
        <input type="radio" name="color" value="${c}" ${(selectedColor ? c === selectedColor : i === 0) ? 'checked' : ''} required>
        <span class="color-swatch" style="background:${c};"></span>
      </label>
    `).join('')}
  </div>`;
}

function buildEmojiPickerHTML(prefillEmoji = '') {
  return `
    <div style="position: relative;">
      <div style="display: flex; gap: var(--spacing-sm);">
        <input type="text" id="category-emoji" name="emoji" class="form-input" placeholder="" maxlength="2" style="flex: 1;" readonly value="${prefillEmoji}">
        <button type="button" class="btn btn-secondary" onclick="toggleEmojiPicker()" style="white-space: nowrap;">Pick Emoji</button>
        <button type="button" class="btn btn-secondary" onclick="clearEmoji()" style="white-space: nowrap;">Clear</button>
      </div>
      <div id="emoji-picker" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; z-index: 1000; background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: var(--spacing-sm); width: 300px; max-height: 220px; overflow-y: auto; box-shadow: var(--shadow-lg);">
        ${EMOJI_SECTIONS.map(section => `
          <div style="margin-bottom: var(--spacing-sm);">
            <div style="font-size: var(--font-size-xs); color: var(--gray-500); margin-bottom: 2px; font-weight: var(--font-weight-medium);">${section.label}</div>
            <div style="display: flex; flex-wrap: wrap; gap: 1px;">
              ${section.emojis.map(e => `<button type="button" title="${e}" onclick="selectEmoji('${e}')" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 3px 5px; border-radius: var(--radius-sm);" onmouseover="this.style.background='var(--gray-100)'" onmouseout="this.style.background='none'">${e}</button>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

/**
 * Generate categories modal content HTML
 */
function generateCategoriesModalContent(categories, editingCategory = null) {
  const formTitle = editingCategory ? 'Edit Category' : 'Create New Category';
  const namePrefill = editingCategory ? editingCategory.name : '';
  const colorPrefill = editingCategory ? editingCategory.color : null;
  const emojiPrefill = editingCategory ? (editingCategory.emoji || '') : '';

  return `
    <div style="margin-bottom: var(--spacing-lg);">
      <h4 style="margin-bottom: var(--spacing-md);">Existing Categories</h4>
      ${categories.length === 0 ? '<p class="text-muted">No categories created yet</p>' : `
        <div style="display: flex; flex-wrap: wrap; gap: var(--spacing-sm);">
          ${categories.map(c => `
            <div class="category-item-selectable${editingCategory && editingCategory.id === c.id ? ' selected' : ''}"
                 data-id="${c.id}"
                 data-name="${c.name.replace(/"/g, '&quot;')}"
                 data-color="${c.color}"
                 data-emoji="${(c.emoji || '').replace(/"/g, '&quot;')}">
              <span class="category-badge" style="background-color: ${c.color}; cursor: pointer;">
                ${c.emoji || ''} ${c.name}
              </span>
            </div>
          `).join('')}
        </div>
        <p class="form-hint" style="margin-top: var(--spacing-sm);">Click a category to edit or delete it.</p>
      `}
    </div>
    <div class="divider"></div>
    <div id="category-form-section">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
        <h4>${formTitle}</h4>
        ${editingCategory ? `<button type="button" class="btn btn-secondary btn-small" id="cancel-edit-btn">Cancel</button>` : ''}
      </div>
      <form id="category-form">
        <div class="form-group">
          <label for="category-name" class="form-label required">Category Name</label>
          <input type="text" id="category-name" name="name" class="form-input" placeholder="e.g., Food & Dining" value="${namePrefill}" required>
        </div>
        <div class="form-group">
          <label class="form-label required">Color</label>
          ${buildColorSwatches(colorPrefill)}
        </div>
        <div class="form-group">
          <label for="category-emoji" class="form-label">Emoji (optional)</label>
          ${buildEmojiPickerHTML(emojiPrefill)}
        </div>
      </form>
    </div>
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
 * Setup emoji picker close-on-outside-click (registered once)
 */
let emojiPickerListenerAdded = false;

function setupColorSync() {
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
}

let activeCategoryMenu = null;

function closeCategoryMenu() {
  if (activeCategoryMenu) {
    activeCategoryMenu.remove();
    activeCategoryMenu = null;
  }
  document.querySelectorAll('.category-item-selectable.menu-open').forEach(el => el.classList.remove('menu-open'));
}

/**
 * Attach click listeners to category items for the popup menu
 */
function setupCategoryItemListeners(dbId, modal, getEditingCategory, setEditingCategory) {
  document.querySelectorAll('.category-item-selectable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();

      const alreadyOpen = el.classList.contains('menu-open');
      closeCategoryMenu();
      if (alreadyOpen) return;

      el.classList.add('menu-open');

      const category = {
        id: el.dataset.id,
        name: el.dataset.name,
        color: el.dataset.color,
        emoji: el.dataset.emoji,
      };

      const menu = document.createElement('div');
      menu.className = 'category-context-menu';
      menu.innerHTML = `
        <button class="category-menu-btn" data-action="edit">Edit</button>
        <button class="category-menu-btn category-menu-btn--delete" data-action="delete">Delete</button>
      `;
      el.appendChild(menu);
      activeCategoryMenu = menu;

      menu.querySelector('[data-action="edit"]').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeCategoryMenu();
        setEditingCategory(category);
        const categories = await CategoryAPI.getAll(dbId);
        modal.updateContent(generateCategoriesModalContent(categories, category));
        modal.setSubmitText('Save Changes');
        setupCategoryItemListeners(dbId, modal, getEditingCategory, setEditingCategory);
        setupColorSync();
        document.getElementById('cancel-edit-btn')?.addEventListener('click', async () => {
          setEditingCategory(null);
          const refreshed = await CategoryAPI.getAll(dbId);
          modal.updateContent(generateCategoriesModalContent(refreshed, null));
          modal.setSubmitText('Create Category');
          setupCategoryItemListeners(dbId, modal, getEditingCategory, setEditingCategory);
          setupColorSync();
        });
      });

      menu.querySelector('[data-action="delete"]').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeCategoryMenu();
        if (!confirm('Delete this category? This will remove it from all transactions.')) return;
        try {
          await CategoryAPI.delete(dbId, category.id);
          Notification.success('Category deleted');
          if (getEditingCategory()?.id === category.id) setEditingCategory(null);
          const categories = await CategoryAPI.getAll(dbId);
          modal.updateContent(generateCategoriesModalContent(categories, getEditingCategory()));
          modal.setSubmitText(getEditingCategory() ? 'Save Changes' : 'Create Category');
          setupCategoryItemListeners(dbId, modal, getEditingCategory, setEditingCategory);
          setupColorSync();
        } catch (error) {
          Notification.error('Failed to delete category: ' + error.message);
        }
      });
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', closeCategoryMenu, { once: true, capture: true });
}

/**
 * Show categories management modal
 */
window.showCategoriesModal = async function() {
  const dbId = AppState.getActiveDatabaseId();

  let editingCategory = null;
  const getEditingCategory = () => editingCategory;
  const setEditingCategory = (c) => { editingCategory = c; };

  try {
    const categories = await CategoryAPI.getAll(dbId);

    const contentHTML = generateCategoriesModalContent(categories, null);
    const modal = Modal.create('categories-modal', 'Manage Categories', contentHTML);
    modal.setSubmitText('Create Category');

    modal.setSubmitHandler(async () => {
      const form = document.getElementById('category-form');
      if (!form) return false;

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      if (!isValidCategoryName(data.name) || !isValidHexColor(data.color) || !isValidEmoji(data.emoji)) {
        Notification.error('Please fill in all fields correctly');
        return false;
      }

      try {
        if (editingCategory) {
          // Edit mode
          await CategoryAPI.update(dbId, {
            id: editingCategory.id,
            name: data.name,
            color: data.color.toUpperCase(),
            emoji: data.emoji,
          });
          Notification.success('Category updated');
          setEditingCategory(null);
          modal.setSubmitText('Create Category');
        } else {
          // Create mode
          await CategoryAPI.create(dbId, {
            name: data.name,
            color: data.color.toUpperCase(),
            emoji: data.emoji,
          });
          Notification.success('Category created successfully');
        }

        const updatedCategories = await CategoryAPI.getAll(dbId);
        modal.updateContent(generateCategoriesModalContent(updatedCategories, null));
        setupCategoryItemListeners(dbId, modal, getEditingCategory, setEditingCategory);
        setupColorSync();
        return false; // Keep modal open
      } catch (error) {
        Notification.error('Failed to save category: ' + error.message);
        return false;
      }
    });

    setupColorSync();
    modal.show();
    setupCategoryItemListeners(dbId, modal, getEditingCategory, setEditingCategory);
  } catch (error) {
    Notification.error('Failed to load categories: ' + error.message);
  }
};
