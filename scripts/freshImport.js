#!/usr/bin/env node

/**
 * Fresh import script to import all Excel files into pension_data table
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { database, initDatabase } = require('../config/database');

// List of Excel files to import
const excelFiles = [
  '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx',
  '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx',
  '/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx'
];

// Invalid pincode patterns to filter out
const INVALID_PINCODES = ['111111', '999999', '000000'];

// Invalid state/district names to filter out
const INVALID_NAMES = ['null', 'undefined', '', ' ', 'na', 'n/a', 'nil'];

/**
 * Validate pincode
 */
function isValidPincode(pincode) {
  if (!pincode) return false;
  
  const pincodeStr = String(pincode).trim();
  
  // Check if it's a valid 6-digit number
  if (!/^\d{6}$/.test(pincodeStr)) return false;
  
  // Check against invalid pincodes
  if (INVALID_PINCODES.includes(pincodeStr)) return false;
  
  return true;
}

/**
 * Validate name (state, district, city, etc.)
 */
function isValidName(name) {
  if (!name) return false;
  
  const nameStr = String(name).trim().toLowerCase();
  
  // Check against invalid names
  if (INVALID_NAMES.includes(nameStr)) return false;
  
  // Check if it's not just spaces
  if (nameStr.length === 0) return false;
  
  return true;
}

/**
 * Clean and normalize text data
 */
function cleanText(text) {
  if (!text) return '';
  
  return String(text)
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\s+$/, '') // Trim trailing spaces
    .replace(/^\s+/, ''); // Trim leading spaces
}

/**
 * Extract year from DOB string
 */
