-- =====================================================
-- TicketToken Platform - Event Schedules Schema
-- Week 1, Day 4 Development
-- =====================================================
-- Description: Comprehensive event timing and scheduling with recurring patterns
-- Version: 1.0
-- Created: 2025-07-16 14:48:20
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For text search optimization

-- Create ENUM types for event schedule management
CREATE TYPE schedule_type AS ENUM (
    'single',               -- Single occurrence event
    'recurring',            -- Recurring event with pattern
    'multi_day',            -- Multi-day event (festival, conference)
    'tour',                 -- Tour with multiple venues
    'series',               -- Event series (season, program)
    'workshop_series',      -- Workshop or class series
    'seasonal',             -- Seasonal events (summer concerts)
    'special_run',          -- Limited run (theater production)
    'tournament',           -- Tournament or competition
    'residency'             -- Artist or performer residency
);

CREATE TYPE recurrence_pattern AS ENUM (
    'daily',                -- Every day
    'weekly',               -- Every week
    'bi_weekly',            -- Every two weeks
    'monthly',              -- Every month
    'quarterly',            -- Every quarter
    'semi_annually',        -- Twice per year
    'annually',             -- Once per year
    'weekdays',             -- Monday through Friday
    'weekends',             -- Saturday and Sunday
    'custom'                -- Custom pattern with cron-like rules
);

CREATE TYPE schedule_status AS ENUM (
    'draft',                -- Schedule in draft mode
    'tentative',            -- Tentatively scheduled
    'confirmed',            -- Schedule confirmed
    'published',            -- Schedule published to public
    'in_progress',          -- Event currently happening
    'completed',            -- Schedule completed
    'cancelled',            -- Schedule cancelled
    'postponed',            -- Schedule postponed
    'rescheduled',          -- Schedule changed to new time
    'on_hold'               -- Schedule temporarily on hold
);

CREATE TYPE activity_type AS ENUM (
    'setup',                -- Setup and preparation
    'sound_check',          -- Sound and technical check
    'rehearsal',            -- Rehearsal or run-through
    'doors_open',           -- Venue doors open
    'vip_meet_greet',       -- VIP meet and greet
    'opening_act',          -- Opening performance
    'main_event',           -- Main event or performance
    'intermission',         -- Break or intermission
    'set_break',            -- Set break between acts
    'encore',               -- Encore performance
    'autograph_session',    -- Post-event autograph session
    'after_party',          -- After-party event
    'cleanup',              -- Post-event cleanup
    'breakdown',            -- Equipment breakdown
    'load_out',             -- Load out equipment
    'other'                 -- Other activity type
);

