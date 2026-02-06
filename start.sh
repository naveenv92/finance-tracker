#!/bin/bash

# Finance Tracker Server Startup Script

echo "🚀 Starting Finance Tracker Backend..."
echo ""

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.21+ from https://go.dev/dl/"
    exit 1
fi

# Check Go version
GO_VERSION=$(go version | awk '{print $3}')
echo "✅ Found Go: $GO_VERSION"

# Download dependencies if needed
if [ ! -d "vendor" ] && [ ! -f "go.sum" ]; then
    echo "📦 Downloading dependencies..."
    go mod download
fi

# Build the application
echo "🔨 Building application..."
if ! go build -o finance-tracker; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""
echo "🌐 Starting server on http://localhost:8080"
echo "📊 Database: finance.db"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run the server
./finance-tracker
