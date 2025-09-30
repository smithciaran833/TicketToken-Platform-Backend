-- =====================================================
-- TicketToken Platform - Events Master Data Schema
-- Week 1, Day 3 Development
-- =====================================================
-- Description: Comprehensive event management with performer lineup and scheduling
-- Version: 1.0
-- Created: 2025-07-16 14:44:10
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For text search optimization

-- Create ENUM types for event management
CREATE TYPE event_category AS ENUM (
    'concert',              -- Music concerts and performances
    'sports',               -- Sports events and games
    'theater',              -- Theater and drama performances
    'conference',           -- Business conferences and conventions
    'comedy',               -- Comedy shows and stand-up
    'dance',                -- Dance performances and recitals
    'festival',             -- Music, food, and cultural festivals
    'exhibition',           -- Art exhibitions and galleries
    'workshop',             -- Educational workshops and seminars
    'networking',           -- Professional networking events
    'charity',              -- Charity galas and fundraisers
    'religious',            -- Religious services and ceremonies
    'family',               -- Family-friendly events
    'nightlife',            -- Nightclub and DJ events
    'food_drink',           -- Food and beverage events
    'wellness',             -- Health and wellness events
    'cultural',             -- Cultural and community events
    'educational',          -- Educational and academic events
    'corporate',            -- Corporate events and meetings
    'other'                 -- Other event types
);

CREATE TYPE event_status AS ENUM (
    'draft',                -- Event is in draft mode
    'pending_approval',     -- Event pending approval
    'approved',             -- Event approved but not published
    'published',            -- Event is live and tickets available
    'on_sale',              -- Tickets currently on sale
    'sold_out',             -- All tickets sold
    'paused',               -- Ticket sales paused
    'cancelled',            -- Event cancelled
    'postponed',            -- Event postponed
    'rescheduled',          -- Event rescheduled
    'completed',            -- Event has concluded
    'archived'              -- Event archived
);

CREATE TYPE age_restriction AS ENUM (
    'all_ages',             -- All ages welcome
    '13_plus',              -- 13 and older
    '16_plus',              -- 16 and older
    '18_plus',              -- 18 and older (adult)
    '21_plus',              -- 21 and older (alcohol)
    'family_friendly',      -- Specifically family-oriented
    'seniors_only',         -- Senior citizens only
    'children_only'         -- Children-specific event
);

CREATE TYPE content_rating AS ENUM (
    'g',                    -- General audiences
    'pg',                   -- Parental guidance suggested
    'pg13',                 -- Parents strongly cautioned
    'r',                    -- Restricted
    'nc17',                 -- Adults only
    'unrated',              -- Not rated
    'explicit'              -- Explicit content
);

CREATE TYPE performer_type AS ENUM (
    'headliner',            -- Main performer/artist
    'co_headliner',         -- Co-main performer
    'opening_act',          -- Opening/supporting act
    'special_guest',        -- Special guest performer
    'dj',                   -- DJ or electronic artist
    'mc_host',              -- Master of ceremonies/host
    'speaker',              -- Conference speaker/presenter
    'comedian',             -- Comedy performer
    'athlete',              -- Sports athlete/team
    'presenter',            -- Event presenter
    'moderator',            -- Panel moderator
    'other'                 -- Other performer type
);

