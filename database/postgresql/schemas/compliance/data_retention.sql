-- TicketToken Data Retention Schema
-- Week 3, Day 15: Data retention policies and lifecycle management
-- Purpose: Define and enforce data retention policies for compliance and business needs

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS compliance;

-- Set search path
SET search_path TO compliance, public;

-- Create data_retention table
CREATE TABLE IF NOT EXISTS data_retention (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Policy details
   policy_name VARCHAR(255) UNIQUE NOT NULL,            -- Unique policy name
   policy_type VARCHAR(20) NOT NULL,                    -- regulatory, business, technical
   is_active BOOLEAN DEFAULT true,                      -- Whether policy is active
   
   -- Data classification
   data_category VARCHAR(100) NOT NULL,                 -- Category of data (transactions, user_data, etc.)
   data_type VARCHAR(100) NOT NULL,                     -- Specific type of data
   sensitivity_level VARCHAR(20) NOT NULL,              -- public, internal, confidential, restricted
   
   -- Retention rules
   retention_period_days INTEGER,                       -- Retention in days
   retention_period_years INTEGER,                      -- Retention in years
   retention_basis VARCHAR(20) DEFAULT 'creation_date', -- creation_date, last_modified, last_accessed
   
   -- Legal requirements
   regulatory_requirement VARCHAR(255),                 -- Which regulation requires this
   jurisdiction VARCHAR(100),                           -- Legal jurisdiction
   legal_citation TEXT,                                 -- Legal reference/citation
   
   -- Table/entity mapping
   table_names TEXT[] DEFAULT '{}',                     -- Database tables covered
   column_names TEXT[] DEFAULT '{}',                    -- Specific columns (if applicable)
   entity_types TEXT[] DEFAULT '{}',                    -- Business entity types
   
   -- Deletion rules
   deletion_method VARCHAR(20) DEFAULT 'soft_delete',   -- soft_delete, hard_delete, anonymize, archive
   deletion_schedule VARCHAR(50),                       -- Cron expression or schedule
   
   -- Exceptions
   exception_criteria JSONB DEFAULT '{}',               -- Criteria for exceptions
   legal_hold BOOLEAN DEFAULT false,                    -- Under legal hold
   litigation_hold_ids UUID[] DEFAULT '{}',             -- Related litigation holds
   
   -- Archive settings
   archive_after_days INTEGER,                          -- Days before archiving
   archive_location VARCHAR(255),                       -- Where to archive
   archive_format VARCHAR(50),                          -- Format for archives
   
   -- Anonymization
   anonymization_rules JSONB DEFAULT '{}',              -- Rules for anonymization
   fields_to_preserve TEXT[] DEFAULT '{}',              -- Fields to keep during anonymization
   anonymization_method VARCHAR(50),                    -- Method of anonymization
   
   -- Purge tracking
   last_purge_date TIMESTAMP WITH TIME ZONE,            -- Last purge execution
   next_purge_date TIMESTAMP WITH TIME ZONE,            -- Next scheduled purge
   records_purged_count BIGINT DEFAULT 0,               -- Total records purged
   
   -- Audit requirements
   audit_before_deletion BOOLEAN DEFAULT true,          -- Audit before deleting
   approval_required BOOLEAN DEFAULT false,             -- Requires approval
   approvers UUID[] DEFAULT '{}',                       -- Who can approve deletions
   
   -- Restoration
   is_restorable BOOLEAN DEFAULT false,                 -- Can data be restored
   restoration_period_days INTEGER,                     -- How long data can be restored
   restoration_process TEXT,                            -- How to restore data
   
   -- Compliance tracking
   compliance_check_frequency VARCHAR(20),              -- How often to check compliance
   last_compliance_check TIMESTAMP WITH TIME ZONE,      -- Last compliance check
   compliance_status VARCHAR(20),                       -- compliant, non_compliant, pending
   
   -- Notifications
   notify_before_deletion BOOLEAN DEFAULT true,         -- Send notifications
   notification_days INTEGER DEFAULT 30,                -- Days before deletion to notify
   notification_recipients TEXT[] DEFAULT '{}',         -- Who to notify
   
   -- Metadata
   business_justification TEXT,                         -- Business reason for policy
   data_owner UUID,                                     -- Who owns this data
   review_frequency VARCHAR(20) DEFAULT 'annual',       -- How often to review policy
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   created_by UUID,                                     -- Who created policy
   last_reviewed_by UUID,                               -- Who last reviewed
   
   -- Constraints
   CONSTRAINT chk_policy_type CHECK (policy_type IN ('regulatory', 'business', 'technical')),
   CONSTRAINT chk_sensitivity_level CHECK (sensitivity_level IN ('public', 'internal', 'confidential', 'restricted')),
   CONSTRAINT chk_retention_basis CHECK (retention_basis IN ('creation_date', 'last_modified', 'last_accessed')),
   CONSTRAINT chk_deletion_method CHECK (deletion_method IN ('soft_delete', 'hard_delete', 'anonymize', 'archive')),
   CONSTRAINT chk_compliance_status CHECK (compliance_status IS NULL OR compliance_status IN ('compliant', 'non_compliant', 'pending')),
   CONSTRAINT chk_review_frequency CHECK (review_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual')),
   CONSTRAINT chk_retention_period CHECK (
       (retention_period_days IS NOT NULL AND retention_period_days > 0) OR 
       (retention_period_years IS NOT NULL AND retention_period_years > 0)
   ),
   CONSTRAINT chk_restoration CHECK (
       (is_restorable = false) OR 
       (is_restorable = true AND restoration_period_days IS NOT NULL AND restoration_period_days > 0)
   )
);

-- Add comments
COMMENT ON TABLE data_retention IS 'Data retention policies for compliance and lifecycle management';

COMMENT ON COLUMN data_retention.id IS 'Unique identifier for retention policy';

COMMENT ON COLUMN data_retention.policy_name IS 'Unique name for the policy';
COMMENT ON COLUMN data_retention.policy_type IS 'Type: regulatory, business, or technical';
COMMENT ON COLUMN data_retention.is_active IS 'Whether policy is currently active';

COMMENT ON COLUMN data_retention.data_category IS 'Category of data covered';
COMMENT ON COLUMN data_retention.data_type IS 'Specific type of data';
COMMENT ON COLUMN data_retention.sensitivity_level IS 'Data sensitivity classification';

COMMENT ON COLUMN data_retention.retention_period_days IS 'Retention period in days';
COMMENT ON COLUMN data_retention.retention_period_years IS 'Retention period in years';
COMMENT ON COLUMN data_retention.retention_basis IS 'Date basis for retention calculation';

COMMENT ON COLUMN data_retention.regulatory_requirement IS 'Regulation requiring this retention';
COMMENT ON COLUMN data_retention.jurisdiction IS 'Legal jurisdiction for requirement';
COMMENT ON COLUMN data_retention.legal_citation IS 'Legal reference or citation';

COMMENT ON COLUMN data_retention.table_names IS 'Database tables covered by policy';
COMMENT ON COLUMN data_retention.column_names IS 'Specific columns covered';
COMMENT ON COLUMN data_retention.entity_types IS 'Business entities covered';

COMMENT ON COLUMN data_retention.deletion_method IS 'How data is deleted';
COMMENT ON COLUMN data_retention.deletion_schedule IS 'Schedule for deletion runs';

COMMENT ON COLUMN data_retention.exception_criteria IS 'Criteria for retention exceptions';
COMMENT ON COLUMN data_retention.legal_hold IS 'Whether under legal hold';
COMMENT ON COLUMN data_retention.litigation_hold_ids IS 'Related litigation hold IDs';

COMMENT ON COLUMN data_retention.archive_after_days IS 'Days before archiving';
COMMENT ON COLUMN data_retention.archive_location IS 'Where archives are stored';
COMMENT ON COLUMN data_retention.archive_format IS 'Format for archived data';

COMMENT ON COLUMN data_retention.anonymization_rules IS 'Rules for anonymizing data';
COMMENT ON COLUMN data_retention.fields_to_preserve IS 'Fields to keep when anonymizing';
COMMENT ON COLUMN data_retention.anonymization_method IS 'Method used for anonymization';

COMMENT ON COLUMN data_retention.last_purge_date IS 'When last purge was executed';
COMMENT ON COLUMN data_retention.next_purge_date IS 'When next purge is scheduled';
COMMENT ON COLUMN data_retention.records_purged_count IS 'Total records purged to date';

COMMENT ON COLUMN data_retention.audit_before_deletion IS 'Whether to audit before deletion';
COMMENT ON COLUMN data_retention.approval_required IS 'Whether deletion requires approval';
COMMENT ON COLUMN data_retention.approvers IS 'Users who can approve deletions';

COMMENT ON COLUMN data_retention.is_restorable IS 'Whether deleted data can be restored';
COMMENT ON COLUMN data_retention.restoration_period_days IS 'How long data can be restored';
COMMENT ON COLUMN data_retention.restoration_process IS 'Process for restoring data';

COMMENT ON COLUMN data_retention.compliance_check_frequency IS 'How often to check compliance';
COMMENT ON COLUMN data_retention.last_compliance_check IS 'Last compliance check date';
COMMENT ON COLUMN data_retention.compliance_status IS 'Current compliance status';

COMMENT ON COLUMN data_retention.notify_before_deletion IS 'Whether to send notifications';
COMMENT ON COLUMN data_retention.notification_days IS 'Days before deletion to notify';
COMMENT ON COLUMN data_retention.notification_recipients IS 'Who receives notifications';

COMMENT ON COLUMN data_retention.business_justification IS 'Business reason for policy';
COMMENT ON COLUMN data_retention.data_owner IS 'User responsible for data';
COMMENT ON COLUMN data_retention.review_frequency IS 'How often to review policy';

-- Create indexes

-- Primary lookups
CREATE INDEX idx_data_retention_policy_name ON data_retention(policy_name);
CREATE INDEX idx_data_retention_data_category ON data_retention(data_category);
CREATE INDEX idx_data_retention_data_type ON data_retention(data_type);

-- Active policies
CREATE INDEX idx_data_retention_active ON data_retention(is_active, policy_type)
   WHERE is_active = true;

-- Purge scheduling
CREATE INDEX idx_data_retention_next_purge ON data_retention(next_purge_date)
   WHERE next_purge_date IS NOT NULL AND is_active = true;

-- Legal holds
CREATE INDEX idx_data_retention_legal_hold ON data_retention(legal_hold)
   WHERE legal_hold = true;

-- Compliance tracking
CREATE INDEX idx_data_retention_compliance ON data_retention(compliance_status, last_compliance_check);

-- Table mappings
CREATE INDEX idx_data_retention_tables ON data_retention USING GIN(table_names);

-- Created/Updated
CREATE INDEX idx_data_retention_created_at ON data_retention(created_at DESC);
CREATE INDEX idx_data_retention_updated_at ON data_retention(updated_at DESC);

-- JSONB indexes
CREATE INDEX idx_data_retention_exceptions ON data_retention USING GIN(exception_criteria);
CREATE INDEX idx_data_retention_anonymization ON data_retention USING GIN(anonymization_rules);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_data_retention_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_data_retention_updated_at 
   BEFORE UPDATE ON data_retention
   FOR EACH ROW EXECUTE FUNCTION update_data_retention_updated_at();

-- Create function to calculate next purge date
CREATE OR REPLACE FUNCTION calculate_next_purge_date()
RETURNS TRIGGER AS $$
DECLARE
   v_retention_days INTEGER;
BEGIN
   -- Calculate total retention days
   v_retention_days := COALESCE(NEW.retention_period_days, 0) + 
                      COALESCE(NEW.retention_period_years * 365, 0);
   
   -- Set next purge date if not under legal hold
   IF NEW.is_active AND NOT NEW.legal_hold AND v_retention_days > 0 THEN
       NEW.next_purge_date := CURRENT_TIMESTAMP + (v_retention_days || ' days')::INTERVAL;
   ELSE
       NEW.next_purge_date := NULL;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_next_purge_date_trigger
   BEFORE INSERT OR UPDATE ON data_retention
   FOR EACH ROW EXECUTE FUNCTION calculate_next_purge_date();

-- Create view for retention dashboard
CREATE OR REPLACE VIEW data_retention_dashboard AS
SELECT 
   policy_type,
   sensitivity_level,
   COUNT(*) as total_policies,
   COUNT(*) FILTER (WHERE is_active) as active_policies,
   COUNT(*) FILTER (WHERE legal_hold) as legal_holds,
   COUNT(*) FILTER (WHERE next_purge_date <= CURRENT_DATE + INTERVAL '30 days') as purge_upcoming,
   COUNT(*) FILTER (WHERE compliance_status = 'non_compliant') as non_compliant,
   SUM(records_purged_count) as total_records_purged
FROM data_retention
GROUP BY policy_type, sensitivity_level
ORDER BY policy_type, 
   CASE sensitivity_level 
       WHEN 'restricted' THEN 1 
       WHEN 'confidential' THEN 2 
       WHEN 'internal' THEN 3 
       WHEN 'public' THEN 4 
   END;

COMMENT ON VIEW data_retention_dashboard IS 'Dashboard view for data retention policies';

-- Insert sample retention policies
INSERT INTO data_retention (
   policy_name, policy_type, data_category, data_type, sensitivity_level,
   retention_period_years, deletion_method, regulatory_requirement,
   jurisdiction, table_names, business_justification
) VALUES 
   ('Customer KYC Data Retention', 'regulatory', 'customer_data', 'kyc_documents', 'restricted',
    7, 'hard_delete', 'AML/CFT Requirements', 'US',
    '{kyc_records, kyc_documents}', 'Required by FinCEN for AML compliance'),
    
   ('Transaction Records Retention', 'regulatory', 'financial_data', 'transactions', 'confidential',
    5, 'archive', 'Financial Recordkeeping', 'US',
    '{transactions, transaction_details}', 'IRS and financial audit requirements'),
    
   ('Marketing Analytics Retention', 'business', 'analytics_data', 'user_behavior', 'internal',
    2, 'anonymize', NULL, NULL,
    '{user_analytics, marketing_events}', 'Business analytics and trend analysis'),
    
   ('System Logs Retention', 'technical', 'system_data', 'audit_logs', 'internal',
    1, 'archive', 'Security Best Practices', 'Global',
    '{audit_logs, system_events}', 'Security monitoring and incident response')
ON CONFLICT (policy_name) DO NOTHING;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON data_retention TO app_user;
-- GRANT SELECT ON data_retention_dashboard TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_data_retention_tenant_id ON data_retention(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_retention_tenant_created ON data_retention(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

