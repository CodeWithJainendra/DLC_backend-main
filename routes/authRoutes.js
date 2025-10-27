/**
 * Authentication Routes
 * Routes for user authentication and authorization
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const sessionTimeout = require('../middleware/sessionTimeout');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased for testing
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later.'
  }
});

// Validation middleware
const loginValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-50 characters and contain only letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/)
    .withMessage('Password must contain at least 8 characters with uppercase, lowercase, number, and special character'),
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('roleId')
    .isInt({ min: 1, max: 5 })
    .withMessage('Valid role ID is required'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Department must be less than 50 characters')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/)
    .withMessage('New password must contain at least 8 characters with uppercase, lowercase, number, and special character')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * @route POST /api/auth/login
 * @desc Unified login - supports both username/password and phone/OTP
 * @access Public
 */
router.post('/login', 
  authLimiter,
  authController.unifiedLogin
);

/**
 * @route POST /api/auth/send-otp
 * @desc Send OTP to phone number
 * @access Public
 */
router.post('/send-otp',
  authLimiter,
  body('phoneNumber')
    .trim()
    .matches(/^91[6-9]\d{9}$/)
    .withMessage('Invalid Indian phone number. Format: 919876543210'),
  handleValidationErrors,
  authController.sendOTP
);

/**
 * @route POST /api/auth/verify-otp
 * @desc Verify OTP and login
 * @access Public
 */
router.post('/verify-otp',
  authLimiter,
  body('phoneNumber')
    .trim()
    .matches(/^91[6-9]\d{9}$/)
    .withMessage('Invalid Indian phone number. Format: 919876543210'),
  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits'),
  handleValidationErrors,
  authController.verifyOTPLogin
);

/**
 * @route POST /api/auth/logout
 * @desc User logout
 * @access Private
 */
router.post('/logout', 
  authMiddleware.authenticateToken,
  authController.logout
);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh JWT token
 * @access Public
 */
router.post('/refresh',
  authLimiter,
  authController.refreshToken
);

/**
 * @route GET /api/auth/profile
 * @desc Get current user profile
 * @access Private
 */
router.get('/profile',
  authMiddleware.authenticateToken,
  authController.getProfile
);

/**
 * @route POST /api/auth/register
 * @desc Register new user (Admin only)
 * @access Private (Admin)
 */
router.post('/register',
  registerLimiter,
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('users.create'),
  registerValidation,
  handleValidationErrors,
  authController.register
);

/**
 * @route PUT /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.put('/change-password',
  authMiddleware.authenticateToken,
  changePasswordValidation,
  handleValidationErrors,
  authController.changePassword
);

/**
 * @route GET /api/auth/activity
 * @desc Get current user activity log
 * @access Private
 */
router.get('/activity',
  authMiddleware.authenticateToken,
  authController.getUserActivity
);

/**
 * @route GET /api/auth/activity/:userId
 * @desc Get specific user activity log
 * @access Private
 */
router.get('/activity/:userId',
  authMiddleware.authenticateToken,
  authController.getUserActivity
);

/**
 * @route GET /api/auth/verify
 * @desc Verify token validity
 * @access Private
 */
router.get('/verify',
  authMiddleware.authenticateToken,
  (req, res) => {
    res.json({
      success: true,
      message: 'Token is valid',
      user: {
        id: req.user.id,
        username: req.user.username,
        fullName: req.user.fullName,
        role: req.user.roleName,
        permissions: req.user.permissions
      }
    });
  }
);

/**
 * @route GET /api/auth/permissions
 * @desc Get user permissions
 * @access Private
 */
router.get('/permissions',
  authMiddleware.authenticateToken,
  (req, res) => {
    res.json({
      success: true,
      data: {
        permissions: req.user.permissions,
        role: req.user.roleName
      }
    });
  }
);

/**
 * @route POST /api/auth/check-permission
 * @desc Check if user has specific permission
 * @access Private
 */
router.post('/check-permission',
  authMiddleware.authenticateToken,
  (req, res) => {
    const { permission } = req.body;
    
    if (!permission) {
      return res.status(400).json({
        success: false,
        error: 'Permission parameter is required'
      });
    }

    const hasPermission = req.user.permissions.includes('*') || req.user.permissions.includes(permission);

    res.json({
      success: true,
      data: {
        hasPermission,
        permission,
        role: req.user.roleName
      }
    });
  }
);

/**
 * @route GET /api/auth/roles
 * @desc Get available roles (Admin only)
 * @access Private (Admin)
 */
router.get('/roles',
  authMiddleware.authenticateToken,
  authMiddleware.requirePermission('users.view'),
  (req, res) => {
    try {
      const authConfig = require('../config/auth');
      
      res.json({
        success: true,
        data: Object.values(authConfig.roles)
      });
    } catch (error) {
      console.error('Get roles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get roles'
      });
    }
  }
);

/**
 * @route GET /api/auth/session-status
 * @desc Get current session status and timeout information
 * @access Private
 */
router.get('/session-status',
  authMiddleware.authenticateToken,
  sessionTimeout.getSessionStatus
);

/**
 * @route POST /api/auth/extend-session
 * @desc Extend current session (reset idle timer)
 * @access Private
 */
router.post('/extend-session',
  authMiddleware.authenticateToken,
  sessionTimeout.extendSession
);

/**
 * @route GET /api/auth/health
 * @desc Authentication system health check
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Authentication system is healthy',
    timestamp: new Date().toISOString(),
    features: {
      jwt: true,
      rbac: true,
      sessions: true,
      rateLimit: true,
      activityLog: true,
      sessionTimeout: true,
      governmentCompliance: true
    },
    sessionConfig: {
      activeSessionTimeout: '30 minutes',
      idleSessionTimeout: '10 minutes', 
      maxSessionDuration: '2 hours',
      warningBeforeTimeout: '2 minutes'
    }
  });
});

module.exports = router;
