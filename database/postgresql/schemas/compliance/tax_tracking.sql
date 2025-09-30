-- Customer tax tracking for NFT resales
CREATE TABLE IF NOT EXISTS customer_tax_records (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    year INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'nft_sale', 'nft_purchase'
    amount DECIMAL(10,2) NOT NULL,
    ticket_id VARCHAR(255),
    asset_type VARCHAR(50), -- 'ticket_nft'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_year ON customer_tax_records(customer_id, year);

-- Tax reporting requirements tracking
CREATE TABLE IF NOT EXISTS tax_reporting_requirements (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(255),
    venue_id VARCHAR(255),
    year INTEGER NOT NULL,
    form_type VARCHAR(20) NOT NULL, -- '1099-K', '1099-DA', '1099-MISC'
    threshold_met BOOLEAN DEFAULT FALSE,
    total_amount DECIMAL(10,2),
    form_sent BOOLEAN DEFAULT FALSE,
    sent_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_reporting UNIQUE (customer_id, venue_id, year, form_type)
);

-- Data retention policies
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id SERIAL PRIMARY KEY,
    data_type VARCHAR(100) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL,
    legal_basis TEXT,
    can_delete BOOLEAN DEFAULT FALSE,
    last_enforcement TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PCI compliance tracking
CREATE TABLE IF NOT EXISTS pci_access_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(100),
    reason TEXT,
    ip_address VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pci_user ON pci_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pci_timestamp ON pci_access_logs(timestamp);

-- State compliance rules
CREATE TABLE IF NOT EXISTS state_compliance_rules (
    id SERIAL PRIMARY KEY,
    state_code VARCHAR(2) NOT NULL UNIQUE,
    max_markup_percentage DECIMAL(5,2),
    requires_disclosure BOOLEAN DEFAULT FALSE,
    requires_license BOOLEAN DEFAULT FALSE,
    special_rules JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GDPR deletion requests
CREATE TABLE IF NOT EXISTS gdpr_deletion_requests (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed'
    deletion_report JSON
);
CREATE INDEX IF NOT EXISTS idx_gdpr_customer ON gdpr_deletion_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_status ON gdpr_deletion_requests(status);

-- Insert default retention policies
INSERT INTO data_retention_policies (data_type, retention_days, legal_basis, can_delete) VALUES
('tax_records', 2555, 'IRS 7-year requirement', FALSE),
('ofac_checks', 1825, 'FinCEN 5-year requirement', FALSE),
('audit_logs', 2555, 'SOC 2 Type II requirement', FALSE),
('customer_profiles', 90, 'GDPR - delete on request after 90 days inactive', TRUE),
('payment_records', 2555, 'PCI DSS and tax requirements', FALSE),
('venue_verifications', 2555, 'Business records requirement', FALSE)
ON CONFLICT (data_type) DO NOTHING;

-- Insert state compliance rules
INSERT INTO state_compliance_rules (state_code, max_markup_percentage, requires_disclosure, requires_license, special_rules) VALUES
('TN', 20.00, TRUE, FALSE, '{"rules": ["No sales within 200ft of venue", "Must display face value"]}'),
('TX', NULL, TRUE, TRUE, '{"rules": ["Must display original price", "License required for resale"]}'),
('NY', NULL, TRUE, TRUE, '{"rules": ["License required over $25k annual", "Must register with state"]}')
ON CONFLICT (state_code) DO NOTHING;
