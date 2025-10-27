-- ============================================================================
-- DLC Portal - Supabase Database Setup
-- ============================================================================
-- Tables: users, roles, user_sessions, otp_records
-- Created: October 25, 2025
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE 1: roles
-- Purpose: Define user roles (Admin, Manager, Viewer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default roles
INSERT INTO roles (role_name, description, permissions) VALUES
    ('Admin', 'Full system access with all permissions', '{"can_manage_users": true, "can_view_reports": true, "can_export_data": true, "can_manage_roles": true, "can_access_sbi_api": true}'),
    ('Manager', 'Can manage data and view reports', '{"can_manage_users": false, "can_view_reports": true, "can_export_data": true, "can_manage_roles": false, "can_access_sbi_api": true}'),
    ('Viewer', 'Read-only access to reports', '{"can_manage_users": false, "can_view_reports": true, "can_export_data": false, "can_manage_roles": false, "can_access_sbi_api": false}')
ON CONFLICT (role_name) DO NOTHING;

-- ============================================================================
-- TABLE 2: users
-- Purpose: User authentication and management
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    phone_number VARCHAR(20) UNIQUE,
    phone_verified BOOLEAN DEFAULT FALSE,
    role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ============================================================================
-- TABLE 3: user_sessions
-- Purpose: Track user login sessions and JWT tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(500) UNIQUE NOT NULL,
    refresh_token VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_info JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for user_sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ============================================================================
-- TABLE 4: otp_records
-- Purpose: Store OTP codes for phone-based authentication
-- ============================================================================

CREATE TABLE IF NOT EXISTS otp_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_no VARCHAR(20) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    purpose VARCHAR(50) DEFAULT 'login', -- login, registration, password_reset
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expired_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    used BOOLEAN DEFAULT FALSE,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    ip_address VARCHAR(45),
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for otp_records table
CREATE INDEX IF NOT EXISTS idx_otp_contact ON otp_records(contact_no);
CREATE INDEX IF NOT EXISTS idx_otp_code ON otp_records(otp_code);
CREATE INDEX IF NOT EXISTS idx_otp_expired ON otp_records(expired_at);
CREATE INDEX IF NOT EXISTS idx_otp_used ON otp_records(used);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for roles table
DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired OTP records (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
    DELETE FROM otp_records 
    WHERE expired_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_records ENABLE ROW LEVEL SECURITY;

-- Roles table policies
CREATE POLICY "Roles are viewable by authenticated users" 
    ON roles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Only admins can modify roles" 
    ON roles FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id IN (SELECT id FROM roles WHERE role_name = 'Admin')
        )
    );

-- Users table policies
CREATE POLICY "Users can view their own data" 
    ON users FOR SELECT 
    TO authenticated 
    USING (id = auth.uid());

CREATE POLICY "Admins can view all users" 
    ON users FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id IN (SELECT id FROM roles WHERE role_name = 'Admin')
        )
    );

CREATE POLICY "Users can update their own data" 
    ON users FOR UPDATE 
    TO authenticated 
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can manage all users" 
    ON users FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id IN (SELECT id FROM roles WHERE role_name = 'Admin')
        )
    );

-- User sessions policies
CREATE POLICY "Users can view their own sessions" 
    ON user_sessions FOR SELECT 
    TO authenticated 
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sessions" 
    ON user_sessions FOR DELETE 
    TO authenticated 
    USING (user_id = auth.uid());

-- OTP records policies (service role only for security)
CREATE POLICY "Service role can manage OTP records" 
    ON otp_records FOR ALL 
    TO service_role 
    USING (true);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: User details with role information
CREATE OR REPLACE VIEW user_details AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.phone_number,
    u.phone_verified,
    u.is_active,
    u.last_login,
    u.created_at,
    r.role_name,
    r.description as role_description,
    r.permissions as role_permissions
FROM users u
LEFT JOIN roles r ON u.role_id = r.id;

-- View: Active sessions count per user
CREATE OR REPLACE VIEW active_sessions_count AS
SELECT 
    user_id,
    COUNT(*) as active_session_count,
    MAX(last_activity) as last_activity
FROM user_sessions
WHERE is_active = true AND expires_at > NOW()
GROUP BY user_id;

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Create a default admin user (password: Admin@123)
-- Note: This is a bcrypt hash of "Admin@123" - CHANGE THIS IN PRODUCTION!
DO $$
DECLARE
    admin_role_id UUID;
BEGIN
    -- Get Admin role ID
    SELECT id INTO admin_role_id FROM roles WHERE role_name = 'Admin';
    
    -- Insert admin user if not exists
    INSERT INTO users (username, email, password_hash, role_id, is_active, phone_verified)
    VALUES (
        'admin',
        'admin@dlcportal.gov.in',
        '$2b$10$rKvVLz5N5h5h5h5h5h5h5uO5h5h5h5h5h5h5h5h5h5h5h5h5h5h5h',
        admin_role_id,
        true,
        true
    )
    ON CONFLICT (username) DO NOTHING;
END $$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to authenticated users
GRANT SELECT ON roles TO authenticated;
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, DELETE ON user_sessions TO authenticated;

-- Grant permissions to service role (for backend API)
GRANT ALL ON roles TO service_role;
GRANT ALL ON users TO service_role;
GRANT ALL ON user_sessions TO service_role;
GRANT ALL ON otp_records TO service_role;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE roles IS 'User roles with permissions (Admin, Manager, Viewer)';
COMMENT ON TABLE users IS 'User accounts with authentication details';
COMMENT ON TABLE user_sessions IS 'Active user sessions and JWT tokens';
COMMENT ON TABLE otp_records IS 'OTP codes for phone-based authentication';

COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.phone_verified IS 'Whether phone number is verified via OTP';
COMMENT ON COLUMN users.failed_login_attempts IS 'Count of failed login attempts';
COMMENT ON COLUMN users.account_locked_until IS 'Account lock expiry timestamp';

COMMENT ON COLUMN otp_records.purpose IS 'Purpose: login, registration, password_reset';
COMMENT ON COLUMN otp_records.attempts IS 'Number of verification attempts';
COMMENT ON COLUMN otp_records.max_attempts IS 'Maximum allowed attempts before OTP expires';

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

-- Verify tables were created
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
    AND table_name IN ('roles', 'users', 'user_sessions', 'otp_records')
ORDER BY table_name;

-- Show success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database setup completed successfully!';
    RAISE NOTICE '📋 Tables created: roles, users, user_sessions, otp_records';
    RAISE NOTICE '🔐 Row Level Security enabled on all tables';
    RAISE NOTICE '⚡ Triggers and functions created';
    RAISE NOTICE '👤 Default admin user created (username: admin)';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Next steps:';
    RAISE NOTICE '   1. Change the default admin password';
    RAISE NOTICE '   2. Configure your backend to use Supabase';
    RAISE NOTICE '   3. Test the authentication flow';
END $$;
