-- =====================================================
-- TicketToken Platform - Venue Integrations Schema
-- Week 1, Day 3 Development
-- =====================================================
-- Description: Comprehensive third-party integration management with secure credentials
-- Version: 1.0
-- Created: 2025-07-16 14:35:15
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- For credential encryption

-- Create ENUM types for venue integration management
CREATE TYPE integration_type AS ENUM (
    'pos',                  -- Point of Sale systems
    'payment',              -- Payment processing
    'crm',                  -- Customer Relationship Management
    'analytics',            -- Analytics and reporting
    'social_media',         -- Social media platforms
    'email_marketing',      -- Email marketing platforms
    'accounting',           -- Accounting and financial systems
    'inventory',            -- Inventory management
    'security',             -- Security and access control
    'communication',        -- Communication platforms
    'ticketing',            -- External ticketing systems
    'streaming',            -- Live streaming platforms
    'loyalty',              -- Loyalty and rewards programs
    'survey',               -- Survey and feedback systems
    'booking',              -- Booking and reservation systems
    'weather',              -- Weather data services
    'transport',            -- Transportation and logistics
    'other'                 -- Other integration types
);

CREATE TYPE integration_status AS ENUM (
    'active',               -- Integration is active and working
    'inactive',             -- Integration is temporarily disabled
    'error',                -- Integration has errors
    'pending',              -- Integration setup pending
    'testing',              -- Integration in testing phase
    'expired',              -- Integration credentials expired
    'suspended',            -- Integration suspended by provider
    'deprecated'            -- Integration provider deprecated
);

CREATE TYPE sync_frequency AS ENUM (
    'real_time',            -- Real-time via webhooks
    'every_minute',         -- Every minute
    'every_5_minutes',      -- Every 5 minutes
    'every_15_minutes',     -- Every 15 minutes
    'hourly',               -- Every hour
    'every_4_hours',        -- Every 4 hours
    'daily',                -- Once daily
    'weekly',               -- Once weekly
    'monthly',              -- Once monthly
    'manual'                -- Manual sync only
);

CREATE TYPE webhook_status AS ENUM (
    'active',               -- Webhook is active
    'inactive',             -- Webhook is inactive
    'failed',               -- Webhook has failed
    'pending_verification', -- Webhook pending verification
    'rate_limited'          -- Webhook is rate limited
);

