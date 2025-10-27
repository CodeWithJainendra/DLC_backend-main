const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

async function analyzeBanksByState() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    
    try {
        console.log('🏦 Analyzing Banks by State from ALL Database Tables...\n');
        
        // Get all table names first
        const tables = await new Promise((resolve, reject) => {
            db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => row.name));
            });
        });
        
        console.log('📊 Available Tables:', tables.join(', '));
        console.log('');
        
        // Analyze each table for bank and state data
        const tableAnalysis = {};
        
        for (const table of tables) {
            try {
                // Get table schema
                const schema = await new Promise((resolve, reject) => {
                    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
                
                const columns = schema.map(col => col.name);
                console.log(`\n🔍 Analyzing table: ${table}`);
                console.log(`   Columns: ${columns.join(', ')}`);
                
                // Find state and bank columns
                const stateColumns = columns.filter(col => 
                    col.toLowerCase().includes('state') || 
                    col.toLowerCase().includes('location')
                );
                
                const bankColumns = columns.filter(col => 
                    col.toLowerCase().includes('bank') || 
                    col.toLowerCase().includes('branch')
                );
                
                if (stateColumns.length > 0 && bankColumns.length > 0) {
                    console.log(`   ✅ Found state columns: ${stateColumns.join(', ')}`);
                    console.log(`   ✅ Found bank columns: ${bankColumns.join(', ')}`);
                    
                    // Analyze this table
                    const stateCol = stateColumns[0];
                    const bankCol = bankColumns[0];
                    
                    const query = `
                        SELECT 
                            UPPER(TRIM(${stateCol})) as state_name,
                            COUNT(DISTINCT ${bankCol}) as unique_banks,
                            COUNT(*) as total_records
                        FROM ${table}
                        WHERE ${stateCol} IS NOT NULL 
                            AND ${stateCol} != 'nan' 
                            AND ${stateCol} != ''
                            AND ${bankCol} IS NOT NULL 
                            AND ${bankCol} != 'nan' 
                            AND ${bankCol} != ''
                        GROUP BY UPPER(TRIM(${stateCol}))
                        ORDER BY unique_banks DESC
                    `;
                    
                    const results = await new Promise((resolve, reject) => {
                        db.all(query, [], (err, rows) => {
                            if (err) {
                                console.log(`   ❌ Query failed: ${err.message}`);
                                resolve([]);
                            } else {
                                resolve(rows || []);
                            }
                        });
                    });
                    
                    tableAnalysis[table] = {
                        stateColumn: stateCol,
                        bankColumn: bankCol,
                        data: results,
                        totalStates: results.length,
                        totalRecords: results.reduce((sum, row) => sum + row.total_records, 0)
                    };
                    
                    console.log(`   📈 Found ${results.length} states with ${results.reduce((sum, row) => sum + row.unique_banks, 0)} total bank entries`);
                    
                } else {
                    console.log(`   ⚠️  No suitable state/bank columns found`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error analyzing ${table}: ${error.message}`);
            }
        }
        
        // Consolidate results across all tables
        console.log('\n\n🎯 CONSOLIDATED ANALYSIS - Banks by State (All Tables Combined)\n');
        
        const consolidatedData = {};
        
        // Merge data from all tables
        Object.keys(tableAnalysis).forEach(table => {
            const tableData = tableAnalysis[table];
            console.log(`\n📋 Processing ${table}:`);
            
            tableData.data.forEach(row => {
                const state = row.state_name;
                if (!consolidatedData[state]) {
                    consolidatedData[state] = {
                        state: state,
                        banks: new Set(),
                        sources: [],
                        totalRecords: 0,
                        tableBreakdown: {}
                    };
                }
                
                // Add source table info
                if (!consolidatedData[state].sources.includes(table)) {
                    consolidatedData[state].sources.push(table);
                }
                
                consolidatedData[state].totalRecords += row.total_records;
                consolidatedData[state].tableBreakdown[table] = {
                    unique_banks: row.unique_banks,
                    records: row.total_records
                };
                
                console.log(`   ${state}: ${row.unique_banks} banks, ${row.total_records} records`);
            });
        });
        
        // Get unique bank names for each state
        console.log('\n🔍 Getting detailed bank names for each state...\n');
        
        for (const state of Object.keys(consolidatedData)) {
            const bankSet = new Set();
            
            // Query each table for bank names in this state
            for (const table of Object.keys(tableAnalysis)) {
                const tableInfo = tableAnalysis[table];
                
                try {
                    const bankQuery = `
                        SELECT DISTINCT UPPER(TRIM(${tableInfo.bankColumn})) as bank_name
                        FROM ${table}
                        WHERE UPPER(TRIM(${tableInfo.stateColumn})) = ?
                            AND ${tableInfo.bankColumn} IS NOT NULL 
                            AND ${tableInfo.bankColumn} != 'nan' 
                            AND ${tableInfo.bankColumn} != ''
                    `;
                    
                    const banks = await new Promise((resolve, reject) => {
                        db.all(bankQuery, [state], (err, rows) => {
                            if (err) {
                                resolve([]);
                            } else {
                                resolve(rows || []);
                            }
                        });
                    });
                    
                    banks.forEach(bank => {
                        if (bank.bank_name && bank.bank_name.trim()) {
                            bankSet.add(bank.bank_name.trim());
                        }
                    });
                    
                } catch (error) {
                    console.log(`   ⚠️  Error getting banks for ${state} from ${table}`);
                }
            }
            
            consolidatedData[state].banks = Array.from(bankSet);
            consolidatedData[state].uniqueBankCount = bankSet.size;
        }
        
        // Sort states by bank count
        const sortedStates = Object.values(consolidatedData)
            .sort((a, b) => b.uniqueBankCount - a.uniqueBankCount);
        
        console.log('🏆 FINAL RESULTS - Banks by State (Comprehensive Analysis)\n');
        console.log('=' .repeat(80));
        
        sortedStates.forEach((stateData, index) => {
            console.log(`\n${index + 1}. ${stateData.state}`);
            console.log(`   🏦 Total Unique Banks: ${stateData.uniqueBankCount}`);
            console.log(`   📊 Total Records: ${stateData.totalRecords.toLocaleString()}`);
            console.log(`   📋 Data Sources: ${stateData.sources.join(', ')}`);
            
            // Show table breakdown
            console.log(`   📈 Table Breakdown:`);
            Object.keys(stateData.tableBreakdown).forEach(table => {
                const breakdown = stateData.tableBreakdown[table];
                console.log(`      ${table}: ${breakdown.unique_banks} banks, ${breakdown.records} records`);
            });
            
            // Show top banks
            if (stateData.banks.length > 0) {
                console.log(`   🏛️  Top Banks: ${stateData.banks.slice(0, 5).join(', ')}${stateData.banks.length > 5 ? '...' : ''}`);
            }
        });
        
        // Summary statistics
        console.log('\n\n📊 SUMMARY STATISTICS');
        console.log('=' .repeat(50));
        console.log(`Total States/UTs Analyzed: ${sortedStates.length}`);
        console.log(`Total Unique Banks Across All States: ${new Set(sortedStates.flatMap(s => s.banks)).size}`);
        console.log(`Total Records Processed: ${sortedStates.reduce((sum, s) => sum + s.totalRecords, 0).toLocaleString()}`);
        console.log(`Tables Analyzed: ${Object.keys(tableAnalysis).length}`);
        
        console.log('\n🔝 TOP 10 STATES BY BANK COUNT:');
        sortedStates.slice(0, 10).forEach((state, index) => {
            console.log(`${index + 1}. ${state.state}: ${state.uniqueBankCount} banks`);
        });
        
        return {
            consolidatedData: sortedStates,
            tableAnalysis: tableAnalysis,
            summary: {
                totalStates: sortedStates.length,
                totalUniqueBanks: new Set(sortedStates.flatMap(s => s.banks)).size,
                totalRecords: sortedStates.reduce((sum, s) => sum + s.totalRecords, 0),
                tablesAnalyzed: Object.keys(tableAnalysis).length
            }
        };
        
    } catch (error) {
        console.error('❌ Analysis failed:', error);
    } finally {
        db.close();
    }
}

// Run the analysis
if (require.main === module) {
    analyzeBanksByState();
}

module.exports = { analyzeBanksByState };