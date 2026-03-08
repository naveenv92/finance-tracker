# CLAUDE.md - Finance Tracker Project Context

## Project Overview

**Finance Tracker** is a standalone HTML/CSS/JavaScript personal finance application built with vanilla JavaScript (no frameworks). It allows users to import bank CSV files, categorize transactions, split costs between people, and manage multiple finance databases.

**Current Status**: ✅ **FULLY IMPLEMENTED AND FUNCTIONAL**

**Technology Stack**:
- **Frontend**: Vanilla JavaScript (ES6+ modules), Custom CSS
- **Backend**: Go 1.21+ with net/http, SQLite3
- **Data Persistence**: SQLite database (migrated from localStorage)
- **API**: RESTful JSON API

## Implementation Status

### ✅ Completed (100%)

All planned features have been implemented:

1. **Phase 1: Foundation** ✅
   - Complete folder structure
   - CSS reset, variables, and global styles
   - All utility functions (helpers, validators, date formatter, CSV parser)
   - Data models defined

2. **Phase 2: Core Systems** ✅
   - StorageManager: localStorage abstraction
   - DatabaseManager: Full CRUD for all entities
   - AppState: Global state with event system
   - CSV parsing with robust edge case handling
   - Date formatting with multiple format support

3. **Phase 3: UI Components** ✅
   - Modal: Reusable dialog system with form handling
   - Notification: Toast-style notifications with auto-dismiss
   - Table: Dynamic sortable tables with pagination

4. **Phase 4: Pages** ✅
   - Landing page: Database selection/creation
   - Dashboard: Stats + action cards + CSV import
   - Transactions: Sortable table with search/filter
   - Review: One-by-one review workflow

5. **Phase 5: Features** ✅
   - CSV import flow with template selection
   - Template management (create/delete)
   - Category management (create/delete with usage tracking)
   - Transaction editing with splits
   - Split management with total validation
   - Split by dollar amount or percentage (0-100%)

6. **Phase 6: Polish** ✅
   - Responsive design
   - Error handling and validation
   - Loading states
   - User feedback via notifications
   - README documentation

7. **Phase 7: Backend Integration** ✅
   - Go server with net/http
   - SQLite database with proper schema
   - RESTful API for all entities (databases, categories, transactions, templates)
   - Frontend API client (static/js/core/api.js)
   - All pages fully migrated to backend API
   - Database create/load/delete working with SQLite
   - Async state management for API calls
   - Modal component supports async submit handlers
   - Bulk CSV import via `POST /api/databases/:id/transactions/import`
   - Fixed: Dashboard redirect issue (was looking in localStorage instead of SQLite)
   - Fixed: Modal stacking issue (now updates content in place)
   - Fixed: Empty array serialization (nil slices now return [])
   - Fixed: Modal stays open after category creation
   - Fixed: Review page category dropdown population

## Recent Updates & Bug Fixes

### App Data Directory: Moved to ~/.finance-tracker/ (2026-02-05) ✅

**Changes**: Reorganized data storage to use a dedicated app directory in the user's home folder:
- Database moved from `./finance.db` to `~/.finance-tracker/data.db`
- Added automatic creation of `~/.finance-tracker/` directory
- Server logs now written to `~/.finance-tracker/logs/server-YYYY-MM-DD.log`
- Logs output to both console and daily log files
- Prepared structure for future backups and config files

**Benefits**:
- Database location is consistent regardless of where binary is run
- Follows Unix conventions for application data (dotfile in home directory)
- Easy to find and backup user data
- Doesn't clutter working directory
- Logs are persistently stored and organized by date

### Structural Refactor: Static Files Organization (2026-02-05) ✅

**Changes**: Reorganized project structure to consolidate all frontend files into a `static/` directory:
- Moved all HTML files to `static/` folder
- Moved `css/` and `js/` folders inside `static/` folder
- Updated `main.go` to use `embed.FS` to embed static files into the binary
- Files are now served from embedded filesystem instead of direct file access

**Benefits**:
- Cleaner project root directory
- Single binary distribution includes all frontend assets
- Better separation between backend Go code and frontend files
- Simpler deployment (just distribute the compiled binary)

### Style Fix: Split Form Input Consistency (2026-02-05) ✅

**Problem**: On the review page, the "Amount Type" dropdown (Dollar Amount / Percentage) had proper `.form-select` styling (border, padding, border-radius) but the adjacent Person Name and Amount inputs were missing the `.form-input` class, causing them to use browser default styles and look inconsistent.

**Solution**: Added `form-input` class to `split-name`, `split-amount`, and `split-percentage` inputs in both `renderSplitsList()` and `addSplit()` in `static/js/pages/review.js`.

