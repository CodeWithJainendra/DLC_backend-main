#!/usr/bin/env node

/**
 * Clean and deduplicate pensioner_bank_master table
 * This script will:
 * 1. Remove all duplicate records based on PPO number
 * 2. Keep only the most recent record for each PPO number
 * 3. Provide a clean count of unique records
 */

const { database, initDatabase } = require('../config/database');
const fs = require('fs');

function cleanAndDeduplicate() {
  console.log('🔍 Starting database cleanup and deduplication...');
  
  initDatabase();
  const db = database.getDB();
  
  // First, let's get the count of records before cleanup
  db.get("SELECT COUNT(*) as count FROM pensioner_bank_master", (err, beforeRow) => {
    if (err) {
      console.log(`❌ Error getting initial count: ${err.message}`);
      database.close();
      return;
    }
    
    const beforeCount = beforeRow.count;
    console.log(`📊 Records before cleanup: ${beforeCount}`);
    
    // Check how many records have PPO numbers
    db.get("SELECT COUNT(*) as count FROM pensioner_bank_master WHERE ppo_number IS NOT NULL AND ppo_number != ''", (err, ppoRow) => {
      if (err) {
        console.log(`❌ Error counting PPO numbers: ${err.message}`);
        database.close();
        return;
      }
      
      console.log(`📋 Records with PPO numbers: ${ppoRow.count}`);
      
      // Check how many records have NULL or empty PPO numbers
      db.get("SELECT COUNT(*) as count FROM pensioner_bank_master WHERE ppo_number IS NULL OR ppo_number = ''", (err, nullRow) => {
        if (err) {
          console.log(`❌ Error counting NULL PPO numbers: ${err.message}`);
          database.close();
          return;
        }
        
        console.log(`EmptyEntries with NULL/empty PPO numbers: ${nullRow.count}`);
        
        // Now let's check for duplicate PPO numbers
        db.all(`
          SELECT ppo_number, COUNT(*) as count 
          FROM pensioner_bank_master 
          WHERE ppo_number IS NOT NULL AND ppo_number != '' 
          GROUP BY ppo_number 
          HAVING COUNT(*) > 1
          ORDER BY count DESC
        `, (err, duplicates) => {
          if (err) {
            console.log(`❌ Error finding duplicates: ${err.message}`);
            database.close();
            return;
          }
          
          console.log(`🔍 Found ${duplicates.length} PPO numbers with duplicates`);
          
          if (duplicates.length > 0) {
            console.log('   Top 10 duplicates:');
            duplicates.slice(0, 10).forEach(dup => {
              console.log(`     ${dup.ppo_number}: ${dup.count} records`);
            });
          }
          
          // Use SQL approach to remove duplicates
          console.log('\n🔄 Starting deduplication process...');
          
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            // Create temporary table with unique records (keeping the one with highest ID for each PPO)
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
              if (err) {
                db.run('ROLLBACK');
                console.log(`❌ Error creating temp table: ${err.message}`);
                database.close();
                return;
              }
              
              // Also include records with NULL or empty PPO numbers (keep all of them)
              db.run(`
                INSERT INTO temp_unique_records
                SELECT * FROM pensioner_bank_master 
                WHERE ppo_number IS NULL OR ppo_number = ''
              `, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  console.log(`❌ Error inserting NULL PPO records: ${err.message}`);
                  database.close();
                  return;
                }
                
                // Delete all records from main table
                db.run("DELETE FROM pensioner_bank_master", (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    console.log(`❌ Error deleting records: ${err.message}`);
                    database.close();
                    return;
                  }
                  
                  // Insert unique records back
                  db.run(`
                    INSERT INTO pensioner_bank_master 
                    SELECT * FROM temp_unique_records
                  `, (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      console.log(`❌ Error inserting unique records: ${err.message}`);
                      database.close();
                      return;
                    }
                    
                    // Drop temporary table
                    db.run("DROP TABLE temp_unique_records", (err) => {
                      if (err) {
                        db.run('ROLLBACK');
                        console.log(`❌ Error dropping temp table: ${err.message}`);
                        database.close();
                        return;
                      }
                      
                      // Commit transaction
                      db.run('COMMIT', (err) => {
                        if (err) {
                          console.log(`❌ Error committing: ${err.message}`);
                          database.close();
                          return;
                        }
                        
                        // Get the count after deduplication
                        db.get("SELECT COUNT(*) as count FROM pensioner_bank_master", (err, afterRow) => {
                          if (err) {
                            console.log(`❌ Error getting final count: ${err.message}`);
                            database.close();
                            return;
                          }
                          
                          const afterCount = afterRow.count;
                          console.log(`✅ Deduplication completed!`);
                          console.log(`📊 Records before cleanup: ${beforeCount}`);
                          console.log(`📊 Records after cleanup: ${afterCount}`);
                          console.log(`📉 Records removed: ${beforeCount - afterCount}`);
                          
                          // Show final breakdown by data source
                          db.all(`
                            SELECT data_source, COUNT(*) as record_count 
                            FROM pensioner_bank_master 
                            GROUP BY data_source 
                            ORDER BY record_count DESC
                          `, (err, sources) => {
                            if (err) {
                              console.log(`❌ Error getting data source breakdown: ${err.message}`);
                            } else {
                              console.log('\n📂 Final data source breakdown:');
                              sources.forEach(source => {
                                console.log(`   ${source.data_source}: ${source.record_count} records`);
                              });
                            }
                            
                            // Check unique PPO numbers
                            db.get(`
                              SELECT COUNT(DISTINCT ppo_number) as unique_count 
                              FROM pensioner_bank_master 
                              WHERE ppo_number IS NOT NULL AND ppo_number != ''
                            `, (err, uniqueRow) => {
                              if (err) {
                                console.log(`❌ Error counting unique PPOs: ${err.message}`);
                              } else {
                                console.log(`\n🆔 Unique PPO numbers: ${uniqueRow.unique_count}`);
                              }
                              
                              database.close();
                              console.log('\n✨ Database cleanup and deduplication completed successfully!');
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

if (require.main === module) {
  cleanAndDeduplicate();
}

module.exports = { cleanAndDeduplicate };