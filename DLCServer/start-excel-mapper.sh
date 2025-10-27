#!/bin/bash

# Excel to Database Mapper - Quick Start Script
# This script starts the server and opens the web interface

echo "=========================================="
echo "📊 Excel to Database Mapper"
echo "=========================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js first"
    exit 1
fi

# Check if npm packages are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if xlsx package is installed
if ! npm list xlsx &> /dev/null; then
    echo "📦 Installing xlsx package..."
    npm install xlsx
fi

echo "✅ All dependencies installed"
echo ""
echo "🚀 Starting server..."
echo ""
echo "=========================================="
echo "📍 Access Points:"
echo "=========================================="
echo ""
echo "🗂️  Excel Mapper:  http://localhost:9007/excel-mapper.html"
echo "📊 Dashboard:      http://localhost:9007/dashboard.html"
echo "🏥 Health Check:   http://localhost:9007/health"
echo ""
echo "=========================================="
echo "📚 Documentation:"
echo "=========================================="
echo ""
echo "📖 English Guide:  EXCEL_MAPPER_README.md"
echo "📖 Hindi Guide:    HINDI_GUIDE.md"
echo ""
echo "=========================================="
echo "🔧 Commands:"
echo "=========================================="
echo ""
echo "Query Database:    python3 query_pincode_stats.py newdatabase.db"
echo "Stop Server:       Press Ctrl+C"
echo ""
echo "=========================================="
echo ""
echo "Starting server on port 9007..."
echo ""

# Start the server
node server.js
