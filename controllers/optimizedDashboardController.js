const { database } = require('../config/database');
const DataValidator = require('../utils/dataValidator');

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class OptimizedDashboardController {
  /**
   * Get comprehensive dashboard overview with all requested data
   */
  static async getDashboardOverview(req, res) {
    try {
      // Check cache first
      const cacheKey = 'dashboard_overview';
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }
      
      const db = database.getDB();
      
      // Get overall statistics
      const overallStats = await OptimizedDashboardController.getOverallStatistics(db);
      
      // Get top states by total pensioners (limited for performance)
      const topStates = await OptimizedDashboardController.getTopStatesByPensioners(db);
      
      // Get verification method distribution (limited for performance)
      const verificationMethods = await OptimizedDashboardController.getVerificationMethodDistribution(db);
      
      // Get biometric data distribution
      const biometricData = await OptimizedDashboardController.getBiometricDataDistribution(db);
      
      // Get success rates by top states
      const successRates = await OptimizedDashboardController.getSuccessRatesByState(db);
      
      const result = {
        overall: overallStats,
        topStates: topStates,
        verificationMethods: verificationMethods,
        biometricData: biometricData,
        successRatesByState: successRates
      };
      
      // Cache the result
      setCachedData(cacheKey, result);
      
      res.json({
        success: true,
        data: result,
        cached: false
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
      
      // Check cache first
      const cacheKey = `state_dashboard_${stateCode}`;
      const cachedData = getCachedData(cacheKey);
      
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true
        });
      }
      
      const db = database.getDB();
      
      // Get state-specific statistics
      const stateStats = await OptimizedDashboardController.getStateStatistics(db, stateCode);
      
      // Get verification method distribution for the state
      const verificationMethods = await OptimizedDashboardController.getStateVerificationMethods(db, stateCode);
      
      // Get biometric data distribution for the state
      const biometricData = await OptimizedDashboardController.getStateBiometricData(db, stateCode);
      
      const result = {
        state: stateCode,
        statistics: stateStats,
        verificationMethods: verificationMethods,
        biometricData: biometricData
      };
      
      // Cache the result
      setCachedData(cacheKey, result);
      
      res.json({
        success: true,
        data: result,
        cached: false
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
      const cacheKey = 'overall_stats';
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
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
          setCachedData(cacheKey, result);
          resolve(result);
        }
      });
    });
  }

  /**
   * Get state-specific statistics
   */
  static async getStateStatistics(db, stateCode) {
    return new Promise((resolve, reject) => {
      const cacheKey = `state_stats_${stateCode}`;
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
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
          setCachedData(cacheKey, result);
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
      const cacheKey = 'verification_methods';
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
      const query = `
        SELECT 
          PSA as verification_method,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE PSA IS NOT NULL AND PSA != ''
        ${DataValidator.getDataFilteringClause()}
        GROUP BY PSA
        ORDER BY count DESC
        LIMIT 20
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else {
          // Convert to object with method names as keys
          const result = {};
          rows.forEach(row => {
            result[row.verification_method] = row.count;
          });
          setCachedData(cacheKey, result);
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
      const cacheKey = `state_verification_${stateCode}`;
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
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
        LIMIT 20
      `;
      
      db.all(query, [stateCode], (err, rows) => {
        if (err) reject(err);
        else {
          // Convert to object
          const result = {};
          rows.forEach(row => {
            result[row.verification_method] = row.count;
          });
          setCachedData(cacheKey, result);
          resolve(result);
        }
      });
    });
  }

  /**
   * Get biometric data distribution
   */
  static async getBiometricDataDistribution(db) {
    return new Promise((resolve, reject) => {
      const cacheKey = 'biometric_data';
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
      const query = `
        SELECT 
          PSA,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE PSA IS NOT NULL AND PSA != ''
        ${DataValidator.getDataFilteringClause()}
        GROUP BY PSA
        LIMIT 100
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
              // Check for partial matches (safely)
              if (row.PSA && typeof row.PSA === 'string') {
                if (row.PSA.includes('DEFENCE')) {
                  verificationType = 'Digital';
                } else if (row.PSA.includes('RAILWAY') || row.PSA.includes('RAIL')) {
                  verificationType = 'Video';
                } else if (row.PSA.includes('CIVIL') || row.PSA.includes('GOVERNMENT')) {
                  verificationType = 'Physical';
                }
              }
            }
            result[verificationType] += row.count;
          });
          
          setCachedData(cacheKey, result);
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
      const cacheKey = `state_biometric_${stateCode}`;
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
      const query = `
        SELECT 
          PSA,
          COUNT(*) as count
        FROM pensioner_bank_master 
        WHERE state = ?
          AND PSA IS NOT NULL AND PSA != ''
          ${DataValidator.getDataFilteringClause()}
        GROUP BY PSA
        LIMIT 50
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
              // Check for partial matches (safely)
              if (row.PSA && typeof row.PSA === 'string') {
                if (row.PSA.includes('DEFENCE')) {
                  verificationType = 'Digital';
                } else if (row.PSA.includes('RAILWAY') || row.PSA.includes('RAIL')) {
                  verificationType = 'Video';
                } else if (row.PSA.includes('CIVIL') || row.PSA.includes('GOVERNMENT')) {
                  verificationType = 'Physical';
                }
              }
            }
            result[verificationType] += row.count;
          });
          
          setCachedData(cacheKey, result);
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
      const cacheKey = 'top_states';
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
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
        else {
          setCachedData(cacheKey, rows);
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get success rates by state
   */
  static async getSuccessRatesByState(db) {
    return new Promise((resolve, reject) => {
      const cacheKey = 'success_rates';
      const cached = getCachedData(cacheKey);
      
      if (cached) {
        resolve(cached);
        return;
      }
      
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
        LIMIT 20
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else {
          setCachedData(cacheKey, rows);
          resolve(rows);
        }
      });
    });
  }
}

// Cache helper functions
function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCachedData(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

module.exports = OptimizedDashboardController;