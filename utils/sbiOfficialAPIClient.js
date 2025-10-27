const axios = require('axios');
const https = require('https');
const SBIOfficialCertificateHandler = require('./sbiOfficialCertificateHandler');
const SBIDataModel = require('../models/SBIDataModel');

/**
 * SBI Official API Client
 * 
 * Implements integration with SBI's official UAT endpoint:
 * https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services
 * 
 * Services available:
 * 1. GET_BATCHID - Get batch ID for DLC data
 * 2. FETCH_RECORDS - Fetch DLC records using batch ID
 * 
 * SOURCE_ID: DQ (for DoPPW)
 * DESTINATION: SPIGOV
 */
class SBIOfficialAPIClient {
  constructor() {
    // SBI UAT endpoint
    this.baseURL = 'https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services';
    
    // Initialize certificate handler
    this.certHandler = new SBIOfficialCertificateHandler();
    
    // Service configuration
    this.config = {
      sourceId: 'DQ',
      destination: 'SPIGOV',
      timeout: 30000, // 30 seconds
      maxRetries: 3
    };
    
    // Create HTTPS agent for certificate handling
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // For UAT environment
      keepAlive: true,
      timeout: this.config.timeout,
      family: 4, // Force IPv4
      lookup: require('dns').lookup // Use system DNS resolver
    });
    
    console.log('\n🏦 SBI Official API Client Initialized');
    console.log(`📍 Base URL: ${this.baseURL}`);
    console.log(`🆔 Source ID: ${this.config.sourceId}`);
    console.log(`🎯 Destination: ${this.config.destination}`);
  }

  /**
   * Make encrypted API call to SBI
   */
  async makeEncryptedAPICall(requestData, txnType, txnSubType) {
    try {
      console.log(`\n🚀 Making SBI API Call: ${txnType}/${txnSubType}`);
      console.log('=' * 60);
      
      // Add transaction routing information
      const enhancedRequestData = {
        ...requestData,
        TXN_TYPE: txnType,
        TXN_SUB_TYPE: txnSubType,
        SOURCE_ID: this.config.sourceId,
        DESTINATION: this.config.destination
      };
      
      // Create encrypted request
      const encryptedRequest = this.certHandler.createSBIEncryptedRequest(
        enhancedRequestData, 
        this.config.sourceId
      );
      
      console.log(`📤 Sending request to: ${this.baseURL}`);
      console.log(`📋 Request Reference: ${encryptedRequest.body.REQUEST_REFERENCE_NUMBER}`);
      
      // Make HTTP request
      const response = await axios.post(this.baseURL, encryptedRequest.body, {
        headers: encryptedRequest.headers,
        httpsAgent: this.httpsAgent,
        timeout: this.config.timeout,
        validateStatus: (status) => status < 500 // Accept 4xx as valid responses
      });
      
      console.log(`📥 Response received - Status: ${response.status}`);
      console.log(`📊 Response headers:`, response.headers);
      
      // Process response
      return this.processResponse(response, encryptedRequest.secretKey);
      
    } catch (error) {
      console.error('❌ SBI API call failed:', error.message);
      
      if (error.response) {
        console.error(`📥 Error response status: ${error.response.status}`);
        console.error(`📄 Error response data:`, error.response.data);
      }
      
      throw new Error(`SBI API call failed: ${error.message}`);
    }
  }

  /**
   * Process SBI API response
   */
  processResponse(response, secretKey) {
    try {
      const responseData = response.data;
      
      console.log('📋 Processing SBI response...');
      
      // Check if response is encrypted
      if (responseData.RESPONSE && typeof responseData.RESPONSE === 'string') {
        console.log('🔓 Decrypting response...');
        
        try {
          const decryptedResponse = this.certHandler.decryptSBIResponse(
            responseData.RESPONSE, 
            secretKey
          );
          
          // Parse decrypted JSON
          const parsedResponse = JSON.parse(decryptedResponse);
          
          return {
            success: true,
            status: response.status,
            requestReference: responseData.REQUEST_REFERENCE_NUMBER,
            responseDate: responseData.RESPONSE_DATE,
            data: parsedResponse,
            encrypted: true,
            raw: responseData
          };
          
        } catch (decryptError) {
          console.warn('⚠️ Response decryption failed, treating as plain text');
          
          return {
            success: true,
            status: response.status,
            requestReference: responseData.REQUEST_REFERENCE_NUMBER,
            responseDate: responseData.RESPONSE_DATE,
            data: responseData.RESPONSE,
            encrypted: false,
            raw: responseData
          };
        }
      } else {
        // Plain text response
        return {
          success: true,
          status: response.status,
          data: responseData,
          encrypted: false,
          raw: responseData
        };
      }
      
    } catch (error) {
      console.error('❌ Response processing failed:', error.message);
      throw new Error(`Response processing failed: ${error.message}`);
    }
  }

  /**
   * Get Batch ID for DLC data
   * Service: GET_BATCHID
   * As per SBI specification: TXN_TYPE=DLC, TXN_SUB_TYPE=GET_BATCHID
   */
  async getBatchId(state, requestDate) {
    try {
      console.log(`\n📋 Getting Batch ID for State: ${state}, Date: ${requestDate}`);
      
      // Generate request reference as per SBI document format: CPPC + DOPP + Dddyyyy + 00000001
      const now = new Date();
      const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
      const year = now.getFullYear();
      const sequence = String(Math.floor(Math.random() * 99999999) + 1).padStart(8, '0');
      const eisRequestRef = `CPPCDOPP${String(dayOfYear).padStart(3, '0')}${year}${sequence}`;
      
      const requestData = {
        EIS_PAYLOAD: {
          REQEST_REFERENCE_NUMBER: eisRequestRef,
          REQUEST_TYPE: "Batch_ID",
          STATE: state.trim().toUpperCase(),
          REQ_DATE: requestDate
        }
      };
      
      const response = await this.makeEncryptedAPICall(
        requestData, 
        'DLC', 
        'GET_BATCHID'
      );
      
      // Save batch data to database
      try {
        if (response.data && response.data.EIS_RESPONSE) {
          const batchData = {
            state: state.trim().toUpperCase(),
            requestDate: requestDate,
            maxBatchId: null,
            responseCode: response.data.EIS_RESPONSE.responsE_CODE,
            responseMessage: response.data.EIS_RESPONSE.responsE_MESSAGE,
            requestReference: response.requestReference,
            responseDate: response.responseDate,
            rawResponse: response.raw
          };
          
          // Extract max batch ID from response data
          if (response.data.EIS_RESPONSE.data) {
            try {
              const parsedData = JSON.parse(response.data.EIS_RESPONSE.data);
              batchData.maxBatchId = parsedData.Max_BatchID || parsedData.max_batch_id;
            } catch (parseError) {
              console.warn('⚠️ Could not parse batch data:', parseError.message);
            }
          }
          
          await SBIDataModel.saveBatchIdData(batchData);
          console.log('💾 Batch data saved to database');
        }
      } catch (dbError) {
        console.error('⚠️ Database save failed (continuing):', dbError.message);
      }
      
      console.log('✅ Batch ID request completed');
      return response;
      
    } catch (error) {
      console.error('❌ Get Batch ID failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch DLC records using batch ID
   * Service: FETCH_RECORDS
   * As per SBI specification: TXN_TYPE=DLC, TXN_SUB_TYPE=FETCH_RECORDS
   */
  async fetchRecords(batchId, state, requestDate) {
    try {
      console.log(`\n📊 Fetching Records for Batch ID: ${batchId}`);
      
      // Generate request reference as per SBI document format: CPPC + DOPP + Dddyyyy + 00000001
      const now = new Date();
      const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
      const year = now.getFullYear();
      const sequence = String(Math.floor(Math.random() * 99999999) + 1).padStart(8, '0');
      const eisRequestRef = `CPPCDOPP${String(dayOfYear).padStart(3, '0')}${year}${sequence}`;
      
      const requestData = {
        EIS_PAYLOAD: {
          REQEST_REFERENCE_NUMBER: eisRequestRef,
          REQUEST_TYPE: "Verification_Records",
          STATE: state.trim().toUpperCase(),
          REQ_DATE: requestDate,
          BATCH_ID: batchId.toString()
        }
      };
      
      const response = await this.makeEncryptedAPICall(
        requestData, 
        'DLC', 
        'FETCH_RECORDS'
      );
      
      // Save verification records to database
      try {
        if (response.data && response.data.EIS_RESPONSE && response.data.EIS_RESPONSE.data) {
          const parsedData = JSON.parse(response.data.EIS_RESPONSE.data);
          
          if (parsedData.Verification_Records && Array.isArray(parsedData.Verification_Records)) {
            const recordsData = {
              state: state.trim().toUpperCase(),
              requestDate: requestDate,
              batchId: batchId,
              verificationRecords: parsedData.Verification_Records,
              requestReference: response.requestReference,
              responseDate: response.responseDate
            };
            
            const saveResult = await SBIDataModel.saveVerificationRecords(recordsData);
            console.log(`💾 Saved ${saveResult.saved} verification records to database`);
          }
        }
      } catch (dbError) {
        console.error('⚠️ Database save failed (continuing):', dbError.message);
      }
      
      console.log('✅ Fetch records request completed');
      return response;
      
    } catch (error) {
      console.error('❌ Fetch records failed:', error.message);
      throw error;
    }
  }

  /**
   * Complete DLC data fetch workflow
   * 1. Get batch ID
   * 2. Fetch records using batch ID
   */
  async fetchDLCData(state, requestDate) {
    try {
      console.log(`\n🔄 Starting complete DLC data fetch workflow`);
      console.log(`📍 State: ${state}`);
      console.log(`📅 Date: ${requestDate}`);
      console.log('=' * 60);
      
      // Step 1: Get batch ID
      console.log('📋 Step 1: Getting Batch ID...');
      const batchResponse = await this.getBatchId(state, requestDate);
      
      if (!batchResponse.success) {
        throw new Error('Failed to get batch ID');
      }
      
      // Extract batch ID from response
      let batchId;
      
      // Check if response has EIS_RESPONSE structure
      if (batchResponse.data && batchResponse.data.EIS_RESPONSE) {
        const eisResponse = batchResponse.data.EIS_RESPONSE;
        
        // Check if data field contains JSON string
        if (eisResponse.data && typeof eisResponse.data === 'string') {
          try {
            const parsedData = JSON.parse(eisResponse.data);
            batchId = parsedData.Max_BatchID;
          } catch (parseError) {
            console.warn('Failed to parse EIS_RESPONSE.data as JSON');
          }
        }
        
        // Fallback: check direct fields
        if (!batchId && eisResponse.Max_BatchID) {
          batchId = eisResponse.Max_BatchID;
        }
      }
      
      // Fallback: check direct data fields
      if (!batchId && batchResponse.data) {
        if (batchResponse.data.BATCH_ID) {
          batchId = batchResponse.data.BATCH_ID;
        } else if (batchResponse.data.Max_BatchID) {
          batchId = batchResponse.data.Max_BatchID;
        } else if (typeof batchResponse.data === 'string') {
          // Try to parse batch ID from string response
          const batchMatch = batchResponse.data.match(/(Max_)?BATCH_ID["\s]*:[\s]*["']?([^"',\s}]+)/i);
          batchId = batchMatch ? batchMatch[2] : null;
        }
      }
      
      if (!batchId) {
        console.warn('Batch ID not found in response. Response structure:', JSON.stringify(batchResponse.data, null, 2));
        // For testing purposes, use a default batch ID
        batchId = "1";
        console.log(`⚠️ Using default batch ID: ${batchId}`);
      }
      
      console.log(`✅ Batch ID obtained: ${batchId}`);
      
      // Step 2: Fetch records
      console.log('📊 Step 2: Fetching Records...');
      const recordsResponse = await this.fetchRecords(batchId, state, requestDate);
      
      if (!recordsResponse.success) {
        throw new Error('Failed to fetch records');
      }
      
      console.log('✅ Complete DLC data fetch workflow completed');
      
      return {
        success: true,
        batchId,
        batchResponse,
        recordsResponse,
        summary: {
          state,
          requestDate,
          batchId,
          recordCount: Array.isArray(recordsResponse.data) ? recordsResponse.data.length : 'Unknown',
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('❌ Complete DLC data fetch failed:', error.message);
      throw error;
    }
  }

  /**
   * Test SBI API connectivity and certificate setup
   */
  async testConnection() {
    try {
      console.log('\n🧪 Testing SBI API Connection');
      console.log('=' * 50);
      
      // Test with sample data
      const testState = "NCT OF DELHI";
      const testDate = new Date().toISOString().split('T')[0].split('-').reverse().join('-'); // DD-MM-YYYY
      
      console.log(`🧪 Test parameters:`);
      console.log(`   State: ${testState}`);
      console.log(`   Date: ${testDate}`);
      
      // Test certificate setup
      console.log('\n🔐 Testing certificate setup...');
      const testResult = this.certHandler.testImplementation();
      
      if (!testResult.metadata.selfVerification) {
        throw new Error('Certificate self-verification failed');
      }
      
      console.log('✅ Certificate setup test passed');
      
      // Test API connectivity
      console.log('\n🌐 Testing API connectivity...');
      const connectivityResult = await this.getBatchId(testState, testDate);
      
      console.log('✅ SBI API connection test completed');
      
      return {
        success: true,
        certificateTest: testResult.metadata.selfVerification,
        apiConnectivity: connectivityResult.success,
        testParameters: {
          state: testState,
          date: testDate
        },
        response: connectivityResult
      };
      
    } catch (error) {
      console.error('❌ SBI API connection test failed:', error.message);
      
      return {
        success: false,
        error: error.message,
        certificateTest: false,
        apiConnectivity: false
      };
    }
  }

  /**
   * Health check for SBI API service
   */
  async healthCheck() {
    try {
      console.log('🏥 SBI API Health Check');
      
      const startTime = Date.now();
      
      // Simple connectivity test
      const testResponse = await axios.get(this.baseURL.replace('/services', '/health'), {
        httpsAgent: this.httpsAgent,
        timeout: 5000,
        validateStatus: () => true // Accept any status for health check
      }).catch(() => ({ status: 'unreachable' }));
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: testResponse.status || 'unreachable',
        responseTime,
        endpoint: this.baseURL,
        timestamp: new Date().toISOString(),
        healthy: testResponse.status && testResponse.status < 500
      };
      
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        endpoint: this.baseURL,
        timestamp: new Date().toISOString(),
        healthy: false
      };
    }
  }
}

module.exports = SBIOfficialAPIClient;
