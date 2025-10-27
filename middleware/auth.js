/**
 * Authentication Middleware
 * JWT token validation and role-based access control
 */

const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');
const authConfig = require('../config/auth');

class AuthMiddleware {
  constructor() {
    this.userModel = new UserModel();
  }

  /**
   * Verify JWT token and authenticate user
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
      
      // Get session from database
      const session = this.userModel.getValidSession(decoded.sessionToken);
      
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired session',
          code: 'SESSION_INVALID'
        });
      }

      // Update session last accessed time
      this.updateSessionAccess(decoded.sessionToken);

      // Attach user info to request
      req.user = {
        id: session.user_id,
        username: session.username,
        fullName: session.full_name,
        roleId: session.role_id,
        roleName: session.role_name,
        permissions: JSON.parse(session.role_permissions || '[]'),
        sessionToken: decoded.sessionToken
      };

      // Log activity
      this.userModel.logActivity(
        req.user.id,
        'api_access',
        req.originalUrl,
        req.ip,
        req.get('User-Agent'),
        true
      );

      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
      }
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      console.error('Authentication error:', error);
      return res.status(500).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
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
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!this.hasPermission(req.user, permission)) {
        this.userModel.logActivity(
          req.user.id,
          'access_denied',
          req.originalUrl,
          req.ip,
          req.get('User-Agent'),
          false,
          `Missing permission: ${permission}`
        );

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          required: permission
        });
      }

      next();
    };
  };

  /**
   * Check if user has any of the required roles
   */
  requireRole = (roles) => {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userRoleName = req.user.roleName;
      if (!roleArray.includes(userRoleName)) {
        this.userModel.logActivity(
          req.user.id,
          'access_denied',
          req.originalUrl,
          req.ip,
          req.get('User-Agent'),
          false,
          `Role not authorized: ${userRoleName}`
        );

        return res.status(403).json({
          success: false,
          error: 'Role not authorized',
          code: 'ROLE_DENIED',
          required: roleArray,
          current: userRoleName
        });
      }

      next();
    };
  };

  /**
   * Check if user can access state data
   */
  requireStateAccess = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Get state from query params or body
    const stateCode = req.query.state || req.body.state || req.params.state;
    
    if (stateCode && !this.canAccessState(req.user, stateCode)) {
      this.userModel.logActivity(
        req.user.id,
        'access_denied',
        req.originalUrl,
        req.ip,
        req.get('User-Agent'),
        false,
        `State access denied: ${stateCode}`
      );

      return res.status(403).json({
        success: false,
        error: 'State access denied',
        code: 'STATE_ACCESS_DENIED',
        state: stateCode
      });
    }

    next();
  };

  /**
   * Optional authentication - doesn't fail if no token
   */
  optionalAuth = async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        const decoded = jwt.verify(token, authConfig.jwt.secret);
        const session = this.userModel.getValidSession(decoded.sessionToken);
        
        if (session) {
          req.user = {
            id: session.user_id,
            username: session.username,
            fullName: session.full_name,
            roleId: session.role_id,
            roleName: session.role_name,
            permissions: JSON.parse(session.role_permissions || '[]'),
            sessionToken: decoded.sessionToken
          };
        }
      }
    } catch (error) {
      // Ignore authentication errors for optional auth
      console.log('Optional auth failed:', error.message);
    }

    next();
  };

  /**
   * Admin only access
   */
  requireAdmin = this.requireRole(['Super Admin', 'Admin']);

  /**
   * Manager level access
   */
  requireManager = this.requireRole(['Super Admin', 'Admin', 'Manager']);

  /**
   * Check if user has permission
   */
  hasPermission(user, permission) {
    if (!user.permissions) return false;
    
    // Super admin has all permissions
    if (user.permissions.includes('*')) return true;
    
    // Check specific permission
    return user.permissions.includes(permission);
  }

  /**
   * Check if user can access state data
   */
  canAccessState(user, stateCode) {
    // Get full user data to check state access
    const fullUser = this.userModel.getUserById(user.id);
    
    if (!fullUser) return false;
    
    if (fullUser.data_access_level === 'all_states') return true;
    
    if (fullUser.allowed_states) {
      const allowedStates = JSON.parse(fullUser.allowed_states);
      return allowedStates.includes(stateCode);
    }
    
    return false;
  }

  /**
   * Update session last accessed time
   */
  updateSessionAccess(sessionToken) {
    try {
      const stmt = this.userModel.db.prepare(`
        UPDATE user_sessions SET last_accessed = datetime('now') WHERE session_token = ?
      `);
      stmt.run(sessionToken);
    } catch (error) {
      console.error('Failed to update session access:', error);
    }
  }

  /**
   * Rate limiting for authentication endpoints
   */
  authRateLimit = (req, res, next) => {
    // This would integrate with express-rate-limit for auth endpoints
    // For now, just pass through
    next();
  };
}

module.exports = new AuthMiddleware();
