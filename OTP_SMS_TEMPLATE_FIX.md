# OTP SMS Template Fix

## Current Issue

The SMS gateway is returning: **"Invalid template text"**

This means the SMS message doesn't match the DLT (Distributed Ledger Technology) template registered with SMSGatewayHub.

## Current SMS Template

```
Your OTP is {otp}. Valid for 4 minutes. Do not share. -DLC Portal
```

## Solutions

### Option 1: Register New DLT Template (Recommended)

1. **Login to SMSGatewayHub**: https://www.smsgatewayhub.com/
2. **Navigate to**: DLT Templates section
3. **Register this template**:
   ```
   Your OTP is {#var#}. Valid for 4 minutes. Do not share. -DLC Portal
   ```
4. **Get the Template ID** after approval
5. **Update environment variable**:
   ```bash
   SMS_DLT_TEMPLATE_ID=your_new_template_id
   ```

### Option 2: Use Existing DLT Template

If you already have a registered template, update the message in the code to match it.

**Steps:**
1. Check your registered DLT templates in SMSGatewayHub dashboard
2. Copy the exact template text
3. Update `/services/otpService.js` line 170:

```javascript
// Replace this line:
const message = `Your OTP is ${otp}. Valid for 4 minutes. Do not share. -DLC Portal`;

// With your registered template (example):
const message = `Dear User, Your OTP for DLC Portal is ${otp}. Valid for 4 minutes. -DLC`;
```

### Option 3: Test Mode (For Development)

For testing without SMS, you can modify the OTP service to skip SMS sending:

**Edit `/services/otpService.js`:**

```javascript
async sendOTP(phoneNumber, ipAddress = null, userAgent = null) {
  try {
    // ... validation code ...

    // Generate OTP
    const otp = this.generateOTP();
    const generatedAt = new Date();
    const expiredAt = new Date(generatedAt.getTime() + 4 * 60 * 1000);

    // TEST MODE: Skip SMS sending, just log OTP
    console.log('🔐 TEST MODE - OTP Generated:', otp);
    console.log('📱 Phone:', phoneNumber);
    
    const smsResult = {
      success: true,
      jobId: 'TEST_MODE',
      errorCode: '000'
    };
    
    // Comment out actual SMS sending:
    // const message = `Your OTP is ${otp}. Valid for 4 minutes. Do not share. -DLC Portal`;
    // const smsResult = await this.sendSMS(phoneNumber, message);

    // Store OTP in database
    const insertStmt = this.db.prepare(`
      INSERT INTO otp_records (contact_no, otp_code, generated_at, expired_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      phoneNumber,
      otp,
      generatedAt.toISOString(),
      expiredAt.toISOString(),
      ipAddress,
      userAgent
    );

    return {
      success: true,
      message: 'OTP sent successfully (TEST MODE - Check console)',
      expiresAt: expiredAt.toISOString(),
      jobId: smsResult.jobId,
      testOTP: otp  // Only for testing!
    };
  } catch (error) {
    // ... error handling ...
  }
}
```

## Common DLT Template Formats

Here are some commonly approved DLT template formats:

### Format 1: Simple
```
Your OTP is {#var#}. Valid for {#var#} minutes. Do not share with anyone. -{#var#}
```

### Format 2: Formal
```
Dear User, Your One Time Password (OTP) for {#var#} is {#var#}. Valid for {#var#} minutes. Please do not share this OTP. -{#var#}
```

### Format 3: Government Style
```
Your verification code for {#var#} is {#var#}. This OTP is valid for {#var#} minutes. Do not share this code. -{#var#}
```

## Environment Variables

Make sure these are set correctly in your `.env` file or environment:

```bash
# SMS Gateway Configuration
SMS_API_KEY=GgvIcRfSQEmdB7Kmlj7iOA
SMS_SENDER_ID=DLC4.0
SMS_ENTITY_ID=your_entity_id_here
SMS_DLT_TEMPLATE_ID=your_template_id_here

# Optional
SMS_CHANNEL=2
SMS_DCS=0
SMS_FLASH=0
SMS_ROUTE=1
```

## Testing After Fix

1. **Restart the server**:
   ```bash
   # Stop current server
   kill $(lsof -ti:9007)
   
   # Start server
   node server.js
   ```

2. **Test OTP send**:
   ```bash
   curl -X POST http://localhost:9007/api/auth/send-otp \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber":"919876543210"}'
   ```

3. **Check database for OTP**:
   ```bash
   sqlite3 DLC_Database.db "SELECT * FROM otp_records ORDER BY id DESC LIMIT 1;"
   ```

4. **Test OTP verify**:
   ```bash
   curl -X POST http://localhost:9007/api/auth/verify-otp \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber":"919876543210","otp":"123456"}'
   ```

## Quick Test Mode Setup

For immediate testing without SMS gateway:

```bash
# Edit the OTP service
nano services/otpService.js

# Add TEST MODE code as shown in Option 3 above
# Save and restart server

# Test - OTP will be printed in console
curl -X POST http://localhost:9007/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"919876543210"}'

# Check server console for the OTP
# Use that OTP to verify
```

## Contact SMS Provider

If issues persist:
- **Email**: support@smsgatewayhub.com
- **Phone**: Check SMSGatewayHub website
- **Request**: DLT template approval for your message format
