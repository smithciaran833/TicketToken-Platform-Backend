-- =====================================================
-- TicketToken Platform - Venues Master Data Schema
-- Week 1, Day 2 Development
-- =====================================================
-- Description: Comprehensive venue management with master data
-- Version: 1.0
-- Created: 2025-07-16 14:19:37
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "postgis";      -- For geographic data (optional)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For text search optimization

-- Create ENUM types for venue management
CREATE TYPE venue_type AS ENUM (
    'concert_hall',         -- Traditional concert halls
    'stadium',              -- Large sports stadiums
    'arena',                -- Indoor arenas
    'theater',              -- Theaters and playhouses
    'club',                 -- Nightclubs and entertainment venues
    'outdoor',              -- Outdoor venues and festivals
    'convention_center',    -- Convention and conference centers
    'auditorium',          -- Auditoriums and lecture halls
    'amphitheater',        -- Outdoor amphitheaters
    'pavilion',            -- Covered outdoor venues
    'ballroom',            -- Hotel ballrooms and event spaces
    'warehouse',           -- Converted warehouse spaces
    'rooftop',             -- Rooftop venues
    'restaurant',          -- Restaurant event spaces
    'bar',                 -- Bar and pub venues
    'other'                -- Other venue types
);

CREATE TYPE venue_status AS ENUM (
    'active',              -- Venue is active and available
    'inactive',            -- Venue is temporarily inactive
    'pending_approval',    -- Venue awaiting approval
    'suspended',           -- Venue is suspended
    'closed',              -- Venue is permanently closed
    'under_construction',  -- Venue under construction/renovation
    'maintenance'          -- Venue under maintenance
);

CREATE TYPE verification_status AS ENUM (
    'pending',             -- Verification pending
    'verified',            -- Fully verified
    'rejected',            -- Verification rejected
    'incomplete',          -- Missing required documents
    'expired'              -- Verification expired
);

CREATE TYPE ownership_type AS ENUM (
    'owner',               -- Venue owner
    'lessee',              -- Venue lessee/renter
    'manager',             -- Venue manager
    'partner'              -- Business partner
);

