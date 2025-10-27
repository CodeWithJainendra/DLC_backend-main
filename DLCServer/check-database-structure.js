const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

async function checkDatabaseStructure() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    
    try {
        console.log('🔍 Checking Database Structure for Filtering Options...\n');
        
        // Check main tables for filtering fields
        const tables = ['doppw_pensioner_data', 'bank_pensioner_data', 'ubi1_pensioner_data', 'ubi3_pensioner_data'];
        
        for (const table of tables) {
            console.log(`\n📋 Table: ${table}`);
            console.log('=' .repeat(50));
            
            // Get table schema
            const schema = await new Promise((resolve, reject) => {
                db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            const columns = schema.map(col => `${col.name} (${col.type})`);
            console.log('Columns:', columns.join(', '));
            
            // Check for age-related fields
            const ageColumns = schema.filter(col => 
                col.name.toLowerCase().includes('age') || 
                col.name.toLowerCase().includes('birth')
            );
            
            if (ageColumns.length > 0) {
                console.log('\n🎂 Age-related columns found:');
                ageColumns.forEach(col => {
                    console.log(`   - ${col.name} (${col.type})`);
                });
                
                // Sample age data
                try {
                    const ageQuery = `SELECT ${ageColumns[0].name}, COUNT(*) as count FROM ${table} WHERE ${ageColumns[0].name} IS NOT NULL GROUP BY ${ageColumns[0].name} ORDER BY count DESC LIMIT 10`;
                    const ageData = await new Promise((resolve, reject) => {
                        db.all(ageQuery, [], (err, rows) => {
                            if (err) resolve([]);
                            else resolve(rows || []);
                        });
                    });
                    
                    console.log(`   Sample ${ageColumns[0].name} values:`, ageData.slice(0, 5).map(row => `${row[ageColumns[0].name]} (${row.count})`).join(', '));
                } catch (error) {
                    console.log('   Could not sample age data');
                }
            }
            
            // Check for pension type fields
            const pensionColumns = schema.filter(col => 
                col.name.toLowerCase().includes('pension') || 
                col.name.toLowerCase().includes('category') ||
                col.name.toLowerCase().includes('type') ||
                col.name.toLowerCase().includes('service')
            );
            
            if (pensionColumns.length > 0) {
                console.log('\n🏛️  Pension/Category columns found:');
                pensionColumns.forEach(col => {
                    console.log(`   - ${col.name} (${col.type})`);
                });
                
                // Sample pension type data
                for (const col of pensionColumns.slice(0, 2)) {
                    try {
                        const typeQuery = `SELECT ${col.name}, COUNT(*) as count FROM ${table} WHERE ${col.name} IS NOT NULL AND ${col.name} != '' GROUP BY ${col.name} ORDER BY count DESC LIMIT 5`;
                        const typeData = await new Promise((resolve, reject) => {
                            db.all(typeQuery, [], (err, rows) => {
                                if (err) resolve([]);
                                else resolve(rows || []);
                            });
                        });
                        
                        if (typeData.length > 0) {
                            console.log(`   ${col.name} values:`, typeData.map(row => `${row[col.name]} (${row.count})`).join(', '));
                        }
                    } catch (error) {
                        console.log(`   Could not sample ${col.name} data`);
                    }
                }
            }
            
            // Check for bank-related fields
            const bankColumns = schema.filter(col => 
                col.name.toLowerCase().includes('bank') || 
                col.name.toLowerCase().includes('branch')
            );
            
            if (bankColumns.length > 0) {
                console.log('\n🏦 Bank-related columns found:');
                bankColumns.forEach(col => {
                    console.log(`   - ${col.name} (${col.type})`);
                });
                
                // Sample bank data
                for (const col of bankColumns.slice(0, 1)) {
                    try {
                        const bankQuery = `SELECT ${col.name}, COUNT(*) as count FROM ${table} WHERE ${col.name} IS NOT NULL AND ${col.name} != '' AND UPPER(${col.name}) LIKE '%SBI%' GROUP BY ${col.name} ORDER BY count DESC LIMIT 3`;
                        const bankData = await new Promise((resolve, reject) => {
                            db.all(bankQuery, [], (err, rows) => {
                                if (err) resolve([]);
                                else resolve(rows || []);
                            });
                        });
                        
                        if (bankData.length > 0) {
                            console.log(`   Sample SBI banks in ${col.name}:`, bankData.map(row => `${row[col.name]} (${row.count})`).join(', '));
                        }
                    } catch (error) {
                        console.log(`   Could not sample ${col.name} data`);
                    }
                }
            }
        }
        
        // Check bank_pensioner_data for age categories
        console.log('\n\n🎯 Checking bank_pensioner_data for age categories...');
        const bankAgeSchema = await new Promise((resolve, reject) => {
            db.all(`PRAGMA table_info(bank_pensioner_data)`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const ageCategories = bankAgeSchema.filter(col => 
            col.name.includes('age_') || 
            col.name.includes('80') || 
            col.name.includes('less') || 
            col.name.includes('more')
        );
        
        console.log('Age category columns in bank_pensioner_data:', ageCategories.map(col => col.name));
        
        if (ageCategories.length > 0) {
            const sampleQuery = `SELECT ${ageCategories.map(col => col.name).join(', ')}, bank_name FROM bank_pensioner_data WHERE bank_name IS NOT NULL LIMIT 3`;
            const sampleData = await new Promise((resolve, reject) => {
                db.all(sampleQuery, [], (err, rows) => {
                    if (err) resolve([]);
                    else resolve(rows || []);
                });
            });
            
            console.log('Sample age category data:', JSON.stringify(sampleData, null, 2));
        }
        
    } catch (error) {
        console.error('❌ Error checking database structure:', error);
    } finally {
        db.close();
    }
}

checkDatabaseStructure();