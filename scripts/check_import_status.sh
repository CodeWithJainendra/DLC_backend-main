#!/bin/bash

# Live Import Status Checker
# Run this anytime to check current import progress

echo "=========================================="
echo "📊 DOPPW IMPORT STATUS CHECK"
echo "=========================================="
echo ""

# Check if process is running
if ps aux | grep -E "fast_import_all_sheets|import_all_sheets_python" | grep -v grep > /dev/null; then
    echo "✅ Import process is RUNNING"
    echo ""
    
    # Show process details
    ps aux | grep -E "fast_import_all_sheets|import_all_sheets_python" | grep -v grep | awk '{print "   PID: " $2 "  |  CPU: " $3 "%  |  Runtime: " $10}'
    echo ""
else
    echo "⚠️  No import process running"
    echo ""
fi

# Check database records
echo "📈 DATABASE STATISTICS:"
echo "─────────────────────────────────────────"

DB_PATH="/data1/jainendra/DLC_backend-main/DLC_Database.db"

# Total imported records
TOTAL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pensioner_bank_master WHERE data_source LIKE 'DOPPW_%_IMPORT_%';" 2>/dev/null || echo "0")
echo "   Total Records Imported: $(printf "%'d" $TOTAL)"

# By sheet
echo ""
echo "   By Sheet:"
sqlite3 "$DB_PATH" "SELECT '   ' || sheet_name || ': ' || printf('%,d', COUNT(*)) FROM pensioner_bank_master WHERE data_source LIKE 'DOPPW_%_IMPORT_%' GROUP BY sheet_name;" 2>/dev/null || echo "   No data yet"

echo ""
echo "─────────────────────────────────────────"

# Progress calculation
TARGET=41964470
if [ "$TOTAL" -gt 0 ]; then
    PERCENT=$(echo "scale=2; ($TOTAL / $TARGET) * 100" | bc)
    echo "📊 Progress: $PERCENT% of 4.19 crore records"
    
    REMAINING=$((TARGET - TOTAL))
    echo "⏳ Remaining: $(printf "%'d" $REMAINING) records"
fi

echo ""
echo "🔄 Last 10 lines of import log:"
echo "─────────────────────────────────────────"
tail -10 /data1/jainendra/DLC_backend-main/fast_import.log 2>/dev/null || echo "Log file not available"

echo ""
echo "=========================================="
echo "💡 Tip: Run this script again anytime to check progress"
echo "   Command: bash scripts/check_import_status.sh"
echo "=========================================="
