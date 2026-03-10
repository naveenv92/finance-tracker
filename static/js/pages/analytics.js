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
let currentDisplayTransactions = [];
let disabledCategories = new Set();
let disabledSources = new Set();

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
        <label for="filter-person" class="form-label">Person</label>
        <select id="filter-person" class="form-select">
          <option value="">All People</option>
          ${personNames.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
    </div>
  `;

  document.getElementById('filter-person').addEventListener('change', applyFilters);
}

/**
 * Read filters, filter transactions, destroy old charts, re-render everything
 */
function applyFilters() {
  const person = document.getElementById('filter-person')?.value || '';

  let filtered = allTransactions.filter(t => {
    if (person) {
      const split = parseSplits(t.splits).find(s => s.personName === person);
      return !!split;
    }
    return true;
  });

  // When filtering by person, use their individual split amount
  currentDisplayTransactions = filtered.map(t => {
    if (!person) return t;
    const split = parseSplits(t.splits).find(s => s.personName === person);
    return { ...t, amount: split ? split.amount : t.amount };
  });

  // Reset toggles when person filter changes (data context changes)
  disabledCategories = new Set();
  disabledSources = new Set();

  destroyCharts();
  renderStats(currentDisplayTransactions);
  renderSpendingOverTime(currentDisplayTransactions);
  renderByCategory(currentDisplayTransactions, allCategories);
  renderBySource(currentDisplayTransactions);
}

/**
 * Destroy all existing Chart.js instances
 */
function destroyCharts() {
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
}

/**
 * Render the four stat numbers: lifetime and this-month totals + avg/day
 */
function renderStats(transactions) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthTxns = transactions.filter(t => t.date.slice(0, 7) === thisMonth);

  const totalLifetime = transactions.reduce((sum, t) => sum + t.amount, 0);
  const totalMonth    = monthTxns.reduce((sum, t) => sum + t.amount, 0);

  document.getElementById('stat-total-lifetime').textContent = formatCurrency(totalLifetime);
  document.getElementById('stat-total-month').textContent    = formatCurrency(totalMonth);

  // Lifetime avg/day: days between min and max transaction date
  if (transactions.length === 0) {
    document.getElementById('stat-avg-day-lifetime').textContent = formatCurrency(0);
    document.getElementById('stat-avg-day-month').textContent    = formatCurrency(0);
    return;
  }

  const allDates = transactions.map(t => t.date).sort();
  const lifetimeDays = Math.max(1, Math.round(
    (new Date(allDates[allDates.length - 1]) - new Date(allDates[0])) / (1000 * 60 * 60 * 24)
  ) + 1);
  document.getElementById('stat-avg-day-lifetime').textContent = formatCurrency(totalLifetime / lifetimeDays);

  // This-month avg/day: days between min and max transaction date within the month
  if (monthTxns.length === 0) {
    document.getElementById('stat-avg-day-month').textContent = formatCurrency(0);
    return;
  }

  const monthDates = monthTxns.map(t => t.date).sort();
  const monthDays = Math.max(1, Math.round(
    (new Date(monthDates[monthDates.length - 1]) - new Date(monthDates[0])) / (1000 * 60 * 60 * 24)
  ) + 1);
  document.getElementById('stat-avg-day-month').textContent = formatCurrency(totalMonth / monthDays);
}

/**
 * Returns the number of days in a given YYYY-MM month string
 */
function daysInMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

/**
 * Grouped bar chart: last 12 months — total spending (left axis) + avg/day (right axis)
 */
function renderSpendingOverTime(transactions) {
  // Build the last 12 month keys in order
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Aggregate totals per month
  const byMonth = {};
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    if (months.includes(m)) byMonth[m] = (byMonth[m] || 0) + t.amount;
  }

  const totals  = months.map(m => parseFloat((byMonth[m] || 0).toFixed(2)));
  const avgDays = months.map((m, i) => parseFloat((totals[i] / daysInMonth(m)).toFixed(2)));

  const formattedLabels = months.map(m => {
    const [year, month] = m.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  const ctx = document.getElementById('chart-spending-over-time').getContext('2d');
  chartInstances['bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: formattedLabels,
      datasets: [
        {
          label: 'Total Spent',
          data: totals,
          backgroundColor: '#4A90E2cc',
          borderColor: '#4A90E2',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'yLeft'
        },
        {
          label: 'Avg / Day',
          data: avgDays,
          backgroundColor: '#10B981cc',
          borderColor: '#10B981',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'yRight'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        yLeft: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
          grid: { color: '#E5E7EB' }
        },
        yRight: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
          grid: { drawOnChartArea: false }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/**
 * Returns last 12 calendar month keys as YYYY-MM strings
 */
function getLast12Months() {
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Format YYYY-MM to short display label
 */
function formatMonthLabel(m) {
  const [year, month] = m.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Get display label for a transaction's category
 */
function getCategoryLabel(t, catMap) {
  return t.categoryId && catMap[t.categoryId]
    ? `${catMap[t.categoryId].emoji || ''} ${catMap[t.categoryId].name}`.trim()
    : 'Uncategorized';
}

/**
 * Stacked bar chart: spending by category over last 12 months
 */
function renderByCategory(transactions, categories) {
  const months = getLast12Months();
  const catMap = {};
  for (const c of categories) catMap[c.id] = c;

  const labelSet = new Set();
  for (const t of transactions) labelSet.add(getCategoryLabel(t, catMap));
  const allLabels = [...labelSet].sort();

  const colorMap = {};
  allLabels.forEach((label, i) => { colorMap[label] = CHART_COLORS[i % CHART_COLORS.length]; });

  const datasets = allLabels
    .filter(label => !disabledCategories.has(label))
    .map(label => ({
      label,
      data: months.map(m =>
        parseFloat(transactions
          .filter(t => t.date.slice(0, 7) === m && getCategoryLabel(t, catMap) === label)
          .reduce((sum, t) => sum + t.amount, 0)
          .toFixed(2))
      ),
      backgroundColor: colorMap[label] + 'cc',
      borderColor: colorMap[label],
      borderWidth: 1,
      stack: 'stack0'
    }));

  if (chartInstances['category']) chartInstances['category'].destroy();
  chartInstances['category'] = renderStackedBar('chart-by-category', months, datasets);

  renderLegend('legend-by-category', allLabels, colorMap, disabledCategories, (label, disabled) => {
    if (disabled) disabledCategories.add(label);
    else disabledCategories.delete(label);
    renderByCategory(currentDisplayTransactions, allCategories);
  });
}

/**
 * Stacked bar chart: spending by source over last 12 months
 */
function renderBySource(transactions) {
  const months = getLast12Months();

  const labelSet = new Set();
  for (const t of transactions) labelSet.add(t.source || 'Unknown');
  const allLabels = [...labelSet].sort();

  const colorMap = {};
  allLabels.forEach((label, i) => { colorMap[label] = CHART_COLORS[i % CHART_COLORS.length]; });

  const datasets = allLabels
    .filter(label => !disabledSources.has(label))
    .map(label => ({
      label,
      data: months.map(m =>
        parseFloat(transactions
          .filter(t => t.date.slice(0, 7) === m && (t.source || 'Unknown') === label)
          .reduce((sum, t) => sum + t.amount, 0)
          .toFixed(2))
      ),
      backgroundColor: colorMap[label] + 'cc',
      borderColor: colorMap[label],
      borderWidth: 1,
      stack: 'stack0'
    }));

  if (chartInstances['source']) chartInstances['source'].destroy();
  chartInstances['source'] = renderStackedBar('chart-by-source', months, datasets);

  renderLegend('legend-by-source', allLabels, colorMap, disabledSources, (label, disabled) => {
    if (disabled) disabledSources.add(label);
    else disabledSources.delete(label);
    renderBySource(currentDisplayTransactions);
  });
}

/**
 * Shared stacked bar chart renderer — returns the Chart instance
 */
function renderStackedBar(canvasId, months, datasets) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: months.map(formatMonthLabel), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
          grid: { color: '#E5E7EB' }
        }
      }
    }
  });
}

/**
 * Render interactive checkbox legend below a chart
 */
function renderLegend(containerId, allLabels, colorMap, disabledSet, onToggle) {
  const container = document.getElementById(containerId);
  container.innerHTML = allLabels.map(label => {
    const isDisabled = disabledSet.has(label);
    const color = colorMap[label];
    const safeLabel = encodeURIComponent(label);
    return `
      <label class="legend-item${isDisabled ? ' legend-item--disabled' : ''}">
        <input type="checkbox" ${isDisabled ? '' : 'checked'} data-label="${safeLabel}">
        <span class="legend-color" style="background:${color}"></span>
        <span>${label}</span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const label = decodeURIComponent(e.target.dataset.label);
      onToggle(label, !e.target.checked);
    });
  });
}
