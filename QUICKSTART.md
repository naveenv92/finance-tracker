# Finance Tracker - Quick Start Guide

Get up and running with the Finance Tracker in under 2 minutes!

## Prerequisites

- Go 1.21 or higher ([Download here](https://go.dev/dl/))
- A modern web browser (Chrome, Firefox, Safari, or Edge 90+)

## Installation & Setup

### 1. Start the Backend Server

```bash
cd /Users/naveenvenkatesan/Desktop/finance
go run .
```

You should see:
```
Server starting on http://localhost:8080
```

### 2. Open the Application

Open your browser and navigate to:
```
http://localhost:8080
```

**Important**: Don't open the HTML files directly (file://). Always use the server URL.

## First Steps

### 1. Create Your First Database

1. Click **"Create Database"**
2. Enter a name (e.g., "Personal Finance 2026")
3. Click **"Save"**

You'll be redirected to the dashboard.

### 2. Create a CSV Template

Your bank's CSV exports need a template to map columns.

1. On the dashboard, click **"Manage Templates"**
2. Click **"Create Template"**
3. Fill in the form:
   - **Template Name**: Name of your bank (e.g., "Chase Checking")
   - **Date Column**: The exact column name from your CSV (e.g., "Transaction Date")
   - **Merchant Column**: The merchant/description column (e.g., "Description")
   - **Amount Column**: The amount column (e.g., "Amount")
   - **Date Format**: Select the format your bank uses

**Tip**: Open your bank's CSV in a text editor to see the exact column names.

### 3. Create Categories

1. On the dashboard, click **"Manage Categories"**
2. Create a few categories:
   - **Food & Dining**: Color #FF6B6B, Emoji 🍔
   - **Transportation**: Color #4A90E2, Emoji 🚗
   - **Shopping**: Color #9B59B6, Emoji 🛍️
   - **Income**: Color #10B981, Emoji 💰

### 4. Import Your First CSV

1. Export transactions from your bank as CSV
2. On the dashboard, click **"Import CSV"**
3. Select your CSV file
4. Choose the template you created
5. Click **"Import"**

### 5. Review Transactions

1. On the dashboard, click **"Review Transactions"**
2. For each transaction:
   - Edit the merchant name if needed
   - Assign a category
   - (Optional) Add splits if sharing costs
3. Click **"Save & Next"**

### 6. View All Transactions

1. Click **"View Transactions"** in the sidebar
2. Search, filter, and sort your transactions
3. Click any row to edit details

## Example CSV Format

Your bank's CSV should look something like this:

```csv
Transaction Date,Description,Amount
02/05/2026,STARBUCKS #12345,-5.75
02/04/2026,UBER TRIP,-12.50
02/03/2026,SALARY DEPOSIT,2500.00
```

## Tips & Tricks

### CSV Templates for Popular Banks

**Chase**:
- Date Column: "Transaction Date"
- Merchant Column: "Description"
- Amount Column: "Amount"
- Date Format: MM/DD/YYYY

**Bank of America**:
- Date Column: "Date"
- Merchant Column: "Description"
- Amount Column: "Amount"
- Date Format: MM/DD/YYYY

**Wells Fargo**:
- Date Column: "Date"
- Merchant Column: "Description"
- Amount Column: "Amount"
- Date Format: MM/DD/YYYY

### Transaction Splitting

Split a dinner with friends:
1. Find the restaurant transaction
2. Click **"Add Person"**
3. Enter each person's name and their share
4. The app will warn if totals don't match

### Keyboard Shortcuts

- **Review page**: Use Tab to move between fields quickly
- **Search**: Click search bar and start typing (no need to click in it)

## Troubleshooting

### Server won't start

**Error**: "port already in use"
```bash
# Kill the process using port 8080
lsof -i :8080
kill -9 <PID>
```

**Error**: "go: command not found"
- Install Go from https://go.dev/dl/

### Can't see my databases

1. Make sure the server is running (check http://localhost:8080/api/databases)
2. Check browser console for errors (F12 → Console tab)
3. Make sure you're using http://localhost:8080, not file://

### CSV import fails

1. **Check column names**: They must match exactly (case-sensitive)
2. **Check date format**: Make sure you selected the right format in the template
3. **Check file**: Must be a .csv file, not .xlsx or .txt

### Data disappeared

If you're using localStorage (dashboard/transactions/review pages):
- Data is stored in your browser
- Clearing browser data will delete it
- Data is per-origin (http://localhost:8080 vs file:// are different)

If you're using the backend (database list):
- Data is in `finance.db` SQLite file
- Deleting this file will delete all databases

## Next Steps

- **Learn more**: Read [README.md](README.md) for detailed documentation
- **Backend setup**: Read [BACKEND.md](BACKEND.md) for API documentation
- **Development**: Read [CLAUDE.md](CLAUDE.md) for project architecture

## Getting Help

### Check the logs

**Backend**:
```bash
tail -f server.log
```

**Frontend**:
- Open browser DevTools (F12)
- Check the Console tab for JavaScript errors
- Check the Network tab for failed API calls

### Common Issues

| Issue | Solution |
|-------|----------|
| "Failed to load databases" | Server not running - start with `go run .` |
| CSV import does nothing | Check browser console for errors |
| Categories not saving | Using old localStorage version - reload page |
| Transactions not showing | Wrong database selected - go to landing page |

## Feature Status

✅ **Working with Backend**:
- Database create/load/delete

⏳ **Still using localStorage** (will be migrated):
- Transactions
- Categories
- CSV Templates
- Transaction review

---

**Need more help?** Check the full documentation in README.md and BACKEND.md
