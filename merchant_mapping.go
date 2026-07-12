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

// mappingMatchesKey mirrors static/js/utils/helpers.js's mappingMatchesKey.
// It must stay in sync with that implementation. A pattern ending in "*" is
// a prefix match against cleanKey; otherwise it's an exact match. Both forms
// compare case-insensitively, since the same vendor often appears with
// different casing across different banks/statements.
func mappingMatchesKey(pattern, cleanKey string) bool {
	if strings.HasSuffix(pattern, "*") {
		return strings.HasPrefix(strings.ToLower(cleanKey), strings.ToLower(strings.TrimSuffix(pattern, "*")))
	}
	return strings.EqualFold(pattern, cleanKey)
}

// resolveMerchantMapping mirrors static/js/utils/helpers.js's
// resolveMerchantMapping. It must stay in sync with that implementation.
// Exact matches always win over wildcard matches; among multiple matching
// wildcards, the one with the longest literal prefix (most specific) wins.
func resolveMerchantMapping(cleanKey string, mappings []*MerchantMapping) *MerchantMapping {
	for _, m := range mappings {
		if !strings.HasSuffix(m.OriginalMerchant, "*") && strings.EqualFold(m.OriginalMerchant, cleanKey) {
			return m
		}
	}

	var best *MerchantMapping
	bestPrefixLen := -1
	for _, m := range mappings {
		if !strings.HasSuffix(m.OriginalMerchant, "*") {
			continue
		}
		prefix := strings.TrimSuffix(m.OriginalMerchant, "*")
		if mappingMatchesKey(m.OriginalMerchant, cleanKey) && len(prefix) > bestPrefixLen {
			best = m
			bestPrefixLen = len(prefix)
		}
	}
	return best
}

// isValidMerchantMappingPattern enforces the trailing-wildcard-only syntax:
// "*" may only appear as the final character, and the literal prefix before
// it (or the whole pattern, if there's no "*") must be non-empty.
func isValidMerchantMappingPattern(pattern string) bool {
	if pattern == "" {
		return false
	}
	if strings.Count(pattern, "*") > 1 {
		return false
	}
	if idx := strings.Index(pattern, "*"); idx != -1 && idx != len(pattern)-1 {
		return false
	}
	return strings.TrimSuffix(pattern, "*") != ""
}

// ==================== Merchant Mapping Operations ====================

// UpsertMerchantMapping creates or updates the mapping for originalMerchant,
// then applies it to every existing transaction whose merchant cleans to
// that same key. Used by both the Review-page auto-capture and the manual
// management screen, so any write here takes effect everywhere. Matching
// against an existing mapping's original_merchant is case-insensitive
// (COLLATE NOCASE) so re-capturing a differently-cased spelling of an
// existing key updates that row instead of creating a duplicate; the
// row's stored casing is refreshed to whatever was just submitted.
func UpsertMerchantMapping(databaseID, originalMerchant, mappedMerchant string) (*MerchantMapping, int, error) {
	now := time.Now()

	result, err := db.Exec(
		`UPDATE merchant_mappings SET original_merchant = ?, mapped_merchant = ?, updated_at = ? WHERE database_id = ? AND original_merchant = ? COLLATE NOCASE`,
		originalMerchant, mappedMerchant, now, databaseID, originalMerchant,
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
			`SELECT id, created_at FROM merchant_mappings WHERE database_id = ? AND original_merchant = ? COLLATE NOCASE`,
			databaseID, originalMerchant,
		).Scan(&mapping.ID, &mapping.CreatedAt)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to fetch updated merchant mapping: %w", err)
		}
	}

	applied, err := reconcileMerchantMappings(databaseID)
	if err != nil {
		return nil, 0, err
	}

	return mapping, applied, nil
}

