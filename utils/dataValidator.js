/**
 * Data Validation Utilities for DLC Pension System
 * 
 * This module provides comprehensive data validation functions to filter out
 * invalid data like dummy pincodes, invalid dates, and other irrelevant data.
 */

class DataValidator {
  
  /**
   * List of dummy/invalid pincodes to filter out
   */
  static getInvalidPincodes() {
    return [
      '111111', '999999', '000000', '123456', '654321',
      '11111', '99999', '00000', '12345', '65432',
      '1111', '9999', '0000', '1234', '6543',
      '111', '999', '000', '123', '654',
      '11', '99', '00', '12', '65',
      '1', '9', '0',
      'NA', 'N/A', 'na', 'n/a', 'NULL', 'null',
      'TEST', 'test', 'DUMMY', 'dummy', 'SAMPLE', 'sample'
    ];
  }

  /**
   * List of invalid date patterns to filter out
   */
  static getInvalidDatePatterns() {
    return [
      'CIVIL', 'RAILWAY', 'DEFENCE', 'DEFENSE', 'EPFO', 'DOP',
      'NA', 'N/A', 'na', 'n/a', 'NULL', 'null',
      'TEST', 'test', 'DUMMY', 'dummy', 'SAMPLE', 'sample',
      '1900-01-01', '1901-01-01', '2000-01-01', '2024-01-01',
      '01/01/1900', '01/01/1901', '01/01/2000', '01/01/2024'
    ];
  }

  /**
   * Validate pincode - check if it's a valid Indian pincode
   * @param {string} pincode - The pincode to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static isValidPincode(pincode) {
    if (!pincode || typeof pincode !== 'string') {
      return false;
    }

    const cleanPincode = pincode.toString().trim();
    
    // Check if it's in the invalid list
    if (this.getInvalidPincodes().includes(cleanPincode)) {
      return false;
    }

    // Check if it's a 6-digit number (Indian pincode format)
    const pincodeRegex = /^[1-9][0-9]{5}$/;
    return pincodeRegex.test(cleanPincode);
  }

  /**
   * Validate date of birth - check if it's a valid date
   * @param {string|Date} dob - The date of birth to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static isValidDateOfBirth(dob) {
    if (!dob) {
      return false;
    }

    const dobStr = dob.toString().trim().toUpperCase();
    
    // Check if it contains invalid patterns
    for (const pattern of this.getInvalidDatePatterns()) {
      if (dobStr.includes(pattern.toUpperCase())) {
        return false;
      }
    }

    // Try to parse as date
    try {
      let date;
      
      // Handle different date formats
      if (typeof dob === 'string') {
        // Try different date formats
        const formats = [
          /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
          /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
          /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
          /^\d{4}$/ // YYYY only
        ];

        if (formats[3].test(dobStr)) {
          // Handle year-only format
          const year = parseInt(dobStr);
          if (year >= 1900 && year <= new Date().getFullYear()) {
            return true;
          }
          return false;
        }

        date = new Date(dobStr);
      } else if (dob instanceof Date) {
        date = dob;
      } else {
        return false;
      }

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return false;
      }

      // Check if date is reasonable (not too old or in future)
      const currentYear = new Date().getFullYear();
      const dobYear = date.getFullYear();
      
      if (dobYear < 1900 || dobYear > currentYear) {
        return false;
      }

      // Check if person is not too old (reasonable age limit)
      const age = currentYear - dobYear;
      if (age > 120) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate PPO number - check if it's not empty or invalid
   * @param {string} ppoNumber - The PPO number to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static isValidPPONumber(ppoNumber) {
    if (!ppoNumber || typeof ppoNumber !== 'string') {
      return false;
    }

    const cleanPPO = ppoNumber.toString().trim();
    
    // Check if it's empty or contains invalid patterns
    if (cleanPPO === '' || 
        cleanPPO === 'NA' || 
        cleanPPO === 'N/A' || 
        cleanPPO === 'NULL' || 
        cleanPPO === 'null' ||
        cleanPPO === 'TEST' ||
        cleanPPO === 'DUMMY' ||
        cleanPPO === 'SAMPLE') {
      return false;
    }

    return true;
  }

  /**
   * Validate bank name - check if it's not empty or invalid
   * @param {string} bankName - The bank name to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static isValidBankName(bankName) {
    if (!bankName || typeof bankName !== 'string') {
      return false;
    }

    const cleanBankName = bankName.toString().trim();
    
    // Check if it's empty or contains invalid patterns
    if (cleanBankName === '' || 
        cleanBankName === 'NA' || 
        cleanBankName === 'N/A' || 
        cleanBankName === 'NULL' || 
        cleanBankName === 'null' ||
        cleanBankName === 'TEST' ||
        cleanBankName === 'DUMMY' ||
        cleanBankName === 'SAMPLE') {
      return false;
    }

    return true;
  }

  /**
   * Validate state name - check if it's not empty or invalid
   * @param {string} state - The state name to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static isValidState(state) {
    if (!state || typeof state !== 'string') {
      return false;
    }

    const cleanState = state.toString().trim();
    
    // Check if it's empty or contains invalid patterns
    if (cleanState === '' || 
        cleanState === 'NA' || 
        cleanState === 'N/A' || 
        cleanState === 'NULL' || 
        cleanState === 'null' ||
        cleanState === 'TEST' ||
        cleanState === 'DUMMY' ||
        cleanState === 'SAMPLE') {
      return false;
    }

    return true;
  }

  /**
   * Validate city name - check if it's not empty or invalid
   * @param {string} city - The city name to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static isValidCity(city) {
    if (!city || typeof city !== 'string') {
      return false;
    }

    const cleanCity = city.toString().trim();
    
    // Check if it's empty or contains invalid patterns
    if (cleanCity === '' || 
        cleanCity === 'NA' || 
        cleanCity === 'N/A' || 
        cleanCity === 'NULL' || 
        cleanCity === 'null' ||
        cleanCity === 'TEST' ||
        cleanCity === 'DUMMY' ||
        cleanCity === 'SAMPLE') {
      return false;
    }

    return true;
  }

  /**
   * Validate PSA category - check if it's valid
   * @param {string} psa - The PSA category to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static isValidPSA(psa) {
    if (!psa || typeof psa !== 'string') {
      return false;
    }

    const cleanPSA = psa.toString().trim().toUpperCase();
    const validPSACategories = ['EPFO', 'DOP', 'RAILWAY', 'DEFENSE', 'CIVIL', 'OTHER'];
    
    return validPSACategories.includes(cleanPSA);
  }

  /**
   * Validate a complete pensioner record
   * @param {Object} record - The pensioner record to validate
   * @returns {Object} - Validation result with isValid flag and errors array
   */
  static validatePensionerRecord(record) {
    const errors = [];
    let isValid = true;

    // Validate PPO number (required)
    if (!this.isValidPPONumber(record.ppo_number)) {
      errors.push('Invalid PPO number');
      isValid = false;
    }

    // Validate bank name (required)
    if (!this.isValidBankName(record.bank_name)) {
      errors.push('Invalid bank name');
      isValid = false;
    }

    // Validate state (required)
    if (!this.isValidState(record.state)) {
      errors.push('Invalid state');
      isValid = false;
    }

    // Validate city (required)
    if (!this.isValidCity(record.pensioner_city)) {
      errors.push('Invalid city');
      isValid = false;
    }

    // Validate pincode (required)
    if (!this.isValidPincode(record.pensioner_postcode)) {
      errors.push('Invalid pincode');
      isValid = false;
    }

    // Validate date of birth (optional but if present should be valid)
    if (record.pensioner_dob && !this.isValidDateOfBirth(record.pensioner_dob)) {
      errors.push('Invalid date of birth');
      isValid = false;
    }

    // Validate PSA (optional but if present should be valid)
    if (record.psa && !this.isValidPSA(record.psa)) {
      errors.push('Invalid PSA category');
      isValid = false;
    }

    return {
      isValid,
      errors
    };
  }

