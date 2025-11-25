-- Migration: 003_add_partnership_tables.sql
-- Description: Add partnership and commission tracking tables
-- Safe: Only creates new tables in partnerships schema

BEGIN;

-- Partnership agreements
CREATE TABLE partnerships.agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name VARCHAR(200) NOT NULL,
    partner_type VARCHAR(50) CHECK (partner_type IN ('technology', 'referral', 'integration', 'consultant', 'marketing', 'venue_partner')),
    commission_structure JSONB,
    commission_rate DECIMAL(5,4) DEFAULT 0,
    flat_fee DECIMAL(10,2) DEFAULT 0,
    contract_start_date DATE NOT NULL,
    contract_end_date DATE,
    auto_renew BOOLEAN DEFAULT true,
    renewal_notice_days INTEGER DEFAULT 30,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'expired')),
    terms_url VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agreements_partner_name ON partnerships.agreements(partner_name);
CREATE INDEX idx_agreements_status ON partnerships.agreements(status) WHERE status = 'active';
CREATE INDEX idx_agreements_dates ON partnerships.agreements(contract_start_date, contract_end_date);

-- Partnership commissions
CREATE TABLE partnerships.commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id UUID REFERENCES partnerships.agreements(id),
    transaction_id UUID REFERENCES payments.transactions(id),
    venue_id UUID REFERENCES venues.venues(id),
    event_id UUID REFERENCES events.events(id),
    commission_amount DECIMAL(10,2) NOT NULL,
    commission_rate DECIMAL(5,4),
    calculation_basis VARCHAR(50) CHECK (calculation_basis IN ('gross_revenue', 'net_revenue', 'ticket_count', 'flat_fee')),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'paid', 'cancelled')),
    payment_date DATE,
    invoice_number VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_commissions_agreement ON partnerships.commissions(agreement_id);
CREATE INDEX idx_commissions_status ON partnerships.commissions(payment_status) WHERE payment_status != 'paid';
CREATE INDEX idx_commissions_payment_date ON partnerships.commissions(payment_date);
CREATE INDEX idx_commissions_venue ON partnerships.commissions(venue_id);

-- Partnership performance metrics
CREATE TABLE partnerships.performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id UUID REFERENCES partnerships.agreements(id),
    metric_date DATE NOT NULL,
    revenue_generated DECIMAL(12,2) DEFAULT 0,
    tickets_sold INTEGER DEFAULT 0,
    events_count INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,4),
    avg_transaction_value DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_perf_metrics_agreement_date ON partnerships.performance_metrics(agreement_id, metric_date DESC);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA partnerships TO tickettoken;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA partnerships TO tickettoken;

-- Record migration
INSERT INTO core.schema_migrations (version, name, applied_at)
VALUES ('003', 'add_partnership_tables', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
