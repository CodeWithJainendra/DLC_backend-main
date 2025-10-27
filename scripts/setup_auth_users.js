#!/usr/bin/env node
/**
 * Setup Authentication Users
 * Creates authentication tables and initial users:
 * 1. Admin user with username/password
 * 2. OTP user with phone number
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

class AuthSetup {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'database.db');
    this.db = new Database(this.dbPath);
  }

  /**
   * Initialize all authentication tables
   */
  initializeTables() {
    console.log('📦 Creating authentication tables...\n');

    // Roles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        permissions TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created: roles');

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
        data_access_level VARCHAR(50) DEFAULT 'all',
        allowed_states TEXT,
        allowed_districts TEXT,
        is_active BOOLEAN DEFAULT 1,
        email_verified BOOLEAN DEFAULT 0,
        phone_verified BOOLEAN DEFAULT 1,
        last_login DATETIME,
        login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `);
    console.log('✅ Created: users');

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
    console.log('✅ Created: user_sessions');

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
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    console.log('✅ Created: user_activity_log');

    // OTP records table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS otp_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_no VARCHAR(15) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        generated_at DATETIME NOT NULL,
        expired_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT 0,
        verified_at DATETIME,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created: otp_records');

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_otp_contact ON otp_records(contact_no);
      CREATE INDEX IF NOT EXISTS idx_otp_expired ON otp_records(expired_at);
    `);
    console.log('✅ Created: indexes\n');
  }

  /**
   * Initialize default roles
   */
  initializeRoles() {
    console.log('👥 Creating roles...\n');

    const roles = [
      {
        id: 1,
        name: 'admin',
        permissions: JSON.stringify(['all']),
        description: 'Full system access'
      },
      {
        id: 2,
        name: 'manager',
        permissions: JSON.stringify(['read', 'write', 'analytics']),
        description: 'Manager with read/write access'
      },
      {
        id: 3,
        name: 'viewer',
        permissions: JSON.stringify(['read']),
        description: 'Read-only access'
      }
    ];

    const insertRole = this.db.prepare(`
      INSERT OR IGNORE INTO roles (id, name, permissions, description)
      VALUES (?, ?, ?, ?)
    `);

    roles.forEach(role => {
      insertRole.run(role.id, role.name, role.permissions, role.description);
      console.log(`✅ Role: ${role.name} (${role.description})`);
    });

    console.log('');
  }

  /**
   * Create admin user with username/password
   */
  async createAdminUser() {
    console.log('🔐 Creating admin user...\n');

    const username = 'admin';
    const password = 'Admin123!';
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const insertUser = this.db.prepare(`
        INSERT INTO users (
          username, password_hash, full_name, role_id, 
          is_active, email_verified, phone_verified, data_access_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertUser.run(
        username,
        passwordHash,
        'System Administrator',
        1, // admin role
        1, // is_active
        1, // email_verified
        0, // phone_verified
        'all' // data_access_level
      );

      console.log('✅ Admin user created successfully!');
      console.log(`   Username: ${username}`);
      console.log(`   Password: ${password}`);
      console.log(`   Role: admin`);
      console.log(`   User ID: ${result.lastInsertRowid}\n`);

      return result.lastInsertRowid;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        console.log('⚠️  Admin user already exists\n');
        return null;
      }
      throw error;
    }
  }

  /**
   * Create OTP user with phone number
   */
  createOTPUser() {
    console.log('📱 Creating OTP user...\n');

    const phoneNumber = '919675789818';
    const username = 'otp_user_9675789818';

    try {
      const insertUser = this.db.prepare(`
        INSERT INTO users (
          username, phone_number, full_name, role_id,
          is_active, email_verified, phone_verified, data_access_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertUser.run(
        username,
        phoneNumber,
        'OTP User',
        3, // viewer role
        1, // is_active
        0, // email_verified
        1, // phone_verified
        'all' // data_access_level
      );

      console.log('✅ OTP user created successfully!');
      console.log(`   Phone: ${phoneNumber}`);
      console.log(`   Username: ${username}`);
      console.log(`   Role: viewer`);
      console.log(`   User ID: ${result.lastInsertRowid}\n`);

      return result.lastInsertRowid;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        console.log('⚠️  OTP user already exists\n');
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a test OTP record for the OTP user
   */
  createTestOTP() {
    console.log('🔢 Creating test OTP...\n');

    const phoneNumber = '919675789818';
    const otpCode = '208016';
    const now = new Date();
    const expiredAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

    try {
      const insertOTP = this.db.prepare(`
        INSERT INTO otp_records (
          contact_no, otp_code, generated_at, expired_at, used
        ) VALUES (?, ?, ?, ?, ?)
      `);

      const result = insertOTP.run(
        phoneNumber,
        otpCode,
        now.toISOString(),
        expiredAt.toISOString(),
        0 // not used
      );

      console.log('✅ Test OTP created successfully!');
      console.log(`   Phone: ${phoneNumber}`);
      console.log(`   OTP: ${otpCode}`);
      console.log(`   Valid until: ${expiredAt.toLocaleString()}`);
      console.log(`   OTP ID: ${result.lastInsertRowid}\n`);

      return result.lastInsertRowid;
    } catch (error) {
      console.error('❌ Error creating test OTP:', error.message);
      throw error;
    }
  }

  /**
   * Display summary
   */
  displaySummary() {
    console.log('═'.repeat(60));
    console.log('📊 SETUP SUMMARY');
    console.log('═'.repeat(60));

    // Count tables
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

    console.log(`\n✅ Database: database.db`);
    console.log(`✅ Tables created: ${tables.length}`);
    tables.forEach(table => {
      console.log(`   - ${table.name}`);
    });

    // Count users
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
    console.log(`\n✅ Users created: ${userCount.count}`);

    const users = this.db.prepare(`
      SELECT u.username, u.phone_number, r.name as role 
      FROM users u 
      JOIN roles r ON u.role_id = r.id
    `).all();

    users.forEach(user => {
      if (user.phone_number) {
        console.log(`   - ${user.username} (${user.phone_number}) - Role: ${user.role}`);
      } else {
        console.log(`   - ${user.username} - Role: ${user.role}`);
      }
    });

    // Count OTP records
    const otpCount = this.db.prepare('SELECT COUNT(*) as count FROM otp_records').get();
    console.log(`\n✅ OTP records: ${otpCount.count}`);

    console.log('\n' + '═'.repeat(60));
    console.log('🎯 LOGIN CREDENTIALS');
    console.log('═'.repeat(60));
    
    console.log('\n1️⃣  Username/Password Login:');
    console.log('   Username: admin');
    console.log('   Password: Admin123!');
    
    console.log('\n2️⃣  OTP Login:');
    console.log('   Phone: 919675789818 (or 9675789818)');
    console.log('   OTP: 208016');
    console.log('   Valid for: 10 minutes');
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ Setup completed successfully!');
    console.log('═'.repeat(60) + '\n');
  }

  /**
   * Run the complete setup
   */
  async run() {
    try {
      console.log('\n' + '═'.repeat(60));
      console.log('🚀 DLC AUTHENTICATION SETUP');
      console.log('═'.repeat(60) + '\n');

      this.initializeTables();
      this.initializeRoles();
      await this.createAdminUser();
      this.createOTPUser();
      this.createTestOTP();
      this.displaySummary();

      this.db.close();
    } catch (error) {
      console.error('\n❌ Setup failed:', error.message);
      console.error(error.stack);
      this.db.close();
      process.exit(1);
    }
  }
}

// Run setup
const setup = new AuthSetup();
setup.run();
