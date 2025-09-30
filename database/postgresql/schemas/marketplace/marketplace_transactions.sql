-- =============================================================================
-- Marketplace Secondary Sales Transactions Schema
-- =============================================================================
-- This schema manages the complete secondary market transaction lifecycle:
-- - Payment processing and fee distribution
-- - Escrow management and dispute resolution
-- - Ticket transfer tracking (both traditional and NFT)
-- - Tax compliance and reporting
-- - Venue royalties and commission tracking
-- - Fraud prevention and verification
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects
DROP TABLE IF EXISTS marketplace.marketplace_transactions CASCADE;
DROP TYPE IF EXISTS marketplace.transaction_type CASCADE;
DROP TYPE IF EXISTS marketplace.payment_status CASCADE;
DROP TYPE IF EXISTS marketplace.dispute_status CASCADE;
DROP TYPE IF EXISTS marketplace.transfer_status CASCADE;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS marketplace;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Transaction type enumeration
CREATE TYPE marketplace.transaction_type AS ENUM (
    'direct_sale',          -- Direct purchase at listing price
    'auction_win',          -- Winning auction bid
    'best_offer_accepted'   -- Accepted negotiated offer
);

-- Payment status enumeration
CREATE TYPE marketplace.payment_status AS ENUM (
    'pending',              -- Payment initiated but not confirmed
    'processing',           -- Payment being processed
    'captured',             -- Payment successfully captured
    'held_in_escrow',       -- Funds held pending transfer
    'partially_released',   -- Partial escrow release
    'released',             -- Full payment released to seller
    'failed',               -- Payment failed
    'refunded',             -- Payment refunded to buyer
    'disputed'              -- Payment under dispute
);

-- Dispute status enumeration
CREATE TYPE marketplace.dispute_status AS ENUM (
    'none',                 -- No dispute
    'initiated',            -- Dispute filed
    'under_review',         -- Platform reviewing dispute
    'escalated',            -- Escalated to higher level
    'resolved_buyer_favor', -- Resolved in buyer's favor
    'resolved_seller_favor',-- Resolved in seller's favor
    'resolved_split'        -- Split resolution
);

-- Transfer status enumeration
CREATE TYPE marketplace.transfer_status AS ENUM (
    'pending',              -- Transfer not yet initiated
    'initiated',            -- Transfer process started
    'blockchain_pending',   -- NFT transfer submitted to blockchain
    'blockchain_confirmed', -- NFT transfer confirmed on-chain
    'completed',            -- Transfer fully completed
    'failed',               -- Transfer failed
    'reversed'              -- Transfer reversed due to dispute
);

-- =============================================================================
-- MAIN MARKETPLACE TRANSACTIONS TABLE
-- =============================================================================

