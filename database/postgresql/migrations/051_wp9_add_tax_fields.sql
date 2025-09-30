-- Add tax fields to orders if they don't exist
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_fee DECIMAL(10,2) DEFAULT 0;

-- Create tax_collections table
CREATE TABLE IF NOT EXISTS tax_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID,
    transaction_id UUID,
    venue_id UUID NOT NULL,
    
    -- Tax amounts
    state_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    local_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    special_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- Jurisdiction info
    jurisdiction VARCHAR(255),
    state_code VARCHAR(2),
    county VARCHAR(100),
    city VARCHAR(100),
    
    -- Detailed breakdown
    breakdown JSONB,
    tax_rate DECIMAL(5,4),
    
    -- Remittance tracking
    remittance_period VARCHAR(20),
    remitted BOOLEAN DEFAULT FALSE,
    remitted_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tax_collections_venue ON tax_collections(venue_id);
CREATE INDEX IF NOT EXISTS idx_tax_collections_period ON tax_collections(remittance_period);
CREATE INDEX IF NOT EXISTS idx_tax_collections_state ON tax_collections(state_code);

-- Verify tables were created
\d tax_collections
