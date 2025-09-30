-- =============================================================================
-- Venue Royalty Tracking Schema
-- =============================================================================
-- This schema manages royalty payments to venues for secondary market sales:
-- - Automatic royalty calculations based on venue policies
-- - Settlement batch processing for efficient payouts
-- - Tax compliance and 1099 tracking
-- - Complete audit trail for royalty distributions
-- - Support for both percentage and fixed amount royalties
-- - Policy version tracking for compliance
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects
DROP TABLE IF EXISTS marketplace.royalties CASCADE;
DROP TYPE IF EXISTS marketplace.royalty_type CASCADE;
DROP TYPE IF EXISTS marketplace.royalty_payment_status CASCADE;
DROP TYPE IF EXISTS marketplace.calculation_basis CASCADE;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS marketplace;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Royalty type enumeration
CREATE TYPE marketplace.royalty_type AS ENUM (
    'percentage',    -- Percentage of transaction amount
    'fixed_amount'   -- Fixed dollar amount per transaction
);

-- Royalty payment status enumeration
CREATE TYPE marketplace.royalty_payment_status AS ENUM (
    'pending',       -- Royalty calculated but not yet paid
    'processing',    -- Payment in progress
    'paid',          -- Successfully paid to venue
    'failed',        -- Payment failed
    'on_hold',       -- Payment held due to dispute or policy
    'cancelled'      -- Royalty cancelled (e.g., transaction reversed)
);

-- Calculation basis enumeration
CREATE TYPE marketplace.calculation_basis AS ENUM (
    'gross_sale',    -- Calculate on full sale price
    'net_sale',      -- Calculate on sale price minus fees
    'ticket_face'    -- Calculate on original ticket price
);

-- =============================================================================
-- MAIN ROYALTIES TABLE
-- =============================================================================