**Result**: All split form fields now share consistent styling. ✅

### Feature: Split Transaction by Dollar or Percentage (2026-02-05) ✅

Added ability to split transactions using either dollar amounts or percentages (0-100%). Each split has an "Amount Type" selector, dual input fields, and auto-conversion between types. Final storage always uses dollar amounts.

### Bug Fixes (2026-02-05) ✅

- **Empty categories array returns null**: Go nil slices serialized to JSON `null` instead of `[]`. Fixed by using `make([]*Category, 0)` in `database.go`.
- **Modal closes after creating category**: Modal's `handleSubmit()` was synchronous but submit handler was async. Fixed by making `handleSubmit()` async with `await`.
- **Categories not showing in review page**: Review page used `DatabaseManager.getCategories()` (localStorage) instead of `CategoryAPI.getAll()` (backend). Fixed by adding `CategoryAPI` import and async `loadCategories()`.
- **Dashboard redirect loop**: Dashboard called `DatabaseManager.getDatabase()` (localStorage) instead of fetching from backend. Fixed by making `AppState.getActiveDatabase()` async and fetching from backend API.
- **Modal stacking issue**: Closing and reopening modals caused stacking. Fixed by updating modal content in place via `modal.updateContent()`.

### Feature: Categories Migrated to SQLite Backend (2026-02-05) ✅

Backend: Added `Category` struct, `CreateCategory()`/`GetCategories()`/`DeleteCategory()` functions, and nested routing `/api/databases/:id/categories`. Frontend: Updated `dashboard.js` and `review.js` to use `CategoryAPI` instead of `DatabaseManager` for all category operations.

### Full Backend Migration: Review Page, Dashboard, Templates (2026-03-06) ✅

**Changes**:
- **`database.go`**: Added `Template` struct and `CreateTemplate()`/`GetTemplates()`/`GetTemplate()`/`DeleteTemplate()` functions
- **`main.go`**: Added `GET/POST /api/databases/:id/templates`, `DELETE /api/databases/:id/templates/:id`, and `POST /api/databases/:id/transactions/import` (bulk import) routes
- **`dashboard.js`**: Fully migrated to backend — `renderStats()` is now async and fetches from `TransactionAPI`/`CategoryAPI`/`TemplateAPI` in parallel; template management uses `TemplateAPI`; CSV import uses `TransactionAPI.importMany()`
- **`review.js`**: Fully migrated to backend — `loadUnreviewedTransactions()` now uses `TransactionAPI.getAll()` filtered by `!reviewed`; `saveTransaction()` uses `TransactionAPI.update()` with splits JSON-stringified; removed all `DatabaseManager` usage

**Result**: All localStorage usage for application data is eliminated. The only remaining localStorage key is `financeTracker:activeDb` (the active database ID, used as a lightweight session pointer — the full database object is always fetched from the backend).

### Feature: Delete Transaction from Review Page (2026-03-07) ✅

Added a "Delete" button to the review card (bottom-left, styled `btn-danger`). Clicking it confirms via `confirm()`, calls `TransactionAPI.delete()`, removes the transaction from the local array, and re-renders. Handles edge case where deleted transaction was the last one (shows "All Caught Up!" message).

### Feature: View Transactions Shows Only Reviewed Transactions (2026-03-07) ✅

`transactions.js` now filters `allTransactions` to only include `reviewed === true` after fetching. The "Status" filter dropdown was removed since it is no longer relevant. Page description updated to clarify only reviewed transactions are shown.

### Feature: Template Debit Sign (2026-03-07) ✅

Templates now store a `debitSign` field (`"positive"` or `"negative"`, default `"positive"`). During CSV import, if `debitSign === "negative"` all parsed amounts are multiplied by `-1`. The template creation form includes radio buttons to select the convention. Existing templates list shows the debit sign alongside column names.

**Changes**:
- **`database.go`**: Added `DebitSign string` to `Template` struct; added `debit_sign TEXT NOT NULL DEFAULT 'positive'` column to the `templates` schema; updated `CreateTemplate`, `GetTemplates`, `GetTemplate` to include the field
- **`dashboard.js`**: Radio buttons added to template form; import logic applies `* -1` when `debitSign === 'negative'`

### Feature: Emoji Picker for Category Creation (2026-03-07) ✅

Replaced the free-text emoji input in the category creation form with a curated grid picker. The input is now readonly; users select an emoji from ~100 options across 10 categories (Food & Drink, Transport, Shopping, Home, Health, Entertainment, Finance, Utilities, People, Other) or clear the selection. The picker closes when clicking outside.

**Changes**:
- **`dashboard.js`**: Added `toggleEmojiPicker()`, `selectEmoji()`, `clearEmoji()` global functions; replaced emoji text input with picker button + dropdown grid; added click-outside listener (registered once via `emojiPickerListenerAdded` guard)

