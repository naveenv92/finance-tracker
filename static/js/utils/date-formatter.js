/**
 * Date formatting and parsing utilities
 */

export class DateFormatter {
  /**
   * Parse date string according to format
   * @param {string} dateString - Date string to parse
   * @param {string} format - Format of the date string
   * @returns {Date|null} Parsed Date object or null if invalid
   */
  static parse(dateString, format) {
    if (!dateString || !format) return null;

    const parts = {};
    let formatPattern;

    // Create regex pattern based on format
    // Month/day are matched as 1-2 digits since CSV exports often omit the
    // leading zero (e.g. "3/15/2026") regardless of which format is selected.
    switch (format) {
      case 'MM/DD/YYYY':
        formatPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        break;
      case 'DD/MM/YYYY':
        formatPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        break;
      case 'YYYY-MM-DD':
        formatPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
        break;
      case 'M/D/YYYY':
        formatPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        break;
      default:
        return null;
    }

    const match = dateString.match(formatPattern);
    if (!match) return null;

    // Extract parts based on format
    switch (format) {
      case 'MM/DD/YYYY':
        parts.month = parseInt(match[1], 10);
        parts.day = parseInt(match[2], 10);
        parts.year = parseInt(match[3], 10);
        break;
      case 'DD/MM/YYYY':
        parts.day = parseInt(match[1], 10);
        parts.month = parseInt(match[2], 10);
        parts.year = parseInt(match[3], 10);
        break;
      case 'YYYY-MM-DD':
        parts.year = parseInt(match[1], 10);
        parts.month = parseInt(match[2], 10);
        parts.day = parseInt(match[3], 10);
        break;
      case 'M/D/YYYY':
        parts.month = parseInt(match[1], 10);
        parts.day = parseInt(match[2], 10);
        parts.year = parseInt(match[3], 10);
        break;
    }

    // Validate date parts
    if (parts.month < 1 || parts.month > 12) return null;
    if (parts.day < 1 || parts.day > 31) return null;
    if (parts.year < 1900 || parts.year > 2100) return null;

    // Create date (month is 0-indexed in JavaScript)
    const date = new Date(parts.year, parts.month - 1, parts.day);

    // Verify the date is valid (handles cases like Feb 31)
    if (date.getDate() !== parts.day ||
        date.getMonth() !== parts.month - 1 ||
        date.getFullYear() !== parts.year) {
      return null;
    }

    return date;
  }

  /**
   * Format Date object to string
   * @param {Date} date - Date object
   * @param {string} format - Desired format
   * @returns {string} Formatted date string
   */
  static format(date, format) {
    if (!(date instanceof Date) || isNaN(date)) return '';

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    switch (format) {
      case 'MM/DD/YYYY':
        return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
      case 'DD/MM/YYYY':
        return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      case 'M/D/YYYY':
        return `${month}/${day}/${year}`;
      default:
        return '';
    }
  }

  /**
   * Convert date string to standardized YYYY-MM-DD format
   * @param {string} dateString - Date string
   * @param {string} inputFormat - Input format
   * @returns {string} Standardized date string (YYYY-MM-DD)
   */
  static standardize(dateString, inputFormat) {
    const date = this.parse(dateString, inputFormat);
    if (!date) return '';
    return this.format(date, 'YYYY-MM-DD');
  }

  /**
   * Format date for display (e.g., "Feb 5, 2026")
   * @param {string} dateString - Date string in YYYY-MM-DD format
   * @returns {string} Display-friendly date string
   */
  static toDisplay(dateString) {
    if (!dateString) return '';

    const date = this.parse(dateString, 'YYYY-MM-DD');
    if (!date) return dateString;

    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Get current date in YYYY-MM-DD format
   * @returns {string} Current date
   */
  static today() {
    return this.format(new Date(), 'YYYY-MM-DD');
  }

  /**
   * Check if date string is valid
   * @param {string} dateString - Date string
   * @param {string} format - Date format
   * @returns {boolean} True if valid
   */
  static isValid(dateString, format) {
    return this.parse(dateString, format) !== null;
  }
}
