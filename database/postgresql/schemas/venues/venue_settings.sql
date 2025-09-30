-- =====================================================
-- TicketToken Platform - Venue Settings Configuration Schema
-- Week 1, Day 2 Development
-- =====================================================
-- Description: Comprehensive venue configuration and policy management
-- Version: 1.0
-- Created: 2025-07-16 14:23:04
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- For encryption of sensitive settings

-- Create ENUM types for venue settings management
CREATE TYPE setting_category AS ENUM (
    'general',              -- General venue settings
    'ticketing',            -- Ticket sales and distribution settings
    'payments',             -- Payment processing configuration
    'notifications',        -- Communication and notification preferences
    'security',             -- Security and access control settings
    'integrations',         -- Third-party system integrations
    'policies',             -- Venue policies and rules
    'pricing',              -- Pricing rules and fee structures
    'operations',           -- Operational settings and schedules
    'marketing',            -- Marketing and promotional settings
    'analytics',            -- Analytics and reporting configuration
    'compliance'            -- Regulatory and compliance settings
);

CREATE TYPE setting_data_type AS ENUM (
    'string',               -- Text values
    'integer',              -- Whole numbers
    'decimal',              -- Decimal numbers
    'boolean',              -- True/false values
    'json',                 -- JSON objects/arrays
    'date',                 -- Date values
    'datetime',             -- Timestamp values
    'time',                 -- Time values
    'url',                  -- URL values
    'email',                -- Email addresses
    'phone',                -- Phone numbers
    'encrypted'             -- Encrypted sensitive data
);

CREATE TYPE setting_scope AS ENUM (
    'venue',                -- Venue-specific setting
    'global',               -- Platform-wide default
    'inherited'             -- Inherited from parent/global
);

-- =====================================================
-- VENUE_SETTINGS TABLE
-- =====================================================
-- Core venue settings with flexible key-value storage
CREATE TABLE IF NOT EXISTS venue_settings (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Setting identification
    setting_key VARCHAR(200) NOT NULL,                  -- Unique setting identifier
    setting_name VARCHAR(300),                          -- Human-readable setting name
    setting_description TEXT,                           -- Setting description and usage
    
    -- Setting classification
    category setting_category NOT NULL,                 -- Setting category
    subcategory VARCHAR(100),                           -- Optional subcategory
    setting_group VARCHAR(100),                         -- Logical grouping
    
    -- Setting value and metadata
    setting_value TEXT,                                 -- Actual setting value (stored as text)
    setting_value_json JSONB,                          -- JSON value for complex data
    setting_value_encrypted BYTEA,                     -- Encrypted value for sensitive data
    data_type setting_data_type NOT NULL DEFAULT 'string', -- Data type of the value
    
    -- Setting properties
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,        -- Contains sensitive information
    is_required BOOLEAN NOT NULL DEFAULT FALSE,         -- Required for venue operation
    is_readonly BOOLEAN NOT NULL DEFAULT FALSE,         -- Cannot be modified by venue
    is_inherited BOOLEAN NOT NULL DEFAULT FALSE,        -- Inherited from global defaults
    scope setting_scope NOT NULL DEFAULT 'venue',       -- Setting scope
    
    -- Validation and constraints
    validation_rules JSONB,                             -- JSON schema for value validation
    allowed_values TEXT[],                              -- Array of allowed string values
    min_value DECIMAL,                                  -- Minimum numeric value
    max_value DECIMAL,                                  -- Maximum numeric value
    default_value TEXT,                                 -- Default value if not set
    
    -- Setting metadata
    display_order INTEGER DEFAULT 0,                    -- Order for UI display
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,           -- Visible in settings UI
    requires_restart BOOLEAN NOT NULL DEFAULT FALSE,    -- Requires venue restart to take effect
    affects_billing BOOLEAN NOT NULL DEFAULT FALSE,     -- Affects billing calculations
    
    -- Version control
    version INTEGER NOT NULL DEFAULT 1,                 -- Setting version number
    parent_setting_id UUID REFERENCES venue_settings(id), -- Previous version reference
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Current active version
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Setting creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Last update timestamp
    created_by_user_id UUID,                            -- User who created setting
    updated_by_user_id UUID,                            -- User who last updated setting
    
    -- Approval workflow
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,   -- Setting change requires approval
    approved_at TIMESTAMPTZ,                           -- Approval timestamp
    approved_by_user_id UUID,                          -- User who approved change
    
    -- Constraints
    CONSTRAINT venue_settings_unique_key UNIQUE(venue_id, setting_key, is_active) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT venue_settings_valid_version CHECK (version > 0),
    CONSTRAINT venue_settings_valid_order CHECK (display_order >= 0),
    CONSTRAINT venue_settings_value_constraint CHECK (
        (setting_value IS NOT NULL AND setting_value_json IS NULL AND setting_value_encrypted IS NULL) OR
        (setting_value IS NULL AND setting_value_json IS NOT NULL AND setting_value_encrypted IS NULL) OR
        (setting_value IS NULL AND setting_value_json IS NULL AND setting_value_encrypted IS NOT NULL)
    ),
    CONSTRAINT venue_settings_numeric_range CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);

