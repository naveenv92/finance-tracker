# CLAUDE.md - Finance Tracker Project Context

## Project Overview

**Finance Tracker** is a personal finance app (vanilla JS + Go + SQLite). Users import bank CSVs, categorize transactions, split costs between people, and manage multiple finance databases.

**Status**: ✅ Fully implemented. Go backend on `localhost:8080`, SQLite at `~/.finance-tracker/data.db`, all frontend assets embedded in binary.

**Stack**: Vanilla JS (ES6 modules), Custom CSS, Go 1.21+ (net/http), SQLite3

## Architecture

### Module Organization
```
static/
├── js/
│   ├── core/       # storage.js, database.js, state.js, api.js
│   ├── utils/      # helpers.js, validators.js, date-formatter.js, csv-parser.js
│   ├── components/ # modal.js, notification.js, table.js
│   └── pages/      # landing.js, dashboard.js, transactions.js, review.js, settings.js, analytics.js
└── css/            # reset, variables, global, components, modals, table, per-page styles
```

### File Structure
```
finance/
├── static/         # Embedded frontend (embed.FS)
├── main.go         # HTTP server, routing, handlers
├── database.go     # SQLite CRUD, schema
├── backup.go       # Backup/restore logic
└── go.mod

~/.finance-tracker/
├── data.db
├── backups/        # JSON backup files
└── logs/server-YYYY-MM-DD.log
```

### Design Patterns
- ES6 Modules with explicit imports
- Static classes: `DatabaseManager`, `StorageManager`, `AppState`
- Instantiable components: `Modal`, `Notification`, `Table`
- `AppState.requireActiveDatabase()` guard on all pages except landing
- localStorage holds only `financeTracker:activeDb` (session pointer); all data in SQLite

## Data Models

```javascript
// Database
{ id, name, createdAt, lastModified }

// Transaction
{ id, date, merchant, originalMerchant, amount, categoryId, splits, reviewed, importedAt, notes, source }
// splits: [{ personName, amount }] — stored as JSON string in SQLite
// source: name of CSV template used during import

// Category
{ id, name, color, emoji, createdAt }

// Template
{ id, name, dateColumn, merchantColumn, amountColumn, dateFormat, debitSign, createdAt }
// debitSign: "positive" | "negative" — if "negative", amounts * -1 on import

// DatabaseSettings
{ databaseId, ownerName }
```

## API Endpoints

```
GET    /api/databases
POST   /api/databases
GET    /api/databases/:id
DELETE /api/databases/:id

GET    /api/databases/:id/categories
POST   /api/databases/:id/categories
DELETE /api/databases/:id/categories/:categoryId

GET    /api/databases/:id/transactions
POST   /api/databases/:id/transactions
POST   /api/databases/:id/transactions/import        (bulk import, dedup by date|merchant|amount)
GET    /api/databases/:id/transactions/export        (?start=&end=&filename=)
PUT    /api/databases/:id/transactions/:transactionId
DELETE /api/databases/:id/transactions/:transactionId

GET    /api/databases/:id/templates
POST   /api/databases/:id/templates
DELETE /api/databases/:id/templates/:templateId

GET    /api/databases/:id/settings
PUT    /api/databases/:id/settings

POST   /api/databases/:id/backup                     (creates JSON backup)
GET    /api/backups                                  (list all backups)
DELETE /api/backups/:filename
POST   /api/backups/:filename/restore                (creates new DB from backup)
```

## State Management (async)

```javascript
await AppState.setActiveDatabase(dbId);   // verifies via backend
const db = await AppState.getActiveDatabase(); // fetches from backend
const id = AppState.getActiveDatabaseId(); // sync, reads localStorage
AppState.requireActiveDatabase();          // sync guard, redirects to index.html
```

## Key Features & Implementation Notes

### Review Page
- Requires `ownerName` in settings; redirects to settings if unset
- First split is auto (owner, 100%, `data-auto="true"`, readonly) — recalculates live as other splits change
- New splits default to Percentage type, pre-filled with `100 / totalPeople`%
- `getSplitsFromForm` handles auto splits (no typeSelect) by reading dollar amount directly

