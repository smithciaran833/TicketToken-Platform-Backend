-- ISSUE #23 FIX: Create discount system with proper stacking controls
CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed', 'bogo', 'early_bird')),
  value DECIMAL(10, 2) NOT NULL,
  priority INTEGER DEFAULT 100, -- Lower number = higher priority
  stackable BOOLEAN DEFAULT false, -- Can this be combined with other discounts?
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  min_purchase_amount DECIMAL(10, 2),
  max_discount_amount DECIMAL(10, 2),
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  event_id UUID REFERENCES events(id),
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_discounts_code ON discounts(code) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_discounts_event ON discounts(event_id);
CREATE INDEX IF NOT EXISTS idx_discounts_validity ON discounts(valid_from, valid_until);

-- Track which discounts were used on orders
CREATE TABLE IF NOT EXISTS order_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  discount_id UUID NOT NULL REFERENCES discounts(id),
  amount_cents INTEGER NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_discounts_order ON order_discounts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_discount ON order_discounts(discount_id);

-- Add discount columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_codes TEXT[];
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_amount_cents INTEGER;
