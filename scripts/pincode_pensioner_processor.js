/**
 * Pincode-Based Pensioner Data Processor
 * 
 * Processes Excel data and organizes pensioners by:
 * - State -> District -> Pincode
 * - Age categories
 * - Pension Sanctioning Authority (PSA)
 * - Disbursing Branch details
 * 
 * Prevents duplicate entries based on PPO Number
 */

const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class PincodePensionerProcessor {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '..', 'database.db');
    this.db = null;
    this.pincodeMapping = this.loadPincodeMapping();
    this.stats = {
      totalRows: 0,
      inserted: 0,
      duplicates: 0,
      errors: 0,
      stateDistribution: {},
      districtDistribution: {},
      pincodeDistribution: {},
      ageCategories: {}
    };
  }

  /**
   * Initialize database connection and create tables
   */
  async initDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ Database connected');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  /**
   * Create all required tables
   */
  async createTables() {
    const tables = [
      // Main pensioner data table
      `CREATE TABLE IF NOT EXISTS pensioner_pincode_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ppo_number TEXT UNIQUE NOT NULL,
        year_of_birth TEXT,
        date_of_birth DATE,
        age INTEGER,
        age_category TEXT,
        pension_sanctioning_authority TEXT,
        psa_district TEXT,
        psa_pincode TEXT,
        disbursing_branch_address TEXT,
        disbursing_branch_pincode TEXT,
        pensioner_postal_address TEXT,
        pensioner_pincode TEXT,
        state TEXT,
        district TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // State-wise summary
      `CREATE TABLE IF NOT EXISTS state_pensioner_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT UNIQUE NOT NULL,
        total_pensioners INTEGER DEFAULT 0,
        total_districts INTEGER DEFAULT 0,
        total_pincodes INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // District-wise summary
      `CREATE TABLE IF NOT EXISTS district_pensioner_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        district TEXT NOT NULL,
        total_pensioners INTEGER DEFAULT 0,
        total_pincodes INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(state, district)
      )`,

      // Pincode-wise summary
      `CREATE TABLE IF NOT EXISTS pincode_pensioner_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        district TEXT NOT NULL,
        pincode TEXT NOT NULL,
        total_pensioners INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(state, district, pincode)
      )`,

      // Age category summary
      `CREATE TABLE IF NOT EXISTS age_category_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        district TEXT,
        age_category TEXT NOT NULL,
        total_pensioners INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(state, district, age_category)
      )`,

      // PSA (Pension Sanctioning Authority) summary
      `CREATE TABLE IF NOT EXISTS psa_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        psa_full_text TEXT NOT NULL,
        psa_district TEXT,
        psa_pincode TEXT,
        state TEXT,
        total_pensioners INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(psa_full_text)
      )`,

      // Disbursing branch summary
      `CREATE TABLE IF NOT EXISTS disbursing_branch_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        branch_pincode TEXT NOT NULL,
        branch_address TEXT,
        state TEXT,
        district TEXT,
        total_pensioners INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_pincode, branch_address)
      )`
    ];

    for (const sql of tables) {
      await this.runQuery(sql);
    }

    console.log('✅ All tables created successfully');
  }

  /**
   * Helper to run SQL queries
   */
  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  /**
   * Helper to get single row
   */
  getRow(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Parse PSA (Pension Sanctioning Authority) to extract district and pincode
   * Example: "SPOs,Goalpara Div, Dhubri-783301"
   */
  parsePSA(psaText) {
    if (!psaText) return { district: null, pincode: null };
    
    // Convert to string if it's not
    const psaStr = String(psaText);

    // Extract pincode (6 digits)
    const pincodeMatch = psaStr.match(/\b(\d{6})\b/);
    const pincode = pincodeMatch ? pincodeMatch[1] : null;

    // Extract district name (text before pincode or after comma)
    let district = null;
    if (psaStr.includes(',')) {
      const parts = psaStr.split(',');
      // Usually district is in the last part before pincode
      const lastPart = parts[parts.length - 1].trim();
      district = lastPart.replace(/-?\d{6}/, '').trim();
      
      // If district is empty, try second last part
      if (!district && parts.length > 1) {
        district = parts[parts.length - 2].trim();
      }
    }

    return { district, pincode };
  }

  /**
   * Calculate age from date of birth
   */
  calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;

    let dob;
    if (typeof dateOfBirth === 'string') {
      // Convert to string and trim
      const dobStr = String(dateOfBirth).trim();
      
      // Handle DD-MM-YYYY or DD.MM.YYYY format
      let parts = dobStr.split('-');
      if (parts.length !== 3) {
        // Try dot separator
        parts = dobStr.split('.');
      }
      if (parts.length !== 3) {
        // Try slash separator
        parts = dobStr.split('/');
      }
      
      if (parts.length === 3) {
        // Assume DD-MM-YYYY or DD.MM.YYYY format
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          dob = new Date(year, month - 1, day);
        } else {
          return null;
        }
      } else {
        dob = new Date(dobStr);
      }
    } else {
      dob = new Date(dateOfBirth);
    }

    if (isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Get age category
   */
  getAgeCategory(age) {
    if (!age || age < 0) return 'Unknown';
    if (age < 60) return 'Below 60';
    if (age >= 60 && age < 70) return '60-69';
    if (age >= 70 && age < 80) return '70-79';
    if (age >= 80 && age < 90) return '80-89';
    if (age >= 90) return '90+';
    return 'Unknown';
  }

  /**
   * Extract pincode from address
   */
  extractPincode(address) {
    if (!address) return null;
    // Convert to string if it's a number
    const addressStr = String(address).trim();
    
    // Match exactly 6 digits (not 7 or 5)
    const match = addressStr.match(/\b(\d{6})\b/);
    if (match) {
      const pincode = match[1];
      // Validate it's exactly 6 digits
      if (pincode.length === 6) {
        return pincode;
      }
    }
    
    // Try to find 6 consecutive digits anywhere
    const allDigits = addressStr.match(/\d+/g);
    if (allDigits) {
      for (const digits of allDigits) {
        if (digits.length === 6) {
          return digits;
        }
      }
    }
    
    return null;
  }

  /**
   * Load pincode to state mapping
   */
  loadPincodeMapping() {
    try {
      const mappingPath = path.join(__dirname, 'pincode_state_mapping.json');
      if (fs.existsSync(mappingPath)) {
        return JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
      }
    } catch (error) {
      console.warn('⚠️  Could not load pincode mapping:', error.message);
    }
    return { pincodeRanges: {}, specialCases: {} };
  }

  /**
   * Get state from pincode
   */
  async getStateFromPincode(pincode) {
    if (!pincode || pincode.length !== 6) return 'Unknown';
    
    // Check special cases first
    if (this.pincodeMapping.specialCases && this.pincodeMapping.specialCases[pincode]) {
      return this.pincodeMapping.specialCases[pincode].state;
    }
    
    // Check by first 2 digits
    const prefix = pincode.substring(0, 2);
    for (const [state, ranges] of Object.entries(this.pincodeMapping.pincodeRanges || {})) {
      if (ranges.includes(prefix)) {
        return state;
      }
    }
    
    return 'Unknown';
  }

  /**
   * Get district from pincode
   */
  async getDistrictFromPincode(pincode, psaDistrict) {
    // Prefer PSA district if available
    if (psaDistrict && psaDistrict !== 'Unknown') return psaDistrict;
    
    // Check special cases
    if (this.pincodeMapping.specialCases && this.pincodeMapping.specialCases[pincode]) {
      return this.pincodeMapping.specialCases[pincode].district;
    }
    
    return psaDistrict || 'Unknown';
  }

  /**
   * Check if PPO number already exists
   */
  async isPPOExists(ppoNumber) {
    const row = await this.getRow(
      'SELECT id FROM pensioner_pincode_data WHERE ppo_number = ?',
      [ppoNumber]
    );
    return !!row;
  }

  /**
   * Insert pensioner data
   */
  async insertPensioner(data) {
    const sql = `
      INSERT INTO pensioner_pincode_data (
        ppo_number, year_of_birth, date_of_birth, age, age_category,
        pension_sanctioning_authority, psa_district, psa_pincode,
        disbursing_branch_address, disbursing_branch_pincode,
        pensioner_postal_address, pensioner_pincode,
        state, district
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

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

  /**
   * Update summary tables
   */
  async updateSummaries(data) {
    // Update state summary
    await this.runQuery(`
      INSERT INTO state_pensioner_summary (state, total_pensioners, total_districts, total_pincodes, last_updated)
      VALUES (?, 1, 1, 1, datetime('now'))
      ON CONFLICT(state) DO UPDATE SET
        total_pensioners = total_pensioners + 1,
        last_updated = datetime('now')
    `, [data.state]);

    // Update district summary
    await this.runQuery(`
      INSERT INTO district_pensioner_summary (state, district, total_pensioners, total_pincodes, last_updated)
      VALUES (?, ?, 1, 1, datetime('now'))
      ON CONFLICT(state, district) DO UPDATE SET
        total_pensioners = total_pensioners + 1,
        last_updated = datetime('now')
    `, [data.state, data.district]);

    // Update pincode summary (only if pincode exists)
    if (data.pensionerPincode) {
      await this.runQuery(`
        INSERT INTO pincode_pensioner_summary (state, district, pincode, total_pensioners, last_updated)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT(state, district, pincode) DO UPDATE SET
          total_pensioners = total_pensioners + 1,
          last_updated = datetime('now')
      `, [data.state, data.district, data.pensionerPincode]);
    }

    // Update age category summary
    await this.runQuery(`
      INSERT INTO age_category_summary (state, district, age_category, total_pensioners, last_updated)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT(state, district, age_category) DO UPDATE SET
        total_pensioners = total_pensioners + 1,
        last_updated = datetime('now')
    `, [data.state, data.district, data.ageCategory]);

    // Update PSA summary
    await this.runQuery(`
      INSERT INTO psa_summary (psa_full_text, psa_district, psa_pincode, state, total_pensioners, last_updated)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(psa_full_text) DO UPDATE SET
        total_pensioners = total_pensioners + 1,
        last_updated = datetime('now')
    `, [data.psa, data.psaDistrict, data.psaPincode, data.state]);

    // Update disbursing branch summary
    await this.runQuery(`
      INSERT INTO disbursing_branch_summary (branch_pincode, branch_address, state, district, total_pensioners, last_updated)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(branch_pincode, branch_address) DO UPDATE SET
        total_pensioners = total_pensioners + 1,
        last_updated = datetime('now')
    `, [data.disbursingBranchPincode, data.disbursingBranchAddress, data.state, data.district]);
  }

  /**
   * Process Excel file
   */
  async processExcelFile(filePath) {
    console.log(`\n📂 Processing Excel file: ${filePath}`);
    console.log('=' .repeat(80));

    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Read as array to check structure
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    // Find the actual header row (look for 'PPO No.')
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
      // Use the found header row
      console.log(`📋 Found headers at row ${headerRowIndex + 1}`);
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      range.s.r = headerRowIndex; // Start from header row
      const newRef = XLSX.utils.encode_range(range);
      const tempWs = Object.assign({}, worksheet, { '!ref': newRef });
      data = XLSX.utils.sheet_to_json(tempWs, { defval: '' });
    } else {
      // Fallback to original method
      data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    }

    console.log(`📊 Total rows found: ${data.length}`);
    this.stats.totalRows = data.length;

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      try {
        // Extract data from row (adjust column names based on your Excel)
        const ppoNumber = row['PPO No.'] || row['PPO No'] || row['ppo_number'];
        const yearOfBirth = row['Year of Birth'] || row['YOB'] || row['year_of_birth'];
        const psa = row['Pension Sanctioning Authority'] || row['PSA'] || row['psa'];
        const disbursingBranchAddress = row['Address PinCode of Pension Disbursing Branch'] || 
                                       row['Disbursing Branch'] || 
                                       row['disbursing_branch'];
        const pensionerAddress = row['Postal Address PinCode of pensioner'] || 
                                row['Pensioner Address'] || 
                                row['pensioner_address'];

        // Validate required fields
        if (!ppoNumber) {
          console.warn(`⚠️  Row ${i + 1}: Missing PPO Number, skipping...`);
          this.stats.errors++;
          continue;
        }

        // Check for duplicate
        if (await this.isPPOExists(ppoNumber)) {
          console.log(`⏭️  Row ${i + 1}: PPO ${ppoNumber} already exists, skipping...`);
          this.stats.duplicates++;
          continue;
        }

        // Parse PSA to extract district and pincode
        const psaInfo = this.parsePSA(psa);

        // Extract pincodes
        const disbursingBranchPincode = this.extractPincode(disbursingBranchAddress);
        let pensionerPincode = this.extractPincode(pensionerAddress);
        
        // If pensioner pincode not found, try PSA pincode as fallback
        if (!pensionerPincode && psaInfo.pincode) {
          pensionerPincode = psaInfo.pincode;
        }

        // Calculate age
        const age = this.calculateAge(yearOfBirth);
        const ageCategory = this.getAgeCategory(age);

        // Determine state and district
        const state = await this.getStateFromPincode(pensionerPincode) || 
                     await this.getStateFromPincode(psaInfo.pincode) || 
                     await this.getStateFromPincode(disbursingBranchPincode) ||
                     'Unknown';
        const district = await this.getDistrictFromPincode(pensionerPincode, psaInfo.district);

        // Prepare data object
        const pensionerData = {
          ppoNumber: ppoNumber,
          yearOfBirth: yearOfBirth,
          dateOfBirth: yearOfBirth, // You may need to convert this
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

        // Insert pensioner
        await this.insertPensioner(pensionerData);

        // Update summaries (batch mode - only update counts, not individual summaries)
        // We'll recalculate all summaries at the end
        
        this.stats.inserted++;

        // Progress indicator (every 500 rows for speed)
        if ((i + 1) % 500 === 0) {
          console.log(`✅ Processed ${i + 1}/${data.length} rows...`);
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

  /**
   * Recalculate summary counts for districts and pincodes
   */
  async recalculateSummaryCounts() {
    console.log('\n🔄 Recalculating summary counts...');

    // Update district counts in state summary
    await this.runQuery(`
      UPDATE state_pensioner_summary
      SET total_districts = (
        SELECT COUNT(DISTINCT district)
        FROM district_pensioner_summary
        WHERE district_pensioner_summary.state = state_pensioner_summary.state
      )
    `);

    // Update pincode counts in state summary
    await this.runQuery(`
      UPDATE state_pensioner_summary
      SET total_pincodes = (
        SELECT COUNT(DISTINCT pincode)
        FROM pincode_pensioner_summary
        WHERE pincode_pensioner_summary.state = state_pensioner_summary.state
      )
    `);

    // Update pincode counts in district summary
    await this.runQuery(`
      UPDATE district_pensioner_summary
      SET total_pincodes = (
        SELECT COUNT(DISTINCT pincode)
        FROM pincode_pensioner_summary
        WHERE pincode_pensioner_summary.state = district_pensioner_summary.state
          AND pincode_pensioner_summary.district = district_pensioner_summary.district
      )
    `);

    console.log('✅ Summary counts updated');
  }

  /**
   * Print statistics
   */
  printStats() {
    console.log(`\n📈 Statistics:`);
    console.log(`   Total Rows: ${this.stats.totalRows}`);
    console.log(`   ✅ Inserted: ${this.stats.inserted}`);
    console.log(`   ⏭️  Duplicates: ${this.stats.duplicates}`);
    console.log(`   ❌ Errors: ${this.stats.errors}`);
  }

  /**
   * Get summary report
   */
  async getSummaryReport() {
    console.log('\n' + '=' .repeat(80));
    console.log('📊 SUMMARY REPORT');
    console.log('=' .repeat(80));

    // State-wise summary
    const states = await new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM state_pensioner_summary ORDER BY total_pensioners DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('\n🗺️  STATE-WISE SUMMARY:');
    console.log('─'.repeat(80));
    states.forEach(state => {
      console.log(`   ${state.state}: ${state.total_pensioners} pensioners, ${state.total_districts} districts, ${state.total_pincodes} pincodes`);
    });

    // Age category summary
    const ageCategories = await new Promise((resolve, reject) => {
      this.db.all(`
        SELECT age_category, SUM(total_pensioners) as total
        FROM age_category_summary
        GROUP BY age_category
        ORDER BY 
          CASE age_category
            WHEN 'Below 60' THEN 1
            WHEN '60-69' THEN 2
            WHEN '70-79' THEN 3
            WHEN '80-89' THEN 4
            WHEN '90+' THEN 5
            ELSE 6
          END
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('\n👴 AGE CATEGORY SUMMARY:');
    console.log('─'.repeat(80));
    ageCategories.forEach(cat => {
      console.log(`   ${cat.age_category}: ${cat.total} pensioners`);
    });

    console.log('\n' + '=' .repeat(80));
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('✅ Database connection closed');
        }
      });
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node pincode_pensioner_processor.js <excel_file_path>');
    console.log('Example: node pincode_pensioner_processor.js "Excel Files/Pensioner_Data.xlsx"');
    process.exit(1);
  }

  const excelFilePath = args[0];
  const processor = new PincodePensionerProcessor();

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

module.exports = PincodePensionerProcessor;
