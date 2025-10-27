#!/usr/bin/env node
/**
 * Test Unified Login Endpoint
 * Tests both username/password and phone/OTP login
 */

const axios = require('axios');

const API_BASE = 'http://localhost:9007/api/auth';

async function testUsernamePasswordLogin() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Username/Password Login');
  console.log('='.repeat(60));

  try {
    const response = await axios.post(`${API_BASE}/login`, {
      username: 'admin',
      password: 'Admin123!'
    });

    console.log('✅ Login successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data.data.token;
  } catch (error) {
    console.log('❌ Login failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return null;
  }
}

async function testOTPLogin() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: OTP Login');
  console.log('='.repeat(60));

  try {
    const response = await axios.post(`${API_BASE}/login`, {
      phoneNumber: '9675789818',
      otp: '208016'
    });

    console.log('✅ OTP Login successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data.data.token;
  } catch (error) {
    console.log('❌ OTP Login failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
    return null;
  }
}

async function testInvalidLogin() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Invalid Login (should fail)');
  console.log('='.repeat(60));

  try {
    const response = await axios.post(`${API_BASE}/login`, {
      username: 'admin',
      password: 'wrongpassword'
    });

    console.log('❌ Should have failed but succeeded');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('✅ Correctly rejected invalid credentials');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error);
    }
  }
}

async function testMissingCredentials() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Missing Credentials (should fail)');
  console.log('='.repeat(60));

  try {
    const response = await axios.post(`${API_BASE}/login`, {});

    console.log('❌ Should have failed but succeeded');
  } catch (error) {
    console.log('✅ Correctly rejected missing credentials');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error);
    }
  }
}

async function testTokenVerification(token) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Token Verification');
  console.log('='.repeat(60));

  if (!token) {
    console.log('⚠️  No token to verify');
    return;
  }

  try {
    const response = await axios.get(`${API_BASE}/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Token is valid!');
    console.log('User:', JSON.stringify(response.data.user, null, 2));
  } catch (error) {
    console.log('❌ Token verification failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.error);
    }
  }
}

async function runAllTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 UNIFIED LOGIN API TESTS');
  console.log('═'.repeat(60));
  console.log(`API Base: ${API_BASE}`);
  console.log('═'.repeat(60));

  // Test 1: Username/Password Login
  const passwordToken = await testUsernamePasswordLogin();

  // Test 2: OTP Login
  const otpToken = await testOTPLogin();

  // Test 3: Invalid Login
  await testInvalidLogin();

  // Test 4: Missing Credentials
  await testMissingCredentials();

  // Test 5: Token Verification
  if (passwordToken) {
    await testTokenVerification(passwordToken);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ ALL TESTS COMPLETED');
  console.log('═'.repeat(60) + '\n');
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  process.exit(1);
});
