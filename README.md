# Finance Tracker

A lightweight personal finance tracker with a vanilla JavaScript frontend and Go backend. Manage multiple databases, import bank CSVs, categorize expenses, split costs between people, and analyze spending over time.

## Features

- **Multiple Databases**: Create and switch between separate finance databases
- **CSV Import**: Import transactions from bank statements with custom column-mapping templates; transactions matching an existing date + merchant + amount are flagged as "Possible Duplicate" for user review rather than silently skipped
- **CSV Export**: Export reviewed transactions to CSV with optional date range filtering
- **Manual Transactions**: Add one-off transactions directly from the Transactions page; source defaults to "Manual" but can be set to any existing source in the database
- **Transaction Review**: One-by-one workflow to categorize, rename merchants, and split costs
- **Bulk Editing**: Select multiple transactions and bulk-update category or reviewed status
- **Categories**: Custom categories with colors and emojis
- **Transaction Splitting**: Split costs between multiple people with dollar or percentage amounts; owner auto-split recalculates as remainder
- **Analytics**: Spending over time, by category, and by source — charts with per-person filtering
- **Search & Filter**: Filter by category, person, date range, and amount range
- **Backup & Restore**: Create JSON backups of any database from Settings; restore to a new database from any saved backup
- **Data Persistence**: All data in SQLite via a RESTful Go backend; nothing in localStorage

## Getting Started

### Prerequisites

- Go 1.21+ ([Download](https://go.dev/dl/))
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)

### Running

```bash
go run .                                          # development
go build -o finance-tracker && ./finance-tracker  # production binary
# Open http://localhost:8080
```

### Setup walkthrough

1. **Create a database** on the landing page
2. **Set your name** in Settings → Database Settings (required for the review workflow)
3. **Create a CSV template** in Settings → Manage Templates — map your bank's column headers and date format; set debit sign if amounts are negative
4. **Import transactions** via Dashboard → Import CSV
5. **Create categories** in Settings → Manage Categories
6. **Review transactions** via Dashboard → Review Transactions — assign categories, edit merchants, split costs
7. **View & analyze** via the Transactions and Analytics pages

## Architecture

### Frontend
- Vanilla JS (ES6 modules), custom CSS, no build tools
- Static files embedded in the Go binary via `embed.FS`
- `AppState.requireActiveDatabase()` guard on all pages except landing
- `localStorage` holds only the active database ID; all data lives in SQLite

### Backend
- Go `net/http` server on `localhost:8080`
- SQLite at `~/.finance-tracker/data.db`
- Daily logs at `~/.finance-tracker/logs/server-YYYY-MM-DD.log`

### Project Structure

```
finance/
├── main.go          # HTTP server, routing, handlers
├── database.go      # SQLite schema and CRUD
├── backup.go        # Backup/restore logic
├── go.mod / go.sum
└── static/          # Embedded frontend
    ├── *.html       # index, dashboard, transactions, review, settings, analytics
    ├── css/         # reset, variables, global, components, modals, table, per-page
    └── js/
        ├── core/        # api.js, state.js, storage.js, database.js
        ├── utils/       # helpers.js, validators.js, date-formatter.js, csv-parser.js
        ├── components/  # modal.js, notification.js, table.js
        └── pages/       # per-page modules

~/.finance-tracker/
├── data.db
├── backups/         # JSON backup files
└── logs/server-YYYY-MM-DD.log
```

## API Endpoints

```
GET/POST           /api/databases
GET/DELETE         /api/databases/:id

GET/POST           /api/databases/:id/categories
DELETE             /api/databases/:id/categories/:categoryId

GET/POST           /api/databases/:id/transactions
POST               /api/databases/:id/transactions/import
GET                /api/databases/:id/transactions/export?start&end&filename
PUT/DELETE         /api/databases/:id/transactions/:transactionId

GET/POST           /api/databases/:id/templates
DELETE             /api/databases/:id/templates/:templateId

GET/PUT            /api/databases/:id/settings
POST               /api/databases/:id/backup

GET                /api/backups
DELETE             /api/backups/:filename
POST               /api/backups/:filename/restore
```

## Data Models

```javascript
// Transaction
{ id, date, merchant, originalMerchant, amount, categoryId,
  splits,      // [{ personName, amount }] — stored as JSON string
  reviewed,    // true = visible on Transactions page
  notes, source, importedAt, possibleDuplicate }
// source: template name for CSV imports; "Manual" for manually added (selectable from existing sources)
// possibleDuplicate: flagged during import when date + originalMerchant + amount matches an existing transaction

// Category
{ id, name, color, emoji, createdAt }

// Template
{ id, name, dateColumn, merchantColumn, amountColumn, dateFormat,
  debitSign }  // "positive" | "negative" — if "negative", amounts * -1 on import

// DatabaseSettings
{ databaseId, ownerName }
```

## CSV Import

Templates map your bank's column headers to the expected fields. Supported date formats: `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `M/D/YYYY`. Set `debitSign` to `"negative"` if your bank exports expenses as negative numbers.

## Splits

The first split is always the owner (auto) — its amount equals the transaction total minus all other splits and updates live. Additional splits can be entered as a dollar amount or percentage. Splits are saved as a JSON array on the transaction.

## Backup & Restore

From **Settings → Backup & Restore**, click **Create Backup** to snapshot the current database (categories, transactions, templates, settings) to `~/.finance-tracker/backups/`. Each backup is a self-contained JSON file. Click **Restore** on any backup to create a new database from it — the original is not modified.

## Known Limitations

- No authentication (localhost only)
- Analytics includes income in totals (uses `Math.abs`)

## License

MIT
