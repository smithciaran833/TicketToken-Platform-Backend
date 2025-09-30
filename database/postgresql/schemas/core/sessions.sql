-- =====================================================
-- TicketToken Platform - Core Sessions Management Schema
-- Week 1, Day 1 Development
-- =====================================================
-- Description: Advanced user session tracking and security monitoring
-- Version: 1.0
-- Created: 2025-07-16 13:59:51
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- For secure token generation

-- Create ENUM types for session management
CREATE TYPE session_status AS ENUM (
    'active',             -- Session is currently active
    'expired',            -- Session has expired naturally
    'revoked',            -- Session was manually revoked
    'invalidated'         -- Session was invalidated due to security
);

CREATE TYPE device_type AS ENUM (
    'desktop',            -- Desktop computer
    'mobile',             -- Mobile phone
    'tablet',             -- Tablet device
    'tv',                 -- Smart TV or streaming device
    'bot',                -- Automated bot/crawler
    'unknown'             -- Unknown device type
);

CREATE TYPE session_risk_level AS ENUM (
    'low',                -- Normal session activity
    'medium',             -- Slightly suspicious activity
    'high',               -- Highly suspicious activity
    'critical'            -- Critical security threat
);

-- =====================================================
-- SESSIONS TABLE
-- =====================================================
-- Core sessions table for user session tracking and security
CREATE TABLE IF NOT EXISTS sessions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- User association
    user_id UUID NOT NULL,                               -- Reference to users.id
    
    -- Session tokens
    session_token VARCHAR(255) NOT NULL UNIQUE,          -- Unique session identifier
    refresh_token VARCHAR(255) UNIQUE,                   -- Token for session refresh
    csrf_token VARCHAR(255),                             -- CSRF protection token
    
    -- Session timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- Session creation time
    expires_at TIMESTAMPTZ NOT NULL,                     -- Session expiration time
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Last user activity
    logged_out_at TIMESTAMPTZ,                          -- Logout timestamp
    
    -- Session status and metadata
    session_status session_status NOT NULL DEFAULT 'active',
    login_method VARCHAR(50) DEFAULT 'password',         -- Login method (password, oauth, 2fa, etc.)
    remember_me BOOLEAN NOT NULL DEFAULT FALSE,          -- Extended session flag
    
    -- Device and browser information
    device_type device_type DEFAULT 'unknown',           -- Device category
    device_name VARCHAR(200),                            -- Device name/model
    device_fingerprint VARCHAR(500),                     -- Unique device fingerprint
    user_agent TEXT,                                     -- Full user agent string
    browser_name VARCHAR(100),                           -- Browser name
    browser_version VARCHAR(50),                         -- Browser version
    operating_system VARCHAR(100),                       -- Operating system
    screen_resolution VARCHAR(20),                       -- Screen resolution (e.g., "1920x1080")
    
    -- Network and location information
    ip_address INET NOT NULL,                            -- Client IP address
    proxy_ip_address INET,                               -- Proxy/VPN IP if detected
    country_code CHAR(2),                                -- ISO country code
    region VARCHAR(100),                                 -- State/region/province
    city VARCHAR(100),                                   -- City name
    timezone VARCHAR(100),                               -- Client timezone
    isp VARCHAR(200),                                    -- Internet service provider
    
    -- Security and monitoring
    risk_level session_risk_level NOT NULL DEFAULT 'low', -- Security risk assessment
    is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,        -- Flagged as suspicious
    security_flags JSONB DEFAULT '{}',                   -- Security-related metadata
    login_attempts INTEGER NOT NULL DEFAULT 1,           -- Number of login attempts for this session
    
    -- Concurrent session tracking
    concurrent_sessions_count INTEGER DEFAULT 1,         -- Number of active sessions for user
    max_concurrent_sessions INTEGER DEFAULT 5,           -- Maximum allowed concurrent sessions
    
    -- Session metadata and tracking
    referrer_url TEXT,                                   -- Referring page URL
    initial_page_url TEXT,                               -- First page visited in session
    page_views_count INTEGER NOT NULL DEFAULT 0,         -- Total page views in session
    api_calls_count INTEGER NOT NULL DEFAULT 0,          -- Total API calls in session
    
    -- Audit and compliance
    gdpr_consent BOOLEAN,                                -- GDPR consent status
    privacy_policy_version VARCHAR(20),                  -- Privacy policy version accepted
    terms_version VARCHAR(20),                           -- Terms of service version accepted
    
    -- Session analytics
    session_duration_seconds INTEGER,                    -- Total session duration
    idle_time_seconds INTEGER,                           -- Total idle time
    
    -- Administrative fields
    created_by_system BOOLEAN NOT NULL DEFAULT TRUE,     -- System-created vs admin-created
    notes TEXT,                                          -- Administrative notes
    
    -- Constraints
    CONSTRAINT sessions_valid_expiry CHECK (expires_at > created_at),
    CONSTRAINT sessions_valid_logout CHECK (logged_out_at IS NULL OR logged_out_at >= created_at),
    CONSTRAINT sessions_valid_activity CHECK (last_activity_at >= created_at),
    CONSTRAINT sessions_concurrent_positive CHECK (concurrent_sessions_count > 0),
    CONSTRAINT sessions_max_concurrent_positive CHECK (max_concurrent_sessions > 0),
    CONSTRAINT sessions_page_views_positive CHECK (page_views_count >= 0),
    CONSTRAINT sessions_api_calls_positive CHECK (api_calls_count >= 0)
);

