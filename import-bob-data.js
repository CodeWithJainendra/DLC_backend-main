const XLSX = require('xlsx');
const { initDatabase, database } = require('./config/database');
const path = require('path');

async function importBobData() {
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

    // Begin transaction for better performance
    const transaction = db.transaction((records) => {
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (const record of records) {
        try {
          // Extract and transform data from Excel record
          const ppoNumber = record['PPO NUMBER'] || record.PPO_NUMBER || null;
          const psa = record.PSA || null;
          const pda = record.PDA || null;
          const bankName = record['name of disbursing bank'] || record.BANK_NAME || 'BOB';
          const branchName = record.BRANCH_NAME || record['BRANCH_NAME'] || null;
          const branchPostcode = record['Branch POST_CODE'] || record.BRANCH_POST_CODE || null;
          const pensionerCity = record['Pensioner CITY'] || record.PENSIONER_CITY || null;
          const state = record.STATE || record.state || null;
          const pensionerPostcode = record['Pensioner POST_CODE'] || record.PENSIONER_POST_CODE || null;
          
          // Skip records without PPO number
          if (!ppoNumber) {
            console.log(`⚠️  Skipping record without PPO number:`, record);
            skippedCount++;
            continue;
          }
          
          // Insert into database
          insertStmt.run(
            bankName,
            branchName,
            branchPostcode,
            pensionerCity,
            state,
            pensionerPostcode,
            pda,
            psa,
            ppoNumber
          );
          
          insertedCount++;
          
          // Log progress every 1000 records
          if (insertedCount % 1000 === 0) {
            console.log(`✅ Inserted ${insertedCount} records so far...`);
          }
          
        } catch (error) {
          console.error(`❌ Error inserting record:`, record);
          console.error('Error details:', error.message);
          skippedCount++;
        }
      }
      
      return { insertedCount, skippedCount };
    });

    // Execute the transaction
    console.log('💾 Inserting data into pensioner_bank_master table...');
    const result = transaction(jsonData);
    
    console.log('✅ Import completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Records processed: ${jsonData.length}`);
    console.log(`   - Records inserted: ${result.insertedCount}`);
    console.log(`   - Records skipped: ${result.skippedCount}`);
    
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
importBobData().catch(console.error);