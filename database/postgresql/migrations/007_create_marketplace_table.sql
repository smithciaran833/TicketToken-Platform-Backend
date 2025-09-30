-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration: Create Marketplace Tables
-- Version: 007
-- Description: Creates secondary market tables for ticket resale with royalties and escrow
-- Estimated execution time: < 3 seconds
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- UP Migration
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create listings table (secondary market listings)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.listings (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- References
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.users(id),
  
  -- Listing details
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  listing_type VARCHAR(50) DEFAULT 'FIXED_PRICE', -- FIXED_PRICE, AUCTION, NEGOTIABLE
  
  -- Pricing
  price NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  original_price NUMERIC(10, 2), -- Original ticket price for comparison
  
  -- Dynamic pricing limits
  min_price NUMERIC(10, 2),
  max_price NUMERIC(10, 2),
  price_cap_percentage NUMERIC(5, 2) DEFAULT 200, -- Max 200% of face value
  auto_price_drop BOOLEAN DEFAULT FALSE,
  price_drop_percentage NUMERIC(5, 2),
  price_drop_interval_hours INTEGER DEFAULT 24,
  last_price_drop_at TIMESTAMP WITH TIME ZONE,
  
  -- Market making
  market_maker_enabled BOOLEAN DEFAULT FALSE,
  spread_percentage NUMERIC(5, 2) DEFAULT 2.0,
  liquidity_pool_id UUID,
  
  -- Visibility
  is_featured BOOLEAN DEFAULT FALSE,
  featured_until TIMESTAMP WITH TIME ZONE,
  visibility VARCHAR(50) DEFAULT 'PUBLIC',
  
  -- Terms
  instant_transfer BOOLEAN DEFAULT TRUE,
  transfer_deadline_hours INTEGER DEFAULT 24,
  accepts_offers BOOLEAN DEFAULT TRUE,
  
  -- Analytics
  view_count INTEGER DEFAULT 0,
  offer_count INTEGER DEFAULT 0,
  price_history JSONB DEFAULT '[]', -- Array of {price, timestamp}
  
  -- Metadata
  listing_title VARCHAR(200),
  listing_description TEXT,
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  listed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  sold_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_listing_status CHECK (status IN (
      'DRAFT', 'ACTIVE', 'SOLD', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'PENDING_APPROVAL'
  )),
  CONSTRAINT valid_price_limits CHECK (
      (min_price IS NULL OR price >= min_price) AND
      (max_price IS NULL OR price <= max_price)
  ),
  CONSTRAINT price_cap_check CHECK (
      original_price IS NULL OR 
      price <= original_price * (price_cap_percentage / 100.0)
  )
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create offers table (purchase offers)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.offers (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- References
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.users(id),
  
  -- Offer details
  offer_amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  
  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  
  -- Messages
  buyer_message TEXT,
  seller_response TEXT,
  
  -- Counter offers
  is_counter_offer BOOLEAN DEFAULT FALSE,
  previous_offer_id UUID REFERENCES public.offers(id),
  counter_offer_count INTEGER DEFAULT 0,
  
  -- Auto-accept rules
  auto_accept_enabled BOOLEAN DEFAULT FALSE,
  auto_accept_price NUMERIC(10, 2),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_offer_status CHECK (status IN (
      'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'COUNTERED', 'AUTO_REJECTED'
  )),
  CONSTRAINT positive_offer CHECK (offer_amount > 0),
  CONSTRAINT max_counter_offers CHECK (counter_offer_count <= 5)
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create marketplace_transactions table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.marketplace_transactions (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- References
  listing_id UUID NOT NULL REFERENCES public.listings(id),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id),
  buyer_id UUID NOT NULL REFERENCES public.users(id),
  seller_id UUID NOT NULL REFERENCES public.users(id),
  offer_id UUID REFERENCES public.offers(id),
  escrow_id UUID, -- Will reference escrow table
  
  -- Transaction details
  transaction_type VARCHAR(50) NOT NULL DEFAULT 'SALE',
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  
  -- Financial details
  sale_price NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  
  -- Fees breakdown
  platform_fee NUMERIC(10, 2) DEFAULT 0,
  platform_fee_percentage NUMERIC(5, 2) DEFAULT 5.0,
  payment_processing_fee NUMERIC(10, 2) DEFAULT 0,
  blockchain_fee NUMERIC(10, 2) DEFAULT 0,
  total_fees NUMERIC(10, 2) GENERATED ALWAYS AS (
      platform_fee + payment_processing_fee + blockchain_fee
  ) STORED,
  seller_payout NUMERIC(10, 2) GENERATED ALWAYS AS (
      sale_price - platform_fee - payment_processing_fee - blockchain_fee
  ) STORED,
  
  -- Transfer details
  transfer_initiated_at TIMESTAMP WITH TIME ZONE,
  transfer_completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_transaction_status CHECK (status IN (
      'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DISPUTED', 'REFUNDED'
  )),
  CONSTRAINT valid_transaction_type CHECK (transaction_type IN (
      'SALE', 'AUCTION_WIN', 'OFFER_ACCEPTED', 'INSTANT_BUY'
  ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create royalties table (venue royalty tracking)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.royalties (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- References
  marketplace_transaction_id UUID NOT NULL REFERENCES public.marketplace_transactions(id),
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  recipient_id UUID NOT NULL REFERENCES public.users(id), -- Venue owner
  
  -- Royalty details
  royalty_percentage NUMERIC(5, 2) NOT NULL,
  sale_amount NUMERIC(10, 2) NOT NULL,
  royalty_amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  
  -- Payment status
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  payment_transaction_id UUID REFERENCES public.transactions(id),
  
  -- Distribution rules
  distribution_type VARCHAR(50) DEFAULT 'IMMEDIATE', -- IMMEDIATE, BATCH, THRESHOLD
  batch_id UUID,
  
  -- Metadata
  calculation_details JSONB DEFAULT '{}',
  
  -- Audit fields
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_royalty_status CHECK (status IN (
      'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'
  )),
  CONSTRAINT valid_royalty_percentage CHECK (
      royalty_percentage >= 0 AND royalty_percentage <= 50
  ),
  CONSTRAINT royalty_calculation_check CHECK (
      royalty_amount = ROUND(sale_amount * (royalty_percentage / 100.0), 2)
  )
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create escrow table (payment holding)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.escrow (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- References
  marketplace_transaction_id UUID UNIQUE NOT NULL REFERENCES public.marketplace_transactions(id),
  payment_transaction_id UUID REFERENCES public.transactions(id),
  
  -- Parties
  buyer_id UUID NOT NULL REFERENCES public.users(id),
  seller_id UUID NOT NULL REFERENCES public.users(id),
  
  -- Escrow details
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'HELD',
  
  -- Release conditions
  release_type VARCHAR(50) DEFAULT 'AUTOMATIC', -- AUTOMATIC, MANUAL, CONDITIONAL
  auto_release_at TIMESTAMP WITH TIME ZONE,
  release_conditions JSONB DEFAULT '{}',
  
  -- Release approval
  buyer_approved BOOLEAN DEFAULT FALSE,
  seller_approved BOOLEAN DEFAULT FALSE,
  admin_approved BOOLEAN DEFAULT FALSE,
  buyer_approved_at TIMESTAMP WITH TIME ZONE,
  seller_approved_at TIMESTAMP WITH TIME ZONE,
  admin_approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Dispute
  is_disputed BOOLEAN DEFAULT FALSE,
  dispute_id UUID,
  
  -- Release details
  released_at TIMESTAMP WITH TIME ZONE,
  released_to VARCHAR(50), -- SELLER, BUYER, SPLIT
  release_transaction_id UUID REFERENCES public.transactions(id),
  
  -- Metadata
  hold_reason TEXT,
  release_notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_escrow_status CHECK (status IN (
      'HELD', 'PENDING_RELEASE', 'RELEASED', 'REFUNDED', 'DISPUTED', 'EXPIRED'
  )),
  CONSTRAINT valid_release_type CHECK (release_type IN (
      'AUTOMATIC', 'MANUAL', 'CONDITIONAL', 'DISPUTE_RESOLUTION'
  ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create dispute_resolution table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.dispute_resolution (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- References
  marketplace_transaction_id UUID NOT NULL REFERENCES public.marketplace_transactions(id),
  escrow_id UUID REFERENCES public.escrow(id),
  
  -- Dispute parties
  initiator_id UUID NOT NULL REFERENCES public.users(id),
  respondent_id UUID NOT NULL REFERENCES public.users(id),
  
  -- Dispute details
  dispute_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  priority VARCHAR(20) DEFAULT 'NORMAL',
  
  -- Reason and evidence
  reason VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB DEFAULT '[]', -- Array of {type, TEXT, description}
  
  -- Resolution
  resolution_type VARCHAR(50),
  resolution_decision TEXT,
  resolved_by UUID REFERENCES public.users(id),
  resolution_amount NUMERIC(10, 2),
  buyer_refund_amount NUMERIC(10, 2),
  seller_payout_amount NUMERIC(10, 2),
  
  -- Communication
  messages JSONB DEFAULT '[]', -- Array of {sender_id, message, timestamp}
  last_message_at TIMESTAMP WITH TIME ZONE,
  
  -- Escalation
  is_escalated BOOLEAN DEFAULT FALSE,
  escalated_at TIMESTAMP WITH TIME ZONE,
  escalation_level INTEGER DEFAULT 1,
  
  -- Deadlines
  response_deadline TIMESTAMP WITH TIME ZONE,
  resolution_deadline TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_dispute_status CHECK (status IN (
      'OPEN', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED', 'ESCALATED'
  )),
  CONSTRAINT valid_dispute_type CHECK (dispute_type IN (
      'NON_DELIVERY', 'NOT_AS_DESCRIBED', 'FRAUDULENT', 'DUPLICATE_CHARGE',
      'TRANSFER_ISSUE', 'AUTHENTICATION', 'OTHER'
  )),
  CONSTRAINT valid_resolution_type CHECK (resolution_type IS NULL OR resolution_type IN (
      'FULL_REFUND', 'PARTIAL_REFUND', 'NO_REFUND', 'REPLACEMENT', 'SPLIT'
  ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create price_history table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.price_history (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- References
  ticket_id UUID NOT NULL REFERENCES public.tickets(id),
  listing_id UUID REFERENCES public.listings(id),
  
  -- Price data
  price NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  price_type VARCHAR(50) NOT NULL, -- LISTING, SALE, OFFER
  
  -- Market data at time
  market_average NUMERIC(10, 2),
  market_low NUMERIC(10, 2),
  market_high NUMERIC(10, 2),
  percentile_rank INTEGER,
  
  -- Context
  event_id UUID NOT NULL REFERENCES public.events(id),
  days_until_event INTEGER,
  
  -- Metadata
  source VARCHAR(50), -- USER, SYSTEM, MARKET_MAKER
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_price_type CHECK (price_type IN (
      'LISTING', 'SALE', 'OFFER', 'ASK', 'BID', 'MARKET_MAKER'
  ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create market_analytics table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.market_analytics (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- Scope
  analytics_type VARCHAR(50) NOT NULL, -- EVENT, VENUE, CATEGORY, GLOBAL
  scope_id UUID, -- event_id, venue_id, or NULL for global
  period VARCHAR(20) NOT NULL, -- HOURLY, DAILY, WEEKLY, MONTHLY
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Volume metrics
  total_listings INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  total_volume NUMERIC(12, 2) DEFAULT 0,
  
  -- Price metrics
  average_price NUMERIC(10, 2),
  median_price NUMERIC(10, 2),
  price_std_dev NUMERIC(10, 2),
  min_price NUMERIC(10, 2),
  max_price NUMERIC(10, 2),
  
  -- Market depth
  active_listings INTEGER DEFAULT 0,
  unique_sellers INTEGER DEFAULT 0,
  unique_buyers INTEGER DEFAULT 0,
  
  -- Liquidity metrics
  average_time_to_sale INTERVAL,
  sell_through_rate NUMERIC(5, 2), -- Percentage
  
  -- Price movement
  price_change_percentage NUMERIC(5, 2),
  volatility_index NUMERIC(5, 2),
  
  -- Metadata
  calculation_metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_analytics_type CHECK (analytics_type IN (
      'EVENT', 'VENUE', 'CATEGORY', 'ARTIST', 'GLOBAL'
  )),
  CONSTRAINT valid_period CHECK (period IN (
      'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'
  )),
  CONSTRAINT unique_analytics UNIQUE (analytics_type, scope_id, period, period_start)
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create fraud_prevention_rules table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.fraud_prevention_rules (
  -- Primary key
  id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,

  -- Rule definition
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  rule_type VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  severity VARCHAR(20) DEFAULT 'MEDIUM',
  
  -- Conditions (JSONB for flexibility)
  conditions JSONB NOT NULL,
  /* Example conditions:
  {
      "price_variance": {"max_percentage": 300},
      "velocity": {"max_listings_per_hour": 10},
      "geographic": {"restricted_countries": ["XX", "YY"]},
      "user_age": {"min_days": 7},
      "payment_method": {"prohibited_types": ["prepaid_card"]}
  }
  */
  
  -- Actions
  action VARCHAR(50) NOT NULL,
  action_parameters JSONB DEFAULT '{}',
  
  -- Metrics
  triggers_count INTEGER DEFAULT 0,
  false_positive_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_rule_type CHECK (rule_type IN (
      'PRICE_MANIPULATION', 'VELOCITY', 'GEOGRAPHIC', 'PAYMENT', 'USER_BEHAVIOR',
      'LISTING_PATTERN', 'TRANSACTION_PATTERN'
  )),
  CONSTRAINT valid_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT valid_action CHECK (action IN (
      'BLOCK', 'FLAG_REVIEW', 'REQUIRE_VERIFICATION', 'LIMIT_FEATURES',
      'NOTIFY_ADMIN', 'AUTO_DELIST'
  ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Listings indexes
CREATE INDEX idx_listings_ticket_id ON public.listings(ticket_id);
CREATE INDEX idx_listings_seller_id ON public.listings(seller_id);
CREATE INDEX idx_listings_status ON public.listings(status) WHERE status = 'ACTIVE';
CREATE INDEX idx_listings_price ON public.listings(price);
CREATE INDEX idx_listings_expires_at ON public.listings(expires_at) WHERE expires_at IS NOT NULL;

-- Offers indexes
CREATE INDEX idx_offers_listing_id ON public.offers(listing_id);
CREATE INDEX idx_offers_buyer_id ON public.offers(buyer_id);
CREATE INDEX idx_offers_status ON public.offers(status);
CREATE INDEX idx_offers_expires_at ON public.offers(expires_at);

-- Marketplace transactions indexes
CREATE INDEX idx_marketplace_tx_listing_id ON public.marketplace_transactions(listing_id);
CREATE INDEX idx_marketplace_tx_buyer_id ON public.marketplace_transactions(buyer_id);
CREATE INDEX idx_marketplace_tx_seller_id ON public.marketplace_transactions(seller_id);
CREATE INDEX idx_marketplace_tx_status ON public.marketplace_transactions(status);

-- Royalties indexes
CREATE INDEX idx_royalties_venue_id ON public.royalties(venue_id);
CREATE INDEX idx_royalties_status ON public.royalties(status);
CREATE INDEX idx_royalties_batch_id ON public.royalties(batch_id) WHERE batch_id IS NOT NULL;

-- Escrow indexes
CREATE INDEX idx_escrow_status ON public.escrow(status);
CREATE INDEX idx_escrow_auto_release ON public.escrow(auto_release_at) WHERE status = 'HELD';

-- Dispute resolution indexes
CREATE INDEX idx_disputes_status ON public.dispute_resolution(status);
CREATE INDEX idx_disputes_priority ON public.dispute_resolution(priority, created_at);

-- Price history indexes
CREATE INDEX idx_price_history_ticket_id ON public.price_history(ticket_id);
CREATE INDEX idx_price_history_event_id ON public.price_history(event_id);
CREATE INDEX idx_price_history_recorded_at ON public.price_history(recorded_at);

-- Market analytics indexes
CREATE INDEX idx_market_analytics_lookup ON public.market_analytics(analytics_type, scope_id, period, period_start);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Triggers
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Update timestamp triggers
CREATE TRIGGER trigger_update_listings_timestamp
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_offers_timestamp
  BEFORE UPDATE ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_marketplace_tx_timestamp
  BEFORE UPDATE ON public.marketplace_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_royalties_timestamp
  BEFORE UPDATE ON public.royalties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_escrow_timestamp
  BEFORE UPDATE ON public.escrow
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_disputes_timestamp
  BEFORE UPDATE ON public.dispute_resolution
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_fraud_rules_timestamp
  BEFORE UPDATE ON public.fraud_prevention_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Track price history on listing changes
CREATE OR REPLACE FUNCTION track_price_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Record price change
  IF NEW.price != OLD.price OR TG_OP = 'INSERT' THEN
      INSERT INTO public.price_history (
          ticket_id, listing_id, price, currency, price_type, event_id, source
      )
      SELECT 
          NEW.ticket_id, NEW.id, NEW.price, NEW.currency, 'LISTING',
          t.event_id, 'USER'
      FROM public.tickets t
      WHERE t.id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_listing_price
  AFTER INSERT OR UPDATE OF price ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION track_price_history();

-- Calculate royalties on sale
CREATE OR REPLACE FUNCTION calculate_royalties()
RETURNS TRIGGER AS $$
DECLARE
  v_venue_id UUID;
  v_royalty_percentage NUMERIC(5, 2);
  v_royalty_amount NUMERIC(10, 2);
BEGIN
  -- Only calculate for completed sales
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
      -- Get venue and royalty percentage
      SELECT v.id, COALESCE(v.resale_royalty_percentage, 2.5)
      INTO v_venue_id, v_royalty_percentage
      FROM public.tickets t
      JOIN public.events e ON t.event_id = e.id
      JOIN public.venues v ON e.venue_id = v.id
      WHERE t.id = NEW.ticket_id;

      -- Calculate royalty amount
      v_royalty_amount := ROUND(NEW.sale_price * (v_royalty_percentage / 100.0), 2);

      -- Create royalty record
      INSERT INTO public.royalties (
          marketplace_transaction_id, venue_id, recipient_id,
          royalty_percentage, sale_amount, royalty_amount
      )
      SELECT 
          NEW.id, v_venue_id, v.owner_id,
          v_royalty_percentage, NEW.sale_price, v_royalty_amount
      FROM public.venues v
      WHERE v.id = v_venue_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_royalties
  AFTER UPDATE ON public.marketplace_transactions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_royalties();

-- Auto-create escrow for marketplace transactions
CREATE OR REPLACE FUNCTION create_escrow_hold()
RETURNS TRIGGER AS $$
BEGIN
  -- Create escrow for new marketplace transactions
  INSERT INTO public.escrow (
      marketplace_transaction_id, buyer_id, seller_id,
      amount, currency, auto_release_at
  ) VALUES (
      NEW.id, NEW.buyer_id, NEW.seller_id,
      NEW.sale_price, NEW.currency,
      CURRENT_TIMESTAMP + INTERVAL '72 hours'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_escrow
  AFTER INSERT ON public.marketplace_transactions
  FOR EACH ROW
  EXECUTE FUNCTION create_escrow_hold();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Functions
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to check fraud rules
CREATE OR REPLACE FUNCTION check_fraud_rules(
  p_user_id UUID,
  p_listing_price NUMERIC,
  p_ticket_id UUID
) RETURNS TABLE (
  rule_violated BOOLEAN,
  rule_name VARCHAR,
  severity VARCHAR,
  action VARCHAR
) AS $$
DECLARE
  v_rule RECORD;
  v_user_age INTEGER;
  v_listings_last_hour INTEGER;
BEGIN
  -- Get user metrics
  SELECT EXTRACT(DAY FROM CURRENT_TIMESTAMP - created_at)
  INTO v_user_age
  FROM public.users WHERE id = p_user_id;

  SELECT COUNT(*)
  INTO v_listings_last_hour
  FROM public.listings
  WHERE seller_id = p_user_id
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour';

  -- Check each active rule
  FOR v_rule IN 
      SELECT * FROM public.fraud_prevention_rules
      WHERE is_active = TRUE
  LOOP
      -- Check velocity rules
      IF v_rule.rule_type = 'VELOCITY' AND 
         v_listings_last_hour > (v_rule.conditions->>'max_listings_per_hour')::INTEGER THEN
          RETURN QUERY SELECT TRUE, v_rule.rule_name, v_rule.severity, v_rule.action;
      END IF;

      -- Check user age rules
      IF v_rule.rule_type = 'USER_BEHAVIOR' AND
         v_user_age < (v_rule.conditions->>'min_user_age_days')::INTEGER THEN
          RETURN QUERY SELECT TRUE, v_rule.rule_name, v_rule.severity, v_rule.action;
      END IF;
  END LOOP;

  -- No rules violated
  IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function for dynamic pricing
CREATE OR REPLACE FUNCTION calculate_dynamic_price(
  p_ticket_id UUID,
  p_base_price NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_days_until_event INTEGER;
  v_demand_factor NUMERIC;
  v_similar_sales_avg NUMERIC;
  v_suggested_price NUMERIC;
BEGIN
  -- Calculate days until event
  SELECT EXTRACT(DAY FROM e.start_date - CURRENT_TIMESTAMP)
  INTO v_days_until_event
  FROM public.tickets t
  JOIN public.events e ON t.event_id = e.id
  WHERE t.id = p_ticket_id;

  -- Calculate demand factor based on recent sales
  SELECT AVG(sale_price / original_price)
  INTO v_demand_factor
  FROM public.marketplace_transactions mt
  JOIN public.tickets t ON mt.ticket_id = t.id
  WHERE t.event_id = (SELECT event_id FROM public.tickets WHERE id = p_ticket_id)
  AND mt.status = 'COMPLETED'
  AND mt.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days';

  -- Get average of similar recent sales
  SELECT AVG(sale_price)
  INTO v_similar_sales_avg
  FROM public.marketplace_transactions mt
  JOIN public.tickets t ON mt.ticket_id = t.id
  WHERE t.ticket_type_id = (SELECT ticket_type_id FROM public.tickets WHERE id = p_ticket_id)
  AND mt.status = 'COMPLETED'
  AND mt.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days';

  -- Calculate suggested price
  v_suggested_price := p_base_price;

  -- Adjust for time until event
  IF v_days_until_event <= 7 THEN
      v_suggested_price := v_suggested_price * 1.2;
  ELSIF v_days_until_event <= 30 THEN
      v_suggested_price := v_suggested_price * 1.1;
  END IF;

  -- Adjust for demand
  IF v_demand_factor IS NOT NULL THEN
      v_suggested_price := v_suggested_price * v_demand_factor;
  END IF;

  -- Consider recent sales
  IF v_similar_sales_avg IS NOT NULL THEN
      v_suggested_price := (v_suggested_price + v_similar_sales_avg) / 2;
  END IF;

  RETURN ROUND(v_suggested_price, 2);
END;
$$ LANGUAGE plpgsql;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row Level Security
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Enable RLS on all tables
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_resolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_prevention_rules ENABLE ROW LEVEL SECURITY;

-- Listings policies
CREATE POLICY listings_view_active ON public.listings
  FOR SELECT
  USING (status = 'ACTIVE' OR seller_id = auth.user_id());

CREATE POLICY listings_manage_own ON public.listings
  FOR ALL
  USING (seller_id = auth.user_id());

-- Offers policies
CREATE POLICY offers_view_involved ON public.offers
  FOR SELECT
  USING (
      buyer_id = auth.user_id() OR
      EXISTS (
          SELECT 1 FROM public.listings l
          WHERE l.id = offers.listing_id
          AND l.seller_id = auth.user_id()
      )
  );

CREATE POLICY offers_create ON public.offers
  FOR INSERT
  WITH CHECK (buyer_id = auth.user_id());

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grants
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


GRANT SELECT, INSERT, UPDATE ON public.listings TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.offers TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.marketplace_transactions TO tickettoken_app;
GRANT SELECT ON public.royalties TO tickettoken_app;
GRANT SELECT, UPDATE ON public.escrow TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.dispute_resolution TO tickettoken_app;
GRANT SELECT, INSERT ON public.price_history TO tickettoken_app;
GRANT SELECT ON public.market_analytics TO tickettoken_app;
GRANT SELECT ON public.fraud_prevention_rules TO tickettoken_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration Tracking
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


INSERT INTO public.schema_migrations (version, name)
VALUES (7, '007_create_marketplace_table.sql')
ON CONFLICT (version) DO NOTHING;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Validation Queries
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


DO $$
DECLARE
  table_count INTEGER;
  index_count INTEGER;
  trigger_count INTEGER;
BEGIN
  -- Count tables created
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('listings', 'offers', 'marketplace_transactions', 
                     'royalties', 'escrow', 'dispute_resolution',
                     'price_history', 'market_analytics', 'fraud_prevention_rules');

  -- Count indexes created
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
  AND tablename IN ('listings', 'offers', 'marketplace_transactions', 
                    'royalties', 'escrow', 'dispute_resolution',
                    'price_history', 'market_analytics');

  -- Count triggers
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  AND event_object_table IN ('listings', 'offers', 'marketplace_transactions',
                             'royalties', 'escrow', 'dispute_resolution', 
                             'fraud_prevention_rules');

  RAISE NOTICE 'Marketplace migration completed: % tables, % indexes, % triggers',
      table_count, index_count, trigger_count;
END $$;


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DOWN Migration (Commented Out)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/*

-- Drop RLS policies
DROP POLICY IF EXISTS listings_view_active ON public.listings;
DROP POLICY IF EXISTS listings_manage_own ON public.listings;
DROP POLICY IF EXISTS offers_view_involved ON public.offers;
DROP POLICY IF EXISTS offers_create ON public.offers;

-- Drop functions
DROP FUNCTION IF EXISTS calculate_dynamic_price(UUID, NUMERIC);
DROP FUNCTION IF EXISTS check_fraud_rules(UUID, NUMERIC, UUID);
DROP FUNCTION IF EXISTS create_escrow_hold();
DROP FUNCTION IF EXISTS calculate_royalties();
DROP FUNCTION IF EXISTS track_price_history();

-- Drop tables in correct order
DROP TABLE IF EXISTS public.fraud_prevention_rules CASCADE;
DROP TABLE IF EXISTS public.market_analytics CASCADE;
DROP TABLE IF EXISTS public.price_history CASCADE;
DROP TABLE IF EXISTS public.dispute_resolution CASCADE;
DROP TABLE IF EXISTS public.escrow CASCADE;
DROP TABLE IF EXISTS public.royalties CASCADE;
DROP TABLE IF EXISTS public.marketplace_transactions CASCADE;
DROP TABLE IF EXISTS public.offers CASCADE;
DROP TABLE IF EXISTS public.listings CASCADE;

-- Remove migration record
DELETE FROM public.schema_migrations WHERE version = 7;

*/
