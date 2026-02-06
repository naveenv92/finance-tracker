/**
 * Application State Manager
 * Manages global state like active database
 */

import { StorageManager } from './storage.js';
import { DatabaseManager } from './database.js';
import { DatabaseAPI } from './api.js';

export class AppState {
  static listeners = {};

  /**
   * Set the active database
   * @param {string} dbId - Database ID
   * @returns {Promise<boolean>} Success status
   */
  static async setActiveDatabase(dbId) {
    if (!dbId) {
      StorageManager.remove(null, 'activeDb');
      this.emit('activeDbChanged', null);
      return true;
    }

    try {
      // Verify database exists in backend
      const database = await DatabaseAPI.getById(dbId);
      if (!database) {
        console.error('Database not found:', dbId);
        return false;
      }

      StorageManager.set(null, 'activeDb', dbId);
      this.emit('activeDbChanged', database);
      return true;
    } catch (error) {
      console.error('Error setting active database:', error);
      return false;
    }
  }

  /**
   * Set the active database synchronously (for localStorage-based databases)
   * @param {string} dbId - Database ID
   * @returns {boolean} Success status
   * @deprecated Use setActiveDatabase() instead
   */
  static setActiveDatabaseSync(dbId) {
    if (!dbId) {
      StorageManager.remove(null, 'activeDb');
      this.emit('activeDbChanged', null);
      return true;
    }

    const database = DatabaseManager.getDatabase(dbId);
    if (!database) {
      console.error('Database not found:', dbId);
      return false;
    }

    StorageManager.set(null, 'activeDb', dbId);
    this.emit('activeDbChanged', database);
    return true;
  }

  /**
   * Get the active database (async - fetches from backend)
   * @returns {Promise<Object|null>} Database object or null
   */
  static async getActiveDatabase() {
    const dbId = StorageManager.get(null, 'activeDb');
    if (!dbId) return null;

    try {
      return await DatabaseAPI.getById(dbId);
    } catch (error) {
      console.error('Error fetching active database:', error);
      return null;
    }
  }

  /**
   * Get the active database synchronously (deprecated - use getActiveDatabase)
   * Only works if database is in localStorage
   * @returns {Object|null} Database object or null
   * @deprecated Use getActiveDatabase() instead
   */
  static getActiveDatabaseSync() {
    const dbId = StorageManager.get(null, 'activeDb');
    if (!dbId) return null;

    return DatabaseManager.getDatabase(dbId);
  }

  /**
   * Get active database ID
   * @returns {string|null} Database ID or null
   */
  static getActiveDatabaseId() {
    return StorageManager.get(null, 'activeDb');
  }

  /**
   * Check if there is an active database
   * @returns {boolean} True if active database exists
   */
  static hasActiveDatabase() {
    return this.getActiveDatabaseId() !== null;
  }

  /**
   * Clear active database
   * @returns {boolean} Success status
   */
  static clearActiveDatabase() {
    return this.setActiveDatabase(null);
  }

  /**
   * Guard: Redirect to landing page if no active database
   * @returns {boolean} True if has active database, false if redirected
   */
  static requireActiveDatabase() {
    if (!this.hasActiveDatabase()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  // ==================== Event System ====================

  /**
   * Subscribe to state changes
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  static on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  static emit(event, data) {
    if (!this.listeners[event]) return;

    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  static off(event) {
    delete this.listeners[event];
  }
}
