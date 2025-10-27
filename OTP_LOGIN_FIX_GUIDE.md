# OTP Login Fix Guide

## Issues Fixed

### 1. **Wrong Port**
- ❌ **Incorrect**: `http://localhost:3000/api/auth/send-otp`
- ✅ **Correct**: `http://localhost:9007/api/auth/send-otp`

The DLC Backend server runs on **port 9007**, not 3000.

### 2. **Database Path Issue**
- Fixed OTP service to use correct database path: `DLC_Database.db` in project root
- Changed from relative path `./database.db` to absolute path

### 3. **SMS Template Issue**
- Simplified SMS message template to avoid DLT validation errors
- New format: `Your OTP is {otp}. Valid for 4 minutes. Do not share. -DLC Portal`

## How to Use OTP Login

### Step 1: Send OTP
```bash
curl -X POST http://localhost:9007/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"919876543210"}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresAt": "2025-10-24T07:30:00.000Z"
}
```

### Step 2: Verify OTP and Login
```bash
curl -X POST http://localhost:9007/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber":"919876543210",
    "otp":"123456"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "abc123...",
    "expiresAt": "2025-10-24T08:00:00.000Z",
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

## Phone Number Format

- Must be Indian phone number with country code
- Format: `91XXXXXXXXXX` (91 followed by 10 digits)
- First digit after 91 must be 6-9
- Examples:
  - ✅ `919876543210`
  - ✅ `919123456789`
  - ❌ `9876543210` (missing country code)
  - ❌ `919012345678` (starts with 0)

## OTP Configuration

- **OTP Length**: 6 digits
- **Validity**: 4 minutes
- **Rate Limit**: Max 3 OTPs per phone number per 10 minutes
- **Auto-Registration**: New users are automatically created with Viewer role

## SMS Gateway Configuration

The system uses SMSGatewayHub API. Configure via environment variables:

```bash
SMS_API_KEY=your_api_key
SMS_SENDER_ID=DLC4.0
SMS_ENTITY_ID=your_entity_id
SMS_DLT_TEMPLATE_ID=your_template_id
```

## Troubleshooting

### Error: "Cannot POST /api/auth/send-otp"
- **Cause**: Using wrong port (3000 instead of 9007)
- **Solution**: Use `http://localhost:9007/api/auth/send-otp`

### Error: "Invalid template text"
- **Cause**: SMS message doesn't match registered DLT template
- **Solution**: Update DLT template or modify SMS message in `services/otpService.js`

### Error: "Too many OTP requests"
- **Cause**: Rate limit exceeded (3 OTPs per 10 minutes)
- **Solution**: Wait 10 minutes or clear old OTPs from database

### Error: "Invalid or expired OTP"
- **Cause**: OTP expired (4 minutes) or already used
- **Solution**: Request a new OTP

## Database Tables

The OTP system uses the following table in `DLC_Database.db`:

```sql
CREATE TABLE otp_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_no VARCHAR(15) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  generated_at DATETIME NOT NULL,
  expired_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT 0,
  verified_at DATETIME,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Testing After Server Restart

After restarting the server, test with:

```bash
# Test OTP send
curl -X POST http://localhost:9007/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"919876543210"}'

# Check server logs for any errors
# The OTP will be logged in the database and sent via SMS
```

## Next Steps

1. **Restart the server** to apply the fixes:
   ```bash
   # Stop current server (Ctrl+C in the terminal running it)
   # Or kill the process:
   kill 202920
   
   # Start server again:
   node server.js
   ```

2. **Test OTP send** using the correct port (9007)

3. **Configure SMS gateway** with proper DLT template if SMS sending fails

4. **Update frontend** to use port 9007 instead of 3000