CREATE TABLE marketplace.royalties (
    -- Primary identification
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Foreign key relationships
    venue_id                        UUID NOT NULL,
    marketplace_transaction_id      UUID NOT NULL,
    original_ticket_transaction_id  UUID NOT NULL,
    
    -- Royalty configuration
    royalty_percentage              DECIMAL(5, 4) CHECK (royalty_percentage >= 0 AND royalty_percentage <= 1),
    royalty_type                    marketplace.royalty_type NOT NULL DEFAULT 'percentage',
    fixed_royalty_amount            DECIMAL(10, 2) CHECK (fixed_royalty_amount >= 0),
    
    -- Financial calculation
    transaction_amount              DECIMAL(10, 2) NOT NULL CHECK (transaction_amount > 0),
    royalty_amount                  DECIMAL(10, 2) NOT NULL CHECK (royalty_amount >= 0),
    currency                        VARCHAR(3) NOT NULL DEFAULT 'USD',
    calculation_basis               marketplace.calculation_basis NOT NULL DEFAULT 'gross_sale',
    
    -- Calculation metadata
    calculation_details             JSONB DEFAULT '{}',
    effective_royalty_rate          DECIMAL(5, 4) GENERATED ALWAYS AS (
        CASE 
            WHEN transaction_amount > 0 THEN royalty_amount / transaction_amount
            ELSE 0
        END
    ) STORED,
    
    -- Payment details
    payment_status                  marketplace.royalty_payment_status NOT NULL DEFAULT 'pending',
    payment_failure_reason          TEXT,
    payment_retry_count             INTEGER NOT NULL DEFAULT 0 CHECK (payment_retry_count >= 0),
    
    -- Settlement information
    settlement_id                   UUID,
    settlement_batch_id             VARCHAR(100),
    payment_method                  VARCHAR(50),
    
    -- Venue banking
    payout_account_id               UUID,
    bank_transfer_id                VARCHAR(255),
    expected_payment_date           DATE,
    actual_payment_date             DATE,
    
    -- Tracking metrics (venue-level aggregates)
    total_resales                   INTEGER NOT NULL DEFAULT 1,
    lifetime_royalty_earned         DECIMAL(15, 2) NOT NULL DEFAULT 0,
    average_resale_price            DECIMAL(10, 2),
    
    -- Policy compliance
    royalty_policy_version          VARCHAR(20) NOT NULL,
    terms_accepted_at               TIMESTAMPTZ NOT NULL,
    policy_changes                  JSONB DEFAULT '{}',
    policy_override_reason          TEXT,
    
    -- Tax implications
    tax_withholding_required        BOOLEAN NOT NULL DEFAULT false,
    tax_withholding_amount          DECIMAL(10, 2) DEFAULT 0 CHECK (tax_withholding_amount >= 0),
    tax_form_1099_issued            BOOLEAN NOT NULL DEFAULT false,
    tax_year                        INTEGER NOT NULL,
    tax_documentation               JSONB DEFAULT '{}',
    
    -- Administrative
    notes                           TEXT,
    audit_trail                     JSONB DEFAULT '[]',
    
    -- Timestamps
    earned_at                       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    calculated_at                   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at                         TIMESTAMPTZ,
    settled_at                      TIMESTAMPTZ,
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_royalties_venue FOREIGN KEY (venue_id) 
        REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_royalties_marketplace_transaction FOREIGN KEY (marketplace_transaction_id) 
        REFERENCES marketplace.marketplace_transactions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_royalties_original_transaction FOREIGN KEY (original_ticket_transaction_id) 
        REFERENCES transactions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_royalties_settlement FOREIGN KEY (settlement_id) 
        REFERENCES marketplace.royalty_settlements(id) ON DELETE SET NULL,
    CONSTRAINT fk_royalties_payout_account FOREIGN KEY (payout_account_id) 
        REFERENCES venue_payout_accounts(id) ON DELETE SET NULL,
    
    -- Royalty type constraints
    CONSTRAINT chk_royalty_configuration CHECK (
        (royalty_type = 'percentage' AND royalty_percentage IS NOT NULL AND fixed_royalty_amount IS NULL)
        OR (royalty_type = 'fixed_amount' AND fixed_royalty_amount IS NOT NULL AND royalty_percentage IS NULL)
    ),
    
    -- Payment status constraints
    CONSTRAINT chk_payment_timestamps CHECK (
        (payment_status IN ('paid', 'failed') AND paid_at IS NOT NULL)
        OR payment_status NOT IN ('paid', 'failed')
    ),
    CONSTRAINT chk_settlement_status CHECK (
        (settlement_id IS NOT NULL AND settled_at IS NOT NULL)
        OR settlement_id IS NULL
    ),
    
    -- Tax constraints
    CONSTRAINT chk_tax_withholding CHECK (
        (tax_withholding_required = true AND tax_withholding_amount > 0)
        OR tax_withholding_required = false
    ),
    CONSTRAINT chk_tax_year CHECK (
        tax_year >= 2024 AND tax_year <= EXTRACT(YEAR FROM CURRENT_DATE) + 1
    )
);

-- =============================================================================
-- ROYALTY SETTLEMENTS TABLE (for batch processing)
-- =============================================================================

CREATE TABLE marketplace.royalty_settlements (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    venue_id                UUID NOT NULL,
    settlement_period_start DATE NOT NULL,
    settlement_period_end   DATE NOT NULL,
    total_royalties         DECIMAL(15, 2) NOT NULL CHECK (total_royalties >= 0),
    total_transactions      INTEGER NOT NULL CHECK (total_transactions > 0),
    status                  VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at            TIMESTAMPTZ,
    
    CONSTRAINT fk_settlements_venue FOREIGN KEY (venue_id) 
        REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT chk_settlement_period CHECK (settlement_period_end >= settlement_period_start)
);

-- =============================================================================
-- VENUE PAYOUT ACCOUNTS TABLE
-- =============================================================================

CREATE TABLE venue_payout_accounts (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    venue_id                UUID NOT NULL,
    account_type            VARCHAR(50) NOT NULL, -- 'bank_account', 'stripe_connect', etc.
    account_details         JSONB NOT NULL, -- Encrypted account information
    is_active               BOOLEAN NOT NULL DEFAULT true,
    is_verified             BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at             TIMESTAMPTZ,
    
    CONSTRAINT fk_payout_accounts_venue FOREIGN KEY (venue_id) 
        REFERENCES venues(id) ON DELETE CASCADE
);

