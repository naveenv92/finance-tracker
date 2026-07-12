package main

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// MerchantMapping represents a saved rename rule: an auto-cleaned original
// merchant name mapped to the user's preferred canonical name.
type MerchantMapping struct {
	ID               string    `json:"id"`
	DatabaseID       string    `json:"databaseId,omitempty"`
	OriginalMerchant string    `json:"originalMerchant"`
	MappedMerchant   string    `json:"mappedMerchant"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// VariantCount is one distinct historical rename spelling and how many
// transactions currently use it.
type VariantCount struct {
	Merchant string `json:"merchant"`
	Count    int    `json:"count"`
}

// MigratedMapping describes a mapping the scan auto-created because the
// historical rename for that merchant was unambiguous.
type MigratedMapping struct {
	OriginalMerchant string `json:"originalMerchant"`
	MappedMerchant   string `json:"mappedMerchant"`
	AppliedCount     int    `json:"appliedCount"`
}

// MappingConflict describes a merchant that was historically renamed to more
// than one distinct spelling, requiring the user to pick a canonical one.
type MappingConflict struct {
	OriginalMerchant string         `json:"originalMerchant"`
	Variants         []VariantCount `json:"variants"`
}

var (
	reStoreNumber = regexp.MustCompile(`#\d+`)
	reLongNumber  = regexp.MustCompile(`\s+\d{4,}`)
	reMultiSpace  = regexp.MustCompile(`\s{2,}`)
)

// CleanMerchantName mirrors static/js/utils/helpers.js's cleanMerchantName.
// It must stay in sync with that implementation — it's used here to
// recompute the "pre-edit" merchant key for transactions imported before
// mappings existed, since that pre-edit value isn't otherwise stored.
func CleanMerchantName(merchant string) string {
	if merchant == "" {
		return ""
	}
	cleaned := reStoreNumber.ReplaceAllString(merchant, "")
	cleaned = reLongNumber.ReplaceAllString(cleaned, "")
	cleaned = reMultiSpace.ReplaceAllString(cleaned, " ")
	return strings.TrimSpace(cleaned)
}

// ==================== Merchant Mapping Operations ====================

