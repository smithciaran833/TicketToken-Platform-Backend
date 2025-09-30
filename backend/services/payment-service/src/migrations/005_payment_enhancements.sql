-- Reconciliation reports table
CREATE TABLE IF NOT EXISTS reconciliation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    summary JSONB NOT NULL,
    discrepancies JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reconciliation_date ON reconciliation_reports(report_date);

-- Settlement batches for venue payouts
CREATE TABLE IF NOT EXISTS settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID,
    batch_number VARCHAR(50) UNIQUE,
    total_amount DECIMAL(10,2),
    payment_count INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    processed_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_settlement_venue ON settlement_batches(venue_id);
CREATE INDEX idx_settlement_status ON settlement_batches(status);

-- Payment retry tracking
CREATE TABLE IF NOT EXISTS payment_retries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID,
    attempt_number INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_retry_payment ON payment_retries(payment_id);

-- Fraud detection logs
CREATE TABLE IF NOT EXISTS fraud_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID,
    check_type VARCHAR(100),
    risk_score DECIMAL(5,2),
    decision VARCHAR(50),
    reasons JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fraud_payment ON fraud_checks(payment_id);
CREATE INDEX idx_fraud_decision ON fraud_checks(decision);