-- =====================================================
-- VENUE_INTEGRATIONS TABLE
-- =====================================================
-- Core venue third-party integrations with secure credential management
CREATE TABLE IF NOT EXISTS venue_integrations (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Integration identification
    integration_name VARCHAR(200) NOT NULL,             -- Custom integration name
    integration_type integration_type NOT NULL,         -- Type of integration
    provider_name VARCHAR(100) NOT NULL,                -- Provider/vendor name
    provider_version VARCHAR(50),                       -- Provider API/software version
    
    -- Integration configuration
    integration_description TEXT,                       -- Integration description
    integration_purpose TEXT,                           -- Purpose/use case
    configuration JSONB NOT NULL DEFAULT '{}',          -- Integration configuration
    feature_mappings JSONB DEFAULT '{}',               -- Feature mapping configuration
    data_transformations JSONB DEFAULT '{}',           -- Data transformation rules
    
    -- API credentials (encrypted)
    api_credentials BYTEA,                              -- Encrypted API credentials
    client_id_encrypted BYTEA,                         -- Encrypted client ID
    client_secret_encrypted BYTEA,                     -- Encrypted client secret
    access_token_encrypted BYTEA,                      -- Encrypted access token
    refresh_token_encrypted BYTEA,                     -- Encrypted refresh token
    api_key_encrypted BYTEA,                           -- Encrypted API key
    
    -- API endpoints and configuration
    base_url TEXT,                                      -- Base API URL
    api_endpoints JSONB DEFAULT '{}',                   -- Endpoint configurations
    api_version VARCHAR(20),                            -- API version
    authentication_method VARCHAR(50) DEFAULT 'api_key', -- Auth method (api_key, oauth2, basic, etc.)
    
    -- Integration status and health
    integration_status integration_status NOT NULL DEFAULT 'pending',
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,          -- Integration is enabled
    health_check_url TEXT,                              -- Health check endpoint
    last_health_check TIMESTAMPTZ,                     -- Last health check
    health_status VARCHAR(50),                          -- Current health status
    
    -- Sync configuration
    sync_frequency sync_frequency NOT NULL DEFAULT 'manual',
    last_sync_at TIMESTAMPTZ,                          -- Last successful sync
    next_sync_at TIMESTAMPTZ,                          -- Next scheduled sync
    sync_in_progress BOOLEAN NOT NULL DEFAULT FALSE,    -- Sync currently running
    sync_timeout_seconds INTEGER DEFAULT 300,           -- Sync timeout
    
    -- Rate limiting and throttling
    rate_limit_requests INTEGER,                        -- Requests per period
    rate_limit_period INTERVAL DEFAULT INTERVAL '1 minute', -- Rate limit period
    rate_limit_remaining INTEGER,                       -- Remaining requests
    rate_limit_reset_at TIMESTAMPTZ,                   -- Rate limit reset time
    
    -- Retry configuration
    max_retry_attempts INTEGER DEFAULT 3,               -- Maximum retry attempts
    retry_backoff_seconds INTEGER DEFAULT 60,           -- Retry backoff time
    current_retry_count INTEGER DEFAULT 0,              -- Current retry count
    
    -- Error handling
    last_error_message TEXT,                           -- Last error message
    last_error_at TIMESTAMPTZ,                         -- Last error timestamp
    error_count_24h INTEGER DEFAULT 0,                 -- Errors in last 24 hours
    consecutive_errors INTEGER DEFAULT 0,               -- Consecutive error count
    
    -- Success metrics
    total_requests INTEGER DEFAULT 0,                   -- Total requests made
    successful_requests INTEGER DEFAULT 0,              -- Successful requests
    total_data_synced BIGINT DEFAULT 0,                -- Total data records synced
    last_successful_sync_at TIMESTAMPTZ,               -- Last successful sync
    
    -- Integration metadata
    setup_completed_at TIMESTAMPTZ,                    -- Setup completion timestamp
    first_sync_at TIMESTAMPTZ,                         -- First sync timestamp
    integration_notes TEXT,                            -- Integration notes
    support_contact_info JSONB,                        -- Support contact information
    
    -- Environment and testing
    is_production BOOLEAN NOT NULL DEFAULT TRUE,        -- Production vs sandbox
    test_mode BOOLEAN NOT NULL DEFAULT FALSE,           -- Test mode enabled
    test_credentials_encrypted BYTEA,                   -- Encrypted test credentials
    
    -- Compliance and security
    data_privacy_settings JSONB DEFAULT '{}',          -- Data privacy configuration
    compliance_requirements TEXT[],                     -- Compliance requirements
    encryption_method VARCHAR(50) DEFAULT 'aes256',     -- Encryption method used
    security_audit_date DATE,                          -- Last security audit
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Integration creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Last update timestamp
    created_by_user_id UUID,                           -- User who created integration
    updated_by_user_id UUID,                           -- User who last updated integration
    
    -- Constraints
    CONSTRAINT venue_integrations_unique_provider UNIQUE(venue_id, integration_type, provider_name, integration_name),
    CONSTRAINT venue_integrations_valid_timeouts CHECK (sync_timeout_seconds > 0),
    CONSTRAINT venue_integrations_valid_retry CHECK (max_retry_attempts >= 0 AND retry_backoff_seconds >= 0),
    CONSTRAINT venue_integrations_valid_rate_limit CHECK (
        (rate_limit_requests IS NULL OR rate_limit_requests > 0) AND
        (rate_limit_remaining IS NULL OR rate_limit_remaining >= 0)
    ),
    CONSTRAINT venue_integrations_valid_counts CHECK (
        total_requests >= 0 AND 
        successful_requests >= 0 AND 
        successful_requests <= total_requests AND
        error_count_24h >= 0 AND
        consecutive_errors >= 0
    )
);

