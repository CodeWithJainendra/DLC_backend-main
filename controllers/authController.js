/**
 * Authentication Controller
 * Handles user authentication, registration, and session management
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserModel = require('../models/User');
const authConfig = require('../config/auth');
const otpService = require('../services/otpService');

class AuthController {
  constructor() {
    this.userModel = new UserModel();
  }

  /**
   * Unified Login - Handles both username/password and phone/OTP
   */
  unifiedLogin = async (req, res) => {
    try {
      const { username, password, phoneNumber, otp, rememberMe = false } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent');

      // Determine login method
      const isOTPLogin = phoneNumber && otp;
      const isPasswordLogin = username && password;

      if (!isOTPLogin && !isPasswordLogin) {
        return res.status(400).json({
          success: false,
          error: 'Please provide either (username + password) or (phoneNumber + otp)'
        });
      }

      let user = null;
      let authResult = null;

      // OTP Login
      if (isOTPLogin) {
        // Normalize phone number (add 91 if not present)
        let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('91')) {
          normalizedPhone = '91' + normalizedPhone;
        }

        // Verify OTP
        const otpResult = otpService.verifyOTP(normalizedPhone, otp, ipAddress, userAgent);
        
        if (!otpResult.success) {
          return res.status(401).json({
            success: false,
            error: otpResult.error || 'Invalid or expired OTP'
          });
        }

        // Get user by phone number
        const userStmt = this.userModel.db.prepare(`
          SELECT u.*, r.name as role_name, r.permissions as role_permissions
          FROM users u
          LEFT JOIN roles r ON u.role_id = r.id
          WHERE u.phone_number = ? AND u.is_active = 1
        `);
        
        user = userStmt.get(normalizedPhone);

        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'User not found with this phone number'
          });
        }

        // Log OTP login activity
        this.userModel.logActivity(
          user.id,
          'otp_login',
          'authentication',
          ipAddress,
          userAgent,
          true,
          null,
          JSON.stringify({ phoneNumber: normalizedPhone })
        );

      } 
      // Username/Password Login
      else if (isPasswordLogin) {
        authResult = await this.userModel.authenticateUser(
          username, 
          password, 
          ipAddress, 
          userAgent
        );

        if (!authResult.success) {
          return res.status(401).json({
            success: false,
            error: authResult.error
          });
        }

        user = authResult.user;
      }

      // Generate tokens
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const refreshToken = crypto.randomBytes(32).toString('hex');
      
      const expiresIn = authConfig.jwt.expiresIn;
      const maxSessionTime = authConfig.session.maxSessionDuration;
      const expiresAt = new Date(Date.now() + (rememberMe ? maxSessionTime : authConfig.session.activeSessionTimeout));

      // Create JWT token
      const jwtToken = jwt.sign(
        { 
          userId: user.id,
          username: user.username,
          sessionToken: sessionToken,
          loginTime: Date.now(),
          maxSessionEnd: Date.now() + maxSessionTime,
          loginMethod: isOTPLogin ? 'otp' : 'password'
        },
        authConfig.jwt.secret,
        { 
          expiresIn: expiresIn,
          issuer: authConfig.jwt.issuer,
          audience: authConfig.jwt.audience
        }
      );

      // Store session
      this.userModel.createSession(
        user.id,
        sessionToken,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt.toISOString()
      );

      // Set HTTP-only cookie
      res.cookie('auth_token', jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Changed from 'strict' to 'lax' for cross-origin
        maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
      });

      // Update last login
      this.userModel.db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token: jwtToken,
          refreshToken: refreshToken,
          expiresAt: expiresAt.toISOString(),
          loginMethod: isOTPLogin ? 'otp' : 'password',
          user: {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            email: user.email,
            phoneNumber: user.phone_number,
            role: user.role_name,
            department: user.department,
            dataAccessLevel: user.data_access_level,
            permissions: JSON.parse(user.role_permissions || '[]')
          }
        }
      });

    } catch (error) {
      console.error('Unified login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed: ' + error.message
      });
    }
  };

  /**
   * User login (Legacy - kept for backward compatibility)
   */
  login = async (req, res) => {
    try {
      const { username, password, rememberMe = false } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent');

      // Authenticate user
      const authResult = await this.userModel.authenticateUser(
        username, 
        password, 
        ipAddress, 
        userAgent
      );

      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error
        });
      }

      const user = authResult.user;

      // Generate tokens (Government Portal Standards)
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const refreshToken = crypto.randomBytes(32).toString('hex');
      
      // Government standard: Max 30 minutes active, 2 hours absolute maximum
      const expiresIn = authConfig.jwt.expiresIn; // 30 minutes
      const maxSessionTime = authConfig.session.maxSessionDuration; // 2 hours
      const expiresAt = new Date(Date.now() + (rememberMe ? maxSessionTime : authConfig.session.activeSessionTimeout));

      // Create JWT token with government standards
      const jwtToken = jwt.sign(
        { 
          userId: user.id,
          username: user.username,
          sessionToken: sessionToken,
          loginTime: Date.now(),
          maxSessionEnd: Date.now() + maxSessionTime
        },
        authConfig.jwt.secret,
        { 
          expiresIn: expiresIn,
          issuer: authConfig.jwt.issuer,
          audience: authConfig.jwt.audience
        }
      );

      // Store session in database
      this.userModel.createSession(
        user.id,
        sessionToken,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt.toISOString()
      );

      // Set HTTP-only cookie for additional security
      res.cookie('auth_token', jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token: jwtToken,
          refreshToken: refreshToken,
          expiresAt: expiresAt.toISOString(),
          user: {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            email: user.email,
            role: user.role_name,
            department: user.department,
            dataAccessLevel: user.data_access_level,
            permissions: JSON.parse(user.role_permissions || '[]')
          }
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  };

  /**
   * User logout
   */
  logout = async (req, res) => {
    try {
      const sessionToken = req.user?.sessionToken;

      if (sessionToken) {
        // Invalidate session
        this.userModel.invalidateSession(sessionToken);
        
        // Log activity
        this.userModel.logActivity(
          req.user.id,
          'logout',
          'authentication',
          req.ip,
          req.get('User-Agent'),
          true
        );
      }

      // Clear cookie
      res.clearCookie('auth_token');

      res.json({
        success: true,
        message: 'Logout successful'
      });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  };

  /**
   * Refresh token
   */
  refreshToken = async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token required'
        });
      }

      // Find session by refresh token
      const stmt = this.userModel.db.prepare(`
        SELECT s.*, u.username, u.full_name, u.role_id, r.name as role_name, r.permissions
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE s.refresh_token = ? AND s.is_active = 1 AND s.expires_at > datetime('now')
      `);
      
      const session = stmt.get(refreshToken);

      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired refresh token'
        });
      }

      // Generate new tokens
      const newSessionToken = crypto.randomBytes(32).toString('hex');
      const newRefreshToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create new JWT token
      const jwtToken = jwt.sign(
        { 
          userId: session.user_id,
          username: session.username,
          sessionToken: newSessionToken
        },
        authConfig.jwt.secret,
        { expiresIn: authConfig.jwt.expiresIn }
      );

      // Update session
      const updateStmt = this.userModel.db.prepare(`
        UPDATE user_sessions 
        SET session_token = ?, refresh_token = ?, expires_at = ?, last_accessed = datetime('now')
        WHERE id = ?
      `);
      
      updateStmt.run(newSessionToken, newRefreshToken, expiresAt.toISOString(), session.id);

      res.json({
        success: true,
        data: {
          token: jwtToken,
          refreshToken: newRefreshToken,
          expiresAt: expiresAt.toISOString()
        }
      });

    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        error: 'Token refresh failed'
      });
    }
  };

  /**
   * Get current user profile
   */
  getProfile = async (req, res) => {
    try {
      const user = this.userModel.getUserById(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const sanitizedUser = this.userModel.sanitizeUser(user);

      res.json({
        success: true,
        data: {
          ...sanitizedUser,
          permissions: JSON.parse(user.role_permissions || '[]'),
          allowedStates: JSON.parse(user.allowed_states || '[]'),
          allowedDistricts: JSON.parse(user.allowed_districts || '[]')
        }
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get profile'
      });
    }
  };

  /**
   * Register new user (Admin only)
   */
  register = async (req, res) => {
    try {
      const {
        username,
        email,
        password,
        fullName,
        roleId,
        department,
        dataAccessLevel = 'state_specific',
        allowedStates = [],
        allowedDistricts = []
      } = req.body;

      // Validate required fields
      if (!username || !email || !password || !fullName || !roleId) {
        return res.status(400).json({
          success: false,
          error: 'All required fields must be provided'
        });
      }

      // Validate password strength
      if (!this.isValidPassword(password)) {
        return res.status(400).json({
          success: false,
          error: 'Password does not meet security requirements'
        });
      }

      // Create user
      const result = await this.userModel.createUser({
        username,
        email,
        password,
        fullName,
        roleId,
        department,
        dataAccessLevel,
        allowedStates,
        allowedDistricts,
        createdBy: req.user.id
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      // Log activity
      this.userModel.logActivity(
        req.user.id,
        'user_created',
        'user_management',
        req.ip,
        req.get('User-Agent'),
        true,
        null,
        { createdUserId: result.userId }
      );

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: { userId: result.userId }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed'
      });
    }
  };

  /**
   * Get user activity log
   */
  getUserActivity = async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const userId = req.params.userId || req.user.id;

      // Check if user can view this activity (own activity or admin)
      if (userId !== req.user.id.toString() && !this.userModel.hasPermission(req.user, 'users.view')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied'
        });
      }

      const stmt = this.userModel.db.prepare(`
        SELECT action, resource, ip_address, success, error_message, created_at
        FROM user_activity_log
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);

      const activities = stmt.all(userId, parseInt(limit), parseInt(offset));

      res.json({
        success: true,
        data: activities
      });

    } catch (error) {
      console.error('Get activity error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get activity'
      });
    }
  };

  /**
   * Validate password strength
   */
  isValidPassword(password) {
    const config = authConfig.password;
    
    if (password.length < config.minLength) return false;
    if (config.requireUppercase && !/[A-Z]/.test(password)) return false;
    if (config.requireNumber && !/\d/.test(password)) return false;
    if (config.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
    
    return true;
  }

  /**
   * Change password
   */
  changePassword = async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current and new passwords are required'
        });
      }

      // Validate new password
      if (!this.isValidPassword(newPassword)) {
        return res.status(400).json({
          success: false,
          error: 'New password does not meet security requirements'
        });
      }

      // Verify current password
      const user = this.userModel.getUserById(req.user.id);
      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, authConfig.password.saltRounds);

      // Update password
      const stmt = this.userModel.db.prepare(`
        UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
      `);
      
      stmt.run(newPasswordHash, req.user.id);

      // Log activity
      this.userModel.logActivity(
        req.user.id,
        'password_changed',
        'user_management',
        req.ip,
        req.get('User-Agent'),
        true
      );

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change password'
      });
    }
  };

  /**
   * Send OTP to phone number
   */
  sendOTP = async (req, res) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent');

      // Send OTP
      const result = await otpService.sendOTP(phoneNumber, ipAddress, userAgent);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          details: result.details
        });
      }

      // Log activity
      this.userModel.logActivity(
        null,
        'otp_sent',
        'authentication',
        ipAddress,
        userAgent,
        true,
        null,
        { phoneNumber: phoneNumber.substring(0, 5) + '***' }
      );

      res.json({
        success: true,
        message: result.message,
        expiresAt: result.expiresAt
      });

    } catch (error) {
      console.error('Send OTP error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send OTP'
      });
    }
  };

  /**
   * Verify OTP and login
   */
  verifyOTPLogin = async (req, res) => {
    try {
      const { phoneNumber, otp, rememberMe = false } = req.body;

      if (!phoneNumber || !otp) {
        return res.status(400).json({
          success: false,
          error: 'Phone number and OTP are required'
        });
      }

      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent');

      // Verify OTP
      const otpResult = otpService.verifyOTP(phoneNumber, otp, ipAddress);

      if (!otpResult.success) {
        // Log failed attempt
        this.userModel.logActivity(
          null,
          'otp_verification_failed',
          'authentication',
          ipAddress,
          userAgent,
          false,
          otpResult.error,
          { phoneNumber: phoneNumber.substring(0, 5) + '***' }
        );

        return res.status(401).json({
          success: false,
          error: otpResult.error
        });
      }

      // Find or create user by phone number
      let user = this.userModel.getUserByPhone(phoneNumber);

      if (!user) {
        // Create new user with phone number
        const createResult = await this.userModel.createUserByPhone({
          phoneNumber,
          fullName: `User_${phoneNumber.substring(phoneNumber.length - 4)}`,
          roleId: 3, // Default to Viewer role
          createdBy: null
        });

        if (!createResult.success) {
          return res.status(500).json({
            success: false,
            error: 'Failed to create user account'
          });
        }

        user = this.userModel.getUserById(createResult.userId);
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          error: 'Account is disabled'
        });
      }

      // Generate tokens (Government Portal Standards)
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const refreshToken = crypto.randomBytes(32).toString('hex');
      
      const expiresIn = authConfig.jwt.expiresIn;
      const maxSessionTime = authConfig.session.maxSessionDuration;
      const expiresAt = new Date(Date.now() + (rememberMe ? maxSessionTime : authConfig.session.activeSessionTimeout));

      // Create JWT token
      const jwtToken = jwt.sign(
        { 
          userId: user.id,
          username: user.username,
          phoneNumber: user.phone_number,
          sessionToken: sessionToken,
          loginTime: Date.now(),
          maxSessionEnd: Date.now() + maxSessionTime,
          loginMethod: 'otp'
        },
        authConfig.jwt.secret,
        { 
          expiresIn: expiresIn,
          issuer: authConfig.jwt.issuer,
          audience: authConfig.jwt.audience
        }
      );

      // Store session in database
      this.userModel.createSession(
        user.id,
        sessionToken,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt.toISOString()
      );

      // Update last login
      this.userModel.updateLastLogin(user.id);

      // Log successful login
      this.userModel.logActivity(
        user.id,
        'otp_login',
        'authentication',
        ipAddress,
        userAgent,
        true,
        null,
        { loginMethod: 'otp' }
      );

      // Set HTTP-only cookie
      res.cookie('auth_token', jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token: jwtToken,
          refreshToken: refreshToken,
          expiresAt: expiresAt.toISOString(),
          user: {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            email: user.email,
            phoneNumber: user.phone_number,
            role: user.role_name,
            department: user.department,
            dataAccessLevel: user.data_access_level,
            permissions: JSON.parse(user.role_permissions || '[]')
          }
        }
      });

    } catch (error) {
      console.error('OTP login error:', error);
      res.status(500).json({
        success: false,
        error: 'OTP verification failed'
      });
    }
  };
}

module.exports = new AuthController();
