-- TicketToken Financial Transactions Schema
-- This table tracks all financial transactions including payments, refunds, payouts, and fees
-- Transaction Workflow: pending -> processing -> completed (or failed/cancelled)
-- Financial Compliance: Designed for accurate reporting, reconciliation, and audit trails
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS transactions CASCADE;

-- Create the transactions table
CREATE TABLE transactions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys to related entities
    user_id UUID,  -- User involved in transaction (nullable for system transactions)
    venue_id UUID,  -- Venue receiving funds or being charged
    event_id UUID,  -- Event this transaction relates to
    payment_method_id UUID,  -- Payment method used (if applicable)
    parent_transaction_id UUID,  -- For refunds/reversals, reference to original
    
    -- Transaction core information
    amount DECIMAL(12, 2) NOT NULL,  -- Transaction amount (positive for charges, negative for refunds)
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 currency code
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN (
        'payment',          -- Customer payment for tickets
        'refund',          -- Refund to customer
        'payout',          -- Payout to venue
        'fee',             -- Platform or processing fee
        'adjustment',      -- Manual adjustment
        'chargeback',      -- Card chargeback
        'dispute_reversal', -- Dispute resolved in our favor
        'transfer',        -- Transfer between accounts
        'withdrawal',      -- Crypto or bank withdrawal
        'deposit'          -- Funds deposit
    )),
    
    -- Transaction description and metadata
    description TEXT,  -- Human-readable description
    reference_number VARCHAR(100) UNIQUE,  -- Our unique reference number
    invoice_id UUID,  -- Link to invoice if applicable
    
    -- Payment processing information
    stripe_payment_intent_id VARCHAR(255),  -- Stripe PaymentIntent ID
    stripe_charge_id VARCHAR(255),  -- Stripe Charge ID
    stripe_transfer_id VARCHAR(255),  -- Stripe Transfer ID (for payouts)
    provider_transaction_id VARCHAR(255),  -- Generic provider transaction ID
    provider_name VARCHAR(50),  -- Payment provider used
    provider_fee DECIMAL(10, 2) DEFAULT 0,  -- Fee charged by payment provider
    provider_metadata JSONB DEFAULT '{}'::jsonb,  -- Provider-specific data
    
    -- Platform economics breakdown
    gross_amount DECIMAL(12, 2) NOT NULL,  -- Total amount before fees
    platform_fee DECIMAL(10, 2) DEFAULT 0,  -- Platform service fee
    venue_commission DECIMAL(10, 2) DEFAULT 0,  -- Venue's commission/share
    processing_fee DECIMAL(10, 2) DEFAULT 0,  -- Payment processing fee
    tax_amount DECIMAL(10, 2) DEFAULT 0,  -- Tax collected
    net_amount DECIMAL(12, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN transaction_type IN ('payment', 'deposit') THEN 
                gross_amount - platform_fee - processing_fee - tax_amount
            WHEN transaction_type IN ('refund', 'chargeback') THEN 
                -(ABS(gross_amount) + processing_fee)
            WHEN transaction_type = 'payout' THEN 
                gross_amount - processing_fee
            ELSE gross_amount
        END
    ) STORED,  -- Calculated net amount
    
    -- Fee calculation details
    fee_structure JSONB DEFAULT '{}'::jsonb,  -- Detailed fee breakdown
    /* Example fee_structure:
    {
        "platform_rate": 0.05,  -- 5% platform fee
        "platform_fixed": 0.30,  -- $0.30 fixed fee
        "stripe_rate": 0.029,    -- 2.9% Stripe fee
        "stripe_fixed": 0.30,    -- $0.30 Stripe fixed
        "fx_rate": 0.01         -- 1% foreign exchange fee
    }
    */
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Transaction created, not yet processed
        'processing',   -- Being processed by provider
        'completed',    -- Successfully completed
        'failed',       -- Transaction failed
        'cancelled',    -- Cancelled before processing
        'disputed',     -- Under dispute/chargeback
        'refunded',     -- Transaction was refunded
        'partially_refunded'  -- Partial refund issued
    )),
    status_reason TEXT,  -- Detailed reason for current status
    failure_code VARCHAR(50),  -- Provider-specific failure code
    failure_message TEXT,  -- Human-readable failure message
    
    -- Cryptocurrency integration
    is_crypto BOOLEAN DEFAULT FALSE,  -- Whether this is a crypto transaction
    crypto_amount DECIMAL(18, 8),  -- Amount in cryptocurrency
    crypto_currency VARCHAR(10),  -- Crypto symbol (BTC, ETH, SOL, USDC, etc.)
    crypto_wallet_address VARCHAR(255),  -- Wallet address involved
    blockchain_network VARCHAR(50),  -- Network used (ethereum, solana, polygon, etc.)
    exchange_rate DECIMAL(18, 8),  -- Exchange rate at time of transaction
    wallet_transaction_hash VARCHAR(255),  -- Blockchain transaction hash
    block_number BIGINT,  -- Block number on blockchain
    gas_fee DECIMAL(18, 8),  -- Gas/network fee in crypto
    
    -- Risk management and fraud prevention
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),  -- 0-100 risk score
    risk_factors JSONB DEFAULT '[]'::jsonb,  -- Array of risk factors
    fraud_check_result VARCHAR(20) CHECK (fraud_check_result IN (
        'pass', 'fail', 'review', 'not_checked'
    )),
    fraud_check_details JSONB,  -- Detailed fraud check results
    manual_review_required BOOLEAN DEFAULT FALSE,  -- Flagged for manual review
    reviewed_by UUID,  -- User who performed manual review
    reviewed_at TIMESTAMP WITH TIME ZONE,  -- When manual review completed
    
    -- 3D Secure and authentication
    authentication_required BOOLEAN DEFAULT FALSE,  -- Whether 3DS was required
    authentication_status VARCHAR(50),  -- 3DS status
    authentication_data JSONB,  -- 3DS response data
    
    -- Reconciliation and accounting
    reconciled BOOLEAN DEFAULT FALSE,  -- Whether reconciled in accounting
    reconciliation_date DATE,  -- Date of reconciliation
    reconciliation_batch_id UUID,  -- Batch reconciliation reference
    accounting_period VARCHAR(7),  -- YYYY-MM format
    ledger_entries JSONB DEFAULT '[]'::jsonb,  -- Accounting ledger entries
    
    -- Payout information (for venue payouts)
    payout_batch_id UUID,  -- Batch payout reference
    payout_method VARCHAR(50),  -- Method of payout (bank, stripe, crypto)
    bank_account_last_four VARCHAR(4),  -- Last 4 of bank account
    expected_arrival_date DATE,  -- Expected funds arrival
    
    -- Refund tracking
    refund_amount DECIMAL(10, 2) DEFAULT 0,  -- Total amount refunded
    refund_count INTEGER DEFAULT 0,  -- Number of refunds issued
    is_fully_refunded BOOLEAN DEFAULT FALSE,  -- Whether fully refunded
    refund_policy_version VARCHAR(20),  -- Refund policy applied
    
    -- Dispute/chargeback tracking
    dispute_id VARCHAR(255),  -- Provider dispute ID
    dispute_status VARCHAR(50),  -- Current dispute status
    dispute_reason VARCHAR(100),  -- Reason for dispute
    dispute_evidence_due_date DATE,  -- Deadline for evidence submission
    dispute_amount DECIMAL(10, 2),  -- Amount in dispute
    dispute_outcome VARCHAR(50),  -- Final outcome
    
    -- Metadata and references
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional transaction data
    external_references JSONB DEFAULT '[]'::jsonb,  -- External system references
    ip_address INET,  -- IP address of transaction origin
    user_agent TEXT,  -- Browser/app user agent
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_started_at TIMESTAMP WITH TIME ZONE,  -- When processing began
    completed_at TIMESTAMP WITH TIME ZONE,  -- When successfully completed
    failed_at TIMESTAMP WITH TIME ZONE,  -- When failed
    cancelled_at TIMESTAMP WITH TIME ZONE,  -- When cancelled
    
    -- Foreign key constraints
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT,
    CONSTRAINT fk_parent_transaction FOREIGN KEY (parent_transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Business rule constraints
    CONSTRAINT chk_amount_sign CHECK (
        (transaction_type IN ('payment', 'deposit', 'payout') AND amount > 0) OR
        (transaction_type IN ('refund', 'chargeback') AND amount < 0) OR
        (transaction_type IN ('fee', 'adjustment', 'transfer', 'withdrawal'))
    ),
    
    -- Ensure refund references parent transaction
    CONSTRAINT chk_refund_parent CHECK (
        (transaction_type != 'refund') OR 
        (transaction_type = 'refund' AND parent_transaction_id IS NOT NULL)
    ),
    
    -- Ensure crypto fields are set together
    CONSTRAINT chk_crypto_fields CHECK (
        (is_crypto = FALSE) OR 
        (is_crypto = TRUE AND crypto_amount IS NOT NULL AND crypto_currency IS NOT NULL AND exchange_rate IS NOT NULL)
    ),
    
    -- Ensure failed transactions have failure info
    CONSTRAINT chk_failure_info CHECK (
        (status != 'failed') OR 
        (status = 'failed' AND (failure_code IS NOT NULL OR failure_message IS NOT NULL))
    ),
    
    -- Validate fee amounts
    CONSTRAINT chk_fees_positive CHECK (
        platform_fee >= 0 AND processing_fee >= 0 AND provider_fee >= 0 AND tax_amount >= 0
    ),
    
    -- Ensure review data consistency
    CONSTRAINT chk_review_data CHECK (
        (manual_review_required = FALSE) OR 
        (manual_review_required = TRUE AND ((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)))
    )
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_venue_id ON transactions(venue_id);
CREATE INDEX idx_transactions_event_id ON transactions(event_id);
CREATE INDEX idx_transactions_payment_method ON transactions(payment_method_id);

-- Reference and provider indexes
CREATE UNIQUE INDEX idx_transactions_reference ON transactions(reference_number);
CREATE INDEX idx_transactions_stripe_pi ON transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_transactions_stripe_charge ON transactions(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX idx_transactions_provider_tx ON transactions(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

-- Status and type indexes
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_type_status ON transactions(transaction_type, status);

-- Financial reporting indexes
CREATE INDEX idx_transactions_created_date ON transactions(DATE(created_at), status);
CREATE INDEX idx_transactions_completed_date ON transactions(DATE(completed_at)) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_transactions_accounting_period ON transactions(accounting_period, status) WHERE accounting_period IS NOT NULL;

-- Venue financial indexes
CREATE INDEX idx_transactions_venue_completed ON transactions(venue_id, completed_at) WHERE status = 'completed';
CREATE INDEX idx_transactions_venue_payouts ON transactions(venue_id, transaction_type, completed_at) WHERE transaction_type = 'payout';

-- Reconciliation indexes
CREATE INDEX idx_transactions_unreconciled ON transactions(created_at) WHERE reconciled = FALSE AND status = 'completed';
CREATE INDEX idx_transactions_reconciliation_batch ON transactions(reconciliation_batch_id) WHERE reconciliation_batch_id IS NOT NULL;

-- Risk and fraud indexes
CREATE INDEX idx_transactions_high_risk ON transactions(risk_score, created_at) WHERE risk_score > 70;
CREATE INDEX idx_transactions_manual_review ON transactions(manual_review_required, created_at) WHERE manual_review_required = TRUE;
CREATE INDEX idx_transactions_fraud_failed ON transactions(fraud_check_result, created_at) WHERE fraud_check_result = 'fail';

-- Dispute tracking
CREATE INDEX idx_transactions_disputes ON transactions(dispute_status, dispute_evidence_due_date) WHERE dispute_id IS NOT NULL;

-- Crypto transaction indexes
CREATE INDEX idx_transactions_crypto ON transactions(crypto_currency, created_at) WHERE is_crypto = TRUE;
CREATE INDEX idx_transactions_wallet_hash ON transactions(wallet_transaction_hash) WHERE wallet_transaction_hash IS NOT NULL;

-- Refund tracking
CREATE INDEX idx_transactions_refunds ON transactions(parent_transaction_id, transaction_type) WHERE transaction_type = 'refund';
CREATE INDEX idx_transactions_refundable ON transactions(refund_amount, amount) WHERE transaction_type = 'payment' AND status = 'completed';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_transactions_updated_at();

-- Create function to generate reference numbers
CREATE OR REPLACE FUNCTION generate_transaction_reference()
RETURNS TRIGGER AS $$
DECLARE
    prefix VARCHAR(3);
    date_part VARCHAR(6);
    random_part VARCHAR(6);
BEGIN
    -- Generate prefix based on transaction type
    CASE NEW.transaction_type
        WHEN 'payment' THEN prefix := 'PAY';
        WHEN 'refund' THEN prefix := 'REF';
        WHEN 'payout' THEN prefix := 'OUT';
        WHEN 'fee' THEN prefix := 'FEE';
        ELSE prefix := 'TXN';
    END CASE;
    
    -- Generate date part (YYMMDD)
    date_part := TO_CHAR(CURRENT_DATE, 'YYMMDD');
    
    -- Generate random part
    random_part := UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));
    
    -- Combine parts
    NEW.reference_number := prefix || '-' || date_part || '-' || random_part;
    
    -- Set accounting period
    NEW.accounting_period := TO_CHAR(NEW.created_at, 'YYYY-MM');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_transaction_reference_before_insert
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION generate_transaction_reference();

-- Create function to update transaction status timestamps
CREATE OR REPLACE FUNCTION update_transaction_status_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Set appropriate timestamp based on status change
    IF NEW.status != OLD.status THEN
        CASE NEW.status
            WHEN 'processing' THEN
                NEW.processing_started_at = CURRENT_TIMESTAMP;
            WHEN 'completed' THEN
                NEW.completed_at = CURRENT_TIMESTAMP;
            WHEN 'failed' THEN
                NEW.failed_at = CURRENT_TIMESTAMP;
            WHEN 'cancelled' THEN
                NEW.cancelled_at = CURRENT_TIMESTAMP;
        END CASE;
    END IF;
    
    -- Update refund tracking for refund transactions
    IF NEW.transaction_type = 'refund' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE transactions 
        SET refund_amount = refund_amount + ABS(NEW.amount),
            refund_count = refund_count + 1,
            is_fully_refunded = (refund_amount + ABS(NEW.amount) >= amount)
        WHERE id = NEW.parent_transaction_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transaction_status_timestamps_trigger
    BEFORE UPDATE OF status ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_transaction_status_timestamps();

-- Add table comments
COMMENT ON TABLE transactions IS 'Central financial transactions table tracking all money movements including payments, refunds, payouts, and fees. Designed for financial compliance, accurate reporting, and complete audit trails.';

-- Add column comments (selected key columns)
COMMENT ON COLUMN transactions.id IS 'Unique transaction identifier (UUID)';
COMMENT ON COLUMN transactions.amount IS 'Transaction amount (positive for charges, negative for refunds)';
COMMENT ON COLUMN transactions.transaction_type IS 'Type of financial transaction';
COMMENT ON COLUMN transactions.gross_amount IS 'Total amount before any fees';
COMMENT ON COLUMN transactions.net_amount IS 'Calculated amount after all fees (generated column)';
COMMENT ON COLUMN transactions.status IS 'Current transaction status in processing workflow';
COMMENT ON COLUMN transactions.risk_score IS 'Risk assessment score 0-100';
COMMENT ON COLUMN transactions.reconciled IS 'Whether transaction has been reconciled in accounting';
COMMENT ON COLUMN transactions.crypto_amount IS 'Amount in cryptocurrency (8 decimal precision)';
COMMENT ON COLUMN transactions.wallet_transaction_hash IS 'Blockchain transaction hash for verification';
COMMENT ON COLUMN transactions.reference_number IS 'Unique human-readable reference (auto-generated)';

-- Sample data for testing (commented out)
/*
-- Customer payment for tickets
INSERT INTO transactions (
    user_id, venue_id, event_id, payment_method_id,
    amount, gross_amount, transaction_type,
    platform_fee, processing_fee, venue_commission,
    stripe_payment_intent_id, description
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    100.00,
    100.00,
    'payment',
    5.00,    -- 5% platform fee
    3.20,    -- Stripe fee (2.9% + $0.30)
    10.00,   -- Venue gets $10
    'pi_1234567890',
    'Ticket purchase for Summer Festival 2025'
);

-- Venue payout
INSERT INTO transactions (
    venue_id, amount, gross_amount, transaction_type,
    processing_fee, stripe_transfer_id,
    description, payout_method
) VALUES (
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    1000.00,
    1000.00,
    'payout',
    0.25,  -- ACH fee
    'tr_1234567890',
    'Weekly venue payout',
    'bank'
);
*/

-- Financial Compliance Notes:
-- 1. All amounts stored with 2 decimal precision for accurate financial calculations
-- 2. Complete audit trail with timestamps for every status change
-- 3. Reference numbers for easy reconciliation with external systems
-- 4. Support for multiple currencies and crypto transactions
-- 5. Comprehensive fee tracking for accurate revenue reporting
-- 6. Risk management and fraud prevention built-in

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_created ON transactions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- 7. Designed for SOC 2 and financial compliance requirements