-- =====================================================
-- VENUE_POLICIES TABLE
-- =====================================================
-- Venue-specific policies and rules
CREATE TABLE IF NOT EXISTS venue_policies (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Policy identification
    policy_type VARCHAR(100) NOT NULL,                  -- Type of policy
    policy_name VARCHAR(200) NOT NULL,                  -- Policy name
    policy_description TEXT,                            -- Policy description
    
    -- Policy content
    policy_text TEXT NOT NULL,                          -- Full policy text
    policy_summary TEXT,                                -- Brief policy summary
    policy_rules JSONB,                                 -- Structured policy rules
    
    -- Policy settings
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,         -- Policy acceptance required
    is_default BOOLEAN NOT NULL DEFAULT FALSE,          -- Default policy for venue type
    applies_to VARCHAR(100)[],                          -- What this policy applies to
    
    -- Policy timing
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When policy becomes effective
    effective_until TIMESTAMPTZ,                       -- When policy expires
    
    -- Versioning
    version VARCHAR(20) NOT NULL DEFAULT '1.0',         -- Policy version
    previous_version_id UUID REFERENCES venue_policies(id), -- Previous policy version
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT venue_policies_unique_type UNIQUE(venue_id, policy_type, effective_from),
    CONSTRAINT venue_policies_valid_dates CHECK (effective_until IS NULL OR effective_until > effective_from)
);

-- =====================================================
-- VENUE_PRICING_RULES TABLE
-- =====================================================
-- Venue pricing rules and fee structures
CREATE TABLE IF NOT EXISTS venue_pricing_rules (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Rule identification
    rule_name VARCHAR(200) NOT NULL,                    -- Pricing rule name
    rule_type VARCHAR(100) NOT NULL,                    -- Type of pricing rule
    rule_description TEXT,                              -- Rule description
    
    -- Rule conditions
    conditions JSONB NOT NULL,                          -- Conditions for rule application
    priority INTEGER NOT NULL DEFAULT 0,                -- Rule priority (higher = applied first)
    
    -- Pricing configuration
    base_price DECIMAL(10, 2),                         -- Base price for rule
    price_modifier_type VARCHAR(50),                    -- Type of modification (fixed, percentage, etc.)
    price_modifier_value DECIMAL(10, 4),               -- Modifier value
    minimum_price DECIMAL(10, 2),                      -- Minimum allowed price
    maximum_price DECIMAL(10, 2),                      -- Maximum allowed price
    
    -- Fee structure
    fees JSONB DEFAULT '{}',                            -- Fee structure (service fees, taxes, etc.)
    discounts JSONB DEFAULT '{}',                       -- Available discounts
    
    -- Rule application
    applies_to VARCHAR(100)[],                          -- What this rule applies to
    excludes VARCHAR(100)[],                            -- What this rule excludes
    
    -- Rule timing
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When rule becomes effective
    effective_until TIMESTAMPTZ,                       -- When rule expires
    
    -- Rule status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Rule is currently active
    is_combinable BOOLEAN NOT NULL DEFAULT TRUE,        -- Can be combined with other rules
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT venue_pricing_rules_valid_dates CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT venue_pricing_rules_valid_prices CHECK (minimum_price IS NULL OR maximum_price IS NULL OR minimum_price <= maximum_price),
    CONSTRAINT venue_pricing_rules_priority_positive CHECK (priority >= 0)
);

