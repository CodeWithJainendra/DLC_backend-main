/**
 * Excel Analyzer Utility
 * Automatically analyzes Excel files and determines the best database table mapping
 */

const XLSX = require('xlsx');
const path = require('path');
const { database } = require('../config/database');

class ExcelAnalyzer {
  constructor() {
    this.db = database.getDB();
    
    // Define supported database tables and their expected columns
    this.supportedTables = {
      'pensioner_bank_master': {
        priority: 1,
        description: 'Main pensioner data with bank details',
        requiredColumns: ['ppo_no', 'pensioner_name', 'bank_name'],
        optionalColumns: ['branch_name', 'account_no', 'ifsc_code', 'mobile_no', 'email', 'address', 'state', 'district', 'pension_amount'],
        keyColumns: ['ppo_no', 'pensioner_name', 'bank_name', 'account_no', 'ifsc'],
        patterns: ['ppo', 'pensioner', 'bank', 'account', 'ifsc', 'pension']
      },
      'sbi_verification_records': {
        priority: 2,
        description: 'SBI verification data',
        requiredColumns: ['ppo_no', 'verification_status'],
        optionalColumns: ['verification_date', 'verification_type', 'remarks', 'batch_id'],
        keyColumns: ['ppo', 'verification', 'status', 'sbi'],
        patterns: ['verification', 'status', 'sbi', 'batch']
      },
      'doppw_pensioner_master': {
        priority: 3,
        description: 'DOPPW pensioner master data',
        requiredColumns: ['ppo_no', 'pensioner_name'],
        optionalColumns: ['dob', 'dor', 'department', 'designation', 'basic_pension', 'state', 'district'],
        keyColumns: ['ppo', 'pensioner', 'doppw', 'department'],
        patterns: ['doppw', 'department', 'designation', 'basic_pension']
      },
      'bank_master': {
        priority: 4,
        description: 'Bank master data',
        requiredColumns: ['bank_name', 'ifsc_code'],
        optionalColumns: ['branch_name', 'branch_address', 'state', 'district', 'pin_code'],
        keyColumns: ['bank', 'ifsc', 'branch'],
        patterns: ['bank', 'ifsc', 'branch', 'address']
      },
      'state_master': {
        priority: 5,
        description: 'State master data',
        requiredColumns: ['state_name'],
        optionalColumns: ['state_code', 'region'],
        keyColumns: ['state', 'code', 'region'],
        patterns: ['state', 'region', 'code']
      }
    };
  }