### Feature: Amount Range Slider Filter on View Transactions (2026-03-07) ✅

Added a dual-range slider to the transactions filter bar for filtering by transaction amount. The slider range is $0 to the max absolute transaction amount in the DB (rounded up). Dragging either handle updates the visible range label and filters the table live. Filters by absolute value so both expenses and income are covered.

**Changes**:
- **`transactions.js`**: Added `maxAmount` module variable; compute max after loading; added dual-range slider HTML to `renderFilters`; added `updateRangeFill()` and event listeners; added amount filter logic to `filterTransactions`
- **`transactions.css`**: Added `.amount-filter`, `.range-slider-wrapper`, `.range-track`, `.range-fill`, `.range-input` styles with cross-browser thumb support (WebKit + Firefox)

### Feature: Date Range Filter on View Transactions (2026-03-07) ✅

Added Start Date and End Date inputs to the transactions filter bar using native `<input type="date">`, which opens the browser's built-in calendar picker. Default state (both empty) shows all transactions. Either field can be set independently.

**Changes**:
- **`transactions.js`**: Added Start Date and End Date `<input type="date">` fields to `renderFilters`; added `change` listeners; added date filter logic to `filterTransactions` (YYYY-MM-DD string comparison)

### Feature: Transaction Source Field (2026-03-07) ✅

Transactions now store a `source` field set to the name of the CSV template used during import. Displayed as a "Source" column on the View Transactions page (shows `—` if absent).

**Changes**:
- **`database.go`**: Added `Source string` to `Transaction` struct; added `source TEXT` column to the `transactions` schema; updated `CreateTransaction`, `GetTransactions`, `GetTransaction` to include the field
- **`dashboard.js`**: Sets `source: template.name` on each transaction during CSV import
- **`transactions.js`**: Added "Source" column to the transactions table

## Key Architecture Decisions

### Data Storage
- **localStorage keys**: `financeTracker:{dbId}:{dataType}`
- **Global keys**: `financeTracker:databases`, `financeTracker:activeDb`
- All data stored as JSON
- No external dependencies

### Module Organization
```
static/
├── js/
│   ├── core/          # Core business logic (storage, database, state)
│   ├── utils/         # Pure functions (parsing, formatting, validation)
│   ├── components/    # Reusable UI components
│   └── pages/         # Page-specific controllers
└── css/               # Stylesheets
```

### Design Patterns
- **ES6 Modules**: All JS files are modules with explicit imports
- **Static Classes**: DatabaseManager, StorageManager, AppState use static methods
- **Component Pattern**: Modal, Notification, Table are instantiable classes
- **Event System**: AppState emits events for state changes
- **Guard Pattern**: `AppState.requireActiveDatabase()` redirects if no active DB

### CSS Architecture
- **CSS Variables**: All colors, spacing, typography defined in variables.css
- **Component-based**: Reusable component classes (.btn, .card, .form-group, etc.)
- **Page-specific styles**: Separate CSS files for each page
- **No preprocessor**: Pure CSS with custom properties

## File Structure Overview

### Project Root
```
finance/
├── static/              # Frontend files (embedded in binary via embed.FS)
│   ├── *.html          # 4 HTML pages
│   ├── css/            # 10 CSS files
│   └── js/             # 15 JavaScript modules
├── main.go             # HTTP server and routing
├── database.go         # SQLite operations
├── go.mod              # Go dependencies
├── README.md           # User documentation
├── BACKEND.md          # Backend documentation
└── CLAUDE.md           # This file

~/.finance-tracker/     # App data directory (created at runtime)
├── data.db             # SQLite database
├── logs/               # Server logs
│   └── server-YYYY-MM-DD.log  # Daily log files
├── backups/            # Database backups (future)
└── config/             # Configuration files (future)
```

### HTML Pages (4 files in `static/`)
- `static/index.html` - Landing/database selection
- `static/dashboard.html` - Main hub with stats and actions
- `static/transactions.html` - Table view of all transactions
- `static/review.html` - One-by-one review interface

### CSS Files (10 files in `static/css/`)
- `static/css/reset.css` - CSS reset
- `static/css/variables.css` - Design tokens
- `static/css/global.css` - Global styles, layout, typography
- `static/css/components.css` - Buttons, cards, forms, badges
- `static/css/modals.css` - Modal overlay and container
- `static/css/table.css` - Data table styles
- `static/css/pages/landing.css` - Landing page specific
- `static/css/pages/dashboard.css` - Dashboard specific
- `static/css/pages/transactions.css` - Transactions page specific
- `static/css/pages/review.css` - Review page specific

