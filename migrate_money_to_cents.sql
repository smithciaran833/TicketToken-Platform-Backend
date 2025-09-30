-- Migration: Convert money columns from numeric(10,2) to integer cents
-- Phase 1.1: Monetary Precision Fix
-- 
-- This migration converts all decimal money columns to integer cents
-- to prevent floating point precision errors

BEGIN;

-- ============================================================================
-- STEP 1: Add new _cents columns
-- ============================================================================

-- refunds table
ALTER TABLE refunds 
  ADD COLUMN amount_cents BIGINT;

-- ticket_types table
ALTER TABLE ticket_types 
  ADD COLUMN price_cents INTEGER;

-- orders table
ALTER TABLE orders 
  ADD COLUMN total_amount_cents INTEGER;

-- payment_intents table
ALTER TABLE payment_intents 
  ADD COLUMN amount_cents INTEGER,
  ADD COLUMN platform_fee_cents INTEGER;

-- tax_records table
ALTER TABLE tax_records 
  ADD COLUMN amount_cents INTEGER;

-- ============================================================================
-- STEP 2: Migrate existing data (multiply by 100, round)
-- ============================================================================

UPDATE refunds 
SET amount_cents = ROUND(amount * 100)
WHERE amount IS NOT NULL;

UPDATE ticket_types 
SET price_cents = ROUND(price * 100);

UPDATE orders 
SET total_amount_cents = ROUND(total_amount * 100);

UPDATE payment_intents 
SET amount_cents = ROUND(amount * 100),
    platform_fee_cents = ROUND(COALESCE(platform_fee, 0) * 100);

UPDATE tax_records 
SET amount_cents = ROUND(amount * 100);

-- ============================================================================
-- STEP 3: Verify migration (display sample data)
-- ============================================================================

-- Check refunds
SELECT 
    'refunds' as table_name,
    COUNT(*) as total_rows,
    COUNT(amount) as old_values,
    COUNT(amount_cents) as new_values,
    SUM(amount) as old_sum,
    SUM(amount_cents) as new_sum_cents
FROM refunds;

-- Check ticket_types
SELECT 
    'ticket_types' as table_name,
    COUNT(*) as total_rows,
    MIN(price) as old_min,
    MAX(price) as old_max,
    MIN(price_cents) as new_min_cents,
    MAX(price_cents) as new_max_cents
FROM ticket_types;

-- Check orders
SELECT 
    'orders' as table_name,
    COUNT(*) as total_rows,
    SUM(total_amount) as old_sum,
    SUM(total_amount_cents) as new_sum_cents
FROM orders;

-- Check payment_intents
SELECT 
    'payment_intents' as table_name,
    COUNT(*) as total_rows,
    SUM(amount) as old_sum,
    SUM(amount_cents) as new_sum_cents
FROM payment_intents;

-- Show some examples side-by-side
SELECT 
    id,
    amount as old_decimal,
    amount_cents as new_cents,
    amount_cents / 100.0 as back_to_decimal
FROM payment_intents
LIMIT 5;

-- ============================================================================
-- STEP 4: Add NOT NULL constraints (after verification)
-- ============================================================================

-- Uncomment these after verifying data looks correct:

-- ALTER TABLE refunds
--   ALTER COLUMN amount_cents SET NOT NULL;

-- ALTER TABLE ticket_types
--   ALTER COLUMN price_cents SET NOT NULL;

-- ALTER TABLE orders
--   ALTER COLUMN total_amount_cents SET NOT NULL;

-- ALTER TABLE payment_intents
--   ALTER COLUMN amount_cents SET NOT NULL,
--   ALTER COLUMN platform_fee_cents SET NOT NULL;

-- ALTER TABLE tax_records
--   ALTER COLUMN amount_cents SET NOT NULL;

-- ============================================================================
-- STEP 5: Drop old columns (AFTER verifying in production)
-- ============================================================================

-- DO NOT RUN THESE YET - Keep old columns until fully verified:

-- ALTER TABLE refunds DROP COLUMN amount;
-- ALTER TABLE ticket_types DROP COLUMN price;
-- ALTER TABLE orders DROP COLUMN total_amount;
-- ALTER TABLE payment_intents DROP COLUMN amount, DROP COLUMN platform_fee;
-- ALTER TABLE tax_records DROP COLUMN amount;

-- ============================================================================
-- STEP 6: Rename _cents columns to original names
-- ============================================================================

-- DO NOT RUN THESE YET - Only after dropping old columns:

-- ALTER TABLE refunds RENAME COLUMN amount_cents TO amount;
-- ALTER TABLE ticket_types RENAME COLUMN price_cents TO price;
-- ALTER TABLE orders RENAME COLUMN total_amount_cents TO total_amount;
-- ALTER TABLE payment_intents RENAME COLUMN amount_cents TO amount;
-- ALTER TABLE payment_intents RENAME COLUMN platform_fee_cents TO platform_fee;
-- ALTER TABLE tax_records RENAME COLUMN amount_cents TO amount;

COMMIT;

-- ============================================================================
-- Post-migration verification queries
-- ============================================================================

-- Run these after migration to verify:
-- SELECT COUNT(*) FROM ticket_types WHERE price_cents IS NULL;
-- SELECT COUNT(*) FROM orders WHERE total_amount_cents IS NULL;
-- SELECT id, price, price_cents FROM ticket_types LIMIT 10;
