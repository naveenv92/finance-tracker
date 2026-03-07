package main

import (
	"embed"
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

	log.Printf("Logging initialized - writing to %s", logFilePath)
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
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		databases, err := GetAllDatabases()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

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
			} else {
				handleTransactionByID(w, r, dbID, parts[2])
			}
		case "templates":
			if len(parts) == 2 {
				handleTemplates(w, r, dbID)
			} else {
				handleTemplateByID(w, r, dbID, parts[2])
			}
		default:
			http.Error(w, "Unknown resource", http.StatusNotFound)
		}
	}
}

// handleDatabaseByID handles GET and DELETE for specific database
func handleDatabaseByID(w http.ResponseWriter, r *http.Request, dbID string) {
	switch r.Method {
	case http.MethodGet:
		database, err := GetDatabase(dbID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(database)

	case http.MethodDelete:
		if err := DeleteDatabase(dbID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleCategories handles GET (list) and POST (create) for categories
func handleCategories(w http.ResponseWriter, r *http.Request, dbID string) {
	switch r.Method {
	case http.MethodGet:
		categories, err := GetCategories(dbID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleCategoryByID handles DELETE for specific category
func handleCategoryByID(w http.ResponseWriter, r *http.Request, dbID, categoryID string) {
	switch r.Method {
	case http.MethodDelete:
		if err := DeleteCategory(dbID, categoryID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTransactions handles GET (list) and POST (create) for transactions
func handleTransactions(w http.ResponseWriter, r *http.Request, dbID string) {
	switch r.Method {
	case http.MethodGet:
		transactions, err := GetTransactions(dbID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTransactionImport handles bulk import of transactions
func handleTransactionImport(w http.ResponseWriter, r *http.Request, dbID string) {
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

	created := make([]*Transaction, 0, len(req.Transactions))
	for i := range req.Transactions {
		t, err := CreateTransaction(dbID, &req.Transactions[i])
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		created = append(created, t)
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

// handleTransactionByID handles GET, PUT, and DELETE for specific transaction
func handleTransactionByID(w http.ResponseWriter, r *http.Request, dbID, transactionID string) {
	switch r.Method {
	case http.MethodGet:
		transaction, err := GetTransaction(dbID, transactionID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(updated)

	case http.MethodDelete:
		if err := DeleteTransaction(dbID, transactionID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTemplates handles GET (list) and POST (create) for templates
func handleTemplates(w http.ResponseWriter, r *http.Request, dbID string) {
	switch r.Method {
	case http.MethodGet:
		templates, err := GetTemplates(dbID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(created)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTemplateByID handles DELETE for specific template
func handleTemplateByID(w http.ResponseWriter, r *http.Request, dbID, templateID string) {
	switch r.Method {
	case http.MethodDelete:
		if err := DeleteTemplate(dbID, templateID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