### JavaScript Files (15 files in `static/js/`)

**Core (4 files)**:
- `static/js/core/storage.js` - localStorage CRUD with prefix management
- `static/js/core/database.js` - Business logic for all entities (localStorage-based, being phased out)
- `static/js/core/state.js` - Active database state + event system (now with async API support)
- `static/js/core/api.js` - Backend API client with fetch wrappers

**Utils (4 files)**:
- `static/js/utils/helpers.js` - UUID, currency formatting, merchant cleaning, etc.
- `static/js/utils/validators.js` - Input validation functions
- `static/js/utils/date-formatter.js` - Date parsing/formatting (4 formats supported)
- `static/js/utils/csv-parser.js` - CSV parsing with quoted field support

**Components (3 files)**:
- `static/js/components/modal.js` - Modal dialog system
- `static/js/components/notification.js` - Toast notifications
- `static/js/components/table.js` - Sortable data table

**Pages (4 files)**:
- `static/js/pages/landing.js` - Database CRUD (fully migrated to backend API)
- `static/js/pages/dashboard.js` - Stats, import, templates, categories (fully migrated to backend API)
- `static/js/pages/transactions.js` - Transaction table with filters (fully migrated to backend API)
- `static/js/pages/review.js` - Review workflow (fully migrated to backend API)

**Documentation (2 files)**:
- `README.md` - User-facing documentation
- `BACKEND.md` - Backend setup and API documentation

### Backend Files (3 Go files)
- `main.go` - HTTP server, routing, handlers, and embedded static files
- `database.go` - SQLite operations, schema, CRUD functions
- `go.mod` - Go module dependencies

## Backend Architecture

### Go Server
The backend is a simple HTTP server using Go's standard library:
- **Router**: `net/http` with custom handlers
- **Database**: SQLite3 with mattn/go-sqlite3 driver stored in `~/.finance-tracker/data.db`
- **Static Files**: Embedded into binary using `embed.FS` from `static/` directory
- **API Endpoints**: RESTful JSON API under `/api/*`
- **Binary Distribution**: Single executable with all frontend assets embedded
- **Data Directory**: `~/.finance-tracker/` stores database, logs, and configs
- **Logging**: Daily log files written to `~/.finance-tracker/logs/server-YYYY-MM-DD.log`

### Database Schema
SQLite database with 4 tables:
- `databases` - Finance database metadata
- `transactions` - Transaction records (foreign key to databases)
- `categories` - Category definitions (foreign key to databases)
- `templates` - CSV import templates (foreign key to databases)

All tables use UUID primary keys and cascade deletes for referential integrity.

### API Endpoints Implemented

**Databases:**
- ✅ `GET /api/databases` - List all databases
- ✅ `POST /api/databases` - Create new database
- ✅ `GET /api/databases/:id` - Get database by ID
- ✅ `DELETE /api/databases/:id` - Delete database

**Categories:**
- ✅ `GET /api/databases/:id/categories` - List all categories for a database
- ✅ `POST /api/databases/:id/categories` - Create new category
- ✅ `DELETE /api/databases/:id/categories/:categoryId` - Delete category

**Transactions:**
- ✅ `GET /api/databases/:id/transactions` - List all transactions for a database
- ✅ `POST /api/databases/:id/transactions` - Create new transaction
- ✅ `POST /api/databases/:id/transactions/import` - Bulk import transactions from CSV
- ✅ `PUT /api/databases/:id/transactions/:transactionId` - Update transaction
- ✅ `DELETE /api/databases/:id/transactions/:transactionId` - Delete transaction

**Templates:**
- ✅ `GET /api/databases/:id/templates` - List all templates for a database
- ✅ `POST /api/databases/:id/templates` - Create new template
- ✅ `DELETE /api/databases/:id/templates/:templateId` - Delete template

### Running the Backend
```bash
# Install dependencies
go mod download

# Run the server (development)
go run .

# Build a standalone binary (production)
go build -o finance-tracker
./finance-tracker

# The binary includes all static files embedded
# Server starts on http://localhost:8080
```

**Benefits of Embedded Static Files**:
- Single executable contains all frontend assets (HTML, CSS, JS)
- No need to distribute separate frontend files
- Simpler deployment and distribution
- Frontend files are bundled at compile time from `static/` directory

### Frontend Integration
**Fully Migrated to Backend**:
- **Landing page** (`static/js/pages/landing.js`):
  - ✅ Database creation: `POST /api/databases`
  - ✅ Database listing: `GET /api/databases`
  - ✅ Database deletion: `DELETE /api/databases/:id`
  - ✅ Database opening: Validates via `GET /api/databases/:id`

