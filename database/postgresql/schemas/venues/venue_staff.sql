-- =====================================================
-- TicketToken Platform - Venue Staff Management Schema
-- Week 1, Day 2 Development
-- =====================================================
-- Description: Comprehensive venue staff management with roles, permissions, and scheduling
-- Version: 1.0
-- Created: 2025-07-16 14:27:02
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- For data encryption

-- Create ENUM types for venue staff management
CREATE TYPE staff_role AS ENUM (
    'owner',                -- Venue owner (highest authority)
    'general_manager',      -- General manager (full operational control)
    'assistant_manager',    -- Assistant manager (limited operational control)
    'event_coordinator',    -- Event planning and coordination
    'operations_manager',   -- Operations and logistics
    'security_supervisor', -- Security team supervisor
    'security_guard',       -- Security personnel
    'usher_supervisor',     -- Ushering team supervisor
    'usher',                -- Ushering staff
    'box_office_manager',   -- Box office supervisor
    'box_office_clerk',     -- Box office staff
    'maintenance_supervisor', -- Maintenance team supervisor
    'maintenance_staff',    -- Maintenance personnel
    'cleaning_supervisor',  -- Cleaning team supervisor
    'cleaning_staff',       -- Cleaning personnel
    'bartender',            -- Bar service staff
    'server',               -- Food service staff
    'technician',           -- Audio/visual technician
    'contractor',           -- External contractor
    'volunteer',            -- Volunteer staff
    'intern'                -- Intern/trainee
);

CREATE TYPE employment_status AS ENUM (
    'active',               -- Currently employed and working
    'inactive',             -- Temporarily inactive (leave, suspension)
    'terminated',           -- Employment terminated
    'pending',              -- Pending approval/onboarding
    'on_leave',            -- On approved leave
    'suspended',           -- Suspended pending investigation
    'probation',           -- On probationary period
    'contract_ended'       -- Contract employment ended
);

CREATE TYPE employment_type AS ENUM (
    'full_time',           -- Full-time employee
    'part_time',           -- Part-time employee
    'contract',            -- Contract/temporary worker
    'volunteer',           -- Volunteer staff
    'intern',              -- Intern/trainee
    'seasonal',            -- Seasonal employee
    'on_call'              -- On-call staff
);

CREATE TYPE access_level AS ENUM (
    'public_only',         -- Public areas only
    'front_of_house',      -- Front of house areas
    'back_of_house',       -- Back of house areas
    'restricted_areas',    -- Restricted/secure areas
    'all_areas',           -- All venue areas
    'administrative'       -- Administrative areas only
);

