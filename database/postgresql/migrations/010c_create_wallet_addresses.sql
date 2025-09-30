-- Minimal table required by views (customer_360_view, etc.)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.wallet_addresses (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v1(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  last_used_at   timestamptz,
  created_at     timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at     timestamptz DEFAULT CURRENT_TIMESTAMP
);

-- Make wallet values unique; and add handy indexes the views can use
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE c.conname = 'uq_wallet_addresses_wallet'
      AND r.relname = 'wallet_addresses'
      AND c.connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.wallet_addresses
      ADD CONSTRAINT uq_wallet_addresses_wallet UNIQUE (wallet_address);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user_id ON public.wallet_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_last_used_at ON public.wallet_addresses(last_used_at);
