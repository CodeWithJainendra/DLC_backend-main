const express = require('express');
const router = express.Router();
const SBIDataConverter = require('../utils/sbiDataConverter');
const SBIOfficialCertificateHandler = require('../utils/sbiOfficialCertificateHandler');
const SBIOfficialAPIClient = require('../utils/sbiOfficialAPIClient');
const SBIDataModel = require('../models/SBIDataModel');
const dataAccess = require('../middleware/dataAccess');

// Initialize SBI API client
let sbiClient;
let certHandler;

try {
  sbiClient = new SBIOfficialAPIClient();
  certHandler = new SBIOfficialCertificateHandler();
  console.log('✅ SBI Official API routes initialized');
} catch (error) {
  console.error('❌ Failed to initialize SBI API routes:', error.message);
}

/**
 * SBI API Documentation and Root Endpoint
 * GET /api/sbi/
 */
router.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}/api/sbi`;
  
  res.json({
    service: 'SBI Official DLC API',
    version: '1.0.0',
    description: 'SBI EIS GEN6 compliant API for DLC pension data integration',
    specification: 'SBI EIS GEN 6 Architecture & Payload Encryption Specification v1.2',
    timestamp: new Date().toISOString(),
    
    endpoints: {
      documentation: {
        url: `${baseUrl}/`,
        method: 'GET',
        description: 'This documentation'
      },
      
      health: {
        url: `${baseUrl}/health`,
        method: 'GET',
        description: 'Health check and connectivity status'
      },
      
      config: {
        url: `${baseUrl}/config`,
        method: 'GET',
        description: 'API configuration and settings'
      },
      
      batchId: {
        get: {
          url: `${baseUrl}/batch-id?state=STATE_NAME&date=DD-MM-YYYY`,
          method: 'GET',
          description: 'Get batch ID for DLC data (GET with query parameters)',
          example: `${baseUrl}/batch-id?state=NCT%20OF%20DELHI&date=05-09-2025`,
          parameters: {
            state: 'State name (e.g., "NCT OF DELHI")',
            date: 'Date in DD-MM-YYYY format (e.g., "05-09-2025")'
          }
        },
        post: {
          url: `${baseUrl}/batch-id`,
          method: 'POST',
          description: 'Get batch ID for DLC data (POST with body)',
          body: {
            state: 'STATE_NAME',
            date: 'DD-MM-YYYY'
          }
        }
      },
      
      records: {
        get: {
          url: `${baseUrl}/records?batchId=BATCH_ID&state=STATE_NAME&date=DD-MM-YYYY`,
          method: 'GET',
          description: 'Fetch DLC records using batch ID (GET with query parameters)',
          example: `${baseUrl}/records?batchId=1&state=NCT%20OF%20DELHI&date=05-09-2025`,
          parameters: {
            batchId: 'Batch ID (e.g., "1")',
            state: 'State name (e.g., "NCT OF DELHI")',
            date: 'Date in DD-MM-YYYY format (e.g., "05-09-2025")'
          }
        },
        post: {
          url: `${baseUrl}/records`,
          method: 'POST',
          description: 'Fetch DLC records using batch ID (POST with body)',
          body: {
            batchId: 'BATCH_ID',
            state: 'STATE_NAME',
            date: 'DD-MM-YYYY'
          }
        }
      },
      
      dlcData: {
        get: {
          url: `${baseUrl}/dlc-data?state=STATE_NAME&date=DD-MM-YYYY`,
          method: 'GET',
          description: 'Complete DLC data fetch workflow (GET with query parameters)',
          example: `${baseUrl}/dlc-data?state=NCT%20OF%20DELHI&date=05-09-2025`,
          parameters: {
            state: 'State name (e.g., "NCT OF DELHI")',
            date: 'Date in DD-MM-YYYY format (e.g., "05-09-2025")'
          }
        },
        post: {
          url: `${baseUrl}/dlc-data`,
          method: 'POST',
          description: 'Complete DLC data fetch workflow (POST with body)',
          body: {
            state: 'STATE_NAME',
            date: 'DD-MM-YYYY'
          }
        }
      },
      
      fetchAllRecords: {
        url: `${baseUrl}/fetch-all-records`,
        method: 'GET',
        description: 'Fetch all SBI verification records from database (for analytics)'
      },
      
      testing: {
        certificates: {
          url: `${baseUrl}/test/certificates`,
          method: 'GET',
          description: 'Test certificate setup and encryption'
        },
        comprehensive: {
          url: `${baseUrl}/test/comprehensive`,
          method: 'GET',
          description: 'Run comprehensive test suite'
        },
        sbiSamples: {
          url: `${baseUrl}/test/sbi-samples`,
          method: 'GET',
          description: 'Test with official SBI sample data'
        },
        delhi: {
          url: `${baseUrl}/test/delhi`,
          method: 'GET',
          description: 'Test Delhi DLC data fetch'
        }
      }
    },
    
    quickStart: {
      step1: `GET ${baseUrl}/health - Check API health`,
      step2: `GET ${baseUrl}/test/certificates - Verify certificates`,
      step3: `GET ${baseUrl}/batch-id?state=NCT%20OF%20DELHI&date=05-09-2025 - Get batch ID`,
      step4: `GET ${baseUrl}/records?batchId=1&state=NCT%20OF%20DELHI&date=05-09-2025 - Fetch records`,
      step5: `GET ${baseUrl}/dlc-data?state=NCT%20OF%20DELHI&date=05-09-2025 - Complete workflow`
    },
    
    sbiIntegration: {
      endpoint: 'https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services',
      sourceId: 'DQ',
      destination: 'SPIGOV',
      services: ['GET_BATCHID', 'FETCH_RECORDS'],
      encryption: 'AES-256-GCM + RSA-OAEP + SHA256withRSA'
    }
  });
});

/**
 * Health check for SBI API service
 */
router.get('/health', async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized',
        timestamp: new Date().toISOString()
      });
    }

    const healthCheck = await sbiClient.healthCheck();
    
    res.json({
      success: true,
      service: 'SBI Official API',
      ...healthCheck
    });
    
  } catch (error) {
    console.error('SBI health check failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Test SBI certificate setup
 */
router.get('/test/certificates', async (req, res) => {
  try {
    if (!certHandler) {
      return res.status(503).json({
        success: false,
        error: 'Certificate handler not initialized',
        timestamp: new Date().toISOString()
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
      sampleRequest: {
        headers: testResult.headers,
        bodyStructure: {
          REQUEST_REFERENCE_NUMBER: testResult.body.REQUEST_REFERENCE_NUMBER,
          REQUEST: `[${testResult.body.REQUEST.length} chars encrypted]`,
          DIGI_SIGN: `[${testResult.body.DIGI_SIGN.length} chars signature]`
        }
      }
    });
    
  } catch (error) {
    console.error('Certificate test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get batch ID for DLC data (GET with query parameters)
 * GET /api/sbi/batch-id?state=STATE_NAME&date=DD-MM-YYYY
 * Protected: Requires authentication and SBI view permission
 */
router.get('/batch-id', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    const { state, date } = req.query;
    
    if (!state || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: state and date',
        usage: 'GET /api/sbi/batch-id?state=NCT OF DELHI&date=05-09-2025',
        example: 'http://localhost:9007/api/sbi/batch-id?state=NCT%20OF%20DELHI&date=05-09-2025'
      });
    }

    console.log(`📋 Getting batch ID for State: ${state}, Date: ${date}`);
    
    const result = await sbiClient.getBatchId(state, date);
    
    res.json({
      success: true,
      service: 'GET_BATCHID',
      parameters: { state, date },
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get batch ID failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'GET_BATCHID',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get batch ID for DLC data (POST with body)
 * POST /api/sbi/batch-id
 * Body: { state: "STATE_NAME", date: "DD-MM-YYYY" }
 * Protected: Requires authentication and SBI view permission
 */
router.post('/batch-id', ...dataAccess.protectSBIRoute, async (req, res) => {
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
        error: 'Missing required parameters: state and date'
      });
    }

    console.log(`📋 Getting batch ID for State: ${state}, Date: ${date}`);
    
    const result = await sbiClient.getBatchId(state, date);
    
    res.json({
      success: true,
      service: 'GET_BATCHID',
      parameters: { state, date },
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get batch ID failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'GET_BATCHID',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Fetch DLC records using batch ID (GET with query parameters)
 * GET /api/sbi/records?batchId=BATCH_ID&state=STATE_NAME&date=DD-MM-YYYY
 * Protected: Requires authentication and SBI view permission
 */
router.get('/records', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    const { batchId, state, date } = req.query;
    
    if (!batchId || !state || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: batchId, state, and date',
        usage: 'GET /api/sbi/records?batchId=1&state=NCT OF DELHI&date=05-09-2025',
        example: 'http://localhost:9007/api/sbi/records?batchId=1&state=NCT%20OF%20DELHI&date=05-09-2025'
      });
    }

    console.log(`📊 Fetching records for Batch ID: ${batchId}, State: ${state}, Date: ${date}`);
    
    const result = await sbiClient.fetchRecords(batchId, state, date);
    
    res.json({
      success: true,
      service: 'FETCH_RECORDS',
      parameters: { batchId, state, date },
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Fetch records failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'FETCH_RECORDS',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Fetch DLC records using batch ID (POST with body)
 * POST /api/sbi/records
 * Body: { batchId: "BATCH_ID", state: "STATE_NAME", date: "DD-MM-YYYY" }
 * Protected: Requires authentication and SBI view permission
 */
router.post('/records', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    const { batchId, state, date } = req.body;
    
    if (!batchId || !state || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: batchId, state, and date'
      });
    }

    console.log(`📊 Fetching records for Batch ID: ${batchId}, State: ${state}, Date: ${date}`);
    
    const result = await sbiClient.fetchRecords(batchId, state, date);
    
    res.json({
      success: true,
      service: 'FETCH_RECORDS',
      parameters: { batchId, state, date },
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Fetch records failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'FETCH_RECORDS',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Complete DLC data fetch workflow (GET with query parameters)
 * GET /api/sbi/dlc-data?state=STATE_NAME&date=DD-MM-YYYY
 * Protected: Requires authentication and SBI view permission
 */
router.get('/dlc-data', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    const { state, date } = req.query;
    
    if (!state || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: state and date',
        usage: 'GET /api/sbi/dlc-data?state=NCT OF DELHI&date=05-09-2025',
        example: 'http://localhost:9007/api/sbi/dlc-data?state=NCT%20OF%20DELHI&date=05-09-2025'
      });
    }

    console.log(`🔄 Starting complete DLC workflow for State: ${state}, Date: ${date}`);
    
    const result = await sbiClient.fetchDLCData(state, date);
    
    res.json({
      success: true,
      service: 'COMPLETE_DLC_WORKFLOW',
      parameters: { state, date },
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Complete DLC workflow failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'COMPLETE_DLC_WORKFLOW',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Complete DLC data fetch workflow (POST with body)
 * POST /api/sbi/dlc-data
 * Body: { state: "STATE_NAME", date: "DD-MM-YYYY" }
 * Protected: Requires authentication and SBI view permission
 */
router.post('/dlc-data', ...dataAccess.protectSBIRoute, async (req, res) => {
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
        error: 'Missing required parameters: state and date'
      });
    }

    console.log(`🔄 Starting complete DLC workflow for State: ${state}, Date: ${date}`);
    
    const result = await sbiClient.fetchDLCData(state, date);
    
    res.json({
      success: true,
      service: 'COMPLETE_DLC_WORKFLOW',
      parameters: { state, date },
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Complete DLC workflow failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      service: 'COMPLETE_DLC_WORKFLOW',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Run comprehensive SBI API tests
 */
router.get('/test/comprehensive', async (req, res) => {
  try {
    const SBIOfficialSpecTest = require('../test-sbi-official-spec');
    const tester = new SBIOfficialSpecTest();
    
    console.log('🧪 Running comprehensive SBI API tests...');
    
    const results = await tester.runAllTests();
    
    res.json({
      success: true,
      testResults: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Comprehensive test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get SBI API configuration and status
 */
router.get('/config', (req, res) => {
  try {
    const config = {
      baseURL: 'https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services',
      sourceId: 'DQ',
      destination: 'SPIGOV',
      services: {
        GET_BATCHID: {
          description: 'Get batch ID for DLC data',
          endpoint: '/api/sbi/batch-id',
          method: 'POST',
          parameters: ['state', 'date']
        },
        FETCH_RECORDS: {
          description: 'Fetch DLC records using batch ID',
          endpoint: '/api/sbi/records',
          method: 'POST',
          parameters: ['batchId', 'state', 'date']
        },
        COMPLETE_WORKFLOW: {
          description: 'Complete DLC data fetch workflow',
          endpoint: '/api/sbi/dlc-data',
          method: 'POST',
          parameters: ['state', 'date']
        }
      },
      certificates: {
        sbiCertificate: 'ENC_EIS_UAT.cer',
        samarCertificate: 'samar.iitk.ac.in.cer',
        samarPrivateKey: 'samar.iitk.ac.in.key'
      },
      encryption: {
        algorithm: 'AES-256-GCM',
        keyLength: 32,
        ivLength: 12,
        tagLength: 16,
        rsaPadding: 'RSA-OAEP',
        signatureAlgorithm: 'SHA256withRSA'
      },
      initialized: !!(sbiClient && certHandler),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      config
    });
    
  } catch (error) {
    console.error('Config retrieval failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Test with exact SBI sample data
 */
router.get('/test/sbi-samples', async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    console.log('🧪 Testing with exact SBI sample data...');
    
    // Test 1: GET_BATCHID with SBI sample
    const batchResult = await sbiClient.getBatchId("NCT OF DELHI", "05-09-2025");
    
    // Test 2: FETCH_RECORDS with SBI sample
    const recordsResult = await sbiClient.fetchRecords("1", "NCT OF DELHI", "05-09-2025");
    
    res.json({
      success: true,
      testType: 'SBI Official Samples',
      tests: {
        getBatchId: {
          parameters: { state: "NCT OF DELHI", date: "05-09-2025" },
          result: batchResult
        },
        fetchRecords: {
          parameters: { batchId: "1", state: "NCT OF DELHI", date: "05-09-2025" },
          result: recordsResult
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('SBI samples test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      testType: 'SBI Official Samples',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Manual test endpoints for specific states
 */
router.get('/test/delhi', async (req, res) => {
  try {
    if (!sbiClient) {
      return res.status(503).json({
        success: false,
        error: 'SBI API client not initialized'
      });
    }

    const state = "NCT OF DELHI";
    const date = new Date().toISOString().split('T')[0].split('-').reverse().join('-'); // DD-MM-YYYY
    
    console.log(`🧪 Testing Delhi DLC data fetch for date: ${date}`);
    
    const result = await sbiClient.fetchDLCData(state, date);
    
    res.json({
      success: true,
      testType: 'Delhi DLC Data',
      parameters: { state, date },
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Delhi test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      testType: 'Delhi DLC Data',
      timestamp: new Date().toISOString()
    });
  }
});

// ==========================================
// DATABASE ROUTES - Saved SBI Data
// ==========================================

/**
 * Get saved batch data from database
 * GET /api/sbi/db/batch-data?state=STATE_NAME&date=DD-MM-YYYY
 * Protected: Requires authentication and SBI view permission
 */
router.get('/db/batch-data', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    const { state, date } = req.query;
    
    if (!state || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: state and date',
        usage: 'GET /api/sbi/db/batch-data?state=NCT OF DELHI&date=05-09-2025'
      });
    }

    const batchData = await SBIDataModel.getBatchData(state.trim().toUpperCase(), date);
    
    res.json({
      success: true,
      data: batchData,
      parameters: { state, date },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get batch data failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get saved verification records from database
 * GET /api/sbi/db/records?state=STATE_NAME&date=DD-MM-YYYY&batchId=1
 * Protected: Requires authentication and SBI view permission
 */
router.get('/db/records', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    const { state, date, batchId } = req.query;
    
    if (!state || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: state and date',
        usage: 'GET /api/sbi/db/records?state=NCT OF DELHI&date=05-09-2025&batchId=1'
      });
    }

    const records = await SBIDataModel.getVerificationRecords(
      state.trim().toUpperCase(), 
      date, 
      batchId ? parseInt(batchId) : null
    );
    
    res.json({
      success: true,
      data: records,
      count: records.length,
      parameters: { state, date, batchId },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get verification records failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get database statistics
 * GET /api/sbi/db/stats
 * Protected: Requires authentication and SBI view permission
 */
router.get('/db/stats', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    const stats = await SBIDataModel.getDataStatistics();
    
    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get statistics failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Clean old data from database
 * DELETE /api/sbi/db/clean?days=30
 * Protected: Requires authentication and SBI management permission
 */
router.delete('/db/clean', ...dataAccess.protectSFTPRoute, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    const result = await SBIDataModel.cleanOldData(days);
    
    res.json({
      success: true,
      message: `Cleaned data older than ${days} days`,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Clean old data failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Database health check
 * GET /api/sbi/db/health
 */
router.get('/db/health', async (req, res) => {
  try {
    const stats = await SBIDataModel.getDataStatistics();
    
    res.json({
      success: true,
      database: 'healthy',
      tables: {
        batchData: stats.totalBatches || 0,
        verificationRecords: stats.totalRecords || 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(500).json({
      success: false,
      database: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==========================================
// DATA CONVERSION ROUTES - SBI to Pension Master
// ==========================================

/**
 * Convert SBI data to existing pensioner_bank_master format
 * POST /api/sbi/convert/to-pension-master
 * Protected: Requires authentication and SBI management permission
 */
router.post('/convert/to-pension-master', ...dataAccess.protectSFTPRoute, async (req, res) => {
  try {
    console.log('🔄 Converting SBI data to pensioner_bank_master format...');
    
    const result = await SBIDataConverter.convertAllSBIRecords();
    
    res.json({
      success: true,
      message: 'SBI data conversion completed',
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('SBI data conversion failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get conversion statistics
 * GET /api/sbi/convert/stats
 */
router.get('/convert/stats', async (req, res) => {
  try {
    const stats = await SBIDataConverter.getConversionStats();
    
    res.json({
      success: true,
      conversionStats: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get conversion stats failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Auto-convert new SBI records (can be called by scheduler)
 * POST /api/sbi/convert/auto
 * Protected: Requires authentication and SBI management permission
 */
router.post('/convert/auto', ...dataAccess.protectSFTPRoute, async (req, res) => {
  try {
    console.log('🤖 Auto-converting new SBI records...');
    
    // Get conversion stats first
    const stats = await SBIDataConverter.getConversionStats();
    
    if (stats.conversion_needed > 0) {
      const result = await SBIDataConverter.convertAllSBIRecords();
      
      res.json({
        success: true,
        message: `Auto-converted ${result.converted} new SBI records`,
        result,
        stats,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        message: 'No new SBI records to convert',
        result: { converted: 0 },
        stats,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Auto-conversion failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Fetch all SBI records from database (for analytics frontend)
 * GET /api/sbi/fetch-all-records
 * Protected: Requires authentication and SBI view permission
 */
router.get('/fetch-all-records', ...dataAccess.protectSBIRoute, async (req, res) => {
  try {
    const { database } = require('../config/database');
    const db = database.getDB();
    
    // Check if specific date and state are requested
    const { date, state } = req.query;
    
    let query;
    let params = [];
    
    if (date && state) {
      // Normalize date format - handle both MM/DD/YYYY and DD-MM-YYYY
      let normalizedDate = date;
      if (date.includes('/')) {
        // Convert MM/DD/YYYY to DD-MM-YYYY
        const [month, day, year] = date.split('/');
        normalizedDate = `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
      }
      
      
      // Filter by specific date and state
      query = `
        SELECT 
          svr.*,
          sbd.state as batch_state,
          sbd.request_date,
          sbd.max_batch_id,
          sbd.response_code,
          sbd.response_message,
          sbd.created_at as batch_created_at
        FROM sbi_verification_records svr
        LEFT JOIN sbi_batch_data sbd ON svr.batch_id = sbd.max_batch_id 
          AND svr.state = sbd.state 
          AND svr.request_date = sbd.request_date
        WHERE svr.state = ? AND svr.request_date = ?
        ORDER BY svr.created_at DESC
        LIMIT 10000
      `;
      params = [state.toUpperCase(), normalizedDate];
    } else {
      // Get all SBI verification records with batch info
      query = `
        SELECT 
          svr.*,
          sbd.state as batch_state,
          sbd.request_date,
          sbd.max_batch_id,
          sbd.response_code,
          sbd.response_message,
          sbd.created_at as batch_created_at
        FROM sbi_verification_records svr
        LEFT JOIN sbi_batch_data sbd ON svr.batch_id = sbd.max_batch_id 
          AND svr.state = sbd.state 
          AND svr.request_date = sbd.request_date
        ORDER BY svr.created_at DESC
        LIMIT 10000
      `;
    }
    
    const records = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // If specific date/state requested but no data found, return appropriate message
    if (date && state && records.length === 0) {
      return res.json({
        success: false,
        message: `No SBI data available for ${state} on ${date}`,
        availableDates: await getAvailableDates(db, state),
        data: {
          records: [],
          totalRecords: 0,
          statistics: { summary: [], stateDistribution: [] }
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Get summary statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT state) as total_states,
        COUNT(DISTINCT request_date) as total_dates,
        COUNT(DISTINCT batch_id) as total_batches,
        verification_type,
        COUNT(*) as type_count
      FROM sbi_verification_records 
      GROUP BY verification_type
    `;
    
    const stats = await new Promise((resolve, reject) => {
      db.all(statsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Get state-wise distribution
    const stateStatsQuery = `
      SELECT 
        state,
        COUNT(*) as record_count,
        COUNT(DISTINCT request_date) as date_count,
        MAX(created_at) as latest_update
      FROM sbi_verification_records 
      WHERE state IS NOT NULL
      GROUP BY state
      ORDER BY record_count DESC
    `;
    
    const stateStats = await new Promise((resolve, reject) => {
      db.all(stateStatsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      data: {
        records: records,
        totalRecords: records.length,
        statistics: {
          summary: stats,
          stateDistribution: stateStats
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Fetch all SBI records failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get verification methods statistics (IRIS, Fingerprint, Face Auth)
 * Enhanced version with Jeevan Praman integration
 * GET /api/sbi/verification-methods
 */
router.get('/verification-methods', async (req, res) => {
  try {
    const { database } = require('../config/database');
    const JeevanPramanAPI = require('../utils/jeevanPramanAPI');
    const db = database.getDB();
    
    // Initialize results
    const verificationMethods = {
      IRIS: 0,
      Fingerprint: 0,
      'Face Auth': 0,
      DLC: 0,
      PLC: 0,
      Other: 0
    };
    
    const sources = {
      sbi: { success: false, data: {} },
      jeevanPraman: { success: false, data: {} },
      pensionMaster: { success: false, data: {} }
    };
    
    // 1. Query SBI verification records
    try {
      const sbiQuery = `
        SELECT 
          verification_type,
          COUNT(*) as count
        FROM sbi_verification_records 
        GROUP BY verification_type
        ORDER BY count DESC
      `;
      
      const sbiRows = await new Promise((resolve, reject) => {
        db.all(sbiQuery, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      sources.sbi.success = true;
      sources.sbi.data = sbiRows;
      
      // Process SBI results
      sbiRows.forEach(row => {
        const type = row.verification_type?.toUpperCase();
        if (type === 'DLC') {
          verificationMethods.DLC += row.count;
        } else if (type === 'PLC') {
          verificationMethods.PLC += row.count;
        } else {
          verificationMethods.Other += row.count;
        }
      });
      
    } catch (sbiError) {
      console.warn('SBI data query failed:', sbiError.message);
      sources.sbi.error = sbiError.message;
    }
    
    // 2. Query existing pension master data for additional verification info
    try {
      const pensionQuery = `
        SELECT 
          bank_name,
          COUNT(*) as count,
          CASE 
            WHEN bank_name LIKE '%SBI%' THEN 'SBI_DLC'
            WHEN PSA LIKE '%IRIS%' OR PSA LIKE '%BIOMETRIC%' THEN 'BIOMETRIC'
            ELSE 'TRADITIONAL'
          END as inferred_method
        FROM pensioner_bank_master 
        WHERE bank_name IS NOT NULL
        GROUP BY inferred_method
        ORDER BY count DESC
      `;
      
      const pensionRows = await new Promise((resolve, reject) => {
        db.all(pensionQuery, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      sources.pensionMaster.success = true;
      sources.pensionMaster.data = pensionRows;
      
      // Infer biometric methods from pension data
      pensionRows.forEach(row => {
        if (row.inferred_method === 'BIOMETRIC') {
          // Distribute biometric records across IRIS, Fingerprint, Face Auth
          // Based on typical usage patterns in India
          const total = row.count;
          verificationMethods.IRIS += Math.floor(total * 0.4); // 40% IRIS
          verificationMethods.Fingerprint += Math.floor(total * 0.5); // 50% Fingerprint
          verificationMethods['Face Auth'] += Math.floor(total * 0.1); // 10% Face Auth
        }
      });
      
    } catch (pensionError) {
      console.warn('Pension master data query failed:', pensionError.message);
      sources.pensionMaster.error = pensionError.message;
    }
    
    // 3. Try to fetch recent Jeevan Praman data (optional)
    try {
      const jpAPI = new JeevanPramanAPI();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const testDate = yesterday.toISOString().split('T')[0];
      
      // This is a test call - in production you'd have stored JP data
      const jpResult = await jpAPI.fetchPensionerReport(testDate);
      
      if (jpResult.success && jpResult.data) {
        sources.jeevanPraman.success = true;
        sources.jeevanPraman.data = {
          date: testDate,
          recordCount: jpResult.count,
          sampleRecord: jpResult.data[0] || null
        };
        
        // If JP data has biometric info, process it
        if (jpResult.data.length > 0) {
          jpResult.data.forEach(record => {
            // Check if record has biometric method info
            if (record.authMethod || record.verification_method) {
              const method = (record.authMethod || record.verification_method).toUpperCase();
              if (method.includes('IRIS')) {
                verificationMethods.IRIS++;
              } else if (method.includes('FINGER')) {
                verificationMethods.Fingerprint++;
              } else if (method.includes('FACE')) {
                verificationMethods['Face Auth']++;
              }
            }
          });
        }
      }
      
    } catch (jpError) {
      console.warn('Jeevan Praman API call failed (optional):', jpError.message);
      sources.jeevanPraman.error = jpError.message;
    }
    
    // Calculate totals
    const totalVerifications = Object.values(verificationMethods).reduce((sum, count) => sum + count, 0);
    
    res.json({
      success: true,
      verificationMethods,
      summary: {
        totalVerifications,
        biometricMethods: verificationMethods.IRIS + verificationMethods.Fingerprint + verificationMethods['Face Auth'],
        digitalCertificates: verificationMethods.DLC,
        physicalCertificates: verificationMethods.PLC,
        otherMethods: verificationMethods.Other
      },
      dataSources: sources,
      note: "IRIS, Fingerprint, and Face Auth numbers are inferred from biometric patterns in pension data. For exact counts, integrate with Jeevan Praman Portal API.",
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Get verification methods failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Helper function to get available dates for a state
 */
async function getAvailableDates(db, state) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT DISTINCT request_date, COUNT(*) as record_count
      FROM sbi_verification_records 
      WHERE state = ?
      GROUP BY request_date
      ORDER BY request_date DESC
    `;
    
    db.all(query, [state.toUpperCase()], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = router;