### Transactions Page
- Shows only `reviewed === true` transactions
- Filters: Category + Person (row 1), Start/End Date (row 2), Amount slider (row 3)
- Person filter shows individual split amount; `(split)` label when >1 person in splits
- "+" button opens Add Transaction modal: date, merchant, amount, category, notes, splits; `source: "Manual"`, `reviewed: true`
- Split behavior matches Review page: first split is auto (owner, `data-auto="true"`, readonly, recalculates as remainder); additional splits have dollar/percentage type selector
- `ownerName` loaded at init from settings; pre-filled as auto split in both Add and Edit modals
- Bulk editing: checkbox column selects rows; action bar appears to bulk-set category or reviewed status

### Analytics Page (Chart.js CDN)
- Stats: Total Spent Lifetime, Total Spent This Month, Avg/Day Lifetime, Avg/Day This Month (2×2 layout)
  - Lifetime avg/day: total / days between min and max transaction date
  - Monthly avg/day: month total / days between min and max transaction date in that month
- Spending Over Time: grouped bar chart, last 12 calendar months; left axis = total spent, right axis = avg/day (total / days in that calendar month)
- By Category: stacked bar chart, last 12 months, one dataset per category; interactive checkbox legend to toggle categories
- By Source: same as By Category but grouped by transaction source
- Filter: Person only — applies to all charts; uses individual split amount when person is selected; resets category/source toggles on change
- All amounts use `Math.abs()`; chart instances stored in `chartInstances` map, destroyed before re-render
- `disabledCategories` / `disabledSources` (module-level Sets) track toggled-off labels; stable color assignment based on sorted label order

### CSV Import / Export
- Template maps date/merchant/amount columns + date format + debit sign
- `debitSign === "negative"` → multiply all amounts by `-1`
- Sets `source` field to template name on each transaction
- Supported date formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, M/D/YYYY
- Import deduplicates by `date|originalMerchant|amount` fingerprint
- Export: `GET /api/databases/:id/transactions/export` streams a CSV of reviewed transactions; optional `start`/`end` date params

### Backup & Restore
- `POST /api/databases/:id/backup` writes `~/.finance-tracker/backups/{name}-{timestamp}.json` containing all categories, transactions, templates, and settings
- `POST /api/backups/:filename/restore` creates a new database (named `{original} (Restored)`), remapping category IDs in transactions
- Filenames are sanitised; path traversal is rejected
- UI lives in Settings page; lists all backups across all databases

### Modal Component
- Supports async submit handlers (`await`)
- Returns `false` from handler to keep modal open (e.g., after category creation)
- Updates content in place via `modal.updateContent()` (no stacking)

### Split Validation
- Auto split always first; amount = transaction total minus sum of non-auto splits
- Splits serialized as JSON string before sending to backend
- Dollar ↔ percentage auto-conversion when switching type

## Running the Server

```bash
go run .              # development (http://localhost:8080)
go build -o finance-tracker && ./finance-tracker  # production binary
```

## Debugging

```bash
# Check server
curl http://localhost:8080/api/databases

# SQLite inspection
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM databases;"
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM transactions WHERE database_id = 'some-uuid';"

# Logs
tail -f ~/.finance-tracker/logs/server-$(date +%Y-%m-%d).log
```

```javascript
// Browser console
localStorage.getItem('financeTracker:activeDb')   // check session
localStorage.removeItem('financeTracker:activeDb') // clear session
```

**Common issues**:
- Port 8080 in use: `lsof -i :8080`
- Dashboard redirects: server down or DB deleted
- Review shows no transactions: ensure `reviewed` flag set; may need re-import
- Async errors: all `AppState.setActiveDatabase()` / `getActiveDatabase()` calls need `await`
- Analytics shows $0: removed `amount < 0` filter; uses `Math.abs()` now ✅

## Known Limitations

1. No authentication (localhost only)
2. Analytics includes income in spending totals (uses `Math.abs`)

## Next Steps

- [ ] Authentication (JWT) for multi-user support
- [ ] Budget tracking / month-over-month analytics
- [ ] Recurring transaction templates

## Code Style

- ES6+: const/let, arrow functions, template literals
- Static methods for utilities, instance methods for stateful components
- Validate at function boundaries; comment complex logic only
- Keep files under 500 lines; prefer composition over inheritance

---
**Last Updated**: 2026-03-08 | **Status**: ✅ Active development
