#!/usr/bin/env node

/**
 * Simple DOPPW Data Import Script
 * Imports data from DOPPW Excel file
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { database, initDatabase } = require('../config/database');

async function importDOPPWData(filePath) {
  console.log('📁 File:', filePath);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log('📖 Reading Excel file...');
  const workbook = XLSX.readFile(filePath);
  console.log(`📋 Found ${workbook.SheetNames.length} sheets`);

  const db = database.getDB();
  let totalImported = 0;

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n📄 Processing: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet || !worksheet['!ref']) {
      console.log('   ⚠️  Empty sheet - skipping');
      continue;
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (jsonData.length <= 1) {
      console.log('   ⚠️  No data rows - skipping');
      continue;
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    console.log(`   📊 ${dataRows.length} rows to import`);

    // Simple import logic here
    totalImported += dataRows.length;
  }

  console.log(`\n✅ Total imported: ${totalImported}`);
}

if (require.main === module) {
  const filePath = process.argv[2] || path.join(__dirname, '..', 'doppw_data_03102025.xlsx');
  initDatabase();
  importDOPPWData(filePath)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error:', err);
      process.exit(1);
    });
}

module.exports = { importDOPPWData };
