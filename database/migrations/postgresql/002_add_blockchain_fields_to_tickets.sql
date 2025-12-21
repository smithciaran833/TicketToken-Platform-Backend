-- Migration: Add blockchain fields to tickets table
-- Purpose: Store on-chain ticket PDA, NFT asset ID, and verification status

-- Add blockchain-related columns
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_pda VARCHAR(44);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS nft_asset_id VARCHAR(88);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS event_pda VARCHAR(44);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS transfer_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS verification_signature VARCHAR(88);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS blockchain_status VARCHAR(50) DEFAULT 'pending';

-- Add indexes for blockchain lookups and queries
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_pda ON tickets(ticket_pda);
CREATE INDEX IF NOT EXISTS idx_tickets_nft_asset_id ON tickets(nft_asset_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_pda ON tickets(event_pda);
CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(used);
CREATE INDEX IF NOT EXISTS idx_tickets_blockchain_status ON tickets(blockchain_status);
CREATE INDEX IF NOT EXISTS idx_tickets_verified_at ON tickets(verified_at);

-- Add comments for documentation
COMMENT ON COLUMN tickets.ticket_pda IS 'Solana PDA (Program Derived Address) for on-chain ticket account';
COMMENT ON COLUMN tickets.nft_asset_id IS 'Metaplex compressed NFT asset ID (merkle_tree:leaf_index format)';
COMMENT ON COLUMN tickets.event_pda IS 'Parent event PDA - denormalized for efficient blockchain queries';
COMMENT ON COLUMN tickets.transfer_count IS 'Number of times ticket has been transferred/resold (synced from blockchain)';
COMMENT ON COLUMN tickets.used IS 'Whether ticket has been scanned/verified at venue door (immutable on blockchain)';
COMMENT ON COLUMN tickets.verified_at IS 'Timestamp when ticket was verified/scanned (from blockchain)';
COMMENT ON COLUMN tickets.verification_signature IS 'Solana transaction signature when ticket was verified on-chain';
COMMENT ON COLUMN tickets.blockchain_status IS 'Status of blockchain synchronization: pending, registered, synced, failed';

-- Migration completed
-- Tickets can now track on-chain state including transfers and verification
