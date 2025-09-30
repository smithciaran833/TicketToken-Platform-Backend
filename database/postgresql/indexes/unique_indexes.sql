-- =====================================================================
-- TicketToken Unique Indexes
-- =====================================================================
-- Purpose: Enforce business rules through unique constraints
-- Features: Partial indexes, expression indexes, deferrable constraints
-- Strategy: Prevent duplicates while supporting soft deletes
-- =====================================================================

-- Enable required extensions for advanced constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =====================================================================
-- USER UNIQUENESS CONSTRAINTS
-- =====================================================================

-- Email must be unique for active users (case-insensitive)
-- Performance impact: Minimal, uses expression index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_unique
ON users(lower(email::text))
WHERE deleted_at IS NULL;
-- ON CONFLICT example:
-- INSERT INTO users (email, ...) VALUES ('user@example.com', ...)
-- ON CONFLICT (lower(email::text)) WHERE deleted_at IS NULL
-- DO UPDATE SET updated_at = EXCLUDED.updated_at;

-- Username must be unique (case-insensitive)
-- Performance impact: Minimal
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_unique
ON users(lower(username))
WHERE deleted_at IS NULL AND username IS NOT NULL;

-- Primary wallet address must be unique
-- Performance impact: Minimal, sparse index due to NULL values
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wallet_address_unique
ON users(primary_wallet_address)
WHERE primary_wallet_address IS NOT NULL AND deleted_at IS NULL;

-- Phone number must be unique when verified
-- Performance impact: Minimal, partial index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone_unique
ON users(phone_number)
WHERE phone_verified = true AND deleted_at IS NULL;

-- =====================================================================
-- WALLET CONSTRAINTS
-- =====================================================================

-- One wallet address can only belong to one user
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_addresses_address_unique
ON wallet_addresses(address)
WHERE deleted_at IS NULL;

-- One primary wallet per user (enforced at wallet level too)
-- Performance impact: Low, small partial index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_addresses_primary_unique
ON wallet_addresses(user_id)
WHERE is_primary = true AND deleted_at IS NULL;

-- =====================================================================
-- EVENT UNIQUENESS CONSTRAINTS
-- =====================================================================

-- Event slug must be unique per venue
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_events_venue_slug_unique
ON events(venue_id, slug)
WHERE deleted_at IS NULL;

-- External event ID must be unique (for third-party integrations)
-- Performance impact: Minimal, sparse index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_events_external_id_unique
ON events(external_id)
WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- VENUE UNIQUENESS CONSTRAINTS
-- =====================================================================

-- Venue slug must be globally unique
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_slug_unique
ON venues(slug)
WHERE deleted_at IS NULL;

-- Venue tax ID must be unique per country
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_tax_id_unique
ON venues(country, tax_id)
WHERE tax_id IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- TICKET UNIQUENESS CONSTRAINTS
-- =====================================================================

-- Ticket validation code must be unique per event
-- Performance impact: Medium - important for entry scanning
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_event_validation_code_unique
ON tickets(event_id, validation_code)
WHERE deleted_at IS NULL;
-- ON CONFLICT example:
-- INSERT INTO tickets (event_id, validation_code, ...) VALUES (?, ?, ...)
-- ON CONFLICT (event_id, validation_code) WHERE deleted_at IS NULL
-- DO NOTHING;

-- Seat must be unique per event (for seated events)
-- Performance impact: Medium
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_event_seat_unique
ON tickets(event_id, section, row_number, seat_number)
WHERE section IS NOT NULL 
  AND row_number IS NOT NULL 
  AND seat_number IS NOT NULL 
  AND deleted_at IS NULL;

-- NFT token ID must be unique when minted
-- Performance impact: Low, sparse index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_nft_token_unique
ON tickets(nft_contract_address, nft_token_id)
WHERE nft_token_id IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- MARKETPLACE UNIQUENESS CONSTRAINTS
-- =====================================================================

-- One active listing per ticket
-- Performance impact: Low, partial index on active listings only
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_ticket_active_unique
ON listings(ticket_id)
WHERE status = 'active' AND deleted_at IS NULL;
-- ON CONFLICT example:
-- INSERT INTO listings (ticket_id, status, ...) VALUES (?, 'active', ...)
-- ON CONFLICT (ticket_id) WHERE status = 'active' AND deleted_at IS NULL
-- DO UPDATE SET price = EXCLUDED.price, updated_at = CURRENT_TIMESTAMP;

-- Prevent duplicate offers from same buyer on same listing
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_offers_buyer_listing_unique
ON offers(buyer_id, listing_id)
WHERE status IN ('pending', 'accepted') AND deleted_at IS NULL;

-- =====================================================================
-- PAYMENT UNIQUENESS CONSTRAINTS
-- =====================================================================

-- Payment intent ID must be unique (Stripe/payment processor)
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_intent_unique
ON payments(payment_intent_id)
WHERE payment_intent_id IS NOT NULL;

-- One primary payment method per user
-- Performance impact: Low, small partial index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_methods_primary_unique
ON payment_methods(user_id)
WHERE is_primary = true AND deleted_at IS NULL;

-- Invoice number must be unique
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_number_unique
ON invoices(invoice_number)
WHERE deleted_at IS NULL;

-- =====================================================================
-- REVIEW/RATING CONSTRAINTS
-- =====================================================================

-- One review per user per event (if reviews table exists)
-- Performance impact: Low
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_reviews_user_event_unique
-- ON reviews(user_id, event_id)
-- WHERE deleted_at IS NULL;

-- One rating per user per venue
-- Performance impact: Low
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_ratings_user_venue_unique
-- ON ratings(user_id, venue_id)
-- WHERE deleted_at IS NULL;

