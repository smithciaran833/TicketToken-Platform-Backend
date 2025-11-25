-- Marketplace listings table with concurrency control
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE,
  seller_id VARCHAR(255) NOT NULL,
  buyer_id VARCHAR(255),
  venue_id UUID NOT NULL,
  event_id UUID NOT NULL,
  price INTEGER NOT NULL,
  original_face_value INTEGER NOT NULL,
  price_multiplier DECIMAL(5,2),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  resale_count INT DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  listed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sold_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  listing_signature TEXT,
  wallet_address TEXT NOT NULL,
  program_address TEXT,
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP,
  approved_by UUID,
  approval_notes TEXT,
  view_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_venue_event ON marketplace_listings(venue_id, event_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_expires ON marketplace_listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_ticket ON marketplace_listings(ticket_id);

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
  buyer_id VARCHAR(255) NOT NULL,
  seller_id VARCHAR(255) NOT NULL,
  ticket_id UUID NOT NULL,
  price INTEGER NOT NULL,
  venue_fee INTEGER DEFAULT 0,
  platform_fee INTEGER DEFAULT 0,
  payment_intent_id VARCHAR(255),
  transfer_tx_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_buyer ON marketplace_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_seller ON marketplace_purchases(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_status ON marketplace_purchases(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_listing ON marketplace_purchases(listing_id);
