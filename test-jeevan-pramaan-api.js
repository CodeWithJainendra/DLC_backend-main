const axios = require('axios');
const crypto = require('crypto');

// API Configuration from the email
const AUTH_URL = 'https://ipension.nic.in/JPWrapper/api/Auth';
const REPORT_URL = 'https://ipension.nic.in/JPWrapper/api/Broker/Report';
const USERNAME = 'UserJP';
const PASSWORD = '29#@JP25bhaV';
const PWD_SECRET_KEY = 'bam5kllfzjzvjv560s5q24fnwbtqs50d';
const AES_SECRET_KEY = '3sw6dmhh2vsrjpo5ba36myv6qt5j20fd';

// Test date mentioned in email: 05.11.2024 (expected ~700k records, ~300MB)
// Date format for API: yyyy-MM-dd
const TEST_DATE = '2024-11-05';

/**
 * Compute SHA256 hash (lowercase hex)
 */
function computeSHA256(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex').toLowerCase();
}

/**
 * Generate Access Token for authentication
 */
function generateAccessToken(username, plainPassword, pwdSecretKey) {
    // Step 1: SHA256 hash of plain password
    const step1 = computeSHA256(plainPassword);
    
    // Step 2: Generate timestamp (yyyyMMddHHmmss, UTC)
    const now = new Date();
    const timestamp = now.getUTCFullYear().toString() +
                     (now.getUTCMonth() + 1).toString().padStart(2, '0') +
                     now.getUTCDate().toString().padStart(2, '0') +
                     now.getUTCHours().toString().padStart(2, '0') +
                     now.getUTCMinutes().toString().padStart(2, '0') +
                     now.getUTCSeconds().toString().padStart(2, '0');
    
    // Step 3: Concatenate step1 + timestamp
    const step3 = step1 + timestamp;
    
    // Step 4: SHA256 hash of step3
    const step4 = computeSHA256(step3);
    
    // Step 5: Concatenate step4 + secretKey
    const step5 = step4 + pwdSecretKey;
    
    // Step 6: SHA256 hash of step5 → Final AccessToken
    const accessToken = computeSHA256(step5);
    
    return {
        Username: username,
        Timestamp: timestamp,
        AccessToken: accessToken
    };
}

/**
 * AES-256-GCM Encryption (matching C# implementation)
 */
function aesEncrypt(plainText, key) {
    try {
        const secretKey = Buffer.from(key, 'utf8');
        const iv = secretKey.slice(0, 12); // First 12 bytes as IV
        const plainBytes = Buffer.from(plainText, 'utf8');
        
        // Create cipher with GCM mode
        const cipher = crypto.createCipheriv('aes-256-gcm', secretKey, iv);
        
        // Encrypt the data
        let encrypted = cipher.update(plainBytes);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        // Get the auth tag (16 bytes)
        const authTag = cipher.getAuthTag();
        
        // Combine encrypted data and auth tag
        const result = Buffer.concat([encrypted, authTag]);
        
        // Return as Base64
        return result.toString('base64');
    } catch (error) {
        console.error('AES Encryption Error:', error.message);
        return '';
    }
}

/**
 * AES-256-GCM Decryption (matching C# implementation)
 */
function aesDecrypt(encryptedText, key) {
    try {
        const secretKey = Buffer.from(key, 'utf8');
        const iv = secretKey.slice(0, 12); // First 12 bytes as IV
        const encryptedBytes = Buffer.from(encryptedText, 'base64');
        
        // Split encrypted data and auth tag (last 16 bytes)
        const authTag = encryptedBytes.slice(-16);
        const encrypted = encryptedBytes.slice(0, -16);
        
        // Create decipher with GCM mode
        const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, iv);
        decipher.setAuthTag(authTag);
        
        // Decrypt the data
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        // Return as UTF-8 string
        return decrypted.toString('utf8').replace(/[\r\n\0]+$/g, '');
    } catch (error) {
        console.error('AES Decryption Error:', error.message);
        return '';
    }
}

/**
 * Authenticate with JP API and get JWT token
 */
