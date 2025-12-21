-- Migration: Add Stripe Connect fields to venues table
-- Purpose: Enable venues to receive royalty payments via Stripe Connect

-- Add Stripe Connect columns
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_account_id VARCHAR(255);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_status VARCHAR(50) DEFAULT 'not_started';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN DEFAULT FALSE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_capabilities JSONB;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_country VARCHAR(2);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at TIMESTAMP;

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_venues_stripe_connect_account_id ON venues(stripe_connect_account_id);
CREATE INDEX IF NOT EXISTS idx_venues_stripe_connect_status ON venues(stripe_connect_status);

-- Add comments for documentation
COMMENT ON COLUMN venues.stripe_connect_account_id IS 'Stripe Connect account ID for receiving royalty payments';
COMMENT ON COLUMN venues.stripe_connect_status IS 'Onboarding status: not_started, pending, enabled, disabled';
COMMENT ON COLUMN venues.stripe_connect_charges_enabled IS 'Whether the venue can accept charges (from Stripe account capabilities)';
COMMENT ON COLUMN venues.stripe_connect_payouts_enabled IS 'Whether the venue can receive payouts (from Stripe account capabilities)';
COMMENT ON COLUMN venues.stripe_connect_details_submitted IS 'Whether venue has submitted all required details to Stripe';
COMMENT ON COLUMN venues.stripe_connect_capabilities IS 'JSON object of Stripe account capabilities (card_payments, transfers, etc.)';
COMMENT ON COLUMN venues.stripe_connect_country IS 'Two-letter country code for the Stripe account';
COMMENT ON COLUMN venues.stripe_connect_onboarded_at IS 'Timestamp when venue completed Stripe Connect onboarding';

-- Migration completed
-- Venues can now connect their Stripe accounts to receive royalty payments on resales
