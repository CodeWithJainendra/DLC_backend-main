const XLSX = require('xlsx');
const path = require('path');

// List of Excel files to analyze
const excelFiles = [
  '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx',
  '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx',
  '/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx',
  '/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx'
];

console.log('Analyzing Excel files...\n');

excelFiles.forEach(filePath => {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`File: ${path.basename(filePath)}`);
    console.log(`${'='.repeat(80)}`);
    
    const workbook = XLSX.readFile(filePath);
    console.log(`Total Sheets: ${workbook.SheetNames.length}`);
    console.log(`Sheet Names: ${workbook.SheetNames.join(', ')}`);
    
    workbook.SheetNames.forEach(sheetName => {
      console.log(`\n--- Sheet: ${sheetName} ---`);
      const worksheet = workbook.Sheets[sheetName];
      
      if (worksheet && worksheet['!ref']) {
        // Get data as JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        console.log(`Rows: ${jsonData.length}`);
        
        if (jsonData.length > 0) {
          // Show headers (first row keys)
          const headers = Object.keys(jsonData[0]);
          console.log(`Columns (${headers.length}): ${headers.join(', ')}`);
          
          // Show first few rows as sample
          console.log('\nSample Data (First 2 rows):');
          const sampleRows = jsonData.slice(0, 2);
          sampleRows.forEach((row, index) => {
            console.log(`  Row ${index + 1}:`, JSON.stringify(row, null, 2));
          });
        }
      } else {
        console.log('Empty sheet');
      }
    });
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
  }
});