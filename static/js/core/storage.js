/**
 * localStorage abstraction layer
 * All data persistence goes through this module
 */

const STORAGE_PREFIX = 'financeTracker';

export class StorageManager {
  /**
   * Get data from localStorage
   * @param {string} dbId - Database ID (optional for global keys)
   * @param {string} dataType - Type of data (transactions, categories, templates, etc.)
   * @returns {*} Parsed data or null
   */
  static get(dbId, dataType) {
    const key = this.getKey(dbId, dataType);
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error reading from localStorage: ${key}`, error);
      return null;
    }
  }

  /**
   * Save data to localStorage
   * @param {string} dbId - Database ID (optional for global keys)
   * @param {string} dataType - Type of data
   * @param {*} value - Value to store
   * @returns {boolean} Success status
   */
  static set(dbId, dataType, value) {
    const key = this.getKey(dbId, dataType);
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error writing to localStorage: ${key}`, error);
      return false;
    }
  }

  /**
   * Remove data from localStorage
   * @param {string} dbId - Database ID (optional for global keys)
   * @param {string} dataType - Type of data
   * @returns {boolean} Success status
   */
  static remove(dbId, dataType) {
    const key = this.getKey(dbId, dataType);
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing from localStorage: ${key}`, error);
      return false;
    }
  }

  /**
   * Clear all app data from localStorage
   * @returns {boolean} Success status
   */
  static clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Error clearing localStorage', error);
      return false;
    }
  }

  /**
   * Get all keys with a specific prefix
   * @param {string} prefix - Prefix to search for
   * @returns {Array<string>} Array of matching keys
   */
  static getKeys(prefix) {
    const fullPrefix = `${STORAGE_PREFIX}:${prefix}`;
    const keys = Object.keys(localStorage);
    return keys.filter(key => key.startsWith(fullPrefix));
  }

  /**
   * Construct storage key
   * @param {string} dbId - Database ID
   * @param {string} dataType - Type of data
   * @returns {string} Storage key
   */
  static getKey(dbId, dataType) {
    if (!dbId) {
      // Global key (e.g., databases list, activeDb)
      return `${STORAGE_PREFIX}:${dataType}`;
    }
    return `${STORAGE_PREFIX}:${dbId}:${dataType}`;
  }

  /**
   * Check if storage is available
   * @returns {boolean} True if localStorage is available
   */
  static isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage usage info
   * @returns {Object} Storage usage information
   */
  static getUsageInfo() {
    let totalSize = 0;
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        const value = localStorage.getItem(key);
        totalSize += key.length + (value ? value.length : 0);
      }
    });

    return {
      totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      keyCount: keys.filter(k => k.startsWith(STORAGE_PREFIX)).length
    };
  }
}
