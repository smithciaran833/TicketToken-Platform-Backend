-- Migration: 003_add_foreign_keys_constraints.sql
-- Description: Add foreign key constraints and data integrity checks
-- Phase 3: Database & Schema Improvements

-- Add foreign key constraints (assuming these tables exist in main DB)
-- Note: These may need to be adjusted based on actual schema

-- Foreign key to tickets table
ALTER TABLE ticket_transfers
ADD CONSTRAINT fk_ticket_transfers_ticket
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Foreign keys to users table
ALTER TABLE ticket_transfers
ADD CONSTRAINT fk_ticket_transfers_from_user
FOREIGN KEY (from_user_id) REFERENCES users(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE ticket_transfers
ADD CONSTRAINT fk_ticket_transfers_to_user
FOREIGN KEY (to_user_id) REFERENCES users(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Foreign key for transfer_history
ALTER TABLE transfer_history
ADD CONSTRAINT fk_transfer_history_transfer
FOREIGN KEY (transfer_id) REFERENCES ticket_transfers(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE transfer_history
ADD CONSTRAINT fk_transfer_history_actor
FOREIGN KEY (actor_user_id) REFERENCES users(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Add unique constraint on acceptance code (must be unique globally)
ALTER TABLE ticket_transfers
ADD CONSTRAINT uq_ticket_transfers_acceptance_code UNIQUE (acceptance_code);

-- Add constraint to prevent self-transfers
ALTER TABLE ticket_transfers
ADD CONSTRAINT chk_ticket_transfers_no_self_transfer 
CHECK (from_user_id != to_user_id);

-- Add constraint to ensure completed transfers have accepted_at timestamp
ALTER TABLE ticket_transfers
ADD CONSTRAINT chk_ticket_transfers_completed_has_accepted_at
CHECK (
    (status = 'COMPLETED' AND accepted_at IS NOT NULL) OR
    (status != 'COMPLETED')
);

-- Add constraint to ensure cancelled transfers have cancellation details
ALTER TABLE ticket_transfers
ADD CONSTRAINT chk_ticket_transfers_cancelled_has_details
CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL) OR
    (status != 'CANCELLED')
);

-- Add constraint to ensure gift transfers have zero price
ALTER TABLE ticket_transfers
ADD CONSTRAINT chk_ticket_transfers_gift_zero_price
CHECK (
    (is_gift = true AND price_cents = 0) OR
    (is_gift = false)
);

-- Add constraint for valid currency codes
ALTER TABLE ticket_transfers
ADD CONSTRAINT chk_ticket_transfers_valid_currency
CHECK (currency ~ '^[A-Z]{3}$');

-- Prevent ticket from having multiple pending transfers
CREATE UNIQUE INDEX idx_ticket_transfers_one_pending_per_ticket
ON ticket_transfers(ticket_id)
WHERE status = 'PENDING';

-- Comments
COMMENT ON CONSTRAINT fk_ticket_transfers_ticket ON ticket_transfers 
IS 'Ensures ticket exists and prevents deletion of tickets with transfers';

COMMENT ON CONSTRAINT chk_ticket_transfers_no_self_transfer ON ticket_transfers
IS 'Prevents users from transferring tickets to themselves';

COMMENT ON CONSTRAINT uq_ticket_transfers_acceptance_code ON ticket_transfers
IS 'Ensures acceptance codes are globally unique for security';
