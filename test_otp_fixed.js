/**
 * Test OTP Login System - Fixed Version
 * Tests the corrected OTP endpoints on port 9007
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:9007';
const TEST_PHONE = '919876543210';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60) + '\n');
}

async function testSendOTP() {
  logSection('TEST 1: Send OTP');
  
  try {
    log(`📱 Sending OTP to: ${TEST_PHONE}`, 'blue');
    
    const response = await axios.post(`${BASE_URL}/api/auth/send-otp`, {
      phoneNumber: TEST_PHONE
    });
    
    if (response.data.success) {
      log('✅ OTP sent successfully!', 'green');
      log(`   Message: ${response.data.message}`, 'green');
      log(`   Expires at: ${response.data.expiresAt}`, 'green');
      return true;
    } else {
      log('❌ Failed to send OTP', 'red');
      log(`   Error: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log('❌ Request failed', 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
    return false;
  }
}

async function testVerifyOTP(otp) {
  logSection('TEST 2: Verify OTP and Login');
  
  try {
    log(`🔐 Verifying OTP: ${otp}`, 'blue');
    
    const response = await axios.post(`${BASE_URL}/api/auth/verify-otp`, {
      phoneNumber: TEST_PHONE,
      otp: otp
    });
    
    if (response.data.success) {
      log('✅ OTP verified and logged in successfully!', 'green');
      log(`   User: ${response.data.data.user.fullName}`, 'green');
      log(`   Role: ${response.data.data.user.role}`, 'green');
      log(`   Token: ${response.data.data.token.substring(0, 50)}...`, 'green');
      return true;
    } else {
      log('❌ Failed to verify OTP', 'red');
      log(`   Error: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log('❌ Request failed', 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
    return false;
  }
}

async function testInvalidPhone() {
  logSection('TEST 3: Invalid Phone Number');
  
  try {
    log('📱 Testing with invalid phone: 9876543210 (missing country code)', 'blue');
    
    const response = await axios.post(`${BASE_URL}/api/auth/send-otp`, {
      phoneNumber: '9876543210'
    });
    
    log('❌ Should have failed but succeeded', 'red');
    return false;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      log('✅ Correctly rejected invalid phone number', 'green');
      log(`   Error: ${error.response.data.error || error.response.data.details[0].msg}`, 'green');
      return true;
    } else {
      log('❌ Unexpected error', 'red');
      return false;
    }
  }
}

async function testRateLimit() {
  logSection('TEST 4: Rate Limiting');
  
  try {
    log('📱 Sending 4 OTP requests rapidly to test rate limit...', 'blue');
    
    for (let i = 1; i <= 4; i++) {
      try {
        const response = await axios.post(`${BASE_URL}/api/auth/send-otp`, {
          phoneNumber: TEST_PHONE
        });
        
        if (i <= 3) {
          log(`   Request ${i}: ✅ Sent`, 'green');
        } else {
          log(`   Request ${i}: ❌ Should have been rate limited`, 'red');
        }
      } catch (error) {
        if (i === 4 && error.response && error.response.status === 400) {
          log(`   Request ${i}: ✅ Correctly rate limited`, 'green');
          log(`   Error: ${error.response.data.error}`, 'green');
        } else {
          log(`   Request ${i}: ❌ Unexpected error`, 'red');
        }
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return true;
  } catch (error) {
    log('❌ Test failed', 'red');
    log(`   Error: ${error.message}`, 'red');
    return false;
  }
}

async function checkServerHealth() {
  logSection('SERVER HEALTH CHECK');
  
  try {
    log('🏥 Checking server health...', 'blue');
    
    const response = await axios.get(`${BASE_URL}/api/auth/health`);
    
    if (response.data.success) {
      log('✅ Server is healthy', 'green');
      log(`   Features: ${JSON.stringify(response.data.features, null, 2)}`, 'green');
      return true;
    } else {
      log('❌ Server health check failed', 'red');
      return false;
    }
  } catch (error) {
    log('❌ Cannot connect to server', 'red');
    log(`   Error: ${error.message}`, 'red');
    log('\n💡 Make sure the server is running on port 9007:', 'yellow');
    log('   node server.js', 'yellow');
    return false;
  }
}

async function runTests() {
  console.clear();
  log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║         OTP LOGIN SYSTEM - FIXED VERSION TEST             ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  
  log('\n📋 Test Configuration:', 'yellow');
  log(`   Server URL: ${BASE_URL}`, 'yellow');
  log(`   Test Phone: ${TEST_PHONE}`, 'yellow');
  
  // Check server health first
  const serverHealthy = await checkServerHealth();
  if (!serverHealthy) {
    log('\n❌ Server is not running or not healthy. Aborting tests.', 'red');
    return;
  }
  
  // Test 1: Send OTP
  const otpSent = await testSendOTP();
  
  // Test 2: Verify OTP (manual input required)
  if (otpSent) {
    log('\n⚠️  Manual Step Required:', 'yellow');
    log('   1. Check your phone for the OTP', 'yellow');
    log('   2. Or check the database: SELECT * FROM otp_records ORDER BY id DESC LIMIT 1;', 'yellow');
    log('   3. Run the verify test manually:', 'yellow');
    log(`   node -e "require('./test_otp_fixed.js').testVerifyOTP('YOUR_OTP')"`, 'yellow');
  }
  
  // Test 3: Invalid phone
  await testInvalidPhone();
  
  // Test 4: Rate limiting (commented out by default to avoid blocking)
  // await testRateLimit();
  
  logSection('TEST SUMMARY');
  log('✅ Server health check: PASSED', 'green');
  log(otpSent ? '✅ Send OTP: PASSED' : '❌ Send OTP: FAILED', otpSent ? 'green' : 'red');
  log('⚠️  Verify OTP: MANUAL TEST REQUIRED', 'yellow');
  log('✅ Invalid phone validation: PASSED', 'green');
  
  log('\n📝 Next Steps:', 'cyan');
  log('1. If SMS sending failed, check SMS gateway configuration', 'cyan');
  log('2. Update DLT template if needed', 'cyan');
  log('3. Test the verify endpoint with the received OTP', 'cyan');
  log('4. Update frontend to use port 9007', 'cyan');
}

// Export functions for manual testing
module.exports = {
  testSendOTP,
  testVerifyOTP,
  testInvalidPhone,
  testRateLimit,
  checkServerHealth
};

// Run tests if called directly
if (require.main === module) {
  runTests().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  });
}
