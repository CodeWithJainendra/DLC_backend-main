/**
 * Debug SBI RSA Encryption Issues
 * This script helps diagnose RSA encryption problems with SBI API
 */

const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const crypto = require('crypto');

function debugSBIRSA() {
    console.log('🔧 Debugging SBI RSA Encryption Issues...\n');
    
    try {
        // Load certificates
        console.log('📋 Loading certificates...');
        
        const sbiCertPath = path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer');
        const ourCertPath = path.join(__dirname, 'certificates', 'samar.iitk.ac.in.cer');
        const ourKeyPath = path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key');
        
        if (!fs.existsSync(sbiCertPath)) {
            console.log('❌ SBI certificate not found:', sbiCertPath);
            return;
        }
        
        if (!fs.existsSync(ourCertPath)) {
            console.log('❌ Our certificate not found:', ourCertPath);
            return;
        }
        
        if (!fs.existsSync(ourKeyPath)) {
            console.log('❌ Our private key not found:', ourKeyPath);
            return;
        }
        
        const sbiCertificate = fs.readFileSync(sbiCertPath, 'utf8');
        const ourCertificate = fs.readFileSync(ourCertPath, 'utf8');
        const ourPrivateKey = fs.readFileSync(ourKeyPath, 'utf8');
        
        console.log('✅ All certificates loaded successfully');
        
        // Parse certificates
        console.log('\n📋 Parsing certificates...');
        
        const sbiCert = forge.pki.certificateFromPem(sbiCertificate);
        const ourCert = forge.pki.certificateFromPem(ourCertificate);
        const ourPrivKey = forge.pki.privateKeyFromPem(ourPrivateKey);
        
        console.log('✅ Certificates parsed successfully');
        
        // Display certificate information
        console.log('\n📄 SBI Certificate Information:');
        console.log('   Subject:', sbiCert.subject.getField('CN').value);
        console.log('   Issuer:', sbiCert.issuer.getField('CN').value);
        console.log('   Valid From:', sbiCert.validity.notBefore);
        console.log('   Valid To:', sbiCert.validity.notAfter);
        console.log('   Key Size:', sbiCert.publicKey.n.bitLength(), 'bits');
        
        console.log('\n📄 Our Certificate Information:');
        console.log('   Subject:', ourCert.subject.getField('CN').value);
        console.log('   Issuer:', ourCert.issuer.getField('CN').value);
        console.log('   Valid From:', ourCert.validity.notBefore);
        console.log('   Valid To:', ourCert.validity.notAfter);
        console.log('   Key Size:', ourPrivKey.n.bitLength(), 'bits');
        
        // Test RSA encryption/decryption
        console.log('\n🔍 Testing RSA Encryption/Decryption...');
        
        const testMessage = 'Hello SBI API Test Message 123456789012345678901234567890AB'; // 32 chars for AES key
        console.log('   Test message:', testMessage);
        console.log('   Message length:', testMessage.length, 'characters');
        
        // Test 1: RSA-OAEP with SHA-256 (SBI GEN6 standard)
        console.log('\n🔍 Test 1: RSA-OAEP with SHA-256...');
        try {
            const encrypted1 = sbiCert.publicKey.encrypt(testMessage, 'RSA-OAEP', {
                md: forge.md.sha256.create(),
                mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
            });
            const encryptedBase64_1 = forge.util.encode64(encrypted1);
            console.log('   ✅ RSA-OAEP encryption successful');
            console.log('   Encrypted (first 50 chars):', encryptedBase64_1.substring(0, 50) + '...');
            
            // Try to decrypt with our private key
            try {
                const decrypted1 = ourPrivKey.decrypt(encrypted1, 'RSA-OAEP', {
                    md: forge.md.sha256.create(),
                    mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
                });
                console.log('   ✅ RSA-OAEP decryption successful');
                console.log('   Decrypted message:', decrypted1);
                console.log('   Match:', decrypted1 === testMessage ? '✅' : '❌');
            } catch (decError) {
                console.log('   ❌ RSA-OAEP decryption failed:', decError.message);
            }
        } catch (encError) {
            console.log('   ❌ RSA-OAEP encryption failed:', encError.message);
        }
        
        // Test 2: RSA-PKCS1-V1_5 (fallback)
        console.log('\n🔍 Test 2: RSA-PKCS1-V1_5...');
        try {
            const encrypted2 = sbiCert.publicKey.encrypt(testMessage, 'RSAES-PKCS1-V1_5');
            const encryptedBase64_2 = forge.util.encode64(encrypted2);
            console.log('   ✅ RSA-PKCS1-V1_5 encryption successful');
            console.log('   Encrypted (first 50 chars):', encryptedBase64_2.substring(0, 50) + '...');
            
            // Try to decrypt with our private key
            try {
                const decrypted2 = ourPrivKey.decrypt(encrypted2, 'RSAES-PKCS1-V1_5');
                console.log('   ✅ RSA-PKCS1-V1_5 decryption successful');
                console.log('   Decrypted message:', decrypted2);
                console.log('   Match:', decrypted2 === testMessage ? '✅' : '❌');
            } catch (decError) {
                console.log('   ❌ RSA-PKCS1-V1_5 decryption failed:', decError.message);
            }
        } catch (encError) {
            console.log('   ❌ RSA-PKCS1-V1_5 encryption failed:', encError.message);
        }
        
        // Test 3: Check if we're using the right certificates
        console.log('\n🔍 Test 3: Certificate Compatibility Check...');
        
        // Check if our private key matches our certificate
        try {
            const testData = 'certificate compatibility test';
            const md = forge.md.sha256.create();
            md.update(testData, 'utf8');
            
            // Sign with our private key
            const signature = ourPrivKey.sign(md, 'RSASSA-PKCS1-V1_5');
            
            // Verify with our public key
            const ourPublicKey = ourCert.publicKey;
            const md2 = forge.md.sha256.create();
            md2.update(testData, 'utf8');
            const verified = ourPublicKey.verify(md2.digest().bytes(), signature, 'RSASSA-PKCS1-V1_5');
            
            console.log('   Our certificate/key pair match:', verified ? '✅' : '❌');
        } catch (certError) {
            console.log('   ❌ Certificate compatibility test failed:', certError.message);
        }
        
        // Test 4: Check certificate validity
        console.log('\n🔍 Test 4: Certificate Validity Check...');
        
        const now = new Date();
        const sbiValid = (now >= sbiCert.validity.notBefore && now <= sbiCert.validity.notAfter);
        const ourValid = (now >= ourCert.validity.notBefore && now <= ourCert.validity.notAfter);
        
        console.log('   SBI certificate valid:', sbiValid ? '✅' : '❌');
        if (!sbiValid) {
            console.log('     Valid from:', sbiCert.validity.notBefore);
            console.log('     Valid to:', sbiCert.validity.notAfter);
            console.log('     Current time:', now);
        }
        
        console.log('   Our certificate valid:', ourValid ? '✅' : '❌');
        if (!ourValid) {
            console.log('     Valid from:', ourCert.validity.notBefore);
            console.log('     Valid to:', ourCert.validity.notAfter);
            console.log('     Current time:', now);
        }
        
        // Test 5: Generate a proper SBI request format
        console.log('\n🔍 Test 5: Generate Proper SBI Request Format...');
        
        try {
            // Generate AES key exactly as per SBI specs
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
            let aesKey = '';
            for (let i = 0; i < 32; i++) {
                aesKey += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            console.log('   Generated AES key:', aesKey);
            console.log('   AES key length:', aesKey.length);
            
            // Encrypt AES key with SBI's public key using OAEP
            const encryptedAESKey = sbiCert.publicKey.encrypt(aesKey, 'RSA-OAEP', {
                md: forge.md.sha256.create(),
                mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
            });
            
            const accessToken = forge.util.encode64(encryptedAESKey);
            console.log('   ✅ AES key encrypted successfully');
            console.log('   AccessToken (first 50 chars):', accessToken.substring(0, 50) + '...');
            console.log('   AccessToken length:', accessToken.length);
            
            // Create a sample payload
            const payload = {
                "SOURCE_ID": "DQ",
                "EIS_PAYLOAD": {
                    "REQEST_REFERENCE_NUMBER": "SBIDQ25290180327351969550",
                    "REQUEST_TYPE": "Batch_ID",
                    "STATE": "DELHI",
                    "REQ_DATE": "17-10-2024"
                },
                "REQUEST_REFERENCE_NUMBER": "SBIDQ25290180327351969550",
                "DESTINATION": "SPIGOV",
                "TXN_TYPE": "DLC",
                "TXN_SUB_TYPE": "GET_BATCHID"
            };
            
            const payloadString = JSON.stringify(payload);
            console.log('   Payload created, length:', payloadString.length);
            
            // Encrypt payload with AES-256-GCM
            const keyBuffer = Buffer.from(aesKey, 'utf8');
            const iv = keyBuffer.slice(0, 12); // First 12 bytes as IV
            
            const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
            let encrypted = cipher.update(payloadString, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();
            
            // Combine encrypted data + auth tag
            const combined = Buffer.concat([encrypted, authTag]);
            const encryptedPayload = combined.toString('base64');
            
            console.log('   ✅ Payload encrypted successfully');
            console.log('   Encrypted payload (first 50 chars):', encryptedPayload.substring(0, 50) + '...');
            
            // Create digital signature
            const md = forge.md.sha256.create();
            md.update(payloadString, 'utf8');
            const signature = ourPrivKey.sign(md, 'RSASSA-PKCS1-V1_5');
            const digitalSignature = forge.util.encode64(signature);
            
            console.log('   ✅ Digital signature created');
            console.log('   Digital signature (first 50 chars):', digitalSignature.substring(0, 50) + '...');
            
            console.log('\n📋 Complete SBI Request Structure:');
            console.log('   Headers:');
            console.log('     Content-Type: application/json');
            console.log('     AccessToken: [' + accessToken.length + ' characters]');
            console.log('   Body:');
            console.log('     REQUEST_REFERENCE_NUMBER: ' + payload.REQUEST_REFERENCE_NUMBER);
            console.log('     REQUEST: [' + encryptedPayload.length + ' characters]');
            console.log('     DIGI_SIGN: [' + digitalSignature.length + ' characters]');
            
        } catch (formatError) {
            console.log('   ❌ Request format generation failed:', formatError.message);
        }
        
    } catch (error) {
        console.error('❌ Debug failed with error:', error.message);
        console.error('Stack trace:', error.stack);
    }
    
    console.log('\n🏁 RSA Debug Complete');
}

// Run the debug
if (require.main === module) {
    debugSBIRSA();
}

module.exports = { debugSBIRSA };