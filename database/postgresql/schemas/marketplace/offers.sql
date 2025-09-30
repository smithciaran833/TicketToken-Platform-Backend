-- =============================================================================
-- Marketplace Purchase Offers Schema
-- =============================================================================
-- This schema manages purchase offers and bids including:
-- - Direct purchase offers on fixed-price listings
-- - Auction bidding with automatic bid tracking
-- - Best offer negotiations with counter-offers
-- - Payment authorization and processing workflow
-- - Competition tracking for auctions
-- - Complete offer lifecycle management
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects
DROP TABLE IF EXISTS marketplace.offers CASCADE;
DROP TYPE IF EXISTS marketplace.offer_type CASCADE;
DROP TYPE IF EXISTS marketplace.offer_status CASCADE;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS marketplace;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Offer type enumeration
CREATE TYPE marketplace.offer_type AS ENUM (
    'direct',       -- Direct purchase at asking price
    'auction_bid',  -- Bid in an auction
    'best_offer'    -- Negotiable offer on best_offer listings
);

-- Offer status enumeration
CREATE TYPE marketplace.offer_status AS ENUM (
    'pending',      -- Awaiting seller decision or auction end
    'accepted',     -- Accepted by seller, awaiting payment
    'rejected',     -- Rejected by seller
    'expired',      -- Offer expired before acceptance
    'withdrawn',    -- Withdrawn by buyer
    'completed'     -- Payment processed and transfer complete
);

-- =============================================================================
-- MAIN OFFERS TABLE
-- =============================================================================

CREATE TABLE marketplace.offers (
    -- Primary identification
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Foreign key relationships
    listing_id                  UUID NOT NULL,
    buyer_user_id               UUID NOT NULL,
    seller_user_id              UUID NOT NULL,
    ticket_id                   UUID NOT NULL,
    
    -- Offer details
    offer_amount                DECIMAL(10, 2) NOT NULL CHECK (offer_amount > 0),
    currency                    VARCHAR(3) NOT NULL DEFAULT 'USD',
    offer_type                  marketplace.offer_type NOT NULL,
    
    -- Terms and conditions
    expires_at                  TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '48 hours'),
    payment_method_id           UUID,
    special_conditions          JSONB DEFAULT '{}',
    
    -- Status tracking
    status                      marketplace.offer_status NOT NULL DEFAULT 'pending',
    
    -- Negotiation flow
    is_counter_offer            BOOLEAN NOT NULL DEFAULT false,
    original_offer_id           UUID,
    counter_offer_count         INTEGER NOT NULL DEFAULT 0 CHECK (counter_offer_count >= 0),
    
    -- Payment readiness
    payment_authorized          BOOLEAN NOT NULL DEFAULT false,
    payment_hold_amount         DECIMAL(10, 2),
    payment_intent_id           VARCHAR(255),
    
    -- Communication
    buyer_message               TEXT,
    seller_response             TEXT,
    platform_notes              JSONB DEFAULT '{}',
    
    -- Competition tracking (for auctions)
    current_high_offer          DECIMAL(10, 2),
    offer_ranking               INTEGER,
    is_winning_bid              BOOLEAN GENERATED ALWAYS AS (
        offer_type = 'auction_bid' AND offer_ranking = 1
    ) STORED,
    
    -- Processing timeline
    accepted_at                 TIMESTAMPTZ,
    payment_due_at              TIMESTAMPTZ,
    transfer_completion_deadline TIMESTAMPTZ,
    
    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expired_at                  TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT fk_offers_listing FOREIGN KEY (listing_id) 
        REFERENCES marketplace.listings(id) ON DELETE CASCADE,
    CONSTRAINT fk_offers_buyer FOREIGN KEY (buyer_user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_offers_seller FOREIGN KEY (seller_user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_offers_ticket FOREIGN KEY (ticket_id) 
        REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_offers_payment_method FOREIGN KEY (payment_method_id) 
        REFERENCES payment_methods(id) ON DELETE SET NULL,
    CONSTRAINT fk_offers_original_offer FOREIGN KEY (original_offer_id) 
        REFERENCES marketplace.offers(id) ON DELETE SET NULL,
    
    -- Counter offer constraints
    CONSTRAINT chk_counter_offer_reference CHECK (
        (is_counter_offer = true AND original_offer_id IS NOT NULL)
        OR is_counter_offer = false
    ),
    
    -- Status-based constraints
    CONSTRAINT chk_accepted_timestamp CHECK (
        (status = 'accepted' AND accepted_at IS NOT NULL)
        OR status != 'accepted'
    ),
    CONSTRAINT chk_completed_timestamp CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR status != 'completed'
    ),
    CONSTRAINT chk_expired_timestamp CHECK (
        (status = 'expired' AND expired_at IS NOT NULL)
        OR status != 'expired'
    ),
    
    -- Payment constraints
    CONSTRAINT chk_payment_authorization CHECK (
        (status IN ('accepted', 'completed') AND payment_authorized = true)
        OR status NOT IN ('accepted', 'completed')
    ),
    CONSTRAINT chk_payment_hold CHECK (
        (payment_authorized = true AND payment_hold_amount IS NOT NULL AND payment_hold_amount >= offer_amount)
        OR payment_authorized = false
    ),
    
    -- Processing timeline constraints
    CONSTRAINT chk_payment_due CHECK (
        (status = 'accepted' AND payment_due_at IS NOT NULL AND payment_due_at > accepted_at)
        OR status != 'accepted'
    ),
    CONSTRAINT chk_transfer_deadline CHECK (
        (transfer_completion_deadline IS NULL OR transfer_completion_deadline > payment_due_at)
    ),
    
    -- Auction constraints
    CONSTRAINT chk_auction_ranking CHECK (
        (offer_type = 'auction_bid' AND offer_ranking IS NOT NULL AND offer_ranking > 0)
        OR offer_type != 'auction_bid'
    )
);