-- =====================================================
-- EVENT_SCHEDULES TABLE
-- =====================================================
-- Master event scheduling with recurring patterns and timing
CREATE TABLE IF NOT EXISTS event_schedules (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Event association
    event_id UUID NOT NULL,                             -- Reference to events.id
    
    -- Schedule identification
    schedule_name VARCHAR(200),                         -- Schedule name/title
    schedule_description TEXT,                          -- Schedule description
    schedule_type schedule_type NOT NULL DEFAULT 'single',
    
    -- Basic timing
    start_datetime TIMESTAMPTZ NOT NULL,               -- Schedule start date/time
    end_datetime TIMESTAMPTZ,                          -- Schedule end date/time
    duration INTERVAL,                                 -- Total duration
    timezone VARCHAR(100) DEFAULT 'UTC',               -- Event timezone
    
    -- Recurring schedule configuration
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,       -- Schedule repeats
    recurrence_pattern recurrence_pattern,             -- Recurrence pattern
    recurrence_interval INTEGER DEFAULT 1,             -- Interval between recurrences
    recurrence_count INTEGER,                          -- Maximum number of occurrences
    recurrence_until TIMESTAMPTZ,                      -- End date for recurrence
    
    -- Custom recurrence rules (cron-like format)
    custom_recurrence_rule TEXT,                       -- Custom recurrence expression
    recurrence_days_of_week INTEGER[],                 -- Days of week (0=Sunday, 1=Monday, etc.)
    recurrence_days_of_month INTEGER[],                -- Days of month (1-31)
    recurrence_months INTEGER[],                       -- Months (1-12)
    recurrence_weeks_of_month INTEGER[],               -- Weeks of month (1-5, -1=last)
    
    -- Multi-day event configuration
    is_multi_day BOOLEAN NOT NULL DEFAULT FALSE,       -- Spans multiple days
    day_count INTEGER DEFAULT 1,                       -- Number of days
    daily_schedule JSONB DEFAULT '[]',                 -- Daily schedule configuration
    
    -- Tour configuration
    is_tour BOOLEAN NOT NULL DEFAULT FALSE,            -- Part of a tour
    tour_name VARCHAR(200),                            -- Tour name
    tour_stop_number INTEGER,                          -- Stop number in tour
    total_tour_stops INTEGER,                          -- Total stops in tour
    
    -- Venue and location
    venue_id UUID,                                     -- Primary venue (can be null for tours)
    venue_layout_id UUID,                             -- Specific layout for this schedule
    backup_venue_id UUID,                             -- Backup venue option
    
    -- Schedule status and visibility
    schedule_status schedule_status NOT NULL DEFAULT 'draft',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,          -- Visible to public
    publish_datetime TIMESTAMPTZ,                      -- When schedule was published
    
    -- Capacity and ticketing
    total_capacity INTEGER,                           -- Total capacity for schedule
    tickets_available INTEGER,                        -- Available tickets
    tickets_sold INTEGER DEFAULT 0,                   -- Tickets sold
    ticket_sales_start TIMESTAMPTZ,                   -- Ticket sales start
    ticket_sales_end TIMESTAMPTZ,                     -- Ticket sales end
    
    -- Pricing override
    base_price_override DECIMAL(10, 2),               -- Override base event price
    pricing_multiplier DECIMAL(4, 2) DEFAULT 1.0,     -- Price multiplier for this schedule
    dynamic_pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE, -- Enable dynamic pricing
    
    -- Weather and conditions
    weather_dependent BOOLEAN NOT NULL DEFAULT FALSE,  -- Depends on weather
    minimum_temperature DECIMAL(5, 2),                -- Minimum temperature requirement
    maximum_temperature DECIMAL(5, 2),                -- Maximum temperature requirement
    rain_contingency TEXT,                            -- Rain backup plan
    weather_buffer_hours INTEGER DEFAULT 2,           -- Hours before event to make weather decision
    
    -- Special requirements for this schedule
    special_requirements TEXT,                         -- Special setup requirements
    equipment_requirements JSONB DEFAULT '{}',        -- Equipment needed
    staffing_requirements JSONB DEFAULT '{}',         -- Staffing requirements
    catering_requirements TEXT,                        -- Catering needs
    security_requirements TEXT,                        -- Security needs
    
    -- Change tracking
    original_schedule_id UUID REFERENCES event_schedules(id), -- Original if rescheduled
    rescheduled_from_datetime TIMESTAMPTZ,            -- Original datetime if rescheduled
    reschedule_reason TEXT,                           -- Reason for rescheduling
    change_count INTEGER DEFAULT 0,                   -- Number of schedule changes
    last_change_datetime TIMESTAMPTZ,                 -- Last change timestamp
    
    -- External references
    external_calendar_id VARCHAR(200),                -- External calendar system ID
    booking_reference VARCHAR(100),                   -- Venue booking reference
    production_schedule_id VARCHAR(100),              -- Production schedule reference
    
    -- Notes and communication
    public_notes TEXT,                                -- Notes visible to public
    internal_notes TEXT,                              -- Internal notes for staff
    cancellation_policy TEXT,                         -- Cancellation policy for this schedule
    
    -- Analytics and performance
    actual_start_datetime TIMESTAMPTZ,                -- Actual start time
    actual_end_datetime TIMESTAMPTZ,                  -- Actual end time
    actual_attendance INTEGER,                        -- Actual attendance count
    no_show_count INTEGER DEFAULT 0,                  -- No-show count
    late_arrival_count INTEGER DEFAULT 0,             -- Late arrival count
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- Schedule creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- Last update timestamp
    created_by_user_id UUID,                         -- User who created schedule
    updated_by_user_id UUID,                         -- User who last updated schedule
    
    -- Constraints
    CONSTRAINT event_schedules_valid_datetime CHECK (end_datetime IS NULL OR end_datetime > start_datetime),
    CONSTRAINT event_schedules_valid_duration CHECK (
        duration IS NULL OR 
        (EXTRACT(EPOCH FROM duration) > 0 AND EXTRACT(EPOCH FROM duration) <= 86400 * 30) -- Max 30 days
    ),
    CONSTRAINT event_schedules_valid_recurrence CHECK (
        (NOT is_recurring) OR 
        (is_recurring AND recurrence_pattern IS NOT NULL)
    ),
    CONSTRAINT event_schedules_valid_multi_day CHECK (
        (NOT is_multi_day) OR 
        (is_multi_day AND day_count > 1)
    ),
    CONSTRAINT event_schedules_valid_tour CHECK (
        (NOT is_tour) OR 
        (is_tour AND tour_name IS NOT NULL AND tour_stop_number IS NOT NULL)
    ),
    CONSTRAINT event_schedules_valid_capacity CHECK (
        total_capacity IS NULL OR 
        (total_capacity > 0 AND tickets_sold <= total_capacity)
    ),
    CONSTRAINT event_schedules_valid_pricing CHECK (
        (base_price_override IS NULL OR base_price_override >= 0) AND
        pricing_multiplier > 0
    ),
    CONSTRAINT event_schedules_valid_temperature CHECK (
        minimum_temperature IS NULL OR 
        maximum_temperature IS NULL OR 
        minimum_temperature <= maximum_temperature
    ),
    CONSTRAINT event_schedules_valid_counts CHECK (
        tickets_sold >= 0 AND
        no_show_count >= 0 AND
        late_arrival_count >= 0 AND
        change_count >= 0
    )
);