- **Dashboard page** (`static/js/pages/dashboard.js`):
  - ✅ Database loading: `GET /api/databases/:id` (via AppState)
  - ✅ Displays database name from backend
  - ✅ Stats load from backend (`TransactionAPI`, `CategoryAPI`, `TemplateAPI` in parallel)
  - ✅ Category creation/listing/deletion via `CategoryAPI`
  - ✅ Template creation/listing/deletion via `TemplateAPI`
  - ✅ CSV import uses `TransactionAPI.importMany()` (bulk import)
  - ✅ Modal stays open after category/template creation (form resets)
  - ✅ Modal content updates in place (no stacking)

- **Transactions page** (`static/js/pages/transactions.js`):
  - ✅ Transaction loading: `GET /api/databases/:id/transactions`
  - ✅ Transaction updating: `PUT /api/databases/:id/transactions/:transactionId`
  - ✅ Category loading: `GET /api/databases/:id/categories`
  - ✅ All transaction operations use backend API
  - ✅ Splits stored as JSON string in database

- **Review page** (`static/js/pages/review.js`):
  - ✅ Transaction loading: `GET /api/databases/:id/transactions` (filtered by `!reviewed`)
  - ✅ Transaction saving: `PUT /api/databases/:id/transactions/:transactionId`
  - ✅ Category loading: `GET /api/databases/:id/categories`
  - ✅ Categories populate dropdown for transaction categorization
  - ✅ Split by dollar amount or percentage with auto-conversion
  - ✅ Amount type selector for each split (Dollar Amount / Percentage)
  - ✅ Splits serialized as JSON string before sending to backend

- **State Management** (`static/js/core/state.js`):
  - ✅ `setActiveDatabase()` - async, verifies via backend API
  - ✅ `getActiveDatabase()` - async, fetches from backend API
  - ✅ Active database ID stored in localStorage for quick access
  - ✅ Database object fetched from backend on demand

- **Modal Component** (`static/js/components/modal.js`):
  - ✅ Supports async submit handlers with `await`
  - ✅ Respects `false` return value to keep modal open
  - ✅ Stores button text before rendering

**localStorage Usage** (minimal — only session state):
- Active DB ID: `financeTracker:activeDb` — lightweight pointer; full database object always fetched from backend

## Data Models

### Database
```javascript
{
  id: "uuid",
  name: "Personal Finance 2026",
  createdAt: "ISO timestamp",
  lastModified: "ISO timestamp"
}
```

### Transaction
```javascript
{
  id: "uuid",
  date: "YYYY-MM-DD",
  merchant: "Starbucks",
  originalMerchant: "STARBUCKS #12345",
  amount: -5.75,  // negative = expense, positive = income
  categoryId: "uuid" | null,
  splits: [{ personName: "John", amount: -2.88 }],
  reviewed: false,
  importedAt: "ISO timestamp",
  notes: "",
  source: "Chase Sapphire"  // name of the CSV template used to import
}
```

### Category
```javascript
{
  id: "uuid",
  name: "Food & Dining",
  color: "#FF6B6B",
  emoji: "🍔",
  createdAt: "ISO timestamp"
}
```

### Template
```javascript
{
  id: "uuid",
  name: "Chase Sapphire",
  dateColumn: "Transaction Date",
  merchantColumn: "Description",
  amountColumn: "Amount",
  dateFormat: "MM/DD/YYYY",
  debitSign: "positive",  // "positive" or "negative" — whether debits appear as positive or negative in the CSV
  createdAt: "ISO timestamp"
}
```

## How to Test

### With Backend (Recommended)

1. **Start the backend server**:
   ```bash
   cd /Users/naveenvenkatesan/Desktop/finance
   go run .
   ```

2. **Open the app**: Navigate to http://localhost:8080 in a browser
2. **Create a database**: Click "Create Database", enter a name
3. **Create a template**: Dashboard → Manage Templates
   - Name: "Test Bank"
   - Date Column: "Date"
   - Merchant Column: "Description"
   - Amount Column: "Amount"
   - Format: MM/DD/YYYY
   - Debit Sign: Debits are positive (default)
4. **Create categories**: Dashboard → Manage Categories
   - Name: "Food", Color: #FF6B6B, Emoji: 🍔
   - Name: "Transport", Color: #4A90E2, Emoji: 🚗
5. **Create test CSV**: Save this as `test.csv`:
   ```csv
   Date,Description,Amount
   02/05/2026,STARBUCKS #12345,-5.75
   02/04/2026,UBER TRIP,-12.50
   02/03/2026,PAYCHECK,2500.00
   ```
6. **Import CSV**: Dashboard → Import CSV → Select file and template
7. **Review transactions**: Dashboard → Review Transactions
   - Edit merchant names
   - Assign categories
   - Add splits if needed
