const { database } = require('../config/database');
const DataValidator = require('../utils/dataValidator');

class DashboardController {
  /**
   * Get comprehensive dashboard overview with all requested data
   */
  static async getDashboardOverview(req, res) {
    try {
      const db = database.getDB();
      
      // Get overall statistics
      const overallStats = await DashboardController.getOverallStatistics(db);
      
      // Get age distribution by state
      const ageDistribution = await DashboardController.getAgeDistributionByState(db);
      
      // Get state-wise data
      const stateWiseData = await DashboardController.getStateWiseData(db);
      
      // Get verification method distribution
      const verificationMethods = await DashboardController.getVerificationMethodDistribution(db);
      
      // Get biometric data distribution
      const biometricData = await DashboardController.getBiometricDataDistribution(db);
      
      // Get top states by total pensioners
      const topStates = await DashboardController.getTopStatesByPensioners(db);
      
      // Get success rate by state
      const successRates = await DashboardController.getSuccessRatesByState(db);
      
      res.json({
        success: true,
        data: {
          overall: overallStats,
          ageDistributionByState: ageDistribution,
          stateWiseData: stateWiseData,
          verificationMethods: verificationMethods,
          biometricData: biometricData,
          topStates: topStates,
          successRatesByState: successRates
        }
      });
    } catch (error) {
      console.error('Dashboard overview error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard data',
        message: error.message
      });
    }
  }

  /**
   * Get detailed data for a specific state
   */
  static async getStateDashboardData(req, res) {
    try {
      const { stateCode } = req.params;
      const db = database.getDB();
      
      // Get state-specific statistics
      const stateStats = await DashboardController.getStateStatistics(db, stateCode);
      
      // Get age distribution for the state
      const ageDistribution = await DashboardController.getStateAgeDistribution(db, stateCode);
      
      // Get verification method distribution for the state
      const verificationMethods = await DashboardController.getStateVerificationMethods(db, stateCode);
      
      // Get biometric data distribution for the state
      const biometricData = await DashboardController.getStateBiometricData(db, stateCode);
      
      res.json({
        success: true,
        data: {
          state: stateCode,
          statistics: stateStats,
          ageDistribution: ageDistribution,
          verificationMethods: verificationMethods,
          biometricData: biometricData
        }
      });
    } catch (error) {
      console.error('State dashboard data error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch state dashboard data',
        message: error.message
      });
    }
  }

  /**
   * Get overall statistics
   */
  static async getOverallStatistics(db) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_pensioners,
          COUNT(CASE WHEN PSA IS NOT NULL AND PSA != '' THEN 1 END) as verified_pensioners,
          COUNT(CASE WHEN PSA IS NULL OR PSA = '' THEN 1 END) as pending_pensioners,
          COUNT(DISTINCT state) as total_states,
          COUNT(DISTINCT bank_name) as total_banks
        FROM pensioner_bank_master 
        WHERE 1=1
        ${DataValidator.getDataFilteringClause()}
      `;
      
      db.get(query, [], (err, row) => {
        if (err) reject(err);
        else {
          const result = {
            total_pensioners: row.total_pensioners || 0,
            verified_pensioners: row.verified_pensioners || 0,
            pending_pensioners: row.pending_pensioners || 0,
            total_states: row.total_states || 0,
            total_banks: row.total_banks || 0,
            verification_rate: row.total_pensioners ? 
              Math.round((row.verified_pensioners / row.total_pensioners) * 10000) / 100 : 0
          };
          resolve(result);
        }
      });
    });
  }

  /**
   * Get age distribution by state
   */
  static async getAgeDistributionByState(db) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          state,
          CASE 
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60 THEN 'Below 60'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70 THEN '60-70'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80 THEN '70-80'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 > 80 THEN 'Above 80'
            ELSE 'Unknown'
          END as age_group,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE pensioner_dob IS NOT NULL 
          AND pensioner_dob != ''
          AND pensioner_dob NOT LIKE '%CIVIL%'
          AND pensioner_dob NOT LIKE '%RAILWAY%'
          AND pensioner_dob NOT LIKE '%DEFENCE%'
          AND pensioner_dob NOT LIKE '%EPFO%'
          AND pensioner_dob NOT LIKE '%DOP%'
          AND pensioner_dob NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')
          ${DataValidator.getDataFilteringClause()}
        GROUP BY state, age_group
        ORDER BY state, age_group
        LIMIT 1000
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else {
          // Group by state
          const result = {};
          rows.forEach(row => {
            if (!result[row.state]) {
              result[row.state] = {
                'Below 60': 0,
                '60-70': 0,
                '70-80': 0,
                'Above 80': 0,
                'Unknown': 0
              };
            }
            result[row.state][row.age_group] = row.count;
          });
          resolve(result);
        }
      });
    });
  }

  /**
   * Get state-wise data
   */
  static async getStateWiseData(db) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          state,
          COUNT(*) as total_pensioners,
          COUNT(CASE WHEN PSA IS NOT NULL AND PSA != '' THEN 1 END) as verified_pensioners,
          COUNT(CASE WHEN PSA IS NULL OR PSA = '' THEN 1 END) as pending_pensioners,
          COUNT(DISTINCT bank_name) as banks_count
        FROM pensioner_bank_master 
        WHERE 1=1
        ${DataValidator.getDataFilteringClause()}
        GROUP BY state
        ORDER BY total_pensioners DESC
        LIMIT 100
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else {
          // Add success rate to each state
          const result = rows.map(row => ({
            ...row,
            success_rate: row.total_pensioners ? 
              Math.round((row.verified_pensioners / row.total_pensioners) * 10000) / 100 : 0
          }));
          resolve(result);
        }
      });
    });
  }

  /**
   * Get verification method distribution
   */
  static async getVerificationMethodDistribution(db) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          PSA as verification_method,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE PSA IS NOT NULL AND PSA != ''
        ${DataValidator.getDataFilteringClause()}
        GROUP BY PSA
        ORDER BY count DESC
        LIMIT 50
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else {
          // Convert to object with method names as keys
          const result = {};
          rows.forEach(row => {
            result[row.verification_method] = row.count;
          });
          resolve(result);
        }
      });
    });
  }

  /**
   * Get biometric data distribution (IRIS, Fingerprint, FaceAuth)
   */
  static async getBiometricDataDistribution(db) {
    return new Promise((resolve, reject) => {
      // Since we don't have specific biometric fields in the current schema,
      // we'll categorize based on PSA values that might represent different verification methods
      const query = `
        SELECT 
          PSA,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE PSA IS NOT NULL AND PSA != ''
        ${DataValidator.getDataFilteringClause()}
        GROUP BY PSA
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else {
          // Map PSA categories to verification types based on actual data
          const verificationMap = {
            'DEFENCE_LESS_THAN_80': 'Digital',
            'DEFENCE_MORE_THAN_80': 'Digital',
            'DEFENCE_FAMILY_LESS_THAN_80': 'Digital',
            'DEFENCE_FAMILY_MORE_THAN_80': 'Digital',
            'DEFENCE_AGE_NOT_AVAILABLE': 'Digital',
            'DEFENCE_FAMILY_AGE_NOT_AVAILABLE': 'Digital',
            'DEFENCE': 'Digital',
            'Central Government': 'Digital',
            'State Government': 'Physical',
            'RAILWAY': 'Video',
            'RAILWAYS-VIIPC': 'Video',
            'CENTRAL RAILWAY': 'Video',
            'NORTH CENTRAL RAILWAY': 'Video',
            'CENTRAL CIVIL': 'Physical',
            'STATE CIVIL': 'Physical',
            'CIVIL': 'Physical'
          };
          
          const result = {
            'Digital': 0,
            'Physical': 0,
            'Video': 0,
            'Other': 0
          };
          
          rows.forEach(row => {
            // Check if PSA is defined
            if (!row.PSA) {
              result['Other'] += row.count;
              return;
            }
            
            let verificationType = 'Other';
            // Check for exact matches first
            if (verificationMap[row.PSA]) {
              verificationType = verificationMap[row.PSA];
            } else {
              // Check for partial matches
              if (row.PSA.includes('DEFENCE')) {
                verificationType = 'Digital';
              } else if (row.PSA.includes('RAILWAY') || row.PSA.includes('RAIL')) {
                verificationType = 'Video';
              } else if (row.PSA.includes('CIVIL') || row.PSA.includes('GOVERNMENT')) {
                verificationType = 'Physical';
              }
            }
            result[verificationType] += row.count;
          });
          
          resolve(result);
        }
      });
    });
  }

  /**
   * Get top states by total pensioners
   */
  static async getTopStatesByPensioners(db) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          state,
          COUNT(*) as total_pensioners
        FROM pensioner_bank_master 
        WHERE 1=1
        ${DataValidator.getDataFilteringClause()}
        GROUP BY state
        ORDER BY total_pensioners DESC
        LIMIT 10
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Get success rates by state
   */
  static async getSuccessRatesByState(db) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          state,
          COUNT(*) as total_pensioners,
          COUNT(CASE WHEN PSA IS NOT NULL AND PSA != '' THEN 1 END) as verified_pensioners,
          CASE 
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(CASE WHEN PSA IS NOT NULL AND PSA != '' THEN 1 END) * 100.0 / COUNT(*)), 2)
            ELSE 0 
          END as success_rate
        FROM pensioner_bank_master 
        WHERE 1=1
        ${DataValidator.getDataFilteringClause()}
        GROUP BY state
        ORDER BY success_rate DESC
        LIMIT 100
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Get state-specific statistics
   */
  static async getStateStatistics(db, stateCode) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_pensioners,
          COUNT(CASE WHEN PSA IS NOT NULL AND PSA != '' THEN 1 END) as verified_pensioners,
          COUNT(CASE WHEN PSA IS NULL OR PSA = '' THEN 1 END) as pending_pensioners,
          COUNT(DISTINCT bank_name) as total_banks,
          COUNT(DISTINCT pensioner_city) as total_cities
        FROM pensioner_bank_master 
        WHERE state = ?
        ${DataValidator.getDataFilteringClause()}
      `;
      
      db.get(query, [stateCode], (err, row) => {
        if (err) reject(err);
        else {
          const result = {
            ...row,
            success_rate: row.total_pensioners ? 
              Math.round((row.verified_pensioners / row.total_pensioners) * 10000) / 100 : 0
          };
          resolve(result);
        }
      });
    });
  }

  /**
   * Get age distribution for a specific state
   */
  static async getStateAgeDistribution(db, stateCode) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          CASE 
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 < 60 THEN 'Below 60'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 60 AND 70 THEN '60-70'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 BETWEEN 70 AND 80 THEN '70-80'
            WHEN (julianday('now') - julianday(pensioner_dob)) / 365.25 > 80 THEN 'Above 80'
            ELSE 'Unknown'
          END as age_group,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE state = ?
          AND pensioner_dob IS NOT NULL 
          AND pensioner_dob != ''
          AND pensioner_dob NOT LIKE '%CIVIL%'
          AND pensioner_dob NOT LIKE '%RAILWAY%'
          AND pensioner_dob NOT LIKE '%DEFENCE%'
          AND pensioner_dob NOT LIKE '%EPFO%'
          AND pensioner_dob NOT LIKE '%DOP%'
          AND pensioner_dob NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')
          ${DataValidator.getDataFilteringClause()}
        GROUP BY age_group
        ORDER BY age_group
      `;
      
      db.all(query, [stateCode], (err, rows) => {
        if (err) reject(err);
        else {
          // Convert to object
          const result = {
            'Below 60': 0,
            '60-70': 0,
            '70-80': 0,
            'Above 80': 0,
            'Unknown': 0
          };
          
          rows.forEach(row => {
            result[row.age_group] = row.count;
          });
          
          resolve(result);
        }
      });
    });
  }

  /**
   * Get verification methods for a specific state
   */
  static async getStateVerificationMethods(db, stateCode) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          PSA as verification_method,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE state = ?
          AND PSA IS NOT NULL AND PSA != ''
          ${DataValidator.getDataFilteringClause()}
        GROUP BY PSA
        ORDER BY count DESC
      `;
      
      db.all(query, [stateCode], (err, rows) => {
        if (err) reject(err);
        else {
          // Convert to object
          const result = {};
          rows.forEach(row => {
            result[row.verification_method] = row.count;
          });
          resolve(result);
        }
      });
    });
  }

  /**
   * Get biometric data for a specific state
   */
  static async getStateBiometricData(db, stateCode) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          PSA,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE state = ?
          AND PSA IS NOT NULL AND PSA != ''
          ${DataValidator.getDataFilteringClause()}
        GROUP BY PSA
      `;
      
      db.all(query, [stateCode], (err, rows) => {
        if (err) reject(err);
        else {
          // Map PSA categories to verification types based on actual data
          const verificationMap = {
            'DEFENCE_LESS_THAN_80': 'Digital',
            'DEFENCE_MORE_THAN_80': 'Digital',
            'DEFENCE_FAMILY_LESS_THAN_80': 'Digital',
            'DEFENCE_FAMILY_MORE_THAN_80': 'Digital',
            'DEFENCE_AGE_NOT_AVAILABLE': 'Digital',
            'DEFENCE_FAMILY_AGE_NOT_AVAILABLE': 'Digital',
            'DEFENCE': 'Digital',
            'Central Government': 'Digital',
            'State Government': 'Physical',
            'RAILWAY': 'Video',
            'RAILWAYS-VIIPC': 'Video',
            'CENTRAL RAILWAY': 'Video',
            'NORTH CENTRAL RAILWAY': 'Video',
            'CENTRAL CIVIL': 'Physical',
            'STATE CIVIL': 'Physical',
            'CIVIL': 'Physical'
          };
          
          const result = {
            'Digital': 0,
            'Physical': 0,
            'Video': 0,
            'Other': 0
          };
          
          rows.forEach(row => {
            // Check if PSA is defined
            if (!row.PSA) {
              result['Other'] += row.count;
              return;
            }
            
            let verificationType = 'Other';
            // Check for exact matches first
            if (verificationMap[row.PSA]) {
              verificationType = verificationMap[row.PSA];
            } else {
              // Check for partial matches
              if (row.PSA.includes('DEFENCE')) {
                verificationType = 'Digital';
              } else if (row.PSA.includes('RAILWAY') || row.PSA.includes('RAIL')) {
                verificationType = 'Video';
              } else if (row.PSA.includes('CIVIL') || row.PSA.includes('GOVERNMENT')) {
                verificationType = 'Physical';
              }
            }
            result[verificationType] += row.count;
          });
          
          resolve(result);
        }
      });
    });
  }
}

module.exports = DashboardController;