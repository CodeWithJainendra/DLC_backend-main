# OTP Sender - Python Implementation

This is a Python implementation of the OTP generation and SMS sending service, similar to the Node.js version.

## Features

- ✅ Only sends to numbers with country code 91 (India)
- ✅ Database integration with MySQL
- ✅ OTP expiration (4 minutes)
- ✅ Environment variable configuration
- ✅ Connection pooling for database
- ✅ Matches Node.js implementation logic

## Setup

### 1. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update with your credentials:

```powershell
Copy-Item .env.example .env
```

Edit `.env` file with your actual values:
- Database credentials
- SMS Gateway API key and configuration

### 3. Database Schema

Ensure you have the following tables in your database:

```sql
-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_no VARCHAR(15) UNIQUE NOT NULL,
    username VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP table
CREATE TABLE otp (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_no VARCHAR(15) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    generated_at DATETIME NOT NULL,
    expired_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_contact_no (contact_no),
    INDEX idx_expired_at (expired_at)
);
```

## Usage

### Standalone Script

```powershell
python send_otp.py
```

### As a Module

```python
from send_otp import send_otp

result = send_otp("919876543210")
print(result)
# Output: {"success": True, "message": "OTP sent", "otp": 123456}
```

## Security Notes

1. **Never commit `.env` file** - Add it to `.gitignore`
2. **Use environment variables** for all sensitive data
3. **Only 91 country code** is allowed for sending OTPs
4. **OTP expires in 4 minutes** from generation time

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | Database host | `localhost` |
| `DB_USER` | Database user | `root` |
| `DB_PASSWORD` | Database password | `your_password` |
| `DB_NAME` | Database name | `your_database` |
| `SMS_API_KEY` | SMS Gateway API Key | Get from smsgatewayhub.com |
| `SMS_SENDER_ID` | Sender ID | `CRSITC` |
| `SMS_CHANNEL` | Channel | `2` |
| `SMS_DCS` | DCS | `0` |
| `SMS_FLASH` | Flash SMS | `0` |
| `SMS_ROUTE` | Route | `47` |
| `SMS_ENTITY_ID` | Entity ID | `1201175342728151379` |
| `SMS_DLT_TEMPLATE_ID` | DLT Template ID | `1207175566574019917` |

## Getting SMS API Key

1. Login to https://www.smsgatewayhub.com/
2. Navigate to API Settings
3. Copy your API Key
4. Update `SMS_API_KEY` in `.env` file
