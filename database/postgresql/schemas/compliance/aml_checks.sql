-- TicketToken AML Checks Schema
-- Week 3, Day 15: Anti-Money Laundering compliance checks
-- Purpose: Monitor and flag suspicious financial activities for compliance

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS compliance;

-- Set search path
SET search_path TO compliance, public;

-- Create aml_checks table
CREATE TABLE IF NOT EXISTS aml_checks (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Foreign keys
   customer_profile_id UUID NOT NULL,                   -- Customer being checked
   transaction_id UUID,                                 -- Specific transaction (if applicable)
   event_id UUID,                                       -- Related event (if applicable)
   
   -- Check details
   check_type VARCHAR(20) NOT NULL,                     -- transaction, customer, pattern
   check_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, cleared, flagged, escalated
   
   -- Transaction data
   amount DECIMAL(12,2),                                -- Transaction amount
   currency VARCHAR(3) DEFAULT 'USD',                   -- Currency code
   payment_method VARCHAR(50),                          -- Payment method used
   transaction_count INTEGER DEFAULT 1,                 -- Number of transactions analyzed
   
   -- Risk scoring
   risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
   risk_level VARCHAR(10) DEFAULT 'low',                -- low, medium, high, critical
   
   -- Rule triggers
   triggered_rules TEXT[] DEFAULT '{}',                 -- Array of rule IDs triggered
   rule_scores JSONB DEFAULT '{}',                      -- Individual rule scores
   pattern_detected VARCHAR(100),                       -- Type of pattern detected
   
   -- Thresholds
   daily_limit DECIMAL(12,2),                           -- Daily transaction limit
   monthly_limit DECIMAL(12,2),                         -- Monthly transaction limit
   exceeded_threshold BOOLEAN DEFAULT false,            -- Whether limits exceeded
   
   -- Suspicious patterns
   structuring_detected BOOLEAN DEFAULT false,          -- Breaking up transactions
   rapid_movement BOOLEAN DEFAULT false,                -- Quick in/out of funds
   unusual_pattern TEXT,                                -- Description of unusual activity
   
   -- Geographic risk
   country_risk_score INTEGER DEFAULT 0,                -- Risk score for country (0-100)
   high_risk_country BOOLEAN DEFAULT false,             -- Transaction involves high-risk country
   ip_country VARCHAR(2),                               -- Country code from IP
   
   -- Customer behavior
   velocity_score INTEGER DEFAULT 0,                    -- Transaction velocity score
   behavior_change_score INTEGER DEFAULT 0,             -- Deviation from normal behavior
   account_age_days INTEGER,                            -- Age of customer account
   
   -- Related parties
   related_customer_ids UUID[] DEFAULT '{}',            -- Other customers in network
   network_risk_score INTEGER DEFAULT 0,                -- Risk from connected accounts
   
   -- Investigation
   investigation_status VARCHAR(20),                    -- open, in_progress, closed
   investigator_id UUID,                                -- Assigned investigator
   investigation_notes TEXT,                            -- Investigation details
   
   -- Regulatory reporting
   sar_filed BOOLEAN DEFAULT false,                     -- Suspicious Activity Report filed
   sar_reference VARCHAR(100),                          -- SAR reference number
   reported_to_authorities BOOLEAN DEFAULT false,       -- Reported to authorities
   
   -- Clearance information
   cleared_by UUID,                                     -- User who cleared the check
   cleared_at TIMESTAMP WITH TIME ZONE,                 -- When check was cleared
   clearance_reason TEXT,                               -- Reason for clearance
   
   -- Automated actions taken
   account_frozen BOOLEAN DEFAULT false,                -- Account frozen due to risk
   transactions_blocked BOOLEAN DEFAULT false,          -- Transactions blocked
   enhanced_monitoring BOOLEAN DEFAULT false,           -- Enhanced monitoring enabled
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   last_reviewed_at TIMESTAMP WITH TIME ZONE,           -- Last manual review
   
   -- Constraints
   CONSTRAINT chk_check_type CHECK (check_type IN ('transaction', 'customer', 'pattern')),
   CONSTRAINT chk_check_status CHECK (check_status IN ('pending', 'cleared', 'flagged', 'escalated')),
   CONSTRAINT chk_risk_level CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
   CONSTRAINT chk_investigation_status CHECK (investigation_status IS NULL OR investigation_status IN ('open', 'in_progress', 'closed')),
   CONSTRAINT chk_currency CHECK (currency ~ '^[A-Z]{3}$'),
   CONSTRAINT chk_country_risk CHECK (country_risk_score >= 0 AND country_risk_score <= 100),
   CONSTRAINT chk_velocity_score CHECK (velocity_score >= 0 AND velocity_score <= 100),
   CONSTRAINT chk_behavior_change CHECK (behavior_change_score >= 0 AND behavior_change_score <= 100),
   CONSTRAINT chk_network_risk CHECK (network_risk_score >= 0 AND network_risk_score <= 100)
);

