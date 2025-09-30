-- =====================================================================
-- TicketToken Partial Indexes
-- =====================================================================
-- Purpose: Optimize queries for specific subsets of data
-- Strategy: Filter indexes to reduce size and improve performance
-- Benefits: Smaller indexes, faster scans, lower maintenance overhead
-- =====================================================================

-- =====================================================================
-- ACTIVE RECORDS PARTIAL INDEXES
-- =====================================================================

-- Active events only (excludes cancelled, completed, draft)
-- Space savings: ~70% (only indexes ~30% of events)
-- Selectivity: WHERE status IN ('on_sale', 'announced')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_active_partial
ON events(start_date, venue_id)
INCLUDE (name, status, base_price)
WHERE deleted_at IS NULL 
  AND status IN ('on_sale', 'announced', 'sold_out');
-- Query pattern: SELECT * FROM events WHERE status = 'on_sale' AND start_date >= ?

-- Active users only (excludes suspended, deleted)
-- Space savings: ~20% (indexes ~80% of users)
-- Selectivity: WHERE status = 'ACTIVE'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_partial
ON users(last_active_at DESC, email)
WHERE deleted_at IS NULL 
  AND status = 'ACTIVE';
-- Supports user activity dashboards and email lookups

-- Active venues (excludes inactive, pending approval)
-- Space savings: ~15% (indexes ~85% of venues)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_active_partial
ON venues(city, state_province)
INCLUDE (name, slug)
WHERE deleted_at IS NULL 
  AND is_active = true
  AND status = 'approved';

-- =====================================================================
-- STATUS-BASED PARTIAL INDEXES
-- =====================================================================

-- Pending transactions (for processing queues)
-- Space savings: ~95% (only pending transactions)
-- Selectivity: Very high - typically <5% of transactions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_pending_partial
ON transactions(created_at, payment_processor)
INCLUDE (amount, user_id)
WHERE status = 'pending' 
  AND deleted_at IS NULL;
-- Used by payment processing jobs

-- Available tickets only (for purchase flow)
-- Space savings: ~80% (excludes sold, reserved tickets)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_available_partial
ON tickets(event_id, section, price)
WHERE status = 'available' 
  AND deleted_at IS NULL;
-- Critical for ticket purchase queries

-- Active marketplace listings
-- Space savings: ~85% (only active listings)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_active_partial
ON listings(event_id, price)
INCLUDE (ticket_id, seller_id)
WHERE status = 'active' 
  AND deleted_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP;

-- Unprocessed refunds
-- Space savings: ~98% (very selective)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refunds_pending_partial
ON refunds(created_at, amount)
WHERE status IN ('requested', 'processing')
  AND deleted_at IS NULL;

-- =====================================================================
-- DATE RANGE PARTIAL INDEXES (HOT DATA)
-- =====================================================================

-- Recent events (last 30 days + next 90 days)
-- Space savings: ~85% (only current events)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_recent_partial
ON events(start_date, venue_id)
INCLUDE (name, status)
WHERE deleted_at IS NULL
  AND start_date BETWEEN CURRENT_DATE - INTERVAL '30 days' 
                     AND CURRENT_DATE + INTERVAL '90 days';
-- Refreshed weekly via maintenance job

-- Recent transactions (last 30 days)
-- Space savings: ~90% (hot data only)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_recent_partial
ON transactions(user_id, created_at DESC)
INCLUDE (amount, type, status)
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND deleted_at IS NULL;
-- For user dashboards and recent activity

-- Recent user activity (active in last 7 days)
-- Space savings: ~80% (active users only)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_recently_active_partial
ON users(last_active_at DESC)
INCLUDE (email, username)
WHERE last_active_at >= CURRENT_DATE - INTERVAL '7 days'
  AND deleted_at IS NULL;

-- Today's ticket validations (for entry scanning)
-- Space savings: ~99% (extremely selective)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticket_validations_today_partial
ON ticket_redemptions(event_id, redeemed_at)
WHERE redeemed_at >= CURRENT_DATE
  AND redeemed_at < CURRENT_DATE + INTERVAL '1 day';
-- Rebuilt nightly

-- =====================================================================
-- NULL EXCLUSION PARTIAL INDEXES
-- =====================================================================

-- Users with verified emails only
-- Space savings: ~30% (excludes unverified)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_verified_partial
ON users(email, created_at)
WHERE email_verified = true
  AND deleted_at IS NULL;

-- Events with assigned venues (excludes virtual events)
-- Space savings: ~10% 
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_with_venue_partial
ON events(venue_id, start_date)
WHERE venue_id IS NOT NULL
  AND deleted_at IS NULL;

-- Tickets with seat assignments (for seated venues)
-- Space savings: ~40% (GA events have no seats)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_seated_partial
ON tickets(event_id, section, row_number, seat_number)
WHERE section IS NOT NULL
  AND row_number IS NOT NULL
  AND seat_number IS NOT NULL
  AND deleted_at IS NULL;

