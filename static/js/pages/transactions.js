/**
 * Transactions Page - View all transactions in table format
 */

import { AppState } from '../core/state.js';
import { TransactionAPI, CategoryAPI } from '../core/api.js';
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
const rowsPerPage = 50;

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
        <label class="form-label">Amount: <span id="amount-range-label">${formatCurrency(0)} – ${formatCurrency(maxAmount)}</span></label>
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

    if (!matchesSearch || !matchesCategory || !matchesAmount || !matchesDate) return [];

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

  const columns = [
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
          return '<span class="badge status-badge">Uncategorized</span>';
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
          ${renderSplitsList(splits)}
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
    const splits = getSplitsFromForm();
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
    updateSplitTotal(transaction.amount);
  }, 100);
}

/**
 * Render splits list HTML
 */
function renderSplitsList(splits) {
  if (!splits || splits.length === 0) {
    return '<p class="text-muted">No splits added</p>';
  }

  return splits.map((split, index) => `
    <div class="split-item" data-index="${index}">
      <div class="form-group">
        <label class="form-label">Person Name</label>
        <input type="text" class="split-name" value="${split.personName}" placeholder="Name">
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" step="0.01" class="split-amount" value="${split.amount}" placeholder="0.00">
      </div>
      <button type="button" class="btn btn-danger btn-small" onclick="removeSplit(${index})">Remove</button>
    </div>
  `).join('');
}

/**
 * Add split
 */
window.addSplit = function() {
  const splitsList = document.getElementById('splits-list');
  const currentSplits = splitsList.querySelectorAll('.split-item');
  const index = currentSplits.length;

  const splitHTML = `
    <div class="split-item" data-index="${index}">
      <div class="form-group">
        <label class="form-label">Person Name</label>
        <input type="text" class="split-name" placeholder="Name">
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" step="0.01" class="split-amount" placeholder="0.00">
      </div>
      <button type="button" class="btn btn-danger btn-small" onclick="removeSplit(${index})">Remove</button>
    </div>
  `;

  if (currentSplits.length === 0) {
    splitsList.innerHTML = splitHTML;
  } else {
    splitsList.insertAdjacentHTML('beforeend', splitHTML);
  }

  const modal = document.querySelector('.modal');
  const amount = parseFloat(modal.querySelector('input[disabled][value*="$"]').value.replace(/[$,]/g, ''));
  updateSplitTotal(amount);
};

/**
 * Remove split
 */
window.removeSplit = function(index) {
  const splitItem = document.querySelector(`.split-item[data-index="${index}"]`);
  if (splitItem) {
    splitItem.remove();

    // Update remaining indices
    const remaining = document.querySelectorAll('.split-item');
    if (remaining.length === 0) {
      document.getElementById('splits-list').innerHTML = '<p class="text-muted">No splits added</p>';
    }

    const modal = document.querySelector('.modal');
    const amount = parseFloat(modal.querySelector('input[disabled][value*="$"]').value.replace(/[$,]/g, ''));
    updateSplitTotal(amount);
  }
};

/**
 * Get splits from form
 */
function getSplitsFromForm() {
  const splitItems = document.querySelectorAll('.split-item');
  const splits = [];

  for (let item of splitItems) {
    const name = item.querySelector('.split-name').value.trim();
    const amount = parseFloat(item.querySelector('.split-amount').value);

    if (name && !isNaN(amount)) {
      if (!isValidPersonName(name) || !isValidAmount(amount)) {
        return false;
      }
      splits.push({ personName: name, amount });
    }
  }

  return splits;
}

/**
 * Update split total display
 */
function updateSplitTotal(transactionAmount) {
  const splits = getSplitsFromForm();
  if (splits === false || splits.length === 0) {
    document.getElementById('split-total').innerHTML = '';
    return;
  }

  const total = splits.reduce((sum, s) => sum + s.amount, 0);
  const difference = Math.abs(total - transactionAmount);
  const isMatching = difference < 0.01;

  const totalEl = document.getElementById('split-total');
  totalEl.innerHTML = `
    Split Total: <span class="split-total-value ${isMatching ? '' : 'split-total-warning'}">${formatCurrency(total)}</span>
    ${!isMatching ? `<br><span class="split-total-warning">Difference: ${formatCurrency(difference)}</span>` : ''}
  `;

  // Listen for changes
  document.querySelectorAll('.split-amount').forEach(input => {
    input.addEventListener('input', () => updateSplitTotal(transactionAmount));
  });
}
