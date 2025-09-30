-- TicketToken Ticket Transactions Schema
-- This table stores all ticket purchase transactions including purchases, refunds, and transfers
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS ticket_transactions CASCADE;

-- Create the ticket_transactions table
CREATE TABLE ticket_transactions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys to related tables
    user_id UUID NOT NULL,  -- References users table from Week 1
    event_id UUID NOT NULL,  -- References events table from Week 1
    ticket_id UUID,  -- References tickets table (nullable for bulk purchases)
    
    -- Transaction type and details
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'refund', 'transfer')),
    
    -- Financial information
    amount DECIMAL(10, 2) NOT NULL,  -- Transaction amount
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 currency code
    payment_method_id VARCHAR(255),  -- External payment method identifier
    stripe_payment_intent_id VARCHAR(255),  -- Stripe payment intent for tracking
    
    -- Ticket information
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),  -- Number of tickets in transaction
    ticket_type VARCHAR(50),  -- Type of ticket (e.g., 'general', 'vip', 'early_bird')
    
    -- Transaction status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    
    -- Blockchain integration fields
    solana_transaction_signature VARCHAR(88),  -- Solana blockchain transaction signature
    nft_mint_address VARCHAR(44),  -- Solana NFT mint address if ticket is minted as NFT
    
    -- Transfer specific fields
    transfer_from_user_id UUID,  -- Original owner for transfer transactions
    transfer_to_user_id UUID,  -- New owner for transfer transactions
    
    -- Additional metadata
    metadata JSONB,  -- Flexible field for additional transaction data
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,  -- When the transaction was actually processed
    
    -- Foreign key constraints
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
    CONSTRAINT fk_transfer_from_user FOREIGN KEY (transfer_from_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_to_user FOREIGN KEY (transfer_to_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Ensure transfer fields are set correctly based on transaction type
    CONSTRAINT chk_transfer_users CHECK (
        (transaction_type = 'transfer' AND transfer_from_user_id IS NOT NULL AND transfer_to_user_id IS NOT NULL) OR
        (transaction_type != 'transfer' AND transfer_from_user_id IS NULL AND transfer_to_user_id IS NULL)
    ),
    
    -- Ensure payment fields are set for purchases
    CONSTRAINT chk_purchase_payment CHECK (
        (transaction_type = 'purchase' AND payment_method_id IS NOT NULL) OR
        (transaction_type != 'purchase')
    )
);

-- Create indexes for performance optimization

-- Index on user_id for user transaction history queries
CREATE INDEX idx_ticket_transactions_user_id ON ticket_transactions(user_id);

-- Index on event_id for event-specific transaction queries
CREATE INDEX idx_ticket_transactions_event_id ON ticket_transactions(event_id);

-- Index on status for filtering by transaction status
CREATE INDEX idx_ticket_transactions_status ON ticket_transactions(status);

-- Index on transaction_type for filtering by type
CREATE INDEX idx_ticket_transactions_type ON ticket_transactions(transaction_type);

-- Composite index for common query patterns (user transactions by status)
CREATE INDEX idx_ticket_transactions_user_status ON ticket_transactions(user_id, status);

-- Composite index for event financial reporting
CREATE INDEX idx_ticket_transactions_event_status_created ON ticket_transactions(event_id, status, created_at);

-- Index on stripe_payment_intent_id for payment lookups
CREATE INDEX idx_ticket_transactions_stripe_payment ON ticket_transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Index on solana_transaction_signature for blockchain lookups
CREATE INDEX idx_ticket_transactions_solana_tx ON ticket_transactions(solana_transaction_signature) WHERE solana_transaction_signature IS NOT NULL;

-- Index on created_at for time-based queries and reporting
CREATE INDEX idx_ticket_transactions_created_at ON ticket_transactions(created_at);

-- Index on processed_at for reconciliation queries
CREATE INDEX idx_ticket_transactions_processed_at ON ticket_transactions(processed_at) WHERE processed_at IS NOT NULL;

-- Partial index for pending transactions that need processing
CREATE INDEX idx_ticket_transactions_pending ON ticket_transactions(created_at) WHERE status = 'pending';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ticket_transactions_updated_at BEFORE UPDATE
    ON ticket_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add table comments
COMMENT ON TABLE ticket_transactions IS 'Stores all ticket purchase transactions including purchases, refunds, and transfers';

-- Add column comments
COMMENT ON COLUMN ticket_transactions.id IS 'Unique identifier for the transaction (UUID)';
COMMENT ON COLUMN ticket_transactions.user_id IS 'Foreign key to users table - the user involved in the transaction';
COMMENT ON COLUMN ticket_transactions.event_id IS 'Foreign key to events table - the event this transaction is for';
COMMENT ON COLUMN ticket_transactions.ticket_id IS 'Foreign key to tickets table - specific ticket if applicable';
COMMENT ON COLUMN ticket_transactions.transaction_type IS 'Type of transaction: purchase, refund, or transfer';
COMMENT ON COLUMN ticket_transactions.amount IS 'Transaction amount in the specified currency';
COMMENT ON COLUMN ticket_transactions.currency IS 'ISO 4217 currency code (e.g., USD, EUR)';
COMMENT ON COLUMN ticket_transactions.payment_method_id IS 'External payment method identifier for tracking';
COMMENT ON COLUMN ticket_transactions.stripe_payment_intent_id IS 'Stripe payment intent ID for payment tracking and reconciliation';
COMMENT ON COLUMN ticket_transactions.quantity IS 'Number of tickets involved in this transaction';
COMMENT ON COLUMN ticket_transactions.ticket_type IS 'Type/category of ticket (e.g., general, vip, early_bird)';
COMMENT ON COLUMN ticket_transactions.status IS 'Current status of the transaction: pending, completed, failed, or cancelled';
COMMENT ON COLUMN ticket_transactions.solana_transaction_signature IS 'Solana blockchain transaction signature for on-chain transactions';
COMMENT ON COLUMN ticket_transactions.nft_mint_address IS 'Solana NFT mint address if ticket is minted as an NFT';
COMMENT ON COLUMN ticket_transactions.transfer_from_user_id IS 'Original ticket owner for transfer transactions';
COMMENT ON COLUMN ticket_transactions.transfer_to_user_id IS 'New ticket owner for transfer transactions';
COMMENT ON COLUMN ticket_transactions.metadata IS 'Additional transaction data stored as JSONB';
COMMENT ON COLUMN ticket_transactions.created_at IS 'Timestamp when the transaction record was created';
COMMENT ON COLUMN ticket_transactions.updated_at IS 'Timestamp when the transaction record was last updated';
COMMENT ON COLUMN ticket_transactions.processed_at IS 'Timestamp when the transaction was actually processed/completed';

-- Sample data for testing (commented out)
/*
INSERT INTO ticket_transactions (
    user_id, event_id, transaction_type, amount, currency, 
    payment_method_id, stripe_payment_intent_id, quantity, 
    ticket_type, status, processed_at
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    'purchase',
    99.99,
    'USD',
    'pm_1234567890',
    'pi_1234567890',
    2,
    'general',
    'completed',
    CURRENT_TIMESTAMP
);

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_ticket_transactions_tenant_id ON ticket_transactions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_transactions_tenant_created ON ticket_transactions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
