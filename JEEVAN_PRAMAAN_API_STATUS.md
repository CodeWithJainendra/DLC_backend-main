# Jeevan Pramaan API Integration Status

## API Details

**Base URL**: `https://ipension.nic.in/JPWrapper/`

**Credentials**:
- Username: `UserJP`
- Password: `29#@JP25bhaV`
- PwdSecretKey: `bam5kllfzjzvjv560s5q24fnwbtqs50d`
- AESSecretKey: `3sw6dmhh2vsrjpo5ba36myv6qt5j20fd`

**Contact Persons**:
- Sh. Priyranjan Sharma, Sr. Developer - 6394457028
- Sh. Arvind Kumar, Sr. Developer - 8909175628

## Test Results (Date: 2025-10-23)

### Current Status: ❌ ACCESS DENIED (403 Forbidden)

**Error**: The API is returning HTTP 403 - Forbidden error, indicating that the server IP is not whitelisted.

### Expected Data Volume (for date 05.11.2024)
- **Records**: ~700,000 (7 lakhs)
- **Payload Size**: ~300 MB JSON
- **Average Record Size**: ~450 bytes per record

## Next Steps Required

### 1. IP Whitelisting (CRITICAL)
You need to provide your server's IP address to DoP&PW for whitelisting.

**To get your server IP**:
```bash
curl -4 ifconfig.me
# or
curl -4 icanhazip.com
```

**Send to**: Anil Bansal <anil.bansal@gov.in>
**Subject**: IP Whitelisting Request for Jeevan Pramaan API
**Body**: 
```
Dear Sir,

Please whitelist the following IP address to access the Jeevan Pramaan API:

IP Address: [YOUR_SERVER_IP]
Purpose: Integration with DLC Portal for pensioner data synchronization

Thank you.
```

### 2. API Integration Considerations

#### Performance Optimization
- **Large Payload**: 300 MB JSON response requires proper handling
- **Timeout Settings**: Set HTTP timeout to at least 5 minutes
- **Memory Management**: Stream processing recommended for large datasets
- **Retry Logic**: Implement exponential backoff for failed requests

#### Recommended Implementation
```javascript
// Increase Node.js memory limit if needed
node --max-old-space-size=4096 your-script.js

// Use streaming for large responses
const response = await axios.post(API_BASE_URL, payload, {
    timeout: 300000, // 5 minutes
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    responseType: 'stream' // For very large responses
});
```

#### Data Processing Strategy
1. **Batch Processing**: Process records in chunks (e.g., 10,000 at a time)
2. **Database Insertion**: Use bulk insert operations
3. **Error Handling**: Log failed records for retry
4. **Progress Tracking**: Implement progress indicators for long operations

### 3. Testing Plan (After IP Whitelisting)

#### Phase 1: Small Dataset Test
- Test with a date having fewer records (e.g., recent date)
- Verify API response structure
- Validate data fields

#### Phase 2: Large Dataset Test
- Test with 05.11.2024 (700k records)
- Measure actual payload size and response time
- Test memory and performance limits

#### Phase 3: Integration
- Integrate with existing DLC database
- Set up scheduled data sync (daily/weekly)
- Implement monitoring and alerting

## API Usage Example

```javascript
const crypto = require('crypto');
const axios = require('axios');

function encryptAES(text, key) {
    const cipher = crypto.createCipheriv('aes-256-cbc', 
        Buffer.from(key, 'utf8'), 
        Buffer.alloc(16, 0)
    );
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

async function fetchJeevanPramaanData(date) {
    const encryptedPassword = encryptAES(PASSWORD, PWD_SECRET_KEY);
    
    const response = await axios.post(API_BASE_URL, {
        username: USERNAME,
        password: encryptedPassword,
        date: date // Format: DD.MM.YYYY
    }, {
        timeout: 300000,
        maxContentLength: Infinity
    });
    
    return response.data;
}
```

## Questions to Clarify with DoP&PW

1. **Data Format**: What is the exact structure of the JSON response?
2. **Update Frequency**: How often should we fetch data? Daily/Weekly?
3. **Date Range**: Can we fetch data for a date range, or only single dates?
4. **Incremental Updates**: Is there an API for incremental updates only?
5. **Rate Limits**: Are there any rate limits or throttling?
6. **Data Retention**: How far back can we fetch historical data?

## Timeline

- **Immediate**: Send IP whitelisting request
- **After Whitelisting**: Run comprehensive API tests
- **Week 1**: Complete integration and testing
- **Week 2**: Deploy to production with monitoring

## Notes

- The test script is ready at `test-jeevan-pramaan-api.js`
- Once IP is whitelisted, simply run: `node test-jeevan-pramaan-api.js`
- The script will automatically measure payload size and analyze response structure
