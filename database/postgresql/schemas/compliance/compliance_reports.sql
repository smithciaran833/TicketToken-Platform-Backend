-- TicketToken Compliance Reports Schema
-- Week 3, Day 15: Regulatory compliance reporting
-- Purpose: Manage and track regulatory reports for compliance requirements

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS compliance;

-- Set search path
SET search_path TO compliance, public;

-- Create compliance_reports table
CREATE TABLE IF NOT EXISTS compliance_reports (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Report identification
   report_type VARCHAR(20) NOT NULL,                    -- sar, ctr, periodic, audit
   report_name VARCHAR(255) NOT NULL,                   -- Human-readable report name
   report_number VARCHAR(100) UNIQUE NOT NULL,          -- Unique report identifier
   
   -- Regulatory details
   regulator VARCHAR(255) NOT NULL,                     -- Regulatory body (FinCEN, FCA, etc.)
   jurisdiction VARCHAR(100) NOT NULL,                  -- Jurisdiction (US, UK, EU, etc.)
   regulation_reference VARCHAR(255),                   -- Specific regulation reference
   
   -- Report period
   period_start DATE NOT NULL,                          -- Report period start
   period_end DATE NOT NULL,                            -- Report period end
   reporting_frequency VARCHAR(20),                     -- daily, weekly, monthly, quarterly, annual
   
   -- Report status
   status VARCHAR(20) NOT NULL DEFAULT 'draft',         -- draft, pending_review, approved, submitted, acknowledged, rejected
   
   -- Submission information
   due_date DATE NOT NULL,                              -- When report is due
   submitted_at TIMESTAMP WITH TIME ZONE,               -- When report was submitted
   submission_method VARCHAR(50),                       -- e-filing, mail, portal, api
   confirmation_number VARCHAR(255),                    -- Submission confirmation
   
   -- Report content
   report_data JSONB NOT NULL DEFAULT '{}',            -- Structured report data
   summary TEXT,                                        -- Executive summary
   total_transactions INTEGER DEFAULT 0,                -- Total transactions in period
   flagged_transactions INTEGER DEFAULT 0,              -- Flagged transactions count
   
   -- Financial summary
   total_amount DECIMAL(15,2) DEFAULT 0,                -- Total amount covered
   currency VARCHAR(3) DEFAULT 'USD',                   -- Currency code
   suspicious_amount DECIMAL(15,2) DEFAULT 0,           -- Suspicious amount total
   
   -- Entities covered
   customer_count INTEGER DEFAULT 0,                    -- Number of customers in report
   customer_ids UUID[] DEFAULT '{}',                    -- Customer IDs included
   high_risk_customers INTEGER DEFAULT 0,               -- High-risk customer count
   
   -- Findings
   findings_count INTEGER DEFAULT 0,                    -- Total findings
   critical_findings INTEGER DEFAULT 0,                 -- Critical findings count
   findings_details JSONB DEFAULT '[]',                 -- Detailed findings array
   
   -- Attachments
   attachment_urls TEXT[] DEFAULT '{}',                 -- URLs to attachments
   supporting_documents JSONB DEFAULT '{}',             -- Supporting documentation
   evidence_links TEXT[] DEFAULT '{}',                  -- Links to evidence
   
   -- Review process
   prepared_by UUID,                                    -- User who prepared report
   reviewed_by UUID,                                    -- User who reviewed report
   approved_by UUID,                                    -- User who approved report
   approval_notes TEXT,                                 -- Notes from approval
   
   -- Amendments
   is_amendment BOOLEAN DEFAULT false,                  -- Whether this is an amendment
   original_report_id UUID,                             -- Reference to original report
   amendment_reason TEXT,                               -- Reason for amendment
   
   -- Retention
   retention_years INTEGER DEFAULT 7,                   -- Years to retain report
   destruction_date DATE,                               -- Scheduled destruction date
   archived BOOLEAN DEFAULT false,                      -- Whether report is archived
   
   -- Audit trail
   modifications JSONB DEFAULT '[]',                    -- Array of modifications
   access_log JSONB DEFAULT '[]',                       -- Array of access events
   
   -- Metadata
   tags TEXT[] DEFAULT '{}',                            -- Tags for categorization
   internal_reference VARCHAR(255),                     -- Internal reference number
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   locked_at TIMESTAMP WITH TIME ZONE,                  -- When report was locked
   
   -- Constraints
   CONSTRAINT chk_report_type CHECK (report_type IN ('sar', 'ctr', 'periodic', 'audit')),
   CONSTRAINT chk_status CHECK (status IN ('draft', 'pending_review', 'approved', 'submitted', 'acknowledged', 'rejected')),
   CONSTRAINT chk_reporting_frequency CHECK (reporting_frequency IS NULL OR reporting_frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
   CONSTRAINT chk_submission_method CHECK (submission_method IS NULL OR submission_method IN ('e-filing', 'mail', 'portal', 'api')),
   CONSTRAINT chk_currency CHECK (currency ~ '^[A-Z]{3}$'),
   CONSTRAINT chk_period_dates CHECK (period_end >= period_start),
   CONSTRAINT chk_amounts CHECK (total_amount >= 0 AND suspicious_amount >= 0),
   CONSTRAINT chk_counts CHECK (
       customer_count >= 0 AND 
       total_transactions >= 0 AND 
       flagged_transactions >= 0 AND 
       findings_count >= 0 AND 
       critical_findings >= 0 AND
       high_risk_customers >= 0
   ),
   CONSTRAINT chk_amendment CHECK (
       (is_amendment = false AND original_report_id IS NULL) OR
       (is_amendment = true AND original_report_id IS NOT NULL AND amendment_reason IS NOT NULL)
   )
);

-- Add comments
COMMENT ON TABLE compliance_reports IS 'Regulatory compliance reports and submissions';

COMMENT ON COLUMN compliance_reports.id IS 'Unique identifier for compliance report';

COMMENT ON COLUMN compliance_reports.report_type IS 'Type of report: sar, ctr, periodic, audit';
COMMENT ON COLUMN compliance_reports.report_name IS 'Human-readable name for the report';
COMMENT ON COLUMN compliance_reports.report_number IS 'Unique report number/identifier';

COMMENT ON COLUMN compliance_reports.regulator IS 'Regulatory body receiving the report';
COMMENT ON COLUMN compliance_reports.jurisdiction IS 'Legal jurisdiction for the report';
COMMENT ON COLUMN compliance_reports.regulation_reference IS 'Specific regulation or requirement';

COMMENT ON COLUMN compliance_reports.period_start IS 'Start date of reporting period';
COMMENT ON COLUMN compliance_reports.period_end IS 'End date of reporting period';
COMMENT ON COLUMN compliance_reports.reporting_frequency IS 'How often report is required';

COMMENT ON COLUMN compliance_reports.status IS 'Current status of the report';

COMMENT ON COLUMN compliance_reports.due_date IS 'Regulatory deadline for submission';
COMMENT ON COLUMN compliance_reports.submitted_at IS 'When report was submitted';
COMMENT ON COLUMN compliance_reports.submission_method IS 'How report was submitted';
COMMENT ON COLUMN compliance_reports.confirmation_number IS 'Confirmation from regulator';

COMMENT ON COLUMN compliance_reports.report_data IS 'Structured report data in JSON format';
COMMENT ON COLUMN compliance_reports.summary IS 'Executive summary of report';
COMMENT ON COLUMN compliance_reports.total_transactions IS 'Total transaction count in period';
COMMENT ON COLUMN compliance_reports.flagged_transactions IS 'Number of flagged transactions';

COMMENT ON COLUMN compliance_reports.total_amount IS 'Total monetary amount in report';
COMMENT ON COLUMN compliance_reports.currency IS 'Currency code for amounts';
COMMENT ON COLUMN compliance_reports.suspicious_amount IS 'Total suspicious amount';

COMMENT ON COLUMN compliance_reports.customer_count IS 'Number of customers covered';
COMMENT ON COLUMN compliance_reports.customer_ids IS 'Array of customer IDs in report';
COMMENT ON COLUMN compliance_reports.high_risk_customers IS 'Count of high-risk customers';

COMMENT ON COLUMN compliance_reports.findings_count IS 'Total number of findings';
COMMENT ON COLUMN compliance_reports.critical_findings IS 'Number of critical findings';
COMMENT ON COLUMN compliance_reports.findings_details IS 'Detailed findings information';

COMMENT ON COLUMN compliance_reports.attachment_urls IS 'URLs to report attachments';
COMMENT ON COLUMN compliance_reports.supporting_documents IS 'Supporting documentation';
COMMENT ON COLUMN compliance_reports.evidence_links IS 'Links to supporting evidence';

COMMENT ON COLUMN compliance_reports.prepared_by IS 'User who prepared the report';
COMMENT ON COLUMN compliance_reports.reviewed_by IS 'User who reviewed the report';
COMMENT ON COLUMN compliance_reports.approved_by IS 'User who approved the report';
COMMENT ON COLUMN compliance_reports.approval_notes IS 'Notes from approval process';

COMMENT ON COLUMN compliance_reports.is_amendment IS 'Whether this amends a previous report';
COMMENT ON COLUMN compliance_reports.original_report_id IS 'ID of report being amended';
COMMENT ON COLUMN compliance_reports.amendment_reason IS 'Reason for amendment';

COMMENT ON COLUMN compliance_reports.retention_years IS 'Years to retain report';
COMMENT ON COLUMN compliance_reports.destruction_date IS 'When to destroy report';
COMMENT ON COLUMN compliance_reports.archived IS 'Whether report is archived';

COMMENT ON COLUMN compliance_reports.modifications IS 'Audit trail of modifications';
COMMENT ON COLUMN compliance_reports.access_log IS 'Log of who accessed report';

COMMENT ON COLUMN compliance_reports.tags IS 'Tags for categorization';
COMMENT ON COLUMN compliance_reports.internal_reference IS 'Internal tracking reference';

COMMENT ON COLUMN compliance_reports.locked_at IS 'When report was locked from editing';

-- Create indexes

-- Primary lookups
CREATE INDEX idx_compliance_reports_report_type ON compliance_reports(report_type);
CREATE INDEX idx_compliance_reports_status ON compliance_reports(status);
CREATE INDEX idx_compliance_reports_regulator ON compliance_reports(regulator);

-- Date-based queries
CREATE INDEX idx_compliance_reports_due_date ON compliance_reports(due_date);
CREATE INDEX idx_compliance_reports_period ON compliance_reports(period_start, period_end);
CREATE INDEX idx_compliance_reports_submitted_at ON compliance_reports(submitted_at DESC)
   WHERE submitted_at IS NOT NULL;

-- Pending reports
CREATE INDEX idx_compliance_reports_pending ON compliance_reports(due_date, status)
   WHERE status IN ('draft', 'pending_review', 'approved');

-- Amendments
CREATE INDEX idx_compliance_reports_amendments ON compliance_reports(original_report_id)
   WHERE is_amendment = true;

-- Retention management
CREATE INDEX idx_compliance_reports_destruction ON compliance_reports(destruction_date)
   WHERE destruction_date IS NOT NULL AND archived = false;

-- Created/Updated
CREATE INDEX idx_compliance_reports_created_at ON compliance_reports(created_at DESC);
CREATE INDEX idx_compliance_reports_updated_at ON compliance_reports(updated_at DESC);

-- JSONB indexes
CREATE INDEX idx_compliance_reports_report_data ON compliance_reports USING GIN(report_data);
CREATE INDEX idx_compliance_reports_findings ON compliance_reports USING GIN(findings_details);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_compliance_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_compliance_reports_updated_at 
   BEFORE UPDATE ON compliance_reports
   FOR EACH ROW EXECUTE FUNCTION update_compliance_reports_updated_at();

-- Create trigger to prevent modifications after submission
CREATE OR REPLACE FUNCTION prevent_submitted_report_changes()
RETURNS TRIGGER AS $$
BEGIN
   -- Allow status changes to acknowledged or rejected
   IF OLD.status IN ('submitted', 'acknowledged') AND 
      NEW.status IN ('acknowledged', 'rejected') THEN
       RETURN NEW;
   END IF;
   
   -- Prevent other changes to submitted reports
   IF OLD.status IN ('submitted', 'acknowledged') THEN
       RAISE EXCEPTION 'Cannot modify submitted reports';
   END IF;
   
   -- Lock report when submitted
   IF OLD.status != 'submitted' AND NEW.status = 'submitted' THEN
       NEW.locked_at := CURRENT_TIMESTAMP;
   END IF;
   
   -- Set destruction date based on retention
   IF NEW.submitted_at IS NOT NULL AND NEW.destruction_date IS NULL THEN
       NEW.destruction_date := DATE(NEW.submitted_at) + (NEW.retention_years || ' years')::INTERVAL;
   END IF;
   
   -- Add modification to audit trail
   NEW.modifications := NEW.modifications || jsonb_build_array(
       jsonb_build_object(
           'timestamp', CURRENT_TIMESTAMP,
           'user_id', current_setting('app.current_user_id', true),
           'old_status', OLD.status,
           'new_status', NEW.status
       )
   );
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_submitted_report_changes_trigger
   BEFORE UPDATE ON compliance_reports
   FOR EACH ROW EXECUTE FUNCTION prevent_submitted_report_changes();

-- Create view for report dashboard
CREATE OR REPLACE VIEW compliance_report_dashboard AS
SELECT 
   report_type,
   status,
   COUNT(*) as total_reports,
   COUNT(*) FILTER (WHERE due_date <= CURRENT_DATE + INTERVAL '7 days' AND status NOT IN ('submitted', 'acknowledged')) as due_soon,
   COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('submitted', 'acknowledged')) as overdue,
   COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as recent_reports,
   COUNT(*) FILTER (WHERE is_amendment = true) as amendments,
   SUM(findings_count) as total_findings,
   SUM(critical_findings) as total_critical_findings
FROM compliance_reports
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY report_type, status
ORDER BY report_type, 
   CASE status 
       WHEN 'draft' THEN 1 
       WHEN 'pending_review' THEN 2 
       WHEN 'approved' THEN 3 
       WHEN 'submitted' THEN 4 
       WHEN 'acknowledged' THEN 5 
       WHEN 'rejected' THEN 6 
   END;

COMMENT ON VIEW compliance_report_dashboard IS 'Dashboard view for compliance reporting status';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON compliance_reports TO app_user;
-- GRANT SELECT ON compliance_report_dashboard TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_compliance_reports_tenant_id ON compliance_reports(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_reports_tenant_created ON compliance_reports(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

