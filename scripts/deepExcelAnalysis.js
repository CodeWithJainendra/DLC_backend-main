#!/usr/bin/env node

const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '/data1/jainendra/DLC_backend-main/doppw_data_03102025.xlsx';

console.log('='.repeat(80));
console.log('🔍 DEEP EXCEL FILE ANALYSIS');
console.log('='.repeat(80));
console.log('File:', filePath);
console.log('Size:', (fs.statSync(filePath).size / 1024 / 1024).toFixed(2), 'MB');
console.log('='.repeat(80));

// Read with all options
const workbook = XLSX.readFile(filePath, {
  cellDates: true,
  cellNF: false,
  cellText: false,
  raw: false,
  dense: false,
  sheetStubs: true, // Include stub cells
  bookSheets: true  // Only read sheet names
});

console.log('\n📋 TOTAL SHEETS:', workbook.SheetNames.length);
console.log('Sheet Names:', workbook.SheetNames);

// Re-read with full data
const fullWorkbook = XLSX.readFile(filePath);

fullWorkbook.SheetNames.forEach((sheetName, idx) => {
  console.log('\n' + '─'.repeat(80));
  console.log(`📄 SHEET ${idx + 1}: "${sheetName}"`);
  console.log('─'.repeat(80));
  
  const ws = fullWorkbook.Sheets[sheetName];
  
  if (!ws || !ws['!ref']) {
    console.log('   ❌ Empty or no reference');
    return;
  }
  
  const range = XLSX.utils.decode_range(ws['!ref']);
  console.log(`   📐 Range: ${ws['!ref']}`);
  console.log(`   📊 Rows: ${range.e.r + 1} (from ${range.s.r} to ${range.e.r})`);
  console.log(`   📊 Columns: ${range.e.c + 1} (from ${range.s.c} to ${range.e.c})`);
  
  // Check if hidden
  if (ws['!hidden']) {
    console.log(`   🔒 Sheet is HIDDEN`);
  }
  
  // Try different conversion methods
  console.log('\n   🔍 Trying different data extraction methods:');
  
  // Method 1: sheet_to_json with header
  try {
    const json1 = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
    console.log(`   Method 1 (header:1): ${json1.length} rows`);
    if (json1.length > 0) {
      const nonEmptyRows = json1.filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));
      console.log(`   Non-empty rows: ${nonEmptyRows.length}`);
      if (nonEmptyRows.length > 0) {
        console.log(`   First row (${nonEmptyRows[0].length} cells):`, nonEmptyRows[0].slice(0, 5));
      }
    }
  } catch (e) {
    console.log(`   Method 1 ERROR:`, e.message);
  }
  
  // Method 2: sheet_to_json without options
  try {
    const json2 = XLSX.utils.sheet_to_json(ws);
    console.log(`   Method 2 (default): ${json2.length} rows`);
    if (json2.length > 0) {
      console.log(`   Sample keys:`, Object.keys(json2[0]).slice(0, 5));
    }
  } catch (e) {
    console.log(`   Method 2 ERROR:`, e.message);
  }
  
  // Method 3: sheet_to_csv
  try {
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    const csvLines = csv.split('\n').filter(line => line.trim() !== '');
    console.log(`   Method 3 (CSV): ${csvLines.length} lines`);
  } catch (e) {
    console.log(`   Method 3 ERROR:`, e.message);
  }
  
  // Check specific cells
  console.log('\n   📍 Sample cell values:');
  const sampleCells = ['A1', 'A2', 'B1', 'B2', 'C1'];
  sampleCells.forEach(cell => {
    if (ws[cell]) {
      console.log(`   ${cell}:`, ws[cell].v || ws[cell].w || 'undefined');
    }
  });
});

console.log('\n' + '='.repeat(80));
console.log('✅ ANALYSIS COMPLETE');
console.log('='.repeat(80));
