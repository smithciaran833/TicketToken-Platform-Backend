-- =====================================================
-- TicketToken Platform - Venue Compliance Schema
-- Week 1, Day 3 Development
-- =====================================================
-- Description: Comprehensive venue compliance and regulatory management
-- Version: 1.0
-- Created: 2025-07-16 14:39:58
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- For data encryption if needed

-- Create ENUM types for venue compliance management
CREATE TYPE compliance_type AS ENUM (
    'business_license',         -- Business operating license
    'tax_permits',             -- Tax registration and permits
    'safety_certificates',     -- Fire safety, building safety certificates
    'insurance',               -- Liability, property, workers comp insurance
    'health_permits',          -- Health department permits
    'liquor_license',          -- Alcohol service license
    'music_license',           -- Music performance licenses (ASCAP, BMI, etc.)
    'zoning_permits',          -- Zoning and land use permits
    'ada_compliance',          -- ADA accessibility compliance
    'environmental',           -- Environmental permits and compliance
    'employment',              -- Employment and labor compliance
    'security_permits',        -- Security and surveillance permits
    'parking_permits',         -- Parking and traffic permits
    'temporary_permits',       -- Temporary event permits
    'vendor_permits',          -- Vendor and contractor permits
    'other'                    -- Other compliance types
);

CREATE TYPE compliance_status AS ENUM (
    'valid',                   -- Compliance is current and valid
    'expired',                 -- Compliance has expired
    'pending_renewal',         -- Renewal application submitted
    'suspended',               -- Compliance suspended by authority
    'revoked',                 -- Compliance permanently revoked
    'under_review',            -- Under regulatory review
    'conditionally_approved',  -- Approved with conditions
    'denied',                  -- Application denied
    'not_applicable'           -- Not applicable for this venue
);

CREATE TYPE violation_severity AS ENUM (
    'minor',                   -- Minor violation with minimal impact
    'moderate',                -- Moderate violation requiring attention
    'major',                   -- Major violation requiring immediate action
    'critical'                 -- Critical violation requiring urgent action
);

CREATE TYPE violation_status AS ENUM (
    'open',                    -- Violation is active and unresolved
    'in_progress',             -- Remediation in progress
    'resolved',                -- Violation has been resolved
    'disputed',                -- Violation is being disputed
    'dismissed'                -- Violation was dismissed/invalid
);

