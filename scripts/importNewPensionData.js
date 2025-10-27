#!/usr/bin/env node

/**
 * New Pension Data Import Script
 * Imports data from various Excel files with data filtering
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { database, initDatabase } = require('../config/database');

// Invalid pincode patterns to filter out
const INVALID_PINCODES = ['111111', '999999', '000000'];

// Invalid state/district names to filter out
const INVALID_NAMES = ['null', 'undefined', '', ' ', 'na', 'n/a', 'nil'];

/**
 * Validate date format (DD-MM-YYYY or similar)
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  
  // Check if it looks like a date
  const dateRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/;
  return dateRegex.test(dateStr.trim());
}

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
 * Process and filter data row
 */
function processDataRow(row, sourceFile) {
  // Normalize column names for different Excel formats
  const normalizedRow = {};
  
  // Handle different Excel file formats
  if (sourceFile.includes('BOB')) {
    // BOB format
    normalizedRow.ppo_number = row['PPO NUMBER'];
    normalizedRow.pensioner_dob = row['DOB REGULAR'];
    normalizedRow.psa = row['PSA'];
    normalizedRow.pda = row['PDA and  name of disbursing bank'];
    normalizedRow.bank_name = row['PDA and  name of disbursing bank']; // Same as PDA
    normalizedRow.branch_name = row['BRANCH_NAME'];
    normalizedRow.branch_postcode = row['Branch POST_CODE'];
    normalizedRow.pensioner_city = row['Pensioner CITY'];
    normalizedRow.state = row['STATE'];
    normalizedRow.pensioner_postcode = row['Pensioner POST_CODE'];
  } else if (sourceFile.includes('Dashborad_DLC_Data')) {
    // Dashboard DLC format
    normalizedRow.ppo_number = row['PPO_NO'];
    normalizedRow.pensioner_dob = row['DATE_OF_BIRTH'];
    normalizedRow.psa = row['PSA'];
    normalizedRow.pda = row['PDA'];
    normalizedRow.bank_name = row['NAME_OF_BANK_DISBURSING_PENSION'];
    normalizedRow.branch_name = row['NAME_OF_BANK_BRANCH_OF_PENSIONER'];
    normalizedRow.branch_postcode = row['BRANCH_PINCODE'];
    normalizedRow.pensioner_city = row['PENSIONER_CITY'];
    normalizedRow.state = row['PENSIONER_STATE'];
    normalizedRow.pensioner_postcode = row['PENSIONER_PINCODE'];
  } else if (sourceFile.includes('UBI')) {
    // UBI format (handle variations)
    normalizedRow.ppo_number = row['PPO No.'] || row['PPO No'] || row['PPO_NO'];
    normalizedRow.pensioner_dob = row['Date of Birth'] || row['DOB'] || row['DATE_OF_BIRTH'];
    normalizedRow.psa = row['PSA'];
    normalizedRow.pda = row['PDA'] || row['PDA and  name of disbursing bank'];
    normalizedRow.bank_name = row['Name of Bank disbursing pension'] || row['NAME_OF_BANK_DISBURSING_PENSION'];
    normalizedRow.branch_name = row['Name of Bank Branch of pesioner'] || row['NAME_OF_BANK_BRANCH_OF_PENSIONER'] || row['Name of Bank Branch of pensioner'];
    normalizedRow.branch_postcode = row['Branch Pincode'] || row['Pincode'] || row['BRANCH_PINCODE'];
    normalizedRow.pensioner_city = row['Pensioners City'] || row['Pensioner City'] || row['PENSIONER_CITY'];
    normalizedRow.state = row['State'] || row['STATE'] || row['PENSIONER_STATE'];
    normalizedRow.pensioner_postcode = row['Pensioner Pincode'] || row['PENSIONER_PINCODE'];
  }
  
  // Apply cleaning to all fields
  Object.keys(normalizedRow).forEach(key => {
    if (normalizedRow[key] !== undefined && normalizedRow[key] !== null) {
      normalizedRow[key] = cleanText(normalizedRow[key]);
    }
  });
  
  // Validation checks
  const validationErrors = [];
  
  // Check DOB validity
  if (normalizedRow.pensioner_dob && !isValidDate(normalizedRow.pensioner_dob)) {
    validationErrors.push('Invalid DOB format');
  }
  
  // Check pincode validity
  if (normalizedRow.branch_postcode && !isValidPincode(normalizedRow.branch_postcode)) {
    validationErrors.push('Invalid branch postcode');
  }
  
  if (normalizedRow.pensioner_postcode && !isValidPincode(normalizedRow.pensioner_postcode)) {
    validationErrors.push('Invalid pensioner postcode');
  }
  
  // Check name validity
  if (normalizedRow.state && !isValidName(normalizedRow.state)) {
    validationErrors.push('Invalid state name');
  }
  
  if (normalizedRow.pensioner_city && !isValidName(normalizedRow.pensioner_city)) {
    validationErrors.push('Invalid city name');
  }
  
  if (normalizedRow.branch_name && !isValidName(normalizedRow.branch_name)) {
    validationErrors.push('Invalid branch name');
  }
  
  // Return processed row with validation status
  return {
    ...normalizedRow,
    _valid: validationErrors.length === 0,
    _validationErrors: validationErrors,
    _sourceFile: path.basename(sourceFile)
  };
}

