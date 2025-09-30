-- TicketToken Webhook Endpoints Schema
-- Week 3, Day 13: Webhook endpoint configuration and management
-- Purpose: Manage webhook endpoints for event notifications to external systems

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS integrations;

-- Set search path
SET search_path TO integrations, public;

-- Create webhook_endpoints table
CREATE TABLE IF NOT EXISTS webhook_endpoints (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Endpoint details
   url VARCHAR(1000) UNIQUE NOT NULL,                  -- Webhook endpoint URL
   name VARCHAR(255) NOT NULL,                         -- Friendly name for endpoint
   description TEXT,                                   -- Detailed description
   
   -- Events configuration
   event_types TEXT[] DEFAULT '{}',                    -- Array of event types to send
   all_events BOOLEAN DEFAULT false,                   -- Send all event types
   
   -- Authentication
   auth_type VARCHAR(20) DEFAULT 'none',               -- none, basic, bearer, hmac
   auth_credentials_encrypted BYTEA,                   -- Encrypted auth credentials
   
   -- Headers
   custom_headers JSONB DEFAULT '{}',                  -- Additional HTTP headers
   content_type VARCHAR(50) DEFAULT 'application/json', -- Content-Type header
   
   -- Retry configuration
   max_retries INTEGER DEFAULT 3,                      -- Maximum retry attempts
   retry_delay_seconds INTEGER DEFAULT 60,             -- Delay between retries
   
   -- Circuit breaker settings
   failure_threshold INTEGER DEFAULT 5,                -- Failures before circuit opens
   success_threshold INTEGER DEFAULT 2,                -- Successes to close circuit
   timeout_seconds INTEGER DEFAULT 30,                 -- Request timeout
   
   -- Status tracking
   is_active BOOLEAN DEFAULT true,                     -- Whether endpoint is active
   is_paused BOOLEAN DEFAULT false,                    -- Temporarily paused
   paused_until TIMESTAMP WITH TIME ZONE,              -- Auto-resume time
   
   -- Health monitoring
   last_success_at TIMESTAMP WITH TIME ZONE,           -- Last successful delivery
   last_failure_at TIMESTAMP WITH TIME ZONE,           -- Last failed delivery
   consecutive_failures INTEGER DEFAULT 0,             -- Current failure streak
   
   -- Performance metrics
   total_calls BIGINT DEFAULT 0,                       -- Total webhook calls made
   successful_calls BIGINT DEFAULT 0,                  -- Successful deliveries
   average_response_time_ms INTEGER DEFAULT 0,         -- Average response time
   
   -- Payload settings
   include_full_payload BOOLEAN DEFAULT true,          -- Include complete event data
   payload_template JSONB,                             -- Custom payload template
   
   -- Filtering and transformation
   filter_rules JSONB DEFAULT '{}',                    -- Rules to filter events
   transformation_rules JSONB DEFAULT '{}',            -- Rules to transform payload
   
   -- Rate limiting
   rate_limit_per_minute INTEGER DEFAULT 60,           -- Max calls per minute
   current_minute_calls INTEGER DEFAULT 0,             -- Calls in current minute
   
   -- SSL/TLS settings
   verify_ssl BOOLEAN DEFAULT true,                    -- Verify SSL certificates
   ssl_certificate_fingerprint VARCHAR(64),            -- Expected cert fingerprint
   
   -- Version management
   api_version VARCHAR(20) DEFAULT 'v1',               -- API version to use
   supported_versions TEXT[] DEFAULT '{v1}',           -- Supported API versions
   
   -- Metadata
   tags TEXT[] DEFAULT '{}',                           -- Tags for categorization
   metadata JSONB DEFAULT '{}',                        -- Additional metadata
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   created_by UUID,                                    -- User who created endpoint
   
   -- Constraints
   CONSTRAINT chk_auth_type CHECK (auth_type IN ('none', 'basic', 'bearer', 'hmac')),
   CONSTRAINT chk_max_retries CHECK (max_retries >= 0 AND max_retries <= 10),
   CONSTRAINT chk_retry_delay CHECK (retry_delay_seconds >= 0 AND retry_delay_seconds <= 3600),
   CONSTRAINT chk_failure_threshold CHECK (failure_threshold >= 1 AND failure_threshold <= 100),
   CONSTRAINT chk_success_threshold CHECK (success_threshold >= 1 AND success_threshold <= 10),
   CONSTRAINT chk_timeout_seconds CHECK (timeout_seconds >= 1 AND timeout_seconds <= 300),
   CONSTRAINT chk_rate_limit CHECK (rate_limit_per_minute >= 0 AND rate_limit_per_minute <= 1000),
   CONSTRAINT chk_metrics CHECK (
       total_calls >= 0 AND 
       successful_calls >= 0 AND 
       successful_calls <= total_calls AND
       average_response_time_ms >= 0
   ),
   CONSTRAINT chk_consecutive_failures CHECK (consecutive_failures >= 0),
   CONSTRAINT chk_url_format CHECK (url ~ '^https?://.*')
);

