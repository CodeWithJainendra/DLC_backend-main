#!/usr/bin/env node

/**
 * Simple Database Migration Script
 * Migrates data from my_db.db to DLC_Database.db
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('🚀 Starting simple database migration...');

// Connect to both databases
const sourceDb = new sqlite3.Database(path.join(__dirname, '..', 'my_db.db'));
const targetDb = new sqlite3.Database(path.join(__dirname, '..', 'DLC_Database.db'));

console.log('✅ Connected to both databases');

// Function to copy table data
function copyTableData(sourceDb, targetDb, tableName, callback) {
  console.log(`\n🔄 Migrating table: ${tableName}`);
  
  // First, get the count of records in source
  sourceDb.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
    if (err) {
      console.error(`❌ Error getting count for ${tableName}:`, err.message);
      callback();
      return;
    }
    
    const totalRecords = row.count;
    console.log(`📊 Found ${totalRecords} records in ${tableName}`);
    
    if (totalRecords === 0) {
      console.log(`✅ No data to migrate for ${tableName}`);
      callback();
      return;
    }
    
    // Copy all data
    const selectQuery = `SELECT * FROM ${tableName}`;
    let migratedRecords = 0;
    let errorRecords = 0;
    
    sourceDb.each(selectQuery, [], (err, row) => {
      if (err) {
        console.error(`❌ Error reading row from ${tableName}:`, err.message);
        errorRecords++;
        return;
      }
      
      // Get column names
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      const insertQuery = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      
      // Get values in the same order as columns
      const values = columns.map(col => row[col]);
      
      targetDb.run(insertQuery, values, (err) => {
        if (err) {
          console.error(`❌ Error inserting row into ${tableName}:`, err.message);
          errorRecords++;
        } else {
          migratedRecords++;
        }
        
        // Show progress
        if ((migratedRecords + errorRecords) % 10000 === 0 || (migratedRecords + errorRecords) === totalRecords) {
          console.log(`   Progress: ${migratedRecords + errorRecords}/${totalRecords} records processed`);
        }
        
        // Check if we're done
        if ((migratedRecords + errorRecords) === totalRecords) {
          console.log(`✅ Migrated ${migratedRecords} records to ${tableName} (${errorRecords} errors)`);
          callback();
        }
      });
    }, (err, numRows) => {
      if (err) {
        console.error(`❌ Error querying ${tableName}:`, err.message);
        callback();
      }
    });
  });
}

// List of tables to migrate (in order of dependency)
const tablesToMigrate = [
  'roles',
  'users',
  'user_sessions',
  'user_activity_log',
  'pensioner_bank_master',
  'TBL_DOPPW_ADDRESS_MST',
  'TBL_DOPPW_BRANCH_MST',
  'TBL_DOPPW_DLCDATA_MST',
  'TBL_DOPPW_DLCDATA_ARCH',
  'sbi_batch_data',
  'sbi_verification_records',
  'doppw_comprehensive_data',
  'doppw_sheet_metadata',
  'doppw_all_sheets_data',
  'doppw_sheet_summary'
];

// Function to migrate all tables sequentially
function migrateAllTables(index = 0) {
  if (index >= tablesToMigrate.length) {
    console.log('\n🎉 All tables migrated successfully!');
    sourceDb.close();
    targetDb.close();
    console.log('✅ Database connections closed');
    return;
  }
  
  const tableName = tablesToMigrate[index];
  
  // Check if table exists in source
  sourceDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [tableName], (err, row) => {
    if (err || !row) {
      console.log(`⚠️  Table ${tableName} does not exist in source database, skipping...`);
      migrateAllTables(index + 1);
      return;
    }
    
    // First ensure the table exists in target database
    sourceDb.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [tableName], (err, row) => {
      if (err || !row) {
        console.log(`⚠️  Could not get schema for ${tableName}, skipping...`);
        migrateAllTables(index + 1);
        return;
      }
      
      // Create table in target if it doesn't exist
      const createTableSQL = row.sql.replace(/CREATE TABLE\s+(\w+)/i, `CREATE TABLE IF NOT EXISTS ${tableName}`);
      targetDb.run(createTableSQL, (err) => {
        if (err) {
          console.error(`❌ Error creating table ${tableName}:`, err.message);
          migrateAllTables(index + 1);
          return;
        }
        
        // Now copy the data
        copyTableData(sourceDb, targetDb, tableName, () => {
          migrateAllTables(index + 1);
        });
      });
    });
  });
}

// Start the migration process
console.log('📋 Tables to migrate:', tablesToMigrate.join(', '));
migrateAllTables();