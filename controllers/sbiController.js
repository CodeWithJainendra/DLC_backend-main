const SBIDOPPWModel = require('../models/SBIDOPPWModel');
const SBIEncryption = require('../utils/sbiEncryption');
const SBIGen6Encryption = require('../utils/sbiGen6Encryption');
const sbiConfig = require('../config/sbiConfig');
const { validationResult } = require('express-validator');

class SBIController {
  constructor() {
    this.encryption = new SBIEncryption();
    this.gen6Encryption = new SBIGen6Encryption();
  }

  /**
   * Handle SBI API wrapper service
   * This is the main entry point for SBI API calls
   */
  static async handleSBIWrapper(req, res) {
    try {
      const controller = new SBIController();
      
      // Decrypt and validate the request
      const decryptionResult = controller.encryption.decryptRequest(req.body);
      
      if (!decryptionResult.success) {
        return res.status(400).json({
          RESPONSE_STATUS: "1",
          ERROR_CODE: "SI411",
          ERROR_DESCRIPTION: decryptionResult.error,
          REQUEST_REFERENCE_NUMBER: req.body.REQUEST_REFERENCE_NUMBER || "",
          RESPONSE_DATE: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour12: false })
        });
      }

      const { request, referenceNumber } = decryptionResult;
      const { DESTINATION, TXN_TYPE, TXN_SUB_TYPE, EIS_PAYLOAD } = request;

