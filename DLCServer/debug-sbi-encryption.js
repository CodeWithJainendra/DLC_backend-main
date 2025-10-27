/**
 * Debug SBI Encryption Process
 */

const SBIIntegration = require('./sbi-integration');

async function debugSBIEncryption() {
    try {
        console.log('=== SBI Encryption Debug ===\n');
        
        const sbi = new SBIIntegration();
        console.log('✓ SBI Integration initialized\n');
        
        // Test with exact sample data from SBI emails
        const sampleEisPayload = {
            "REQEST_REFERENCE_NUMBER": "CPPCDOPP273202569452665",
            "REQUEST_TYPE": "Batch_ID",
            "STATE": "NCT OF DELHI",
            "REQ_DATE": "05-09-2025"
        };
        
        console.log('Sample EIS Payload:', JSON.stringify(sampleEisPayload, null, 2));
        
        // Prepare request
        const preparedRequest = sbi.prepareOutgoingRequest(sampleEisPayload, 'DLC', 'GET_BATCHID');
        
        if (!preparedRequest.success) {
            console.error('❌ Failed to prepare request:', preparedRequest.error);
            return;
        }
        
        console.log('\n=== Generated Request ===');
        console.log('REQUEST_REFERENCE_NUMBER:', preparedRequest.requestData.REQUEST_REFERENCE_NUMBER);
        console.log('Plain Request:', JSON.stringify(preparedRequest.plainRequest, null, 2));
        console.log('Encrypted REQUEST (first 100 chars):', preparedRequest.requestData.REQUEST.substring(0, 100) + '...');
        console.log('DIGI_SIGN (first 100 chars):', preparedRequest.requestData.DIGI_SIGN.substring(0, 100) + '...');
        console.log('AccessToken (first 100 chars):', preparedRequest.accessToken.substring(0, 100) + '...');
        
        // Test AES key generation
        console.log('\n=== AES Key Test ===');
        const testKey = sbi.generateDynamicKey();
        console.log('Generated AES Key:', testKey);
        console.log('Key Length:', testKey.length);
        
        // Test AES encryption/decryption
        const testPlaintext = JSON.stringify(preparedRequest.plainRequest);
        const encrypted = sbi.encryptPayload(testPlaintext, testKey);
        console.log('AES Encryption successful');
        
        // Test RSA encryption
        console.log('\n=== RSA Encryption Test ===');
        try {
            const encryptedKey = sbi.encryptAESKeyWithRSAPublicKey(testKey);
            console.log('✓ RSA encryption successful');
            console.log('Encrypted key length:', encryptedKey.length);
        } catch (error) {
            console.error('❌ RSA encryption failed:', error.message);
        }
        
        // Test digital signature
        console.log('\n=== Digital Signature Test ===');
        try {
            const signature = sbi.createDigitalSignature(testPlaintext);
            console.log('✓ Digital signature created successfully');
            console.log('Signature length:', signature.length);
        } catch (error) {
            console.error('❌ Digital signature failed:', error.message);
        }
        
    } catch (error) {
        console.error('Debug failed:', error);
    }
}

debugSBIEncryption();
