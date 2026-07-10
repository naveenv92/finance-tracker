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

// Validated 8-hue categorical palette (fixed order — never cycled/regenerated)
const CATEGORICAL_COLORS = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834'  // orange
];
const OTHER_COLOR = '#9CA3AF'; // fixed neutral gray — never a hue slot
const ACCENT_COLOR = '#4A90E2'; // app primary, used for "selected" emphasis
const DEEMPHASIS_COLOR = '#D1D5DB';
const DEEMPHASIS_BORDER = '#9CA3AF';

const CATEGORY_CAP = 5; // top N real slices; rest fold into "Other" (max 6 wedges total)
const SOURCE_CAP = 5;

// Module-level state
let allTransactions = [];
let allCategories = [];
let chartInstances = {};
let currentDisplayTransactions = [];
let disabledCategories = new Set();
let disabledSources = new Set();
let selectedMonth = currentMonthKey();
let categoryColorMap = {};
let sourceColorMap = {};
let historicalMonths = [];

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

  categoryColorMap = buildCategoryColorMap(allCategories, allTransactions);
  sourceColorMap = buildSourceColorMap(allTransactions);

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
 * Current calendar month as a YYYY-MM string
 */
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get display label for a transaction's category
 */
function getCategoryLabel(t, catMap) {
  return t.categoryId && catMap[t.categoryId]
    ? `${catMap[t.categoryId].emoji || ''} ${catMap[t.categoryId].name}`.trim()
    : 'Uncategorized';
}

function buildCatMap(categories) {
  const catMap = {};
  for (const c of categories) catMap[c.id] = c;
  return catMap;
}

/**
 * Build a stable label -> color map from the FULL lifetime dataset, so a given
 * category/source always renders in the same color regardless of which month
 * or person filter is currently active (colors must follow the entity, not
 * whatever happens to be in the current view).
 */
function buildCategoryColorMap(categories, transactions) {
  const catMap = buildCatMap(categories);
  const totals = {};
  for (const t of transactions) {
    const label = getCategoryLabel(t, catMap);
    if (label === 'Uncategorized') continue;
    totals[label] = (totals[label] || 0) + t.amount;
  }
  const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const colorMap = {};
  ranked.forEach((label, i) => {
    colorMap[label] = i < CATEGORICAL_COLORS.length ? CATEGORICAL_COLORS[i] : OTHER_COLOR;
  });
  colorMap['Uncategorized'] = OTHER_COLOR;
  colorMap['Other'] = OTHER_COLOR;
  return colorMap;
}

function buildSourceColorMap(transactions) {
  const totals = {};
  for (const t of transactions) {
    const label = t.source || 'Unknown';
    totals[label] = (totals[label] || 0) + t.amount;
  }
  const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const colorMap = {};
  ranked.forEach((label, i) => {
    colorMap[label] = i < CATEGORICAL_COLORS.length ? CATEGORICAL_COLORS[i] : OTHER_COLOR;
  });
  colorMap['Unknown'] = OTHER_COLOR;
  colorMap['Other'] = OTHER_COLOR;
  return colorMap;
}

/**
 * Aggregate transactions by label, sort desc, and fold anything past `cap`
 * real entries into a single "Other" bucket. Returns [{label, amount, color}].
 */
function capAndAggregate(transactions, labelFn, colorMap, cap) {
  const totals = {};
  for (const t of transactions) {
    const label = labelFn(t);
    totals[label] = (totals[label] || 0) + t.amount;
  }
  let entries = Object.entries(totals).map(([label, amount]) => ({
    label,
    amount: parseFloat(amount.toFixed(2))
  }));
  entries.sort((a, b) => b.amount - a.amount);

  if (entries.length > cap + 1) {
    const top = entries.slice(0, cap);
    const restSum = entries.slice(cap).reduce((sum, e) => sum + e.amount, 0);
    entries = [...top, { label: 'Other', amount: parseFloat(restSum.toFixed(2)) }];
  }

  return entries.map(e => ({ ...e, color: colorMap[e.label] || OTHER_COLOR }));
}

/**
 * Render the person filter bar
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
  renderLifetimeStats(currentDisplayTransactions);
  renderSpendingOverTime(currentDisplayTransactions);
  renderMonthScoped(currentDisplayTransactions);
}

/**
 * Change the selected month (called from the historical chart's click handler)
 * and re-render only the month-scoped views, plus the historical chart's
 * bar emphasis (lightweight update, no destroy/recreate).
 */
