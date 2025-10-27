const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const router = express.Router();
const EXCEL_DIR = path.join(__dirname, 'Excel Files');

/**
 * Get all Excel files with their sheets and basic info
 */
router.get('/api/excel/files', (req, res) => {
    try {
        const files = [];
        
        // Read main Excel Files directory
        const mainFiles = fs.readdirSync(EXCEL_DIR)
            .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
        
        mainFiles.forEach(filename => {
            const filePath = path.join(EXCEL_DIR, filename);
            const stats = fs.statSync(filePath);
            
            files.push({
                name: filename,
                path: filePath,
                size: stats.size,
                sizeFormatted: formatFileSize(stats.size),
                modified: stats.mtime,
                directory: 'main'
            });
        });
        
        // Read 21Oct subdirectory if exists
        const oct21Dir = path.join(EXCEL_DIR, '21Oct');
        if (fs.existsSync(oct21Dir)) {
            const oct21Files = fs.readdirSync(oct21Dir)
                .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
            
            oct21Files.forEach(filename => {
                const filePath = path.join(oct21Dir, filename);
                const stats = fs.statSync(filePath);
                
                files.push({
                    name: filename,
                    path: filePath,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size),
                    modified: stats.mtime,
                    directory: '21Oct'
                });
            });
        }
        
        res.json({
            success: true,
            count: files.length,
            files: files
        });
        
    } catch (error) {
        console.error('Error reading Excel files:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Analyze a specific Excel file - get sheets, columns, sample data
 */
router.post('/api/excel/analyze', (req, res) => {
    try {
        const { filePath } = req.body;
        
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid file path'
            });
        }
        
        const workbook = XLSX.readFile(filePath);
        const analysis = {
            fileName: path.basename(filePath),
            filePath: filePath,
            sheets: []
        };
        
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
            
            // Find header row (first non-empty row with most filled cells)
            let headerRowIndex = 0;
            let maxFilledCells = 0;
            
            for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                const row = jsonData[i];
                const filledCells = row.filter(cell => cell !== null && cell !== '').length;
                if (filledCells > maxFilledCells) {
                    maxFilledCells = filledCells;
                    headerRowIndex = i;
                }
            }
            
            const headers = jsonData[headerRowIndex] || [];
            const dataStartRow = headerRowIndex + 1;
            
            // Get sample data (first 5 rows after header)
            const sampleData = jsonData.slice(dataStartRow, dataStartRow + 5);
            
            // Analyze columns
            const columns = headers.map((header, index) => {
                const columnData = jsonData.slice(dataStartRow, dataStartRow + 100)
                    .map(row => row[index])
                    .filter(val => val !== null && val !== '');
                
                return {
                    index: index,
                    name: header || `Column_${index}`,
                    originalName: header,
                    dataType: detectDataType(columnData),
                    sampleValues: columnData.slice(0, 5),
                    nonEmptyCount: columnData.length,
                    hasData: columnData.length > 0
                };
            }).filter(col => col.hasData); // Only include columns with data
            
            // Detect potential pincode columns
            const pincodeColumns = columns.filter(col => {
                const nameLower = col.name.toLowerCase();
                return nameLower.includes('pin') || 
                       nameLower.includes('code') ||
                       (col.dataType === 'number' && col.sampleValues.some(v => String(v).length === 6));
            });
            
            // Detect bank columns
            const bankColumns = columns.filter(col => {
                const nameLower = col.name.toLowerCase();
                return nameLower.includes('bank') && nameLower.includes('name');
            });
            
            // Detect age category columns
            const ageColumns = columns.filter(col => {
                const nameLower = col.name.toLowerCase();
                return nameLower.includes('age') || 
                       nameLower.includes('80') ||
                       nameLower.includes('less') ||
                       nameLower.includes('more');
            });
            
            analysis.sheets.push({
                name: sheetName,
                rowCount: jsonData.length - dataStartRow,
                columnCount: columns.length,
                headerRowIndex: headerRowIndex,
                columns: columns,
                sampleData: sampleData,
                detectedColumns: {
                    pincode: pincodeColumns,
                    bank: bankColumns,
                    age: ageColumns
                }
            });
        });
        
        res.json({
            success: true,
            analysis: analysis
        });
        
    } catch (error) {
        console.error('Error analyzing Excel file:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Create new database with mapped columns
 */
router.post('/api/excel/create-database', async (req, res) => {
    try {
        const { mappings, databaseName } = req.body;
        
        if (!mappings || !Array.isArray(mappings)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid mappings'
            });
        }
        
        const dbPath = path.join(__dirname, databaseName || 'newdatabase.db');
        
        // Delete existing database if exists
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        
        const db = new sqlite3.Database(dbPath);
        
        // Create tables based on mappings
        const tables = {};
        
        mappings.forEach(mapping => {
            const tableName = mapping.tableName || 'pensioner_data';
            
            if (!tables[tableName]) {
                tables[tableName] = {
                    columns: new Set(),
                    files: []
                };
            }
            
            // Add columns to table definition
            mapping.columnMappings.forEach(col => {
                tables[tableName].columns.add({
                    name: col.targetColumn,
                    type: col.dataType || 'TEXT'
                });
            });
            
            tables[tableName].files.push(mapping);
        });
        
        // Create tables
        const createTablePromises = Object.keys(tables).map(tableName => {
            return new Promise((resolve, reject) => {
                const columns = Array.from(tables[tableName].columns);
                const columnDefs = columns.map(col => `${col.name} ${col.type}`).join(', ');
                
                const sql = `
                    CREATE TABLE IF NOT EXISTS ${tableName} (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ${columnDefs},
                        file_source TEXT,
                        sheet_source TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `;
                
                db.run(sql, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
        
        await Promise.all(createTablePromises);
        
        // Insert data from Excel files
        let totalRecords = 0;
        
        for (const mapping of mappings) {
            const workbook = XLSX.readFile(mapping.filePath);
            const worksheet = workbook.Sheets[mapping.sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            const dataStartRow = mapping.headerRowIndex + 1;
            const dataRows = jsonData.slice(dataStartRow);
            
            for (const row of dataRows) {
                // Skip empty rows
                if (row.every(cell => !cell)) continue;
                
                const values = {};
                mapping.columnMappings.forEach(colMap => {
                    const value = row[colMap.sourceColumnIndex];
                    values[colMap.targetColumn] = value;
                });
                
                values.file_source = mapping.fileName;
                values.sheet_source = mapping.sheetName;
                
                const columns = Object.keys(values);
                const placeholders = columns.map(() => '?').join(', ');
                const sql = `INSERT INTO ${mapping.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
                
                await new Promise((resolve, reject) => {
                    db.run(sql, Object.values(values), (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
                totalRecords++;
            }
        }
        
        // Create indexes for better performance
        await new Promise((resolve, reject) => {
            db.run('CREATE INDEX IF NOT EXISTS idx_pincode ON pensioner_data(pincode)', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        db.close();
        
        res.json({
            success: true,
            message: 'Database created successfully',
            databasePath: dbPath,
            tablesCreated: Object.keys(tables).length,
            recordsInserted: totalRecords
        });
        
    } catch (error) {
        console.error('Error creating database:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Query the new database for pincode statistics
 */
router.post('/api/excel/query-pincode-stats', (req, res) => {
    try {
        const { databasePath } = req.body;
        
        if (!databasePath || !fs.existsSync(databasePath)) {
            return res.status(400).json({
                success: false,
                error: 'Database not found'
            });
        }
        
        const db = new sqlite3.Database(databasePath);
        
        // Query pincode statistics
        const query = `
            SELECT 
                pincode,
                bank_name,
                SUM(age_less_than_80) as age_less_80,
                SUM(age_more_than_80) as age_more_80,
                SUM(grand_total) as total_pensioners,
                COUNT(*) as record_count
            FROM pensioner_data
            WHERE pincode IS NOT NULL AND pincode != ''
            GROUP BY pincode, bank_name
            ORDER BY total_pensioners DESC
            LIMIT 1000
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            
            // Aggregate by pincode
            const pincodeStats = {};
            
            rows.forEach(row => {
                if (!pincodeStats[row.pincode]) {
                    pincodeStats[row.pincode] = {
                        pincode: row.pincode,
                        totalPensioners: 0,
                        ageLess80: 0,
                        ageMore80: 0,
                        banks: []
                    };
                }
                
                pincodeStats[row.pincode].totalPensioners += row.total_pensioners || 0;
                pincodeStats[row.pincode].ageLess80 += row.age_less_80 || 0;
                pincodeStats[row.pincode].ageMore80 += row.age_more_80 || 0;
                pincodeStats[row.pincode].banks.push({
                    name: row.bank_name,
                    pensioners: row.total_pensioners,
                    ageLess80: row.age_less_80,
                    ageMore80: row.age_more_80
                });
            });
            
            db.close();
            
            res.json({
                success: true,
                stats: Object.values(pincodeStats)
            });
        });
        
    } catch (error) {
        console.error('Error querying database:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function detectDataType(values) {
    if (values.length === 0) return 'TEXT';
    
    const numericCount = values.filter(v => !isNaN(v) && v !== '').length;
    const numericRatio = numericCount / values.length;
    
    if (numericRatio > 0.8) {
        // Check if integers
        const integerCount = values.filter(v => Number.isInteger(Number(v))).length;
        if (integerCount / values.length > 0.9) {
            return 'INTEGER';
        }
        return 'REAL';
    }
    
    return 'TEXT';
}

module.exports = router;
