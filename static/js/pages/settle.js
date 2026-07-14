/**
 * Settle Debts Page - Netted balances between people and settlement history
 */

import { AppState } from '../core/state.js';
import { TransactionAPI, TemplateAPI, SettingsAPI, SettlementAPI } from '../core/api.js';
import { Table } from '../components/table.js';
import { Modal } from '../components/modal.js';
import { Notification } from '../components/notification.js';
import { formatCurrency, escapeHTML } from '../utils/helpers.js';
import { isValidPersonName, isValidAmount } from '../utils/validators.js';
import { derivePeople, computeNetBalances } from '../utils/balances.js';

if (!AppState.requireActiveDatabase()) {
  // Will redirect to landing page
} else {
  document.addEventListener('DOMContentLoaded', init);
}

let transactions = [];
let templates = [];
let ownerName = '';
let settlements = [];
let people = [];
let netBalances = [];
let balancesTable = null;
let historyTable = null;

async function init() {
  await loadData();
  computeAndRender();
  document.getElementById('record-settlement-btn').addEventListener('click', () => showSettlementModal());
}

async function loadData() {
  const dbId = AppState.getActiveDatabaseId();
  try {
    const [allTransactions, allTemplates, settings, allSettlements] = await Promise.all([
      TransactionAPI.getAll(dbId),
      TemplateAPI.getAll(dbId),
      SettingsAPI.get(dbId),
      SettlementAPI.getAll(dbId),
    ]);
    transactions = allTransactions.filter(t => t.reviewed);
    templates = allTemplates;
    ownerName = settings.ownerName || '';
    settlements = allSettlements;
  } catch (error) {
    console.error('Error loading settle data:', error);
    Notification.error('Failed to load balances');
    transactions = [];
    templates = [];
    settlements = [];
  }
}

function computeAndRender() {
  people = derivePeople(transactions, templates, ownerName);
  netBalances = computeNetBalances(transactions, settlements);
  renderBalances();
  renderHistory();
}

function renderBalances() {
  const emptyEl = document.getElementById('balances-empty');
  const containerEl = document.getElementById('balances-container');

  if (netBalances.length === 0) {
    emptyEl.style.display = '';
    containerEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  containerEl.style.display = '';

  const columns = [
    {
      key: 'from',
      label: 'Balance',
      sortable: false,
      render: (_value, row) => `
        <div class="balance-summary">
          <span class="balance-person">${escapeHTML(row.from)}</span>
          <span class="balance-arrow">owes</span>
          <span class="balance-person">${escapeHTML(row.to)}</span>
        </div>
      `,
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      render: (value) => `<span class="balance-amount">${formatCurrency(value)}</span>`,
    },
    {
      key: 'settle',
      label: '',
      sortable: false,
      align: 'right',
      render: (_value, row) => `<button type="button" class="btn btn-secondary btn-small" data-settle-row>Settle</button>`,
    },
  ];

  balancesTable = new Table('balances-container', columns, netBalances);
  balancesTable.setRowClickHandler((row) => showSettlementModal(row));
  balancesTable.render();
}

function renderHistory() {
  const emptyEl = document.getElementById('history-empty');
  const containerEl = document.getElementById('history-container');

  if (settlements.length === 0) {
    emptyEl.style.display = '';
    containerEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  containerEl.style.display = '';

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'fromPerson', label: 'From' },
    { key: 'toPerson', label: 'To' },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      render: (value) => formatCurrency(value),
    },
    { key: 'notes', label: 'Notes', sortable: false },
    {
      key: 'delete',
      label: '',
      sortable: false,
      align: 'right',
      render: (_value, row) => `<button type="button" class="btn btn-secondary btn-small" data-delete-id="${row.id}">Delete</button>`,
    },
  ];

  historyTable = new Table('history-container', columns, settlements);
  historyTable.render();

  containerEl.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSettlement(btn.getAttribute('data-delete-id'));
    });
  });
}

function showSettlementModal(prefill) {
  if (people.length === 0) {
    Notification.warning('No split-cost transactions yet');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = prefill?.from || people[0];
  const defaultTo = prefill?.to || people.find(p => p !== defaultFrom) || people[0];
  const personOptions = (selected) => people.map(
    p => `<option value="${escapeHTML(p)}"${p === selected ? ' selected' : ''}>${escapeHTML(p)}</option>`
  ).join('');

  const contentHTML = `
    <form id="settlement-form">
      <div class="form-group">
        <label for="settle-from" class="form-label required">From (who paid)</label>
        <select id="settle-from" name="fromPerson" class="form-select">
          ${personOptions(defaultFrom)}
        </select>
      </div>
      <div class="form-group">
        <label for="settle-to" class="form-label required">To (who received)</label>
        <select id="settle-to" name="toPerson" class="form-select">
          ${personOptions(defaultTo)}
        </select>
      </div>
      <div class="form-group">
        <label for="settle-amount" class="form-label required">Amount</label>
        <input type="number" id="settle-amount" name="amount" class="form-input" step="0.01" min="0.01" value="${prefill ? prefill.amount.toFixed(2) : ''}" required>
      </div>
      <div class="form-group">
        <label for="settle-date" class="form-label required">Date</label>
        <input type="date" id="settle-date" name="date" class="form-input" value="${today}" required>
      </div>
      <div class="form-group">
        <label for="settle-notes" class="form-label">Notes</label>
        <textarea id="settle-notes" name="notes" class="form-textarea" placeholder="Optional notes..."></textarea>
      </div>
    </form>
  `;

  const modal = Modal.create('settlement-modal', 'Record Settlement', contentHTML);
  modal.setSubmitText('Record Settlement');

  modal.setSubmitHandler(async () => {
    const fromPerson = document.getElementById('settle-from').value;
    const toPerson = document.getElementById('settle-to').value;
    const amount = parseFloat(document.getElementById('settle-amount').value);
    const date = document.getElementById('settle-date').value;
    const notes = document.getElementById('settle-notes').value.trim();

    if (!isValidPersonName(fromPerson) || !isValidPersonName(toPerson)) {
      Notification.error('Please choose who paid and who received');
      return false;
    }
    if (fromPerson === toPerson) {
      Notification.error('From and To must be different people');
      return false;
    }
    if (!isValidAmount(amount) || amount <= 0) {
      Notification.error('Please enter a valid amount');
      return false;
    }
    if (!date) {
      Notification.error('Please enter a date');
      return false;
    }

    try {
      const dbId = AppState.getActiveDatabaseId();
      await SettlementAPI.create(dbId, { fromPerson, toPerson, amount, date, notes });
      Notification.success('Settlement recorded');
      settlements = await SettlementAPI.getAll(dbId);
      computeAndRender();
    } catch (error) {
      console.error('Error recording settlement:', error);
      Notification.error('Failed to record settlement');
      return false;
    }
  });

  modal.show();
}

async function deleteSettlement(settlementId) {
  if (!confirm('Delete this settlement? This cannot be undone.')) return;

  try {
    const dbId = AppState.getActiveDatabaseId();
    await SettlementAPI.delete(dbId, settlementId);
    Notification.success('Settlement deleted');
    settlements = await SettlementAPI.getAll(dbId);
    computeAndRender();
  } catch (error) {
    console.error('Error deleting settlement:', error);
    Notification.error('Failed to delete settlement');
  }
}
