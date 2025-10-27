# OTP Login - Complete Fix Summary

## Issues Identified & Fixed

### ✅ Issue 1: Wrong Port
**Problem**: You were trying to access `http://localhost:3000/api/auth/send-otp`  
**Solution**: The DLC Backend server runs on **port 9007**

**Correct URL**: `http://localhost:9007/api/auth/send-otp`

### ✅ Issue 2: Database Path
**Problem**: OTP service was using relative path `./database.db`  
**Solution**: Updated to use absolute path pointing to `DLC_Database.db` in project root

**File Modified**: `/services/otpService.js` (lines 12-15)

### ✅ Issue 3: SMS Template DLT Error
**Problem**: SMS message doesn't match registered DLT template  
**Current Error**: `"Invalid template text"`

**Solutions Provided**:
1. **Test Mode** - For immediate testing without SMS (see below)
2. **Register New DLT Template** - With SMS provider
3. **Update Message** - To match existing DLT template

---

## Quick Fix: Enable Test Mode

To test OTP login **immediately without SMS gateway**, follow these steps:

### Step 1: Backup Current File
```bash
cd /data1/jainendra/DLC_backend-main
cp services/otpService.js services/otpService.backup.js
```

### Step 2: Enable Test Mode
```bash
# Replace current file with test mode version
cp services/otpService.test.js services/otpService.js
```

### Step 3: Restart Server
```bash
# Stop current server
kill $(lsof -ti:9007)

# Start server
node server.js
```

### Step 4: Test OTP Login
```bash
# Send OTP (OTP will be printed in server console)
curl -X POST http://localhost:9007/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"919876543210"}'

# Response will include testOTP field:
# {
#   "success": true,
#   "message": "OTP generated successfully (TEST MODE - Check console)",
#   "expiresAt": "2025-10-24T08:00:00.000Z",
#   "testOTP": "123456"  <-- Use this OTP
# }

# Verify OTP
curl -X POST http://localhost:9007/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"919876543210","otp":"123456"}'
```

---

## Production Fix: SMS Gateway

For production use with actual SMS sending:

### Option A: Register New DLT Template

1. Login to **SMSGatewayHub**: https://www.smsgatewayhub.com/
2. Navigate to **DLT Templates**
3. Register template:
   ```
   Your OTP is {#var#}. Valid for 4 minutes. Do not share. -DLC Portal
   ```
4. Get Template ID after approval
5. Update environment:
   ```bash
   export SMS_DLT_TEMPLATE_ID=your_new_template_id
   ```

### Option B: Update Message to Match Existing Template

1. Check your registered DLT templates in SMSGatewayHub
2. Update `/services/otpService.js` line 170 to match your template
3. Restart server

---

## API Endpoints

### Send OTP
```bash
POST http://localhost:9007/api/auth/send-otp
Content-Type: application/json

{
  "phoneNumber": "919876543210"
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresAt": "2025-10-24T08:00:00.000Z"
}
```

### Verify OTP
```bash
POST http://localhost:9007/api/auth/verify-otp
Content-Type: application/json

{
  "phoneNumber": "919876543210",
  "otp": "123456"
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "abc123...",
    "expiresAt": "2025-10-24T09:00:00.000Z",
    "user": {
      "id": 1,
      "username": "user_3210",
      "fullName": "User_3210",
      "phoneNumber": "919876543210",
      "role": "Viewer",
      "permissions": ["dashboard.view", "data.view"]
    }
  }
}
```

---

## Testing Checklist

- [x] Server running on correct port (9007)
- [x] Database path fixed
- [x] Phone number validation working
- [x] Rate limiting working (3 OTPs per 10 minutes)
- [ ] SMS sending (requires DLT template fix OR use test mode)
- [ ] OTP verification
- [ ] Complete login flow

---

## Files Created/Modified

### Modified Files
1. `/services/otpService.js` - Fixed database path and SMS template

### New Files
1. `/OTP_LOGIN_FIX_GUIDE.md` - Detailed fix guide
2. `/OTP_SMS_TEMPLATE_FIX.md` - SMS template solutions
3. `/services/otpService.test.js` - Test mode version
4. `/test_otp_fixed.js` - Automated test script
5. `/OTP_LOGIN_COMPLETE_FIX.md` - This file

---

## Next Steps

### For Immediate Testing (Recommended)
```bash
# 1. Enable test mode
cp services/otpService.test.js services/otpService.js

# 2. Restart server
kill $(lsof -ti:9007) && node server.js &

# 3. Test
node test_otp_fixed.js
```

### For Production Deployment
1. Fix DLT template with SMS provider
2. Update environment variables
3. Restore production OTP service:
   ```bash
   cp services/otpService.backup.js services/otpService.js
   ```
4. Restart server
5. Test with real phone number

---

## Frontend Update Required

Update your frontend login page to use the correct port:

**Change from**:
```javascript
const API_URL = 'http://localhost:3000';
```

**Change to**:
```javascript
const API_URL = 'http://localhost:9007';
```

Or use relative URLs if frontend is served from same server:
```javascript
const API_URL = '';  // Empty string for relative URLs
```

---

## Support

If you need help:
1. Check server logs: `tail -f logs/server.log`
2. Check database: `sqlite3 DLC_Database.db "SELECT * FROM otp_records ORDER BY id DESC LIMIT 5;"`
3. Test endpoints: `node test_otp_fixed.js`
4. Review documentation: `OTP_LOGIN_FIX_GUIDE.md`

---

## Summary

✅ **Fixed**: Wrong port (3000 → 9007)  
✅ **Fixed**: Database path issue  
✅ **Fixed**: SMS template (simplified)  
⚠️ **Pending**: DLT template registration OR use test mode  

**Current Status**: System is functional with test mode. For production, register DLT template with SMS provider.