-- =====================================================
-- EVENTS TABLE
-- =====================================================
-- Master events table with comprehensive event information
CREATE TABLE IF NOT EXISTS events (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Event identification
    event_name VARCHAR(300) NOT NULL,                   -- Event name/title
    event_slug VARCHAR(300) UNIQUE,                     -- URL-friendly slug
    short_description TEXT,                             -- Brief event description
    full_description TEXT,                              -- Detailed event description
    
    -- Event classification
    event_category event_category NOT NULL,             -- Primary event category
    event_subcategories VARCHAR(100)[],                 -- Additional subcategories
    event_tags VARCHAR(50)[],                           -- Searchable tags
    genre VARCHAR(100),                                 -- Music genre or event genre
    
    -- Event scheduling
    event_date DATE NOT NULL,                           -- Event date
    event_time TIME,                                    -- Event start time
    event_timezone VARCHAR(100) DEFAULT 'UTC',          -- Event timezone
    event_datetime TIMESTAMPTZ,                         -- Combined date/time with timezone
    
    -- Event timing details
    doors_open_time TIME,                               -- When doors open
    show_start_time TIME,                               -- When show/event starts
    estimated_duration INTERVAL,                       -- Expected event duration
    estimated_end_time TIME,                            -- Estimated end time
    
    -- Multiple session support
    has_multiple_sessions BOOLEAN NOT NULL DEFAULT FALSE, -- Event has multiple sessions
    session_count INTEGER DEFAULT 1,                    -- Number of sessions
    session_schedule JSONB DEFAULT '[]',                -- Session schedule details
    
    -- Event status and visibility
    event_status event_status NOT NULL DEFAULT 'draft',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,           -- Event is visible to public
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,         -- Featured event
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,        -- Recurring event
    recurrence_pattern JSONB,                          -- Recurrence configuration
    
    -- Age restrictions and content
    age_restriction age_restriction DEFAULT 'all_ages',
    content_rating content_rating DEFAULT 'unrated',
    content_warnings TEXT[],                            -- Content warning tags
    accessibility_info TEXT,                            -- Accessibility information
    
    -- Capacity and ticketing
    expected_attendance INTEGER,                         -- Expected number of attendees
    max_capacity INTEGER,                               -- Maximum event capacity
    venue_layout_id UUID,                              -- Reference to venue_layouts.id
    seating_configuration VARCHAR(100),                 -- Seating configuration type
    
    -- Pricing and sales
    base_ticket_price DECIMAL(10, 2),                  -- Base ticket price
    price_range_min DECIMAL(10, 2),                    -- Minimum ticket price
    price_range_max DECIMAL(10, 2),                    -- Maximum ticket price
    ticket_sales_start TIMESTAMPTZ,                    -- When ticket sales begin
    ticket_sales_end TIMESTAMPTZ,                      -- When ticket sales end
    
    -- Event organizer information
    organizer_name VARCHAR(200),                        -- Event organizer name
    organizer_contact_email VARCHAR(320),              -- Organizer contact email
    organizer_contact_phone VARCHAR(20),               -- Organizer contact phone
    organizer_website TEXT,                            -- Organizer website
    
    -- Promotion and marketing
    promotional_text TEXT,                             -- Promotional description
    marketing_copy TEXT,                               -- Marketing copy for ads
    hashtags VARCHAR(50)[],                            -- Social media hashtags
    social_media_links JSONB DEFAULT '{}',             -- Social media links
    
    -- Event artwork and media
    primary_image_url TEXT,                            -- Main event image
    poster_image_url TEXT,                             -- Event poster image
    banner_image_url TEXT,                             -- Banner image for web
    gallery_images JSONB DEFAULT '[]',                 -- Image gallery URLs
    promotional_video_url TEXT,                        -- Promotional video URL
    
    -- Weather and outdoor considerations
    is_outdoor_event BOOLEAN NOT NULL DEFAULT FALSE,    -- Event is outdoors
    weather_dependent BOOLEAN NOT NULL DEFAULT FALSE,   -- Event depends on weather
    rain_policy TEXT,                                  -- Rain/weather policy
    weather_contingency_plan TEXT,                     -- Weather backup plan
    
    -- Special requirements and notes
    special_requirements TEXT,                          -- Special venue requirements
    production_notes TEXT,                             -- Production notes for staff
    catering_requirements TEXT,                         -- Catering needs
    technical_requirements TEXT,                        -- Technical setup needs
    security_requirements TEXT,                         -- Security considerations
    
    -- Performance and analytics
    total_tickets_sold INTEGER DEFAULT 0,              -- Total tickets sold
    gross_revenue DECIMAL(12, 2) DEFAULT 0,            -- Gross ticket revenue
    attendance_count INTEGER,                          -- Actual attendance
    no_show_count INTEGER DEFAULT 0,                   -- Number of no-shows
    
    -- Rating and feedback
    average_rating DECIMAL(3, 2),                      -- Average attendee rating
    total_reviews INTEGER DEFAULT 0,                   -- Total number of reviews
    would_recommend_percentage DECIMAL(5, 2),          -- Recommendation percentage
    
    -- Event logistics
    setup_start_time TIMESTAMPTZ,                      -- Setup start time
    breakdown_end_time TIMESTAMPTZ,                    -- Breakdown completion time
    load_in_instructions TEXT,                         -- Load-in instructions
    load_out_instructions TEXT,                        -- Load-out instructions
    
    -- Cancellation and refund policy
    cancellation_policy TEXT,                          -- Cancellation policy
    refund_policy TEXT,                                -- Refund policy
    force_majeure_policy TEXT,                         -- Force majeure policy
    last_cancellation_date DATE,                       -- Last date for cancellation
    
    -- External references
    external_event_id VARCHAR(100),                    -- External system event ID
    ticketing_system_id VARCHAR(100),                  -- External ticketing system ID
    third_party_urls JSONB DEFAULT '{}',               -- Third-party platform URLs
    
    -- SEO and metadata
    meta_title VARCHAR(200),                           -- SEO meta title
    meta_description TEXT,                             -- SEO meta description
    meta_keywords VARCHAR(500),                        -- SEO keywords
    structured_data JSONB,                             -- Schema.org structured data
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Event creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Last update timestamp
    created_by_user_id UUID,                           -- User who created event
    updated_by_user_id UUID,                           -- User who last updated event
    published_at TIMESTAMPTZ,                          -- Event publication timestamp
    published_by_user_id UUID,                         -- User who published event
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,                            -- Soft delete timestamp
    deleted_by_user_id UUID,                           -- User who deleted event
    deletion_reason TEXT,                              -- Reason for deletion
    
    -- Constraints
    CONSTRAINT events_valid_capacity CHECK (
        max_capacity IS NULL OR 
        expected_attendance IS NULL OR 
        expected_attendance <= max_capacity
    ),
    CONSTRAINT events_valid_price_range CHECK (
        price_range_min IS NULL OR 
        price_range_max IS NULL OR 
        price_range_min <= price_range_max
    ),
    CONSTRAINT events_valid_ticket_sales CHECK (
        ticket_sales_start IS NULL OR 
        ticket_sales_end IS NULL OR 
        ticket_sales_start <= ticket_sales_end
    ),
    CONSTRAINT events_valid_timing CHECK (
        doors_open_time IS NULL OR 
        show_start_time IS NULL OR 
        doors_open_time <= show_start_time
    ),
    CONSTRAINT events_valid_session_count CHECK (session_count > 0),
    CONSTRAINT events_valid_totals CHECK (
        total_tickets_sold >= 0 AND
        gross_revenue >= 0 AND
        (attendance_count IS NULL OR attendance_count >= 0) AND
        no_show_count >= 0 AND
        total_reviews >= 0
    ),
    CONSTRAINT events_valid_rating CHECK (
        average_rating IS NULL OR 
        (average_rating >= 0 AND average_rating <= 5)
    )
);

