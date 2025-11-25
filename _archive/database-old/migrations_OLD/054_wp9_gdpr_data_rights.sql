-- GDPR/CCPA Data Rights Management System
-- Handles data export, deletion, consent, and breach notifications

-- User consent tracking
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    consent_type VARCHAR(50) NOT NULL, -- 'marketing', 'analytics', 'third_party', 'cookies'
    consent_version VARCHAR(20) NOT NULL, -- Version of terms/privacy policy
    
    -- Consent details
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    granted_at TIMESTAMP,
    granted_ip INET,
    granted_method VARCHAR(50), -- 'signup', 'settings', 'popup', 'email'
    
    -- Withdrawal
    withdrawn BOOLEAN DEFAULT FALSE,
    withdrawn_at TIMESTAMP,
    withdrawn_ip INET,
    withdrawn_method VARCHAR(50),
    
    -- Legal basis
    legal_basis VARCHAR(50), -- 'consent', 'contract', 'legitimate_interest', 'legal_obligation'
    purpose TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, consent_type, consent_version)
);

-- Data export requests
CREATE TABLE IF NOT EXISTS data_export_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    
    -- Request details
    request_type VARCHAR(20) NOT NULL, -- 'gdpr', 'ccpa', 'manual'
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    requested_ip INET,
    
    -- Processing
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'expired', 'failed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP, -- Download link expiration
    
    -- Output
    file_url VARCHAR(500),
    file_size_bytes BIGINT,
    file_format VARCHAR(10), -- 'json', 'csv', 'pdf'
    records_included JSONB, -- Which data types were included
    
    -- Verification
    verification_code VARCHAR(100), -- Email verification code
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    
    -- Audit
    processed_by VARCHAR(255), -- System or admin user
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data deletion requests
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    
    -- Request details
    request_type VARCHAR(20) NOT NULL, -- 'gdpr', 'ccpa', 'voluntary'
    reason TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    requested_ip INET,
    
    -- Processing
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'reviewing', 'approved', 'processing', 'completed', 'rejected'
    review_required BOOLEAN DEFAULT TRUE,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP,
    
    -- Execution
    scheduled_for TIMESTAMP, -- Can be delayed (e.g., 30 days)
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- What was deleted
    data_categories JSONB, -- List of data categories deleted
    records_deleted INTEGER,
    tables_affected TEXT[],
    
    -- Retention exceptions
    retained_data JSONB, -- What couldn't be deleted and why
    retention_reason TEXT, -- Legal requirement, ongoing transaction, etc.
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data breach notifications
CREATE TABLE IF NOT EXISTS data_breach_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Breach details
    breach_date TIMESTAMP NOT NULL,
    discovered_date TIMESTAMP NOT NULL,
    breach_type VARCHAR(50), -- 'unauthorized_access', 'data_theft', 'accidental_disclosure'
    severity VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
    
    -- Affected data
    affected_users INTEGER,
    affected_user_ids UUID[],
    data_types_affected TEXT[], -- email, password, payment, etc.
    
    -- Response
    authorities_notified BOOLEAN DEFAULT FALSE,
    authority_notification_date TIMESTAMP,
    users_notified BOOLEAN DEFAULT FALSE,
    user_notification_date TIMESTAMP,
    public_disclosure BOOLEAN DEFAULT FALSE,
    public_disclosure_date TIMESTAMP,
    
    -- Details
    description TEXT NOT NULL,
    impact_assessment TEXT,
    remediation_steps TEXT,
    
    -- Audit
    reported_by VARCHAR(255),
    investigation_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Privacy settings per user
CREATE TABLE IF NOT EXISTS user_privacy_settings (
    user_id UUID PRIMARY KEY,
    
    -- Communication preferences
    email_marketing BOOLEAN DEFAULT FALSE,
    sms_marketing BOOLEAN DEFAULT FALSE,
    push_notifications BOOLEAN DEFAULT TRUE,
    
    -- Data sharing
    share_with_venues BOOLEAN DEFAULT TRUE,
    share_with_partners BOOLEAN DEFAULT FALSE,
    analytics_tracking BOOLEAN DEFAULT TRUE,
    
    -- Privacy options
    profile_visible BOOLEAN DEFAULT TRUE,
    searchable BOOLEAN DEFAULT TRUE,
    show_purchase_history BOOLEAN DEFAULT FALSE,
    
    -- Data retention
    auto_delete_after_days INTEGER, -- Auto-delete account after inactivity
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for all privacy-related actions
CREATE TABLE IF NOT EXISTS privacy_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    
    -- Action details
    action VARCHAR(100) NOT NULL, -- 'consent_granted', 'data_exported', 'data_deleted', etc.
    entity_type VARCHAR(50),
    entity_id UUID,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    
    -- Details
    old_value JSONB,
    new_value JSONB,
    metadata JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_consents_user ON user_consents(user_id);
CREATE INDEX idx_consents_type ON user_consents(consent_type);
CREATE INDEX idx_export_user ON data_export_requests(user_id);
CREATE INDEX idx_export_status ON data_export_requests(status);
CREATE INDEX idx_deletion_user ON data_deletion_requests(user_id);
CREATE INDEX idx_deletion_status ON data_deletion_requests(status);
CREATE INDEX idx_breach_date ON data_breach_notifications(breach_date);
CREATE INDEX idx_privacy_audit_user ON privacy_audit_log(user_id);
CREATE INDEX idx_privacy_audit_action ON privacy_audit_log(action);
CREATE INDEX idx_privacy_audit_created ON privacy_audit_log(created_at);