-- Add comments
COMMENT ON TABLE aml_checks IS 'Anti-Money Laundering compliance checks and monitoring';

COMMENT ON COLUMN aml_checks.id IS 'Unique identifier for AML check';
COMMENT ON COLUMN aml_checks.customer_profile_id IS 'Customer being checked for AML compliance';
COMMENT ON COLUMN aml_checks.transaction_id IS 'Specific transaction triggering check';
COMMENT ON COLUMN aml_checks.event_id IS 'Event related to the check';

COMMENT ON COLUMN aml_checks.check_type IS 'Type of AML check performed';
COMMENT ON COLUMN aml_checks.check_status IS 'Current status of the check';

COMMENT ON COLUMN aml_checks.amount IS 'Transaction amount being checked';
COMMENT ON COLUMN aml_checks.currency IS 'Currency code (ISO 4217)';
COMMENT ON COLUMN aml_checks.payment_method IS 'Payment method used';
COMMENT ON COLUMN aml_checks.transaction_count IS 'Number of transactions in this check';

COMMENT ON COLUMN aml_checks.risk_score IS 'Calculated risk score (0-100)';
COMMENT ON COLUMN aml_checks.risk_level IS 'Risk level categorization';

COMMENT ON COLUMN aml_checks.triggered_rules IS 'Array of AML rules that were triggered';
COMMENT ON COLUMN aml_checks.rule_scores IS 'Individual scores for each triggered rule';
COMMENT ON COLUMN aml_checks.pattern_detected IS 'Type of suspicious pattern detected';

COMMENT ON COLUMN aml_checks.daily_limit IS 'Daily transaction limit for comparison';
COMMENT ON COLUMN aml_checks.monthly_limit IS 'Monthly transaction limit for comparison';
COMMENT ON COLUMN aml_checks.exceeded_threshold IS 'Whether transaction limits were exceeded';

COMMENT ON COLUMN aml_checks.structuring_detected IS 'Detected transaction structuring/smurfing';
COMMENT ON COLUMN aml_checks.rapid_movement IS 'Detected rapid movement of funds';
COMMENT ON COLUMN aml_checks.unusual_pattern IS 'Description of any unusual patterns';

COMMENT ON COLUMN aml_checks.country_risk_score IS 'Risk score based on countries involved';
COMMENT ON COLUMN aml_checks.high_risk_country IS 'Whether high-risk country is involved';
COMMENT ON COLUMN aml_checks.ip_country IS 'Country detected from IP address';

COMMENT ON COLUMN aml_checks.velocity_score IS 'Score based on transaction velocity';
COMMENT ON COLUMN aml_checks.behavior_change_score IS 'Score based on behavior deviation';
COMMENT ON COLUMN aml_checks.account_age_days IS 'Age of customer account in days';

COMMENT ON COLUMN aml_checks.related_customer_ids IS 'Other customers in transaction network';
COMMENT ON COLUMN aml_checks.network_risk_score IS 'Risk score from network analysis';

COMMENT ON COLUMN aml_checks.investigation_status IS 'Status of manual investigation';
COMMENT ON COLUMN aml_checks.investigator_id IS 'User assigned to investigate';
COMMENT ON COLUMN aml_checks.investigation_notes IS 'Notes from investigation';

COMMENT ON COLUMN aml_checks.sar_filed IS 'Whether SAR was filed';
COMMENT ON COLUMN aml_checks.sar_reference IS 'Reference number of filed SAR';
COMMENT ON COLUMN aml_checks.reported_to_authorities IS 'Whether reported to authorities';

COMMENT ON COLUMN aml_checks.cleared_by IS 'User who cleared the check';
COMMENT ON COLUMN aml_checks.cleared_at IS 'When check was cleared';
COMMENT ON COLUMN aml_checks.clearance_reason IS 'Reason for clearing the check';

COMMENT ON COLUMN aml_checks.account_frozen IS 'Whether account was frozen';
COMMENT ON COLUMN aml_checks.transactions_blocked IS 'Whether transactions were blocked';
COMMENT ON COLUMN aml_checks.enhanced_monitoring IS 'Whether enhanced monitoring was enabled';

COMMENT ON COLUMN aml_checks.last_reviewed_at IS 'Last manual review timestamp';

-- Create indexes

