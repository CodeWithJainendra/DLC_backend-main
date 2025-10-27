/**
 * SBI Data Converter
 * Utility for converting SBI API data formats
 */

class SBIDataConverter {
  /**
   * Convert SBI API response to standard format
   * @param {Object} sbiResponse - Raw SBI API response
   * @returns {Object} Converted data
   */
  static convertSBIResponse(sbiResponse) {
    try {
      if (!sbiResponse) {
        return {
          success: false,
          error: 'No response data provided'
        };
      }

      return {
        success: true,
        data: sbiResponse,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Convert batch data to SBI format
   * @param {Array} batchData - Batch data array
   * @returns {Object} Converted batch data
   */
  static convertBatchData(batchData) {
    try {
      if (!Array.isArray(batchData)) {
        return {
          success: false,
          error: 'Batch data must be an array'
        };
      }

      return {
        success: true,
        batchCount: batchData.length,
        data: batchData,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Convert records data to standard format
   * @param {Array} records - Records array
   * @returns {Object} Converted records data
   */
  static convertRecordsData(records) {
    try {
      if (!Array.isArray(records)) {
        return {
          success: false,
          error: 'Records must be an array'
        };
      }

      return {
        success: true,
        recordCount: records.length,
        records: records,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Format error response
   * @param {string} message - Error message
   * @param {Object} details - Error details
   * @returns {Object} Formatted error response
   */
  static formatError(message, details = {}) {
    return {
      success: false,
      error: message,
      details: details,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format success response
   * @param {Object} data - Success data
   * @param {string} message - Success message
   * @returns {Object} Formatted success response
   */
  static formatSuccess(data, message = 'Operation successful') {
    return {
      success: true,
      message: message,
      data: data,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SBIDataConverter;
