/**
 * Review Page - One-by-one transaction review workflow
 */

import { AppState } from '../core/state.js';
import { TransactionAPI, CategoryAPI, SettingsAPI } from '../core/api.js';
import { Notification } from '../components/notification.js';
import { DateFormatter } from '../utils/date-formatter.js';
import { formatCurrency } from '../utils/helpers.js';
import { isValidMerchantName, isValidAmount, isValidPersonName } from '../utils/validators.js';

// Check for active database
if (!AppState.requireActiveDatabase()) {
  // Will redirect to landing page
} else {
  document.addEventListener('DOMContentLoaded', init);
}

let unreviewedTransactions = [];
let currentIndex = 0;
let categories = [];
let ownerName = '';

/**
 * Initialize page
 */
async function init() {
  await Promise.all([loadCategories(), loadSettings()]);

  if (!ownerName) {
    Notification.error('Please set your name in Database Settings before reviewing transactions.');
    setTimeout(() => { window.location.href = 'settings.html'; }, 1500);
    return;
  }

  await loadUnreviewedTransactions();
  renderReviewContent();
}

/**
 * Load settings to get owner name for pre-filling splits
 */
async function loadSettings() {
  const dbId = AppState.getActiveDatabaseId();
  try {
    const settings = await SettingsAPI.get(dbId);
    ownerName = settings.ownerName || '';
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Load categories from backend
 */
async function loadCategories() {
  const dbId = AppState.getActiveDatabaseId();
  try {
    categories = await CategoryAPI.getAll(dbId);
  } catch (error) {
    console.error('Error loading categories:', error);
    Notification.error('Failed to load categories');
    categories = [];
  }
}

/**
 * Load unreviewed transactions from backend
 */
async function loadUnreviewedTransactions() {
  const dbId = AppState.getActiveDatabaseId();
  try {
    const all = await TransactionAPI.getAll(dbId);
    unreviewedTransactions = all.filter(t => !t.reviewed);
  } catch (error) {
    console.error('Error loading transactions:', error);
    Notification.error('Failed to load transactions');
    unreviewedTransactions = [];
  }
}

/**
 * Render review content (either review form or complete message)
 */
function renderReviewContent() {
  const contentEl = document.getElementById('review-content');

  if (unreviewedTransactions.length === 0) {
    contentEl.innerHTML = renderCompleteMessage();
    return;
  }

  contentEl.innerHTML = renderReviewForm();
  setupFormEventListeners();
}

/**
 * Render complete message
 */
function renderCompleteMessage() {
  return `
    <div class="review-complete">
      <div class="review-complete-icon">✅</div>
      <h2 class="review-complete-title">All Caught Up!</h2>
      <p class="review-complete-text">
        You've reviewed all your transactions. Great job!
      </p>
      <a href="dashboard.html" class="btn btn-primary btn-large">Back to Dashboard</a>
    </div>
  `;
}

/**
 * Render review form for current transaction
 */
function renderReviewForm() {
  const transaction = unreviewedTransactions[currentIndex];
  // Parse splits if stored as JSON string; default to owner's 100% split for new transactions
  const saved = parseSplits(transaction.splits);
  const isDefaultOwnerSplit = saved.length === 0 && !!ownerName;
  const splits = isDefaultOwnerSplit
    ? [{ personName: ownerName, amount: transaction.amount }]
    : saved;

  const amountClass = transaction.amount >= 0 ? 'positive' : 'negative';

  return `
    <div class="review-card">
      <div class="review-header">
        <div class="progress-indicator">
          Transaction ${currentIndex + 1} of ${unreviewedTransactions.length}
        </div>
        <div class="transaction-amount-display ${amountClass}">
          ${formatCurrency(transaction.amount)}
        </div>
      </div>

      <form id="review-form" class="review-form">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="text" class="form-input" value="${DateFormatter.toDisplay(transaction.date)}" disabled>
        </div>

        <div class="form-group">
          <div class="original-merchant">Original: ${transaction.originalMerchant}</div>
          <label for="merchant" class="form-label required">Merchant Name</label>
          <input
            type="text"
            id="merchant"
            name="merchant"
            class="form-input"
            value="${transaction.merchant}"
            required
          >
        </div>

        <div class="form-group">
          <label for="category" class="form-label">Category</label>
          <select id="category" name="categoryId" class="form-select">
            <option value="">Uncategorized</option>
            ${categories.map(c => `
              <option value="${c.id}" ${c.id === transaction.categoryId ? 'selected' : ''}>
                ${c.emoji || ''} ${c.name}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="splits-section">
          <div class="splits-header">
            <h4>Split Transaction</h4>
            <button type="button" class="btn btn-secondary btn-small" id="add-split-btn">Add Person</button>
          </div>
          <div class="splits-list" id="splits-list">
            ${renderSplitsList(splits, transaction.amount, isDefaultOwnerSplit)}
          </div>
          <div id="split-total" class="split-total"></div>
        </div>

        <div class="form-group">
          <label for="notes" class="form-label">Notes (optional)</label>
          <textarea id="notes" name="notes" class="form-textarea">${transaction.notes || ''}</textarea>
        </div>
      </form>

      <div class="review-actions">
        <div class="review-actions-left">
          <button class="btn btn-secondary" id="prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>
            Previous
          </button>
          <button class="btn btn-danger" id="delete-btn">Delete</button>
        </div>
        <div class="review-actions-right">
          <button class="btn btn-secondary" id="skip-btn">Skip</button>
          <button class="btn btn-primary" id="save-next-btn">Save & Next</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Parse splits from transaction (may be JSON string or array)
 */
function parseSplits(splits) {
  if (!splits) return [];
  if (Array.isArray(splits)) return splits;
  if (typeof splits === 'string' && splits) {
    try {
      return JSON.parse(splits);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Render splits list
 */
function renderSplitsList(splits, transactionAmount, firstIsAuto = false) {
  if (!splits || splits.length === 0) {
    return '<p class="text-muted" id="no-splits-msg">No splits added. The full amount goes to one person.</p>';
  }

  return splits.map((split, index) => {
    const isAuto = firstIsAuto && index === 0;
    // Calculate percentage from amount
    const percentage = transactionAmount !== 0 ? (Math.abs(split.amount) / Math.abs(transactionAmount)) * 100 : 0;

    return `
      <div class="split-item" data-index="${index}" ${isAuto ? 'data-auto="true"' : ''}>
        <div class="form-group">
          <label class="form-label">Person Name</label>
          <input type="text" class="split-name form-input" value="${split.personName}" placeholder="Name" required>
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
        <button type="button" class="btn btn-danger btn-small remove-split-btn" data-index="${index}">Remove</button>
      </div>
    `;
  }).join('');
}

/**
 * Setup form event listeners
 */
function setupFormEventListeners() {
  const transaction = unreviewedTransactions[currentIndex];

  // Save & Next
  document.getElementById('save-next-btn').addEventListener('click', () => {
    saveTransaction(true);
  });

  // Skip
  document.getElementById('skip-btn').addEventListener('click', () => {
    goToNext();
  });

  // Previous
  const prevBtn = document.getElementById('prev-btn');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      goToPrevious();
    });
  }

  // Delete transaction
  document.getElementById('delete-btn').addEventListener('click', () => {
    deleteTransaction();
  });

  // Add split
  document.getElementById('add-split-btn').addEventListener('click', () => {
    addSplit(transaction.amount);
  });

  // Remove split buttons
  document.querySelectorAll('.remove-split-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = e.target.dataset.index;
      removeSplit(index, transaction.amount);
    });
  });

  // Update split total
  updateSplitTotal(transaction.amount);

  // Listen for split amount/percentage changes
  document.querySelectorAll('.split-amount, .split-percentage').forEach(input => {
    input.addEventListener('input', () => updateSplitTotal(transaction.amount));
  });

  // Listen for split type changes
  document.querySelectorAll('.split-type').forEach(select => {
    select.addEventListener('change', (e) => handleSplitTypeChange(e.target, transaction.amount));
  });
}

