-- =============================================================================
-- Secondary Market Listings Schema
-- =============================================================================
-- This schema manages ticket resale marketplace functionality including:
-- - Fixed price, auction, and best offer listing types
-- - Fraud prevention and seller verification
-- - Dynamic pricing with market positioning
-- - Transfer conditions and royalty management
-- - Performance tracking and analytics
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects
DROP TABLE IF EXISTS marketplace.listings CASCADE;
DROP TYPE IF EXISTS marketplace.listing_type CASCADE;
DROP TYPE IF EXISTS marketplace.listing_status CASCADE;
DROP TYPE IF EXISTS marketplace.verification_level CASCADE;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS marketplace;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Listing type enumeration
CREATE TYPE marketplace.listing_type AS ENUM (
    'fixed',       -- Fixed price listing
    'auction',     -- Auction with bidding
    'best_offer'   -- Accept offers from buyers
);

-- Listing status enumeration
CREATE TYPE marketplace.listing_status AS ENUM (
    'active',       -- Currently available for purchase
    'sold',         -- Successfully sold
    'cancelled',    -- Cancelled by seller
    'expired',      -- Listing period expired
    'suspended',    -- Temporarily suspended by system
    'under_review'  -- Under review for policy compliance
);

-- Seller verification level
CREATE TYPE marketplace.verification_level AS ENUM (
    'unverified',   -- New seller, no verification
    'basic',        -- Email/phone verified
    'standard',     -- ID verified
    'premium',      -- Full verification with history
    'trusted'       -- Long-term trusted seller
);

-- =============================================================================
-- MAIN LISTINGS TABLE
-- =============================================================================

CREATE TABLE marketplace.listings (
    -- Primary identification
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Foreign key relationships
    ticket_id               UUID NOT NULL,
    seller_user_id          UUID NOT NULL,
    event_id                UUID NOT NULL,
    venue_id                UUID NOT NULL,
    
    -- Listing details
    listing_price           DECIMAL(10, 2) NOT NULL CHECK (listing_price > 0),
    original_price          DECIMAL(10, 2) NOT NULL CHECK (original_price > 0),
    currency                VARCHAR(3) NOT NULL DEFAULT 'USD',
    listing_type            marketplace.listing_type NOT NULL DEFAULT 'fixed',
    
    -- Market positioning
    -- These are calculated fields but stored for query performance
    is_below_face_value     BOOLEAN GENERATED ALWAYS AS (listing_price < original_price) STORED,
    discount_percentage     DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN original_price > 0 AND listing_price < original_price 
            THEN ((original_price - listing_price) / original_price * 100)
            ELSE 0
        END
    ) STORED,
    premium_percentage      DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN original_price > 0 AND listing_price > original_price 
            THEN ((listing_price - original_price) / original_price * 100)
            ELSE 0
        END
    ) STORED,
    
    -- Auction specific fields
    auction_start_time      TIMESTAMPTZ,
    auction_end_time        TIMESTAMPTZ,
    reserve_price           DECIMAL(10, 2),
    current_high_bid        DECIMAL(10, 2),
    
    -- Status tracking
    status                  marketplace.listing_status NOT NULL DEFAULT 'active',
    
    -- Visibility settings
    is_public               BOOLEAN NOT NULL DEFAULT true,
    featured_listing        BOOLEAN NOT NULL DEFAULT false,
    boost_level             INTEGER NOT NULL DEFAULT 0 CHECK (boost_level >= 0 AND boost_level <= 10),
    
    -- Transfer conditions
    transfer_fee            DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
    royalty_fee_percentage  DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (royalty_fee_percentage >= 0 AND royalty_fee_percentage <= 100),
    venue_approval_required BOOLEAN NOT NULL DEFAULT false,
    
    -- Fraud prevention
    verification_level      marketplace.verification_level NOT NULL DEFAULT 'unverified',
    seller_reputation_score DECIMAL(3, 2) CHECK (seller_reputation_score >= 0 AND seller_reputation_score <= 5),
    listing_flags           JSONB DEFAULT '{}',
    
    -- Performance metrics
    view_count              INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    inquiry_count           INTEGER NOT NULL DEFAULT 0 CHECK (inquiry_count >= 0),
    bid_count               INTEGER NOT NULL DEFAULT 0 CHECK (bid_count >= 0),
    time_listed             INTERVAL GENERATED ALWAYS AS (
        CASE 
            WHEN sold_at IS NOT NULL THEN sold_at - listed_at
            WHEN status IN ('cancelled', 'expired', 'suspended') THEN updated_at - listed_at
            ELSE CURRENT_TIMESTAMP - listed_at
        END
    ) STORED,
    
    -- Timestamps
    listed_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sold_at                 TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT fk_listings_ticket FOREIGN KEY (ticket_id) 
        REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_listings_seller FOREIGN KEY (seller_user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_listings_event FOREIGN KEY (event_id) 
        REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_listings_venue FOREIGN KEY (venue_id) 
        REFERENCES venues(id) ON DELETE CASCADE,
    
    -- Auction constraints
    CONSTRAINT chk_auction_times CHECK (
        (listing_type = 'auction' AND auction_start_time IS NOT NULL AND auction_end_time IS NOT NULL AND auction_end_time > auction_start_time)
        OR listing_type != 'auction'
    ),
    CONSTRAINT chk_reserve_price CHECK (
        (listing_type = 'auction' AND reserve_price IS NOT NULL AND reserve_price > 0)
        OR listing_type != 'auction'
    ),
    
    -- Status constraints
    CONSTRAINT chk_sold_timestamp CHECK (
        (status = 'sold' AND sold_at IS NOT NULL)
        OR status != 'sold'
    ),
    
    -- Price constraints
    CONSTRAINT chk_bid_price CHECK (
        current_high_bid IS NULL OR current_high_bid >= listing_price
    )
);

