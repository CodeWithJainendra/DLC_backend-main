#!/bin/bash

# DLC Portal Data Processor - Quick Start Script
# This script helps you process DLC Portal Excel files

echo "=========================================="
echo "📊 DLC Portal Data Processor"
echo "=========================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed!"
    exit 1
fi

# Check required packages
echo "📦 Checking dependencies..."
python3 -c "import pandas" 2>/dev/null
if [ $# -ne 0 ]; then
    echo "⚠️  pandas not installed. Installing..."
    pip3 install pandas openpyxl
fi

python3 -c "import openpyxl" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  openpyxl not installed. Installing..."
    pip3 install openpyxl
fi

echo "✅ All dependencies installed"
echo ""

# Menu
echo "=========================================="
echo "SELECT AN OPTION:"
echo "=========================================="
echo ""
echo "1. Process a single Excel file"
echo "2. Process all DLC Portal files (batch)"
echo "3. Query existing database"
echo "4. Show database statistics"
echo "5. Exit"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo ""
        echo "📁 Enter Excel file path:"
        echo "Example: ../Excel Files/21Oct/ASSAM DLC PORTAL DATA.xlsx"
        read -p "> " filepath
        
        if [ ! -f "$filepath" ]; then
            echo "❌ File not found: $filepath"
            exit 1
        fi
        
        echo ""
        read -p "Enter sheet name (press Enter for first sheet): " sheetname
        
        if [ -z "$sheetname" ]; then
            python3 dlc_portal_processor.py "$filepath"
        else
            python3 dlc_portal_processor.py "$filepath" "$sheetname"
        fi
        ;;
    
    2)
        echo ""
        echo "🔄 Processing all DLC Portal files..."
        echo "This may take several minutes..."
        echo ""
        python3 process_all_dlc_files.py
        ;;
    
    3)
        echo ""
        echo "🔍 Starting interactive query mode..."
        echo ""
        python3 query_dlc_data.py
        ;;
    
    4)
        echo ""
        echo "📊 Showing database statistics..."
        echo ""
        python3 -c "
from dlc_portal_processor import DLCPortalProcessor
processor = DLCPortalProcessor()
if processor.connect():
    processor.get_statistics()
    processor.close()
"
        ;;
    
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "✅ DONE!"
echo "=========================================="
echo ""
echo "📚 Next Steps:"
echo "  - Query data: python3 query_dlc_data.py"
echo "  - View stats: ./quick_start.sh (option 4)"
echo "  - Database location: dlc_portal_database.db"
echo ""
