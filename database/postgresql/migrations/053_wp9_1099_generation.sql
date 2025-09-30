-- 1099 Generation and Tracking Tables
-- Handles 1099-DA (digital assets), 1099-K (payment cards), 1099-NEC (non-employee compensation)

-- Tax form recipients (venues and users)
CREATE TABLE IF NOT EXISTS tax_form_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL, -- 'venue', 'user', 'affiliate'
    entity_id UUID NOT NULL,
    
    -- Tax identification
    tax_id_type VARCHAR(10), -- 'ssn', 'ein'
    tax_id_encrypted BYTEA, -- Encrypted SSN/EIN
    tax_id_last4 VARCHAR(4), -- Last 4 for display
    
    -- Legal name
    legal_name VARCHAR(255) NOT NULL,
    doing_business_as VARCHAR(255),
    
    -- Address
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    country VARCHAR(2) DEFAULT 'US',
    
    -- Contact
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- Verification
    tin_verified BOOLEAN DEFAULT FALSE,
    tin_verification_date DATE,
    backup_withholding BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(entity_type, entity_id)
);

-- 1099 forms generated
CREATE TABLE IF NOT EXISTS tax_forms_1099 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_year INTEGER NOT NULL,
    form_type VARCHAR(20) NOT NULL, -- '1099-K', '1099-DA', '1099-NEC', '1099-MISC'
    recipient_id UUID NOT NULL REFERENCES tax_form_recipients(id),
    
    -- Payer info (your company)
    payer_name VARCHAR(255) NOT NULL DEFAULT 'TicketToken Inc.',
    payer_ein VARCHAR(20),
    payer_address VARCHAR(500),
    
    -- Form-specific amounts
    gross_amount DECIMAL(12,2) DEFAULT 0,
    card_payments DECIMAL(12,2) DEFAULT 0, -- For 1099-K
    third_party_network DECIMAL(12,2) DEFAULT 0, -- For 1099-K
    digital_asset_proceeds DECIMAL(12,2) DEFAULT 0, -- For 1099-DA
    federal_tax_withheld DECIMAL(12,2) DEFAULT 0,
    state_tax_withheld DECIMAL(12,2) DEFAULT 0,
    
    -- Transaction counts
    transaction_count INTEGER DEFAULT 0,
    month_counts JSONB, -- Monthly transaction counts
    
    -- Digital asset specific (1099-DA)
    asset_transactions JSONB, -- Array of NFT sale details
    
    -- Form status
    status VARCHAR(20) DEFAULT 'draft', -- draft, final, filed, corrected, void
    filed_with_irs BOOLEAN DEFAULT FALSE,
    irs_submission_id VARCHAR(100),
    filed_date DATE,
    
    -- Delivery
    sent_to_recipient BOOLEAN DEFAULT FALSE,
    delivery_method VARCHAR(20), -- email, mail, portal
    delivery_date DATE,
    delivery_confirmation VARCHAR(255),
    
    -- Corrections
    is_corrected BOOLEAN DEFAULT FALSE,
    original_form_id UUID,
    correction_reason TEXT,
    
    -- PDF storage
    pdf_url VARCHAR(500),
    pdf_generated_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tax_year, form_type, recipient_id)
);

-- Track individual transactions for 1099 reporting
CREATE TABLE IF NOT EXISTS reportable_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_year INTEGER NOT NULL,
    recipient_id UUID NOT NULL REFERENCES tax_form_recipients(id),
    
    -- Transaction details
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'nft_sale', 'venue_payout', 'refund'
    order_id UUID,
    payment_id UUID,
    
    -- Amounts
    gross_amount DECIMAL(12,2) NOT NULL,
    fees_deducted DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    
    -- NFT specific
    ticket_id UUID,
    original_purchase_price DECIMAL(12,2),
    sale_price DECIMAL(12,2),
    
    -- Categorization
    form_type VARCHAR(20), -- Which 1099 form this goes on
    reportable BOOLEAN DEFAULT TRUE,
    exclude_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_reportable_year_recipient (tax_year, recipient_id),
    INDEX idx_reportable_date (transaction_date)
);

-- IRS filing records
CREATE TABLE IF NOT EXISTS irs_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_year INTEGER NOT NULL,
    filing_type VARCHAR(20) NOT NULL, -- 'original', 'correction', 'test'
    
    -- Filing details
    submission_id VARCHAR(100),
    transmitter_control_code VARCHAR(20),
    unique_submission_id VARCHAR(100),
    
    -- Counts
    total_forms INTEGER,
    form_counts JSONB, -- Count by form type
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, submitted, accepted, rejected
    submitted_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    
    -- Response from IRS
    irs_response JSONB,
    errors JSONB,
    warnings JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_irs_filing_year (tax_year)
);

-- Create indexes
CREATE INDEX idx_tax_recipients_entity ON tax_form_recipients(entity_type, entity_id);
CREATE INDEX idx_tax_forms_year ON tax_forms_1099(tax_year);
CREATE INDEX idx_tax_forms_recipient ON tax_forms_1099(recipient_id);
CREATE INDEX idx_tax_forms_status ON tax_forms_1099(status);

-- Sample data for testing
INSERT INTO tax_form_recipients (
    entity_type, entity_id, legal_name, 
    address_line1, city, state, postal_code,
    email, tax_id_last4
) VALUES 
    ('venue', '11111111-1111-1111-1111-111111111111', 'Test Venue LLC',
     '123 Main St', 'Nashville', 'TN', '37201',
     'accounting@testvenue.com', '1234'),
    ('user', '00000000-0000-0000-0000-000000000001', 'John Doe',
     '456 Oak Ave', 'Austin', 'TX', '78701',
     'john@example.com', '5678')
ON CONFLICT DO NOTHING;
