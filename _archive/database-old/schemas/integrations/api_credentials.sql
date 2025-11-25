-- TicketToken API Credentials Schema
-- Week 3, Day 13: Secure storage of third-party API credentials
-- Purpose: Store and manage API keys, OAuth tokens, and integration credentials

-- Enable encryption extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS integrations;

-- Set search path
SET search_path TO integrations, public;

-- Create api_credentials table
CREATE TABLE IF NOT EXISTS api_credentials (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Provider information
   provider_name VARCHAR(100) NOT NULL,                -- SendGrid, Stripe, Twilio, etc.
   provider_type VARCHAR(50) NOT NULL,                 -- payment, email, sms, analytics, kyc
   
   -- Account details
   account_name VARCHAR(255) NOT NULL,                 -- Friendly name for this account
   account_id VARCHAR(255),                            -- Provider's account identifier
   environment VARCHAR(20) NOT NULL DEFAULT 'production', -- production, sandbox
   
   -- Encrypted credentials
   api_key_encrypted BYTEA,                            -- Encrypted API key
   api_secret_encrypted BYTEA,                         -- Encrypted API secret
   encryption_key_id UUID NOT NULL,                    -- Reference to encryption key used
   
   -- OAuth fields
   oauth_token_encrypted BYTEA,                        -- Encrypted OAuth access token
   oauth_refresh_token_encrypted BYTEA,                -- Encrypted OAuth refresh token
   oauth_expires_at TIMESTAMP WITH TIME ZONE,          -- When OAuth token expires
   
   -- Additional authentication
   webhook_secret_encrypted BYTEA,                     -- Encrypted webhook signing secret
   signing_key_encrypted BYTEA,                        -- Encrypted signing key for requests
   
   -- Endpoints
   base_url VARCHAR(500),                              -- Base API URL
   webhook_url VARCHAR(500),                           -- Our webhook endpoint for this provider
   custom_endpoints JSONB DEFAULT '{}',                -- Custom endpoint configurations
   
   -- Rate limiting
   rate_limit INTEGER,                                 -- Requests per window
   rate_limit_window VARCHAR(20) DEFAULT 'hour',       -- second, minute, hour, day
   current_usage INTEGER DEFAULT 0,                    -- Current usage in window
   
   -- Permissions and capabilities
   permissions TEXT[] DEFAULT '{}',                    -- List of granted permissions
   scopes TEXT[] DEFAULT '{}',                         -- OAuth scopes
   capabilities JSONB DEFAULT '{}',                    -- Provider-specific capabilities
   
   -- Status tracking
   is_active BOOLEAN DEFAULT true,                     -- Whether credentials are active
   last_verified_at TIMESTAMP WITH TIME ZONE,          -- Last successful verification
   verification_status VARCHAR(50) DEFAULT 'unverified', -- unverified, verified, failed
   
   -- Error tracking
   last_error TEXT,                                    -- Last error message
   error_count INTEGER DEFAULT 0,                      -- Total error count
   last_error_at TIMESTAMP WITH TIME ZONE,             -- When last error occurred
   
   -- Usage metrics
   total_requests BIGINT DEFAULT 0,                    -- Total API requests made
   successful_requests BIGINT DEFAULT 0,               -- Successful requests
   failed_requests BIGINT DEFAULT 0,                   -- Failed requests
   
   -- Billing information
   billing_plan VARCHAR(100),                          -- Current billing plan
   monthly_cost DECIMAL(10,2) DEFAULT 0,               -- Monthly cost in USD
   usage_based_cost BOOLEAN DEFAULT false,             -- Whether cost is usage-based
   
   -- Credential rotation
   last_rotated_at TIMESTAMP WITH TIME ZONE,           -- When credentials were last rotated
   rotation_required BOOLEAN DEFAULT false,            -- Whether rotation is needed
   rotation_schedule VARCHAR(50),                      -- monthly, quarterly, annually
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   created_by UUID,                                    -- User who created record
   modified_by UUID,                                   -- User who last modified
   
   -- Constraints
   CONSTRAINT chk_provider_type CHECK (provider_type IN ('payment', 'email', 'sms', 'analytics', 'kyc')),
   CONSTRAINT chk_environment CHECK (environment IN ('production', 'sandbox')),
   CONSTRAINT chk_rate_limit_window CHECK (rate_limit_window IN ('second', 'minute', 'hour', 'day')),
   CONSTRAINT chk_verification_status CHECK (verification_status IN ('unverified', 'verified', 'failed')),
   CONSTRAINT chk_rotation_schedule CHECK (rotation_schedule IS NULL OR rotation_schedule IN ('monthly', 'quarterly', 'annually')),
   CONSTRAINT chk_rate_limit CHECK (rate_limit IS NULL OR rate_limit > 0),
   CONSTRAINT chk_usage_metrics CHECK (
       total_requests >= 0 AND 
       successful_requests >= 0 AND 
       failed_requests >= 0 AND
       successful_requests + failed_requests <= total_requests
   ),
   CONSTRAINT chk_monthly_cost CHECK (monthly_cost >= 0)
);

