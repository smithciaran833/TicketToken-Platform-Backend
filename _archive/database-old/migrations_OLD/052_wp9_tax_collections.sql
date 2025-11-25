-- WP-9: Tax Collections and Compliance Tables
-- This tracks all tax collected for reporting and remittance

CREATE TABLE IF NOT EXISTS tax_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    order_id UUID,
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
    remittance_period VARCHAR(20), -- '2025-Q1', '2025-01'
    remitted BOOLEAN DEFAULT FALSE,
    remitted_at TIMESTAMP,
    remittance_id UUID,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tax_collections_venue ON tax_collections(venue_id);
CREATE INDEX idx_tax_collections_period ON tax_collections(remittance_period);
CREATE INDEX idx_tax_collections_remitted ON tax_collections(remitted);

-- Tax remittances table for quarterly/monthly filings
CREATE TABLE IF NOT EXISTS tax_remittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL,
    state_code VARCHAR(2) NOT NULL,
    period VARCHAR(20) NOT NULL, -- '2025-Q1', '2025-01'
    
    -- Amounts
    gross_sales DECIMAL(12,2) NOT NULL,
    taxable_sales DECIMAL(12,2) NOT NULL,
    state_tax_collected DECIMAL(10,2) NOT NULL,
    local_tax_collected DECIMAL(10,2) NOT NULL,
    special_tax_collected DECIMAL(10,2) NOT NULL,
    total_tax_collected DECIMAL(10,2) NOT NULL,
    
    -- Filing info
    filing_status VARCHAR(20) DEFAULT 'pending', -- pending, filed, paid, late
    filing_date DATE,
    confirmation_number VARCHAR(100),
    
    -- Payment info
    payment_method VARCHAR(50),
    payment_date DATE,
    payment_confirmation VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(venue_id, state_code, period)
);

CREATE INDEX idx_tax_remittances_venue ON tax_remittances(venue_id);
CREATE INDEX idx_tax_remittances_period ON tax_remittances(period);
CREATE INDEX idx_tax_remittances_status ON tax_remittances(filing_status);
