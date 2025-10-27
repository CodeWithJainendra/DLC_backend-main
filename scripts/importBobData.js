#!/usr/bin/env node

/**
 * BOB Data Importer
 * Imports BOB Pensioners data from Excel to existing database
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Database path
const DB_PATH = path.join(__dirname, '..', 'database.db');

class BobDataImporter {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH);
  }

  /**
   * Import BOB data from Excel file to database
   * @param {string} excelFilePath - Path to the Excel file
   */
  async importData(excelFilePath) {
    try {
      console.log(`📂 Reading Excel file: ${excelFilePath}`);
      
      // Check if file exists
      if (!fs.existsSync(excelFilePath)) {
        throw new Error(`File not found: ${excelFilePath}`);
      }

      // Read the Excel file
      const workbook = XLSX.readFile(excelFilePath);
      const sheetName = workbook.SheetNames[0]; // Get first sheet
      console.log(`📄 Processing worksheet: "${sheetName}"`);
      
      // Convert to JSON
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      console.log(`📊 Found ${jsonData.length} records in Excel file`);
      
      // Process and insert data
      await this.processAndInsertData(jsonData);
      
      console.log('🎉 Data import completed successfully!');
      
    } catch (error) {
      console.error(`❌ Error importing data: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Process and insert data into database
   * @param {Array} data - Array of records from Excel
   */
  async processAndInsertData(data) {
    return new Promise((resolve, reject) => {
      // Begin transaction for better performance
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        let insertedCount = 0;
        let skippedCount = 0;
        
        // Prepare insert statement
        const stmt = this.db.prepare(`
          INSERT INTO pensioner_bank_master (
            sr_no, ppo_number, pensioner_dob, psa, pda, 
            branch_name, branch_postcode, pensioner_city, state, pensioner_postcode,
            name_of_disbursing_bank, data_source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        
        // Process each record
        data.forEach((record, index) => {
          try {
            // Extract data from record (handle different column name variations)
            const srNo = record['Sr NO'] || record['Sr NO '] || record['Sr. NO'] || record['Sr. No'] || record['S.No'] || null;
            const ppoNumber = record['PPO NUMBER'] || record['PPO NO'] || record['PPO Number'] || null;
            const dob = record['DOB REGULAR'] || record['DOB'] || record['Date of Birth'] || null;
            const psa = record['PSA'] || null;
            const pda = record['PDA and  name of disbursing bank'] || record['PDA'] || record['PDA and name of disbursing bank'] || null;
            const branchName = record['BRANCH_NAME'] || record['Branch Name'] || record['Branch_Name'] || null;
            const branchPostcode = record['Branch POST_CODE'] || record['Branch POST CODE'] || record['Branch Postcode'] || record['Branch_Postcode'] || null;
            const pensionerCity = record['Pensioner CITY'] || record['Pensioner City'] || record['Pensioner_City'] || null;
            const state = record['STATE'] || null;
            const pensionerPostcode = record['Pensioner POST_CODE'] || record['Pensioner POST CODE'] || record['Pensioner Postcode'] || record['Pensioner_Postcode'] || null;
            
            // Skip records with no essential data
            if (!ppoNumber && !dob && !psa) {
              skippedCount++;
              return;
            }
            
            // Insert data
            stmt.run([
              srNo, ppoNumber, dob, psa, pda,
              branchName, branchPostcode, pensionerCity, state, pensionerPostcode,
              pda, 'BOB' // data_source is 'BOB'
            ], (err) => {
              if (err) {
                console.error(`Error inserting record ${index + 1}:`, err.message);
              } else {
                insertedCount++;
              }
            });
            
          } catch (error) {
            console.error(`Error processing record ${index + 1}:`, error.message);
            skippedCount++;
          }
        });
        
        // Finalize statement and commit transaction
        stmt.finalize();
        this.db.run('COMMIT', (err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`✅ Successfully inserted ${insertedCount} records`);
            console.log(`⚠️  Skipped ${skippedCount} records (missing essential data)`);
            resolve();
          }
        });
      });
    });
  }
  
  /**
   * Create PSA categories table if it doesn't exist
   */
  async createPsaCategoriesTable() {
    return new Promise((resolve, reject) => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS psa_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          psa_code TEXT UNIQUE,
          psa_name TEXT,
          category_type TEXT, -- 'Civil', 'Railway', 'EPFO', etc.
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      this.db.run(createTableSQL, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ PSA categories table ready');
          resolve();
        }
      });
    });
  }
  
  /**
   * Extract and save unique PSA categories
   */
  async extractAndSavePsaCategories() {
    return new Promise((resolve, reject) => {
      // Get unique PSA values from pensioner_bank_master
      const query = `
        SELECT DISTINCT psa 
        FROM pensioner_bank_master 
        WHERE psa IS NOT NULL AND psa != '' AND data_source = 'BOB'
      `;
      
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          console.log(`📊 Found ${rows.length} unique PSA categories`);
          
          // Insert PSA categories (this is a simplified approach - in reality, you'd need to classify them)
          const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO psa_categories (psa_code, psa_name, category_type)
            VALUES (?, ?, ?)
          `);
          
          rows.forEach(row => {
            // This is a simplified classification - you might want to improve this logic
            let categoryType = 'Unknown';
            const psa = row.psa.toString().toUpperCase();
            
            if (psa.includes('CIVIL') || psa.includes('CIV')) {
              categoryType = 'Civil';
            } else if (psa.includes('RAILWAY') || psa.includes('RLY')) {
              categoryType = 'Railway';
            } else if (psa.includes('EPFO') || psa.includes('EPF')) {
              categoryType = 'EPFO';
            } else if (psa.includes('DEFENCE') || psa.includes('DEF')) {
              categoryType = 'Defence';
            }
            
            stmt.run([row.psa, row.psa, categoryType], (err) => {
              if (err) {
                console.error(`Error inserting PSA category ${row.psa}:`, err.message);
              }
            });
          });
          
          stmt.finalize(() => {
            console.log('✅ PSA categories extracted and saved');
            resolve();
          });
        }
      });
    });
  }
  
  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage:');
    console.log('  node importBobData.js <excel_file>');
    console.log('');
    console.log('Example:');
    console.log('  node importBobData.js "/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx"');
    process.exit(1);
  }
  
  const excelFilePath = args[0];
  
  // Run the import process
  (async () => {
    const importer = new BobDataImporter();
    
    try {
      // Create PSA categories table
      await importer.createPsaCategoriesTable();
      
      // Import data from Excel
      await importer.importData(excelFilePath);
      
      // Extract and save PSA categories
      await importer.extractAndSavePsaCategories();
      
    } catch (error) {
      console.error('Import failed:', error.message);
      process.exit(1);
    } finally {
      importer.close();
    }
  })();
}

module.exports = BobDataImporter;