-- =====================================================================
-- SUBSCRIPTION CONSTRAINTS
-- =====================================================================

-- One active subscription per user per type
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_type_active_unique
ON subscriptions(user_id, subscription_type)
WHERE status = 'active' AND deleted_at IS NULL;

-- =====================================================================
-- STAFF CONSTRAINTS
-- =====================================================================

-- User can only have one active role per venue
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_staff_user_venue_active_unique
ON venue_staff(user_id, venue_id)
WHERE deleted_at IS NULL;

-- =====================================================================
-- BLOCKCHAIN CONSTRAINTS
-- =====================================================================

-- Transaction hash must be unique
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_blockchain_transactions_hash_unique
ON blockchain_transactions(transaction_hash)
WHERE transaction_hash IS NOT NULL;

-- One NFT metadata record per ticket
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_nft_metadata_ticket_unique
ON nft_metadata(ticket_id)
WHERE deleted_at IS NULL;

-- =====================================================================
-- REFERRAL CONSTRAINTS
-- =====================================================================

-- Referral code must be unique per user
-- Performance impact: Low
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_referral_code_unique
ON users(referral_code)
WHERE referral_code IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- DEFERRABLE CONSTRAINTS
-- =====================================================================

-- Deferrable constraint for complex seat swapping transactions
-- Allows temporary violations during transaction
ALTER TABLE tickets 
DROP CONSTRAINT IF EXISTS tickets_event_seat_deferrable_unique;

ALTER TABLE tickets
ADD CONSTRAINT tickets_event_seat_deferrable_unique
UNIQUE (event_id, section, row_number, seat_number)
DEFERRABLE INITIALLY DEFERRED;

-- =====================================================================
-- EXCLUSION CONSTRAINTS
-- =====================================================================

-- Prevent overlapping event schedules at same venue
-- Performance impact: Medium, uses GIST index
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exclusion constraint for non-overlapping events
-- (Commented out as it requires event_schedules to have daterange column)
-- ALTER TABLE event_schedules
-- ADD CONSTRAINT exclude_overlapping_events
-- EXCLUDE USING GIST (
--     venue_id WITH =,
--     daterange(starts_at::date, ends_at::date, '[]') WITH &&
-- )
-- WHERE (deleted_at IS NULL);

-- =====================================================================
-- NULLS NOT DISTINCT CONSTRAINTS (PostgreSQL 15+)
-- =====================================================================

-- Ensure uniqueness even with NULL values (PostgreSQL 15+ feature)
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_company_id_unique_nulls
-- ON users(company_id) NULLS NOT DISTINCT
-- WHERE deleted_at IS NULL;

-- =====================================================================
-- MONITORING AND MAINTENANCE
-- =====================================================================

-- Query to check for unique constraint violations before creating indexes
COMMENT ON SCHEMA public IS 'Check for duplicates before creating unique indexes:
-- Check email duplicates
SELECT lower(email::text), COUNT(*) 
FROM users 
WHERE deleted_at IS NULL 
GROUP BY lower(email::text) 
HAVING COUNT(*) > 1;

-- Check ticket validation code duplicates
SELECT event_id, validation_code, COUNT(*) 
FROM tickets 
WHERE deleted_at IS NULL 
GROUP BY event_id, validation_code 
HAVING COUNT(*) > 1;';

-- =====================================================================
-- ON CONFLICT EXAMPLES
-- =====================================================================

/*
-- Example 1: User registration with email conflict handling
INSERT INTO users (email, username, ...)
VALUES ('user@example.com', 'username123', ...)
ON CONFLICT (lower(email::text)) WHERE deleted_at IS NULL
DO UPDATE SET 
    last_login_at = CURRENT_TIMESTAMP,
    login_attempts = users.login_attempts + 1
RETURNING id, email, created_at;

-- Example 2: Ticket listing with automatic price update
INSERT INTO listings (ticket_id, seller_id, price, status, ...)
VALUES (?, ?, 100.00, 'active', ...)
ON CONFLICT (ticket_id) WHERE status = 'active' AND deleted_at IS NULL
DO UPDATE SET 
    price = EXCLUDED.price,
    updated_at = CURRENT_TIMESTAMP
WHERE listings.price != EXCLUDED.price;

-- Example 3: Upsert venue with slug conflict
INSERT INTO venues (slug, name, ...)
VALUES ('madison-square-garden', 'Madison Square Garden', ...)
ON CONFLICT (slug) WHERE deleted_at IS NULL
DO UPDATE SET
    updated_at = CURRENT_TIMESTAMP
WHERE venues.name != EXCLUDED.name;

-- Example 4: Complex seat swap using deferrable constraint
BEGIN;
SET CONSTRAINTS tickets_event_seat_deferrable_unique DEFERRED;
-- Swap seats between two tickets
UPDATE tickets SET seat_number = 'A2' WHERE id = ?; -- temporarily violates
UPDATE tickets SET seat_number = 'A1' WHERE id = ?; -- resolves violation
COMMIT; -- constraint checked here
*/

-- =====================================================================
-- PERFORMANCE IMPACT NOTES
-- =====================================================================
-- 1. Unique indexes add overhead to INSERT/UPDATE operations
-- 2. Expression indexes (lower()) have slight CPU overhead
-- 3. Partial indexes reduce storage and improve performance
-- 4. Deferrable constraints allow complex transactions
-- 5. Most unique indexes also serve as regular indexes for queries
-- 6. Monitor pg_stat_user_indexes for usage patterns
-- 7. Use CONCURRENTLY to avoid locking during creation
-- =====================================================================
