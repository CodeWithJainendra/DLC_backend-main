/**
 * SBI EIS GEN 6 Integration for DLC Portal
 * 
 * This module implements the integration with SBI's EIS GEN 6 API for the DLC Portal.
 * It handles encryption, decryption, digital signatures, and API communication as per
 * SBI's specifications.
 */

const axios = require('axios');
const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

class SBIIntegration {
    constructor() {
        // Load certificates
        this.sbiCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer'), 'utf8');
        this.ourCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.cer'), 'utf8');
        this.ourPrivateKey = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key'), 'utf8');
        
        // Parse certificates
        this.sbiCert = forge.pki.certificateFromPem(this.sbiCertificate);
        this.ourCert = forge.pki.certificateFromPem(this.ourCertificate);
        this.ourPrivKey = forge.pki.privateKeyFromPem(this.ourPrivateKey);
        this.sbiPublicKey = this.sbiCert.publicKey;
        
        // SBI UAT API endpoint
        this.sbiAPIUrl = 'https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services';
        
        // Source ID as per SBI specifications
        this.sourceId = 'DQ';
    }

    /**
     * Generate a 32-character dynamic key for AES encryption
     * As per SBI specs: "do not use Key generator function for generation of secret key, only use keyboard characters"
     * @returns {string} 32-character key
     */
    generateDynamicKey() {
        // Use keyboard characters as per SBI specification
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
        let key = '';
        for (let i = 0; i < 32; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    }

    /**
     * Encrypt payload using AES-256-GCM as per SBI GEN6 specifications
     * @param {string} plaintext - The plaintext to encrypt
     * @param {string} key - The 32-character AES key
     * @returns {object} Encrypted data with IV and auth tag
     */
    encryptPayload(plaintext, key) {
        try {
            // Use first 12 bytes of the key as IV (as per SBI GEN6 specs)
            const iv = Buffer.from(key.substring(0, 12), 'utf8');
            
            // Create cipher using AES-256-GCM
            const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), iv);
            
            // Encrypt the plaintext
            const encrypted = Buffer.concat([
                cipher.update(plaintext, 'utf8'),
                cipher.final()
            ]);
            
            // Get the authentication tag (16 bytes as per specs)
            const authTag = cipher.getAuthTag();
            
            // Return encrypted data with auth tag appended (SBI format)
            const finalEncrypted = Buffer.concat([encrypted, authTag]);
            
            return {
                encryptedData: finalEncrypted.toString('base64'),
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
            // Convert IV
            const iv = Buffer.from(ivBase64, 'base64');
            
            // Convert encrypted data from base64
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
            const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), iv);
            
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
     * @param {string} aesKey - The AES key to encrypt
     * @returns {string} Encrypted AES key in base64
     */
    encryptAESKeyWithRSAPublicKey(aesKey) {
        try {
            // Use RSA-OAEP with SHA-256 as per SBI GEN6 specs
            const encrypted = this.sbiPublicKey.encrypt(aesKey, 'RSA-OAEP', {
                md: forge.md.sha256.create(),
                mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
            });
            return forge.util.encode64(encrypted);
        } catch (error) {
            console.error('RSA-OAEP encryption failed:', error.message);
            // If OAEP fails, try PKCS1-V1_5 as fallback
            try {
                const encrypted = this.sbiPublicKey.encrypt(aesKey, 'RSAES-PKCS1-V1_5');
                return forge.util.encode64(encrypted);
            } catch (fallbackError) {
                throw new Error(`RSA encryption failed: OAEP: ${error.message}, PKCS1: ${fallbackError.message}`);
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
                const decrypted = this.ourPrivKey.decrypt(encryptedKey, 'RSA-OAEP', {
                    md: forge.md.sha256.create(),
                    mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
                });
                return decrypted;
            } catch (oaepError) {
                console.warn('RSA-OAEP decryption failed, trying PKCS1-V1_5:', oaepError.message);
                // Fallback to PKCS1-V1_5 for compatibility
                const decrypted = this.ourPrivKey.decrypt(encryptedKey, 'RSAES-PKCS1-V1_5');
                return decrypted;
            }
        } catch (error) {
            throw new Error(`RSA decryption failed: ${error.message}`);
        }
    }

