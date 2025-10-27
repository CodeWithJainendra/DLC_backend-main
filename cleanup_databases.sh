#!/bin/bash

# Database Cleanup Script
# This script will backup and delete all existing database files

echo "=========================================="
echo "DLC Database Cleanup Script"
echo "=========================================="
echo ""

# Create backup directory with timestamp
BACKUP_DIR="database_backups/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup in: $BACKUP_DIR"
echo ""

# List of database files to backup and delete
DB_FILES=(
    "DLC_Database.db"
    "dlc_database.db"
    "DLCServer/database.db"
    "DLCServer/Insertexceldata/dlc_portal_database.db"
    "DLCServer/Insertexceldata/pensioner_dlc_portal.db"
)

# Backup existing databases
echo "🔄 Backing up existing databases..."
for db_file in "${DB_FILES[@]}"; do
    if [ -f "$db_file" ]; then
        file_size=$(du -h "$db_file" | cut -f1)
        echo "  ✓ Backing up: $db_file ($file_size)"
        cp "$db_file" "$BACKUP_DIR/"
    fi
done

echo ""
echo "✅ Backup completed: $BACKUP_DIR"
echo ""

# Ask for confirmation
read -p "⚠️  Are you sure you want to DELETE all database files? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo ""
    echo "❌ Operation cancelled. Databases are safe."
    echo "   Backup is still available at: $BACKUP_DIR"
    exit 0
fi

echo ""
echo "🗑️  Deleting database files..."

# Delete databases
for db_file in "${DB_FILES[@]}"; do
    if [ -f "$db_file" ]; then
        rm -f "$db_file"
        echo "  ✓ Deleted: $db_file"
    fi
done

echo ""
echo "=========================================="
echo "✅ Database Cleanup Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - All databases have been deleted"
echo "  - Backup available at: $BACKUP_DIR"
echo "  - Fresh database will be created on next server start"
echo ""
echo "Next Steps:"
echo "  1. Start your server: npm start"
echo "  2. New database tables will be created automatically"
echo "  3. Import your data using the appropriate scripts"
echo ""
