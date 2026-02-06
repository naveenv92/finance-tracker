# Finance Tracker Backend

Go backend server using `net/http` and SQLite for the Finance Tracker application.

## Features

- ✅ RESTful API for database operations
- ✅ SQLite persistence at `~/.finance-tracker/data.db`
- ✅ Static file serving for frontend (embedded via embed.FS)
- ✅ Automatic logging to `~/.finance-tracker/logs/`
- ✅ Single binary distribution with embedded assets
- ✅ Category endpoints (GET, POST, DELETE)
- 🚧 Transaction and template endpoints (TODO)

## Prerequisites

- Go 1.21 or higher
- SQLite3

## Installation

1. **Install Go dependencies**:
   ```bash
   go mod download
   ```

2. **Run the server**:
   ```bash
   go run .
   ```

   Or build and run:
   ```bash
   go build -o finance-tracker
   ./finance-tracker
   ```

   The server will automatically:
   - Create `~/.finance-tracker/` directory if it doesn't exist
   - Initialize the SQLite database at `~/.finance-tracker/data.db`
   - Start logging to `~/.finance-tracker/logs/server-YYYY-MM-DD.log`

3. **Open the application**:
   Open your browser to http://localhost:8080

## Project Structure

```
/finance
├── static/                    # Frontend files (embedded in binary)
│   ├── *.html                # HTML pages
│   ├── css/                  # Stylesheets
│   └── js/                   # JavaScript modules
│       └── core/api.js       # Frontend API client
├── main.go                    # HTTP server and routing
├── database.go                # SQLite operations and schema
├── go.mod                     # Go module dependencies
└── finance-tracker            # Compiled binary

~/.finance-tracker/            # App data directory (auto-created)
├── data.db                    # SQLite database
├── logs/                      # Server logs
│   └── server-YYYY-MM-DD.log # Daily log files
├── backups/                   # Database backups (future)
└── config/                    # Configuration files (future)
```

## API Endpoints

### Databases

#### GET /api/databases
Get all databases.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Personal Finance 2026",
    "createdAt": "2026-02-05T10:30:00Z",
    "lastModified": "2026-02-05T10:30:00Z"
  }
]
```

#### POST /api/databases
Create a new database.

**Request:**
```json
{
  "name": "Personal Finance 2026"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Personal Finance 2026",
  "createdAt": "2026-02-05T10:30:00Z",
  "lastModified": "2026-02-05T10:30:00Z"
}
```

#### GET /api/databases/:id
Get a specific database by ID.

**Response:**
```json
{
  "id": "uuid",
  "name": "Personal Finance 2026",
  "createdAt": "2026-02-05T10:30:00Z",
  "lastModified": "2026-02-05T10:30:00Z"
}
```

#### DELETE /api/databases/:id
Delete a database and all related data.

**Response:** 204 No Content

### Categories

#### GET /api/databases/:id/categories
Get all categories for a database.

**Response:**
```json
[
  {
    "id": "uuid",
    "databaseId": "uuid",
    "name": "Food & Dining",
    "color": "#FF6B6B",
    "emoji": "🍔",
    "createdAt": "2026-02-05T10:30:00Z"
  }
]
```

#### POST /api/databases/:id/categories
Create a new category.

**Request:**
```json
{
  "name": "Food & Dining",
  "color": "#FF6B6B",
  "emoji": "🍔"
}
```

**Response:**
```json
{
  "id": "uuid",
  "databaseId": "uuid",
  "name": "Food & Dining",
  "color": "#FF6B6B",
  "emoji": "🍔",
  "createdAt": "2026-02-05T10:30:00Z"
}
```

#### DELETE /api/databases/:id/categories/:categoryId
Delete a category.

**Response:** 204 No Content

## Database Schema

### databases
```sql
CREATE TABLE databases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    last_modified DATETIME NOT NULL
);
```

### transactions
```sql
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    database_id TEXT NOT NULL,
    date TEXT NOT NULL,
    merchant TEXT NOT NULL,
    original_merchant TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id TEXT,
    splits TEXT,              -- JSON array
    reviewed BOOLEAN NOT NULL DEFAULT 0,
    imported_at DATETIME NOT NULL,
    notes TEXT,
    FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
);
```

### categories
```sql
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    database_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    emoji TEXT,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
);
```

### templates
```sql
CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    database_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date_column TEXT NOT NULL,
    merchant_column TEXT NOT NULL,
    amount_column TEXT NOT NULL,
    date_format TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
);
```

## Development

### Run with auto-reload
Use `air` for live reload during development:

```bash
# Install air
go install github.com/cosmtrek/air@latest

# Run with air
air
```

### Testing API endpoints

Using curl:

```bash
# Get all databases
curl http://localhost:8080/api/databases

