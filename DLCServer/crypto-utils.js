const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

// Load certificates
const sbiCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer'), 'utf8');
const ourCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.cer'), 'utf8');
const ourPrivateKey = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key'), 'utf8');

// Convert certificates to forge objects
const sbiCert = forge.pki.certificateFromPem(sbiCertificate);
const ourCert = forge.pki.certificateFromPem(ourCertificate);
const ourPrivKey = forge.pki.privateKeyFromPem(ourPrivateKey);
const sbiPublicKey = sbiCert.publicKey;

/**
 * Generate a 32-character dynamic key for AES encryption
 * @returns {string} 32-character key
 */
function generateDynamicKey() {
    // As per specification, we should not use Key generator function
    // Instead, we generate a 32-character key using keyboard characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

/**
 * Encrypt payload using AES-256-CBC (fallback method)
 * @param {string} plaintext - The plaintext to encrypt
 * @param {string} key - The 32-character AES key
 * @returns {object} Encrypted data with IV
 */
function encryptPayload(plaintext, key) {
    try {
        // Generate a random 16-byte IV
        const iv = crypto.randomBytes(16);
        
        // Create cipher using AES-256-CBC
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.substring(0, 32)), iv);
        
        // Encrypt
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        return {
            encryptedData: encrypted,
            iv: iv.toString('base64')
        };
    } catch (error) {
        throw new Error(`AES encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt payload using AES-256-CBC (fallback method)
 * @param {string} encryptedData - The encrypted data in base64
 * @param {string} key - The 32-character AES key
 * @param {string} ivBase64 - The IV in base64
 * @returns {string} Decrypted plaintext
 */
function decryptPayload(encryptedData, key, ivBase64) {
    try {
        // Convert IV
        const iv = Buffer.from(ivBase64, 'base64');
        
        // Create decipher
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.substring(0, 32)), iv);
        
        // Decrypt
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        throw new Error(`AES decryption failed: ${error.message}`);
    }
}

/**
 * Encrypt the AES key using SBI's public key with RSA
 * @param {string} aesKey - The AES key to encrypt
 * @returns {string} Encrypted AES key in base64
 */
function encryptAESKeyWithRSAPublicKey(aesKey) {
    try {
        // For compatibility, we'll use PKCS#1 v1.5 padding
        const encrypted = sbiPublicKey.encrypt(aesKey, 'RSAES-PKCS1-V1_5');
        return forge.util.encode64(encrypted);
    } catch (error) {
        throw new Error(`RSA encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt the AES key using our private key with RSA
 * @param {string} encryptedAESKeyBase64 - The encrypted AES key in base64
 * @returns {string} Decrypted AES key
 */
function decryptAESKeyWithRSAPrivateKey(encryptedAESKeyBase64) {
    try {
        // Decode from base64
        const encryptedKey = forge.util.decode64(encryptedAESKeyBase64);
        
        // For compatibility, we'll use PKCS#1 v1.5 padding
        const decrypted = ourPrivKey.decrypt(encryptedKey, 'RSAES-PKCS1-V1_5');
        
        return decrypted;
    } catch (error) {
        throw new Error(`RSA decryption failed: ${error.message}`);
    }
}

/**
 * Create digital signature using SHA-256 and RSA
 * @param {string} data - The data to sign
 * @returns {string} Digital signature in base64
 */
function createDigitalSignature(data) {
    try {
        // Create SHA-256 hash
        const md = forge.md.sha256.create();
        md.update(data, 'utf8');
        
        // Sign with our private key using PKCS#1 v1.5 padding
        const signature = ourPrivKey.sign(md, 'RSASSA-PKCS1-V1_5');
        
        return forge.util.encode64(signature);
    } catch (error) {
        throw new Error(`Digital signature creation failed: ${error.message}`);
    }
}

/**
 * Verify digital signature using SHA-256 and RSA
 * @param {string} data - The data that was signed
 * @param {string} signatureBase64 - The signature in base64
 * @returns {boolean} True if signature is valid
 */
function verifyDigitalSignature(data, signatureBase64) {
    try {
        // Decode signature
        const signature = forge.util.decode64(signatureBase64);
        
        // Create SHA-256 hash
        const md = forge.md.sha256.create();
        md.update(data, 'utf8');
        
        // Verify with SBI's public key using PKCS#1 v1.5 padding
        return sbiPublicKey.verify(md.digest().bytes(), signature, 'RSASSA-PKCS1-V1_5');
    } catch (error) {
        console.error(`Digital signature verification failed: ${error.message}`);
        return false;
    }
}

module.exports = {
    generateDynamicKey,
    encryptPayload,
    decryptPayload,
    encryptAESKeyWithRSAPublicKey,
    decryptAESKeyWithRSAPrivateKey,
    createDigitalSignature,
    verifyDigitalSignature,
    sbiCert,
    ourCert,
    ourPrivKey,
    sbiPublicKey
};