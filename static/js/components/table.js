/**
 * Table Component
 * Dynamic sortable table with custom rendering
 */

import { sortBy } from '../utils/helpers.js';

export class Table {
  constructor(containerId, columns, data) {
    this.containerId = containerId;
    this.columns = columns;
    this.data = data;
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.rowClickHandler = null;
    this.container = null;
  }

  /**
   * Set row click handler
   * @param {Function} handler - Click handler function (row, index)
   */
  setRowClickHandler(handler) {
    this.rowClickHandler = handler;
    return this;
  }

  /**
   * Render the table
   */
  render() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error('Table container not found:', this.containerId);
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';

    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    this.columns.forEach(col => {
      const th = document.createElement('th');
      if (col.headerHTML !== undefined) {
        th.innerHTML = col.headerHTML;
      } else {
        th.textContent = col.label;
      }

      if (col.sortable !== false) {
        th.classList.add('sortable');

        if (this.sortColumn === col.key) {
          th.classList.add(`sorted-${this.sortDirection}`);
        }

        th.addEventListener('click', () => {
          this.handleSort(col.key);
        });
      }

      if (col.align) {
        th.style.textAlign = col.align;
      }

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');

    if (this.data.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = this.columns.length;
      emptyCell.className = 'table-empty';
      emptyCell.innerHTML = `
        <div class="table-empty-icon">📊</div>
        <div class="table-empty-text">No data available</div>
      `;
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      const sortedData = this.getSortedData();

      sortedData.forEach((row, index) => {
        const tr = document.createElement('tr');

        if (this.rowClickHandler) {
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => {
            this.rowClickHandler(row, index);
          });
        }

        this.columns.forEach(col => {
          const td = document.createElement('td');
          const value = row[col.key];

          if (col.render) {
            const rendered = col.render(value, row);
            if (typeof rendered === 'string') {
              td.innerHTML = rendered;
            } else {
              td.appendChild(rendered);
            }
          } else {
            td.textContent = value ?? '';
          }

          if (col.align) {
            td.style.textAlign = col.align;
          }

          if (col.className) {
            td.className = col.className;
          }

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);

    // Clear container and add table
    this.container.innerHTML = '';
    this.container.appendChild(table);

    return this;
  }

  /**
   * Handle column sort
   * @param {string} columnKey - Column key to sort by
   */
  handleSort(columnKey) {
    if (this.sortColumn === columnKey) {
      // Toggle direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = columnKey;
      this.sortDirection = 'asc';
    }

    this.render();
  }

  /**
   * Get sorted data
   * @returns {Array} Sorted data
   */
  getSortedData() {
    if (!this.sortColumn) {
      return this.data;
    }

    return sortBy(this.data, this.sortColumn, this.sortDirection);
  }

  /**
   * Update table with new data
   * @param {Array} data - New data
   */
  update(data) {
    this.data = data;
    this.render();
    return this;
  }

  /**
   * Clear sort
   */
  clearSort() {
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.render();
    return this;
  }

  /**
   * Get current data (with sorting applied)
   * @returns {Array} Current data
   */
  getData() {
    return this.getSortedData();
  }

  /**
   * Destroy the table
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