8. **View table**: View Transactions → Search, filter, sort, click rows

## Key User Flows

### Import Flow
1. User creates CSV template (one-time per bank)
2. User uploads CSV file
3. System parses CSV using template mappings
4. System creates transactions (unreviewed by default)
5. User reviews transactions one-by-one

### Review Flow
1. User navigates to Review page
2. System loads categories and unreviewed transactions from backend API
3. System shows first unreviewed transaction
4. User edits merchant name, assigns category from dropdown
5. User optionally adds splits:
   - Choose split type: Dollar Amount or Percentage
   - Enter person name and amount/percentage
   - Switch between types with auto-conversion
   - Add multiple people with "Add Person" button
6. User clicks "Save & Next" (marks reviewed), "Skip", or "Delete" (removes transaction entirely)
7. System advances to next unreviewed transaction
8. When complete, shows "All caught up!" message

### Transaction Table Flow
1. User navigates to Transactions page
2. System displays only **reviewed** transactions in sortable table
3. User can search by merchant, filter by category
4. User clicks row to open edit modal
5. User can edit details and save changes

## Important Implementation Notes

### Backend vs localStorage

All application data is now in SQLite. localStorage holds only the active database ID session pointer.

- **Database operations**: ✅ Fully migrated to backend (SQLite via API)
- **Category operations**: ✅ Fully migrated to backend (SQLite via API)
- **Transaction operations**: ✅ Fully migrated to backend (SQLite via API)
- **Template operations**: ✅ Fully migrated to backend (SQLite via API)
- **State management**: Hybrid (by design)
  - Active database ID: Stored in localStorage as a session pointer
  - Active database object: Always fetched from backend on demand
  - `AppState.setActiveDatabase()` - async, verifies database exists in backend
  - `AppState.getActiveDatabase()` - async, fetches from backend

**Key Changes**:
- State management functions are now async to support backend API calls. All callers must use `await`.
- Modal content updates in place instead of close/reopen pattern.

### Async State Management API

**AppState Methods (all async)**:
```javascript
// Set active database (verifies it exists in backend)
await AppState.setActiveDatabase(dbId);

// Get active database object (fetches from backend)
const database = await AppState.getActiveDatabase();

// Get active database ID (synchronous - reads from localStorage)
const dbId = AppState.getActiveDatabaseId();

// Clear active database
await AppState.clearActiveDatabase();

// Check if active database exists (synchronous)
const hasDb = AppState.hasActiveDatabase();

// Guard function (synchronous - redirects if no active DB)
if (!AppState.requireActiveDatabase()) {
  // Redirected to index.html
}
```

**Deprecated Sync Methods** (for backward compatibility):
- `AppState.setActiveDatabaseSync(dbId)` - Sets active DB without backend verification
- `AppState.getActiveDatabaseSync()` - Gets DB from localStorage only

### localStorage Keys
- ~~Databases list: `financeTracker:databases`~~ - Now in SQLite ✅
- ~~Categories: `financeTracker:{dbId}:categories`~~ - Now in SQLite ✅
- ~~Transactions: `financeTracker:{dbId}:transactions`~~ - Now in SQLite ✅
- ~~Templates: `financeTracker:{dbId}:templates`~~ - Now in SQLite ✅
- Active DB ID: `financeTracker:activeDb` - Kept in localStorage as a session pointer (database object always fetched from backend)

### CSV Parsing Edge Cases
- Handles quoted fields with commas: `"Smith, John",-50.00`
- Handles different line endings: \n, \r\n, \r
- Handles escaped quotes: `"He said ""hello"""` → `He said "hello"`
- Validates required columns exist before import

### Date Format Support
- MM/DD/YYYY (US format)
- DD/MM/YYYY (European format)
- YYYY-MM-DD (ISO format)
- M/D/YYYY (short US format)

### Merchant Name Cleaning
- Removes store numbers: "STARBUCKS #12345" → "STARBUCKS"
- Removes transaction IDs: "AMAZON 123456789" → "AMAZON"
- Trims extra whitespace

### Split Validation
- Split amounts can differ from transaction total (shows warning)
- Negative amounts for expenses, positive for income
- Empty splits allowed (full amount to one person)
- Percentage splits: 0-100% range validation
- Auto-converts between dollar and percentage when switching types

### Navigation Guards
- `AppState.requireActiveDatabase()` on all pages except landing
- Redirects to index.html if no active database

## Known Limitations

1. **No authentication**: Backend is open to anyone on localhost
2. **No export**: Can't export data (only backup via SQLite file)
3. **No bulk edit**: Must edit transactions one-by-one or via review
4. **No reports**: No charts, graphs, or financial reports
5. **Single currency**: No multi-currency support
6. **Local development only**: Backend has no production security features
7. **Category usage tracking**: Deleting a category does not null out `categoryId` on existing transactions (orphaned foreign key, benign since categories table is separate)

