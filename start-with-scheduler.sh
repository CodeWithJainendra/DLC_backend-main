#!/bin/bash

# DLC Backend Startup Script with Automated Scheduler
# This script installs dependencies and starts the server with automated SBI data fetching

echo "🚀 Starting DLC Backend with Automated Scheduler..."
echo "=================================================="

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "📦 Dependencies already installed"
fi

# Install node-cron if not already installed
echo "🕐 Checking for node-cron dependency..."
if ! npm list node-cron > /dev/null 2>&1; then
    echo "📦 Installing node-cron..."
    npm install node-cron@^3.0.3
else
    echo "✅ node-cron already installed"
fi

# Create logs directory if it doesn't exist
echo "📁 Creating logs directory..."
mkdir -p logs/reports

# Set environment variables
export NODE_ENV=production

# Display startup information
echo ""
echo "🔧 Configuration:"
echo "   • Scheduler: Enabled (10:30 PM daily)"
echo "   • States: 36 states configured"
echo "   • Data Retention: 90 days"
echo "   • Batch Processing: 5 states per batch"
echo "   • Retry Policy: 3 attempts with exponential backoff"
echo ""

echo "📊 Available Endpoints:"
echo "   • Server Health: http://localhost:3000/health"
echo "   • SBI API: http://localhost:3000/api/sbi"
echo "   • Pension Analytics: http://localhost:3000/api/pension/analytics"
echo "   • Scheduler Status: http://localhost:3000/api/scheduler/status"
echo "   • Manual Fetch: http://localhost:3000/api/scheduler/trigger-fetch"
echo ""

echo "🌙 Automated Features:"
echo "   • Nightly data fetch at 10:30 PM IST"
echo "   • Weekly data cleanup on Sundays at 2:00 AM"
echo "   • Hourly health monitoring"
echo "   • Comprehensive error handling and retry logic"
echo ""

echo "▶️ Starting server..."
echo "=================================================="

# Start the server
node server.js
