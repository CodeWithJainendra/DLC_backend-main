#!/usr/bin/env node

/**
 * Debug import script to test insertion
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { database, initDatabase } = require('../config/database');

function debugImport() {
  console.log('🔍 Debugging import process...');
  
  const filePath = '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx';
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return;
  }

  console.log('📖 Reading Excel file...');
  const workbook = XLSX.readFile(filePath);
  console.log(`📋 Found ${workbook.SheetNames.length} sheets`);

  initDatabase();
  const db = database.getDB();
  
  const sheetName = workbook.SheetNames[0];
  console.log(`📄 Processing sheet: ${sheetName}`);
  const worksheet = workbook.Sheets[sheetName];
  
  if (!worksheet || !worksheet['!ref']) {
    console.log('⚠️ Empty sheet - skipping');
    database.close();
    return;
  }

  // Convert to JSON with proper handling
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  if (jsonData.length === 0) {
    console.log('⚠️ No data rows - skipping');
    database.close();
    return;
  }

  console.log(`📊 ${jsonData.length} rows to process`);
  
  // Process just the first 5 rows for debugging
  const sampleRows = jsonData.slice(0, 5);
  console.log('🔍 Processing first 5 rows for debugging...');
  
  const insertStmt = db.prepare(`
    INSERT INTO pension_data (
      PPO_UNIQUE_ID, YEAR_OF_BIRTH, PSA, PDA, BRANCH_NAME,
      BRANCH_PINCODE, PENSIONER_DISTRICT_NAME, PENSIONER_STATE_NAME, 
      PENSIONER_PINCODE, LEVEL1, DATA_DATE
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    try {
      let importedCount = 0;
      for (const row of sampleRows) {
        console.log(`Processing row:`, row);
        
        // Map fields for BOB format
        const ppo = row['PPO NUMBER'] || '';
        const dob = row['DOB REGULAR'] || '';
        const psa = row['PSA'] || '';
        const pda = row['PDA and  name of disbursing bank'] || '';
        const branchName = row['BRANCH_NAME'] || '';
        const branchPincode = row['Branch POST_CODE'] || '';
        const district = row['Pensioner CITY'] || '';
        const state = row['STATE'] || '';
        const pincode = row['Pensioner POST_CODE'] || '';
        
        console.log(`Mapped values: PPO=${ppo}, DOB=${dob}, PSA=${psa}, PDA=${pda}, BRANCH=${branchName}, PIN=${branchPincode}, DISTRICT=${district}, STATE=${state}, P_PIN=${pincode}`);
        
        insertStmt.run([
          ppo,
          extractYearFromDOB(dob),
          psa,
          pda,
          branchName,
          branchPincode,
          district,
          state,
          pincode,
          'BOB',
          new Date().toISOString().split('T')[0]
        ], function(err) {
          if (err) {
            console.log(`❌ Error inserting row: ${err.message}`);
          } else {
            console.log(`✅ Inserted row with ID: ${this.lastID}`);
            importedCount++;
          }
        });
      }
      
      db.run('COMMIT', (err) => {
        if (err) {
          console.log(`❌ Error committing: ${err.message}`);
        } else {
          console.log(`✅ Successfully inserted ${importedCount} rows`);
        }
        
        insertStmt.finalize();
        database.close();
      });
    } catch (error) {
      db.run('ROLLBACK');
      console.log(`❌ Transaction failed: ${error.message}`);
      insertStmt.finalize();
      database.close();
    }
  });
}

/**
 * Extract year from DOB string
 */
function extractYearFromDOB(dobStr) {
  if (!dobStr) return null;
  
  // Handle different date formats
  const dateRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/;
  const match = dobStr.match(dateRegex);
  
  if (match) {
    const year = match[3];
    // Handle 2-digit years
    if (year.length === 2) {
      const fullYear = parseInt(year) > 50 ? '19' + year : '20' + year;
      return parseInt(fullYear);
    }
    return parseInt(year);
  }
  
  return null;
}

debugImport();