# Create a database
curl -X POST http://localhost:8080/api/databases \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Database"}'

# Get categories for a database
curl http://localhost:8080/api/databases/{id}/categories

# Create a category
curl -X POST http://localhost:8080/api/databases/{id}/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Food","color":"#FF6B6B","emoji":"🍔"}'

# Delete a category
curl -X DELETE http://localhost:8080/api/databases/{id}/categories/{categoryId}

# Delete a database
curl -X DELETE http://localhost:8080/api/databases/{id}
```

### Inspecting the database

```bash
# View database location
ls -lh ~/.finance-tracker/data.db

# Query the database directly
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM databases;"
sqlite3 ~/.finance-tracker/data.db "SELECT * FROM categories;"

# View logs
tail -f ~/.finance-tracker/logs/server-$(date +%Y-%m-%d).log
```

## Migration from localStorage

The frontend has been updated to use the backend API for database operations. The workflow is:

1. **Old (localStorage)**: Data stored in browser's localStorage
2. **New (Backend)**: Data stored in SQLite via API calls

To migrate existing localStorage data:
1. Export data from browser DevTools (Application → Local Storage)
2. Use migration script (TODO) to import into SQLite

## TODO: Remaining Endpoints

The following endpoints need to be implemented:

**Transactions:**
- [ ] `GET /api/databases/:id/transactions` - Get all transactions
- [ ] `POST /api/databases/:id/transactions` - Create transaction
- [ ] `PUT /api/databases/:id/transactions/:tid` - Update transaction
- [ ] `DELETE /api/databases/:id/transactions/:tid` - Delete transaction
- [ ] `POST /api/databases/:id/transactions/import` - Bulk CSV import

**Templates:**
- [ ] `GET /api/databases/:id/templates` - Get all templates
- [ ] `POST /api/databases/:id/templates` - Create template
- [ ] `PUT /api/databases/:id/templates/:tid` - Update template
- [ ] `DELETE /api/databases/:id/templates/:tid` - Delete template

**Completed:**
- [x] `GET /api/databases/:id/categories` - Get all categories
- [x] `POST /api/databases/:id/categories` - Create category
- [x] `DELETE /api/databases/:id/categories/:cid` - Delete category

## Error Handling

The API returns appropriate HTTP status codes:

- `200 OK` - Successful GET/PUT
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error responses include a plain text error message.

## Security Considerations

**Current implementation is for local development only.**

For production deployment, add:
- [ ] Authentication (JWT tokens)
- [ ] Authorization (user-specific databases)
- [ ] HTTPS/TLS
- [ ] Rate limiting
- [ ] Input sanitization
- [ ] SQL injection prevention (using prepared statements)
- [ ] CORS configuration
- [ ] Environment-based configuration

## Performance

- Database operations use prepared statements
- Indexes on foreign keys for faster queries
- Cascade deletes for data consistency
- Connection pooling (default in Go sql.DB)

## App Data Directory

All application data is stored in `~/.finance-tracker/`:

### Structure
```
~/.finance-tracker/
├── data.db                    # SQLite database (all user data)
├── logs/                      # Server logs
│   └── server-2026-02-05.log # Daily log files
├── backups/                   # Database backups (future feature)
└── config/                    # Configuration files (future feature)
```

### Managing Data

**Backup your data:**
```bash
# Copy the entire directory
cp -r ~/.finance-tracker ~/.finance-tracker-backup

# Or just the database
cp ~/.finance-tracker/data.db ~/finance-backup-$(date +%Y%m%d).db
```

**Clear all data (reset):**
```bash
rm -rf ~/.finance-tracker
# The directory will be recreated on next server start
```

**View disk usage:**
```bash
du -sh ~/.finance-tracker
du -sh ~/.finance-tracker/*
```

**Archive old logs:**
```bash
# Compress logs older than 7 days
find ~/.finance-tracker/logs -name "*.log" -mtime +7 -exec gzip {} \;
```

### Logs

Server logs are written daily to `~/.finance-tracker/logs/server-YYYY-MM-DD.log`:
- Logs are written to both console and file
- Each day creates a new log file
- Old logs can be compressed or deleted manually

**View logs:**
```bash
# Follow today's log
tail -f ~/.finance-tracker/logs/server-$(date +%Y-%m-%d).log

# View all logs
cat ~/.finance-tracker/logs/*.log

# Search logs
grep "error" ~/.finance-tracker/logs/*.log
```

## Troubleshooting

### Port already in use
Change the port in `main.go`:
```go
log.Fatal(http.ListenAndServe(":8081", nil))
```

### Database locked
SQLite locks the database file during writes. This is normal for single-user applications.

### CORS errors
The server serves files from the same origin, so CORS should not be an issue. If deploying frontend and backend separately, add CORS headers.

## License

MIT License - Same as the main project
