/**
 * Test script for Pincode Pensioner Processor
 * Creates sample data and tests the processor
 */

const PincodePensionerProcessor = require('./pincode_pensioner_processor');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

async function createSampleExcel() {
  console.log('📝 Creating sample Excel file...');
  
  const sampleData = [
    {
      'PPO No.': 'POSTAL/2013/MA/6',
      'Year of Birth': '21-01-1946',
      'Pension Sanctioning Authority': 'SPOs,Goalpara Div, Dhubri-783301',
      'Address PinCode of Pension Disbursing Branch': 'Dhubri H.O , Pin- 783301',
      'Postal Address PinCode of pensioner': 'Dhubri H.O , Pin- 783301'
    },
    {
      'PPO No.': 'POSTAL/2013/MA/130',
      'Year of Birth': '02-01-1953',
      'Pension Sanctioning Authority': 'SPOs,Goalpara Div, Dhubri-783301',
      'Address PinCode of Pension Disbursing Branch': 'Dhubri H.O , Pin- 783301',
      'Postal Address PinCode of pensioner': 'Dhubri H.O , Pin- 783301'
    },
    {
      'PPO No.': 'GH-1886',
      'Year of Birth': '17-02-1951',
      'Pension Sanctioning Authority': 'SPOs,Goalpara Div, Dhubri-783301',
      'Address PinCode of Pension Disbursing Branch': 'Dhubri H.O , Pin- 783301',
      'Postal Address PinCode of pensioner': 'Dhubri H.O , Pin- 783301'
    },
    {
      'PPO No.': 'POSTAL/2018/MA/11154',
      'Year of Birth': '10-01-1958',
      'Pension Sanctioning Authority': 'SPOs,Goalpara Div, Dhubri-783301',
      'Address PinCode of Pension Disbursing Branch': 'Dhubri H.O , Pin- 783301',
      'Postal Address PinCode of pensioner': 'Dhubri H.O , Pin- 783301'
    },
    {
      'PPO No.': 'POSTAL/2018/MA/11127',
      'Year of Birth': '01-03-1958',
      'Pension Sanctioning Authority': 'SPOs,Goalpara Div, Dhubri-783301',
      'Address PinCode of Pension Disbursing Branch': 'Dhubri H.O , Pin- 783301',
      'Postal Address PinCode of pensioner': 'Dhubri H.O , Pin- 783301'
    },
    {
      'PPO No.': 'POSTAL/2017/MA/3792',
      'Year of Birth': '31-08-1945',
      'Pension Sanctioning Authority': 'SPOs,Goalpara Div, Dhubri-783301',
      'Address PinCode of Pension Disbursing Branch': 'Dhubri H.O , Pin- 783301',
      'Postal Address PinCode of pensioner': 'Dhubri H.O , Pin- 783301'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pensioners');
  
  const filePath = path.join(__dirname, 'sample_pensioner_data.xlsx');
  XLSX.writeFile(workbook, filePath);
  
  console.log(`✅ Sample Excel created: ${filePath}`);
  return filePath;
}

async function testProcessor() {
  console.log('\n🧪 Testing Pincode Pensioner Processor');
  console.log('='.repeat(80));
  
  try {
    // Create sample Excel
    const excelPath = await createSampleExcel();
    
    // Initialize processor
    const processor = new PincodePensionerProcessor();
    
    // Process the file
    await processor.initDatabase();
    await processor.processExcelFile(excelPath);
    await processor.getSummaryReport();
    
    // Test queries
    console.log('\n🔍 Testing Database Queries:');
    console.log('─'.repeat(80));
    
    // Query pensioners
    const pensioners = await new Promise((resolve, reject) => {
      processor.db.all('SELECT * FROM pensioner_pincode_data LIMIT 3', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n📋 Sample Pensioner Records:');
    pensioners.forEach((p, i) => {
      console.log(`\n${i + 1}. PPO: ${p.ppo_number}`);
      console.log(`   Age: ${p.age} (${p.age_category})`);
      console.log(`   State: ${p.state}, District: ${p.district}`);
      console.log(`   Pincode: ${p.pensioner_pincode}`);
    });
    
    processor.close();
    
    console.log('\n✅ Test completed successfully!');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run test
testProcessor();
