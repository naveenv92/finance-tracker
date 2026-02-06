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
const rowsPerPage = 50;

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
    allTransactions = await TransactionAPI.getAll(dbId);
    filteredTransactions = [...allTransactions];
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

  const filtersHTML = `
    <div class="table-filter">
      <label for="category-filter" class="form-label">Category</label>
      <select id="category-filter" class="form-select">
        <option value="">All Categories</option>
        <option value="uncategorized">Uncategorized</option>
        ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="table-filter">
      <label for="reviewed-filter" class="form-label">Status</label>
      <select id="reviewed-filter" class="form-select">
        <option value="">All</option>
        <option value="reviewed">Reviewed</option>
        <option value="unreviewed">Unreviewed</option>
      </select>
    </div>
  `;

  document.getElementById('filters').innerHTML = filtersHTML;

  // Add event listeners
  document.getElementById('category-filter').addEventListener('change', filterTransactions);
  document.getElementById('reviewed-filter').addEventListener('change', filterTransactions);
}

/**
 * Filter transactions based on search and filters
 */
function filterTransactions() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const categoryFilter = document.getElementById('category-filter').value;
  const reviewedFilter = document.getElementById('reviewed-filter').value;

  filteredTransactions = allTransactions.filter(t => {
    // Search filter
    const matchesSearch = !searchTerm || t.merchant.toLowerCase().includes(searchTerm);

    // Category filter
    let matchesCategory = true;
    if (categoryFilter === 'uncategorized') {
      matchesCategory = !t.categoryId;
    } else if (categoryFilter) {
      matchesCategory = t.categoryId === categoryFilter;
    }

    // Reviewed filter
    let matchesReviewed = true;
    if (reviewedFilter === 'reviewed') {
      matchesReviewed = t.reviewed;
    } else if (reviewedFilter === 'unreviewed') {
      matchesReviewed = !t.reviewed;
    }

    return matchesSearch && matchesCategory && matchesReviewed;
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
      render: (amount) => {
        const className = amount >= 0 ? 'positive' : 'negative';
        return `<span class="table-cell-amount ${className}">${formatCurrency(amount)}</span>`;
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
