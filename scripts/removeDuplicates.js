#!/usr/bin/env node

/**
 * Remove duplicate records from pensioner_bank_master table
 * Keeps only the most recent record for each PPO number
 */

const { database, initDatabase } = require('../config/database');
const fs = require('fs');

function removeDuplicates() {
  console.log('🔍 Checking for duplicate records...');
  
  initDatabase();
  const db = database.getDB();
  
  // First, let's get the count of records before deduplication
  db.get("SELECT COUNT(*) as count FROM pensioner_bank_master", (err, beforeRow) => {
    if (err) {
      console.log(`❌ Error getting initial count: ${err.message}`);
      database.close();
      return;
    }
    
    const beforeCount = beforeRow.count;
    console.log(`📊 Records before deduplication: ${beforeCount}`);
    
    // Find duplicate PPO numbers
    db.all(`
      SELECT ppo_number, COUNT(*) as count 
      FROM pensioner_bank_master 
      WHERE ppo_number IS NOT NULL AND ppo_number != '' 
      GROUP BY ppo_number 
      HAVING COUNT(*) > 1
    `, (err, duplicatePPOs) => {
      if (err) {
        console.log(`❌ Error finding duplicates: ${err.message}`);
        database.close();
        return;
      }
      
      console.log(`🔍 Found ${duplicatePPOs.length} duplicate PPO numbers`);
      
      // For each duplicate PPO number, keep only the most recent record
      let removedCount = 0;
      let processedDuplicates = 0;
      
      if (duplicatePPOs.length === 0) {
        console.log('✅ No duplicates found');
        database.close();
        return;
      }
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        try {
          duplicatePPOs.forEach((dup, index) => {
            // Get all records for this PPO number ordered by created_at DESC
            db.all(`
              SELECT id, created_at 
              FROM pensioner_bank_master 
              WHERE ppo_number = ? 
              ORDER BY created_at DESC
            `, [dup.ppo_number], (err, records) => {
              if (err) {
                console.log(`❌ Error getting records for PPO ${dup.ppo_number}: ${err.message}`);
                return;
              }
              
              // Keep the first record (most recent) and delete the rest
              if (records.length > 1) {
                // Get IDs to delete (all except the first one)
                const idsToDelete = records.slice(1).map(record => record.id);
                
                // Delete the duplicate records
                idsToDelete.forEach(id => {
                  db.run("DELETE FROM pensioner_bank_master WHERE id = ?", [id], (err) => {
                    if (err) {
                      console.log(`❌ Error deleting record ${id}: ${err.message}`);
                    } else {
                      removedCount++;
                    }
                  });
                });
              }
              
              processedDuplicates++;
              
              // Check if we've processed all duplicates
              if (processedDuplicates === duplicatePPOs.length) {
                db.run('COMMIT', (err) => {
                  if (err) {
                    console.log(`❌ Error committing transaction: ${err.message}`);
                  } else {
                    console.log(`✅ Removed ${removedCount} duplicate records`);
                    
                    // Get the count after deduplication
                    db.get("SELECT COUNT(*) as count FROM pensioner_bank_master", (err, afterRow) => {
                      if (err) {
                        console.log(`❌ Error getting final count: ${err.message}`);
                      } else {
                        const afterCount = afterRow.count;
                        console.log(`📊 Records after deduplication: ${afterCount}`);
                        console.log(`📉 Total records removed: ${beforeCount - afterCount}`);
                      }
                      database.close();
                    });
                  }
                });
              }
            });
          });
        } catch (error) {
          db.run('ROLLBACK');
          console.log(`❌ Error during deduplication: ${error.message}`);
          database.close();
        }
      });
    });
  });
}

// Alternative approach using pure SQL (more efficient)
async function removeDuplicatesSQL() {
  console.log('🔍 Removing duplicates using SQL approach...');
  
  initDatabase();
  const db = database.getDB();
  
  try {
    // First, let's get the count of records before deduplication
    const beforeCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM pensioner_bank_master", (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`📊 Records before deduplication: ${beforeCount}`);
    
    // Create a temporary table with unique records
    console.log('🔄 Creating temporary table with unique records...');
    
    // This approach keeps the record with the maximum ID for each PPO number (most recent)
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TEMP TABLE temp_unique_records AS
        SELECT * FROM pensioner_bank_master 
        WHERE id IN (
          SELECT MAX(id) 
          FROM pensioner_bank_master 
          WHERE ppo_number IS NOT NULL AND ppo_number != '' 
          GROUP BY ppo_number
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Also include records with NULL or empty PPO numbers (keep all of them)
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO temp_unique_records
        SELECT * FROM pensioner_bank_master 
        WHERE ppo_number IS NULL OR ppo_number = ''
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('🗑️ Deleting all records from main table...');
    
    // Delete all records from main table
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM pensioner_bank_master", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('📥 Inserting unique records back into main table...');
    
    // Insert unique records back
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO pensioner_bank_master 
        SELECT * FROM temp_unique_records
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('🧹 Dropping temporary table...');
    
    // Drop temporary table
    await new Promise((resolve, reject) => {
      db.run("DROP TABLE temp_unique_records", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Get the count after deduplication
    const afterCount = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM pensioner_bank_master", (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`📊 Records after deduplication: ${afterCount}`);
    console.log(`📉 Total records removed: ${beforeCount - afterCount}`);
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  } finally {
    database.close();
  }
}

if (require.main === module) {
  removeDuplicatesSQL()
    .then(() => {
      console.log('\n✨ Deduplication process completed!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n💥 Error during deduplication:', err);
      process.exit(1);
    });
}

module.exports = { removeDuplicates, removeDuplicatesSQL };