const XLSX = require('xlsx');
const { initDatabase, database } = require('./config/database');
const path = require('path');

async function importBobPensionersData() {
  try {
    console.log('🚀 Starting BOB Pensioners Data Import');
    console.log('=====================================');

    // Initialize database
    await initDatabase();
    const db = database.getDB();
    
    // Path to the Excel file
    const filePath = path.join(__dirname, 'EXCEL_DATA', 'BOB Pensioners data 1.xlsx');
    console.log(`📂 Reading file: ${filePath}`);

    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Get the first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`📊 Found ${jsonData.length} records in the Excel file`);

    // Prepare the insert statement for pensioner_bank_master table
    const insertStmt = db.prepare(`
      INSERT INTO pensioner_bank_master (
        bank_name, branch_name, branch_postcode, pensioner_city, state, 
        pensioner_postcode, PDA, PSA, ppo_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Variables to track progress
    let insertedCount = 0;
    let skippedCount = 0;
    
    // Begin transaction for better performance
    db.exec('BEGIN TRANSACTION');
    
    // Process each record
    for (const [index, record] of jsonData.entries()) {
      try {
        // Extract data from record (handle different column name variations)
        const ppoNumber = record['PPO NUMBER'] || record.PPO_NUMBER || record.PPO || null;
        const psa = record.PSA || record['PSA'] || null;
        const pda = record.PDA || record['PDA'] || 'BOB'; // Default to BOB if not specified
        const bankName = record['name of disbursing bank'] || record.BANK_NAME || 'Bank of Baroda';
        const branchName = record.BRANCH_NAME || record['BRANCH_NAME'] || record['Branch Name'] || null;
        const branchPostcode = record['Branch POST_CODE'] || record['Branch POST CODE'] || record.BRANCH_POST_CODE || null;
        const pensionerCity = record['Pensioner CITY'] || record['Pensioner City'] || record.PENSIONER_CITY || null;
        const state = record.STATE || record['STATE'] || record.State || null;
        const pensionerPostcode = record['Pensioner POST_CODE'] || record['Pensioner POST CODE'] || record.PENSIONER_POST_CODE || null;
        
        // Skip records without PPO number (essential identifier)
        if (!ppoNumber) {
          skippedCount++;
          continue;
        }
        
        // Insert into database
        insertStmt.run([
          bankName,
          branchName,
          branchPostcode,
          pensionerCity,
          state,
          pensionerPostcode,
          pda,
          psa,
          ppoNumber.toString() // Ensure it's a string
        ]);
        
        insertedCount++;
        
        // Log progress every 5000 records
        if ((insertedCount + skippedCount) % 5000 === 0) {
          console.log(`📊 Processed ${insertedCount + skippedCount} records so far (${insertedCount} inserted, ${skippedCount} skipped)...`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing record ${index + 1}:`, error.message);
        skippedCount++;
      }
    }
    
    // Finalize statement and commit transaction
    insertStmt.finalize();
    db.exec('COMMIT');
    
    console.log('✅ Import completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Records processed: ${jsonData.length}`);
    console.log(`   - Records inserted: ${insertedCount}`);
    console.log(`   - Records skipped: ${skippedCount}`);
    
    // Verify the import
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM pensioner_bank_master');
    const totalCount = countStmt.get();
    console.log(`📈 Total records in pensioner_bank_master table: ${totalCount.count}`);

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the import
importBobPensionersData().catch(console.error);