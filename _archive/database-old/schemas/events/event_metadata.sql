-- TicketToken Platform - Event Metadata Management Schema
-- Week 1, Day 5: Additional Event Data and Metadata
-- Created: $(date +%Y-%m-%d)
-- Description: Comprehensive event metadata management including SEO, social media,
--              analytics, marketing data, and custom attributes with versioning

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- EVENT METADATA MASTER TABLE
-- ==========================================
CREATE TABLE event_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    metadata_type VARCHAR(30) NOT NULL CHECK (metadata_type IN ('SEO', 'SOCIAL_MEDIA', 'ANALYTICS', 'MARKETING', 'CUSTOM', 'TECHNICAL', 'ACCESSIBILITY', 'LEGAL')),
    metadata_key VARCHAR(100) NOT NULL,
    metadata_value TEXT,
    metadata_json JSONB,
    data_type VARCHAR(20) DEFAULT 'STRING' CHECK (data_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'JSON', 'URL', 'EMAIL', 'PHONE')),
    is_public BOOLEAN DEFAULT true,
    is_searchable BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    is_current_version BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    source VARCHAR(50) DEFAULT 'MANUAL',
    source_reference VARCHAR(200),
    validation_rules JSONB,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_metadata_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_metadata_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_metadata_value_not_null CHECK (metadata_value IS NOT NULL OR metadata_json IS NOT NULL),
    CONSTRAINT uq_event_metadata_key_version UNIQUE (event_id, metadata_type, metadata_key, version)
);

-- ==========================================
-- SEO METADATA STRUCTURED TABLE
-- ==========================================
CREATE TABLE event_seo_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    meta_title VARCHAR(60), -- Google recommends max 60 chars
    meta_description VARCHAR(160), -- Google recommends max 160 chars
    meta_keywords TEXT,
    canonical_url VARCHAR(500),
    og_title VARCHAR(95), -- Facebook recommends max 95 chars
    og_description VARCHAR(300), -- Facebook recommends max 300 chars
    og_image_url VARCHAR(500),
    og_image_alt TEXT,
    og_type VARCHAR(20) DEFAULT 'event',
    twitter_card VARCHAR(20) DEFAULT 'summary_large_image',
    twitter_title VARCHAR(70), -- Twitter recommends max 70 chars
    twitter_description VARCHAR(200), -- Twitter recommends max 200 chars
    twitter_image_url VARCHAR(500),
    schema_markup JSONB, -- JSON-LD structured data
    robots_meta VARCHAR(100) DEFAULT 'index,follow',
    lang_code VARCHAR(5) DEFAULT 'en-US',
    geo_region VARCHAR(50),
    geo_placename VARCHAR(100),
    geo_position VARCHAR(50), -- latitude,longitude
    priority DECIMAL(2,1) DEFAULT 0.5 CHECK (priority >= 0.0 AND priority <= 1.0),
    change_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (change_frequency IN ('always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never')),
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_seo_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT uq_event_seo_unique UNIQUE (event_id)
);

-- ==========================================
-- SOCIAL MEDIA INTEGRATION DATA
-- ==========================================
CREATE TABLE event_social_media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    platform VARCHAR(30) NOT NULL CHECK (platform IN ('FACEBOOK', 'TWITTER', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE', 'TIKTOK', 'SNAPCHAT', 'PINTEREST')),
    platform_event_id VARCHAR(100),
    platform_url VARCHAR(500),
    hashtags TEXT[],
    mentions TEXT[],
    share_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5,4) DEFAULT 0,
    reach INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    click_through_rate DECIMAL(5,4) DEFAULT 0,
    conversion_rate DECIMAL(5,4) DEFAULT 0,
    campaign_id VARCHAR(100),
    ad_spend DECIMAL(10,2) DEFAULT 0,
    ad_impressions INTEGER DEFAULT 0,
    ad_clicks INTEGER DEFAULT 0,
    pixel_id VARCHAR(100),
    tracking_parameters JSONB,
    auto_post BOOLEAN DEFAULT false,
    post_schedule TIMESTAMP WITH TIME ZONE,
    last_sync TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_social_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT uq_event_social_platform UNIQUE (event_id, platform)
);