-- Add unique constraint for provider + environment
ALTER TABLE api_credentials
   ADD CONSTRAINT uq_api_credentials_provider_env 
   UNIQUE (provider_name, environment);

-- Add comments
COMMENT ON TABLE api_credentials IS 'Secure storage for third-party API credentials and OAuth tokens';

COMMENT ON COLUMN api_credentials.id IS 'Unique identifier for credential record';
COMMENT ON COLUMN api_credentials.provider_name IS 'Name of the service provider (SendGrid, Stripe, etc.)';
COMMENT ON COLUMN api_credentials.provider_type IS 'Category of service: payment, email, sms, analytics, kyc';

COMMENT ON COLUMN api_credentials.account_name IS 'Human-friendly name for this credential set';
COMMENT ON COLUMN api_credentials.account_id IS 'Provider-specific account identifier';
COMMENT ON COLUMN api_credentials.environment IS 'Environment: production or sandbox';

COMMENT ON COLUMN api_credentials.api_key_encrypted IS 'Encrypted API key using pgcrypto';
COMMENT ON COLUMN api_credentials.api_secret_encrypted IS 'Encrypted API secret/password';
COMMENT ON COLUMN api_credentials.encryption_key_id IS 'Reference to key used for encryption';

COMMENT ON COLUMN api_credentials.oauth_token_encrypted IS 'Encrypted OAuth 2.0 access token';
COMMENT ON COLUMN api_credentials.oauth_refresh_token_encrypted IS 'Encrypted OAuth 2.0 refresh token';
COMMENT ON COLUMN api_credentials.oauth_expires_at IS 'OAuth token expiration timestamp';

COMMENT ON COLUMN api_credentials.webhook_secret_encrypted IS 'Secret for verifying webhook signatures';
COMMENT ON COLUMN api_credentials.signing_key_encrypted IS 'Key for signing outbound requests';

COMMENT ON COLUMN api_credentials.base_url IS 'Base URL for API requests';
COMMENT ON COLUMN api_credentials.webhook_url IS 'Our endpoint for receiving webhooks';
COMMENT ON COLUMN api_credentials.custom_endpoints IS 'Provider-specific endpoint configurations';

COMMENT ON COLUMN api_credentials.rate_limit IS 'Maximum requests per rate limit window';
COMMENT ON COLUMN api_credentials.rate_limit_window IS 'Time window for rate limiting';
COMMENT ON COLUMN api_credentials.current_usage IS 'Current usage within rate limit window';

COMMENT ON COLUMN api_credentials.permissions IS 'Array of granted permissions';
COMMENT ON COLUMN api_credentials.scopes IS 'OAuth scopes for token';
COMMENT ON COLUMN api_credentials.capabilities IS 'Provider-specific feature capabilities';

COMMENT ON COLUMN api_credentials.is_active IS 'Whether these credentials are currently active';
COMMENT ON COLUMN api_credentials.last_verified_at IS 'Last successful credential verification';
COMMENT ON COLUMN api_credentials.verification_status IS 'Current verification status';

COMMENT ON COLUMN api_credentials.last_error IS 'Most recent error message';
COMMENT ON COLUMN api_credentials.error_count IS 'Total number of errors encountered';
COMMENT ON COLUMN api_credentials.last_error_at IS 'Timestamp of most recent error';

COMMENT ON COLUMN api_credentials.total_requests IS 'Total API requests made with these credentials';
COMMENT ON COLUMN api_credentials.successful_requests IS 'Count of successful API requests';
COMMENT ON COLUMN api_credentials.failed_requests IS 'Count of failed API requests';

