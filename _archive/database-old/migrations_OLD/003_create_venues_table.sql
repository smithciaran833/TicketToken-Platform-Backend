-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration: Create Venues and Related Tables
-- Version: 003
-- Description: Creates venues table and all related venue management tables
-- Estimated execution time: < 2 seconds
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- UP Migration
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create venues table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.venues (
    -- Primary key
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    
    -- Basic information
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    venue_type VARCHAR(50) NOT NULL DEFAULT 'general',
    
    -- Contact information
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    website TEXT,
    
    -- Location
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    country_code VARCHAR(2) NOT NULL,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    
    -- Capacity information
    max_capacity INTEGER NOT NULL,
    standing_capacity INTEGER,
    seated_capacity INTEGER,
    vip_capacity INTEGER,
    
    -- Media
    logo_url TEXT,
    cover_image_url TEXT,
    image_gallery JSONB DEFAULT '[]',
    virtual_tour_url TEXT,
    
    -- Business information
    business_name VARCHAR(200),
    business_registration VARCHAR(100),
    tax_id VARCHAR(50),
    business_type VARCHAR(50),
    
    -- Blockchain integration
    wallet_address VARCHAR(44),
    collection_address VARCHAR(44),
    royalty_percentage NUMERIC(5, 2) DEFAULT 2.50,
    
    -- Status and verification
    status VARCHAR(20) DEFAULT 'PENDING',
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_level VARCHAR(20),
    
    -- Features and amenities
    features TEXT[],
    amenities JSONB DEFAULT '{}',
    accessibility_features TEXT[],
    
    -- Policies
    age_restriction INTEGER DEFAULT 0,
    dress_code TEXT,
    prohibited_items TEXT[],
    cancellation_policy TEXT,
    refund_policy TEXT,
    
    -- Social media
    social_media JSONB DEFAULT '{}',
    
    -- Ratings and stats
    average_rating NUMERIC(3, 2) DEFAULT 0.00,
    total_reviews INTEGER DEFAULT 0,
    total_events INTEGER DEFAULT 0,
    total_tickets_sold INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    
    -- Audit fields
    created_by UUID REFERENCES public.users(id),
    updated_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create venue_settings table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.venue_settings (
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    
    -- Ticket settings
    allow_print_at_home BOOLEAN DEFAULT TRUE,
    allow_mobile_tickets BOOLEAN DEFAULT TRUE,
    require_id_verification BOOLEAN DEFAULT FALSE,
    ticket_transfer_allowed BOOLEAN DEFAULT TRUE,
    ticket_resale_allowed BOOLEAN DEFAULT TRUE,
    max_tickets_per_order INTEGER DEFAULT 10,
    
    -- Fee settings
    service_fee_percentage NUMERIC(5, 2) DEFAULT 2.50,
    facility_fee_amount NUMERIC(10, 2) DEFAULT 0.00,
    processing_fee_percentage NUMERIC(5, 2) DEFAULT 2.95,
    
    -- Payment settings
    payment_methods JSONB DEFAULT '["credit_card", "crypto"]',
    accepted_currencies TEXT[] DEFAULT ARRAY['USD', 'SOL'],
    payout_frequency VARCHAR(20) DEFAULT 'weekly',
    minimum_payout_amount NUMERIC(10, 2) DEFAULT 100.00,
    
    -- Notification settings
    email_notifications JSONB DEFAULT '{
        "new_order": true,
        "cancellation": true,
        "review": true,
        "payout": true
    }',
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    
    -- Integration settings
    google_analytics_id VARCHAR(50),
    facebook_pixel_id VARCHAR(50),
    custom_tracking_code TEXT,
    
    -- Security settings
    require_2fa BOOLEAN DEFAULT FALSE,
    ip_whitelist INET[],
    api_rate_limit INTEGER DEFAULT 1000,
    
    -- Display settings
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    custom_css TEXT,
    custom_js TEXT,
    
    -- Operational settings
    check_in_method VARCHAR(20) DEFAULT 'qr_code',
    early_entry_minutes INTEGER DEFAULT 30,
    late_entry_minutes INTEGER DEFAULT 60,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint
    CONSTRAINT unique_venue_settings UNIQUE(venue_id)
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create venue_staff table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.venue_staff (
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Role and permissions
    role VARCHAR(50) NOT NULL,
    permissions JSONB DEFAULT '[]',
    department VARCHAR(100),
    job_title VARCHAR(100),
    
    -- Employment details
    employment_type VARCHAR(20),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Access control
    access_areas TEXT[],
    shift_schedule JSONB,
    pin_code VARCHAR(6),
    
    -- Contact preferences
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    emergency_contact JSONB,
    
    -- Payroll
    hourly_rate NUMERIC(10, 2),
    commission_percentage NUMERIC(5, 2),
    
    -- Audit fields
    added_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_venue_staff UNIQUE(venue_id, user_id),
    CONSTRAINT valid_staff_role CHECK (role IN (
        'owner', 'manager', 'assistant_manager', 'box_office',
        'security', 'maintenance', 'marketing', 'finance', 'other'
    ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create venue_layouts table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.venue_layouts (
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    
    -- Layout information
    name VARCHAR(200) NOT NULL,
    description TEXT,
    layout_type VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Capacity
    total_capacity INTEGER NOT NULL,
    seated_capacity INTEGER,
    standing_capacity INTEGER,
    accessible_capacity INTEGER,
    
    -- Layout data
    svg_data TEXT,
    seat_map JSONB,
    sections JSONB NOT NULL DEFAULT '[]',
    
    -- Pricing tiers
    price_tiers JSONB DEFAULT '[]',
    
    -- Stage/performance area
    stage_location VARCHAR(20),
    stage_dimensions JSONB,
    
    -- Entry/exit points
    entry_points JSONB DEFAULT '[]',
    exit_points JSONB DEFAULT '[]',
    emergency_exits JSONB DEFAULT '[]',
    
    -- Facilities
    restroom_locations JSONB DEFAULT '[]',
    concession_locations JSONB DEFAULT '[]',
    merchandise_locations JSONB DEFAULT '[]',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index for default layout per venue
CREATE UNIQUE INDEX idx_venue_layouts_one_default 
    ON public.venue_layouts(venue_id) 
    WHERE is_default = TRUE;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create venue_integrations table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.venue_integrations (
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    
    -- Integration details
    integration_type VARCHAR(50) NOT NULL,
    integration_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Configuration
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    webhook_endpoint TEXT,
    config_data JSONB DEFAULT '{}',
    
    -- Sync settings
    sync_enabled BOOLEAN DEFAULT FALSE,
    sync_frequency VARCHAR(20),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(20),
    last_sync_error TEXT,
    
    -- Mappings
    field_mappings JSONB DEFAULT '{}',
    
    -- Rate limiting
    rate_limit INTEGER,
    rate_limit_window INTEGER,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_venue_integration UNIQUE(venue_id, integration_type)
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create venue_compliance table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.venue_compliance (
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    
    -- License information
    license_type VARCHAR(100) NOT NULL,
    license_number VARCHAR(100),
    issuing_authority VARCHAR(200),
    issue_date DATE,
    expiry_date DATE,
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Document storage
    document_url TEXT,
    document_hash VARCHAR(64),
    
    -- Compliance status
    status VARCHAR(20) DEFAULT 'PENDING',
    compliance_level VARCHAR(20),
    
    -- Insurance information
    insurance_provider VARCHAR(200),
    insurance_policy_number VARCHAR(100),
    insurance_coverage_amount NUMERIC(12, 2),
    insurance_expiry DATE,
    
    -- Safety certifications
    fire_safety_cert_date DATE,
    health_inspection_date DATE,
    security_assessment_date DATE,
    
    -- Capacity approvals
    approved_capacity INTEGER,
    emergency_plan_approved BOOLEAN DEFAULT FALSE,
    
    -- Notes and issues
    compliance_notes TEXT,
    outstanding_issues JSONB DEFAULT '[]',
    
    -- Audit fields
    verified_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_compliance_status CHECK (status IN (
        'PENDING', 'UNDER_REVIEW', 'APPROVED', 'EXPIRED', 'REVOKED'
    ))
);

-- Create all the indexes...
CREATE INDEX idx_venues_slug ON public.venues(slug);
CREATE INDEX idx_venues_status ON public.venues(status);
CREATE INDEX idx_venues_city_country ON public.venues(city, country_code);
CREATE INDEX idx_venues_created_by ON public.venues(created_by);
CREATE INDEX idx_venues_wallet_address ON public.venues(wallet_address) WHERE wallet_address IS NOT NULL;
CREATE INDEX idx_venues_deleted_at ON public.venues(deleted_at) WHERE deleted_at IS NULL;

-- Skip location index for now (requires earthdistance extension)
-- CREATE INDEX idx_venues_location ON public.venues USING gist(ll_to_earth(latitude, longitude)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX idx_venues_search ON public.venues USING gin(
    to_tsvector('english', 
        COALESCE(name, '') || ' ' || 
        COALESCE(description, '') || ' ' || 
        COALESCE(city, '') || ' ' ||
        COALESCE(array_to_string(features, ' '), '')
    )
);

CREATE INDEX idx_venue_settings_venue_id ON public.venue_settings(venue_id);
CREATE INDEX idx_venue_staff_venue_id ON public.venue_staff(venue_id);
CREATE INDEX idx_venue_staff_user_id ON public.venue_staff(user_id);
CREATE INDEX idx_venue_staff_role ON public.venue_staff(role);
CREATE INDEX idx_venue_staff_active ON public.venue_staff(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_venue_layouts_venue_id ON public.venue_layouts(venue_id);
CREATE INDEX idx_venue_layouts_default ON public.venue_layouts(venue_id) WHERE is_default = TRUE;
CREATE INDEX idx_venue_layouts_active ON public.venue_layouts(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_venue_integrations_venue_id ON public.venue_integrations(venue_id);
CREATE INDEX idx_venue_integrations_type ON public.venue_integrations(integration_type);
CREATE INDEX idx_venue_integrations_active ON public.venue_integrations(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_venue_compliance_venue_id ON public.venue_compliance(venue_id);
CREATE INDEX idx_venue_compliance_expiry ON public.venue_compliance(expiry_date);
CREATE INDEX idx_venue_compliance_status ON public.venue_compliance(status);

-- Create all triggers...
CREATE TRIGGER trigger_update_venues_timestamp
    BEFORE UPDATE ON public.venues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_venue_settings_timestamp
    BEFORE UPDATE ON public.venue_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_venue_staff_timestamp
    BEFORE UPDATE ON public.venue_staff
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_venue_layouts_timestamp
    BEFORE UPDATE ON public.venue_layouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_venue_integrations_timestamp
    BEFORE UPDATE ON public.venue_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_venue_compliance_timestamp
    BEFORE UPDATE ON public.venue_compliance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Slug generation trigger
CREATE OR REPLACE FUNCTION generate_venue_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
        WHILE EXISTS (SELECT 1 FROM public.venues WHERE slug = NEW.slug AND id != NEW.id) LOOP
            NEW.slug := NEW.slug || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_venue_slug
    BEFORE INSERT OR UPDATE OF name ON public.venues
    FOR EACH ROW
    EXECUTE FUNCTION generate_venue_slug();

-- Auto-create venue settings
CREATE OR REPLACE FUNCTION create_default_venue_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.venue_settings (venue_id)
    VALUES (NEW.id)
    ON CONFLICT (venue_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_venue_settings
    AFTER INSERT ON public.venues
    FOR EACH ROW
    EXECUTE FUNCTION create_default_venue_settings();

-- Simplified venue distance function
CREATE OR REPLACE FUNCTION venue_distance(lat1 NUMERIC, lon1 NUMERIC, lat2 NUMERIC, lon2 NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    R NUMERIC := 6371; -- Earth radius in km
    dlat NUMERIC;
    dlon NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    dlat := RADIANS(lat2 - lat1);
    dlon := RADIANS(lon2 - lon1);
    a := SIN(dlat/2) * SIN(dlat/2) + COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * SIN(dlon/2) * SIN(dlon/2);
    c := 2 * ATAN2(SQRT(a), SQRT(1-a));
    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Venue availability function
CREATE OR REPLACE FUNCTION is_venue_available(
    p_venue_id UUID,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN TRUE; -- Placeholder
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_compliance ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies
CREATE POLICY venues_select_public ON public.venues
    FOR SELECT
    USING (deleted_at IS NULL AND status IN ('ACTIVE', 'VERIFIED'));

CREATE POLICY venues_insert_authenticated ON public.venues
    FOR INSERT
    WITH CHECK (auth.user_id() IS NOT NULL);

CREATE POLICY venues_update_owner ON public.venues
    FOR UPDATE
    USING (created_by = auth.user_id());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.venues TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.venue_settings TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_staff TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_layouts TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_integrations TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_compliance TO tickettoken_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;

-- Record migration
INSERT INTO public.schema_migrations (version, name) 
VALUES (3, '003_create_venues_table.sql')
ON CONFLICT (version) DO NOTHING;

