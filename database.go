package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

// GetAppDataDir returns the application data directory path
// Creates the directory if it doesn't exist
func GetAppDataDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	appDir := filepath.Join(homeDir, ".finance-tracker")

	// Create directory if it doesn't exist
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create app directory: %w", err)
	}

	return appDir, nil
}

// GetDatabasePath returns the full path to the database file
func GetDatabasePath() (string, error) {
	appDir, err := GetAppDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(appDir, "data.db"), nil
}

// Database represents a finance database
type Database struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	CreatedAt    time.Time `json:"createdAt"`
	LastModified time.Time `json:"lastModified"`
}

// Category represents a transaction category
type Category struct {
	ID         string    `json:"id"`
	DatabaseID string    `json:"databaseId,omitempty"`
	Name       string    `json:"name"`
	Color      string    `json:"color"`
	Emoji      string    `json:"emoji,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

// Transaction represents a financial transaction
type Transaction struct {
	ID               string    `json:"id"`
	DatabaseID       string    `json:"databaseId,omitempty"`
	Date             string    `json:"date"` // YYYY-MM-DD format
	Merchant         string    `json:"merchant"`
	OriginalMerchant string    `json:"originalMerchant"`
	Amount           float64   `json:"amount"`
	CategoryID       *string   `json:"categoryId"`
	Splits           string    `json:"splits,omitempty"` // JSON array stored as string
	Reviewed         bool      `json:"reviewed"`
	ImportedAt       time.Time `json:"importedAt"`
	Notes            string    `json:"notes,omitempty"`
}

// InitDB initializes the SQLite database and creates tables
func InitDB() error {
	dbPath, err := GetDatabasePath()
	if err != nil {
		return fmt.Errorf("failed to get database path: %w", err)
	}

	db, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err = db.Ping(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Create tables
	schema := `
	CREATE TABLE IF NOT EXISTS databases (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		last_modified DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS transactions (
		id TEXT PRIMARY KEY,
		database_id TEXT NOT NULL,
		date TEXT NOT NULL,
		merchant TEXT NOT NULL,
		original_merchant TEXT NOT NULL,
		amount REAL NOT NULL,
		category_id TEXT,
		splits TEXT,
		reviewed BOOLEAN NOT NULL DEFAULT 0,
		imported_at DATETIME NOT NULL,
		notes TEXT,
		FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS categories (
		id TEXT PRIMARY KEY,
		database_id TEXT NOT NULL,
		name TEXT NOT NULL,
		color TEXT NOT NULL,
		emoji TEXT,
		created_at DATETIME NOT NULL,
		FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS templates (
		id TEXT PRIMARY KEY,
		database_id TEXT NOT NULL,
		name TEXT NOT NULL,
		date_column TEXT NOT NULL,
		merchant_column TEXT NOT NULL,
		amount_column TEXT NOT NULL,
		date_format TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_transactions_database_id ON transactions(database_id);
	CREATE INDEX IF NOT EXISTS idx_transactions_reviewed ON transactions(reviewed);
	CREATE INDEX IF NOT EXISTS idx_categories_database_id ON categories(database_id);
	CREATE INDEX IF NOT EXISTS idx_templates_database_id ON templates(database_id);
	`

	if _, err = db.Exec(schema); err != nil {
		return fmt.Errorf("failed to create schema: %w", err)
	}

	return nil
}

// CloseDB closes the database connection
func CloseDB() {
	if db != nil {
		db.Close()
	}
}

// CreateDatabase creates a new database record
func CreateDatabase(name string) (*Database, error) {
	database := &Database{
		ID:           uuid.New().String(),
		Name:         name,
		CreatedAt:    time.Now(),
		LastModified: time.Now(),
	}

	query := `
		INSERT INTO databases (id, name, created_at, last_modified)
		VALUES (?, ?, ?, ?)
	`

	_, err := db.Exec(query, database.ID, database.Name, database.CreatedAt, database.LastModified)
	if err != nil {
		return nil, fmt.Errorf("failed to create database: %w", err)
	}

	return database, nil
}

// GetAllDatabases retrieves all databases
func GetAllDatabases() ([]*Database, error) {
	query := `
		SELECT id, name, created_at, last_modified
		FROM databases
		ORDER BY created_at DESC
	`

	rows, err := db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query databases: %w", err)
	}
	defer rows.Close()

	databases := make([]*Database, 0)
	for rows.Next() {
		var d Database
		if err := rows.Scan(&d.ID, &d.Name, &d.CreatedAt, &d.LastModified); err != nil {
			return nil, fmt.Errorf("failed to scan database: %w", err)
		}
		databases = append(databases, &d)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating databases: %w", err)
	}

	return databases, nil
}

// GetDatabase retrieves a database by ID
func GetDatabase(id string) (*Database, error) {
	query := `
		SELECT id, name, created_at, last_modified
		FROM databases
		WHERE id = ?
	`

	var d Database
	err := db.QueryRow(query, id).Scan(&d.ID, &d.Name, &d.CreatedAt, &d.LastModified)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("database not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get database: %w", err)
	}

	return &d, nil
}

// DeleteDatabase deletes a database and all related data
func DeleteDatabase(id string) error {
	query := `DELETE FROM databases WHERE id = ?`

	result, err := db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete database: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("database not found")
	}

	return nil
}

// UpdateDatabaseTimestamp updates the last_modified timestamp
func UpdateDatabaseTimestamp(id string) error {
	query := `UPDATE databases SET last_modified = ? WHERE id = ?`

	_, err := db.Exec(query, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update database timestamp: %w", err)
	}

	return nil
}

// ==================== Category Operations ====================

// CreateCategory creates a new category
func CreateCategory(databaseID string, category *Category) (*Category, error) {
	category.ID = uuid.New().String()
	category.DatabaseID = databaseID
	category.CreatedAt = time.Now()

	query := `
		INSERT INTO categories (id, database_id, name, color, emoji, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`

	_, err := db.Exec(query, category.ID, category.DatabaseID, category.Name, category.Color, category.Emoji, category.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create category: %w", err)
	}

	// Update database timestamp
	UpdateDatabaseTimestamp(databaseID)

	return category, nil
}

// GetCategories retrieves all categories for a database
func GetCategories(databaseID string) ([]*Category, error) {
	query := `
		SELECT id, database_id, name, color, emoji, created_at
		FROM categories
		WHERE database_id = ?
		ORDER BY created_at ASC
	`

	rows, err := db.Query(query, databaseID)
	if err != nil {
		return nil, fmt.Errorf("failed to query categories: %w", err)
	}
	defer rows.Close()

	categories := make([]*Category, 0)
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.DatabaseID, &c.Name, &c.Color, &c.Emoji, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan category: %w", err)
		}
		categories = append(categories, &c)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating categories: %w", err)
	}

	return categories, nil
}

// GetCategory retrieves a category by ID
func GetCategory(databaseID, categoryID string) (*Category, error) {
	query := `
		SELECT id, database_id, name, color, emoji, created_at
		FROM categories
		WHERE id = ? AND database_id = ?
	`

	var c Category
	err := db.QueryRow(query, categoryID, databaseID).Scan(&c.ID, &c.DatabaseID, &c.Name, &c.Color, &c.Emoji, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("category not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get category: %w", err)
	}

	return &c, nil
}

// DeleteCategory deletes a category
func DeleteCategory(databaseID, categoryID string) error {
	query := `DELETE FROM categories WHERE id = ? AND database_id = ?`

	result, err := db.Exec(query, categoryID, databaseID)
	if err != nil {
		return fmt.Errorf("failed to delete category: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("category not found")
	}

	// Update database timestamp
	UpdateDatabaseTimestamp(databaseID)

	return nil
}

// GetCategoryUsageCount returns the number of transactions using a category
func GetCategoryUsageCount(databaseID, categoryID string) (int, error) {
	query := `SELECT COUNT(*) FROM transactions WHERE database_id = ? AND category_id = ?`

	var count int
	err := db.QueryRow(query, databaseID, categoryID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get category usage count: %w", err)
	}

	return count, nil
}

// ==================== Transaction Operations ====================

// CreateTransaction creates a new transaction
func CreateTransaction(databaseID string, transaction *Transaction) (*Transaction, error) {
	transaction.ID = uuid.New().String()
	transaction.DatabaseID = databaseID
	transaction.ImportedAt = time.Now()

	query := `
		INSERT INTO transactions (id, database_id, date, merchant, original_merchant, amount, category_id, splits, reviewed, imported_at, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := db.Exec(query,
		transaction.ID,
		transaction.DatabaseID,
		transaction.Date,
		transaction.Merchant,
		transaction.OriginalMerchant,
		transaction.Amount,
		transaction.CategoryID,
		transaction.Splits,
		transaction.Reviewed,
		transaction.ImportedAt,
		transaction.Notes,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	// Update database timestamp
	UpdateDatabaseTimestamp(databaseID)

	return transaction, nil
}

// GetTransactions retrieves all transactions for a database
func GetTransactions(databaseID string) ([]*Transaction, error) {
	query := `
		SELECT id, database_id, date, merchant, original_merchant, amount, category_id, splits, reviewed, imported_at, notes
		FROM transactions
		WHERE database_id = ?
		ORDER BY date DESC, imported_at DESC
	`

	rows, err := db.Query(query, databaseID)
	if err != nil {
		return nil, fmt.Errorf("failed to query transactions: %w", err)
	}
	defer rows.Close()

	transactions := make([]*Transaction, 0)
	for rows.Next() {
		var t Transaction
		var categoryID sql.NullString
		var splits sql.NullString
		var notes sql.NullString

		if err := rows.Scan(
			&t.ID,
			&t.DatabaseID,
			&t.Date,
			&t.Merchant,
			&t.OriginalMerchant,
			&t.Amount,
			&categoryID,
			&splits,
			&t.Reviewed,
			&t.ImportedAt,
			&notes,
		); err != nil {
			return nil, fmt.Errorf("failed to scan transaction: %w", err)
		}

		if categoryID.Valid {
			t.CategoryID = &categoryID.String
		}
		if splits.Valid {
			t.Splits = splits.String
		}
		if notes.Valid {
			t.Notes = notes.String
		}

		transactions = append(transactions, &t)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating transactions: %w", err)
	}

	return transactions, nil
}

// GetTransaction retrieves a transaction by ID
func GetTransaction(databaseID, transactionID string) (*Transaction, error) {
	query := `
		SELECT id, database_id, date, merchant, original_merchant, amount, category_id, splits, reviewed, imported_at, notes
		FROM transactions
		WHERE id = ? AND database_id = ?
	`

	var t Transaction
	var categoryID sql.NullString
	var splits sql.NullString
	var notes sql.NullString

	err := db.QueryRow(query, transactionID, databaseID).Scan(
		&t.ID,
		&t.DatabaseID,
		&t.Date,
		&t.Merchant,
		&t.OriginalMerchant,
		&t.Amount,
		&categoryID,
		&splits,
		&t.Reviewed,
		&t.ImportedAt,
		&notes,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("transaction not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	if categoryID.Valid {
		t.CategoryID = &categoryID.String
	}
	if splits.Valid {
		t.Splits = splits.String
	}
	if notes.Valid {
		t.Notes = notes.String
	}

	return &t, nil
}

// UpdateTransaction updates an existing transaction
func UpdateTransaction(databaseID string, transaction *Transaction) (*Transaction, error) {
	query := `
		UPDATE transactions
		SET date = ?, merchant = ?, original_merchant = ?, amount = ?, category_id = ?, splits = ?, reviewed = ?, notes = ?
		WHERE id = ? AND database_id = ?
	`

	result, err := db.Exec(query,
		transaction.Date,
		transaction.Merchant,
		transaction.OriginalMerchant,
		transaction.Amount,
		transaction.CategoryID,
		transaction.Splits,
		transaction.Reviewed,
		transaction.Notes,
		transaction.ID,
		databaseID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return nil, fmt.Errorf("transaction not found")
	}

	// Update database timestamp
	UpdateDatabaseTimestamp(databaseID)

	return transaction, nil
}

// DeleteTransaction deletes a transaction
func DeleteTransaction(databaseID, transactionID string) error {
	query := `DELETE FROM transactions WHERE id = ? AND database_id = ?`

	result, err := db.Exec(query, transactionID, databaseID)
	if err != nil {
		return fmt.Errorf("failed to delete transaction: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("transaction not found")
	}

	// Update database timestamp
	UpdateDatabaseTimestamp(databaseID)

	return nil
}
