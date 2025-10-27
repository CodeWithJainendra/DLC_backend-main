/**
 * Authentication Configuration
 * JWT and Role-based Access Control Configuration
 */

const crypto = require('crypto');

const authConfig = {
  // JWT Configuration (Government Portal Standards)
  jwt: {
    secret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
    expiresIn: '30m',        // 30 minutes (government standard)
    refreshExpiresIn: '2h',  // 2 hours maximum session
    algorithm: 'HS256',
    issuer: 'dlc-pension-dashboard',
    audience: 'pension-users'
  },

  // Password Configuration
  password: {
    saltRounds: 12,
    minLength: 8,
    requireSpecialChar: true,
    requireNumber: true,
    requireUppercase: true
  },

  // Session Configuration (Government Portal Standards)
  session: {
    maxConcurrentSessions: 2, // Reduced for security
    activeSessionTimeout: 30 * 60 * 1000, // 30 minutes with activity
    idleSessionTimeout: 10 * 60 * 1000,   // 10 minutes of inactivity
    maxSessionDuration: 2 * 60 * 60 * 1000, // 2 hours absolute maximum
    refreshThreshold: 5 * 60 * 1000,      // 5 minutes before expiry
    warningBeforeTimeout: 2 * 60 * 1000   // 2 minutes warning
  },

  // Role Definitions
  roles: {
    SUPER_ADMIN: {
      id: 1,
      name: 'Super Admin',
      permissions: ['*'], // All permissions
      description: 'Full system access'
    },
    ADMIN: {
      id: 2,
      name: 'Admin',
      permissions: [
        'users.view', 'users.create', 'users.update', 'users.delete',
        'data.view', 'data.export', 'data.analytics',
        'sbi.view', 'sbi.manage', 'scheduler.manage',
        'reports.view', 'reports.generate'
      ],
      description: 'Administrative access'
    },
    MANAGER: {
      id: 3,
      name: 'Manager',
      permissions: [
        'data.view', 'data.export', 'data.analytics',
        'sbi.view', 'reports.view', 'reports.generate'
      ],
      description: 'Management level access'
    },
    ANALYST: {
      id: 4,
      name: 'Data Analyst',
      permissions: [
        'data.view', 'data.analytics', 'reports.view'
      ],
      description: 'Data analysis access'
    },
    VIEWER: {
      id: 5,
      name: 'Viewer',
      permissions: [
        'data.view', 'reports.view'
      ],
      description: 'Read-only access'
    }
  },

  // Department/Organization Mapping
  departments: {
    CPAO: 'Central Pension Accounting Office',
    RAILWAY: 'Railway Pension',
    AUTONOMOUS: 'Autonomous Bodies',
    STATE_GOVT: 'State Government',
    CENTRAL_GOVT: 'Central Government',
    PSU: 'Public Sector Undertaking'
  },

  // Data Access Levels
  dataAccess: {
    ALL_INDIA: 'all_states',
    STATE_LEVEL: 'state_specific',
    DISTRICT_LEVEL: 'district_specific',
    BRANCH_LEVEL: 'branch_specific'
  }
};

module.exports = authConfig;
