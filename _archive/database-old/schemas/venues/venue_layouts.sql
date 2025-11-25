-- =====================================================
-- TicketToken Platform - Venue Layouts Schema
-- Week 1, Day 3 Development
-- =====================================================
-- Description: Comprehensive venue seating and standing layouts with seat mapping
-- Version: 1.0
-- Created: 2025-07-16 14:30:56
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "postgis";      -- For geometric layout data (optional)

-- Create ENUM types for venue layout management
CREATE TYPE layout_status AS ENUM (
    'active',               -- Layout is currently active
    'inactive',             -- Layout is temporarily inactive
    'seasonal',             -- Layout used seasonally
    'draft',                -- Layout in development
    'archived',             -- Layout archived/retired
    'maintenance'           -- Layout under maintenance
);

CREATE TYPE section_type AS ENUM (
    'seating',              -- Traditional seating section
    'standing',             -- Standing room section
    'vip',                  -- VIP/premium seating
    'box',                  -- Private box seating
    'balcony',              -- Balcony seating
    'mezzanine',            -- Mezzanine level
    'orchestra',            -- Orchestra level
    'gallery',              -- Gallery seating
    'lawn',                 -- Lawn/outdoor seating
    'pit',                  -- General admission pit
    'stage',                -- Stage/performance area
    'backstage',            -- Backstage area
    'concourse',            -- Concourse/walkway
    'concession',           -- Concession area
    'restroom',             -- Restroom facilities
    'emergency_exit',       -- Emergency exit
    'wheelchair',           -- Wheelchair accessible area
    'companion',            -- Companion seating
    'obstructed_view'       -- Obstructed view seating
);

CREATE TYPE seat_type AS ENUM (
    'standard',             -- Standard seat
    'premium',              -- Premium seat
    'vip',                  -- VIP seat
    'wheelchair',           -- Wheelchair accessible
    'companion',            -- Companion seat for wheelchair
    'aisle',                -- Aisle seat
    'obstructed',           -- Obstructed view
    'removable',            -- Removable seat
    'standing',             -- Standing position
    'box',                  -- Box seat
    'love_seat',            -- Love seat (2 people)
    'table',                -- Table seating
    'bar_stool',            -- Bar stool seating
    'bench'                 -- Bench seating
);

CREATE TYPE pricing_tier AS ENUM (
    'platinum',             -- Highest tier
    'gold',                 -- Premium tier
    'silver',               -- Mid-tier
    'bronze',               -- Standard tier
    'general_admission',    -- GA pricing
    'student',              -- Student pricing
    'senior',               -- Senior pricing
    'child',                -- Child pricing
    'group'                 -- Group pricing
);

-- =====================================================
-- VENUE_LAYOUTS TABLE
-- =====================================================
-- Master venue layout configurations
CREATE TABLE IF NOT EXISTS venue_layouts (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Layout identification
    layout_name VARCHAR(200) NOT NULL,                  -- Layout name
    layout_description TEXT,                            -- Layout description
    layout_code VARCHAR(50),                            -- Short code for layout
    
    -- Layout configuration
    is_default BOOLEAN NOT NULL DEFAULT FALSE,          -- Default layout for venue
    layout_status layout_status NOT NULL DEFAULT 'draft',
    season_start_date DATE,                             -- Seasonal layout start
    season_end_date DATE,                               -- Seasonal layout end
    
    -- Capacity information
    total_capacity INTEGER NOT NULL DEFAULT 0,          -- Total venue capacity
    seated_capacity INTEGER NOT NULL DEFAULT 0,         -- Total seated capacity
    standing_capacity INTEGER NOT NULL DEFAULT 0,       -- Total standing capacity
    wheelchair_capacity INTEGER NOT NULL DEFAULT 0,     -- Wheelchair accessible capacity
    companion_capacity INTEGER NOT NULL DEFAULT 0,      -- Companion seat capacity
    vip_capacity INTEGER NOT NULL DEFAULT 0,            -- VIP capacity
    
    -- Layout dimensions and coordinates
    layout_width DECIMAL(10, 2),                       -- Layout width in units
    layout_height DECIMAL(10, 2),                      -- Layout height in units
    scale_factor DECIMAL(8, 4) DEFAULT 1.0,            -- Scale factor for rendering
    coordinate_system VARCHAR(50) DEFAULT 'cartesian',  -- Coordinate system used
    
    -- Stage/performance area
    stage_width DECIMAL(10, 2),                        -- Stage width
    stage_depth DECIMAL(10, 2),                        -- Stage depth
    stage_height DECIMAL(10, 2),                       -- Stage height above floor
    stage_position JSONB,                              -- Stage position coordinates
    
    -- Sightline and viewing data
    sightline_data JSONB DEFAULT '{}',                 -- Sightline analysis data
    viewing_angles JSONB DEFAULT '{}',                 -- Viewing angle data
    acoustic_zones JSONB DEFAULT '{}',                 -- Acoustic zone mapping
    
    -- Layout metadata
    layout_data JSONB DEFAULT '{}',                    -- Complete layout JSON data
    svg_data TEXT,                                     -- SVG representation of layout
    image_url TEXT,                                    -- Layout image URL
    interactive_map_url TEXT,                          -- Interactive map URL
    
    -- Pricing zones
    pricing_zones JSONB DEFAULT '{}',                  -- Pricing zone definitions
    default_pricing_tier pricing_tier DEFAULT 'general_admission',
    
    -- Accessibility compliance
    ada_compliant BOOLEAN NOT NULL DEFAULT FALSE,       -- ADA compliance status
    accessibility_features JSONB DEFAULT '{}',         -- Accessibility features
    
    -- Layout validation
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,        -- Layout has been validated
    validation_notes TEXT,                              -- Validation issues/notes
    validation_date TIMESTAMPTZ,                       -- When layout was validated
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Layout creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Last update timestamp
    created_by_user_id UUID,                           -- User who created layout
    updated_by_user_id UUID,                           -- User who last updated layout
    
    -- Constraints
    CONSTRAINT venue_layouts_unique_name UNIQUE(venue_id, layout_name),
    CONSTRAINT venue_layouts_unique_default EXCLUDE (venue_id WITH =) WHERE (is_default = true),
    CONSTRAINT venue_layouts_valid_capacity CHECK (
        total_capacity >= 0 AND
        seated_capacity >= 0 AND
        standing_capacity >= 0 AND
        wheelchair_capacity >= 0 AND
        companion_capacity >= 0 AND
        total_capacity >= (seated_capacity + standing_capacity)
    ),
    CONSTRAINT venue_layouts_valid_dimensions CHECK (
        (layout_width IS NULL OR layout_width > 0) AND
        (layout_height IS NULL OR layout_height > 0) AND
        (stage_width IS NULL OR stage_width >= 0) AND
        (stage_depth IS NULL OR stage_depth >= 0)
    ),
    CONSTRAINT venue_layouts_valid_seasonal_dates CHECK (
        (season_start_date IS NULL AND season_end_date IS NULL) OR
        (season_start_date IS NOT NULL AND season_end_date IS NOT NULL AND season_end_date >= season_start_date)
    )
);

