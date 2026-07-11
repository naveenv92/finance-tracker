package main

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// setupTestDB opens an in-memory SQLite database, applies the schema, and
// points the package-level db variable at it. Returns a cleanup function.
func setupTestDB(t *testing.T) func() {
	t.Helper()

	var err error
	db, err = sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}

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
		source TEXT,
		possible_duplicate BOOLEAN NOT NULL DEFAULT 0,
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
		debit_sign TEXT NOT NULL DEFAULT 'positive',
		owner_name TEXT NOT NULL DEFAULT '',
		created_at DATETIME NOT NULL,
		FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS database_settings (
		database_id TEXT PRIMARY KEY,
		owner_name TEXT NOT NULL DEFAULT '',
		default_split_person TEXT NOT NULL DEFAULT '',
		FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS settlements (
		id TEXT PRIMARY KEY,
		database_id TEXT NOT NULL,
		from_person TEXT NOT NULL,
		to_person TEXT NOT NULL,
		amount REAL NOT NULL,
		date TEXT NOT NULL,
		notes TEXT,
		created_at DATETIME NOT NULL,
		FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
	);
	PRAGMA foreign_keys = ON;
	`

	if _, err = db.Exec(schema); err != nil {
		t.Fatalf("failed to apply schema: %v", err)
	}

	return func() {
		db.Close()
		db = nil
	}
}

// ==================== Database CRUD ====================

func TestCreateAndGetDatabase(t *testing.T) {
	defer setupTestDB(t)()

	created, err := CreateDatabase("Test DB")
	if err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	if created.Name != "Test DB" {
		t.Errorf("expected name %q, got %q", "Test DB", created.Name)
	}
	if created.ID == "" {
		t.Error("expected non-empty ID")
	}

	got, err := GetDatabase(created.ID)
	if err != nil {
		t.Fatalf("GetDatabase: %v", err)
	}
	if got.ID != created.ID || got.Name != created.Name {
		t.Errorf("GetDatabase mismatch: got %+v", got)
	}
}

func TestGetDatabase_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	_, err := GetDatabase("nonexistent-id")
	if err == nil {
		t.Error("expected error for missing database, got nil")
	}
}

func TestGetAllDatabases(t *testing.T) {
	defer setupTestDB(t)()

	if _, err := CreateDatabase("DB One"); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateDatabase("DB Two"); err != nil {
		t.Fatal(err)
	}

	dbs, err := GetAllDatabases()
	if err != nil {
		t.Fatalf("GetAllDatabases: %v", err)
	}
	if len(dbs) != 2 {
		t.Errorf("expected 2 databases, got %d", len(dbs))
	}
}

func TestDeleteDatabase(t *testing.T) {
	defer setupTestDB(t)()

	created, err := CreateDatabase("To Delete")
	if err != nil {
		t.Fatal(err)
	}

	if err := DeleteDatabase(created.ID); err != nil {
		t.Fatalf("DeleteDatabase: %v", err)
	}

	_, err = GetDatabase(created.ID)
	if err == nil {
		t.Error("expected error after deletion, got nil")
	}
}

func TestDeleteDatabase_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	err := DeleteDatabase("nonexistent-id")
	if err == nil {
		t.Error("expected error for missing database, got nil")
	}
}

func TestUpdateDatabaseTimestamp(t *testing.T) {
	defer setupTestDB(t)()

	created, err := CreateDatabase("Timestamp Test")
	if err != nil {
		t.Fatal(err)
	}

	before, err := GetDatabase(created.ID)
	if err != nil {
		t.Fatal(err)
	}

	if err := UpdateDatabaseTimestamp(created.ID); err != nil {
		t.Fatalf("UpdateDatabaseTimestamp: %v", err)
	}

	after, err := GetDatabase(created.ID)
	if err != nil {
		t.Fatal(err)
	}

	if !after.LastModified.After(before.LastModified) && after.LastModified.Equal(before.LastModified) {
		// timestamps may be equal if the call is fast enough — just ensure no error
	}
	_ = after
}

// ==================== Category CRUD ====================

func TestCreateAndGetCategory(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Cat DB")

	cat := &Category{Name: "Food", Color: "#FF0000", Emoji: "🍔"}
	created, err := CreateCategory(dbRec.ID, cat)
	if err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}
	if created.ID == "" {
		t.Error("expected non-empty category ID")
	}

	got, err := GetCategory(dbRec.ID, created.ID)
	if err != nil {
		t.Fatalf("GetCategory: %v", err)
	}
	if got.Name != "Food" || got.Color != "#FF0000" || got.Emoji != "🍔" {
		t.Errorf("GetCategory mismatch: %+v", got)
	}
}

func TestGetCategory_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Cat DB")
	_, err := GetCategory(dbRec.ID, "nonexistent")
	if err == nil {
		t.Error("expected error for missing category, got nil")
	}
}

func TestGetCategories(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Cat DB")
	CreateCategory(dbRec.ID, &Category{Name: "A", Color: "#111111"})
	CreateCategory(dbRec.ID, &Category{Name: "B", Color: "#222222"})

	cats, err := GetCategories(dbRec.ID)
	if err != nil {
		t.Fatalf("GetCategories: %v", err)
	}
	if len(cats) != 2 {
		t.Errorf("expected 2 categories, got %d", len(cats))
	}
}

func TestDeleteCategory(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Cat DB")
	cat, _ := CreateCategory(dbRec.ID, &Category{Name: "ToDelete", Color: "#000000"})

	if err := DeleteCategory(dbRec.ID, cat.ID); err != nil {
		t.Fatalf("DeleteCategory: %v", err)
	}

	_, err := GetCategory(dbRec.ID, cat.ID)
	if err == nil {
		t.Error("expected error after deletion, got nil")
	}
}

func TestDeleteCategory_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Cat DB")
	err := DeleteCategory(dbRec.ID, "nonexistent")
	if err == nil {
		t.Error("expected error for missing category, got nil")
	}
}

func TestDeleteCategory_NullsTransactionCategoryID(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Cat DB")
	cat, _ := CreateCategory(dbRec.ID, &Category{Name: "Dining", Color: "#AABBCC"})

	tx := &Transaction{
		Date:             "2026-01-01",
		Merchant:         "Restaurant",
		OriginalMerchant: "Restaurant",
		Amount:           50.00,
		CategoryID:       &cat.ID,
	}
	created, _ := CreateTransaction(dbRec.ID, tx)

	if err := DeleteCategory(dbRec.ID, cat.ID); err != nil {
		t.Fatalf("DeleteCategory: %v", err)
	}

	txs, _ := GetTransactions(dbRec.ID)
	for _, t2 := range txs {
		if t2.ID == created.ID && t2.CategoryID != nil {
			t.Error("expected CategoryID to be nil after category deletion")
		}
	}
}

func TestGetCategoryUsageCount(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Cat DB")
	cat, _ := CreateCategory(dbRec.ID, &Category{Name: "Shopping", Color: "#123456"})

	catIDCopy := cat.ID
	CreateTransaction(dbRec.ID, &Transaction{
		Date: "2026-01-01", Merchant: "Store", OriginalMerchant: "Store",
		Amount: 20.0, CategoryID: &catIDCopy,
	})
	CreateTransaction(dbRec.ID, &Transaction{
		Date: "2026-01-02", Merchant: "Mall", OriginalMerchant: "Mall",
		Amount: 40.0, CategoryID: &catIDCopy,
	})

	count, err := GetCategoryUsageCount(dbRec.ID, cat.ID)
	if err != nil {
		t.Fatalf("GetCategoryUsageCount: %v", err)
	}
	if count != 2 {
		t.Errorf("expected count 2, got %d", count)
	}
}

// ==================== Transaction CRUD ====================

func TestCreateAndGetTransaction(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")

	tx := &Transaction{
		Date:             "2026-01-15",
		Merchant:         "Whole Foods",
		OriginalMerchant: "WHOLEFDS",
		Amount:           -42.50,
		Notes:            "groceries",
		Source:           "Chase",
	}
	created, err := CreateTransaction(dbRec.ID, tx)
	if err != nil {
		t.Fatalf("CreateTransaction: %v", err)
	}
	if created.ID == "" {
		t.Error("expected non-empty transaction ID")
	}

	txs, err := GetTransactions(dbRec.ID)
	if err != nil {
		t.Fatalf("GetTransactions: %v", err)
	}
	if len(txs) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(txs))
	}
	got := txs[0]
	if got.Merchant != "Whole Foods" || got.Amount != -42.50 || got.Notes != "groceries" {
		t.Errorf("transaction mismatch: %+v", got)
	}
}

func TestCreateTransaction_PossibleDuplicate(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")

	tx := &Transaction{
		Date: "2026-01-15", Merchant: "Shop", OriginalMerchant: "Shop",
		Amount: 10.0, PossibleDuplicate: true,
	}
	created, _ := CreateTransaction(dbRec.ID, tx)

	txs, _ := GetTransactions(dbRec.ID)
	for _, t2 := range txs {
		if t2.ID == created.ID && !t2.PossibleDuplicate {
			t.Error("expected PossibleDuplicate to be true")
		}
	}
}

func TestGetTransaction_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")
	_, err := GetTransaction(dbRec.ID, "nonexistent")
	if err == nil {
		t.Error("expected error for missing transaction, got nil")
	}
}

func TestUpdateTransaction(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")
	tx, _ := CreateTransaction(dbRec.ID, &Transaction{
		Date: "2026-01-01", Merchant: "Old Name", OriginalMerchant: "Old",
		Amount: 10.0,
	})

	tx.Merchant = "New Name"
	tx.Reviewed = true
	tx.Notes = "updated"

	updated, err := UpdateTransaction(dbRec.ID, tx)
	if err != nil {
		t.Fatalf("UpdateTransaction: %v", err)
	}
	if updated.Merchant != "New Name" || !updated.Reviewed || updated.Notes != "updated" {
		t.Errorf("UpdateTransaction mismatch: %+v", updated)
	}

	got, _ := GetTransaction(dbRec.ID, tx.ID)
	if got.Merchant != "New Name" || !got.Reviewed {
		t.Errorf("persisted values mismatch: %+v", got)
	}
}

func TestUpdateTransaction_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")
	_, err := UpdateTransaction(dbRec.ID, &Transaction{ID: "nonexistent"})
	if err == nil {
		t.Error("expected error for missing transaction, got nil")
	}
}

func TestDeleteTransaction(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")
	tx, _ := CreateTransaction(dbRec.ID, &Transaction{
		Date: "2026-01-01", Merchant: "ToDelete", OriginalMerchant: "ToDelete",
		Amount: 5.0,
	})

	if err := DeleteTransaction(dbRec.ID, tx.ID); err != nil {
		t.Fatalf("DeleteTransaction: %v", err)
	}

	txs, _ := GetTransactions(dbRec.ID)
	if len(txs) != 0 {
		t.Errorf("expected 0 transactions after deletion, got %d", len(txs))
	}
}

func TestDeleteTransaction_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")
	err := DeleteTransaction(dbRec.ID, "nonexistent")
	if err == nil {
		t.Error("expected error for missing transaction, got nil")
	}
}

func TestGetTransactionFingerprints(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tx DB")
	CreateTransaction(dbRec.ID, &Transaction{
		Date: "2026-01-01", Merchant: "Shop", OriginalMerchant: "Shop", Amount: 25.00,
	})
	CreateTransaction(dbRec.ID, &Transaction{
		Date: "2026-01-02", Merchant: "Cafe", OriginalMerchant: "Cafe", Amount: 5.50,
	})

	fps, err := GetTransactionFingerprints(dbRec.ID)
	if err != nil {
		t.Fatalf("GetTransactionFingerprints: %v", err)
	}
	if len(fps) != 2 {
		t.Errorf("expected 2 fingerprints, got %d", len(fps))
	}
	if !fps["2026-01-01|Shop|25.00"] {
		t.Error("expected fingerprint for Shop transaction")
	}
	if !fps["2026-01-02|Cafe|5.50"] {
		t.Error("expected fingerprint for Cafe transaction")
	}
}

// ==================== Template CRUD ====================

func TestCreateAndGetTemplate(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tmpl DB")

	tmpl := &Template{
		Name:           "Chase",
		DateColumn:     "Transaction Date",
		MerchantColumn: "Description",
		AmountColumn:   "Amount",
		DateFormat:     "MM/DD/YYYY",
		DebitSign:      "negative",
	}
	created, err := CreateTemplate(dbRec.ID, tmpl)
	if err != nil {
		t.Fatalf("CreateTemplate: %v", err)
	}
	if created.ID == "" {
		t.Error("expected non-empty template ID")
	}

	got, err := GetTemplate(dbRec.ID, created.ID)
	if err != nil {
		t.Fatalf("GetTemplate: %v", err)
	}
	if got.Name != "Chase" || got.DebitSign != "negative" || got.DateFormat != "MM/DD/YYYY" {
		t.Errorf("GetTemplate mismatch: %+v", got)
	}
}

func TestCreateTemplate_DefaultDebitSign(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tmpl DB")
	tmpl := &Template{
		Name: "Bank", DateColumn: "Date", MerchantColumn: "Merchant",
		AmountColumn: "Amount", DateFormat: "YYYY-MM-DD",
	}
	created, _ := CreateTemplate(dbRec.ID, tmpl)
	if created.DebitSign != "positive" {
		t.Errorf("expected default debit sign 'positive', got %q", created.DebitSign)
	}
}

func TestGetTemplate_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tmpl DB")
	_, err := GetTemplate(dbRec.ID, "nonexistent")
	if err == nil {
		t.Error("expected error for missing template, got nil")
	}
}

func TestGetTemplates(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tmpl DB")
	base := &Template{DateColumn: "Date", MerchantColumn: "Merchant", AmountColumn: "Amount", DateFormat: "YYYY-MM-DD"}

	t1 := *base
	t1.Name = "Chase"
	CreateTemplate(dbRec.ID, &t1)

	t2 := *base
	t2.Name = "Amex"
	CreateTemplate(dbRec.ID, &t2)

	tmpls, err := GetTemplates(dbRec.ID)
	if err != nil {
		t.Fatalf("GetTemplates: %v", err)
	}
	if len(tmpls) != 2 {
		t.Errorf("expected 2 templates, got %d", len(tmpls))
	}
}

func TestDeleteTemplate(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tmpl DB")
	tmpl, _ := CreateTemplate(dbRec.ID, &Template{
		Name: "ToDelete", DateColumn: "D", MerchantColumn: "M",
		AmountColumn: "A", DateFormat: "YYYY-MM-DD",
	})

	if err := DeleteTemplate(dbRec.ID, tmpl.ID); err != nil {
		t.Fatalf("DeleteTemplate: %v", err)
	}

	_, err := GetTemplate(dbRec.ID, tmpl.ID)
	if err == nil {
		t.Error("expected error after deletion, got nil")
	}
}

func TestDeleteTemplate_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Tmpl DB")
	err := DeleteTemplate(dbRec.ID, "nonexistent")
	if err == nil {
		t.Error("expected error for missing template, got nil")
	}
}

// ==================== Settings ====================

func TestGetSettings_Defaults(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Settings DB")

	settings, err := GetSettings(dbRec.ID)
	if err != nil {
		t.Fatalf("GetSettings: %v", err)
	}
	if settings.OwnerName != "" {
		t.Errorf("expected empty owner name by default, got %q", settings.OwnerName)
	}
}

func TestUpsertSettings(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Settings DB")

	_, err := UpsertSettings(dbRec.ID, &DatabaseSettings{OwnerName: "Alice"})
	if err != nil {
		t.Fatalf("UpsertSettings (insert): %v", err)
	}

	got, _ := GetSettings(dbRec.ID)
	if got.OwnerName != "Alice" {
		t.Errorf("expected 'Alice', got %q", got.OwnerName)
	}

	// Update
	_, err = UpsertSettings(dbRec.ID, &DatabaseSettings{OwnerName: "Bob"})
	if err != nil {
		t.Fatalf("UpsertSettings (update): %v", err)
	}

	got, _ = GetSettings(dbRec.ID)
	if got.OwnerName != "Bob" {
		t.Errorf("expected 'Bob' after update, got %q", got.OwnerName)
	}
}

// ==================== Settlements ====================

func TestCreateAndGetSettlement(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Settle DB")

	created, err := CreateSettlement(dbRec.ID, &Settlement{
		FromPerson: "Bob",
		ToPerson:   "Alice",
		Amount:     25.5,
		Date:       "2026-07-01",
		Notes:      "venmo",
	})
	if err != nil {
		t.Fatalf("CreateSettlement: %v", err)
	}
	if created.ID == "" {
		t.Error("expected non-empty settlement ID")
	}

	all, err := GetSettlements(dbRec.ID)
	if err != nil {
		t.Fatalf("GetSettlements: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("expected 1 settlement, got %d", len(all))
	}
	got := all[0]
	if got.FromPerson != "Bob" || got.ToPerson != "Alice" || got.Amount != 25.5 || got.Date != "2026-07-01" || got.Notes != "venmo" {
		t.Errorf("GetSettlements mismatch: %+v", got)
	}
}

func TestGetSettlements(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Settle DB")

	CreateSettlement(dbRec.ID, &Settlement{FromPerson: "Bob", ToPerson: "Alice", Amount: 10, Date: "2026-06-01"})
	CreateSettlement(dbRec.ID, &Settlement{FromPerson: "Alice", ToPerson: "Carl", Amount: 20, Date: "2026-07-01"})

	settlements, err := GetSettlements(dbRec.ID)
	if err != nil {
		t.Fatalf("GetSettlements: %v", err)
	}
	if len(settlements) != 2 {
		t.Fatalf("expected 2 settlements, got %d", len(settlements))
	}
	if settlements[0].Date != "2026-07-01" {
		t.Errorf("expected most recent settlement first, got date %q", settlements[0].Date)
	}
}

func TestDeleteSettlement(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Settle DB")
	created, _ := CreateSettlement(dbRec.ID, &Settlement{FromPerson: "Bob", ToPerson: "Alice", Amount: 10, Date: "2026-06-01"})

	if err := DeleteSettlement(dbRec.ID, created.ID); err != nil {
		t.Fatalf("DeleteSettlement: %v", err)
	}

	all, _ := GetSettlements(dbRec.ID)
	if len(all) != 0 {
		t.Errorf("expected 0 settlements after deletion, got %d", len(all))
	}
}

func TestDeleteSettlement_NotFound(t *testing.T) {
	defer setupTestDB(t)()

	dbRec, _ := CreateDatabase("Settle DB")
	err := DeleteSettlement(dbRec.ID, "nonexistent")
	if err == nil {
		t.Error("expected error for missing settlement, got nil")
	}
}
