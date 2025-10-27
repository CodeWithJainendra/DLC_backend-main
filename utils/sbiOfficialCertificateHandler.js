const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * SBI Official Certificate Handler
 * 
 * Implements the official SBI EIS GEN6 encryption using:
 * 1. ENC_EIS_UAT certificate (provided by SBI) - for encrypting secret key
 * 2. samar.iitk.ac.in certificate - for digital signing
 * 
 * Based on SBI EIS GEN 6 Architecture & Payload Encryption Specification v1.2
 * Date: 8/5/2024 by Dhruvendra Kumar Pandey
 */
class SBIOfficialCertificateHandler {
  constructor() {
    // Certificate paths
    this.sbiCertPath = path.join(__dirname, '..', 'certificates', 'ENC_EIS_UAT.cer');
    this.samarCertPath = path.join(__dirname, '..', 'certificates', 'samar.iitk.ac.in.cer');
    this.samarKeyPath = path.join(__dirname, '..', 'certificates', 'samar.iitk.ac.in.key');
    
    // Certificate data
    this.sbiPublicKey = null;
    this.samarPrivateKey = null;
    this.samarPublicKey = null;
    
    this.initializeCertificates();
  }

  /**
   * Initialize and load all certificates
   */
  initializeCertificates() {
    try {
      console.log('\n🔐 Initializing SBI Official Certificates');
      console.log('=' * 50);
      
      // Load SBI ENC_EIS_UAT certificate (for encryption)
      if (fs.existsSync(this.sbiCertPath)) {
        const sbiCertData = fs.readFileSync(this.sbiCertPath, 'utf8');
        this.sbiPublicKey = sbiCertData;
        console.log('✅ SBI ENC_EIS_UAT certificate loaded');
        console.log(`📄 Certificate path: ${this.sbiCertPath}`);
      } else {
        throw new Error(`SBI certificate not found: ${this.sbiCertPath}`);
      }

      // Load samar.iitk.ac.in private key (for signing)
      if (fs.existsSync(this.samarKeyPath)) {
        this.samarPrivateKey = fs.readFileSync(this.samarKeyPath, 'utf8');
        console.log('✅ samar.iitk.ac.in private key loaded');
        console.log(`🔑 Private key path: ${this.samarKeyPath}`);
      } else {
        throw new Error(`samar.iitk.ac.in private key not found: ${this.samarKeyPath}`);
      }

      // Load samar.iitk.ac.in certificate (for verification)
      if (fs.existsSync(this.samarCertPath)) {
        this.samarPublicKey = fs.readFileSync(this.samarCertPath, 'utf8');
        console.log('✅ samar.iitk.ac.in certificate loaded');
        console.log(`📄 Certificate path: ${this.samarCertPath}`);
      } else {
        throw new Error(`samar.iitk.ac.in certificate not found: ${this.samarCertPath}`);
      }

      // Validate certificate formats
      this.validateCertificates();
      
      console.log('✅ All certificates initialized successfully');
      
    } catch (error) {
      console.error('❌ Certificate initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate certificate formats and structure
   */
  validateCertificates() {
    // Validate SBI certificate
    if (!this.sbiPublicKey.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('Invalid SBI certificate format - missing BEGIN CERTIFICATE');
    }
    if (!this.sbiPublicKey.includes('-----END CERTIFICATE-----')) {
      throw new Error('Invalid SBI certificate format - missing END CERTIFICATE');
    }

    // Validate samar private key
    if (!this.samarPrivateKey.includes('-----BEGIN') || 
        !this.samarPrivateKey.includes('PRIVATE KEY-----')) {
      throw new Error('Invalid samar.iitk.ac.in private key format');
    }

    // Validate samar certificate
    if (!this.samarPublicKey.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('Invalid samar.iitk.ac.in certificate format');
    }

    console.log('✅ Certificate format validation passed');
  }

  /**
   * Generate 32-character dynamic secret key
   * As per SBI spec: "do not use Key generator function for generation of secret key"
   * Use only keyboard characters of appropriate length
   */
  generateSecretKey() {
    const keyboardChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let secretKey = '';
    
    for (let i = 0; i < 32; i++) {
      secretKey += keyboardChars.charAt(Math.floor(Math.random() * keyboardChars.length));
    }
    
    console.log(`🔑 Generated 32-char secret key: ${secretKey.substring(0, 8)}...${secretKey.substring(24)}`);
    return secretKey;
  }

  /**
   * AES-256-GCM encryption as per SBI specification
   * - Cipher Mode: Galois/Counter Mode (GCM) with No Padding
   * - Cryptographic Key: 256 bits (32 characters)
   * - IVector: First 12 bytes of cryptographic key
   * - GCM Tag Length: 16 Bytes
   */
  encryptPayloadAES(plainText, secretKey) {
    try {
      if (secretKey.length !== 32) {
        throw new Error(`Secret key must be exactly 32 characters, got ${secretKey.length}`);
      }

      const keyBuffer = Buffer.from(secretKey, 'utf8');
      const iv = keyBuffer.slice(0, 12); // First 12 bytes as IV
      
      console.log(`🔐 AES-256-GCM Encryption:`);
      console.log(`   Key length: ${keyBuffer.length} bytes`);
      console.log(`   IV length: ${iv.length} bytes`);
      console.log(`   Plain text length: ${plainText.length} chars`);
      
      // Create AES-256-GCM cipher
      const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
      
      // Encrypt the data
      let encrypted = cipher.update(plainText, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get 16-byte authentication tag
      const authTag = cipher.getAuthTag();
      
      // Combine encrypted data + auth tag (GCM requirement)
      const combined = Buffer.concat([encrypted, authTag]);
      const base64Result = combined.toString('base64');
      
      console.log(`✅ AES encryption successful - Output: ${base64Result.length} chars`);
      return base64Result;
      
    } catch (error) {
      console.error('❌ AES encryption failed:', error.message);
      throw new Error(`AES encryption failed: ${error.message}`);
    }
  }

  /**
   * RSA encryption with OAEP padding for secret key
   * - Cipher Mode: Electronic Codebook (ECB) with OAEPPadding
   * - Cryptographic Key: 2048 bit X509 Certificate (SBI's ENC_EIS_UAT)
   */
  encryptSecretKeyRSA(secretKey) {
    try {
      console.log('🔐 RSA-OAEP encryption of secret key using SBI certificate');
      
      const keyBuffer = Buffer.from(secretKey, 'utf8');
      
      // Use RSA-OAEP with SHA-1 (as per SBI specification)
      const encrypted = crypto.publicEncrypt(
        {
          key: this.sbiPublicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha1'
        },
        keyBuffer
      );
      
      const base64Result = encrypted.toString('base64');
      console.log(`✅ RSA encryption successful - AccessToken: ${base64Result.length} chars`);
      return base64Result;
      
    } catch (error) {
      console.error('❌ RSA encryption failed:', error.message);
      throw new Error(`RSA secret key encryption failed: ${error.message}`);
    }
  }

  /**
   * Generate digital signature using SHA256withRSA
   * - Hashing Algorithm: SHA 256
   * - Cryptographic Key: 2048 bit X509 Certificate (samar.iitk.ac.in)
   * Signs the PLAIN JSON request (not encrypted)
   */
  generateDigitalSignature(plainData) {
    try {
      console.log(`📝 Generating digital signature with samar.iitk.ac.in key`);
      console.log(`   Data to sign: ${plainData.substring(0, 100)}...`);
      
      // Create SHA256withRSA signature
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(plainData, 'utf8');
      sign.end();
      
      const signature = sign.sign({
        key: this.samarPrivateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING // PKCS1 v1.5 padding
      }, 'base64');
      
      console.log(`✅ Digital signature generated - Length: ${signature.length} chars`);
      console.log(`📋 Signature preview: ${signature.substring(0, 64)}...`);
      
      return signature;
      
    } catch (error) {
      console.error('❌ Digital signature generation failed:', error.message);
      throw new Error(`Digital signature generation failed: ${error.message}`);
    }
  }

  /**
   * Verify digital signature (for testing purposes)
   */
  verifyDigitalSignature(plainData, signature) {
    try {
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(plainData, 'utf8');
      verify.end();
      
      // Extract public key from samar certificate
      const certObj = new crypto.X509Certificate(this.samarPublicKey);
      const publicKey = certObj.publicKey;
      
      const isValid = verify.verify({
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      }, signature, 'base64');
      
      console.log(`🔍 Signature verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      return isValid;
      
    } catch (error) {
      console.error('❌ Signature verification failed:', error.message);
      return false;
    }
  }

  /**
   * Generate SBI request reference number
   * Format: SBI + SOURCE_ID + YY + DDD + HHmmssSSS + NNNNNN (25 characters total)
   * Where:
   * - SBI: Fixed prefix (3 chars)
   * - SOURCE_ID: DQ (for DoPPW) (2 chars)
   * - YY: Last 2 digits of year (2 chars)
   * - DDD: Julian day (day of year) (3 chars)
   * - HHmmssSSS: Time in hours, minutes, seconds, milliseconds (9 chars)
   * - NNNNNN: Random sequence number (6 chars)
   */
  generateRequestReference(sourceId = 'DQ') {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    
    // Calculate Julian day (day of year) - corrected calculation
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
    
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
    const sequence = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    const reference = `SBI${sourceId}${year}${dayOfYear.toString().padStart(3, '0')}${hours}${minutes}${seconds}${milliseconds}${sequence}`;
    
    console.log(`📋 Generated request reference: ${reference} (${reference.length} chars)`);
    return reference;
  }

  /**
   * Create complete SBI GEN6 encrypted request
   * Implements the full encryption flow as per SBI specification
   */
  createSBIEncryptedRequest(plainRequestData, sourceId = 'DQ') {
    try {
      console.log('\n🚀 Creating SBI GEN6 Encrypted Request');
      console.log('=' * 60);
      
      // Step 1: Generate 32-character dynamic secret key
      const secretKey = this.generateSecretKey();
      
      // Step 2: Generate request reference number
      const requestRef = this.generateRequestReference(sourceId);
      
      // Step 3: Convert request data to JSON string
      const plainRequestString = JSON.stringify(plainRequestData, null, 0);
      console.log(`📄 Plain request: ${plainRequestString.length} characters`);
      
      // Step 4: Encrypt payload using AES-256-GCM
      const encryptedPayload = this.encryptPayloadAES(plainRequestString, secretKey);
      
      // Step 5: Generate digital signature on PLAIN data (not encrypted)
      const digitalSignature = this.generateDigitalSignature(plainRequestString);
      
      // Step 6: Encrypt secret key using RSA-OAEP with SBI certificate
      const encryptedSecretKey = this.encryptSecretKeyRSA(secretKey);
      
      // Step 7: Create request body in SBI format
      const requestBody = {
        REQUEST_REFERENCE_NUMBER: requestRef,
        REQUEST: encryptedPayload,
        DIGI_SIGN: digitalSignature
      };
      
      // Step 8: Create HTTP headers
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'AccessToken': encryptedSecretKey
      };
      
      // Step 9: Self-verification test
      const selfVerificationResult = this.verifyDigitalSignature(plainRequestString, digitalSignature);
      
      console.log('\n✅ SBI GEN6 Encrypted Request Created Successfully');
      console.log(`📋 Request Reference: ${requestRef}`);
      console.log(`🔐 Encrypted Payload: ${encryptedPayload.length} chars`);
      console.log(`📝 Digital Signature: ${digitalSignature.length} chars`);
      console.log(`🔑 Access Token: ${encryptedSecretKey.length} chars`);
      console.log(`🔍 Self-Verification: ${selfVerificationResult ? 'PASSED ✅' : 'FAILED ❌'}`);
      console.log('=' * 60);
      
      return {
        headers,
        body: requestBody,
        secretKey, // Store for response decryption
        metadata: {
          plainRequest: plainRequestString,
          requestReference: requestRef,
          selfVerification: selfVerificationResult,
          timestamp: new Date().toISOString(),
          sourceId
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to create SBI encrypted request:', error.message);
      throw error;
    }
  }

  /**
   * Decrypt SBI response (if encrypted)
   */
  decryptSBIResponse(encryptedResponse, secretKey) {
    try {
      console.log('🔓 Decrypting SBI response');
      
      const keyBuffer = Buffer.from(secretKey, 'utf8');
      const iv = keyBuffer.slice(0, 12); // First 12 bytes as IV
      
      const encryptedData = Buffer.from(encryptedResponse, 'base64');
      
      // Split encrypted data and auth tag (last 16 bytes)
      const encrypted = encryptedData.slice(0, -16);
      const authTag = encryptedData.slice(-16);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      const decryptedText = decrypted.toString('utf8');
      console.log('✅ Response decryption successful');
      
      return decryptedText;
      
    } catch (error) {
      console.error('❌ Response decryption failed:', error.message);
      throw new Error(`Response decryption failed: ${error.message}`);
    }
  }

  /**
   * Test the implementation with sample data
   * Uses the exact format from SBI documentation
   */
  testImplementation() {
    console.log('\n🧪 Testing SBI Official Certificate Implementation');
    console.log('=' * 70);
    
    // Sample DLC request data as per SBI specification
    const sampleRequest = {
      SOURCE_ID: "DQ",
      EIS_PAYLOAD: {
        REQEST_REFERENCE_NUMBER: "CPPCDOPP273202569452665",
        REQUEST_TYPE: "Batch_ID",
        STATE: "NCT OF DELHI",
        REQ_DATE: "05-09-2025"
      },
      DESTINATION: "SPIGOV",
      TXN_TYPE: "DLC",
      TXN_SUB_TYPE: "GET_BATCHID"
    };
    
    try {
      const result = this.createSBIEncryptedRequest(sampleRequest, 'DQ');
      
      console.log('\n📋 Test Results:');
      console.log('Headers:');
      console.log(JSON.stringify(result.headers, null, 2));
      console.log('\nBody:');
      console.log(JSON.stringify(result.body, null, 2));
      console.log('\nMetadata:');
      console.log(JSON.stringify(result.metadata, null, 2));
      
      // Additional verification test
      const additionalVerification = this.verifyDigitalSignature(
        result.metadata.plainRequest, 
        result.body.DIGI_SIGN
      );
      
      console.log(`\n🔍 Additional Verification: ${additionalVerification ? '✅ PASSED' : '❌ FAILED'}`);
      console.log('=' * 70);
      
      return result;
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    }
  }
}

module.exports = SBIOfficialCertificateHandler;