-- =====================================================================
-- BOOLEAN CONDITION PARTIAL INDEXES
-- =====================================================================

-- Featured events (for homepage)
-- Space savings: ~98% (very few featured events)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_featured_partial
ON events(priority_score DESC, start_date)
WHERE is_featured = true
  AND deleted_at IS NULL
  AND status = 'on_sale';

-- Users with two-factor authentication
-- Space savings: ~70% (security-conscious users)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_2fa_enabled_partial
ON users(email)
WHERE two_factor_enabled = true
  AND deleted_at IS NULL;

-- Transferable tickets
-- Space savings: ~20% (some tickets non-transferable)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_transferable_partial
ON tickets(event_id, owner_id)
WHERE is_transferable = true
  AND status = 'active'
  AND deleted_at IS NULL;

-- =====================================================================
-- NOTIFICATION PARTIAL INDEXES
-- =====================================================================

-- Unread notifications
-- Space savings: ~85% (most notifications get read)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread_partial
ON notification_queue(user_id, created_at DESC)
INCLUDE (type, priority)
WHERE read_at IS NULL
  AND deleted_at IS NULL;

-- High priority notifications
-- Space savings: ~95% (few high priority)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_high_priority_partial
ON notification_queue(user_id, created_at DESC)
WHERE priority = 'high'
  AND read_at IS NULL
  AND deleted_at IS NULL;

-- =====================================================================
-- PARTIAL UNIQUE CONSTRAINTS
-- =====================================================================

-- One active subscription per user per type
-- Allows historical records while enforcing uniqueness
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_active_unique_partial
ON subscriptions(user_id, subscription_type)
WHERE status = 'active'
  AND deleted_at IS NULL;

-- One primary payment method per user
-- Allows multiple inactive methods
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_methods_primary_unique_partial
ON payment_methods(user_id)
WHERE is_primary = true
  AND is_active = true
  AND deleted_at IS NULL;

-- =====================================================================
-- SPACE SAVINGS CALCULATIONS
-- =====================================================================

/*
-- Calculate actual space savings from partial indexes
WITH index_sizes AS (
    SELECT 
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        pg_relation_size(indexrelid) as size_bytes
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
),
table_sizes AS (
    SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size(tablename::regclass)) as total_size
    FROM pg_tables
    WHERE schemaname = 'public'
)
SELECT 
    i.indexname,
    i.size as index_size,
    t.total_size as table_size,
    ROUND((i.size_bytes::numeric / pg_total_relation_size(tablename::regclass) * 100), 2) as index_table_ratio
FROM index_sizes i
JOIN pg_indexes pi ON i.indexname = pi.indexname
JOIN table_sizes t ON pi.tablename = t.tablename
WHERE i.indexname LIKE '%partial%'
ORDER BY i.size_bytes DESC;
*/

-- =====================================================================
-- SELECTIVITY ANALYSIS
-- =====================================================================

/*
-- Analyze WHERE clause selectivity for partial indexes
-- Active events selectivity
SELECT 
    COUNT(*) FILTER (WHERE status IN ('on_sale', 'announced', 'sold_out')) * 100.0 / COUNT(*) as active_percentage
FROM events
WHERE deleted_at IS NULL;

-- Pending transactions selectivity  
SELECT 
    COUNT(*) FILTER (WHERE status = 'pending') * 100.0 / COUNT(*) as pending_percentage
FROM transactions
WHERE deleted_at IS NULL;

-- Recent activity selectivity
SELECT 
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') * 100.0 / COUNT(*) as recent_percentage
FROM transactions
WHERE deleted_at IS NULL;
*/

-- =====================================================================
-- MAINTENANCE CONSIDERATIONS
-- =====================================================================

-- Maintenance job for date-based partial indexes
COMMENT ON SCHEMA public IS 'Rebuild date-based partial indexes:
-- Weekly job to rebuild recent events index
REINDEX INDEX CONCURRENTLY idx_events_recent_partial;

-- Daily job to rebuild today''s validations index
DROP INDEX IF EXISTS idx_ticket_validations_today_partial;
CREATE INDEX CONCURRENTLY idx_ticket_validations_today_partial
ON ticket_redemptions(event_id, redeemed_at)
WHERE redeemed_at >= CURRENT_DATE
  AND redeemed_at < CURRENT_DATE + INTERVAL ''1 day'';

-- Monitor partial index effectiveness
SELECT 
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname LIKE ''%partial%''
ORDER BY idx_scan DESC;';

-- =====================================================================
-- PERFORMANCE IMPACT NOTES
-- =====================================================================
-- 1. Partial indexes are smaller and faster to scan
-- 2. Reduced maintenance overhead during INSERT/UPDATE/DELETE
-- 3. Better cache utilization due to smaller size
-- 4. WHERE clause must match index predicate for usage
-- 5. Consider selectivity - aim for <30% of table rows
-- 6. Date-based partials need periodic rebuilding
-- 7. Monitor pg_stat_user_indexes for actual usage
-- =====================================================================
