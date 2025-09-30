-- TicketToken Venue Settlements Schema
-- This table manages venue payouts and settlement calculations
-- Settlement Workflow: calculated -> pending -> processing -> completed
-- Calculation Logic: Gross Sales - Platform Fees - Processing Fees - Refunds - Chargebacks = Net Payout
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS settlements CASCADE;

-- Create the settlements table
CREATE TABLE settlements (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    venue_id UUID NOT NULL,  -- Venue receiving the settlement
    payout_account_id UUID,  -- Specific payout account for the venue
    
    -- Settlement period information
    period_start_date DATE NOT NULL,  -- Start of settlement period (inclusive)
    period_end_date DATE NOT NULL,  -- End of settlement period (inclusive)
    settlement_type VARCHAR(20) NOT NULL CHECK (settlement_type IN (
        'daily',      -- Daily settlements
        'weekly',     -- Weekly settlements (Mon-Sun)
        'monthly',    -- Monthly settlements
        'custom',     -- Custom period
        'on_demand'   -- Manual/on-demand settlement
    )),
    settlement_number VARCHAR(50) UNIQUE,  -- Unique settlement reference number
    
    -- Financial summary (all amounts in settlement currency)
    gross_sales DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Total ticket sales
    platform_fees DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Platform commission
    processing_fees DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Payment processing fees
    refunds DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Total refunds issued
    chargebacks DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Chargebacks and disputes
    adjustments DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Manual adjustments (+/-)
    reserves_held DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Amount held in reserve
    previous_reserves_released DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Released from previous periods
    net_payout DECIMAL(12, 2) GENERATED ALWAYS AS (
        gross_sales - platform_fees - processing_fees - refunds - chargebacks + adjustments - reserves_held + previous_reserves_released
    ) STORED,  -- Calculated net payout amount
    
    -- Transaction counts for the period
    total_transactions INTEGER NOT NULL DEFAULT 0,  -- All transactions
    successful_transactions INTEGER NOT NULL DEFAULT 0,  -- Completed payments
    refunded_transactions INTEGER NOT NULL DEFAULT 0,  -- Refunded transactions
    disputed_transactions INTEGER NOT NULL DEFAULT 0,  -- Disputed/chargebacked
    
    -- Event breakdown
    events_included INTEGER NOT NULL DEFAULT 0,  -- Number of events in settlement
    event_details JSONB DEFAULT '[]'::jsonb,  -- Array of event summaries
    /* Example event_details:
    [
        {
            "event_id": "uuid",
            "event_name": "Summer Festival",
            "gross_sales": 10000.00,
            "transaction_count": 100,
            "refund_count": 2
        }
    ]
    */
    
    -- Payout information
    payout_amount DECIMAL(12, 2) NOT NULL,  -- Actual amount to be paid out
    payout_currency VARCHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 currency code
    exchange_rate DECIMAL(10, 6) DEFAULT 1.000000,  -- Exchange rate if converted
    payout_method VARCHAR(50) NOT NULL CHECK (payout_method IN (
        'ach',           -- ACH bank transfer
        'wire',          -- Wire transfer
        'stripe',        -- Stripe Connect transfer
        'paypal',        -- PayPal payout
        'crypto',        -- Cryptocurrency
        'check',         -- Physical check
        'credit',        -- Platform credit
        'manual'         -- Manual/other method
    )),
    
    -- Stripe integration
    stripe_transfer_id VARCHAR(255),  -- Stripe Transfer ID
    stripe_payout_id VARCHAR(255),  -- Stripe Payout ID
    stripe_balance_transaction_id VARCHAR(255),  -- Balance transaction reference
    
    -- Banking information (for ACH/Wire)
    bank_account_last_four VARCHAR(4),  -- Last 4 of bank account
    routing_number_last_four VARCHAR(4),  -- Last 4 of routing number
    bank_name VARCHAR(100),  -- Bank name
    account_holder_name VARCHAR(255),  -- Account holder name
    ach_trace_number VARCHAR(50),  -- ACH trace number
    wire_reference_number VARCHAR(50),  -- Wire reference number
    
    -- Cryptocurrency payout details
    crypto_wallet_address VARCHAR(255),  -- Destination wallet
    crypto_currency VARCHAR(10),  -- Crypto currency (BTC, ETH, USDC, etc.)
    crypto_amount DECIMAL(18, 8),  -- Amount in crypto
    crypto_transaction_hash VARCHAR(255),  -- Blockchain transaction hash
    crypto_network VARCHAR(50),  -- Blockchain network used
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'calculated' CHECK (status IN (
        'draft',        -- Draft calculation, not finalized
        'calculated',   -- Calculation complete, awaiting approval
        'approved',     -- Approved for payout
        'pending',      -- Payout initiated, awaiting processing
        'processing',   -- Being processed by payment provider
        'completed',    -- Successfully paid out
        'failed',       -- Payout failed
        'cancelled',    -- Settlement cancelled
        'disputed',     -- Under dispute by venue
        'on_hold'       -- Temporarily on hold
    )),
    status_reason TEXT,  -- Detailed reason for current status
    failure_code VARCHAR(50),  -- Error code if failed
    failure_message TEXT,  -- Error message if failed
    
    -- Hold and reserve management
    is_on_hold BOOLEAN DEFAULT FALSE,  -- Whether settlement is on hold
    hold_reason TEXT,  -- Reason for hold
    hold_until_date DATE,  -- Hold expiration date
    reserve_percentage DECIMAL(5, 2) DEFAULT 0,  -- Percentage held in reserve
    reserve_release_date DATE,  -- When reserves will be released
    
    -- Approval workflow
    auto_approved BOOLEAN DEFAULT FALSE,  -- Whether auto-approved by rules
    approved_by UUID,  -- User who approved the settlement
    approval_notes TEXT,  -- Notes from approver
    requires_manual_review BOOLEAN DEFAULT FALSE,  -- Flagged for review
    review_reasons JSONB DEFAULT '[]'::jsonb,  -- Array of review reasons
    
    -- Reconciliation tracking
    reconciled BOOLEAN DEFAULT FALSE,  -- Whether reconciled with bank
    reconciliation_date DATE,  -- Date of reconciliation
    reconciliation_notes TEXT,  -- Notes from reconciliation
    discrepancy_amount DECIMAL(12, 2) DEFAULT 0,  -- Any discrepancy found
    discrepancy_reason TEXT,  -- Explanation of discrepancy
    
    -- Fee breakdown details
    fee_breakdown JSONB DEFAULT '{}'::jsonb,  -- Detailed fee calculations
    /* Example fee_breakdown:
    {
        "platform_rate": 0.05,
        "platform_fixed": 0,
        "average_processing_rate": 0.029,
        "total_processing_fixed": 30.00,
        "special_event_fees": 0,
        "promotional_discount": -50.00
    }
    */
    
    -- Supporting documentation
    invoice_number VARCHAR(100),  -- Associated invoice number
    invoice_url VARCHAR(500),  -- Link to invoice document
    statement_url VARCHAR(500),  -- Link to settlement statement
    supporting_documents JSONB DEFAULT '[]'::jsonb,  -- Array of document links
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional settlement data
    notes TEXT,  -- Internal notes
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    calculated_at TIMESTAMP WITH TIME ZONE,  -- When calculation was completed
    approved_at TIMESTAMP WITH TIME ZONE,  -- When approved for payout
    initiated_at TIMESTAMP WITH TIME ZONE,  -- When payout was initiated
    processing_started_at TIMESTAMP WITH TIME ZONE,  -- When processing began
    completed_at TIMESTAMP WITH TIME ZONE,  -- When payout completed
    failed_at TIMESTAMP WITH TIME ZONE,  -- When payout failed
    cancelled_at TIMESTAMP WITH TIME ZONE,  -- When cancelled
    
    -- Foreign key constraints
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payout_account FOREIGN KEY (payout_account_id) REFERENCES payout_accounts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Business rule constraints
    CONSTRAINT chk_period_validity CHECK (period_end_date >= period_start_date),
    CONSTRAINT chk_positive_amounts CHECK (
        gross_sales >= 0 AND 
        platform_fees >= 0 AND 
        processing_fees >= 0 AND 
        refunds >= 0 AND 
        chargebacks >= 0 AND
        reserves_held >= 0 AND
        previous_reserves_released >= 0
    ),
    CONSTRAINT chk_payout_amount CHECK (payout_amount >= 0),
    CONSTRAINT chk_transaction_counts CHECK (
        total_transactions >= 0 AND
        successful_transactions >= 0 AND
        refunded_transactions >= 0 AND
        disputed_transactions >= 0 AND
        successful_transactions <= total_transactions
    ),
    CONSTRAINT chk_reserve_percentage CHECK (reserve_percentage >= 0 AND reserve_percentage <= 100),
    CONSTRAINT chk_status_timestamps CHECK (
        (status != 'calculated' OR calculated_at IS NOT NULL) AND
        (status != 'completed' OR completed_at IS NOT NULL) AND
        (status != 'failed' OR failed_at IS NOT NULL)
    ),
    CONSTRAINT chk_crypto_fields CHECK (
        (payout_method != 'crypto') OR 
        (crypto_wallet_address IS NOT NULL AND crypto_currency IS NOT NULL AND crypto_amount IS NOT NULL)
    ),
    CONSTRAINT chk_failure_info CHECK (
        (status != 'failed') OR 
        (failure_code IS NOT NULL OR failure_message IS NOT NULL)
    ),
    -- Prevent duplicate settlements for the same period
    CONSTRAINT unique_venue_period UNIQUE (venue_id, period_start_date, period_end_date, status) 
        WHERE status NOT IN ('cancelled', 'failed')
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE INDEX idx_settlements_venue_id ON settlements(venue_id);
CREATE INDEX idx_settlements_payout_account ON settlements(payout_account_id);
CREATE UNIQUE INDEX idx_settlements_number ON settlements(settlement_number);

-- Period and type indexes
CREATE INDEX idx_settlements_period ON settlements(period_start_date, period_end_date);
CREATE INDEX idx_settlements_type ON settlements(settlement_type);
CREATE INDEX idx_settlements_venue_period ON settlements(venue_id, period_start_date DESC);

-- Status tracking indexes
CREATE INDEX idx_settlements_status ON settlements(status);
CREATE INDEX idx_settlements_pending ON settlements(status, created_at) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_settlements_completed ON settlements(venue_id, completed_at DESC) WHERE status = 'completed';

-- Financial reporting indexes
CREATE INDEX idx_settlements_payout_date ON settlements(completed_at, venue_id) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_settlements_amount ON settlements(payout_amount) WHERE status = 'completed';
CREATE INDEX idx_settlements_period_type ON settlements(settlement_type, period_start_date DESC);

-- Review and hold indexes
CREATE INDEX idx_settlements_review ON settlements(requires_manual_review, created_at) 
    WHERE requires_manual_review = TRUE;
CREATE INDEX idx_settlements_on_hold ON settlements(is_on_hold, hold_until_date) 
    WHERE is_on_hold = TRUE;

-- Reconciliation indexes
CREATE INDEX idx_settlements_unreconciled ON settlements(completed_at) 
    WHERE reconciled = FALSE AND status = 'completed';
CREATE INDEX idx_settlements_discrepancies ON settlements(discrepancy_amount) 
    WHERE discrepancy_amount != 0;

-- Payment method indexes
CREATE INDEX idx_settlements_stripe ON settlements(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;
CREATE INDEX idx_settlements_crypto ON settlements(crypto_transaction_hash) WHERE crypto_transaction_hash IS NOT NULL;

-- Reserve tracking
CREATE INDEX idx_settlements_reserves ON settlements(venue_id, reserve_release_date) 
    WHERE reserves_held > 0;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_settlements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_settlements_updated_at 
    BEFORE UPDATE ON settlements 
    FOR EACH ROW 
    EXECUTE FUNCTION update_settlements_updated_at();

-- Create function to generate settlement numbers
CREATE OR REPLACE FUNCTION generate_settlement_number()
RETURNS TRIGGER AS $$
DECLARE
    venue_code VARCHAR(6);
    period_code VARCHAR(8);
    sequence_num INTEGER;
BEGIN
    -- Get venue code (first 6 chars of venue_id)
    venue_code := UPPER(SUBSTR(NEW.venue_id::TEXT, 1, 6));
    
    -- Generate period code based on settlement type
    CASE NEW.settlement_type
        WHEN 'daily' THEN 
            period_code := TO_CHAR(NEW.period_start_date, 'YYYYMMDD');
        WHEN 'weekly' THEN 
            period_code := 'W' || TO_CHAR(NEW.period_start_date, 'YYYYWW');
        WHEN 'monthly' THEN 
            period_code := 'M' || TO_CHAR(NEW.period_start_date, 'YYYYMM');
        ELSE 
            period_code := 'C' || TO_CHAR(NEW.period_start_date, 'YYMMDD');
    END CASE;
    
    -- Get sequence number for this venue and period
    SELECT COUNT(*) + 1 INTO sequence_num
    FROM settlements
    WHERE venue_id = NEW.venue_id
    AND period_start_date = NEW.period_start_date;
    
    -- Generate settlement number
    NEW.settlement_number := 'SET-' || venue_code || '-' || period_code || '-' || LPAD(sequence_num::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_settlement_number_before_insert
    BEFORE INSERT ON settlements
    FOR EACH ROW
    EXECUTE FUNCTION generate_settlement_number();

-- Create function to update settlement status timestamps
CREATE OR REPLACE FUNCTION update_settlement_status_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Set appropriate timestamp based on status change
    IF NEW.status != OLD.status THEN
        CASE NEW.status
            WHEN 'calculated' THEN
                NEW.calculated_at = CURRENT_TIMESTAMP;
            WHEN 'approved' THEN
                NEW.approved_at = CURRENT_TIMESTAMP;
            WHEN 'pending', 'processing' THEN
                IF NEW.initiated_at IS NULL THEN
                    NEW.initiated_at = CURRENT_TIMESTAMP;
                END IF;
                IF NEW.status = 'processing' THEN
                    NEW.processing_started_at = CURRENT_TIMESTAMP;
                END IF;
            WHEN 'completed' THEN
                NEW.completed_at = CURRENT_TIMESTAMP;
            WHEN 'failed' THEN
                NEW.failed_at = CURRENT_TIMESTAMP;
            WHEN 'cancelled' THEN
                NEW.cancelled_at = CURRENT_TIMESTAMP;
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_settlement_status_timestamps_trigger
    BEFORE UPDATE OF status ON settlements
    FOR EACH ROW
    EXECUTE FUNCTION update_settlement_status_timestamps();

-- Create view for pending payouts
CREATE OR REPLACE VIEW pending_payouts AS
SELECT 
    s.id,
    s.venue_id,
    v.name as venue_name,
    s.settlement_number,
    s.period_start_date,
    s.period_end_date,
    s.settlement_type,
    s.payout_amount,
    s.payout_currency,
    s.payout_method,
    s.status,
    s.is_on_hold,
    s.hold_reason,
    s.created_at,
    s.calculated_at
FROM settlements s
JOIN venues v ON s.venue_id = v.id
WHERE s.status IN ('calculated', 'approved', 'pending', 'processing')
    AND s.is_on_hold = FALSE
ORDER BY s.created_at;

-- Add table comments
COMMENT ON TABLE settlements IS 'Manages venue payouts and settlement calculations. Tracks complete financial breakdown for each settlement period with support for multiple payout methods and comprehensive reconciliation.';

-- Add column comments (selected key columns)
COMMENT ON COLUMN settlements.id IS 'Unique settlement identifier (UUID)';
COMMENT ON COLUMN settlements.venue_id IS 'Foreign key to venues table - venue receiving payout';
COMMENT ON COLUMN settlements.period_start_date IS 'Start date of settlement period (inclusive)';
COMMENT ON COLUMN settlements.period_end_date IS 'End date of settlement period (inclusive)';
COMMENT ON COLUMN settlements.settlement_type IS 'Frequency of settlements (daily, weekly, monthly, custom)';
COMMENT ON COLUMN settlements.gross_sales IS 'Total ticket sales for the period';
COMMENT ON COLUMN settlements.platform_fees IS 'Platform commission on sales';
COMMENT ON COLUMN settlements.processing_fees IS 'Payment processing fees charged';
COMMENT ON COLUMN settlements.net_payout IS 'Calculated payout amount (auto-generated)';
COMMENT ON COLUMN settlements.payout_amount IS 'Actual amount to be paid (may differ from net due to minimums, etc.)';
COMMENT ON COLUMN settlements.status IS 'Current status in payout workflow';
COMMENT ON COLUMN settlements.reserves_held IS 'Amount held in reserve for risk management';
COMMENT ON COLUMN settlements.reconciled IS 'Whether settlement has been reconciled with bank records';
COMMENT ON COLUMN settlements.settlement_number IS 'Unique human-readable settlement reference';

-- Sample data for testing (commented out)
/*
-- Weekly settlement for a venue
INSERT INTO settlements (
    venue_id, period_start_date, period_end_date, settlement_type,
    gross_sales, platform_fees, processing_fees, refunds,
    successful_transactions, total_transactions,
    payout_amount, payout_method, status
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '2025-07-14'::date,  -- Monday
    '2025-07-20'::date,  -- Sunday
    'weekly',
    10000.00,  -- $10,000 in sales
    500.00,    -- 5% platform fee
    290.00,    -- ~2.9% processing
    100.00,    -- $100 in refunds
    95,        -- 95 successful transactions
    100,       -- 100 total transactions
    9110.00,   -- Net payout
    'ach',
    'calculated'
);

-- Monthly settlement with reserves
INSERT INTO settlements (
    venue_id, period_start_date, period_end_date, settlement_type,
    gross_sales, platform_fees, processing_fees, reserves_held,
    successful_transactions, payout_amount, payout_method,
    reserve_percentage, reserve_release_date, status
) VALUES (
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '2025-07-01'::date,
    '2025-07-31'::date,
    'monthly',
    50000.00,  -- $50,000 in sales
    2500.00,   -- 5% platform fee
    1450.00,   -- Processing fees
    4605.00,   -- 10% held in reserve
    450,
    41445.00,  -- Net after reserve
    'stripe',
    10.00,     -- 10% reserve
    '2025-08-31'::date,  -- Release after 30 days
    'approved'
);
*/

-- Settlement Calculation Notes:
-- 1. Gross Sales: Total ticket sales including taxes
-- 2. Platform Fees: Percentage or fixed fee charged by platform
-- 3. Processing Fees: Payment processor fees (Stripe, PayPal, etc.)
-- 4. Refunds: Total refunds issued during period
-- 5. Chargebacks: Disputed transactions lost
-- 6. Adjustments: Manual adjustments (credits/debits)
-- 7. Reserves: Risk management holdback

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_settlements_tenant_id ON settlements(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlements_tenant_created ON settlements(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- 8. Net Payout = Gross - All Fees - Refunds - Chargebacks ± Adjustments - Reserves + Released Reserves