-- Add comments
COMMENT ON TABLE webhook_endpoints IS 'Configuration for webhook endpoints to deliver events to external systems';

COMMENT ON COLUMN webhook_endpoints.id IS 'Unique identifier for webhook endpoint';
COMMENT ON COLUMN webhook_endpoints.url IS 'HTTPS URL to send webhook events to';
COMMENT ON COLUMN webhook_endpoints.name IS 'Human-friendly name for this endpoint';
COMMENT ON COLUMN webhook_endpoints.description IS 'Detailed description of endpoint purpose';

COMMENT ON COLUMN webhook_endpoints.event_types IS 'Array of specific event types to send';
COMMENT ON COLUMN webhook_endpoints.all_events IS 'Whether to send all event types';

COMMENT ON COLUMN webhook_endpoints.auth_type IS 'Authentication method: none, basic, bearer, hmac';
COMMENT ON COLUMN webhook_endpoints.auth_credentials_encrypted IS 'Encrypted authentication credentials';

COMMENT ON COLUMN webhook_endpoints.custom_headers IS 'Additional HTTP headers to include';
COMMENT ON COLUMN webhook_endpoints.content_type IS 'Content-Type header for requests';

COMMENT ON COLUMN webhook_endpoints.max_retries IS 'Maximum number of retry attempts';
COMMENT ON COLUMN webhook_endpoints.retry_delay_seconds IS 'Seconds to wait between retries';

COMMENT ON COLUMN webhook_endpoints.failure_threshold IS 'Consecutive failures before circuit opens';
COMMENT ON COLUMN webhook_endpoints.success_threshold IS 'Consecutive successes to close circuit';
COMMENT ON COLUMN webhook_endpoints.timeout_seconds IS 'HTTP request timeout in seconds';

COMMENT ON COLUMN webhook_endpoints.is_active IS 'Whether endpoint is currently active';
COMMENT ON COLUMN webhook_endpoints.is_paused IS 'Whether endpoint is temporarily paused';
COMMENT ON COLUMN webhook_endpoints.paused_until IS 'Automatic resume timestamp';

COMMENT ON COLUMN webhook_endpoints.last_success_at IS 'Timestamp of last successful delivery';
COMMENT ON COLUMN webhook_endpoints.last_failure_at IS 'Timestamp of last failed delivery';
COMMENT ON COLUMN webhook_endpoints.consecutive_failures IS 'Current consecutive failure count';

COMMENT ON COLUMN webhook_endpoints.total_calls IS 'Total number of webhook calls made';
COMMENT ON COLUMN webhook_endpoints.successful_calls IS 'Number of successful deliveries';
COMMENT ON COLUMN webhook_endpoints.average_response_time_ms IS 'Average response time in milliseconds';

COMMENT ON COLUMN webhook_endpoints.include_full_payload IS 'Whether to include complete event data';
COMMENT ON COLUMN webhook_endpoints.payload_template IS 'Custom template for payload structure';

COMMENT ON COLUMN webhook_endpoints.filter_rules IS 'JSON rules for filtering events';
COMMENT ON COLUMN webhook_endpoints.transformation_rules IS 'JSON rules for transforming payloads';

COMMENT ON COLUMN webhook_endpoints.rate_limit_per_minute IS 'Maximum calls allowed per minute';
COMMENT ON COLUMN webhook_endpoints.current_minute_calls IS 'Calls made in current minute window';

COMMENT ON COLUMN webhook_endpoints.verify_ssl IS 'Whether to verify SSL certificates';
COMMENT ON COLUMN webhook_endpoints.ssl_certificate_fingerprint IS 'Expected SSL certificate fingerprint';

COMMENT ON COLUMN webhook_endpoints.api_version IS 'API version to use for this endpoint';
COMMENT ON COLUMN webhook_endpoints.supported_versions IS 'Array of supported API versions';

COMMENT ON COLUMN webhook_endpoints.tags IS 'Tags for organizing and filtering endpoints';
COMMENT ON COLUMN webhook_endpoints.metadata IS 'Additional flexible metadata';

