-- Migration: 001_create_transfer_tables.sql
-- Description: Create initial transfer service tables
-- Phase 3: Database & Schema Improvements

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ticket_transfers table
CREATE TABLE IF NOT EXISTS ticket_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL,
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    to_email VARCHAR(255) NOT NULL,
    transfer_method VARCHAR(20) NOT NULL CHECK (transfer_method IN ('GIFT', 'SALE', 'CLAIM')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
    acceptance_code VARCHAR(12) NOT NULL,
    message TEXT,
    is_gift BOOLEAN NOT NULL DEFAULT true,
    price_cents INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_price CHECK (price_cents >= 0),
    CONSTRAINT valid_dates CHECK (expires_at > created_at),
    CONSTRAINT valid_acceptance CHECK (accepted_at IS NULL OR accepted_at >= created_at)
);

-- Create indexes for ticket_transfers
CREATE INDEX idx_ticket_transfers_ticket_id ON ticket_transfers(ticket_id);
CREATE INDEX idx_ticket_transfers_from_user_id ON ticket_transfers(from_user_id);
CREATE INDEX idx_ticket_transfers_to_user_id ON ticket_transfers(to_user_id);
CREATE INDEX idx_ticket_transfers_to_email ON ticket_transfers(to_email);
CREATE INDEX idx_ticket_transfers_status ON ticket_transfers(status);
CREATE INDEX idx_ticket_transfers_acceptance_code ON ticket_transfers(acceptance_code);
CREATE INDEX idx_ticket_transfers_created_at ON ticket_transfers(created_at DESC);
CREATE INDEX idx_ticket_transfers_expires_at ON ticket_transfers(expires_at) WHERE status = 'PENDING';

-- Composite indexes for common queries
CREATE INDEX idx_ticket_transfers_status_expires ON ticket_transfers(status, expires_at) WHERE status = 'PENDING';
CREATE INDEX idx_ticket_transfers_user_status ON ticket_transfers(from_user_id, status);
CREATE INDEX idx_ticket_transfers_recipient_status ON ticket_transfers(to_user_id, status);

-- Create transfer_history table for audit trail
CREATE TABLE IF NOT EXISTS transfer_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    actor_user_id UUID,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for transfer_history
CREATE INDEX idx_transfer_history_transfer_id ON transfer_history(transfer_id);
CREATE INDEX idx_transfer_history_actor ON transfer_history(actor_user_id);
CREATE INDEX idx_transfer_history_created_at ON transfer_history(created_at DESC);
CREATE INDEX idx_transfer_history_action ON transfer_history(action);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for ticket_transfers
CREATE TRIGGER update_ticket_transfers_updated_at
    BEFORE UPDATE ON ticket_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE ticket_transfers IS 'Stores all ticket transfer requests and their status';
COMMENT ON TABLE transfer_history IS 'Audit trail for all transfer-related actions';

COMMENT ON COLUMN ticket_transfers.acceptance_code IS 'Unique code required to accept the transfer';
COMMENT ON COLUMN ticket_transfers.expires_at IS 'Transfer expires and becomes invalid after this timestamp';
COMMENT ON COLUMN ticket_transfers.is_gift IS 'True if transfer is a gift (free), false if it is a sale';
COMMENT ON COLUMN ticket_transfers.price_cents IS 'Sale price in cents (0 for gifts)';
