-- =====================================================================
-- Customer Profiles Schema for TicketToken
-- Week 3, Day 11
-- =====================================================================
-- This schema defines the customer_profiles table which stores detailed
-- customer information including personal details, KYC status, wallet
-- information, and customer metrics.
-- =====================================================================

-- Create extension for UUID generation if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types for constrained fields
DO $$ BEGIN
    CREATE TYPE kyc_status_enum AS ENUM ('pending', 'verified', 'rejected', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE wallet_type_enum AS ENUM ('phantom', 'metamask', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create customer_profiles table
CREATE TABLE IF NOT EXISTS customer_profiles (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key to users table
    user_id UUID NOT NULL,
    
    -- Personal information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200), -- Optional display name for public profile
    date_of_birth DATE, -- For age verification and birthday promotions
    
    -- Contact details
    email VARCHAR(255) NOT NULL UNIQUE, -- Email must be unique across all customers
    phone VARCHAR(20), -- International format support
    phone_verified BOOLEAN DEFAULT FALSE, -- Track if phone number is verified
    
    -- Address fields
    address_line_1 VARCHAR(255), -- Street address
    address_line_2 VARCHAR(255), -- Apartment, suite, etc.
    city VARCHAR(100),
    state VARCHAR(100), -- State/Province/Region
    postal_code VARCHAR(20),
    country VARCHAR(2), -- ISO 3166-1 alpha-2 country code
    
    -- KYC (Know Your Customer) fields
    kyc_status kyc_status_enum DEFAULT 'pending', -- Current KYC verification status
    kyc_verified_at TIMESTAMP WITH TIME ZONE, -- When KYC was last verified
    kyc_document_type VARCHAR(50), -- Type of document used for KYC (passport, driver_license, etc.)
    kyc_expires_at TIMESTAMP WITH TIME ZONE, -- When KYC verification expires
    
    -- Wallet information
    primary_wallet_address VARCHAR(66), -- Blockchain wallet address (supports Ethereum format)
    wallet_type wallet_type_enum DEFAULT 'phantom', -- Type of wallet used
    
    -- Customer metadata
    customer_since TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When customer first registered
    total_spent DECIMAL(20, 6) DEFAULT 0.00, -- Total amount spent in USD
    total_events_attended INTEGER DEFAULT 0, -- Count of events attended
    last_purchase_at TIMESTAMP WITH TIME ZONE, -- Timestamp of last purchase
    
    -- Marketing fields
    marketing_consent BOOLEAN DEFAULT FALSE, -- Has customer consented to marketing communications
    marketing_opt_in_at TIMESTAMP WITH TIME ZONE, -- When customer opted in to marketing
    
    -- Risk scoring
    risk_score INTEGER DEFAULT 0, -- Risk score from 0 (low) to 100 (high)
    risk_factors JSONB DEFAULT '{}', -- JSON object containing risk factor details
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete timestamp
    
    -- Constraints
    CONSTRAINT fk_customer_user 
        FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT chk_risk_score 
        CHECK (risk_score >= 0 AND risk_score <= 100),
    
    CONSTRAINT chk_email_format 
        CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    
    CONSTRAINT chk_total_spent_positive 
        CHECK (total_spent >= 0),
    
    CONSTRAINT chk_events_attended_positive 
        CHECK (total_events_attended >= 0),
    
    CONSTRAINT chk_marketing_opt_in_date 
        CHECK (
            (marketing_consent = FALSE AND marketing_opt_in_at IS NULL) OR
            (marketing_consent = TRUE AND marketing_opt_in_at IS NOT NULL)
        ),
    
    CONSTRAINT chk_kyc_verified_date 
        CHECK (
            (kyc_status != 'verified' AND kyc_verified_at IS NULL) OR
            (kyc_status = 'verified' AND kyc_verified_at IS NOT NULL)
        ),
    
    CONSTRAINT chk_wallet_address_format 
        CHECK (
            primary_wallet_address IS NULL OR
            primary_wallet_address ~* '^0x[a-fA-F0-9]{40}$' OR  -- Ethereum format
            primary_wallet_address ~* '^[1-9A-HJ-NP-Za-km-z]{32,44}$'  -- Bitcoin/Solana format
        )
);

-- Create indexes for performance
CREATE INDEX idx_customer_profiles_email 
    ON customer_profiles(email) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_phone 
    ON customer_profiles(phone) 
    WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_wallet_address 
    ON customer_profiles(primary_wallet_address) 
    WHERE primary_wallet_address IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_kyc_status 
    ON customer_profiles(kyc_status) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_user_id 
    ON customer_profiles(user_id) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_risk_score 
    ON customer_profiles(risk_score) 
    WHERE risk_score > 50 AND deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_customer_since 
    ON customer_profiles(customer_since) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_last_purchase 
    ON customer_profiles(last_purchase_at) 
    WHERE last_purchase_at IS NOT NULL AND deleted_at IS NULL;

-- Create composite indexes for common queries
CREATE INDEX idx_customer_profiles_location 
    ON customer_profiles(country, state, city) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_customer_profiles_marketing_active 
    ON customer_profiles(marketing_consent, email) 
    WHERE marketing_consent = TRUE AND deleted_at IS NULL;

-- Create GIN index for JSONB risk_factors
CREATE INDEX idx_customer_profiles_risk_factors 
    ON customer_profiles USING GIN (risk_factors);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customer_profiles_updated_at 
    BEFORE UPDATE ON customer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments to table and columns
COMMENT ON TABLE customer_profiles IS 'Stores detailed customer profile information including personal details, KYC status, and customer metrics';

COMMENT ON COLUMN customer_profiles.id IS 'Unique identifier for the customer profile';
COMMENT ON COLUMN customer_profiles.user_id IS 'Reference to the user account in the users table';
COMMENT ON COLUMN customer_profiles.first_name IS 'Customer''s legal first name';
COMMENT ON COLUMN customer_profiles.last_name IS 'Customer''s legal last name';
COMMENT ON COLUMN customer_profiles.display_name IS 'Optional display name for public-facing profiles';
COMMENT ON COLUMN customer_profiles.date_of_birth IS 'Customer''s date of birth for age verification';
COMMENT ON COLUMN customer_profiles.email IS 'Primary email address - must be unique';
COMMENT ON COLUMN customer_profiles.phone IS 'Phone number in international format';
COMMENT ON COLUMN customer_profiles.phone_verified IS 'Whether the phone number has been verified';
COMMENT ON COLUMN customer_profiles.address_line_1 IS 'Primary street address';
COMMENT ON COLUMN customer_profiles.address_line_2 IS 'Secondary address information (apt, suite, etc.)';
COMMENT ON COLUMN customer_profiles.city IS 'City of residence';
COMMENT ON COLUMN customer_profiles.state IS 'State, province, or region';
COMMENT ON COLUMN customer_profiles.postal_code IS 'Postal or ZIP code';
COMMENT ON COLUMN customer_profiles.country IS 'ISO 3166-1 alpha-2 country code';
COMMENT ON COLUMN customer_profiles.kyc_status IS 'Current KYC verification status';
COMMENT ON COLUMN customer_profiles.kyc_verified_at IS 'Timestamp of last successful KYC verification';
COMMENT ON COLUMN customer_profiles.kyc_document_type IS 'Type of document used for KYC verification';
COMMENT ON COLUMN customer_profiles.kyc_expires_at IS 'When KYC verification expires and needs renewal';
COMMENT ON COLUMN customer_profiles.primary_wallet_address IS 'Primary blockchain wallet address';
COMMENT ON COLUMN customer_profiles.wallet_type IS 'Type of wallet (phantom, metamask, other)';
COMMENT ON COLUMN customer_profiles.customer_since IS 'When the customer first registered';
COMMENT ON COLUMN customer_profiles.total_spent IS 'Total amount spent by customer in USD';
COMMENT ON COLUMN customer_profiles.total_events_attended IS 'Count of events the customer has attended';
COMMENT ON COLUMN customer_profiles.last_purchase_at IS 'Timestamp of the customer''s most recent purchase';
COMMENT ON COLUMN customer_profiles.marketing_consent IS 'Whether customer has consented to marketing';
COMMENT ON COLUMN customer_profiles.marketing_opt_in_at IS 'When customer opted in to marketing';
COMMENT ON COLUMN customer_profiles.risk_score IS 'Risk assessment score from 0 (low) to 100 (high)';
COMMENT ON COLUMN customer_profiles.risk_factors IS 'JSON object containing detailed risk factor information';
COMMENT ON COLUMN customer_profiles.created_at IS 'When the record was created';
COMMENT ON COLUMN customer_profiles.updated_at IS 'When the record was last updated';
COMMENT ON COLUMN customer_profiles.deleted_at IS 'Soft delete timestamp - null if record is active';

-- Grant appropriate permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON customer_profiles TO tickettoken_app;
-- GRANT USAGE ON SEQUENCE customer_profiles_id_seq TO tickettoken_app;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_customer_profiles_tenant_id ON customer_profiles(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_profiles_tenant_created ON customer_profiles(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