## Potential Next Steps

### Critical - Complete Backend Migration
- [x] Implement transaction endpoints (GET, POST, PUT, DELETE, import) ✅
- [x] Implement category endpoints (GET, POST, DELETE) ✅
- [x] Implement template endpoints (GET, POST, DELETE) ✅
- [x] Update dashboard.js to use transaction/template/category APIs ✅
- [x] Update transactions.js to use transaction/category APIs ✅
- [x] Update review.js to use transaction/category APIs ✅
- [x] Add loading states and error handling for API calls ✅

### High Priority
- [ ] Export to CSV functionality
- [ ] Bulk transaction editing
- [x] Transaction deletion from review page ✅
- [ ] Transaction deletion from table view
- [x] Date range filtering ✅
- [x] Amount range filtering ✅

### Medium Priority
- [ ] Reports/charts (spending by category, over time)
- [ ] Recurring transaction templates
- [ ] Budget tracking
- [ ] Account balances
- [ ] Multi-currency support

### Backend Security & Production
- [ ] Add authentication (JWT tokens)
- [ ] Add authorization (user-specific databases)
- [ ] Add HTTPS/TLS support
- [ ] Add rate limiting
- [ ] Add CORS configuration for separate frontend/backend
- [ ] Add environment-based configuration
- [ ] Add database migrations system

### Nice to Have
- [ ] Dark mode
- [ ] Keyboard shortcuts
- [ ] Transaction attachments (receipts)
- [ ] Tags in addition to categories
- [ ] CSV export
- [ ] JSON import/export for backups
- [ ] Print-friendly transaction list

## Testing Checklist

### Backend Integration
- [x] Backend server starts successfully
- [x] Database create via API works
- [x] Database list via API works
- [x] Database delete via API works
- [x] Database get by ID via API works
- [x] Frontend connects to backend
- [x] SQLite database file created at ~/.finance-tracker/data.db
- [x] State management uses async API calls
- [x] Dashboard loads database from backend
- [x] No redirect loop when opening database
- [x] Category endpoints (GET, POST, DELETE) ✅
- [x] Categories persist in SQLite
- [x] Modal updates without stacking
- [x] Transaction endpoints (GET, POST, PUT, DELETE, import) ✅
- [x] Transactions persist in SQLite
- [x] Template endpoints (GET, POST, DELETE) ✅
- [x] Templates persist in SQLite
- [x] CSV bulk import via API works

### Frontend Features
- [x] Create database (via backend API)
- [x] Load existing database (via backend API)
- [x] Delete database (via backend API)
- [x] Create template
- [x] Delete template
- [x] Create category
- [x] Delete category (with usage warning)
- [x] Import CSV
- [x] Review transactions (edit, categorize, split)
- [x] View transactions table
- [x] Search transactions
- [x] Filter by category
- [x] Only reviewed transactions shown in table (filter by review status removed)
- [x] Filter by date range (start/end date pickers)
- [x] Filter by amount range (dual-range slider)
- [x] Sort table columns
- [x] Edit transaction from table
- [x] Pagination works
- [x] Modal open/close
- [x] Notifications display
- [x] Form validation
- [x] Data persists on refresh
- [x] Multiple databases isolated

## Debugging Tips

### Backend Debugging

**Check if server is running:**
```bash
curl http://localhost:8080/api/databases
```

**Test database creation:**
```bash
curl -X POST http://localhost:8080/api/databases \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Database"}'
```

**Check SQLite database:**
```bash
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM databases;"
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM transactions WHERE database_id = 'some-uuid';"
```

**View server logs:**
```bash
# View today's log
tail -f ~/.finance-tracker/logs/server-$(date +%Y-%m-%d).log

# Or list all logs
ls -lh ~/.finance-tracker/logs/

# View all logs
cat ~/.finance-tracker/logs/*.log
```

**View app data directory:**
```bash
ls -lah ~/.finance-tracker/
du -sh ~/.finance-tracker/  # Check total size
```

