/**
 * SBI Response Handler - Final Working Version
 * This handles SBI responses correctly based on actual API behavior
 */

const SBIIntegrationFixed = require('./sbi-integration-fixed');

class SBIResponseHandler {
    constructor() {
        this.sbi = new SBIIntegrationFixed();
    }

    /**
     * Process SBI response and extract meaningful data
     * @param {object} responseBody - Raw SBI response
     * @returns {object} Processed response with actual data
     */
    processSBIResponse(responseBody) {
        try {
            console.log('🔍 Processing SBI Response...');
            
            // Check for error responses
            if (responseBody.ERROR_CODE || responseBody.RESPONSE_STATUS === '2') {
                return {
                    success: false,
                    error: responseBody.ERROR_DESCRIPTION || 'Unknown SBI error',
                    errorCode: responseBody.ERROR_CODE,
                    responseStatus: responseBody.RESPONSE_STATUS
                };
            }

            // Check if response has encrypted data
            if (responseBody.RESPONSE && responseBody.DIGI_SIGN) {
                console.log('📦 Response contains encrypted data');
                
                // Try to decode the RESPONSE as base64 to see if it contains readable data
                try {
                    const decodedResponse = Buffer.from(responseBody.RESPONSE, 'base64').toString('utf8');
                    console.log('📝 Base64 decoded response:', decodedResponse.substring(0, 100));
                    
                    // Check if decoded response is JSON
                    if (decodedResponse.startsWith('{') || decodedResponse.startsWith('[')) {
                        try {
                            const jsonData = JSON.parse(decodedResponse);
                            console.log('✅ Successfully parsed decoded response as JSON');
                            return {
                                success: true,
                                data: jsonData,
                                source: 'decoded_base64',
                                rawResponse: responseBody
                            };
                        } catch (jsonError) {
                            console.log('❌ Decoded response is not valid JSON');
                        }
                    }
                    
                    // If not JSON, return as text data
                    return {
                        success: true,
                        data: {
                            responseText: decodedResponse,
                            responseDate: responseBody.RESPONSE_DATE,
                            referenceNumber: responseBody.REQUEST_REFERENCE_NUMBER
                        },
                        source: 'decoded_text',
                        rawResponse: responseBody
                    };
                    
                } catch (decodeError) {
                    console.log('❌ Cannot decode RESPONSE as base64 text');
                }
                
                // If decoding fails, return structured response
                return {
                    success: true,
                    data: {
                        message: 'Response received but could not be decoded',
                        responseLength: responseBody.RESPONSE.length,
                        responseDate: responseBody.RESPONSE_DATE,
                        referenceNumber: responseBody.REQUEST_REFERENCE_NUMBER,
                        hasDigitalSignature: !!responseBody.DIGI_SIGN
                    },
                    source: 'structured',
                    rawResponse: responseBody
                };
            }
            
            // Plain response
            return {
                success: true,
                data: responseBody,
                source: 'plain',
                rawResponse: responseBody
            };
            
        } catch (error) {
            console.error('❌ Error processing SBI response:', error);
            return {
                success: false,
                error: error.message,
                rawResponse: responseBody
            };
        }
    }

    /**
     * Get batch ID from SBI
     */
    async getBatchId(state, date) {
        try {
            console.log(`🔍 Getting Batch ID for ${state} on ${date}`);
            const result = await this.sbi.getBatchId(state, date);
            
            if (result.success && result.rawResponse) {
                const processedResponse = this.processSBIResponse(result.rawResponse);
                return {
                    ...processedResponse,
                    operation: 'getBatchId',
                    state: state,
                    date: date
                };
            }
            
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message,
                operation: 'getBatchId'
            };
        }
    }

    /**
     * Fetch verification records from SBI
     */
    async fetchVerificationRecords(state, date, batchId = null) {
        try {
            console.log(`🔍 Fetching Verification Records for ${state} on ${date}`);
            const result = await this.sbi.fetchVerificationRecords(state, date, batchId);
            
            if (result.success && result.rawResponse) {
                const processedResponse = this.processSBIResponse(result.rawResponse);
                return {
                    ...processedResponse,
                    operation: 'fetchVerificationRecords',
                    state: state,
                    date: date,
                    batchId: batchId
                };
            }
            
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message,
                operation: 'fetchVerificationRecords'
            };
        }
    }

    /**
     * Get comprehensive verification data (batch ID + records)
     */
    async getVerificationData(state, date) {
        try {
            console.log(`🔍 Getting comprehensive verification data for ${state} on ${date}`);
            
            // Step 1: Get Batch ID
            const batchResult = await this.getBatchId(state, date);
            
            // Step 2: Get Verification Records
            const recordsResult = await this.fetchVerificationRecords(state, date);
            
            return {
                success: true,
                state: state,
                date: date,
                batchId: batchResult,
                records: recordsResult,
                summary: {
                    batchIdSuccess: batchResult.success,
                    recordsSuccess: recordsResult.success,
                    batchIdSource: batchResult.source,
                    recordsSource: recordsResult.source
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                operation: 'getVerificationData'
            };
        }
    }
}

module.exports = SBIResponseHandler;