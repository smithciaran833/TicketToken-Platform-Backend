-- TicketToken KYC Records Schema
-- Week 3, Day 14: Know Your Customer verification records
-- Purpose: Store and manage customer identity verification data for compliance

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS compliance;

-- Set search path
SET search_path TO compliance, public;

-- Create kyc_records table
CREATE TABLE IF NOT EXISTS kyc_records (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Foreign key to customer
   customer_profile_id UUID NOT NULL,                   -- Reference to customer_profiles table
   
   -- Verification details
   verification_level VARCHAR(20) NOT NULL DEFAULT 'basic', -- basic, enhanced, full
   verification_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, expired
   
   -- Document information
   document_type VARCHAR(30),                           -- passport, drivers_license, national_id
   document_number_hash VARCHAR(255),                   -- Hashed document number for security
   
   -- Document storage
   document_front_url VARCHAR(500),                     -- Secure URL for document front
   document_back_url VARCHAR(500),                      -- Secure URL for document back
   selfie_url VARCHAR(500),                             -- Secure URL for selfie
   storage_encrypted BOOLEAN DEFAULT true,              -- Whether documents are encrypted
   
   -- Verification timestamps
   submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   verified_at TIMESTAMP WITH TIME ZONE,                -- When verification completed
   expires_at TIMESTAMP WITH TIME ZONE,                 -- When verification expires
   
   -- Provider information
   kyc_provider VARCHAR(100),                           -- Name of KYC provider (Jumio, Onfido, etc.)
   provider_reference_id VARCHAR(255),                  -- Reference ID from provider
   provider_score DECIMAL(5,4),                         -- Confidence score from provider (0.0000-1.0000)
   
   -- Identity data (verified information)
   first_name_verified VARCHAR(100),                    -- Verified first name
   last_name_verified VARCHAR(100),                     -- Verified last name
   date_of_birth_verified DATE,                         -- Verified date of birth
   
   -- Address verification
   address_verified TEXT,                               -- Verified address
   address_proof_type VARCHAR(50),                      -- utility_bill, bank_statement, etc.
   address_match_score DECIMAL(5,4),                    -- Address match confidence (0.0000-1.0000)
   
   -- Biometric data
   face_match_score DECIMAL(5,4),                       -- Face match confidence (0.0000-1.0000)
   liveness_check_passed BOOLEAN,                       -- Whether liveness check passed
   biometric_data_hash VARCHAR(255),                    -- Hash of biometric data
   
   -- Risk assessment
   risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100), -- Risk score 0-100
   risk_factors JSONB DEFAULT '[]',                     -- Array of risk factors identified
   pep_check BOOLEAN DEFAULT false,                     -- Politically Exposed Person check
   sanctions_check BOOLEAN DEFAULT false,               -- Sanctions list check
   
   -- Rejection information
   rejection_reason VARCHAR(100),                       -- Main rejection reason
   rejection_details TEXT,                              -- Detailed rejection explanation
   can_resubmit BOOLEAN DEFAULT true,                   -- Whether customer can resubmit
   
   -- Manual review
   requires_manual_review BOOLEAN DEFAULT false,        -- Flagged for manual review
   reviewed_by UUID,                                    -- User who performed manual review
   review_notes TEXT,                                   -- Manual review notes
   
   -- Compliance flags
   aml_cleared BOOLEAN DEFAULT false,                   -- Anti-Money Laundering cleared
   cft_cleared BOOLEAN DEFAULT false,                   -- Counter-Financing of Terrorism cleared
   regulatory_flags JSONB DEFAULT '{}',                 -- Other regulatory flags
   
   -- Data retention
   retention_period_days INTEGER DEFAULT 2555,          -- 7 years default retention
   deletion_scheduled_at TIMESTAMP WITH TIME ZONE,      -- When to delete record
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   verified_by UUID,                                    -- User/system that verified
   
   -- Constraints
   CONSTRAINT chk_verification_level CHECK (verification_level IN ('basic', 'enhanced', 'full')),
   CONSTRAINT chk_verification_status CHECK (verification_status IN ('pending', 'approved', 'rejected', 'expired')),
   CONSTRAINT chk_document_type CHECK (document_type IS NULL OR document_type IN ('passport', 'drivers_license', 'national_id', 'other')),
   CONSTRAINT chk_provider_score CHECK (provider_score IS NULL OR (provider_score >= 0 AND provider_score <= 1)),
   CONSTRAINT chk_address_match_score CHECK (address_match_score IS NULL OR (address_match_score >= 0 AND address_match_score <= 1)),
   CONSTRAINT chk_face_match_score CHECK (face_match_score IS NULL OR (face_match_score >= 0 AND face_match_score <= 1)),
   CONSTRAINT chk_retention_period CHECK (retention_period_days > 0)
);

