-- Migration: Add blockchain tracking to transfers
-- Purpose: Track on-chain ownership updates after successful resales

-- Add blockchain tracking columns to marketplace_transfers table
ALTER TABLE marketplace_transfers ADD COLUMN IF NOT EXISTS blockchain_signature VARCHAR(255);
ALTER TABLE marketplace_transfers ADD COLUMN IF NOT EXISTS blockchain_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE marketplace_transfers ADD COLUMN IF NOT EXISTS blockchain_synced_at TIMESTAMP;
ALTER TABLE marketplace_transfers ADD COLUMN IF NOT EXISTS blockchain_error TEXT;

-- Add index for querying blockchain status
CREATE INDEX IF NOT EXISTS idx_transfers_blockchain_status ON marketplace_transfers(blockchain_status);
CREATE INDEX IF NOT EXISTS idx_transfers_blockchain_signature ON marketplace_transfers(blockchain_signature);

-- Add comments for documentation
COMMENT ON COLUMN marketplace_transfers.blockchain_signature IS 'Solana transaction signature for on-chain ownership transfer';
COMMENT ON COLUMN marketplace_transfers.blockchain_status IS 'Status of blockchain sync: pending, synced, failed';
COMMENT ON COLUMN marketplace_transfers.blockchain_synced_at IS 'Timestamp when blockchain transfer was confirmed';
COMMENT ON COLUMN marketplace_transfers.blockchain_error IS 'Error message if blockchain transfer failed';

-- Migration completed
-- Blockchain ownership can now be tracked separately from payment completion
