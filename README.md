# Finance Tracker

A lightweight personal finance tracker with a vanilla JavaScript frontend and Go backend. Manage multiple databases, import CSV transactions, categorize expenses, and split costs between people.

## Features

- **Multiple Databases**: Create and manage separate finance databases
- **CSV Import**: Import transactions from bank statements with custom templates
- **Transaction Review**: One-by-one review workflow for categorizing transactions
- **Categories**: Create custom categories with colors and emojis
- **Transaction Splitting**: Split transactions between multiple people
- **Search & Filter**: Find transactions quickly with search and filters
- **Sortable Tables**: Click column headers to sort transaction data
- **Data Persistence**: SQLite database with RESTful API
- **Backend**: Go server with net/http

## Getting Started

### Prerequisites

- Go 1.21 or higher ([Download](https://go.dev/dl/))
- Modern web browser (Chrome, Firefox, Safari, or Edge 90+)

### Quick Start (2 minutes)

See [QUICKSTART.md](QUICKSTART.md) for detailed instructions.

**TL;DR**:
```bash
# Start the server
./start.sh
# Or manually:
go run .

# Open browser to http://localhost:8080
```

### Detailed Setup

1. **Create a Database**: Click "Create Database" on the landing page
2. **Create a CSV Template**: Go to Dashboard → Manage Templates
   - Enter column names from your bank's CSV export
   - Select the date format
3. **Import Transactions**: Dashboard → Import CSV
   - Upload your bank CSV file
   - Select the matching template
4. **Create Categories**: Dashboard → Manage Categories
   - Add categories like "Food & Dining", "Transportation", etc.
5. **Review Transactions**: Dashboard → Review Transactions
   - Assign categories to each transaction
   - Edit merchant names
   - Add splits if needed

## Architecture

### Frontend
- **Pure JavaScript**: No frameworks, no build tools
- **ES6 Modules**: Clean module system
- **Custom CSS**: Design system with CSS variables

### Backend
- **Go**: Simple HTTP server using net/http
- **SQLite**: Embedded database, zero configuration
- **RESTful API**: JSON endpoints under `/api/*`

**Current Status**: Database operations use backend API, other features still migrating from localStorage.

## Project Structure

```
/finance
├── index.html              # Landing page
├── dashboard.html          # Main dashboard
├── transactions.html       # Transaction table view
├── review.html            # Transaction review interface
├── css/
│   ├── reset.css          # CSS reset
│   ├── variables.css      # Design system variables
│   ├── global.css         # Global styles
│   ├── components.css     # Reusable components
│   ├── modals.css        # Modal styles
│   ├── table.css         # Table styles
│   └── pages/            # Page-specific styles
├── js/
│   ├── core/
│   │   ├── storage.js     # localStorage abstraction
│   │   ├── database.js    # CRUD operations
│   │   └── state.js       # App state management
│   ├── utils/
│   │   ├── csv-parser.js
│   │   ├── date-formatter.js
│   │   ├── validators.js
│   │   └── helpers.js
│   ├── components/
│   │   ├── modal.js       # Modal component
│   │   ├── notification.js # Toast notifications
│   │   └── table.js       # Dynamic table
│   └── pages/            # Page-specific JavaScript
└── README.md
```

## Data Models

### Transaction
```javascript
{
  id: "uuid",
  date: "2026-02-01",           // YYYY-MM-DD format
  merchant: "Starbucks",
  originalMerchant: "STARBUCKS #12345",
  amount: -5.75,                // Negative for expenses
  categoryId: "uuid" | null,
  splits: [
    { personName: "John", amount: -2.88 }
  ],
  reviewed: false,
  notes: ""
}
```

### Category
```javascript
{
  id: "uuid",
  name: "Food & Dining",
  color: "#FF6B6B",
  emoji: "🍔"
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
  dateFormat: "MM/DD/YYYY"
}
```

## CSV Import

### Supported Date Formats
- `MM/DD/YYYY` - 02/05/2026
- `DD/MM/YYYY` - 05/02/2026
- `YYYY-MM-DD` - 2026-02-05
- `M/D/YYYY` - 2/5/2026

### Creating Templates

1. Export a CSV from your bank
2. Open it in a text editor or spreadsheet
3. Note the column headers (e.g., "Transaction Date", "Description", "Amount")
4. Create a template in Finance Tracker with those column names
5. Select the appropriate date format

### Example CSV Format

```csv
Transaction Date,Description,Amount
02/05/2026,STARBUCKS #12345,-5.75
02/04/2026,PAYCHECK,2500.00
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires ES6+ support and localStorage.

## Storage

All data is stored locally in your browser's localStorage. Data is never sent to any server.

### Storage Limits
- Most browsers allow 5-10MB of localStorage
- Approximately 10,000-50,000 transactions depending on complexity

### Backup Your Data
To backup your data:
1. Open browser DevTools (F12)
2. Go to Application → Local Storage
3. Copy all keys starting with `financeTracker:`
4. Save to a JSON file

To restore:
1. Open DevTools → Console
2. Paste the saved data
3. Refresh the page

## Future Backend Integration

This frontend is designed to easily integrate with a Golang/SQLite backend:

1. Create `js/core/api.js` for fetch calls
2. Update `DatabaseManager` methods to call API endpoints
3. Add authentication (JWT)
4. Add loading states

API endpoints will mirror the current data structure:
- `GET/POST /api/databases`
- `GET/POST/PUT/DELETE /api/databases/:id/transactions`
- `GET/POST/PUT/DELETE /api/databases/:id/categories`
- `GET/POST/PUT/DELETE /api/databases/:id/templates`

## License

MIT License - feel free to use this project however you like!

## Contributing

This is a personal project, but suggestions and improvements are welcome!

## Troubleshooting

### Data Not Persisting
- Check if localStorage is enabled in your browser
- Check if you're in private/incognito mode (localStorage may be disabled)

### CSV Import Failing
- Verify the template column names match your CSV exactly (case-sensitive)
- Check the date format matches your CSV dates
- Ensure the CSV has headers in the first row

### Performance Issues
- Large CSV imports (10,000+ rows) may take a few seconds
- Consider splitting very large CSV files into smaller batches

## Credits

Built with vanilla JavaScript, no frameworks or libraries required.