  /**
   * Get SQL WHERE clause for filtering invalid data
   * @returns {string} - SQL WHERE clause
   */
  static getDataFilteringClause() {
    const invalidPincodes = this.getInvalidPincodes().map(p => `'${p}'`).join(', ');
    
    return `
      AND ppo_number IS NOT NULL 
      AND ppo_number != '' 
      AND ppo_number NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')
      AND bank_name IS NOT NULL 
      AND bank_name != '' 
      AND bank_name NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')
      AND state IS NOT NULL 
      AND state != '' 
      AND state NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')
      AND pensioner_city IS NOT NULL 
      AND pensioner_city != '' 
      AND pensioner_city NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')
      AND pensioner_postcode IS NOT NULL 
      AND pensioner_postcode != '' 
      AND pensioner_postcode NOT IN (${invalidPincodes})
      AND (pensioner_dob IS NULL OR pensioner_dob = '' OR 
           (pensioner_dob NOT LIKE '%CIVIL%' 
            AND pensioner_dob NOT LIKE '%RAILWAY%' 
            AND pensioner_dob NOT LIKE '%DEFENCE%' 
            AND pensioner_dob NOT LIKE '%DEFENSE%'
            AND pensioner_dob NOT LIKE '%EPFO%'
            AND pensioner_dob NOT LIKE '%DOP%'
            AND pensioner_dob NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')))
    `;
  }

  /**
   * Get SQL WHERE clause for filtering invalid pincodes only
   * @returns {string} - SQL WHERE clause for pincode filtering
   */
  static getPincodeFilteringClause() {
    const invalidPincodes = this.getInvalidPincodes().map(p => `'${p}'`).join(', ');
    return `AND pensioner_postcode NOT IN (${invalidPincodes})`;
  }

  /**
   * Get SQL WHERE clause for filtering invalid dates only
   * @returns {string} - SQL WHERE clause for date filtering
   */
  static getDateFilteringClause() {
    return `
      AND (pensioner_dob IS NULL OR pensioner_dob = '' OR 
           (pensioner_dob NOT LIKE '%CIVIL%' 
            AND pensioner_dob NOT LIKE '%RAILWAY%' 
            AND pensioner_dob NOT LIKE '%DEFENCE%' 
            AND pensioner_dob NOT LIKE '%DEFENSE%'
            AND pensioner_dob NOT LIKE '%EPFO%'
            AND pensioner_dob NOT LIKE '%DOP%'
            AND pensioner_dob NOT IN ('NA', 'N/A', 'NULL', 'TEST', 'DUMMY', 'SAMPLE')))
    `;
  }
}

module.exports = DataValidator;