-- =====================================================
-- SESSION_ACTIVITIES TABLE
-- =====================================================
-- Detailed session activity tracking for security monitoring
CREATE TABLE IF NOT EXISTS session_activities (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Session association
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    
    -- Activity details
    activity_type VARCHAR(100) NOT NULL,                 -- Type of activity (login, page_view, api_call, etc.)
    activity_description TEXT,                           -- Detailed activity description
    
    -- Activity metadata
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- When activity occurred
    ip_address INET,                                     -- IP address for this activity
    user_agent TEXT,                                     -- User agent for this activity
    
    -- Page/endpoint information
    page_url TEXT,                                       -- Page URL or API endpoint
    http_method VARCHAR(10),                             -- HTTP method (GET, POST, etc.)
    http_status_code INTEGER,                            -- HTTP response status
    
    -- Request/response metadata
    request_data JSONB,                                  -- Request parameters/body
    response_data JSONB,                                 -- Response data summary
    processing_time_ms INTEGER,                          -- Request processing time
    
    -- Security flags
    is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,        -- Suspicious activity flag
    risk_score INTEGER DEFAULT 0,                       -- Risk score (0-100)
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- SUSPICIOUS_SESSIONS TABLE
-- =====================================================
-- Track sessions flagged for suspicious activity
CREATE TABLE IF NOT EXISTS suspicious_sessions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Session and user association
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,                               -- Reference to users.id
    
    -- Suspicious activity details
    detection_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When suspicious activity was detected
    detection_reason TEXT NOT NULL,                      -- Reason for flagging as suspicious
    severity session_risk_level NOT NULL DEFAULT 'medium', -- Severity level
    
    -- Detection metadata
    detection_method VARCHAR(100),                       -- How it was detected (automated, manual, etc.)
    detected_by_user_id UUID,                           -- Admin user who flagged (if manual)
    
    -- Investigation status
    investigated BOOLEAN NOT NULL DEFAULT FALSE,         -- Whether it has been investigated
    investigated_at TIMESTAMPTZ,                        -- Investigation timestamp
    investigated_by_user_id UUID,                       -- Admin who investigated
    investigation_notes TEXT,                            -- Investigation findings
    
    -- Resolution
    resolved BOOLEAN NOT NULL DEFAULT FALSE,             -- Whether issue is resolved
    resolved_at TIMESTAMPTZ,                            -- Resolution timestamp
    resolution_action VARCHAR(100),                      -- Action taken (session_revoked, user_warned, etc.)
    
    -- Additional metadata
    additional_data JSONB,                               -- Additional suspicious activity data
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token) WHERE refresh_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(session_status);

