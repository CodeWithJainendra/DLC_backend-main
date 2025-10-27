#!/usr/bin/env node

/**
 * Script to create a new test user with known credentials
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

class NewUserCreator {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'database.db');
    this.db = null;
  }

  async connectDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(new Error(`Failed to connect to database: ${err.message}`));
          return;
        }
        console.log('✅ Connected to database');
        resolve();
      });
    });
  }

  async createNewUser() {
    try {
      await this.connectDatabase();
      
      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash('newuser123', saltRounds);
      
      // Define user data
      const userData = {
        username: 'newuser2',
        email: 'newuser2@example.com',
        password_hash: passwordHash,
        full_name: 'New User 2',
        role_id: 2, // Admin role (has SBI permissions)
        department: 'Testing',
        data_access_level: 'all_states',
        allowed_states: JSON.stringify([]), // Empty array means no restrictions
        is_active: 1,
        email_verified: 1,
        created_by: 1
      };
      
      // Insert user
      const insertStmt = this.db.prepare(`
        INSERT INTO users (
          username, email, password_hash, full_name, role_id, department,
          data_access_level, allowed_states, is_active, email_verified, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = insertStmt.run(
        userData.username,
        userData.email,
        userData.password_hash,
        userData.full_name,
        userData.role_id,
        userData.department,
        userData.data_access_level,
        userData.allowed_states,
        userData.is_active,
        userData.email_verified,
        userData.created_by
      );
      
      console.log(`✅ Created new user with ID: ${result.lastID}`);
      return result.lastID;
      
    } catch (error) {
      console.error('❌ Failed to create new user:', error.message);
      throw error;
    } finally {
      if (this.db) {
        this.db.close();
      }
    }
  }
}

// Run the script
async function main() {
  const creator = new NewUserCreator();
  
  try {
    const userId = await creator.createNewUser();
    console.log('\n📝 New User Credentials:');
    console.log('Username: newuser2');
    console.log('Password: newuser123');
    console.log('User ID:', userId);
    console.log('\n💡 To get an authentication token, make a POST request to:');
    console.log('POST http://localhost:9007/api/auth/login');
    console.log('Body: { "username": "newuser2", "password": "newuser123" }');
    console.log('\n🔐 Then use the returned token in the Authorization header:');
    console.log('Authorization: Bearer <your_token_here>');
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = NewUserCreator;