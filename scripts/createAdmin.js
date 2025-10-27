/**
 * Create Admin User Script
 * Interactive script to create admin users in production
 */

const readline = require('readline');
const UserModel = require('../models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function hidePassword(query) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    
    let password = '';
    process.stdout.write(query);
    
    stdin.on('data', function(char) {
      char = char + '';
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += char;
          process.stdout.write('*');
          break;
      }
    });
  });
}

async function createAdminUser() {
  console.log('🔐 DLC Pension Dashboard - Admin User Creation\n');
  
  try {
    const userModel = new UserModel();
    
    console.log('Please provide the following information:\n');
    
    const username = await question('Username: ');
    const email = await question('Email: ');
    const fullName = await question('Full Name: ');
    const department = await question('Department (CPAO/RAILWAY/AUTONOMOUS): ');
    
    const password = await hidePassword('Password (min 8 chars, uppercase, lowercase, number, special): ');
    const confirmPassword = await hidePassword('Confirm Password: ');
    
    // Validation
    if (!username || !email || !fullName || !password) {
      console.log('❌ All fields are required');
      process.exit(1);
    }
    
    if (password !== confirmPassword) {
      console.log('❌ Passwords do not match');
      process.exit(1);
    }
    
    if (password.length < 8) {
      console.log('❌ Password must be at least 8 characters');
      process.exit(1);
    }
    
    // Check if username exists
    const existingUser = userModel.getUserByUsername(username);
    if (existingUser) {
      console.log('❌ Username already exists');
      process.exit(1);
    }
    
    // Create admin user
    const result = await userModel.createUser({
      username,
      email,
      password,
      fullName,
      roleId: 1, // Super Admin
      department: department || 'CPAO',
      dataAccessLevel: 'all_states',
      allowedStates: [],
      allowedDistricts: [],
      createdBy: null
    });
    
    if (result.success) {
      console.log('\n✅ Admin user created successfully!');
      console.log(`   User ID: ${result.userId}`);
      console.log(`   Username: ${username}`);
      console.log(`   Role: Super Admin`);
      console.log(`   Data Access: All States`);
      console.log('\n🔐 User can now login with these credentials');
    } else {
      console.log('❌ Failed to create user:', result.error);
    }
    
    userModel.close();
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  }
  
  rl.close();
}

// Show available roles
async function showRoles() {
  console.log('\n📋 Available Roles:');
  console.log('   1. Super Admin - Full system access');
  console.log('   2. Admin - Administrative access');
  console.log('   3. Manager - Management level access');
  console.log('   4. Data Analyst - Data analysis access');
  console.log('   5. Viewer - Read-only access\n');
}

async function createCustomUser() {
  console.log('🔐 DLC Pension Dashboard - Custom User Creation\n');
  
  try {
    const userModel = new UserModel();
    
    await showRoles();
    
    const username = await question('Username: ');
    const email = await question('Email: ');
    const fullName = await question('Full Name: ');
    const roleId = await question('Role ID (1-5): ');
    const department = await question('Department (CPAO/RAILWAY/AUTONOMOUS): ');
    const dataAccessLevel = await question('Data Access (all_states/state_specific): ');
    
    let allowedStates = [];
    if (dataAccessLevel === 'state_specific') {
      const statesInput = await question('Allowed States (comma-separated, e.g., NCT OF DELHI,UTTAR PRADESH): ');
      allowedStates = statesInput.split(',').map(s => s.trim()).filter(s => s);
    }
    
    const password = await hidePassword('Password: ');
    const confirmPassword = await hidePassword('Confirm Password: ');
    
    // Validation
    if (password !== confirmPassword) {
      console.log('❌ Passwords do not match');
      process.exit(1);
    }
    
    const result = await userModel.createUser({
      username,
      email,
      password,
      fullName,
      roleId: parseInt(roleId),
      department: department || 'CPAO',
      dataAccessLevel: dataAccessLevel || 'state_specific',
      allowedStates,
      allowedDistricts: [],
      createdBy: null
    });
    
    if (result.success) {
      console.log('\n✅ User created successfully!');
      console.log(`   User ID: ${result.userId}`);
      console.log(`   Username: ${username}`);
      console.log(`   Role ID: ${roleId}`);
      console.log(`   Data Access: ${dataAccessLevel}`);
      if (allowedStates.length > 0) {
        console.log(`   Allowed States: ${allowedStates.join(', ')}`);
      }
    } else {
      console.log('❌ Failed to create user:', result.error);
    }
    
    userModel.close();
    
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
  }
  
  rl.close();
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--custom')) {
    await createCustomUser();
  } else {
    await createAdminUser();
  }
}

if (require.main === module) {
  main();
}

module.exports = { createAdminUser, createCustomUser };
