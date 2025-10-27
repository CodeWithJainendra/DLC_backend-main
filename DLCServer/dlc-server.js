/**
 * DLC Portal Server with SBI Integration
 * 
 * This server provides endpoints to interact with SBI's EIS GEN 6 API for the DLC Portal.
 */

const express = require('express');
const bodyParser = require('body-parser');
const SBIIntegration = require('./sbi-integration');

const app = express();
const PORT = process.env.PORT || 3011; // Changed port to avoid conflict

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Create SBI integration instance
const sbiIntegration = new SBIIntegration();

// Routes

// Serve test page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/test-page.html');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'DLC Portal Server with SBI Integration'
    });
});

// Endpoint to get batch ID from SBI
app.post('/api/sbi/batch-id', async (req, res) => {
    try {
        const { state, date } = req.body;
        
        if (!state || !date) {
            return res.status(400).json({
                error: 'Missing required parameters: state and date'
            });
        }
        
        // Call SBI API
        const result = await sbiIntegration.getBatchId(state, date);
        
        if (!result.success) {
            return res.status(500).json({
                error: 'Failed to get batch ID from SBI',
                details: result.error
            });
        }
        
        res.status(200).json(result.data);
    } catch (error) {
        console.error('Error in /api/sbi/batch-id:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// Endpoint to fetch verification records from SBI
app.post('/api/sbi/verification-records', async (req, res) => {
    try {
        const { state, date, batchId } = req.body;
        
        if (!state || !date) {
            return res.status(400).json({
                error: 'Missing required parameters: state and date'
            });
        }
        
        // Call SBI API
        const result = await sbiIntegration.fetchVerificationRecords(state, date, batchId);
        
        if (!result.success) {
            return res.status(500).json({
                error: 'Failed to fetch verification records from SBI',
                details: result.error
            });
        }
        
        res.status(200).json(result.data);
    } catch (error) {
        console.error('Error in /api/sbi/verification-records:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// Test endpoint to prepare a request (for debugging)
app.post('/api/sbi/prepare-request', (req, res) => {
    try {
        const { eisPayload, txnType, txnSubType } = req.body;
        
        if (!eisPayload || !txnType || !txnSubType) {
            return res.status(400).json({
                error: 'Missing required parameters: eisPayload, txnType, txnSubType'
            });
        }
        
        // Prepare outgoing request
        const preparedRequest = sbiIntegration.prepareOutgoingRequest(eisPayload, txnType, txnSubType);
        
        if (!preparedRequest.success) {
            return res.status(500).json({
                error: 'Failed to prepare request',
                details: preparedRequest.error
            });
        }
        
        res.status(200).json({
            message: 'Request prepared successfully',
            requestData: preparedRequest.requestData,
            accessToken: preparedRequest.accessToken,
            plainRequest: preparedRequest.plainRequest
        });
    } catch (error) {
        console.error('Error in /api/sbi/prepare-request:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`DLC Portal Server with SBI Integration listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`SBI API endpoints:`);
    console.log(`  POST http://localhost:${PORT}/api/sbi/batch-id`);
    console.log(`  POST http://localhost:${PORT}/api/sbi/verification-records`);
    console.log(`  POST http://localhost:${PORT}/api/sbi/prepare-request`);
});

module.exports = app;