-- =====================================================
-- VENUE_COMPLIANCE TABLE
-- =====================================================
-- Core venue compliance tracking with documents and regulatory oversight
CREATE TABLE IF NOT EXISTS venue_compliance (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Compliance identification
    compliance_type compliance_type NOT NULL,           -- Type of compliance
    compliance_name VARCHAR(200) NOT NULL,              -- Specific compliance name
    compliance_description TEXT,                        -- Detailed description
    
    -- Regulatory authority information
    issuing_authority VARCHAR(200) NOT NULL,            -- Authority that issued/manages compliance
    authority_contact_info JSONB,                       -- Contact information for authority
    jurisdiction VARCHAR(100),                          -- Jurisdiction (city, county, state, federal)
    regulation_reference VARCHAR(100),                  -- Regulation/law reference
    
    -- Compliance identification numbers
    permit_number VARCHAR(100),                         -- Official permit/license number
    certificate_number VARCHAR(100),                    -- Certificate number
    case_number VARCHAR(100),                           -- Case or file number
    
    -- Compliance status and dates
    compliance_status compliance_status NOT NULL DEFAULT 'pending_renewal',
    issue_date DATE,                                    -- Date compliance was issued
    effective_date DATE,                                -- Date compliance becomes effective
    expiry_date DATE,                                   -- Date compliance expires
    renewal_date DATE,                                  -- Date renewal is due
    
    -- Renewal and notification configuration
    renewal_required BOOLEAN NOT NULL DEFAULT TRUE,     -- Whether renewal is required
    renewal_period_months INTEGER,                      -- Renewal period in months
    reminder_days_before_expiry INTEGER DEFAULT 30,     -- Days before expiry to send reminder
    auto_renewal_available BOOLEAN NOT NULL DEFAULT FALSE, -- Auto-renewal option available
    
    -- Compliance requirements and conditions
    requirements JSONB DEFAULT '{}',                    -- Specific requirements for compliance
    conditions JSONB DEFAULT '{}',                      -- Conditions attached to compliance
    restrictions JSONB DEFAULT '{}',                    -- Any restrictions or limitations
    
    -- Financial information
    application_fee DECIMAL(10, 2),                    -- Application fee amount
    renewal_fee DECIMAL(10, 2),                        -- Renewal fee amount
    late_fee DECIMAL(10, 2),                           -- Late renewal fee
    penalty_amount DECIMAL(10, 2),                     -- Penalty amount (if any)
    
    -- Document storage and references
    primary_document_url TEXT,                          -- Primary compliance document URL
    supporting_documents JSONB DEFAULT '[]',           -- Array of supporting document URLs
    document_storage_location VARCHAR(500),            -- Document storage reference
    digital_signature_hash VARCHAR(128),               -- Digital signature for verification
    
    -- Verification and validation
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,         -- Compliance has been verified
    verified_by_user_id UUID,                          -- User who verified compliance
    verification_date TIMESTAMPTZ,                     -- Verification timestamp
    verification_method VARCHAR(100),                  -- How verification was done
    verification_notes TEXT,                           -- Verification notes
    
    -- Monitoring and alerts
    monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,   -- Enable monitoring for this compliance
    alert_recipients JSONB DEFAULT '[]',               -- List of alert recipients
    last_reminder_sent TIMESTAMPTZ,                    -- Last reminder sent timestamp
    next_reminder_date DATE,                           -- Next reminder date
    
    -- Risk assessment
    risk_level VARCHAR(20) DEFAULT 'medium',           -- Risk level (low, medium, high, critical)
    business_impact TEXT,                              -- Impact on business if non-compliant
    compliance_priority INTEGER DEFAULT 3,             -- Priority (1-5, 5 being highest)
    
    -- Application and renewal tracking
    application_submitted_date DATE,                    -- Application submission date
    application_status VARCHAR(50),                    -- Application status
    renewal_submitted_date DATE,                        -- Renewal submission date
    renewal_status VARCHAR(50),                         -- Renewal status
    processing_time_days INTEGER,                      -- Typical processing time
    
    -- Compliance history
    previous_compliance_id UUID REFERENCES venue_compliance(id), -- Previous version reference
    is_current_version BOOLEAN NOT NULL DEFAULT TRUE,   -- Is this the current version
    superseded_by_id UUID REFERENCES venue_compliance(id), -- Superseded by this record
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Record creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Last update timestamp
    created_by_user_id UUID,                           -- User who created record
    updated_by_user_id UUID,                           -- User who last updated record
    
    -- Constraints
    CONSTRAINT venue_compliance_unique_current UNIQUE(venue_id, compliance_type, permit_number, is_current_version) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT venue_compliance_valid_dates CHECK (
        (issue_date IS NULL OR effective_date IS NULL OR issue_date <= effective_date) AND
        (effective_date IS NULL OR expiry_date IS NULL OR effective_date <= expiry_date) AND
        (renewal_date IS NULL OR expiry_date IS NULL OR renewal_date <= expiry_date)
    ),
    CONSTRAINT venue_compliance_valid_fees CHECK (
        (application_fee IS NULL OR application_fee >= 0) AND
        (renewal_fee IS NULL OR renewal_fee >= 0) AND
        (late_fee IS NULL OR late_fee >= 0) AND
        (penalty_amount IS NULL OR penalty_amount >= 0)
    ),
    CONSTRAINT venue_compliance_valid_priority CHECK (compliance_priority >= 1 AND compliance_priority <= 5),
    CONSTRAINT venue_compliance_valid_reminder_days CHECK (reminder_days_before_expiry > 0)
);