-- Add comments
COMMENT ON TABLE kyc_records IS 'Know Your Customer verification records for regulatory compliance';

COMMENT ON COLUMN kyc_records.id IS 'Unique identifier for KYC record';
COMMENT ON COLUMN kyc_records.customer_profile_id IS 'Reference to customer being verified';

COMMENT ON COLUMN kyc_records.verification_level IS 'Level of verification: basic, enhanced, or full';
COMMENT ON COLUMN kyc_records.verification_status IS 'Current status: pending, approved, rejected, or expired';

COMMENT ON COLUMN kyc_records.document_type IS 'Type of identity document provided';
COMMENT ON COLUMN kyc_records.document_number_hash IS 'Hashed document number for security';

COMMENT ON COLUMN kyc_records.document_front_url IS 'Secure storage URL for document front image';
COMMENT ON COLUMN kyc_records.document_back_url IS 'Secure storage URL for document back image';
COMMENT ON COLUMN kyc_records.selfie_url IS 'Secure storage URL for customer selfie';
COMMENT ON COLUMN kyc_records.storage_encrypted IS 'Whether document storage is encrypted';

COMMENT ON COLUMN kyc_records.submitted_at IS 'When KYC documents were submitted';
COMMENT ON COLUMN kyc_records.verified_at IS 'When verification was completed';
COMMENT ON COLUMN kyc_records.expires_at IS 'When this verification expires';

COMMENT ON COLUMN kyc_records.kyc_provider IS 'Third-party KYC provider used';
COMMENT ON COLUMN kyc_records.provider_reference_id IS 'Reference ID from KYC provider';
COMMENT ON COLUMN kyc_records.provider_score IS 'Confidence score from provider (0-1)';

COMMENT ON COLUMN kyc_records.first_name_verified IS 'First name as verified from documents';
COMMENT ON COLUMN kyc_records.last_name_verified IS 'Last name as verified from documents';
COMMENT ON COLUMN kyc_records.date_of_birth_verified IS 'Date of birth as verified from documents';

COMMENT ON COLUMN kyc_records.address_verified IS 'Address as verified from proof documents';
COMMENT ON COLUMN kyc_records.address_proof_type IS 'Type of address proof provided';
COMMENT ON COLUMN kyc_records.address_match_score IS 'Confidence score for address match (0-1)';

COMMENT ON COLUMN kyc_records.face_match_score IS 'Biometric face match confidence (0-1)';
COMMENT ON COLUMN kyc_records.liveness_check_passed IS 'Whether liveness detection passed';
COMMENT ON COLUMN kyc_records.biometric_data_hash IS 'Hash of biometric data for integrity';

COMMENT ON COLUMN kyc_records.risk_score IS 'Overall risk score (0-100, lower is better)';
COMMENT ON COLUMN kyc_records.risk_factors IS 'Array of identified risk factors';
COMMENT ON COLUMN kyc_records.pep_check IS 'Whether PEP (Politically Exposed Person) check was performed';
COMMENT ON COLUMN kyc_records.sanctions_check IS 'Whether sanctions list check was performed';

COMMENT ON COLUMN kyc_records.rejection_reason IS 'Primary reason for rejection';
COMMENT ON COLUMN kyc_records.rejection_details IS 'Detailed explanation of rejection';
COMMENT ON COLUMN kyc_records.can_resubmit IS 'Whether customer can submit new KYC';

COMMENT ON COLUMN kyc_records.requires_manual_review IS 'Flagged for human review';
COMMENT ON COLUMN kyc_records.reviewed_by IS 'User who performed manual review';
COMMENT ON COLUMN kyc_records.review_notes IS 'Notes from manual review';

COMMENT ON COLUMN kyc_records.aml_cleared IS 'Anti-Money Laundering compliance cleared';
COMMENT ON COLUMN kyc_records.cft_cleared IS 'Counter-Financing of Terrorism cleared';
COMMENT ON COLUMN kyc_records.regulatory_flags IS 'Additional regulatory compliance flags';

COMMENT ON COLUMN kyc_records.retention_period_days IS 'How long to retain KYC data';
COMMENT ON COLUMN kyc_records.deletion_scheduled_at IS 'When to delete this record';

