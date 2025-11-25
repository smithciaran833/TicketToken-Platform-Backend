-- Migration: 005_add_blockchain_columns.sql
-- Description: Add blockchain-related columns for NFT transfers
-- Phase 5: Blockchain Integration

-- Add blockchain columns to ticket_transfers table
ALTER TABLE ticket_transfers
ADD COLUMN blockchain_signature VARCHAR(128),
ADD COLUMN blockchain_explorer_url TEXT,
ADD COLUMN blockchain_transferred_at TIMESTAMP WITH TIME ZONE;

-- Add blockchain columns to tickets table
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS nft_mint_address VARCHAR(44),
ADD COLUMN IF NOT EXISTS nft_last_transfer_signature VARCHAR(128),
ADD COLUMN IF NOT EXISTS blockchain_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blockchain_verified_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for blockchain queries
CREATE INDEX idx_ticket_transfers_blockchain_signature 
ON ticket_transfers(blockchain_signature) 
WHERE blockchain_signature IS NOT NULL;

CREATE INDEX idx_tickets_nft_mint_address 
ON tickets(nft_mint_address) 
WHERE nft_mint_address IS NOT NULL;

CREATE INDEX idx_tickets_blockchain_verified 
ON tickets(blockchain_verified, blockchain_verified_at) 
WHERE blockchain_verified = true;

-- Add comments
COMMENT ON COLUMN ticket_transfers.blockchain_signature 
IS 'Solana transaction signature for the NFT transfer';

COMMENT ON COLUMN ticket_transfers.blockchain_explorer_url 
IS 'Solana Explorer URL for viewing the transaction';

COMMENT ON COLUMN ticket_transfers.blockchain_transferred_at 
IS 'Timestamp when the blockchain transfer was completed';

COMMENT ON COLUMN tickets.nft_mint_address 
IS 'Solana NFT mint address for this ticket';

COMMENT ON COLUMN tickets.nft_last_transfer_signature 
IS 'Most recent blockchain transfer signature';

COMMENT ON COLUMN tickets.blockchain_verified 
IS 'Whether the NFT ownership has been verified on blockchain';

-- Create function to verify blockchain transfers
CREATE OR REPLACE FUNCTION mark_blockchain_verified(
    p_ticket_id UUID,
    p_verified BOOLEAN
)
RETURNS VOID AS $$
BEGIN
    UPDATE tickets
    SET 
        blockchain_verified = p_verified,
        blockchain_verified_at = CASE WHEN p_verified THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_ticket_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_blockchain_verified(UUID, BOOLEAN)
IS 'Marks a ticket as blockchain verified or unverified';

-- Create view for blockchain transfer analytics
CREATE OR REPLACE VIEW blockchain_transfer_stats AS
SELECT
    DATE_TRUNC('day', blockchain_transferred_at) AS transfer_date,
    tenant_id,
    COUNT(*) AS total_blockchain_transfers,
    COUNT(DISTINCT ticket_id) AS unique_tickets_transferred,
    AVG(EXTRACT(EPOCH FROM (blockchain_transferred_at - created_at))) AS avg_transfer_time_seconds
FROM ticket_transfers
WHERE blockchain_signature IS NOT NULL
GROUP BY transfer_date, tenant_id;

COMMENT ON VIEW blockchain_transfer_stats
IS 'Analytics for blockchain NFT transfers';
