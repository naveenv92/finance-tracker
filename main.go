package main

import (
	"embed"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed static/*
var staticFiles embed.FS

var debugMode bool

// debugf logs only when LOG_LEVEL=DEBUG
func debugf(format string, args ...interface{}) {
	if debugMode {
		log.Printf("[DEBUG] "+format, args...)
	}
}

func setupLogging() error {
	appDir, err := GetAppDataDir()
	if err != nil {
		return fmt.Errorf("failed to get app directory: %w", err)
	}

	// Create logs directory
	logsDir := filepath.Join(appDir, "logs")
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return fmt.Errorf("failed to create logs directory: %w", err)
	}

	// Create log file with timestamp
	logFileName := fmt.Sprintf("server-%s.log", time.Now().Format("2006-01-02"))
	logFilePath := filepath.Join(logsDir, logFileName)

	// Open log file
	logFile, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}

	// Set log output to both file and console
	multiWriter := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(multiWriter)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	debugMode = strings.EqualFold(os.Getenv("LOG_LEVEL"), "debug")
	log.Printf("Logging initialized - writing to %s", logFilePath)
	if debugMode {
		log.Println("[DEBUG] Debug logging enabled")
	}
	return nil
}

func main() {
	// Setup logging
	if err := setupLogging(); err != nil {
		log.Fatal("Failed to setup logging:", err)
	}

	// Log app data directory location
	appDir, err := GetAppDataDir()
	if err != nil {
		log.Fatal("Failed to get app directory:", err)
	}
	log.Printf("App data directory: %s", appDir)

	// Initialize database
	if err := InitDB(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer CloseDB()

	dbPath, _ := GetDatabasePath()
	log.Printf("Database location: %s", dbPath)

	// API routes
	http.HandleFunc("/api/databases", handleDatabases)
	http.HandleFunc("/api/databases/", handleDatabaseRoutes)
	http.HandleFunc("/api/backups", handleBackupList)
	http.HandleFunc("/api/backups/", handleBackupRoutes)

	log.Println("Registered API routes")

	// Create a sub-filesystem starting at "static"
	fsys, err := fs.Sub(staticFiles, "static")
	if err != nil {
		panic(err)
	}

	// Serve static files
	fileServer := http.FileServer(http.FS(fsys))
	http.Handle("/", fileServer)

	log.Println("Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// handleDatabases handles GET (list) and POST (create) for databases
func handleDatabases(w http.ResponseWriter, r *http.Request) {
	debugf("%s /api/databases", r.Method)
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		databases, err := GetAllDatabases()
		if err != nil {
			log.Printf("ERROR listing databases: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("listed %d databases", len(databases))
		json.NewEncoder(w).Encode(databases)

	case http.MethodPost:
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(req.Name) == "" {
			http.Error(w, "Name is required", http.StatusBadRequest)
			return
		}

		database, err := CreateDatabase(req.Name)
		if err != nil {
			log.Printf("ERROR creating database %q: %v", req.Name, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		debugf("created database id=%s name=%q", database.ID, database.Name)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(database)
	}
}

// handleDatabaseRoutes routes database and nested resource requests
func handleDatabaseRoutes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Extract path after /api/databases/
	path := strings.TrimPrefix(r.URL.Path, "/api/databases/")
	parts := strings.Split(path, "/")

	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "Database ID is required", http.StatusBadRequest)
		return
	}

	dbID := parts[0]

	// Route based on path depth
	if len(parts) == 1 {
		// /api/databases/:id
		handleDatabaseByID(w, r, dbID)
	} else if len(parts) >= 2 {
		// /api/databases/:id/categories or /api/databases/:id/transactions
		resource := parts[1]
		switch resource {
		case "categories":
			if len(parts) == 2 {
				handleCategories(w, r, dbID)
			} else {
				handleCategoryByID(w, r, dbID, parts[2])
			}
		case "transactions":
			if len(parts) == 2 {
				handleTransactions(w, r, dbID)
			} else if parts[2] == "import" {
				handleTransactionImport(w, r, dbID)
			} else if parts[2] == "export" {
				handleTransactionExport(w, r, dbID)
			} else {
				handleTransactionByID(w, r, dbID, parts[2])
			}
		case "templates":
			if len(parts) == 2 {
				handleTemplates(w, r, dbID)
			} else {
				handleTemplateByID(w, r, dbID, parts[2])
			}
		case "settlements":
			if len(parts) == 2 {
				handleSettlements(w, r, dbID)
			} else {
				handleSettlementByID(w, r, dbID, parts[2])
			}
		case "settings":
			handleSettings(w, r, dbID)
		case "backup":
			handleDatabaseBackup(w, r, dbID)
		default:
			http.Error(w, "Unknown resource", http.StatusNotFound)
		}
	}
}

// handleDatabaseByID handles GET and DELETE for specific database
func handleDatabaseByID(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("%s /api/databases/%s", r.Method, dbID)
	switch r.Method {
	case http.MethodGet:
		database, err := GetDatabase(dbID)
		if err != nil {
			log.Printf("ERROR getting database id=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		debugf("fetched database id=%s name=%q", dbID, database.Name)
		json.NewEncoder(w).Encode(database)

	case http.MethodDelete:
		if err := DeleteDatabase(dbID); err != nil {
			log.Printf("ERROR deleting database id=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("deleted database id=%s", dbID)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleCategories handles GET (list) and POST (create) for categories
func handleCategories(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("%s /api/databases/%s/categories", r.Method, dbID)
	switch r.Method {
	case http.MethodGet:
		categories, err := GetCategories(dbID)
		if err != nil {
			log.Printf("ERROR listing categories db=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("listed %d categories db=%s", len(categories), dbID)
		json.NewEncoder(w).Encode(categories)

	case http.MethodPost:
		var category Category
		if err := json.NewDecoder(r.Body).Decode(&category); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(category.Name) == "" {
			http.Error(w, "Category name is required", http.StatusBadRequest)
			return
		}

		created, err := CreateCategory(dbID, &category)
		if err != nil {
			log.Printf("ERROR creating category %q db=%s: %v", category.Name, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		debugf("created category id=%s name=%q db=%s", created.ID, created.Name, dbID)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleCategoryByID handles PUT and DELETE for specific category
func handleCategoryByID(w http.ResponseWriter, r *http.Request, dbID, categoryID string) {
	debugf("%s /api/databases/%s/categories/%s", r.Method, dbID, categoryID)
	switch r.Method {
	case http.MethodPut:
		var category Category
		if err := json.NewDecoder(r.Body).Decode(&category); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(category.Name) == "" {
			http.Error(w, "Category name is required", http.StatusBadRequest)
			return
		}
		updated, err := UpdateCategory(dbID, categoryID, &category)
		if err != nil {
			log.Printf("ERROR updating category id=%s db=%s: %v", categoryID, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("updated category id=%s db=%s", categoryID, dbID)
		json.NewEncoder(w).Encode(updated)

	case http.MethodDelete:
		if err := DeleteCategory(dbID, categoryID); err != nil {
			log.Printf("ERROR deleting category id=%s db=%s: %v", categoryID, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("deleted category id=%s db=%s", categoryID, dbID)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTransactions handles GET (list) and POST (create) for transactions
func handleTransactions(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("%s /api/databases/%s/transactions", r.Method, dbID)
	switch r.Method {
	case http.MethodGet:
		transactions, err := GetTransactions(dbID)
		if err != nil {
			log.Printf("ERROR listing transactions db=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("listed %d transactions db=%s", len(transactions), dbID)
		json.NewEncoder(w).Encode(transactions)

	case http.MethodPost:
		var transaction Transaction
		if err := json.NewDecoder(r.Body).Decode(&transaction); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(transaction.Merchant) == "" {
			http.Error(w, "Merchant is required", http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(transaction.Date) == "" {
			http.Error(w, "Date is required", http.StatusBadRequest)
			return
		}

		created, err := CreateTransaction(dbID, &transaction)
		if err != nil {
			log.Printf("ERROR creating transaction merchant=%q db=%s: %v", transaction.Merchant, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		debugf("created transaction id=%s merchant=%q date=%s amount=%.2f db=%s", created.ID, created.Merchant, created.Date, created.Amount, dbID)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTransactionImport handles bulk import of transactions.
// Transactions matching an existing date + original_merchant + amount are imported but flagged as possible duplicates.
func handleTransactionImport(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("POST /api/databases/%s/transactions/import", dbID)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Transactions []Transaction `json:"transactions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	debugf("import request: %d transactions db=%s", len(req.Transactions), dbID)

	fingerprints, err := GetTransactionFingerprints(dbID)
	if err != nil {
		log.Printf("ERROR loading fingerprints db=%s: %v", dbID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	imported := 0
	duplicates := 0
	for i := range req.Transactions {
		t := &req.Transactions[i]
		key := fmt.Sprintf("%s|%s|%.2f", t.Date, t.OriginalMerchant, t.Amount)
		if fingerprints[key] {
			debugf("flagging possible duplicate: date=%s merchant=%q amount=%.2f", t.Date, t.OriginalMerchant, t.Amount)
			t.PossibleDuplicate = true
			duplicates++
		}
		if _, err := CreateTransaction(dbID, t); err != nil {
			log.Printf("ERROR importing transaction merchant=%q db=%s: %v", t.Merchant, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fingerprints[key] = true
		imported++
	}

	debugf("import complete: imported=%d duplicates=%d db=%s", imported, duplicates, dbID)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]int{"imported": imported, "duplicates": duplicates})
}

// handleTransactionByID handles GET, PUT, and DELETE for specific transaction
func handleTransactionByID(w http.ResponseWriter, r *http.Request, dbID, transactionID string) {
	debugf("%s /api/databases/%s/transactions/%s", r.Method, dbID, transactionID)
	switch r.Method {
	case http.MethodGet:
		transaction, err := GetTransaction(dbID, transactionID)
		if err != nil {
			log.Printf("ERROR getting transaction id=%s db=%s: %v", transactionID, dbID, err)
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		debugf("fetched transaction id=%s merchant=%q db=%s", transactionID, transaction.Merchant, dbID)
		json.NewEncoder(w).Encode(transaction)

	case http.MethodPut:
		var transaction Transaction
		if err := json.NewDecoder(r.Body).Decode(&transaction); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		transaction.ID = transactionID
		transaction.DatabaseID = dbID

		if strings.TrimSpace(transaction.Merchant) == "" {
			http.Error(w, "Merchant is required", http.StatusBadRequest)
			return
		}

		updated, err := UpdateTransaction(dbID, &transaction)
		if err != nil {
			log.Printf("ERROR updating transaction id=%s db=%s: %v", transactionID, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		debugf("updated transaction id=%s merchant=%q reviewed=%v db=%s", transactionID, updated.Merchant, updated.Reviewed, dbID)
		json.NewEncoder(w).Encode(updated)

	case http.MethodDelete:
		if err := DeleteTransaction(dbID, transactionID); err != nil {
			log.Printf("ERROR deleting transaction id=%s db=%s: %v", transactionID, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("deleted transaction id=%s db=%s", transactionID, dbID)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTransactionExport streams a CSV of reviewed transactions, optionally filtered by date range.
// GET /api/databases/:id/transactions/export?start=YYYY-MM-DD&end=YYYY-MM-DD&filename=name.csv
func handleTransactionExport(w http.ResponseWriter, r *http.Request, dbID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")
	filename := strings.TrimSpace(r.URL.Query().Get("filename"))
	debugf("GET /api/databases/%s/transactions/export start=%q end=%q filename=%q", dbID, startDate, endDate, filename)
	if filename == "" {
		filename = fmt.Sprintf("transactions-%s.csv", time.Now().Format("2006-01-02"))
	}
	if !strings.HasSuffix(filename, ".csv") {
		filename += ".csv"
	}

	transactions, err := GetTransactionsForExport(dbID, startDate, endDate)
	if err != nil {
		log.Printf("ERROR fetching transactions for export db=%s: %v", dbID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	debugf("exporting %d transactions db=%s", len(transactions), dbID)

	// Build category map for name lookup
	categories, err := GetCategories(dbID)
	if err != nil {
		log.Printf("ERROR fetching categories for export db=%s: %v", dbID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	categoryMap := make(map[string]*Category, len(categories))
	for _, c := range categories {
		categoryMap[c.ID] = c
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"Date", "Merchant", "Amount", "Category", "Source", "Notes", "Splits"})

	for _, t := range transactions {
		categoryName := ""
		if t.CategoryID != nil {
			if cat, ok := categoryMap[*t.CategoryID]; ok {
				categoryName = strings.TrimSpace(cat.Emoji + " " + cat.Name)
			}
		}

		splitsStr := formatSplitsForCSV(t.Splits)

		_ = cw.Write([]string{
			t.Date,
			t.Merchant,
			fmt.Sprintf("%.2f", t.Amount),
			categoryName,
			t.Source,
			t.Notes,
			splitsStr,
		})
	}

	cw.Flush()
	if err := cw.Error(); err != nil {
		log.Printf("CSV write error: %v", err)
	}
}

// formatSplitsForCSV formats a JSON splits string into a human-readable form.
func formatSplitsForCSV(splitsJSON string) string {
	if splitsJSON == "" {
		return ""
	}

	type splitEntry struct {
		PersonName string  `json:"personName"`
		Amount     float64 `json:"amount"`
	}

	var splits []splitEntry
	if err := json.Unmarshal([]byte(splitsJSON), &splits); err != nil || len(splits) == 0 {
		return ""
	}

	parts := make([]string, 0, len(splits))
	for _, s := range splits {
		parts = append(parts, fmt.Sprintf("%s: $%.2f", s.PersonName, s.Amount))
	}
	return strings.Join(parts, "; ")
}

// handleTemplates handles GET (list) and POST (create) for templates
func handleTemplates(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("%s /api/databases/%s/templates", r.Method, dbID)
	switch r.Method {
	case http.MethodGet:
		templates, err := GetTemplates(dbID)
		if err != nil {
			log.Printf("ERROR listing templates db=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("listed %d templates db=%s", len(templates), dbID)
		json.NewEncoder(w).Encode(templates)

	case http.MethodPost:
		var template Template
		if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(template.Name) == "" {
			http.Error(w, "Template name is required", http.StatusBadRequest)
			return
		}

		created, err := CreateTemplate(dbID, &template)
		if err != nil {
			log.Printf("ERROR creating template %q db=%s: %v", template.Name, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		debugf("created template id=%s name=%q db=%s", created.ID, created.Name, dbID)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleSettings handles GET and PUT for database settings
func handleSettings(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("%s /api/databases/%s/settings", r.Method, dbID)
	switch r.Method {
	case http.MethodGet:
		settings, err := GetSettings(dbID)
		if err != nil {
			log.Printf("ERROR getting settings db=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("fetched settings db=%s ownerName=%q", dbID, settings.OwnerName)
		json.NewEncoder(w).Encode(settings)

	case http.MethodPut:
		var settings DatabaseSettings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		updated, err := UpsertSettings(dbID, &settings)
		if err != nil {
			log.Printf("ERROR upserting settings db=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("updated settings db=%s ownerName=%q", dbID, updated.OwnerName)
		json.NewEncoder(w).Encode(updated)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleDatabaseBackup handles POST /api/databases/:id/backup — creates a backup for a database
func handleDatabaseBackup(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("%s /api/databases/%s/backup", r.Method, dbID)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	info, err := CreateBackup(dbID)
	if err != nil {
		log.Printf("ERROR creating backup db=%s: %v", dbID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	debugf("created backup file=%s db=%s", info.Filename, dbID)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(info)
}

// handleBackupList handles GET /api/backups — lists all backup files
func handleBackupList(w http.ResponseWriter, r *http.Request) {
	debugf("%s /api/backups", r.Method)
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	backups, err := ListBackups()
	if err != nil {
		log.Printf("ERROR listing backups: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	debugf("listed %d backups", len(backups))
	json.NewEncoder(w).Encode(backups)
}

// handleBackupRoutes routes /api/backups/:filename and /api/backups/:filename/restore
func handleBackupRoutes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/backups/")
	parts := strings.SplitN(path, "/", 2)
	filename := parts[0]

	if filename == "" {
		http.Error(w, "Filename is required", http.StatusBadRequest)
		return
	}

	if len(parts) == 2 && parts[1] == "restore" {
		// POST /api/backups/:filename/restore
		debugf("%s /api/backups/%s/restore", r.Method, filename)
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		newDB, err := RestoreBackup(filename)
		if err != nil {
			log.Printf("ERROR restoring backup file=%s: %v", filename, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("restored backup file=%s new db id=%s", filename, newDB.ID)
		json.NewEncoder(w).Encode(newDB)
		return
	}

	// DELETE /api/backups/:filename
	debugf("%s /api/backups/%s", r.Method, filename)
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := DeleteBackup(filename); err != nil {
		log.Printf("ERROR deleting backup file=%s: %v", filename, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	debugf("deleted backup file=%s", filename)
	w.WriteHeader(http.StatusNoContent)
}

// handleTemplateByID handles PUT and DELETE for specific template
func handleTemplateByID(w http.ResponseWriter, r *http.Request, dbID, templateID string) {
	debugf("%s /api/databases/%s/templates/%s", r.Method, dbID, templateID)
	switch r.Method {
	case http.MethodPut:
		var template Template
		if err := json.NewDecoder(r.Body).Decode(&template); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		template.ID = templateID
		if strings.TrimSpace(template.Name) == "" {
			http.Error(w, "Template name is required", http.StatusBadRequest)
			return
		}
		if err := UpdateTemplate(dbID, &template); err != nil {
			log.Printf("ERROR updating template id=%s db=%s: %v", templateID, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("updated template id=%s db=%s", templateID, dbID)
		updated, err := GetTemplate(dbID, templateID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(updated)

	case http.MethodDelete:
		if err := DeleteTemplate(dbID, templateID); err != nil {
			log.Printf("ERROR deleting template id=%s db=%s: %v", templateID, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("deleted template id=%s db=%s", templateID, dbID)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleSettlements handles GET (list) and POST (create) for settlements
func handleSettlements(w http.ResponseWriter, r *http.Request, dbID string) {
	debugf("%s /api/databases/%s/settlements", r.Method, dbID)
	switch r.Method {
	case http.MethodGet:
		settlements, err := GetSettlements(dbID)
		if err != nil {
			log.Printf("ERROR listing settlements db=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("listed %d settlements db=%s", len(settlements), dbID)
		json.NewEncoder(w).Encode(settlements)

	case http.MethodPost:
		var settlement Settlement
		if err := json.NewDecoder(r.Body).Decode(&settlement); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(settlement.FromPerson) == "" {
			http.Error(w, "From person is required", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(settlement.ToPerson) == "" {
			http.Error(w, "To person is required", http.StatusBadRequest)
			return
		}
		if settlement.FromPerson == settlement.ToPerson {
			http.Error(w, "Cannot settle a debt with yourself", http.StatusBadRequest)
			return
		}
		if settlement.Amount <= 0 {
			http.Error(w, "Amount must be greater than zero", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(settlement.Date) == "" {
			http.Error(w, "Date is required", http.StatusBadRequest)
			return
		}

		created, err := CreateSettlement(dbID, &settlement)
		if err != nil {
			log.Printf("ERROR creating settlement db=%s: %v", dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		debugf("created settlement id=%s db=%s", created.ID, dbID)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleSettlementByID handles DELETE for a specific settlement
func handleSettlementByID(w http.ResponseWriter, r *http.Request, dbID, settlementID string) {
	debugf("%s /api/databases/%s/settlements/%s", r.Method, dbID, settlementID)
	switch r.Method {
	case http.MethodDelete:
		if err := DeleteSettlement(dbID, settlementID); err != nil {
			log.Printf("ERROR deleting settlement id=%s db=%s: %v", settlementID, dbID, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		debugf("deleted settlement id=%s db=%s", settlementID, dbID)
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
