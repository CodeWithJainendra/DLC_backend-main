# Supabase Database Setup Guide
## DLC Portal - Authentication Tables

**Date:** October 25, 2025  
**Tables:** users, roles, user_sessions, otp_records

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Go to Supabase Dashboard
1. Visit: https://supabase.com/dashboard
2. Select your project (or create a new one)
3. Go to **SQL Editor** (left sidebar)

### Step 2: Run the Setup Script
1. Copy the entire content of `supabase_setup.sql`
2. Paste it into the SQL Editor
3. Click **"Run"** button
4. Wait for completion (should take 5-10 seconds)

### Step 3: Verify Tables Created
Run this query to verify:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('roles', 'users', 'user_sessions', 'otp_records');
```

You should see all 4 tables listed.

---

## 📋 Tables Created

### 1. **roles** - User Roles
```sql
- id (UUID, Primary Key)
- role_name (VARCHAR, UNIQUE) - Admin, Manager, Viewer
- description (TEXT)
- permissions (JSONB) - Role permissions
- created_at, updated_at (TIMESTAMP)
```

**Default Roles:**
- **Admin**: Full system access
- **Manager**: Can manage data and view reports
- **Viewer**: Read-only access

### 2. **users** - User Accounts
```sql
- id (UUID, Primary Key)
- username (VARCHAR, UNIQUE)
- email (VARCHAR, UNIQUE)
- password_hash (VARCHAR) - Bcrypt hashed
- phone_number (VARCHAR, UNIQUE)
- phone_verified (BOOLEAN)
- role_id (UUID, Foreign Key → roles)
- is_active (BOOLEAN)
- last_login (TIMESTAMP)
- failed_login_attempts (INTEGER)
- account_locked_until (TIMESTAMP)
- created_at, updated_at (TIMESTAMP)
- metadata (JSONB)
```

**Features:**
- ✅ Dual authentication (username/password + OTP)
- ✅ Account locking after failed attempts
- ✅ Role-based access control
- ✅ Phone verification support

### 3. **user_sessions** - Active Sessions
```sql
- id (UUID, Primary Key)
- user_id (UUID, Foreign Key → users)
- session_token (VARCHAR, UNIQUE) - JWT token
- refresh_token (VARCHAR)
- ip_address (VARCHAR)
- user_agent (TEXT)
- device_info (JSONB)
- is_active (BOOLEAN)
- expires_at (TIMESTAMP)
- created_at (TIMESTAMP)
- last_activity (TIMESTAMP)
```

**Features:**
- ✅ Track multiple sessions per user
- ✅ Device and IP tracking
- ✅ Automatic session expiry
- ✅ Refresh token support

### 4. **otp_records** - OTP Authentication
```sql
- id (UUID, Primary Key)
- contact_no (VARCHAR)
- otp_code (VARCHAR)
- purpose (VARCHAR) - login, registration, password_reset
- generated_at (TIMESTAMP)
- expired_at (TIMESTAMP)
- verified_at (TIMESTAMP)
- used (BOOLEAN)
- attempts (INTEGER)
- max_attempts (INTEGER)
- ip_address (VARCHAR)
- metadata (JSONB)
```

**Features:**
- ✅ 4-minute OTP expiry
- ✅ Maximum 3 verification attempts
- ✅ Rate limiting support
- ✅ Multiple purposes (login, registration, etc.)

---

## 🔐 Security Features Enabled

### Row Level Security (RLS)
All tables have RLS enabled with policies:

**Roles Table:**
- ✅ All authenticated users can view roles
- ✅ Only Admins can modify roles

**Users Table:**
- ✅ Users can view/update their own data
- ✅ Admins can view/manage all users

**User Sessions:**
- ✅ Users can view/delete their own sessions
- ✅ Automatic cleanup of expired sessions

**OTP Records:**
- ✅ Only service role can access (for security)
- ✅ Not directly accessible by users

### Automatic Cleanup Functions
```sql
-- Clean expired OTPs (older than 24 hours)
SELECT cleanup_expired_otps();

-- Clean expired sessions (older than 7 days)
SELECT cleanup_expired_sessions();
```

---

## 🔑 Get Your Supabase Credentials

### 1. Project URL
```
Dashboard → Settings → API → Project URL
Example: https://xxxxxxxxxxxxx.supabase.co
```

### 2. API Keys
```
Dashboard → Settings → API → Project API keys

- anon (public) key: For client-side
- service_role key: For server-side (KEEP SECRET!)
```

### 3. Database Connection String
```
Dashboard → Settings → Database → Connection string

Format: postgresql://postgres:[password]@[host]:5432/postgres
```

---

## 🔧 Configure Your Backend

### Update Environment Variables

Create/update `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Database (optional - for direct connection)
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

# JWT Secret (from Supabase Dashboard → Settings → API → JWT Secret)
JWT_SECRET=your_jwt_secret_here
```

### Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### Initialize Supabase in Your Code

```javascript
// config/supabase.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for backend

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
```

---

## 📝 Example Usage

### 1. Create a New User
```javascript
const supabase = require('./config/supabase');
const bcrypt = require('bcrypt');