-- =====================================================
-- EVENT_PERFORMERS TABLE
-- =====================================================
-- Track performers, artists, and lineup for events
CREATE TABLE IF NOT EXISTS event_performers (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Event association
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Performer identification
    performer_name VARCHAR(200) NOT NULL,               -- Performer/artist name
    performer_type performer_type NOT NULL,             -- Type of performer
    stage_name VARCHAR(200),                            -- Stage/performance name
    
    -- Performer details
    performer_description TEXT,                         -- Performer bio/description
    performer_genre VARCHAR(100),                       -- Musical/performance genre
    performer_website TEXT,                            -- Performer website
    performer_social_media JSONB DEFAULT '{}',         -- Social media links
    
    -- Performance scheduling
    performance_order INTEGER NOT NULL DEFAULT 1,       -- Order in lineup (1 = first)
    set_duration INTERVAL,                              -- Performance set duration
    scheduled_start_time TIME,                          -- Scheduled start time
    scheduled_end_time TIME,                            -- Scheduled end time
    
    -- Performance details
    song_list TEXT[],                                   -- Song list/setlist
    special_notes TEXT,                                 -- Special performance notes
    technical_rider_url TEXT,                          -- Technical rider document
    hospitality_rider_url TEXT,                        -- Hospitality rider document
    
    -- Performer media
    performer_image_url TEXT,                           -- Performer photo
    promotional_images JSONB DEFAULT '[]',             -- Additional promo images
    
    -- Performance status
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,           -- Performance confirmed
    featured BOOLEAN NOT NULL DEFAULT FALSE,            -- Featured performer
    headliner BOOLEAN NOT NULL DEFAULT FALSE,           -- Is headlining act
    
    -- Financial information
    performance_fee DECIMAL(10, 2),                    -- Performance fee
    expense_budget DECIMAL(10, 2),                     -- Expense budget
    payment_terms TEXT,                                -- Payment terms
    contract_signed BOOLEAN NOT NULL DEFAULT FALSE,     -- Contract executed
    
    -- Contact information
    contact_name VARCHAR(200),                          -- Primary contact name
    contact_email VARCHAR(320),                        -- Contact email
    contact_phone VARCHAR(20),                          -- Contact phone
    agent_name VARCHAR(200),                           -- Agent/manager name
    agent_contact VARCHAR(320),                        -- Agent contact info
    
    -- Performance requirements
    equipment_requirements TEXT,                        -- Equipment needs
    backstage_requirements TEXT,                        -- Backstage needs
    catering_requirements TEXT,                         -- Catering requirements
    transportation_needs TEXT,                          -- Transportation needs
    accommodation_needs TEXT,                           -- Hotel/accommodation needs
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT event_performers_valid_order CHECK (performance_order > 0),
    CONSTRAINT event_performers_valid_fees CHECK (
        (performance_fee IS NULL OR performance_fee >= 0) AND
        (expense_budget IS NULL OR expense_budget >= 0)
    ),
    CONSTRAINT event_performers_valid_times CHECK (
        scheduled_end_time IS NULL OR 
        scheduled_start_time IS NULL OR 
        scheduled_end_time > scheduled_start_time
    )
);

