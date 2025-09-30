-- Final Migration: Complete Money Precision Fix
-- BACKUP CREATED: money_migration_backup_20250930_132830.sql

BEGIN;

-- Step 1: Verify all _cents columns are populated
DO $$
DECLARE
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count FROM orders WHERE total_amount_cents IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Found % orders with NULL total_amount_cents', null_count;
    END IF;
    
    SELECT COUNT(*) INTO null_count FROM payment_intents WHERE amount_cents IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Found % payment_intents with NULL amount_cents', null_count;
    END IF;
    
    SELECT COUNT(*) INTO null_count FROM ticket_types WHERE price_cents IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Found % ticket_types with NULL price_cents', null_count;
    END IF;
    
    RAISE NOTICE 'All _cents columns are populated. Safe to proceed.';
END $$;

-- Step 2: Add NOT NULL constraints
ALTER TABLE orders ALTER COLUMN total_amount_cents SET NOT NULL;
ALTER TABLE payment_intents ALTER COLUMN amount_cents SET NOT NULL;
ALTER TABLE payment_intents ALTER COLUMN platform_fee_cents SET NOT NULL;
ALTER TABLE refunds ALTER COLUMN amount_cents SET NOT NULL;
ALTER TABLE ticket_types ALTER COLUMN price_cents SET NOT NULL;

-- Step 3: Drop old decimal columns
ALTER TABLE orders DROP COLUMN IF EXISTS total_amount;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS amount;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS platform_fee;
ALTER TABLE refunds DROP COLUMN IF EXISTS amount;
ALTER TABLE ticket_types DROP COLUMN IF EXISTS price;
ALTER TABLE tax_records DROP COLUMN IF EXISTS amount;
ALTER TABLE form_1099_records DROP COLUMN IF EXISTS gross_amount;

-- Step 4: Rename _cents columns to original names
ALTER TABLE orders RENAME COLUMN total_amount_cents TO total_amount;
ALTER TABLE payment_intents RENAME COLUMN amount_cents TO amount;
ALTER TABLE payment_intents RENAME COLUMN platform_fee_cents TO platform_fee;
ALTER TABLE refunds RENAME COLUMN amount_cents TO amount;
ALTER TABLE ticket_types RENAME COLUMN price_cents TO price;
ALTER TABLE tax_records RENAME COLUMN amount_cents TO amount;
ALTER TABLE form_1099_records RENAME COLUMN gross_amount_cents TO gross_amount;

-- Step 5: Add comments to columns
COMMENT ON COLUMN orders.total_amount IS 'Order total in integer cents (e.g., $10.50 = 1050)';
COMMENT ON COLUMN payment_intents.amount IS 'Payment amount in integer cents';
COMMENT ON COLUMN payment_intents.platform_fee IS 'Platform fee in integer cents';
COMMENT ON COLUMN refunds.amount IS 'Refund amount in integer cents';
COMMENT ON COLUMN ticket_types.price IS 'Ticket price in integer cents';
COMMENT ON COLUMN tax_records.amount IS 'Tax amount in integer cents';
COMMENT ON COLUMN form_1099_records.gross_amount IS 'Gross amount in integer cents';

-- Step 6: Verification - Fixed query
DO $$
BEGIN
    RAISE NOTICE '=== VERIFICATION ===';
    RAISE NOTICE 'orders: % rows', (SELECT COUNT(*) FROM orders);
    RAISE NOTICE 'payment_intents: % rows', (SELECT COUNT(*) FROM payment_intents);
    RAISE NOTICE 'ticket_types: % rows', (SELECT COUNT(*) FROM ticket_types);
    RAISE NOTICE 'refunds: % rows', (SELECT COUNT(*) FROM refunds);
END $$;

-- Show column types
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('orders', 'payment_intents', 'ticket_types', 'refunds')
    AND column_name IN ('total_amount', 'amount', 'price', 'platform_fee')
ORDER BY table_name, column_name;

COMMIT;
