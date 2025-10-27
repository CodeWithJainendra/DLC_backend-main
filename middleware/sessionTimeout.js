/**
 * Session Timeout Middleware
 * Implements Government Portal Standard Session Management
 * - 30 minutes active session
 * - 10 minutes idle timeout
 * - 2 hours absolute maximum
 */

const authConfig = require('../config/auth');
const UserModel = require('../models/User');

class SessionTimeoutMiddleware {
  constructor() {
    this.userModel = new UserModel();
  }

  /**
   * Check session timeout based on government standards
   */
  checkSessionTimeout = async (req, res, next) => {
    if (!req.user || !req.user.sessionToken) {
      return next();
    }

    try {
      const session = this.userModel.getValidSession(req.user.sessionToken);
      
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Session expired',
          code: 'SESSION_EXPIRED',
          reason: 'Session not found or invalid'
        });
      }

      const now = Date.now();
      const lastAccessed = new Date(session.last_accessed).getTime();
      const sessionStart = new Date(session.created_at).getTime();
      
      // Check absolute maximum session duration (2 hours)
      const maxSessionTime = authConfig.session.maxSessionDuration;
      if (now - sessionStart > maxSessionTime) {
        this.invalidateSession(req.user.sessionToken);
        
        this.userModel.logActivity(
          req.user.id,
          'session_expired',
          'max_duration',
          req.ip,
          req.get('User-Agent'),
          1,
          'Maximum session duration exceeded (2 hours)'
        );

        return res.status(401).json({
          success: false,
          error: 'Session expired',
          code: 'MAX_SESSION_EXCEEDED',
          reason: 'Maximum session duration (2 hours) exceeded',
          requiresRelogin: true
        });
      }

      // Check idle timeout (10 minutes of inactivity)
      const idleTimeout = authConfig.session.idleSessionTimeout;
      if (now - lastAccessed > idleTimeout) {
        this.invalidateSession(req.user.sessionToken);
        
        this.userModel.logActivity(
          req.user.id,
          'session_expired',
          'idle_timeout',
          req.ip,
          req.get('User-Agent'),
          1,
          'Session expired due to inactivity (10 minutes)'
        );

        return res.status(401).json({
          success: false,
          error: 'Session expired due to inactivity',
          code: 'IDLE_TIMEOUT',
          reason: 'No activity for 10 minutes',
          requiresRelogin: true
        });
      }

      // Check if session is approaching timeout (warning)
      const warningThreshold = authConfig.session.warningBeforeTimeout;
      const timeUntilIdle = idleTimeout - (now - lastAccessed);
      const timeUntilMax = maxSessionTime - (now - sessionStart);
      
      // Add timeout warnings to response headers
      res.set({
        'X-Session-Time-Remaining': Math.min(timeUntilIdle, timeUntilMax),
        'X-Session-Idle-Warning': timeUntilIdle < warningThreshold ? 'true' : 'false',
        'X-Session-Max-Warning': timeUntilMax < warningThreshold ? 'true' : 'false'
      });

      // Update last accessed time
      this.updateSessionAccess(req.user.sessionToken);
      
      next();

    } catch (error) {
      console.error('Session timeout check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Session validation failed',
        code: 'SESSION_CHECK_ERROR'
      });
    }
  };

  /**
   * Get session status for frontend
   */
  getSessionStatus = async (req, res) => {
    if (!req.user || !req.user.sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'No active session'
      });
    }

    try {
      const session = this.userModel.getValidSession(req.user.sessionToken);
      
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Session not found'
        });
      }

      const now = Date.now();
      const lastAccessed = new Date(session.last_accessed).getTime();
      const sessionStart = new Date(session.created_at).getTime();
      
      const maxSessionTime = authConfig.session.maxSessionDuration;
      const idleTimeout = authConfig.session.idleSessionTimeout;
      
      const timeUntilIdle = idleTimeout - (now - lastAccessed);
      const timeUntilMax = maxSessionTime - (now - sessionStart);
      const timeRemaining = Math.min(timeUntilIdle, timeUntilMax);

      res.json({
        success: true,
        data: {
          sessionActive: true,
          timeRemaining: Math.max(0, timeRemaining),
          timeUntilIdle: Math.max(0, timeUntilIdle),
          timeUntilMaxSession: Math.max(0, timeUntilMax),
          warningThreshold: authConfig.session.warningBeforeTimeout,
          showIdleWarning: timeUntilIdle < authConfig.session.warningBeforeTimeout,
          showMaxWarning: timeUntilMax < authConfig.session.warningBeforeTimeout,
          sessionStart: new Date(sessionStart).toISOString(),
          lastAccessed: new Date(lastAccessed).toISOString()
        }
      });

    } catch (error) {
      console.error('Get session status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session status'
      });
    }
  };

  /**
   * Extend session (reset idle timer)
   */
  extendSession = async (req, res) => {
    if (!req.user || !req.user.sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'No active session'
      });
    }

    try {
      const session = this.userModel.getValidSession(req.user.sessionToken);
      
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Session not found'
        });
      }

      // Check if we're still within maximum session time
      const now = Date.now();
      const sessionStart = new Date(session.created_at).getTime();
      const maxSessionTime = authConfig.session.maxSessionDuration;
      
      if (now - sessionStart > maxSessionTime) {
        return res.status(401).json({
          success: false,
          error: 'Cannot extend session - maximum duration exceeded',
          code: 'MAX_SESSION_EXCEEDED'
        });
      }

      // Update last accessed time (extends idle timeout)
      this.updateSessionAccess(req.user.sessionToken);
      
      this.userModel.logActivity(
        req.user.id,
        'session_extended',
        'user_action',
        req.ip,
        req.get('User-Agent'),
        1,
        'User extended session'
      );

      res.json({
        success: true,
        message: 'Session extended successfully',
        data: {
          extendedAt: new Date().toISOString(),
          timeRemaining: maxSessionTime - (now - sessionStart)
        }
      });

    } catch (error) {
      console.error('Extend session error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to extend session'
      });
    }
  };

  /**
   * Invalidate session
   */
  invalidateSession(sessionToken) {
    try {
      const stmt = this.userModel.db.prepare(`
        UPDATE user_sessions SET is_active = 0 WHERE session_token = ?
      `);
      stmt.run(sessionToken);
    } catch (error) {
      console.error('Failed to invalidate session:', error);
    }
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
   * Clean expired sessions (maintenance task)
   */
  cleanExpiredSessions = async () => {
    try {
      const maxAge = authConfig.session.maxSessionDuration;
      const cutoffTime = new Date(Date.now() - maxAge).toISOString();
      
      const stmt = this.userModel.db.prepare(`
        UPDATE user_sessions 
        SET is_active = 0 
        WHERE created_at < ? OR last_accessed < datetime('now', '-10 minutes')
      `);
      
      const result = stmt.run(cutoffTime);
      
      console.log(`🧹 Cleaned ${result.changes} expired sessions`);
      return result.changes;
      
    } catch (error) {
      console.error('Failed to clean expired sessions:', error);
      return 0;
    }
  };
}

module.exports = new SessionTimeoutMiddleware();
