-- Migration: Add transfer tracking fields
-- Purpose: Track Stripe transfer IDs for seller and venue payouts

-- Add transfer tracking columns to fees table
ALTER TABLE fees ADD COLUMN IF NOT EXISTS seller_transfer_id VARCHAR(255);
ALTER TABLE fees ADD COLUMN IF NOT EXISTS venue_transfer_id VARCHAR(255);
ALTER TABLE fees ADD COLUMN IF NOT EXISTS venue_received_cents INTEGER;

-- Add charge tracking columns to transfers table
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS charge_id VARCHAR(255);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS venue_stripe_account_id VARCHAR(255);

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_fees_seller_transfer_id ON fees(seller_transfer_id);
CREATE INDEX IF NOT EXISTS idx_fees_venue_transfer_id ON fees(venue_transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfers_charge_id ON transfers(charge_id);

-- Add comments for documentation
COMMENT ON COLUMN fees.seller_transfer_id IS 'Stripe transfer ID for seller payout';
COMMENT ON COLUMN fees.venue_transfer_id IS 'Stripe transfer ID for venue royalty payout';
COMMENT ON COLUMN fees.venue_received_cents IS 'Actual amount venue received in cents (may differ from calculated if transfer failed)';
COMMENT ON COLUMN transfers.charge_id IS 'Stripe charge ID from PaymentIntent (used for source_transaction)';
COMMENT ON COLUMN transfers.venue_stripe_account_id IS 'Venue Stripe Connect account ID at time of transfer';

-- Migration completed
-- Transfers can now be fully tracked and reconciled with Stripe
