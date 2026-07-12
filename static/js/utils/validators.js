/**
 * Validation functions for form inputs
 */

/**
 * Validate database name
 * @param {string} name - Database name
 * @returns {boolean} True if valid
 */
export function isValidDatabaseName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 100;
}

/**
 * Validate category name
 * @param {string} name - Category name
 * @returns {boolean} True if valid
 */
export function isValidCategoryName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 50;
}

/**
 * Validate hex color
 * @param {string} color - Hex color code
 * @returns {boolean} True if valid
 */
export function isValidHexColor(color) {
  if (!color || typeof color !== 'string') return false;
  return /^#[0-9A-F]{6}$/i.test(color);
}

/**
 * Validate emoji (optional, max 2 characters)
 * @param {string} emoji - Emoji string
 * @returns {boolean} True if valid
 */
export function isValidEmoji(emoji) {
  if (!emoji) return true; // Optional
  if (typeof emoji !== 'string') return false;
  return emoji.length <= 2;
}

/**
 * Validate template name
 * @param {string} name - Template name
 * @returns {boolean} True if valid
 */
export function isValidTemplateName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 100;
}

/**
 * Validate column name
 * @param {string} name - Column name
 * @returns {boolean} True if valid
 */
export function isValidColumnName(name) {
  if (!name || typeof name !== 'string') return false;
  return name.trim().length > 0;
}

/**
 * Validate date format string
 * @param {string} format - Date format
 * @returns {boolean} True if valid
 */
export function isValidDateFormat(format) {
  const validFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'M/D/YYYY'];
  return validFormats.includes(format);
}

/**
 * Validate amount (must be a number)
 * @param {*} amount - Amount to validate
 * @returns {boolean} True if valid
 */
export function isValidAmount(amount) {
  const num = parseFloat(amount);
  return !isNaN(num) && isFinite(num);
}

/**
 * Validate person name for splits
 * @param {string} name - Person name
 * @returns {boolean} True if valid
 */
export function isValidPersonName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 50;
}

/**
 * Validate merchant name
 * @param {string} name - Merchant name
 * @returns {boolean} True if valid
 */
export function isValidMerchantName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 200;
}

/**
 * Validate a merchant mapping pattern: "*" may only appear as the final
 * character (trailing-wildcard prefix match), and the literal prefix before
 * it (or the whole pattern, if there's no "*") must be non-empty.
 * Mirrors isValidMerchantMappingPattern in merchant_mapping.go.
 * @param {string} pattern - Mapping's originalMerchant field
 * @returns {boolean} True if valid
 */
export function isValidMerchantMappingPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return false;
  if ((pattern.match(/\*/g) || []).length > 1) return false;
  const idx = pattern.indexOf('*');
  if (idx !== -1 && idx !== pattern.length - 1) return false;
  return pattern.replace(/\*$/, '') !== '';
}

/**
 * Validate CSV file
 * @param {File} file - File object
 * @returns {boolean} True if valid
 */
export function isValidCSVFile(file) {
  if (!file) return false;
  const validTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
  const validExtensions = ['.csv'];

  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

  return hasValidType || hasValidExtension;
}
