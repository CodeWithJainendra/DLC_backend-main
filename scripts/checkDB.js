#!/usr/bin/env node

/**
 * Simple script to check database connection and count
 */

const { database, initDatabase } = require('../config/database');

function checkDatabase() {
  console.log('🔍 Checking database connection...');
  
  initDatabase();
  const db = database.getDB();
  
  db.get("SELECT COUNT(*) as count FROM pension_data", (err, row) => {
    if (err) {
      console.log(`❌ Error: ${err.message}`);
    } else {
      console.log(`✅ Database connection successful!`);
      console.log(`📊 Records in pension_data: ${row.count}`);
    }
    
    // Also check pensioner_bank_master
    db.get("SELECT COUNT(*) as count FROM pensioner_bank_master", (err, row2) => {
      if (err) {
        console.log(`❌ Error checking pensioner_bank_master: ${err.message}`);
      } else {
        console.log(`📊 Records in pensioner_bank_master: ${row2.count}`);
      }
      
      database.close();
    });
  });
}

checkDatabase();