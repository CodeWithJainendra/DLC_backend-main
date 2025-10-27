#!/usr/bin/env node
/**
 * Create or update admin user with specific credentials
 */

const UserModel = require('./models/User');

async function createAdminUser() {
  console.log('🔧 Creating/Updating Admin User...');
  
  try {
    const userModel = new UserModel();
    
    // Check if admin user exists
    const existingAdmin = userModel.getUserByUsername('admin');
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      console.log('   ID:', existingAdmin.id);
      console.log('   Username:', existingAdmin.username);
      console.log('   Full Name:', existingAdmin.full_name);
      
      // Update password to Admin123!
      const bcrypt = require('bcryptjs');
      const newPassword = 'Admin123!';
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      const db = userModel.db;
      const updateStmt = db.prepare(`
        UPDATE users 
        SET password_hash = ?, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE username = ?
      `);
      
      updateStmt.run(hashedPassword, 'admin');
      
      console.log('✅ Password updated successfully');
      console.log('   New Password: Admin123!');
      
    } else {
      // Create new admin user
      const result = await userModel.createUser({
        username: 'admin',
        email: 'admin@dlc-pension.gov.in',
        password: 'Admin123!',
        fullName: 'System Administrator',
        roleId: 1, // Super Admin
        department: 'CPAO',
        dataAccessLevel: 'all_states',
        allowedStates: [],
        allowedDistricts: [],
        createdBy: null
      });
      
      if (result.success) {
        console.log('✅ Admin user created successfully');
        console.log('   Username: admin');
        console.log('   Password: Admin123!');
      } else {
        console.error('❌ Failed to create admin user:', result.error);
      }
    }
    
    console.log('\n📋 Login Credentials:');
    console.log('   Username: admin');
    console.log('   Password: Admin123!');
    console.log('\n🚀 Test Login:');
    console.log('   curl -X POST http://localhost:9007/api/auth/login \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"username":"admin","password":"Admin123!"}\'');
    
    userModel.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createAdminUser();
