-- Migration: Fix transactions table idempotency constraint
-- Phase 1.2 Task 3: Database-Level Uniqueness (transactions table)

BEGIN;

-- Add tenant_id if it doesn't exist
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Add foreign key to tenants
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_tenant 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  ON DELETE CASCADE;

-- Drop old constraint
DROP INDEX IF EXISTS uq_transactions_idempotency;

-- Convert idempotency_key to UUID type
ALTER TABLE transactions
  ALTER COLUMN idempotency_key TYPE UUID USING idempotency_key::uuid;

-- Create new tenant-scoped constraint
CREATE UNIQUE INDEX uq_transactions_idempotency
  ON transactions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX uq_transactions_idempotency IS 
  'Prevents duplicate transactions at database level, scoped by tenant';

-- Add missing columns that exist in payment_intents
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS venue_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS platform_fee INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venue_payout INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gas_fee_paid INTEGER,
  ADD COLUMN IF NOT EXISTS tax_amount INTEGER,
  ADD COLUMN IF NOT EXISTS total_amount INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Verify
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'transactions' AND indexname = 'uq_transactions_idempotency';

COMMIT;
