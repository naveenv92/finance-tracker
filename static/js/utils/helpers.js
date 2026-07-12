/**
 * Utility helper functions
 */

/**
 * Generate a unique UUID
 * @returns {string} UUID string
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Format currency amount
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toFixed(2);
  return `${isNegative ? '-' : ''}$${formatted}`;
}

/**
 * Clean merchant name (remove extra spaces, numbers, special characters)
 * @param {string} merchant - Raw merchant name
 * @returns {string} Cleaned merchant name
 */
export function cleanMerchantName(merchant) {
  if (!merchant) return '';

  // Remove common patterns like store numbers, transaction IDs
  let cleaned = merchant
    .replace(/#\d+/g, '') // Remove #12345
    .replace(/\s+\d{4,}/g, '') // Remove long numbers
    .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single
    .trim();

  return cleaned;
}

/**
 * Check whether a merchant mapping pattern matches a clean merchant key.
 * A pattern ending in "*" is a prefix match; otherwise it's an exact match.
 * Both forms compare case-insensitively, since the same vendor often
 * appears with different casing across different banks/statements.
 * Must stay in sync with mappingMatchesKey in merchant_mapping.go.
 * @param {string} pattern - Mapping's originalMerchant (may end in "*")
 * @param {string} cleanKey - The transaction's clean merchant key
 * @returns {boolean} True if the pattern matches
 */
export function mappingMatchesKey(pattern, cleanKey) {
  if (pattern.endsWith('*')) {
    return cleanKey.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
  }
  return pattern.toLowerCase() === cleanKey.toLowerCase();
}

/**
 * Resolve which merchant mapping (if any) applies to a clean merchant key.
 * Exact matches always win over wildcard matches; among multiple matching
 * wildcards, the one with the longest literal prefix (most specific) wins.
 * Must stay in sync with resolveMerchantMapping in merchant_mapping.go.
 * @param {string} cleanKey - The transaction's clean merchant key
 * @param {Array} mappings - Array of {originalMerchant, mappedMerchant}
 * @returns {Object|null} The winning mapping, or null if none match
 */
export function resolveMerchantMapping(cleanKey, mappings) {
  const exact = mappings.find(m => !m.originalMerchant.endsWith('*') && m.originalMerchant.toLowerCase() === cleanKey.toLowerCase());
  if (exact) return exact;

  let best = null;
  let bestPrefixLen = -1;
  for (const m of mappings) {
    if (!m.originalMerchant.endsWith('*')) continue;
    const prefix = m.originalMerchant.slice(0, -1);
    if (mappingMatchesKey(m.originalMerchant, cleanKey) && prefix.length > bestPrefixLen) {
      best = m;
      bestPrefixLen = prefix.length;
    }
  }
  return best;
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if value is empty (null, undefined, empty string, empty array)
 * @param {*} value - Value to check
 * @returns {boolean} True if empty
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Sort array of objects by key
 * @param {Array} array - Array to sort
 * @param {string} key - Key to sort by
 * @param {string} direction - 'asc' or 'desc'
 * @returns {Array} Sorted array
 */
export function sortBy(array, key, direction = 'asc') {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal === bVal) return 0;

    if (direction === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
