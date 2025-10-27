/**
 * SBI UAT API Testing Script
 * Tests both GET_BATCHID and FETCH_RECORDS endpoints
 * Based on email from SBI dated 30 September 2025
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const SBIEncryption = require('./sbi-encryption');

// Load certificates from parent directory
const sbiCertPath = path.join(__dirname, '..', 'certificates', 'ENC_EIS_UAT.cer');
const ourPrivateKeyPath = path.join(__dirname, '..', 'certificates', 'samar.iitk.ac.in.key');

if (!fs.existsSync(sbiCertPath)) {
    console.error('❌ SBI certificate not found at:', sbiCertPath);
    process.exit(1);
}

if (!fs.existsSync(ourPrivateKeyPath)) {
    console.error('❌ Our private key not found at:', ourPrivateKeyPath);
    process.exit(1);
}

const sbiCertificate = fs.readFileSync(sbiCertPath, 'utf8');
const ourPrivateKey = fs.readFileSync(ourPrivateKeyPath, 'utf8');

// Initialize encryption
const sbiEncryption = new SBIEncryption(sbiCertificate, ourPrivateKey);

// UAT Configuration from email
const UAT_CONFIG = {
    url: 'eissiwebuat.sbi.bank.in',
    port: 443,
    path: '/gen6/gateway/thirdParty/wrapper/services',
    sourceId: 'DQ'
};

/**
 * Make HTTPS request to SBI UAT API
 */