function extractYearFromDOB(dobStr) {
  if (!dobStr) return null;
  
  // Handle different date formats
  const dateRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/;
  const match = String(dobStr).match(dateRegex);
  
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

/**
 * Process data row based on file type
 */
function processRow(row, fileName) {
  const normalizedRow = {};
  
  if (fileName.includes('BOB')) {
    // BOB format
    normalizedRow.PPO_UNIQUE_ID = row['PPO NUMBER'];
    normalizedRow.YEAR_OF_BIRTH = extractYearFromDOB(row['DOB REGULAR']);
    normalizedRow.PSA = row['PSA'];
    normalizedRow.PDA = row['PDA and  name of disbursing bank'];
    normalizedRow.BRANCH_NAME = row['BRANCH_NAME'];
    normalizedRow.BRANCH_PINCODE = row['Branch POST_CODE'];
    normalizedRow.PENSIONER_DISTRICT_NAME = row['Pensioner CITY'];
    normalizedRow.PENSIONER_STATE_NAME = row['STATE'];
    normalizedRow.PENSIONER_PINCODE = row['Pensioner POST_CODE'];
    normalizedRow.LEVEL1 = 'BOB';
  } else if (fileName.includes('Dashborad_DLC_Data')) {
    // Dashboard DLC format
    normalizedRow.PPO_UNIQUE_ID = row['PPO_NO'];
    normalizedRow.YEAR_OF_BIRTH = extractYearFromDOB(row['DATE_OF_BIRTH']);
    normalizedRow.PSA = row['PSA'];
    normalizedRow.PDA = row['PDA'];
    normalizedRow.BRANCH_NAME = row['NAME_OF_BANK_BRANCH_OF_PENSIONER'];
    normalizedRow.BRANCH_PINCODE = row['BRANCH_PINCODE'];
    normalizedRow.PENSIONER_DISTRICT_NAME = row['PENSIONER_CITY'];
    normalizedRow.PENSIONER_STATE_NAME = row['PENSIONER_STATE'];
    normalizedRow.PENSIONER_PINCODE = row['PENSIONER_PINCODE'];
    normalizedRow.LEVEL1 = 'DASHBOARD';
  } else if (fileName.includes('UBI')) {
    // UBI format (handle variations)
    normalizedRow.PPO_UNIQUE_ID = row['PPO No.'] || row['PPO No'] || row['PPO_NO'];
    normalizedRow.YEAR_OF_BIRTH = extractYearFromDOB(row['Date of Birth'] || row['DOB'] || row['DATE_OF_BIRTH']);
    normalizedRow.PSA = row['PSA'];
    normalizedRow.PDA = row['PDA'] || row['PDA and  name of disbursing bank'];
    normalizedRow.BRANCH_NAME = row['Name of Bank Branch of pesioner'] || row['NAME_OF_BANK_BRANCH_OF_PENSIONER'] || row['Name of Bank Branch of pensioner'];
    normalizedRow.BRANCH_PINCODE = row['Branch Pincode'] || row['Pincode'] || row['BRANCH_PINCODE'];
    normalizedRow.PENSIONER_DISTRICT_NAME = row['Pensioners City'] || row['Pensioner City'] || row['PENSIONER_CITY'];
    normalizedRow.PENSIONER_STATE_NAME = row['State'] || row['STATE'] || row['PENSIONER_STATE'];
    normalizedRow.PENSIONER_PINCODE = row['Pensioner Pincode'] || row['PENSIONER_PINCODE'];
    normalizedRow.LEVEL1 = 'UBI';
  }
  
  // Apply cleaning to all fields
  Object.keys(normalizedRow).forEach(key => {
    if (normalizedRow[key] !== undefined && normalizedRow[key] !== null) {
      normalizedRow[key] = cleanText(normalizedRow[key]);
    }
  });
  
  // Validation checks
  const validationErrors = [];
  
  // Check pincode validity
  if (normalizedRow.BRANCH_PINCODE && !isValidPincode(normalizedRow.BRANCH_PINCODE)) {
    validationErrors.push('Invalid branch postcode');
  }
  
  if (normalizedRow.PENSIONER_PINCODE && !isValidPincode(normalizedRow.PENSIONER_PINCODE)) {
    validationErrors.push('Invalid pensioner postcode');
  }
  
  // Check name validity
  if (normalizedRow.PENSIONER_STATE_NAME && !isValidName(normalizedRow.PENSIONER_STATE_NAME)) {
    validationErrors.push('Invalid state name');
  }
  
  if (normalizedRow.PENSIONER_DISTRICT_NAME && !isValidName(normalizedRow.PENSIONER_DISTRICT_NAME)) {
    validationErrors.push('Invalid district name');
  }
  
  if (normalizedRow.BRANCH_NAME && !isValidName(normalizedRow.BRANCH_NAME)) {
    validationErrors.push('Invalid branch name');
  }
  
  return {
    ...normalizedRow,
    _valid: validationErrors.length === 0,
    _validationErrors: validationErrors,
    _fileName: path.basename(fileName)
  };
}

/**
 * Import a single Excel file
 */
async function importFile(filePath) {
  console.log(`\n📁 Processing file: ${path.basename(filePath)}`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  File not found: ${filePath}`);
    return { processed: 0, imported: 0, skipped: 0 };
  }

  console.log('   📖 Reading Excel file...');
  const workbook = XLSX.readFile(filePath);
  console.log(`   📋 Found ${workbook.SheetNames.length} sheets`);

  initDatabase();
  const db = database.getDB();
  
  let totalProcessed = 0;
  let totalImported = 0;
  let totalSkipped = 0;

  for (const sheetName of workbook.SheetNames) {
    console.log(`   📄 Processing sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet || !worksheet['!ref']) {
      console.log('      ⚠️  Empty sheet - skipping');
      continue;
    }

    // Convert to JSON with proper handling
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    
    if (jsonData.length === 0) {
      console.log('      ⚠️  No data rows - skipping');
      continue;
    }

    console.log(`      📊 ${jsonData.length} rows to process`);
    
    // Prepare insert statement
    const insertStmt = db.prepare(`
      INSERT INTO pension_data (
        PPO_UNIQUE_ID, YEAR_OF_BIRTH, PSA, PDA, BRANCH_NAME,
        BRANCH_PINCODE, PENSIONER_DISTRICT_NAME, PENSIONER_STATE_NAME, 
        PENSIONER_PINCODE, LEVEL1, DATA_DATE
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE('now'))
    `);
    
    // Process rows in batches to avoid memory issues
    const batchSize = 1000;
    let batch = [];
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      try {
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          totalProcessed++;
          const processedRow = processRow(row, filePath);
          
          if (processedRow._valid) {
            batch.push(processedRow);
            
            // When batch is full or we've reached the end, insert it
            if (batch.length >= batchSize || i === jsonData.length - 1) {
              for (const batchRow of batch) {
                insertStmt.run([
                  batchRow.PPO_UNIQUE_ID || '',
                  batchRow.YEAR_OF_BIRTH || null,
                  batchRow.PSA || '',
                  batchRow.PDA || '',
                  batchRow.BRANCH_NAME || '',
                  batchRow.BRANCH_PINCODE || '',
                  batchRow.PENSIONER_DISTRICT_NAME || '',
                  batchRow.PENSIONER_STATE_NAME || '',
                  batchRow.PENSIONER_PINCODE || '',
                  batchRow.LEVEL1 || ''
                ]);
                totalImported++;
              }
              batch = []; // Reset batch
            }
          } else {
            totalSkipped++;
          }
        }
        
        db.run('COMMIT');
        insertStmt.finalize();
        console.log(`      💾 Imported ${totalImported} rows to database`);
      } catch (error) {
        db.run('ROLLBACK');
        console.log(`      ❌ Transaction failed: ${error.message}`);
        insertStmt.finalize();
      }
    });
  }

  database.close();
  
  return { 
    processed: totalProcessed, 
    imported: totalImported, 
    skipped: totalSkipped 
  };
}

