const { database } = require('../config/database');

class SBIDOPPWModel {
  /**
   * Get batch IDs for a specific state and date
   * @param {string} state - State name
   * @param {string} date - Date in DD-MM-YYYY format
   * @returns {Promise<Object>} Batch information
   */
  static async getBatchIds(state, date) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_records,
          MAX(BATCH_ID) as max_batch_id
        FROM TBL_DOPPW_DLCDATA_MST 
        WHERE PENSIONER_STATE_NAME = ? 
          AND DATA_DATE = ?
          AND BATCH_ID IS NOT NULL
      `;
      
      database.getDB().get(query, [state, date], (err, row) => {
        if (err) {
          reject(err);
        } else {
          const totalRecords = row.total_records || 0;
          const maxBatchId = row.max_batch_id || 0;
          const totalBatches = Math.ceil(totalRecords / 10000);
          
          resolve({
            total_records: totalRecords,
            max_batch_id: maxBatchId,
            total_batches: totalBatches
          });
        }
      });
    });
  }

  /**
   * Get verification records for a specific state, date and batch ID
   * @param {string} state - State name
   * @param {string} date - Date in DD-MM-YYYY format
   * @param {number} batchId - Batch ID
   * @returns {Promise<Array>} Verification records
   */
  static async getVerificationRecords(state, date, batchId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          PENSIONER_PINCODE,
          CASE 
            WHEN PSA = 'CENTRAL' THEN 'CENTRAL'
            WHEN PSA = 'RAILWAY' THEN 'RAILWAY'
            WHEN PSA = 'DEFENCE' THEN 'DEFENCE'
            WHEN PSA LIKE '%AUTONOMOUS%' THEN 'CENTRAL AUTONOMOUS BODIES'
            WHEN PSA LIKE '%STATE%' THEN 'STATE AUTONOMOUS BODIES'
            ELSE 'CENTRAL'
          END as Type_of_Pensioner,
          CASE 
            WHEN PSA = 'CENTRAL' THEN 'CPAO'
            WHEN PSA = 'RAILWAY' THEN 'RAILWAY'
            WHEN PSA = 'DEFENCE' THEN 'DEFENCE'
            WHEN PSA LIKE '%AUTONOMOUS%' THEN 'AUTONOMOUS'
            ELSE 'CPAO'
          END as Department,
          YEAR_OF_BIRTH as YOB,
          BRANCH_PINCODE,
          CASE 
            WHEN VERIFICATION_TYPE = 'DLC' THEN 'DLC'
            WHEN VERIFICATION_TYPE = 'PLC' THEN 'PLC'
            WHEN VERIFICATION_TYPE = 'VLC' THEN 'VLC'
            WHEN VERIFICATION_TYPE = 'face' THEN 'DLC'
            WHEN VERIFICATION_TYPE = 'biometric' THEN 'DLC'
            WHEN VERIFICATION_TYPE = 'iris' THEN 'DLC'
            ELSE 'PLC'
          END as Verification_type
        FROM TBL_DOPPW_DLCDATA_MST 
        WHERE PENSIONER_STATE_NAME = ? 
          AND DATA_DATE = ?
          AND BATCH_ID = ?
        ORDER BY PENSIONER_PINCODE
      `;
      
