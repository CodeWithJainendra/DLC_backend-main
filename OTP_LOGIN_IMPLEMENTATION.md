# OTP Login Implementation Guide

## Overview
Dual authentication system implemented for DLC Pension Dashboard with both **Username/Password** and **OTP-based** login methods.

## Features Implemented

### ✅ Backend Implementation

1. **OTP Service Module** (`/services/otpService.js`)
   - SMS Gateway integration with SMSGatewayHub API
   - 6-digit OTP generation
   - OTP expiration (4 minutes)
   - Rate limiting (max 3 OTPs per 10 minutes per phone number)
   - Phone number validation (Indian numbers only: 91XXXXXXXXXX)
   - OTP verification and cleanup

2. **Database Schema**
   - `otp_records` table with fields:
     - contact_no, otp_code, generated_at, expired_at
     - used flag, verified_at timestamp
     - ip_address and user_agent tracking
   - `users` table updated with:
     - `phone_number` field (unique)
     - `phone_verified` boolean flag
     - Made `email` and `password_hash` optional for OTP users

3. **Authentication Controller** (`/controllers/authController.js`)
   - `sendOTP()` - Send OTP to phone number
   - `verifyOTPLogin()` - Verify OTP and create session
   - Auto-registration for new phone numbers
   - Session management with JWT tokens
   - Activity logging for security audit

4. **API Routes** (`/routes/authRoutes.js`)
   - `POST /api/auth/send-otp` - Send OTP
   - `POST /api/auth/verify-otp` - Verify OTP and login
   - Input validation with express-validator
   - Rate limiting protection

5. **User Model Updates** (`/models/User.js`)
   - `getUserByPhone()` - Find user by phone number
   - `createUserByPhone()` - Auto-register OTP users
   - `updateLastLogin()` - Track login timestamps

### ✅ Frontend Implementation

1. **Dual Login Interface** (`/public/login.html`)
   - Tab-based UI with Password and OTP options
   - Smooth animations and transitions
   - Real-time form validation
   - Auto-formatting for phone numbers and OTP

2. **Password Login Tab**
   - Traditional username/password authentication
   - Test credentials displayed
   - Error handling and feedback

3. **OTP Login Tab**
   - Phone number input with format validation
   - Send OTP button with loading state
   - OTP input field (6 digits)
   - Verify & Login button
   - Resend OTP with 60-second countdown timer
   - Success/error message display

## Configuration

### SMS Gateway Setup

Update environment variables in `.env` or directly in code:

```bash
SMS_API_KEY=your_api_key_here
SMS_SENDER_ID=DLC4.0
SMS_CHANNEL=2
SMS_DCS=0
SMS_FLASH=0
SMS_ROUTE=1
SMS_ENTITY_ID=your_entity_id
SMS_DLT_TEMPLATE_ID=your_dlt_template_id
```

### SMS Gateway Provider
- **Provider**: SMSGatewayHub (https://www.smsgatewayhub.com/)
- **API Endpoint**: https://www.smsgatewayhub.com/api/mt/SendSMS
- **Message Format**: "Dear user, your DLC OTP for DLC Pension Dashboard is {OTP}. Use it to complete authentication. Do not share it. Valid for 4 minutes. --DLC PORTAL"

## API Endpoints

### 1. Send OTP
```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "phoneNumber": "919876543210"
}

Response:
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresAt": "2025-01-24T12:34:56.789Z"
}
```

### 2. Verify OTP & Login
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phoneNumber": "919876543210",
  "otp": "123456"
}

Response:
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt_token_here",
    "refreshToken": "refresh_token_here",
    "expiresAt": "2025-01-24T13:34:56.789Z",
    "user": {
      "id": 1,
      "username": "user_9876543210",
      "fullName": "User_3210",
      "phoneNumber": "919876543210",
      "role": "Viewer",
      "permissions": [...]
    }
  }
}
```

### 3. Traditional Login (Username/Password)
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "Admin@123456"
}

Response: Same as OTP login
```

## Security Features

1. **Rate Limiting**
   - Max 3 OTP requests per phone number per 10 minutes
   - Max 50 authentication attempts per IP per 15 minutes

2. **OTP Expiration**
   - OTPs expire after 4 minutes
   - Used OTPs are marked and cannot be reused

