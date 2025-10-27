# Database Cleanup - Quick Reference

## 🎯 Your Current Situation

You have **5 database files** totaling **~1.75 GB**:

1. `DLC_Database.db` - 145 MB (Main app database)
2. `dlc_database.db` - 0 KB (Empty)
3. `DLCServer/database.db` - 1.6 GB (Large pensioner data)
4. `DLCServer/Insertexceldata/dlc_portal_database.db` - 7.6 MB
5. `DLCServer/Insertexceldata/pensioner_dlc_portal.db` - 52 KB

---

## ⚡ Quick Cleanup Options

### Option 1: Safe Cleanup (with Backup) ✅ RECOMMENDED
```bash
./cleanup_databases.sh
```
- Creates timestamped backup
- Asks for confirmation
- Deletes all databases
- Shows summary

### Option 2: Direct Deletion (No Backup)
```bash
./DELETE_ALL_DATABASES.sh
```
- No backup created
- Requires typing "DELETE" to confirm
- Faster execution

### Option 3: Manual One-Liner
```bash
rm -f DLC_Database.db dlc_database.db DLCServer/database.db DLCServer/Insertexceldata/*.db && echo "✅ All databases deleted!"
```

---

## 📋 Step-by-Step Process

### Step 1: Stop Your Server (if running)
```bash
# If using PM2
pm2 stop all

# If running directly
# Press Ctrl+C in the terminal running the server
```

### Step 2: Run Cleanup Script
```bash
cd /data1/jainendra/DLC_backend-main
./DELETE_ALL_DATABASES.sh
```

### Step 3: Verify Deletion
```bash
find . -name "*.db" -type f
# Should show no results
```

### Step 4: Start Fresh
```bash
npm start
# or
pm2 start server.js --name dlc-server
```

---

## 🆕 What Happens After Deletion?

### Automatic Table Creation

When you start the server, these tables will be **automatically created**:

#### Authentication & User Management
- ✅ `users` (with phone_number support)
- ✅ `roles` (user roles)
- ✅ `user_sessions` (active sessions)
- ✅ `user_activity_log` (audit trail)
- ✅ `otp_records` (OTP verification) **NEW**

#### Pension Data Tables
- ✅ `pensioner_bank_master`
- ✅ `TBL_DOPPW_ADDRESS_MST`
- ✅ `TBL_DOPPW_BRANCH_MST`
- ✅ `TBL_DOPPW_DLCDATA_MST`
- ✅ `TBL_DOPPW_DLCDATA_ARCH`
- ✅ `sbi_batch_data`
- ✅ `sbi_verification_records`

---

## 🔄 After Fresh Start

### 1. Verify Database Creation
```bash
ls -lh DLC_Database.db
# Should show a new small database file
```

### 2. Check Tables
```bash
sqlite3 DLC_Database.db ".tables"
# Should list all tables
```

### 3. Import Your Data
```bash
# For Excel files
node scripts/importDOPPWData.js path/to/file.xlsx

# For specific data types
# Use your appropriate import scripts
```

---

## 📊 Database Size Comparison

### Before Cleanup
```
Total: ~1.75 GB
- DLC_Database.db: 145 MB
- DLCServer/database.db: 1.6 GB
- Other files: ~8 MB
```

### After Fresh Start
```
Total: ~100 KB (empty tables)
- DLC_Database.db: ~100 KB (schema only)
```

---

## ⚠️ Important Notes

1. **Backup**: The `cleanup_databases.sh` script creates backups automatically
2. **No Undo**: Manual deletion cannot be undone without backups
3. **Server Stop**: Always stop the server before deleting databases
4. **Auto-Creation**: Tables are created automatically on server start
5. **Data Import**: Plan your data import strategy before cleanup

---

## 🛠️ Troubleshooting

### "Database is locked"
```bash
# Find processes using the database
lsof | grep DLC_Database.db

# Kill the process
kill -9 <PID>
```

### "Permission denied"
```bash
# Fix permissions
chmod 644 *.db
rm -f *.db
```

### Database not recreated
```bash
# Check server logs
npm start

# Look for:
# "🔧 Initializing database..."
# "✅ Database initialized"
```

---

## 📁 Files Created for You

1. **cleanup_databases.sh** - Safe cleanup with backup
2. **DELETE_ALL_DATABASES.sh** - Direct deletion script
3. **DATABASE_CLEANUP_GUIDE.md** - Detailed guide
4. **CLEANUP_SUMMARY.md** - This quick reference

---

## ✅ Ready to Clean?

Run this command:
```bash
./DELETE_ALL_DATABASES.sh
```

Type `DELETE` when prompted, and you're done!

---

**Created**: January 24, 2025  
**Status**: Ready for cleanup  
**Total Size to Delete**: ~1.75 GB