-- =====================================================
-- SCHEDULE_ACTIVITIES TABLE
-- =====================================================
-- Track individual activities within an event schedule
CREATE TABLE IF NOT EXISTS schedule_activities (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Schedule association
    schedule_id UUID NOT NULL REFERENCES event_schedules(id) ON DELETE CASCADE,
    
    -- Activity identification
    activity_name VARCHAR(200) NOT NULL,               -- Activity name
    activity_type activity_type NOT NULL,              -- Type of activity
    activity_description TEXT,                         -- Activity description
    
    -- Activity timing
    scheduled_start_time TIMESTAMPTZ NOT NULL,         -- Scheduled start time
    scheduled_end_time TIMESTAMPTZ,                   -- Scheduled end time
    duration INTERVAL,                                 -- Activity duration
    
    -- Activity order and dependencies
    activity_order INTEGER NOT NULL DEFAULT 1,         -- Order within schedule
    depends_on_activity_id UUID REFERENCES schedule_activities(id), -- Dependency
    buffer_time_before INTERVAL DEFAULT INTERVAL '0 minutes', -- Buffer before activity
    buffer_time_after INTERVAL DEFAULT INTERVAL '0 minutes',  -- Buffer after activity
    
    -- Activity requirements
    required_staff INTEGER DEFAULT 0,                  -- Number of staff required
    required_equipment JSONB DEFAULT '[]',             -- Required equipment
    setup_time INTERVAL DEFAULT INTERVAL '0 minutes', -- Setup time required
    breakdown_time INTERVAL DEFAULT INTERVAL '0 minutes', -- Breakdown time required
    
    -- Location within venue
    activity_location VARCHAR(200),                    -- Location within venue
    room_or_area VARCHAR(100),                        -- Specific room or area
    capacity_limit INTEGER,                           -- Capacity limit for activity
    
    -- Activity status
    is_public BOOLEAN NOT NULL DEFAULT TRUE,           -- Visible to public
    is_optional BOOLEAN NOT NULL DEFAULT FALSE,        -- Activity is optional
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,        -- Critical to event success
    requires_ticket BOOLEAN NOT NULL DEFAULT FALSE,    -- Requires separate ticket
    
    -- Performer/participant information
    performer_id UUID,                                 -- Associated performer
    participant_limit INTEGER,                        -- Maximum participants
    current_participants INTEGER DEFAULT 0,            -- Current participant count
    
    -- Activity execution
    actual_start_time TIMESTAMPTZ,                    -- Actual start time
    actual_end_time TIMESTAMPTZ,                      -- Actual end time
    completion_status VARCHAR(50) DEFAULT 'pending',   -- Completion status
    completion_notes TEXT,                             -- Notes about completion
    
    -- Special requirements
    special_instructions TEXT,                         -- Special instructions
    accessibility_requirements TEXT,                   -- Accessibility needs
    equipment_setup_notes TEXT,                       -- Equipment setup notes
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT schedule_activities_valid_times CHECK (
        scheduled_end_time IS NULL OR 
        scheduled_end_time > scheduled_start_time
    ),
    CONSTRAINT schedule_activities_valid_order CHECK (activity_order > 0),
    CONSTRAINT schedule_activities_valid_capacity CHECK (
        capacity_limit IS NULL OR capacity_limit > 0
    ),
    CONSTRAINT schedule_activities_valid_participants CHECK (
        current_participants >= 0 AND
        (participant_limit IS NULL OR current_participants <= participant_limit)
    ),
    CONSTRAINT schedule_activities_no_self_dependency CHECK (depends_on_activity_id != id)
);

