const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const SBIEncryption = require('./sbi-encryption');

const app = express();
const PORT = process.env.PORT || 3002; // Changed port to avoid conflict

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Load certificates
const sbiCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer'), 'utf8');
const ourPrivateKey = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key'), 'utf8');

// Create SBI encryption instance
const sbiEncryption = new SBIEncryption(sbiCertificate, ourPrivateKey);

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'SBI EIS GEN 6 Implementation'
    });
});

// Endpoint to receive encrypted requests from SBI
app.post('/api/receive', (req, res) => {
    try {
        const accessToken = req.headers['accesstoken'] || req.headers['access-token'];
        
        if (!accessToken) {
            return res.status(400).json({
                error: 'Missing AccessToken header'
            });
        }
        
        // Process the incoming request
        const result = sbiEncryption.processIncomingRequest(req.body, accessToken);
        
        if (!result.success) {
            return res.status(400).json({
                error: 'Failed to process request',
                details: result.error
            });
        }
        
        console.log('Successfully processed incoming request from SBI');
        
        // Send a response
        const responsePayload = {
            message: 'Request processed successfully',
            timestamp: new Date().toISOString(),
            referenceNumber: result.decryptedRequest.REQUEST_REFERENCE_NUMBER || 'N/A'
        };
        
        res.status(200).json(responsePayload);
    } catch (error) {
        console.error('Error in /api/receive:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// Endpoint to send encrypted requests to SBI
app.post('/api/send', (req, res) => {
    try {
        const { payload } = req.body;
        
        if (!payload) {
            return res.status(400).json({
                error: 'Missing payload in request body'
            });
        }
        
        // Prepare the outgoing request
        const result = sbiEncryption.prepareOutgoingRequest(payload);
        
        if (!result.success) {
            return res.status(400).json({
                error: 'Failed to prepare request',
                details: result.error
            });
        }
        
        res.status(200).json({
            message: 'Request prepared successfully',
            requestData: result.requestData,
            accessToken: result.accessToken
        });
    } catch (error) {
        console.error('Error in /api/send:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// Test endpoint to demonstrate encryption/decryption
app.post('/api/test-encrypt', (req, res) => {
    try {
        const { data } = req.body;
        
        if (!data) {
            return res.status(400).json({
                error: 'Missing data in request body'
            });
        }
        
        // Generate AES key
        const aesKey = sbiEncryption.generateDynamicKey();
        
        // Encrypt data
        const encrypted = sbiEncryption.encryptPayload(JSON.stringify(data), aesKey);
        
        // Create digital signature
        const signature = sbiEncryption.createDigitalSignature(JSON.stringify(data));
        
        // Encrypt AES key with RSA
        const encryptedKey = sbiEncryption.encryptAESKeyWithRSAPublicKey(aesKey);
        
        // Test decryption
        const decrypted = sbiEncryption.decryptPayload(encrypted.encryptedData, aesKey, encrypted.iv);
        
        // Test signature verification
        const isVerified = sbiEncryption.verifyDigitalSignature(JSON.stringify(data), signature);
        
        // Test AES key decryption
        const decryptedKey = sbiEncryption.decryptAESKeyWithRSAPrivateKey(encryptedKey);
        
        res.status(200).json({
            originalData: data,
            aesKey: aesKey,
            encryptedData: encrypted.encryptedData,
            digitalSignature: signature,
            encryptedAESKey: encryptedKey,
            decryptedData: JSON.parse(decrypted),
            signatureVerified: isVerified,
            decryptedAESKey: decryptedKey
        });
    } catch (error) {
        console.error('Error in /api/test-encrypt:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`SBI EIS GEN 6 Server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;