async function createUser(username, email, password, phoneNumber, roleName = 'Viewer') {
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Get role ID
    const { data: role } = await supabase
        .from('roles')
        .select('id')
        .eq('role_name', roleName)
        .single();
    
    // Create user
    const { data, error } = await supabase
        .from('users')
        .insert({
            username,
            email,
            password_hash: passwordHash,
            phone_number: phoneNumber,
            role_id: role.id,
            is_active: true
        })
        .select()
        .single();
    
    return { data, error };
}
```

### 2. Verify Login
```javascript
async function verifyLogin(username, password) {
    // Get user
    const { data: user, error } = await supabase
        .from('users')
        .select('*, roles(*)')
        .eq('username', username)
        .eq('is_active', true)
        .single();
    
    if (error || !user) {
        return { success: false, error: 'User not found' };
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
        // Increment failed attempts
        await supabase
            .from('users')
            .update({ 
                failed_login_attempts: user.failed_login_attempts + 1 
            })
            .eq('id', user.id);
        
        return { success: false, error: 'Invalid password' };
    }
    
    // Update last login
    await supabase
        .from('users')
        .update({ 
            last_login: new Date().toISOString(),
            failed_login_attempts: 0
        })
        .eq('id', user.id);
    
    return { success: true, user };
}
```

### 3. Create OTP
```javascript
async function createOTP(phoneNumber, purpose = 'login') {
    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiry (4 minutes)
    const expiresAt = new Date(Date.now() + 4 * 60 * 1000);
    
    // Save OTP
    const { data, error } = await supabase
        .from('otp_records')
        .insert({
            contact_no: phoneNumber,
            otp_code: otpCode,
            purpose,
            expired_at: expiresAt.toISOString(),
            max_attempts: 3
        })
        .select()
        .single();
    
    // TODO: Send OTP via SMS
    
    return { data, error };
}
```

### 4. Verify OTP
```javascript
async function verifyOTP(phoneNumber, otpCode) {
    const { data: otp, error } = await supabase
        .from('otp_records')
        .select('*')
        .eq('contact_no', phoneNumber)
        .eq('otp_code', otpCode)
        .eq('used', false)
        .gt('expired_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();
    
    if (error || !otp) {
        return { success: false, error: 'Invalid or expired OTP' };
    }
    
    if (otp.attempts >= otp.max_attempts) {
        return { success: false, error: 'Maximum attempts exceeded' };
    }
    
    // Mark as used
    await supabase
        .from('otp_records')
        .update({ 
            used: true,
            verified_at: new Date().toISOString()
        })
        .eq('id', otp.id);
    
    return { success: true };
}
```

### 5. Create Session
```javascript
const jwt = require('jsonwebtoken');

async function createSession(userId, ipAddress, userAgent) {
    // Generate JWT token
    const sessionToken = jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    // Generate refresh token
    const refreshToken = jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    
    // Save session
    const { data, error } = await supabase
        .from('user_sessions')
        .insert({
            user_id: userId,
            session_token: sessionToken,
            refresh_token: refreshToken,
            ip_address: ipAddress,
            user_agent: userAgent,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();
    
    return { data, error, sessionToken, refreshToken };
}
```

---

## 🧪 Test Your Setup

### 1. Check Tables
```sql
-- List all tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Count rows in each table
SELECT 'roles' as table_name, COUNT(*) as count FROM roles
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'user_sessions', COUNT(*) FROM user_sessions
UNION ALL
SELECT 'otp_records', COUNT(*) FROM otp_records;
```

### 2. View Default Roles
```sql
SELECT * FROM roles ORDER BY role_name;
```

### 3. Check Default Admin User
```sql
SELECT 
    u.username,
    u.email,
    r.role_name,
    u.is_active,
    u.created_at
FROM users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.username = 'admin';
```

---

## 🔄 Migration from SQLite

If you want to migrate existing data from your SQLite database:

### 1. Export SQLite Data
```bash
# Export users
sqlite3 DLC_Database.db "SELECT * FROM users;" > users_export.csv

# Export other tables similarly
```

### 2. Import to Supabase
Use Supabase Dashboard → Table Editor → Import CSV

Or use SQL:
```sql
COPY users(username, email, password_hash, phone_number, role_id)
FROM '/path/to/users_export.csv'
DELIMITER ','
CSV HEADER;
```

---

## 📊 Monitoring & Maintenance

### View Active Users
```sql
SELECT 
    u.username,
    u.email,
    u.last_login,
    COUNT(s.id) as active_sessions
FROM users u
LEFT JOIN user_sessions s ON u.id = s.user_id 
    AND s.is_active = true 
    AND s.expires_at > NOW()
GROUP BY u.id, u.username, u.email, u.last_login
ORDER BY u.last_login DESC;
```

### Clean Up Old Data
```sql
-- Run these periodically (or set up cron jobs)
SELECT cleanup_expired_otps();
SELECT cleanup_expired_sessions();
```

### Monitor Failed Login Attempts
```sql
SELECT 
    username,
    email,
    failed_login_attempts,
    account_locked_until,
    last_login
FROM users
WHERE failed_login_attempts > 0
ORDER BY failed_login_attempts DESC;
```

---

## ✅ Setup Checklist

- [ ] Supabase project created
- [ ] SQL script executed successfully
- [ ] All 4 tables created (roles, users, user_sessions, otp_records)
- [ ] Default roles inserted (Admin, Manager, Viewer)
- [ ] RLS policies enabled
- [ ] Environment variables configured
- [ ] Supabase client installed in backend
- [ ] Test user creation working
- [ ] Test login working
- [ ] Test OTP generation/verification working
- [ ] Test session management working

---

## 🆘 Troubleshooting

### Error: "relation already exists"
**Solution:** Tables already created. Drop and recreate:
```sql
DROP TABLE IF EXISTS otp_records CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
-- Then run setup script again
```

### Error: "permission denied"
**Solution:** Make sure you're using the service_role key in your backend, not the anon key.

### OTP not working
**Solution:** Check:
1. OTP expiry time (4 minutes)
2. Max attempts (3)
3. Phone number format
4. SMS gateway configuration

---

## 📞 Support

If you need help:
1. Check Supabase documentation: https://supabase.com/docs
2. Review the SQL script comments
3. Test with the example code provided

---

**Setup Complete! 🎉**

Your Supabase database is now ready for the DLC Portal authentication system.
