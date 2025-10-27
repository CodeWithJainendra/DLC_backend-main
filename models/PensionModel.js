const { database } = require('../config/database');
const DataValidator = require('../utils/dataValidator');

class PensionModel {
  static async getBanksList() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          bank_name,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT state) as states_served,
          COUNT(DISTINCT pensioner_postcode) as pincodes_served
        FROM pensioner_bank_master 
        WHERE 1=1
        ${DataValidator.getDataFilteringClause()}
        GROUP BY bank_name 
        ORDER BY total_pensioners DESC
      `;
      
      database.getDB().all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getPensionersByBank(bankName, page = 1, perPage = 100) {
    return new Promise((resolve, reject) => {
      const offset = (page - 1) * perPage;
      
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM pensioner_bank_master 
        WHERE bank_name = ?
        ${DataValidator.getDataFilteringClause()}
      `;
      
      const dataQuery = `
        SELECT 
          ppo_number,
          bank_name,
          branch_name,
          branch_postcode,
          pensioner_city,
          state,
          pensioner_postcode,
          PDA,
          PSA
        FROM pensioner_bank_master 
        WHERE bank_name = ?
        ${DataValidator.getDataFilteringClause()}
        ORDER BY ppo_number
        LIMIT ? OFFSET ?
      `;
      
      database.getDB().get(countQuery, [bankName], (err, countRow) => {
        if (err) {
          reject(err);
          return;
        }
        
        database.getDB().all(dataQuery, [bankName, perPage, offset], (err, rows) => {
          if (err) reject(err);
          else resolve({
            total: countRow.total,
            data: rows
          });
        });
      });
    });
  }

  static async getBankStateSummary(bankName = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          state,
          bank_name,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count,
          COUNT(DISTINCT pensioner_city) as cities_count
        FROM pensioner_bank_master 
        WHERE 1=1
        ${DataValidator.getDataFilteringClause()}
      `;
      
      const params = [];
      if (bankName) {
        query += ` AND bank_name = ?`;
        params.push(bankName);
      }
      
      query += `
        GROUP BY state, bank_name 
        ORDER BY state, total_pensioners DESC
      `;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getCategoriesList() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          PSA as category_code,
          PSA as category_name,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT pensioner_postcode) as pensioner_postcodes_count,
          COUNT(DISTINCT branch_postcode) as bank_postcodes_count,
          COUNT(DISTINCT state) as states_count,
          COUNT(DISTINCT bank_name) as banks_count
        FROM pensioner_bank_master 
        WHERE PSA IS NOT NULL AND PSA != ''
        AND pensioner_postcode NOT IN ('111111', '999999')
        GROUP BY PSA 
        ORDER BY total_pensioners DESC
      `;
      
      database.getDB().all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getPensionersByCategory(category, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          ppo_number,
          bank_name,
          branch_name,
          branch_postcode,
          pensioner_city,
          state,
          pensioner_postcode,
          PDA,
          PSA
        FROM pensioner_bank_master 
        WHERE PSA = ?
      `;
      
      const params = [category];
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.postcode) {
        query += ` AND pensioner_postcode = ?`;
        params.push(filters.postcode);
      }
      
      const { page = 1, perPage = 100 } = filters;
      const offset = (page - 1) * perPage;
      
      query += ` ORDER BY ppo_number LIMIT ? OFFSET ?`;
      params.push(perPage, offset);
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getStatesList(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          state,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT bank_name) as banks_count,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count,
          COUNT(DISTINCT pensioner_city) as cities_count
        FROM pensioner_bank_master 
        WHERE state IS NOT NULL AND state != ''
        AND pensioner_postcode NOT IN ('111111', '999999')
      `;
      
      const params = [];
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      query += `
        GROUP BY state 
        ORDER BY total_pensioners DESC
      `;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getCitiesByState(state, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          pensioner_city,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT bank_name) as banks_count,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count
        FROM pensioner_bank_master 
        WHERE state = ? AND pensioner_city IS NOT NULL AND pensioner_city != ''
      `;
      
      const params = [state];
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      query += `
        GROUP BY pensioner_city 
        ORDER BY total_pensioners DESC
      `;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getPensionersByPostcode(postcode, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          ppo_number,
          bank_name,
          branch_name,
          branch_postcode,
          pensioner_city,
          state,
          pensioner_postcode,
          PDA,
          PSA
        FROM pensioner_bank_master 
        WHERE pensioner_postcode = ?
        AND pensioner_postcode NOT IN ('111111', '999999')
      `;
      
      const params = [postcode];
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      const { page = 1, perPage = 100 } = filters;
      const offset = (page - 1) * perPage;
      
      query += ` ORDER BY ppo_number LIMIT ? OFFSET ?`;
      params.push(perPage, offset);
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async searchPensioners(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          ppo_number,
          bank_name,
          branch_name,
          branch_postcode,
          pensioner_city,
          state,
          pensioner_postcode,
          PDA,
          PSA
        FROM pensioner_bank_master 
        WHERE 1=1
      `;
      
      const params = [];
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.city) {
        query += ` AND pensioner_city = ?`;
        params.push(filters.city);
      }
      
      if (filters.postcode) {
        query += ` AND pensioner_postcode = ?`;
        params.push(filters.postcode);
      }
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      if (filters.ppoNumber) {
        query += ` AND ppo_number LIKE ?`;
        params.push(`%${filters.ppoNumber}%`);
      }
      
      const { page = 1, perPage = 100 } = filters;
      const offset = (page - 1) * perPage;
      
      query += ` ORDER BY ppo_number LIMIT ? OFFSET ?`;
      params.push(perPage, offset);
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getAnalyticsSummary(filters = {}) {
    return new Promise((resolve, reject) => {
      // Optimized query with better performance
      let query = `
        SELECT 
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT bank_name) as total_banks,
          COUNT(DISTINCT state) as total_states,
          COUNT(DISTINCT pensioner_city) as total_cities,
          COUNT(DISTINCT pensioner_postcode) as total_pincodes,
          COUNT(DISTINCT PSA) as total_categories
        FROM pensioner_bank_master 
      `;
      
      const params = [];
      const conditions = [];
      
      // Always filter out dummy pincodes
      conditions.push(`pensioner_postcode NOT IN ('111111', '999999')`);
      
      if (filters.state) {
        conditions.push(`state = ?`);
        params.push(filters.state);
      }
      
      if (filters.bankName) {
        conditions.push(`bank_name = ?`);
        params.push(filters.bankName);
      }
      
      if (filters.category) {
        conditions.push(`PSA = ?`);
        params.push(filters.category);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      // Use prepared statement for better performance
      const stmt = database.getDB().prepare(query);
      stmt.get(params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
      stmt.finalize();
    });
  }

  // Age-based filtering methods
  static async getAgeCategories(filters = {}) {
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
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT state) as states_count,
          COUNT(DISTINCT bank_name) as banks_count
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
      
      query += ` GROUP BY age_category ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getAgeDistributionByState(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          state,
          CASE 
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60 THEN 'Below 60'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70 THEN '60-70'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80 THEN '70-80'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 > 80 THEN 'Above 80'
            ELSE 'Unknown'
          END as age_category,
          COUNT(*) as total_pensioners
        FROM pensioner_bank_master 
        WHERE state IS NOT NULL 
          AND state != ''
          AND pensioner_dob IS NOT NULL 
          AND pensioner_dob != ''
          AND pensioner_dob NOT LIKE '%CIVIL%'
          AND pensioner_dob NOT LIKE '%RAILWAY%'
          AND pensioner_dob NOT LIKE '%DEFENCE%'
      `;
      
      const params = [];
      
      if (filters.bankName) {
        query += ` AND bank_name = ?`;
        params.push(filters.bankName);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      query += ` GROUP BY state, age_category ORDER BY state, total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getPensionersByAgeCategory(ageCategory, filters = {}) {
    return new Promise((resolve, reject) => {
      let ageCondition = '';
      
      switch(ageCategory) {
        case 'below-60':
          ageCondition = `(julianday('now') - julianday(pensioner_dob)) / 365.25 < 60`;
          break;
        case '60-70':
          ageCondition = `(julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70`;
          break;
        case '70-80':
          ageCondition = `(julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80`;
          break;
        case 'above-80':
          ageCondition = `(julianday('now') - julianday(pensioner_dob)) / 365.25 > 80`;
          break;
        default:
          ageCondition = `1=1`;
      }
      
      let query = `
        SELECT 
          ppo_number,
          bank_name,
          branch_name,
          pensioner_city,
          state,
          pensioner_postcode,
          PSA,
          PDA,
          pensioner_dob,
          ROUND((julianday('now') - julianday(pensioner_dob)) / 365.25, 1) as age
        FROM pensioner_bank_master 
        WHERE ${ageCondition}
          AND pensioner_dob IS NOT NULL 
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
      
      const { page = 1, perPage = 100 } = filters;
      const offset = (page - 1) * perPage;
      
      query += ` ORDER BY age DESC LIMIT ? OFFSET ?`;
      params.push(perPage, offset);
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getAgeAnalytics(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          COUNT(*) as total_pensioners,
          AVG((julianday('now') - julianday(pensioner_dob)) / 365.25) as average_age,
          MIN((julianday('now') - julianday(pensioner_dob)) / 365.25) as min_age,
          MAX((julianday('now') - julianday(pensioner_dob)) / 365.25) as max_age,
          COUNT(CASE WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60 THEN 1 END) as below_60,
          COUNT(CASE WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70 THEN 1 END) as age_60_70,
          COUNT(CASE WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80 THEN 1 END) as age_70_80,
          COUNT(CASE WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 > 80 THEN 1 END) as above_80
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
      
      database.getDB().get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Enhanced Bank-wise filtering methods
  static async getBankStateDistribution(bankName, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          state,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT pensioner_city) as cities_count,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count,
          COUNT(DISTINCT PSA) as categories_count,
          COUNT(DISTINCT branch_name) as branches_count
        FROM pensioner_bank_master 
        WHERE bank_name = ?
      `;
      
      const params = [bankName];
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      query += ` GROUP BY state ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getBankCityDistribution(bankName, state, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          pensioner_city,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count,
          COUNT(DISTINCT PSA) as categories_count,
          COUNT(DISTINCT branch_name) as branches_count
        FROM pensioner_bank_master 
        WHERE bank_name = ? AND state = ?
      `;
      
      const params = [bankName, state];
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      query += ` GROUP BY pensioner_city ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getBankBranchDistribution(bankName, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          branch_name,
          branch_postcode,
          state,
          pensioner_city,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT PSA) as categories_count,
          COUNT(DISTINCT pensioner_postcode) as pincodes_served
        FROM pensioner_bank_master 
        WHERE bank_name = ?
      `;
      
      const params = [bankName];
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      query += ` GROUP BY branch_name, branch_postcode, state, pensioner_city ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getBankCategoryDistribution(bankName, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          PSA,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT state) as states_count,
          COUNT(DISTINCT pensioner_city) as cities_count,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count
        FROM pensioner_bank_master 
        WHERE bank_name = ? AND PSA IS NOT NULL AND PSA != ''
      `;
      
      const params = [bankName];
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      query += ` GROUP BY PSA ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getBankAnalytics(bankName, filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT state) as states_served,
          COUNT(DISTINCT pensioner_city) as cities_served,
          COUNT(DISTINCT pensioner_postcode) as pincodes_served,
          COUNT(DISTINCT PSA) as categories_served,
          COUNT(DISTINCT branch_name) as branches_count,
          AVG((julianday('now') - julianday(pensioner_dob)) / 365.25) as average_age
        FROM pensioner_bank_master 
        WHERE bank_name = ?
      `;
      
      const params = [bankName];
      
      if (filters.state) {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      if (filters.category) {
        query += ` AND PSA = ?`;
        params.push(filters.category);
      }
      
      database.getDB().get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Comprehensive Multi-dimensional Filtering Methods
  static async getComprehensiveStateFiltering(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          state,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT pensioner_city) as cities_count,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count,
          COUNT(DISTINCT bank_name) as banks_count,
          COUNT(DISTINCT PSA) as categories_count,
          COUNT(DISTINCT branch_name) as branches_count
        FROM pensioner_bank_master 
        WHERE pensioner_postcode NOT IN ('111111', '999999')
      `;
      
      const params = [];
      
      // Status filtering (assuming we have a status field or can derive it)
      if (filters.status && filters.status !== 'All') {
        if (filters.status === 'Completed') {
          // Add logic for completed status (you may need to adjust based on your data structure)
          query += ` AND PSA IS NOT NULL AND PSA != ''`;
        } else if (filters.status === 'Pending') {
          // Add logic for pending status
          query += ` AND (PSA IS NULL OR PSA = '')`;
        }
      }
      
      // Bank filtering
      if (filters.bank && filters.bank !== 'All') {
        query += ` AND bank_name = ?`;
        params.push(filters.bank);
      }
      
      // Age filtering
      if (filters.age && filters.age !== 'All') {
        if (filters.age === '<60') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60`;
        } else if (filters.age === '60-70') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70`;
        } else if (filters.age === '70-80') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80`;
        } else if (filters.age === '80-90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 80 AND 90`;
        } else if (filters.age === '>90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 > 90`;
        }
        // Add condition to filter out non-date values
        query += ` AND pensioner_dob IS NOT NULL AND pensioner_dob != '' AND pensioner_dob NOT LIKE '%CIVIL%' AND pensioner_dob NOT LIKE '%RAILWAY%' AND pensioner_dob NOT LIKE '%DEFENCE%'`;
      }
      
      // PSA Category filtering
      if (filters.psa && filters.psa !== 'All') {
        query += ` AND PSA = ?`;
        params.push(filters.psa);
      }
      
      query += ` GROUP BY state ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getComprehensiveCityFiltering(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          state,
          pensioner_city,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count,
          COUNT(DISTINCT bank_name) as banks_count,
          COUNT(DISTINCT PSA) as categories_count,
          COUNT(DISTINCT branch_name) as branches_count
        FROM pensioner_bank_master 
        WHERE 1=1
      `;
      
      const params = [];
      
      // Status filtering
      if (filters.status && filters.status !== 'All') {
        if (filters.status === 'Completed') {
          query += ` AND PSA IS NOT NULL AND PSA != ''`;
        } else if (filters.status === 'Pending') {
          query += ` AND (PSA IS NULL OR PSA = '')`;
        }
      }
      
      // Bank filtering
      if (filters.bank && filters.bank !== 'All') {
        query += ` AND bank_name = ?`;
        params.push(filters.bank);
      }
      
      // Age filtering
      if (filters.age && filters.age !== 'All') {
        if (filters.age === '<60') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60`;
        } else if (filters.age === '60-70') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70`;
        } else if (filters.age === '70-80') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80`;
        } else if (filters.age === '80-90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 80 AND 90`;
        } else if (filters.age === '>90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 > 90`;
        }
        query += ` AND pensioner_dob IS NOT NULL AND pensioner_dob != '' AND pensioner_dob NOT LIKE '%CIVIL%' AND pensioner_dob NOT LIKE '%RAILWAY%' AND pensioner_dob NOT LIKE '%DEFENCE%'`;
      }
      
      // PSA Category filtering
      if (filters.psa && filters.psa !== 'All') {
        query += ` AND PSA = ?`;
        params.push(filters.psa);
      }
      
      // State filtering (if specific state is selected)
      if (filters.state && filters.state !== 'All') {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      query += ` GROUP BY state, pensioner_city ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getComprehensivePincodeFiltering(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          state,
          pensioner_city,
          pensioner_postcode,
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT bank_name) as banks_count,
          COUNT(DISTINCT PSA) as categories_count,
          COUNT(DISTINCT branch_name) as branches_count
        FROM pensioner_bank_master 
        WHERE 1=1
      `;
      
      const params = [];
      
      // Status filtering
      if (filters.status && filters.status !== 'All') {
        if (filters.status === 'Completed') {
          query += ` AND PSA IS NOT NULL AND PSA != ''`;
        } else if (filters.status === 'Pending') {
          query += ` AND (PSA IS NULL OR PSA = '')`;
        }
      }
      
      // Bank filtering
      if (filters.bank && filters.bank !== 'All') {
        query += ` AND bank_name = ?`;
        params.push(filters.bank);
      }
      
      // Age filtering
      if (filters.age && filters.age !== 'All') {
        if (filters.age === '<60') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60`;
        } else if (filters.age === '60-70') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70`;
        } else if (filters.age === '70-80') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80`;
        } else if (filters.age === '80-90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 80 AND 90`;
        } else if (filters.age === '>90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 > 90`;
        }
        query += ` AND pensioner_dob IS NOT NULL AND pensioner_dob != '' AND pensioner_dob NOT LIKE '%CIVIL%' AND pensioner_dob NOT LIKE '%RAILWAY%' AND pensioner_dob NOT LIKE '%DEFENCE%'`;
      }
      
      // PSA Category filtering
      if (filters.psa && filters.psa !== 'All') {
        query += ` AND PSA = ?`;
        params.push(filters.psa);
      }
      
      // State filtering
      if (filters.state && filters.state !== 'All') {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      // City filtering
      if (filters.city && filters.city !== 'All') {
        query += ` AND pensioner_city = ?`;
        params.push(filters.city);
      }
      
      query += ` GROUP BY state, pensioner_city, pensioner_postcode ORDER BY total_pensioners DESC`;
      
      database.getDB().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  static async getComprehensiveAnalytics(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          COUNT(*) as total_pensioners,
          COUNT(DISTINCT state) as states_count,
          COUNT(DISTINCT pensioner_city) as cities_count,
          COUNT(DISTINCT pensioner_postcode) as pincodes_count,
          COUNT(DISTINCT bank_name) as banks_count,
          COUNT(DISTINCT PSA) as categories_count,
          COUNT(DISTINCT branch_name) as branches_count,
          AVG((julianday('now') - julianday(pensioner_dob)) / 365.25) as average_age
        FROM pensioner_bank_master 
        WHERE 1=1
      `;
      
      const params = [];
      
      // Status filtering
      if (filters.status && filters.status !== 'All') {
        if (filters.status === 'Completed') {
          query += ` AND PSA IS NOT NULL AND PSA != ''`;
        } else if (filters.status === 'Pending') {
          query += ` AND (PSA IS NULL OR PSA = '')`;
        }
      }
      
      // Bank filtering
      if (filters.bank && filters.bank !== 'All') {
        query += ` AND bank_name = ?`;
        params.push(filters.bank);
      }
      
      // Age filtering
      if (filters.age && filters.age !== 'All') {
        if (filters.age === '<60') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60`;
        } else if (filters.age === '60-70') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70`;
        } else if (filters.age === '70-80') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80`;
        } else if (filters.age === '80-90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 80 AND 90`;
        } else if (filters.age === '>90') {
          query += ` AND (julianday('now') - julianday(pensioner_dob)) / 365.25 > 90`;
        }
        query += ` AND pensioner_dob IS NOT NULL AND pensioner_dob != '' AND pensioner_dob NOT LIKE '%CIVIL%' AND pensioner_dob NOT LIKE '%RAILWAY%' AND pensioner_dob NOT LIKE '%DEFENCE%'`;
      }
      
      // PSA Category filtering
      if (filters.psa && filters.psa !== 'All') {
        query += ` AND PSA = ?`;
        params.push(filters.psa);
      }
      
      // State filtering
      if (filters.state && filters.state !== 'All') {
        query += ` AND state = ?`;
        params.push(filters.state);
      }
      
      // City filtering
      if (filters.city && filters.city !== 'All') {
        query += ` AND pensioner_city = ?`;
        params.push(filters.city);
      }
      
      database.getDB().get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

module.exports = PensionModel;