-- TicketToken Ticket Transfers Schema
-- This table tracks all ticket ownership transfers including sales, gifts, marketplace transactions, and refunds
-- Transfer Workflow: initiated -> pending_approval -> completed (or cancelled)
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS ticket_transfers CASCADE;

-- Create the ticket_transfers table
CREATE TABLE ticket_transfers (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys to related tables
    ticket_id UUID NOT NULL,  -- The ticket being transferred
    from_user_id UUID NOT NULL,  -- Current owner transferring the ticket
    to_user_id UUID NOT NULL,  -- New owner receiving the ticket
    transaction_id UUID,  -- Link to ticket_transactions table if this transfer has a financial transaction
    
    -- Transfer type and details
    transfer_type VARCHAR(20) NOT NULL CHECK (transfer_type IN ('sale', 'gift', 'marketplace', 'refund')),
    
    -- Price information (NULL for gifts)
    transfer_price DECIMAL(10, 2),  -- Sale price of the ticket
    platform_fee DECIMAL(10, 2) DEFAULT 0,  -- Platform's commission on the transfer
    venue_royalty DECIMAL(10, 2) DEFAULT 0,  -- Venue's royalty on secondary sales
    currency VARCHAR(3) DEFAULT 'USD',  -- ISO 4217 currency code
    
    -- Transfer status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending_approval', 'completed', 'cancelled')),
    
    -- Blockchain tracking
    solana_transfer_signature VARCHAR(88),  -- Solana blockchain signature for the ownership transfer
    updated_nft_metadata JSONB,  -- Updated NFT metadata after transfer (if applicable)
    
    -- Security and verification fields
    verification_code VARCHAR(64),  -- Code sent to recipient for verification
    verification_attempts INTEGER DEFAULT 0,  -- Number of verification attempts
    expires_at TIMESTAMP WITH TIME ZONE,  -- When the transfer offer expires
    ip_address INET,  -- IP address of the user initiating the transfer
    user_agent TEXT,  -- Browser/app user agent for security tracking
    
    -- Additional metadata
    transfer_reason TEXT,  -- Optional reason for transfer
    marketplace_listing_id UUID,  -- Reference to marketplace listing if applicable
    metadata JSONB,  -- Additional transfer data (e.g., gift message, special conditions)
    
    -- Timestamps for transfer lifecycle
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- When transfer was initiated
    completed_at TIMESTAMP WITH TIME ZONE,  -- When transfer was completed
    cancelled_at TIMESTAMP WITH TIME ZONE,  -- When transfer was cancelled (if applicable)
    cancelled_by_user_id UUID,  -- Who cancelled the transfer
    cancellation_reason TEXT,  -- Why the transfer was cancelled
    
    -- Foreign key constraints
    CONSTRAINT fk_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE RESTRICT,
    CONSTRAINT fk_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_to_user FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transaction FOREIGN KEY (transaction_id) REFERENCES ticket_transactions(id) ON DELETE SET NULL,
    CONSTRAINT fk_cancelled_by_user FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Ensure users are different (can't transfer to yourself)
    CONSTRAINT chk_different_users CHECK (from_user_id != to_user_id),
    
    -- Ensure price fields are set correctly based on transfer type
    CONSTRAINT chk_transfer_pricing CHECK (
        (transfer_type IN ('sale', 'marketplace') AND transfer_price IS NOT NULL AND transfer_price > 0) OR
        (transfer_type IN ('gift', 'refund') AND transfer_price IS NULL)
    ),
    
    -- Ensure only one completion timestamp is set
    CONSTRAINT chk_completion_status CHECK (
        (status = 'completed' AND completed_at IS NOT NULL AND cancelled_at IS NULL) OR
        (status = 'cancelled' AND cancelled_at IS NOT NULL AND completed_at IS NULL) OR
        (status IN ('initiated', 'pending_approval') AND completed_at IS NULL AND cancelled_at IS NULL)
    ),
    
    -- Ensure fees are not negative
    CONSTRAINT chk_fees_positive CHECK (
        platform_fee >= 0 AND venue_royalty >= 0
    ),
    
    -- Ensure verification attempts are reasonable
    CONSTRAINT chk_verification_attempts CHECK (verification_attempts >= 0 AND verification_attempts <= 10)
);

-- Create indexes for performance optimization

-- Index on ticket_id for ticket transfer history
CREATE INDEX idx_ticket_transfers_ticket_id ON ticket_transfers(ticket_id);

-- Index on from_user_id for user's outgoing transfers
CREATE INDEX idx_ticket_transfers_from_user ON ticket_transfers(from_user_id);

-- Index on to_user_id for user's incoming transfers
CREATE INDEX idx_ticket_transfers_to_user ON ticket_transfers(to_user_id);

-- Index on status for filtering active transfers
CREATE INDEX idx_ticket_transfers_status ON ticket_transfers(status);

-- Index on transfer_type for marketplace and reporting queries
CREATE INDEX idx_ticket_transfers_type ON ticket_transfers(transfer_type);

-- Composite index for user transfer history (both directions)
CREATE INDEX idx_ticket_transfers_user_history ON ticket_transfers(from_user_id, status, created_at DESC);
CREATE INDEX idx_ticket_transfers_user_incoming ON ticket_transfers(to_user_id, status, created_at DESC);

-- Composite index for marketplace queries (active marketplace transfers)
CREATE INDEX idx_ticket_transfers_marketplace_active ON ticket_transfers(transfer_type, status, created_at DESC) 
    WHERE transfer_type = 'marketplace' AND status IN ('initiated', 'pending_approval');

-- Index on transaction_id for financial reconciliation
CREATE INDEX idx_ticket_transfers_transaction ON ticket_transfers(transaction_id) WHERE transaction_id IS NOT NULL;

-- Index on verification_code for quick lookups during verification
CREATE INDEX idx_ticket_transfers_verification ON ticket_transfers(verification_code) 
    WHERE verification_code IS NOT NULL AND status = 'pending_approval';

-- Index on expires_at for cleanup of expired transfers
CREATE INDEX idx_ticket_transfers_expires ON ticket_transfers(expires_at) 
    WHERE expires_at IS NOT NULL AND status IN ('initiated', 'pending_approval');

-- Index on marketplace_listing_id for marketplace integration
CREATE INDEX idx_ticket_transfers_marketplace_listing ON ticket_transfers(marketplace_listing_id) 
    WHERE marketplace_listing_id IS NOT NULL;

-- Index on created_at for time-based queries
CREATE INDEX idx_ticket_transfers_created_at ON ticket_transfers(created_at DESC);

-- Index on completed_at for reporting completed transfers
CREATE INDEX idx_ticket_transfers_completed_at ON ticket_transfers(completed_at DESC) 
    WHERE completed_at IS NOT NULL;

-- Partial index for active transfers that need processing
CREATE INDEX idx_ticket_transfers_active ON ticket_transfers(created_at, expires_at) 
    WHERE status IN ('initiated', 'pending_approval');

-- Create function to validate transfer status transitions
CREATE OR REPLACE FUNCTION validate_transfer_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Only allow valid status transitions
    IF OLD.status = 'completed' OR OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot modify a transfer that is already % ', OLD.status;
    END IF;
    
    -- Set completion timestamps based on new status
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    ELSIF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        NEW.cancelled_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_transfer_status_before_update
    BEFORE UPDATE OF status ON ticket_transfers
    FOR EACH ROW
    EXECUTE FUNCTION validate_transfer_status_transition();

-- Add table comments
COMMENT ON TABLE ticket_transfers IS 'Tracks all ticket ownership transfers including sales, gifts, marketplace transactions, and refunds. Workflow: initiated -> pending_approval -> completed/cancelled';

-- Add column comments
COMMENT ON COLUMN ticket_transfers.id IS 'Unique identifier for the transfer (UUID)';
COMMENT ON COLUMN ticket_transfers.ticket_id IS 'Foreign key to tickets table - the ticket being transferred';
COMMENT ON COLUMN ticket_transfers.from_user_id IS 'Foreign key to users table - current owner transferring the ticket';
COMMENT ON COLUMN ticket_transfers.to_user_id IS 'Foreign key to users table - new owner receiving the ticket';
COMMENT ON COLUMN ticket_transfers.transaction_id IS 'Foreign key to ticket_transactions table for financial tracking';
COMMENT ON COLUMN ticket_transfers.transfer_type IS 'Type of transfer: sale (direct sale), gift (free transfer), marketplace (platform sale), refund (return to venue)';
COMMENT ON COLUMN ticket_transfers.transfer_price IS 'Sale price of the ticket (NULL for gifts/refunds)';
COMMENT ON COLUMN ticket_transfers.platform_fee IS 'Platform commission on the transfer (default 0)';
COMMENT ON COLUMN ticket_transfers.venue_royalty IS 'Venue royalty on secondary sales (default 0)';
COMMENT ON COLUMN ticket_transfers.currency IS 'ISO 4217 currency code for pricing';
COMMENT ON COLUMN ticket_transfers.status IS 'Current transfer status: initiated (created), pending_approval (awaiting verification), completed (ownership transferred), cancelled';
COMMENT ON COLUMN ticket_transfers.solana_transfer_signature IS 'Solana blockchain signature for on-chain ownership transfer';
COMMENT ON COLUMN ticket_transfers.updated_nft_metadata IS 'Updated NFT metadata after transfer completion';
COMMENT ON COLUMN ticket_transfers.verification_code IS 'Security code sent to recipient for transfer verification';
COMMENT ON COLUMN ticket_transfers.verification_attempts IS 'Number of verification attempts made (max 10)';
COMMENT ON COLUMN ticket_transfers.expires_at IS 'When the transfer offer expires if not completed';
COMMENT ON COLUMN ticket_transfers.ip_address IS 'IP address of user initiating the transfer for security';
COMMENT ON COLUMN ticket_transfers.user_agent IS 'Browser/app user agent for security tracking';
COMMENT ON COLUMN ticket_transfers.transfer_reason IS 'Optional explanation for the transfer';
COMMENT ON COLUMN ticket_transfers.marketplace_listing_id IS 'Reference to marketplace listing if sold through marketplace';
COMMENT ON COLUMN ticket_transfers.metadata IS 'Additional transfer data as JSONB (gift messages, conditions, etc.)';
COMMENT ON COLUMN ticket_transfers.created_at IS 'When the transfer was initiated';
COMMENT ON COLUMN ticket_transfers.completed_at IS 'When the transfer was successfully completed';
COMMENT ON COLUMN ticket_transfers.cancelled_at IS 'When the transfer was cancelled';
COMMENT ON COLUMN ticket_transfers.cancelled_by_user_id IS 'User who cancelled the transfer';
COMMENT ON COLUMN ticket_transfers.cancellation_reason IS 'Reason for transfer cancellation';

-- Sample data for testing (commented out)
/*
-- Example marketplace transfer
INSERT INTO ticket_transfers (
    ticket_id, from_user_id, to_user_id, transfer_type,
    transfer_price, platform_fee, venue_royalty, status,
    verification_code, expires_at, ip_address
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'marketplace',
    150.00,
    15.00,  -- 10% platform fee
    7.50,   -- 5% venue royalty
    'pending_approval',
    'VERIFY-' || substr(md5(random()::text), 1, 8),
    CURRENT_TIMESTAMP + INTERVAL '24 hours',
    '192.168.1.100'::inet
);

-- Example gift transfer
INSERT INTO ticket_transfers (
    ticket_id, from_user_id, to_user_id, transfer_type,
    status, transfer_reason, metadata
) VALUES (
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    '550e8400-e29b-41d4-a716-446655440005'::uuid,
    '550e8400-e29b-41d4-a716-446655440006'::uuid,
    'gift',
    'initiated',
    'Birthday gift',
    '{"gift_message": "Happy Birthday! Enjoy the show!", "wrapped": true}'::jsonb
);

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_tenant_id ON ticket_transfers(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_tenant_created ON ticket_transfers(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