-- =====================================================
-- COMPLIANCE_VIOLATIONS TABLE
-- =====================================================
-- Track compliance violations and remediation efforts
CREATE TABLE IF NOT EXISTS compliance_violations (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue and compliance association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    compliance_id UUID REFERENCES venue_compliance(id) ON DELETE SET NULL, -- Related compliance (optional)
    
    -- Violation identification
    violation_number VARCHAR(100),                      -- Official violation number
    violation_type VARCHAR(100) NOT NULL,               -- Type of violation
    violation_title VARCHAR(300) NOT NULL,              -- Violation title/summary
    violation_description TEXT NOT NULL,                -- Detailed violation description
    
    -- Violation classification
    severity violation_severity NOT NULL,               -- Violation severity level
    violation_status violation_status NOT NULL DEFAULT 'open',
    regulatory_code VARCHAR(100),                       -- Specific regulatory code violated
    
    -- Authority and discovery information
    issuing_authority VARCHAR(200) NOT NULL,            -- Authority that issued violation
    inspector_name VARCHAR(200),                        -- Inspector who found violation
    inspection_date DATE NOT NULL,                      -- Date of inspection
    discovery_method VARCHAR(100),                      -- How violation was discovered
    
    -- Violation details
    violation_date DATE NOT NULL,                       -- Date violation occurred
    citation_date DATE,                                 -- Date citation was issued
    location_details TEXT,                              -- Specific location within venue
    photographic_evidence JSONB DEFAULT '[]',          -- Photo evidence URLs
    
    -- Financial impact
    fine_amount DECIMAL(10, 2),                        -- Fine amount imposed
    penalty_amount DECIMAL(10, 2),                     -- Additional penalties
    remediation_cost DECIMAL(10, 2),                   -- Cost to remediate
    lost_revenue DECIMAL(10, 2),                       -- Estimated lost revenue
    
    -- Remediation requirements
    required_actions TEXT NOT NULL,                     -- Required remediation actions
    remediation_deadline DATE,                          -- Deadline for remediation
    remediation_plan TEXT,                             -- Remediation plan
    remediation_status VARCHAR(50) DEFAULT 'not_started', -- Remediation progress
    
    -- Resolution tracking
    resolution_date DATE,                              -- Date violation was resolved
    resolution_method VARCHAR(100),                    -- How violation was resolved
    resolution_evidence JSONB DEFAULT '[]',            -- Evidence of resolution
    resolved_by_user_id UUID,                          -- User who marked as resolved
    
    -- Follow-up and verification
    follow_up_required BOOLEAN NOT NULL DEFAULT TRUE,   -- Follow-up inspection required
    follow_up_date DATE,                               -- Scheduled follow-up date
    verification_inspector VARCHAR(200),               -- Inspector who verified resolution
    verification_date DATE,                            -- Date resolution was verified
    
    -- Appeal and dispute process
    appeal_filed BOOLEAN NOT NULL DEFAULT FALSE,        -- Appeal has been filed
    appeal_date DATE,                                   -- Date appeal was filed
    appeal_status VARCHAR(50),                          -- Appeal status
    appeal_outcome VARCHAR(100),                        -- Appeal outcome
    appeal_notes TEXT,                                  -- Appeal notes and details
    
    -- Communication and correspondence
    correspondence_log JSONB DEFAULT '[]',             -- Communication history
    next_communication_date DATE,                       -- Next scheduled communication
    
    -- Risk and impact assessment
    operational_impact VARCHAR(100),                   -- Impact on venue operations
    public_safety_risk BOOLEAN NOT NULL DEFAULT FALSE, -- Public safety risk involved
    media_exposure_risk VARCHAR(20) DEFAULT 'low',     -- Risk of media exposure
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT compliance_violations_valid_dates CHECK (
        violation_date <= COALESCE(citation_date, violation_date) AND
        (resolution_date IS NULL OR resolution_date >= violation_date) AND
        (remediation_deadline IS NULL OR remediation_deadline >= violation_date)
    ),
    CONSTRAINT compliance_violations_valid_amounts CHECK (
        (fine_amount IS NULL OR fine_amount >= 0) AND
        (penalty_amount IS NULL OR penalty_amount >= 0) AND
        (remediation_cost IS NULL OR remediation_cost >= 0) AND
        (lost_revenue IS NULL OR lost_revenue >= 0)
    )
);