-- ==========================================
-- ANALYTICS TRACKING CODES
-- ==========================================
CREATE TABLE event_analytics_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    analytics_provider VARCHAR(30) NOT NULL CHECK (analytics_provider IN ('GOOGLE_ANALYTICS', 'FACEBOOK_PIXEL', 'GOOGLE_TAG_MANAGER', 'MIXPANEL', 'AMPLITUDE', 'HOTJAR', 'CUSTOM')),
    tracking_id VARCHAR(100) NOT NULL,
    tracking_code TEXT,
    measurement_id VARCHAR(100),
    config_parameters JSONB,
    event_goals JSONB, -- Conversion goals and events
    custom_dimensions JSONB,
    custom_metrics JSONB,
    ecommerce_tracking BOOLEAN DEFAULT false,
    enhanced_ecommerce BOOLEAN DEFAULT false,
    cross_domain_tracking BOOLEAN DEFAULT false,
    data_retention_days INTEGER DEFAULT 365,
    sampling_rate DECIMAL(3,2) DEFAULT 100 CHECK (sampling_rate >= 0 AND sampling_rate <= 100),
    debug_mode BOOLEAN DEFAULT false,
    consent_required BOOLEAN DEFAULT true,
    consent_categories TEXT[], -- ['analytics', 'marketing', 'functional']
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_analytics_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_analytics_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_event_analytics_provider UNIQUE (event_id, analytics_provider, tracking_id)
);

-- ==========================================
-- MARKETING CAMPAIGN ASSOCIATIONS
-- ==========================================
CREATE TABLE event_marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    campaign_name VARCHAR(100) NOT NULL,
    campaign_type VARCHAR(30) NOT NULL CHECK (campaign_type IN ('EMAIL', 'SOCIAL_MEDIA', 'PAID_SEARCH', 'DISPLAY', 'AFFILIATE', 'INFLUENCER', 'PRINT', 'RADIO', 'TV', 'OUTDOOR', 'PARTNERSHIP')),
    campaign_source VARCHAR(50),
    campaign_medium VARCHAR(50),
    campaign_content VARCHAR(100),
    campaign_term VARCHAR(100),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_content VARCHAR(100),
    utm_term VARCHAR(100),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    budget DECIMAL(12,2),
    spend DECIMAL(12,2) DEFAULT 0,
    target_audience JSONB,
    creative_assets JSONB,
    performance_metrics JSONB,
    roi DECIMAL(8,4),
    attribution_model VARCHAR(30) DEFAULT 'LAST_CLICK',
    conversion_window_days INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_marketing_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_marketing_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_marketing_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ==========================================
-- CUSTOM EVENT ATTRIBUTES
-- ==========================================
CREATE TABLE event_custom_attributes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    attribute_name VARCHAR(100) NOT NULL,
    attribute_label VARCHAR(200),
    attribute_value TEXT,
    attribute_json JSONB,
    data_type VARCHAR(20) DEFAULT 'STRING' CHECK (data_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'JSON', 'ARRAY', 'FILE', 'COLOR', 'COORDINATES')),
    input_type VARCHAR(30) DEFAULT 'TEXT' CHECK (input_type IN ('TEXT', 'TEXTAREA', 'SELECT', 'MULTISELECT', 'CHECKBOX', 'RADIO', 'DATE', 'TIME', 'DATETIME', 'NUMBER', 'FILE', 'COLOR', 'URL', 'EMAIL')),
    validation_rules JSONB,
    default_value TEXT,
    allowed_values TEXT[],
    is_required BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT true,
    is_searchable BOOLEAN DEFAULT false,
    display_group VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    help_text TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_event_custom_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_custom_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_event_custom_name UNIQUE (event_id, attribute_name),
    CONSTRAINT chk_custom_attribute_value CHECK (attribute_value IS NOT NULL OR attribute_json IS NOT NULL)
);