/**
 * Add a split
 */
function addSplit(transactionAmount) {
  const splitsList = document.getElementById('splits-list');
  const noSplitsMsg = document.getElementById('no-splits-msg');

  if (noSplitsMsg) {
    noSplitsMsg.remove();
  }

  const currentSplits = splitsList.querySelectorAll('.split-item');
  const index = currentSplits.length;
  const totalPeople = index + 1; // including the new split
  const defaultPct = (100 / totalPeople).toFixed(2);

  const splitHTML = `
    <div class="split-item" data-index="${index}">
      <div class="form-group">
        <label class="form-label">Person Name</label>
        <input type="text" class="split-name form-input" value="${index === 0 ? ownerName : ''}" placeholder="Name" required>
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
      <button type="button" class="btn btn-danger btn-small remove-split-btn" data-index="${index}">Remove</button>
    </div>
  `;

  splitsList.insertAdjacentHTML('beforeend', splitHTML);

  // Setup event listener for new remove button
  const newRemoveBtn = splitsList.querySelector(`.remove-split-btn[data-index="${index}"]`);
  newRemoveBtn.addEventListener('click', () => removeSplit(index, transactionAmount));

  // Setup event listeners for new inputs
  const newAmountInput = splitsList.querySelector(`.split-item[data-index="${index}"] .split-amount`);
  const newPercentageInput = splitsList.querySelector(`.split-item[data-index="${index}"] .split-percentage`);
  const newTypeSelect = splitsList.querySelector(`.split-item[data-index="${index}"] .split-type`);

  newAmountInput.addEventListener('input', () => updateSplitTotal(transactionAmount));
  newPercentageInput.addEventListener('input', () => updateSplitTotal(transactionAmount));
  newTypeSelect.addEventListener('change', (e) => handleSplitTypeChange(e.target, transactionAmount));

  updateSplitTotal(transactionAmount);
}

