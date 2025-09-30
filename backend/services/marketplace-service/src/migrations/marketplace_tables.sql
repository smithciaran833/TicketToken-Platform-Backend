-- Marketplace listings table with concurrency control
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE, -- Ensures one listing per ticket
  seller_id VARCHAR(255) NOT NULL,
  buyer_id VARCHAR(255),
  venue_id UUID NOT NULL,
  event_id UUID NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),
  status VARCHAR(20) DEFAULT 'active', -- active, sold, cancelled, expired
  resale_count INT DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  listed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sold_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  INDEX idx_status (status),
  INDEX idx_venue_event (venue_id, event_id),
  INDEX idx_seller (seller_id),
  INDEX idx_expires (expires_at),
  
  -- Ensure ticket can only be listed once when active
  CONSTRAINT unique_active_listing UNIQUE (ticket_id, status) 
    WHERE status = 'active'
);

-- Marketplace purchases
CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
  buyer_id VARCHAR(255) NOT NULL,
  seller_id VARCHAR(255) NOT NULL,
  ticket_id UUID NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  venue_fee DECIMAL(10, 2) DEFAULT 0,
  platform_fee DECIMAL(10, 2) DEFAULT 0,
  payment_intent_id VARCHAR(255),
  transfer_tx_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, refunded
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_buyer (buyer_id),
  INDEX idx_seller (seller_id),
  INDEX idx_status (status)
);

-- Venue marketplace policies
CREATE TABLE IF NOT EXISTS venue_marketplace_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  max_resale_price DECIMAL(10, 2),
  min_resale_price DECIMAL(10, 2),
  sale_window_start TIMESTAMP WITH TIME ZONE,
  sale_window_end TIMESTAMP WITH TIME ZONE,
  max_resales INT DEFAULT 3,
  venue_fee_percent DECIMAL(5, 2) DEFAULT 5.0,
  platform_fee_percent DECIMAL(5, 2) DEFAULT 2.5,
  allow_international BOOLEAN DEFAULT true,
  require_kyc BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_venue_active (venue_id, active)
);

-- Outbox for event emission
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_unprocessed (processed, created_at)
);

-- Function to prevent concurrent updates
CREATE OR REPLACE FUNCTION prevent_concurrent_purchase()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is changing from 'active' to 'sold'
  IF OLD.status = 'active' AND NEW.status = 'sold' THEN
    -- Use advisory lock on ticket_id to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext(OLD.ticket_id::text));
    
    -- Double-check status hasn't changed
    IF (SELECT status FROM marketplace_listings WHERE id = OLD.id) != 'active' THEN
      RAISE EXCEPTION 'Listing already sold';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for concurrent purchase prevention
DROP TRIGGER IF EXISTS prevent_concurrent_purchase_trigger ON marketplace_listings;
CREATE TRIGGER prevent_concurrent_purchase_trigger
  BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION prevent_concurrent_purchase();
