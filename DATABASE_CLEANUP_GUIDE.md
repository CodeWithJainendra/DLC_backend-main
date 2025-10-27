# Database Cleanup Guide

## Overview
This guide will help you completely delete all existing databases and start fresh with new table structures.

---

## Current Database Files

Your system has the following database files:

1. **Main Application Database**
   - `DLC_Database.db` (145 MB) - Main authentication and application database
   - `dlc_database.db` (0 KB) - Empty database file

2. **DLCServer Databases**
   - `DLCServer/database.db` (1.6 GB) - Large pensioner data database
   - `DLCServer/Insertexceldata/dlc_portal_database.db`
   - `DLCServer/Insertexceldata/pensioner_dlc_portal.db`

---

## Option 1: Automated Cleanup (Recommended)

### Step 1: Run the Cleanup Script
```bash
cd /data1/jainendra/DLC_backend-main
./cleanup_databases.sh
```

This script will:
- ✅ Create a timestamped backup of all databases
- ✅ Ask for confirmation before deleting
- ✅ Delete all database files
- ✅ Show summary of actions taken

### Step 2: Verify Deletion
```bash
ls -lh *.db
ls -lh DLCServer/*.db
```

You should see "No such file or directory" for all database files.

---

## Option 2: Manual Cleanup

### Step 1: Create Backup (Optional but Recommended)
```bash
# Create backup directory
mkdir -p database_backups/backup_$(date +%Y%m%d_%H%M%S)

# Backup main databases
cp DLC_Database.db database_backups/backup_$(date +%Y%m%d_%H%M%S)/ 2>/dev/null
cp dlc_database.db database_backups/backup_$(date +%Y%m%d_%H%M%S)/ 2>/dev/null
cp DLCServer/database.db database_backups/backup_$(date +%Y%m%d_%H%M%S)/ 2>/dev/null
```

### Step 2: Delete All Databases
```bash
# Delete main databases
rm -f DLC_Database.db
rm -f dlc_database.db

# Delete DLCServer databases
rm -f DLCServer/database.db
rm -f DLCServer/Insertexceldata/dlc_portal_database.db
rm -f DLCServer/Insertexceldata/pensioner_dlc_portal.db

echo "✅ All databases deleted!"
```

### Step 3: Verify Deletion
```bash
find . -name "*.db" -type f
```

---

## Option 3: Quick Delete (No Backup)

⚠️ **WARNING**: This will permanently delete all databases without backup!

```bash
cd /data1/jainendra/DLC_backend-main

# Delete all .db files
rm -f DLC_Database.db dlc_database.db
rm -f DLCServer/database.db
rm -f DLCServer/Insertexceldata/*.db

echo "✅ All databases deleted!"
```

---

## After Deletion: Fresh Start

### 1. Database Tables Will Be Auto-Created

When you start your server, these tables will be automatically created:

#### Authentication Tables (in `DLC_Database.db`)
- `users` - User accounts with phone_number support
- `roles` - User roles and permissions
- `user_sessions` - Active user sessions
- `user_activity_log` - Activity audit log
- `otp_records` - OTP verification records (NEW)

#### Pension Data Tables
- `pensioner_bank_master` - Bank and pensioner data
- `TBL_DOPPW_ADDRESS_MST` - DOPPW address master
- `TBL_DOPPW_BRANCH_MST` - DOPPW branch master
- `TBL_DOPPW_DLCDATA_MST` - DOPPW DLC data master
- `TBL_DOPPW_DLCDATA_ARCH` - DOPPW DLC data archive
- `sbi_batch_data` - SBI batch information
- `sbi_verification_records` - SBI verification records

### 2. Start Your Server

```bash
# Start the server (tables will be created automatically)
npm start

# Or with PM2
pm2 start server.js --name dlc-server
```

### 3. Verify New Database

```bash
# Check if new database is created
ls -lh DLC_Database.db

# Check tables in new database
sqlite3 DLC_Database.db ".tables"
```

### 4. Import Your Data

After the fresh database is created, import your data:

```bash
# For Excel data
node scripts/importDOPPWData.js path/to/your/file.xlsx

# For other data sources
# Use your specific import scripts
```

---

## Database Schema Information

### New Tables Added (with OTP Implementation)

#### `otp_records` Table
```sql
CREATE TABLE otp_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_no VARCHAR(15) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  generated_at DATETIME NOT NULL,
  expired_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT 0,
  verified_at DATETIME,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Updated `users` Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE,              -- Now optional
  phone_number VARCHAR(15) UNIQUE,        -- NEW field
  password_hash VARCHAR(255),             -- Now optional
  full_name VARCHAR(100) NOT NULL,
  role_id INTEGER NOT NULL,
  phone_verified BOOLEAN DEFAULT 0,       -- NEW field
  ...
);
```

---

## Troubleshooting

### Issue: "Database is locked"
```bash
# Kill any processes using the database
lsof | grep DLC_Database.db
kill -9 <PID>

# Then try deletion again
rm -f DLC_Database.db
```

### Issue: "Permission denied"
```bash
# Check file permissions
ls -l *.db

# Fix permissions if needed
sudo chown $USER:$USER *.db
chmod 644 *.db

# Then try deletion again
```

### Issue: Database not recreated after deletion
```bash
# Check server logs
npm start

# Look for database initialization messages:
# "🔧 Initializing database..."
# "✅ Database initialized"
```

---

## Backup Management

### List All Backups
```bash
ls -lh database_backups/
```

### Restore from Backup
```bash
# Copy backup back to main location
cp database_backups/backup_YYYYMMDD_HHMMSS/DLC_Database.db ./

# Restart server
npm start
```

### Delete Old Backups
```bash
# Delete backups older than 30 days
find database_backups/ -type d -mtime +30 -exec rm -rf {} \;
```

---

## Summary Commands

### Quick Cleanup (with backup)
```bash
./cleanup_databases.sh
```

### Quick Cleanup (no backup)
```bash
rm -f DLC_Database.db dlc_database.db DLCServer/database.db DLCServer/Insertexceldata/*.db
```

### Verify Deletion
```bash
find . -name "*.db" -type f
```

### Start Fresh
```bash
npm start
```

---

## Important Notes

1. **Backup First**: Always create a backup before deleting databases
2. **Stop Server**: Stop your server before deleting databases
3. **Check Dependencies**: Ensure no other processes are using the databases
4. **Fresh Start**: New tables will be created automatically on server start
5. **Data Import**: Plan your data import strategy before cleanup

---

**Last Updated**: January 24, 2025  
**Status**: Ready for cleanup