-- =====================================================
-- LAYOUT_SECTIONS TABLE
-- =====================================================
-- Individual sections within a venue layout
CREATE TABLE IF NOT EXISTS layout_sections (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Layout association
    layout_id UUID NOT NULL REFERENCES venue_layouts(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL,                             -- Denormalized for performance
    
    -- Section identification
    section_name VARCHAR(100) NOT NULL,                 -- Section name
    section_code VARCHAR(20) NOT NULL,                  -- Short section code
    section_type section_type NOT NULL,                 -- Type of section
    
    -- Section hierarchy
    parent_section_id UUID REFERENCES layout_sections(id), -- Parent section (for sub-sections)
    section_level INTEGER NOT NULL DEFAULT 1,           -- Hierarchical level
    display_order INTEGER NOT NULL DEFAULT 0,           -- Display order
    
    -- Section capacity
    section_capacity INTEGER NOT NULL DEFAULT 0,        -- Section capacity
    available_seats INTEGER,                            -- Currently available seats
    wheelchair_seats INTEGER NOT NULL DEFAULT 0,        -- Wheelchair accessible seats
    companion_seats INTEGER NOT NULL DEFAULT 0,         -- Companion seats
    
    -- Section layout and positioning
    section_position JSONB,                             -- Section position coordinates
    section_boundaries JSONB,                           -- Section boundary coordinates
    row_configuration JSONB DEFAULT '{}',              -- Row layout configuration
    
    -- Section properties
    has_numbering BOOLEAN NOT NULL DEFAULT TRUE,        -- Section uses seat numbering
    numbering_scheme VARCHAR(50) DEFAULT 'numeric',     -- Numbering scheme (numeric, alpha, etc.)
    row_numbering_scheme VARCHAR(50) DEFAULT 'numeric', -- Row numbering scheme
    
    -- Pricing and access
    pricing_tier pricing_tier DEFAULT 'general_admission',
    base_price DECIMAL(10, 2),                         -- Base price for section
    requires_special_access BOOLEAN NOT NULL DEFAULT FALSE, -- Requires special access
    access_restrictions TEXT[],                         -- Access restriction list
    
    -- Section features
    has_backs BOOLEAN NOT NULL DEFAULT TRUE,            -- Seats have backs
    has_armrests BOOLEAN NOT NULL DEFAULT TRUE,         -- Seats have armrests
    has_cup_holders BOOLEAN NOT NULL DEFAULT FALSE,     -- Seats have cup holders
    is_covered BOOLEAN NOT NULL DEFAULT TRUE,           -- Section is covered
    climate_controlled BOOLEAN NOT NULL DEFAULT FALSE,  -- Climate controlled
    
    -- Sightline and viewing
    view_quality VARCHAR(50) DEFAULT 'good',           -- View quality rating
    stage_distance_min DECIMAL(8, 2),                  -- Minimum distance to stage
    stage_distance_max DECIMAL(8, 2),                  -- Maximum distance to stage
    elevation_angle DECIMAL(6, 2),                     -- Elevation angle to stage
    
    -- Section status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Section is active
    is_saleable BOOLEAN NOT NULL DEFAULT TRUE,          -- Section can be sold
    maintenance_notes TEXT,                             -- Maintenance notes
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT layout_sections_unique_code UNIQUE(layout_id, section_code),
    CONSTRAINT layout_sections_valid_capacity CHECK (section_capacity >= 0),
    CONSTRAINT layout_sections_valid_level CHECK (section_level > 0),
    CONSTRAINT layout_sections_valid_accessible CHECK (
        wheelchair_seats >= 0 AND 
        companion_seats >= 0 AND
        wheelchair_seats <= section_capacity
    ),
    CONSTRAINT layout_sections_no_self_parent CHECK (parent_section_id != id)
);

-- =====================================================
-- LAYOUT_SEATS TABLE
-- =====================================================
-- Individual seat/position mapping within sections
CREATE TABLE IF NOT EXISTS layout_seats (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Section and layout association
    section_id UUID NOT NULL REFERENCES layout_sections(id) ON DELETE CASCADE,
    layout_id UUID NOT NULL,                            -- Denormalized for performance
    venue_id UUID NOT NULL,                             -- Denormalized for performance
    
    -- Seat identification
    seat_number VARCHAR(20) NOT NULL,                   -- Seat number
    row_identifier VARCHAR(20) NOT NULL,                -- Row identifier
    seat_code VARCHAR(50),                              -- Unique seat code (section-row-seat)
    
    -- Seat type and properties
    seat_type seat_type NOT NULL DEFAULT 'standard',
    is_accessible BOOLEAN NOT NULL DEFAULT FALSE,       -- ADA accessible
    is_companion BOOLEAN NOT NULL DEFAULT FALSE,        -- Companion seat
    is_removable BOOLEAN NOT NULL DEFAULT FALSE,        -- Seat can be removed
    is_obstructed BOOLEAN NOT NULL DEFAULT FALSE,       -- Obstructed view
    
    -- Seat positioning
    seat_position JSONB,                                -- Seat position coordinates (x, y, z)
    seat_orientation DECIMAL(6, 2),                    -- Seat orientation angle
    aisle_proximity VARCHAR(20),                        -- Proximity to aisle (left, right, none)
    
    -- Seat dimensions and features
    seat_width DECIMAL(6, 2),                          -- Seat width in inches/cm
    seat_depth DECIMAL(6, 2),                          -- Seat depth in inches/cm
    seat_height DECIMAL(6, 2),                         -- Seat height in inches/cm
    leg_room DECIMAL(6, 2),                            -- Leg room space
    
    -- Seat features
    has_back BOOLEAN NOT NULL DEFAULT TRUE,             -- Seat has back
    has_armrests BOOLEAN NOT NULL DEFAULT TRUE,         -- Seat has armrests
    has_cup_holder BOOLEAN NOT NULL DEFAULT FALSE,      -- Seat has cup holder
    has_cushion BOOLEAN NOT NULL DEFAULT TRUE,          -- Seat has cushion
    is_foldable BOOLEAN NOT NULL DEFAULT FALSE,         -- Seat is foldable
    
    -- Viewing properties
    viewing_angle DECIMAL(6, 2),                       -- Viewing angle to stage
    stage_distance DECIMAL(8, 2),                      -- Distance to stage
    elevation DECIMAL(8, 2),                           -- Seat elevation
    sightline_quality VARCHAR(50) DEFAULT 'good',      -- Sightline quality
    
    -- Pricing and availability
    pricing_tier pricing_tier DEFAULT 'general_admission',
    base_price DECIMAL(10, 2),                         -- Base price for seat
    premium_multiplier DECIMAL(4, 2) DEFAULT 1.0,      -- Price multiplier
    
    -- Seat status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Seat is active
    is_saleable BOOLEAN NOT NULL DEFAULT TRUE,          -- Seat can be sold
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,          -- Seat is blocked
    block_reason TEXT,                                  -- Reason for blocking
    
    -- Maintenance and notes
    condition_rating INTEGER DEFAULT 5,                 -- Condition rating (1-5)
    maintenance_notes TEXT,                             -- Maintenance notes
    last_inspection_date DATE,                          -- Last inspection date
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT layout_seats_unique_position UNIQUE(section_id, row_identifier, seat_number),
    CONSTRAINT layout_seats_valid_dimensions CHECK (
        (seat_width IS NULL OR seat_width > 0) AND
        (seat_depth IS NULL OR seat_depth > 0) AND
        (seat_height IS NULL OR seat_height > 0) AND
        (leg_room IS NULL OR leg_room >= 0)
    ),
    CONSTRAINT layout_seats_valid_condition CHECK (condition_rating >= 1 AND condition_rating <= 5),
    CONSTRAINT layout_seats_valid_multiplier CHECK (premium_multiplier > 0)
);

-- =====================================================
-- LAYOUT_PRICING_ZONES TABLE
-- =====================================================
-- Pricing zone definitions for dynamic pricing
CREATE TABLE IF NOT EXISTS layout_pricing_zones (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Layout association
    layout_id UUID NOT NULL REFERENCES venue_layouts(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL,                             -- Denormalized for performance
    
    -- Zone identification
    zone_name VARCHAR(100) NOT NULL,                    -- Pricing zone name
    zone_code VARCHAR(20) NOT NULL,                     -- Short zone code
    zone_description TEXT,                              -- Zone description
    
    -- Zone configuration
    pricing_tier pricing_tier NOT NULL,                 -- Pricing tier
    base_price DECIMAL(10, 2) NOT NULL,                -- Base price for zone
    min_price DECIMAL(10, 2),                          -- Minimum allowed price
    max_price DECIMAL(10, 2),                          -- Maximum allowed price
    
    -- Zone boundaries and seats
    zone_boundaries JSONB,                              -- Zone boundary coordinates
    included_sections UUID[],                           -- Array of section IDs
    included_seats UUID[],                              -- Array of specific seat IDs
    excluded_seats UUID[],                              -- Array of excluded seat IDs
    
    -- Pricing rules
    dynamic_pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE, -- Enable dynamic pricing
    pricing_rules JSONB DEFAULT '{}',                  -- Dynamic pricing rules
    peak_multiplier DECIMAL(4, 2) DEFAULT 1.0,         -- Peak time multiplier
    off_peak_multiplier DECIMAL(4, 2) DEFAULT 1.0,     -- Off-peak multiplier
    
    -- Zone features and amenities
    included_amenities TEXT[],                          -- Included amenities
    special_features TEXT[],                            -- Special features
    food_beverage_included BOOLEAN NOT NULL DEFAULT FALSE, -- F&B included
    parking_included BOOLEAN NOT NULL DEFAULT FALSE,    -- Parking included
    
    -- Zone status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Zone is active
    requires_membership BOOLEAN NOT NULL DEFAULT FALSE, -- Requires membership
    advance_booking_required BOOLEAN NOT NULL DEFAULT FALSE, -- Requires advance booking
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT layout_pricing_zones_unique_code UNIQUE(layout_id, zone_code),
    CONSTRAINT layout_pricing_zones_valid_prices CHECK (
        base_price >= 0 AND
        (min_price IS NULL OR min_price >= 0) AND
        (max_price IS NULL OR max_price >= min_price) AND
        (min_price IS NULL OR base_price >= min_price) AND
        (max_price IS NULL OR base_price <= max_price)
    ),
    CONSTRAINT layout_pricing_zones_valid_multipliers CHECK (
        peak_multiplier > 0 AND off_peak_multiplier > 0
    )
);

-- =====================================================
-- LAYOUT_ACCESSIBILITY_FEATURES TABLE
-- =====================================================
-- Detailed accessibility feature mapping
CREATE TABLE IF NOT EXISTS layout_accessibility_features (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Layout association
    layout_id UUID NOT NULL REFERENCES venue_layouts(id) ON DELETE CASCADE,
    
    -- Feature identification
    feature_type VARCHAR(100) NOT NULL,                 -- Type of accessibility feature
    feature_name VARCHAR(200) NOT NULL,                 -- Feature name
    feature_description TEXT,                           -- Detailed description
    
    -- Feature location
    location_type VARCHAR(50) NOT NULL,                 -- Where feature is located
    section_id UUID REFERENCES layout_sections(id),     -- Associated section (if applicable)
    coordinates JSONB,                                  -- Feature coordinates
    
    -- Feature specifications
    compliance_standards TEXT[],                        -- Compliance standards (ADA, etc.)
    capacity INTEGER,                                   -- Feature capacity (if applicable)
    dimensions JSONB,                                   -- Feature dimensions
    
    -- Feature status
    is_available BOOLEAN NOT NULL DEFAULT TRUE,         -- Feature is available
    maintenance_required BOOLEAN NOT NULL DEFAULT FALSE, -- Requires maintenance
    inspection_due_date DATE,                           -- Next inspection due
    
    -- Documentation
    documentation_url TEXT,                            -- Documentation URL
    certification_date DATE,                           -- Certification date
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT layout_accessibility_valid_capacity CHECK (capacity IS NULL OR capacity >= 0)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for venue_layouts
CREATE INDEX IF NOT EXISTS idx_venue_layouts_venue_id ON venue_layouts(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_layouts_status ON venue_layouts(layout_status);
CREATE INDEX IF NOT EXISTS idx_venue_layouts_default ON venue_layouts(venue_id, is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_layouts_active ON venue_layouts(venue_id, layout_status) WHERE layout_status = 'active';

-- Seasonal layout indexes
CREATE INDEX IF NOT EXISTS idx_venue_layouts_seasonal ON venue_layouts(season_start_date, season_end_date) WHERE layout_status = 'seasonal';

-- Layout sections indexes
CREATE INDEX IF NOT EXISTS idx_layout_sections_layout_id ON layout_sections(layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_sections_venue_id ON layout_sections(venue_id);
CREATE INDEX IF NOT EXISTS idx_layout_sections_type ON layout_sections(section_type);
CREATE INDEX IF NOT EXISTS idx_layout_sections_active ON layout_sections(is_active, is_saleable);
CREATE INDEX IF NOT EXISTS idx_layout_sections_parent ON layout_sections(parent_section_id) WHERE parent_section_id IS NOT NULL;

-- Section hierarchy and ordering indexes
CREATE INDEX IF NOT EXISTS idx_layout_sections_hierarchy ON layout_sections(layout_id, section_level, display_order);
CREATE INDEX IF NOT EXISTS idx_layout_sections_pricing ON layout_sections(pricing_tier);

-- Layout seats indexes
CREATE INDEX IF NOT EXISTS idx_layout_seats_section_id ON layout_seats(section_id);
CREATE INDEX IF NOT EXISTS idx_layout_seats_layout_id ON layout_seats(layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_seats_venue_id ON layout_seats(venue_id);
CREATE INDEX IF NOT EXISTS idx_layout_seats_type ON layout_seats(seat_type);

-- Seat availability and status indexes
CREATE INDEX IF NOT EXISTS idx_layout_seats_available ON layout_seats(is_active, is_saleable, is_blocked);
CREATE INDEX IF NOT EXISTS idx_layout_seats_accessible ON layout_seats(is_accessible) WHERE is_accessible = TRUE;
CREATE INDEX IF NOT EXISTS idx_layout_seats_companion ON layout_seats(is_companion) WHERE is_companion = TRUE;

-- Seat location indexes
CREATE INDEX IF NOT EXISTS idx_layout_seats_row_seat ON layout_seats(section_id, row_identifier, seat_number);
CREATE INDEX IF NOT EXISTS idx_layout_seats_pricing ON layout_seats(pricing_tier);

-- Pricing zones indexes
CREATE INDEX IF NOT EXISTS idx_layout_pricing_zones_layout_id ON layout_pricing_zones(layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_pricing_zones_venue_id ON layout_pricing_zones(venue_id);
CREATE INDEX IF NOT EXISTS idx_layout_pricing_zones_tier ON layout_pricing_zones(pricing_tier);
CREATE INDEX IF NOT EXISTS idx_layout_pricing_zones_active ON layout_pricing_zones(is_active) WHERE is_active = TRUE;

-- Accessibility features indexes
CREATE INDEX IF NOT EXISTS idx_layout_accessibility_layout_id ON layout_accessibility_features(layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_accessibility_type ON layout_accessibility_features(feature_type);
CREATE INDEX IF NOT EXISTS idx_layout_accessibility_section ON layout_accessibility_features(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_layout_accessibility_available ON layout_accessibility_features(is_available) WHERE is_available = TRUE;

-- JSON data indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_venue_layouts_data ON venue_layouts USING gin(layout_data) WHERE layout_data IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_layout_sections_position ON layout_sections USING gin(section_position) WHERE section_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_layout_seats_position ON layout_seats USING gin(seat_position) WHERE seat_position IS NOT NULL;

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to update layout capacity totals
CREATE OR REPLACE FUNCTION update_layout_capacity()
RETURNS TRIGGER AS $$
BEGIN
    -- Update layout capacity totals when sections change
    UPDATE venue_layouts
    SET seated_capacity = COALESCE((
            SELECT SUM(section_capacity)
            FROM layout_sections
            WHERE layout_id = NEW.layout_id
            AND section_type IN ('seating', 'vip', 'box', 'balcony', 'orchestra', 'gallery')
            AND is_active = TRUE
        ), 0),
        standing_capacity = COALESCE((
            SELECT SUM(section_capacity)
            FROM layout_sections
            WHERE layout_id = NEW.layout_id
            AND section_type IN ('standing', 'pit', 'lawn')
            AND is_active = TRUE
        ), 0),
        wheelchair_capacity = COALESCE((
            SELECT SUM(wheelchair_seats)
            FROM layout_sections
            WHERE layout_id = NEW.layout_id
            AND is_active = TRUE
        ), 0),
        companion_capacity = COALESCE((
            SELECT SUM(companion_seats)
            FROM layout_sections
            WHERE layout_id = NEW.layout_id
            AND is_active = TRUE
        ), 0),
        vip_capacity = COALESCE((
            SELECT SUM(section_capacity)
            FROM layout_sections
            WHERE layout_id = NEW.layout_id
            AND section_type = 'vip'
            AND is_active = TRUE
        ), 0),
        updated_at = NOW()
    WHERE id = NEW.layout_id;
    
    -- Update total capacity
    UPDATE venue_layouts
    SET total_capacity = seated_capacity + standing_capacity
    WHERE id = NEW.layout_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate seat codes automatically
CREATE OR REPLACE FUNCTION generate_seat_code()
RETURNS TRIGGER AS $$
DECLARE
    section_code VARCHAR(20);
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Generate seat code if not provided
    IF NEW.seat_code IS NULL THEN
        SELECT ls.section_code INTO section_code
        FROM layout_sections ls
        WHERE ls.id = NEW.section_id;
        
        NEW.seat_code = section_code || '-' || NEW.row_identifier || '-' || NEW.seat_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate layout accessibility compliance
CREATE OR REPLACE FUNCTION validate_layout_accessibility()
RETURNS TRIGGER AS $$
DECLARE
    total_seats INTEGER;
    accessible_seats INTEGER;
    min_required INTEGER;
BEGIN
    NEW.updated_at = NOW();
    
    -- Calculate ADA compliance
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        SELECT COALESCE(SUM(section_capacity), 0) INTO total_seats
        FROM layout_sections
        WHERE layout_id = NEW.id
        AND section_type IN ('seating', 'vip', 'box', 'balcony', 'orchestra', 'gallery')
        AND is_active = TRUE;
        
        SELECT COALESCE(SUM(wheelchair_seats), 0) INTO accessible_seats
        FROM layout_sections
        WHERE layout_id = NEW.id
        AND is_active = TRUE;
        
        -- Calculate minimum required accessible seats (typically 1% with minimum of 2)
        min_required = GREATEST(CEIL(total_seats * 0.01), 2);
        
        -- Update ADA compliance status
        NEW.ada_compliant = (accessible_seats >= min_required);
        
        -- Add validation notes if not compliant
        IF NOT NEW.ada_compliant THEN
            NEW.validation_notes = COALESCE(NEW.validation_notes || '; ', '') || 
                                 'ADA non-compliant: ' || accessible_seats || ' accessible seats provided, ' || 
                                 min_required || ' required';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_layout_capacity_update ON layout_sections;
CREATE TRIGGER trigger_layout_capacity_update
    AFTER INSERT OR UPDATE OR DELETE ON layout_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_layout_capacity();

DROP TRIGGER IF EXISTS trigger_seat_code_generation ON layout_seats;
CREATE TRIGGER trigger_seat_code_generation
    BEFORE INSERT OR UPDATE ON layout_seats
    FOR EACH ROW
    EXECUTE FUNCTION generate_seat_code();

DROP TRIGGER IF EXISTS trigger_layout_accessibility_validation ON venue_layouts;
CREATE TRIGGER trigger_layout_accessibility_validation
    BEFORE INSERT OR UPDATE ON venue_layouts
    FOR EACH ROW
    EXECUTE FUNCTION validate_layout_accessibility();

-- =====================================================
-- VENUE LAYOUT HELPER FUNCTIONS
-- =====================================================

-- Function to create a basic venue layout
CREATE OR REPLACE FUNCTION create_venue_layout(
    p_venue_id UUID,
    p_layout_name VARCHAR(200),
    p_layout_description TEXT DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT FALSE,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_layout_id UUID;
BEGIN
    INSERT INTO venue_layouts (
        venue_id, layout_name, layout_description, is_default, created_by_user_id
    )
    VALUES (
        p_venue_id, p_layout_name, p_layout_description, p_is_default, p_created_by_user_id
    )
    RETURNING id INTO new_layout_id;
    
    RETURN new_layout_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add a section to a layout
CREATE OR REPLACE FUNCTION add_layout_section(
    p_layout_id UUID,
    p_section_name VARCHAR(100),
    p_section_code VARCHAR(20),
    p_section_type section_type,
    p_capacity INTEGER,
    p_pricing_tier pricing_tier DEFAULT 'general_admission',
    p_wheelchair_seats INTEGER DEFAULT 0,
    p_companion_seats INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
    new_section_id UUID;
    v_venue_id UUID;
BEGIN
    -- Get venue ID from layout
    SELECT venue_id INTO v_venue_id FROM venue_layouts WHERE id = p_layout_id;
    
    INSERT INTO layout_sections (
        layout_id, venue_id, section_name, section_code, section_type,
        section_capacity, pricing_tier, wheelchair_seats, companion_seats
    )
    VALUES (
        p_layout_id, v_venue_id, p_section_name, p_section_code, p_section_type,
        p_capacity, p_pricing_tier, p_wheelchair_seats, p_companion_seats
    )
    RETURNING id INTO new_section_id;
    
    RETURN new_section_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add seats to a section with automatic numbering
CREATE OR REPLACE FUNCTION add_section_seats(
    p_section_id UUID,
    p_rows INTEGER,
    p_seats_per_row INTEGER,
    p_row_prefix VARCHAR(10) DEFAULT '',
    p_start_row INTEGER DEFAULT 1,
    p_start_seat INTEGER DEFAULT 1,
    p_seat_type seat_type DEFAULT 'standard'
) RETURNS INTEGER AS $$
DECLARE
    v_layout_id UUID;
    v_venue_id UUID;
    seats_added INTEGER := 0;
    current_row INTEGER;
    current_seat INTEGER;
    row_identifier VARCHAR(20);
    seat_number VARCHAR(20);
BEGIN
    -- Get layout and venue IDs
    SELECT layout_id, venue_id INTO v_layout_id, v_venue_id
    FROM layout_sections
    WHERE id = p_section_id;
    
    -- Add seats for each row
    FOR current_row IN p_start_row..(p_start_row + p_rows - 1) LOOP
        row_identifier = p_row_prefix || current_row::TEXT;
        
        FOR current_seat IN p_start_seat..(p_start_seat + p_seats_per_row - 1) LOOP
            seat_number = current_seat::TEXT;
            
            INSERT INTO layout_seats (
                section_id, layout_id, venue_id, seat_number, row_identifier, seat_type
            )
            VALUES (
                p_section_id, v_layout_id, v_venue_id, seat_number, row_identifier, p_seat_type
            );
            
            seats_added := seats_added + 1;
        END LOOP;
    END LOOP;
    
    RETURN seats_added;
END;
$$ LANGUAGE plpgsql;

-- Function to get available seats in a section
CREATE OR REPLACE FUNCTION get_available_seats(
    p_section_id UUID,
    p_event_id UUID DEFAULT NULL
) RETURNS TABLE(
    seat_id UUID,
    seat_code VARCHAR(50),
    row_identifier VARCHAR(20),
    seat_number VARCHAR(20),
    seat_type seat_type,
    pricing_tier pricing_tier,
    base_price DECIMAL(10, 2),
    is_accessible BOOLEAN,
    is_companion BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT ls.id, ls.seat_code, ls.row_identifier, ls.seat_number,
           ls.seat_type, ls.pricing_tier, ls.base_price,
           ls.is_accessible, ls.is_companion
    FROM layout_seats ls
    WHERE ls.section_id = p_section_id
    AND ls.is_active = TRUE
    AND ls.is_saleable = TRUE
    AND ls.is_blocked = FALSE
    -- Add event-specific availability check here when ticket sales are implemented
    ORDER BY ls.row_identifier, ls.seat_number;
END;
$$ LANGUAGE plpgsql;

-- Function to get layout summary
CREATE OR REPLACE FUNCTION get_layout_summary(p_layout_id UUID)
RETURNS TABLE(
    layout_name VARCHAR(200),
    layout_status layout_status,
    total_capacity INTEGER,
    seated_capacity INTEGER,
    standing_capacity INTEGER,
    wheelchair_capacity INTEGER,
    section_count BIGINT,
    pricing_zones JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT vl.layout_name, vl.layout_status, vl.total_capacity,
           vl.seated_capacity, vl.standing_capacity, vl.wheelchair_capacity,
           COUNT(ls.id) as section_count,
           vl.pricing_zones
    FROM venue_layouts vl
    LEFT JOIN layout_sections ls ON vl.id = ls.layout_id AND ls.is_active = TRUE
    WHERE vl.id = p_layout_id
    GROUP BY vl.id, vl.layout_name, vl.layout_status, vl.total_capacity,
             vl.seated_capacity, vl.standing_capacity, vl.wheelchair_capacity,
             vl.pricing_zones;
END;
$$ LANGUAGE plpgsql;

-- Function to get seats by pricing tier
CREATE OR REPLACE FUNCTION get_seats_by_pricing_tier(
    p_layout_id UUID,
    p_pricing_tier pricing_tier
) RETURNS TABLE(
    section_name VARCHAR(100),
    seat_count BIGINT,
    accessible_seats BIGINT,
    min_price DECIMAL(10, 2),
    max_price DECIMAL(10, 2),
    avg_price DECIMAL(10, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT ls_sect.section_name,
           COUNT(ls_seat.id) as seat_count,
           COUNT(ls_seat.id) FILTER (WHERE ls_seat.is_accessible = TRUE) as accessible_seats,
           MIN(ls_seat.base_price) as min_price,
           MAX(ls_seat.base_price) as max_price,
           AVG(ls_seat.base_price) as avg_price
    FROM layout_sections ls_sect
    JOIN layout_seats ls_seat ON ls_sect.id = ls_seat.section_id
    WHERE ls_sect.layout_id = p_layout_id
    AND ls_seat.pricing_tier = p_pricing_tier
    AND ls_seat.is_active = TRUE
    AND ls_seat.is_saleable = TRUE
    GROUP BY ls_sect.section_name
    ORDER BY ls_sect.section_name;
END;
$$ LANGUAGE plpgsql;

-- Function to validate seat selection for accessibility requirements
CREATE OR REPLACE FUNCTION validate_seat_selection(
    p_seat_ids UUID[],
    p_requires_wheelchair BOOLEAN DEFAULT FALSE,
    p_requires_companion BOOLEAN DEFAULT FALSE
) RETURNS TABLE(
    is_valid BOOLEAN,
    validation_message TEXT,
    suggested_alternatives UUID[]
) AS $$
DECLARE
    wheelchair_count INTEGER := 0;
    companion_count INTEGER := 0;
    total_seats INTEGER;
    message TEXT := '';
    alternatives UUID[] := '{}';
BEGIN
    total_seats := array_length(p_seat_ids, 1);
    
    -- Count wheelchair and companion seats in selection
    SELECT COUNT(*) FILTER (WHERE is_accessible = TRUE),
           COUNT(*) FILTER (WHERE is_companion = TRUE)
    INTO wheelchair_count, companion_count
    FROM layout_seats
    WHERE id = ANY(p_seat_ids);
    
    -- Validate wheelchair requirements
    IF p_requires_wheelchair AND wheelchair_count = 0 THEN
        message := 'Wheelchair accessible seat required but none selected';
        
        -- Find alternative wheelchair seats in same sections
        SELECT array_agg(id) INTO alternatives
        FROM layout_seats
        WHERE section_id IN (
            SELECT DISTINCT section_id FROM layout_seats WHERE id = ANY(p_seat_ids)
        )
        AND is_accessible = TRUE
        AND is_active = TRUE
        AND is_saleable = TRUE
        LIMIT 5;
        
        RETURN QUERY SELECT FALSE, message, alternatives;
        RETURN;
    END IF;
    
    -- Validate companion seat requirements
    IF p_requires_companion AND companion_count = 0 AND wheelchair_count > 0 THEN
        message := 'Companion seat recommended for wheelchair accessible selection';
        
        -- This is a warning, not a blocking validation
        RETURN QUERY SELECT TRUE, message, alternatives;
        RETURN;
    END IF;
    
    -- All validations passed
    RETURN QUERY SELECT TRUE, 'Seat selection is valid'::TEXT, alternatives;
END;
$$ LANGUAGE plpgsql;

-- Function to copy layout from another venue (template)
CREATE OR REPLACE FUNCTION copy_layout_from_template(
    p_target_venue_id UUID,
    p_template_layout_id UUID,
    p_new_layout_name VARCHAR(200),
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_layout_id UUID;
    template_layout RECORD;
    section_record RECORD;
    new_section_id UUID;
    seat_count INTEGER;
BEGIN
    -- Get template layout
    SELECT * INTO template_layout
    FROM venue_layouts
    WHERE id = p_template_layout_id;
    
    -- Create new layout
    INSERT INTO venue_layouts (
        venue_id, layout_name, layout_description, total_capacity,
        seated_capacity, standing_capacity, wheelchair_capacity,
        companion_capacity, vip_capacity, layout_width, layout_height,
        scale_factor, coordinate_system, stage_width, stage_depth,
        stage_height, stage_position, sightline_data, viewing_angles,
        acoustic_zones, pricing_zones, default_pricing_tier,
        created_by_user_id
    )
    VALUES (
        p_target_venue_id, p_new_layout_name, template_layout.layout_description,
        template_layout.total_capacity, template_layout.seated_capacity,
        template_layout.standing_capacity, template_layout.wheelchair_capacity,
        template_layout.companion_capacity, template_layout.vip_capacity,
        template_layout.layout_width, template_layout.layout_height,
        template_layout.scale_factor, template_layout.coordinate_system,
        template_layout.stage_width, template_layout.stage_depth,
        template_layout.stage_height, template_layout.stage_position,
        template_layout.sightline_data, template_layout.viewing_angles,
        template_layout.acoustic_zones, template_layout.pricing_zones,
        template_layout.default_pricing_tier, p_created_by_user_id
    )
    RETURNING id INTO new_layout_id;
    
    -- Copy sections
    FOR section_record IN
        SELECT * FROM layout_sections WHERE layout_id = p_template_layout_id
    LOOP
        SELECT add_layout_section(
            new_layout_id,
            section_record.section_name,
            section_record.section_code,
            section_record.section_type,
            section_record.section_capacity,
            section_record.pricing_tier,
            section_record.wheelchair_seats,
            section_record.companion_seats
        ) INTO new_section_id;
        
        -- Copy seats for this section
        INSERT INTO layout_seats (
            section_id, layout_id, venue_id, seat_number, row_identifier,
            seat_type, is_accessible, is_companion, seat_position,
            pricing_tier, base_price
        )
        SELECT new_section_id, new_layout_id, p_target_venue_id,
               seat_number, row_identifier, seat_type, is_accessible,
               is_companion, seat_position, pricing_tier, base_price
        FROM layout_seats
        WHERE section_id = section_record.id;
    END LOOP;
    
    RETURN new_layout_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE venue_layouts IS 'Master venue layout configurations with seating and standing arrangements';
COMMENT ON TABLE layout_sections IS 'Individual sections within venue layouts (VIP, general, balcony, etc.)';
COMMENT ON TABLE layout_seats IS 'Individual seat/position mapping with detailed properties and accessibility';
COMMENT ON TABLE layout_pricing_zones IS 'Pricing zone definitions for dynamic and tiered pricing';
COMMENT ON TABLE layout_accessibility_features IS 'Detailed accessibility feature mapping for ADA compliance';

-- Venue layouts table comments
COMMENT ON COLUMN venue_layouts.layout_data IS 'Complete layout JSON data: stores complex layout information and metadata';
COMMENT ON COLUMN venue_layouts.svg_data IS 'SVG representation: scalable vector graphics for layout visualization';
COMMENT ON COLUMN venue_layouts.sightline_data IS 'Sightline analysis: JSON data with viewing quality and obstruction information';
COMMENT ON COLUMN venue_layouts.acoustic_zones IS 'Acoustic mapping: sound quality zones and speaker coverage areas';
COMMENT ON COLUMN venue_layouts.ada_compliant IS 'ADA compliance status: automatically calculated based on accessibility features';

-- Layout sections table comments
COMMENT ON COLUMN layout_sections.section_boundaries IS 'Section boundaries: coordinate data defining section perimeter';
COMMENT ON COLUMN layout_sections.row_configuration IS 'Row layout: configuration data for seat arrangements within section';
COMMENT ON COLUMN layout_sections.view_quality IS 'View quality rating: subjective assessment of sightlines from section';
COMMENT ON COLUMN layout_sections.stage_distance_min IS 'Minimum stage distance: closest point in section to performance area';

-- Layout seats table comments
COMMENT ON COLUMN layout_seats.seat_position IS 'Seat coordinates: 3D position data (x, y, z) for precise seat mapping';
COMMENT ON COLUMN layout_seats.seat_code IS 'Unique seat identifier: automatically generated section-row-seat code';
COMMENT ON COLUMN layout_seats.aisle_proximity IS 'Aisle access: proximity to aisle (left, right, none) for accessibility';
COMMENT ON COLUMN layout_seats.sightline_quality IS 'Sightline rating: quality assessment of view from this specific seat';
COMMENT ON COLUMN layout_seats.premium_multiplier IS 'Price multiplier: factor applied to base price for premium positioning';

-- =====================================================
-- VENUE LAYOUTS SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive venue layout management system with:
-- - Flexible seating and standing arrangements
-- - Detailed seat mapping with row/seat numbering
-- - Multi-tier pricing zones with dynamic pricing support
-- - ADA compliance tracking and accessibility features
-- - Sightline and viewing quality analysis
-- - Stage/performance area configuration
-- - JSON storage for complex layout data
-- - Helper functions for seat selection and availability
-- - Template-based layout copying and creation
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_venue_layouts_tenant_id ON venue_layouts(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_layouts_tenant_created ON venue_layouts(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
