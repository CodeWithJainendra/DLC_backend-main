#!/usr/bin/env node

/**
 * Scheduled job to populate DLC data for SBI API
 * This script should be run daily after 10:30 PM
 * 
 * Usage:
 * node scripts/populateDLCData.js [date]
 * 
 * If no date is provided, it will use yesterday's date
 */

const SBIDOPPWModel = require('../models/SBIDOPPWModel');
const { database } = require('../config/database');

class DLCDataPopulator {
  constructor() {
    this.db = database.getDB();
  }

  /**
   * Get the target date for data population
   * @param {string} inputDate - Optional input date in YYYY-MM-DD format
   * @returns {string} Target date in YYYY-MM-DD format
   */
  getTargetDate(inputDate) {
    if (inputDate) {
      // Validate input date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(inputDate)) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD');
      }
      return inputDate;
    }
    
    // Default to yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  /**
   * Archive existing data before populating new data
   */
  async archiveExistingData() {
    return new Promise((resolve, reject) => {
      // console.log('📦 Archiving existing DLC data...');
      
      this.db.run(`
        INSERT INTO TBL_DOPPW_DLCDATA_ARCH 
        SELECT *, CURRENT_TIMESTAMP as archived_at 
        FROM TBL_DOPPW_DLCDATA_MST
      `, (err) => {
        if (err) {
          // console.error('❌ Error archiving data:', err);
          reject(err);
        } else {
          // console.log('✅ Data archived successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Clear the master table
   */
  async clearMasterTable() {
    return new Promise((resolve, reject) => {
      // console.log('🗑️ Clearing master table...');
      
      this.db.run(`DELETE FROM TBL_DOPPW_DLCDATA_MST`, (err) => {
        if (err) {
          // console.error('❌ Error clearing master table:', err);
          reject(err);
        } else {
          // console.log('✅ Master table cleared');
          resolve();
        }
      });
    });
  }

  /**
   * Populate DLC data from pensioner_bank_master
   * @param {string} dataDate - Target date for data population
   */
  async populateData(dataDate) {
    return new Promise((resolve, reject) => {
      // console.log(`📊 Populating DLC data for date: ${dataDate}`);
      
      const insertQuery = `
        INSERT INTO TBL_DOPPW_DLCDATA_MST (
          LEVEL1, ESCROLL_CATEGORY, GROUP_ID, PENSION_TYPE,
          BRANCH_CODE, BRANCH_NAME, BRANCH_PINCODE,
          BRANCH_STATE_CODE, BRANCH_STATE_NAME,
          BRANCH_DISTRICT_CODE, BRANCH_DISTRICT_NAME,
          CPPC_CODE, CPPC_NAME, YEAR_OF_BIRTH, AGE,
          SUBMISSION_STATUS, SUBMISSION_MODE, WAIVER_TILL,
          VERIFICATION_TYPE, PENSIONER_PINCODE,
          PENSIONER_DISTRICT_CODE, PENSIONER_DISTRICT_NAME,
          PENSIONER_STATE_CODE, PENSIONER_STATE_NAME,
          CERTIFICATE_SUBMISSION_DATE, CERTIFICATE_AUTHORIZATION_DATE,
          ACCOUNT_NUMBER, CIF_NUMBER, PPO_UNIQUE_ID,
          DATA_DATE
        )
        SELECT 
          'NON PERSONAL' as LEVEL1,
          'NON PERSONAL' as ESCROLL_CATEGORY,
          pbm.ppo_number as GROUP_ID,
          'NON PERSONAL' as PENSION_TYPE,
          pbm.branch_name as BRANCH_CODE,
          pbm.branch_name as BRANCH_NAME,
          pbm.branch_postcode as BRANCH_PINCODE,
          'NON PERSONAL' as BRANCH_STATE_CODE,
          pbm.state as BRANCH_STATE_NAME,
          'NON PERSONAL' as BRANCH_DISTRICT_CODE,
          'NON PERSONAL' as BRANCH_DISTRICT_NAME,
          pbm.branch_name as CPPC_CODE,
          pbm.branch_name as CPPC_NAME,
          CASE 
            WHEN pbm.pensioner_dob IS NOT NULL AND pbm.pensioner_dob != '' 
              AND pbm.pensioner_dob NOT LIKE '%CIVIL%'
              AND pbm.pensioner_dob NOT LIKE '%RAILWAY%'
              AND pbm.pensioner_dob NOT LIKE '%DEFENCE%'
            THEN CAST(SUBSTR(pbm.pensioner_dob, 1, 4) AS INTEGER)
            ELSE 1950
          END as YEAR_OF_BIRTH,
          CASE 
            WHEN pbm.pensioner_dob IS NOT NULL AND pbm.pensioner_dob != '' 
              AND pbm.pensioner_dob NOT LIKE '%CIVIL%'
              AND pbm.pensioner_dob NOT LIKE '%RAILWAY%'
              AND pbm.pensioner_dob NOT LIKE '%DEFENCE%'
            THEN CAST((julianday('now') - julianday(pbm.pensioner_dob)) / 365.25 AS INTEGER)
            ELSE 70
          END as AGE,
          'NON PERSONAL' as SUBMISSION_STATUS,
          'NON PERSONAL' as SUBMISSION_MODE,
          'NON PERSONAL' as WAIVER_TILL,
          'PLC' as VERIFICATION_TYPE,
          pbm.pensioner_postcode as PENSIONER_PINCODE,
          'NON PERSONAL' as PENSIONER_DISTRICT_CODE,
          'NON PERSONAL' as PENSIONER_DISTRICT_NAME,
          'NON PERSONAL' as PENSIONER_STATE_CODE,
          pbm.state as PENSIONER_STATE_NAME,
          'NON PERSONAL' as CERTIFICATE_SUBMISSION_DATE,
          'NON PERSONAL' as CERTIFICATE_AUTHORIZATION_DATE,
          pbm.ppo_number as ACCOUNT_NUMBER,
          pbm.ppo_number as CIF_NUMBER,
          pbm.ppo_number as PPO_UNIQUE_ID,
          ? as DATA_DATE
        FROM pensioner_bank_master pbm
        WHERE pbm.pensioner_postcode NOT IN ('111111', '999999')
          AND pbm.state IS NOT NULL 
          AND pbm.state != ''
      `;
      
      this.db.run(insertQuery, [dataDate], function(err) {
        if (err) {
          // console.error('❌ Error populating data:', err);
          reject(err);
        } else {
          // console.log(`✅ Data populated successfully. Rows inserted: ${this.changes}`);
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Generate batch IDs for the populated data
   * @param {string} dataDate - Target date for batch ID generation
   */
  async generateBatchIds(dataDate) {
    return new Promise((resolve, reject) => {
      // console.log('🔢 Generating batch IDs...');
      
      // First, get state-wise record counts
      this.db.all(`
        SELECT 
          PENSIONER_STATE_NAME,
          COUNT(*) as record_count
        FROM TBL_DOPPW_DLCDATA_MST 
        WHERE DATA_DATE = ?
        GROUP BY PENSIONER_STATE_NAME
      `, [dataDate], (err, states) => {
        if (err) {
          // console.error('❌ Error getting state counts:', err);
          reject(err);
          return;
        }

        let processedStates = 0;
        let totalBatches = 0;

        if (states.length === 0) {
          // console.log('⚠️ No data found for batch ID generation');
          resolve(0);
          return;
        }

        states.forEach(state => {
          const { PENSIONER_STATE_NAME, record_count } = state;
          const batchesForState = Math.ceil(record_count / 10000);
          
          // console.log(`📊 ${PENSIONER_STATE_NAME}: ${record_count} records, ${batchesForState} batches`);

          // Update batch IDs for this state
          this.db.run(`
            UPDATE TBL_DOPPW_DLCDATA_MST 
            SET BATCH_ID = (
              SELECT 
                CASE 
                  WHEN COUNT(*) <= 10000 THEN 1
                  ELSE CAST((ROW_NUMBER() OVER (ORDER BY PPO_UNIQUE_ID) - 1) / 10000 + 1 AS INTEGER)
                END
              FROM TBL_DOPPW_DLCDATA_MST t2 
              WHERE t2.PENSIONER_STATE_NAME = TBL_DOPPW_DLCDATA_MST.PENSIONER_STATE_NAME
                AND t2.DATA_DATE = TBL_DOPPW_DLCDATA_MST.DATA_DATE
            )
            WHERE PENSIONER_STATE_NAME = ? AND DATA_DATE = ?
          `, [PENSIONER_STATE_NAME, dataDate], (err) => {
            if (err) {
              // console.error(`❌ Error updating batch IDs for ${PENSIONER_STATE_NAME}:`, err);
              reject(err);
              return;
            }

            processedStates++;
            totalBatches += batchesForState;

            if (processedStates === states.length) {
              // console.log(`✅ Batch IDs generated successfully. Total batches: ${totalBatches}`);
              resolve(totalBatches);
            }
          });
        });
      });
    });
  }

  /**
   * Get summary statistics
   * @param {string} dataDate - Target date
   */
  async getSummary(dataDate) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT PENSIONER_STATE_NAME) as total_states,
          MAX(BATCH_ID) as max_batch_id
        FROM TBL_DOPPW_DLCDATA_MST 
        WHERE DATA_DATE = ?
      `, [dataDate], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Main execution method
   * @param {string} inputDate - Optional input date
   */
  async execute(inputDate) {
    try {
      const dataDate = this.getTargetDate(inputDate);
      // console.log(`🚀 Starting DLC data population for date: ${dataDate}`);
      // console.log(`⏰ Started at: ${new Date().toISOString()}`);

      // Step 1: Archive existing data
      await this.archiveExistingData();

      // Step 2: Clear master table
      await this.clearMasterTable();

      // Step 3: Populate new data
      const insertedRows = await this.populateData(dataDate);

      // Step 4: Generate batch IDs
      const totalBatches = await this.generateBatchIds(dataDate);

      // Step 5: Get summary
      const summary = await this.getSummary(dataDate);

      // console.log('\n📈 SUMMARY:');
      // console.log(`📅 Date: ${dataDate}`);
      // console.log(`📊 Total Records: ${summary.total_records}`);
      // console.log(`🗺️ Total States: ${summary.total_states}`);
      // console.log(`📦 Total Batches: ${totalBatches}`);
      // console.log(`⏰ Completed at: ${new Date().toISOString()}`);
      // console.log('✅ DLC data population completed successfully!');

      return {
        success: true,
        dataDate,
        totalRecords: summary.total_records,
        totalStates: summary.total_states,
        totalBatches,
        insertedRows
      };

    } catch (error) {
      // console.error('❌ DLC data population failed:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const inputDate = process.argv[2];
  const populator = new DLCDataPopulator();
  
  try {
    const result = await populator.execute(inputDate);
    // console.log('\n🎉 SUCCESS:', result);
    process.exit(0);
  } catch (error) {
    // console.error('\n💥 FAILED:', error.message);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = DLCDataPopulator;