/**
 * Handle split type change (amount <-> percentage)
 */
function handleSplitTypeChange(selectElement, transactionAmount) {
  const index = selectElement.dataset.index;
  const splitItem = document.querySelector(`.split-item[data-index="${index}"]`);
  const amountInput = splitItem.querySelector('.split-amount');
  const percentageInput = splitItem.querySelector('.split-percentage');
  const label = splitItem.querySelector('.split-amount-label');
  const type = selectElement.value;

  if (type === 'percentage') {
    // Switch to percentage
    const currentAmount = parseFloat(amountInput.value) || 0;
    const percentage = transactionAmount !== 0 ? (currentAmount / Math.abs(transactionAmount)) * 100 : 0;
    percentageInput.value = percentage.toFixed(2);

    amountInput.style.display = 'none';
    percentageInput.style.display = 'block';
    label.textContent = 'Percentage (%)';
  } else {
    // Switch to amount
    const currentPercentage = parseFloat(percentageInput.value) || 0;
    const amount = (currentPercentage / 100) * Math.abs(transactionAmount);
    amountInput.value = amount.toFixed(2);

    percentageInput.style.display = 'none';
    amountInput.style.display = 'block';
    label.textContent = 'Amount ($)';
  }

  updateSplitTotal(transactionAmount);
}

/**
 * Remove a split
 */
function removeSplit(index, transactionAmount) {
  const splitItem = document.querySelector(`.split-item[data-index="${index}"]`);
  if (splitItem) {
    splitItem.remove();

    // Check if no splits remain
    const remaining = document.querySelectorAll('.split-item');
    if (remaining.length === 0) {
      document.getElementById('splits-list').innerHTML = '<p class="text-muted" id="no-splits-msg">No splits added. The full amount goes to one person.</p>';
    }

    updateSplitTotal(transactionAmount);
  }
}

/**
 * Get splits from form
 */
function getSplitsFromForm() {
  const splitItems = document.querySelectorAll('.split-item');
  const splits = [];
  const transaction = unreviewedTransactions[currentIndex];

  for (let item of splitItems) {
    const nameInput = item.querySelector('.split-name');
    const amountInput = item.querySelector('.split-amount');
    const percentageInput = item.querySelector('.split-percentage');
    const typeSelect = item.querySelector('.split-type');

    if (!nameInput || !amountInput) continue;

    const name = nameInput.value.trim();
    let amount = 0;

    // Auto splits have no typeSelect — read dollar amount directly
    if (!typeSelect) {
      amount = parseFloat(amountInput.value);
    } else if (typeSelect.value === 'percentage') {
      const percentage = parseFloat(percentageInput.value);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        return false;
      }
      amount = (percentage / 100) * Math.abs(transaction.amount);
    } else {
      amount = parseFloat(amountInput.value);
    }

    if (name && !isNaN(amount)) {
      if (!isValidPersonName(name) || !isValidAmount(amount)) {
        return false;
      }

      // Use negative amount for expenses
      const signedAmount = transaction.amount < 0 ? -Math.abs(amount) : Math.abs(amount);

      splits.push({ personName: name, amount: signedAmount });
    }
  }

  return splits;
}