// UpsertMerchantMapping creates or updates the mapping for originalMerchant,
// then applies it to every existing transaction whose merchant cleans to
// that same key. Used by both the Review-page auto-capture and the manual
// management screen, so any write here takes effect everywhere.
func UpsertMerchantMapping(databaseID, originalMerchant, mappedMerchant string) (*MerchantMapping, int, error) {
	now := time.Now()

	result, err := db.Exec(
		`UPDATE merchant_mappings SET mapped_merchant = ?, updated_at = ? WHERE database_id = ? AND original_merchant = ?`,
		mappedMerchant, now, databaseID, originalMerchant,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to update merchant mapping: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	mapping := &MerchantMapping{
		DatabaseID:       databaseID,
		OriginalMerchant: originalMerchant,
		MappedMerchant:   mappedMerchant,
		UpdatedAt:        now,
	}

	if rows == 0 {
		mapping.ID = uuid.New().String()
		mapping.CreatedAt = now
		_, err := db.Exec(
			`INSERT INTO merchant_mappings (id, database_id, original_merchant, mapped_merchant, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			mapping.ID, mapping.DatabaseID, mapping.OriginalMerchant, mapping.MappedMerchant, mapping.CreatedAt, mapping.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to create merchant mapping: %w", err)
		}
	} else {
		err := db.QueryRow(
			`SELECT id, created_at FROM merchant_mappings WHERE database_id = ? AND original_merchant = ?`,
			databaseID, originalMerchant,
		).Scan(&mapping.ID, &mapping.CreatedAt)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to fetch updated merchant mapping: %w", err)
		}
	}

	applied, err := applyMerchantMapping(databaseID, mapping)
	if err != nil {
		return nil, 0, err
	}

	return mapping, applied, nil
}

// applyMerchantMapping rewrites the merchant field on every transaction in
// the database whose original merchant cleans to mapping.OriginalMerchant,
// so historical (including already-reviewed) transactions stay in sync.
func applyMerchantMapping(databaseID string, mapping *MerchantMapping) (int, error) {
	rows, err := db.Query(`SELECT id, original_merchant, merchant FROM transactions WHERE database_id = ?`, databaseID)
	if err != nil {
		return 0, fmt.Errorf("failed to query transactions for mapping apply: %w", err)
	}

	var matchingIDs []string
	for rows.Next() {
		var id, originalMerchant, merchant string
		if err := rows.Scan(&id, &originalMerchant, &merchant); err != nil {
			rows.Close()
			return 0, fmt.Errorf("failed to scan transaction: %w", err)
		}
		if CleanMerchantName(originalMerchant) == mapping.OriginalMerchant && merchant != mapping.MappedMerchant {
			matchingIDs = append(matchingIDs, id)
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("error iterating transactions for mapping apply: %w", err)
	}
	rows.Close()

	for _, id := range matchingIDs {
		if _, err := db.Exec(`UPDATE transactions SET merchant = ? WHERE id = ? AND database_id = ?`, mapping.MappedMerchant, id, databaseID); err != nil {
			return 0, fmt.Errorf("failed to apply merchant mapping to transaction %s: %w", id, err)
		}
	}

	return len(matchingIDs), nil
}

// GetMerchantMappings retrieves all merchant mappings for a database
func GetMerchantMappings(databaseID string) ([]*MerchantMapping, error) {
	query := `
		SELECT id, database_id, original_merchant, mapped_merchant, created_at, updated_at
		FROM merchant_mappings
		WHERE database_id = ?
		ORDER BY original_merchant ASC
	`

	rows, err := db.Query(query, databaseID)
	if err != nil {
		return nil, fmt.Errorf("failed to query merchant mappings: %w", err)
	}
	defer rows.Close()

	mappings := make([]*MerchantMapping, 0)
	for rows.Next() {
		var m MerchantMapping
		if err := rows.Scan(&m.ID, &m.DatabaseID, &m.OriginalMerchant, &m.MappedMerchant, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan merchant mapping: %w", err)
		}
		mappings = append(mappings, &m)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating merchant mappings: %w", err)
	}

	return mappings, nil
}

// UpdateMerchantMapping updates a mapping by ID (used by the management
// screen, e.g. to fix a typo in either the key or the canonical name), then
// re-applies it to matching transactions.
func UpdateMerchantMapping(databaseID, id string, m *MerchantMapping) (*MerchantMapping, int, error) {
	now := time.Now()
	result, err := db.Exec(
		`UPDATE merchant_mappings SET original_merchant = ?, mapped_merchant = ?, updated_at = ? WHERE id = ? AND database_id = ?`,
		m.OriginalMerchant, m.MappedMerchant, now, id, databaseID,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to update merchant mapping: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return nil, 0, fmt.Errorf("merchant mapping not found")
	}

	mapping := &MerchantMapping{
		ID:               id,
		DatabaseID:       databaseID,
		OriginalMerchant: m.OriginalMerchant,
		MappedMerchant:   m.MappedMerchant,
		UpdatedAt:        now,
	}
	if err := db.QueryRow(`SELECT created_at FROM merchant_mappings WHERE id = ? AND database_id = ?`, id, databaseID).Scan(&mapping.CreatedAt); err != nil {
		return nil, 0, fmt.Errorf("failed to fetch updated merchant mapping: %w", err)
	}

	applied, err := applyMerchantMapping(databaseID, mapping)
	if err != nil {
		return nil, 0, err
	}

	return mapping, applied, nil
}

// DeleteMerchantMapping deletes a mapping. It intentionally does not revert
// any transaction's merchant field — it only stops future auto-capture,
// pre-fill, and re-application for that key.
func DeleteMerchantMapping(databaseID, id string) error {
	result, err := db.Exec(`DELETE FROM merchant_mappings WHERE id = ? AND database_id = ?`, id, databaseID)
	if err != nil {
		return fmt.Errorf("failed to delete merchant mapping: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("merchant mapping not found")
	}
	return nil
}

// ScanMerchantMappingCandidates inspects existing transactions to find
// historical renames (merchant differs from the recomputed clean key of
// original_merchant). Unambiguous renames (one distinct spelling per key)
// are migrated into mappings immediately; keys with multiple distinct
// spellings are returned as conflicts for the user to resolve manually.
func ScanMerchantMappingCandidates(databaseID string) ([]MigratedMapping, []MappingConflict, error) {
	rows, err := db.Query(`SELECT original_merchant, merchant FROM transactions WHERE database_id = ?`, databaseID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to query transactions for scan: %w", err)
	}
	defer rows.Close()

	// cleanKey -> renamed merchant -> count
	groups := make(map[string]map[string]int)
	for rows.Next() {
		var originalMerchant, merchant string
		if err := rows.Scan(&originalMerchant, &merchant); err != nil {
			return nil, nil, fmt.Errorf("failed to scan transaction: %w", err)
		}
		key := CleanMerchantName(originalMerchant)
		if merchant == key {
			continue // unedited, nothing to migrate
		}
		if groups[key] == nil {
			groups[key] = make(map[string]int)
		}
		groups[key][merchant]++
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("error iterating transactions for scan: %w", err)
	}

	migrated := make([]MigratedMapping, 0)
	conflicts := make([]MappingConflict, 0)

	for key, variants := range groups {
		if len(variants) == 1 {
			for merchant := range variants {
				_, applied, err := UpsertMerchantMapping(databaseID, key, merchant)
				if err != nil {
					return nil, nil, err
				}
				migrated = append(migrated, MigratedMapping{
					OriginalMerchant: key,
					MappedMerchant:   merchant,
					AppliedCount:     applied,
				})
			}
			continue
		}

		variantList := make([]VariantCount, 0, len(variants))
		for merchant, count := range variants {
			variantList = append(variantList, VariantCount{Merchant: merchant, Count: count})
		}
		sort.Slice(variantList, func(i, j int) bool { return variantList[i].Count > variantList[j].Count })

		conflicts = append(conflicts, MappingConflict{
			OriginalMerchant: key,
			Variants:         variantList,
		})
	}

	sort.Slice(migrated, func(i, j int) bool { return migrated[i].OriginalMerchant < migrated[j].OriginalMerchant })
	sort.Slice(conflicts, func(i, j int) bool { return conflicts[i].OriginalMerchant < conflicts[j].OriginalMerchant })

	return migrated, conflicts, nil
}