-- =============================================================================
-- INDEXES FOR MARKETPLACE SEARCH AND FILTERING
-- =============================================================================

-- Primary search indexes
CREATE INDEX idx_listings_status_public ON marketplace.listings(status, is_public) 
    WHERE status = 'active';
CREATE INDEX idx_listings_event_status ON marketplace.listings(event_id, status) 
    WHERE status = 'active';
CREATE INDEX idx_listings_seller ON marketplace.listings(seller_user_id);

-- Price-based search indexes
CREATE INDEX idx_listings_price_range ON marketplace.listings(listing_price, original_price) 
    WHERE status = 'active';
CREATE INDEX idx_listings_below_face ON marketplace.listings(is_below_face_value, discount_percentage) 
    WHERE status = 'active' AND is_below_face_value = true;
CREATE INDEX idx_listings_premium ON marketplace.listings(premium_percentage) 
    WHERE status = 'active' AND premium_percentage > 0;

-- Auction-specific indexes
CREATE INDEX idx_listings_auction_ending ON marketplace.listings(auction_end_time) 
    WHERE listing_type = 'auction' AND status = 'active';
CREATE INDEX idx_listings_auction_bids ON marketplace.listings(bid_count, current_high_bid) 
    WHERE listing_type = 'auction' AND status = 'active';

-- Featured and boosted listings
CREATE INDEX idx_listings_featured ON marketplace.listings(featured_listing, boost_level, listed_at DESC) 
    WHERE status = 'active' AND is_public = true;

-- Performance and analytics indexes
CREATE INDEX idx_listings_performance ON marketplace.listings(view_count, inquiry_count) 
    WHERE status = 'active';
CREATE INDEX idx_listings_sold_date ON marketplace.listings(sold_at, listing_price) 
    WHERE status = 'sold';

-- Fraud prevention indexes
CREATE INDEX idx_listings_verification ON marketplace.listings(verification_level, seller_reputation_score) 
    WHERE status = 'active';
CREATE INDEX idx_listings_flags ON marketplace.listings USING GIN(listing_flags) 
    WHERE jsonb_array_length(listing_flags -> 'flags') > 0;

-- Expiration management
CREATE INDEX idx_listings_expiring ON marketplace.listings(expires_at) 
    WHERE status = 'active' AND expires_at IS NOT NULL;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION marketplace.update_listing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_update_timestamp
    BEFORE UPDATE ON marketplace.listings
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_listing_timestamp();

-- Auto-expire listings trigger
CREATE OR REPLACE FUNCTION marketplace.auto_expire_listings()
RETURNS TRIGGER AS $$
BEGIN
    -- For auctions, check auction end time
    IF NEW.listing_type = 'auction' AND NEW.auction_end_time <= CURRENT_TIMESTAMP AND OLD.status = 'active' THEN
        NEW.status = 'expired';
    END IF;
    
    -- For all listings, check expires_at
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= CURRENT_TIMESTAMP AND OLD.status = 'active' THEN
        NEW.status = 'expired';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_auto_expire
    BEFORE UPDATE ON marketplace.listings
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.auto_expire_listings();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE marketplace.listings IS 'Secondary market ticket listings for resale';

-- Column comments
COMMENT ON COLUMN marketplace.listings.id IS 'Unique identifier for the listing';
COMMENT ON COLUMN marketplace.listings.ticket_id IS 'Reference to the ticket being sold';
COMMENT ON COLUMN marketplace.listings.seller_user_id IS 'User selling the ticket';
COMMENT ON COLUMN marketplace.listings.listing_type IS 'Type of listing: fixed price, auction, or best offer';
COMMENT ON COLUMN marketplace.listings.is_below_face_value IS 'Calculated: true if listing price is below original price';
COMMENT ON COLUMN marketplace.listings.discount_percentage IS 'Calculated: percentage discount from face value';
COMMENT ON COLUMN marketplace.listings.premium_percentage IS 'Calculated: percentage premium above face value';
COMMENT ON COLUMN marketplace.listings.boost_level IS 'Paid promotion level (0-10) for visibility';
COMMENT ON COLUMN marketplace.listings.verification_level IS 'Seller verification status for trust';
COMMENT ON COLUMN marketplace.listings.listing_flags IS 'JSON array of policy/fraud flags';
COMMENT ON COLUMN marketplace.listings.time_listed IS 'Calculated: duration the listing has been active';

-- =============================================================================
-- SAMPLE DATA FOR TESTING (commented out for production)
-- =============================================================================

/*
-- Example: Fixed price listing below face value
INSERT INTO marketplace.listings (
    ticket_id, seller_user_id, event_id, venue_id,
    listing_price, original_price, listing_type,
    verification_level, seller_reputation_score
) VALUES (
    'ticket-uuid', 'seller-uuid', 'event-uuid', 'venue-uuid',
    75.00, 100.00, 'fixed',
    'standard', 4.5
);

-- Example: Auction listing
INSERT INTO marketplace.listings (
    ticket_id, seller_user_id, event_id, venue_id,
    listing_price, original_price, listing_type,
    auction_start_time, auction_end_time, reserve_price,
    featured_listing, boost_level
) VALUES (
    'ticket-uuid-2', 'seller-uuid-2', 'event-uuid', 'venue-uuid',
    150.00, 100.00, 'auction',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days', 200.00,
    true, 5
);
*/

-- =============================================================================
-- END OF SCHEMA

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_listings_tenant_id ON listings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_tenant_created ON listings(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =============================================================================
