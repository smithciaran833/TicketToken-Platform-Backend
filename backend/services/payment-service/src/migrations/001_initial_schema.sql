-- Payment Transactions Table
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL,
    user_id UUID NOT NULL,
    event_id UUID NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    platform_fee DECIMAL(10, 2) NOT NULL,
    venue_payout DECIMAL(10, 2) NOT NULL,
    gas_fee_paid DECIMAL(10, 4),
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    paypal_order_id VARCHAR(255),
    device_fingerprint VARCHAR(255),
    payment_method_fingerprint VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'))
);

-- Venue Balances Table
CREATE TABLE IF NOT EXISTS venue_balances (
    venue_id UUID PRIMARY KEY,
    available DECIMAL(12, 2) DEFAULT 0,
    pending DECIMAL(12, 2) DEFAULT 0,
    reserved DECIMAL(12, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    last_payout_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment Refunds Table
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES payment_transactions(id),
    amount DECIMAL(10, 2) NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    stripe_refund_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Escrow Transactions Table
CREATE TABLE IF NOT EXISTS payment_escrows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL,
    buyer_id UUID NOT NULL,
    seller_id UUID NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    seller_payout DECIMAL(10, 2) NOT NULL,
    venue_royalty DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2) NOT NULL,
    stripe_payment_intent_id VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    release_conditions JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_escrow_status CHECK (status IN ('created', 'funded', 'released', 'refunded', 'disputed'))
);

-- Group Payments Table
CREATE TABLE IF NOT EXISTS group_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL,
    event_id UUID NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    ticket_selections JSONB NOT NULL,
    status VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_group_status CHECK (status IN ('collecting', 'completed', 'partially_paid', 'expired', 'cancelled'))
);

-- Group Payment Members Table
CREATE TABLE IF NOT EXISTS group_payment_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_payment_id UUID NOT NULL REFERENCES group_payments(id),
    user_id UUID,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    amount_due DECIMAL(10, 2) NOT NULL,
    ticket_count INTEGER NOT NULL,
    paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP WITH TIME ZONE,
    payment_id VARCHAR(255),
    reminders_sent INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- NFT Mint Queue Table
CREATE TABLE IF NOT EXISTS nft_mint_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payment_transactions(id),
    ticket_ids UUID[] NOT NULL,
    venue_id UUID NOT NULL,
    event_id UUID NOT NULL,
    blockchain VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'queued',
    priority VARCHAR(20) DEFAULT 'standard',
    transaction_hash VARCHAR(255),
    gas_fee_paid DECIMAL(10, 6),
    mint_batch_id VARCHAR(255),
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tax Collections Table
CREATE TABLE IF NOT EXISTS tax_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES payment_transactions(id),
    state_tax DECIMAL(10, 2) NOT NULL,
    local_tax DECIMAL(10, 2) NOT NULL,
    special_tax DECIMAL(10, 2) DEFAULT 0,
    total_tax DECIMAL(10, 2) NOT NULL,
    jurisdiction VARCHAR(255),
    breakdown JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fraud Checks Table
CREATE TABLE IF NOT EXISTS fraud_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    device_fingerprint VARCHAR(255),
    ip_address INET,
    score DECIMAL(3, 2) NOT NULL,
    signals JSONB NOT NULL,
    decision VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_decision CHECK (decision IN ('approve', 'review', 'challenge', 'decline'))
);

-- Device Activity Table
CREATE TABLE IF NOT EXISTS device_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_fingerprint VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    activity_type VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bot Detections Table
CREATE TABLE IF NOT EXISTS bot_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    session_id VARCHAR(255),
    is_bot BOOLEAN NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL,
    indicators TEXT[],
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Waiting Room Activity Table
CREATE TABLE IF NOT EXISTS waiting_room_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Event Purchase Limits Table
CREATE TABLE IF NOT EXISTS event_purchase_limits (
    event_id UUID PRIMARY KEY,
    purchase_limit_per_user INTEGER DEFAULT 4,
    purchase_limit_per_payment_method INTEGER DEFAULT 4,
    purchase_limit_per_address INTEGER DEFAULT 8,
    max_tickets_per_order INTEGER DEFAULT 4,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Known Scalpers Table
CREATE TABLE IF NOT EXISTS known_scalpers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    device_fingerprint VARCHAR(255),
    reason TEXT,
    confidence_score DECIMAL(3, 2),
    added_by VARCHAR(255),
    active BOOLEAN DEFAULT TRUE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Royalty Distributions Table
CREATE TABLE IF NOT EXISTS royalty_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    recipient_type VARCHAR(50) NOT NULL,
    recipient_id UUID NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    percentage DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_recipient_type CHECK (recipient_type IN ('venue', 'artist', 'platform'))
);

-- Tax Forms 1099-DA Table
CREATE TABLE IF NOT EXISTS tax_forms_1099da (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tax_year INTEGER NOT NULL,
    form_data JSONB NOT NULL,
    total_proceeds DECIMAL(12, 2) NOT NULL,
    transaction_count INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'generated',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, tax_year)
);

-- Create indexes
CREATE INDEX idx_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_transactions_venue_id ON payment_transactions(venue_id);
CREATE INDEX idx_transactions_event_id ON payment_transactions(event_id);
CREATE INDEX idx_transactions_status ON payment_transactions(status);
CREATE INDEX idx_transactions_created_at ON payment_transactions(created_at);
CREATE INDEX idx_transactions_device_fingerprint ON payment_transactions(device_fingerprint);

CREATE INDEX idx_refunds_transaction_id ON payment_refunds(transaction_id);
CREATE INDEX idx_refunds_status ON payment_refunds(status);

CREATE INDEX idx_escrows_status ON payment_escrows(status);
CREATE INDEX idx_escrows_buyer_id ON payment_escrows(buyer_id);
CREATE INDEX idx_escrows_seller_id ON payment_escrows(seller_id);

CREATE INDEX idx_group_payments_organizer ON group_payments(organizer_id);
CREATE INDEX idx_group_payments_event ON group_payments(event_id);
CREATE INDEX idx_group_payments_status ON group_payments(status);

CREATE INDEX idx_nft_queue_status ON nft_mint_queue(status);
CREATE INDEX idx_nft_queue_payment ON nft_mint_queue(payment_id);

CREATE INDEX idx_fraud_checks_user ON fraud_checks(user_id);
CREATE INDEX idx_fraud_checks_device ON fraud_checks(device_fingerprint);
CREATE INDEX idx_fraud_checks_timestamp ON fraud_checks(timestamp);

CREATE INDEX idx_device_activity_fingerprint ON device_activity(device_fingerprint);
CREATE INDEX idx_device_activity_user ON device_activity(user_id);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update timestamp triggers
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_venue_balances_updated_at BEFORE UPDATE ON venue_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON payment_refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_escrows_updated_at BEFORE UPDATE ON payment_escrows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_payments_updated_at BEFORE UPDATE ON group_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_payment_members_updated_at BEFORE UPDATE ON group_payment_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nft_mint_queue_updated_at BEFORE UPDATE ON nft_mint_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_purchase_limits_updated_at BEFORE UPDATE ON event_purchase_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