-- =====================================================
-- VENUE_BLACKOUT_DATES TABLE
-- =====================================================
-- Venue blackout dates and restrictions
CREATE TABLE IF NOT EXISTS venue_blackout_dates (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Blackout period
    blackout_name VARCHAR(200) NOT NULL,                -- Name/description of blackout
    start_date DATE NOT NULL,                           -- Blackout start date
    end_date DATE NOT NULL,                             -- Blackout end date
    
    -- Blackout type and scope
    blackout_type VARCHAR(100) NOT NULL,                -- Type of blackout
    affects VARCHAR(100)[] DEFAULT '{"all"}',           -- What the blackout affects
    
    -- Blackout details
    reason TEXT,                                        -- Reason for blackout
    restrictions JSONB DEFAULT '{}',                    -- Specific restrictions during blackout
    
    -- Override capabilities
    allows_override BOOLEAN NOT NULL DEFAULT FALSE,     -- Can be overridden by admins
    override_conditions JSONB,                          -- Conditions for override
    
    -- Recurrence
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,        -- Recurring blackout
    recurrence_pattern JSONB,                          -- Recurrence configuration
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT venue_blackout_dates_valid_period CHECK (end_date >= start_date)
);

-- =====================================================
-- VENUE_NOTIFICATION_TEMPLATES TABLE
-- =====================================================
-- Venue-specific notification templates
CREATE TABLE IF NOT EXISTS venue_notification_templates (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Template identification
    template_name VARCHAR(200) NOT NULL,                -- Template name
    template_type VARCHAR(100) NOT NULL,                -- Type of notification
    template_category VARCHAR(100),                     -- Notification category
    
    -- Template content
    subject_template TEXT,                              -- Email subject template
    body_template TEXT NOT NULL,                        -- Message body template
    html_template TEXT,                                 -- HTML version for emails
    sms_template TEXT,                                  -- SMS version (if applicable)
    
    -- Template configuration
    supported_channels VARCHAR(50)[] DEFAULT '{"email"}', -- Supported communication channels
    variables JSONB DEFAULT '{}',                       -- Available template variables
    
    -- Template settings
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Template is active
    is_default BOOLEAN NOT NULL DEFAULT FALSE,          -- Default template for type
    send_immediately BOOLEAN NOT NULL DEFAULT FALSE,    -- Send immediately vs queued
    
    -- Personalization
    personalization_rules JSONB DEFAULT '{}',          -- Rules for personalizing content
    conditional_content JSONB DEFAULT '{}',            -- Conditional content blocks
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT venue_notification_templates_unique_type UNIQUE(venue_id, template_type, template_name)
);