      // Validate request structure
      if (!DESTINATION || !TXN_TYPE || !TXN_SUB_TYPE || !EIS_PAYLOAD) {
        return res.status(400).json({
          RESPONSE_STATUS: "1",
          ERROR_CODE: "SI011",
          ERROR_DESCRIPTION: "MISSING FIELD <EIS_PAYLOAD>",
          REQUEST_REFERENCE_NUMBER: referenceNumber,
          RESPONSE_DATE: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour12: false })
        });
      }

      // Route to appropriate handler based on transaction type and sub-type
      let response;
      switch (TXN_TYPE) {
        case 'DLC':
          switch (TXN_SUB_TYPE) {
            case 'GET_BATCHID':
              response = await controller.handleGetBatchId(EIS_PAYLOAD);
              break;
            case 'FETCH_RECORDS':
              response = await controller.handleFetchRecords(EIS_PAYLOAD);
              break;
            default:
              response = {
                RESPONSE_STATUS: "1",
                ERROR_CODE: "SI011",
                ERROR_DESCRIPTION: "INVALID TXN_SUB_TYPE"
              };
          }
          break;
        default:
          response = {
            RESPONSE_STATUS: "1",
            ERROR_CODE: "SI011",
            ERROR_DESCRIPTION: "INVALID TXN_TYPE"
          };
      }

      // Create encrypted response
      const encryptedResponse = controller.encryption.createEncryptedResponse(response, referenceNumber);
      res.json(encryptedResponse);

    } catch (error) {
      // SBI Wrapper Error
      res.status(500).json({
        RESPONSE_STATUS: "1",
        ERROR_CODE: "SI599",
        ERROR_DESCRIPTION: "UNABLE TO PROCESS DUE TO TECHNICAL ERROR",
        REQUEST_REFERENCE_NUMBER: req.body.REQUEST_REFERENCE_NUMBER || "",
        RESPONSE_DATE: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour12: false })
      });
    }
  }

  /**
   * Handle GET_BATCHID request
   * @param {Object} payload - EIS payload
   * @returns {Object} Response object
   */
  async handleGetBatchId(payload) {
    try {
      const { REQEST_REFERENCE_NUMBER, REQUEST_TYPE, STATE, REQ_DATE } = payload;

      // Validate required fields
      if (!STATE || !REQ_DATE) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "SI011",
          ERROR_DESCRIPTION: "MISSING FIELD <STATE> or <REQ_DATE>"
        };
      }

      // Validate date format (DD-MM-YYYY)
      const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!dateRegex.test(REQ_DATE)) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "SI011",
          ERROR_DESCRIPTION: "INVALID DATE FORMAT. Expected DD-MM-YYYY"
        };
      }

      // Convert date to YYYY-MM-DD format for database
      const [day, month, year] = REQ_DATE.split('-');
      const dbDate = `${year}-${month}-${day}`;

      // Get batch information
      const batchInfo = await SBIDOPPWModel.getBatchIds(STATE, dbDate);

      if (batchInfo.total_records === 0) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "404",
          ERROR_DESCRIPTION: "Data not Found"
        };
      }

      // Create response data
      const responseData = {
        STATE: STATE,
        DATE: REQ_DATE,
        Max_BatchID: batchInfo.total_batches.toString()
      };

      return {
        RESPONSE_STATUS: "0",
        ERROR_CODE: "",
        ERROR_DESCRIPTION: "",
        EIS_RESPONSE: {
          data: JSON.stringify(responseData),
          responsE_CODE: "200",
          responsE_MESSAGE: "OK"
        }
      };

    } catch (error) {
      // Get Batch ID Error
      return {
        RESPONSE_STATUS: "1",
        ERROR_CODE: "SI599",
        ERROR_DESCRIPTION: "UNABLE TO PROCESS DUE TO TECHNICAL ERROR"
      };
    }
  }

  /**
   * Handle FETCH_RECORDS request
   * @param {Object} payload - EIS payload
   * @returns {Object} Response object
   */
  async handleFetchRecords(payload) {
    try {
      const { REQEST_REFERENCE_NUMBER, REQUEST_TYPE, STATE, REQ_DATE, BATCH_ID } = payload;

      // Validate required fields
      if (!STATE || !REQ_DATE || !BATCH_ID) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "SI011",
          ERROR_DESCRIPTION: "MISSING FIELD <STATE>, <REQ_DATE> or <BATCH_ID>"
        };
      }

      // Validate date format (DD-MM-YYYY)
      const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!dateRegex.test(REQ_DATE)) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "SI011",
          ERROR_DESCRIPTION: "INVALID DATE FORMAT. Expected DD-MM-YYYY"
        };
      }

      // Validate batch ID
      const batchId = parseInt(BATCH_ID);
      if (isNaN(batchId) || batchId < 1) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "414",
          ERROR_DESCRIPTION: "Invalid Batch Id"
        };
      }

      // Convert date to YYYY-MM-DD format for database
      const [day, month, year] = REQ_DATE.split('-');
      const dbDate = `${year}-${month}-${day}`;

      // Get verification records
      const records = await SBIDOPPWModel.getVerificationRecords(STATE, dbDate, batchId);

      if (records.length === 0) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "404",
          ERROR_DESCRIPTION: "Data not Found"
        };
      }

      // Check if response size exceeds 4MB limit
      const responseData = {
        STATE: STATE,
        DATE: REQ_DATE,
        Verification_Records: records
      };

      const responseString = JSON.stringify(responseData);
      const responseSize = Buffer.byteLength(responseString, 'utf8');
      const maxSize = 4 * 1024 * 1024; // 4MB

      if (responseSize > maxSize) {
        return {
          RESPONSE_STATUS: "1",
          ERROR_CODE: "413",
          ERROR_DESCRIPTION: "Data Size Exceeds"
        };
      }

      return {
        RESPONSE_STATUS: "0",
        ERROR_CODE: "",
        ERROR_DESCRIPTION: "",
        EIS_RESPONSE: {
          data: responseString,
          responsE_CODE: "200",
          responsE_MESSAGE: "OK"
        }
      };

    } catch (error) {
      // Fetch Records Error
      return {
        RESPONSE_STATUS: "1",
        ERROR_CODE: "SI599",
        ERROR_DESCRIPTION: "UNABLE TO PROCESS DUE TO TECHNICAL ERROR"
      };
    }
  }

  /**
   * Populate DLC data (for scheduled job)
   */
  static async populateDLCData(req, res) {
    try {
      const dataDate = req.body.data_date || new Date().toISOString().split('T')[0];
      const result = await SBIDOPPWModel.populateDLCData(dataDate);
      
      res.json({
        success: true,
        message: 'DLC data populated successfully',
        result: result
      });
    } catch (error) {
      // Populate DLC Data Error
      res.status(500).json({
        success: false,
        message: 'Failed to populate DLC data',
        error: error.message
      });
    }
  }

  /**
   * Populate real data from existing pensioner database
   */
  static async populateRealData(req, res) {
    try {
      const result = await SBIDOPPWModel.insertSampleData();
      
      res.json({
        success: true,
        message: 'Real data populated successfully from existing pensioner database',
        result: result
      });
    } catch (error) {
      // Populate Real Data Error
      res.status(500).json({
        success: false,
        message: 'Failed to populate real data',
        error: error.message
      });
    }
  }

  /**
   * Get available states for testing
   */
  static async getAvailableStates(req, res) {
    try {
      const states = await SBIDOPPWModel.getAvailableStates();
      
      res.json({
        success: true,
        states: states
      });
    } catch (error) {
      // Get Available States Error
      res.status(500).json({
        success: false,
        message: 'Failed to get available states',
        error: error.message
      });
    }
  }

  /**
   * Get available dates for testing
   */
  static async getAvailableDates(req, res) {
    try {
      const dates = await SBIDOPPWModel.getAvailableDates();
      
      res.json({
        success: true,
        dates: dates
      });
    } catch (error) {
      // Get Available Dates Error
      res.status(500).json({
        success: false,
        message: 'Failed to get available dates',
        error: error.message
      });
    }
  }

  /**
   * Test SBI API with sample request
   */
  static async testSBIAPI(req, res) {
    try {
      const controller = new SBIController();
      
      // Create sample request
      const sampleRequest = {
        SOURCE_ID: "DQ",
        EIS_PAYLOAD: {
          REQEST_REFERENCE_NUMBER: "CPPCDOPP273202569452665",
          REQUEST_TYPE: "Batch_ID",
          STATE: "NCT OF DELHI",
          REQ_DATE: "30-09-2025"
        },
        REQUEST_REFERENCE_NUMBER: "SBIDQ25129172451744455230",
        DESTINATION: "SPIGOV",
        TXN_TYPE: "DLC",
        TXN_SUB_TYPE: "GET_BATCHID"
      };

      // Create encrypted request
      const encryptedRequest = controller.encryption.createEncryptedRequest(sampleRequest);
      
      res.json({
        success: true,
        message: 'Sample encrypted request created',
        sample_request: sampleRequest,
        encrypted_request: encryptedRequest
      });
    } catch (error) {
      // Test SBI API Error
      res.status(500).json({
        success: false,
        message: 'Failed to create test request',
        error: error.message
      });
    }
  }
}

module.exports = SBIController;
