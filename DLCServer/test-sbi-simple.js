/**
 * Simple SBI UAT API Test - Using exact format from email
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');

// Load certificates
const sbiCertPath = path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer');
const ourPrivateKeyPath = path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key');

const sbiCertificate = fs.readFileSync(sbiCertPath, 'utf8');
const ourPrivateKey = fs.readFileSync(ourPrivateKeyPath, 'utf8');

// Parse certificates
const sbiCert = forge.pki.certificateFromPem(sbiCertificate);
const ourPrivKey = forge.pki.privateKeyFromPem(ourPrivateKey);
const sbiPublicKey = sbiCert.publicKey;

console.log('✅ Certificates loaded successfully');
console.log('SBI Cert Subject:', sbiCert.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', '));

/**
 * Generate 32-character AES key
 */
function generateAESKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

/**
 * Encrypt with AES-256-GCM
 */
function encryptAESGCM(plaintext, key) {
    const keyBuffer = Buffer.from(key, 'utf8');
    const iv = keyBuffer.slice(0, 12); // First 12 bytes as IV
    
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Combine encrypted + auth tag
    const combined = Buffer.concat([encrypted, authTag]);
    return combined.toString('base64');
}

/**
 * Encrypt AES key with RSA public key - trying multiple methods
 */
function encryptAESKeyRSA(aesKey) {
    console.log('\n🔐 Trying RSA encryption methods...');
    
    // Method 1: RSA-OAEP with SHA-256
    try {
        const encrypted = sbiPublicKey.encrypt(aesKey, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
        });
        console.log('✅ Method 1 (RSA-OAEP SHA-256): Success');
        return forge.util.encode64(encrypted);
    } catch (e) {
        console.log('❌ Method 1 (RSA-OAEP SHA-256): Failed -', e.message);
    }
    
    // Method 2: RSA-OAEP with SHA-1
    try {
        const encrypted = sbiPublicKey.encrypt(aesKey, 'RSA-OAEP', {
            md: forge.md.sha1.create(),
            mgf1: forge.mgf.mgf1.create(forge.md.sha1.create())
        });
        console.log('✅ Method 2 (RSA-OAEP SHA-1): Success');
        return forge.util.encode64(encrypted);
    } catch (e) {
        console.log('❌ Method 2 (RSA-OAEP SHA-1): Failed -', e.message);
    }
    
    // Method 3: PKCS1-V1_5
    try {
        const encrypted = sbiPublicKey.encrypt(aesKey, 'RSAES-PKCS1-V1_5');
        console.log('✅ Method 3 (PKCS1-V1_5): Success');
        return forge.util.encode64(encrypted);
    } catch (e) {
        console.log('❌ Method 3 (PKCS1-V1_5): Failed -', e.message);
    }
    
    throw new Error('All RSA encryption methods failed');
}

/**
 * Create digital signature
 */
function createSignature(data) {
    const md = forge.md.sha256.create();
    md.update(data, 'utf8');
    const signature = ourPrivKey.sign(md);
    return forge.util.encode64(signature);
}

/**
 * Generate request reference number
 */
function generateRefNumber() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const start = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
    const time = now.getHours().toString().padStart(2, '0') +
                 now.getMinutes().toString().padStart(2, '0') +
                 now.getSeconds().toString().padStart(2, '0') +
                 now.getMilliseconds().toString().padStart(3, '0');
    const seq = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    return `SBIDQ${year}${dayOfYear.toString().padStart(3, '0')}${time}${seq}`;
}

/**
 * Make API request
 */
async function makeRequest(payload, txnSubType) {
    console.log('\n' + '='.repeat(80));
    console.log(`Testing: ${txnSubType}`);
    console.log('='.repeat(80));
    
    // Step 1: Create plain JSON
    const plainJSON = JSON.stringify(payload);
    console.log('\n📋 Plain Request:');
    console.log(plainJSON);
    
    // Step 2: Generate AES key
    const aesKey = generateAESKey();
    console.log('\n🔑 AES Key generated (32 chars):', aesKey.length);
    
    // Step 3: Encrypt payload with AES
    const encryptedPayload = encryptAESGCM(plainJSON, aesKey);
    console.log('🔐 Payload encrypted with AES-GCM');
    
    // Step 4: Create digital signature
    const signature = createSignature(plainJSON);
    console.log('✍️  Digital signature created');
    
    // Step 5: Encrypt AES key with RSA
    const encryptedAESKey = encryptAESKeyRSA(aesKey);
    console.log('🔐 AES key encrypted with RSA');
    
    // Step 6: Prepare request
    const requestData = {
        REQUEST_REFERENCE_NUMBER: payload.REQUEST_REFERENCE_NUMBER,
        REQUEST: encryptedPayload,
        DIGI_SIGN: signature
    };
    
    // Step 7: Make HTTPS request
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(requestData);
        
        const options = {
            hostname: 'eissiwebuat.sbi.bank.in',
            port: 443,
            path: '/gen6/gateway/thirdParty/wrapper/services',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'AccessToken': encryptedAESKey
            },
            rejectUnauthorized: false
        };
        
        console.log('\n📤 Sending request to:', `https://${options.hostname}${options.path}`);
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log('\n📥 Response Status:', res.statusCode);
                try {
                    const jsonResponse = JSON.parse(data);
                    console.log('Response:', JSON.stringify(jsonResponse, null, 2));
                    resolve(jsonResponse);
                } catch (e) {
                    console.log('Response (raw):', data);
                    resolve(data);
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
 * Test GET_BATCHID
 */
async function testGetBatchId() {
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
    
    const payload = {
        SOURCE_ID: "DQ",
        EIS_PAYLOAD: {
            REQEST_REFERENCE_NUMBER: `CPPCDOPP${Date.now()}`,
            REQUEST_TYPE: "Batch_ID",
            STATE: "NCT OF DELHI",
            REQ_DATE: dateStr
        },
        REQUEST_REFERENCE_NUMBER: generateRefNumber(),
        DESTINATION: "SPIGOV",
        TXN_TYPE: "DLC",
        TXN_SUB_TYPE: "GET_BATCHID"
    };
    
    return await makeRequest(payload, 'GET_BATCHID');
}

/**
 * Test FETCH_RECORDS
 */
async function testFetchRecords() {
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
    
    const payload = {
        SOURCE_ID: "DQ",
        EIS_PAYLOAD: {
            REQEST_REFERENCE_NUMBER: `CPPCDOPP${Date.now()}`,
            REQUEST_TYPE: "Verification_Records",
            STATE: "NCT OF DELHI",
            REQ_DATE: dateStr,
            BATCH_ID: "1"
        },
        REQUEST_REFERENCE_NUMBER: generateRefNumber(),
        DESTINATION: "SPIGOV",
        TXN_TYPE: "DLC",
        TXN_SUB_TYPE: "FETCH_RECORDS"
    };
    
    return await makeRequest(payload, 'FETCH_RECORDS');
}

/**
 * Main
 */
async function main() {
    console.log('\n🚀 SBI UAT API Testing');
    console.log('Time:', new Date().toISOString());
    
    try {
        // Test 1
        await testGetBatchId();
        
        // Wait
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test 2
        await testFetchRecords();
        
        console.log('\n✅ Tests completed');
    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

main();
