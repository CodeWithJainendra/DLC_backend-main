/**
 * Certificate Diagnostic Tool
 * Checks certificate validity and details
 */

const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const crypto = require('crypto');

console.log('🔍 Certificate Diagnostics\n');
console.log('='.repeat(80));

// Load SBI Certificate
const sbiCertPath = path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer');
const sbiCertPEM = fs.readFileSync(sbiCertPath, 'utf8');
const sbiCert = forge.pki.certificateFromPem(sbiCertPEM);

console.log('\n📜 SBI Certificate (ENC_EIS_UAT.cer)');
console.log('-'.repeat(80));
console.log('Subject:', sbiCert.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', '));
console.log('Issuer:', sbiCert.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', '));
console.log('Serial Number:', sbiCert.serialNumber);
console.log('Valid From:', sbiCert.validity.notBefore);
console.log('Valid To:', sbiCert.validity.notAfter);

const now = new Date();
const isValid = now >= sbiCert.validity.notBefore && now <= sbiCert.validity.notAfter;
console.log('Status:', isValid ? '✅ VALID' : '❌ EXPIRED/NOT YET VALID');

if (!isValid) {
    if (now < sbiCert.validity.notBefore) {
        console.log('⚠️  Certificate is not yet valid!');
    } else {
        console.log('⚠️  Certificate has expired!');
    }
}

// Public key info
const sbiPublicKey = sbiCert.publicKey;
console.log('\nPublic Key:');
console.log('  Algorithm:', sbiPublicKey.algorithm || 'RSA');
console.log('  Key Size:', sbiPublicKey.n ? sbiPublicKey.n.bitLength() : 'Unknown', 'bits');

// Load Our Certificate
const ourCertPath = path.join(__dirname, 'certificates', 'samar.iitk.ac.in.cer');
const ourCertPEM = fs.readFileSync(ourCertPath, 'utf8');
const ourCert = forge.pki.certificateFromPem(ourCertPEM);

console.log('\n📜 Our Certificate (samar.iitk.ac.in.cer)');
console.log('-'.repeat(80));
console.log('Subject:', ourCert.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', '));
console.log('Issuer:', ourCert.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', '));
console.log('Serial Number:', ourCert.serialNumber);
console.log('Valid From:', ourCert.validity.notBefore);
console.log('Valid To:', ourCert.validity.notAfter);

const ourIsValid = now >= ourCert.validity.notBefore && now <= ourCert.validity.notAfter;
console.log('Status:', ourIsValid ? '✅ VALID' : '❌ EXPIRED/NOT YET VALID');

if (!ourIsValid) {
    if (now < ourCert.validity.notBefore) {
        console.log('⚠️  Certificate is not yet valid!');
    } else {
        console.log('⚠️  Certificate has expired!');
    }
}

// Load Our Private Key
const ourKeyPath = path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key');
const ourKeyPEM = fs.readFileSync(ourKeyPath, 'utf8');
const ourPrivateKey = forge.pki.privateKeyFromPem(ourKeyPEM);

console.log('\n🔑 Our Private Key (samar.iitk.ac.in.key)');
console.log('-'.repeat(80));
console.log('Key Size:', ourPrivateKey.n ? ourPrivateKey.n.bitLength() : 'Unknown', 'bits');

// Test encryption/decryption
console.log('\n🧪 Testing Encryption/Decryption');
console.log('-'.repeat(80));

const testData = 'HelloWorld1234567890123456789012'; // 32 chars

try {
    // Test 1: Encrypt with SBI public key
    console.log('\nTest 1: RSA-OAEP SHA-256 with SBI public key');
    try {
        const encrypted = sbiPublicKey.encrypt(testData, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
        });
        console.log('  ✅ Encryption successful');
        console.log('  Encrypted length:', encrypted.length, 'bytes');
        console.log('  Base64 length:', forge.util.encode64(encrypted).length, 'chars');
    } catch (e) {
        console.log('  ❌ Encryption failed:', e.message);
    }
    
    // Test 2: PKCS1-V1_5
    console.log('\nTest 2: PKCS1-V1_5 with SBI public key');
    try {
        const encrypted = sbiPublicKey.encrypt(testData, 'RSAES-PKCS1-V1_5');
        console.log('  ✅ Encryption successful');
        console.log('  Encrypted length:', encrypted.length, 'bytes');
    } catch (e) {
        console.log('  ❌ Encryption failed:', e.message);
    }
    
    // Test 3: Self-test with our keys
    console.log('\nTest 3: Self-test with our certificate');
    try {
        const ourPublicKey = ourCert.publicKey;
        const encrypted = ourPublicKey.encrypt(testData, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
        });
        const decrypted = ourPrivateKey.decrypt(encrypted, 'RSA-OAEP', {
            md: forge.md.sha256.create(),
            mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
        });
        
        if (decrypted === testData) {
            console.log('  ✅ Encrypt/Decrypt cycle successful');
        } else {
            console.log('  ❌ Decrypted data does not match');
        }
    } catch (e) {
        console.log('  ❌ Self-test failed:', e.message);
    }
    
    // Test 4: Digital signature
    console.log('\nTest 4: Digital signature with our private key');
    try {
        const md = forge.md.sha256.create();
        md.update(testData, 'utf8');
        const signature = ourPrivateKey.sign(md);
        console.log('  ✅ Signature created');
        console.log('  Signature length:', signature.length, 'bytes');
        console.log('  Base64 length:', forge.util.encode64(signature).length, 'chars');
        
        // Verify with our public key
        const ourPublicKey = ourCert.publicKey;
        const md2 = forge.md.sha256.create();
        md2.update(testData, 'utf8');
        const verified = ourPublicKey.verify(md2.digest().bytes(), signature);
        console.log('  Verification:', verified ? '✅ Valid' : '❌ Invalid');
    } catch (e) {
        console.log('  ❌ Signature test failed:', e.message);
    }
    
} catch (error) {
    console.error('❌ Test error:', error);
}

console.log('\n' + '='.repeat(80));
console.log('\n💡 Recommendations:');
console.log('-'.repeat(80));

if (!isValid) {
    console.log('⚠️  SBI certificate is not valid. Contact SBI to get updated certificate.');
}
if (!ourIsValid) {
    console.log('⚠️  Our certificate is not valid. Renew the certificate.');
}
if (isValid && ourIsValid) {
    console.log('✅ Both certificates are valid.');
    console.log('\n📧 Next steps:');
    console.log('1. Verify with SBI that they have our public certificate (samar.iitk.ac.in.cer)');
    console.log('2. Confirm the SOURCE_ID "DQ" is correctly registered');
    console.log('3. Check if SBI needs the certificate in a specific format');
    console.log('4. Ask SBI to verify their RSA decryption configuration');
}

console.log('\n');
