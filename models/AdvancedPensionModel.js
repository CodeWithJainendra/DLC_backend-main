const { database } = require('../config/database');

class AdvancedPensionModel {
  
  // Get branch-wise distribution
  static async getBranchDistribution(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          bank_name,
          branch_name,
          branch_postcode,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT state) as states_served,
          COUNT(DISTINCT PSA) as categories_served
        FROM pensioner_bank_master 
        WHERE branch_name IS NOT NULL AND branch_name != ''
        AND pensioner_postcode NOT IN ('111111', '999999')
      `;
      
      const params = [];
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      query += `
        GROUP BY bank_name, branch_name, branch_postcode
        ORDER BY total_pensioners DESC
      `;
      
      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get PDA-wise statistics
  static async getPDAStatistics(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          PDA,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT bank_name) as banks_count,
          COUNT(DISTINCT state) as states_count,
          COUNT(DISTINCT PSA) as categories_count
        FROM pensioner_bank_master 
        WHERE PDA IS NOT NULL AND PDA != ''
        AND pensioner_postcode NOT IN ('111111', '999999')
      `;
      
      const params = [];
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      query += `
        GROUP BY PDA
        ORDER BY total_pensioners DESC
      `;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get duplicate PPO numbers (data quality check)
  static async getDuplicatePPOs() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          ppo_number,
          COUNT(*) as duplicate_count,
          GROUP_CONCAT(bank_name) as banks,
          GROUP_CONCAT(state) as states
        FROM pensioner_bank_master 
        WHERE ppo_number IS NOT NULL AND ppo_number != ''
        AND pensioner_postcode NOT IN ('111111', '999999')
        GROUP BY ppo_number 
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC
      `;
      
      database.getDB().all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get postcode-wise coverage analysis
  static async getPostcodeCoverage(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          pensioner_postcode,
          state,
          pensioner_city,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT bank_name) as banks_available,
          COUNT(DISTINCT PSA) as categories_available,
          GROUP_CONCAT(DISTINCT bank_name) as bank_list
        FROM pensioner_bank_master 
        WHERE pensioner_postcode IS NOT NULL AND pensioner_postcode != ''
        AND pensioner_postcode NOT IN ('111111', '999999')
      `;
      
      const params = [];
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.minPensioners) {
        query += ` AND 1=1`; // Will add HAVING clause below
      }
      
      query += `
        GROUP BY pensioner_postcode, state, pensioner_city
      `;
      
      if (filters.minPensioners) {
        query += ` HAVING total_pensioners >= ?`;
        params.push(filters.minPensioners);
      }
      
      query += ` ORDER BY total_pensioners DESC`;
      
      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get cross-tabulation analysis
  static async getCrossTabulation(dimension1, dimension2, filters = {}) {
    return new Promise((resolve, reject) => {
      if (!['state', 'bank_name', 'PSA', 'pensioner_city'].includes(dimension1) ||
          !['state', 'bank_name', 'PSA', 'pensioner_city'].includes(dimension2)) {
        reject(new Error('Invalid dimensions for cross-tabulation'));
        return;
      }
      
      let query = `
        SELECT 
          ${dimension1} as dim1,
          ${dimension2} as dim2,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE ${dimension1} IS NOT NULL AND ${dimension1} != ''
          AND ${dimension2} IS NOT NULL AND ${dimension2} != ''
      `;
      
      const params = [];
      
      if (filters.state && dimension1 !== 'state' && dimension2 !== 'state') {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      query += `
        GROUP BY ${dimension1}, ${dimension2}
        ORDER BY count DESC
      `;
      
      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Advanced Age Analytics
  static async getAgeCrossTabulation(dimension, filters = {}) {
    return new Promise((resolve, reject) => {
      if (!['state', 'bank_name', 'PSA'].includes(dimension)) {
        reject(new Error('Invalid dimension for age cross-tabulation'));
        return;
      }
      
      let query = `
        SELECT 
          ${dimension} as dimension_value,
          CASE 
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60 THEN 'Below 60'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70 THEN '60-70'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80 THEN '70-80'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 > 80 THEN 'Above 80'
            ELSE 'Unknown'
          END as age_category,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE ${dimension} IS NOT NULL AND ${dimension} != ''
          AND pensioner_dob IS NOT NULL 
          AND pensioner_dob != ''
          AND pensioner_dob NOT LIKE '%CIVIL%'
          AND pensioner_dob NOT LIKE '%RAILWAY%'
          AND pensioner_dob NOT LIKE '%DEFENCE%'
      `;
      
      const params = [];
      
      if (filters.state && dimension !== 'state') {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.bankName && dimension !== 'bank_name') {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      query += `
        GROUP BY ${dimension}, age_category
        ORDER BY ${dimension}, count DESC
      `;
      
      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getAgeTrendAnalysis(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          CASE 
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60 THEN 'Below 60'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70 THEN '60-70'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80 THEN '70-80'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 > 80 THEN 'Above 80'
            ELSE 'Unknown'
          END as age_category,
          state,
          bank_name,
          PSA,
          COUNT(*) as count,
          AVG((julianday('now') - julianday(pensioner_dob)) / 365.25) as average_age
        FROM pensioner_bank_master 
        WHERE pensioner_dob IS NOT NULL 
          AND pensioner_dob != ''
          AND pensioner_dob NOT LIKE '%CIVIL%'
          AND pensioner_dob NOT LIKE '%RAILWAY%'
          AND pensioner_dob NOT LIKE '%DEFENCE%'
      `;
      
      const params = [];
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      query += `
        GROUP BY age_category, state, bank_name, PSA
        ORDER BY count DESC
      `;
      
      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = AdvancedPensionModel;