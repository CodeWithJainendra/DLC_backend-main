const { database } = require('../config/database');

class SBIDataModel {
  /**
   * Save SBI Batch ID data to database
   */
  static async saveBatchIdData(batchData) {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      const insertQuery = `
        INSERT OR REPLACE INTO sbi_batch_data (
          state, request_date, max_batch_id, response_code, response_message,
          request_reference, response_date, raw_response, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `;
      
      const values = [
        batchData.state,
        batchData.requestDate,
        batchData.maxBatchId,
        batchData.responseCode,
        batchData.responseMessage,
        batchData.requestReference,
        batchData.responseDate,
        JSON.stringify(batchData.rawResponse)
      ];
      
      db.run(insertQuery, values, function(err) {
        if (err) {
          console.error('❌ Error saving batch data:', err.message);
          reject(err);
        } else {
          console.log(`✅ Batch data saved with ID: ${this.lastID}`);
          resolve({ id: this.lastID, ...batchData });
        }
      });
    });
  }

  /**
   * Save SBI Verification Records to database
   */
  static async saveVerificationRecords(recordsData) {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      if (!recordsData.verificationRecords || recordsData.verificationRecords.length === 0) {
        resolve({ saved: 0, message: 'No records to save' });
        return;
      }
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const insertQuery = `
          INSERT OR REPLACE INTO sbi_verification_records (
            state, request_date, batch_id, pensioner_pincode, type_of_pensioner,
            department, year_of_birth, branch_pin, verification_type,
            request_reference, response_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `;
        
        let savedCount = 0;
        let errors = [];
        
        recordsData.verificationRecords.forEach((record, index) => {
          const values = [
            recordsData.state,
            recordsData.requestDate,
            recordsData.batchId,
            record.Pensioner_Pincode,
            record.Type_of_Pensioner,
            record.Department,
            record.YOB,
            record.BRANCH_PIN,
            record.Verification_type,
            recordsData.requestReference,
            recordsData.responseDate
          ];
          
          db.run(insertQuery, values, function(err) {
            if (err) {
              errors.push(`Record ${index + 1}: ${err.message}`);
            } else {
              savedCount++;
            }
            
            // Check if this is the last record
            if (index === recordsData.verificationRecords.length - 1) {
              if (errors.length > 0) {
                console.warn('⚠️ Some records had errors:', errors);
                db.run('ROLLBACK');
                reject(new Error(`Failed to save ${errors.length} records`));
              } else {
                db.run('COMMIT');
                console.log(`✅ Saved ${savedCount} verification records`);
                resolve({ 
                  saved: savedCount, 
                  state: recordsData.state,
                  batchId: recordsData.batchId,
                  requestDate: recordsData.requestDate
                });
              }
            }
          });
        });
      });
    });
  }

  /**
   * Get saved batch data from database
   */
  static async getBatchData(state, requestDate) {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      const query = `
        SELECT * FROM sbi_batch_data 
        WHERE state = ? AND request_date = ? 
        ORDER BY created_at DESC LIMIT 1
      `;
      
      db.get(query, [state, requestDate], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get saved verification records from database
   */
  static async getVerificationRecords(state, requestDate, batchId = null) {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      let query = `
        SELECT * FROM sbi_verification_records 
        WHERE state = ? AND request_date = ?
      `;
      let params = [state, requestDate];
      
      if (batchId) {
        query += ' AND batch_id = ?';
        params.push(batchId);
      }
      
      query += ' ORDER BY created_at DESC';
      
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get statistics from saved data
   */
  static async getDataStatistics() {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      const queries = {
        totalBatches: 'SELECT COUNT(*) as count FROM sbi_batch_data',
        totalRecords: 'SELECT COUNT(*) as count FROM sbi_verification_records',
        stateWiseRecords: `
          SELECT state, COUNT(*) as count 
          FROM sbi_verification_records 
          GROUP BY state 
          ORDER BY count DESC
        `,
        recentBatches: `
          SELECT state, request_date, max_batch_id, created_at 
          FROM sbi_batch_data 
          ORDER BY created_at DESC 
          LIMIT 10
        `
      };
      
      const results = {};
      let completed = 0;
      const totalQueries = Object.keys(queries).length;
      
      Object.entries(queries).forEach(([key, query]) => {
        if (key === 'totalBatches' || key === 'totalRecords') {
          db.get(query, (err, row) => {
            if (err) {
              results[key] = { error: err.message };
            } else {
              results[key] = row.count;
            }
            completed++;
            if (completed === totalQueries) resolve(results);
          });
        } else {
          db.all(query, (err, rows) => {
            if (err) {
              results[key] = { error: err.message };
            } else {
              results[key] = rows;
            }
            completed++;
            if (completed === totalQueries) resolve(results);
          });
        }
      });
    });
  }

  /**
   * Clean old data (older than specified days)
   */
  static async cleanOldData(daysOld = 30) {
    return new Promise((resolve, reject) => {
      const db = database.getDB();
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        const cutoffString = cutoffDate.toISOString().split('T')[0];
        
        const queries = [
          `DELETE FROM sbi_batch_data WHERE created_at < ?`,
          `DELETE FROM sbi_verification_records WHERE created_at < ?`
        ];
        
        let completed = 0;
        let totalDeleted = 0;
        
        queries.forEach(query => {
          db.run(query, [cutoffString], function(err) {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            totalDeleted += this.changes;
            completed++;
            
            if (completed === queries.length) {
              db.run('COMMIT');
              console.log(`✅ Cleaned ${totalDeleted} old records (older than ${daysOld} days)`);
              resolve({ deleted: totalDeleted, cutoffDate: cutoffString });
            }
          });
        });
      });
    });
  }
}

module.exports = SBIDataModel;