-- =====================================================
-- VENUE_STAFF TABLE
-- =====================================================
-- Core venue staff management with roles and permissions
CREATE TABLE IF NOT EXISTS venue_staff (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue and user association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    user_id UUID NOT NULL,                              -- Reference to users.id
    
    -- Staff role and employment
    staff_role staff_role NOT NULL,                     -- Staff role within venue
    employment_status employment_status NOT NULL DEFAULT 'pending',
    employment_type employment_type NOT NULL DEFAULT 'part_time',
    
    -- Employment details
    employee_id VARCHAR(50),                            -- Venue-specific employee ID
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,       -- Employment start date
    termination_date DATE,                              -- Employment end date
    termination_reason TEXT,                            -- Reason for termination
    probation_end_date DATE,                           -- End of probation period
    
    -- Job details
    job_title VARCHAR(200),                             -- Specific job title
    department VARCHAR(100),                            -- Department/team
    reports_to_staff_id UUID REFERENCES venue_staff(id), -- Direct supervisor
    hourly_rate DECIMAL(8, 2),                         -- Hourly pay rate
    salary_annual DECIMAL(12, 2),                      -- Annual salary (if applicable)
    
    -- Contact information
    work_phone VARCHAR(20),                             -- Work phone number
    work_email VARCHAR(320),                            -- Work email address
    emergency_contact_name VARCHAR(200),                -- Emergency contact name
    emergency_contact_phone VARCHAR(20),               -- Emergency contact phone
    emergency_contact_relationship VARCHAR(100),       -- Emergency contact relationship
    
    -- Access and permissions
    access_level access_level NOT NULL DEFAULT 'public_only',
    venue_permissions TEXT[],                           -- Specific venue permissions
    restricted_areas TEXT[],                            -- Areas staff cannot access
    access_card_number VARCHAR(100),                    -- Physical access card number
    access_pin VARCHAR(20),                             -- Access PIN/code
    
    -- Work schedule preferences
    available_days INTEGER[] DEFAULT '{1,2,3,4,5,6,0}', -- Available days (0=Sunday, 1=Monday, etc.)
    preferred_start_time TIME,                          -- Preferred start time
    preferred_end_time TIME,                            -- Preferred end time
    max_hours_per_week INTEGER,                         -- Maximum hours per week
    min_hours_per_week INTEGER,                         -- Minimum hours per week
    overtime_eligible BOOLEAN NOT NULL DEFAULT TRUE,    -- Eligible for overtime
    
    -- Training and certifications
    training_completed JSONB DEFAULT '[]',              -- Completed training programs
    certifications JSONB DEFAULT '[]',                 -- Current certifications
    certification_expiry_alerts BOOLEAN NOT NULL DEFAULT TRUE, -- Send expiry alerts
    
    -- Performance and notes
    performance_rating INTEGER,                         -- Performance rating (1-5)
    performance_notes TEXT,                             -- Performance evaluation notes
    disciplinary_actions JSONB DEFAULT '[]',           -- Disciplinary action history
    commendations JSONB DEFAULT '[]',                  -- Awards and recognition
    notes TEXT,                                         -- General notes about staff member
    
    -- Staff preferences and settings
    notification_preferences JSONB DEFAULT '{}',       -- Communication preferences
    language_preference VARCHAR(10) DEFAULT 'en',       -- Preferred language
    uniform_size VARCHAR(20),                           -- Uniform size
    special_accommodations TEXT,                        -- ADA or other accommodations
    
    -- Attendance tracking
    total_hours_worked DECIMAL(10, 2) DEFAULT 0,       -- Lifetime hours worked
    total_shifts_completed INTEGER DEFAULT 0,           -- Total shifts completed
    no_show_count INTEGER DEFAULT 0,                   -- Number of no-shows
    tardy_count INTEGER DEFAULT 0,                     -- Number of late arrivals
    last_shift_date DATE,                              -- Date of last worked shift
    
    -- Administrative fields
    background_check_completed BOOLEAN NOT NULL DEFAULT FALSE, -- Background check status
    background_check_date DATE,                         -- Background check completion date
    drug_test_completed BOOLEAN NOT NULL DEFAULT FALSE, -- Drug test completion
    drug_test_date DATE,                               -- Drug test completion date
    i9_form_completed BOOLEAN NOT NULL DEFAULT FALSE,   -- I-9 form completion
    tax_forms_completed BOOLEAN NOT NULL DEFAULT FALSE, -- Tax form completion
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Record creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Last update timestamp
    created_by_user_id UUID,                           -- User who created record
    updated_by_user_id UUID,                           -- User who last updated record
    
    -- Constraints
    CONSTRAINT venue_staff_unique_employee UNIQUE(venue_id, employee_id) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT venue_staff_unique_user_role UNIQUE(venue_id, user_id, staff_role, employment_status) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT venue_staff_valid_employment_dates CHECK (termination_date IS NULL OR termination_date >= hire_date),
    CONSTRAINT venue_staff_valid_probation CHECK (probation_end_date IS NULL OR probation_end_date >= hire_date),
    CONSTRAINT venue_staff_valid_hours CHECK (
        (max_hours_per_week IS NULL OR max_hours_per_week > 0) AND
        (min_hours_per_week IS NULL OR min_hours_per_week >= 0) AND
        (max_hours_per_week IS NULL OR min_hours_per_week IS NULL OR min_hours_per_week <= max_hours_per_week)
    ),
    CONSTRAINT venue_staff_valid_rating CHECK (performance_rating IS NULL OR (performance_rating >= 1 AND performance_rating <= 5)),
    CONSTRAINT venue_staff_valid_pay CHECK (
        (hourly_rate IS NULL OR hourly_rate >= 0) AND
        (salary_annual IS NULL OR salary_annual >= 0)
    ),
    CONSTRAINT venue_staff_valid_days CHECK (
        available_days IS NULL OR (
            array_length(available_days, 1) <= 7 AND
            NOT EXISTS (SELECT 1 FROM unnest(available_days) AS day WHERE day < 0 OR day > 6)
        )
    )
);