-- =====================================================
-- VENUE_INTEGRATIONS TABLE
-- =====================================================
-- Third-party system integration settings
CREATE TABLE IF NOT EXISTS venue_integrations (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Integration identification
    integration_name VARCHAR(200) NOT NULL,             -- Integration name
    integration_type VARCHAR(100) NOT NULL,             -- Type of integration
    provider_name VARCHAR(100),                         -- Provider/vendor name
    
    -- Integration configuration
    configuration JSONB NOT NULL DEFAULT '{}',          -- Integration configuration
    credentials BYTEA,                                  -- Encrypted credentials
    api_endpoints JSONB DEFAULT '{}',                   -- API endpoint configurations
    
    -- Integration status
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,          -- Integration is enabled
    is_connected BOOLEAN NOT NULL DEFAULT FALSE,        -- Currently connected
    last_sync_at TIMESTAMPTZ,                          -- Last successful sync
    last_error TEXT,                                    -- Last error message
    
    -- Integration settings
    sync_frequency INTERVAL DEFAULT INTERVAL '1 hour',  -- How often to sync
    retry_attempts INTEGER DEFAULT 3,                   -- Number of retry attempts
    timeout_seconds INTEGER DEFAULT 30,                 -- Request timeout
    
    -- Webhook configuration
    webhook_url TEXT,                                   -- Webhook endpoint
    webhook_secret VARCHAR(255),                        -- Webhook secret for verification
    webhook_events VARCHAR(100)[],                      -- Events to send via webhook
    
    -- Rate limiting
    rate_limit_requests INTEGER,                        -- Requests per period
    rate_limit_period INTERVAL DEFAULT INTERVAL '1 minute', -- Rate limit time period
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT venue_integrations_unique_type UNIQUE(venue_id, integration_type, integration_name),
    CONSTRAINT venue_integrations_positive_values CHECK (
        retry_attempts >= 0 AND 
        timeout_seconds > 0 AND 
        (rate_limit_requests IS NULL OR rate_limit_requests > 0)
    )
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for venue_settings
CREATE INDEX IF NOT EXISTS idx_venue_settings_venue_id ON venue_settings(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_settings_key ON venue_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_venue_settings_category ON venue_settings(category);
CREATE INDEX IF NOT EXISTS idx_venue_settings_active ON venue_settings(is_active) WHERE is_active = TRUE;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_venue_settings_venue_category ON venue_settings(venue_id, category) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_settings_venue_key_active ON venue_settings(venue_id, setting_key, is_active);
CREATE INDEX IF NOT EXISTS idx_venue_settings_group ON venue_settings(setting_group) WHERE setting_group IS NOT NULL;

-- Sensitive data and approval indexes
CREATE INDEX IF NOT EXISTS idx_venue_settings_sensitive ON venue_settings(is_sensitive) WHERE is_sensitive = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_settings_approval ON venue_settings(requires_approval) WHERE requires_approval = TRUE;

-- Venue policies indexes
CREATE INDEX IF NOT EXISTS idx_venue_policies_venue_id ON venue_policies(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_policies_type ON venue_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_venue_policies_effective ON venue_policies(effective_from, effective_until);

-- Venue pricing rules indexes
CREATE INDEX IF NOT EXISTS idx_venue_pricing_venue_id ON venue_pricing_rules(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_pricing_type ON venue_pricing_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_venue_pricing_active ON venue_pricing_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_pricing_priority ON venue_pricing_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_venue_pricing_effective ON venue_pricing_rules(effective_from, effective_until);

-- Blackout dates indexes
CREATE INDEX IF NOT EXISTS idx_venue_blackout_venue_id ON venue_blackout_dates(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_blackout_dates ON venue_blackout_dates(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_venue_blackout_type ON venue_blackout_dates(blackout_type);
CREATE INDEX IF NOT EXISTS idx_venue_blackout_recurring ON venue_blackout_dates(is_recurring) WHERE is_recurring = TRUE;

-- Notification templates indexes
CREATE INDEX IF NOT EXISTS idx_venue_notifications_venue_id ON venue_notification_templates(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_notifications_type ON venue_notification_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_venue_notifications_active ON venue_notification_templates(is_active) WHERE is_active = TRUE;

-- Integrations indexes
CREATE INDEX IF NOT EXISTS idx_venue_integrations_venue_id ON venue_integrations(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_integrations_type ON venue_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_venue_integrations_enabled ON venue_integrations(is_enabled) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_integrations_connected ON venue_integrations(is_connected) WHERE is_connected = TRUE;

-- JSON data indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_venue_settings_json_value ON venue_settings USING gin(setting_value_json) WHERE setting_value_json IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_policies_rules ON venue_policies USING gin(policy_rules) WHERE policy_rules IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_pricing_conditions ON venue_pricing_rules USING gin(conditions);

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to automatically update timestamps and handle versioning
CREATE OR REPLACE FUNCTION update_venue_setting_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Handle setting value encryption for sensitive data
    IF NEW.is_sensitive = TRUE AND NEW.setting_value IS NOT NULL THEN
        NEW.setting_value_encrypted = pgp_sym_encrypt(NEW.setting_value, 'venue_settings_key');
        NEW.setting_value = NULL;
    END IF;
    
    -- Auto-increment version on value changes
    IF TG_OP = 'UPDATE' AND (
        OLD.setting_value IS DISTINCT FROM NEW.setting_value OR
        OLD.setting_value_json IS DISTINCT FROM NEW.setting_value_json
    ) THEN
        NEW.version = OLD.version + 1;
        
        -- Create version history by marking old version as inactive
        UPDATE venue_settings 
        SET is_active = FALSE 
        WHERE id = OLD.id;
        
        -- Create new version
        NEW.id = uuid_generate_v1();
        NEW.parent_setting_id = OLD.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle policy versioning
CREATE OR REPLACE FUNCTION update_venue_policy_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Auto-increment version on content changes
    IF TG_OP = 'UPDATE' AND OLD.policy_text IS DISTINCT FROM NEW.policy_text THEN
        NEW.version = (
            SELECT COALESCE(MAX(CAST(regexp_replace(version, '[^0-9.]', '', 'g') AS NUMERIC)), 0) + 0.1
            FROM venue_policies 
            WHERE venue_id = NEW.venue_id AND policy_type = NEW.policy_type
        )::TEXT;
        NEW.previous_version_id = OLD.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update integration status
CREATE OR REPLACE FUNCTION update_venue_integration_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Update connection status based on last sync
    IF NEW.last_sync_at IS NOT NULL AND NEW.last_sync_at > NOW() - INTERVAL '1 hour' THEN
        NEW.is_connected = TRUE;
    ELSIF NEW.last_error IS NOT NULL THEN
        NEW.is_connected = FALSE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_venue_setting_metadata ON venue_settings;
CREATE TRIGGER trigger_venue_setting_metadata
    BEFORE INSERT OR UPDATE ON venue_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_setting_metadata();

DROP TRIGGER IF EXISTS trigger_venue_policy_version ON venue_policies;
CREATE TRIGGER trigger_venue_policy_version
    BEFORE INSERT OR UPDATE ON venue_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_policy_version();

DROP TRIGGER IF EXISTS trigger_venue_integration_status ON venue_integrations;
CREATE TRIGGER trigger_venue_integration_status
    BEFORE INSERT OR UPDATE ON venue_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_integration_status();

-- =====================================================
-- VENUE SETTINGS HELPER FUNCTIONS
-- =====================================================

-- Function to get venue setting value
CREATE OR REPLACE FUNCTION get_venue_setting(
    p_venue_id UUID,
    p_setting_key VARCHAR(200),
    p_default_value TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
    setting_value TEXT;
BEGIN
    SELECT 
        CASE 
            WHEN vs.is_sensitive = TRUE AND vs.setting_value_encrypted IS NOT NULL THEN
                pgp_sym_decrypt(vs.setting_value_encrypted, 'venue_settings_key')
            WHEN vs.setting_value_json IS NOT NULL THEN
                vs.setting_value_json::text
            ELSE 
                vs.setting_value
        END
    INTO setting_value
    FROM venue_settings vs
    WHERE vs.venue_id = p_venue_id
    AND vs.setting_key = p_setting_key
    AND vs.is_active = TRUE;
    
    RETURN COALESCE(setting_value, p_default_value);
END;
$$ LANGUAGE plpgsql;

-- Function to set venue setting value
CREATE OR REPLACE FUNCTION set_venue_setting(
    p_venue_id UUID,
    p_setting_key VARCHAR(200),
    p_setting_value TEXT,
    p_category setting_category DEFAULT 'general',
    p_data_type setting_data_type DEFAULT 'string',
    p_updated_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    setting_id UUID;
    setting_exists BOOLEAN;
BEGIN
    -- Check if setting exists
    SELECT EXISTS(
        SELECT 1 FROM venue_settings 
        WHERE venue_id = p_venue_id 
        AND setting_key = p_setting_key 
        AND is_active = TRUE
    ) INTO setting_exists;
    
    IF setting_exists THEN
        -- Update existing setting
        UPDATE venue_settings
        SET setting_value = p_setting_value,
            updated_by_user_id = p_updated_by_user_id
        WHERE venue_id = p_venue_id
        AND setting_key = p_setting_key
        AND is_active = TRUE
        RETURNING id INTO setting_id;
    ELSE
        -- Create new setting
        INSERT INTO venue_settings (
            venue_id, setting_key, setting_value, category, 
            data_type, created_by_user_id, updated_by_user_id
        )
        VALUES (
            p_venue_id, p_setting_key, p_setting_value, p_category,
            p_data_type, p_updated_by_user_id, p_updated_by_user_id
        )
        RETURNING id INTO setting_id;
    END IF;
    
    RETURN setting_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get venue settings by category
CREATE OR REPLACE FUNCTION get_venue_settings_by_category(
    p_venue_id UUID,
    p_category setting_category
) RETURNS TABLE(
    setting_key VARCHAR(200),
    setting_name VARCHAR(300),
    setting_value TEXT,
    data_type setting_data_type,
    is_required BOOLEAN,
    is_readonly BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT vs.setting_key, vs.setting_name,
           CASE 
               WHEN vs.is_sensitive = TRUE AND vs.setting_value_encrypted IS NOT NULL THEN
                   '[ENCRYPTED]'
               WHEN vs.setting_value_json IS NOT NULL THEN
                   vs.setting_value_json::text
               ELSE 
                   vs.setting_value
           END as setting_value,
           vs.data_type, vs.is_required, vs.is_readonly
    FROM venue_settings vs
    WHERE vs.venue_id = p_venue_id
    AND vs.category = p_category
    AND vs.is_active = TRUE
    ORDER BY vs.display_order, vs.setting_key;
END;
$$ LANGUAGE plpgsql;

-- Function to copy settings from template venue
CREATE OR REPLACE FUNCTION copy_venue_settings_from_template(
    p_target_venue_id UUID,
    p_template_venue_id UUID,
    p_categories setting_category[] DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    copied_count INTEGER := 0;
    setting_record RECORD;
BEGIN
    FOR setting_record IN
        SELECT vs.*
        FROM venue_settings vs
        WHERE vs.venue_id = p_template_venue_id
        AND vs.is_active = TRUE
        AND (p_categories IS NULL OR vs.category = ANY(p_categories))
        AND NOT vs.is_readonly  -- Don't copy readonly settings
    LOOP
        INSERT INTO venue_settings (
            venue_id, setting_key, setting_name, setting_description,
            category, subcategory, setting_group, setting_value,
            setting_value_json, data_type, is_required, validation_rules,
            allowed_values, min_value, max_value, default_value,
            display_order, is_visible, created_by_user_id
        )
        VALUES (
            p_target_venue_id, setting_record.setting_key, setting_record.setting_name,
            setting_record.setting_description, setting_record.category,
            setting_record.subcategory, setting_record.setting_group,
            setting_record.setting_value, setting_record.setting_value_json,
            setting_record.data_type, setting_record.is_required,
            setting_record.validation_rules, setting_record.allowed_values,
            setting_record.min_value, setting_record.max_value,
            setting_record.default_value, setting_record.display_order,
            setting_record.is_visible, p_created_by_user_id
        )
        ON CONFLICT (venue_id, setting_key, is_active) DO NOTHING;
        
        copied_count := copied_count + 1;
    END LOOP;
    
    RETURN copied_count;
END;
$$ LANGUAGE plpgsql;

-- Function to validate venue settings
CREATE OR REPLACE FUNCTION validate_venue_settings(p_venue_id UUID)
RETURNS TABLE(
    setting_key VARCHAR(200),
    validation_error TEXT,
    severity VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    -- Check required settings
    SELECT vs.setting_key, 'Required setting is missing or empty' as validation_error, 'error' as severity
    FROM venue_settings vs
    WHERE vs.venue_id = p_venue_id
    AND vs.is_required = TRUE
    AND vs.is_active = TRUE
    AND (vs.setting_value IS NULL OR TRIM(vs.setting_value) = '')
    AND vs.setting_value_json IS NULL
    
    UNION ALL
    
    -- Check numeric ranges
    SELECT vs.setting_key, 'Value is outside allowed range' as validation_error, 'error' as severity
    FROM venue_settings vs
    WHERE vs.venue_id = p_venue_id
    AND vs.is_active = TRUE
    AND vs.data_type IN ('integer', 'decimal')
    AND vs.setting_value IS NOT NULL
    AND (
        (vs.min_value IS NOT NULL AND vs.setting_value::DECIMAL < vs.min_value) OR
        (vs.max_value IS NOT NULL AND vs.setting_value::DECIMAL > vs.max_value)
    )
    
    UNION ALL
    
    -- Check allowed values
    SELECT vs.setting_key, 'Value is not in allowed list' as validation_error, 'error' as severity
    FROM venue_settings vs
    WHERE vs.venue_id = p_venue_id
    AND vs.is_active = TRUE
    AND vs.allowed_values IS NOT NULL
    AND vs.setting_value IS NOT NULL
    AND NOT (vs.setting_value = ANY(vs.allowed_values));
END;
$$ LANGUAGE plpgsql;

-- Function to get active blackout dates for venue
CREATE OR REPLACE FUNCTION get_venue_blackout_dates(
    p_venue_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date DATE DEFAULT CURRENT_DATE + INTERVAL '1 year'
) RETURNS TABLE(
    blackout_name VARCHAR(200),
    start_date DATE,
    end_date DATE,
    blackout_type VARCHAR(100),
    restrictions JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT vbd.blackout_name, vbd.start_date, vbd.end_date, 
           vbd.blackout_type, vbd.restrictions
    FROM venue_blackout_dates vbd
    WHERE vbd.venue_id = p_venue_id
    AND vbd.start_date <= p_end_date
    AND vbd.end_date >= p_start_date
    ORDER BY vbd.start_date;
END;
$$ LANGUAGE plpgsql;

-- Function to check if date is blackout
CREATE OR REPLACE FUNCTION is_venue_blackout_date(
    p_venue_id UUID,
    p_check_date DATE,
    p_blackout_type VARCHAR(100) DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM venue_blackout_dates vbd
        WHERE vbd.venue_id = p_venue_id
        AND p_check_date BETWEEN vbd.start_date AND vbd.end_date
        AND (p_blackout_type IS NULL OR vbd.blackout_type = p_blackout_type)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get venue pricing rules for conditions
CREATE OR REPLACE FUNCTION get_venue_pricing_rules(
    p_venue_id UUID,
    p_conditions JSONB DEFAULT '{}',
    p_effective_date TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE(
    rule_name VARCHAR(200),
    rule_type VARCHAR(100),
    base_price DECIMAL(10, 2),
    price_modifier_type VARCHAR(50),
    price_modifier_value DECIMAL(10, 4),
    fees JSONB,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT vpr.rule_name, vpr.rule_type, vpr.base_price,
           vpr.price_modifier_type, vpr.price_modifier_value,
           vpr.fees, vpr.priority
    FROM venue_pricing_rules vpr
    WHERE vpr.venue_id = p_venue_id
    AND vpr.is_active = TRUE
    AND p_effective_date BETWEEN vpr.effective_from AND COALESCE(vpr.effective_until, 'infinity'::timestamptz)
    AND (p_conditions IS NULL OR vpr.conditions @> p_conditions)
    ORDER BY vpr.priority DESC, vpr.created_at;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INSERT DEFAULT SETTING DEFINITIONS
-- =====================================================

-- Create default setting definitions that venues can inherit
INSERT INTO venue_settings (
    venue_id, setting_key, setting_name, setting_description, category, 
    data_type, default_value, is_required, display_order, scope
) VALUES 
-- General Settings
('00000000-0000-0000-0000-000000000000', 'general.venue_public', 'Venue Public Visibility', 'Whether venue appears in public searches', 'general', 'boolean', 'true', true, 1, 'global'),
('00000000-0000-0000-0000-000000000000', 'general.allow_minors', 'Allow Minors', 'Whether venue allows attendees under 18', 'general', 'boolean', 'true', true, 2, 'global'),
('00000000-0000-0000-0000-000000000000', 'general.dress_code_enforced', 'Dress Code Enforced', 'Whether venue enforces dress code', 'general', 'boolean', 'false', false, 3, 'global'),

-- Ticketing Settings
('00000000-0000-0000-0000-000000000000', 'ticketing.max_tickets_per_order', 'Max Tickets Per Order', 'Maximum number of tickets per single order', 'ticketing', 'integer', '8', true, 10, 'global'),
('00000000-0000-0000-0000-000000000000', 'ticketing.advance_sales_days', 'Advance Sales Period', 'How many days in advance tickets can be sold', 'ticketing', 'integer', '90', true, 11, 'global'),
('00000000-0000-0000-0000-000000000000', 'ticketing.resale_allowed', 'Resale Allowed', 'Whether ticket resale is permitted', 'ticketing', 'boolean', 'true', true, 12, 'global'),
('00000000-0000-0000-0000-000000000000', 'ticketing.transfer_allowed', 'Transfer Allowed', 'Whether ticket transfer is permitted', 'ticketing', 'boolean', 'true', true, 13, 'global'),

-- Payment Settings
('00000000-0000-0000-0000-000000000000', 'payments.commission_rate', 'Commission Rate', 'Platform commission rate (decimal)', 'payments', 'decimal', '0.05', true, 20, 'global'),
('00000000-0000-0000-0000-000000000000', 'payments.payment_processing_fee', 'Payment Processing Fee', 'Payment processing fee rate', 'payments', 'decimal', '0.029', true, 21, 'global'),
('00000000-0000-0000-0000-000000000000', 'payments.refund_processing_days', 'Refund Processing Days', 'Number of business days to process refunds', 'payments', 'integer', '5', true, 22, 'global'),

-- Security Settings
('00000000-0000-0000-0000-000000000000', 'security.require_id_verification', 'Require ID Verification', 'Whether ID verification is required at entry', 'security', 'boolean', 'false', false, 30, 'global'),
('00000000-0000-0000-0000-000000000000', 'security.allow_bag_checks', 'Allow Bag Checks', 'Whether bag checks are performed', 'security', 'boolean', 'true', false, 31, 'global'),

-- Notification Settings
('00000000-0000-0000-0000-000000000000', 'notifications.send_confirmation_email', 'Send Confirmation Email', 'Send email confirmation for ticket purchases', 'notifications', 'boolean', 'true', true, 40, 'global'),
('00000000-0000-0000-0000-000000000000', 'notifications.send_reminder_sms', 'Send Reminder SMS', 'Send SMS reminders before events', 'notifications', 'boolean', 'false', false, 41, 'global'),
('00000000-0000-0000-0000-000000000000', 'notifications.reminder_hours_before', 'Reminder Hours Before', 'Hours before event to send reminder', 'notifications', 'integer', '24', false, 42, 'global')

ON CONFLICT (venue_id, setting_key, is_active) DO NOTHING;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE venue_settings IS 'Flexible venue configuration system with key-value storage and version control';
COMMENT ON TABLE venue_policies IS 'Venue-specific policies and terms (refund, cancellation, etc.)';
COMMENT ON TABLE venue_pricing_rules IS 'Dynamic pricing rules and fee structures for venues';
COMMENT ON TABLE venue_blackout_dates IS 'Venue unavailability periods and restrictions';
COMMENT ON TABLE venue_notification_templates IS 'Customizable notification templates for venue communications';
COMMENT ON TABLE venue_integrations IS 'Third-party system integration settings and credentials';

-- Venue settings table comments
COMMENT ON COLUMN venue_settings.setting_key IS 'Unique setting identifier: dot notation recommended (e.g., payments.commission_rate)';
COMMENT ON COLUMN venue_settings.setting_value IS 'Text representation of setting value: used for simple data types';
COMMENT ON COLUMN venue_settings.setting_value_json IS 'JSON representation: used for complex structured data';
COMMENT ON COLUMN venue_settings.setting_value_encrypted IS 'Encrypted value storage: for sensitive configuration data';
COMMENT ON COLUMN venue_settings.validation_rules IS 'JSON schema: defines validation rules for setting values';
COMMENT ON COLUMN venue_settings.scope IS 'Setting scope: venue-specific, global default, or inherited';
COMMENT ON COLUMN venue_settings.version IS 'Version control: incremented automatically on value changes';

-- =====================================================
-- VENUE SETTINGS SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive venue configuration system with:
-- - Flexible key-value settings storage with JSON support
-- - Version control and change tracking
-- - Policy management (refund, cancellation, transfer)
-- - Dynamic pricing rules and fee structures
-- - Blackout dates and operational restrictions
-- - Notification template customization
-- - Third-party system integration management
-- - Security and validation frameworks
-- - Default setting inheritance system
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_venue_settings_tenant_id ON venue_settings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_settings_tenant_created ON venue_settings(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