-- =====================================================
-- INTEGRATION_WEBHOOKS TABLE
-- =====================================================
-- Webhook configuration and management for real-time integrations
CREATE TABLE IF NOT EXISTS integration_webhooks (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Integration association
    integration_id UUID NOT NULL REFERENCES venue_integrations(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL,                             -- Denormalized for performance
    
    -- Webhook identification
    webhook_name VARCHAR(200) NOT NULL,                 -- Webhook name
    webhook_purpose TEXT,                               -- Webhook purpose
    
    -- Webhook configuration
    webhook_url TEXT NOT NULL,                          -- Webhook endpoint URL
    webhook_method VARCHAR(10) DEFAULT 'POST',          -- HTTP method
    webhook_secret_encrypted BYTEA,                     -- Encrypted webhook secret
    verification_token_encrypted BYTEA,                 -- Encrypted verification token
    
    -- Event configuration
    subscribed_events TEXT[] DEFAULT '{}',              -- Events subscribed to
    event_filters JSONB DEFAULT '{}',                   -- Event filtering rules
    payload_format VARCHAR(50) DEFAULT 'json',          -- Payload format (json, xml, form)
    
    -- Webhook headers and authentication
    custom_headers JSONB DEFAULT '{}',                  -- Custom headers
    authentication_headers_encrypted BYTEA,             -- Encrypted auth headers
    content_type VARCHAR(100) DEFAULT 'application/json', -- Content type
    
    -- Webhook status and health
    webhook_status webhook_status NOT NULL DEFAULT 'pending_verification',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,         -- Webhook is verified
    verification_attempts INTEGER DEFAULT 0,            -- Verification attempts
    last_verification_at TIMESTAMPTZ,                  -- Last verification attempt
    
    -- Delivery tracking
    total_deliveries INTEGER DEFAULT 0,                 -- Total delivery attempts
    successful_deliveries INTEGER DEFAULT 0,            -- Successful deliveries
    failed_deliveries INTEGER DEFAULT 0,               -- Failed deliveries
    last_delivery_at TIMESTAMPTZ,                      -- Last delivery attempt
    last_successful_delivery_at TIMESTAMPTZ,           -- Last successful delivery
    
    -- Response tracking
    average_response_time_ms INTEGER,                   -- Average response time
    last_response_status INTEGER,                       -- Last HTTP response status
    last_response_body TEXT,                            -- Last response body
    last_response_headers JSONB,                        -- Last response headers
    
    -- Error handling
    consecutive_failures INTEGER DEFAULT 0,             -- Consecutive failures
    max_failures_before_disable INTEGER DEFAULT 10,     -- Max failures before disable
    failure_backoff_seconds INTEGER DEFAULT 300,        -- Backoff time after failures
    
    -- Rate limiting
    delivery_rate_limit INTEGER,                        -- Max deliveries per period
    delivery_rate_period INTERVAL DEFAULT INTERVAL '1 minute', -- Rate limit period
    
    -- Retry configuration
    retry_enabled BOOLEAN NOT NULL DEFAULT TRUE,        -- Enable retries
    max_retry_attempts INTEGER DEFAULT 3,               -- Max retry attempts
    retry_intervals INTEGER[] DEFAULT '{60, 300, 900}', -- Retry intervals in seconds
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT integration_webhooks_unique_url UNIQUE(integration_id, webhook_url),
    CONSTRAINT integration_webhooks_valid_method CHECK (webhook_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
    CONSTRAINT integration_webhooks_valid_deliveries CHECK (
        total_deliveries >= 0 AND
        successful_deliveries >= 0 AND
        failed_deliveries >= 0 AND
        total_deliveries >= (successful_deliveries + failed_deliveries)
    ),
    CONSTRAINT integration_webhooks_valid_failures CHECK (
        consecutive_failures >= 0 AND
        max_failures_before_disable > 0
    )
);

-- =====================================================
-- INTEGRATION_LOGS TABLE
-- =====================================================
-- Comprehensive logging for integration activities and errors
CREATE TABLE IF NOT EXISTS integration_logs (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Integration association
    integration_id UUID NOT NULL REFERENCES venue_integrations(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL,                             -- Denormalized for performance
    webhook_id UUID REFERENCES integration_webhooks(id) ON DELETE CASCADE, -- Webhook reference (if applicable)
    
    -- Log entry details
    log_level VARCHAR(20) NOT NULL DEFAULT 'info',      -- Log level (debug, info, warn, error, fatal)
    log_type VARCHAR(50) NOT NULL,                      -- Log type (sync, webhook, auth, config, etc.)
    log_message TEXT NOT NULL,                          -- Log message
    
    -- Request/response details
    request_id VARCHAR(100),                            -- Unique request identifier
    http_method VARCHAR(10),                            -- HTTP method
    endpoint_url TEXT,                                  -- Endpoint URL
    request_headers JSONB,                              -- Request headers
    request_body TEXT,                                  -- Request body
    response_status INTEGER,                            -- HTTP response status
    response_headers JSONB,                             -- Response headers
    response_body TEXT,                                 -- Response body
    response_time_ms INTEGER,                           -- Response time in milliseconds
    
    -- Error details
    error_code VARCHAR(100),                            -- Error code
    error_category VARCHAR(100),                        -- Error category
    error_details JSONB,                               -- Detailed error information
    stack_trace TEXT,                                   -- Stack trace (if applicable)
    
    -- Sync details
    sync_operation VARCHAR(100),                        -- Sync operation type
    records_processed INTEGER,                          -- Records processed
    records_succeeded INTEGER,                          -- Records succeeded
    records_failed INTEGER,                            -- Records failed
    sync_duration_ms INTEGER,                          -- Sync duration
    
    -- Retry information
    retry_attempt INTEGER DEFAULT 0,                    -- Retry attempt number
    is_retry BOOLEAN NOT NULL DEFAULT FALSE,            -- Is this a retry
    original_log_id UUID REFERENCES integration_logs(id), -- Original log entry (for retries)
    
    -- Context and metadata
    user_id UUID,                                       -- User who triggered (if applicable)
    session_id UUID,                                    -- Session ID (if applicable)
    correlation_id VARCHAR(100),                        -- Correlation ID for tracing
    additional_context JSONB DEFAULT '{}',             -- Additional context data
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT integration_logs_valid_records CHECK (
        (records_processed IS NULL) OR 
        (records_processed >= 0 AND 
         records_succeeded >= 0 AND 
         records_failed >= 0 AND
         records_processed >= (records_succeeded + records_failed))
    ),
    CONSTRAINT integration_logs_valid_retry CHECK (retry_attempt >= 0),
    CONSTRAINT integration_logs_valid_response_time CHECK (response_time_ms IS NULL OR response_time_ms >= 0)
);

-- =====================================================
-- INTEGRATION_DATA_MAPPINGS TABLE
-- =====================================================
-- Data field mappings between TicketToken and external systems
CREATE TABLE IF NOT EXISTS integration_data_mappings (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Integration association
    integration_id UUID NOT NULL REFERENCES venue_integrations(id) ON DELETE CASCADE,
    
    -- Mapping identification
    mapping_name VARCHAR(200) NOT NULL,                 -- Mapping name
    mapping_description TEXT,                           -- Mapping description
    data_entity VARCHAR(100) NOT NULL,                  -- Data entity (customer, order, product, etc.)
    mapping_direction VARCHAR(20) NOT NULL DEFAULT 'bidirectional', -- Direction (inbound, outbound, bidirectional)
    
    -- Field mappings
    source_fields JSONB NOT NULL DEFAULT '{}',          -- Source field mappings
    target_fields JSONB NOT NULL DEFAULT '{}',          -- Target field mappings
    field_transformations JSONB DEFAULT '{}',          -- Field transformation rules
    
    -- Validation and constraints
    validation_rules JSONB DEFAULT '{}',               -- Data validation rules
    required_fields TEXT[],                             -- Required fields
    default_values JSONB DEFAULT '{}',                 -- Default values
    
    -- Mapping configuration
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Mapping is active
    sync_frequency sync_frequency DEFAULT 'manual',     -- Sync frequency for this mapping
    batch_size INTEGER DEFAULT 100,                    -- Batch size for processing
    
    -- Error handling
    error_handling_strategy VARCHAR(50) DEFAULT 'skip', -- Error handling (skip, retry, fail)
    continue_on_error BOOLEAN NOT NULL DEFAULT TRUE,    -- Continue processing on error
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT integration_data_mappings_unique_entity UNIQUE(integration_id, data_entity, mapping_direction),
    CONSTRAINT integration_data_mappings_valid_direction CHECK (mapping_direction IN ('inbound', 'outbound', 'bidirectional')),
    CONSTRAINT integration_data_mappings_valid_batch_size CHECK (batch_size > 0)
);

-- =====================================================
-- INTEGRATION_SCHEDULES TABLE
-- =====================================================
-- Scheduled sync jobs and automation for integrations
CREATE TABLE IF NOT EXISTS integration_schedules (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Integration association
    integration_id UUID NOT NULL REFERENCES venue_integrations(id) ON DELETE CASCADE,
    
    -- Schedule identification
    schedule_name VARCHAR(200) NOT NULL,                -- Schedule name
    schedule_description TEXT,                          -- Schedule description
    
    -- Schedule configuration
    sync_frequency sync_frequency NOT NULL,             -- Sync frequency
    custom_cron_expression VARCHAR(100),               -- Custom cron expression (if frequency is custom)
    
    -- Schedule timing
    start_time TIME,                                    -- Daily start time
    end_time TIME,                                      -- Daily end time
    timezone VARCHAR(100) DEFAULT 'UTC',               -- Timezone for schedule
    
    -- Date restrictions
    effective_from TIMESTAMPTZ DEFAULT NOW(),           -- Schedule effective from
    effective_until TIMESTAMPTZ,                       -- Schedule effective until
    excluded_dates DATE[],                              -- Excluded dates
    
    -- Sync configuration
    data_entities TEXT[],                               -- Data entities to sync
    sync_direction VARCHAR(20) DEFAULT 'bidirectional', -- Sync direction
    full_sync BOOLEAN NOT NULL DEFAULT FALSE,           -- Full sync vs incremental
    
    -- Schedule status
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,           -- Schedule is enabled
    last_run_at TIMESTAMPTZ,                           -- Last run timestamp
    next_run_at TIMESTAMPTZ,                           -- Next scheduled run
    last_run_status VARCHAR(50),                       -- Last run status
    last_run_duration_ms INTEGER,                      -- Last run duration
    
    -- Success/failure tracking
    total_runs INTEGER DEFAULT 0,                      -- Total runs
    successful_runs INTEGER DEFAULT 0,                 -- Successful runs
    failed_runs INTEGER DEFAULT 0,                     -- Failed runs
    average_duration_ms INTEGER,                       -- Average run duration
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT integration_schedules_unique_name UNIQUE(integration_id, schedule_name),
    CONSTRAINT integration_schedules_valid_times CHECK (start_time IS NULL OR end_time IS NULL OR start_time <= end_time),
    CONSTRAINT integration_schedules_valid_dates CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT integration_schedules_valid_direction CHECK (sync_direction IN ('inbound', 'outbound', 'bidirectional')),
    CONSTRAINT integration_schedules_valid_runs CHECK (
        total_runs >= 0 AND
        successful_runs >= 0 AND
        failed_runs >= 0 AND
        total_runs >= (successful_runs + failed_runs)
    )
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for venue_integrations
CREATE INDEX IF NOT EXISTS idx_venue_integrations_venue_id ON venue_integrations(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_integrations_type ON venue_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_venue_integrations_provider ON venue_integrations(provider_name);
CREATE INDEX IF NOT EXISTS idx_venue_integrations_status ON venue_integrations(integration_status);

-- Integration health and sync indexes
CREATE INDEX IF NOT EXISTS idx_venue_integrations_enabled ON venue_integrations(is_enabled) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_integrations_active ON venue_integrations(venue_id, integration_status) WHERE integration_status = 'active';
CREATE INDEX IF NOT EXISTS idx_venue_integrations_sync_due ON venue_integrations(next_sync_at) WHERE next_sync_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_integrations_errors ON venue_integrations(consecutive_errors) WHERE consecutive_errors > 0;

-- Health and monitoring indexes
CREATE INDEX IF NOT EXISTS idx_venue_integrations_health_check ON venue_integrations(last_health_check, health_status);
CREATE INDEX IF NOT EXISTS idx_venue_integrations_last_sync ON venue_integrations(last_sync_at) WHERE last_sync_at IS NOT NULL;

-- Rate limiting indexes
CREATE INDEX IF NOT EXISTS idx_venue_integrations_rate_limit ON venue_integrations(rate_limit_reset_at) WHERE rate_limit_reset_at IS NOT NULL;

-- Integration webhooks indexes
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_integration_id ON integration_webhooks(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_venue_id ON integration_webhooks(venue_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_status ON integration_webhooks(webhook_status);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_verified ON integration_webhooks(is_verified) WHERE is_verified = TRUE;

-- Webhook delivery tracking indexes
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_deliveries ON integration_webhooks(last_delivery_at, consecutive_failures);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_failures ON integration_webhooks(consecutive_failures) WHERE consecutive_failures > 0;

-- Integration logs indexes
CREATE INDEX IF NOT EXISTS idx_integration_logs_integration_id ON integration_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_venue_id ON integration_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_webhook_id ON integration_logs(webhook_id) WHERE webhook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integration_logs_level ON integration_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_integration_logs_type ON integration_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created_at ON integration_logs(created_at);

-- Log filtering and search indexes
CREATE INDEX IF NOT EXISTS idx_integration_logs_error ON integration_logs(created_at) WHERE log_level IN ('error', 'fatal');
CREATE INDEX IF NOT EXISTS idx_integration_logs_request_id ON integration_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integration_logs_correlation_id ON integration_logs(correlation_id) WHERE correlation_id IS NOT NULL;

-- Data mappings indexes
CREATE INDEX IF NOT EXISTS idx_integration_data_mappings_integration_id ON integration_data_mappings(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_data_mappings_entity ON integration_data_mappings(data_entity);
CREATE INDEX IF NOT EXISTS idx_integration_data_mappings_active ON integration_data_mappings(is_active) WHERE is_active = TRUE;

-- Integration schedules indexes
CREATE INDEX IF NOT EXISTS idx_integration_schedules_integration_id ON integration_schedules(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_schedules_next_run ON integration_schedules(next_run_at) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_integration_schedules_enabled ON integration_schedules(is_enabled) WHERE is_enabled = TRUE;

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to update integration health and metrics
CREATE OR REPLACE FUNCTION update_integration_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Calculate success rate and update health status
    IF NEW.total_requests > 0 THEN
        IF (NEW.successful_requests::DECIMAL / NEW.total_requests) >= 0.95 THEN
            NEW.health_status = 'healthy';
        ELSIF (NEW.successful_requests::DECIMAL / NEW.total_requests) >= 0.80 THEN
            NEW.health_status = 'degraded';
        ELSE
            NEW.health_status = 'unhealthy';
        END IF;
    END IF;
    
    -- Update integration status based on errors
    IF NEW.consecutive_errors >= 10 THEN
        NEW.integration_status = 'error';
        NEW.is_enabled = FALSE;
    ELSIF NEW.consecutive_errors = 0 AND OLD.consecutive_errors > 0 THEN
        NEW.integration_status = 'active';
    END IF;
    
    -- Reset 24h error count daily
    IF NEW.last_error_at IS NOT NULL AND NEW.last_error_at < NOW() - INTERVAL '24 hours' THEN
        NEW.error_count_24h = 0;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update webhook delivery metrics
CREATE OR REPLACE FUNCTION update_webhook_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Update webhook status based on failures
    IF NEW.consecutive_failures >= NEW.max_failures_before_disable THEN
        NEW.webhook_status = 'failed';
    ELSIF NEW.consecutive_failures = 0 AND OLD.consecutive_failures > 0 THEN
        NEW.webhook_status = 'active';
    END IF;
    
    -- Calculate delivery success rate
    IF NEW.total_deliveries > 0 THEN
        NEW.successful_deliveries = NEW.total_deliveries - NEW.failed_deliveries;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old logs automatically
CREATE OR REPLACE FUNCTION cleanup_old_integration_logs()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete logs older than 90 days for performance
    DELETE FROM integration_logs
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND log_level NOT IN ('error', 'fatal'); -- Keep error logs longer
    
    -- Delete error logs older than 1 year
    DELETE FROM integration_logs
    WHERE created_at < NOW() - INTERVAL '1 year'
    AND log_level IN ('error', 'fatal');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_integration_metrics_update ON venue_integrations;
CREATE TRIGGER trigger_integration_metrics_update
    BEFORE UPDATE ON venue_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_metrics();

DROP TRIGGER IF EXISTS trigger_webhook_metrics_update ON integration_webhooks;
CREATE TRIGGER trigger_webhook_metrics_update
    BEFORE UPDATE ON integration_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_metrics();

-- Create a daily cleanup job trigger (requires pg_cron extension)
-- This would typically be set up as a scheduled job
/*
DROP TRIGGER IF EXISTS trigger_log_cleanup ON integration_logs;
CREATE TRIGGER trigger_log_cleanup
    AFTER INSERT ON integration_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION cleanup_old_integration_logs();
*/

-- =====================================================
-- VENUE INTEGRATION HELPER FUNCTIONS
-- =====================================================

-- Function to create a new integration
CREATE OR REPLACE FUNCTION create_venue_integration(
    p_venue_id UUID,
    p_integration_name VARCHAR(200),
    p_integration_type integration_type,
    p_provider_name VARCHAR(100),
    p_configuration JSONB DEFAULT '{}',
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_integration_id UUID;
BEGIN
    INSERT INTO venue_integrations (
        venue_id, integration_name, integration_type, provider_name,
        configuration, created_by_user_id
    )
    VALUES (
        p_venue_id, p_integration_name, p_integration_type, p_provider_name,
        p_configuration, p_created_by_user_id
    )
    RETURNING id INTO new_integration_id;
    
    RETURN new_integration_id;
END;
$$ LANGUAGE plpgsql;

-- Function to securely store API credentials
CREATE OR REPLACE FUNCTION store_integration_credentials(
    p_integration_id UUID,
    p_api_key TEXT DEFAULT NULL,
    p_client_id TEXT DEFAULT NULL,
    p_client_secret TEXT DEFAULT NULL,
    p_access_token TEXT DEFAULT NULL,
    p_refresh_token TEXT DEFAULT NULL,
    p_encryption_key TEXT DEFAULT 'venue_integration_key'
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE venue_integrations
    SET api_key_encrypted = CASE WHEN p_api_key IS NOT NULL THEN pgp_sym_encrypt(p_api_key, p_encryption_key) ELSE NULL END,
        client_id_encrypted = CASE WHEN p_client_id IS NOT NULL THEN pgp_sym_encrypt(p_client_id, p_encryption_key) ELSE NULL END,
        client_secret_encrypted = CASE WHEN p_client_secret IS NOT NULL THEN pgp_sym_encrypt(p_client_secret, p_encryption_key) ELSE NULL END,
        access_token_encrypted = CASE WHEN p_access_token IS NOT NULL THEN pgp_sym_encrypt(p_access_token, p_encryption_key) ELSE NULL END,
        refresh_token_encrypted = CASE WHEN p_refresh_token IS NOT NULL THEN pgp_sym_encrypt(p_refresh_token, p_encryption_key) ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_integration_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to retrieve decrypted credentials (use with caution)
CREATE OR REPLACE FUNCTION get_integration_credentials(
    p_integration_id UUID,
    p_encryption_key TEXT DEFAULT 'venue_integration_key'
) RETURNS TABLE(
    api_key TEXT,
    client_id TEXT,
    client_secret TEXT,
    access_token TEXT,
    refresh_token TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE WHEN api_key_encrypted IS NOT NULL THEN pgp_sym_decrypt(api_key_encrypted, p_encryption_key) ELSE NULL END,
        CASE WHEN client_id_encrypted IS NOT NULL THEN pgp_sym_decrypt(client_id_encrypted, p_encryption_key) ELSE NULL END,
        CASE WHEN client_secret_encrypted IS NOT NULL THEN pgp_sym_decrypt(client_secret_encrypted, p_encryption_key) ELSE NULL END,
        CASE WHEN access_token_encrypted IS NOT NULL THEN pgp_sym_decrypt(access_token_encrypted, p_encryption_key) ELSE NULL END,
        CASE WHEN refresh_token_encrypted IS NOT NULL THEN pgp_sym_decrypt(refresh_token_encrypted, p_encryption_key) ELSE NULL END
    FROM venue_integrations
    WHERE id = p_integration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log integration activity
CREATE OR REPLACE FUNCTION log_integration_activity(
    p_integration_id UUID,
    p_log_level VARCHAR(20),
    p_log_type VARCHAR(50),
    p_log_message TEXT,
    p_request_id VARCHAR(100) DEFAULT NULL,
    p_http_method VARCHAR(10) DEFAULT NULL,
    p_endpoint_url TEXT DEFAULT NULL,
    p_response_status INTEGER DEFAULT NULL,
    p_response_time_ms INTEGER DEFAULT NULL,
    p_error_code VARCHAR(100) DEFAULT NULL,
    p_additional_context JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    log_id UUID;
    v_venue_id UUID;
BEGIN
    -- Get venue ID
    SELECT venue_id INTO v_venue_id FROM venue_integrations WHERE id = p_integration_id;
    
    INSERT INTO integration_logs (
        integration_id, venue_id, log_level, log_type, log_message,
        request_id, http_method, endpoint_url, response_status,
        response_time_ms, error_code, additional_context
    )
    VALUES (
        p_integration_id, v_venue_id, p_log_level, p_log_type, p_log_message,
        p_request_id, p_http_method, p_endpoint_url, p_response_status,
        p_response_time_ms, p_error_code, p_additional_context
    )
    RETURNING id INTO log_id;
    
    -- Update integration metrics
    IF p_log_level IN ('error', 'fatal') THEN
        UPDATE venue_integrations
        SET consecutive_errors = consecutive_errors + 1,
            error_count_24h = error_count_24h + 1,
            last_error_message = p_log_message,
            last_error_at = NOW()
        WHERE id = p_integration_id;
    ELSE
        UPDATE venue_integrations
        SET consecutive_errors = 0,
            total_requests = total_requests + 1,
            successful_requests = CASE WHEN p_response_status BETWEEN 200 AND 299 THEN successful_requests + 1 ELSE successful_requests END
        WHERE id = p_integration_id;
    END IF;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get integration status summary
CREATE OR REPLACE FUNCTION get_integration_status_summary(p_venue_id UUID)
RETURNS TABLE(
    integration_type integration_type,
    total_integrations BIGINT,
    active_integrations BIGINT,
    error_integrations BIGINT,
    last_sync_status TEXT,
    health_summary JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vi.integration_type,
        COUNT(*) as total_integrations,
        COUNT(*) FILTER (WHERE vi.integration_status = 'active') as active_integrations,
        COUNT(*) FILTER (WHERE vi.integration_status = 'error') as error_integrations,
        CASE 
            WHEN COUNT(*) FILTER (WHERE vi.last_sync_at > NOW() - INTERVAL '1 hour') = COUNT(*) THEN 'recent'
            WHEN COUNT(*) FILTER (WHERE vi.last_sync_at > NOW() - INTERVAL '24 hours') > 0 THEN 'partial'
            ELSE 'stale'
        END as last_sync_status,
        jsonb_build_object(
            'healthy', COUNT(*) FILTER (WHERE vi.health_status = 'healthy'),
            'degraded', COUNT(*) FILTER (WHERE vi.health_status = 'degraded'),
            'unhealthy', COUNT(*) FILTER (WHERE vi.health_status = 'unhealthy')
        ) as health_summary
    FROM venue_integrations vi
    WHERE vi.venue_id = p_venue_id
    GROUP BY vi.integration_type
    ORDER BY vi.integration_type;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent integration errors
CREATE OR REPLACE FUNCTION get_recent_integration_errors(
    p_venue_id UUID,
    p_hours_back INTEGER DEFAULT 24,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    integration_name VARCHAR(200),
    provider_name VARCHAR(100),
    error_message TEXT,
    error_code VARCHAR(100),
    error_time TIMESTAMPTZ,
    endpoint_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT vi.integration_name, vi.provider_name, il.log_message,
           il.error_code, il.created_at, il.endpoint_url
    FROM integration_logs il
    JOIN venue_integrations vi ON il.integration_id = vi.id
    WHERE il.venue_id = p_venue_id
    AND il.log_level IN ('error', 'fatal')
    AND il.created_at > NOW() - INTERVAL '1 hour' * p_hours_back
    ORDER BY il.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to update integration sync status
CREATE OR REPLACE FUNCTION update_integration_sync_status(
    p_integration_id UUID,
    p_sync_started BOOLEAN DEFAULT TRUE,
    p_sync_completed BOOLEAN DEFAULT FALSE,
    p_records_processed INTEGER DEFAULT NULL,
    p_sync_error TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    IF p_sync_started AND NOT p_sync_completed THEN
        -- Sync started
        UPDATE venue_integrations
        SET sync_in_progress = TRUE,
            current_retry_count = 0,
            updated_at = NOW()
        WHERE id = p_integration_id;
        
    ELSIF p_sync_completed AND NOT p_sync_started THEN
        -- Sync completed successfully
        UPDATE venue_integrations
        SET sync_in_progress = FALSE,
            last_sync_at = NOW(),
            last_successful_sync_at = NOW(),
            next_sync_at = CASE 
                WHEN sync_frequency = 'hourly' THEN NOW() + INTERVAL '1 hour'
                WHEN sync_frequency = 'daily' THEN NOW() + INTERVAL '1 day'
                WHEN sync_frequency = 'weekly' THEN NOW() + INTERVAL '1 week'
                ELSE NULL
            END,
            total_data_synced = COALESCE(total_data_synced, 0) + COALESCE(p_records_processed, 0),
            consecutive_errors = 0,
            updated_at = NOW()
        WHERE id = p_integration_id;
        
    ELSIF p_sync_error IS NOT NULL THEN
        -- Sync failed
        UPDATE venue_integrations
        SET sync_in_progress = FALSE,
            current_retry_count = current_retry_count + 1,
            consecutive_errors = consecutive_errors + 1,
            last_error_message = p_sync_error,
            last_error_at = NOW(),
            next_sync_at = CASE 
                WHEN current_retry_count < max_retry_attempts THEN 
                    NOW() + INTERVAL '1 second' * retry_backoff_seconds
                ELSE NULL
            END,
            updated_at = NOW()
        WHERE id = p_integration_id;
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to test integration connectivity
CREATE OR REPLACE FUNCTION test_integration_connectivity(p_integration_id UUID)
RETURNS TABLE(
    is_connected BOOLEAN,
    response_time_ms INTEGER,
    status_message TEXT,
    last_test_at TIMESTAMPTZ
) AS $$
DECLARE
    integration_record RECORD;
    test_result RECORD;
BEGIN
    -- Get integration details
    SELECT * INTO integration_record
    FROM venue_integrations
    WHERE id = p_integration_id;
    
    -- Update last health check
    UPDATE venue_integrations
    SET last_health_check = NOW()
    WHERE id = p_integration_id;
    
    -- This is a placeholder for actual connectivity testing
    -- In practice, this would make an HTTP request to the health_check_url
    -- For now, we'll simulate based on integration status
    
    RETURN QUERY
    SELECT 
        CASE WHEN integration_record.integration_status = 'active' THEN TRUE ELSE FALSE END,
        CASE WHEN integration_record.integration_status = 'active' THEN 250 ELSE NULL END,
        CASE 
            WHEN integration_record.integration_status = 'active' THEN 'Connection successful'
            WHEN integration_record.integration_status = 'error' THEN 'Connection failed: ' || COALESCE(integration_record.last_error_message, 'Unknown error')
            ELSE 'Integration not active'
        END,
        NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE venue_integrations IS 'Comprehensive third-party integration management with secure credential storage';
COMMENT ON TABLE integration_webhooks IS 'Webhook configuration and delivery tracking for real-time integrations';
COMMENT ON TABLE integration_logs IS 'Comprehensive logging for integration activities, errors, and performance';
COMMENT ON TABLE integration_data_mappings IS 'Data field mappings and transformations between systems';
COMMENT ON TABLE integration_schedules IS 'Scheduled sync jobs and automation for integrations';

-- Venue integrations table comments
COMMENT ON COLUMN venue_integrations.api_credentials IS 'Encrypted API credentials: secure storage for authentication data';
COMMENT ON COLUMN venue_integrations.feature_mappings IS 'Feature mappings: JSON configuration for feature integration';
COMMENT ON COLUMN venue_integrations.data_transformations IS 'Data transformations: rules for data format conversion';
COMMENT ON COLUMN venue_integrations.sync_frequency IS 'Sync frequency: how often data synchronization occurs';
COMMENT ON COLUMN venue_integrations.rate_limit_requests IS 'Rate limiting: maximum requests allowed per time period';
COMMENT ON COLUMN venue_integrations.health_status IS 'Health status: current operational health of integration';

-- Integration webhooks table comments
COMMENT ON COLUMN integration_webhooks.webhook_secret_encrypted IS 'Webhook secret: encrypted secret for webhook verification';
COMMENT ON COLUMN integration_webhooks.subscribed_events IS 'Event subscriptions: array of events to receive notifications for';
COMMENT ON COLUMN integration_webhooks.delivery_rate_limit IS 'Delivery rate limit: maximum webhook deliveries per time period';
COMMENT ON COLUMN integration_webhooks.retry_intervals IS 'Retry intervals: array of retry delays in seconds';

-- Integration logs table comments
COMMENT ON COLUMN integration_logs.correlation_id IS 'Correlation ID: identifier for tracing related log entries';
COMMENT ON COLUMN integration_logs.sync_operation IS 'Sync operation: type of synchronization operation performed';
COMMENT ON COLUMN integration_logs.records_processed IS 'Records processed: number of data records processed in operation';
COMMENT ON COLUMN integration_logs.additional_context IS 'Additional context: extra metadata for log entry';

-- =====================================================
-- VENUE INTEGRATIONS SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive third-party integration management system with:
-- - Secure credential storage with encryption
-- - 18 integration types with major provider support
-- - Real-time webhook management and delivery tracking
-- - Comprehensive error logging and retry mechanisms
-- - Data mapping and transformation capabilities
-- - Scheduled sync jobs with flexible timing
-- - Health monitoring and performance metrics
-- - Rate limiting and throttling support
-- - Helper functions for integration lifecycle management
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_venue_integrations_tenant_id ON venue_integrations(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_integrations_tenant_created ON venue_integrations(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