COMMENT ON COLUMN kyc_records.verified_by IS 'User or system that performed verification';

-- Create indexes

-- Foreign key and lookups
CREATE INDEX idx_kyc_records_customer_profile_id ON kyc_records(customer_profile_id);
CREATE INDEX idx_kyc_records_verification_status ON kyc_records(verification_status);
CREATE INDEX idx_kyc_records_verification_level ON kyc_records(verification_level);

-- Temporal indexes
CREATE INDEX idx_kyc_records_expires_at ON kyc_records(expires_at) 
   WHERE expires_at IS NOT NULL;
CREATE INDEX idx_kyc_records_submitted_at ON kyc_records(submitted_at DESC);
CREATE INDEX idx_kyc_records_deletion_scheduled ON kyc_records(deletion_scheduled_at) 
   WHERE deletion_scheduled_at IS NOT NULL;

-- Provider tracking
CREATE INDEX idx_kyc_records_provider ON kyc_records(kyc_provider, provider_reference_id);

-- Risk and compliance
CREATE INDEX idx_kyc_records_risk_score ON kyc_records(risk_score) 
   WHERE risk_score > 50;
CREATE INDEX idx_kyc_records_manual_review ON kyc_records(requires_manual_review) 
   WHERE requires_manual_review = true;

-- Active records
CREATE INDEX idx_kyc_records_active ON kyc_records(customer_profile_id, verification_status, expires_at) 
   WHERE verification_status = 'approved' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

-- JSONB indexes
CREATE INDEX idx_kyc_records_risk_factors ON kyc_records USING GIN(risk_factors);
CREATE INDEX idx_kyc_records_regulatory_flags ON kyc_records USING GIN(regulatory_flags);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_kyc_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_kyc_records_updated_at 
   BEFORE UPDATE ON kyc_records
   FOR EACH ROW EXECUTE FUNCTION update_kyc_records_updated_at();

-- Create function to check KYC expiry
CREATE OR REPLACE FUNCTION check_kyc_expiry()
RETURNS TRIGGER AS $$
BEGIN
   -- Auto-expire if past expiry date
   IF NEW.expires_at IS NOT NULL AND NEW.expires_at < CURRENT_TIMESTAMP AND NEW.verification_status = 'approved' THEN
       NEW.verification_status := 'expired';
   END IF;
   
   -- Set deletion date based on retention period
   IF NEW.verified_at IS NOT NULL AND NEW.deletion_scheduled_at IS NULL THEN
       NEW.deletion_scheduled_at := NEW.verified_at + (NEW.retention_period_days || ' days')::INTERVAL;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_kyc_expiry_trigger
   BEFORE INSERT OR UPDATE ON kyc_records
   FOR EACH ROW EXECUTE FUNCTION check_kyc_expiry();

-- Create view for current KYC status
CREATE OR REPLACE VIEW current_kyc_status AS
SELECT DISTINCT ON (customer_profile_id)
   customer_profile_id,
   id as kyc_record_id,
   verification_level,
   verification_status,
   verified_at,
   expires_at,
   risk_score,
   CASE 
       WHEN verification_status = 'approved' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) THEN 'valid'
       WHEN verification_status = 'approved' AND expires_at <= CURRENT_TIMESTAMP THEN 'expired'
       WHEN verification_status = 'pending' THEN 'pending'
       WHEN verification_status = 'rejected' THEN 'rejected'
       ELSE 'none'
   END AS kyc_status
FROM kyc_records
ORDER BY customer_profile_id, created_at DESC;

COMMENT ON VIEW current_kyc_status IS 'Current KYC status for each customer';

-- Create foreign key constraints (commented out until customer_profiles table exists)
-- ALTER TABLE kyc_records
--     ADD CONSTRAINT fk_kyc_records_customer_profile
--     FOREIGN KEY (customer_profile_id) 
--     REFERENCES customer_profiles(id) ON DELETE CASCADE;

-- ALTER TABLE kyc_records
--     ADD CONSTRAINT fk_kyc_records_reviewed_by
--     FOREIGN KEY (reviewed_by) 
--     REFERENCES users(id) ON DELETE SET NULL;

-- ALTER TABLE kyc_records
--     ADD CONSTRAINT fk_kyc_records_verified_by
--     FOREIGN KEY (verified_by) 
--     REFERENCES users(id) ON DELETE SET NULL;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON kyc_records TO app_user;
-- GRANT SELECT ON current_kyc_status TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_kyc_records_tenant_id ON kyc_records(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kyc_records_tenant_created ON kyc_records(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

