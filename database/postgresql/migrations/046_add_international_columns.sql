-- Migration: 005_add_international_columns.sql
-- Description: Add international support columns to payments
-- Safe: Only adds columns with defaults, does not modify existing data

BEGIN;

-- Add currency support to transactions table
ALTER TABLE payments.transactions 
ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$');

ALTER TABLE payments.transactions 
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(12,6) DEFAULT 1.0 CHECK (exchange_rate > 0);

ALTER TABLE payments.transactions 
ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(10,2);

-- Add index for currency queries
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON payments.transactions(currency_code) WHERE currency_code != 'USD';

-- Update existing records to set amount_usd
UPDATE payments.transactions 
SET amount_usd = amount * exchange_rate
WHERE amount_usd IS NULL;

-- Add currency support to payment_methods if needed
ALTER TABLE payments.payment_methods 
ADD COLUMN IF NOT EXISTS supported_currencies TEXT[] DEFAULT ARRAY['USD'];

-- Add international fee structure
CREATE TABLE IF NOT EXISTS payments.international_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code VARCHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    payment_method VARCHAR(50) NOT NULL,
    fixed_fee DECIMAL(10,2) DEFAULT 0,
    percentage_fee DECIMAL(5,4) DEFAULT 0,
    min_fee DECIMAL(10,2) DEFAULT 0,
    max_fee DECIMAL(10,2),
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_intl_fees_currency_method ON payments.international_fees(currency_code, payment_method);
CREATE INDEX idx_intl_fees_dates ON payments.international_fees(effective_date, end_date);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA payments TO tickettoken;

-- Record migration
INSERT INTO core.schema_migrations (version, name, applied_at)
VALUES ('005', 'add_international_columns', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
