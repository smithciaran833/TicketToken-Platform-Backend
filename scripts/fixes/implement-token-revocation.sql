-- 1. Token families for refresh token rotation
CREATE TABLE IF NOT EXISTS token_families (
    family_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_rotated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rotation_count INTEGER DEFAULT 0,
    ip_address VARCHAR(45),
    user_agent TEXT,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    revoke_reason VARCHAR(255)
);

-- 2. Active tokens tracking (for immediate revocation)
CREATE TABLE IF NOT EXISTS active_tokens (
    jti VARCHAR(255) PRIMARY KEY,
    family_id UUID REFERENCES token_families(family_id),
    user_id UUID NOT NULL REFERENCES users(id),
    token_type VARCHAR(20) NOT NULL, -- 'access' or 'refresh'
    issued_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    ip_address VARCHAR(45),
    CHECK (token_type IN ('access', 'refresh'))
);

-- 3. Token revocation events (audit trail)
CREATE TABLE IF NOT EXISTS token_revocation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES token_families(family_id),
    jti VARCHAR(255),
    user_id UUID REFERENCES users(id),
    revoked_by UUID REFERENCES users(id),
    revocation_type VARCHAR(50), -- 'logout', 'security', 'admin', 'password_change', 'suspicious_activity'
    reason TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. User sessions for device management
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    family_id UUID REFERENCES token_families(family_id),
    device_fingerprint VARCHAR(255),
    device_name VARCHAR(255),
    browser VARCHAR(100),
    os VARCHAR(100),
    ip_address VARCHAR(45),
    location_country VARCHAR(2),
    location_city VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_active_tokens_user_id ON active_tokens(user_id);
CREATE INDEX idx_active_tokens_expires ON active_tokens(expires_at);
CREATE INDEX idx_active_tokens_family ON active_tokens(family_id);
CREATE INDEX idx_token_families_user ON token_families(user_id);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_active ON user_sessions(is_active, last_activity);

-- Function to revoke all tokens for a user
CREATE OR REPLACE FUNCTION revoke_all_user_tokens(
    p_user_id UUID,
    p_reason VARCHAR(255) DEFAULT 'Security precaution'
) RETURNS VOID AS $$
BEGIN
    -- Revoke all token families
    UPDATE token_families 
    SET revoked = TRUE, 
        revoked_at = CURRENT_TIMESTAMP,
        revoke_reason = p_reason
    WHERE user_id = p_user_id AND revoked = FALSE;
    
    -- Revoke all active tokens
    UPDATE active_tokens
    SET revoked = TRUE
    WHERE user_id = p_user_id AND revoked = FALSE;
    
    -- Deactivate all sessions
    UPDATE user_sessions
    SET is_active = FALSE
    WHERE user_id = p_user_id AND is_active = TRUE;
    
    -- Log the event
    INSERT INTO token_revocation_events (user_id, revocation_type, reason, created_at)
    VALUES (p_user_id, 'security', p_reason, CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql;