-- =============================================================================
-- INDEXES FOR OFFER MANAGEMENT AND AUCTION PROCESSING
-- =============================================================================

-- Primary operational indexes
CREATE INDEX idx_offers_listing_status ON marketplace.offers(listing_id, status);
CREATE INDEX idx_offers_buyer_status ON marketplace.offers(buyer_user_id, status);
CREATE INDEX idx_offers_seller_status ON marketplace.offers(seller_user_id, status);

-- Auction processing indexes
CREATE INDEX idx_offers_auction_ranking ON marketplace.offers(listing_id, offer_ranking) 
    WHERE offer_type = 'auction_bid' AND status = 'pending';
CREATE INDEX idx_offers_auction_amount ON marketplace.offers(listing_id, offer_amount DESC) 
    WHERE offer_type = 'auction_bid' AND status = 'pending';
CREATE INDEX idx_offers_winning_bids ON marketplace.offers(listing_id, is_winning_bid) 
    WHERE offer_type = 'auction_bid' AND is_winning_bid = true;

-- Status tracking indexes
CREATE INDEX idx_offers_pending_expiry ON marketplace.offers(expires_at) 
    WHERE status = 'pending';
CREATE INDEX idx_offers_accepted_payment ON marketplace.offers(payment_due_at) 
    WHERE status = 'accepted' AND payment_authorized = false;
CREATE INDEX idx_offers_payment_ready ON marketplace.offers(status, payment_authorized) 
    WHERE status = 'accepted' AND payment_authorized = true;

-- Negotiation tracking indexes
CREATE INDEX idx_offers_counter_offers ON marketplace.offers(original_offer_id, counter_offer_count) 
    WHERE is_counter_offer = true;
CREATE INDEX idx_offers_negotiation_chain ON marketplace.offers(listing_id, created_at) 
    WHERE offer_type = 'best_offer';

-- Payment processing indexes
CREATE INDEX idx_offers_payment_intent ON marketplace.offers(payment_intent_id) 
    WHERE payment_intent_id IS NOT NULL;
CREATE INDEX idx_offers_payment_pending ON marketplace.offers(payment_due_at, payment_authorized) 
    WHERE status = 'accepted';

-- Analytics indexes
CREATE INDEX idx_offers_completed_date ON marketplace.offers(completed_at, offer_amount) 
    WHERE status = 'completed';
CREATE INDEX idx_offers_type_status ON marketplace.offers(offer_type, status, created_at);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION marketplace.update_offer_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offers_update_timestamp
    BEFORE UPDATE ON marketplace.offers
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_offer_timestamp();

-- Auto-expire offers trigger
CREATE OR REPLACE FUNCTION marketplace.auto_expire_offers()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if offer should be expired
    IF NEW.expires_at <= CURRENT_TIMESTAMP AND OLD.status = 'pending' THEN
        NEW.status = 'expired';
        NEW.expired_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Check if payment is overdue for accepted offers
    IF NEW.payment_due_at IS NOT NULL 
       AND NEW.payment_due_at <= CURRENT_TIMESTAMP 
       AND OLD.status = 'accepted' 
       AND NEW.payment_authorized = false THEN
        NEW.status = 'expired';
        NEW.expired_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offers_auto_expire
    BEFORE UPDATE ON marketplace.offers
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.auto_expire_offers();

