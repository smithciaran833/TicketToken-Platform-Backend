-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Blockchain Transactions Table Schema
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This table tracks all blockchain transactions related to ticket NFTs
-- on the Solana blockchain, including minting, transfers, and marketplace operations

-- Drop table if exists (for development - remove in production)
DROP TABLE IF EXISTS blockchain_transactions CASCADE;

-- Create blockchain_transactions table
CREATE TABLE blockchain_transactions (
    -- Primary key
    id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
    
    -- Transaction identification
    transaction_signature VARCHAR(88) UNIQUE NOT NULL, -- Solana transaction signature (base58 encoded)
    
    -- Transaction classification
    type VARCHAR(50) NOT NULL, -- Type of blockchain operation
    CONSTRAINT valid_transaction_type CHECK (type IN (
        'MINT_NFT',          -- Initial NFT minting
        'TRANSFER_NFT',      -- NFT ownership transfer
        'BURN_NFT',          -- NFT burning/destruction
        'LIST_NFT',          -- List NFT on marketplace
        'DELIST_NFT',        -- Remove NFT from marketplace
        'UPDATE_METADATA',   -- Update NFT metadata
        'FREEZE_NFT',        -- Freeze NFT (disable transfers)
        'THAW_NFT'          -- Unfreeze NFT (enable transfers)
    )),
    
    -- Transaction status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- Current transaction status
    CONSTRAINT valid_status CHECK (status IN (
        'PENDING',    -- Transaction submitted but not confirmed
        'CONFIRMED',  -- Transaction confirmed on blockchain
        'FAILED',     -- Transaction failed
        'EXPIRED'     -- Transaction expired without confirmation
    )),
    
    -- Foreign key relationship
    ticket_id UUID NOT NULL, -- Reference to the ticket being transacted
    CONSTRAINT fk_ticket
        FOREIGN KEY (ticket_id) 
        REFERENCES tickets(id)
        ON DELETE CASCADE,
    
    -- Wallet addresses
    from_wallet VARCHAR(44), -- Solana wallet address sending the NFT (base58)
    to_wallet VARCHAR(44),   -- Solana wallet address receiving the NFT (base58)
    
    -- Blockchain data
    slot_number BIGINT,                      -- Solana slot number where transaction was processed
    block_time TIMESTAMP WITH TIME ZONE,     -- Timestamp when block was produced
    
    -- Fee tracking
    fee_lamports BIGINT,                     -- Transaction fee in lamports (1 SOL = 1,000,000,000 lamports)
    
    -- Error handling
    error_message TEXT,                      -- Error message if transaction failed
    retry_count INTEGER DEFAULT 0,           -- Number of retry attempts
    
    -- Transaction metadata
    metadata JSONB DEFAULT '{}',             -- Additional transaction metadata (e.g., marketplace data)
    
    -- Confirmation tracking
    confirmations INTEGER,                   -- Number of confirmations received
    finalized BOOLEAN DEFAULT FALSE,         -- Whether transaction is finalized on chain
    
    -- Program interaction
    program_id VARCHAR(44),                  -- Solana program ID that processed the transaction
    instruction_data TEXT,                   -- Encoded instruction data (base64)
    
    -- Priority and compute
    priority_fee_lamports BIGINT,            -- Priority fee paid for faster processing
    compute_units_used INTEGER,              -- Compute units consumed by transaction
    
    -- Associated accounts
    associated_token_account VARCHAR(44),    -- Associated token account address if applicable
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes for Performance
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Index on transaction signature for quick lookups
CREATE INDEX idx_blockchain_transactions_signature 
    ON blockchain_transactions(transaction_signature);

-- Index on ticket_id for finding all transactions for a ticket
CREATE INDEX idx_blockchain_transactions_ticket_id 
    ON blockchain_transactions(ticket_id);

-- Index on status for filtering by transaction status
CREATE INDEX idx_blockchain_transactions_status 
    ON blockchain_transactions(status);

-- Index on from_wallet for wallet transaction history
CREATE INDEX idx_blockchain_transactions_from_wallet 
    ON blockchain_transactions(from_wallet);

-- Index on to_wallet for wallet transaction history
CREATE INDEX idx_blockchain_transactions_to_wallet 
    ON blockchain_transactions(to_wallet);

-- Composite index for status and created_at (useful for monitoring pending transactions)
CREATE INDEX idx_blockchain_transactions_status_created 
    ON blockchain_transactions(status, created_at);

-- Index on block_time for time-based queries
CREATE INDEX idx_blockchain_transactions_block_time 
    ON blockchain_transactions(block_time);

-- Index on type for filtering by transaction type
CREATE INDEX idx_blockchain_transactions_type 
    ON blockchain_transactions(type);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update Trigger
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_blockchain_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_blockchain_transactions_timestamp
    BEFORE UPDATE ON blockchain_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_blockchain_transactions_updated_at();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table Comments
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


COMMENT ON TABLE blockchain_transactions IS 'Tracks all Solana blockchain transactions related to ticket NFTs';

COMMENT ON COLUMN blockchain_transactions.id IS 'Unique identifier for the transaction record';
COMMENT ON COLUMN blockchain_transactions.transaction_signature IS 'Solana transaction signature (base58 encoded, 88 characters)';
COMMENT ON COLUMN blockchain_transactions.type IS 'Type of blockchain operation performed';
COMMENT ON COLUMN blockchain_transactions.status IS 'Current status of the transaction';
COMMENT ON COLUMN blockchain_transactions.ticket_id IS 'Reference to the ticket NFT involved in the transaction';
COMMENT ON COLUMN blockchain_transactions.from_wallet IS 'Solana wallet address of the sender';
COMMENT ON COLUMN blockchain_transactions.to_wallet IS 'Solana wallet address of the receiver';
COMMENT ON COLUMN blockchain_transactions.slot_number IS 'Solana slot number where transaction was included';
COMMENT ON COLUMN blockchain_transactions.block_time IS 'Timestamp when the block containing this transaction was produced';
COMMENT ON COLUMN blockchain_transactions.fee_lamports IS 'Transaction fee paid in lamports';
COMMENT ON COLUMN blockchain_transactions.error_message IS 'Error message if the transaction failed';
COMMENT ON COLUMN blockchain_transactions.retry_count IS 'Number of times this transaction has been retried';
COMMENT ON COLUMN blockchain_transactions.metadata IS 'Additional transaction data in JSON format';
COMMENT ON COLUMN blockchain_transactions.confirmations IS 'Number of confirmations received for this transaction';
COMMENT ON COLUMN blockchain_transactions.finalized IS 'Whether the transaction has reached finalized status on Solana';
COMMENT ON COLUMN blockchain_transactions.program_id IS 'Solana program that processed this transaction';
COMMENT ON COLUMN blockchain_transactions.instruction_data IS 'Base64 encoded instruction data sent to the program';
COMMENT ON COLUMN blockchain_transactions.priority_fee_lamports IS 'Additional priority fee for faster processing';
COMMENT ON COLUMN blockchain_transactions.compute_units_used IS 'Compute units consumed by this transaction';
COMMENT ON COLUMN blockchain_transactions.associated_token_account IS 'Associated token account address if applicable';
COMMENT ON COLUMN blockchain_transactions.created_at IS 'Timestamp when this record was created';
COMMENT ON COLUMN blockchain_transactions.updated_at IS 'Timestamp when this record was last updated';

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sample Usage Examples
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/*
-- Example: Insert a new NFT minting transaction
INSERT INTO blockchain_transactions (
    transaction_signature,
    type,
    status,
    ticket_id,
    from_wallet,
    to_wallet,
    slot_number,
    block_time,
    fee_lamports,
    program_id,
    metadata
) VALUES (
    '5wHu1qwD7q5ifKYP7qbYiPxDqGqSp7JH3Mvgh3XgYmhMcN6SfG4TfGjdpNTrKPAUeQqcYgqvBhkXDuYnvUYkJqVx',
    'MINT_NFT',
    'CONFIRMED',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'BZV6BSkxwyPWMQBkVZPuDjxXvpoZMJPLQvXv5JScHfKa',
    123456789,
    '2024-03-20 10:30:00+00',
    5000,
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    '{"mint_address": "7EYnhQoR9YM3N7UoaKRoA4xKbKqtWGbgSM9bASRxcUEH"}'::jsonb
);

-- Example: Query all transactions for a specific ticket
SELECT 
    transaction_signature,
    type,
    status,
    from_wallet,
    to_wallet,
    block_time,
    fee_lamports / 1000000000.0 AS fee_sol
FROM blockchain_transactions
WHERE ticket_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
ORDER BY block_time DESC;

-- Example: Find all pending transactions older than 5 minutes
SELECT 
    id,
    transaction_signature,
    type,
    created_at,
    retry_count
FROM blockchain_transactions
WHERE status = 'PENDING'
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
ORDER BY created_at ASC;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_blockchain_transactions_tenant_id ON blockchain_transactions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blockchain_transactions_tenant_created ON blockchain_transactions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
