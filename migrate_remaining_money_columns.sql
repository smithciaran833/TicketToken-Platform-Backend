-- Migration: Complete monetary precision fix for remaining tables
-- Part 2 of Phase 1.1

BEGIN;

-- ============================================================================
-- STEP 1: Add _cents columns to remaining tables
-- ============================================================================

-- payment_intents table
ALTER TABLE payment_intents 
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER;

-- tax_records table
ALTER TABLE tax_records 
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER;

-- form_1099_records table
ALTER TABLE form_1099_records 
  ADD COLUMN IF NOT EXISTS gross_amount_cents BIGINT;

-- ============================================================================
-- STEP 2: Migrate existing data
-- ============================================================================

UPDATE payment_intents 
SET amount_cents = ROUND(amount * 100),
    platform_fee_cents = ROUND(COALESCE(platform_fee, 0) * 100)
WHERE amount_cents IS NULL;

UPDATE tax_records 
SET amount_cents = ROUND(amount * 100)
WHERE amount_cents IS NULL;

UPDATE form_1099_records 
SET gross_amount_cents = ROUND(COALESCE(gross_amount, 0) * 100)
WHERE gross_amount_cents IS NULL;

-- ============================================================================
-- STEP 3: Verification
-- ============================================================================

SELECT 
    'payment_intents' as table_name,
    COUNT(*) as total_rows,
    COUNT(amount) as old_amount_values,
    COUNT(amount_cents) as new_amount_cents,
    SUM(amount) as old_sum,
    SUM(amount_cents) as new_sum_cents
FROM payment_intents;

SELECT 
    'tax_records' as table_name,
    COUNT(*) as total_rows,
    COUNT(amount) as old_values,
    COUNT(amount_cents) as new_values,
    SUM(amount) as old_sum,
    SUM(amount_cents) as new_sum_cents
FROM tax_records;

SELECT 
    'form_1099_records' as table_name,
    COUNT(*) as total_rows,
    COUNT(gross_amount) as old_values,
    COUNT(gross_amount_cents) as new_values,
    SUM(gross_amount) as old_sum,
    SUM(gross_amount_cents) as new_sum_cents
FROM form_1099_records;

-- Show sample conversions
SELECT 
    id,
    amount as old_decimal,
    amount_cents as new_cents,
    amount_cents / 100.0 as back_to_decimal
FROM payment_intents
WHERE amount IS NOT NULL
LIMIT 5;

COMMIT;
