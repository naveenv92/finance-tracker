/**
 * Transactions Page - View all transactions in table format
 */

import { AppState } from '../core/state.js';
import { TransactionAPI, CategoryAPI, SettingsAPI } from '../core/api.js';
import { Table } from '../components/table.js';
import { Modal } from '../components/modal.js';
import { Notification } from '../components/notification.js';
import { DateFormatter } from '../utils/date-formatter.js';
import { formatCurrency, debounce } from '../utils/helpers.js';
import { isValidMerchantName, isValidAmount, isValidPersonName } from '../utils/validators.js';

// Check for active database
if (!AppState.requireActiveDatabase()) {
  // Will redirect to landing page
} else {
  document.addEventListener('DOMContentLoaded', init);
}

let table;
let allTransactions = [];
let filteredTransactions = [];
let currentPage = 1;
let maxAmount = 0;
let nameFilter = '';
let signFilter = 'all'; // 'all' | 'positive' | 'negative'
let ownerName = '';
const rowsPerPage = 50;
const selectedIds = new Set();

/**
 * Parse splits from a transaction (handles JSON string or array)
 */
function parseSplits(splits) {
  if (!splits) return [];
  if (Array.isArray(splits)) return splits;
  if (typeof splits === 'string' && splits) {
    try { return JSON.parse(splits); } catch { return []; }
  }
  return [];
}

/**
 * Initialize page
 */
async function init() {
  const dbId = AppState.getActiveDatabaseId();
  try {
    const settings = await SettingsAPI.get(dbId);
    ownerName = settings.ownerName || '';
  } catch (e) { /* ownerName stays '' */ }

  await loadTransactions();
  await renderFilters();
  renderTable();
  renderPagination();
  setupEventListeners();
}

/**
 * Load transactions from database
 */
async function loadTransactions() {
  const dbId = AppState.getActiveDatabaseId();
  try {
    const all = await TransactionAPI.getAll(dbId);
    allTransactions = all.filter(t => t.reviewed);
    filteredTransactions = [...allTransactions];
    maxAmount = allTransactions.length > 0
      ? Math.ceil(Math.max(...allTransactions.map(t => Math.abs(t.amount))))
      : 1000;
  } catch (error) {
    console.error('Failed to load transactions:', error);
    Notification.error('Failed to load transactions');
    allTransactions = [];
    filteredTransactions = [];
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', debounce((e) => {
    filterTransactions();
  }, 300));

  document.getElementById('export-csv-btn').addEventListener('click', showExportModal);
  document.getElementById('add-transaction-btn').addEventListener('click', showAddTransactionModal);
  document.getElementById('bulk-category-btn').addEventListener('click', showBulkCategoryModal);
  document.getElementById('bulk-delete-btn').addEventListener('click', handleBulkDelete);
  document.getElementById('bulk-clear-btn').addEventListener('click', () => { selectedIds.clear(); updateBulkActionBar(); renderTable(); });
}

/**
 * Render filters
 */