// reconcileMerchantMappings re-resolves every transaction in the database
// against the full current set of merchant mappings (exact and wildcard)
// and rewrites `merchant` wherever the resolved mapping disagrees with it,
// so historical (including already-reviewed) transactions stay in sync.
// Re-resolving against the full set (rather than just the mapping that was
// just written) is what makes precedence between overlapping exact/wildcard
// mappings correct regardless of which mapping triggered the reconcile.
func reconcileMerchantMappings(databaseID string) (int, error) {
	mappings, err := GetMerchantMappings(databaseID)
	if err != nil {
		return 0, err
	}

	rows, err := db.Query(`SELECT id, original_merchant, merchant FROM transactions WHERE database_id = ?`, databaseID)
	if err != nil {
		return 0, fmt.Errorf("failed to query transactions for mapping reconcile: %w", err)
	}

	type update struct {
		id       string
		merchant string
	}
	var updates []update
	for rows.Next() {
		var id, originalMerchant, merchant string
		if err := rows.Scan(&id, &originalMerchant, &merchant); err != nil {
			rows.Close()
			return 0, fmt.Errorf("failed to scan transaction: %w", err)
		}
		cleanKey := CleanMerchantName(originalMerchant)
		winner := resolveMerchantMapping(cleanKey, mappings)
		if winner != nil && merchant != winner.MappedMerchant {
			updates = append(updates, update{id: id, merchant: winner.MappedMerchant})
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("error iterating transactions for mapping reconcile: %w", err)
	}
	rows.Close()

	for _, u := range updates {
		if _, err := db.Exec(`UPDATE transactions SET merchant = ? WHERE id = ? AND database_id = ?`, u.merchant, u.id, databaseID); err != nil {
			return 0, fmt.Errorf("failed to apply merchant mapping to transaction %s: %w", u.id, err)
		}
	}

	return len(updates), nil
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

	applied, err := reconcileMerchantMappings(databaseID)
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
	existingMappings, err := GetMerchantMappings(databaseID)
	if err != nil {
		return nil, nil, err
	}

	rows, err := db.Query(`SELECT original_merchant, merchant FROM transactions WHERE database_id = ?`, databaseID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to query transactions for scan: %w", err)
	}
	defer rows.Close()

	// normalized (lowercased) cleanKey -> group. Grouping is case-insensitive
	// so the same vendor appearing with different casing across different
	// banks/statements (e.g. "TARGET" vs "Target") is treated as one key; the
	// per-transaction "was this edited" check stays case-sensitive, since a
	// pure case fix (e.g. "TARGET" -> "Target") is itself a legitimate rename
	// to capture, not something to skip as unedited.
	type keyGroup struct {
		displayKey string
		variants   map[string]int
	}
	groups := make(map[string]*keyGroup)
	for rows.Next() {
		var originalMerchant, merchant string
		if err := rows.Scan(&originalMerchant, &merchant); err != nil {
			return nil, nil, fmt.Errorf("failed to scan transaction: %w", err)
		}
		key := CleanMerchantName(originalMerchant)
		if merchant == key {
			continue // unedited, nothing to migrate
		}
		if covering := resolveMerchantMapping(key, existingMappings); covering != nil && merchant == covering.MappedMerchant {
			continue // already covered by an existing (e.g. wildcard) mapping, nothing to migrate
		}
		normalizedKey := strings.ToLower(key)
		group, ok := groups[normalizedKey]
		if !ok {
			group = &keyGroup{displayKey: key, variants: make(map[string]int)}
			groups[normalizedKey] = group
		}
		group.variants[merchant]++
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("error iterating transactions for scan: %w", err)
	}

	migrated := make([]MigratedMapping, 0)
	conflicts := make([]MappingConflict, 0)

	for _, group := range groups {
		if len(group.variants) == 1 {
			for merchant := range group.variants {
				_, applied, err := UpsertMerchantMapping(databaseID, group.displayKey, merchant)
				if err != nil {
					return nil, nil, err
				}
				migrated = append(migrated, MigratedMapping{
					OriginalMerchant: group.displayKey,
					MappedMerchant:   merchant,
					AppliedCount:     applied,
				})
			}
			continue
		}

		variantList := make([]VariantCount, 0, len(group.variants))
		for merchant, count := range group.variants {
			variantList = append(variantList, VariantCount{Merchant: merchant, Count: count})
		}
		sort.Slice(variantList, func(i, j int) bool { return variantList[i].Count > variantList[j].Count })

		conflicts = append(conflicts, MappingConflict{
			OriginalMerchant: group.displayKey,
			Variants:         variantList,
		})
	}

	sort.Slice(migrated, func(i, j int) bool { return migrated[i].OriginalMerchant < migrated[j].OriginalMerchant })
	sort.Slice(conflicts, func(i, j int) bool { return conflicts[i].OriginalMerchant < conflicts[j].OriginalMerchant })

	return migrated, conflicts, nil
}
