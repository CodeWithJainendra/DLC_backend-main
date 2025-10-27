#!/usr/bin/env node

/**
 * Excel to CSV Converter
 * Converts Excel files to CSV format and displays column information
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class ExcelToCsvConverter {
  /**
   * Convert Excel file to CSV and display column information
   * @param {string} excelFilePath - Path to the Excel file
   * @param {string} outputDir - Output directory for CSV files (optional)
   */
  static convert(excelFilePath, outputDir = null) {
    try {
      // Check if file exists
      if (!fs.existsSync(excelFilePath)) {
        console.error(`❌ Error: File not found - ${excelFilePath}`);
        process.exit(1);
      }

      // Set default output directory if not provided
      if (!outputDir) {
        outputDir = path.dirname(excelFilePath);
      }

      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log(`📂 Reading Excel file: ${excelFilePath}`);
      
      // Read the Excel file
      const workbook = XLSX.readFile(excelFilePath);
      console.log(`📋 Found ${workbook.SheetNames.length} worksheet(s)`);
      
      // Process each worksheet
      workbook.SheetNames.forEach((sheetName, index) => {
        console.log(`\n📄 Processing worksheet ${index + 1}: "${sheetName}"`);
        
        // Get worksheet
        const worksheet = workbook.Sheets[sheetName];
        
        // Get column information
        const columnInfo = this.getColumnInfo(worksheet);
        console.log(`📊 Columns found: ${columnInfo.count}`);
        console.log('📋 Column details:');
        columnInfo.columns.forEach((col, idx) => {
          console.log(`   ${idx + 1}. ${col.header || 'Unnamed Column'} (${col.column})`);
        });
        
        // Convert to CSV
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        
        // Generate output filename
        const baseName = path.basename(excelFilePath, path.extname(excelFilePath));
        const csvFileName = `${baseName}_${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
        const csvFilePath = path.join(outputDir, csvFileName);
        
        // Write CSV file
        fs.writeFileSync(csvFilePath, csv);
        console.log(`✅ CSV file created: ${csvFilePath}`);
        console.log(`📏 CSV file size: ${Math.round(fs.statSync(csvFilePath).size / 1024)} KB`);
      });
      
      console.log('\n🎉 Conversion completed successfully!');
      
    } catch (error) {
      console.error(`❌ Error converting Excel to CSV: ${error.message}`);
      process.exit(1);
    }
  }
  
  /**
   * Get column information from worksheet
   * @param {object} worksheet - Excel worksheet object
   * @returns {object} Column information
   */
  static getColumnInfo(worksheet) {
    const columns = [];
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    
    // Get headers from first row
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_cell({ r: 0, c: C });
      const cell = worksheet[address];
      const header = cell ? cell.v : `Column_${C + 1}`;
      
      columns.push({
        column: XLSX.utils.encode_col(C),
        header: header.toString()
      });
    }
    
    return {
      count: columns.length,
      columns: columns
    };
  }
  
  /**
   * Show only column information without converting
   * @param {string} excelFilePath - Path to the Excel file
   */
  static showColumnInfo(excelFilePath) {
    try {
      // Check if file exists
      if (!fs.existsSync(excelFilePath)) {
        console.error(`❌ Error: File not found - ${excelFilePath}`);
        process.exit(1);
      }

      console.log(`📂 Reading Excel file: ${excelFilePath}`);
      
      // Read the Excel file
      const workbook = XLSX.readFile(excelFilePath);
      console.log(`📋 Found ${workbook.SheetNames.length} worksheet(s)`);
      
      // Process each worksheet
      workbook.SheetNames.forEach((sheetName, index) => {
        console.log(`\n📄 Worksheet ${index + 1}: "${sheetName}"`);
        
        // Get worksheet
        const worksheet = workbook.Sheets[sheetName];
        
        // Get column information
        const columnInfo = this.getColumnInfo(worksheet);
        console.log(`📊 Columns found: ${columnInfo.count}`);
        console.log('📋 Column details:');
        columnInfo.columns.forEach((col, idx) => {
          console.log(`   ${idx + 1}. ${col.header || 'Unnamed Column'} (${col.column})`);
        });
      });
      
    } catch (error) {
      console.error(`❌ Error reading Excel file: ${error.message}`);
      process.exit(1);
    }
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage:');
    console.log('  node excelToCsvConverter.js <excel_file> [output_directory]');
    console.log('  node excelToCsvConverter.js --info <excel_file>');
    console.log('');
    console.log('Examples:');
    console.log('  node excelToCsvConverter.js "/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx"');
    console.log('  node excelToCsvConverter.js "/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx" "./output"');
    console.log('  node excelToCsvConverter.js --info "/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx"');
    process.exit(1);
  }
  
  if (args[0] === '--info') {
    if (args.length < 2) {
      console.error('❌ Error: Please provide Excel file path');
      process.exit(1);
    }
    ExcelToCsvConverter.showColumnInfo(args[1]);
  } else {
    const excelFilePath = args[0];
    const outputDir = args[1] || null;
    ExcelToCsvConverter.convert(excelFilePath, outputDir);
  }
}

module.exports = ExcelToCsvConverter;