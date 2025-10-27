/**
 * Data Access Control Middleware
 * Controls access to pension data based on user roles and permissions
 */

const authMiddleware = require('./auth');
const sessionTimeout = require('./sessionTimeout');
const simpleAuth = require('./simpleAuth');

class DataAccessMiddleware {
  
  /**
   * Filter SBI data based on user permissions
   */
  filterSBIData = (req, res, next) => {
    // Add data filtering logic to the response
    const originalSend = res.send;
    
    res.send = function(data) {
      if (req.user && typeof data === 'string') {
        try {
          const jsonData = JSON.parse(data);
          
          if (jsonData.success && jsonData.data && Array.isArray(jsonData.data.records)) {
            // Filter records based on user's allowed states
            jsonData.data.records = filterRecordsByUserAccess(jsonData.data.records, req.user);
            
            // Update statistics
            if (jsonData.data.statistics) {
              jsonData.data.statistics = recalculateStatistics(jsonData.data.records);
            }
            
            data = JSON.stringify(jsonData);
          }
        } catch (error) {
          // If not JSON, send as is
        }
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };

  /**
   * Protect SBI routes with authentication, session timeout, and data filtering
   */
  protectSBIRoute = [
    // Use simple auth if flag is set, otherwise use complex auth
    process.env.USE_SIMPLE_AUTH === 'true' ? simpleAuth.authenticateToken : authMiddleware.authenticateToken,
    // Skip session timeout for simple auth
    process.env.USE_SIMPLE_AUTH === 'true' ? (req, res, next) => next() : sessionTimeout.checkSessionTimeout,
    authMiddleware.requirePermission('sbi.view'),
    this.filterSBIData
  ];

  /**
   * Protect DLC routes
   */
  protectDLCRoute = [
    authMiddleware.authenticateToken,
    sessionTimeout.checkSessionTimeout,
    authMiddleware.requirePermission('data.view'),
    this.filterSBIData
  ];

  /**
   * Protect pension analytics routes
   */
  protectAnalyticsRoute = [
    authMiddleware.authenticateToken,
    sessionTimeout.checkSessionTimeout,
    authMiddleware.requirePermission('data.analytics'),
    this.filterSBIData
  ];

  /**
   * Protect admin routes
   */
  protectAdminRoute = [
    authMiddleware.authenticateToken,
    sessionTimeout.checkSessionTimeout,
    authMiddleware.requireAdmin
  ];

  /**
   * Protect scheduler routes
   */
  protectSchedulerRoute = [
    authMiddleware.authenticateToken,
    sessionTimeout.checkSessionTimeout,
    authMiddleware.requirePermission('scheduler.manage')
  ];

  /**
   * Protect SFTP routes
   */
  protectSFTPRoute = [
    authMiddleware.authenticateToken,
    sessionTimeout.checkSessionTimeout,
    authMiddleware.requirePermission('sbi.manage')
  ];

  /**
   * Optional authentication for public endpoints
   */
  optionalAuth = [
    authMiddleware.optionalAuth,
    this.filterSBIData
  ];
}

/**
 * Filter records based on user's data access permissions
 */
function filterRecordsByUserAccess(records, user) {
  if (!user) return [];
  
  // Super admin and admin can see all data
  if (user.permissions.includes('*') || user.roleName === 'Admin') {
    return records;
  }
  
  // Get user's full data to check allowed states
  const UserModel = require('../models/User');
  const userModel = new UserModel();
  const fullUser = userModel.getUserById(user.id);
  
  if (!fullUser) return [];
  
  // If user has all_states access
  if (fullUser.data_access_level === 'all_states') {
    return records;
  }
  
  // Filter by allowed states
  let allowedStates = [];
  if (fullUser.allowed_states) {
    try {
      allowedStates = JSON.parse(fullUser.allowed_states);
    } catch (error) {
      console.error('Error parsing allowed states:', error);
      return [];
    }
  }
  
  if (allowedStates.length === 0) {
    return []; // No states allowed
  }
  
  // Filter records by state
  return records.filter(record => {
    // Check various state field names that might exist in the data
    const recordState = record.state || 
                       record.pensioner_state || 
                       record.branch_state || 
                       record.STATE || 
                       record.PENSIONER_STATE ||
                       record.BRANCH_STATE;
    
    return allowedStates.includes(recordState);
  });
}

/**
 * Recalculate statistics after filtering
 */
function recalculateStatistics(filteredRecords) {
  const statistics = {
    summary: [],
    stateDistribution: []
  };
  
  // Count by verification type
  const verificationCounts = {};
  const stateCounts = {};
  const departmentCounts = {};
  
  filteredRecords.forEach(record => {
    // Verification type
    const verificationType = record.verification_type || record.VERIFICATION_TYPE || 'Unknown';
    verificationCounts[verificationType] = (verificationCounts[verificationType] || 0) + 1;
    
    // State distribution
    const state = record.state || record.pensioner_state || record.branch_state || 'Unknown';
    stateCounts[state] = (stateCounts[state] || 0) + 1;
    
    // Department
    const department = record.department || record.DEPARTMENT || 'Unknown';
    departmentCounts[department] = (departmentCounts[department] || 0) + 1;
  });
  
  // Convert to arrays
  statistics.summary = Object.entries(verificationCounts).map(([type, count]) => ({
    verification_type: type,
    count: count
  }));
  
  statistics.stateDistribution = Object.entries(stateCounts).map(([state, count]) => ({
    state: state,
    count: count
  }));
  
  statistics.departmentDistribution = Object.entries(departmentCounts).map(([dept, count]) => ({
    department: dept,
    count: count
  }));
  
  return statistics;
}

module.exports = new DataAccessMiddleware();
