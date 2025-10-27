/**
 * Analyze SBI Response Structure
 * This script analyzes the actual SBI response to understand the encryption
 */

const SBIIntegrationFixed = require('./sbi-integration-fixed');

async function analyzeSBIResponse() {
    console.log('🔍 Analyzing SBI Response Structure...\n');
    
    try {
        const sbi = new SBIIntegrationFixed();
        
        // Get a sample response
        const result = await sbi.getBatchId('DELHI', '17-10-2024');
        
        if (result.success && result.rawResponse) {
            const response = result.rawResponse;
            
            console.log('📊 SBI Response Analysis:');
            console.log('========================');
            console.log('Response Keys:', Object.keys(response));
            console.log('');
            
            if (response.RESPONSE) {
                console.log('🔐 RESPONSE Field Analysis:');
                console.log('   Type:', typeof response.RESPONSE);
                console.log('   Length:', response.RESPONSE.length);
                console.log('   First 50 chars:', response.RESPONSE.substring(0, 50));
                console.log('   Last 50 chars:', response.RESPONSE.substring(response.RESPONSE.length - 50));
                console.log('   Is Base64?', /^[A-Za-z0-9+/]*={0,2}$/.test(response.RESPONSE));
                console.log('');
            }
            
            if (response.DIGI_SIGN) {
                console.log('✍️  DIGI_SIGN Field Analysis:');
                console.log('   Type:', typeof response.DIGI_SIGN);
                console.log('   Length:', response.DIGI_SIGN.length);
                console.log('   First 50 chars:', response.DIGI_SIGN.substring(0, 50));
                console.log('   Is Base64?', /^[A-Za-z0-9+/]*={0,2}$/.test(response.DIGI_SIGN));
                console.log('');
            }
            
            console.log('🔑 Key Analysis:');
            console.log('================');
            console.log('The issue is likely one of these:');
            console.log('1. SBI encrypts responses with THEIR private key (we decrypt with their public key)');
            console.log('2. SBI uses a different encryption scheme than we expect');
            console.log('3. SBI UAT returns plain responses (not encrypted)');
            console.log('4. The RESPONSE field contains the actual data, not encrypted data');
            console.log('');
            
            // Try to decode the RESPONSE as base64 to see if it's readable
            if (response.RESPONSE) {
                try {
                    const decoded = Buffer.from(response.RESPONSE, 'base64').toString('utf8');
                    console.log('📝 Base64 Decoded RESPONSE:');
                    console.log('   Decoded length:', decoded.length);
                    console.log('   First 100 chars:', decoded.substring(0, 100));
                    console.log('   Is JSON?', decoded.startsWith('{') || decoded.startsWith('['));
                    
                    if (decoded.startsWith('{') || decoded.startsWith('[')) {
                        try {
                            const jsonData = JSON.parse(decoded);
                            console.log('   ✅ Successfully parsed as JSON!');
                            console.log('   JSON Keys:', Object.keys(jsonData));
                        } catch (e) {
                            console.log('   ❌ Not valid JSON');
                        }
                    }
                } catch (e) {
                    console.log('   ❌ Cannot decode as base64 text');
                }
            }
            
            console.log('');
            console.log('🎯 Recommendation:');
            console.log('==================');
            console.log('Based on this analysis, try these approaches:');
            console.log('1. Decode RESPONSE as base64 and check if it\'s plain JSON');
            console.log('2. Try decrypting with SBI\'s public key instead of private key');
            console.log('3. Check if SBI UAT returns unencrypted responses');
            console.log('4. Verify the encryption scheme matches SBI\'s specification');
            
        } else {
            console.log('❌ Failed to get SBI response for analysis');
        }
        
    } catch (error) {
        console.error('❌ Error analyzing SBI response:', error);
    }
}

// Run the analysis
if (require.main === module) {
    analyzeSBIResponse().catch(console.error);
}

module.exports = { analyzeSBIResponse };