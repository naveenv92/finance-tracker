/**
 * Database Manager
 * Handles all CRUD operations for databases, transactions, categories, and templates
 */

import { StorageManager } from './storage.js';
import { generateUUID } from '../utils/helpers.js';

export class DatabaseManager {
  // ==================== Database Operations ====================

  /**
   * Create a new database
   * @param {string} name - Database name
   * @returns {Object} Created database object
   */
  static createDatabase(name) {
    const database = {
      id: generateUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    // Get existing databases
    const databases = this.getAllDatabases();
    databases.push(database);

    // Save databases list
    StorageManager.set(null, 'databases', databases);

    // Initialize empty collections for new database
    StorageManager.set(database.id, 'transactions', []);
    StorageManager.set(database.id, 'categories', []);
    StorageManager.set(database.id, 'templates', []);

    return database;
  }

  /**
   * Get all databases
   * @returns {Array} Array of database objects
   */
  static getAllDatabases() {
    return StorageManager.get(null, 'databases') || [];
  }

  /**
   * Get database by ID
   * @param {string} dbId - Database ID
   * @returns {Object|null} Database object or null
   */
  static getDatabase(dbId) {
    const databases = this.getAllDatabases();
    return databases.find(db => db.id === dbId) || null;
  }

  /**
   * Update database metadata
   * @param {string} dbId - Database ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated database or null
   */
  static updateDatabase(dbId, updates) {
    const databases = this.getAllDatabases();
    const index = databases.findIndex(db => db.id === dbId);

    if (index === -1) return null;

    databases[index] = {
      ...databases[index],
      ...updates,
      lastModified: new Date().toISOString()
    };

    StorageManager.set(null, 'databases', databases);
    return databases[index];
  }

  /**
   * Delete database and all associated data
   * @param {string} dbId - Database ID
   * @returns {boolean} Success status
   */
  static deleteDatabase(dbId) {
    // Remove from databases list
    const databases = this.getAllDatabases();
    const filtered = databases.filter(db => db.id !== dbId);
    StorageManager.set(null, 'databases', filtered);

    // Remove all associated data
    StorageManager.remove(dbId, 'transactions');
    StorageManager.remove(dbId, 'categories');
    StorageManager.remove(dbId, 'templates');

    // Clear active database if it was this one
    const activeDbId = StorageManager.get(null, 'activeDb');
    if (activeDbId === dbId) {
      StorageManager.remove(null, 'activeDb');
    }

    return true;
  }

  // ==================== Transaction Operations ====================

  /**
   * Get all transactions for a database
   * @param {string} dbId - Database ID
   * @returns {Array} Array of transactions
   */
  static getTransactions(dbId) {
    return StorageManager.get(dbId, 'transactions') || [];
  }

  /**
   * Get transaction by ID
   * @param {string} dbId - Database ID
   * @param {string} transactionId - Transaction ID
   * @returns {Object|null} Transaction or null
   */
  static getTransaction(dbId, transactionId) {
    const transactions = this.getTransactions(dbId);
    return transactions.find(t => t.id === transactionId) || null;
  }

  /**
   * Add a transaction
   * @param {string} dbId - Database ID
   * @param {Object} transaction - Transaction object
   * @returns {Object} Created transaction
   */
  static addTransaction(dbId, transaction) {
    const transactions = this.getTransactions(dbId);

    const newTransaction = {
      id: generateUUID(),
      ...transaction,
      importedAt: new Date().toISOString()
    };

    transactions.push(newTransaction);
    StorageManager.set(dbId, 'transactions', transactions);
    this.touchDatabase(dbId);

    return newTransaction;
  }

  /**
   * Update a transaction
   * @param {string} dbId - Database ID
   * @param {Object} transaction - Transaction object with id
   * @returns {Object|null} Updated transaction or null
   */
  static updateTransaction(dbId, transaction) {
    const transactions = this.getTransactions(dbId);
    const index = transactions.findIndex(t => t.id === transaction.id);

    if (index === -1) return null;

    transactions[index] = {
      ...transactions[index],
      ...transaction
    };

    StorageManager.set(dbId, 'transactions', transactions);
    this.touchDatabase(dbId);

    return transactions[index];
  }

  /**
   * Delete a transaction
   * @param {string} dbId - Database ID
   * @param {string} transactionId - Transaction ID
   * @returns {boolean} Success status
   */
  static deleteTransaction(dbId, transactionId) {
    const transactions = this.getTransactions(dbId);
    const filtered = transactions.filter(t => t.id !== transactionId);

    StorageManager.set(dbId, 'transactions', filtered);
    this.touchDatabase(dbId);

    return true;
  }

  /**
   * Import multiple transactions
   * @param {string} dbId - Database ID
   * @param {Array} transactions - Array of transaction objects
   * @returns {Array} Array of created transactions
   */
  static importTransactions(dbId, transactions) {
    const existing = this.getTransactions(dbId);
    const importedAt = new Date().toISOString();

    const newTransactions = transactions.map(t => ({
      id: generateUUID(),
      ...t,
      importedAt
    }));

    const combined = [...existing, ...newTransactions];
    StorageManager.set(dbId, 'transactions', combined);
    this.touchDatabase(dbId);

    return newTransactions;
  }

  /**
   * Get unreviewed transactions
   * @param {string} dbId - Database ID
   * @returns {Array} Array of unreviewed transactions
   */
  static getUnreviewedTransactions(dbId) {
    const transactions = this.getTransactions(dbId);
    return transactions.filter(t => !t.reviewed);
  }

  // ==================== Category Operations ====================

  /**
   * Get all categories for a database
   * @param {string} dbId - Database ID
   * @returns {Array} Array of categories
   */
  static getCategories(dbId) {
    return StorageManager.get(dbId, 'categories') || [];
  }

  /**
   * Get category by ID
   * @param {string} dbId - Database ID
   * @param {string} categoryId - Category ID
   * @returns {Object|null} Category or null
   */
  static getCategory(dbId, categoryId) {
    const categories = this.getCategories(dbId);
    return categories.find(c => c.id === categoryId) || null;
  }

  /**
   * Add a category
   * @param {string} dbId - Database ID
   * @param {Object} category - Category object
   * @returns {Object} Created category
   */
  static addCategory(dbId, category) {
    const categories = this.getCategories(dbId);

    const newCategory = {
      id: generateUUID(),
      ...category,
      createdAt: new Date().toISOString()
    };

    categories.push(newCategory);
    StorageManager.set(dbId, 'categories', categories);
    this.touchDatabase(dbId);

    return newCategory;
  }

  /**
   * Update a category
   * @param {string} dbId - Database ID
   * @param {Object} category - Category object with id
   * @returns {Object|null} Updated category or null
   */
  static updateCategory(dbId, category) {
    const categories = this.getCategories(dbId);
    const index = categories.findIndex(c => c.id === category.id);

    if (index === -1) return null;

    categories[index] = {
      ...categories[index],
      ...category
    };

    StorageManager.set(dbId, 'categories', categories);
    this.touchDatabase(dbId);

    return categories[index];
  }

  /**
   * Delete a category
   * @param {string} dbId - Database ID
   * @param {string} categoryId - Category ID
   * @returns {boolean} Success status
   */
  static deleteCategory(dbId, categoryId) {
    const categories = this.getCategories(dbId);
    const filtered = categories.filter(c => c.id !== categoryId);

    StorageManager.set(dbId, 'categories', filtered);
    this.touchDatabase(dbId);

    return true;
  }

  /**
   * Check if category is used in any transactions
   * @param {string} dbId - Database ID
   * @param {string} categoryId - Category ID
   * @returns {number} Count of transactions using this category
   */
  static getCategoryUsageCount(dbId, categoryId) {
    const transactions = this.getTransactions(dbId);
    return transactions.filter(t => t.categoryId === categoryId).length;
  }

  // ==================== Template Operations ====================

  /**
   * Get all templates for a database
   * @param {string} dbId - Database ID
   * @returns {Array} Array of templates
   */
  static getTemplates(dbId) {
    return StorageManager.get(dbId, 'templates') || [];
  }

  /**
   * Get template by ID
   * @param {string} dbId - Database ID
   * @param {string} templateId - Template ID
   * @returns {Object|null} Template or null
   */
  static getTemplate(dbId, templateId) {
    const templates = this.getTemplates(dbId);
    return templates.find(t => t.id === templateId) || null;
  }

  /**
   * Add a template
   * @param {string} dbId - Database ID
   * @param {Object} template - Template object
   * @returns {Object} Created template
   */
  static addTemplate(dbId, template) {
    const templates = this.getTemplates(dbId);

    const newTemplate = {
      id: generateUUID(),
      ...template,
      createdAt: new Date().toISOString()
    };

    templates.push(newTemplate);
    StorageManager.set(dbId, 'templates', templates);
    this.touchDatabase(dbId);

    return newTemplate;
  }

  /**
   * Update a template
   * @param {string} dbId - Database ID
   * @param {Object} template - Template object with id
   * @returns {Object|null} Updated template or null
   */
  static updateTemplate(dbId, template) {
    const templates = this.getTemplates(dbId);
    const index = templates.findIndex(t => t.id === template.id);

    if (index === -1) return null;

    templates[index] = {
      ...templates[index],
      ...template
    };

    StorageManager.set(dbId, 'templates', templates);
    this.touchDatabase(dbId);

    return templates[index];
  }

  /**
   * Delete a template
   * @param {string} dbId - Database ID
   * @param {string} templateId - Template ID
   * @returns {boolean} Success status
   */
  static deleteTemplate(dbId, templateId) {
    const templates = this.getTemplates(dbId);
    const filtered = templates.filter(t => t.id !== templateId);

    StorageManager.set(dbId, 'templates', filtered);
    this.touchDatabase(dbId);

    return true;
  }

  // ==================== Helper Methods ====================

  /**
   * Update database's lastModified timestamp
   * @param {string} dbId - Database ID
   */
  static touchDatabase(dbId) {
    this.updateDatabase(dbId, {});
  }
}
