/**
 * Simple SBI Routes - No Session Timeout
 * Direct SBI API access with simple token validation
 */

const express = require('express');
const router = express.Router();
const simpleAuth = require('../middleware/simpleAuth');
const SBIOfficialAPIClient = require('../utils/sbiOfficialAPIClient');
const SBIOfficialCertificateHandler = require('../utils/sbiOfficialCertificateHandler');

// Initialize SBI API client
let sbiClient;
let certHandler;

try {
  sbiClient = new SBIOfficialAPIClient();
  certHandler = new SBIOfficialCertificateHandler();
  console.log('✅ Simple SBI API routes initialized');
} catch (error) {
  console.error('❌ Failed to initialize Simple SBI API routes:', error.message);
}

/**
 * Simple SBI Health Check
 * GET /api/simple-sbi/health
 */
router.get('/health', simpleAuth.authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Simple SBI API is working',
      user: {
        username: req.user.username,
        role: req.user.roleName,
        permissions: req.user.permissions
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Simple Batch ID Request
 * POST /api/simple-sbi/batch-id
 */
router.post('/batch-id', simpleAuth.authenticateToken, simpleAuth.requireSBIAccess, async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    const { state, date } = req.body;
    
    if (!state || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: state and date',
        usage: 'POST /api/simple-sbi/batch-id with body: {"state": "NCT OF DELHI", "date": "15-10-2025"}'
      });
    }

    console.log(`📋 Simple SBI: Getting batch ID for State: ${state}, Date: ${date}`);
    console.log(`👤 User: ${req.user.username} (${req.user.roleName})`);
    
    const result = await sbiClient.getBatchId(state, date);
    
    res.json({
      success: true,
      service: 'GET_BATCHID',
      parameters: { state, date },
      user: req.user.username,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Simple SBI Batch ID failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'GET_BATCHID',
      user: req.user.username,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Simple Records Request
 * POST /api/simple-sbi/records
 */
router.post('/records', simpleAuth.authenticateToken, simpleAuth.requireSBIAccess, async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    const { state, date, batchId } = req.body;
    
    if (!state || !date || !batchId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: state, date, and batchId',
        usage: 'POST /api/simple-sbi/records with body: {"state": "NCT OF DELHI", "date": "15-10-2025", "batchId": "BATCH123"}'
      });
    }

    console.log(`📋 Simple SBI: Fetching records for State: ${state}, Date: ${date}, BatchId: ${batchId}`);
    console.log(`👤 User: ${req.user.username} (${req.user.roleName})`);
    
    const result = await sbiClient.fetchRecords(state, date, batchId);
    
    res.json({
      success: true,
      service: 'FETCH_RECORDS',
      parameters: { state, date, batchId },
      user: req.user.username,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Simple SBI Records failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'FETCH_RECORDS',
      user: req.user.username,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Simple Certificate Test
 * GET /api/simple-sbi/test-certificates
 */
router.get('/test-certificates', simpleAuth.authenticateToken, async (req, res) => {
  try {
    if (!certHandler) {
      return res.status(503).json({
        success: false,
        error: 'Certificate handler not initialized'
      });
    }

    const testResult = certHandler.testImplementation();
    
    res.json({
      success: true,
      certificateTest: {
        selfVerification: testResult.metadata.selfVerification,
        requestReference: testResult.metadata.requestReference,
        timestamp: testResult.metadata.timestamp,
        sourceId: testResult.metadata.sourceId
      },
      user: req.user.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Simple Certificate test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      user: req.user.username,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