      database.getDB().all(query, [state, date, batchId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Populate DLC data from existing pensioner data
   * This method should be called by a scheduled job
   * @param {string} dataDate - Date for which to populate data (YYYY-MM-DD format)
   * @returns {Promise<Object>} Population result
   */
  static async populateDLCData(dataDate) {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      db.serialize(() => {
        // Clear the master table first (skip archive for now since it's empty)
        db.run(`DELETE FROM TBL_DOPPW_DLCDATA_MST`, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Populate new data from pensioner_bank_master
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
            
            db.run(insertQuery, [dataDate], (err) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Generate batch IDs
              db.run(`
                UPDATE TBL_DOPPW_DLCDATA_MST 
                SET BATCH_ID = (
                  SELECT 
                    CASE 
                      WHEN COUNT(*) <= 10000 THEN 1
                      ELSE CAST((ROW_NUMBER() OVER (PARTITION BY PENSIONER_STATE_NAME ORDER BY PPO_UNIQUE_ID) - 1) / 10000 + 1 AS INTEGER)
                    END
                  FROM TBL_DOPPW_DLCDATA_MST t2 
                  WHERE t2.PENSIONER_STATE_NAME = TBL_DOPPW_DLCDATA_MST.PENSIONER_STATE_NAME
                    AND t2.DATA_DATE = TBL_DOPPW_DLCDATA_MST.DATA_DATE
                )
                WHERE DATA_DATE = ?
              `, [dataDate], (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // Get count of inserted records
                db.get(`
                  SELECT COUNT(*) as total_records 
                  FROM TBL_DOPPW_DLCDATA_MST 
                  WHERE DATA_DATE = ?
                `, [dataDate], (err, row) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({
                      success: true,
                      total_records: row.total_records,
                      data_date: dataDate
                    });
                  }
                });
              });
            });
          });
        });
      });
  }

  /**
   * Insert sample data for testing
   * @returns {Promise<Object>} Insert result
   */
  static async insertSampleData() {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      db.serialize(() => {
        // Populate address data from existing pensioner data
        db.run(`
          INSERT OR REPLACE INTO TBL_DOPPW_ADDRESS_MST 
          (PINCODE, DISTRICT_CODE, DISTRICT_NAME, STATE_CODE, STATE_NAME, PPO_UNIQUE_ID, ACCOUNT_NUMBER, CIF_NO)
          SELECT DISTINCT 
            pensioner_postcode as PINCODE,
            'NON PERSONAL' as DISTRICT_CODE,
            'NON PERSONAL' as DISTRICT_NAME,
            'NON PERSONAL' as STATE_CODE,
            state as STATE_NAME,
            ppo_number as PPO_UNIQUE_ID,
            ppo_number as ACCOUNT_NUMBER,
            ppo_number as CIF_NO
          FROM pensioner_bank_master 
          WHERE pensioner_postcode NOT IN ('111111', '999999', '000000', '123456')
            AND pensioner_postcode IS NOT NULL 
            AND pensioner_postcode != ''
            AND state IS NOT NULL 
            AND state != ''
            AND ppo_number IS NOT NULL 
            AND ppo_number != ''
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Populate branch data from existing pensioner data
          db.run(`
            INSERT OR REPLACE INTO TBL_DOPPW_BRANCH_MST 
            (BRANCH_CODE, BRANCH_NAME, BRANCH_PINCODE, STATE_CODE, STATE_NAME, DISTRICT_CODE, DISTRICT_NAME)
            SELECT DISTINCT 
              branch_name as BRANCH_CODE,
              branch_name as BRANCH_NAME,
              branch_postcode as BRANCH_PINCODE,
              'NON PERSONAL' as STATE_CODE,
              state as STATE_NAME,
              'NON PERSONAL' as DISTRICT_CODE,
              'NON PERSONAL' as DISTRICT_NAME
            FROM pensioner_bank_master 
            WHERE branch_name IS NOT NULL 
              AND branch_name != ''
              AND branch_postcode NOT IN ('111111', '999999', '000000', '123456')
              AND branch_postcode IS NOT NULL 
              AND branch_postcode != ''
              AND state IS NOT NULL 
              AND state != ''
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Get counts
            db.get(`SELECT COUNT(*) as address_count FROM TBL_DOPPW_ADDRESS_MST`, (err, addressRow) => {
              if (err) {
                reject(err);
                return;
              }
              
              db.get(`SELECT COUNT(*) as branch_count FROM TBL_DOPPW_BRANCH_MST`, (err, branchRow) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                resolve({
                  success: true,
                  message: 'Real data populated successfully from existing pensioner database',
                  address_records: addressRow.address_count,
                  branch_records: branchRow.branch_count
                });
              });
            });
          });
        });
      });
    });
  }

  /**
   * Get available states from DLC data
   * @returns {Promise<Array>} List of states
   */
  static async getAvailableStates() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT DISTINCT PENSIONER_STATE_NAME as state
        FROM TBL_DOPPW_DLCDATA_MST 
        WHERE PENSIONER_STATE_NAME IS NOT NULL 
          AND PENSIONER_STATE_NAME != ''
        ORDER BY PENSIONER_STATE_NAME
      `;
      
      database.getDB().all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get available dates from DLC data
   * @returns {Promise<Array>} List of dates
   */
  static async getAvailableDates() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT DISTINCT DATA_DATE as date
        FROM TBL_DOPPW_DLCDATA_MST 
        WHERE DATA_DATE IS NOT NULL 
          AND DATA_DATE != ''
        ORDER BY DATA_DATE DESC
      `;
      
      database.getDB().all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }
}

module.exports = SBIDOPPWModel;