COMMENT ON COLUMN api_credentials.billing_plan IS 'Current billing plan with provider';
COMMENT ON COLUMN api_credentials.monthly_cost IS 'Monthly cost in USD';
COMMENT ON COLUMN api_credentials.usage_based_cost IS 'Whether billing is usage-based';

COMMENT ON COLUMN api_credentials.last_rotated_at IS 'When credentials were last rotated';
COMMENT ON COLUMN api_credentials.rotation_required IS 'Flag indicating rotation is needed';
COMMENT ON COLUMN api_credentials.rotation_schedule IS 'Credential rotation schedule';

-- Create indexes
CREATE INDEX idx_api_credentials_provider_name ON api_credentials(provider_name);
CREATE INDEX idx_api_credentials_provider_type ON api_credentials(provider_type);
CREATE INDEX idx_api_credentials_environment ON api_credentials(environment);
CREATE INDEX idx_api_credentials_is_active ON api_credentials(is_active);
CREATE INDEX idx_api_credentials_verification_status ON api_credentials(verification_status);
CREATE INDEX idx_api_credentials_rotation_required ON api_credentials(rotation_required) WHERE rotation_required = true;
CREATE INDEX idx_api_credentials_oauth_expires ON api_credentials(oauth_expires_at) WHERE oauth_expires_at IS NOT NULL;
CREATE INDEX idx_api_credentials_custom_endpoints ON api_credentials USING GIN(custom_endpoints);
CREATE INDEX idx_api_credentials_capabilities ON api_credentials USING GIN(capabilities);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_api_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   NEW.modified_by = current_setting('app.current_user_id', true)::UUID;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_api_credentials_updated_at 
   BEFORE UPDATE ON api_credentials
   FOR EACH ROW EXECUTE FUNCTION update_api_credentials_updated_at();

-- Create function to encrypt credentials
CREATE OR REPLACE FUNCTION encrypt_credential(
   p_plaintext TEXT,
   p_key_id UUID
) RETURNS BYTEA AS $$
DECLARE
   v_key TEXT;
BEGIN
   -- In production, retrieve key from secure key management system
   -- This is a placeholder implementation
   v_key := 'temporary_encryption_key_' || p_key_id::TEXT;
   RETURN pgp_sym_encrypt(p_plaintext, v_key);
END;
$$ LANGUAGE plpgsql;

-- Create function to decrypt credentials
CREATE OR REPLACE FUNCTION decrypt_credential(
   p_ciphertext BYTEA,
   p_key_id UUID
) RETURNS TEXT AS $$
DECLARE
   v_key TEXT;
BEGIN
   -- In production, retrieve key from secure key management system
   -- This is a placeholder implementation
   v_key := 'temporary_encryption_key_' || p_key_id::TEXT;
   RETURN pgp_sym_decrypt(p_ciphertext, v_key);
END;
$$ LANGUAGE plpgsql;

-- Create view for credential status
CREATE OR REPLACE VIEW credential_status AS
SELECT 
   id,
   provider_name,
   provider_type,
   environment,
   account_name,
   is_active,
   verification_status,
   last_verified_at,
   CASE 
       WHEN oauth_expires_at IS NOT NULL AND oauth_expires_at < CURRENT_TIMESTAMP THEN 'expired'
       WHEN oauth_expires_at IS NOT NULL AND oauth_expires_at < CURRENT_TIMESTAMP + INTERVAL '7 days' THEN 'expiring_soon'
       ELSE 'valid'
   END AS oauth_status,
   rotation_required,
   last_rotated_at,
   error_count,
   last_error_at,
   ROUND((successful_requests::DECIMAL / NULLIF(total_requests, 0)) * 100, 2) AS success_rate
FROM api_credentials;

COMMENT ON VIEW credential_status IS 'Summary view of API credential health and status';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON api_credentials TO app_user;
-- GRANT SELECT ON credential_status TO app_user;
-- GRANT EXECUTE ON FUNCTION encrypt_credential(TEXT, UUID) TO app_user;
-- REVOKE EXECUTE ON FUNCTION decrypt_credential(BYTEA, UUID) FROM PUBLIC;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_api_credentials_tenant_id ON api_credentials(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_credentials_tenant_created ON api_credentials(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

