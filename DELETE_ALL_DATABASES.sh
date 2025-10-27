#!/bin/bash

echo "=========================================="
echo "⚠️  DATABASE DELETION SCRIPT"
echo "=========================================="
echo ""
echo "This will DELETE the following databases:"
echo ""
echo "  1. DLC_Database.db (145 MB)"
echo "  2. dlc_database.db (0 KB)"
echo "  3. DLCServer/database.db (1.6 GB)"
echo "  4. DLCServer/Insertexceldata/dlc_portal_database.db (7.6 MB)"
echo "  5. DLCServer/Insertexceldata/pensioner_dlc_portal.db (52 KB)"
echo ""
echo "Total size: ~1.75 GB"
echo ""
echo "⚠️  WARNING: This action CANNOT be undone!"
echo ""

read -p "Type 'DELETE' to confirm deletion: " confirmation

if [ "$confirmation" != "DELETE" ]; then
    echo ""
    echo "❌ Deletion cancelled. Databases are safe."
    exit 0
fi

echo ""
echo "🗑️  Deleting databases..."
echo ""

# Delete main databases
if [ -f "DLC_Database.db" ]; then
    rm -f DLC_Database.db
    echo "  ✓ Deleted: DLC_Database.db"
fi

if [ -f "dlc_database.db" ]; then
    rm -f dlc_database.db
    echo "  ✓ Deleted: dlc_database.db"
fi

# Delete DLCServer databases
if [ -f "DLCServer/database.db" ]; then
    rm -f DLCServer/database.db
    echo "  ✓ Deleted: DLCServer/database.db"
fi

if [ -f "DLCServer/Insertexceldata/dlc_portal_database.db" ]; then
    rm -f DLCServer/Insertexceldata/dlc_portal_database.db
    echo "  ✓ Deleted: DLCServer/Insertexceldata/dlc_portal_database.db"
fi

if [ -f "DLCServer/Insertexceldata/pensioner_dlc_portal.db" ]; then
    rm -f DLCServer/Insertexceldata/pensioner_dlc_portal.db
    echo "  ✓ Deleted: DLCServer/Insertexceldata/pensioner_dlc_portal.db"
fi

echo ""
echo "=========================================="
echo "✅ ALL DATABASES DELETED!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "  1. Start your server: npm start"
echo "  2. Fresh database tables will be created automatically"
echo "  3. Import your data using appropriate scripts"
echo ""