-- =====================================================
-- VENUES TABLE
-- =====================================================
-- Master venues table with comprehensive venue information
CREATE TABLE IF NOT EXISTS venues (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Basic venue information
    venue_name VARCHAR(200) NOT NULL,                   -- Official venue name
    venue_slug VARCHAR(200) UNIQUE,                     -- URL-friendly slug
    display_name VARCHAR(200),                          -- Display name (may differ from official)
    short_description TEXT,                             -- Brief venue description
    full_description TEXT,                              -- Detailed venue description
    
    -- Venue classification
    venue_type venue_type NOT NULL,                     -- Primary venue type
    venue_subtypes VARCHAR(100)[],                      -- Additional venue classifications
    venue_tags VARCHAR(50)[],                           -- Searchable tags
    
    -- Address and location
    address_line_1 VARCHAR(255) NOT NULL,               -- Primary address
    address_line_2 VARCHAR(255),                        -- Secondary address (suite, floor, etc.)
    city VARCHAR(100) NOT NULL,                         -- City
    state_province VARCHAR(100),                        -- State or province
    postal_code VARCHAR(20),                            -- ZIP/postal code
    country_code CHAR(2) NOT NULL DEFAULT 'US',         -- ISO country code
    
    -- Geographic coordinates
    latitude DECIMAL(10, 8),                            -- Latitude coordinate
    longitude DECIMAL(11, 8),                           -- Longitude coordinate
    timezone VARCHAR(100),                              -- Venue timezone
    
    -- Contact information
    primary_phone VARCHAR(20),                          -- Primary phone number
    secondary_phone VARCHAR(20),                        -- Secondary phone number
    primary_email VARCHAR(320),                         -- Primary email
    website_url TEXT,                                   -- Official website
    social_media_links JSONB DEFAULT '{}',              -- Social media profiles
    
    -- Capacity information
    total_capacity INTEGER,                             -- Maximum total capacity
    seated_capacity INTEGER,                            -- Maximum seated capacity
    standing_capacity INTEGER,                          -- Maximum standing capacity
    vip_capacity INTEGER,                               -- VIP/premium capacity
    accessible_capacity INTEGER,                        -- ADA accessible capacity
    capacity_notes TEXT,                                -- Additional capacity information
    
    -- Venue features and amenities
    has_parking BOOLEAN NOT NULL DEFAULT FALSE,         -- Parking available
    parking_capacity INTEGER,                           -- Number of parking spaces
    parking_cost DECIMAL(10, 2),                       -- Parking cost
    has_public_transport BOOLEAN NOT NULL DEFAULT FALSE, -- Public transport access
    has_vip_areas BOOLEAN NOT NULL DEFAULT FALSE,       -- VIP areas available
    has_concessions BOOLEAN NOT NULL DEFAULT FALSE,     -- Food/drink concessions
    has_merchandise BOOLEAN NOT NULL DEFAULT FALSE,     -- Merchandise sales
    has_coat_check BOOLEAN NOT NULL DEFAULT FALSE,      -- Coat check service
    has_wifi BOOLEAN NOT NULL DEFAULT FALSE,            -- WiFi available
    has_live_streaming BOOLEAN NOT NULL DEFAULT FALSE,  -- Live streaming capabilities
    accessibility_features TEXT[],                      -- ADA accessibility features
    amenities JSONB DEFAULT '{}',                      -- Additional amenities
    
    -- Venue status and verification
    venue_status venue_status NOT NULL DEFAULT 'pending_approval',
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMPTZ,                           -- Verification timestamp
    verified_by_user_id UUID,                          -- Admin who verified venue
    
    -- Business and legal information
    business_name VARCHAR(200),                         -- Legal business name
    business_license_number VARCHAR(100),              -- Business license number
    tax_id VARCHAR(50),                                -- Tax identification number
    insurance_policy_number VARCHAR(100),              -- Insurance policy number
    liquor_license_number VARCHAR(100),                -- Liquor license (if applicable)
    fire_department_approval VARCHAR(100),             -- Fire department certificate
    health_department_approval VARCHAR(100),           -- Health department certificate
    
    -- Owner/manager information
    owner_user_id UUID,                                -- Reference to users.id (venue owner)
    manager_user_id UUID,                              -- Reference to users.id (venue manager)
    ownership_type ownership_type DEFAULT 'owner',     -- Type of ownership relationship
    
    -- Contact person information
    contact_person_name VARCHAR(200),                  -- Primary contact name
    contact_person_title VARCHAR(100),                 -- Contact person title
    contact_person_phone VARCHAR(20),                  -- Contact person phone
    contact_person_email VARCHAR(320),                 -- Contact person email
    
    -- Financial information
    commission_rate DECIMAL(5, 4) DEFAULT 0.0500,      -- Platform commission rate (5% default)
    payment_terms INTEGER DEFAULT 30,                  -- Payment terms in days
    preferred_payment_method VARCHAR(50),              -- Preferred payment method
    bank_account_info JSONB,                          -- Encrypted bank account information
    
    -- Venue settings and preferences
    allows_resale BOOLEAN NOT NULL DEFAULT TRUE,       -- Allow ticket resale
    requires_id_verification BOOLEAN NOT NULL DEFAULT FALSE, -- Require ID at entry
    minimum_age INTEGER,                               -- Minimum age requirement
    dress_code VARCHAR(200),                           -- Dress code requirements
    prohibited_items TEXT[],                           -- List of prohibited items
    venue_rules TEXT,                                  -- Venue-specific rules
    
    -- Media and branding
    logo_url TEXT,                                     -- Venue logo URL
    cover_image_url TEXT,                              -- Cover image URL
    gallery_images JSONB DEFAULT '[]',                -- Image gallery URLs
    virtual_tour_url TEXT,                             -- Virtual tour URL
    
    -- Technical specifications
    stage_dimensions VARCHAR(100),                      -- Stage size (e.g., "40x60 feet")
    ceiling_height VARCHAR(50),                        -- Ceiling height
    sound_system_specs JSONB,                          -- Sound system specifications
    lighting_system_specs JSONB,                       -- Lighting system specifications
    power_specifications JSONB,                        -- Electrical specifications
    
    -- Operational information
    typical_setup_time INTERVAL,                       -- Typical event setup time
    typical_breakdown_time INTERVAL,                   -- Typical event breakdown time
    advance_booking_days INTEGER DEFAULT 90,           -- How far in advance bookings allowed
    cancellation_policy TEXT,                          -- Cancellation policy
    force_majeure_policy TEXT,                         -- Force majeure policy
    
    -- Analytics and performance
    total_events_hosted INTEGER NOT NULL DEFAULT 0,    -- Total events hosted
    total_tickets_sold BIGINT NOT NULL DEFAULT 0,      -- Total tickets sold
    average_rating DECIMAL(3, 2),                      -- Average user rating
    total_reviews INTEGER NOT NULL DEFAULT 0,          -- Total number of reviews
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- Record creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- Last update timestamp
    created_by_user_id UUID,                          -- User who created record
    updated_by_user_id UUID,                          -- User who last updated record
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,                           -- Soft delete timestamp
    deleted_by_user_id UUID,                          -- User who deleted record
    deletion_reason TEXT,                             -- Reason for deletion
    
    -- Data quality and validation
    data_quality_score INTEGER DEFAULT 0,              -- Data completeness score (0-100)
    last_verified_at TIMESTAMPTZ,                     -- Last data verification
    requires_update BOOLEAN NOT NULL DEFAULT FALSE,    -- Flagged for data update
    
    -- Constraints
    CONSTRAINT venues_name_not_empty CHECK (TRIM(venue_name) != ''),
    CONSTRAINT venues_valid_capacity CHECK (total_capacity IS NULL OR total_capacity > 0),
    CONSTRAINT venues_seated_capacity_valid CHECK (seated_capacity IS NULL OR seated_capacity >= 0),
    CONSTRAINT venues_standing_capacity_valid CHECK (standing_capacity IS NULL OR standing_capacity >= 0),
    CONSTRAINT venues_capacity_logic CHECK (
        total_capacity IS NULL OR 
        (COALESCE(seated_capacity, 0) + COALESCE(standing_capacity, 0)) <= total_capacity
    ),
    CONSTRAINT venues_valid_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL) OR 
        (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    ),
    CONSTRAINT venues_valid_commission CHECK (commission_rate >= 0 AND commission_rate <= 1),
    CONSTRAINT venues_valid_rating CHECK (average_rating IS NULL OR (average_rating >= 0 AND average_rating <= 5)),
    CONSTRAINT venues_valid_age CHECK (minimum_age IS NULL OR minimum_age >= 0),
    CONSTRAINT venues_valid_parking CHECK (parking_capacity IS NULL OR parking_capacity >= 0),
    CONSTRAINT venues_email_format CHECK (primary_email IS NULL OR primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT venues_contact_email_format CHECK (contact_person_email IS NULL OR contact_person_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- =====================================================
-- VENUE_DOCUMENTS TABLE
-- =====================================================
-- Store venue verification documents and certificates
CREATE TABLE IF NOT EXISTS venue_documents (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    
    -- Document information
    document_type VARCHAR(100) NOT NULL,               -- Type of document
    document_name VARCHAR(200) NOT NULL,               -- Document name/title
    document_description TEXT,                         -- Document description
    
    -- File information
    file_url TEXT NOT NULL,                           -- Document file URL
    file_name VARCHAR(255),                           -- Original file name
    file_size_bytes BIGINT,                           -- File size in bytes
    file_type VARCHAR(100),                           -- MIME type
    file_hash VARCHAR(64),                            -- File integrity hash
    
    -- Document status
    is_required BOOLEAN NOT NULL DEFAULT FALSE,        -- Required for verification
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,        -- Document verified
    verification_notes TEXT,                           -- Verification notes
    verified_at TIMESTAMPTZ,                          -- Verification timestamp
    verified_by_user_id UUID,                         -- Admin who verified
    
    -- Document validity
    issued_date DATE,                                  -- Document issue date
    expiry_date DATE,                                  -- Document expiry date
    is_expired BOOLEAN GENERATED ALWAYS AS (expiry_date < CURRENT_DATE) STORED,
    
    -- Audit fields
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- Upload timestamp
    uploaded_by_user_id UUID,                         -- User who uploaded
    
    -- Constraints
    CONSTRAINT venue_docs_valid_dates CHECK (issued_date IS NULL OR expiry_date IS NULL OR issued_date <= expiry_date),
    CONSTRAINT venue_docs_file_size_positive CHECK (file_size_bytes IS NULL OR file_size_bytes > 0)
);

-- =====================================================
-- VENUE_OPERATING_HOURS TABLE
-- =====================================================
-- Store venue operating hours and availability
CREATE TABLE IF NOT EXISTS venue_operating_hours (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    
    -- Day and time information
    day_of_week INTEGER NOT NULL,                      -- 0=Sunday, 1=Monday, ..., 6=Saturday
    is_open BOOLEAN NOT NULL DEFAULT TRUE,             -- Venue is open on this day
    open_time TIME,                                    -- Opening time
    close_time TIME,                                   -- Closing time
    
    -- Special conditions
    is_24_hours BOOLEAN NOT NULL DEFAULT FALSE,        -- Open 24 hours
    notes TEXT,                                        -- Special notes for this day
    
    -- Seasonal adjustments
    effective_from DATE,                               -- When these hours take effect
    effective_until DATE,                             -- When these hours expire
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT venue_hours_valid_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT venue_hours_valid_times CHECK (
        NOT is_open OR is_24_hours OR (open_time IS NOT NULL AND close_time IS NOT NULL)
    ),
    CONSTRAINT venue_hours_valid_dates CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_from <= effective_until),
    
    -- Unique constraint
    UNIQUE(venue_id, day_of_week, effective_from)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(venue_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(venue_slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_type ON venues(venue_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(venue_status) WHERE deleted_at IS NULL;

-- Geographic indexes
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city, state_province, country_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_country ON venues(country_code) WHERE deleted_at IS NULL;

-- Owner and management indexes
CREATE INDEX IF NOT EXISTS idx_venues_owner ON venues(owner_user_id) WHERE owner_user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_manager ON venues(manager_user_id) WHERE manager_user_id IS NOT NULL AND deleted_at IS NULL;

-- Verification and business indexes
CREATE INDEX IF NOT EXISTS idx_venues_verification ON venues(verification_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_business_license ON venues(business_license_number) WHERE business_license_number IS NOT NULL AND deleted_at IS NULL;

-- Capacity and features indexes
CREATE INDEX IF NOT EXISTS idx_venues_capacity ON venues(total_capacity) WHERE total_capacity IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_features ON venues USING gin(accessibility_features) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_tags ON venues USING gin(venue_tags) WHERE deleted_at IS NULL;

-- Performance and rating indexes
CREATE INDEX IF NOT EXISTS idx_venues_rating ON venues(average_rating) WHERE average_rating IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_events_hosted ON venues(total_events_hosted) WHERE deleted_at IS NULL;

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_venues_created_at ON venues(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_updated_at ON venues(updated_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_deleted_at ON venues(deleted_at) WHERE deleted_at IS NOT NULL;

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_venues_search ON venues USING gin(
    to_tsvector('english', venue_name || ' ' || COALESCE(display_name, '') || ' ' || COALESCE(short_description, ''))
) WHERE deleted_at IS NULL;

-- Venue documents indexes
CREATE INDEX IF NOT EXISTS idx_venue_docs_venue_id ON venue_documents(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_docs_type ON venue_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_venue_docs_verified ON venue_documents(is_verified);
CREATE INDEX IF NOT EXISTS idx_venue_docs_expired ON venue_documents(is_expired) WHERE is_expired = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_docs_expiry ON venue_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- Operating hours indexes
CREATE INDEX IF NOT EXISTS idx_venue_hours_venue_id ON venue_operating_hours(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_hours_day ON venue_operating_hours(day_of_week);
CREATE INDEX IF NOT EXISTS idx_venue_hours_effective ON venue_operating_hours(effective_from, effective_until);

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to automatically update timestamps and data quality
CREATE OR REPLACE FUNCTION update_venue_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Calculate data quality score based on completeness
    NEW.data_quality_score = (
        CASE WHEN NEW.venue_name IS NOT NULL AND TRIM(NEW.venue_name) != '' THEN 10 ELSE 0 END +
        CASE WHEN NEW.short_description IS NOT NULL AND TRIM(NEW.short_description) != '' THEN 10 ELSE 0 END +
        CASE WHEN NEW.address_line_1 IS NOT NULL AND TRIM(NEW.address_line_1) != '' THEN 15 ELSE 0 END +
        CASE WHEN NEW.city IS NOT NULL AND TRIM(NEW.city) != '' THEN 10 ELSE 0 END +
        CASE WHEN NEW.primary_phone IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.primary_email IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.total_capacity IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.website_url IS NOT NULL THEN 5 ELSE 0 END +
        CASE WHEN NEW.logo_url IS NOT NULL THEN 5 ELSE 0 END +
        CASE WHEN NEW.cover_image_url IS NOT NULL THEN 5 ELSE 0 END
    );
    
    -- Generate slug if not provided
    IF NEW.venue_slug IS NULL OR NEW.venue_slug = '' THEN
        NEW.venue_slug = lower(regexp_replace(NEW.venue_name, '[^a-zA-Z0-9]+', '-', 'g'));
        NEW.venue_slug = trim(NEW.venue_slug, '-');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically update operating hours timestamps
CREATE OR REPLACE FUNCTION update_venue_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updates
DROP TRIGGER IF EXISTS trigger_venue_metadata_update ON venues;
CREATE TRIGGER trigger_venue_metadata_update
    BEFORE UPDATE ON venues
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_metadata();

DROP TRIGGER IF EXISTS trigger_venue_metadata_insert ON venues;
CREATE TRIGGER trigger_venue_metadata_insert
    BEFORE INSERT ON venues
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_metadata();

DROP TRIGGER IF EXISTS trigger_venue_hours_updated_at ON venue_operating_hours;
CREATE TRIGGER trigger_venue_hours_updated_at
    BEFORE UPDATE ON venue_operating_hours
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_hours_updated_at();

-- =====================================================
-- VENUE MANAGEMENT HELPER FUNCTIONS
-- =====================================================

-- Function to create a new venue
CREATE OR REPLACE FUNCTION create_venue(
    p_venue_name VARCHAR(200),
    p_venue_type venue_type,
    p_address_line_1 VARCHAR(255),
    p_city VARCHAR(100),
    p_country_code CHAR(2),
    p_owner_user_id UUID,
    p_total_capacity INTEGER DEFAULT NULL,
    p_primary_phone VARCHAR(20) DEFAULT NULL,
    p_primary_email VARCHAR(320) DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_venue_id UUID;
BEGIN
    INSERT INTO venues (
        venue_name, venue_type, address_line_1, city, country_code,
        owner_user_id, total_capacity, primary_phone, primary_email,
        created_by_user_id
    )
    VALUES (
        p_venue_name, p_venue_type, p_address_line_1, p_city, p_country_code,
        p_owner_user_id, p_total_capacity, p_primary_phone, p_primary_email,
        p_created_by_user_id
    )
    RETURNING id INTO new_venue_id;
    
    RETURN new_venue_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update venue verification status
CREATE OR REPLACE FUNCTION update_venue_verification(
    p_venue_id UUID,
    p_verification_status verification_status,
    p_verified_by_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE venues
    SET verification_status = p_verification_status,
        verified_at = CASE WHEN p_verification_status = 'verified' THEN NOW() ELSE verified_at END,
        verified_by_user_id = p_verified_by_user_id,
        updated_at = NOW()
    WHERE id = p_venue_id
    AND deleted_at IS NULL;
    
    -- Log verification change in audit trail if function exists
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_audit_event') THEN
        PERFORM log_audit_event(
            p_verified_by_user_id,
            'venue_management'::audit_category,
            'update'::audit_action,
            'venue',
            p_venue_id::text,
            NULL,
            'Venue verification status updated to ' || p_verification_status::text,
            NULL,
            jsonb_build_object('verification_status', p_verification_status, 'notes', p_notes),
            'info'::audit_severity
        );
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to search venues with filters
CREATE OR REPLACE FUNCTION search_venues(
    p_search_text TEXT DEFAULT NULL,
    p_venue_types venue_type[] DEFAULT NULL,
    p_city VARCHAR(100) DEFAULT NULL,
    p_state_province VARCHAR(100) DEFAULT NULL,
    p_country_code CHAR(2) DEFAULT NULL,
    p_min_capacity INTEGER DEFAULT NULL,
    p_max_capacity INTEGER DEFAULT NULL,
    p_venue_status venue_status[] DEFAULT NULL,
    p_latitude DECIMAL(10, 8) DEFAULT NULL,
    p_longitude DECIMAL(11, 8) DEFAULT NULL,
    p_radius_km DECIMAL(10, 2) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
    id UUID,
    venue_name VARCHAR(200),
    venue_type venue_type,
    city VARCHAR(100),
    state_province VARCHAR(100),
    total_capacity INTEGER,
    average_rating DECIMAL(3, 2),
    distance_km DECIMAL(10, 2),
    venue_status venue_status
) AS $$
BEGIN
    RETURN QUERY
    SELECT v.id, v.venue_name, v.venue_type, v.city, v.state_province,
           v.total_capacity, v.average_rating,
           CASE 
               WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
                   6371 * acos(cos(radians(p_latitude)) * cos(radians(v.latitude)) * 
                              cos(radians(v.longitude) - radians(p_longitude)) + 
                              sin(radians(p_latitude)) * sin(radians(v.latitude)))
               ELSE NULL
           END::DECIMAL(10, 2) as distance_km,
           v.venue_status
    FROM venues v
    WHERE v.deleted_at IS NULL
    AND (p_search_text IS NULL OR 
         to_tsvector('english', v.venue_name || ' ' || COALESCE(v.display_name, '') || ' ' || COALESCE(v.short_description, '')) 
         @@ plainto_tsquery('english', p_search_text))
    AND (p_venue_types IS NULL OR v.venue_type = ANY(p_venue_types))
    AND (p_city IS NULL OR v.city ILIKE '%' || p_city || '%')
    AND (p_state_province IS NULL OR v.state_province ILIKE '%' || p_state_province || '%')
    AND (p_country_code IS NULL OR v.country_code = p_country_code)
    AND (p_min_capacity IS NULL OR v.total_capacity >= p_min_capacity)
    AND (p_max_capacity IS NULL OR v.total_capacity <= p_max_capacity)
    AND (p_venue_status IS NULL OR v.venue_status = ANY(p_venue_status))
    AND (p_radius_km IS NULL OR p_latitude IS NULL OR p_longitude IS NULL OR v.latitude IS NULL OR v.longitude IS NULL OR
         6371 * acos(cos(radians(p_latitude)) * cos(radians(v.latitude)) * 
                    cos(radians(v.longitude) - radians(p_longitude)) + 
                    sin(radians(p_latitude)) * sin(radians(v.latitude))) <= p_radius_km)
    ORDER BY 
        CASE WHEN distance_km IS NOT NULL THEN distance_km ELSE 999999 END,
        v.average_rating DESC NULLS LAST,
        v.venue_name
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get venue details with related data
CREATE OR REPLACE FUNCTION get_venue_details(p_venue_id UUID)
RETURNS TABLE(
    id UUID,
    venue_name VARCHAR(200),
    venue_type venue_type,
    full_description TEXT,
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    country_code CHAR(2),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    total_capacity INTEGER,
    seated_capacity INTEGER,
    standing_capacity INTEGER,
    venue_status venue_status,
    verification_status verification_status,
    average_rating DECIMAL(3, 2),
    total_events_hosted INTEGER,
    amenities JSONB,
    contact_info JSONB,
    operating_hours JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT v.id, v.venue_name, v.venue_type, v.full_description,
           v.address_line_1, v.address_line_2, v.city, v.state_province, v.country_code,
           v.latitude, v.longitude, v.total_capacity, v.seated_capacity, v.standing_capacity,
           v.venue_status, v.verification_status, v.average_rating, v.total_events_hosted,
           v.amenities,
           jsonb_build_object(
               'primary_phone', v.primary_phone,
               'primary_email', v.primary_email,
               'website_url', v.website_url,
               'contact_person_name', v.contact_person_name,
               'contact_person_phone', v.contact_person_phone,
               'contact_person_email', v.contact_person_email
           ) as contact_info,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'day_of_week', voh.day_of_week,
                       'is_open', voh.is_open,
                       'open_time', voh.open_time,
                       'close_time', voh.close_time,
                       'is_24_hours', voh.is_24_hours
                   )
               ) FROM venue_operating_hours voh 
               WHERE voh.venue_id = v.id 
               AND (voh.effective_until IS NULL OR voh.effective_until >= CURRENT_DATE)),
               '[]'::jsonb
           ) as operating_hours
    FROM venues v
    WHERE v.id = p_venue_id
    AND v.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to soft delete venue
CREATE OR REPLACE FUNCTION delete_venue(
    p_venue_id UUID,
    p_deleted_by_user_id UUID,
    p_deletion_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE venues
    SET deleted_at = NOW(),
        deleted_by_user_id = p_deleted_by_user_id,
        deletion_reason = p_deletion_reason,
        venue_status = 'closed'
    WHERE id = p_venue_id
    AND deleted_at IS NULL;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate venue statistics
CREATE OR REPLACE FUNCTION get_venue_statistics()
RETURNS TABLE(
    total_venues BIGINT,
    active_venues BIGINT,
    verified_venues BIGINT,
    pending_approval BIGINT,
    venues_by_type JSONB,
    venues_by_country JSONB,
    average_capacity DECIMAL,
    total_capacity BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_venues,
        COUNT(*) FILTER (WHERE venue_status = 'active') as active_venues,
        COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_venues,
        COUNT(*) FILTER (WHERE venue_status = 'pending_approval') as pending_approval,
        (SELECT jsonb_object_agg(venue_type, cnt) 
         FROM (SELECT venue_type, COUNT(*) as cnt FROM venues WHERE deleted_at IS NULL GROUP BY venue_type) t) as venues_by_type,
        (SELECT jsonb_object_agg(country_code, cnt) 
         FROM (SELECT country_code, COUNT(*) as cnt FROM venues WHERE deleted_at IS NULL GROUP BY country_code) t) as venues_by_country,
        AVG(total_capacity) as average_capacity,
        SUM(total_capacity) as total_capacity
    FROM venues
    WHERE deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE venues IS 'Master venue data with comprehensive information for TicketToken platform';
COMMENT ON TABLE venue_documents IS 'Venue verification documents and certificates storage';
COMMENT ON TABLE venue_operating_hours IS 'Venue operating hours and availability schedule';

-- Venues table comments
COMMENT ON COLUMN venues.venue_slug IS 'URL-friendly venue identifier: used in public URLs';
COMMENT ON COLUMN venues.venue_subtypes IS 'Additional venue classifications: array of secondary venue types';
COMMENT ON COLUMN venues.venue_tags IS 'Searchable tags: keywords for venue discovery and filtering';
COMMENT ON COLUMN venues.latitude IS 'Geographic latitude: decimal degrees for mapping and location services';
COMMENT ON COLUMN venues.longitude IS 'Geographic longitude: decimal degrees for mapping and location services';
COMMENT ON COLUMN venues.social_media_links IS 'Social media profiles: JSON object with platform URLs';
COMMENT ON COLUMN venues.accessibility_features IS 'ADA compliance features: array of accessibility accommodations';
COMMENT ON COLUMN venues.amenities IS 'Additional amenities: JSON object with facility features and services';
COMMENT ON COLUMN venues.commission_rate IS 'Platform commission: decimal percentage of ticket sales (0.05 = 5%)';
COMMENT ON COLUMN venues.bank_account_info IS 'Payment information: encrypted bank account details for settlements';
COMMENT ON COLUMN venues.prohibited_items IS 'Restricted items: array of items not allowed in venue';
COMMENT ON COLUMN venues.data_quality_score IS 'Data completeness: calculated score (0-100) based on field completion';

-- =====================================================
-- VENUE MASTER DATA SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive venue management system with:
-- - Complete venue master data with business information
-- - Geographic mapping and location services support
-- - Capacity management with flexible configurations
-- - Verification and document management system
-- - Operating hours and availability tracking
-- - Performance optimization with strategic indexing
-- - Helper functions for venue operations
-- - Audit trail integration and compliance support
-- - Data quality scoring and validation
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_venues_tenant_id ON venues(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_tenant_created ON venues(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