/**
 * Recalculate the auto split's amount to be the remainder after all other splits
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
      const pct = parseFloat(percentageInput?.value) || 0;
      otherTotal += (pct / 100) * Math.abs(transactionAmount);
    } else {
      otherTotal += parseFloat(amountInput?.value) || 0;
    }
  });

  const remainder = Math.max(0, Math.abs(transactionAmount) - otherTotal);
  autoItem.querySelector('.split-amount').value = remainder.toFixed(2);
}

/**
 * Update split total display
 */
function updateSplitTotal(transactionAmount) {
  recalculateAutoSplit(transactionAmount);
  const splits = getSplitsFromForm();
  const totalEl = document.getElementById('split-total');

  if (!splits || splits === false || splits.length === 0) {
    totalEl.innerHTML = '';
    return;
  }

  const total = splits.reduce((sum, s) => sum + Math.abs(s.amount), 0);
  const difference = Math.abs(Math.abs(total) - Math.abs(transactionAmount));
  const isMatching = difference < 0.01;

  totalEl.innerHTML = `
    Split Total: <span class="split-total-value ${isMatching ? '' : 'split-total-warning'}">${formatCurrency(transactionAmount < 0 ? -total : total)}</span>
    ${!isMatching ? `<br><span class="split-total-warning">⚠ Difference: ${formatCurrency(difference)}</span>` : ''}
  `;
}

/**
 * Save current transaction
 */
async function saveTransaction(andMoveNext) {
  const transaction = unreviewedTransactions[currentIndex];
  const dbId = AppState.getActiveDatabaseId();

  // Get form values
  const merchant = document.getElementById('merchant').value.trim();
  const categoryId = document.getElementById('category').value || null;
  const notes = document.getElementById('notes').value.trim();

  // Validate
  if (!isValidMerchantName(merchant)) {
    Notification.error('Please enter a valid merchant name');
    return;
  }

  // Get splits
  const splits = getSplitsFromForm();
  if (splits === false) {
    Notification.error('Invalid split data');
    return;
  }

  // Update transaction
  const updated = {
    ...transaction,
    merchant,
    categoryId,
    notes,
    splits: JSON.stringify(splits),
    reviewed: true
  };

  try {
    await TransactionAPI.update(dbId, updated);
    // Update local copy so Previous navigation works correctly
    unreviewedTransactions[currentIndex] = { ...updated, splits };
    Notification.success('Transaction saved');

    if (andMoveNext) {
      goToNext();
    }
  } catch (error) {
    console.error('Error saving transaction:', error);
    Notification.error('Failed to save transaction');
  }
}

/**
 * Delete current transaction from the database
 */
async function deleteTransaction() {
  const transaction = unreviewedTransactions[currentIndex];
  const dbId = AppState.getActiveDatabaseId();

  if (!confirm(`Delete "${transaction.merchant}"? This cannot be undone.`)) {
    return;
  }

  try {
    await TransactionAPI.delete(dbId, transaction.id);
    unreviewedTransactions.splice(currentIndex, 1);
    Notification.success('Transaction deleted');

    // Keep index in bounds
    if (currentIndex >= unreviewedTransactions.length) {
      currentIndex = Math.max(0, unreviewedTransactions.length - 1);
    }

    renderReviewContent();
  } catch (error) {
    console.error('Error deleting transaction:', error);
    Notification.error('Failed to delete transaction');
  }
}

/**
 * Go to next transaction
 */
async function goToNext() {
  if (currentIndex < unreviewedTransactions.length - 1) {
    currentIndex++;
    renderReviewContent();
  } else {
    // Reload to check for any remaining unreviewed
    await loadUnreviewedTransactions();
    currentIndex = 0;
    renderReviewContent();
  }
}

/**
 * Go to previous transaction
 */
function goToPrevious() {
  if (currentIndex > 0) {
    currentIndex--;
    renderReviewContent();
  }
}
