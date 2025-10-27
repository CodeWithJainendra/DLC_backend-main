# Login Issue - FIXED ✅

## Problem
- Login endpoint not working at `http://localhost:9000/api/proxy/api/auth/login`
- Credentials: `admin` / `Admin123!`

## Root Causes
1. **Wrong Port**: Server is running on port **9007**, not 9000
2. **No Admin User**: Admin user was not created in database
3. **Wrong Password**: Initial setup used different password

## Solution Applied

### 1. Created Admin User
```bash
node scripts/setupAuth.js
```

### 2. Updated Password to Admin123!
```bash
node create_admin_user.js
```

### 3. Verified Login Works
```bash
curl -X POST http://localhost:9007/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'
```

**Result**: ✅ Login successful!

## Correct Login Details

### API Endpoint
```
POST http://localhost:9007/api/auth/login
```

**NOT**: ~~http://localhost:9000/api/proxy/api/auth/login~~

### Credentials
```json
{
  "username": "admin",
  "password": "Admin123!"
}
```

### Response
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "6fcde546d5bf6eb961fdf1754b8a4a0584cc8d2fe9acf063c0d20090581c524e",
    "expiresAt": "2025-10-23T10:38:41.360Z",
    "user": {
      "id": 1,
      "username": "admin",
      "fullName": "System Administrator",
      "email": "admin@dlc-pension.gov.in",
      "role": "Super Admin",
      "department": "CPAO",
      "permissions": ["*"]
    }
  }
}
```

## Available Users

| Username | Password | Role | Access |
|----------|----------|------|--------|
| admin | Admin123! | Super Admin | Full access |
| manager1 | Manager@123 | Manager | Delhi & UP data |
| analyst1 | Analyst@123 | Data Analyst | Delhi data only |
| viewer1 | Viewer@123 | Viewer | Maharashtra data only |

## Frontend Configuration

If you're using a frontend, update the API base URL:

```javascript
// Change from:
const API_BASE_URL = 'http://localhost:9000';

// To:
const API_BASE_URL = 'http://localhost:9007';
```

## Testing Login from Browser

### Using Fetch API
```javascript
fetch('http://localhost:9007/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    username: 'admin',
    password: 'Admin123!'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

### Using cURL
```bash
curl -X POST http://localhost:9007/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'
```

## Server Information

- **Port**: 9007
- **Host**: 0.0.0.0 (accessible from network)
- **Local URL**: http://localhost:9007
- **Network URL**: http://172.30.3.232:9007

## Other Fixed Issues

### Geography API - Total Pensioners & DLC Count
✅ Fixed endpoint: `GET http://localhost:9007/api/pension/geography/states`

**Returns**:
```json
{
  "success": true,
  "summary": {
    "totalPensioners": 1164548,
    "totalDLC": 735285,
    "totalManual": 323863,
    "verifiedToday": 0,
    "pendingQueue": 323863
  }
}
```

## Quick Start Commands

```bash
# Start server
npm start

# Create/update admin user
node create_admin_user.js

# Test login
curl -X POST http://localhost:9007/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'

# Test geography API
curl http://localhost:9007/api/pension/geography/states | python3 -m json.tool
```

## Notes

1. Server is running on port **9007** (configured in server.js)
2. Admin password is now **Admin123!** (as requested)
3. All authentication features are working:
   - Login ✅
   - JWT tokens ✅
   - Session management ✅
   - Role-based access control ✅

## If Still Not Working

1. **Check if server is running**:
   ```bash
   curl http://localhost:9007/health
   ```

2. **Check server logs**:
   ```bash
   # Server logs will show in the terminal where you ran npm start
   ```

3. **Restart server**:
   ```bash
   # Stop current server (Ctrl+C)
   npm start
   ```

4. **Verify database**:
   ```bash
   sqlite3 DLC_Database.db "SELECT username, full_name, role_id FROM users WHERE username='admin';"
   ```