3. **Phone Number Validation**
   - Only Indian numbers accepted (91XXXXXXXXXX format)
   - Must start with 91 followed by valid Indian mobile prefix (6-9)

4. **Session Management**
   - JWT tokens with 30-minute expiration
   - Refresh tokens for extended sessions
   - HTTP-only cookies for additional security

5. **Activity Logging**
   - All OTP requests logged with IP and user agent
   - Failed verification attempts tracked
   - Successful logins recorded

## User Flow

### OTP Login Flow
1. User enters phone number (919876543210)
2. Clicks "Send OTP"
3. System validates phone number format
4. OTP generated and sent via SMS
5. User receives SMS with 6-digit OTP
6. User enters OTP in the form
7. Clicks "Verify & Login"
8. System verifies OTP
9. If new user: Auto-registers with default Viewer role
10. If existing user: Logs in directly
11. JWT token issued and stored
12. User redirected to dashboard

### Password Login Flow
1. User enters username and password
2. Clicks "Login"
3. System validates credentials
4. JWT token issued and stored
5. User redirected to dashboard

## Database Schema

### otp_records Table
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

### users Table (Updated)
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE,           -- Now optional
  phone_number VARCHAR(15) UNIQUE,     -- New field
  password_hash VARCHAR(255),          -- Now optional
  full_name VARCHAR(100) NOT NULL,
  role_id INTEGER NOT NULL,
  phone_verified BOOLEAN DEFAULT 0,    -- New field
  ...
);
```

## Testing

### Test Password Login
- **Username**: admin
- **Password**: Admin@123456

### Test OTP Login
1. Enter a valid Indian phone number (e.g., 919876543210)
2. Click "Send OTP"
3. Check SMS for OTP code
4. Enter OTP and verify

**Note**: Ensure SMS Gateway credentials are configured correctly for OTP to work.

## Error Handling

### Common Errors

1. **Invalid phone number format**
   - Error: "Invalid Indian phone number. Format: 919876543210"
   - Solution: Use correct format with country code 91

2. **Too many OTP requests**
   - Error: "Too many OTP requests. Please try again after 10 minutes."
   - Solution: Wait for rate limit to reset

3. **Invalid or expired OTP**
   - Error: "Invalid or expired OTP"
   - Solution: Request new OTP

4. **SMS sending failed**
   - Error: "Failed to send OTP via SMS"
   - Solution: Check SMS Gateway credentials and balance

## Maintenance

### Cleanup Expired OTPs
The system automatically cleans up OTPs older than 1 day. You can also run manual cleanup:

```javascript
const otpService = require('./services/otpService');
otpService.cleanupExpiredOTPs();
```

### Monitor OTP Statistics
```javascript
const stats = otpService.getOTPStats('919876543210');
console.log(stats);
// { total_sent: 5, total_verified: 3, last_sent: "2025-01-24T12:00:00Z" }
```

## Files Modified/Created

### Created
- `/services/otpService.js` - OTP service module
- `/OTP_LOGIN_IMPLEMENTATION.md` - This documentation

### Modified
- `/controllers/authController.js` - Added OTP methods
- `/routes/authRoutes.js` - Added OTP routes
- `/models/User.js` - Added phone number support
- `/public/login.html` - Complete UI overhaul with dual login

## Dependencies

All required dependencies are already installed:
- `axios` - HTTP client for SMS API
- `express-validator` - Input validation
- `jsonwebtoken` - JWT token generation
- `crypto` - OTP generation
- `better-sqlite3` - Database operations

## Production Checklist

- [ ] Configure SMS Gateway credentials in environment variables
- [ ] Test OTP delivery with real phone numbers
- [ ] Set up proper error monitoring
- [ ] Configure rate limiting thresholds
- [ ] Enable HTTPS for production
- [ ] Set up OTP cleanup cron job
- [ ] Monitor SMS Gateway balance
- [ ] Test both login methods thoroughly
- [ ] Update DLT template ID for SMS compliance
- [ ] Configure proper CORS settings

## Support

For issues or questions:
1. Check SMS Gateway balance and configuration
2. Verify phone number format (91XXXXXXXXXX)
3. Check server logs for detailed error messages
4. Ensure database tables are created properly
5. Test with different phone numbers

---

**Implementation Date**: January 24, 2025
**Status**: ✅ Complete and Ready for Testing