-- =====================================================
-- SCHEDULE_EXCEPTIONS TABLE
-- =====================================================
-- Track exceptions and blackout dates for recurring schedules
CREATE TABLE IF NOT EXISTS schedule_exceptions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Schedule association
    schedule_id UUID NOT NULL REFERENCES event_schedules(id) ON DELETE CASCADE,
    
    -- Exception identification
    exception_name VARCHAR(200),                       -- Exception name
    exception_type VARCHAR(100) NOT NULL,              -- Type of exception
    exception_reason TEXT,                             -- Reason for exception
    
    -- Exception date/time
    exception_date DATE NOT NULL,                      -- Date of exception
    start_time TIME,                                   -- Start time (if partial day)
    end_time TIME,                                     -- End time (if partial day)
    is_all_day BOOLEAN NOT NULL DEFAULT TRUE,          -- Exception applies to entire day
    
    -- Exception action
    action_type VARCHAR(50) NOT NULL DEFAULT 'cancel', -- Action (cancel, reschedule, modify)
    replacement_datetime TIMESTAMPTZ,                  -- Replacement time if rescheduled
    modification_details JSONB DEFAULT '{}',          -- Modification details
    
    -- Exception scope
    affects_all_activities BOOLEAN NOT NULL DEFAULT TRUE, -- Affects all activities
    affected_activity_ids UUID[],                      -- Specific affected activities
    
    -- Communication
    public_notice TEXT,                                -- Public notice about exception
    notification_sent BOOLEAN NOT NULL DEFAULT FALSE,  -- Notification sent to attendees
    notification_sent_at TIMESTAMPTZ,                 -- When notification was sent
    
    -- Approval workflow
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,  -- Exception requires approval
    approved_by_user_id UUID,                         -- User who approved exception
    approved_at TIMESTAMPTZ,                          -- Approval timestamp
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT schedule_exceptions_valid_times CHECK (
        is_all_day = TRUE OR 
        (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

-- =====================================================
-- SCHEDULE_CONFLICTS TABLE
-- =====================================================
-- Track scheduling conflicts and resolution
CREATE TABLE IF NOT EXISTS schedule_conflicts (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Conflicting schedules
    primary_schedule_id UUID NOT NULL REFERENCES event_schedules(id) ON DELETE CASCADE,
    conflicting_schedule_id UUID NOT NULL REFERENCES event_schedules(id) ON DELETE CASCADE,
    
    -- Conflict details
    conflict_type VARCHAR(100) NOT NULL,               -- Type of conflict
    conflict_description TEXT,                         -- Conflict description
    severity VARCHAR(20) DEFAULT 'medium',             -- Conflict severity
    
    -- Conflict timeframe
    conflict_start TIMESTAMPTZ NOT NULL,               -- Conflict start time
    conflict_end TIMESTAMPTZ NOT NULL,                 -- Conflict end time
    overlap_duration INTERVAL,                        -- Duration of overlap
    
    -- Conflict resources
    resource_type VARCHAR(100),                       -- Resource in conflict (venue, staff, equipment)
    resource_id VARCHAR(100),                         -- Specific resource ID
    resource_description TEXT,                        -- Resource description
    
    -- Resolution
    conflict_status VARCHAR(50) DEFAULT 'unresolved', -- Resolution status
    resolution_strategy VARCHAR(100),                 -- Resolution approach
    resolution_description TEXT,                      -- Resolution details
    resolved_at TIMESTAMPTZ,                         -- Resolution timestamp
    resolved_by_user_id UUID,                        -- User who resolved conflict
    
    -- Impact assessment
    business_impact VARCHAR(100),                     -- Business impact level
    customer_impact VARCHAR(100),                     -- Customer impact level
    financial_impact DECIMAL(10, 2),                 -- Estimated financial impact
    
    -- Communication
    stakeholders_notified BOOLEAN NOT NULL DEFAULT FALSE, -- Stakeholders notified
    public_communication_required BOOLEAN NOT NULL DEFAULT FALSE, -- Public communication needed
    communication_plan TEXT,                          -- Communication plan
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    detected_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT schedule_conflicts_valid_schedules CHECK (primary_schedule_id != conflicting_schedule_id),
    CONSTRAINT schedule_conflicts_valid_timeframe CHECK (conflict_end > conflict_start),
    CONSTRAINT schedule_conflicts_valid_financial_impact CHECK (
        financial_impact IS NULL OR financial_impact >= 0
    )
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for event_schedules
CREATE INDEX IF NOT EXISTS idx_event_schedules_event_id ON event_schedules(event_id);
CREATE INDEX IF NOT EXISTS idx_event_schedules_type ON event_schedules(schedule_type);
CREATE INDEX IF NOT EXISTS idx_event_schedules_status ON event_schedules(schedule_status);
CREATE INDEX IF NOT EXISTS idx_event_schedules_venue_id ON event_schedules(venue_id) WHERE venue_id IS NOT NULL;

-- Datetime and scheduling indexes
CREATE INDEX IF NOT EXISTS idx_event_schedules_start_datetime ON event_schedules(start_datetime);
CREATE INDEX IF NOT EXISTS idx_event_schedules_end_datetime ON event_schedules(end_datetime) WHERE end_datetime IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_schedules_timeframe ON event_schedules(start_datetime, end_datetime);

-- Recurring schedule indexes
CREATE INDEX IF NOT EXISTS idx_event_schedules_recurring ON event_schedules(is_recurring, recurrence_pattern) WHERE is_recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_event_schedules_recurrence_until ON event_schedules(recurrence_until) WHERE recurrence_until IS NOT NULL;

-- Public and published schedules
CREATE INDEX IF NOT EXISTS idx_event_schedules_public ON event_schedules(is_public, schedule_status) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_event_schedules_published ON event_schedules(publish_datetime) WHERE publish_datetime IS NOT NULL;

-- Tour and multi-day indexes
CREATE INDEX IF NOT EXISTS idx_event_schedules_tour ON event_schedules(is_tour, tour_name) WHERE is_tour = TRUE;
CREATE INDEX IF NOT EXISTS idx_event_schedules_multi_day ON event_schedules(is_multi_day, day_count) WHERE is_multi_day = TRUE;

-- Ticket sales indexes
CREATE INDEX IF NOT EXISTS idx_event_schedules_ticket_sales ON event_schedules(ticket_sales_start, ticket_sales_end);
CREATE INDEX IF NOT EXISTS idx_event_schedules_tickets_available ON event_schedules(tickets_available) WHERE tickets_available > 0;

-- Weather and conditions
CREATE INDEX IF NOT EXISTS idx_event_schedules_weather_dependent ON event_schedules(weather_dependent) WHERE weather_dependent = TRUE;

-- Schedule activities indexes
CREATE INDEX IF NOT EXISTS idx_schedule_activities_schedule_id ON schedule_activities(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_activities_type ON schedule_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_schedule_activities_order ON schedule_activities(schedule_id, activity_order);
CREATE INDEX IF NOT EXISTS idx_schedule_activities_start_time ON schedule_activities(scheduled_start_time);

-- Activity dependencies and timing
CREATE INDEX IF NOT EXISTS idx_schedule_activities_dependencies ON schedule_activities(depends_on_activity_id) WHERE depends_on_activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_activities_timeframe ON schedule_activities(scheduled_start_time, scheduled_end_time);
CREATE INDEX IF NOT EXISTS idx_schedule_activities_critical ON schedule_activities(is_critical) WHERE is_critical = TRUE;

-- Schedule exceptions indexes
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_schedule_id ON schedule_exceptions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON schedule_exceptions(exception_date);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_type ON schedule_exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_approval ON schedule_exceptions(requires_approval, approved_at);

-- Schedule conflicts indexes
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_primary_schedule ON schedule_conflicts(primary_schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_conflicting_schedule ON schedule_conflicts(conflicting_schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_timeframe ON schedule_conflicts(conflict_start, conflict_end);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_status ON schedule_conflicts(conflict_status);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_unresolved ON schedule_conflicts(conflict_status) WHERE conflict_status = 'unresolved';

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_schedules_venue_timeframe ON event_schedules(venue_id, start_datetime, end_datetime) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_schedules_public_upcoming ON event_schedules(is_public, start_datetime) 
    WHERE is_public = TRUE AND start_datetime > NOW();

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to update schedule metadata
CREATE OR REPLACE FUNCTION update_schedule_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Calculate duration if not provided
    IF NEW.duration IS NULL AND NEW.end_datetime IS NOT NULL THEN
        NEW.duration = NEW.end_datetime - NEW.start_datetime;
    END IF;
    
    -- Calculate end time if duration is provided but end time is not
    IF NEW.end_datetime IS NULL AND NEW.duration IS NOT NULL THEN
        NEW.end_datetime = NEW.start_datetime + NEW.duration;
    END IF;
    
    -- Set publish timestamp when status changes to published
    IF OLD.schedule_status != 'published' AND NEW.schedule_status = 'published' AND NEW.publish_datetime IS NULL THEN
        NEW.publish_datetime = NOW();
    END IF;
    
    -- Increment change count on updates
    IF TG_OP = 'UPDATE' AND (
        OLD.start_datetime != NEW.start_datetime OR 
        OLD.end_datetime IS DISTINCT FROM NEW.end_datetime
    ) THEN
        NEW.change_count = OLD.change_count + 1;
        NEW.last_change_datetime = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update activity timing
CREATE OR REPLACE FUNCTION update_activity_timing()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Calculate duration if not provided
    IF NEW.duration IS NULL AND NEW.scheduled_end_time IS NOT NULL THEN
        NEW.duration = NEW.scheduled_end_time - NEW.scheduled_start_time;
    END IF;
    
    -- Calculate end time if duration is provided but end time is not
    IF NEW.scheduled_end_time IS NULL AND NEW.duration IS NOT NULL THEN
        NEW.scheduled_end_time = NEW.scheduled_start_time + NEW.duration;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to detect schedule conflicts
CREATE OR REPLACE FUNCTION detect_schedule_conflicts()
RETURNS TRIGGER AS $$
DECLARE
    conflict_record RECORD;
    new_conflict_id UUID;
BEGIN
    -- Only check for conflicts if this is a venue-based event
    IF NEW.venue_id IS NOT NULL AND NEW.schedule_status NOT IN ('cancelled', 'completed') THEN
        
        -- Look for overlapping schedules at the same venue
        FOR conflict_record IN
            SELECT id, start_datetime, end_datetime, event_id
            FROM event_schedules
            WHERE id != NEW.id
            AND venue_id = NEW.venue_id
            AND schedule_status NOT IN ('cancelled', 'completed', 'draft')
            AND (
                (start_datetime <= NEW.start_datetime AND COALESCE(end_datetime, start_datetime + INTERVAL '4 hours') > NEW.start_datetime) OR
                (start_datetime < COALESCE(NEW.end_datetime, NEW.start_datetime + INTERVAL '4 hours') AND start_datetime >= NEW.start_datetime)
            )
        LOOP
            -- Create conflict record
            INSERT INTO schedule_conflicts (
                primary_schedule_id, conflicting_schedule_id, conflict_type,
                conflict_description, conflict_start, conflict_end,
                resource_type, resource_id, detected_by_user_id
            )
            VALUES (
                NEW.id, conflict_record.id, 'venue_double_booking',
                'Venue double booking detected between events',
                GREATEST(NEW.start_datetime, conflict_record.start_datetime),
                LEAST(COALESCE(NEW.end_datetime, NEW.start_datetime + INTERVAL '4 hours'), 
                      COALESCE(conflict_record.end_datetime, conflict_record.start_datetime + INTERVAL '4 hours')),
                'venue', NEW.venue_id::text, NEW.updated_by_user_id
            )
            ON CONFLICT DO NOTHING;  -- Avoid duplicate conflict records
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_schedule_metadata_update ON event_schedules;
CREATE TRIGGER trigger_schedule_metadata_update
    BEFORE INSERT OR UPDATE ON event_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_schedule_metadata();

DROP TRIGGER IF EXISTS trigger_activity_timing_update ON schedule_activities;
CREATE TRIGGER trigger_activity_timing_update
    BEFORE INSERT OR UPDATE ON schedule_activities
    FOR EACH ROW
    EXECUTE FUNCTION update_activity_timing();

DROP TRIGGER IF EXISTS trigger_schedule_conflict_detection ON event_schedules;
CREATE TRIGGER trigger_schedule_conflict_detection
    AFTER INSERT OR UPDATE ON event_schedules
    FOR EACH ROW
    EXECUTE FUNCTION detect_schedule_conflicts();

-- =====================================================
-- EVENT SCHEDULE HELPER FUNCTIONS
-- =====================================================

-- Function to create a new event schedule
CREATE OR REPLACE FUNCTION create_event_schedule(
    p_event_id UUID,
    p_start_datetime TIMESTAMPTZ,
    p_end_datetime TIMESTAMPTZ DEFAULT NULL,
    p_venue_id UUID DEFAULT NULL,
    p_schedule_type schedule_type DEFAULT 'single',
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_schedule_id UUID;
BEGIN
    INSERT INTO event_schedules (
        event_id, start_datetime, end_datetime, venue_id,
        schedule_type, created_by_user_id
    )
    VALUES (
        p_event_id, p_start_datetime, p_end_datetime, p_venue_id,
        p_schedule_type, p_created_by_user_id
    )
    RETURNING id INTO new_schedule_id;
    
    RETURN new_schedule_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add activity to schedule
CREATE OR REPLACE FUNCTION add_schedule_activity(
    p_schedule_id UUID,
    p_activity_name VARCHAR(200),
    p_activity_type activity_type,
    p_start_time TIMESTAMPTZ,
    p_duration INTERVAL DEFAULT NULL,
    p_activity_order INTEGER DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_activity_id UUID;
    next_order INTEGER;
BEGIN
    -- Calculate next activity order if not provided
    IF p_activity_order IS NULL THEN
        SELECT COALESCE(MAX(activity_order), 0) + 1 INTO next_order
        FROM schedule_activities
        WHERE schedule_id = p_schedule_id;
    ELSE
        next_order = p_activity_order;
    END IF;
    
    INSERT INTO schedule_activities (
        schedule_id, activity_name, activity_type, scheduled_start_time,
        duration, activity_order, created_by_user_id
    )
    VALUES (
        p_schedule_id, p_activity_name, p_activity_type, p_start_time,
        p_duration, next_order, p_created_by_user_id
    )
    RETURNING id INTO new_activity_id;
    
    RETURN new_activity_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create recurring schedule instances
CREATE OR REPLACE FUNCTION generate_recurring_schedule_instances(
    p_schedule_id UUID,
    p_max_instances INTEGER DEFAULT 52  -- Default to 1 year of weekly events
) RETURNS INTEGER AS $$
DECLARE
    schedule_record RECORD;
    instance_count INTEGER := 0;
    current_datetime TIMESTAMPTZ;
    end_datetime TIMESTAMPTZ;
    instance_number INTEGER := 1;
    new_schedule_id UUID;
BEGIN
    -- Get the master schedule details
    SELECT * INTO schedule_record
    FROM event_schedules
    WHERE id = p_schedule_id
    AND is_recurring = TRUE;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    current_datetime := schedule_record.start_datetime;
    
    -- Generate instances based on recurrence pattern
    WHILE instance_number <= COALESCE(schedule_record.recurrence_count, p_max_instances)
        AND (schedule_record.recurrence_until IS NULL OR current_datetime <= schedule_record.recurrence_until)
    LOOP
        -- Skip the first instance (it's the master schedule)
        IF instance_number > 1 THEN
            -- Calculate end datetime for this instance
            end_datetime := CASE 
                WHEN schedule_record.end_datetime IS NOT NULL THEN
                    current_datetime + (schedule_record.end_datetime - schedule_record.start_datetime)
                ELSE NULL
            END;
            
            -- Create schedule instance
            INSERT INTO event_schedules (
                event_id, start_datetime, end_datetime, venue_id,
                schedule_type, schedule_status, is_public, venue_layout_id,
                total_capacity, base_price_override, pricing_multiplier,
                weather_dependent, rain_contingency, special_requirements,
                original_schedule_id, created_by_user_id
            )
            VALUES (
                schedule_record.event_id, current_datetime, end_datetime, schedule_record.venue_id,
                'single', 'tentative', schedule_record.is_public, schedule_record.venue_layout_id,
                schedule_record.total_capacity, schedule_record.base_price_override, schedule_record.pricing_multiplier,
                schedule_record.weather_dependent, schedule_record.rain_contingency, schedule_record.special_requirements,
                p_schedule_id, schedule_record.created_by_user_id
            )
            RETURNING id INTO new_schedule_id;
            
            instance_count := instance_count + 1;
        END IF;
        
        -- Calculate next occurrence
        current_datetime := CASE schedule_record.recurrence_pattern
            WHEN 'daily' THEN current_datetime + INTERVAL '1 day' * schedule_record.recurrence_interval
            WHEN 'weekly' THEN current_datetime + INTERVAL '1 week' * schedule_record.recurrence_interval
            WHEN 'bi_weekly' THEN current_datetime + INTERVAL '2 weeks'
            WHEN 'monthly' THEN current_datetime + INTERVAL '1 month' * schedule_record.recurrence_interval
            WHEN 'quarterly' THEN current_datetime + INTERVAL '3 months' * schedule_record.recurrence_interval
            WHEN 'annually' THEN current_datetime + INTERVAL '1 year' * schedule_record.recurrence_interval
            ELSE current_datetime + INTERVAL '1 week'  -- Default fallback
        END;
        
        instance_number := instance_number + 1;
    END LOOP;
    
    RETURN instance_count;
END;
$$ LANGUAGE plpgsql;

-- Function to check for schedule conflicts
CREATE OR REPLACE FUNCTION check_schedule_conflicts(
    p_venue_id UUID,
    p_start_datetime TIMESTAMPTZ,
    p_end_datetime TIMESTAMPTZ,
    p_exclude_schedule_id UUID DEFAULT NULL
) RETURNS TABLE(
    conflicting_schedule_id UUID,
    event_name VARCHAR(300),
    conflict_start TIMESTAMPTZ,
    conflict_end TIMESTAMPTZ,
    overlap_hours DECIMAL(8, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT es.id, e.event_name,
           GREATEST(p_start_datetime, es.start_datetime) as conflict_start,
           LEAST(p_end_datetime, COALESCE(es.end_datetime, es.start_datetime + INTERVAL '4 hours')) as conflict_end,
           EXTRACT(EPOCH FROM (
               LEAST(p_end_datetime, COALESCE(es.end_datetime, es.start_datetime + INTERVAL '4 hours')) -
               GREATEST(p_start_datetime, es.start_datetime)
           )) / 3600.0 as overlap_hours
    FROM event_schedules es
    JOIN events e ON es.event_id = e.id
    WHERE es.venue_id = p_venue_id
    AND es.schedule_status NOT IN ('cancelled', 'completed')
    AND (p_exclude_schedule_id IS NULL OR es.id != p_exclude_schedule_id)
    AND (
        (es.start_datetime <= p_start_datetime AND COALESCE(es.end_datetime, es.start_datetime + INTERVAL '4 hours') > p_start_datetime) OR
        (es.start_datetime < p_end_datetime AND es.start_datetime >= p_start_datetime)
    )
    ORDER BY es.start_datetime;
END;
$$ LANGUAGE plpgsql;

-- Function to get upcoming schedules
CREATE OR REPLACE FUNCTION get_upcoming_schedules(
    p_venue_id UUID DEFAULT NULL,
    p_event_id UUID DEFAULT NULL,
    p_days_ahead INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    schedule_id UUID,
    event_id UUID,
    event_name VARCHAR(300),
    start_datetime TIMESTAMPTZ,
    end_datetime TIMESTAMPTZ,
    venue_id UUID,
    schedule_status schedule_status,
    tickets_available INTEGER,
    activity_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT es.id, es.event_id, e.event_name, es.start_datetime, es.end_datetime,
           es.venue_id, es.schedule_status, es.tickets_available,
           COALESCE(sa.activity_count, 0) as activity_count
    FROM event_schedules es
    JOIN events e ON es.event_id = e.id
    LEFT JOIN (
        SELECT schedule_id, COUNT(*) as activity_count
        FROM schedule_activities
        GROUP BY schedule_id
    ) sa ON es.id = sa.schedule_id
    WHERE es.start_datetime BETWEEN NOW() AND NOW() + INTERVAL '1 day' * p_days_ahead
    AND (p_venue_id IS NULL OR es.venue_id = p_venue_id)
    AND (p_event_id IS NULL OR es.event_id = p_event_id)
    AND es.schedule_status IN ('confirmed', 'published', 'tentative')
    ORDER BY es.start_datetime
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get schedule details with activities
CREATE OR REPLACE FUNCTION get_schedule_details(p_schedule_id UUID)
RETURNS TABLE(
    schedule_id UUID,
    event_id UUID,
    start_datetime TIMESTAMPTZ,
    end_datetime TIMESTAMPTZ,
    schedule_type schedule_type,
    schedule_status schedule_status,
    venue_id UUID,
    activities JSONB,
    conflicts JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT es.id, es.event_id, es.start_datetime, es.end_datetime,
           es.schedule_type, es.schedule_status, es.venue_id,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'activity_name', sa.activity_name,
                       'activity_type', sa.activity_type,
                       'scheduled_start_time', sa.scheduled_start_time,
                       'scheduled_end_time', sa.scheduled_end_time,
                       'activity_order', sa.activity_order,
                       'is_critical', sa.is_critical
                   ) ORDER BY sa.activity_order
               ) FROM schedule_activities sa WHERE sa.schedule_id = es.id),
               '[]'::jsonb
           ) as activities,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'conflict_type', sc.conflict_type,
                       'conflict_start', sc.conflict_start,
                       'conflict_end', sc.conflict_end,
                       'conflict_status', sc.conflict_status,
                       'severity', sc.severity
                   )
               ) FROM schedule_conflicts sc 
               WHERE sc.primary_schedule_id = es.id AND sc.conflict_status = 'unresolved'),
               '[]'::jsonb
           ) as conflicts
    FROM event_schedules es
    WHERE es.id = p_schedule_id;
END;
$$ LANGUAGE plpgsql;

-- Function to reschedule event
CREATE OR REPLACE FUNCTION reschedule_event_schedule(
    p_schedule_id UUID,
    p_new_start_datetime TIMESTAMPTZ,
    p_new_end_datetime TIMESTAMPTZ DEFAULT NULL,
    p_reschedule_reason TEXT DEFAULT NULL,
    p_updated_by_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    old_start_datetime TIMESTAMPTZ;
BEGIN
    -- Get current start datetime
    SELECT start_datetime INTO old_start_datetime
    FROM event_schedules
    WHERE id = p_schedule_id;
    
    -- Update the schedule
    UPDATE event_schedules
    SET start_datetime = p_new_start_datetime,
        end_datetime = p_new_end_datetime,
        schedule_status = 'rescheduled',
        rescheduled_from_datetime = old_start_datetime,
        reschedule_reason = p_reschedule_reason,
        updated_by_user_id = p_updated_by_user_id,
        updated_at = NOW()
    WHERE id = p_schedule_id;
    
    -- Update all activities to new timeline
    UPDATE schedule_activities
    SET scheduled_start_time = scheduled_start_time + (p_new_start_datetime - old_start_datetime),
        scheduled_end_time = CASE 
            WHEN scheduled_end_time IS NOT NULL 
            THEN scheduled_end_time + (p_new_start_datetime - old_start_datetime)
            ELSE NULL
        END
    WHERE schedule_id = p_schedule_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to add schedule exception
CREATE OR REPLACE FUNCTION add_schedule_exception(
    p_schedule_id UUID,
    p_exception_date DATE,
    p_exception_type VARCHAR(100),
    p_exception_reason TEXT DEFAULT NULL,
    p_action_type VARCHAR(50) DEFAULT 'cancel',
    p_replacement_datetime TIMESTAMPTZ DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_exception_id UUID;
BEGIN
    INSERT INTO schedule_exceptions (
        schedule_id, exception_date, exception_type, exception_reason,
        action_type, replacement_datetime, created_by_user_id
    )
    VALUES (
        p_schedule_id, p_exception_date, p_exception_type, p_exception_reason,
        p_action_type, p_replacement_datetime, p_created_by_user_id
    )
    RETURNING id INTO new_exception_id;
    
    RETURN new_exception_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE event_schedules IS 'Comprehensive event scheduling with recurring patterns and timing management';
COMMENT ON TABLE schedule_activities IS 'Individual activities and timeline components within event schedules';
COMMENT ON TABLE schedule_exceptions IS 'Exceptions and blackout dates for recurring event schedules';
COMMENT ON TABLE schedule_conflicts IS 'Schedule conflict detection and resolution tracking';

-- Event schedules table comments
COMMENT ON COLUMN event_schedules.schedule_type IS 'Schedule classification: single, recurring, multi-day, tour, series, etc.';
COMMENT ON COLUMN event_schedules.recurrence_pattern IS 'Recurrence frequency: daily, weekly, monthly, custom patterns';
COMMENT ON COLUMN event_schedules.custom_recurrence_rule IS 'Custom recurrence: cron-like expression for complex patterns';
COMMENT ON COLUMN event_schedules.daily_schedule IS 'Multi-day configuration: JSON array of daily schedule details';
COMMENT ON COLUMN event_schedules.weather_buffer_hours IS 'Weather decision timing: hours before event to make weather-related decisions';

-- Schedule activities table comments
COMMENT ON COLUMN schedule_activities.activity_type IS 'Activity classification: setup, doors_open, main_event, cleanup, etc.';
COMMENT ON COLUMN schedule_activities.depends_on_activity_id IS 'Activity dependency: previous activity that must complete first';
COMMENT ON COLUMN schedule_activities.buffer_time_before IS 'Schedule buffer: time buffer before activity starts';
COMMENT ON COLUMN schedule_activities.is_critical IS 'Critical activity: essential for event success and cannot be skipped';

-- Schedule exceptions table comments
COMMENT ON COLUMN schedule_exceptions.action_type IS 'Exception action: cancel, reschedule, or modify the affected occurrence';
COMMENT ON COLUMN schedule_exceptions.affects_all_activities IS 'Exception scope: whether exception applies to all activities or specific ones';
COMMENT ON COLUMN schedule_exceptions.public_notice IS 'Public communication: notice displayed to attendees about exception';

-- Schedule conflicts table comments
COMMENT ON COLUMN schedule_conflicts.conflict_type IS 'Conflict classification: venue double-booking, staff conflict, equipment conflict';
COMMENT ON COLUMN schedule_conflicts.severity IS 'Conflict importance: low, medium, high, critical impact level';
COMMENT ON COLUMN schedule_conflicts.resolution_strategy IS 'Resolution approach: reschedule, relocate, staff reassignment, etc.';

-- =====================================================
-- EVENT SCHEDULES SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive event scheduling system with:
-- - 10 schedule types including single, recurring, multi-day, tour
-- - Advanced recurrence patterns with custom rules support
-- - 16 activity types for complete event timeline management
-- - Exception handling for recurring schedules with blackout dates
-- - Conflict detection and resolution tracking
-- - Weather dependency and contingency planning
-- - Multi-day event support with daily schedule configuration
-- - Tour management with stop sequencing
-- - Comprehensive timing with buffer periods and dependencies
-- - Helper functions for schedule management and conflict resolution
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_event_schedules_tenant_id ON event_schedules(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_schedules_tenant_created ON event_schedules(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