-- =====================================================
-- COMPLIANCE_INSPECTIONS TABLE
-- =====================================================
-- Track compliance inspections and audit activities
CREATE TABLE IF NOT EXISTS compliance_inspections (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue and compliance association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    compliance_id UUID REFERENCES venue_compliance(id) ON DELETE SET NULL, -- Related compliance (optional)
    
    -- Inspection identification
    inspection_number VARCHAR(100),                     -- Official inspection number
    inspection_type VARCHAR(100) NOT NULL,              -- Type of inspection
    inspection_purpose VARCHAR(200),                    -- Purpose of inspection
    
    -- Inspection scheduling
    inspection_date DATE NOT NULL,                      -- Date of inspection
    scheduled_date DATE,                                -- Originally scheduled date
    inspection_time_start TIME,                         -- Start time
    inspection_time_end TIME,                           -- End time
    duration_minutes INTEGER,                           -- Inspection duration
    
    -- Inspector information
    lead_inspector_name VARCHAR(200) NOT NULL,          -- Lead inspector name
    inspector_badge_number VARCHAR(100),                -- Inspector badge/ID number
    inspection_team JSONB DEFAULT '[]',                 -- Inspection team members
    
    -- Inspection details
    inspection_scope TEXT,                              -- Scope of inspection
    areas_inspected TEXT[],                             -- Areas/systems inspected
    inspection_checklist JSONB DEFAULT '{}',           -- Inspection checklist
    inspection_method VARCHAR(100),                     -- Inspection methodology
    
    -- Inspection results
    overall_result VARCHAR(50) NOT NULL,               -- Overall inspection result
    passed_items INTEGER DEFAULT 0,                    -- Number of items passed
    failed_items INTEGER DEFAULT 0,                    -- Number of items failed
    conditional_items INTEGER DEFAULT 0,               -- Items with conditions
    not_applicable_items INTEGER DEFAULT 0,            -- N/A items
    
    -- Findings and observations
    findings_summary TEXT,                              -- Summary of findings
    positive_findings TEXT,                             -- Positive observations
    areas_for_improvement TEXT,                         -- Areas needing improvement
    safety_concerns TEXT,                               -- Safety concerns identified
    
    -- Violations and issues
    violations_found INTEGER DEFAULT 0,                -- Number of violations found
    critical_violations INTEGER DEFAULT 0,             -- Number of critical violations
    violation_ids UUID[],                               -- References to compliance_violations
    
    -- Corrective actions
    corrective_actions_required TEXT,                   -- Required corrective actions
    corrective_action_deadline DATE,                    -- Deadline for corrections
    follow_up_inspection_required BOOLEAN NOT NULL DEFAULT FALSE, -- Follow-up required
    follow_up_date DATE,                                -- Scheduled follow-up date
    
    -- Documentation
    inspection_report_url TEXT,                         -- Inspection report document
    photos JSONB DEFAULT '[]',                          -- Inspection photos
    evidence_collected JSONB DEFAULT '[]',              -- Evidence collected
    inspection_notes TEXT,                              -- Additional notes
    
    -- Certification and approval
    certificate_issued BOOLEAN NOT NULL DEFAULT FALSE,  -- Certificate issued
    certificate_number VARCHAR(100),                    -- Certificate number
    certificate_expiry_date DATE,                       -- Certificate expiry
    conditional_approval BOOLEAN NOT NULL DEFAULT FALSE, -- Conditional approval given
    conditions_for_approval TEXT,                       -- Conditions for approval
    
    -- Communication
    venue_representative VARCHAR(200),                  -- Venue representative present
    venue_signature_collected BOOLEAN NOT NULL DEFAULT FALSE, -- Signature collected
    report_delivered_date DATE,                         -- Date report was delivered
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT compliance_inspections_valid_times CHECK (
        inspection_time_end IS NULL OR 
        inspection_time_start IS NULL OR 
        inspection_time_end > inspection_time_start
    ),
    CONSTRAINT compliance_inspections_valid_items CHECK (
        passed_items >= 0 AND 
        failed_items >= 0 AND 
        conditional_items >= 0 AND 
        not_applicable_items >= 0
    ),
    CONSTRAINT compliance_inspections_valid_violations CHECK (
        violations_found >= 0 AND 
        critical_violations >= 0 AND 
        critical_violations <= violations_found
    )
);