    /**
     * Create digital signature using SHA-256 and RSA
     * @param {string} data - The data to sign
     * @returns {string} Digital signature in base64
     */
    createDigitalSignature(data) {
        try {
            // Create SHA-256 hash
            const md = forge.md.sha256.create();
            md.update(data, 'utf8');
            
            // Sign with our private key using PKCS#1 v1.5 padding
            const signature = this.ourPrivKey.sign(md, 'RSASSA-PKCS1-V1_5');
            
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
     * Format: SBIDQ-YY-DDD-HH-mm-ssSSS-NNNNNN
     * @returns {string} Request reference number
     */
    generateRequestReferenceNumber() {
        const now = new Date();
        const year = now.getFullYear().toString().substr(2, 2); // Last 2 digits of year
        
        // Calculate Julian day (day of year)
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now - start;
        const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
        const julianDay = dayOfYear.toString().padStart(3, '0');
        
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
        const timePart = hours + minutes + seconds + milliseconds;
        
        // Generate a 6-digit sequence number
        const sequence = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        
        return `SBI${this.sourceId}${year}${julianDay}${timePart}${sequence}`;
    }

    /**
     * Prepare outgoing request to SBI API
     * @param {object} eisPayload - The EIS payload data
     * @param {string} txnType - Transaction type (DLC)
     * @param {string} txnSubType - Transaction sub-type (FETCH_RECORDS, GET_BATCHID)
     * @returns {object} Prepared request data
     */
    prepareOutgoingRequest(eisPayload, txnType, txnSubType) {
        try {
            // Step 1: Generate request reference number
            const requestReferenceNumber = this.generateRequestReferenceNumber();
            
            // Step 2: Create the plain request
            const plainRequest = {
                SOURCE_ID: this.sourceId,
                EIS_PAYLOAD: eisPayload,
                REQUEST_REFERENCE_NUMBER: requestReferenceNumber,
                DESTINATION: 'SPIGOV',
                TXN_TYPE: txnType,
                TXN_SUB_TYPE: txnSubType
            };
            
            // Step 3: Convert to JSON string
            const payloadString = JSON.stringify(plainRequest);
            
            // Step 4: Generate AES key and encrypt payload
            const aesKey = this.generateDynamicKey();
            const encryptedPayload = this.encryptPayload(payloadString, aesKey);
            
            // Step 5: Create digital signature
            const digitalSignature = this.createDigitalSignature(payloadString);
            
            // Step 6: Encrypt AES key with SBI's public key
            const encryptedAESKey = this.encryptAESKeyWithRSAPublicKey(aesKey);
            
            // Step 7: Prepare final request structure
            const finalRequest = {
                REQUEST_REFERENCE_NUMBER: requestReferenceNumber,
                REQUEST: encryptedPayload.encryptedData,
                DIGI_SIGN: digitalSignature
            };
            
            return {
                success: true,
                requestData: finalRequest,
                accessToken: encryptedAESKey,
                plainRequest: plainRequest
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
     * Process response from SBI API
     * @param {object} responseBody - The response body from SBI
     * @param {string} accessToken - The AccessToken header (optional for plain responses)
     * @returns {object} Processed response data
     */
    processIncomingResponse(responseBody, accessToken = null) {
        try {
            // Check if response is encrypted (has RESPONSE and DIGI_SIGN fields)
            if (responseBody.RESPONSE && responseBody.DIGI_SIGN && accessToken) {
                // Encrypted response processing
                console.log('Processing encrypted response from SBI');
                
                // Step 1: Decrypt the AES key using our private key
                const decryptedAESKey = this.decryptAESKeyWithRSAPrivateKey(accessToken);
                
                // Step 2: Decrypt the RESPONSE using the AES key
                const decryptedResponse = this.decryptPayload(
                    responseBody.RESPONSE, 
                    decryptedAESKey, 
                    responseBody.IV || this.extractIVFromEncryptedData(responseBody.RESPONSE)
                );
                
                // Step 3: Verify the digital signature
                const isSignatureValid = this.verifyDigitalSignature(decryptedResponse, responseBody.DIGI_SIGN);
                
                if (!isSignatureValid) {
                    throw new Error('Digital signature verification failed');
                }
                
                // Step 4: Parse the decrypted response
                const parsedResponse = JSON.parse(decryptedResponse);
                
                return {
                    success: true,
                    decryptedResponse: parsedResponse,
                    aesKey: decryptedAESKey
                };
            } else {
                // Plain response processing (SBI UAT returns plain JSON)
                console.log('Processing plain response from SBI');
                
                // Check if response has the expected SBI format
                if (responseBody.EIS_RESPONSE || responseBody.ERROR_CODE !== undefined) {
                    return {
                        success: true,
                        decryptedResponse: responseBody,
                        aesKey: null
                    };
                } else {
                    // Assume it's already the correct format
                    return {
                        success: true,
                        decryptedResponse: responseBody,
                        aesKey: null
                    };
                }
            }
        } catch (error) {
            console.error('Error processing incoming response:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Call SBI API to get batch ID
     * @param {string} state - State name
     * @param {string} date - Date in DD-MM-YYYY format
     * @returns {object} API response
     */
    async getBatchId(state, date) {
        try {
            // Prepare EIS payload exactly as per SBI sample
            const eisPayload = {
                "REQEST_REFERENCE_NUMBER": this.generateRequestReferenceNumber(),
                "REQUEST_TYPE": "Batch_ID",
                "STATE": state,
                "REQ_DATE": date
            };
            
            // Prepare outgoing request
            const preparedRequest = this.prepareOutgoingRequest(eisPayload, 'DLC', 'GET_BATCHID');
            
            if (!preparedRequest.success) {
                throw new Error(preparedRequest.error);
            }
            
            console.log('Making API call to SBI with payload:', JSON.stringify(preparedRequest.requestData, null, 2));
            console.log('AccessToken (first 50 chars):', preparedRequest.accessToken.substring(0, 50) + '...');
            
            // Make API call to SBI with exact headers as per specification
            const response = await axios.post(this.sbiAPIUrl, preparedRequest.requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'AccessToken': preparedRequest.accessToken,
                    'User-Agent': 'DLC-Portal-IITK/1.0'
                },
                timeout: 30000,
                validateStatus: function (status) {
                    return status < 500; // Accept any status code less than 500
                }
            });
            
            console.log('SBI API Response:', JSON.stringify(response.data, null, 2));
            
            // Process response
            const processedResponse = this.processIncomingResponse(response.data, response.headers['accesstoken'] || response.headers['access-token'] || null);
            
            if (!processedResponse.success) {
                throw new Error(processedResponse.error);
            }
            
            return {
                success: true,
                data: processedResponse.decryptedResponse
            };
        } catch (error) {
            console.error('Error in getBatchId:', error);
            if (error.response) {
                console.error('SBI API Error Response:', error.response.data);
                console.error('SBI API Error Status:', error.response.status);
            }
            return {
                success: false,
                error: error.message,
                details: error.response?.data
            };
        }
    }

    /**
     * Call SBI API to fetch verification records
     * @param {string} state - State name
     * @param {string} date - Date in DD-MM-YYYY format
     * @param {string} batchId - Batch ID (optional)
     * @returns {object} API response
     */
    async fetchVerificationRecords(state, date, batchId = null) {
        try {
            // Prepare EIS payload
            const eisPayload = {
                "REQEST_REFERENCE_NUMBER": this.generateRequestReferenceNumber(),
                "REQUEST_TYPE": "Verification_Records",
                "STATE": state,
                "REQ_DATE": date
            };
            
            // Add batch ID if provided
            if (batchId) {
                eisPayload.BATCH_ID = batchId;
            }
            
            // Prepare outgoing request
            const preparedRequest = this.prepareOutgoingRequest(eisPayload, 'DLC', 'FETCH_RECORDS');
            
            if (!preparedRequest.success) {
                throw new Error(preparedRequest.error);
            }
            
            // Make API call to SBI
            const response = await axios.post(this.sbiAPIUrl, preparedRequest.requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'AccessToken': preparedRequest.accessToken
                }
            });
            
            // Process response
            const processedResponse = this.processIncomingResponse(response.data, response.headers['accesstoken'] || response.headers['access-token'] || null);
            
            if (!processedResponse.success) {
                throw new Error(processedResponse.error);
            }
            
            return {
                success: true,
                data: processedResponse.decryptedResponse
            };
        } catch (error) {
            console.error('Error in fetchVerificationRecords:', error);
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

module.exports = SBIIntegration;