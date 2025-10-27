#!/usr/bin/env node

/**
 * Import Excel files to pension_data table
 * This script imports data from various Excel files into the pension_data table
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
    // BOB format - map to pension_data schema
    normalizedRow.PPO_UNIQUE_ID = row['PPO NUMBER'];
    normalizedRow.YEAR_OF_BIRTH = extractYearFromDOB(row['DOB REGULAR']);
    normalizedRow.PSA = row['PSA'];
    normalizedRow.PDA = row['PDA and  name of disbursing bank'];
    normalizedRow.BRANCH_NAME = row['BRANCH_NAME'];
    normalizedRow.BRANCH_PINCODE = row['Branch POST_CODE'];
    normalizedRow.PENSIONER_DISTRICT_NAME = row['Pensioner CITY'];
    normalizedRow.PENSIONER_STATE_NAME = row['STATE'];
    normalizedRow.PENSIONER_PINCODE = row['Pensioner POST_CODE'];
    // Set some default values for required fields
    normalizedRow.LEVEL1 = 'BOB';
    normalizedRow.DATA_DATE = new Date().toISOString().split('T')[0];
  } else if (sourceFile.includes('Dashborad_DLC_Data')) {
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
    normalizedRow.DATA_DATE = new Date().toISOString().split('T')[0];
  } else if (sourceFile.includes('UBI')) {
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
    normalizedRow.DATA_DATE = new Date().toISOString().split('T')[0];
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
  
  // Return processed row with validation status
  return {
    ...normalizedRow,
    _valid: validationErrors.length === 0,
    _validationErrors: validationErrors,
    _sourceFile: path.basename(sourceFile)
  };
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

/**
 * Import data from Excel file to pension_data table
 */
async function importExcelFile(filePath) {
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
          for (const row of validRows) {
            insertStmt.run([
              row.PPO_UNIQUE_ID || '',
              row.YEAR_OF_BIRTH || null,
              row.PSA || '',
              row.PDA || '',
              row.BRANCH_NAME || '',
              row.BRANCH_PINCODE || '',
              row.PENSIONER_DISTRICT_NAME || '',
              row.PENSIONER_STATE_NAME || '',
              row.PENSIONER_PINCODE || '',
              row.LEVEL1 || '',
              row.DATA_DATE || new Date().toISOString().split('T')[0]
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

  // Close database connection
  database.close();
  
  return { 
    processed: totalProcessed, 
    imported: totalImported, 
    skipped: totalSkipped 
  };
}

// Main function to import all files
async function importAllFiles() {
  // List of Excel files to import
  const excelFiles = [
    '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx',
    '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx',
    '/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx',
    '/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx',
    '/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx',
    '/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx'
  ];

  console.log('🚀 Starting pension data import process...\n');
  
  let totalProcessed = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  
  // Process each Excel file
  for (const filePath of excelFiles) {
    try {
      const result = await importExcelFile(filePath);
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
}

// Run if called directly
if (require.main === module) {
  const filePath = process.argv[2];
  
  if (filePath) {
    // Import single file
    importExcelFile(filePath)
      .then(result => {
        console.log('\n' + '='.repeat(60));
        console.log('📊 IMPORT SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total rows processed: ${result.processed}`);
        console.log(`✅ Successfully imported: ${result.imported}`);
        console.log(`❌ Skipped/Invalid: ${result.skipped}`);
        console.log('='.repeat(60));
        console.log('\n✨ Import process completed!');
        process.exit(0);
      })
      .catch(err => {
        console.error('\n💥 Error during import:', err);
        process.exit(1);
      });
  } else {
    // Import all files
    importAllFiles()
      .then(() => {
        console.log('\n✨ Import process completed!');
        process.exit(0);
      })
      .catch(err => {
        console.error('\n💥 Error during import:', err);
        process.exit(1);
      });
  }
}

module.exports = { importExcelFile, importAllFiles };