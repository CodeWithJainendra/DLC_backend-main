/**
 * Authentication Setup Script
 * Initialize authentication system with default admin user
 */

const UserModel = require('../models/User');
const authConfig = require('../config/auth');

async function setupAuthentication() {
  console.log('🔧 Setting up authentication system...');
  
  try {
    const userModel = new UserModel();
    
    console.log('✅ Database tables initialized');
    console.log('✅ Default roles created');
    
    // Check if admin user exists
    const existingAdmin = userModel.getUserByUsername('admin');
    
    if (!existingAdmin) {
      // Create default admin user
      const adminResult = await userModel.createUser({
        username: 'admin',
        email: 'admin@dlc-pension.gov.in',
        password: 'Admin@123456', // Change this in production!
        fullName: 'System Administrator',
        roleId: 1, // Super Admin
        department: 'CPAO',
        dataAccessLevel: 'all_states',
        allowedStates: [], // Empty means all states
        allowedDistricts: [],
        createdBy: null
      });
      
      if (adminResult.success) {
        console.log('✅ Default admin user created');
        console.log('   Username: admin');
        console.log('   Password: Admin@123456');
        console.log('   ⚠️  CHANGE PASSWORD IMMEDIATELY IN PRODUCTION!');
      } else {
        console.error('❌ Failed to create admin user:', adminResult.error);
      }
    } else {
      console.log('✅ Admin user already exists');
    }
    
    // Create sample users for different roles
    const sampleUsers = [
      {
        username: 'manager1',
        email: 'manager@dlc-pension.gov.in',
        password: 'Manager@123',
        fullName: 'DLC Manager',
        roleId: 3, // Manager
        department: 'CPAO',
        dataAccessLevel: 'state_specific',
        allowedStates: ['NCT OF DELHI', 'UTTAR PRADESH']
      },
      {
        username: 'analyst1',
        email: 'analyst@dlc-pension.gov.in',
        password: 'Analyst@123',
        fullName: 'Data Analyst',
        roleId: 4, // Analyst
        department: 'CPAO',
        dataAccessLevel: 'state_specific',
        allowedStates: ['NCT OF DELHI']
      },
      {
        username: 'viewer1',
        email: 'viewer@dlc-pension.gov.in',
        password: 'Viewer@123',
        fullName: 'Report Viewer',
        roleId: 5, // Viewer
        department: 'RAILWAY',
        dataAccessLevel: 'state_specific',
        allowedStates: ['MAHARASHTRA']
      }
    ];
    
    for (const userData of sampleUsers) {
      const existing = userModel.getUserByUsername(userData.username);
      if (!existing) {
        const result = await userModel.createUser({
          ...userData,
          createdBy: 1 // Created by admin
        });
        
        if (result.success) {
          console.log(`✅ Sample user created: ${userData.username} (${userData.fullName})`);
        }
      }
    }
    
    console.log('\n🎉 Authentication system setup complete!');
    console.log('\n📋 Available Users:');
    console.log('   admin (Super Admin) - Full access');
    console.log('   manager1 (Manager) - Delhi & UP data');
    console.log('   analyst1 (Analyst) - Delhi data only');
    console.log('   viewer1 (Viewer) - Maharashtra data only');
    
    console.log('\n🔐 Available Roles:');
    Object.values(authConfig.roles).forEach(role => {
      console.log(`   ${role.name}: ${role.description}`);
    });
    
    console.log('\n🚀 API Endpoints:');
    console.log('   POST /api/auth/login - User login');
    console.log('   GET /api/auth/profile - Get user profile');
    console.log('   POST /api/auth/logout - User logout');
    console.log('   POST /api/auth/register - Register new user (Admin only)');
    console.log('   GET /api/auth/health - System health check');
    
    userModel.close();
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupAuthentication();
}

module.exports = { setupAuthentication };
