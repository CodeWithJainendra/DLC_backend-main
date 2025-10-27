/**
 * Example usage of the SBI Integration
 * 
 * This file demonstrates how to use the SBI integration to fetch data from SBI's API.
 */

const axios = require('axios');

/**
 * Example 1: Get Batch ID from SBI
 */
async function getBatchIdExample() {
    console.log('=== Example 1: Get Batch ID ===');
    
    try {
        // Prepare the request data
        const requestData = {
            state: 'UTTAR PRADESH',  // Example state
            date: '25-09-2025'       // Example date
        };
        
        console.log('Requesting batch ID for:', requestData);
        
        // Make the API call
        const response = await axios.post('http://localhost:3005/api/sbi/batch-id', requestData);
        
        console.log('Response from SBI:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('Error getting batch ID:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
    
    console.log();
}

/**
 * Example 2: Fetch Verification Records from SBI
 */
async function fetchVerificationRecordsExample() {
    console.log('=== Example 2: Fetch Verification Records ===');
    
    try {
        // Prepare the request data
        const requestData = {
            state: 'UTTAR PRADESH',  // Example state
            date: '25-09-2025',      // Example date
            batchId: '1'             // Example batch ID (optional)
        };
        
        console.log('Requesting verification records for:', requestData);
        
        // Make the API call
        const response = await axios.post('http://localhost:3005/api/sbi/verification-records', requestData);
        
        console.log('Response from SBI:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('Error fetching verification records:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
    
    console.log();
}

/**
 * Example 3: Prepare Request (for debugging purposes)
 */
async function prepareRequestExample() {
    console.log('=== Example 3: Prepare Request ===');
    
    try {
        // Prepare the request data
        const requestData = {
            eisPayload: {
                "REQEST_REFERENCE_NUMBER": "CPPCDOPP273202569452665",
                "REQUEST_TYPE": "Batch_ID",
                "STATE": "NCT OF DELHI",
                "REQ_DATE": "05-09-2025"
            },
            txnType: 'DLC',
            txnSubType: 'GET_BATCHID'
        };
        
        console.log('Preparing request with:', requestData);
        
        // Make the API call
        const response = await axios.post('http://localhost:3005/api/sbi/prepare-request', requestData);
        
        console.log('Prepared request:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('Error preparing request:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
    
    console.log();
}

/**
 * Run all examples
 */
async function runExamples() {
    console.log('DLC Portal SBI Integration Examples');
    console.log('====================================');
    console.log();
    
    // Show server health
    try {
        const health = await axios.get('http://localhost:3005/health');
        console.log('Server health:', health.data.status);
        console.log();
    } catch (error) {
        console.error('Server is not running. Please start the server first:');
        console.error('  node dlc-server.js');
        console.log();
        return;
    }
    
    // Run examples
    await prepareRequestExample();
    // Note: Uncomment the following lines to actually call SBI's API
    // await getBatchIdExample();
    // await fetchVerificationRecordsExample();
    
    console.log('=== Examples completed ===');
}

// Run the examples if this file is executed directly
if (require.main === module) {
    runExamples();
}

module.exports = {
    getBatchIdExample,
    fetchVerificationRecordsExample,
    prepareRequestExample,
    runExamples
};