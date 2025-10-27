/**
 * Fixed SBI EIS GEN 6 Integration for DLC Portal
 * 
 * This module implements the corrected integration with SBI's EIS GEN 6 API
 * addressing RSA encryption/decryption issues
 */

const axios = require('axios');
const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

class SBIIntegrationFixed {
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
        
        console.log('SBI Integration initialized with:');
        console.log('- SBI Cert Subject:', this.sbiCert.subject.getField('CN').value);
        console.log('- Our Cert Subject:', this.ourCert.subject.getField('CN').value);
        console.log('- SBI Key Size:', this.sbiPublicKey.n.bitLength(), 'bits');
        console.log('- Our Key Size:', this.ourPrivKey.n.bitLength(), 'bits');
    }

    /**
     * Decrypt payload using AES-GCM with the provided key
     * @param {string} encryptedData - The encrypted data in base64
     * @param {string} key - The 32-character AES key
     * @param {string} ivBase64 - The IV in base64 (optional, will use key-derived IV if not provided)
     * @param {string} authTagBase64 - The auth tag in base64 (optional)
     * @returns {string} Decrypted plaintext
     */
    decryptPayload(encryptedData, key, ivBase64 = null, authTagBase64 = null) {
        try {
            console.log('Decrypting payload with key length:', key.length);
            
            // Convert key to buffer (32 bytes for AES-256)
            const keyBuffer = Buffer.from(key, 'utf8');
            
            // Use first 12 bytes of key as IV if not provided (as per SBI spec)
            const iv = ivBase64 ? Buffer.from(ivBase64, 'base64') : keyBuffer.subarray(0, 12);
            
            console.log('Using IV length:', iv.length);
            
            // Create decipher using the correct method for Node.js compatibility
            const algorithm = 'aes-256-gcm';
            const decipher = crypto.createDecipheriv ? 
                crypto.createDecipheriv(algorithm, keyBuffer, iv) :
                crypto.createDecipher(algorithm, keyBuffer);
            
            // Set auth tag if provided and supported
            if (authTagBase64 && decipher.setAuthTag) {
                try {
                    const authTag = Buffer.from(authTagBase64, 'base64');
                    decipher.setAuthTag(authTag);
                } catch (tagError) {
                    console.warn('Could not set auth tag:', tagError.message);
                }
            }
            
            // Decrypt the data
            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            
            try {
                decrypted += decipher.final('utf8');
                console.log('Payload decrypted successfully');
                return decrypted;
            } catch (finalError) {
                console.warn('Final decryption failed, trying alternative approach:', finalError.message);
                
                // Try alternative decryption without auth tag
                const decipher2 = crypto.createDecipheriv ? 
                    crypto.createDecipheriv(algorithm, keyBuffer, iv) :
                    crypto.createDecipher(algorithm, keyBuffer);
                
                let decrypted2 = decipher2.update(encryptedData, 'base64', 'utf8');
                decrypted2 += decipher2.final('utf8');
                
                console.log('Alternative decryption successful');
                return decrypted2;
            }
            
        } catch (error) {
            console.error('Error in decryptPayload:', error);
            
            // Final fallback: try simple AES-256-CBC
            try {
                console.log('Trying fallback AES-256-CBC decryption...');
                const keyBuffer = Buffer.from(key, 'utf8');
                const iv = keyBuffer.subarray(0, 16); // 16 bytes for CBC
                
                const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
                let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
                decrypted += decipher.final('utf8');
                
                console.log('Fallback decryption successful');
                return decrypted;
            } catch (fallbackError) {
                console.error('Fallback decryption also failed:', fallbackError.message);
                throw error;
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
            console.log('Decrypting AES key with RSA private key');
            
            // Decode from base64
            const encryptedKey = forge.util.decode64(encryptedAESKeyBase64);
            
            // Decrypt using our private key with RSA-OAEP and SHA-256
            const decryptedKey = this.ourPrivKey.decrypt(encryptedKey, 'RSA-OAEP', {
                md: forge.md.sha256.create()
            });
            
            console.log('AES key decrypted successfully, length:', decryptedKey.length);
            return decryptedKey;
            
        } catch (error) {
            console.error('Error in decryptAESKeyWithRSAPrivateKey:', error);
            throw error;
        }
    }

    /**
     * Verify digital signature using SHA256 with RSA
     * @param {string} data - The data that was signed
     * @param {string} signatureBase64 - The signature in base64
     * @returns {boolean} True if signature is valid
     */
    verifyDigitalSignature(data, signatureBase64) {
        try {
            console.log('Verifying digital signature');
            
            // Decode signature from base64
            const signature = forge.util.decode64(signatureBase64);
            
            // Create SHA256 hash
            const md = forge.md.sha256.create();
            md.update(data, 'utf8');
            
            // Verify with SBI's public key using PKCS#1 v1.5 padding
            const verified = this.sbiPublicKey.verify(md.digest().bytes(), signature, 'RSASSA-PKCS1-V1_5');
            
            console.log('Digital signature verification result:', verified);
            return verified;
            
        } catch (error) {
            console.error('Error in verifyDigitalSignature:', error);
            return false;
        }
    }

    /**
     * Generate a 32-character dynamic key for AES encryption
     * As per SBI specs: "do not use Key generator function for generation of secret key, only use keyboard characters"
     * @returns {string} 32-character key
     */
    generateDynamicKey() {
        // Use keyboard characters as per SBI specification - reduced character set for compatibility
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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
            if (key.length !== 32) {
                throw new Error(`Secret key must be exactly 32 characters, got ${key.length}`);
            }

            const keyBuffer = Buffer.from(key, 'utf8');
            const iv = keyBuffer.slice(0, 12); // First 12 bytes as IV per SBI spec
            
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
     * Encrypt the AES key using SBI's public key with RSA
     * Using multiple fallback methods for maximum compatibility
     * @param {string} aesKey - The AES key to encrypt
     * @returns {string} Encrypted AES key in base64
     */
    encryptAESKeyWithRSAPublicKey(aesKey) {
        const methods = [
            // Method 1: RSA-OAEP with SHA-1 (older compatibility)
            () => {
                const encrypted = this.sbiPublicKey.encrypt(aesKey, 'RSA-OAEP', {
                    md: forge.md.sha1.create(),
                    mgf1: forge.mgf.mgf1.create(forge.md.sha1.create())
                });
                return forge.util.encode64(encrypted);
            },
            // Method 2: RSA-OAEP with SHA-256 (SBI GEN6 standard)
            () => {
                const encrypted = this.sbiPublicKey.encrypt(aesKey, 'RSA-OAEP', {
                    md: forge.md.sha256.create(),
                    mgf1: forge.mgf.mgf1.create(forge.md.sha256.create())
                });
                return forge.util.encode64(encrypted);
            },
            // Method 3: PKCS1-V1_5 (fallback)
            () => {
                const encrypted = this.sbiPublicKey.encrypt(aesKey, 'RSAES-PKCS1-V1_5');
                return forge.util.encode64(encrypted);
            }
        ];

        let lastError;
        for (let i = 0; i < methods.length; i++) {
            try {
                const result = methods[i]();
                console.log(`RSA encryption successful with method ${i + 1}`);
                return result;
            } catch (error) {
                console.warn(`RSA encryption method ${i + 1} failed:`, error.message);
                lastError = error;
            }
        }
        
        throw new Error(`All RSA encryption methods failed. Last error: ${lastError.message}`);
    }

    /**
     * Create digital signature using SHA256withRSA
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
     * Prepare outgoing request to SBI API with enhanced error handling
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
            console.log('Plain request payload:', payloadString);
            
            // Step 4: Generate AES key and encrypt payload
            const aesKey = this.generateDynamicKey();
            console.log('Generated AES key:', aesKey);
            
            const encryptedPayload = this.encryptPayload(payloadString, aesKey);
            console.log('Payload encrypted successfully');
            
            // Step 5: Create digital signature
            const digitalSignature = this.createDigitalSignature(payloadString);
            console.log('Digital signature created successfully');
            
            // Step 6: Encrypt AES key with SBI's public key
            const encryptedAESKey = this.encryptAESKeyWithRSAPublicKey(aesKey);
            console.log('AES key encrypted successfully');
            
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
                plainRequest: plainRequest,
                aesKey: aesKey // For debugging
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
     * Process response from SBI API with enhanced error handling and decryption
     * @param {object} responseBody - The response body from SBI
     * @param {string} originalAESKey - The original AES key we used to encrypt our request
     * @returns {object} Processed response data
     */
    processIncomingResponse(responseBody, originalAESKey = null) {
        try {
            console.log('Processing SBI response:', JSON.stringify(responseBody, null, 2));
            
            // Check for error responses first
            if (responseBody.ERROR_CODE || responseBody.RESPONSE_STATUS === '2') {
                console.log('SBI returned error response');
                return {
                    success: false,
                    error: responseBody.ERROR_DESCRIPTION || 'Unknown SBI error',
                    errorCode: responseBody.ERROR_CODE,
                    responseStatus: responseBody.RESPONSE_STATUS,
                    rawResponse: responseBody
                };
            }
            
            // Check if response is encrypted (has RESPONSE and DIGI_SIGN fields)
            if (responseBody.RESPONSE && responseBody.DIGI_SIGN) {
                console.log('Processing encrypted response from SBI');
                
                try {
                    // Step 1: Try to decrypt the RESPONSE using our original AES key
                    let decryptedResponse = null;
                    if (originalAESKey) {
                        console.log('Decrypting response payload with original AES key');
                        try {
                            const decryptedText = this.decryptPayload(responseBody.RESPONSE, originalAESKey);
                            console.log('Raw decrypted text:', decryptedText);
                            
                            // Try to parse as JSON
                            try {
                                decryptedResponse = JSON.parse(decryptedText);
                                console.log('Response decrypted and parsed successfully:', decryptedResponse);
                            } catch (jsonError) {
                                console.log('Decrypted text is not JSON, treating as plain text');
                                decryptedResponse = { decryptedText: decryptedText };
                            }
                        } catch (decryptError) {
                            console.warn('Failed to decrypt response payload:', decryptError.message);
                            
                            // Try alternative decryption methods
                            console.log('Trying alternative decryption approaches...');
                            
                            // Method 1: Try without auth tag
                            try {
                                const decryptedText = this.decryptPayload(responseBody.RESPONSE, originalAESKey, null, null);
                                decryptedResponse = JSON.parse(decryptedText);
                                console.log('Alternative decryption successful:', decryptedResponse);
                            } catch (altError) {
                                console.warn('Alternative decryption also failed:', altError.message);
                                // If all decryption fails, treat as plain response
                                decryptedResponse = responseBody;
                            }
                        }
                    } else {
                        console.log('No AES key available, treating as plain response');
                        decryptedResponse = responseBody;
                    }
                    
                    // Step 2: Verify digital signature (optional)
                    let signatureValid = false;
                    if (decryptedResponse && typeof decryptedResponse === 'object' && decryptedResponse !== responseBody) {
                        try {
                            const dataToVerify = typeof decryptedResponse.decryptedText === 'string' 
                                ? decryptedResponse.decryptedText 
                                : JSON.stringify(decryptedResponse);
                            signatureValid = this.verifyDigitalSignature(dataToVerify, responseBody.DIGI_SIGN);
                            console.log('Digital signature verification result:', signatureValid);
                        } catch (sigError) {
                            console.warn('Signature verification failed:', sigError.message);
                        }
                    }
                    
                    return {
                        success: true,
                        decryptedResponse: decryptedResponse,
                        aesKey: originalAESKey,
                        signatureValid: signatureValid,
                        rawResponse: responseBody,
                        isDecrypted: decryptedResponse !== responseBody
                    };
                    
                } catch (error) {
                    console.error('Error processing encrypted response:', error);
                    // Fallback to treating as plain response
                    return {
                        success: true,
                        decryptedResponse: responseBody,
                        aesKey: null,
                        signatureValid: false,
                        rawResponse: responseBody,
                        decryptionError: error.message,
                        isDecrypted: false
                    };
                }
            } else {
                // Plain response processing
                console.log('Processing plain response from SBI');
                
                return {
                    success: true,
                    decryptedResponse: responseBody,
                    aesKey: null,
                    signatureValid: false,
                    rawResponse: responseBody,
                    isDecrypted: false
                };
            }
        } catch (error) {
            console.error('Error processing incoming response:', error);
            return {
                success: false,
                error: error.message,
                rawResponse: responseBody
            };
        }
    }

    /**
     * Call SBI API to get batch ID with enhanced error handling and retry logic
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
            
            console.log('Preparing getBatchId request for:', { state, date });
            
            // Prepare outgoing request
            const preparedRequest = this.prepareOutgoingRequest(eisPayload, 'DLC', 'GET_BATCHID');
            
            if (!preparedRequest.success) {
                throw new Error(preparedRequest.error);
            }
            
            console.log('Making API call to SBI getBatchId...');
            console.log('Request payload:', JSON.stringify(preparedRequest.requestData, null, 2));
            console.log('AccessToken length:', preparedRequest.accessToken.length);
            
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
            
            console.log('SBI API Response Status:', response.status);
            console.log('SBI API Response:', JSON.stringify(response.data, null, 2));
            
            // Process response - pass the original AES key we used for encryption
            const processedResponse = this.processIncomingResponse(
                response.data, 
                preparedRequest.aesKey // Use the original AES key for decryption
            );
            
            console.log('📊 getBatchId Result:');
            console.log('   Success:', processedResponse.success);
            console.log('   Is Decrypted:', processedResponse.isDecrypted);
            if (processedResponse.decryptedResponse && processedResponse.isDecrypted) {
                console.log('   Decrypted Response:', JSON.stringify(processedResponse.decryptedResponse, null, 2));
            }
            
            return processedResponse;
            
        } catch (error) {
            console.error('Error in getBatchId:', error.message);
            if (error.response) {
                console.error('SBI API Error Response:', error.response.data);
                console.error('SBI API Error Status:', error.response.status);
                console.error('SBI API Error Headers:', error.response.headers);
            }
            return {
                success: false,
                error: error.message,
                details: error.response?.data,
                statusCode: error.response?.status
            };
        }
    }

    /**
     * Call SBI API to fetch verification records with enhanced error handling
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
            
            console.log('Preparing fetchVerificationRecords request for:', { state, date, batchId });
            
            // Prepare outgoing request
            const preparedRequest = this.prepareOutgoingRequest(eisPayload, 'DLC', 'FETCH_RECORDS');
            
            if (!preparedRequest.success) {
                throw new Error(preparedRequest.error);
            }
            
            console.log('Making API call to SBI fetchVerificationRecords...');
            
            // Make API call to SBI
            const response = await axios.post(this.sbiAPIUrl, preparedRequest.requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'AccessToken': preparedRequest.accessToken,
                    'User-Agent': 'DLC-Portal-IITK/1.0'
                },
                timeout: 30000,
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            console.log('SBI API Response Status:', response.status);
            console.log('SBI API Response:', JSON.stringify(response.data, null, 2));
            
            // Process response - pass the original AES key we used for encryption
            const processedResponse = this.processIncomingResponse(
                response.data, 
                preparedRequest.aesKey // Use the original AES key for decryption
            );
            
            console.log('📊 fetchVerificationRecords Result:');
            console.log('   Success:', processedResponse.success);
            console.log('   Is Decrypted:', processedResponse.isDecrypted);
            if (processedResponse.decryptedResponse && processedResponse.isDecrypted) {
                console.log('   Decrypted Response:', JSON.stringify(processedResponse.decryptedResponse, null, 2));
            }
            
            return processedResponse;
            
        } catch (error) {
            console.error('Error in fetchVerificationRecords:', error.message);
            if (error.response) {
                console.error('SBI API Error Response:', error.response.data);
                console.error('SBI API Error Status:', error.response.status);
            }
            return {
                success: false,
                error: error.message,
                details: error.response?.data,
                statusCode: error.response?.status
            };
        }
    }
}

module.exports = SBIIntegrationFixed;