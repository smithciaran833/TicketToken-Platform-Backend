-- TicketToken Sanctions Screening Schema
-- Week 3, Day 15: Sanctions list screening for compliance
-- Purpose: Screen customers against global sanctions lists and monitor for matches

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS compliance;

-- Set search path
SET search_path TO compliance, public;

-- Create sanctions_screening table
CREATE TABLE IF NOT EXISTS sanctions_screening (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Foreign key to customer
   customer_profile_id UUID NOT NULL,                   -- Customer being screened
   
   -- Screening details
   screening_type VARCHAR(20) NOT NULL,                 -- onboarding, periodic, triggered
   screening_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, clear, potential_match, confirmed_match
   
   -- Lists checked
   sanctions_lists TEXT[] DEFAULT '{}',                 -- Array of sanctions lists checked
   lists_version VARCHAR(50),                           -- Version of lists used
   last_list_update TIMESTAMP WITH TIME ZONE,           -- When lists were last updated
   
   -- Match information
   match_score DECIMAL(5,2) DEFAULT 0 CHECK (match_score >= 0 AND match_score <= 100),
   match_type VARCHAR(20),                              -- exact, fuzzy, phonetic
   matched_fields TEXT[] DEFAULT '{}',                  -- Which fields matched
   
   -- Entity details
   matched_entity_name VARCHAR(500),                    -- Name of matched entity
   matched_entity_type VARCHAR(50),                     -- individual, organization, vessel
   matched_entity_id VARCHAR(255),                      -- ID in sanctions list
   
   -- Sanctions data
   sanction_type VARCHAR(100),                          -- Type of sanction
   issuing_authority VARCHAR(255),                      -- Who issued the sanction
   sanction_date DATE,                                  -- When sanction was issued
   expiry_date DATE,                                    -- When sanction expires (if applicable)
   
   -- Geographic data
   sanctioned_countries TEXT[] DEFAULT '{}',            -- Countries under sanction
   nationality_match BOOLEAN DEFAULT false,             -- Customer nationality matches
   residence_match BOOLEAN DEFAULT false,               -- Customer residence matches
   
   -- Additional identifiers
   matched_aliases TEXT[] DEFAULT '{}',                 -- Matched alternative names
   matched_documents JSONB DEFAULT '{}',                -- Matched identity documents
   date_of_birth_match BOOLEAN DEFAULT false,           -- DOB matches sanctioned entity
   
   -- Risk assessment
   risk_rating VARCHAR(20),                             -- low, medium, high, critical
   requires_enhanced_due_diligence BOOLEAN DEFAULT false, -- Requires EDD
   
   -- False positive handling
   is_false_positive BOOLEAN DEFAULT false,             -- Marked as false positive
   false_positive_reason TEXT,                          -- Reason for false positive
   confirmed_by UUID,                                   -- Who confirmed false positive
   
   -- Review process
   review_required BOOLEAN DEFAULT true,                -- Requires manual review
   reviewed_by UUID,                                    -- Who reviewed the match
   review_date TIMESTAMP WITH TIME ZONE,                -- When reviewed
   review_decision VARCHAR(50),                         -- approve, reject, escalate
   
   -- Documentation
   supporting_documents JSONB DEFAULT '{}',             -- Supporting documentation
   case_number VARCHAR(100),                            -- Compliance case number
   notes TEXT,                                          -- Additional notes
   
   -- Ongoing monitoring
   monitoring_frequency VARCHAR(20) DEFAULT 'monthly',   -- daily, weekly, monthly, quarterly
   next_check_date DATE,                                -- Next scheduled check
   auto_clear_date DATE,                                -- When to auto-clear if no match
   
   -- Regulatory reporting
   reported_to_compliance BOOLEAN DEFAULT false,        -- Reported to compliance team
   regulatory_filing_id VARCHAR(255),                   -- Regulatory filing reference
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   last_checked_at TIMESTAMP WITH TIME ZONE,            -- Last sanctions check
   
   -- Constraints
   CONSTRAINT chk_screening_type CHECK (screening_type IN ('onboarding', 'periodic', 'triggered')),
   CONSTRAINT chk_screening_status CHECK (screening_status IN ('pending', 'clear', 'potential_match', 'confirmed_match')),
   CONSTRAINT chk_match_type CHECK (match_type IS NULL OR match_type IN ('exact', 'fuzzy', 'phonetic')),
   CONSTRAINT chk_risk_rating CHECK (risk_rating IS NULL OR risk_rating IN ('low', 'medium', 'high', 'critical')),
   CONSTRAINT chk_review_decision CHECK (review_decision IS NULL OR review_decision IN ('approve', 'reject', 'escalate')),
   CONSTRAINT chk_monitoring_frequency CHECK (monitoring_frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
   CONSTRAINT chk_match_score_status CHECK (
       (screening_status = 'clear' AND match_score < 50) OR
       (screening_status IN ('potential_match', 'confirmed_match') AND match_score >= 50) OR
       (screening_status = 'pending')
   )
);

-- Add comments
COMMENT ON TABLE sanctions_screening IS 'Sanctions list screening records for compliance';

COMMENT ON COLUMN sanctions_screening.id IS 'Unique identifier for screening record';
COMMENT ON COLUMN sanctions_screening.customer_profile_id IS 'Customer being screened';

COMMENT ON COLUMN sanctions_screening.screening_type IS 'Type of screening: onboarding, periodic, or triggered';
COMMENT ON COLUMN sanctions_screening.screening_status IS 'Current status of screening';

COMMENT ON COLUMN sanctions_screening.sanctions_lists IS 'Array of sanctions lists checked';
COMMENT ON COLUMN sanctions_screening.lists_version IS 'Version identifier of sanctions lists';
COMMENT ON COLUMN sanctions_screening.last_list_update IS 'When sanctions lists were last updated';

COMMENT ON COLUMN sanctions_screening.match_score IS 'Confidence score of match (0-100)';
COMMENT ON COLUMN sanctions_screening.match_type IS 'Type of matching used';
COMMENT ON COLUMN sanctions_screening.matched_fields IS 'Fields that matched';

COMMENT ON COLUMN sanctions_screening.matched_entity_name IS 'Name of matched sanctioned entity';
COMMENT ON COLUMN sanctions_screening.matched_entity_type IS 'Type of sanctioned entity';
COMMENT ON COLUMN sanctions_screening.matched_entity_id IS 'ID of entity in sanctions database';

COMMENT ON COLUMN sanctions_screening.sanction_type IS 'Type of sanction applied';
COMMENT ON COLUMN sanctions_screening.issuing_authority IS 'Authority that issued sanction';
COMMENT ON COLUMN sanctions_screening.sanction_date IS 'Date sanction was issued';
COMMENT ON COLUMN sanctions_screening.expiry_date IS 'Date sanction expires (if applicable)';

COMMENT ON COLUMN sanctions_screening.sanctioned_countries IS 'Countries involved in sanction';
COMMENT ON COLUMN sanctions_screening.nationality_match IS 'Customer nationality matches sanction';
COMMENT ON COLUMN sanctions_screening.residence_match IS 'Customer residence matches sanction';

COMMENT ON COLUMN sanctions_screening.matched_aliases IS 'Alternative names that matched';
COMMENT ON COLUMN sanctions_screening.matched_documents IS 'Documents that matched';
COMMENT ON COLUMN sanctions_screening.date_of_birth_match IS 'Date of birth matches';

COMMENT ON COLUMN sanctions_screening.risk_rating IS 'Overall risk rating';
COMMENT ON COLUMN sanctions_screening.requires_enhanced_due_diligence IS 'Whether EDD is required';

COMMENT ON COLUMN sanctions_screening.is_false_positive IS 'Marked as false positive';
COMMENT ON COLUMN sanctions_screening.false_positive_reason IS 'Reason for false positive determination';
COMMENT ON COLUMN sanctions_screening.confirmed_by IS 'User who confirmed false positive';

COMMENT ON COLUMN sanctions_screening.review_required IS 'Whether manual review is required';
COMMENT ON COLUMN sanctions_screening.reviewed_by IS 'User who performed review';
COMMENT ON COLUMN sanctions_screening.review_date IS 'Date of review';
COMMENT ON COLUMN sanctions_screening.review_decision IS 'Decision from review';

COMMENT ON COLUMN sanctions_screening.supporting_documents IS 'Supporting documentation';
COMMENT ON COLUMN sanctions_screening.case_number IS 'Compliance case reference';
COMMENT ON COLUMN sanctions_screening.notes IS 'Additional notes';

COMMENT ON COLUMN sanctions_screening.monitoring_frequency IS 'How often to re-screen';
COMMENT ON COLUMN sanctions_screening.next_check_date IS 'Next scheduled screening';
COMMENT ON COLUMN sanctions_screening.auto_clear_date IS 'Date to auto-clear if no issues';

COMMENT ON COLUMN sanctions_screening.reported_to_compliance IS 'Whether reported to compliance';
COMMENT ON COLUMN sanctions_screening.regulatory_filing_id IS 'Regulatory filing reference';

COMMENT ON COLUMN sanctions_screening.last_checked_at IS 'Last time screening was performed';

-- Create indexes

-- Primary lookups
CREATE INDEX idx_sanctions_screening_customer_profile_id ON sanctions_screening(customer_profile_id);
CREATE INDEX idx_sanctions_screening_status ON sanctions_screening(screening_status);
CREATE INDEX idx_sanctions_screening_type ON sanctions_screening(screening_type);

-- Match tracking
CREATE INDEX idx_sanctions_screening_match_score ON sanctions_screening(match_score DESC);
CREATE INDEX idx_sanctions_screening_matches ON sanctions_screening(screening_status, match_score DESC)
   WHERE screening_status IN ('potential_match', 'confirmed_match');

-- Review tracking
CREATE INDEX idx_sanctions_screening_review_required ON sanctions_screening(review_required, created_at DESC)
   WHERE review_required = true;
CREATE INDEX idx_sanctions_screening_false_positives ON sanctions_screening(customer_profile_id, is_false_positive)
   WHERE is_false_positive = true;

-- Monitoring
CREATE INDEX idx_sanctions_screening_next_check ON sanctions_screening(next_check_date)
   WHERE next_check_date IS NOT NULL;
CREATE INDEX idx_sanctions_screening_last_checked ON sanctions_screening(last_checked_at DESC);

-- Risk assessment
CREATE INDEX idx_sanctions_screening_risk_rating ON sanctions_screening(risk_rating)
   WHERE risk_rating IS NOT NULL;
CREATE INDEX idx_sanctions_screening_edd_required ON sanctions_screening(requires_enhanced_due_diligence)
   WHERE requires_enhanced_due_diligence = true;

-- Temporal
CREATE INDEX idx_sanctions_screening_created_at ON sanctions_screening(created_at DESC);

-- JSONB indexes
CREATE INDEX idx_sanctions_screening_matched_documents ON sanctions_screening USING GIN(matched_documents);
CREATE INDEX idx_sanctions_screening_supporting_documents ON sanctions_screening USING GIN(supporting_documents);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_sanctions_screening_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sanctions_screening_updated_at 
   BEFORE UPDATE ON sanctions_screening
   FOR EACH ROW EXECUTE FUNCTION update_sanctions_screening_updated_at();

-- Create function to calculate next check date
CREATE OR REPLACE FUNCTION calculate_next_check_date()
RETURNS TRIGGER AS $$
BEGIN
   -- Calculate next check date based on monitoring frequency
   IF NEW.monitoring_frequency IS NOT NULL AND NEW.screening_status = 'clear' THEN
       CASE NEW.monitoring_frequency
           WHEN 'daily' THEN
               NEW.next_check_date := CURRENT_DATE + INTERVAL '1 day';
           WHEN 'weekly' THEN
               NEW.next_check_date := CURRENT_DATE + INTERVAL '1 week';
           WHEN 'monthly' THEN
               NEW.next_check_date := CURRENT_DATE + INTERVAL '1 month';
           WHEN 'quarterly' THEN
               NEW.next_check_date := CURRENT_DATE + INTERVAL '3 months';
       END CASE;
   END IF;
   
   -- Update last checked timestamp
   NEW.last_checked_at := CURRENT_TIMESTAMP;
   
   -- Set auto-clear date for pending reviews
   IF NEW.screening_status = 'potential_match' AND NEW.auto_clear_date IS NULL THEN
       NEW.auto_clear_date := CURRENT_DATE + INTERVAL '30 days';
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_next_check_date_trigger
   BEFORE INSERT OR UPDATE ON sanctions_screening
   FOR EACH ROW EXECUTE FUNCTION calculate_next_check_date();

-- Create view for sanctions monitoring
CREATE OR REPLACE VIEW sanctions_monitoring_summary AS
SELECT 
   screening_status,
   COUNT(*) as total_screenings,
   COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_screenings,
   COUNT(*) FILTER (WHERE screening_type = 'onboarding') as onboarding_checks,
   COUNT(*) FILTER (WHERE screening_type = 'periodic') as periodic_checks,
   COUNT(*) FILTER (WHERE screening_type = 'triggered') as triggered_checks,
   COUNT(*) FILTER (WHERE is_false_positive = true) as false_positives,
   COUNT(*) FILTER (WHERE review_required = true AND reviewed_by IS NULL) as pending_reviews,
   AVG(match_score) FILTER (WHERE match_score > 0) as avg_match_score,
   MAX(match_score) as max_match_score
FROM sanctions_screening
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY screening_status
ORDER BY 
   CASE screening_status 
       WHEN 'confirmed_match' THEN 1 
       WHEN 'potential_match' THEN 2 
       WHEN 'pending' THEN 3 
       WHEN 'clear' THEN 4 
   END;

COMMENT ON VIEW sanctions_monitoring_summary IS 'Summary view for sanctions screening monitoring';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON sanctions_screening TO app_user;
-- GRANT SELECT ON sanctions_monitoring_summary TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_sanctions_screening_tenant_id ON sanctions_screening(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sanctions_screening_tenant_created ON sanctions_screening(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