-- =====================================================
-- EVENT_SESSIONS TABLE
-- =====================================================
-- Support for multi-session events (conferences, festivals, etc.)
CREATE TABLE IF NOT EXISTS event_sessions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Event association
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Session identification
    session_name VARCHAR(200) NOT NULL,                 -- Session name/title
    session_description TEXT,                           -- Session description
    session_type VARCHAR(100),                          -- Session type
    session_track VARCHAR(100),                         -- Session track/category
    
    -- Session scheduling
    session_date DATE NOT NULL,                         -- Session date
    start_time TIME NOT NULL,                           -- Session start time
    end_time TIME NOT NULL,                             -- Session end time
    duration INTERVAL,                                  -- Session duration
    
    -- Session location
    room_name VARCHAR(100),                             -- Room/stage name
    room_capacity INTEGER,                              -- Room capacity
    room_location TEXT,                                 -- Room location details
    
    -- Session content
    learning_objectives TEXT[],                         -- Learning objectives
    session_materials JSONB DEFAULT '[]',              -- Session materials/links
    presentation_url TEXT,                              -- Presentation slides URL
    recording_url TEXT,                                 -- Session recording URL
    
    -- Session requirements
    equipment_needed TEXT[],                            -- Required equipment
    special_setup TEXT,                                 -- Special setup requirements
    accessibility_notes TEXT,                           -- Accessibility information
    
    -- Session status
    is_keynote BOOLEAN NOT NULL DEFAULT FALSE,          -- Keynote session
    requires_registration BOOLEAN NOT NULL DEFAULT FALSE, -- Separate registration
    max_attendees INTEGER,                              -- Maximum attendees
    current_registrations INTEGER DEFAULT 0,            -- Current registrations
    
    -- Session rating
    average_rating DECIMAL(3, 2),                      -- Session rating
    total_ratings INTEGER DEFAULT 0,                   -- Number of ratings
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT event_sessions_valid_times CHECK (end_time > start_time),
    CONSTRAINT event_sessions_valid_capacity CHECK (
        room_capacity IS NULL OR room_capacity > 0
    ),
    CONSTRAINT event_sessions_valid_registrations CHECK (
        current_registrations >= 0 AND
        (max_attendees IS NULL OR current_registrations <= max_attendees)
    ),
    CONSTRAINT event_sessions_valid_rating CHECK (
        average_rating IS NULL OR 
        (average_rating >= 0 AND average_rating <= 5)
    )
);

