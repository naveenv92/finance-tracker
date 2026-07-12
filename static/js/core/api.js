/**
 * API Layer - Handles all HTTP requests to the backend
 */

const API_BASE_URL = 'http://localhost:8080/api';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP error! status: ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Database API methods
 */
export const DatabaseAPI = {
  /**
   * Get all databases
   */
  async getAll() {
    return fetchAPI('/databases');
  },

  /**
   * Get database by ID
   */
  async getById(id) {
    return fetchAPI(`/databases/${id}`);
  },

  /**
   * Create a new database
   */
  async create(name) {
    return fetchAPI('/databases', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  /**
   * Delete a database
   */
  async delete(id) {
    return fetchAPI(`/databases/${id}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Transaction API methods (placeholder for future implementation)
 */
export const TransactionAPI = {
  async getAll(databaseId) {
    return fetchAPI(`/databases/${databaseId}/transactions`);
  },

  async create(databaseId, transaction) {
    return fetchAPI(`/databases/${databaseId}/transactions`, {
      method: 'POST',
      body: JSON.stringify(transaction),
    });
  },

  async update(databaseId, transaction) {
    return fetchAPI(`/databases/${databaseId}/transactions/${transaction.id}`, {
      method: 'PUT',
      body: JSON.stringify(transaction),
    });
  },

  async delete(databaseId, transactionId) {
    return fetchAPI(`/databases/${databaseId}/transactions/${transactionId}`, {
      method: 'DELETE',
    });
  },

  async importMany(databaseId, transactions) {
    return fetchAPI(`/databases/${databaseId}/transactions/import`, {
      method: 'POST',
      body: JSON.stringify({ transactions }),
    });
  },
};

/**
 * Category API methods
 */
export const CategoryAPI = {
  async getAll(databaseId) {
    const categories = await fetchAPI(`/databases/${databaseId}/categories`);
    return categories.sort((a, b) => a.name.localeCompare(b.name));
  },

  async create(databaseId, category) {
    return fetchAPI(`/databases/${databaseId}/categories`, {
      method: 'POST',
      body: JSON.stringify(category),
    });
  },

  async update(databaseId, category) {
    return fetchAPI(`/databases/${databaseId}/categories/${category.id}`, {
      method: 'PUT',
      body: JSON.stringify(category),
    });
  },

  async delete(databaseId, categoryId) {
    return fetchAPI(`/databases/${databaseId}/categories/${categoryId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Settings API methods
 */
export const SettingsAPI = {
  async get(databaseId) {
    return fetchAPI(`/databases/${databaseId}/settings`);
  },

  async update(databaseId, settings) {
    return fetchAPI(`/databases/${databaseId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
};

/**
 * Backup API methods
 */
export const BackupAPI = {
  async create(databaseId) {
    return fetchAPI(`/databases/${databaseId}/backup`, { method: 'POST' });
  },

  async list() {
    return fetchAPI('/backups');
  },

  async delete(filename) {
    return fetchAPI(`/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  },

  async restore(filename) {
    return fetchAPI(`/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
  },
};

/**
 * Template API methods (placeholder for future implementation)
 */
export const TemplateAPI = {
  async getAll(databaseId) {
    return fetchAPI(`/databases/${databaseId}/templates`);
  },

  async create(databaseId, template) {
    return fetchAPI(`/databases/${databaseId}/templates`, {
      method: 'POST',
      body: JSON.stringify(template),
    });
  },

  async update(databaseId, template) {
    return fetchAPI(`/databases/${databaseId}/templates/${template.id}`, {
      method: 'PUT',
      body: JSON.stringify(template),
    });
  },

  async delete(databaseId, templateId) {
    return fetchAPI(`/databases/${databaseId}/templates/${templateId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Merchant Mapping API methods
 */
export const MerchantMappingAPI = {
  async getAll(databaseId) {
    return fetchAPI(`/databases/${databaseId}/merchant-mappings`);
  },

  async create(databaseId, mapping) {
    return fetchAPI(`/databases/${databaseId}/merchant-mappings`, {
      method: 'POST',
      body: JSON.stringify(mapping),
    });
  },

  async update(databaseId, mapping) {
    return fetchAPI(`/databases/${databaseId}/merchant-mappings/${mapping.id}`, {
      method: 'PUT',
      body: JSON.stringify(mapping),
    });
  },

  async delete(databaseId, mappingId) {
    return fetchAPI(`/databases/${databaseId}/merchant-mappings/${mappingId}`, {
      method: 'DELETE',
    });
  },

  async scan(databaseId) {
    return fetchAPI(`/databases/${databaseId}/merchant-mappings/scan`, {
      method: 'POST',
    });
  },
};

/**
 * Settlement API methods
 */
export const SettlementAPI = {
  async getAll(databaseId) {
    return fetchAPI(`/databases/${databaseId}/settlements`);
  },

  async create(databaseId, settlement) {
    return fetchAPI(`/databases/${databaseId}/settlements`, {
      method: 'POST',
      body: JSON.stringify(settlement),
    });
  },

  async delete(databaseId, settlementId) {
    return fetchAPI(`/databases/${databaseId}/settlements/${settlementId}`, {
      method: 'DELETE',
    });
  },
};
