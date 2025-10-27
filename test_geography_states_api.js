#!/usr/bin/env node
/**
 * Test script for Geography States API
 * Tests the comprehensive state-wise data endpoint
 */

const axios = require('axios');

const API_URL = 'http://localhost:9007/api/pension/geography/states';

async function testAPI() {
  console.log('='.repeat(80));
  console.log('Testing Geography States API');
  console.log('='.repeat(80));
  console.log(`\nAPI URL: ${API_URL}\n`);

  try {
    const response = await axios.get(API_URL);
    const data = response.data;

    if (!data.success) {
      console.error('❌ API returned success: false');
      console.error('Error:', data.message || data.error);
      return;
    }

    console.log('✅ API Response Successful\n');
    
    // Display Summary
    console.log('📊 SUMMARY');
    console.log('-'.repeat(80));
    console.log(`Total Pensioners:  ${data.summary.totalPensioners.toLocaleString()}`);
    console.log(`Total DLC:         ${data.summary.totalDLC.toLocaleString()}`);
    console.log(`Total States:      ${data.summary.totalStates}`);
    console.log(`Total Districts:   ${data.summary.totalDistricts.toLocaleString()}`);
    console.log(`Total Pincodes:    ${data.summary.totalPincodes.toLocaleString()}`);
    console.log(`DLC Percentage:    ${data.summary.dlcPercentage}%`);
    
    // Display Top 10 States
    console.log('\n📍 TOP 10 STATES (by Pensioner Count)');
    console.log('-'.repeat(80));
    console.log(
      'State'.padEnd(25) + 
      'Pensioners'.padStart(12) + 
      'DLC'.padStart(10) + 
      'Districts'.padStart(10) + 
      'Pincodes'.padStart(10)
    );
    console.log('-'.repeat(80));
    
    data.states.slice(0, 10).forEach((state, index) => {
      console.log(
        `${(index + 1).toString().padStart(2)}. ${state.state.padEnd(22)}` +
        state.totalPensioners.toLocaleString().padStart(12) +
        state.totalDLC.toString().padStart(10) +
        state.totalDistricts.toString().padStart(10) +
        state.totalPincodes.toString().padStart(10)
      );
    });
    
    // Display Age Categories for Top 5 States
    console.log('\n👥 AGE CATEGORIES - TOP 5 STATES');
    console.log('-'.repeat(80));
    
    data.states.slice(0, 5).forEach((state, index) => {
      console.log(`\n${index + 1}. ${state.state} (Total: ${state.totalPensioners.toLocaleString()})`);
      console.log('   Age Categories:');
      const categories = state.ageCategories;
      const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
      
      Object.entries(categories).forEach(([category, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        console.log(`   - ${category.padEnd(8)}: ${count.toLocaleString().padStart(10)} (${percentage}%)`);
      });
      
      if (total === 0) {
        console.log('   ⚠️  No age category data available');
      }
    });
    
    // Metadata
    console.log('\n📝 METADATA');
    console.log('-'.repeat(80));
    console.log(`Databases Processed: ${data.metadata.databases_processed}`);
    console.log(`Query Time:          ${data.metadata.query_time}`);
    console.log(`Timestamp:           ${data.timestamp}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Test Completed Successfully');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ API Request Failed');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testAPI();