-- =====================================================
-- EVENT_PRODUCTION_SCHEDULES TABLE
-- =====================================================
-- Track production schedules and crew assignments
CREATE TABLE IF NOT EXISTS event_production_schedules (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Event association
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Schedule identification
    schedule_name VARCHAR(200) NOT NULL,                -- Schedule item name
    schedule_type VARCHAR(100) NOT NULL,                -- Schedule type
    schedule_description TEXT,                          -- Schedule description
    
    -- Timing
    scheduled_date DATE NOT NULL,                       -- Schedule date
    start_time TIME NOT NULL,                           -- Start time
    end_time TIME,                                      -- End time
    estimated_duration INTERVAL,                       -- Estimated duration
    
    -- Assignment
    assigned_to VARCHAR(200),                           -- Assigned person/team
    crew_required INTEGER,                              -- Number of crew needed
    equipment_needed TEXT[],                            -- Required equipment
    
    -- Status and notes
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,         -- Critical timeline item
    completion_status VARCHAR(50) DEFAULT 'pending',    -- Completion status
    notes TEXT,                                         -- Additional notes
    
    -- Dependencies
    depends_on UUID[],                                  -- Dependent schedule items
    blocks UUID[],                                      -- Items this blocks
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT event_production_valid_times CHECK (
        end_time IS NULL OR end_time > start_time
    ),
    CONSTRAINT event_production_valid_crew CHECK (crew_required IS NULL OR crew_required >= 0)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for events
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(event_category);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(event_status);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(event_slug) WHERE deleted_at IS NULL;

-- Event date and time indexes
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_datetime ON events(event_datetime) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_upcoming ON events(event_date, event_status) 
    WHERE event_date >= CURRENT_DATE AND deleted_at IS NULL;

-- Event visibility and features
CREATE INDEX IF NOT EXISTS idx_events_public ON events(is_public, event_status) WHERE is_public = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_featured ON events(is_featured, event_date) WHERE is_featured = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_published ON events(published_at) WHERE published_at IS NOT NULL;

-- Ticket sales indexes
CREATE INDEX IF NOT EXISTS idx_events_ticket_sales ON events(ticket_sales_start, ticket_sales_end) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_on_sale ON events(venue_id, event_status, ticket_sales_start, ticket_sales_end) 
    WHERE event_status = 'on_sale' AND deleted_at IS NULL;

-- Search and filtering indexes
CREATE INDEX IF NOT EXISTS idx_events_tags ON events USING gin(event_tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_subcategories ON events USING gin(event_subcategories) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_genre ON events(genre) WHERE genre IS NOT NULL AND deleted_at IS NULL;

-- Age and content indexes
CREATE INDEX IF NOT EXISTS idx_events_age_restriction ON events(age_restriction) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_content_rating ON events(content_rating) WHERE deleted_at IS NULL;

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_events_attendance ON events(attendance_count) WHERE attendance_count IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_revenue ON events(gross_revenue) WHERE gross_revenue > 0;
CREATE INDEX IF NOT EXISTS idx_events_rating ON events(average_rating) WHERE average_rating IS NOT NULL;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_events_search ON events USING gin(
    to_tsvector('english', event_name || ' ' || COALESCE(short_description, '') || ' ' || COALESCE(organizer_name, ''))
) WHERE deleted_at IS NULL;

-- Event performers indexes
CREATE INDEX IF NOT EXISTS idx_event_performers_event_id ON event_performers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_performers_type ON event_performers(performer_type);
CREATE INDEX IF NOT EXISTS idx_event_performers_order ON event_performers(event_id, performance_order);
CREATE INDEX IF NOT EXISTS idx_event_performers_featured ON event_performers(featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_event_performers_headliner ON event_performers(headliner) WHERE headliner = TRUE;

-- Event sessions indexes
CREATE INDEX IF NOT EXISTS idx_event_sessions_event_id ON event_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_date ON event_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_event_sessions_time ON event_sessions(session_date, start_time);
CREATE INDEX IF NOT EXISTS idx_event_sessions_track ON event_sessions(session_track) WHERE session_track IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_sessions_keynote ON event_sessions(is_keynote) WHERE is_keynote = TRUE;

-- Production schedule indexes
CREATE INDEX IF NOT EXISTS idx_event_production_event_id ON event_production_schedules(event_id);
CREATE INDEX IF NOT EXISTS idx_event_production_date ON event_production_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_event_production_critical ON event_production_schedules(is_critical) WHERE is_critical = TRUE;
CREATE INDEX IF NOT EXISTS idx_event_production_status ON event_production_schedules(completion_status);

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to update event metadata
CREATE OR REPLACE FUNCTION update_event_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Auto-generate slug if not provided
    IF NEW.event_slug IS NULL OR NEW.event_slug = '' THEN
        NEW.event_slug = lower(regexp_replace(NEW.event_name, '[^a-zA-Z0-9]+', '-', 'g'));
        NEW.event_slug = trim(NEW.event_slug, '-');
        
        -- Ensure uniqueness
        WHILE EXISTS (SELECT 1 FROM events WHERE event_slug = NEW.event_slug AND id != NEW.id) LOOP
            NEW.event_slug = NEW.event_slug || '-' || floor(random() * 1000)::text;
        END LOOP;
    END IF;
    
    -- Combine date and time into datetime
    IF NEW.event_date IS NOT NULL AND NEW.event_time IS NOT NULL THEN
        NEW.event_datetime = (NEW.event_date || ' ' || NEW.event_time)::TIMESTAMP AT TIME ZONE COALESCE(NEW.event_timezone, 'UTC');
    END IF;
    
    -- Calculate estimated end time
    IF NEW.show_start_time IS NOT NULL AND NEW.estimated_duration IS NOT NULL THEN
        NEW.estimated_end_time = NEW.show_start_time + NEW.estimated_duration;
    END IF;
    
    -- Set publication timestamp
    IF OLD.event_status != 'published' AND NEW.event_status = 'published' AND NEW.published_at IS NULL THEN
        NEW.published_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update performer order
CREATE OR REPLACE FUNCTION update_performer_order()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Set headliner flag based on performer type
    IF NEW.performer_type = 'headliner' THEN
        NEW.headliner = TRUE;
        NEW.featured = TRUE;
    ELSIF NEW.performer_type IN ('co_headliner', 'special_guest') THEN
        NEW.featured = TRUE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate session duration
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Calculate duration from start and end times
    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        NEW.duration = NEW.end_time - NEW.start_time;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_event_metadata_update ON events;
CREATE TRIGGER trigger_event_metadata_update
    BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_event_metadata();

DROP TRIGGER IF EXISTS trigger_performer_order_update ON event_performers;
CREATE TRIGGER trigger_performer_order_update
    BEFORE INSERT OR UPDATE ON event_performers
    FOR EACH ROW
    EXECUTE FUNCTION update_performer_order();

DROP TRIGGER IF EXISTS trigger_session_duration_calculation ON event_sessions;
CREATE TRIGGER trigger_session_duration_calculation
    BEFORE INSERT OR UPDATE ON event_sessions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_session_duration();

-- =====================================================
-- EVENT MANAGEMENT HELPER FUNCTIONS
-- =====================================================

-- Function to create a new event
CREATE OR REPLACE FUNCTION create_event(
    p_venue_id UUID,
    p_event_name VARCHAR(300),
    p_event_category event_category,
    p_event_date DATE,
    p_event_time TIME DEFAULT NULL,
    p_short_description TEXT DEFAULT NULL,
    p_organizer_name VARCHAR(200) DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_event_id UUID;
BEGIN
    INSERT INTO events (
        venue_id, event_name, event_category, event_date, event_time,
        short_description, organizer_name, created_by_user_id
    )
    VALUES (
        p_venue_id, p_event_name, p_event_category, p_event_date, p_event_time,
        p_short_description, p_organizer_name, p_created_by_user_id
    )
    RETURNING id INTO new_event_id;
    
    RETURN new_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add performer to event
CREATE OR REPLACE FUNCTION add_event_performer(
    p_event_id UUID,
    p_performer_name VARCHAR(200),
    p_performer_type performer_type,
    p_performance_order INTEGER DEFAULT NULL,
    p_performance_fee DECIMAL(10, 2) DEFAULT NULL,
    p_set_duration INTERVAL DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_performer_id UUID;
    next_order INTEGER;
BEGIN
    -- Calculate next performance order if not provided
    IF p_performance_order IS NULL THEN
        SELECT COALESCE(MAX(performance_order), 0) + 1 INTO next_order
        FROM event_performers
        WHERE event_id = p_event_id;
    ELSE
        next_order = p_performance_order;
    END IF;
    
    INSERT INTO event_performers (
        event_id, performer_name, performer_type, performance_order,
        performance_fee, set_duration, created_by_user_id
    )
    VALUES (
        p_event_id, p_performer_name, p_performer_type, next_order,
        p_performance_fee, p_set_duration, p_created_by_user_id
    )
    RETURNING id INTO new_performer_id;
    
    RETURN new_performer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get upcoming events
CREATE OR REPLACE FUNCTION get_upcoming_events(
    p_venue_id UUID DEFAULT NULL,
    p_category event_category DEFAULT NULL,
    p_days_ahead INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR(300),
    event_category event_category,
    event_date DATE,
    event_time TIME,
    venue_id UUID,
    event_status event_status,
    total_tickets_sold INTEGER,
    headliner_name VARCHAR(200)
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.event_name, e.event_category, e.event_date, e.event_time,
           e.venue_id, e.event_status, e.total_tickets_sold,
           ep.performer_name as headliner_name
    FROM events e
    LEFT JOIN event_performers ep ON e.id = ep.event_id AND ep.headliner = TRUE
    WHERE e.deleted_at IS NULL
    AND e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * p_days_ahead
    AND (p_venue_id IS NULL OR e.venue_id = p_venue_id)
    AND (p_category IS NULL OR e.event_category = p_category)
    AND e.event_status IN ('published', 'on_sale', 'sold_out')
    ORDER BY e.event_date, e.event_time
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search events
CREATE OR REPLACE FUNCTION search_events(
    p_search_text TEXT,
    p_venue_id UUID DEFAULT NULL,
    p_category event_category DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date DATE DEFAULT NULL,
    p_age_restriction age_restriction DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR(300),
    event_slug VARCHAR(300),
    event_category event_category,
    event_date DATE,
    event_time TIME,
    venue_id UUID,
    short_description TEXT,
    primary_image_url TEXT,
    price_range_min DECIMAL(10, 2),
    price_range_max DECIMAL(10, 2),
    relevance_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.event_name, e.event_slug, e.event_category, e.event_date, e.event_time,
           e.venue_id, e.short_description, e.primary_image_url, e.price_range_min, e.price_range_max,
           ts_rank(to_tsvector('english', e.event_name || ' ' || COALESCE(e.short_description, '') || ' ' || COALESCE(e.organizer_name, '')), 
                   plainto_tsquery('english', p_search_text)) as relevance_score
    FROM events e
    WHERE e.deleted_at IS NULL
    AND e.is_public = TRUE
    AND e.event_status IN ('published', 'on_sale', 'sold_out')
    AND to_tsvector('english', e.event_name || ' ' || COALESCE(e.short_description, '') || ' ' || COALESCE(e.organizer_name, '')) 
        @@ plainto_tsquery('english', p_search_text)
    AND (p_venue_id IS NULL OR e.venue_id = p_venue_id)
    AND (p_category IS NULL OR e.event_category = p_category)
    AND e.event_date >= p_start_date
    AND (p_end_date IS NULL OR e.event_date <= p_end_date)
    AND (p_age_restriction IS NULL OR e.age_restriction = p_age_restriction)
    ORDER BY relevance_score DESC, e.event_date
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get event details with performers
CREATE OR REPLACE FUNCTION get_event_details(p_event_id UUID)
RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR(300),
    event_category event_category,
    event_date DATE,
    event_time TIME,
    venue_id UUID,
    full_description TEXT,
    event_status event_status,
    age_restriction age_restriction,
    price_range_min DECIMAL(10, 2),
    price_range_max DECIMAL(10, 2),
    performers JSONB,
    sessions JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.event_name, e.event_category, e.event_date, e.event_time,
           e.venue_id, e.full_description, e.event_status, e.age_restriction,
           e.price_range_min, e.price_range_max,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'performer_name', ep.performer_name,
                       'performer_type', ep.performer_type,
                       'performance_order', ep.performance_order,
                       'headliner', ep.headliner,
                       'set_duration', ep.set_duration
                   ) ORDER BY ep.performance_order
               ) FROM event_performers ep WHERE ep.event_id = e.id),
               '[]'::jsonb
           ) as performers,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'session_name', es.session_name,
                       'session_date', es.session_date,
                       'start_time', es.start_time,
                       'end_time', es.end_time,
                       'room_name', es.room_name
                   ) ORDER BY es.session_date, es.start_time
               ) FROM event_sessions es WHERE es.event_id = e.id),
               '[]'::jsonb
           ) as sessions
    FROM events e
    WHERE e.id = p_event_id
    AND e.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to update event status
