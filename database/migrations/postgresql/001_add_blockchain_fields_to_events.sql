-- Migration: Add blockchain fields to events table
-- Purpose: Store on-chain event PDA and royalty split information

-- Add blockchain-related columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_pda VARCHAR(44);
ALTER TABLE events ADD COLUMN IF NOT EXISTS artist_wallet VARCHAR(44);
ALTER TABLE events ADD COLUMN IF NOT EXISTS artist_percentage DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_percentage DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE events ADD COLUMN IF NOT EXISTS blockchain_status VARCHAR(50) DEFAULT 'pending';

-- Add indexes for blockchain lookups
CREATE INDEX IF NOT EXISTS idx_events_event_pda ON events(event_pda);
CREATE INDEX IF NOT EXISTS idx_events_blockchain_status ON events(blockchain_status);

-- Add comments for documentation
COMMENT ON COLUMN events.event_pda IS 'Solana PDA (Program Derived Address) for on-chain event account';
COMMENT ON COLUMN events.artist_wallet IS 'Solana wallet address that receives artist royalty payments on resales';
COMMENT ON COLUMN events.artist_percentage IS 'Artist royalty percentage on resales (e.g., 5.00 = 5%). Stored as basis points on-chain.';
COMMENT ON COLUMN events.venue_percentage IS 'Venue royalty percentage on resales (e.g., 5.00 = 5%). Stored as basis points on-chain.';
COMMENT ON COLUMN events.blockchain_status IS 'Status of blockchain synchronization: pending, synced, failed';

-- Add constraint to ensure royalty percentages are valid
ALTER TABLE events ADD CONSTRAINT chk_event_royalty_total 
  CHECK (artist_percentage + venue_percentage <= 100.00);

-- Migration completed
-- Events can now be synced with blockchain to store immutable royalty splits