async function authenticate() {
    console.log('=== Step 1: Authentication ===');
    
    try {
        // Generate authentication data
        const authData = generateAccessToken(USERNAME, PASSWORD, PWD_SECRET_KEY);
        
        console.log('Auth Payload:');
        console.log(`  Username: ${authData.Username}`);
        console.log(`  Timestamp: ${authData.Timestamp}`);
        console.log(`  AccessToken: ${authData.AccessToken.substring(0, 50)}...`);
        
        // Make authentication request
        const response = await axios.post(AUTH_URL, authData, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'JP-API-Client/1.0'
            },
            timeout: 30000
        });
        
        console.log(`✓ Auth Status: ${response.status}`);
        
        if (response.status === 200 && (response.data.Token || response.data.token)) {
            const token = response.data.Token || response.data.token;
            console.log(`✓ JWT Token: ${token.substring(0, 50)}...`);
            return token;
        } else {
            console.error('❌ No Token in auth response');
            return null;
        }
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        return null;
    }
}

/**
 * Fetch Pensioner Report
 */
async function fetchReport(jwtToken, reportDate) {
    console.log('\n=== Step 2: Fetch Pensioner Report ===');
    console.log(`Report Date: ${reportDate}`);
    
    try {
        // Prepare plain JSON request
        const plainJson = { date: reportDate };
        const plainJsonStr = JSON.stringify(plainJson);
        
        console.log(`Plain Request: ${plainJsonStr}`);
        
        // Encrypt the payload
        console.log('🔐 Encrypting request payload with AES-256-GCM...');
        const encryptedPayload = aesEncrypt(plainJsonStr, AES_SECRET_KEY);
        
        console.log(`Encrypted Payload Length: ${encryptedPayload.length} characters`);
        
        // Prepare final request
        const requestPayload = {
            JP_Request: encryptedPayload
        };
        
        // Make the API request
        console.log('Sending request to Report API...');
        const startTime = Date.now();
        
        const response = await axios.post(REPORT_URL, requestPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${jwtToken}`,
                'User-Agent': 'JP-API-Client/1.0'
            },
            timeout: 300000, // 5 minutes for large payload
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`✓ Report Status: ${response.status}`);
        console.log(`✓ Response Time: ${duration} seconds`);
        
        // Check if response contains encrypted data
        const responseData = response.data;
        
        if (responseData && (responseData.jP_Response || responseData.JP_Response)) {
            console.log('🔓 Decrypting response data...');
            
            const encryptedResponse = responseData.jP_Response || responseData.JP_Response;
            const decryptedStr = aesDecrypt(encryptedResponse, AES_SECRET_KEY);
            
            if (decryptedStr) {
                const decryptedData = JSON.parse(decryptedStr);
                
                // Calculate sizes
                const encryptedSize = Buffer.byteLength(encryptedResponse, 'utf8');
                const decryptedSize = Buffer.byteLength(decryptedStr, 'utf8');
                
                console.log(`✓ Encrypted Response Size: ${(encryptedSize / (1024 * 1024)).toFixed(2)} MB`);
                console.log(`✓ Decrypted Data Size: ${(decryptedSize / (1024 * 1024)).toFixed(2)} MB`);
                
                return {
                    success: true,
                    data: decryptedData,
                    responseTime: duration,
                    encryptedSizeMB: (encryptedSize / (1024 * 1024)).toFixed(2),
                    decryptedSizeMB: (decryptedSize / (1024 * 1024)).toFixed(2)
                };
            } else {
                console.error('❌ Failed to decrypt response');
                return {
                    success: false,
                    error: 'Decryption failed',
                    encryptedResponse: responseData
                };
            }
        } else {
            // Plain response (not encrypted)
            console.log('✓ Plain response received (not encrypted)');
            
            const responseStr = JSON.stringify(responseData);
            const sizeInBytes = Buffer.byteLength(responseStr, 'utf8');
            
            return {
                success: true,
                data: responseData,
                responseTime: duration,
                sizeMB: (sizeInBytes / (1024 * 1024)).toFixed(2)
            };
        }
        
    } catch (error) {
        console.error('❌ Report fetch failed:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
        return {
            success: false,
            error: error.message,
            details: error.response ? error.response.data : null
        };
    }
}

/**
 * Analyze the report data
 */
function analyzeReportData(data) {
    console.log('\n=== Data Analysis ===');
    
    if (Array.isArray(data)) {
        console.log(`✓ Record Count: ${data.length.toLocaleString()}`);
        
        if (data.length > 0) {
            console.log('\n--- Sample Record (First) ---');
            console.log(JSON.stringify(data[0], null, 2));
            
            console.log('\n--- Record Structure ---');
            const fields = Object.keys(data[0]);
            console.log(`Fields (${fields.length}):`, fields.join(', '));
            
            // Calculate average record size
            const sampleSize = Math.min(100, data.length);
            let totalSize = 0;
            for (let i = 0; i < sampleSize; i++) {
                totalSize += Buffer.byteLength(JSON.stringify(data[i]), 'utf8');
            }
            const avgSize = (totalSize / sampleSize).toFixed(2);
            console.log(`Average Record Size: ${avgSize} bytes`);
            
            // Show last record as well
            if (data.length > 1) {
                console.log('\n--- Sample Record (Last) ---');
                console.log(JSON.stringify(data[data.length - 1], null, 2));
            }
        }
    } else if (typeof data === 'object') {
        console.log('Response Structure:');
        console.log('Keys:', Object.keys(data).join(', '));
        
        // Check for nested arrays
        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
                console.log(`✓ ${key}: Array with ${data[key].length.toLocaleString()} items`);
                if (data[key].length > 0) {
                    console.log(`\n--- Sample ${key} Record ---`);
                    console.log(JSON.stringify(data[key][0], null, 2));
                }
            }
        }
    }
}

/**
 * Main test function
 */
async function testJeevanPramaanAPI() {
    console.log('='.repeat(80));
    console.log('JEEVAN PRAMAAN API TEST');
    console.log('='.repeat(80));
    console.log(`Auth URL: ${AUTH_URL}`);
    console.log(`Report URL: ${REPORT_URL}`);
    console.log(`Test Date: ${TEST_DATE}`);
    console.log(`Expected Records: ~700,000`);
    console.log(`Expected Size: ~300 MB`);
    console.log('='.repeat(80));
    console.log();

    try {
        // Step 1: Authenticate
        const jwtToken = await authenticate();
        
        if (!jwtToken) {
            throw new Error('Authentication failed - no JWT token received');
        }
        
        // Step 2: Fetch Report
        const reportResult = await fetchReport(jwtToken, TEST_DATE);
        
        if (!reportResult.success) {
            throw new Error(`Report fetch failed: ${reportResult.error}`);
        }
        
        // Step 3: Analyze Data
        analyzeReportData(reportResult.data);
        
        // Final Summary
        console.log('\n' + '='.repeat(80));
        console.log('TEST RESULT: SUCCESS ✓');
        console.log('='.repeat(80));
        console.log('Summary:');
        console.log(`  Response Time: ${reportResult.responseTime} seconds`);
        if (reportResult.decryptedSizeMB) {
            console.log(`  Encrypted Size: ${reportResult.encryptedSizeMB} MB`);
            console.log(`  Decrypted Size: ${reportResult.decryptedSizeMB} MB`);
        } else {
            console.log(`  Payload Size: ${reportResult.sizeMB} MB`);
        }
        
        if (Array.isArray(reportResult.data)) {
            console.log(`  Record Count: ${reportResult.data.length.toLocaleString()}`);
        }
        console.log('='.repeat(80));

        return {
            success: true,
            responseTime: reportResult.responseTime,
            payloadSizeMB: reportResult.decryptedSizeMB || reportResult.sizeMB,
            recordCount: Array.isArray(reportResult.data) ? reportResult.data.length : 'N/A'
        };

    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('TEST RESULT: FAILED ✗');
        console.error('='.repeat(80));
        console.error('Error:', error.message);
        console.error('='.repeat(80));

        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testJeevanPramaanAPI()
    .then(result => {
        console.log('\nFinal Result:', result);
        process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
        console.error('Unexpected error:', err);
        process.exit(1);
    });