-- Time-based indexes for session management
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- Security and monitoring indexes
CREATE INDEX IF NOT EXISTS idx_sessions_ip_address ON sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_sessions_suspicious ON sessions(is_suspicious) WHERE is_suspicious = true;
CREATE INDEX IF NOT EXISTS idx_sessions_risk_level ON sessions(risk_level);
CREATE INDEX IF NOT EXISTS idx_sessions_device_fingerprint ON sessions(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- Concurrent session tracking
CREATE INDEX IF NOT EXISTS idx_sessions_active_user ON sessions(user_id, session_status) WHERE session_status = 'active';

-- Geographic indexes
CREATE INDEX IF NOT EXISTS idx_sessions_country ON sessions(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_location ON sessions(country_code, region, city) WHERE country_code IS NOT NULL;

-- Session activities indexes
CREATE INDEX IF NOT EXISTS idx_session_activities_session_id ON session_activities(session_id);
CREATE INDEX IF NOT EXISTS idx_session_activities_timestamp ON session_activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_session_activities_type ON session_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_session_activities_suspicious ON session_activities(is_suspicious) WHERE is_suspicious = true;

-- Suspicious sessions indexes
CREATE INDEX IF NOT EXISTS idx_suspicious_sessions_session_id ON suspicious_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_sessions_user_id ON suspicious_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_sessions_timestamp ON suspicious_sessions(detection_timestamp);
CREATE INDEX IF NOT EXISTS idx_suspicious_sessions_investigated ON suspicious_sessions(investigated);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, last_activity_at) 
    WHERE session_status = 'active';
CREATE INDEX IF NOT EXISTS idx_sessions_cleanup ON sessions(session_status, expires_at) 
    WHERE session_status IN ('expired', 'revoked');

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to automatically update session metadata
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last activity timestamp
    NEW.last_activity_at = NOW();
    
    -- Calculate session duration if logging out
    IF NEW.logged_out_at IS NOT NULL AND OLD.logged_out_at IS NULL THEN
        NEW.session_duration_seconds = EXTRACT(EPOCH FROM (NEW.logged_out_at - NEW.created_at))::INTEGER;
        NEW.session_status = 'expired';
    END IF;
    
    -- Update concurrent session count
    IF NEW.session_status = 'active' AND OLD.session_status != 'active' THEN
        NEW.concurrent_sessions_count = (
            SELECT COUNT(*) 
            FROM sessions 
            WHERE user_id = NEW.user_id 
            AND session_status = 'active' 
            AND id != NEW.id
        ) + 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically update suspicious sessions
CREATE OR REPLACE FUNCTION update_suspicious_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updates
DROP TRIGGER IF EXISTS trigger_session_activity ON sessions;
CREATE TRIGGER trigger_session_activity
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_activity();

DROP TRIGGER IF EXISTS trigger_suspicious_sessions_updated_at ON suspicious_sessions;
CREATE TRIGGER trigger_suspicious_sessions_updated_at
    BEFORE UPDATE ON suspicious_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_suspicious_sessions_updated_at();

-- =====================================================
-- SESSION MANAGEMENT HELPER FUNCTIONS
-- =====================================================

-- Function to create a new session
CREATE OR REPLACE FUNCTION create_session(
    p_user_id UUID,
    p_ip_address INET,
    p_user_agent TEXT DEFAULT NULL,
    p_device_fingerprint VARCHAR(500) DEFAULT NULL,
    p_remember_me BOOLEAN DEFAULT FALSE,
    p_login_method VARCHAR(50) DEFAULT 'password'
) RETURNS UUID AS $$
DECLARE
    new_session_id UUID;
    session_duration INTERVAL;
    concurrent_count INTEGER;
BEGIN
    -- Check concurrent session limit
    SELECT COUNT(*) INTO concurrent_count
    FROM sessions
    WHERE user_id = p_user_id AND session_status = 'active';
    
    -- Set session duration based on remember_me flag
    session_duration = CASE WHEN p_remember_me THEN INTERVAL '30 days' ELSE INTERVAL '8 hours' END;
    
    -- Create new session
    INSERT INTO sessions (
        user_id, session_token, refresh_token, ip_address,
        user_agent, device_fingerprint, remember_me, login_method,
        expires_at, concurrent_sessions_count
    )
    VALUES (
        p_user_id,
        encode(gen_random_bytes(32), 'hex'),
        encode(gen_random_bytes(32), 'hex'),
        p_ip_address,
        p_user_agent,
        p_device_fingerprint,
        p_remember_me,
        p_login_method,
        NOW() + session_duration,
        concurrent_count + 1
    )
    RETURNING id INTO new_session_id;
    
    -- Log session creation activity
    INSERT INTO session_activities (session_id, activity_type, activity_description, ip_address, user_agent)
    VALUES (new_session_id, 'session_created', 'User session created', p_ip_address, p_user_agent);
    
    RETURN new_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to validate session token
CREATE OR REPLACE FUNCTION validate_session(p_session_token VARCHAR(255))
RETURNS TABLE(
    session_id UUID,
    user_id UUID,
    is_valid BOOLEAN,
    expires_at TIMESTAMPTZ,
    risk_level session_risk_level
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.user_id, 
           (s.session_status = 'active' AND s.expires_at > NOW()) as is_valid,
           s.expires_at, s.risk_level
    FROM sessions s
    WHERE s.session_token = p_session_token;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh session
CREATE OR REPLACE FUNCTION refresh_session(
    p_refresh_token VARCHAR(255),
    p_new_expiry TIMESTAMPTZ DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    session_record RECORD;
    new_expiry TIMESTAMPTZ;
BEGIN
    -- Find session by refresh token
    SELECT * INTO session_record
    FROM sessions
    WHERE refresh_token = p_refresh_token
    AND session_status = 'active'
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Calculate new expiry
    new_expiry = COALESCE(p_new_expiry, NOW() + INTERVAL '8 hours');
    
    -- Update session
    UPDATE sessions
    SET expires_at = new_expiry,
        last_activity_at = NOW(),
        refresh_token = encode(gen_random_bytes(32), 'hex')
    WHERE id = session_record.id;
    
    -- Log refresh activity
    INSERT INTO session_activities (session_id, activity_type, activity_description)
    VALUES (session_record.id, 'session_refreshed', 'Session token refreshed');
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke session
CREATE OR REPLACE FUNCTION revoke_session(
    p_session_id UUID,
    p_reason TEXT DEFAULT 'User logout'
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE sessions
    SET session_status = 'revoked',
        logged_out_at = NOW()
    WHERE id = p_session_id
    AND session_status = 'active';
    
    IF FOUND THEN
        -- Log revocation activity
        INSERT INTO session_activities (session_id, activity_type, activity_description)
        VALUES (p_session_id, 'session_revoked', p_reason);
        
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke all user sessions
CREATE OR REPLACE FUNCTION revoke_all_user_sessions(
    p_user_id UUID,
    p_except_session_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Security revocation'
) RETURNS INTEGER AS $$
DECLARE
    revoked_count INTEGER := 0;
    session_record RECORD;
BEGIN
    FOR session_record IN
        SELECT id FROM sessions
        WHERE user_id = p_user_id
        AND session_status = 'active'
        AND (p_except_session_id IS NULL OR id != p_except_session_id)
    LOOP
        PERFORM revoke_session(session_record.id, p_reason);
        revoked_count := revoked_count + 1;
    END LOOP;
    
    RETURN revoked_count;
END;
$$ LANGUAGE plpgsql;

-- Function to track session activity
CREATE OR REPLACE FUNCTION track_session_activity(
    p_session_id UUID,
    p_activity_type VARCHAR(100),
    p_activity_description TEXT DEFAULT NULL,
    p_page_url TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    activity_id UUID;
BEGIN
    -- Update session last activity
    UPDATE sessions
    SET last_activity_at = NOW(),
        page_views_count = CASE WHEN p_activity_type = 'page_view' THEN page_views_count + 1 ELSE page_views_count END,
        api_calls_count = CASE WHEN p_activity_type = 'api_call' THEN api_calls_count + 1 ELSE api_calls_count END
    WHERE id = p_session_id;
    
    -- Insert activity record
    INSERT INTO session_activities (
        session_id, activity_type, activity_description, page_url, ip_address
    )
    VALUES (
        p_session_id, p_activity_type, p_activity_description, p_page_url, p_ip_address
    )
    RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql;

-- Function to flag suspicious session
CREATE OR REPLACE FUNCTION flag_suspicious_session(
    p_session_id UUID,
    p_reason TEXT,
    p_severity session_risk_level DEFAULT 'medium',
    p_detection_method VARCHAR(100) DEFAULT 'automated'
) RETURNS UUID AS $$
DECLARE
    suspicious_id UUID;
    session_user_id UUID;
BEGIN
    -- Get user ID from session
    SELECT user_id INTO session_user_id FROM sessions WHERE id = p_session_id;
    
    -- Update session risk level
    UPDATE sessions
    SET is_suspicious = TRUE,
        risk_level = p_severity
    WHERE id = p_session_id;
    
    -- Insert suspicious session record
    INSERT INTO suspicious_sessions (
        session_id, user_id, detection_reason, severity, detection_method
    )
    VALUES (
        p_session_id, session_user_id, p_reason, p_severity, p_detection_method
    )
    RETURNING id INTO suspicious_id;
    
    -- Log suspicious activity
    INSERT INTO session_activities (
        session_id, activity_type, activity_description, is_suspicious
    )
    VALUES (
        p_session_id, 'suspicious_flagged', p_reason, TRUE
    );
    
    RETURN suspicious_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get active sessions for user
CREATE OR REPLACE FUNCTION get_user_active_sessions(p_user_id UUID)
RETURNS TABLE(
    session_id UUID,
    created_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    ip_address INET,
    device_type device_type,
    device_name VARCHAR(200),
    browser_name VARCHAR(100),
    location TEXT,
    is_current BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.created_at, s.last_activity_at, s.ip_address,
           s.device_type, s.device_name, s.browser_name,
           COALESCE(s.city || ', ' || s.region || ', ' || s.country_code, 'Unknown') as location,
           (s.last_activity_at > NOW() - INTERVAL '5 minutes') as is_current
    FROM sessions s
    WHERE s.user_id = p_user_id
    AND s.session_status = 'active'
    AND s.expires_at > NOW()
    ORDER BY s.last_activity_at DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- AUTOMATIC CLEANUP PROCEDURES
-- =====================================================

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    cleanup_count INTEGER := 0;
BEGIN
    -- Mark expired sessions
    UPDATE sessions
    SET session_status = 'expired'
    WHERE session_status = 'active'
    AND expires_at <= NOW();
    
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    
    -- Delete old session activities (older than 90 days)
    DELETE FROM session_activities
    WHERE timestamp < NOW() - INTERVAL '90 days';
    
    -- Delete old expired sessions (older than 30 days)
    DELETE FROM sessions
    WHERE session_status IN ('expired', 'revoked')
    AND created_at < NOW() - INTERVAL '30 days';
    
    RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql;

-- Function to detect suspicious concurrent sessions
CREATE OR REPLACE FUNCTION detect_suspicious_concurrent_sessions()
RETURNS INTEGER AS $$
DECLARE
    flagged_count INTEGER := 0;
    session_record RECORD;
BEGIN
    FOR session_record IN
        SELECT user_id, COUNT(*) as concurrent_count
        FROM sessions
        WHERE session_status = 'active'
        AND expires_at > NOW()
        GROUP BY user_id
        HAVING COUNT(*) > 10  -- Flag users with more than 10 concurrent sessions
    LOOP
        -- Flag all sessions for this user as suspicious
        UPDATE sessions
        SET is_suspicious = TRUE,
            risk_level = 'high'
        WHERE user_id = session_record.user_id
        AND session_status = 'active'
        AND is_suspicious = FALSE;
        
        flagged_count := flagged_count + session_record.concurrent_count;
    END LOOP;
    
    RETURN flagged_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SCHEDULED CLEANUP JOBS (PostgreSQL pg_cron extension required)
-- =====================================================

-- Note: These would require pg_cron extension to be installed
-- Uncomment and modify as needed for your environment

/*
-- Schedule cleanup job to run every hour
SELECT cron.schedule('session-cleanup', '0 * * * *', 'SELECT cleanup_expired_sessions();');

-- Schedule suspicious session detection to run every 30 minutes
SELECT cron.schedule('suspicious-session-detection', '*/30 * * * *', 'SELECT detect_suspicious_concurrent_sessions();');
*/

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE sessions IS 'User session tracking with security monitoring and device fingerprinting';
COMMENT ON TABLE session_activities IS 'Detailed session activity log for security analysis';
COMMENT ON TABLE suspicious_sessions IS 'Sessions flagged for suspicious activity with investigation tracking';

-- Sessions table comments
COMMENT ON COLUMN sessions.session_token IS 'Unique session identifier: secure random token for authentication';
COMMENT ON COLUMN sessions.refresh_token IS 'Refresh token: used to extend session without re-authentication';
COMMENT ON COLUMN sessions.csrf_token IS 'CSRF protection token: prevents cross-site request forgery';
COMMENT ON COLUMN sessions.device_fingerprint IS 'Device fingerprint: unique identifier for device recognition';
COMMENT ON COLUMN sessions.risk_level IS 'Security risk level: automated assessment of session safety';
COMMENT ON COLUMN sessions.is_suspicious IS 'Suspicious flag: manual or automated flagging of unusual activity';
COMMENT ON COLUMN sessions.concurrent_sessions_count IS 'Concurrent sessions: number of active sessions for this user';
COMMENT ON COLUMN sessions.security_flags IS 'Security metadata: JSON object with security-related data';

-- Session activities table comments
COMMENT ON COLUMN session_activities.activity_type IS 'Activity type: categorization of user action (login, page_view, api_call)';
COMMENT ON COLUMN session_activities.risk_score IS 'Risk score: numerical assessment of activity suspiciousness (0-100)';
COMMENT ON COLUMN session_activities.processing_time_ms IS 'Processing time: request/response processing duration in milliseconds';

-- Suspicious sessions table comments
COMMENT ON COLUMN suspicious_sessions.detection_reason IS 'Detection reason: explanation for why session was flagged';
COMMENT ON COLUMN suspicious_sessions.severity IS 'Severity level: risk assessment of suspicious activity';
COMMENT ON COLUMN suspicious_sessions.resolution_action IS 'Resolution action: what action was taken to resolve the issue';

-- =====================================================
-- SESSION MANAGEMENT SCHEMA CREATION COMPLETE
-- =====================================================
-- Advanced session management system with:
-- - Comprehensive session tracking and metadata
-- - Security monitoring and risk assessment
-- - Device fingerprinting and geographic tracking
-- - Automatic session cleanup and maintenance
-- - Suspicious activity detection and investigation
-- - Helper functions for session management
-- - Performance-optimized indexes
-- - Audit trail for compliance
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_id ON sessions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_created ON sessions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