async function renderFilters() {
  const dbId = AppState.getActiveDatabaseId();
  let categories = [];

  try {
    categories = await CategoryAPI.getAll(dbId);
  } catch (error) {
    console.error('Failed to load categories:', error);
  }

  // Collect unique person names from all splits
  const personNames = [...new Set(
    allTransactions.flatMap(t => parseSplits(t.splits).map(s => s.personName))
  )].sort();

  const filtersHTML = `
    <div class="table-filters-row">
      <div class="table-filter">
        <label for="category-filter" class="form-label">Category</label>
        <select id="category-filter" class="form-select">
          <option value="">All Categories</option>
          <option value="uncategorized">Uncategorized</option>
          ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="table-filter">
        <label for="person-filter" class="form-label">Person</label>
        <select id="person-filter" class="form-select">
          <option value="">All People</option>
          ${personNames.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="table-filters-row">
      <div class="table-filter">
        <label class="form-label">Start Date</label>
        <input type="date" id="date-start" class="form-input">
      </div>
      <div class="table-filter">
        <label class="form-label">End Date</label>
        <input type="date" id="date-end" class="form-input">
      </div>
    </div>
    <div class="table-filters-row">
      <div class="table-filter amount-filter">
        <div class="amount-filter-header">
          <label class="form-label">Amount: <span id="amount-range-label">${formatCurrency(0)} – ${formatCurrency(maxAmount)}</span></label>
          <div class="sign-toggle" id="sign-toggle" role="group" aria-label="Filter by amount sign">
            <button type="button" class="sign-toggle-btn${signFilter === 'all' ? ' active' : ''}" data-sign="all">All</button>
            <button type="button" class="sign-toggle-btn${signFilter === 'positive' ? ' active' : ''}" data-sign="positive">Positive</button>
            <button type="button" class="sign-toggle-btn${signFilter === 'negative' ? ' active' : ''}" data-sign="negative">Negative</button>
          </div>
        </div>
        <div class="range-slider-wrapper">
          <div class="range-track">
            <div class="range-fill" id="range-fill"></div>
          </div>
          <input type="range" id="amount-min" class="range-input range-min" min="0" max="${maxAmount}" value="0" step="1">
          <input type="range" id="amount-max" class="range-input range-max" min="0" max="${maxAmount}" value="${maxAmount}" step="1">
        </div>
        <div class="range-labels">
          <span>${formatCurrency(0)}</span>
          <span>${formatCurrency(maxAmount)}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('filters').innerHTML = filtersHTML;

  // Category filter listener
  document.getElementById('category-filter').addEventListener('change', filterTransactions);

  // Person filter listener
  document.getElementById('person-filter').addEventListener('change', (e) => {
    nameFilter = e.target.value;
    filterTransactions();
  });

  // Date filter listeners
  document.getElementById('date-start').addEventListener('change', filterTransactions);
  document.getElementById('date-end').addEventListener('change', filterTransactions);

  // Amount range slider listeners
  const amountMin = document.getElementById('amount-min');
  const amountMax = document.getElementById('amount-max');

  function updateRangeFill() {
    const minVal = parseFloat(amountMin.value);
    const maxVal = parseFloat(amountMax.value);
    const pctMin = (minVal / maxAmount) * 100;
    const pctMax = (maxVal / maxAmount) * 100;
    document.getElementById('range-fill').style.left = pctMin + '%';
    document.getElementById('range-fill').style.width = (pctMax - pctMin) + '%';
    document.getElementById('amount-range-label').textContent =
      `${formatCurrency(minVal)} – ${formatCurrency(maxVal)}`;
    // Give min thumb higher z-index when at the top to stay grabbable
    amountMin.style.zIndex = minVal >= maxAmount - 1 ? 4 : 3;
    filterTransactions();
  }

  amountMin.addEventListener('input', () => {
    if (parseFloat(amountMin.value) > parseFloat(amountMax.value)) {
      amountMin.value = amountMax.value;
    }
    updateRangeFill();
  });

  amountMax.addEventListener('input', () => {
    if (parseFloat(amountMax.value) < parseFloat(amountMin.value)) {
      amountMax.value = amountMin.value;
    }
    updateRangeFill();
  });

  // Amount sign toggle listener
  document.getElementById('sign-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.sign-toggle-btn');
    if (!btn) return;
    signFilter = btn.dataset.sign;
    document.querySelectorAll('.sign-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
    filterTransactions();
  });

  updateRangeFill();
}

/**
 * Filter transactions based on search and filters
 */
function filterTransactions() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const categoryFilter = document.getElementById('category-filter').value;
  const amountMinEl = document.getElementById('amount-min');
  const amountMaxEl = document.getElementById('amount-max');
  const minAmt = amountMinEl ? parseFloat(amountMinEl.value) : 0;
  const maxAmt = amountMaxEl ? parseFloat(amountMaxEl.value) : Infinity;

  const dateStart = document.getElementById('date-start')?.value || '';
  const dateEnd = document.getElementById('date-end')?.value || '';

  filteredTransactions = allTransactions.flatMap(t => {
    // Search filter
    const matchesSearch = !searchTerm || t.merchant.toLowerCase().includes(searchTerm);

    // Category filter
    let matchesCategory = true;
    if (categoryFilter === 'uncategorized') {
      matchesCategory = !t.categoryId;
    } else if (categoryFilter) {
      matchesCategory = t.categoryId === categoryFilter;
    }

    // Date filter (YYYY-MM-DD string comparison works correctly)
    const matchesDate = (!dateStart || t.date >= dateStart) &&
                        (!dateEnd   || t.date <= dateEnd);

    // Person filter — only include if this person has a split; use their split amount
    let displayAmount = t.amount;
    if (nameFilter) {
      const split = parseSplits(t.splits).find(s => s.personName === nameFilter);
      if (!split) return [];
      displayAmount = split.amount;
    }

    // Amount filter (applied to the effective display amount)
    const absAmount = Math.abs(displayAmount);
    const matchesAmount = absAmount >= minAmt && absAmount <= maxAmt;

    // Sign filter — isolate positive (e.g. income/refunds) or negative (e.g. expenses) amounts
    const matchesSign = signFilter === 'all' ||
      (signFilter === 'positive' && displayAmount >= 0) ||
      (signFilter === 'negative' && displayAmount < 0);

    if (!matchesSearch || !matchesCategory || !matchesAmount || !matchesDate || !matchesSign) return [];

    return [{ ...t, _displayAmount: displayAmount }];
  });

  currentPage = 1;
  renderTable();
  renderPagination();
}

/**
 * Render the transactions table
 */
async function renderTable() {
  const dbId = AppState.getActiveDatabaseId();
  let categories = [];

  try {
    categories = await CategoryAPI.getAll(dbId);
  } catch (error) {
    console.error('Failed to load categories:', error);
  }

  // Paginate data
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = filteredTransactions.slice(startIndex, endIndex);

  const pageIds = paginatedData.map(r => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));

  const columns = [
    {
      key: 'id',
      headerHTML: `<input type="checkbox" class="select-all-checkbox" ${allPageSelected ? 'checked' : ''} title="Select all on this page">`,
      sortable: false,
      render: (id) => `<input type="checkbox" class="row-checkbox" data-id="${id}" ${selectedIds.has(id) ? 'checked' : ''}>`,
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (date) => `<span class="table-cell-date">${DateFormatter.toDisplay(date)}</span>`
    },
    {
      key: 'merchant',
      label: 'Merchant',
      sortable: true,
      render: (merchant) => `<span class="table-cell-merchant">${merchant}</span>`
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      align: 'right',
      render: (amount, row) => {
        const effective = row._displayAmount ?? amount;
        const className = effective >= 0 ? 'positive' : 'negative';
        const isMultiSplit = parseSplits(row.splits).length > 1;
        const suffix = row._displayAmount != null && isMultiSplit ? ' <span class="amount-split-indicator">(split)</span>' : '';
        return `<span class="table-cell-amount ${className}">${formatCurrency(effective)}${suffix}</span>`;
      }
    },
    {
      key: 'categoryId',
      label: 'Category',
      render: (categoryId) => {
        if (!categoryId) {
          return '<span class="badge status-badge" style="font-weight:var(--font-weight-bold)">Uncategorized</span>';
        }
        const category = categories.find(c => c.id === categoryId);
        if (!category) return '<span class="badge status-badge">Unknown</span>';
        return `<span class="category-badge" style="background-color: ${category.color};">${category.emoji || ''} ${category.name}</span>`;
      }
    },
    {
      key: 'source',
      label: 'Source',
      render: (source) => `<span class="table-cell-source">${source || '—'}</span>`
    },
    {
      key: 'splits',
      label: 'Split',
      render: (splits) => {
        // Parse splits if it's a string
        let parsedSplits = [];
        if (typeof splits === 'string' && splits) {
          try {
            parsedSplits = JSON.parse(splits);
          } catch (e) {
            parsedSplits = [];
          }
        } else if (Array.isArray(splits)) {
          parsedSplits = splits;
        }

        if (!parsedSplits || parsedSplits.length === 0) {
          return '<span class="table-cell-split">No split</span>';
        }
        return `<span class="table-cell-split">${parsedSplits.length} people</span>`;
      }
    }
  ];

  table = new Table('transactions-table', columns, paginatedData);
  table.setRowClickHandler((row) => {
    showTransactionModal(row);
  });
  table.render();
  setupCheckboxListeners(paginatedData);
}

/**
 * Wire up checkbox listeners after each table render
 */
function setupCheckboxListeners(paginatedData) {
  // Row checkboxes
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBulkActionBar();
      // Update select-all state
      const allChecked = paginatedData.every(r => selectedIds.has(r.id));
      const selectAll = document.querySelector('.select-all-checkbox');
      if (selectAll) selectAll.checked = allChecked;
    });
    // Prevent row click modal when clicking checkbox
    cb.addEventListener('click', (e) => e.stopPropagation());
  });

  // Select-all checkbox
  const selectAll = document.querySelector('.select-all-checkbox');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      paginatedData.forEach(r => {
        if (e.target.checked) selectedIds.add(r.id);
        else selectedIds.delete(r.id);
      });
      updateBulkActionBar();
      renderTable();
    });
    selectAll.addEventListener('click', (e) => e.stopPropagation());
  }
}

/**
 * Show/hide the bulk action bar and update the count label
 */
function updateBulkActionBar() {
  const bar = document.getElementById('bulk-action-bar');
  const count = document.getElementById('bulk-action-count');
  const n = selectedIds.size;
  bar.hidden = n === 0;
  count.textContent = `${n} selected`;
}

/**
 * Render pagination controls
 */
function renderPagination() {
  const totalPages = Math.ceil(filteredTransactions.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage + 1;
  const endIndex = Math.min(currentPage * rowsPerPage, filteredTransactions.length);

  // Pagination info
  const infoEl = document.getElementById('pagination-info');
  infoEl.textContent = `Showing ${startIndex}-${endIndex} of ${filteredTransactions.length} transactions`;

  // Pagination controls
  const controlsEl = document.getElementById('pagination-controls');
  const controls = [];

  // Previous button
  controls.push(`
    <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
      Previous
    </button>
  `);

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      controls.push(`
        <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">
          ${i}
        </button>
      `);
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      controls.push('<span style="padding: 0 var(--spacing-xs);">...</span>');
    }
  }

  // Next button
  controls.push(`
    <button class="pagination-btn" ${currentPage === totalPages || totalPages === 0 ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
      Next
    </button>
  `);

  controlsEl.innerHTML = controls.join('');
}

/**
 * Change page
 */
window.changePage = function(page) {
  const totalPages = Math.ceil(filteredTransactions.length / rowsPerPage);
  if (page < 1 || page > totalPages) return;

  currentPage = page;
  renderTable();
  renderPagination();
};

/**
 * Show transaction details modal
 */
async function showTransactionModal(transaction) {
  const dbId = AppState.getActiveDatabaseId();
  let categories = [];

  try {
    categories = await CategoryAPI.getAll(dbId);
  } catch (error) {
    console.error('Failed to load categories:', error);
  }

  // Parse splits if it's a string
  let splits = [];
  if (typeof transaction.splits === 'string' && transaction.splits) {
    try {
      splits = JSON.parse(transaction.splits);
    } catch (e) {
      splits = [];
    }
  } else if (Array.isArray(transaction.splits)) {
    splits = transaction.splits;
  }

  const contentHTML = `
    <form id="transaction-form">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="text" class="form-input" value="${DateFormatter.toDisplay(transaction.date)}" disabled>
      </div>
      <div class="form-group">
        <label class="form-label">Original Merchant</label>
        <input type="text" class="form-input" value="${transaction.originalMerchant}" disabled style="font-size: var(--font-size-sm); color: var(--gray-500);">
      </div>
      <div class="form-group">
        <label for="merchant" class="form-label required">Merchant Name</label>
        <input type="text" id="merchant" name="merchant" class="form-input" value="${transaction.merchant}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="text" class="form-input" value="${formatCurrency(transaction.amount)}" disabled>
      </div>
      <div class="form-group">
        <label for="category" class="form-label">Category</label>
        <select id="category" name="categoryId" class="form-select">
          <option value="">Uncategorized</option>
          ${categories.map(c => `<option value="${c.id}" ${c.id === transaction.categoryId ? 'selected' : ''}>${c.emoji || ''} ${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="notes" class="form-label">Notes</label>
        <textarea id="notes" name="notes" class="form-textarea">${transaction.notes || ''}</textarea>
      </div>
      <div class="splits-section">
        <div class="splits-header">
          <h4>Splits</h4>
          <button type="button" class="btn btn-secondary btn-small" onclick="addSplit()">Add Split</button>
        </div>
        <div id="splits-list">
          ${renderSplitsList(splits, transaction.amount, splits.length > 0)}
        </div>
        <div id="split-total" class="split-total"></div>
      </div>
    </form>
  `;

  const modal = Modal.create('transaction-modal', 'Transaction Details', contentHTML);
  modal.setSubmitText('Save Changes');

  modal.setSubmitHandler(async () => {
    const merchant = document.getElementById('merchant').value;
    const categoryId = document.getElementById('category').value || null;
    const notes = document.getElementById('notes').value;

    // Validate
    if (!isValidMerchantName(merchant)) {
      Notification.error('Please enter a valid merchant name');
      return false;
    }

    // Get splits
    const splits = getSplitsFromForm(transaction.amount);
    if (splits === false) {
      Notification.error('Invalid split amounts');
      return false;
    }

    // Update transaction
    const updated = {
      ...transaction,
      merchant,
      categoryId,
      notes,
      splits: JSON.stringify(splits), // Backend expects JSON string
      reviewed: true
    };

    try {
      await TransactionAPI.update(dbId, updated);
      Notification.success('Transaction updated');

      // Reload and re-render
      await loadTransactions();
      filterTransactions();
    } catch (error) {
      console.error('Failed to update transaction:', error);
      Notification.error('Failed to update transaction');
      return false;
    }
  });

  modal.show();

  // Setup splits functionality
  setTimeout(() => {
    // Attach type-change listeners to any pre-rendered type selectors
    document.querySelectorAll('.split-type').forEach(select => {
      select.addEventListener('change', (e) => handleSplitTypeChange(e.target, transaction.amount));
    });
    updateSplitTotal(transaction.amount);
  }, 100);
}

/**
 * Render splits list HTML (matches review page: first split is auto/owner, rest have type selector)
 */
function renderSplitsList(splits, transactionAmount, firstIsAuto = false) {
  if (!splits || splits.length === 0) {
    return '<p class="text-muted" id="no-splits-msg">No splits added</p>';
  }

  return splits.map((split, index) => {
    const isAuto = firstIsAuto && index === 0;
    const percentage = transactionAmount !== 0
      ? (Math.abs(split.amount) / Math.abs(transactionAmount)) * 100
      : 0;

    return `
      <div class="split-item" data-index="${index}" ${isAuto ? 'data-auto="true"' : ''}>
        <div class="form-group">
          <label class="form-label">Person Name</label>
          <input type="text" class="split-name form-input" value="${split.personName}" placeholder="Name">
        </div>
        ${isAuto ? '' : `
        <div class="form-group">
          <label class="form-label">Amount Type</label>
          <select class="split-type form-select" data-index="${index}">
            <option value="amount">Dollar Amount</option>
            <option value="percentage" selected>Percentage</option>
          </select>
        </div>
        `}
        <div class="form-group">
          <label class="form-label split-amount-label">${isAuto ? 'Amount ($) <span class="split-auto-label">(auto)</span>' : 'Percentage (%)'}</label>
          <input type="number" step="0.01" class="split-amount form-input" data-index="${index}" value="${Math.abs(split.amount)}" placeholder="0.00" ${isAuto ? 'readonly' : 'style="display: none;" required'}>
          ${isAuto ? '' : `<input type="number" step="0.01" class="split-percentage form-input" data-index="${index}" value="${percentage.toFixed(2)}" placeholder="0.00" min="0" max="100" required>`}
        </div>
        <button type="button" class="btn btn-danger btn-small" onclick="removeSplit(${index})">Remove</button>
      </div>
    `;
  }).join('');
}

/**
 * Handle split type change (dollar <-> percentage)
 */
function handleSplitTypeChange(selectElement, transactionAmount) {
  const index = selectElement.dataset.index;
  const splitItem = document.querySelector(`.split-item[data-index="${index}"]`);
  const amountInput = splitItem.querySelector('.split-amount');
  const percentageInput = splitItem.querySelector('.split-percentage');
  const label = splitItem.querySelector('.split-amount-label');
  const type = selectElement.value;

  if (type === 'percentage') {
    const currentAmount = parseFloat(amountInput.value) || 0;
    const percentage = transactionAmount !== 0 ? (currentAmount / Math.abs(transactionAmount)) * 100 : 0;
    percentageInput.value = percentage.toFixed(2);
    amountInput.style.display = 'none';
    percentageInput.style.display = 'block';
    label.innerHTML = 'Percentage (%)';
  } else {
    const currentPercentage = parseFloat(percentageInput.value) || 0;
    const amount = (currentPercentage / 100) * Math.abs(transactionAmount);
    amountInput.value = amount.toFixed(2);
    percentageInput.style.display = 'none';
    amountInput.style.display = 'block';
    label.innerHTML = 'Amount ($)';
  }

  updateSplitTotal(transactionAmount);
}

/**
 * Recalculate the auto split's amount as the remainder after all other splits
 */
function recalculateAutoSplit(transactionAmount) {
  const autoItem = document.querySelector('.split-item[data-auto="true"]');
  if (!autoItem) return;

  let otherTotal = 0;
  document.querySelectorAll('.split-item:not([data-auto="true"])').forEach(item => {
    const typeSelect = item.querySelector('.split-type');
    const amountInput = item.querySelector('.split-amount');
    const percentageInput = item.querySelector('.split-percentage');
    if (typeSelect && typeSelect.value === 'percentage') {
      otherTotal += (parseFloat(percentageInput?.value) || 0) / 100 * Math.abs(transactionAmount);
    } else {
      otherTotal += parseFloat(amountInput?.value) || 0;
    }
  });

  const remainder = Math.max(0, Math.abs(transactionAmount) - otherTotal);
  autoItem.querySelector('.split-amount').value = remainder.toFixed(2);
}

/**
 * Add split (review-style: type selector, defaults to percentage)
 */
window.addSplit = function() {
  const splitsList = document.getElementById('splits-list');
  const noSplitsMsg = document.getElementById('no-splits-msg');
  if (noSplitsMsg) noSplitsMsg.remove();

  const transactionAmount = getModalAmount();
  const currentSplits = splitsList.querySelectorAll('.split-item');
  const index = currentSplits.length;
  const totalPeople = index + 1;
  const defaultPct = (100 / totalPeople).toFixed(2);

  // If this is the first split being added and we have an ownerName, make it auto
  const isAuto = index === 0 && !!ownerName;

  let splitHTML;
  if (isAuto) {
    splitHTML = `
      <div class="split-item" data-index="${index}" data-auto="true">
        <div class="form-group">
          <label class="form-label">Person Name</label>
          <input type="text" class="split-name form-input" value="${ownerName}" placeholder="Name">
        </div>
        <div class="form-group">
          <label class="form-label split-amount-label">Amount ($) <span class="split-auto-label">(auto)</span></label>
          <input type="number" step="0.01" class="split-amount form-input" data-index="${index}" value="${Math.abs(transactionAmount).toFixed(2)}" placeholder="0.00" readonly>
        </div>
        <button type="button" class="btn btn-danger btn-small" onclick="removeSplit(${index})">Remove</button>
      </div>
    `;
  } else {
    splitHTML = `
      <div class="split-item" data-index="${index}">
        <div class="form-group">
          <label class="form-label">Person Name</label>
          <input type="text" class="split-name form-input" placeholder="Name">
        </div>
        <div class="form-group">
          <label class="form-label">Amount Type</label>
          <select class="split-type form-select" data-index="${index}">
            <option value="amount">Dollar Amount</option>
            <option value="percentage" selected>Percentage</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label split-amount-label">Percentage (%)</label>
          <input type="number" step="0.01" class="split-amount form-input" data-index="${index}" placeholder="0.00" style="display: none;" required>
          <input type="number" step="0.01" class="split-percentage form-input" data-index="${index}" value="${defaultPct}" placeholder="0.00" min="0" max="100" required>
        </div>
        <button type="button" class="btn btn-danger btn-small" onclick="removeSplit(${index})">Remove</button>
      </div>
    `;
  }

  splitsList.insertAdjacentHTML('beforeend', splitHTML);

  // Set up event listeners for new inputs
  const newItem = splitsList.querySelector(`.split-item[data-index="${index}"]`);
  newItem.querySelector('.split-amount')?.addEventListener('input', () => updateSplitTotal(getModalAmount()));
  newItem.querySelector('.split-percentage')?.addEventListener('input', () => updateSplitTotal(getModalAmount()));
  const typeSelect = newItem.querySelector('.split-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => handleSplitTypeChange(e.target, getModalAmount()));
  }

  updateSplitTotal(transactionAmount);
};

function getModalAmount() {
  const editableAmount = document.getElementById('new-amount');
  if (editableAmount) return parseFloat(editableAmount.value) || 0;
  const modal = document.querySelector('.modal');
  const disabledInput = modal?.querySelector('input[disabled][value*="$"]');
  return disabledInput ? parseFloat(disabledInput.value.replace(/[$,]/g, '')) : 0;
}

/**
 * Remove split
 */
window.removeSplit = function(index) {
  const splitItem = document.querySelector(`.split-item[data-index="${index}"]`);
  if (splitItem) {
    splitItem.remove();
    const remaining = document.querySelectorAll('.split-item');
    if (remaining.length === 0) {
      document.getElementById('splits-list').innerHTML = '<p class="text-muted" id="no-splits-msg">No splits added</p>';
    }
    updateSplitTotal(getModalAmount());
  }
};

/**
 * Get splits from form (handles auto splits and dollar/percentage typed splits)
 */
function getSplitsFromForm(transactionAmount = 0) {
  const splitItems = document.querySelectorAll('.split-item');
  const splits = [];

  for (let item of splitItems) {
    const nameInput = item.querySelector('.split-name');
    const amountInput = item.querySelector('.split-amount');
    const percentageInput = item.querySelector('.split-percentage');
    const typeSelect = item.querySelector('.split-type');

    if (!nameInput || !amountInput) continue;

    const name = nameInput.value.trim();
    let amount = 0;

    if (!typeSelect) {
      // Auto split — read dollar amount directly
      amount = parseFloat(amountInput.value) || 0;
    } else if (typeSelect.value === 'percentage') {
      const pct = parseFloat(percentageInput?.value) || 0;
      amount = (pct / 100) * Math.abs(transactionAmount);
    } else {
      amount = parseFloat(amountInput.value) || 0;
    }

    if (name) {
      if (!isValidPersonName(name) || !isValidAmount(amount)) return false;
      splits.push({ personName: name, amount });
    }
  }

  return splits;
}

/**
 * Show modal to add a new manual transaction
 */
async function showAddTransactionModal() {
  const dbId = AppState.getActiveDatabaseId();
  let categories = [];

  try {
    categories = await CategoryAPI.getAll(dbId);
  } catch (error) {
    console.error('Failed to load categories:', error);
  }

  const existingSources = [...new Set([
    ...allTransactions.map(t => t.source).filter(Boolean),
    'Cash', 'Venmo', 'Zelle',
  ])].sort();
  if (!existingSources.includes('Manual')) existingSources.unshift('Manual');

  const today = new Date().toISOString().slice(0, 10);
  const ownerSplitHTML = ownerName
    ? renderSplitsList([{ personName: ownerName, amount: 0 }], 0, true)
    : '<p class="text-muted" id="no-splits-msg">No splits added</p>';

  const contentHTML = `
    <form id="add-transaction-form">
      <div class="form-group">
        <label for="new-date" class="form-label required">Date</label>
        <input type="date" id="new-date" name="date" class="form-input" value="${today}" required>
      </div>
      <div class="form-group">
        <label for="new-merchant" class="form-label required">Merchant</label>
        <input type="text" id="new-merchant" name="merchant" class="form-input" placeholder="e.g. Whole Foods" required>
      </div>
      <div class="form-group">
        <label for="new-amount" class="form-label required">Amount</label>
        <input type="number" id="new-amount" name="amount" class="form-input" step="0.01" placeholder="e.g. 42.50" required>
      </div>
      <div class="form-group">
        <label for="new-category" class="form-label">Category</label>
        <select id="new-category" name="categoryId" class="form-select">
          <option value="">Uncategorized</option>
          ${categories.map(c => `<option value="${c.id}">${c.emoji || ''} ${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="new-source" class="form-label">Source</label>
        <select id="new-source" name="source" class="form-select">
          ${existingSources.map(s => `<option value="${s}"${s === 'Manual' ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="new-notes" class="form-label">Notes</label>
        <textarea id="new-notes" name="notes" class="form-textarea" placeholder="Optional notes..."></textarea>
      </div>
      <div class="splits-section">
        <div class="splits-header">
          <h4>Splits</h4>
          <button type="button" class="btn btn-secondary btn-small" onclick="addSplit()">Add Split</button>
        </div>
        <div id="splits-list">${ownerSplitHTML}</div>
        <div id="split-total" class="split-total"></div>
      </div>
    </form>
  `;

  const modal = Modal.create('add-transaction-modal', 'Add Transaction', contentHTML);
  modal.setSubmitText('Add Transaction');

  modal.setSubmitHandler(async () => {
    const date = document.getElementById('new-date').value;
    const merchant = document.getElementById('new-merchant').value.trim();
    const amountRaw = parseFloat(document.getElementById('new-amount').value);
    const categoryId = document.getElementById('new-category').value || null;
    const source = document.getElementById('new-source').value;
    const notes = document.getElementById('new-notes').value.trim();

    if (!date) {
      Notification.error('Please enter a date');
      return false;
    }
    if (!isValidMerchantName(merchant)) {
      Notification.error('Please enter a valid merchant name');
      return false;
    }
    if (isNaN(amountRaw) || !isValidAmount(amountRaw)) {
      Notification.error('Please enter a valid amount');
      return false;
    }

    const splits = getSplitsFromForm(amountRaw);
    if (splits === false) {
      Notification.error('Invalid split amounts');
      return false;
    }

    const transaction = {
      date,
      merchant,
      originalMerchant: merchant,
      amount: amountRaw,
      categoryId,
      notes,
      source,
      reviewed: true,
      splits: JSON.stringify(splits),
    };

    try {
      await TransactionAPI.create(dbId, transaction);
      Notification.success('Transaction added');
      await loadTransactions();
      await renderFilters();
      filterTransactions();
    } catch (error) {
      console.error('Failed to add transaction:', error);
      Notification.error('Failed to add transaction');
      return false;
    }
  });

  modal.show();

  // When amount changes, recalculate auto split and update total
  document.getElementById('new-amount').addEventListener('input', (e) => {
    updateSplitTotal(parseFloat(e.target.value) || 0);
  });
}

/**
 * Update split total display
 */
function updateSplitTotal(transactionAmount) {
  recalculateAutoSplit(transactionAmount);
  const splits = getSplitsFromForm(transactionAmount);
  const totalEl = document.getElementById('split-total');

  if (!splits || splits === false || splits.length === 0) {
    totalEl.innerHTML = '';
    return;
  }

  const total = splits.reduce((sum, s) => sum + Math.abs(s.amount), 0);
  const difference = Math.abs(total - Math.abs(transactionAmount));
  const isMatching = difference < 0.01;

  totalEl.innerHTML = `
    Split Total: <span class="split-total-value ${isMatching ? '' : 'split-total-warning'}">${formatCurrency(transactionAmount < 0 ? -total : total)}</span>
    ${!isMatching ? `<br><span class="split-total-warning">⚠ Difference: ${formatCurrency(difference)}</span>` : ''}
  `;

  // Re-attach listeners for any newly added inputs
  document.querySelectorAll('.split-amount').forEach(input => {
    input.addEventListener('input', () => updateSplitTotal(transactionAmount));
  });
  document.querySelectorAll('.split-percentage').forEach(input => {
    input.addEventListener('input', () => updateSplitTotal(transactionAmount));
  });
}

/**
 * Show bulk category assignment modal
 */
async function showBulkCategoryModal() {
  const dbId = AppState.getActiveDatabaseId();
  let categories = [];
  try {
    categories = await CategoryAPI.getAll(dbId);
  } catch (e) {
    Notification.error('Failed to load categories');
    return;
  }

  const contentHTML = `
    <p style="margin-bottom: var(--spacing-md); color: var(--gray-600);">
      Assign a category to <strong>${selectedIds.size}</strong> selected transaction${selectedIds.size !== 1 ? 's' : ''}.
    </p>
    <div class="form-group">
      <label for="bulk-category-select" class="form-label">Category</label>
      <select id="bulk-category-select" class="form-select">
        <option value="">Uncategorized</option>
        ${categories.map(c => `<option value="${c.id}">${c.emoji || ''} ${c.name}</option>`).join('')}
      </select>
    </div>
  `;

  const modal = Modal.create('bulk-category-modal', 'Assign Category', contentHTML);
  modal.setSubmitText('Apply');

  modal.setSubmitHandler(async () => {
    const categoryId = document.getElementById('bulk-category-select').value || null;
    const ids = [...selectedIds];

    // Find full transaction objects for the selected IDs
    const toUpdate = allTransactions.filter(t => ids.includes(t.id));

    try {
      await Promise.all(toUpdate.map(t =>
        TransactionAPI.update(dbId, { ...t, categoryId, splits: typeof t.splits === 'string' ? t.splits : JSON.stringify(t.splits) })
      ));
      Notification.success(`Updated ${toUpdate.length} transaction${toUpdate.length !== 1 ? 's' : ''}`);
      selectedIds.clear();
      updateBulkActionBar();
      await loadTransactions();
      filterTransactions();
    } catch (e) {
      console.error('Bulk category update failed:', e);
      Notification.error('Failed to update transactions');
      return false;
    }
  });

  modal.show();
}

/**
 * Bulk delete selected transactions
 */
async function handleBulkDelete() {
  const n = selectedIds.size;
  if (!confirm(`Delete ${n} transaction${n !== 1 ? 's' : ''}? This cannot be undone.`)) return;

  const dbId = AppState.getActiveDatabaseId();
  const ids = [...selectedIds];

  try {
    await Promise.all(ids.map(id => TransactionAPI.delete(dbId, id)));
    Notification.success(`Deleted ${n} transaction${n !== 1 ? 's' : ''}`);
    selectedIds.clear();
    updateBulkActionBar();
    await loadTransactions();
    await renderFilters();
    filterTransactions();
  } catch (e) {
    console.error('Bulk delete failed:', e);
    Notification.error('Failed to delete transactions');
  }
}

/**
 * Show export CSV modal
 */
async function showExportModal() {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFilename = `transactions-${today}`;
  const supportsFilePicker = typeof window.showSaveFilePicker === 'function';

  const contentHTML = `
    <div class="form-group">
      <label for="export-start" class="form-label">Start Date <span style="color: var(--gray-500); font-weight: normal;">(optional)</span></label>
      <input type="date" id="export-start" class="form-input">
    </div>
    <div class="form-group">
      <label for="export-end" class="form-label">End Date <span style="color: var(--gray-500); font-weight: normal;">(optional)</span></label>
      <input type="date" id="export-end" class="form-input" value="${today}">
    </div>
    <div class="form-group">
      <label for="export-filename" class="form-label">Filename</label>
      <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
        <input type="text" id="export-filename" class="form-input" value="${defaultFilename}" style="flex: 1;">
        <span style="color: var(--gray-500); white-space: nowrap;">.csv</span>
      </div>
    </div>
    ${!supportsFilePicker ? `<p style="font-size: var(--font-size-sm); color: var(--gray-500); margin-top: var(--spacing-sm);">File will be saved to your default downloads folder.</p>` : ''}
  `;

  const modal = Modal.create('export-modal', 'Export Transactions as CSV', contentHTML);
  modal.setSubmitText(supportsFilePicker ? 'Choose Location & Export' : 'Download CSV');

  modal.setSubmitHandler(async () => {
    const startDate = document.getElementById('export-start').value;
    const endDate = document.getElementById('export-end').value;
    const filenameInput = document.getElementById('export-filename').value.trim() || defaultFilename;
    const filename = filenameInput.endsWith('.csv') ? filenameInput : `${filenameInput}.csv`;

    const dbId = AppState.getActiveDatabaseId();
    const params = new URLSearchParams({ filename });
    if (startDate) params.set('start', startDate);
    if (endDate) params.set('end', endDate);
    const url = `http://localhost:8080/api/databases/${dbId}/transactions/export?${params}`;

    try {
      if (supportsFilePicker) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await response.text());
        const csvText = await response.text();

        if (csvText.trim().split('\n').length <= 1) {
          Notification.error('No transactions found in the selected date range');
          return false;
        }

        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(csvText);
        await writable.close();
        Notification.success('Exported successfully');
      } else {
        // Fallback: let the browser download directly
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      }
    } catch (error) {
      if (error.name === 'AbortError') return false; // user cancelled file picker
      console.error('Export failed:', error);
      Notification.error('Export failed');
      return false;
    }
  });

  modal.show();
}

