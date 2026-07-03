# CLAUDE.md - Finance Tracker Project Context

## Project Overview

**Finance Tracker** — personal finance app (vanilla JS + Go + SQLite). Import bank CSVs, categorize transactions, split costs between people, manage multiple databases.

**Stack**: Vanilla JS (ES6 modules), Custom CSS, Go 1.21+ (net/http), SQLite3
**Server**: `localhost:8080` | **DB**: `~/.finance-tracker/data.db` | frontend assets embedded in binary

## Architecture

```
finance/
├── main.go       # HTTP server, routing, handlers
├── database.go   # SQLite schema + CRUD
├── backup.go     # Backup/restore logic
└── static/       # Embedded frontend (embed.FS)
    ├── *.html    # index, dashboard, transactions, review, settings, analytics
    ├── css/      # reset, variables, global, components, modals, table, per-page
    └── js/
        ├── core/       # api.js, state.js, storage.js, database.js
        ├── utils/      # helpers.js, validators.js, date-formatter.js, csv-parser.js
        ├── components/ # modal.js, notification.js, table.js
        └── pages/      # landing, dashboard, transactions, review, settings, analytics

~/.finance-tracker/
├── data.db
├── backups/      # JSON backup files
└── logs/server-YYYY-MM-DD.log
```

**Design patterns**: ES6 modules, static classes (`DatabaseManager`, `StorageManager`, `AppState`), instantiable components (`Modal`, `Notification`, `Table`). `AppState.requireActiveDatabase()` guard on all pages except landing. `localStorage` holds only `financeTracker:activeDb`; all data in SQLite.

## Data Models

```javascript
{ id, name, createdAt, lastModified }                          // Database
{ id, date, merchant, originalMerchant, amount, categoryId,   // Transaction
  splits,            // [{ personName, amount }] — JSON string in SQLite
  reviewed,          // true = visible on Transactions page
  notes, source, importedAt, possibleDuplicate }
{ id, name, color, emoji, createdAt }                         // Category (delete nulls categoryId on transactions)
{ id, name, dateColumn, merchantColumn, amountColumn,         // Template
  dateFormat, debitSign, ownerName, createdAt }  // debitSign: "positive"|"negative"; ownerName overrides DatabaseSettings' ownerName for transactions from this template
{ databaseId, ownerName, defaultSplitPerson }                  // DatabaseSettings
```

## API Endpoints

```
GET/POST            /api/databases
GET/DELETE          /api/databases/:id

GET/POST            /api/databases/:id/categories
PUT/DELETE          /api/databases/:id/categories/:categoryId

GET/POST            /api/databases/:id/transactions
POST                /api/databases/:id/transactions/import        (bulk; dedup by date|merchant|amount)
GET                 /api/databases/:id/transactions/export        (?start=&end=&filename=)
PUT/DELETE          /api/databases/:id/transactions/:transactionId

GET/POST            /api/databases/:id/templates
DELETE              /api/databases/:id/templates/:templateId

GET/PUT             /api/databases/:id/settings
POST                /api/databases/:id/backup

GET                 /api/backups
DELETE              /api/backups/:filename
POST                /api/backups/:filename/restore
```

## State Management

```javascript
await AppState.setActiveDatabase(dbId);    // verifies via backend
const db = await AppState.getActiveDatabase(); // fetches from backend
const id = AppState.getActiveDatabaseId(); // sync, reads localStorage
AppState.requireActiveDatabase();          // sync guard, redirects to index.html
```

## Key Implementation Notes

**Review page**: Requires `ownerName` in settings (redirects if unset). First split is auto (owner, readonly, recalculates as remainder) — its person name is the transaction's template `ownerName` (matched by `transaction.source` === template name) if the template set one, otherwise the database's `ownerName` setting. New splits (index > 0) default to percentage, pre-filled with `100 / totalPeople`% and the database's `defaultSplitPerson` setting for the name. `getSplitsFromForm` reads auto split dollar amount directly.

**Transactions page**: Shows only `reviewed === true`. Filters: Category + Person / Date range / Amount slider. Person filter shows individual split amount with `(split)` label. "+" button adds manual transaction (`reviewed: true`, source defaults to "Manual"). Bulk editing via checkbox column → action bar for category/reviewed.

**Categories (Manage Categories modal)**: Click a category badge to open an Edit/Delete popup menu. Edit pre-fills the bottom form and switches submit to "Save Changes". Cancel reverts to create mode. Deleting a category nulls it on all transactions. `setupCategoryItemListeners` must be called **after** `modal.show()` so the DOM exists.

**Themes**: Four themes (Default, Vibrant, Pastel, Dark) stored in `localStorage` as `financeTracker:theme`. Applied via `data-theme` attribute on `<html>`. Picker lives in Settings.

**Analytics (Chart.js CDN)**: Stats: Total/Monthly Spent + Avg/Day (2×2). Charts: Spending Over Time (grouped bar, last 12 months), By Category (stacked bar), By Source (stacked bar). Person filter applies to all charts. `Math.abs()` on all amounts. Chart instances in `chartInstances` map, destroyed before re-render. `disabledCategories`/`disabledSources` Sets track toggled-off labels.

**CSV import**: Template maps columns + date format + debit sign. Duplicates detected by `date|originalMerchant|amount` fingerprint — imported with `possibleDuplicate: true` (warning banner on Review page). Supported date formats: `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `M/D/YYYY`.

**Backup/Restore**: JSON snapshots at `~/.finance-tracker/backups/`. Restore creates a new DB (`{name} (Restored)`) remapping category IDs. Path traversal rejected. UI in Settings, lists all backups across all databases.

**Modal component**: Async submit handlers; return `false` to keep open. `modal.updateContent()` replaces body HTML in place (no stacking). `modal.setSubmitText()` updates footer button.

**Splits**: Auto split always first; amount = total − sum of non-auto splits. Dollar ↔ percentage conversion on type switch. Serialized as JSON string before sending to backend.

## Running

```bash
go run .                                          # dev (http://localhost:8080)
go build -o finance-tracker && ./finance-tracker  # production binary
```

## Debugging

```bash
curl http://localhost:8080/api/databases
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM transactions WHERE database_id = 'uuid';"
tail -f ~/.finance-tracker/logs/server-$(date +%Y-%m-%d).log
# Browser: localStorage.getItem('financeTracker:activeDb')
```

**Common issues**: Port conflict → `lsof -i :8080`. Dashboard redirects → server down or DB deleted. Review empty → `reviewed` flag not set. Async errors → missing `await` on `AppState` calls.

## Known Limitations

- No authentication (localhost only)
- Analytics includes income in totals (`Math.abs`)

## Code Style

ES6+: const/let, arrow functions, template literals. Static methods for utilities, instance methods for stateful components. Validate at function boundaries. Files under 500 lines; composition over inheritance.

---
**Last Updated**: 2026-03-09 | **Status**: ✅ Active development