-- Create indexes
CREATE INDEX idx_webhook_endpoints_url ON webhook_endpoints(url);
CREATE INDEX idx_webhook_endpoints_name ON webhook_endpoints(name);
CREATE INDEX idx_webhook_endpoints_is_active ON webhook_endpoints(is_active);
CREATE INDEX idx_webhook_endpoints_is_paused ON webhook_endpoints(is_paused) WHERE is_paused = true;
CREATE INDEX idx_webhook_endpoints_event_types ON webhook_endpoints USING GIN(event_types);
CREATE INDEX idx_webhook_endpoints_tags ON webhook_endpoints USING GIN(tags);
CREATE INDEX idx_webhook_endpoints_consecutive_failures ON webhook_endpoints(consecutive_failures) WHERE consecutive_failures > 0;
CREATE INDEX idx_webhook_endpoints_paused_until ON webhook_endpoints(paused_until) WHERE paused_until IS NOT NULL;
CREATE INDEX idx_webhook_endpoints_custom_headers ON webhook_endpoints USING GIN(custom_headers);
CREATE INDEX idx_webhook_endpoints_filter_rules ON webhook_endpoints USING GIN(filter_rules);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_webhook_endpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_webhook_endpoints_updated_at 
   BEFORE UPDATE ON webhook_endpoints
   FOR EACH ROW EXECUTE FUNCTION update_webhook_endpoints_updated_at();

-- Create circuit breaker trigger
CREATE OR REPLACE FUNCTION webhook_circuit_breaker()
RETURNS TRIGGER AS $$
BEGIN
   -- Open circuit if failure threshold reached
   IF NEW.consecutive_failures >= NEW.failure_threshold AND NOT NEW.is_paused THEN
       NEW.is_paused := true;
       NEW.paused_until := CURRENT_TIMESTAMP + (NEW.retry_delay_seconds * NEW.failure_threshold || ' seconds')::INTERVAL;
   END IF;
   
   -- Close circuit if success threshold reached while paused
   IF NEW.consecutive_failures = 0 AND OLD.consecutive_failures >= NEW.success_threshold AND NEW.is_paused THEN
       NEW.is_paused := false;
       NEW.paused_until := NULL;
   END IF;
   
   -- Auto-resume if pause period expired
   IF NEW.is_paused AND NEW.paused_until IS NOT NULL AND NEW.paused_until < CURRENT_TIMESTAMP THEN
       NEW.is_paused := false;
       NEW.paused_until := NULL;
       NEW.consecutive_failures := 0;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_circuit_breaker_trigger
   BEFORE UPDATE ON webhook_endpoints
   FOR EACH ROW EXECUTE FUNCTION webhook_circuit_breaker();

-- Create function to update metrics
CREATE OR REPLACE FUNCTION update_webhook_metrics(
   p_endpoint_id UUID,
   p_success BOOLEAN,
   p_response_time_ms INTEGER
) RETURNS VOID AS $$
DECLARE
   v_current_avg INTEGER;
   v_total_calls BIGINT;
BEGIN
   UPDATE webhook_endpoints
   SET 
       total_calls = total_calls + 1,
       successful_calls = CASE WHEN p_success THEN successful_calls + 1 ELSE successful_calls END,
       last_success_at = CASE WHEN p_success THEN CURRENT_TIMESTAMP ELSE last_success_at END,
       last_failure_at = CASE WHEN NOT p_success THEN CURRENT_TIMESTAMP ELSE last_failure_at END,
       consecutive_failures = CASE 
           WHEN p_success THEN 0 
           ELSE consecutive_failures + 1 
       END,
       average_response_time_ms = CASE 
           WHEN p_success AND p_response_time_ms IS NOT NULL THEN
               ((average_response_time_ms * successful_calls) + p_response_time_ms) / (successful_calls + 1)
           ELSE average_response_time_ms
       END,
       current_minute_calls = current_minute_calls + 1
   WHERE id = p_endpoint_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for webhook health
CREATE OR REPLACE VIEW webhook_health AS
SELECT 
   id,
   name,
   url,
   is_active,
   is_paused,
   CASE 
       WHEN is_paused THEN 'circuit_open'
       WHEN consecutive_failures > 0 THEN 'degraded'
       WHEN last_success_at > CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 'healthy'
       ELSE 'unknown'
   END AS health_status,
   consecutive_failures,
   failure_threshold,
   ROUND((successful_calls::DECIMAL / NULLIF(total_calls, 0)) * 100, 2) AS success_rate,
   average_response_time_ms,
   last_success_at,
   last_failure_at
FROM webhook_endpoints;

COMMENT ON VIEW webhook_health IS 'Real-time health status of webhook endpoints';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON webhook_endpoints TO app_user;
-- GRANT SELECT ON webhook_health TO app_user;
-- GRANT EXECUTE ON FUNCTION update_webhook_metrics(UUID, BOOLEAN, INTEGER) TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_id ON webhook_endpoints(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_created ON webhook_endpoints(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

