/**
 * SBI API Configuration
 * Updated with correct IP addresses as provided by Sruti
 */

const sbiConfig = {
  // API Endpoints - Updated with Official SBI UAT URL
  uat: {
    baseUrl: 'https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services',
    environment: 'UAT',
    description: 'SBI Official UAT Environment - Provided by SBI EIS Team'
  },
  
  production: {
    baseUrl: 'https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services',
    environment: 'PRODUCTION',
    description: 'SBI Production Environment (URL to be updated)'
  },
  
  // SFTP Configuration for sample data
  sftp: {
    dev1: {
      host: '202.3.77.166',
      description: 'Dev machine #1'
    },
    dev2: {
      host: '172.30.4.37',
      description: 'Dev machine #2'
    }
  },
  
  // API Configuration - Updated with Official SBI Headers
  api: {
    sourceId: 'DQ',
    destination: 'SPIGOV',
    transactionTypes: {
      DLC: {
        GET_BATCHID: 'GET_BATCHID',
        FETCH_RECORDS: 'FETCH_RECORDS',
        BRANCH_COMMULATIVE: 'BRANCH_COMMULATIVE',
        PENSIONER_LOCATION: 'PENSIONER_LOCATION'
      }
    },
    batchSize: 10000,
    maxResponseSize: 4 * 1024 * 1024, // 4MB
    timeout: 30000, // 30 seconds
    // SBI Headers (AccessToken will be generated dynamically)
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
      // AccessToken will be added dynamically during encryption
    }
  },
  
  // Error Codes
  errorCodes: {
    SUCCESS: '200',
    INPUT_VALIDATION_FAILED: '100',
    DUPLICATE_REFERENCE: '103',
    REFERENCE_VALIDATION_FAILED: '104',
    BAD_REQUEST: '400',
    UNAUTHORIZED: '401',
    DATA_NOT_FOUND: '404',
    LENGTH_VALIDATION_FAILED: '411',
    DATA_SIZE_EXCEEDS: '413',
    INVALID_BATCH_ID: '414',
    INTERNAL_SERVER_ERROR: '500',
    RSA_DECRYPTION_FAILED: 'SI411',
    AES_DECRYPTION_FAILED: 'SI412',
    RSA_SIGNATURE_NOT_VERIFIED: 'SI413',
    HASH_NOT_VERIFIED: 'SI414'
  }
};

module.exports = sbiConfig;