**Common backend issues:**
- **Port 8080 in use**: Change port in main.go or kill process using `lsof -i :8080`
- **Database locked**: SQLite write lock - close other connections
- **Module not found**: Run `go mod download`
- **Build errors**: Make sure Go 1.21+ is installed
- **CORS errors**: Backend and frontend must be same origin (use http://localhost:8080, not file://)

### Check localStorage
```javascript
// In browser console — only one key remains
localStorage.getItem('financeTracker:activeDb')
```

### Clear session (force back to landing page)
```javascript
localStorage.removeItem('financeTracker:activeDb')
```

### Inspect SQLite data directly
```bash
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM transactions WHERE database_id = 'some-uuid';"
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM templates WHERE database_id = 'some-uuid';"
```

### Common Issues
- **Modal not closing**: Check for JavaScript errors in console
- **CSV import fails**: Verify column names match exactly (case-sensitive)
- **Splits not calculating**: Check that amounts are numbers, not strings
- **Dashboard redirects to landing**: Database not found in backend — check server is running
- **"Failed to load database" error**: Backend server down or database was deleted
- **Async errors**: Make sure all `AppState.setActiveDatabase()` and `getActiveDatabase()` calls use `await`
- **Review page shows no transactions**: Transactions may not exist in SQLite (old data was in localStorage — clear localStorage and re-import)

## Code Style Guidelines

- Use ES6+ features (const/let, arrow functions, template literals)
- Import only what's needed from modules
- Use static methods for utilities
- Use instance methods for stateful components
- Keep functions focused and single-purpose
- Validate inputs at function boundaries
- Use descriptive variable names
- Comment complex logic, not obvious code
- Keep files under 500 lines
- Prefer composition over inheritance

## Project Philosophy

This project prioritizes:
1. **Simplicity**: No build tools, no frameworks, vanilla JS
2. **Maintainability**: Clear structure, separation of concerns
3. **User Experience**: Fast, responsive, intuitive
4. **Future-proofing**: Easy backend integration path
5. **Minimalism**: Only essential features, no bloat

## Questions for Next Session

### Backend-related
- Add authentication and multi-user support?
- Deploy backend to production (Docker, cloud hosting)?

### Feature-related
- Add export functionality (CSV, JSON)?
- Add reports/charts for spending analysis?
- Add more CSV templates for common banks?
- Add transaction search by amount or date range?
- Add keyboard shortcuts?
- Add a "quick add transaction" feature?
- Transaction deletion from the table view?

---

**Last Updated**: 2026-03-07 (Emoji picker for categories; amount range slider filter; date range filter; delete from review; reviewed-only transactions view; template debit sign; transaction source field)
**Status**: ✅ Frontend complete | ✅ Backend complete (all data in SQLite)

**Current State**:
- ✅ Go backend server on localhost:8080
- ✅ SQLite database at ~/.finance-tracker/data.db
- ✅ Server logs at ~/.finance-tracker/logs/
- ✅ Embedded static files (single binary distribution)
- ✅ Database CRUD operations via API
- ✅ Category CRUD operations via API
- ✅ Transaction CRUD operations via API (including bulk import and delete)
- ✅ Template CRUD operations via API
- ✅ Async state management for API integration
- ✅ All 4 pages fully migrated to backend (no localStorage for data)
- ✅ Split transactions by dollar amount or percentage (0-100%)
- ✅ Modal component supports async handlers and stays open
- ✅ Consistent form styling across all split inputs
- ✅ Delete transactions from review page
- ✅ View Transactions shows only reviewed transactions
- ✅ Template debit sign (`positive`/`negative`) controls amount sign during import
- ✅ Transaction `source` field stores the template name used during import
- ✅ Emoji picker for category creation (grid of ~100 emojis, no external dependencies)
- ✅ Amount range filter on View Transactions (dual-range slider, dynamic max)
- ✅ Date range filter on View Transactions (native date pickers, default = all dates)

**Working User Flow**:
1. Create database → Saved to SQLite ✅
2. Open database → Dashboard loads successfully ✅
3. Create categories → Saved to SQLite ✅
4. Create templates → Saved to SQLite ✅
   - Select debit sign convention (positive or negative) ✅
5. Import CSV → Transactions bulk-imported to SQLite ✅
   - Amounts sign-adjusted per template debit sign ✅
   - Source set to template name ✅
6. View transactions → Loads reviewed transactions from SQLite ✅
   - Search by merchant ✅
   - Filter by category ✅
   - Filter by date range (start/end date pickers) ✅
   - Filter by amount range (dual-range slider) ✅
   - Source column shown ✅
   - Click to edit in modal ✅
7. Edit transaction → Updates in SQLite ✅
   - Edit merchant name ✅
   - Assign categories from dropdown ✅
   - Add/edit splits ✅
   - Add notes ✅
8. Review transactions → Loads from SQLite, saves to SQLite ✅
   - Assign categories from dropdown ✅
   - Split by dollar or percentage ✅
   - Auto-convert between split types ✅
   - Delete transaction entirely ✅

**Next Recommended Work**:
1. Add authentication for multi-user support
2. Export to CSV/JSON functionality
3. Reports/charts (spending by category, over time)
4. Transaction deletion from the table view
5. Date/amount range filtering