-- Primary lookups
CREATE INDEX idx_aml_checks_customer_profile_id ON aml_checks(customer_profile_id);
CREATE INDEX idx_aml_checks_transaction_id ON aml_checks(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_aml_checks_event_id ON aml_checks(event_id) WHERE event_id IS NOT NULL;

-- Status and monitoring
CREATE INDEX idx_aml_checks_check_status ON aml_checks(check_status);
CREATE INDEX idx_aml_checks_risk_score ON aml_checks(risk_score DESC);
CREATE INDEX idx_aml_checks_risk_level ON aml_checks(risk_level);

-- High risk tracking
CREATE INDEX idx_aml_checks_high_risk ON aml_checks(risk_score DESC, check_status) 
   WHERE risk_score >= 70;
CREATE INDEX idx_aml_checks_flagged ON aml_checks(customer_profile_id, created_at DESC) 
   WHERE check_status IN ('flagged', 'escalated');

-- Investigation tracking
CREATE INDEX idx_aml_checks_investigation ON aml_checks(investigation_status, investigator_id) 
   WHERE investigation_status IS NOT NULL;

-- Reporting
CREATE INDEX idx_aml_checks_sar_filed ON aml_checks(sar_filed, created_at DESC) 
   WHERE sar_filed = true;

-- Temporal indexes
CREATE INDEX idx_aml_checks_created_at ON aml_checks(created_at DESC);
CREATE INDEX idx_aml_checks_last_reviewed ON aml_checks(last_reviewed_at DESC) 
   WHERE last_reviewed_at IS NOT NULL;

-- JSONB index
CREATE INDEX idx_aml_checks_rule_scores ON aml_checks USING GIN(rule_scores);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_aml_checks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_aml_checks_updated_at 
   BEFORE UPDATE ON aml_checks
   FOR EACH ROW EXECUTE FUNCTION update_aml_checks_updated_at();

-- Create trigger for automatic risk scoring
CREATE OR REPLACE FUNCTION calculate_aml_risk_score()
RETURNS TRIGGER AS $$
DECLARE
   v_risk_score INTEGER := 0;
   v_risk_level VARCHAR(10);
BEGIN
   -- Base score from individual components
   v_risk_score := COALESCE(NEW.country_risk_score, 0) * 0.3 +
                   COALESCE(NEW.velocity_score, 0) * 0.2 +
                   COALESCE(NEW.behavior_change_score, 0) * 0.2 +
                   COALESCE(NEW.network_risk_score, 0) * 0.3;
   
   -- Add penalties for suspicious patterns
   IF NEW.structuring_detected THEN
       v_risk_score := v_risk_score + 20;
   END IF;
   
   IF NEW.rapid_movement THEN
       v_risk_score := v_risk_score + 15;
   END IF;
   
   IF NEW.exceeded_threshold THEN
       v_risk_score := v_risk_score + 10;
   END IF;
   
   IF NEW.high_risk_country THEN
       v_risk_score := v_risk_score + 15;
   END IF;
   
   -- Account age factor (newer accounts are riskier)
   IF NEW.account_age_days IS NOT NULL AND NEW.account_age_days < 30 THEN
       v_risk_score := v_risk_score + 10;
   END IF;
   
   -- Cap at 100
   v_risk_score := LEAST(v_risk_score, 100);
   
   -- Set risk level
   CASE
       WHEN v_risk_score >= 75 THEN v_risk_level := 'critical';
       WHEN v_risk_score >= 50 THEN v_risk_level := 'high';
       WHEN v_risk_score >= 25 THEN v_risk_level := 'medium';
       ELSE v_risk_level := 'low';
   END CASE;
   
   NEW.risk_score := v_risk_score;
   NEW.risk_level := v_risk_level;
   
   -- Auto-escalate critical risks
   IF v_risk_level = 'critical' AND NEW.check_status = 'pending' THEN
       NEW.check_status := 'escalated';
       NEW.enhanced_monitoring := true;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_aml_risk_score_trigger
   BEFORE INSERT OR UPDATE ON aml_checks
   FOR EACH ROW EXECUTE FUNCTION calculate_aml_risk_score();

-- Create view for AML dashboard
CREATE OR REPLACE VIEW aml_monitoring_dashboard AS
SELECT 
   check_status,
   risk_level,
   COUNT(*) as total_checks,
   COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_checks,
   COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_checks,
   COUNT(*) FILTER (WHERE sar_filed = true) as sars_filed,
   COUNT(*) FILTER (WHERE investigation_status IS NOT NULL) as under_investigation,
   AVG(risk_score) as avg_risk_score,
   MAX(risk_score) as max_risk_score
FROM aml_checks
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY check_status, risk_level
ORDER BY 
   CASE risk_level 
       WHEN 'critical' THEN 1 
       WHEN 'high' THEN 2 
       WHEN 'medium' THEN 3 
       WHEN 'low' THEN 4 
   END,
   check_status;

COMMENT ON VIEW aml_monitoring_dashboard IS 'AML monitoring dashboard summary view';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON aml_checks TO app_user;
-- GRANT SELECT ON aml_monitoring_dashboard TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_aml_checks_tenant_id ON aml_checks(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aml_checks_tenant_created ON aml_checks(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