/**
 * Import data from Excel file to database
 */
async function importExcelFile(filePath, db) {
  console.log(`\n📁 Processing file: ${path.basename(filePath)}`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  File not found: ${filePath}`);
    return { processed: 0, imported: 0, skipped: 0 };
  }

  console.log('   📖 Reading Excel file...');
  const workbook = XLSX.readFile(filePath);
  console.log(`   📋 Found ${workbook.SheetNames.length} sheets`);

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
    
    // Process each row
    const validRows = [];
    const invalidRows = [];
    
    for (const row of jsonData) {
      totalProcessed++;
      const processedRow = processDataRow(row, filePath);
      
      if (processedRow._valid) {
        validRows.push(processedRow);
      } else {
        invalidRows.push({
          row: processedRow,
          errors: processedRow._validationErrors
        });
      }
    }
    
    console.log(`      ✅ Valid rows: ${validRows.length}`);
    console.log(`      ❌ Invalid rows: ${invalidRows.length}`);
    
    // Insert valid rows into database
    if (validRows.length > 0) {
      const insertStmt = db.prepare(`
        INSERT INTO pensioner_bank_master (
          ppo_number, pensioner_dob, psa, pda, bank_name,
          branch_name, branch_postcode, pensioner_city, state, pensioner_postcode, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        try {
          let importedCount = 0;
          for (const row of validRows) {
            insertStmt.run([
              row.ppo_number || '',
              row.pensioner_dob || '',
              row.psa || '',
              row.pda || '',
              row.bank_name || '',
              row.branch_name || '',
              row.branch_postcode || '',
              row.pensioner_city || '',
              row.state || '',
              row.pensioner_postcode || '',
              row._sourceFile || ''
            ]);
            importedCount++;
          }
          
          db.run('COMMIT');
          console.log(`      💾 Imported ${importedCount} rows to database`);
          totalImported += importedCount;
        } catch (error) {
          db.run('ROLLBACK');
          console.log(`      ❌ Transaction failed: ${error.message}`);
          totalSkipped += validRows.length;
        } finally {
          insertStmt.finalize();
        }
      });
    }
    
    totalSkipped += invalidRows.length;
  }

  return { 
    processed: totalProcessed, 
    imported: totalImported, 
    skipped: totalSkipped 
  };
}

/**
 * Main import function
 */
async function importNewPensionData() {
  // List of Excel files to import
  const excelFiles = [
    '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx',
    '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx',
    '/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx',
    '/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx',
    '/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx',
    '/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx'
  ];

  console.log('🚀 Starting new pension data import process...\n');
  
  initDatabase();
  const db = database.getDB();
  
  let totalProcessed = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  
  // Process each Excel file
  for (const filePath of excelFiles) {
    try {
      const result = await importExcelFile(filePath, db);
      totalProcessed += result.processed;
      totalImported += result.imported;
      totalSkipped += result.skipped;
    } catch (error) {
      console.log(`❌ Error processing ${filePath}: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total rows processed: ${totalProcessed}`);
  console.log(`✅ Successfully imported: ${totalImported}`);
  console.log(`❌ Skipped/Invalid: ${totalSkipped}`);
  console.log('='.repeat(60));
  
  // Close database connection
  database.close();
}

// Run if called directly
if (require.main === module) {
  importNewPensionData()
    .then(() => {
      console.log('\n✨ Import process completed!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n💥 Error during import:', err);
      process.exit(1);
    });
}

module.exports = { importNewPensionData };