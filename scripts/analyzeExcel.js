const XLSX = require('xlsx');

const wb = XLSX.readFile('/data1/jainendra/DLC_backend-main/doppw_data_03102025.xlsx');
console.log('Total Sheets:', wb.SheetNames.length);
console.log('Sheet Names:', wb.SheetNames);
console.log('\n' + '='.repeat(80));

wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  if (ws && ws['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    const rows = range.e.r + 1;
    const cols = range.e.c + 1;
    console.log(`\nSheet: ${name}`);
    console.log(`  Dimensions: ${rows} rows x ${cols} columns`);
    
    // Get first row (headers)
    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
    if (jsonData.length > 0) {
      console.log(`  Headers:`, jsonData[0].slice(0, 5).join(', '), '...');
      console.log(`  Data rows:`, jsonData.length - 1);
    }
  } else {
    console.log(`\nSheet: ${name} - EMPTY`);
  }
});
