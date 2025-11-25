-- =====================================================
-- TicketToken Platform - Core Users Schema
-- Week 1, Day 1 Development
-- =====================================================
-- Description: User accounts and authentication data schema
-- Version: 1.0
-- Created: 2025-07-16 13:49:58
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- For password hashing utilities

-- Create custom ENUM types for user account status
CREATE TYPE user_account_status AS ENUM (
    'active',               -- User account is active and can login
    'suspended',            -- User account is temporarily suspended
    'pending_verification'  -- User account is pending email/phone verification
);

-- =====================================================
-- USERS TABLE
-- =====================================================
-- Core user accounts table containing authentication and profile data
CREATE TABLE IF NOT EXISTS users (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Authentication credentials
    email VARCHAR(320) NOT NULL UNIQUE,                    -- RFC 5322 compliant email length
    username VARCHAR(50) NOT NULL UNIQUE,                  -- Unique username for display/login
    password_hash VARCHAR(255) NOT NULL,                   -- Hashed password (bcrypt/argon2)
    
    -- User profile information
    first_name VARCHAR(100),                               -- User's first name
    last_name VARCHAR(100),                                -- User's last name  
    phone VARCHAR(20),                                     -- Phone number (international format)
    
    -- Account status and verification
    account_status user_account_status NOT NULL DEFAULT 'pending_verification',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,        -- Email verification status
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,        -- Phone verification status
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,    -- 2FA enablement status
    
    -- Security and session management
    last_login_at TIMESTAMPTZ,                            -- Last successful login timestamp
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,     -- Failed login counter for security
    account_locked_until TIMESTAMPTZ,                     -- Account lockout expiration
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Last password change
    
    -- Email verification tokens and expiry
    email_verification_token VARCHAR(255),                -- Token for email verification
    email_verification_expires_at TIMESTAMPTZ,           -- Email verification token expiry
    
    -- Password reset functionality
    password_reset_token VARCHAR(255),                    -- Token for password reset
    password_reset_expires_at TIMESTAMPTZ,               -- Password reset token expiry
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- Account creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- Last update timestamp
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,                               -- Soft delete timestamp (NULL = not deleted)
    
    -- Constraints
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_username_format CHECK (username ~* '^[A-Za-z0-9_-]{3,50}$'),
    CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~* '^\+?[1-9]\d{1,14}$'),
    CONSTRAINT users_failed_attempts_positive CHECK (failed_login_attempts >= 0)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE deleted_at IS NULL;

-- Authentication and security indexes
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled) WHERE deleted_at IS NULL;

-- Token lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token) 
    WHERE email_verification_token IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token) 
    WHERE password_reset_token IS NOT NULL AND deleted_at IS NULL;

-- Audit and management indexes
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_status_verified ON users(account_status, email_verified) 
    WHERE deleted_at IS NULL;

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the update function before any UPDATE on users table
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- =====================================================
-- HELPER FUNCTIONS FOR USER MANAGEMENT
-- =====================================================

-- Function to create a new user with proper defaults
CREATE OR REPLACE FUNCTION create_user(
    p_email VARCHAR(320),
    p_username VARCHAR(50),
    p_password_hash VARCHAR(255),
    p_first_name VARCHAR(100) DEFAULT NULL,
    p_last_name VARCHAR(100) DEFAULT NULL,
    p_phone VARCHAR(20) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    INSERT INTO users (email, username, password_hash, first_name, last_name, phone)
    VALUES (p_email, p_username, p_password_hash, p_first_name, p_last_name, p_phone)
    RETURNING id INTO new_user_id;
    
    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to soft delete a user
CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE users 
    SET deleted_at = NOW(),
        account_status = 'suspended'
    WHERE id = p_user_id AND deleted_at IS NULL;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get active users count
CREATE OR REPLACE FUNCTION get_active_users_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM users WHERE account_status = 'active' AND deleted_at IS NULL);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLE AND COLUMNS
-- =====================================================

COMMENT ON TABLE users IS 'Core user accounts table for TicketToken platform authentication and profile management';

COMMENT ON COLUMN users.id IS 'Primary key: UUID identifier for the user account';
COMMENT ON COLUMN users.email IS 'User email address: used for login and communication (unique, required)';
COMMENT ON COLUMN users.username IS 'User display name: unique identifier visible to other users';
COMMENT ON COLUMN users.password_hash IS 'Hashed password: stored using bcrypt or argon2 hashing';
COMMENT ON COLUMN users.first_name IS 'User first name: optional profile information';
COMMENT ON COLUMN users.last_name IS 'User last name: optional profile information';
COMMENT ON COLUMN users.phone IS 'Phone number: optional, stored in international format';
COMMENT ON COLUMN users.account_status IS 'Account status: active, suspended, or pending_verification';
COMMENT ON COLUMN users.email_verified IS 'Email verification status: true if email has been verified';
COMMENT ON COLUMN users.phone_verified IS 'Phone verification status: true if phone has been verified';
COMMENT ON COLUMN users.two_factor_enabled IS 'Two-factor authentication status: true if 2FA is enabled';
COMMENT ON COLUMN users.last_login_at IS 'Last login timestamp: when user last successfully logged in';
COMMENT ON COLUMN users.failed_login_attempts IS 'Failed login counter: tracks consecutive failed login attempts';
COMMENT ON COLUMN users.account_locked_until IS 'Account lockout expiry: when account lockout expires (if locked)';
COMMENT ON COLUMN users.password_changed_at IS 'Password change timestamp: when password was last changed';
COMMENT ON COLUMN users.email_verification_token IS 'Email verification token: temporary token for email verification';
COMMENT ON COLUMN users.email_verification_expires_at IS 'Email verification expiry: when verification token expires';
COMMENT ON COLUMN users.password_reset_token IS 'Password reset token: temporary token for password reset';
COMMENT ON COLUMN users.password_reset_expires_at IS 'Password reset expiry: when reset token expires';
COMMENT ON COLUMN users.created_at IS 'Creation timestamp: when the user account was created';
COMMENT ON COLUMN users.updated_at IS 'Update timestamp: when the user account was last modified';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp: when the user account was deleted (NULL = active)';

-- =====================================================
-- SAMPLE DATA FOR DEVELOPMENT (OPTIONAL)
-- =====================================================
-- Uncomment the following lines to insert sample data for development

/*
-- Sample admin user (password: 'admin123' hashed with bcrypt)
INSERT INTO users (email, username, password_hash, first_name, last_name, account_status, email_verified)
VALUES (
    'admin@tickettoken.com',
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7jMk82hv2.',
    'Admin',
    'User',
    'active',
    true
);

-- Sample regular user (password: 'user123' hashed with bcrypt)  
INSERT INTO users (email, username, password_hash, first_name, last_name, phone)
VALUES (
    'john.doe@example.com',
    'johndoe',
    '$2b$12$9ZjZh5V5H5V5H5V5H5V5H.GkKZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z',
    'John',
    'Doe',
    '+1234567890'
);
*/

-- =====================================================
-- SCHEMA CREATION COMPLETE
-- =====================================================
-- Users table with authentication, profiles, and security features
-- Includes proper indexing, constraints, and helper functions
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_tenant_created ON users(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