function selectMonth(month) {
  if (month === selectedMonth) return;
  selectedMonth = month;
  disabledCategories = new Set();
  disabledSources = new Set();
  updateHistoricalChartEmphasis();
  renderMonthScoped(currentDisplayTransactions);
}

/**
 * Destroy all existing Chart.js instances
 */
function destroyCharts() {
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
}

function monthTransactions(transactions) {
  return transactions.filter(t => t.date.slice(0, 7) === selectedMonth);
}

/**
 * Lifetime-only stats (unaffected by the selected month)
 */
function renderLifetimeStats(transactions) {
  const totalLifetime = transactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('stat-total-lifetime').textContent = formatCurrency(totalLifetime);

  if (transactions.length === 0) {
    document.getElementById('stat-avg-day-lifetime').textContent = formatCurrency(0);
    return;
  }

  const allDates = transactions.map(t => t.date).sort();
  const lifetimeDays = Math.max(1, Math.round(
    (new Date(allDates[allDates.length - 1]) - new Date(allDates[0])) / (1000 * 60 * 60 * 24)
  ) + 1);
  document.getElementById('stat-avg-day-lifetime').textContent = formatCurrency(totalLifetime / lifetimeDays);
}

/**
 * Stats scoped to the selected month
 */
function renderMonthStats(transactions) {
  const monthTxns = monthTransactions(transactions);
  const monthLabel = formatMonthLabel(selectedMonth);

  document.getElementById('stat-label-total-month').textContent = `Total Spent (${monthLabel})`;
  document.getElementById('stat-label-avg-day-month').textContent = `Avg Spent / Day (${monthLabel})`;

  const totalMonth = monthTxns.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('stat-total-month').textContent = formatCurrency(totalMonth);

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
 * Everything scoped to the selected month: stat tiles, scope label, pie, sankey, source chart
 */
function renderMonthScoped(transactions) {
  renderMonthStats(transactions);
  document.getElementById('analytics-scope-label').textContent = `Showing: ${formatMonthLabel(selectedMonth)}`;
  renderCategoryPie(transactions, allCategories);
  renderSankey(transactions, allCategories);
  renderBySource(transactions);
}

/**
 * Returns the number of days in a given YYYY-MM month string
 */
function daysInMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month, 0).getDate();
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
 * Single-axis bar chart: last 12 months, Total Spent. Clicking a bar selects
 * that month, which re-scopes the pie/sankey/source chart/month stats below.
 * The selected month's bar is emphasized (accent color); all others are a
 * de-emphasized gray — this avoids both a dual-axis chart and a recolored
 * legend, keeping the "which month is selected" signal purely visual.
 */
