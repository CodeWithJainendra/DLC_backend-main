/**
 * User Model
 * Database schema and operations for user management
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authConfig = require('../config/auth');

class UserModel {
  constructor(dbPath = './database.db') {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  /**
   * Initialize user-related database tables
   */
  initializeTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone_number VARCHAR(15) UNIQUE,
        password_hash VARCHAR(255),
        full_name VARCHAR(100) NOT NULL,
        role_id INTEGER NOT NULL,
        department VARCHAR(50),
        data_access_level VARCHAR(50) DEFAULT 'state_specific',
        allowed_states TEXT, -- JSON array of allowed state codes
        allowed_districts TEXT, -- JSON array of allowed district codes
        is_active BOOLEAN DEFAULT 1,
        email_verified BOOLEAN DEFAULT 0,
        phone_verified BOOLEAN DEFAULT 0,
        last_login DATETIME,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (role_id) REFERENCES roles(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Roles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        permissions TEXT NOT NULL, -- JSON array of permissions
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        refresh_token VARCHAR(255) UNIQUE NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // User activity log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100),
        ip_address VARCHAR(45),
        user_agent TEXT,
        success BOOLEAN DEFAULT 1,
        error_message TEXT,
        metadata TEXT, -- JSON for additional data
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Initialize default roles
    this.initializeDefaultRoles();
    
    // Create indexes for performance
    this.createIndexes();
  }

  /**
   * Create database indexes for better performance
   */
  createIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_action ON user_activity_log(action);
    `);
  }

  /**
   * Initialize default roles from config
   */
  initializeDefaultRoles() {
    const insertRole = this.db.prepare(`
      INSERT OR IGNORE INTO roles (id, name, permissions, description)
      VALUES (?, ?, ?, ?)
    `);

    Object.values(authConfig.roles).forEach(role => {
      insertRole.run(
        role.id,
        role.name,
        JSON.stringify(role.permissions),
        role.description
      );
    });
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    const {
      username,
      email,
      password,
      fullName,
      roleId,
      department,
      dataAccessLevel = 'state_specific',
      allowedStates = [],
      allowedDistricts = [],
      createdBy
    } = userData;

    // Hash password
    const passwordHash = await bcrypt.hash(password, authConfig.password.saltRounds);

    const stmt = this.db.prepare(`
      INSERT INTO users (
        username, email, password_hash, full_name, role_id, department,
        data_access_level, allowed_states, allowed_districts, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        username,
        email,
        passwordHash,
        fullName,
        roleId,
        department,
        dataAccessLevel,
        JSON.stringify(allowedStates),
        JSON.stringify(allowedDistricts),
        createdBy
      );

      return { success: true, userId: result.lastInsertRowid };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { success: false, error: 'Username or email already exists' };
      }
      throw error;
    }
  }

  /**
   * Authenticate user
   */
  async authenticateUser(username, password, ipAddress, userAgent) {
    const user = this.getUserByUsername(username);
    
    if (!user) {
      this.logActivity(null, 'login_failed', 'authentication', ipAddress, userAgent, false, 'User not found');
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      this.logActivity(user.id, 'login_failed', 'authentication', ipAddress, userAgent, false, 'Account locked');
      return { success: false, error: 'Account is temporarily locked' };
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      this.incrementLoginAttempts(user.id);
      this.logActivity(user.id, 'login_failed', 'authentication', ipAddress, userAgent, false, 'Invalid password');
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if user is active
    if (!user.is_active) {
      this.logActivity(user.id, 'login_failed', 'authentication', ipAddress, userAgent, false, 'Account inactive');
      return { success: false, error: 'Account is inactive' };
    }

    // Reset login attempts and update last login
    this.resetLoginAttempts(user.id);
    this.updateLastLogin(user.id);
    this.logActivity(user.id, 'login_success', 'authentication', ipAddress, userAgent, true);

    return { success: true, user: this.sanitizeUser(user) };
  }

  /**
   * Get user by username
   */
  getUserByUsername(username) {
    const stmt = this.db.prepare(`
      SELECT u.*, r.name as role_name, r.permissions as role_permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.username = ?
    `);
    return stmt.get(username);
  }

  /**
   * Get user by ID with role information
   */
  getUserById(userId) {
    const stmt = this.db.prepare(`
      SELECT u.*, r.name as role_name, r.permissions as role_permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `);
    return stmt.get(userId);
  }

  /**
   * Create user session
   */
  createSession(userId, sessionToken, refreshToken, ipAddress, userAgent, expiresAt) {
    const stmt = this.db.prepare(`
      INSERT INTO user_sessions (user_id, session_token, refresh_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(userId, sessionToken, refreshToken, ipAddress, userAgent, expiresAt);
  }

  /**
   * Get valid session
   */
  getValidSession(sessionToken) {
    const stmt = this.db.prepare(`
      SELECT s.*, u.username, u.full_name, u.role_id, r.name as role_name, r.permissions as role_permissions
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE s.session_token = ? AND s.is_active = 1 AND s.expires_at > datetime('now')
    `);
    
    return stmt.get(sessionToken);
  }

  /**
   * Invalidate session
   */
  invalidateSession(sessionToken) {
    const stmt = this.db.prepare(`
      UPDATE user_sessions SET is_active = 0 WHERE session_token = ?
    `);
    
    return stmt.run(sessionToken);
  }

  /**
   * Log user activity
   */
  logActivity(userId, action, resource, ipAddress, userAgent, success = true, errorMessage = null, metadata = null) {
    const stmt = this.db.prepare(`
      INSERT INTO user_activity_log (user_id, action, resource, ip_address, user_agent, success, error_message, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(userId, action, resource, ipAddress, userAgent, success ? 1 : 0, errorMessage, metadata ? JSON.stringify(metadata) : null);
  }

  /**
   * Increment login attempts
   */
  incrementLoginAttempts(userId) {
    const stmt = this.db.prepare(`
      UPDATE users 
      SET login_attempts = login_attempts + 1,
          locked_until = CASE 
            WHEN login_attempts >= 4 THEN datetime('now', '+30 minutes')
            ELSE locked_until
          END
      WHERE id = ?
    `);
    
    stmt.run(userId);
  }

  /**
   * Reset login attempts
   */
  resetLoginAttempts(userId) {
    const stmt = this.db.prepare(`
      UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?
    `);
    
    stmt.run(userId);
  }

  /**
   * Update last login
   */
  updateLastLogin(userId) {
    const stmt = this.db.prepare(`
      UPDATE users SET last_login = datetime('now') WHERE id = ?
    `);
    
    stmt.run(userId);
  }

  /**
   * Remove sensitive data from user object
   */
  sanitizeUser(user) {
    const { password_hash, login_attempts, locked_until, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Get all users (admin function)
   */
  getAllUsers(limit = 100, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT u.id, u.username, u.email, u.full_name, u.role_id, r.name as role_name,
             u.department, u.data_access_level, u.is_active, u.last_login, u.created_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `);
    
    return stmt.all(limit, offset);
  }

  /**
   * Check if user has permission
   */
  hasPermission(user, permission) {
    if (!user.role_permissions) return false;
    
    const permissions = JSON.parse(user.role_permissions);
    
    // Super admin has all permissions
    if (permissions.includes('*')) return true;
    
    // Check specific permission
    return permissions.includes(permission);
  }

  /**
   * Check if user can access state data
   */
  canAccessState(user, stateCode) {
    if (user.data_access_level === 'all_states') return true;
    
    if (user.allowed_states) {
      const allowedStates = JSON.parse(user.allowed_states);
      return allowedStates.includes(stateCode);
    }
    
    return false;
  }

  /**
   * Get user by phone number
   */
  getUserByPhone(phoneNumber) {
    const stmt = this.db.prepare(`
      SELECT u.*, r.name as role_name, r.permissions as role_permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.phone_number = ? AND u.is_active = 1
    `);
    
    return stmt.get(phoneNumber);
  }

  /**
   * Create user by phone number (for OTP-based registration)
   */
  async createUserByPhone(userData) {
    const {
      phoneNumber,
      fullName,
      roleId,
      createdBy
    } = userData;

    try {
      // Generate unique username from phone number
      const username = `user_${phoneNumber.substring(phoneNumber.length - 10)}`;

      const stmt = this.db.prepare(`
        INSERT INTO users (
          username, phone_number, full_name, role_id, 
          phone_verified, created_by, data_access_level
        )
        VALUES (?, ?, ?, ?, 1, ?, 'all')
      `);

      const result = stmt.run(
        username,
        phoneNumber,
        fullName,
        roleId,
        createdBy
      );

      return {
        success: true,
        userId: result.lastInsertRowid
      };

    } catch (error) {
      console.error('Create user by phone error:', error);
      
      if (error.message.includes('UNIQUE constraint')) {
        return {
          success: false,
          error: 'Phone number already registered'
        };
      }

      return {
        success: false,
        error: 'Failed to create user'
      };
    }
  }

  /**
   * Update last login timestamp
   */
  updateLastLogin(userId) {
    const stmt = this.db.prepare(`
      UPDATE users 
      SET last_login = datetime('now'), login_attempts = 0
      WHERE id = ?
    `);
    
    stmt.run(userId);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = UserModel;
