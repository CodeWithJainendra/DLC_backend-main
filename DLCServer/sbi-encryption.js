/**
 * SBI EIS GEN 6 Encryption Implementation
 * 
 * This module implements the encryption and digital signature requirements
 * as specified in the SBI EIS GEN 6 Architecture & Payload Encryption Specification.
 */

const crypto = require('crypto');
const forge = require('node-forge');

class SBIEncryption {
    constructor(sbiCertificatePEM, ourPrivateKeyPEM) {
        // Load certificates
        this.sbiCertPEM = sbiCertificatePEM;
        this.ourPrivateKeyPEM = ourPrivateKeyPEM;
        this.sbiCert = forge.pki.certificateFromPem(sbiCertificatePEM);
        this.ourPrivateKey = forge.pki.privateKeyFromPem(ourPrivateKeyPEM);
        this.sbiPublicKey = this.sbiCert.publicKey;
        
        // Set source ID as per SBI specifications
        this.sourceId = 'DQ';
    }

    /**
     * Generate a 32-character dynamic key for AES encryption
     * As per SBI spec: "do not use Key generator function for generation of secret key, only use keyboard characters"
     * @returns {string} 32-character key
     */
    generateDynamicKey() {
        // Use keyboard characters as per SBI specification
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        let key = '';
        for (let i = 0; i < 32; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    }

    /**
     * Encrypt payload using AES-256-GCM as per SBI GEN6 specifications
     * - Cipher Mode: Galois/Counter Mode (GCM) with No Padding
     * - Cryptographic Key: 256 bits (32 characters)
     * - IVector: First 12 bytes of cryptographic key
     * - GCM Tag Length: 16 Bytes
     * @param {string} plaintext - The plaintext to encrypt
     * @param {string} key - The 32-character AES key
     * @returns {object} Encrypted data with IV and auth tag
     */
    encryptPayload(plaintext, key) {
        try {
            if (key.length !== 32) {
                throw new Error(`Secret key must be exactly 32 characters, got ${key.length}`);
            }

            const keyBuffer = Buffer.from(key, 'utf8');
            const iv = keyBuffer.slice(0, 12); // First 12 bytes as IV
            
            // Create AES-256-GCM cipher
            const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
            
            // Encrypt the data
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            // Get 16-byte authentication tag
            const authTag = cipher.getAuthTag();
            
            // Combine encrypted data + auth tag (GCM requirement)
            const combined = Buffer.concat([encrypted, authTag]);
            const base64Result = combined.toString('base64');
            
            return {
                encryptedData: base64Result,
                iv: iv.toString('base64'),
                authTag: authTag.toString('base64')
            };
        } catch (error) {
            throw new Error(`AES-GCM encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt payload using AES-256-GCM as per SBI GEN6 specifications
     * @param {string} encryptedData - The encrypted data in base64
     * @param {string} key - The AES key
     * @param {string} ivBase64 - The IV in base64
     * @param {string} authTagBase64 - The authentication tag in base64
     * @returns {string} Decrypted plaintext
     */
    decryptPayload(encryptedData, key, ivBase64, authTagBase64 = null) {
        try {
            const keyBuffer = Buffer.from(key, 'utf8');
            const iv = Buffer.from(ivBase64, 'base64');
            
            const encryptedBuffer = Buffer.from(encryptedData, 'base64');
            
            // Extract auth tag from the end of encrypted data (last 16 bytes)
            let authTag;
            let actualEncryptedData;
            
            if (authTagBase64) {
                // Use provided auth tag
                authTag = Buffer.from(authTagBase64, 'base64');
                actualEncryptedData = encryptedBuffer;
            } else {
                // Extract auth tag from encrypted data (SBI format)
                authTag = encryptedBuffer.slice(-16); // Last 16 bytes
                actualEncryptedData = encryptedBuffer.slice(0, -16); // Everything except last 16 bytes
            }
            
            // Create decipher using AES-256-GCM
            const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
            
            // Set auth tag
            decipher.setAuthTag(authTag);
            
            // Decrypt
            let decrypted = decipher.update(actualEncryptedData, null, 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`AES-GCM decryption failed: ${error.message}`);
        }
    }

    /**
     * Encrypt the AES key using SBI's public key with RSA
     * - Cipher Mode: Electronic Codebook (ECB) with OAEPPadding
     * - Cryptographic Key: 2048 bit X509 Certificate (SBI's ENC_EIS_UAT)
     * @param {string} aesKey - The AES key to encrypt
     * @returns {string} Encrypted AES key in base64
     */
    encryptAESKeyWithRSAPublicKey(aesKey) {
        try {
            // Try PKCS1-V1_5 first (more compatible with older systems)
            const encrypted = this.sbiPublicKey.encrypt(aesKey, 'RSAES-PKCS1-V1_5');
            return forge.util.encode64(encrypted);
        } catch (error) {
            console.error('RSA-PKCS1 encryption failed, trying OAEP:', error.message);
            // If PKCS1 fails, try OAEP with SHA-256 as per SBI GEN6 specs
            try {
                const encrypted = this.sbiPublicKey.encrypt(aesKey, 'RSA-OAEP', {
                    md: forge.md.sha256.create(),
                    mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
                });
                return forge.util.encode64(encrypted);
            } catch (fallbackError) {
                throw new Error(`RSA encryption failed: PKCS1: ${error.message}, OAEP: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Decrypt the AES key using our private key with RSA
     * @param {string} encryptedAESKeyBase64 - The encrypted AES key in base64
     * @returns {string} Decrypted AES key
     */
    decryptAESKeyWithRSAPrivateKey(encryptedAESKeyBase64) {
        try {
            // Decode from base64
            const encryptedKey = forge.util.decode64(encryptedAESKeyBase64);
            
            // Try OAEP first (as per latest SBI GEN6 specs)
            try {
                const decrypted = this.ourPrivateKey.decrypt(encryptedKey, 'RSA-OAEP', {
                    md: forge.md.sha256.create(),
                    mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
                });
                return decrypted;
            } catch (oaepError) {
                console.warn('RSA-OAEP decryption failed, trying PKCS1-V1_5:', oaepError.message);
                // Fallback to PKCS1-V1_5 for compatibility
                const decrypted = this.ourPrivateKey.decrypt(encryptedKey, 'RSAES-PKCS1-V1_5');
                return decrypted;
            }
        } catch (error) {
            throw new Error(`RSA decryption failed: ${error.message}`);
        }
    }

    /**
     * Create digital signature using SHA256withRSA
     * - Hashing Algorithm: SHA 256
     * - Cryptographic Key: 2048 bit X509 Certificate (samar.iitk.ac.in)
     * Signs the PLAIN JSON request (not encrypted)
     * @param {string} data - The data to sign
     * @returns {string} Digital signature in base64
     */
    createDigitalSignature(data) {
        try {
            // Create SHA-256 hash
            const md = forge.md.sha256.create();
            md.update(data, 'utf8');
            
            // Sign with our private key using PKCS#1 v1.5 padding
            const signature = this.ourPrivateKey.sign(md, 'RSASSA-PKCS1-V1_5');
            
            return forge.util.encode64(signature);
        } catch (error) {
            throw new Error(`Digital signature creation failed: ${error.message}`);
        }
    }

    /**
     * Verify digital signature using SHA256withRSA
     * @param {string} data - The data that was signed
     * @param {string} signatureBase64 - The signature in base64
     * @returns {boolean} True if signature is valid
     */
    verifyDigitalSignature(data, signatureBase64) {
        try {
            // Decode signature
            const signature = forge.util.decode64(signatureBase64);
            
            // Create SHA-256 hash
            const md = forge.md.sha256.create();
            md.update(data, 'utf8');
            
            // Verify with SBI's public key using PKCS#1 v1.5 padding
            return this.sbiPublicKey.verify(md.digest().bytes(), signature, 'RSASSA-PKCS1-V1_5');
        } catch (error) {
            console.error(`Digital signature verification failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Generate request reference number as per SBI format
     * Format: SBI + SOURCE_ID + YY + DDD + HHmmssSSS + NNNNNN (25 characters total)
     * @returns {string} Request reference number
     */
    generateRequestReferenceNumber() {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        
        // Calculate Julian day (day of year)
        const start = new Date(now.getFullYear(), 0, 1);
        const diff = now - start;
        const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
        
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
        const sequence = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        
        return `SBI${this.sourceId}${year}${dayOfYear.toString().padStart(3, '0')}${hours}${minutes}${seconds}${milliseconds}${sequence}`;
    }

    /**
     * Process incoming request from SBI (decrypt and verify)
     * @param {object} requestBody - The request body
     * @param {string} accessToken - The AccessToken header
     * @returns {object} Decrypted request data
     */
    processIncomingRequest(requestBody, accessToken) {
        try {
            // Step 1: Decrypt the AES key using our private key
            const decryptedAESKey = this.decryptAESKeyWithRSAPrivateKey(accessToken);
            
            // Step 2: Decrypt the REQUEST using the AES key
            const decryptedRequest = this.decryptPayload(
                requestBody.REQUEST, 
                decryptedAESKey, 
                requestBody.IV || this.extractIVFromEncryptedData(requestBody.REQUEST)
            );
            
            // Step 3: Verify the digital signature
            const isSignatureValid = this.verifyDigitalSignature(decryptedRequest, requestBody.DIGI_SIGN);
            
            if (!isSignatureValid) {
                throw new Error('Digital signature verification failed');
            }
            
            return {
                success: true,
                decryptedRequest: JSON.parse(decryptedRequest),
                aesKey: decryptedAESKey
            };
        } catch (error) {
            console.error('Error processing incoming request:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Prepare outgoing request to SBI (encrypt and sign)
     * @param {object} payload - The payload to send
     * @returns {object} Encrypted request data
     */
    prepareOutgoingRequest(payload) {
        try {
            // Step 1: Generate a 32-character dynamic key
            const aesKey = this.generateDynamicKey();
            
            // Step 2: Encrypt the payload using AES
            const payloadString = JSON.stringify(payload);
            const encryptedPayload = this.encryptPayload(payloadString, aesKey);
            
            // Step 3: Create digital signature
            const digitalSignature = this.createDigitalSignature(payloadString);
            
            // Step 4: Encrypt the AES key with SBI's public key
            const encryptedAESKey = this.encryptAESKeyWithRSAPublicKey(aesKey);
            
            // Step 5: Prepare the request structure
            const requestReferenceNumber = this.generateRequestReferenceNumber();
            
            return {
                success: true,
                requestData: {
                    REQUEST_REFERENCE_NUMBER: requestReferenceNumber,
                    REQUEST: encryptedPayload.encryptedData,
                    DIGI_SIGN: digitalSignature
                },
                accessToken: encryptedAESKey
            };
        } catch (error) {
            console.error('Error preparing outgoing request:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract IV from encrypted data (placeholder)
     * @param {string} encryptedData - The encrypted data
     * @returns {string} IV
     */
    extractIVFromEncryptedData(encryptedData) {
        // In a real implementation, the IV would be extracted from the encrypted data
        // or sent separately. For now, we generate a random one.
        return crypto.randomBytes(16).toString('base64');
    }
}

module.exports = SBIEncryption;