function makeRequest(requestData, accessToken) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(requestData);
        
        const options = {
            hostname: UAT_CONFIG.url,
            port: UAT_CONFIG.port,
            path: UAT_CONFIG.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'AccessToken': accessToken
            },
            rejectUnauthorized: false // For UAT testing
        };

        console.log('\n📤 Request Details:');
        console.log('URL:', `https://${options.hostname}:${options.port}${options.path}`);
        console.log('Headers:', JSON.stringify(options.headers, null, 2));
        console.log('Body:', postData.substring(0, 500) + '...');

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log('\n📥 Response Status:', res.statusCode);
                console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
                
                try {
                    const jsonResponse = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: jsonResponse
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Request Error:', error.message);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Test 1: GET_BATCHID API
 */
async function testGetBatchId() {
    console.log('\n' + '='.repeat(80));
    console.log('TEST 1: GET_BATCHID API');
    console.log('='.repeat(80));

    const currentDate = new Date();
    const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getFullYear()}`;

    // Plain request payload - matching SBI's exact sample format
    const plainPayload = {
        SOURCE_ID: "DQ",
        EIS_PAYLOAD: {
            REQEST_REFERENCE_NUMBER: `CPPCDOPP${Date.now()}`,
            REQUEST_TYPE: "Batch_ID",
            STATE: "NCT OF DELHI",
            REQ_DATE: formattedDate
        },
        REQUEST_REFERENCE_NUMBER: sbiEncryption.generateRequestReferenceNumber(),
        DESTINATION: "SPIGOV",
        TXN_TYPE: "DLC",
        TXN_SUB_TYPE: "GET_BATCHID"
    };
    
    console.log('\n⚠️  Note: Getting SI411 error means SBI cannot decrypt our request.');
    console.log('This could be due to:');
    console.log('1. Certificate mismatch - ensure ENC_EIS_UAT.cer is the latest from SBI');
    console.log('2. Encryption format issue - verify RSA-OAEP parameters');
    console.log('3. Source ID mismatch - currently using "DQ" as specified');

    console.log('\n📋 Plain Payload:');
    console.log(JSON.stringify(plainPayload, null, 2));

    // Encrypt and sign
    const encryptedRequest = sbiEncryption.prepareOutgoingRequest(plainPayload);

    if (!encryptedRequest.success) {
        console.error('❌ Encryption failed:', encryptedRequest.error);
        return;
    }

    console.log('\n🔐 Encrypted Request prepared successfully');

    try {
        const response = await makeRequest(encryptedRequest.requestData, encryptedRequest.accessToken);
        
        console.log('\n📊 Response Body:');
        console.log(JSON.stringify(response.body, null, 2));

        // Try to decrypt response if encrypted
        if (response.body && response.body.RESPONSE) {
            console.log('\n🔓 Attempting to decrypt response...');
            try {
                const accessToken = response.headers['accesstoken'] || response.headers['AccessToken'];
                if (accessToken) {
                    const decryptedAESKey = sbiEncryption.decryptAESKeyWithRSAPrivateKey(accessToken);
                    const decryptedResponse = sbiEncryption.decryptPayload(
                        response.body.RESPONSE,
                        decryptedAESKey,
                        response.body.IV || decryptedAESKey.substring(0, 12)
                    );
                    console.log('✅ Decrypted Response:');
                    console.log(JSON.stringify(JSON.parse(decryptedResponse), null, 2));
                }
            } catch (decryptError) {
                console.log('⚠️  Could not decrypt response:', decryptError.message);
            }
        }

        return response;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return null;
    }
}

/**
 * Test 2: FETCH_RECORDS API
 */
async function testFetchRecords(batchId = "1") {
    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: FETCH_RECORDS API');
    console.log('='.repeat(80));

    const currentDate = new Date();
    const formattedDate = `${currentDate.getDate().toString().padStart(2, '0')}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getFullYear()}`;

    // Plain request payload
    const plainPayload = {
        SOURCE_ID: "DQ",
        EIS_PAYLOAD: {
            REQEST_REFERENCE_NUMBER: `CPPCDOPP${Date.now()}`,
            REQUEST_TYPE: "Verification_Records",
            STATE: "NCT OF DELHI",
            REQ_DATE: formattedDate,
            BATCH_ID: batchId
        },
        REQUEST_REFERENCE_NUMBER: sbiEncryption.generateRequestReferenceNumber(),
        DESTINATION: "SPIGOV",
        TXN_TYPE: "DLC",
        TXN_SUB_TYPE: "FETCH_RECORDS"
    };

    console.log('\n📋 Plain Payload:');
    console.log(JSON.stringify(plainPayload, null, 2));

    // Encrypt and sign
    const encryptedRequest = sbiEncryption.prepareOutgoingRequest(plainPayload);

    if (!encryptedRequest.success) {
        console.error('❌ Encryption failed:', encryptedRequest.error);
        return;
    }

    console.log('\n🔐 Encrypted Request prepared successfully');

    try {
        const response = await makeRequest(encryptedRequest.requestData, encryptedRequest.accessToken);
        
        console.log('\n📊 Response Body:');
        console.log(JSON.stringify(response.body, null, 2));

        // Try to decrypt response if encrypted
        if (response.body && response.body.RESPONSE) {
            console.log('\n🔓 Attempting to decrypt response...');
            try {
                const accessToken = response.headers['accesstoken'] || response.headers['AccessToken'];
                if (accessToken) {
                    const decryptedAESKey = sbiEncryption.decryptAESKeyWithRSAPrivateKey(accessToken);
                    const decryptedResponse = sbiEncryption.decryptPayload(
                        response.body.RESPONSE,
                        decryptedAESKey,
                        response.body.IV || decryptedAESKey.substring(0, 12)
                    );
                    console.log('✅ Decrypted Response:');
                    const parsedResponse = JSON.parse(decryptedResponse);
                    console.log(JSON.stringify(parsedResponse, null, 2));
                    
                    // Show record count if available
                    if (parsedResponse.EIS_RESPONSE && parsedResponse.EIS_RESPONSE.data) {
                        try {
                            const data = JSON.parse(parsedResponse.EIS_RESPONSE.data);
                            if (data.Verification_Records) {
                                console.log(`\n📈 Total Records: ${data.Verification_Records.length}`);
                            }
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }
                }
            } catch (decryptError) {
                console.log('⚠️  Could not decrypt response:', decryptError.message);
            }
        }

        return response;
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return null;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('\n🚀 Starting SBI UAT API Tests');
    console.log('Date:', new Date().toISOString());
    console.log('UAT URL:', `https://${UAT_CONFIG.url}:${UAT_CONFIG.port}${UAT_CONFIG.path}`);

    try {
        // Test 1: Get Batch ID
        const batchIdResponse = await testGetBatchId();
        
        // Wait a bit between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 2: Fetch Records
        await testFetchRecords("1");

        console.log('\n' + '='.repeat(80));
        console.log('✅ All tests completed');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('\n❌ Test suite failed:', error);
    }
}

// Run tests
runTests();