function renderSpendingOverTime(transactions) {
  historicalMonths = getLast12Months();

  const byMonth = {};
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    if (historicalMonths.includes(m)) byMonth[m] = (byMonth[m] || 0) + t.amount;
  }

  const totals = historicalMonths.map(m => parseFloat((byMonth[m] || 0).toFixed(2)));
  const formattedLabels = historicalMonths.map(formatMonthLabel);
  const barColors = historicalMonths.map(m => m === selectedMonth ? ACCENT_COLOR + 'cc' : DEEMPHASIS_COLOR);
  const borderColors = historicalMonths.map(m => m === selectedMonth ? ACCENT_COLOR : DEEMPHASIS_BORDER);

  const canvas = document.getElementById('chart-spending-over-time');
  const ctx = canvas.getContext('2d');
  chartInstances['bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: formattedLabels,
      datasets: [{
        label: 'Total Spent',
        data: totals,
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        selectMonth(historicalMonths[elements[0].index]);
      },
      onHover: (evt, elements) => {
        canvas.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
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
 * Re-color the historical chart's bars to reflect the newly selected month,
 * without destroying/recreating the chart (its underlying data is unchanged).
 */
function updateHistoricalChartEmphasis() {
  const chart = chartInstances['bar'];
  if (!chart) return;
  chart.data.datasets[0].backgroundColor = historicalMonths.map(
    m => m === selectedMonth ? ACCENT_COLOR + 'cc' : DEEMPHASIS_COLOR
  );
  chart.data.datasets[0].borderColor = historicalMonths.map(
    m => m === selectedMonth ? ACCENT_COLOR : DEEMPHASIS_BORDER
  );
  chart.update();
}

function showEmptyState(canvasId, legendId, message) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (legendId) document.getElementById(legendId).innerHTML = '';
  ctx.save();
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'center';
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

/**
 * Pie chart: spending by category for the selected month
 */
function renderCategoryPie(transactions, categories) {
  const catMap = buildCatMap(categories);
  const monthTx = monthTransactions(transactions);

  if (chartInstances['pie']) { chartInstances['pie'].destroy(); delete chartInstances['pie']; }

  if (monthTx.length === 0) {
    showEmptyState('chart-category-pie', 'legend-category-pie', 'No transactions this month');
    return;
  }

  const entries = capAndAggregate(monthTx, t => getCategoryLabel(t, catMap), categoryColorMap, CATEGORY_CAP);
  const visible = entries.filter(e => !disabledCategories.has(e.label));

  const ctx = document.getElementById('chart-category-pie').getContext('2d');
  chartInstances['pie'] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: visible.map(e => e.label),
      datasets: [{
        data: visible.map(e => e.amount),
        backgroundColor: visible.map(e => e.color + 'cc'),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${formatCurrency(ctx.parsed)}`
          }
        }
      }
    }
  });

  const colorMap = Object.fromEntries(entries.map(e => [e.label, e.color]));
  renderLegend('legend-category-pie', entries.map(e => e.label), colorMap, disabledCategories, (label, disabled) => {
    if (disabled) disabledCategories.add(label);
    else disabledCategories.delete(label);
    renderCategoryPie(currentDisplayTransactions, allCategories);
  });
}

/**
 * Sankey diagram: Total Spending -> Category, for the selected month.
 * Uses the same capped category set + stable colors as the pie chart so the
 * two visuals always agree.
 */
function renderSankey(transactions, categories) {
  const catMap = buildCatMap(categories);
  const monthTx = monthTransactions(transactions);

  if (chartInstances['sankey']) { chartInstances['sankey'].destroy(); delete chartInstances['sankey']; }

  if (monthTx.length === 0) {
    showEmptyState('chart-sankey', null, 'No transactions this month');
    return;
  }

  const entries = capAndAggregate(monthTx, t => getCategoryLabel(t, catMap), categoryColorMap, CATEGORY_CAP);
  const visible = entries.filter(e => !disabledCategories.has(e.label));

  const TOTAL_NODE = 'Total Spending';
  const sankeyData = visible.map(e => ({ from: TOTAL_NODE, to: e.label, flow: e.amount }));
  const colorByLabel = Object.fromEntries(visible.map(e => [e.label, e.color]));

  const ctx = document.getElementById('chart-sankey').getContext('2d');
  chartInstances['sankey'] = new Chart(ctx, {
    type: 'sankey',
    data: {
      datasets: [{
        label: 'Spending Flow',
        data: sankeyData,
        colorFrom: () => ACCENT_COLOR,
        colorTo: (c) => colorByLabel[c.dataset.data[c.dataIndex].to] || OTHER_COLOR,
        colorMode: 'gradient'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.raw.to}: ${formatCurrency(ctx.raw.flow)}`
          }
        }
      }
    }
  });
}

/**
 * Bar chart: spending by source for the selected month (one bar per source)
 */
function renderBySource(transactions) {
  const monthTx = monthTransactions(transactions);

  if (chartInstances['source']) { chartInstances['source'].destroy(); delete chartInstances['source']; }

  if (monthTx.length === 0) {
    showEmptyState('chart-by-source', 'legend-by-source', 'No transactions this month');
    return;
  }

  const entries = capAndAggregate(monthTx, t => t.source || 'Unknown', sourceColorMap, SOURCE_CAP);
  const visible = entries.filter(e => !disabledSources.has(e.label));

  const ctx = document.getElementById('chart-by-source').getContext('2d');
  chartInstances['source'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: visible.map(e => e.label),
      datasets: [{
        label: 'Amount',
        data: visible.map(e => e.amount),
        backgroundColor: visible.map(e => e.color + 'cc'),
        borderColor: visible.map(e => e.color),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: v => formatCurrency(v) },
          grid: { color: '#E5E7EB' }
        }
      }
    }
  });

  const colorMap = Object.fromEntries(entries.map(e => [e.label, e.color]));
  renderLegend('legend-by-source', entries.map(e => e.label), colorMap, disabledSources, (label, disabled) => {
    if (disabled) disabledSources.add(label);
    else disabledSources.delete(label);
    renderBySource(currentDisplayTransactions);
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
