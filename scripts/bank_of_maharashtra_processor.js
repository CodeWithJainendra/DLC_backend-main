/**
 * Bank of Maharashtra Specific Processor
 * Handles the unique format with split headers and Excel date numbers
 */

const PincodePensionerProcessor = require('./pincode_pensioner_processor');
const XLSX = require('xlsx');

class BankOfMaharashtraProcessor extends PincodePensionerProcessor {
  
  /**
   * Convert Excel date number to JavaScript Date
   */
  excelDateToJSDate(excelDate) {
    if (!excelDate || isNaN(excelDate)) return null;
    
    // Excel date starts from 1900-01-01
    // Excel incorrectly treats 1900 as a leap year, so we need to adjust
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const jsDate = new Date(excelEpoch.getTime() + excelDate * 86400000);
    
    return jsDate;
  }
  
  /**
   * Format date as DD-MM-YYYY
   */
  formatDate(date) {
    if (!date) return null;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
  
  /**
   * Process Bank of Maharashtra Excel file
   */
  async processExcelFile(filePath) {
    console.log(`\n📂 Processing Bank of Maharashtra file: ${filePath}`);
    console.log('=' .repeat(80));

    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Read as array
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    console.log(`📊 Total rows found: ${rawData.length}`);
    
    // Find header rows (PPO No. in row)
    let headerRow1Index = -1;
    let headerRow2Index = -1;
    
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (row.some(cell => String(cell).includes('PPO No'))) {
        headerRow1Index = i;
        headerRow2Index = i + 1; // Next row has Pincode header
        break;
      }
    }
    
    if (headerRow1Index < 0) {
      throw new Error('Could not find header row with "PPO No."');
    }
    
    console.log(`📋 Found headers at rows ${headerRow1Index + 1} and ${headerRow2Index + 1}`);
    
    // Data starts after header rows
    const dataStartRow = headerRow2Index + 1;
    const dataRows = rawData.slice(dataStartRow);
    
    console.log(`📊 Processing ${dataRows.length} data rows...`);
    this.stats.totalRows = dataRows.length;

    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      // Skip empty rows
      if (!row || row.length === 0 || !row[0]) {
        continue;
      }
      
      try {
        // Extract data from columns
        const ppoNumber = String(row[0] || '').trim();
        const excelDateOfBirth = row[1]; // Excel date number
        const psa = String(row[2] || '').trim() || null;
        const pda = String(row[3] || '').trim() || null;
        const bankName = String(row[4] || '').trim();
        const branchName = String(row[5] || '').trim();
        const pincode = String(row[10] || '').trim();
        
        // Validate required fields
        if (!ppoNumber) {
          console.warn(`⚠️  Row ${i + 1}: Missing PPO Number, skipping...`);
          this.stats.errors++;
          continue;
        }

        // Check for duplicate
        if (await this.isPPOExists(ppoNumber)) {
          if ((i + 1) % 1000 === 0) {
            console.log(`⏭️  Row ${i + 1}: PPO ${ppoNumber} already exists, skipping...`);
          }
          this.stats.duplicates++;
          continue;
        }

        // Convert Excel date to JavaScript date
        const jsDate = this.excelDateToJSDate(excelDateOfBirth);
        const dateOfBirth = this.formatDate(jsDate);
        
        // Calculate age
        const age = jsDate ? this.calculateAge(dateOfBirth) : null;
        const ageCategory = this.getAgeCategory(age);

        // Determine state and district from pincode
        const state = await this.getStateFromPincode(pincode) || 'Unknown';
        const district = await this.getDistrictFromPincode(pincode, null) || 'Unknown';
        
        // Create PSA text from bank name
        const psaText = psa || `${bankName} - ${branchName}`;

        // Prepare data object
        const pensionerData = {
          ppoNumber: ppoNumber,
          yearOfBirth: dateOfBirth,
          dateOfBirth: dateOfBirth,
          age: age,
          ageCategory: ageCategory,
          psa: psaText,
          psaDistrict: district,
          psaPincode: pincode,
          disbursingBranchAddress: `${bankName} - ${branchName}`,
          disbursingBranchPincode: pincode,
          pensionerAddress: `${branchName}, Pincode: ${pincode}`,
          pensionerPincode: pincode,
          state: state,
          district: district
        };

        // Insert pensioner
        await this.insertPensioner(pensionerData);

        // Update summaries
        await this.updateSummaries(pensionerData);

        this.stats.inserted++;

        // Progress indicator
        if ((i + 1) % 1000 === 0) {
          console.log(`✅ Processed ${i + 1}/${dataRows.length} rows...`);
        }

      } catch (error) {
        console.error(`❌ Error processing row ${i + 1}:`, error.message);
        this.stats.errors++;
      }
    }

    // Recalculate district and pincode counts
    await this.recalculateSummaryCounts();

    console.log('\n' + '=' .repeat(80));
    console.log('📊 Processing Complete!');
    console.log('=' .repeat(80));
    this.printStats();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node bank_of_maharashtra_processor.js <excel_file_path>');
    console.log('Example: node bank_of_maharashtra_processor.js "../EXCEL_DATA/Excel Files/21Oct/Bank of Maharashtra.xlsx"');
    process.exit(1);
  }

  const excelFilePath = args[0];
  const processor = new BankOfMaharashtraProcessor();

  try {
    await processor.initDatabase();
    await processor.processExcelFile(excelFilePath);
    await processor.getSummaryReport();
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    processor.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = BankOfMaharashtraProcessor;