-- ==========================================
-- METADATA VERSIONING AND HISTORY
-- ==========================================
CREATE TABLE event_metadata_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    metadata_id UUID NOT NULL,
    event_id UUID NOT NULL,
    metadata_type VARCHAR(30) NOT NULL,
    metadata_key VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    old_json JSONB,
    new_json JSONB,
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
    change_reason VARCHAR(500),
    changed_by UUID,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_metadata_history_metadata FOREIGN KEY (metadata_id) REFERENCES event_metadata(id) ON DELETE CASCADE,
    CONSTRAINT fk_metadata_history_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_metadata_history_user FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- ==========================================
-- METADATA TEMPLATES
-- ==========================================
CREATE TABLE event_metadata_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    template_name VARCHAR(100) NOT NULL,
    template_description TEXT,
    category_id UUID,
    venue_id UUID,
    template_data JSONB NOT NULL,
    default_values JSONB,
    required_fields TEXT[],
    optional_fields TEXT[],
    validation_schema JSONB,
    is_global BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_metadata_template_category FOREIGN KEY (category_id) REFERENCES event_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_metadata_template_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL,
    CONSTRAINT fk_metadata_template_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT uq_metadata_template_name UNIQUE (template_name)
);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to get all metadata for an event
CREATE OR REPLACE FUNCTION get_event_metadata(p_event_id UUID, p_metadata_type VARCHAR DEFAULT NULL)
RETURNS TABLE(
    metadata_key VARCHAR,
    metadata_value TEXT,
    metadata_json JSONB,
    data_type VARCHAR,
    is_public BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        em.metadata_key,
        em.metadata_value,
        em.metadata_json,
        em.data_type,
        em.is_public
    FROM event_metadata em
    WHERE em.event_id = p_event_id
      AND em.is_current_version = true
      AND (p_metadata_type IS NULL OR em.metadata_type = p_metadata_type)
      AND (em.expires_at IS NULL OR em.expires_at > CURRENT_TIMESTAMP)
    ORDER BY em.metadata_type, em.display_order, em.metadata_key;
END;
$$ LANGUAGE plpgsql;

-- Function to set metadata value
CREATE OR REPLACE FUNCTION set_event_metadata(
    p_event_id UUID,
    p_metadata_type VARCHAR,
    p_metadata_key VARCHAR,
    p_metadata_value TEXT DEFAULT NULL,
    p_metadata_json JSONB DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_metadata_id UUID;
    v_old_metadata RECORD;
    v_new_version INTEGER;
BEGIN
    -- Get existing metadata if it exists
    SELECT * INTO v_old_metadata
    FROM event_metadata
    WHERE event_id = p_event_id
      AND metadata_type = p_metadata_type
      AND metadata_key = p_metadata_key
      AND is_current_version = true;
    
    -- Mark old version as not current
    IF FOUND THEN
        UPDATE event_metadata
        SET is_current_version = false
        WHERE id = v_old_metadata.id;
        
        v_new_version := v_old_metadata.version + 1;
        
        -- Log the change
        INSERT INTO event_metadata_history (
            metadata_id, event_id, metadata_type, metadata_key,
            old_value, new_value, old_json, new_json,
            change_type, changed_by
        ) VALUES (
            v_old_metadata.id, p_event_id, p_metadata_type, p_metadata_key,
            v_old_metadata.metadata_value, p_metadata_value,
            v_old_metadata.metadata_json, p_metadata_json,
            'UPDATE', p_user_id
        );
    ELSE
        v_new_version := 1;
    END IF;
    
    -- Insert new version
    INSERT INTO event_metadata (
        event_id, metadata_type, metadata_key,
        metadata_value, metadata_json,
        version, is_current_version, created_by
    ) VALUES (
        p_event_id, p_metadata_type, p_metadata_key,
        p_metadata_value, p_metadata_json,
        v_new_version, true, p_user_id
    ) RETURNING id INTO v_metadata_id;
    
    -- Log creation if new
    IF v_new_version = 1 THEN
        INSERT INTO event_metadata_history (
            metadata_id, event_id, metadata_type, metadata_key,
            new_value, new_json, change_type, changed_by
        ) VALUES (
            v_metadata_id, p_event_id, p_metadata_type, p_metadata_key,
            p_metadata_value, p_metadata_json, 'CREATE', p_user_id
        );
    END IF;
    
    RETURN v_metadata_id;
END;
$$ LANGUAGE plpgsql;

-- Function to apply metadata template
CREATE OR REPLACE FUNCTION apply_metadata_template(
    p_event_id UUID,
    p_template_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_override_existing BOOLEAN DEFAULT false
)
RETURNS INTEGER AS $$
DECLARE
    v_template RECORD;
    v_metadata_item JSONB;
    v_applied_count INTEGER := 0;
    v_existing_count INTEGER;
BEGIN
    -- Get template
    SELECT * INTO v_template
    FROM event_metadata_templates
    WHERE id = p_template_id AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or inactive';
    END IF;
    
    -- Apply each metadata item from template
    FOR v_metadata_item IN SELECT * FROM jsonb_array_elements(v_template.template_data)
    LOOP
        -- Check if metadata already exists
        SELECT COUNT(*) INTO v_existing_count
        FROM event_metadata
        WHERE event_id = p_event_id
          AND metadata_type = (v_metadata_item->>'metadata_type')
          AND metadata_key = (v_metadata_item->>'metadata_key')
          AND is_current_version = true;
        
        -- Apply if doesn't exist or override is allowed
        IF v_existing_count = 0 OR p_override_existing THEN
            PERFORM set_event_metadata(
                p_event_id,
                v_metadata_item->>'metadata_type',
                v_metadata_item->>'metadata_key',
                v_metadata_item->>'metadata_value',
                CASE WHEN v_metadata_item ? 'metadata_json' THEN v_metadata_item->'metadata_json' ELSE NULL END,
                p_user_id
            );
            v_applied_count := v_applied_count + 1;
        END IF;
    END LOOP;
    
    -- Update template usage count
    UPDATE event_metadata_templates
    SET usage_count = usage_count + 1
    WHERE id = p_template_id;
    
    RETURN v_applied_count;
END;
$$ LANGUAGE plpgsql;

-- Function to generate SEO-friendly URL slug
CREATE OR REPLACE FUNCTION generate_seo_slug(p_event_id UUID, p_base_text TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    v_event_name TEXT;
    v_slug TEXT;
    v_counter INTEGER := 0;
    v_final_slug TEXT;
BEGIN
    -- Get event name if base text not provided
    IF p_base_text IS NULL THEN
        SELECT event_name INTO v_event_name
        FROM events
        WHERE id = p_event_id;
        
        v_slug := v_event_name;
    ELSE
        v_slug := p_base_text;
    END IF;
    
    -- Clean and format slug
    v_slug := LOWER(v_slug);
    v_slug := REGEXP_REPLACE(v_slug, '[^a-z0-9\s-]', '', 'g');
    v_slug := REGEXP_REPLACE(v_slug, '\s+', '-', 'g');
    v_slug := REGEXP_REPLACE(v_slug, '-+', '-', 'g');
    v_slug := TRIM(BOTH '-' FROM v_slug);
    
    -- Ensure uniqueness
    v_final_slug := v_slug;
    WHILE EXISTS (
        SELECT 1 FROM event_seo_metadata
        WHERE canonical_url LIKE '%' || v_final_slug || '%'
          AND event_id != p_event_id
    ) LOOP
        v_counter := v_counter + 1;
        v_final_slug := v_slug || '-' || v_counter;
    END LOOP;
    
    RETURN v_final_slug;
END;
$$ LANGUAGE plpgsql;

-- Function to validate metadata against rules
CREATE OR REPLACE FUNCTION validate_metadata(
    p_metadata_type VARCHAR,
    p_metadata_key VARCHAR,
    p_metadata_value TEXT,
    p_validation_rules JSONB
)
RETURNS TABLE(
    is_valid BOOLEAN,
    error_messages TEXT[]
) AS $$
DECLARE
    v_errors TEXT[] := ARRAY[]::TEXT[];
    v_rule JSONB;
    v_min_length INTEGER;
    v_max_length INTEGER;
    v_pattern TEXT;
    v_required BOOLEAN;
BEGIN
    -- Return valid if no rules
    IF p_validation_rules IS NULL OR p_validation_rules = '{}'::JSONB THEN
        RETURN QUERY SELECT true, ARRAY[]::TEXT[];
        RETURN;
    END IF;
    
    -- Check required
    v_required := COALESCE((p_validation_rules->>'required')::BOOLEAN, false);
    IF v_required AND (p_metadata_value IS NULL OR p_metadata_value = '') THEN
        v_errors := array_append(v_errors, 'Field is required');
    END IF;
    
    -- Skip other validations if value is empty and not required
    IF p_metadata_value IS NULL OR p_metadata_value = '' THEN
        RETURN QUERY SELECT array_length(v_errors, 1) = 0, v_errors;
        RETURN;
    END IF;
    
    -- Check minimum length
    v_min_length := (p_validation_rules->>'min_length')::INTEGER;
    IF v_min_length IS NOT NULL AND LENGTH(p_metadata_value) < v_min_length THEN
        v_errors := array_append(v_errors, 'Minimum length is ' || v_min_length || ' characters');
    END IF;
    
    -- Check maximum length
    v_max_length := (p_validation_rules->>'max_length')::INTEGER;
    IF v_max_length IS NOT NULL AND LENGTH(p_metadata_value) > v_max_length THEN
        v_errors := array_append(v_errors, 'Maximum length is ' || v_max_length || ' characters');
    END IF;
    
    -- Check pattern
    v_pattern := p_validation_rules->>'pattern';
    IF v_pattern IS NOT NULL AND NOT (p_metadata_value ~ v_pattern) THEN
        v_errors := array_append(v_errors, 'Value does not match required pattern');
    END IF;
    
    RETURN QUERY SELECT array_length(v_errors, 1) = 0 OR v_errors IS NULL, COALESCE(v_errors, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql;

-- Function to get metadata analytics
CREATE OR REPLACE FUNCTION get_metadata_analytics(p_event_id UUID DEFAULT NULL)
RETURNS TABLE(
    metadata_type VARCHAR,
    total_count BIGINT,
    public_count BIGINT,
    searchable_count BIGINT,
    avg_value_length NUMERIC,
    most_common_keys TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        em.metadata_type,
        COUNT(*)::BIGINT as total_count,
        COUNT(*) FILTER (WHERE em.is_public = true)::BIGINT as public_count,
        COUNT(*) FILTER (WHERE em.is_searchable = true)::BIGINT as searchable_count,
        AVG(LENGTH(em.metadata_value))::NUMERIC as avg_value_length,
        ARRAY_AGG(em.metadata_key ORDER BY COUNT(*) DESC)::TEXT[] as most_common_keys
    FROM event_metadata em
    WHERE em.is_current_version = true
      AND (p_event_id IS NULL OR em.event_id = p_event_id)
    GROUP BY em.metadata_type
    ORDER BY total_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX idx_event_metadata_event_id ON event_metadata(event_id);
CREATE INDEX idx_event_metadata_type ON event_metadata(metadata_type);
CREATE INDEX idx_event_metadata_key ON event_metadata(metadata_key);
CREATE INDEX idx_event_metadata_current ON event_metadata(is_current_version) WHERE is_current_version = true;
CREATE INDEX idx_event_metadata_public ON event_metadata(is_public) WHERE is_public = true;
CREATE INDEX idx_event_metadata_searchable ON event_metadata(is_searchable) WHERE is_searchable = true;
CREATE INDEX idx_event_metadata_expires ON event_metadata(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_event_seo_event_id ON event_seo_metadata(event_id);
CREATE INDEX idx_event_seo_canonical ON event_seo_metadata(canonical_url);

CREATE INDEX idx_event_social_event_id ON event_social_media(event_id);
CREATE INDEX idx_event_social_platform ON event_social_media(platform);
CREATE INDEX idx_event_social_active ON event_social_media(is_active);

CREATE INDEX idx_event_analytics_event_id ON event_analytics_tracking(event_id);
CREATE INDEX idx_event_analytics_provider ON event_analytics_tracking(analytics_provider);
CREATE INDEX idx_event_analytics_active ON event_analytics_tracking(is_active);

CREATE INDEX idx_event_marketing_event_id ON event_marketing_campaigns(event_id);
CREATE INDEX idx_event_marketing_type ON event_marketing_campaigns(campaign_type);
CREATE INDEX idx_event_marketing_active ON event_marketing_campaigns(is_active);
CREATE INDEX idx_event_marketing_dates ON event_marketing_campaigns(start_date, end_date);

CREATE INDEX idx_event_custom_event_id ON event_custom_attributes(event_id);
CREATE INDEX idx_event_custom_name ON event_custom_attributes(attribute_name);
CREATE INDEX idx_event_custom_public ON event_custom_attributes(is_public);
CREATE INDEX idx_event_custom_searchable ON event_custom_attributes(is_searchable);

CREATE INDEX idx_metadata_history_metadata_id ON event_metadata_history(metadata_id);
CREATE INDEX idx_metadata_history_event_id ON event_metadata_history(event_id);
CREATE INDEX idx_metadata_history_changed_at ON event_metadata_history(changed_at);

CREATE INDEX idx_metadata_templates_active ON event_metadata_templates(is_active);
CREATE INDEX idx_metadata_templates_global ON event_metadata_templates(is_global);
CREATE INDEX idx_metadata_templates_category ON event_metadata_templates(category_id);
CREATE INDEX idx_metadata_templates_venue ON event_metadata_templates(venue_id);

-- JSON/JSONB indexes for better query performance
CREATE INDEX idx_event_metadata_json ON event_metadata USING GIN(metadata_json);
CREATE INDEX idx_event_seo_schema ON event_seo_metadata USING GIN(schema_markup);
CREATE INDEX idx_event_social_tracking ON event_social_media USING GIN(tracking_parameters);
CREATE INDEX idx_event_analytics_config ON event_analytics_tracking USING GIN(config_parameters);
CREATE INDEX idx_event_marketing_metrics ON event_marketing_campaigns USING GIN(performance_metrics);
CREATE INDEX idx_event_custom_json ON event_custom_attributes USING GIN(attribute_json);

-- Text search indexes
CREATE INDEX idx_event_metadata_search ON event_metadata USING GIN(to_tsvector('english', metadata_key || ' ' || COALESCE(metadata_value, '')));
CREATE INDEX idx_event_seo_search ON event_seo_metadata USING GIN(to_tsvector('english', COALESCE(meta_title, '') || ' ' || COALESCE(meta_description, '') || ' ' || COALESCE(meta_keywords, '')));

-- ==========================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ==========================================

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_metadata_updated
    BEFORE UPDATE ON event_metadata
    FOR EACH ROW EXECUTE FUNCTION update_metadata_timestamp();

CREATE TRIGGER trg_event_seo_updated
    BEFORE UPDATE ON event_seo_metadata
    FOR EACH ROW EXECUTE FUNCTION update_metadata_timestamp();

CREATE TRIGGER trg_event_social_updated
    BEFORE UPDATE ON event_social_media
    FOR EACH ROW EXECUTE FUNCTION update_metadata_timestamp();

CREATE TRIGGER trg_event_analytics_updated
    BEFORE UPDATE ON event_analytics_tracking
    FOR EACH ROW EXECUTE FUNCTION update_metadata_timestamp();

CREATE TRIGGER trg_event_marketing_updated
    BEFORE UPDATE ON event_marketing_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_metadata_timestamp();

CREATE TRIGGER trg_event_custom_updated
    BEFORE UPDATE ON event_custom_attributes
    FOR EACH ROW EXECUTE FUNCTION update_metadata_timestamp();

CREATE TRIGGER trg_metadata_templates_updated
    BEFORE UPDATE ON event_metadata_templates
    FOR EACH ROW EXECUTE FUNCTION update_metadata_timestamp();

-- Trigger to automatically update SEO last_modified
CREATE OR REPLACE FUNCTION update_seo_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_seo_last_modified
    BEFORE UPDATE ON event_seo_metadata
    FOR EACH ROW EXECUTE FUNCTION update_seo_last_modified();

-- ==========================================
-- VIEWS FOR REPORTING
-- ==========================================

-- View for complete event metadata overview
CREATE VIEW v_event_metadata_overview AS
SELECT 
    e.id as event_id,
    e.event_name,
    COUNT(em.id) as total_metadata_count,
    COUNT(em.id) FILTER (WHERE em.metadata_type = 'SEO') as seo_metadata_count,
    COUNT(em.id) FILTER (WHERE em.metadata_type = 'SOCIAL_MEDIA') as social_metadata_count,
    COUNT(em.id) FILTER (WHERE em.metadata_type = 'ANALYTICS') as analytics_metadata_count,
    COUNT(em.id) FILTER (WHERE em.metadata_type = 'MARKETING') as marketing_metadata_count,
    COUNT(em.id) FILTER (WHERE em.metadata_type = 'CUSTOM') as custom_metadata_count,
    COUNT(em.id) FILTER (WHERE em.is_public = true) as public_metadata_count,
    COUNT(em.id) FILTER (WHERE em.is_searchable = true) as searchable_metadata_count,
    MAX(em.updated_at) as last_metadata_update
FROM events e
LEFT JOIN event_metadata em ON e.id = em.event_id AND em.is_current_version = true
GROUP BY e.id, e.event_name;

-- View for SEO readiness
CREATE VIEW v_event_seo_readiness AS
SELECT 
    e.id as event_id,
    e.event_name,
    esm.meta_title IS NOT NULL as has_meta_title,
    esm.meta_description IS NOT NULL as has_meta_description,
    esm.canonical_url IS NOT NULL as has_canonical_url,
    esm.og_title IS NOT NULL as has_og_title,
    esm.og_description IS NOT NULL as has_og_description,
    esm.og_image_url IS NOT NULL as has_og_image,
    esm.schema_markup IS NOT NULL as has_schema_markup,
    (CASE 
        WHEN esm.meta_title IS NOT NULL AND 
             esm.meta_description IS NOT NULL AND 
             esm.canonical_url IS NOT NULL AND 
             esm.og_title IS NOT NULL AND 
             esm.og_description IS NOT NULL 
        THEN 'COMPLETE'
        WHEN esm.meta_title IS NOT NULL AND esm.meta_description IS NOT NULL 
        THEN 'BASIC'
        ELSE 'INCOMPLETE'
    END) as seo_status,
    esm.last_modified
FROM events e
LEFT JOIN event_seo_metadata esm ON e.id = esm.event_id;

-- View for social media integration status
CREATE VIEW v_event_social_integration AS
SELECT 
    e.id as event_id,
    e.event_name,
    STRING_AGG(esm.platform, ', ') as connected_platforms,
    COUNT(esm.id) as platform_count,
    SUM(esm.share_count) as total_shares,
    SUM(esm.like_count) as total_likes,
    SUM(esm.comment_count) as total_comments,
    AVG(esm.engagement_rate) as avg_engagement_rate,
    SUM(esm.reach) as total_reach,
    SUM(esm.impressions) as total_impressions
FROM events e
LEFT JOIN event_social_media esm ON e.id = esm.event_id AND esm.is_active = true
GROUP BY e.id, e.event_name;

-- Comments for documentation
COMMENT ON TABLE event_metadata IS 'Master table for all event metadata with versioning support';
COMMENT ON TABLE event_seo_metadata IS 'SEO-specific metadata including meta tags, Open Graph, and schema markup';
COMMENT ON TABLE event_social_media IS 'Social media platform integration data and analytics';
COMMENT ON TABLE event_analytics_tracking IS 'Analytics tracking codes and configuration';
COMMENT ON TABLE event_marketing_campaigns IS 'Marketing campaign associations and UTM tracking';
COMMENT ON TABLE event_custom_attributes IS 'Custom event attributes with flexible data types';
COMMENT ON TABLE event_metadata_history IS 'Complete history of all metadata changes';
COMMENT ON TABLE event_metadata_templates IS 'Reusable metadata templates for events';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_event_metadata_tenant_id ON event_metadata(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_metadata_tenant_created ON event_metadata(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