-- Update auction rankings trigger
CREATE OR REPLACE FUNCTION marketplace.update_auction_rankings()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process auction bids
    IF NEW.offer_type = 'auction_bid' THEN
        -- Update rankings for all bids on this listing
        WITH ranked_offers AS (
            SELECT 
                id,
                ROW_NUMBER() OVER (ORDER BY offer_amount DESC, created_at ASC) as new_ranking
            FROM marketplace.offers
            WHERE listing_id = NEW.listing_id
                AND offer_type = 'auction_bid'
                AND status = 'pending'
        )
        UPDATE marketplace.offers o
        SET 
            offer_ranking = ro.new_ranking,
            current_high_offer = (
                SELECT MAX(offer_amount) 
                FROM marketplace.offers 
                WHERE listing_id = NEW.listing_id 
                    AND offer_type = 'auction_bid' 
                    AND status = 'pending'
            )
        FROM ranked_offers ro
        WHERE o.id = ro.id;
        
        -- Update the listing's current high bid
        UPDATE marketplace.listings
        SET current_high_bid = (
            SELECT MAX(offer_amount) 
            FROM marketplace.offers 
            WHERE listing_id = NEW.listing_id 
                AND offer_type = 'auction_bid' 
                AND status = 'pending'
        )
        WHERE id = NEW.listing_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offers_update_auction_rankings
    AFTER INSERT OR UPDATE OF offer_amount, status ON marketplace.offers
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_auction_rankings();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to accept an offer
CREATE OR REPLACE FUNCTION marketplace.accept_offer(
    p_offer_id UUID,
    p_seller_response TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_listing_id UUID;
    v_offer_type marketplace.offer_type;
BEGIN
    -- Get offer details
    SELECT listing_id, offer_type INTO v_listing_id, v_offer_type
    FROM marketplace.offers
    WHERE id = p_offer_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Begin transaction
    BEGIN
        -- Update the accepted offer
        UPDATE marketplace.offers
        SET 
            status = 'accepted',
            accepted_at = CURRENT_TIMESTAMP,
            payment_due_at = CURRENT_TIMESTAMP + INTERVAL '24 hours',
            transfer_completion_deadline = CURRENT_TIMESTAMP + INTERVAL '72 hours',
            seller_response = p_seller_response
        WHERE id = p_offer_id;
        
        -- Reject all other pending offers for this listing
        UPDATE marketplace.offers
        SET 
            status = 'rejected',
            platform_notes = jsonb_set(
                COALESCE(platform_notes, '{}'::jsonb),
                '{auto_rejected}',
                'true'::jsonb
            )
        WHERE listing_id = v_listing_id 
            AND id != p_offer_id 
            AND status = 'pending';
        
        -- Update listing status to sold
        UPDATE marketplace.listings
        SET status = 'sold'
        WHERE id = v_listing_id;
        
        RETURN TRUE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE;
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE marketplace.offers IS 'Purchase offers and bids for marketplace listings';

-- Column comments
COMMENT ON COLUMN marketplace.offers.id IS 'Unique identifier for the offer';
COMMENT ON COLUMN marketplace.offers.offer_type IS 'Type of offer: direct purchase, auction bid, or negotiable offer';
COMMENT ON COLUMN marketplace.offers.is_counter_offer IS 'True if this is a counter-offer in a negotiation';
COMMENT ON COLUMN marketplace.offers.counter_offer_count IS 'Number of counter-offers in this negotiation chain';
COMMENT ON COLUMN marketplace.offers.payment_authorized IS 'True when payment has been pre-authorized';
COMMENT ON COLUMN marketplace.offers.payment_hold_amount IS 'Amount held/authorized on payment method';
COMMENT ON COLUMN marketplace.offers.current_high_offer IS 'Current highest offer for this listing (auctions)';
COMMENT ON COLUMN marketplace.offers.offer_ranking IS 'Current rank among all offers (1 = highest)';
COMMENT ON COLUMN marketplace.offers.is_winning_bid IS 'Calculated: true if this is currently the winning bid';
COMMENT ON COLUMN marketplace.offers.special_conditions IS 'JSON object with any special terms or conditions';
COMMENT ON COLUMN marketplace.offers.platform_notes IS 'Internal platform notes and metadata';

-- Function comments
COMMENT ON FUNCTION marketplace.accept_offer IS 'Accept an offer and handle all related status updates';

-- =============================================================================
-- SAMPLE DATA FOR TESTING (commented out for production)
-- =============================================================================

/*
-- Example: Direct purchase offer
INSERT INTO marketplace.offers (
    listing_id, buyer_user_id, seller_user_id, ticket_id,
    offer_amount, offer_type, payment_method_id,
    payment_authorized, payment_hold_amount
) VALUES (
    'listing-uuid', 'buyer-uuid', 'seller-uuid', 'ticket-uuid',
    150.00, 'direct', 'payment-method-uuid',
    true, 150.00
);

-- Example: Auction bid
INSERT INTO marketplace.offers (
    listing_id, buyer_user_id, seller_user_id, ticket_id,
    offer_amount, offer_type,
    buyer_message
) VALUES (
    'auction-listing-uuid', 'bidder-uuid', 'seller-uuid', 'ticket-uuid',
    225.00, 'auction_bid',
    'Willing to pay immediately if accepted'
);

-- Example: Best offer with counter-offer
INSERT INTO marketplace.offers (
    listing_id, buyer_user_id, seller_user_id, ticket_id,
    offer_amount, offer_type,
    is_counter_offer, original_offer_id, counter_offer_count,
    seller_response
) VALUES (
    'negotiable-listing-uuid', 'buyer-uuid', 'seller-uuid', 'ticket-uuid',
    180.00, 'best_offer',
    true, 'original-offer-uuid', 1,
    'I can accept $180 if you can complete payment today'
);
*/

-- =============================================================================
-- END OF SCHEMA

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_offers_tenant_id ON offers(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offers_tenant_created ON offers(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =============================================================================