-- =============================================================================
-- INDEXES FOR ROYALTY CALCULATIONS AND VENUE PAYOUTS
-- =============================================================================

-- Primary operational indexes
CREATE INDEX idx_royalties_venue ON marketplace.royalties(venue_id, earned_at DESC);
CREATE INDEX idx_royalties_transaction ON marketplace.royalties(marketplace_transaction_id);
CREATE INDEX idx_royalties_payment_status ON marketplace.royalties(payment_status, expected_payment_date) 
    WHERE payment_status IN ('pending', 'processing');

-- Settlement processing indexes
CREATE INDEX idx_royalties_unsettled ON marketplace.royalties(venue_id, settlement_id) 
    WHERE settlement_id IS NULL AND payment_status = 'pending';
CREATE INDEX idx_royalties_settlement_batch ON marketplace.royalties(settlement_batch_id) 
    WHERE settlement_batch_id IS NOT NULL;
CREATE INDEX idx_royalties_settlement ON marketplace.royalties(settlement_id);

-- Financial reporting indexes
CREATE INDEX idx_royalties_venue_earnings ON marketplace.royalties(venue_id, earned_at, royalty_amount) 
    WHERE payment_status NOT IN ('cancelled', 'failed');
CREATE INDEX idx_royalties_paid_date ON marketplace.royalties(paid_at, venue_id) 
    WHERE payment_status = 'paid';
CREATE INDEX idx_royalties_tax_year ON marketplace.royalties(tax_year, venue_id, royalty_amount) 
    WHERE payment_status = 'paid';

-- Policy compliance indexes
CREATE INDEX idx_royalties_policy_version ON marketplace.royalties(royalty_policy_version, venue_id);
CREATE INDEX idx_royalties_policy_override ON marketplace.royalties(policy_override_reason) 
    WHERE policy_override_reason IS NOT NULL;

-- Performance and analytics indexes
CREATE INDEX idx_royalties_calculation_basis ON marketplace.royalties(calculation_basis, royalty_type);
CREATE INDEX idx_royalties_effective_rate ON marketplace.royalties(effective_royalty_rate, venue_id);

-- Settlement table indexes
CREATE INDEX idx_settlements_venue ON marketplace.royalty_settlements(venue_id, settlement_period_start DESC);
CREATE INDEX idx_settlements_status ON marketplace.royalty_settlements(status, created_at);

-- Payout account indexes
CREATE INDEX idx_payout_accounts_venue ON venue_payout_accounts(venue_id, is_active) 
    WHERE is_active = true;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION marketplace.update_royalty_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Update audit trail
    NEW.audit_trail = NEW.audit_trail || jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'action', TG_OP,
        'old_status', OLD.payment_status,
        'new_status', NEW.payment_status
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_royalties_update_timestamp
    BEFORE UPDATE ON marketplace.royalties
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_royalty_timestamp();

-- Calculate royalty amount trigger
CREATE OR REPLACE FUNCTION marketplace.calculate_royalty_amount()
RETURNS TRIGGER AS $$
DECLARE
    v_base_amount DECIMAL(10, 2);
