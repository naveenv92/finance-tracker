package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// BackupData represents a complete snapshot of a database
type BackupData struct {
	Version      int               `json:"version"`
	DatabaseID   string            `json:"databaseId"`
	DatabaseName string            `json:"databaseName"`
	BackedUpAt   time.Time         `json:"backedUpAt"`
	Categories   []*Category       `json:"categories"`
	Transactions []*Transaction    `json:"transactions"`
	Templates    []*Template       `json:"templates"`
	Settings     *DatabaseSettings `json:"settings"`
}

// BackupInfo represents metadata about a backup file
type BackupInfo struct {
	Filename     string    `json:"filename"`
	DatabaseName string    `json:"databaseName"`
	DatabaseID   string    `json:"databaseId"`
	BackedUpAt   time.Time `json:"backedUpAt"`
	Size         int64     `json:"size"`
}

// GetBackupsDir returns (and creates) the backups directory
func GetBackupsDir() (string, error) {
	appDir, err := GetAppDataDir()
	if err != nil {
		return "", err
	}
	backupsDir := filepath.Join(appDir, "backups")
	if err := os.MkdirAll(backupsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create backups directory: %w", err)
	}
	return backupsDir, nil
}

// CreateBackup dumps all data for a database to a JSON file in the backups directory
func CreateBackup(dbID string) (*BackupInfo, error) {
	database, err := GetDatabase(dbID)
	if err != nil {
		return nil, fmt.Errorf("database not found: %w", err)
	}

	categories, err := GetCategories(dbID)
	if err != nil {
		return nil, fmt.Errorf("failed to get categories: %w", err)
	}

	transactions, err := GetTransactions(dbID)
	if err != nil {
		return nil, fmt.Errorf("failed to get transactions: %w", err)
	}

	templates, err := GetTemplates(dbID)
	if err != nil {
		return nil, fmt.Errorf("failed to get templates: %w", err)
	}

	settings, err := GetSettings(dbID)
	if err != nil {
		return nil, fmt.Errorf("failed to get settings: %w", err)
	}

	backedUpAt := time.Now()
	data := &BackupData{
		Version:      1,
		DatabaseID:   database.ID,
		DatabaseName: database.Name,
		BackedUpAt:   backedUpAt,
		Categories:   categories,
		Transactions: transactions,
		Templates:    templates,
		Settings:     settings,
	}

	safeName := sanitizeFilename(database.Name)
	filename := fmt.Sprintf("%s-%s.json", safeName, backedUpAt.Format("2006-01-02T15-04-05"))

	backupsDir, err := GetBackupsDir()
	if err != nil {
		return nil, err
	}

	filePath := filepath.Join(backupsDir, filename)
	f, err := os.Create(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create backup file: %w", err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(data); err != nil {
		return nil, fmt.Errorf("failed to write backup: %w", err)
	}

	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat backup file: %w", err)
	}

	return &BackupInfo{
		Filename:     filename,
		DatabaseName: database.Name,
		DatabaseID:   database.ID,
		BackedUpAt:   backedUpAt,
		Size:         fileInfo.Size(),
	}, nil
}

// ListBackups returns metadata for all backup files, newest first
func ListBackups() ([]*BackupInfo, error) {
	backupsDir, err := GetBackupsDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(backupsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read backups directory: %w", err)
	}

	backups := make([]*BackupInfo, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		filePath := filepath.Join(backupsDir, entry.Name())
		info, err := readBackupInfo(filePath, entry.Name())
		if err != nil {
			// Skip unreadable or malformed backups
			continue
		}
		backups = append(backups, info)
	}

	// Sort newest first
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].BackedUpAt.After(backups[j].BackedUpAt)
	})

	return backups, nil
}

// readBackupInfo reads a backup file and returns its metadata
func readBackupInfo(filePath, filename string) (*BackupInfo, error) {
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return nil, err
	}

	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var data BackupData
	if err := json.NewDecoder(f).Decode(&data); err != nil {
		return nil, err
	}

	return &BackupInfo{
		Filename:     filename,
		DatabaseName: data.DatabaseName,
		DatabaseID:   data.DatabaseID,
		BackedUpAt:   data.BackedUpAt,
		Size:         fileInfo.Size(),
	}, nil
}

// DeleteBackup removes a backup file by filename
func DeleteBackup(filename string) error {
	if err := validateBackupFilename(filename); err != nil {
		return err
	}

	backupsDir, err := GetBackupsDir()
	if err != nil {
		return err
	}

	filePath := filepath.Join(backupsDir, filename)
	if err := os.Remove(filePath); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("backup not found")
		}
		return fmt.Errorf("failed to delete backup: %w", err)
	}

	return nil
}

// RestoreBackup creates a new database from a backup file
func RestoreBackup(filename string) (*Database, error) {
	if err := validateBackupFilename(filename); err != nil {
		return nil, err
	}

	backupsDir, err := GetBackupsDir()
	if err != nil {
		return nil, err
	}

	filePath := filepath.Join(backupsDir, filename)
	f, err := os.Open(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("backup not found")
		}
		return nil, fmt.Errorf("failed to open backup: %w", err)
	}
	defer f.Close()

	var data BackupData
	if err := json.NewDecoder(f).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to parse backup: %w", err)
	}

	newDB, err := CreateDatabase(data.DatabaseName + " (Restored)")
	if err != nil {
		return nil, fmt.Errorf("failed to create database: %w", err)
	}

	// Restore categories, building old→new ID map for transaction remapping
	categoryIDMap := make(map[string]string)
	for _, cat := range data.Categories {
		oldID := cat.ID
		cat.ID = ""
		created, err := CreateCategory(newDB.ID, cat)
		if err != nil {
			return nil, fmt.Errorf("failed to restore category %q: %w", cat.Name, err)
		}
		categoryIDMap[oldID] = created.ID
	}

	// Restore transactions, remapping category IDs to new ones
	for _, tx := range data.Transactions {
		tx.ID = ""
		if tx.CategoryID != nil {
			if newCatID, ok := categoryIDMap[*tx.CategoryID]; ok {
				tx.CategoryID = &newCatID
			} else {
				tx.CategoryID = nil
			}
		}
		if _, err := CreateTransaction(newDB.ID, tx); err != nil {
			return nil, fmt.Errorf("failed to restore transaction: %w", err)
		}
	}

	// Restore templates
	for _, tmpl := range data.Templates {
		tmpl.ID = ""
		if _, err := CreateTemplate(newDB.ID, tmpl); err != nil {
			return nil, fmt.Errorf("failed to restore template %q: %w", tmpl.Name, err)
		}
	}

	// Restore settings
	if data.Settings != nil {
		if _, err := UpsertSettings(newDB.ID, data.Settings); err != nil {
			return nil, fmt.Errorf("failed to restore settings: %w", err)
		}
	}

	return newDB, nil
}

// validateBackupFilename rejects filenames with path traversal characters
func validateBackupFilename(filename string) error {
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") || strings.Contains(filename, "..") {
		return fmt.Errorf("invalid filename")
	}
	if !strings.HasSuffix(filename, ".json") {
		return fmt.Errorf("invalid filename")
	}
	return nil
}

// sanitizeFilename replaces characters unsafe for filenames with underscores
func sanitizeFilename(name string) string {
	result := make([]byte, 0, len(name))
	for _, b := range []byte(name) {
		if (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '-' {
			result = append(result, b)
		} else {
			result = append(result, '_')
		}
	}
	if len(result) == 0 {
		return "backup"
	}
	return string(result)
}