-- =====================================================
-- STAFF_SCHEDULES TABLE
-- =====================================================
-- Staff work schedules and shift assignments
CREATE TABLE IF NOT EXISTS staff_schedules (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Staff and venue association
    venue_staff_id UUID NOT NULL REFERENCES venue_staff(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL,                             -- Reference to venues.id (denormalized for performance)
    
    -- Schedule details
    schedule_name VARCHAR(200),                         -- Schedule name/description
    schedule_date DATE NOT NULL,                        -- Date of scheduled work
    start_time TIME NOT NULL,                           -- Shift start time
    end_time TIME NOT NULL,                             -- Shift end time
    break_duration_minutes INTEGER DEFAULT 0,           -- Break time in minutes
    
    -- Schedule type and status
    schedule_type VARCHAR(100) DEFAULT 'regular',       -- Type of schedule (regular, event, training, etc.)
    schedule_status VARCHAR(50) DEFAULT 'scheduled',    -- Status (scheduled, confirmed, completed, cancelled, no_show)
    
    -- Position and location
    assigned_position VARCHAR(200),                     -- Specific position for this shift
    assigned_area VARCHAR(200),                         -- Assigned work area
    special_instructions TEXT,                          -- Special instructions for shift
    
    -- Event association (if applicable)
    event_id UUID,                                      -- Reference to events.id (if event-specific)
    
    -- Attendance tracking
    actual_start_time TIMESTAMPTZ,                     -- Actual clock-in time
    actual_end_time TIMESTAMPTZ,                       -- Actual clock-out time
    hours_worked DECIMAL(4, 2),                        -- Calculated hours worked
    overtime_hours DECIMAL(4, 2) DEFAULT 0,            -- Overtime hours
    
    -- Schedule notes and updates
    staff_notes TEXT,                                   -- Notes from staff member
    supervisor_notes TEXT,                              -- Notes from supervisor
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT staff_schedules_valid_times CHECK (end_time > start_time),
    CONSTRAINT staff_schedules_valid_break CHECK (break_duration_minutes >= 0),
    CONSTRAINT staff_schedules_valid_hours CHECK (hours_worked IS NULL OR hours_worked >= 0),
    CONSTRAINT staff_schedules_valid_overtime CHECK (overtime_hours >= 0)
);

-- =====================================================
-- STAFF_CERTIFICATIONS TABLE
-- =====================================================
-- Individual certification tracking for staff
CREATE TABLE IF NOT EXISTS staff_certifications (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Staff association
    venue_staff_id UUID NOT NULL REFERENCES venue_staff(id) ON DELETE CASCADE,
    
    -- Certification details
    certification_name VARCHAR(200) NOT NULL,           -- Name of certification
    certification_type VARCHAR(100) NOT NULL,           -- Type/category of certification
    issuing_organization VARCHAR(200),                  -- Organization that issued certification
    certification_number VARCHAR(100),                  -- Certification number/ID
    
    -- Certification dates
    issue_date DATE NOT NULL,                           -- Date certification was issued
    expiry_date DATE,                                   -- Date certification expires
    renewal_required BOOLEAN NOT NULL DEFAULT TRUE,     -- Whether renewal is required
    
    -- Certification status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,            -- Certification is currently active
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,         -- Certification has been verified
    verification_date DATE,                             -- Date verification was completed
    verification_method VARCHAR(100),                   -- How certification was verified
    
    -- Document storage
    certificate_document_url TEXT,                      -- URL to certificate document
    verification_document_url TEXT,                     -- URL to verification document
    
    -- Renewal tracking
    renewal_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE, -- Renewal reminder has been sent
    renewal_notice_days INTEGER DEFAULT 30,             -- Days before expiry to send notice
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT staff_certs_valid_dates CHECK (expiry_date IS NULL OR expiry_date >= issue_date),
    CONSTRAINT staff_certs_valid_reminder_days CHECK (renewal_notice_days > 0)
);

-- =====================================================
-- STAFF_TRAINING_RECORDS TABLE
-- =====================================================
-- Training completion and progress tracking
CREATE TABLE IF NOT EXISTS staff_training_records (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Staff association
    venue_staff_id UUID NOT NULL REFERENCES venue_staff(id) ON DELETE CASCADE,
    
    -- Training details
    training_name VARCHAR(200) NOT NULL,                -- Name of training program
    training_type VARCHAR(100) NOT NULL,                -- Type of training
    training_category VARCHAR(100),                     -- Training category
    training_provider VARCHAR(200),                     -- Training provider/organization
    
    -- Training completion
    completion_status VARCHAR(50) DEFAULT 'not_started', -- Status (not_started, in_progress, completed, failed)
    start_date DATE,                                    -- Training start date
    completion_date DATE,                              -- Training completion date
    score DECIMAL(5, 2),                               -- Training score (if applicable)
    passing_score DECIMAL(5, 2),                       -- Required passing score
    
    -- Training requirements
    is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,        -- Training is mandatory for role
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,        -- Training requires periodic renewal
    renewal_frequency INTERVAL,                         -- How often renewal is required
    next_renewal_date DATE,                             -- Next renewal due date
    
    -- Training materials and results
    training_materials JSONB DEFAULT '{}',             -- Training materials and resources
    completion_certificate_url TEXT,                    -- URL to completion certificate
    trainer_name VARCHAR(200),                          -- Name of trainer/instructor
    training_hours DECIMAL(4, 2),                      -- Hours of training completed
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT staff_training_valid_dates CHECK (completion_date IS NULL OR start_date IS NULL OR completion_date >= start_date),
    CONSTRAINT staff_training_valid_score CHECK (score IS NULL OR score >= 0),
    CONSTRAINT staff_training_valid_hours CHECK (training_hours IS NULL OR training_hours >= 0)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for venue_staff
CREATE INDEX IF NOT EXISTS idx_venue_staff_venue_id ON venue_staff(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_staff_user_id ON venue_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_staff_role ON venue_staff(staff_role);
CREATE INDEX IF NOT EXISTS idx_venue_staff_status ON venue_staff(employment_status);

-- Employment and management indexes
CREATE INDEX IF NOT EXISTS idx_venue_staff_active ON venue_staff(venue_id, employment_status) WHERE employment_status = 'active';
CREATE INDEX IF NOT EXISTS idx_venue_staff_employee_id ON venue_staff(venue_id, employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_staff_reports_to ON venue_staff(reports_to_staff_id) WHERE reports_to_staff_id IS NOT NULL;

-- Access and permissions indexes
CREATE INDEX IF NOT EXISTS idx_venue_staff_access_level ON venue_staff(access_level);
CREATE INDEX IF NOT EXISTS idx_venue_staff_permissions ON venue_staff USING gin(venue_permissions) WHERE venue_permissions IS NOT NULL;

-- Date-based indexes
CREATE INDEX IF NOT EXISTS idx_venue_staff_hire_date ON venue_staff(hire_date);
CREATE INDEX IF NOT EXISTS idx_venue_staff_termination ON venue_staff(termination_date) WHERE termination_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_staff_probation ON venue_staff(probation_end_date) WHERE probation_end_date IS NOT NULL;

-- Performance and attendance indexes
CREATE INDEX IF NOT EXISTS idx_venue_staff_rating ON venue_staff(performance_rating) WHERE performance_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_staff_last_shift ON venue_staff(last_shift_date) WHERE last_shift_date IS NOT NULL;

-- Background check and compliance indexes
CREATE INDEX IF NOT EXISTS idx_venue_staff_background_check ON venue_staff(background_check_completed, background_check_date);
CREATE INDEX IF NOT EXISTS idx_venue_staff_compliance ON venue_staff(i9_form_completed, tax_forms_completed);

-- Staff schedules indexes
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff_id ON staff_schedules(venue_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_venue_id ON staff_schedules(venue_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_date ON staff_schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_status ON staff_schedules(schedule_status);

-- Schedule lookup indexes
CREATE INDEX IF NOT EXISTS idx_staff_schedules_venue_date ON staff_schedules(venue_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff_date ON staff_schedules(venue_staff_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_event ON staff_schedules(event_id) WHERE event_id IS NOT NULL;

-- Time-based schedule indexes
CREATE INDEX IF NOT EXISTS idx_staff_schedules_times ON staff_schedules(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_actual_times ON staff_schedules(actual_start_time, actual_end_time) WHERE actual_start_time IS NOT NULL;

-- Staff certifications indexes
CREATE INDEX IF NOT EXISTS idx_staff_certs_staff_id ON staff_certifications(venue_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_certs_type ON staff_certifications(certification_type);
CREATE INDEX IF NOT EXISTS idx_staff_certs_active ON staff_certifications(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_certs_expiry ON staff_certifications(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_certs_expiring_soon ON staff_certifications(expiry_date) WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days';

-- Staff training indexes
CREATE INDEX IF NOT EXISTS idx_staff_training_staff_id ON staff_training_records(venue_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_training_type ON staff_training_records(training_type);
CREATE INDEX IF NOT EXISTS idx_staff_training_status ON staff_training_records(completion_status);
CREATE INDEX IF NOT EXISTS idx_staff_training_mandatory ON staff_training_records(is_mandatory) WHERE is_mandatory = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_training_renewal ON staff_training_records(next_renewal_date) WHERE next_renewal_date IS NOT NULL;

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to automatically update staff metadata
CREATE OR REPLACE FUNCTION update_venue_staff_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Auto-generate employee ID if not provided
    IF NEW.employee_id IS NULL THEN
        NEW.employee_id = 'EMP-' || EXTRACT(YEAR FROM NEW.hire_date) || '-' || 
                          LPAD(nextval('venue_staff_employee_seq')::text, 4, '0');
    END IF;
    
    -- Set probation end date for new hires (90 days default)
    IF TG_OP = 'INSERT' AND NEW.probation_end_date IS NULL AND NEW.employment_type IN ('full_time', 'part_time') THEN
        NEW.probation_end_date = NEW.hire_date + INTERVAL '90 days';
    END IF;
    
    -- Update employment status based on dates
    IF NEW.termination_date IS NOT NULL AND NEW.employment_status NOT IN ('terminated', 'contract_ended') THEN
        NEW.employment_status = 'terminated';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate hours worked in schedules
CREATE OR REPLACE FUNCTION calculate_schedule_hours()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Calculate hours worked if actual times are provided
    IF NEW.actual_start_time IS NOT NULL AND NEW.actual_end_time IS NOT NULL THEN
        NEW.hours_worked = EXTRACT(EPOCH FROM (NEW.actual_end_time - NEW.actual_start_time)) / 3600.0;
        
        -- Calculate overtime (over 8 hours per day)
        IF NEW.hours_worked > 8 THEN
            NEW.overtime_hours = NEW.hours_worked - 8;
        ELSE
            NEW.overtime_hours = 0;
        END IF;
        
        -- Update staff totals
        UPDATE venue_staff 
        SET total_hours_worked = total_hours_worked + NEW.hours_worked,
            total_shifts_completed = total_shifts_completed + 1,
            last_shift_date = NEW.schedule_date
        WHERE id = NEW.venue_staff_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle certification expiry alerts
CREATE OR REPLACE FUNCTION check_certification_expiry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Check if certification is expiring soon and send alert
    IF NEW.expiry_date IS NOT NULL AND NEW.renewal_reminder_sent = FALSE THEN
        IF NEW.expiry_date <= CURRENT_DATE + INTERVAL '1 day' * NEW.renewal_notice_days THEN
            NEW.renewal_reminder_sent = TRUE;
            
            -- Here you would trigger a notification system
            -- For now, we'll just mark the reminder as sent
        END IF;
    END IF;
    
    -- Mark certification as inactive if expired
    IF NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
        NEW.is_active = FALSE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for employee IDs
CREATE SEQUENCE IF NOT EXISTS venue_staff_employee_seq START 1;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_venue_staff_metadata ON venue_staff;
CREATE TRIGGER trigger_venue_staff_metadata
    BEFORE INSERT OR UPDATE ON venue_staff
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_staff_metadata();

DROP TRIGGER IF EXISTS trigger_schedule_hours_calculation ON staff_schedules;
CREATE TRIGGER trigger_schedule_hours_calculation
    BEFORE INSERT OR UPDATE ON staff_schedules
    FOR EACH ROW
    EXECUTE FUNCTION calculate_schedule_hours();

DROP TRIGGER IF EXISTS trigger_certification_expiry_check ON staff_certifications;
CREATE TRIGGER trigger_certification_expiry_check
    BEFORE INSERT OR UPDATE ON staff_certifications
    FOR EACH ROW
    EXECUTE FUNCTION check_certification_expiry();

-- =====================================================
-- VENUE STAFF MANAGEMENT HELPER FUNCTIONS
-- =====================================================

-- Function to add new staff member
CREATE OR REPLACE FUNCTION add_venue_staff(
    p_venue_id UUID,
    p_user_id UUID,
    p_staff_role staff_role,
    p_employment_type employment_type DEFAULT 'part_time',
    p_job_title VARCHAR(200) DEFAULT NULL,
    p_hire_date DATE DEFAULT CURRENT_DATE,
    p_hourly_rate DECIMAL(8, 2) DEFAULT NULL,
    p_access_level access_level DEFAULT 'public_only',
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_staff_id UUID;
BEGIN
    INSERT INTO venue_staff (
        venue_id, user_id, staff_role, employment_type, job_title,
        hire_date, hourly_rate, access_level, created_by_user_id
    )
    VALUES (
        p_venue_id, p_user_id, p_staff_role, p_employment_type, p_job_title,
        p_hire_date, p_hourly_rate, p_access_level, p_created_by_user_id
    )
    RETURNING id INTO new_staff_id;
    
    RETURN new_staff_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get venue staff by role
CREATE OR REPLACE FUNCTION get_venue_staff_by_role(
    p_venue_id UUID,
    p_staff_role staff_role DEFAULT NULL,
    p_employment_status employment_status DEFAULT 'active'
) RETURNS TABLE(
    staff_id UUID,
    user_id UUID,
    employee_id VARCHAR(50),
    staff_role staff_role,
    job_title VARCHAR(200),
    employment_status employment_status,
    hire_date DATE,
    access_level access_level
) AS $$
BEGIN
    RETURN QUERY
    SELECT vs.id, vs.user_id, vs.employee_id, vs.staff_role, vs.job_title,
           vs.employment_status, vs.hire_date, vs.access_level
    FROM venue_staff vs
    WHERE vs.venue_id = p_venue_id
    AND (p_staff_role IS NULL OR vs.staff_role = p_staff_role)
    AND vs.employment_status = p_employment_status
    ORDER BY vs.staff_role, vs.hire_date;
END;
$$ LANGUAGE plpgsql;

-- Function to create staff schedule
CREATE OR REPLACE FUNCTION create_staff_schedule(
    p_venue_staff_id UUID,
    p_schedule_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_assigned_position VARCHAR(200) DEFAULT NULL,
    p_assigned_area VARCHAR(200) DEFAULT NULL,
    p_event_id UUID DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    schedule_id UUID;
    v_venue_id UUID;
BEGIN
    -- Get venue ID from staff record
    SELECT venue_id INTO v_venue_id FROM venue_staff WHERE id = p_venue_staff_id;
    
    INSERT INTO staff_schedules (
        venue_staff_id, venue_id, schedule_date, start_time, end_time,
        assigned_position, assigned_area, event_id, created_by_user_id
    )
    VALUES (
        p_venue_staff_id, v_venue_id, p_schedule_date, p_start_time, p_end_time,
        p_assigned_position, p_assigned_area, p_event_id, p_created_by_user_id
    )
    RETURNING id INTO schedule_id;
    
    RETURN schedule_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get staff schedule for date range
CREATE OR REPLACE FUNCTION get_staff_schedule(
    p_venue_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_staff_role staff_role DEFAULT NULL
) RETURNS TABLE(
    schedule_id UUID,
    staff_name VARCHAR(200),
    staff_role staff_role,
    schedule_date DATE,
    start_time TIME,
    end_time TIME,
    assigned_position VARCHAR(200),
    assigned_area VARCHAR(200),
    schedule_status VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT ss.id, CONCAT(u.first_name, ' ', u.last_name) as staff_name,
           vs.staff_role, ss.schedule_date, ss.start_time, ss.end_time,
           ss.assigned_position, ss.assigned_area, ss.schedule_status
    FROM staff_schedules ss
    JOIN venue_staff vs ON ss.venue_staff_id = vs.id
    JOIN users u ON vs.user_id = u.id
    WHERE ss.venue_id = p_venue_id
    AND ss.schedule_date BETWEEN p_start_date AND p_end_date
    AND (p_staff_role IS NULL OR vs.staff_role = p_staff_role)
    ORDER BY ss.schedule_date, ss.start_time, vs.staff_role;
END;
$$ LANGUAGE plpgsql;

-- Function to clock in/out staff
CREATE OR REPLACE FUNCTION staff_clock_action(
    p_schedule_id UUID,
    p_action VARCHAR(10), -- 'in' or 'out'
    p_timestamp TIMESTAMPTZ DEFAULT NOW()
) RETURNS BOOLEAN AS $$
BEGIN
    IF p_action = 'in' THEN
        UPDATE staff_schedules
        SET actual_start_time = p_timestamp,
            schedule_status = 'in_progress'
        WHERE id = p_schedule_id
        AND actual_start_time IS NULL;
    ELSIF p_action = 'out' THEN
        UPDATE staff_schedules
        SET actual_end_time = p_timestamp,
            schedule_status = 'completed'
        WHERE id = p_schedule_id
        AND actual_start_time IS NOT NULL
        AND actual_end_time IS NULL;
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to terminate staff employment
CREATE OR REPLACE FUNCTION terminate_staff_employment(
    p_venue_staff_id UUID,
    p_termination_date DATE DEFAULT CURRENT_DATE,
    p_termination_reason TEXT DEFAULT NULL,
    p_updated_by_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE venue_staff
    SET employment_status = 'terminated',
        termination_date = p_termination_date,
        termination_reason = p_termination_reason,
        updated_by_user_id = p_updated_by_user_id
    WHERE id = p_venue_staff_id
    AND employment_status != 'terminated';
    
    -- Cancel future schedules
    UPDATE staff_schedules
    SET schedule_status = 'cancelled'
    WHERE venue_staff_id = p_venue_staff_id
    AND schedule_date > p_termination_date
    AND schedule_status = 'scheduled';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get expiring certifications
CREATE OR REPLACE FUNCTION get_expiring_certifications(
    p_venue_id UUID DEFAULT NULL,
    p_days_ahead INTEGER DEFAULT 30
) RETURNS TABLE(
    staff_name VARCHAR(200),
    certification_name VARCHAR(200),
    expiry_date DATE,
    days_until_expiry INTEGER,
    is_verified BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT CONCAT(u.first_name, ' ', u.last_name) as staff_name,
           sc.certification_name, sc.expiry_date,
           (sc.expiry_date - CURRENT_DATE)::INTEGER as days_until_expiry,
           sc.is_verified
    FROM staff_certifications sc
    JOIN venue_staff vs ON sc.venue_staff_id = vs.id
    JOIN users u ON vs.user_id = u.id
    WHERE (p_venue_id IS NULL OR vs.venue_id = p_venue_id)
    AND sc.expiry_date IS NOT NULL
    AND sc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * p_days_ahead
    AND sc.is_active = TRUE
    ORDER BY sc.expiry_date, staff_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get staff performance summary
CREATE OR REPLACE FUNCTION get_staff_performance_summary(
    p_venue_id UUID,
    p_period_start DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_period_end DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    staff_name VARCHAR(200),
    staff_role staff_role,
    total_shifts INTEGER,
    total_hours DECIMAL(10, 2),
    no_shows INTEGER,
    tardiness INTEGER,
    performance_rating INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT CONCAT(u.first_name, ' ', u.last_name) as staff_name,
           vs.staff_role,
           COUNT(ss.id)::INTEGER as total_shifts,
           COALESCE(SUM(ss.hours_worked), 0) as total_hours,
           vs.no_show_count,
           vs.tardy_count,
           vs.performance_rating
    FROM venue_staff vs
    JOIN users u ON vs.user_id = u.id
    LEFT JOIN staff_schedules ss ON vs.id = ss.venue_staff_id 
        AND ss.schedule_date BETWEEN p_period_start AND p_period_end
        AND ss.schedule_status = 'completed'
    WHERE vs.venue_id = p_venue_id
    AND vs.employment_status = 'active'
    GROUP BY vs.id, u.first_name, u.last_name, vs.staff_role, 
             vs.no_show_count, vs.tardy_count, vs.performance_rating
    ORDER BY total_hours DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE venue_staff IS 'Comprehensive venue staff management with roles, permissions, and employment tracking';
COMMENT ON TABLE staff_schedules IS 'Staff work schedules and shift assignments with attendance tracking';
COMMENT ON TABLE staff_certifications IS 'Individual certification tracking with expiry monitoring';
COMMENT ON TABLE staff_training_records IS 'Training completion and progress tracking for staff development';

-- Venue staff table comments
COMMENT ON COLUMN venue_staff.staff_role IS 'Staff role within venue: defines responsibilities and access level';
COMMENT ON COLUMN venue_staff.employment_status IS 'Current employment status: tracks active, inactive, terminated staff';
COMMENT ON COLUMN venue_staff.employee_id IS 'Venue-specific employee identifier: auto-generated if not provided';
COMMENT ON COLUMN venue_staff.venue_permissions IS 'Specific venue permissions: array of permission strings';
COMMENT ON COLUMN venue_staff.access_level IS 'Physical access level: defines which areas staff can access';
COMMENT ON COLUMN venue_staff.available_days IS 'Available work days: array of day numbers (0=Sunday, 1=Monday, etc.)';
COMMENT ON COLUMN venue_staff.training_completed IS 'Completed training programs: JSON array of training records';
COMMENT ON COLUMN venue_staff.certifications IS 'Current certifications: JSON array of certification summaries';

-- Staff schedules table comments
COMMENT ON COLUMN staff_schedules.schedule_status IS 'Schedule status: tracks scheduled, confirmed, completed, cancelled, no_show';
COMMENT ON COLUMN staff_schedules.actual_start_time IS 'Clock-in time: actual start time when staff clocked in';
COMMENT ON COLUMN staff_schedules.actual_end_time IS 'Clock-out time: actual end time when staff clocked out';
COMMENT ON COLUMN staff_schedules.hours_worked IS 'Calculated hours: automatically calculated from actual times';
COMMENT ON COLUMN staff_schedules.overtime_hours IS 'Overtime hours: calculated automatically for hours over 8 per day';

-- =====================================================
-- VENUE STAFF MANAGEMENT SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive staff management system with:
-- - Role-based staff organization with 21 different roles
-- - Employment status tracking and lifecycle management
-- - Comprehensive scheduling system with attendance tracking
-- - Certification and training management with expiry alerts
-- - Access control and permissions for venue areas
-- - Performance tracking and evaluation system
-- - Helper functions for staff operations and reporting
-- - Compliance tracking for background checks and documentation
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_venue_staff_tenant_id ON venue_staff(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_staff_tenant_created ON venue_staff(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