BEGIN
    -- Determine base amount based on calculation basis
    CASE NEW.calculation_basis
        WHEN 'gross_sale' THEN
            v_base_amount := NEW.transaction_amount;
        WHEN 'net_sale' THEN
            -- This would need to fetch net amount from transaction
            v_base_amount := NEW.transaction_amount * 0.9; -- Example: 90% of gross
        WHEN 'ticket_face' THEN
            -- This would need to fetch original ticket price
            v_base_amount := NEW.transaction_amount * 0.8; -- Example placeholder
    END CASE;
    
    -- Calculate royalty based on type
    IF NEW.royalty_type = 'percentage' THEN
        NEW.royalty_amount := ROUND(v_base_amount * NEW.royalty_percentage, 2);
    ELSIF NEW.royalty_type = 'fixed_amount' THEN
        NEW.royalty_amount := NEW.fixed_royalty_amount;
    END IF;
    
    -- Apply tax withholding if required
    IF NEW.tax_withholding_required THEN
        NEW.tax_withholding_amount := ROUND(NEW.royalty_amount * 0.24, 2); -- 24% backup withholding
    END IF;
    
    -- Store calculation details
    NEW.calculation_details := jsonb_build_object(
        'base_amount', v_base_amount,
        'calculation_basis', NEW.calculation_basis,
        'royalty_type', NEW.royalty_type,
        'applied_rate', COALESCE(NEW.royalty_percentage, 0),
        'fixed_amount', COALESCE(NEW.fixed_royalty_amount, 0)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_royalties_calculate_amount
    BEFORE INSERT OR UPDATE OF transaction_amount, royalty_percentage, royalty_type, fixed_royalty_amount, calculation_basis 
    ON marketplace.royalties
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.calculate_royalty_amount();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to create royalty settlement batch
CREATE OR REPLACE FUNCTION marketplace.create_royalty_settlement(
    p_venue_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS UUID AS $$
DECLARE
    v_settlement_id UUID;
    v_total_royalties DECIMAL(15, 2);
    v_total_transactions INTEGER;
BEGIN
    -- Calculate totals for the period
    SELECT 
        SUM(royalty_amount - COALESCE(tax_withholding_amount, 0)),
        COUNT(*)
    INTO v_total_royalties, v_total_transactions
    FROM marketplace.royalties
    WHERE venue_id = p_venue_id
        AND earned_at::DATE BETWEEN p_start_date AND p_end_date
        AND payment_status = 'pending'
        AND settlement_id IS NULL;
    
    -- Create settlement if there are royalties to pay
    IF v_total_transactions > 0 THEN
        INSERT INTO marketplace.royalty_settlements (
            venue_id,
            settlement_period_start,
            settlement_period_end,
            total_royalties,
            total_transactions
        ) VALUES (
            p_venue_id,
            p_start_date,
            p_end_date,
            v_total_royalties,
            v_total_transactions
        ) RETURNING id INTO v_settlement_id;
        
        -- Link royalties to settlement
        UPDATE marketplace.royalties
        SET 
            settlement_id = v_settlement_id,
            settlement_batch_id = 'BATCH-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || p_venue_id::TEXT
        WHERE venue_id = p_venue_id
            AND earned_at::DATE BETWEEN p_start_date AND p_end_date
            AND payment_status = 'pending'
            AND settlement_id IS NULL;
        
        RETURN v_settlement_id;
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get venue royalty summary
CREATE OR REPLACE FUNCTION marketplace.get_venue_royalty_summary(
    p_venue_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    total_earned DECIMAL(15, 2),
    total_paid DECIMAL(15, 2),
    total_pending DECIMAL(15, 2),
    total_transactions INTEGER,
    average_royalty DECIMAL(10, 2),
    effective_rate DECIMAL(5, 4),
    last_payment_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        SUM(royalty_amount) FILTER (WHERE payment_status NOT IN ('cancelled')) as total_earned,
        SUM(royalty_amount - COALESCE(tax_withholding_amount, 0)) FILTER (WHERE payment_status = 'paid') as total_paid,
        SUM(royalty_amount - COALESCE(tax_withholding_amount, 0)) FILTER (WHERE payment_status = 'pending') as total_pending,
        COUNT(*)::INTEGER as total_transactions,
        AVG(royalty_amount) as average_royalty,
        AVG(effective_royalty_rate) as effective_rate,
        MAX(actual_payment_date) as last_payment_date
    FROM marketplace.royalties
    WHERE venue_id = p_venue_id
        AND (p_start_date IS NULL OR earned_at::DATE >= p_start_date)
        AND (p_end_date IS NULL OR earned_at::DATE <= p_end_date);
END;
$$ LANGUAGE plpgsql;

-- Function to generate 1099 data
CREATE OR REPLACE FUNCTION marketplace.generate_1099_data(
    p_venue_id UUID,
    p_tax_year INTEGER
)
RETURNS TABLE (
    venue_id UUID,
    tax_year INTEGER,
    total_royalties_paid DECIMAL(15, 2),
    total_tax_withheld DECIMAL(15, 2),
    payment_count INTEGER,
    tin_provided BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.venue_id,
        r.tax_year,
        SUM(r.royalty_amount) as total_royalties_paid,
        SUM(r.tax_withholding_amount) as total_tax_withheld,
        COUNT(*)::INTEGER as payment_count,
        EXISTS(
            SELECT 1 FROM venues v 
            WHERE v.id = r.venue_id 
            AND v.tax_id IS NOT NULL
        ) as tin_provided
    FROM marketplace.royalties r
    WHERE r.venue_id = p_venue_id
        AND r.tax_year = p_tax_year
        AND r.payment_status = 'paid'
    GROUP BY r.venue_id, r.tax_year;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE marketplace.royalties IS 'Venue royalty tracking for secondary market sales';

-- Column comments
COMMENT ON COLUMN marketplace.royalties.id IS 'Unique identifier for the royalty record';
COMMENT ON COLUMN marketplace.royalties.royalty_type IS 'Whether royalty is percentage-based or fixed amount';
COMMENT ON COLUMN marketplace.royalties.calculation_basis IS 'What amount the royalty is calculated on';
COMMENT ON COLUMN marketplace.royalties.effective_royalty_rate IS 'Calculated: actual rate as percentage of transaction';
COMMENT ON COLUMN marketplace.royalties.payment_status IS 'Current status of royalty payment';
COMMENT ON COLUMN marketplace.royalties.settlement_batch_id IS 'Batch identifier for bulk payment processing';
COMMENT ON COLUMN marketplace.royalties.tax_withholding_required IS 'Whether backup withholding is required (no TIN)';
COMMENT ON COLUMN marketplace.royalties.tax_form_1099_issued IS 'Whether 1099-MISC/1099-K was issued for this payment';
COMMENT ON COLUMN marketplace.royalties.royalty_policy_version IS 'Version of royalty policy in effect';
COMMENT ON COLUMN marketplace.royalties.audit_trail IS 'JSON array of all status changes and updates';

-- Function comments
COMMENT ON FUNCTION marketplace.create_royalty_settlement IS 'Create settlement batch for venue royalty payout';
COMMENT ON FUNCTION marketplace.get_venue_royalty_summary IS 'Get royalty summary statistics for a venue';
COMMENT ON FUNCTION marketplace.generate_1099_data IS 'Generate tax form data for venue royalties';

-- =============================================================================
-- SAMPLE DATA FOR TESTING (commented out for production)
-- =============================================================================

/*
-- Example: Percentage-based royalty
INSERT INTO marketplace.royalties (
    venue_id, marketplace_transaction_id, original_ticket_transaction_id,
    royalty_percentage, royalty_type,
    transaction_amount, calculation_basis,
    royalty_policy_version, terms_accepted_at,
    tax_year
) VALUES (
    'venue-uuid', 'marketplace-trans-uuid', 'original-trans-uuid',
    0.025, 'percentage',
    250.00, 'gross_sale',
    'v2.1', CURRENT_TIMESTAMP - INTERVAL '30 days',
    2025
);

-- Example: Fixed amount royalty with tax withholding
INSERT INTO marketplace.royalties (
    venue_id, marketplace_transaction_id, original_ticket_transaction_id,
    royalty_type, fixed_royalty_amount,
    transaction_amount, calculation_basis,
    royalty_policy_version, terms_accepted_at,
    tax_withholding_required, tax_year
) VALUES (
    'venue-uuid-2', 'marketplace-trans-uuid-2', 'original-trans-uuid-2',
    'fixed_amount', 10.00,
    150.00, 'gross_sale',
    'v2.1', CURRENT_TIMESTAMP - INTERVAL '60 days',
    true, 2025
);
*/

-- =============================================================================
-- END OF SCHEMA

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_royalties_tenant_id ON royalties(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_royalties_tenant_created ON royalties(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =============================================================================