  /**
   * Analyze Excel file structure and content
   */
  async analyzeFile(filePath) {
    try {
      console.log(`📊 Reading Excel file: ${filePath}`);
      
      // Read the Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetNames = workbook.SheetNames;
      
      let totalRecords = 0;
      const sheets = [];

      // Process each sheet
      for (const sheetName of sheetNames) {
        console.log(`📋 Processing sheet: ${sheetName}`);
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: null,
          blankrows: false
        });

        if (jsonData.length === 0) continue;

        // Get headers (first non-empty row)
        let headerRow = 0;
        let headers = [];
        
        for (let i = 0; i < Math.min(5, jsonData.length); i++) {
          const row = jsonData[i];
          if (row && row.some(cell => cell !== null && cell !== '')) {
            // Check if this looks like a header row
            const nonEmptyCount = row.filter(cell => cell !== null && cell !== '').length;
            if (nonEmptyCount >= 3) { // At least 3 columns
              headers = row.map(cell => this.normalizeColumnName(cell));
              headerRow = i;
              break;
            }
          }
        }

        if (headers.length === 0) continue;

        // Convert to objects using detected headers
        const dataRows = jsonData.slice(headerRow + 1).filter(row => 
          row && row.some(cell => cell !== null && cell !== '')
        );

        const sheetData = dataRows.map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            if (header) {
              obj[header] = row[index] || null;
            }
          });
          return obj;
        });

        totalRecords += sheetData.length;

        sheets.push({
          name: sheetName,
          headers: headers.filter(h => h), // Remove empty headers
          data: sheetData,
          recordCount: sheetData.length,
          sampleData: sheetData.slice(0, 5) // First 5 rows for analysis
        });
      }

      return {
        success: true,
        totalRecords,
        data: {
          fileName: path.basename(filePath),
          sheets,
          totalSheets: sheets.length
        }
      };

    } catch (error) {
      console.error('❌ File analysis error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect the best table mappings for each sheet
   */
  async detectTableMappings(analysisData) {
    const detectedTables = [];

    for (const sheet of analysisData.sheets) {
      console.log(`🎯 Analyzing sheet: ${sheet.name}`);
      
      const bestMatch = await this.findBestTableMatch(sheet);
      
      if (bestMatch) {
        detectedTables.push({
          sheetName: sheet.name,
          targetTable: bestMatch.tableName,
          confidence: bestMatch.confidence,
          recordCount: sheet.recordCount,
          columnMappings: bestMatch.columnMappings,
          data: sheet.data
        });
      }
    }

    return {
      detectedTables,
      totalMappings: detectedTables.length
    };
  }

  /**
   * Find the best table match for a sheet
   */
  async findBestTableMatch(sheet) {
    let bestMatch = null;
    let highestScore = 0;

    const sheetHeaders = sheet.headers.map(h => h.toLowerCase());
    
    for (const [tableName, tableConfig] of Object.entries(this.supportedTables)) {
      const score = this.calculateMatchScore(sheetHeaders, tableConfig);
      
      if (score > highestScore && score >= 30) { // Minimum 30% confidence
        const columnMappings = this.generateColumnMappings(sheetHeaders, tableConfig);
        
        bestMatch = {
          tableName,
          confidence: Math.round(score),
          columnMappings,
          tableConfig
        };
        highestScore = score;
      }
    }

    return bestMatch;
  }

  /**
   * Calculate match score between sheet headers and table configuration
   */
  calculateMatchScore(sheetHeaders, tableConfig) {
    let score = 0;
    let totalPossibleScore = 0;

    // Check required columns (high weight)
    for (const reqCol of tableConfig.requiredColumns) {
      totalPossibleScore += 20;
      const match = this.findColumnMatch(reqCol, sheetHeaders);
      if (match) {
        score += 20;
      }
    }

    // Check optional columns (medium weight)
    for (const optCol of tableConfig.optionalColumns) {
      totalPossibleScore += 10;
      const match = this.findColumnMatch(optCol, sheetHeaders);
      if (match) {
        score += 10;
      }
    }

    // Check pattern matches (low weight)
    for (const pattern of tableConfig.patterns) {
      totalPossibleScore += 5;
      const hasPattern = sheetHeaders.some(header => 
        header.includes(pattern.toLowerCase())
      );
      if (hasPattern) {
        score += 5;
      }
    }

    return totalPossibleScore > 0 ? (score / totalPossibleScore) * 100 : 0;
  }

  /**
   * Find matching column for a given target column
   */
  findColumnMatch(targetColumn, sheetHeaders) {
    const target = targetColumn.toLowerCase().replace(/_/g, '');
    
    return sheetHeaders.find(header => {
      const normalized = header.toLowerCase().replace(/[_\s-]/g, '');
      return normalized.includes(target) || target.includes(normalized);
    });
  }

  /**
   * Generate column mappings between sheet and target table
   */
  generateColumnMappings(sheetHeaders, tableConfig) {
    const mappings = [];
    const allColumns = [...tableConfig.requiredColumns, ...tableConfig.optionalColumns];

    for (const targetCol of allColumns) {
      const sourceCol = this.findColumnMatch(targetCol, sheetHeaders);
      if (sourceCol) {
        mappings.push({
          source: sourceCol,
          target: targetCol,
          type: tableConfig.requiredColumns.includes(targetCol) ? 'required' : 'optional'
        });
      }
    }

    return mappings;
  }

  /**
   * Insert data into database based on detected mappings
   */
  async insertDataToDatabase(mappingResult) {
    const results = [];
    let totalInserted = 0;
    let totalSkipped = 0;
    const errors = [];

    for (const mapping of mappingResult.detectedTables) {
      console.log(`💾 Inserting data into: ${mapping.targetTable}`);
      
      try {
        const insertResult = await this.insertTableData(mapping);
        results.push(insertResult);
        totalInserted += insertResult.recordsInserted || 0;
        totalSkipped += insertResult.duplicatesSkipped || 0;
      } catch (error) {
        console.error(`❌ Insert error for ${mapping.targetTable}:`, error);
        errors.push({
          table: mapping.targetTable,
          error: error.message
        });
        results.push({
          tableName: mapping.targetTable,
          success: false,
          message: error.message,
          recordsInserted: 0
        });
      }
    }

    return {
      results,
      totalInserted,
      totalSkipped,
      errors
    };
  }

  /**
   * Insert data for a specific table mapping
   */
  async insertTableData(mapping) {
    const { targetTable, columnMappings, data } = mapping;
    
    if (!data || data.length === 0) {
      return {
        tableName: targetTable,
        success: false,
        message: 'No data to insert',
        recordsInserted: 0
      };
    }

    // Create column mapping object
    const colMap = {};
    columnMappings.forEach(map => {
      colMap[map.source] = map.target;
    });

    // Prepare insert statements
    const columns = Object.values(colMap);
    const placeholders = columns.map(() => '?').join(', ');
    const insertSQL = `INSERT OR IGNORE INTO ${targetTable} (${columns.join(', ')}) VALUES (${placeholders})`;

    let recordsInserted = 0;
    let duplicatesSkipped = 0;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        const stmt = this.db.prepare(insertSQL);
        
        for (const row of data) {
          try {
            const values = columns.map(col => {
              const sourceCol = Object.keys(colMap).find(key => colMap[key] === col);
              return row[sourceCol] || null;
            });

            // Skip rows with all null values
            if (values.every(val => val === null || val === '')) {
              continue;
            }

            const result = stmt.run(values);
            if (result.changes > 0) {
              recordsInserted++;
            } else {
              duplicatesSkipped++;
            }
          } catch (error) {
            console.error('Row insert error:', error);
          }
        }

        stmt.finalize((err) => {
          if (err) {
            this.db.run('ROLLBACK');
            reject(err);
          } else {
            this.db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                reject(commitErr);
              } else {
                resolve({
                  tableName: targetTable,
                  success: true,
                  message: `Successfully inserted ${recordsInserted} records`,
                  recordsInserted,
                  duplicatesSkipped
                });
              }
            });
          }
        });
      });
    });
  }

  /**
   * Generate preview data from analysis results
   */
  async generatePreview(analysisData) {
    const preview = [];
    
    for (const sheet of analysisData.sheets) {
      const sheetPreview = sheet.data.slice(0, 5).map(row => ({
        sheet: sheet.name,
        ...row
      }));
      preview.push(...sheetPreview);
    }

    return preview;
  }

  /**
   * Get database statistics after insertion
   */
  async getDatabaseStats() {
    const stats = {};

    for (const tableName of Object.keys(this.supportedTables)) {
      try {
        const count = await new Promise((resolve, reject) => {
          this.db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
            if (err) resolve(0); // Table might not exist
            else resolve(row.count);
          });
        });
        stats[tableName] = count;
      } catch (error) {
        stats[tableName] = 0;
      }
    }

    return stats;
  }

  /**
   * Get supported tables configuration
   */
  getSupportedTables() {
    return Object.entries(this.supportedTables).map(([name, config]) => ({
      name,
      description: config.description,
      requiredColumns: config.requiredColumns,
      optionalColumns: config.optionalColumns,
      priority: config.priority
    }));
  }

  /**
   * Normalize column names for better matching
   */
  normalizeColumnName(name) {
    if (!name || typeof name !== 'string') return '';
    
    return name
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_')    // Replace spaces with underscores
      .replace(/_{2,}/g, '_')  // Replace multiple underscores with single
      .replace(/^_|_$/g, '');  // Remove leading/trailing underscores
  }

  /**
   * Log upload history to database
   */
  async logUploadHistory(uploadData) {
    const insertSQL = `
      INSERT INTO excel_upload_history 
      (file_name, file_size, total_records, tables_detected, records_inserted, upload_date, status, uploaded_by)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(insertSQL, [
        uploadData.fileName,
        uploadData.fileSize,
        uploadData.totalRecords,
        uploadData.tablesDetected,
        uploadData.recordsInserted,
        uploadData.status,
        uploadData.uploadedBy
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }
}

module.exports = ExcelAnalyzer;
