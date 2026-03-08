/**
 * Analytics Page - Spending insights with charts
 */

import { AppState } from '../core/state.js';
import { TransactionAPI, CategoryAPI } from '../core/api.js';
import { formatCurrency } from '../utils/helpers.js';
import { Notification } from '../components/notification.js';

// Check for active database
if (!AppState.requireActiveDatabase()) {
  // Will redirect to landing page
} else {
  document.addEventListener('DOMContentLoaded', init);
}

// Chart.js color palette
const CHART_COLORS = [
  '#4A90E2', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16',
  '#A855F7', '#6366F1', '#D97706', '#059669', '#DC2626'
];

// Module-level state
let allTransactions = [];
let allCategories = [];
let chartInstances = {};

async function init() {
  const dbId = AppState.getActiveDatabaseId();

  try {
    const [txns, cats] = await Promise.all([
      TransactionAPI.getAll(dbId),
      CategoryAPI.getAll(dbId)
    ]);
    allTransactions = txns.filter(t => t.reviewed);
    allCategories = cats;
  } catch (err) {
    console.error('Failed to load analytics data:', err);
    Notification.error('Failed to load analytics data');
    return;
  }

  renderFilters();
  applyFilters();
}

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
 * Render the date and person filter bar
 */
function renderFilters() {
  const personNames = [...new Set(
    allTransactions.flatMap(t => parseSplits(t.splits).map(s => s.personName))
  )].sort();

  document.getElementById('analytics-filters').innerHTML = `
    <div class="analytics-filter-row">
      <div class="analytics-filter">
        <label class="form-label">Start Date</label>
        <input type="date" id="filter-date-start" class="form-input">
      </div>
      <div class="analytics-filter">
        <label class="form-label">End Date</label>
        <input type="date" id="filter-date-end" class="form-input">
      </div>
      <div class="analytics-filter">
        <label for="filter-person" class="form-label">Person</label>
        <select id="filter-person" class="form-select">
          <option value="">All People</option>
          ${personNames.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
    </div>
  `;

  document.getElementById('filter-date-start').addEventListener('change', applyFilters);
  document.getElementById('filter-date-end').addEventListener('change', applyFilters);
  document.getElementById('filter-person').addEventListener('change', applyFilters);
}

/**
 * Read filters, filter transactions, destroy old charts, re-render everything
 */
function applyFilters() {
  const dateStart = document.getElementById('filter-date-start')?.value || '';
  const dateEnd   = document.getElementById('filter-date-end')?.value   || '';
  const person    = document.getElementById('filter-person')?.value     || '';

  let filtered = allTransactions.filter(t => {
    const matchesDate = (!dateStart || t.date >= dateStart) &&
                        (!dateEnd   || t.date <= dateEnd);
    if (!matchesDate) return false;

    if (person) {
      const split = parseSplits(t.splits).find(s => s.personName === person);
      return !!split;
    }
    return true;
  });

  // When filtering by person, use their individual split amount
  const displayTransactions = filtered.map(t => {
    if (!person) return t;
    const split = parseSplits(t.splits).find(s => s.personName === person);
    return { ...t, amount: split ? split.amount : t.amount };
  });

  destroyCharts();
  renderStats(displayTransactions);
  renderSpendingOverTime(displayTransactions);
  renderByCategory(displayTransactions, allCategories);
  renderBySource(displayTransactions);
}

/**
 * Destroy all existing Chart.js instances
 */
function destroyCharts() {
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
}

/**
 * Render the two large stat numbers
 */
function renderStats(transactions) {
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  document.getElementById('stat-total').textContent = formatCurrency(total);

  if (transactions.length === 0) {
    document.getElementById('stat-avg-day').textContent = formatCurrency(0);
    return;
  }

  const dates = transactions.map(t => t.date).sort();
  const minDate = new Date(dates[0]);
  const maxDate = new Date(dates[dates.length - 1]);
  const days = Math.max(1, Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1);

  document.getElementById('stat-avg-day').textContent = formatCurrency(total / days);
}

/**
 * Bar chart: spending grouped by month
 */
function renderSpendingOverTime(transactions) {
  const byMonth = {};
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    byMonth[month] = (byMonth[month] || 0) + Math.abs(t.amount);
  }

  const labels = Object.keys(byMonth).sort();
  const data = labels.map(m => parseFloat(byMonth[m].toFixed(2)));
  const formattedLabels = labels.map(m => {
    const [year, month] = m.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, 1)
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  const ctx = document.getElementById('chart-spending-over-time').getContext('2d');
  chartInstances['bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: formattedLabels,
      datasets: [{
        label: 'Spending',
        data,
        backgroundColor: '#4A90E2cc',
        borderColor: '#4A90E2',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => formatCurrency(ctx.parsed.y) } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
          grid: { color: '#E5E7EB' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/**
 * Donut chart: spending by category
 */
function renderByCategory(transactions, categories) {
  const catMap = {};
  for (const c of categories) catMap[c.id] = c;

  const byCategory = {};
  for (const t of transactions) {
    const label = t.categoryId && catMap[t.categoryId]
      ? `${catMap[t.categoryId].emoji || ''} ${catMap[t.categoryId].name}`.trim()
      : 'Uncategorized';
    byCategory[label] = (byCategory[label] || 0) + Math.abs(t.amount);
  }

  chartInstances['category'] = renderDonut('chart-by-category', byCategory);
}

/**
 * Donut chart: spending by source
 */
function renderBySource(transactions) {
  const bySource = {};
  for (const t of transactions) {
    const label = t.source || 'Unknown';
    bySource[label] = (bySource[label] || 0) + Math.abs(t.amount);
  }

  chartInstances['source'] = renderDonut('chart-by-source', bySource);
}

/**
 * Shared donut chart renderer — returns the Chart instance
 */
function renderDonut(canvasId, dataMap) {
  const sorted = Object.entries(dataMap).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([k]) => k);
  const data = sorted.map(([, v]) => parseFloat(v.toFixed(2)));
  const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 16, font: { size: 13 }, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${formatCurrency(ctx.parsed)} (${pct}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });
}
