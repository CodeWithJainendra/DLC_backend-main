#!/usr/bin/env node

/**
 * Final import script to import all Excel files into pension_data table
 * This script will import all files one by one to avoid database locking issues
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { database, initDatabase } = require('../config/database');
const { spawn } = require('child_process');

// List of Excel files to import in order
const excelFiles = [
  '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx',
  '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx',
  '/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx'
];

/**
 * Import a single file using a separate process to avoid database locking
 */
function importSingleFile(filePath) {
  return new Promise((resolve, reject) => {
    console.log(`\n📁 Importing file: ${path.basename(filePath)}`);
    
    // Create a temporary script for this file
    const tempScript = `
      const XLSX = require('xlsx');
      const path = require('path');
      const fs = require('fs');
      const { database, initDatabase } = require('./config/database');
      
      function importFile() {
        const filePath = '${filePath}';
        console.log('   📖 Reading Excel file...');
        
        if (!fs.existsSync(filePath)) {
          console.log('   ⚠️  File not found');
          process.exit(1);
        }
        
        const workbook = XLSX.readFile(filePath);
        console.log('   📋 Found ' + workbook.SheetNames.length + ' sheets');
        
        initDatabase();
        const db = database.getDB();
        
        let totalImported = 0;
        
        workbook.SheetNames.forEach(sheetName => {
          console.log('   📄 Processing sheet: ' + sheetName);
          const worksheet = workbook.Sheets[sheetName];
          
          if (!worksheet || !worksheet['!ref']) {
            console.log('      ⚠️  Empty sheet - skipping');
            return;
          }
          
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          console.log('      📊 ' + jsonData.length + ' rows to process');
          
          // Prepare insert statement
          const insertStmt = db.prepare(\`
            INSERT INTO pension_data (
              PPO_UNIQUE_ID, YEAR_OF_BIRTH, PSA, PDA, BRANCH_NAME,
              BRANCH_PINCODE, PENSIONER_DISTRICT_NAME, PENSIONER_STATE_NAME, 
              PENSIONER_PINCODE, LEVEL1, DATA_DATE
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE('now'))
          \`);
          
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            try {
              let importedCount = 0;
              jsonData.forEach(row => {
                // Process row based on file type
                let ppo, year, psa, pda, branch, pin, district, state, pensionerPin, level;
                
                if (filePath.includes('BOB')) {
                  ppo = row['PPO NUMBER'] || '';
                  year = extractYear(row['DOB REGULAR']);
                  psa = row['PSA'] || '';
                  pda = row['PDA and  name of disbursing bank'] || '';
                  branch = row['BRANCH_NAME'] || '';
                  pin = row['Branch POST_CODE'] || '';
                  district = row['Pensioner CITY'] || '';
                  state = row['STATE'] || '';
                  pensionerPin = row['Pensioner POST_CODE'] || '';
                  level = 'BOB';
                } else if (filePath.includes('Dashborad_DLC_Data')) {
                  ppo = row['PPO_NO'] || '';
                  year = extractYear(row['DATE_OF_BIRTH']);
                  psa = row['PSA'] || '';
                  pda = row['PDA'] || '';
                  branch = row['NAME_OF_BANK_BRANCH_OF_PENSIONER'] || '';
                  pin = row['BRANCH_PINCODE'] || '';
                  district = row['PENSIONER_CITY'] || '';
                  state = row['PENSIONER_STATE'] || '';
                  pensionerPin = row['PENSIONER_PINCODE'] || '';
                  level = 'DASHBOARD';
                } else if (filePath.includes('UBI')) {
                  ppo = row['PPO No.'] || row['PPO No'] || row['PPO_NO'] || '';
                  year = extractYear(row['Date of Birth'] || row['DOB'] || row['DATE_OF_BIRTH']);
                  psa = row['PSA'] || '';
                  pda = row['PDA'] || row['PDA and  name of disbursing bank'] || '';
                  branch = row['Name of Bank Branch of pesioner'] || row['NAME_OF_BANK_BRANCH_OF_PENSIONER'] || row['Name of Bank Branch of pensioner'] || '';
                  pin = row['Branch Pincode'] || row['Pincode'] || row['BRANCH_PINCODE'] || '';
                  district = row['Pensioners City'] || row['Pensioner City'] || row['PENSIONER_CITY'] || '';
                  state = row['State'] || row['STATE'] || row['PENSIONER_STATE'] || '';
                  pensionerPin = row['Pensioner Pincode'] || row['PENSIONER_PINCODE'] || '';
                  level = 'UBI';
                }
                
                // Simple validation
                if (ppo || branch || state) {
                  insertStmt.run([
                    ppo, year, psa, pda, branch, pin, district, state, pensionerPin, level
                  ]);
                  importedCount++;
                }
              });
              
              db.run('COMMIT');
              insertStmt.finalize();
              console.log('      💾 Imported ' + importedCount + ' rows');
              totalImported += importedCount;
            } catch (error) {
              db.run('ROLLBACK');
              console.log('      ❌ Error: ' + error.message);
            }
          });
        });
        
        database.close();
        console.log('   ✅ Total imported from this file: ' + totalImported);
      }
      
      function extractYear(dateStr) {
        if (!dateStr) return null;
        const match = String(dateStr).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
        if (match) {
          const year = match[3];
          if (year.length === 2) {
            return parseInt(year) > 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
          }
          return parseInt(year);
        }
        return null;
      }
      
      importFile();
    `;
    
    // Write temp script
    const scriptPath = path.join(__dirname, 'temp_import_' + Date.now() + '.js');
    fs.writeFileSync(scriptPath, tempScript);
    
    // Run the script
    const child = spawn('node', [scriptPath], { cwd: path.join(__dirname, '..') });
    
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      // Clean up temp script
      fs.unlinkSync(scriptPath);
      
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Import failed with code ${code}`));
      }
    });
  });
}

/**
 * Main function to import all files
 */
async function importAllFiles() {
  console.log('🚀 Starting final pension data import process...\n');
  
  // Check initial count
  let initialCount = 0;
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/sqlite3', [
        '/data1/jainendra/DLC_backend-main/DLC_Database.db',
        'SELECT COUNT(*) FROM pension_data;'
      ]);
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(parseInt(output.trim()) || 0);
        } else {
          reject(new Error('Failed to get count'));
        }
      });
    });
    initialCount = result;
    console.log(`📊 Initial record count: ${initialCount}`);
  } catch (error) {
    console.log('⚠️  Could not get initial count');
  }
  
  // Import each file one by one
  for (const filePath of excelFiles) {
    try {
      await importSingleFile(filePath);
      console.log(`✅ Completed import of ${path.basename(filePath)}\n`);
    } catch (error) {
      console.log(`❌ Error importing ${path.basename(filePath)}: ${error.message}\n`);
    }
  }
  
  // Show final count
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/sqlite3', [
        '/data1/jainendra/DLC_backend-main/DLC_Database.db',
        'SELECT COUNT(*) FROM pension_data;'
      ]);
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(parseInt(output.trim()) || 0);
        } else {
          reject(new Error('Failed to get count'));
        }
      });
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Initial records: ${initialCount}`);
    console.log(`Final records: ${result}`);
    console.log(`Records added: ${result - initialCount}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.log(`❌ Error getting final count: ${error.message}`);
  }
  
  console.log('\n✨ Final import process completed!');
}

// Run if called directly
if (require.main === module) {
  importAllFiles()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('\n💥 Error during import:', err);
      process.exit(1);
    });
}

module.exports = { importSingleFile, importAllFiles };