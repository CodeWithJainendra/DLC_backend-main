const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

// Load certificates
const sbiCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer'), 'utf8');
const ourPrivateKey = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key'), 'utf8');
const ourCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.cer'), 'utf8');

// Convert certificates to forge objects
const sbiCert = forge.pki.certificateFromPem(sbiCertificate);
const ourPrivKey = forge.pki.privateKeyFromPem(ourPrivateKey);
const ourCert = forge.pki.certificateFromPem(ourCertificate);
const sbiPublicKey = sbiCert.publicKey;
const ourPublicKey = ourCert.publicKey;

console.log('=== RSA Debug Test ===\n');

// Test basic RSA encryption/decryption with our own keys
console.log('Test 1: Encrypt/Decrypt with our own keys');
try {
    const testData = "This is a test message for RSA encryption";
    console.log('Original data:', testData);
    
    // Encrypt with our public key
    const encrypted = ourPublicKey.encrypt(testData, 'RSAES-PKCS1-V1_5');
    console.log('✓ Encrypted with our public key, length:', encrypted.length);
    
    // Decrypt with our private key
    const decrypted = ourPrivKey.decrypt(encrypted, 'RSAES-PKCS1-V1_5');
    console.log('✓ Decrypted with our private key:', decrypted);
    
    if (testData === decrypted) {
        console.log('✓ Our own RSA encryption/decryption successful\n');
    } else {
        console.log('✗ Our own RSA encryption/decryption failed\n');
    }
} catch (error) {
    console.log('✗ Failed our own RSA encryption/decryption:', error.message, '\n');
}

// Test basic RSA encryption/decryption with SBI keys
console.log('Test 2: Encrypt/Decrypt with SBI keys');
try {
    const testData = "This is a test message for SBI RSA encryption";
    console.log('Original data:', testData);
    
    // Encrypt with SBI public key
    const encrypted = sbiPublicKey.encrypt(testData, 'RSAES-PKCS1-V1_5');
    console.log('✓ Encrypted with SBI public key, length:', encrypted.length);
    
    // Decrypt with our private key - this won't work as they're different key pairs
    // This is just to see if encryption works
    console.log('✓ SBI RSA encryption successful (decryption would require SBI private key)\n');
} catch (error) {
    console.log('✗ Failed SBI RSA encryption:', error.message, '\n');
}

// Test digital signature with our own keys
console.log('Test 3: Digital Signature with our own keys');
try {
    const testData = "This is a test message for digital signature";
    console.log('Original data:', testData);
    
    // Create SHA-256 hash
    const md = forge.md.sha256.create();
    md.update(testData, 'utf8');
    
    // Sign with our private key
    const signature = ourPrivKey.sign(md, 'RSASSA-PKCS1-V1_5');
    console.log('✓ Digital signature created, length:', signature.length);
    
    // Verify with our public key
    const isVerified = ourPublicKey.verify(md.digest().bytes(), signature, 'RSASSA-PKCS1-V1_5');
    console.log('✓ Signature verification result:', isVerified);
    
    if (isVerified) {
        console.log('✓ Our own digital signature successful\n');
    } else {
        console.log('✗ Our own digital signature failed\n');
    }
} catch (error) {
    console.log('✗ Failed our own digital signature:', error.message, '\n');
}

// Test digital signature verification with SBI keys
console.log('Test 4: Digital Signature Verification with SBI keys');
try {
    const testData = "This is a test message for SBI digital signature verification";
    console.log('Original data:', testData);
    
    // Create SHA-256 hash
    const md = forge.md.sha256.create();
    md.update(testData, 'utf8');
    
    // Sign with our private key
    const signature = ourPrivKey.sign(md, 'RSASSA-PKCS1-V1_5');
    console.log('✓ Digital signature created with our private key, length:', signature.length);
    
    // Verify with SBI public key - this is what we would do to verify SBI signatures
    const isVerified = sbiPublicKey.verify(md.digest().bytes(), signature, 'RSASSA-PKCS1-V1_5');
    console.log('✓ SBI signature verification result:', isVerified);
    
    // Note: This will likely fail because we signed with our key, not SBI's key
    console.log('✓ SBI digital signature verification test completed\n');
} catch (error) {
    console.log('✗ Failed SBI digital signature verification test:', error.message, '\n');
}

console.log('=== RSA Debug Test Completed ===');