/**
 * Simple Authentication Middleware (No Session Timeout)
 * For SBI-only server - simplified token validation
 */

const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const UserModel = require('../models/User');

class SimpleAuthMiddleware {
  constructor() {
    this.userModel = new UserModel();
  }

  /**
   * Simple token authentication without session timeout
   */
  authenticateToken = async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Access token required',
          code: 'TOKEN_MISSING'
        });
      }

      // Verify JWT token
      const decoded = jwt.verify(token, authConfig.jwt.secret);
      
      // Get user details
      const user = this.userModel.getUserById(decoded.userId);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.is_active) {
        return res.status(401).json({
          success: false,
          error: 'User account is inactive',
          code: 'USER_INACTIVE'
        });
      }

      // Add user info to request
      req.user = {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        roleId: user.role_id,
        roleName: user.role_name,
        department: user.department,
        permissions: user.role_permissions ? JSON.parse(user.role_permissions) : [],
        dataAccessLevel: user.data_access_level,
        allowedStates: user.allowed_states ? user.allowed_states.split(',') : [],
        sessionToken: decoded.sessionToken
      };

      // Log activity (optional)
      this.userModel.logActivity(
        user.id,
        'api_access',
        req.method + ' ' + req.originalUrl,
        req.ip,
        req.get('User-Agent'),
        0,
        'API access with valid token'
      );

      next();

    } catch (error) {
      console.error('Token verification error:', error);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          requiresRelogin: true
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Token verification failed',
        code: 'TOKEN_VERIFICATION_ERROR'
      });
    }
  };

  /**
   * Check if user has required permission
   */
  requirePermission = (permission) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Super admin has all permissions
      if (req.user.permissions.includes('*')) {
        return next();
      }

      // Check specific permission
      if (!req.user.permissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          required: permission,
          userPermissions: req.user.permissions
        });
      }

      next();
    };
  };

  /**
   * Check SBI access permission
   */
  requireSBIAccess = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if user has SBI view permission
    const hasSBIPermission = req.user.permissions.includes('*') || 
                            req.user.permissions.includes('sbi.view') ||
                            req.user.permissions.includes('data.view');

    if (!hasSBIPermission) {
      return res.status(403).json({
        success: false,
        error: 'SBI API access denied',
        message: 'User does not have SBI view permissions',
        userPermissions: req.user.permissions
      });
    }

    next();
  };
}

const simpleAuth = new SimpleAuthMiddleware();

module.exports = {
  authenticateToken: simpleAuth.authenticateToken,
  requirePermission: simpleAuth.requirePermission,
  requireSBIAccess: simpleAuth.requireSBIAccess
};
