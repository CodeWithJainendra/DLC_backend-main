/**
 * SBI UAT Integration Diagnostic Tool
 * Helps identify certificate and encryption issues
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');

console.log('🔍 SBI UAT Integration Diagnostics\n');
console.log('='.repeat(80));

// Check certificate files from parent directory
const certPath = path.join(__dirname, '..', 'certificates', 'ENC_EIS_UAT.cer');
const privateKeyPath = path.join(__dirname, '..', 'certificates', 'samar.iitk.ac.in.key');
const publicKeyPath = path.join(__dirname, '..', 'certificates', 'samar.iitk.ac.in.cer');

console.log('\n1. Certificate Files Check:');
console.log('-'.repeat(80));

if (fs.existsSync(certPath)) {
    console.log('✅ SBI Certificate found:', certPath);
    const certContent = fs.readFileSync(certPath, 'utf8');
    
    try {
        const cert = forge.pki.certificateFromPem(certContent);
        console.log('   Subject:', cert.subject.getField('CN').value);
        console.log('   Issuer:', cert.issuer.getField('CN').value);
        console.log('   Valid From:', cert.validity.notBefore);
        console.log('   Valid To:', cert.validity.notAfter);
        console.log('   Key Size:', cert.publicKey.n.bitLength(), 'bits');
        
        // Check if certificate is valid now
        const now = new Date();
        if (now < cert.validity.notBefore) {
            console.log('   ⚠️  Certificate not yet valid!');
        } else if (now > cert.validity.notAfter) {
            console.log('   ❌ Certificate has expired!');
        } else {
            console.log('   ✅ Certificate is currently valid');
        }
    } catch (e) {
        console.log('   ❌ Error parsing certificate:', e.message);
    }
} else {
    console.log('❌ SBI Certificate NOT found:', certPath);
}

if (fs.existsSync(privateKeyPath)) {
    console.log('✅ Our Private Key found:', privateKeyPath);
    try {
        const keyContent = fs.readFileSync(privateKeyPath, 'utf8');
        const privateKey = forge.pki.privateKeyFromPem(keyContent);
        console.log('   Key Size:', privateKey.n.bitLength(), 'bits');
    } catch (e) {
        console.log('   ❌ Error parsing private key:', e.message);
    }
} else {
    console.log('❌ Our Private Key NOT found:', privateKeyPath);
}

if (fs.existsSync(publicKeyPath)) {
    console.log('✅ Our Public Certificate found:', publicKeyPath);
    try {
        const certContent = fs.readFileSync(publicKeyPath, 'utf8');
        const cert = forge.pki.certificateFromPem(certContent);
        console.log('   Subject:', cert.subject.getField('CN').value);
    } catch (e) {
        console.log('   ❌ Error parsing certificate:', e.message);
    }
} else {
    console.log('❌ Our Public Certificate NOT found:', publicKeyPath);
}

// Test encryption/decryption
console.log('\n2. Encryption/Decryption Test:');
console.log('-'.repeat(80));

try {
    const SBIEncryption = require('./sbi-encryption');
    const sbiCert = fs.readFileSync(certPath, 'utf8');
    const ourKey = fs.readFileSync(privateKeyPath, 'utf8');
    
    const sbiEnc = new SBIEncryption(sbiCert, ourKey);
    
    // Test AES encryption
    const testData = 'Hello SBI UAT';
    const aesKey = sbiEnc.generateDynamicKey();
    console.log('✅ Generated AES Key (32 chars):', aesKey.length === 32 ? 'OK' : 'FAIL');
    
    const encrypted = sbiEnc.encryptPayload(testData, aesKey);
    console.log('✅ AES-256-GCM Encryption: OK');
    
    const decrypted = sbiEnc.decryptPayload(encrypted.encryptedData, aesKey, encrypted.iv);
    console.log('✅ AES-256-GCM Decryption:', decrypted === testData ? 'OK' : 'FAIL');
    
    // Test RSA encryption
    const encryptedKey = sbiEnc.encryptAESKeyWithRSAPublicKey(aesKey);
    console.log('✅ RSA Encryption (AccessToken):', encryptedKey.length > 0 ? 'OK' : 'FAIL');
    console.log('   AccessToken length:', encryptedKey.length, 'chars');
    
    // Test digital signature
    const signature = sbiEnc.createDigitalSignature(testData);
    console.log('✅ Digital Signature Creation:', signature.length > 0 ? 'OK' : 'FAIL');
    console.log('   Signature length:', signature.length, 'chars');
    
} catch (e) {
    console.log('❌ Encryption test failed:', e.message);
}

// Test request format
console.log('\n3. Request Format Test:');
console.log('-'.repeat(80));

try {
    const SBIEncryption = require('./sbi-encryption');
    const sbiCert = fs.readFileSync(certPath, 'utf8');
    const ourKey = fs.readFileSync(privateKeyPath, 'utf8');
    
    const sbiEnc = new SBIEncryption(sbiCert, ourKey);
    
    const testPayload = {
        SOURCE_ID: "DQ",
        EIS_PAYLOAD: {
            REQEST_REFERENCE_NUMBER: "CPPCDOPP123456789",
            REQUEST_TYPE: "Batch_ID",
            STATE: "NCT OF DELHI",
            REQ_DATE: "22-10-2025"
        },
        REQUEST_REFERENCE_NUMBER: sbiEnc.generateRequestReferenceNumber(),
        DESTINATION: "SPIGOV",
        TXN_TYPE: "DLC",
        TXN_SUB_TYPE: "GET_BATCHID"
    };
    
    const result = sbiEnc.prepareOutgoingRequest(testPayload);
    
    if (result.success) {
        console.log('✅ Request preparation successful');
        console.log('   REQUEST_REFERENCE_NUMBER:', result.requestData.REQUEST_REFERENCE_NUMBER);
        console.log('   REQUEST length:', result.requestData.REQUEST.length, 'chars');
        console.log('   DIGI_SIGN length:', result.requestData.DIGI_SIGN.length, 'chars');
        console.log('   AccessToken length:', result.accessToken.length, 'chars');
        
        // Validate format
        const refNum = result.requestData.REQUEST_REFERENCE_NUMBER;
        if (refNum.startsWith('SBIDQ') && refNum.length === 25) {
            console.log('   ✅ Reference number format: CORRECT');
        } else {
            console.log('   ⚠️  Reference number format: INCORRECT (should be 25 chars starting with SBIDQ)');
        }
    } else {
        console.log('❌ Request preparation failed:', result.error);
    }
    
} catch (e) {
    console.log('❌ Request format test failed:', e.message);
}

// Recommendations
console.log('\n4. Troubleshooting Recommendations:');
console.log('-'.repeat(80));
console.log('');
console.log('If you\'re getting SI411 (RSA decryption Failed) error:');
console.log('');
console.log('1. Verify Certificate:');
console.log('   - Ensure ENC_EIS_UAT.cer is the LATEST certificate from SBI');
console.log('   - Check if SBI sent a new certificate in the email attachment');
console.log('   - The certificate should be renamed from .txt to .cer');
console.log('');
console.log('2. Check Source ID:');
console.log('   - Currently using: "DQ" (as specified in SBI email)');
console.log('   - Verify this matches what SBI configured on their end');
console.log('');
console.log('3. Encryption Method:');
console.log('   - Using RSA-OAEP with SHA-256 (as per GEN6 specs)');
console.log('   - Falls back to PKCS1-V1_5 if OAEP fails');
console.log('');
console.log('4. Contact SBI:');
console.log('   - Ask them to verify the certificate they provided');
console.log('   - Confirm the SOURCE_ID "DQ" is correctly configured');
console.log('   - Request their test logs to see the exact error');
console.log('');
console.log('='.repeat(80));
