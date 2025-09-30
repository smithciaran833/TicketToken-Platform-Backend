-- Migration: Fix idempotency constraints for tenant scoping
-- Date: 2025-09-30
-- Phase 1.2 Task 3: Database-Level Uniqueness

BEGIN;

-- Step 1: Fix payment_intents constraint
-- Drop existing constraint that doesn't include tenant_id
DROP INDEX IF EXISTS uq_payment_intents_idempotency;

-- Change idempotency_key column type to UUID for consistency
ALTER TABLE payment_intents 
  ALTER COLUMN idempotency_key TYPE UUID USING idempotency_key::uuid;

-- Create new constraint scoped by tenant_id AND idempotency_key
CREATE UNIQUE INDEX uq_payment_intents_idempotency
  ON payment_intents (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX uq_payment_intents_idempotency IS 
  'Prevents duplicate payment intents at database level, scoped by tenant';

-- Step 2: Add idempotency_key to refunds table
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- Create unique constraint for refunds
CREATE UNIQUE INDEX uq_refunds_idempotency
  ON refunds (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN refunds.idempotency_key IS 
  'Client-provided UUID for idempotent request handling';

COMMENT ON INDEX uq_refunds_idempotency IS 
  'Prevents duplicate refunds at database level, scoped by tenant';

-- Verify constraints
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname IN ('uq_payment_intents_idempotency', 'uq_refunds_idempotency');

COMMIT;