/**
 * Import all files
 */
async function importAllFiles() {
  console.log('🚀 Starting fresh pension data import process...\n');
  
  let totalProcessed = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  
  // Process each Excel file
  for (const filePath of excelFiles) {
    try {
      const result = await importFile(filePath);
      totalProcessed += result.processed;
      totalImported += result.imported;
      totalSkipped += result.skipped;
      
      console.log(`   ✅ Processed: ${result.imported} imported, ${result.skipped} skipped`);
    } catch (error) {
      console.log(`❌ Error processing ${filePath}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total rows processed: ${totalProcessed}`);
  console.log(`✅ Successfully imported: ${totalImported}`);
  console.log(`❌ Skipped/Invalid: ${totalSkipped}`);
  console.log('='.repeat(60));
  
  // Show final count
  initDatabase();
  const db = database.getDB();
  db.get("SELECT COUNT(*) as count FROM pension_data", (err, row) => {
    if (err) {
      console.log(`❌ Error getting final count: ${err.message}`);
    } else {
      console.log(`\n📈 Total records in database: ${row.count}`);
    }
    database.close();
  });
}

// Run if called directly
if (require.main === module) {
  const filePath = process.argv[2];
  
  if (filePath) {
    // Import single file
    importFile(filePath)
      .then(result => {
        console.log('\n' + '='.repeat(60));
        console.log('📊 IMPORT SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total rows processed: ${result.processed}`);
        console.log(`✅ Successfully imported: ${result.imported}`);
        console.log(`❌ Skipped/Invalid: ${result.skipped}`);
        console.log('='.repeat(60));
        
        // Show final count
        initDatabase();
        const db = database.getDB();
        db.get("SELECT COUNT(*) as count FROM pension_data", (err, row) => {
          if (err) {
            console.log(`❌ Error getting final count: ${err.message}`);
          } else {
            console.log(`\n📈 Total records in database: ${row.count}`);
          }
          database.close();
          
          console.log('\n✨ Import process completed!');
          process.exit(0);
        });
      })
      .catch(err => {
        console.error('\n💥 Error during import:', err);
        process.exit(1);
      });
  } else {
    // Import all files
    importAllFiles()
      .then(() => {
        console.log('\n✨ Fresh import process completed!');
        process.exit(0);
      })
      .catch(err => {
        console.error('\n💥 Error during import:', err);
        process.exit(1);
      });
  }
}

module.exports = { importFile, importAllFiles };