CREATE OR REPLACE FUNCTION update_event_status(
    p_event_id UUID,
    p_new_status event_status,
    p_updated_by_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE events
    SET event_status = p_new_status,
        updated_by_user_id = p_updated_by_user_id,
        updated_at = NOW(),
        published_at = CASE WHEN p_new_status = 'published' AND published_at IS NULL THEN NOW() ELSE published_at END,
        published_by_user_id = CASE WHEN p_new_status = 'published' AND published_by_user_id IS NULL THEN p_updated_by_user_id ELSE published_by_user_id END
    WHERE id = p_event_id
    AND deleted_at IS NULL;
    
    -- Log status change if audit function exists
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_audit_event') THEN
        PERFORM log_audit_event(
            p_updated_by_user_id,
            'event_management'::audit_category,
            'update'::audit_action,
            'event',
            p_event_id::text,
            NULL,
            'Event status changed to ' || p_new_status::text,
            NULL,
            jsonb_build_object('new_status', p_new_status, 'reason', p_reason),
            'info'::audit_severity
        );
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get event statistics
CREATE OR REPLACE FUNCTION get_event_statistics(
    p_venue_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    total_events BIGINT,
    completed_events BIGINT,
    cancelled_events BIGINT,
    total_attendance BIGINT,
    total_revenue DECIMAL(12, 2),
    average_rating DECIMAL(3, 2),
    events_by_category JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE event_status = 'completed') as completed_events,
        COUNT(*) FILTER (WHERE event_status = 'cancelled') as cancelled_events,
        COALESCE(SUM(attendance_count), 0) as total_attendance,
        COALESCE(SUM(gross_revenue), 0) as total_revenue,
        AVG(average_rating) as average_rating,
        (SELECT jsonb_object_agg(event_category, cnt) 
         FROM (SELECT event_category, COUNT(*) as cnt 
               FROM events 
               WHERE deleted_at IS NULL 
               AND (p_venue_id IS NULL OR venue_id = p_venue_id)
               AND event_date BETWEEN p_start_date AND p_end_date
               GROUP BY event_category) t) as events_by_category
    FROM events
    WHERE deleted_at IS NULL
    AND (p_venue_id IS NULL OR venue_id = p_venue_id)
    AND event_date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to duplicate event (for recurring events)
CREATE OR REPLACE FUNCTION duplicate_event(
    p_source_event_id UUID,
    p_new_event_date DATE,
    p_new_event_time TIME DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_event_id UUID;
    source_event RECORD;
    performer_record RECORD;
    session_record RECORD;
BEGIN
    -- Get source event details
    SELECT * INTO source_event FROM events WHERE id = p_source_event_id;
    
    -- Create new event
    INSERT INTO events (
        venue_id, event_name, event_category, event_date, event_time,
        short_description, full_description, event_subcategories, event_tags,
        genre, doors_open_time, show_start_time, estimated_duration,
        age_restriction, content_rating, content_warnings, accessibility_info,
        expected_attendance, max_capacity, venue_layout_id, seating_configuration,
        base_ticket_price, price_range_min, price_range_max,
        organizer_name, organizer_contact_email, organizer_contact_phone,
        promotional_text, marketing_copy, hashtags, social_media_links,
        primary_image_url, poster_image_url, banner_image_url,
        is_outdoor_event, weather_dependent, rain_policy,
        special_requirements, production_notes, catering_requirements,
        technical_requirements, security_requirements,
        cancellation_policy, refund_policy, force_majeure_policy,
        meta_title, meta_description, meta_keywords,
        created_by_user_id
    )
    SELECT 
        venue_id, event_name || ' - ' || p_new_event_date, event_category, 
        p_new_event_date, COALESCE(p_new_event_time, event_time),
        short_description, full_description, event_subcategories, event_tags,
        genre, doors_open_time, show_start_time, estimated_duration,
        age_restriction, content_rating, content_warnings, accessibility_info,
        expected_attendance, max_capacity, venue_layout_id, seating_configuration,
        base_ticket_price, price_range_min, price_range_max,
        organizer_name, organizer_contact_email, organizer_contact_phone,
        promotional_text, marketing_copy, hashtags, social_media_links,
        primary_image_url, poster_image_url, banner_image_url,
        is_outdoor_event, weather_dependent, rain_policy,
        special_requirements, production_notes, catering_requirements,
        technical_requirements, security_requirements,
        cancellation_policy, refund_policy, force_majeure_policy,
        meta_title, meta_description, meta_keywords,
        p_created_by_user_id
    FROM events
    WHERE id = p_source_event_id
    RETURNING id INTO new_event_id;
    
    -- Copy performers
    FOR performer_record IN
        SELECT * FROM event_performers WHERE event_id = p_source_event_id
    LOOP
        INSERT INTO event_performers (
            event_id, performer_name, performer_type, stage_name,
            performer_description, performer_genre, performance_order,
            set_duration, performance_fee, contact_name, contact_email,
            equipment_requirements, backstage_requirements,
            created_by_user_id
        )
        VALUES (
            new_event_id, performer_record.performer_name, performer_record.performer_type,
            performer_record.stage_name, performer_record.performer_description,
            performer_record.performer_genre, performer_record.performance_order,
            performer_record.set_duration, performer_record.performance_fee,
            performer_record.contact_name, performer_record.contact_email,
            performer_record.equipment_requirements, performer_record.backstage_requirements,
            p_created_by_user_id
        );
    END LOOP;
    
    -- Copy sessions (update session date to match new event date)
    FOR session_record IN
        SELECT * FROM event_sessions WHERE event_id = p_source_event_id
    LOOP
        INSERT INTO event_sessions (
            event_id, session_name, session_description, session_type,
            session_track, session_date, start_time, end_time,
            room_name, room_capacity, learning_objectives,
            equipment_needed, special_setup, max_attendees,
            created_by_user_id
        )
        VALUES (
            new_event_id, session_record.session_name, session_record.session_description,
            session_record.session_type, session_record.session_track,
            p_new_event_date, session_record.start_time, session_record.end_time,
            session_record.room_name, session_record.room_capacity,
            session_record.learning_objectives, session_record.equipment_needed,
            session_record.special_setup, session_record.max_attendees,
            p_created_by_user_id
        );
    END LOOP;
    
    RETURN new_event_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE events IS 'Master events table with comprehensive event information and scheduling';
COMMENT ON TABLE event_performers IS 'Event performer and artist lineup management with contract details';
COMMENT ON TABLE event_sessions IS 'Multi-session event support for conferences, festivals, and workshops';
COMMENT ON TABLE event_production_schedules IS 'Production timeline and crew scheduling for events';

-- Events table comments
COMMENT ON COLUMN events.event_slug IS 'URL-friendly identifier: auto-generated from event name for web URLs';
COMMENT ON COLUMN events.event_datetime IS 'Combined timestamp: event date and time with timezone support';
COMMENT ON COLUMN events.venue_layout_id IS 'Layout reference: specific venue layout configuration for this event';
COMMENT ON COLUMN events.recurrence_pattern IS 'Recurrence rules: JSON configuration for recurring events';
COMMENT ON COLUMN events.content_warnings IS 'Content warnings: array of warning tags for sensitive content';
COMMENT ON COLUMN events.structured_data IS 'SEO metadata: Schema.org structured data for search engines';

-- Event performers table comments
COMMENT ON COLUMN event_performers.performance_order IS 'Lineup order: performance sequence (1 = first, higher = later)';
COMMENT ON COLUMN event_performers.technical_rider_url IS 'Technical requirements: link to technical rider document';
COMMENT ON COLUMN event_performers.hospitality_rider_url IS 'Hospitality requirements: link to hospitality rider document';
COMMENT ON COLUMN event_performers.contract_signed IS 'Contract status: whether performance contract is executed';

-- Event sessions table comments
COMMENT ON COLUMN event_sessions.session_track IS 'Session grouping: thematic track or category for conferences';
COMMENT ON COLUMN event_sessions.learning_objectives IS 'Educational goals: array of learning outcomes for session';
COMMENT ON COLUMN event_sessions.requires_registration IS 'Registration required: separate registration beyond event ticket';

-- =====================================================
-- EVENTS SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive event management system with:
-- - 20 event categories covering all major event types
-- - Multi-performer lineup management with contract tracking
-- - Multi-session support for conferences and festivals
-- - Production scheduling and crew management
-- - Timezone-aware scheduling with flexible timing
-- - Comprehensive content classification and age restrictions
-- - Marketing and promotional content management
-- - Advanced search and filtering capabilities
-- - Event duplication for recurring events
-- - Performance analytics and reporting
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_tenant_created ON events(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