CREATE TABLE marketplace.marketplace_transactions (
    -- Primary identification
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Foreign key relationships
    listing_id                  UUID NOT NULL,
    offer_id                    UUID NOT NULL,
    buyer_user_id               UUID NOT NULL,
    seller_user_id              UUID NOT NULL,
    ticket_id                   UUID NOT NULL,
    
    -- Transaction details
    sale_price                  DECIMAL(10, 2) NOT NULL CHECK (sale_price > 0),
    currency                    VARCHAR(3) NOT NULL DEFAULT 'USD',
    transaction_type            marketplace.transaction_type NOT NULL,
    
    -- Fee breakdown (all amounts in transaction currency)
    platform_fee                DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    payment_processing_fee      DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (payment_processing_fee >= 0),
    venue_royalty               DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (venue_royalty >= 0),
    seller_net_amount           DECIMAL(10, 2) GENERATED ALWAYS AS (
        sale_price - platform_fee - payment_processing_fee - venue_royalty - COALESCE(tax_amount, 0)
    ) STORED,
    
    -- Payment processing
    payment_intent_id           VARCHAR(255) NOT NULL,
    escrow_account_id           VARCHAR(255),
    payment_status              marketplace.payment_status NOT NULL DEFAULT 'pending',
    
    -- Transfer mechanics
    ticket_transfer_initiated   BOOLEAN NOT NULL DEFAULT false,
    nft_transfer_signature      VARCHAR(255),
    transfer_completed          BOOLEAN NOT NULL DEFAULT false,
    transfer_status             marketplace.transfer_status NOT NULL DEFAULT 'pending',
    
    -- Verification levels at time of transaction
    buyer_verification_level    marketplace.verification_level NOT NULL,
    seller_verification_level   marketplace.verification_level NOT NULL,
    fraud_check_passed          BOOLEAN NOT NULL DEFAULT false,
    fraud_check_details         JSONB DEFAULT '{}',
    
    -- Escrow management
    escrow_released             BOOLEAN NOT NULL DEFAULT false,
    escrow_dispute              BOOLEAN NOT NULL DEFAULT false,
    dispute_resolution          marketplace.dispute_status NOT NULL DEFAULT 'none',
    dispute_details             JSONB DEFAULT '{}',
    
    -- Commission tracking
    venue_commission_amount     DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (venue_commission_amount >= 0),
    platform_commission_amount  DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (platform_commission_amount >= 0),
    
    -- Tax handling
    tax_applicable              BOOLEAN NOT NULL DEFAULT false,
    tax_amount                  DECIMAL(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
    tax_jurisdiction            VARCHAR(100),
    tax_receipt_url             VARCHAR(500),
    
    -- Additional metadata
    transaction_metadata        JSONB DEFAULT '{}',
    platform_notes              JSONB DEFAULT '{}',
    
    -- Timestamps
    initiated_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at                     TIMESTAMPTZ,
    transferred_at              TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ,
    disputed_at                 TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_transactions_listing FOREIGN KEY (listing_id) 
        REFERENCES marketplace.listings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_offer FOREIGN KEY (offer_id) 
        REFERENCES marketplace.offers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_buyer FOREIGN KEY (buyer_user_id) 
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_seller FOREIGN KEY (seller_user_id) 
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_ticket FOREIGN KEY (ticket_id) 
        REFERENCES tickets(id) ON DELETE RESTRICT,
    
    -- Payment status constraints
    CONSTRAINT chk_payment_timestamp CHECK (
        (payment_status IN ('captured', 'held_in_escrow', 'released') AND paid_at IS NOT NULL)
        OR payment_status NOT IN ('captured', 'held_in_escrow', 'released')
    ),
    
    -- Transfer constraints
    CONSTRAINT chk_transfer_completion CHECK (
        (transfer_completed = true AND transferred_at IS NOT NULL)
        OR transfer_completed = false
    ),
    CONSTRAINT chk_nft_transfer CHECK (
        (transfer_status IN ('blockchain_pending', 'blockchain_confirmed') AND nft_transfer_signature IS NOT NULL)
        OR transfer_status NOT IN ('blockchain_pending', 'blockchain_confirmed')
    ),
    
    -- Escrow constraints
    CONSTRAINT chk_escrow_release CHECK (
        (escrow_released = true AND payment_status = 'released')
        OR escrow_released = false
    ),
    CONSTRAINT chk_dispute_status CHECK (
        (escrow_dispute = true AND dispute_resolution != 'none' AND disputed_at IS NOT NULL)
        OR escrow_dispute = false
    ),
    
    -- Completion constraints
    CONSTRAINT chk_transaction_completion CHECK (
        (completed_at IS NOT NULL AND transfer_completed = true AND escrow_released = true)
        OR completed_at IS NULL
    ),
    
    -- Fee constraints
    CONSTRAINT chk_total_fees CHECK (
        platform_fee + payment_processing_fee + venue_royalty + COALESCE(tax_amount, 0) < sale_price
    )
);

-- =============================================================================
-- INDEXES FOR TRANSACTION REPORTING AND MARKETPLACE ANALYTICS
-- =============================================================================

-- Primary operational indexes
CREATE INDEX idx_transactions_buyer ON marketplace.marketplace_transactions(buyer_user_id, initiated_at DESC);
CREATE INDEX idx_transactions_seller ON marketplace.marketplace_transactions(seller_user_id, initiated_at DESC);
CREATE INDEX idx_transactions_listing ON marketplace.marketplace_transactions(listing_id);
CREATE INDEX idx_transactions_offer ON marketplace.marketplace_transactions(offer_id);

-- Payment and status tracking
CREATE INDEX idx_transactions_payment_status ON marketplace.marketplace_transactions(payment_status, initiated_at DESC);
CREATE INDEX idx_transactions_payment_intent ON marketplace.marketplace_transactions(payment_intent_id);
CREATE INDEX idx_transactions_escrow_pending ON marketplace.marketplace_transactions(payment_status, escrow_released) 
    WHERE payment_status = 'held_in_escrow' AND escrow_released = false;

-- Transfer tracking
CREATE INDEX idx_transactions_transfer_pending ON marketplace.marketplace_transactions(transfer_status, initiated_at) 
    WHERE transfer_status IN ('pending', 'initiated');
CREATE INDEX idx_transactions_nft_transfers ON marketplace.marketplace_transactions(nft_transfer_signature) 
    WHERE nft_transfer_signature IS NOT NULL;

-- Dispute management
CREATE INDEX idx_transactions_disputes ON marketplace.marketplace_transactions(dispute_resolution, disputed_at) 
    WHERE escrow_dispute = true;
CREATE INDEX idx_transactions_active_disputes ON marketplace.marketplace_transactions(dispute_resolution) 
    WHERE dispute_resolution IN ('initiated', 'under_review', 'escalated');

-- Financial reporting indexes
CREATE INDEX idx_transactions_revenue_date ON marketplace.marketplace_transactions(completed_at, platform_commission_amount) 
    WHERE completed_at IS NOT NULL;
CREATE INDEX idx_transactions_venue_royalties ON marketplace.marketplace_transactions(venue_royalty, completed_at) 
    WHERE venue_royalty > 0 AND completed_at IS NOT NULL;
CREATE INDEX idx_transactions_tax_reporting ON marketplace.marketplace_transactions(tax_jurisdiction, completed_at, tax_amount) 
    WHERE tax_applicable = true AND completed_at IS NOT NULL;

-- Analytics indexes
CREATE INDEX idx_transactions_type_date ON marketplace.marketplace_transactions(transaction_type, initiated_at);
CREATE INDEX idx_transactions_price_range ON marketplace.marketplace_transactions(sale_price, initiated_at);
CREATE INDEX idx_transactions_verification ON marketplace.marketplace_transactions(buyer_verification_level, seller_verification_level, fraud_check_passed);

-- Seller payout tracking
CREATE INDEX idx_transactions_seller_payouts ON marketplace.marketplace_transactions(seller_user_id, escrow_released, seller_net_amount) 
    WHERE payment_status = 'released';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION marketplace.update_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_update_timestamp
    BEFORE UPDATE ON marketplace.marketplace_transactions
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_transaction_timestamp();

-- Calculate fees trigger
CREATE OR REPLACE FUNCTION marketplace.calculate_transaction_fees()
RETURNS TRIGGER AS $$
DECLARE
    v_platform_fee_rate DECIMAL(5, 4) := 0.0500; -- 5% platform fee
    v_processing_fee_rate DECIMAL(5, 4) := 0.0290; -- 2.9% payment processing
    v_venue_royalty_rate DECIMAL(5, 4) := 0.0250; -- 2.5% venue royalty
BEGIN
    -- Calculate platform fee (5% of sale price)
    NEW.platform_fee := ROUND(NEW.sale_price * v_platform_fee_rate, 2);
    NEW.platform_commission_amount := NEW.platform_fee;
    
    -- Calculate payment processing fee (2.9% + $0.30)
    NEW.payment_processing_fee := ROUND(NEW.sale_price * v_processing_fee_rate + 0.30, 2);
    
    -- Calculate venue royalty (2.5% of sale price)
    NEW.venue_royalty := ROUND(NEW.sale_price * v_venue_royalty_rate, 2);
    NEW.venue_commission_amount := NEW.venue_royalty;
    
    -- Tax calculation would be done by external service
    -- This is a placeholder
    IF NEW.tax_applicable THEN
        NEW.tax_amount := ROUND(NEW.sale_price * 0.0875, 2); -- Example: 8.75% tax
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_calculate_fees
    BEFORE INSERT ON marketplace.marketplace_transactions
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.calculate_transaction_fees();

-- Transaction state management trigger
CREATE OR REPLACE FUNCTION marketplace.manage_transaction_state()
RETURNS TRIGGER AS $$
BEGIN
    -- Update payment timestamp
    IF NEW.payment_status IN ('captured', 'held_in_escrow') AND OLD.payment_status NOT IN ('captured', 'held_in_escrow') THEN
        NEW.paid_at := CURRENT_TIMESTAMP;
    END IF;
    
    -- Update transfer timestamp
    IF NEW.transfer_completed = true AND OLD.transfer_completed = false THEN
        NEW.transferred_at := CURRENT_TIMESTAMP;
        NEW.transfer_status := 'completed';
    END IF;
    
    -- Update completion timestamp
    IF NEW.transfer_completed = true AND NEW.escrow_released = true AND OLD.completed_at IS NULL THEN
        NEW.completed_at := CURRENT_TIMESTAMP;
    END IF;
    
    -- Update dispute timestamp
    IF NEW.escrow_dispute = true AND OLD.escrow_dispute = false THEN
        NEW.disputed_at := CURRENT_TIMESTAMP;
        NEW.payment_status := 'disputed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_manage_state
    BEFORE UPDATE ON marketplace.marketplace_transactions
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.manage_transaction_state();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to initiate escrow release
CREATE OR REPLACE FUNCTION marketplace.release_escrow(
    p_transaction_id UUID,
    p_release_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_can_release BOOLEAN;
BEGIN
    -- Check if escrow can be released
    SELECT 
        payment_status = 'held_in_escrow' 
        AND transfer_completed = true 
        AND escrow_dispute = false
    INTO v_can_release
    FROM marketplace.marketplace_transactions
    WHERE id = p_transaction_id;
    
    IF v_can_release THEN
        UPDATE marketplace.marketplace_transactions
        SET 
            escrow_released = true,
            payment_status = 'released',
            platform_notes = jsonb_set(
                COALESCE(platform_notes, '{}'::jsonb),
                '{escrow_release_notes}',
                to_jsonb(p_release_notes)
            )
        WHERE id = p_transaction_id;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate marketplace metrics
CREATE OR REPLACE FUNCTION marketplace.get_transaction_metrics(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
    total_transactions BIGINT,
    total_volume DECIMAL(15, 2),
    avg_sale_price DECIMAL(10, 2),
    total_platform_fees DECIMAL(15, 2),
    total_venue_royalties DECIMAL(15, 2),
    dispute_rate DECIMAL(5, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_transactions,
        SUM(sale_price) as total_volume,
        AVG(sale_price) as avg_sale_price,
        SUM(platform_fee) as total_platform_fees,
        SUM(venue_royalty) as total_venue_royalties,
        (COUNT(*) FILTER (WHERE escrow_dispute = true)::DECIMAL / COUNT(*)::DECIMAL * 100) as dispute_rate
    FROM marketplace.marketplace_transactions
    WHERE completed_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE marketplace.marketplace_transactions IS 'Complete transaction records for secondary market ticket sales';

-- Column comments
COMMENT ON COLUMN marketplace.marketplace_transactions.id IS 'Unique identifier for the transaction';
COMMENT ON COLUMN marketplace.marketplace_transactions.transaction_type IS 'How the sale was completed: direct, auction, or negotiated';
COMMENT ON COLUMN marketplace.marketplace_transactions.seller_net_amount IS 'Calculated: amount seller receives after all fees';
COMMENT ON COLUMN marketplace.marketplace_transactions.payment_status IS 'Current status of payment processing';
COMMENT ON COLUMN marketplace.marketplace_transactions.transfer_status IS 'Current status of ticket transfer process';
COMMENT ON COLUMN marketplace.marketplace_transactions.nft_transfer_signature IS 'Blockchain transaction hash for NFT transfers';
COMMENT ON COLUMN marketplace.marketplace_transactions.fraud_check_passed IS 'Whether transaction passed fraud prevention checks';
COMMENT ON COLUMN marketplace.marketplace_transactions.dispute_resolution IS 'Current status of any dispute';
COMMENT ON COLUMN marketplace.marketplace_transactions.tax_jurisdiction IS 'Tax jurisdiction code for reporting';
COMMENT ON COLUMN marketplace.marketplace_transactions.transaction_metadata IS 'Additional transaction data from payment processor';

-- Function comments
COMMENT ON FUNCTION marketplace.release_escrow IS 'Release escrowed funds to seller after successful transfer';
COMMENT ON FUNCTION marketplace.get_transaction_metrics IS 'Calculate marketplace metrics for a date range';

-- =============================================================================
-- SAMPLE DATA FOR TESTING (commented out for production)
-- =============================================================================

/*
-- Example: Direct sale transaction
INSERT INTO marketplace.marketplace_transactions (
    listing_id, offer_id, buyer_user_id, seller_user_id, ticket_id,
    sale_price, transaction_type,
    payment_intent_id, payment_status,
    buyer_verification_level, seller_verification_level,
    fraud_check_passed
) VALUES (
    'listing-uuid', 'offer-uuid', 'buyer-uuid', 'seller-uuid', 'ticket-uuid',
    250.00, 'direct_sale',
    'pi_1234567890', 'held_in_escrow',
    'standard', 'premium',
    true
);

-- Example: Auction win with tax
INSERT INTO marketplace.marketplace_transactions (
    listing_id, offer_id, buyer_user_id, seller_user_id, ticket_id,
    sale_price, transaction_type,
    payment_intent_id, payment_status,
    buyer_verification_level, seller_verification_level,
    fraud_check_passed,
    tax_applicable, tax_jurisdiction
) VALUES (
    'auction-listing-uuid', 'winning-bid-uuid', 'winner-uuid', 'seller-uuid', 'ticket-uuid',
    500.00, 'auction_win',
    'pi_0987654321', 'captured',
    'premium', 'trusted',
    true,
    true, 'US-NY'
);
*/

-- =============================================================================
-- END OF SCHEMA

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_tenant_id ON marketplace_transactions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_tenant_created ON marketplace_transactions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =============================================================================