-- =====================================================
-- COMPLIANCE_REMINDERS TABLE
-- =====================================================
-- Track compliance reminders and notifications
CREATE TABLE IF NOT EXISTS compliance_reminders (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Compliance association
    compliance_id UUID NOT NULL REFERENCES venue_compliance(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL,                             -- Denormalized for performance
    
    -- Reminder configuration
    reminder_type VARCHAR(100) NOT NULL,                -- Type of reminder
    reminder_title VARCHAR(200) NOT NULL,               -- Reminder title
    reminder_message TEXT NOT NULL,                     -- Reminder message content
    
    -- Reminder timing
    reminder_date DATE NOT NULL,                        -- Date reminder should be sent
    days_before_expiry INTEGER NOT NULL,               -- Days before expiry
    is_urgent BOOLEAN NOT NULL DEFAULT FALSE,           -- Urgent reminder flag
    
    -- Reminder status
    is_sent BOOLEAN NOT NULL DEFAULT FALSE,             -- Reminder has been sent
    sent_at TIMESTAMPTZ,                               -- When reminder was sent
    delivery_method VARCHAR(50),                        -- How reminder was delivered
    
    -- Recipients
    recipient_emails TEXT[],                            -- Email recipients
    recipient_phones TEXT[],                            -- SMS recipients
    recipient_users UUID[],                             -- User IDs to notify
    
    -- Response tracking
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,        -- Reminder acknowledged
    acknowledged_by_user_id UUID,                      -- User who acknowledged
    acknowledged_at TIMESTAMPTZ,                       -- Acknowledgment timestamp
    action_taken TEXT,                                  -- Action taken in response
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT compliance_reminders_valid_days CHECK (days_before_expiry >= 0)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for venue_compliance
CREATE INDEX IF NOT EXISTS idx_venue_compliance_venue_id ON venue_compliance(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_compliance_type ON venue_compliance(compliance_type);
CREATE INDEX IF NOT EXISTS idx_venue_compliance_status ON venue_compliance(compliance_status);
CREATE INDEX IF NOT EXISTS idx_venue_compliance_authority ON venue_compliance(issuing_authority);

-- Compliance date indexes
CREATE INDEX IF NOT EXISTS idx_venue_compliance_expiry ON venue_compliance(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_compliance_renewal ON venue_compliance(renewal_date) WHERE renewal_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_compliance_current ON venue_compliance(is_current_version) WHERE is_current_version = TRUE;

-- Compliance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_venue_compliance_monitoring ON venue_compliance(monitoring_enabled) WHERE monitoring_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_compliance_reminders ON venue_compliance(next_reminder_date) WHERE next_reminder_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_compliance_verification ON venue_compliance(is_verified, verification_date);

-- Expiring compliance index for alerts
CREATE INDEX IF NOT EXISTS idx_venue_compliance_expiring ON venue_compliance(expiry_date, compliance_status) 
    WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
    AND compliance_status IN ('valid', 'pending_renewal');

-- Compliance violations indexes
CREATE INDEX IF NOT EXISTS idx_compliance_violations_venue_id ON compliance_violations(venue_id);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_compliance_id ON compliance_violations(compliance_id) WHERE compliance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_violations_status ON compliance_violations(violation_status);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_severity ON compliance_violations(severity);

-- Violation date indexes
CREATE INDEX IF NOT EXISTS idx_compliance_violations_date ON compliance_violations(violation_date);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_deadline ON compliance_violations(remediation_deadline) WHERE remediation_deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_violations_open ON compliance_violations(venue_id, violation_status) WHERE violation_status = 'open';

-- Compliance inspections indexes
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_venue_id ON compliance_inspections(venue_id);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_compliance_id ON compliance_inspections(compliance_id) WHERE compliance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_date ON compliance_inspections(inspection_date);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_result ON compliance_inspections(overall_result);

-- Inspection follow-up indexes
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_followup ON compliance_inspections(follow_up_date) WHERE follow_up_inspection_required = TRUE;
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_violations ON compliance_inspections(violations_found) WHERE violations_found > 0;

-- Compliance reminders indexes
CREATE INDEX IF NOT EXISTS idx_compliance_reminders_compliance_id ON compliance_reminders(compliance_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reminders_venue_id ON compliance_reminders(venue_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reminders_date ON compliance_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_compliance_reminders_pending ON compliance_reminders(is_sent, reminder_date) WHERE is_sent = FALSE;

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to update compliance status based on dates
CREATE OR REPLACE FUNCTION update_compliance_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Update status based on expiry date
    IF NEW.expiry_date IS NOT NULL THEN
        IF NEW.expiry_date < CURRENT_DATE THEN
            NEW.compliance_status = 'expired';
        ELSIF NEW.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND NEW.compliance_status = 'valid' THEN
            NEW.compliance_status = 'pending_renewal';
        END IF;
    END IF;
    
    -- Set next reminder date
    IF NEW.expiry_date IS NOT NULL AND NEW.reminder_days_before_expiry IS NOT NULL THEN
        NEW.next_reminder_date = NEW.expiry_date - INTERVAL '1 day' * NEW.reminder_days_before_expiry;
    END IF;
    
    -- Handle current version logic
    IF TG_OP = 'INSERT' AND NEW.is_current_version = TRUE THEN
        -- Mark other versions as not current
        UPDATE venue_compliance 
        SET is_current_version = FALSE 
        WHERE venue_id = NEW.venue_id 
        AND compliance_type = NEW.compliance_type 
        AND id != NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically create renewal reminders
CREATE OR REPLACE FUNCTION create_compliance_reminders()
RETURNS TRIGGER AS $$
DECLARE
    reminder_dates INTEGER[] := ARRAY[90, 60, 30, 14, 7, 1]; -- Days before expiry
    reminder_day INTEGER;
    reminder_date DATE;
BEGIN
    -- Only create reminders for new compliances with expiry dates
    IF TG_OP = 'INSERT' AND NEW.expiry_date IS NOT NULL AND NEW.monitoring_enabled = TRUE THEN
        FOREACH reminder_day IN ARRAY reminder_dates LOOP
            reminder_date := NEW.expiry_date - INTERVAL '1 day' * reminder_day;
            
            -- Only create reminders for future dates
            IF reminder_date >= CURRENT_DATE THEN
                INSERT INTO compliance_reminders (
                    compliance_id, venue_id, reminder_type, reminder_title,
                    reminder_message, reminder_date, days_before_expiry,
                    is_urgent
                )
                VALUES (
                    NEW.id, NEW.venue_id, 'renewal_reminder',
                    NEW.compliance_name || ' - Renewal Reminder',
                    'Your ' || NEW.compliance_name || ' expires on ' || NEW.expiry_date || '. Please begin renewal process.',
                    reminder_date, reminder_day,
                    reminder_day <= 7
                );
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update violation metrics
CREATE OR REPLACE FUNCTION update_violation_metrics()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Calculate operational impact based on severity
    IF NEW.severity = 'critical' THEN
        NEW.operational_impact = 'severe';
    ELSIF NEW.severity = 'major' THEN
        NEW.operational_impact = 'moderate';
    ELSE
        NEW.operational_impact = 'minimal';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_compliance_status_update ON venue_compliance;
CREATE TRIGGER trigger_compliance_status_update
    BEFORE INSERT OR UPDATE ON venue_compliance
    FOR EACH ROW
    EXECUTE FUNCTION update_compliance_status();

DROP TRIGGER IF EXISTS trigger_compliance_reminders_creation ON venue_compliance;
CREATE TRIGGER trigger_compliance_reminders_creation
    AFTER INSERT ON venue_compliance
    FOR EACH ROW
    EXECUTE FUNCTION create_compliance_reminders();

DROP TRIGGER IF EXISTS trigger_violation_metrics_update ON compliance_violations;
CREATE TRIGGER trigger_violation_metrics_update
    BEFORE INSERT OR UPDATE ON compliance_violations
    FOR EACH ROW
    EXECUTE FUNCTION update_violation_metrics();

-- =====================================================
-- VENUE COMPLIANCE HELPER FUNCTIONS
-- =====================================================

-- Function to create new compliance record
CREATE OR REPLACE FUNCTION create_venue_compliance(
    p_venue_id UUID,
    p_compliance_type compliance_type,
    p_compliance_name VARCHAR(200),
    p_issuing_authority VARCHAR(200),
    p_permit_number VARCHAR(100) DEFAULT NULL,
    p_issue_date DATE DEFAULT NULL,
    p_expiry_date DATE DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_compliance_id UUID;
BEGIN
    INSERT INTO venue_compliance (
        venue_id, compliance_type, compliance_name, issuing_authority,
        permit_number, issue_date, expiry_date, created_by_user_id
    )
    VALUES (
        p_venue_id, p_compliance_type, p_compliance_name, p_issuing_authority,
        p_permit_number, p_issue_date, p_expiry_date, p_created_by_user_id
    )
    RETURNING id INTO new_compliance_id;
    
    RETURN new_compliance_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get expiring compliance items
CREATE OR REPLACE FUNCTION get_expiring_compliance(
    p_venue_id UUID DEFAULT NULL,
    p_days_ahead INTEGER DEFAULT 30
) RETURNS TABLE(
    compliance_id UUID,
    venue_id UUID,
    compliance_name VARCHAR(200),
    compliance_type compliance_type,
    expiry_date DATE,
    days_until_expiry INTEGER,
    issuing_authority VARCHAR(200),
    renewal_required BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT vc.id, vc.venue_id, vc.compliance_name, vc.compliance_type,
           vc.expiry_date, (vc.expiry_date - CURRENT_DATE)::INTEGER,
           vc.issuing_authority, vc.renewal_required
    FROM venue_compliance vc
    WHERE (p_venue_id IS NULL OR vc.venue_id = p_venue_id)
    AND vc.expiry_date IS NOT NULL
    AND vc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * p_days_ahead
    AND vc.is_current_version = TRUE
    AND vc.compliance_status IN ('valid', 'pending_renewal')
    ORDER BY vc.expiry_date, vc.compliance_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get compliance status summary
CREATE OR REPLACE FUNCTION get_compliance_status_summary(p_venue_id UUID)
RETURNS TABLE(
    compliance_type compliance_type,
    total_items BIGINT,
    valid_items BIGINT,
    expired_items BIGINT,
    expiring_soon BIGINT,
    pending_renewal BIGINT,
    violations_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vc.compliance_type,
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE vc.compliance_status = 'valid') as valid_items,
        COUNT(*) FILTER (WHERE vc.compliance_status = 'expired') as expired_items,
        COUNT(*) FILTER (WHERE vc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon,
        COUNT(*) FILTER (WHERE vc.compliance_status = 'pending_renewal') as pending_renewal,
        COALESCE(cv.violation_count, 0) as violations_count
    FROM venue_compliance vc
    LEFT JOIN (
        SELECT compliance_id, COUNT(*) as violation_count
        FROM compliance_violations
        WHERE venue_id = p_venue_id AND violation_status = 'open'
        GROUP BY compliance_id
    ) cv ON vc.id = cv.compliance_id
    WHERE vc.venue_id = p_venue_id
    AND vc.is_current_version = TRUE
    GROUP BY vc.compliance_type, cv.violation_count
    ORDER BY vc.compliance_type;
END;
$$ LANGUAGE plpgsql;

-- Function to record compliance violation
CREATE OR REPLACE FUNCTION record_compliance_violation(
    p_venue_id UUID,
    p_compliance_id UUID,
    p_violation_type VARCHAR(100),
    p_violation_title VARCHAR(300),
    p_violation_description TEXT,
    p_severity violation_severity,
    p_issuing_authority VARCHAR(200),
    p_violation_date DATE,
    p_fine_amount DECIMAL(10, 2) DEFAULT NULL,
    p_remediation_deadline DATE DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_violation_id UUID;
BEGIN
    INSERT INTO compliance_violations (
        venue_id, compliance_id, violation_type, violation_title,
        violation_description, severity, issuing_authority,
        violation_date, fine_amount, remediation_deadline,
        inspection_date, required_actions, created_by_user_id
    )
    VALUES (
        p_venue_id, p_compliance_id, p_violation_type, p_violation_title,
        p_violation_description, p_severity, p_issuing_authority,
        p_violation_date, p_fine_amount, p_remediation_deadline,
        p_violation_date, 'Remediation plan to be developed',
        p_created_by_user_id
    )
    RETURNING id INTO new_violation_id;
    
    RETURN new_violation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get open violations
CREATE OR REPLACE FUNCTION get_open_violations(
    p_venue_id UUID,
    p_severity violation_severity DEFAULT NULL
) RETURNS TABLE(
    violation_id UUID,
    violation_title VARCHAR(300),
    severity violation_severity,
    violation_date DATE,
    remediation_deadline DATE,
    days_overdue INTEGER,
    fine_amount DECIMAL(10, 2),
    issuing_authority VARCHAR(200)
) AS $$
BEGIN
    RETURN QUERY
    SELECT cv.id, cv.violation_title, cv.severity, cv.violation_date,
           cv.remediation_deadline,
           CASE 
               WHEN cv.remediation_deadline IS NOT NULL AND cv.remediation_deadline < CURRENT_DATE 
               THEN (CURRENT_DATE - cv.remediation_deadline)::INTEGER
               ELSE NULL
           END as days_overdue,
           cv.fine_amount, cv.issuing_authority
    FROM compliance_violations cv
    WHERE cv.venue_id = p_venue_id
    AND cv.violation_status = 'open'
    AND (p_severity IS NULL OR cv.severity = p_severity)
    ORDER BY cv.severity DESC, cv.remediation_deadline NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Function to update compliance from inspection
CREATE OR REPLACE FUNCTION update_compliance_from_inspection(
    p_inspection_id UUID,
    p_compliance_id UUID,
    p_certificate_issued BOOLEAN,
    p_certificate_number VARCHAR(100) DEFAULT NULL,
    p_certificate_expiry DATE DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    -- Update inspection record
    UPDATE compliance_inspections
    SET certificate_issued = p_certificate_issued,
        certificate_number = p_certificate_number,
        certificate_expiry_date = p_certificate_expiry
    WHERE id = p_inspection_id;
    
    -- Update compliance record if certificate issued
    IF p_certificate_issued AND p_compliance_id IS NOT NULL THEN
        UPDATE venue_compliance
        SET compliance_status = 'valid',
            certificate_number = p_certificate_number,
            expiry_date = p_certificate_expiry,
            verification_date = NOW(),
            is_verified = TRUE
        WHERE id = p_compliance_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to generate compliance report
CREATE OR REPLACE FUNCTION generate_compliance_report(
    p_venue_id UUID,
    p_report_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    compliance_type compliance_type,
    compliance_name VARCHAR(200),
    status compliance_status,
    expiry_date DATE,
    days_to_expiry INTEGER,
    violations_count BIGINT,
    last_inspection_date DATE,
    next_action_required TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vc.compliance_type,
        vc.compliance_name,
        vc.compliance_status,
        vc.expiry_date,
        CASE WHEN vc.expiry_date IS NOT NULL 
             THEN (vc.expiry_date - p_report_date)::INTEGER 
             ELSE NULL END as days_to_expiry,
        COALESCE(viol.violation_count, 0) as violations_count,
        insp.last_inspection_date,
        CASE 
            WHEN vc.compliance_status = 'expired' THEN 'Immediate renewal required'
            WHEN vc.expiry_date <= p_report_date + INTERVAL '30 days' THEN 'Renewal process should begin'
            WHEN COALESCE(viol.violation_count, 0) > 0 THEN 'Address open violations'
            ELSE 'No immediate action required'
        END as next_action_required
    FROM venue_compliance vc
    LEFT JOIN (
        SELECT compliance_id, COUNT(*) as violation_count
        FROM compliance_violations
        WHERE venue_id = p_venue_id AND violation_status = 'open'
        GROUP BY compliance_id
    ) viol ON vc.id = viol.compliance_id
    LEFT JOIN (
        SELECT compliance_id, MAX(inspection_date) as last_inspection_date
        FROM compliance_inspections
        WHERE venue_id = p_venue_id
        GROUP BY compliance_id
    ) insp ON vc.id = insp.compliance_id
    WHERE vc.venue_id = p_venue_id
    AND vc.is_current_version = TRUE
    ORDER BY 
        CASE vc.compliance_status 
            WHEN 'expired' THEN 1
            WHEN 'suspended' THEN 2
            WHEN 'pending_renewal' THEN 3
            ELSE 4
        END,
        vc.expiry_date NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE venue_compliance IS 'Comprehensive venue compliance tracking with regulatory oversight and document management';
COMMENT ON TABLE compliance_violations IS 'Compliance violations tracking with remediation and resolution management';
COMMENT ON TABLE compliance_inspections IS 'Compliance inspections and audit activities with detailed findings';
COMMENT ON TABLE compliance_reminders IS 'Automated reminder system for compliance renewals and deadlines';

-- Venue compliance table comments
COMMENT ON COLUMN venue_compliance.compliance_type IS 'Type of compliance: business license, permits, certificates, insurance, etc.';
COMMENT ON COLUMN venue_compliance.issuing_authority IS 'Regulatory authority: government agency or organization that issued compliance';
COMMENT ON COLUMN venue_compliance.permit_number IS 'Official identifier: permit, license, or certificate number';
COMMENT ON COLUMN venue_compliance.requirements IS 'Compliance requirements: JSON object with specific requirements and conditions';
COMMENT ON COLUMN venue_compliance.digital_signature_hash IS 'Document integrity: hash for verifying document authenticity';
COMMENT ON COLUMN venue_compliance.is_current_version IS 'Version control: indicates if this is the current active version';

-- Compliance violations table comments
COMMENT ON COLUMN compliance_violations.severity IS 'Violation severity: impact level requiring different response urgency';
COMMENT ON COLUMN compliance_violations.required_actions IS 'Remediation requirements: specific actions needed to resolve violation';
COMMENT ON COLUMN compliance_violations.remediation_deadline IS 'Compliance deadline: date by which violation must be resolved';
COMMENT ON COLUMN compliance_violations.appeal_filed IS 'Appeal status: whether violation is being disputed through official channels';

-- Compliance inspections table comments
COMMENT ON COLUMN compliance_inspections.overall_result IS 'Inspection outcome: pass, fail, conditional pass, or requires follow-up';
COMMENT ON COLUMN compliance_inspections.violations_found IS 'Violations count: number of violations identified during inspection';
COMMENT ON COLUMN compliance_inspections.follow_up_inspection_required IS 'Follow-up required: whether additional inspection is needed';

-- =====================================================
-- VENUE COMPLIANCE SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive venue compliance management system with:
-- - 16 compliance types covering all regulatory requirements
-- - Document storage and digital signature verification
-- - Violation tracking with remediation workflows
-- - Inspection management with detailed findings
-- - Automated reminder system with configurable notifications
-- - Compliance status monitoring and reporting
-- - Regulatory authority contact management
-- - Appeal and dispute process tracking
-- - Comprehensive audit trail and version control
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_venue_compliance_tenant_id ON venue_compliance(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_compliance_tenant_created ON venue_compliance(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
