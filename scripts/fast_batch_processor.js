/**
 * Fast Batch Processor - Optimized for large files
 * Uses batch inserts and minimal logging
 */

const PincodePensionerProcessor = require('./pincode_pensioner_processor');

class FastBatchProcessor extends PincodePensionerProcessor {
  
  constructor(dbPath = null, batchSize = 100) {
    super(dbPath);
    this.batchSize = batchSize;
    this.pendingBatch = [];
  }
  
  /**
   * Insert batch of pensioners at once
   */
  async insertBatch(batch) {
    if (batch.length === 0) return;
    
    const sql = `
      INSERT INTO pensioner_pincode_data (
        ppo_number, year_of_birth, date_of_birth, age, age_category,
        pension_sanctioning_authority, psa_district, psa_pincode,
        disbursing_branch_address, disbursing_branch_pincode,
        pensioner_postal_address, pensioner_pincode,
        state, district
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    // Use transaction for batch
    await this.runQuery('BEGIN TRANSACTION');
    
    try {
      for (const data of batch) {
        const params = [
          data.ppoNumber,
          data.yearOfBirth,
          data.dateOfBirth,
          data.age,
          data.ageCategory,
          data.psa,
          data.psaDistrict,
          data.psaPincode,
          data.disbursingBranchAddress,
          data.disbursingBranchPincode,
          data.pensionerAddress,
          data.pensionerPincode,
          data.state,
          data.district
        ];
        
        await this.runQuery(sql, params);
      }
      
      await this.runQuery('COMMIT');
    } catch (error) {
      await this.runQuery('ROLLBACK');
      throw error;
    }
  }
  
  /**
   * Add to batch and insert when full
   */
  async addToBatch(data) {
    this.pendingBatch.push(data);
    
    if (this.pendingBatch.length >= this.batchSize) {
      await this.insertBatch(this.pendingBatch);
      this.stats.inserted += this.pendingBatch.length;
      this.pendingBatch = [];
    }
  }
  
  /**
   * Flush remaining batch
   */
  async flushBatch() {
    if (this.pendingBatch.length > 0) {
      await this.insertBatch(this.pendingBatch);
      this.stats.inserted += this.pendingBatch.length;
      this.pendingBatch = [];
    }
  }
  
  /**
   * Override processExcelFile for batch processing
   */
  async processExcelFile(filePath) {
    console.log(`\n📂 Processing Excel file (FAST MODE): ${filePath}`);
    console.log('=' .repeat(80));

    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (row.some(cell => String(cell).includes('PPO No'))) {
        headerRowIndex = i;
        break;
      }
    }
    
    let data;
    if (headerRowIndex >= 0) {
      console.log(`📋 Found headers at row ${headerRowIndex + 1}`);
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      range.s.r = headerRowIndex;
      const newRef = XLSX.utils.encode_range(range);
      const tempWs = Object.assign({}, worksheet, { '!ref': newRef });
      data = XLSX.utils.sheet_to_json(tempWs, { defval: '' });
    } else {
      data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    }

    console.log(`📊 Total rows found: ${data.length}`);
    console.log(`⚡ Batch size: ${this.batchSize} rows per transaction`);
    this.stats.totalRows = data.length;

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      try {
        const ppoNumber = row['PPO No.'] || row['PPO No'] || row['ppo_number'];
        const yearOfBirth = row['Year of Birth'] || row['Year of Birth '] || row['YOB'] || row['year_of_birth'];
        const psa = row['Pension Sanctioning Authority'] || row['Pension Sanctioning Authority '] || row['PSA'] || row['psa'];
        const disbursingBranchAddress = row['Address PinCode of Pension Disbursing Branch'] || 
                                       row['Address Pincode of Pension Disbursing Branch'] ||
                                       row['Disbursing Branch'] || 
                                       row['disbursing_branch'];
        const pensionerAddress = row['Postal Address PinCode of pensioner'] || 
                                row['Postal Address PinCode of Pensioner'] ||
                                row['Pensioner Address'] || 
                                row['pensioner_address'];

        if (!ppoNumber) {
          this.stats.errors++;
          continue;
        }

        if (await this.isPPOExists(ppoNumber)) {
          this.stats.duplicates++;
          continue;
        }

        const psaInfo = this.parsePSA(psa);
        const disbursingBranchPincode = this.extractPincode(disbursingBranchAddress);
        let pensionerPincode = this.extractPincode(pensionerAddress);
        
        if (!pensionerPincode && psaInfo.pincode) {
          pensionerPincode = psaInfo.pincode;
        }

        const age = this.calculateAge(yearOfBirth);
        const ageCategory = this.getAgeCategory(age);

        const state = await this.getStateFromPincode(pensionerPincode) || 
                     await this.getStateFromPincode(psaInfo.pincode) || 
                     await this.getStateFromPincode(disbursingBranchPincode) ||
                     'Unknown';
        const district = await this.getDistrictFromPincode(pensionerPincode, psaInfo.district);

        const pensionerData = {
          ppoNumber: ppoNumber,
          yearOfBirth: yearOfBirth,
          dateOfBirth: yearOfBirth,
          age: age,
          ageCategory: ageCategory,
          psa: psa,
          psaDistrict: psaInfo.district,
          psaPincode: psaInfo.pincode,
          disbursingBranchAddress: disbursingBranchAddress,
          disbursingBranchPincode: disbursingBranchPincode,
          pensionerAddress: pensionerAddress,
          pensionerPincode: pensionerPincode,
          state: state,
          district: district
        };

        await this.addToBatch(pensionerData);

        // Progress indicator (every 1000 rows)
        if ((i + 1) % 1000 === 0) {
          console.log(`✅ Processed ${i + 1}/${data.length} rows...`);
        }

      } catch (error) {
        console.error(`❌ Error processing row ${i + 1}:`, error.message);
        this.stats.errors++;
      }
    }

    // Flush remaining batch
    await this.flushBatch();

    // Recalculate summaries
    console.log('\n🔄 Recalculating summary counts...');
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
    console.log('Usage: node fast_batch_processor.js <excel_file_path> [batch_size]');
    console.log('Example: node fast_batch_processor.js "file.xlsx" 100');
    process.exit(1);
  }

  const excelFilePath = args[0];
  const batchSize = args[1] ? parseInt(args[1]) : 100;
  
  const processor = new FastBatchProcessor(null, batchSize);

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

if (require.main === module) {
  main();
}

module.exports = FastBatchProcessor;
