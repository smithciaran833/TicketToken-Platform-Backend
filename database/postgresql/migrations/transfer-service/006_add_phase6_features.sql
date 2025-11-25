-- Migration: 006_add_phase6_features.sql
-- Description: Add tables for pricing, rules, batch transfers, and analytics
-- Phase 6: Enhanced Features & Business Logic

-- Transfer fees table
CREATE TABLE IF NOT EXISTS transfer_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES ticket_transfers(id) ON DELETE CASCADE,
    base_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    platform_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_fee DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    payment_method VARCHAR(50),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transfer rules table
CREATE TABLE IF NOT EXISTS transfer_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    ticket_type_id UUID,
    event_id UUID,
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_blocking BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User blacklist table
CREATE TABLE IF NOT EXISTS user_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    reason TEXT,
    is_active BOOLEAN DEFAULT true,
    blacklisted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blacklisted_by UUID,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Promotional codes table
CREATE TABLE IF NOT EXISTS promotional_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_percentage DECIMAL(5, 2),
    discount_flat DECIMAL(10, 2),
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batch transfers table
CREATE TABLE IF NOT EXISTS batch_transfers (
    id VARCHAR(100) PRIMARY KEY,
    user_id UUID NOT NULL,
    total_items INTEGER NOT NULL,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batch transfer items table
CREATE TABLE IF NOT EXISTS batch_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(100) NOT NULL REFERENCES batch_transfers(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL,
    transfer_id UUID REFERENCES ticket_transfers(id),
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_transfer_fees_transfer_id ON transfer_fees(transfer_id);
CREATE INDEX idx_transfer_fees_paid_at ON transfer_fees(paid_at) WHERE paid_at IS NOT NULL;

CREATE INDEX idx_transfer_rules_tenant ON transfer_rules(tenant_id);
CREATE INDEX idx_transfer_rules_type ON transfer_rules(rule_type);
CREATE INDEX idx_transfer_rules_active ON transfer_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_transfer_rules_priority ON transfer_rules(priority DESC);

CREATE INDEX idx_user_blacklist_user ON user_blacklist(user_id);
CREATE INDEX idx_user_blacklist_active ON user_blacklist(is_active) WHERE is_active = true;

CREATE INDEX idx_promo_codes_code ON promotional_codes(code);
CREATE INDEX idx_promo_codes_active ON promotional_codes(is_active) WHERE is_active = true;

CREATE INDEX idx_batch_transfers_user ON batch_transfers(user_id);
CREATE INDEX idx_batch_transfers_status ON batch_transfers(status);
CREATE INDEX idx_batch_transfers_created ON batch_transfers(created_at);

CREATE INDEX idx_batch_items_batch ON batch_transfer_items(batch_id);
CREATE INDEX idx_batch_items_transfer ON batch_transfer_items(transfer_id);

-- Add updated_at triggers
CREATE TRIGGER update_transfer_fees_updated_at
    BEFORE UPDATE ON transfer_fees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transfer_rules_updated_at
    BEFORE UPDATE ON transfer_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_blacklist_updated_at
    BEFORE UPDATE ON user_blacklist
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promotional_codes_updated_at
    BEFORE UPDATE ON promotional_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batch_transfers_updated_at
    BEFORE UPDATE ON batch_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE transfer_fees IS 'Stores transfer fee information and payments';
COMMENT ON TABLE transfer_rules IS 'Configurable rules for transfer validation';
COMMENT ON TABLE user_blacklist IS 'Users restricted from transfers';
COMMENT ON TABLE promotional_codes IS 'Discount codes for transfer fees';
COMMENT ON TABLE batch_transfers IS 'Bulk transfer operations';
COMMENT ON TABLE batch_transfer_items IS 'Individual items in batch transfers';

-- Create view for transfer fee summary
CREATE OR REPLACE VIEW transfer_fee_summary AS
SELECT
    DATE_TRUNC('day', paid_at) AS date,
    COUNT(*) AS total_transactions,
    SUM(total_fee) AS total_revenue,
    SUM(base_fee) AS total_base_fees,
    SUM(platform_fee) AS total_platform_fees,
    SUM(service_fee) AS total_service_fees,
    AVG(total_fee) AS avg_fee,
    currency
FROM transfer_fees
WHERE paid_at IS NOT NULL
GROUP BY date, currency
ORDER BY date DESC;

COMMENT ON VIEW transfer_fee_summary IS 'Daily summary of transfer fee revenue';

-- Create function to increment promo code usage
CREATE OR REPLACE FUNCTION increment_promo_usage(p_code VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE promotional_codes
    SET 
        current_uses = current_uses + 1,
        updated_at = NOW()
    WHERE code = p_code
      AND is_active = true
      AND (max_uses IS NULL OR current_uses < max_uses);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_promo_usage(VARCHAR) 
IS 'Increments usage count for a promotional code';
