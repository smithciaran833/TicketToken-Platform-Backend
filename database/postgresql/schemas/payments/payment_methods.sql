-- TicketToken Payment Methods Schema
-- This table stores user payment methods with PCI DSS compliance considerations
-- IMPORTANT: This schema stores only tokenized payment data, never raw card numbers
-- All sensitive payment data is tokenized through payment providers (Stripe, etc.)
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for additional security functions if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS payment_methods CASCADE;

-- Create the payment_methods table
CREATE TABLE payment_methods (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign key to users table
    user_id UUID NOT NULL,  -- User who owns this payment method
    
    -- Payment type categorization
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN (
        'credit_card',     -- Credit card (tokenized)
        'debit_card',      -- Debit card (tokenized)
        'bank_account',    -- Bank account (ACH/SEPA)
        'crypto_wallet',   -- Cryptocurrency wallet
        'apple_pay',       -- Apple Pay
        'google_pay',      -- Google Pay
        'paypal',          -- PayPal account
        'venmo',           -- Venmo account
        'cashapp',         -- Cash App
        'other'            -- Other payment methods
    )),
    
    -- Provider information (tokenized references only)
    stripe_payment_method_id VARCHAR(255),  -- Stripe PaymentMethod ID (pm_xxx)
    stripe_customer_id VARCHAR(255),  -- Stripe Customer ID (cus_xxx)
    provider_name VARCHAR(50) CHECK (provider_name IN (
        'stripe', 'square', 'paypal', 'adyen', 'braintree', 'coinbase', 'other'
    )),
    provider_metadata JSONB DEFAULT '{}'::jsonb,  -- Provider-specific metadata
    
    -- Card details (PCI compliant - no full card numbers)
    last_four_digits VARCHAR(4),  -- Last 4 digits only
    brand VARCHAR(50),  -- Card brand (visa, mastercard, amex, discover, etc.)
    funding_type VARCHAR(20) CHECK (funding_type IN ('credit', 'debit', 'prepaid', 'unknown')),
    exp_month INTEGER CHECK (exp_month >= 1 AND exp_month <= 12),  -- Expiration month
    exp_year INTEGER CHECK (exp_year >= 2020 AND exp_year <= 2099),  -- Expiration year
    country VARCHAR(2),  -- ISO 3166-1 alpha-2 country code
    postal_code VARCHAR(20),  -- Billing postal code
    
    -- Bank account details (tokenized)
    bank_name VARCHAR(100),  -- Bank name for display
    bank_last_four VARCHAR(4),  -- Last 4 digits of account
    bank_routing_last_four VARCHAR(4),  -- Last 4 of routing number
    bank_account_type VARCHAR(20) CHECK (bank_account_type IN ('checking', 'savings', 'business')),
    
    -- Security and verification fields
    fingerprint VARCHAR(255),  -- Unique fingerprint for duplicate detection
    is_verified BOOLEAN DEFAULT FALSE,  -- Whether payment method is verified
    verification_date TIMESTAMP WITH TIME ZONE,  -- When verification completed
    verification_method VARCHAR(50),  -- How it was verified (micro-deposits, instant, etc.)
    requires_authentication BOOLEAN DEFAULT FALSE,  -- Requires 3DS or additional auth
    
    -- Risk assessment
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),  -- Risk score 0-100
    risk_factors JSONB DEFAULT '[]'::jsonb,  -- Array of risk factors
    fraud_detected BOOLEAN DEFAULT FALSE,  -- Fraud detection flag
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN (
        'pending',    -- Awaiting verification
        'active',     -- Ready for use
        'expired',    -- Card/method expired
        'invalid',    -- Failed verification or invalid
        'suspended',  -- Temporarily suspended
        'deleted'     -- Soft deleted by user
    )),
    status_reason TEXT,  -- Reason for current status
    
    -- Usage preferences and statistics
    is_default BOOLEAN DEFAULT FALSE,  -- User's default payment method
    is_backup BOOLEAN DEFAULT FALSE,  -- Backup payment method
    usage_count INTEGER DEFAULT 0,  -- Number of successful transactions
    failed_attempts INTEGER DEFAULT 0,  -- Number of failed payment attempts
    last_used_at TIMESTAMP WITH TIME ZONE,  -- Last successful use
    last_failed_at TIMESTAMP WITH TIME ZONE,  -- Last failed attempt
    
    -- Cryptocurrency wallet data
    wallet_address VARCHAR(255),  -- Crypto wallet address
    wallet_type VARCHAR(50),  -- Wallet type (metamask, phantom, ledger, etc.)
    chain_id INTEGER,  -- Blockchain chain ID
    chain_name VARCHAR(50),  -- Blockchain name (ethereum, solana, polygon, etc.)
    wallet_verified BOOLEAN DEFAULT FALSE,  -- Wallet ownership verified
    wallet_verification_signature TEXT,  -- Signature proving ownership
    
    -- Digital wallet metadata
    device_id VARCHAR(255),  -- Device ID for Apple/Google Pay
    device_name VARCHAR(100),  -- Device name for user recognition
    wallet_last_four VARCHAR(4),  -- Last 4 of device account number
    
    -- Billing information (PCI compliant)
    billing_name VARCHAR(255),  -- Name on payment method
    billing_email VARCHAR(255),  -- Billing email if different
    billing_phone VARCHAR(50),  -- Billing phone if required
    billing_address_line1 VARCHAR(255),  -- Street address
    billing_address_line2 VARCHAR(255),  -- Apartment, suite, etc.
    billing_city VARCHAR(100),  -- City
    billing_state VARCHAR(100),  -- State/Province
    billing_country VARCHAR(2),  -- ISO country code
    
    -- Metadata and notes
    nickname VARCHAR(100),  -- User-friendly name for the payment method
    notes TEXT,  -- Internal notes (never shown to user)
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional metadata
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,  -- Soft delete timestamp
    expires_at TIMESTAMP WITH TIME ZONE,  -- When the payment method expires
    
    -- Foreign key constraints
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Ensure only one default payment method per user
    CONSTRAINT unique_default_per_user UNIQUE (user_id, is_default) WHERE is_default = TRUE AND deleted_at IS NULL,
    
    -- Ensure required fields based on payment type
    CONSTRAINT chk_card_fields CHECK (
        (payment_type NOT IN ('credit_card', 'debit_card')) OR 
        (last_four_digits IS NOT NULL AND brand IS NOT NULL AND exp_month IS NOT NULL AND exp_year IS NOT NULL)
    ),
    
    -- Ensure crypto wallet fields are set together
    CONSTRAINT chk_crypto_fields CHECK (
        (payment_type != 'crypto_wallet') OR 
        (wallet_address IS NOT NULL AND chain_name IS NOT NULL)
    ),
    
    -- Ensure bank account fields are set together
    CONSTRAINT chk_bank_fields CHECK (
        (payment_type != 'bank_account') OR 
        (bank_last_four IS NOT NULL AND bank_name IS NOT NULL)
    ),
    
    -- Ensure provider information is set
    CONSTRAINT chk_provider_info CHECK (
        (payment_type = 'crypto_wallet') OR 
        (stripe_payment_method_id IS NOT NULL OR provider_name IS NOT NULL)
    ),
    
    -- Ensure expiration date is valid
    CONSTRAINT chk_expiration_valid CHECK (
        (exp_year IS NULL AND exp_month IS NULL) OR
        (exp_year > 2020 AND exp_month >= 1 AND exp_month <= 12)
    )
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_methods_stripe_pm ON payment_methods(stripe_payment_method_id) WHERE stripe_payment_method_id IS NOT NULL;
CREATE INDEX idx_payment_methods_stripe_customer ON payment_methods(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Status and usage indexes
CREATE INDEX idx_payment_methods_status ON payment_methods(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_methods_default ON payment_methods(user_id, is_default) WHERE is_default = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_payment_methods_active ON payment_methods(user_id, status) WHERE status = 'active' AND deleted_at IS NULL;

-- Payment type indexes
CREATE INDEX idx_payment_methods_type ON payment_methods(payment_type, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_methods_cards ON payment_methods(user_id, payment_type) 
    WHERE payment_type IN ('credit_card', 'debit_card') AND deleted_at IS NULL;

-- Expiration monitoring
CREATE INDEX idx_payment_methods_expiring ON payment_methods(exp_year, exp_month, status) 
    WHERE status = 'active' AND exp_year IS NOT NULL;
CREATE INDEX idx_payment_methods_expires_at ON payment_methods(expires_at) 
    WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

-- Security and fraud monitoring
CREATE INDEX idx_payment_methods_fingerprint ON payment_methods(fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX idx_payment_methods_fraud ON payment_methods(fraud_detected, user_id) WHERE fraud_detected = TRUE;
CREATE INDEX idx_payment_methods_risk ON payment_methods(risk_score) WHERE risk_score > 50;

-- Crypto wallet indexes
CREATE INDEX idx_payment_methods_wallet ON payment_methods(wallet_address, chain_name) 
    WHERE payment_type = 'crypto_wallet' AND deleted_at IS NULL;

-- Usage tracking
CREATE INDEX idx_payment_methods_last_used ON payment_methods(user_id, last_used_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_methods_usage_count ON payment_methods(usage_count DESC) WHERE deleted_at IS NULL;

-- Soft delete index
CREATE INDEX idx_payment_methods_deleted ON payment_methods(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_methods_updated_at 
    BEFORE UPDATE ON payment_methods 
    FOR EACH ROW 
    EXECUTE FUNCTION update_payment_methods_updated_at();

-- Create function to manage default payment methods
CREATE OR REPLACE FUNCTION manage_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    -- If setting a new default, unset other defaults for the user
    IF NEW.is_default = TRUE AND NEW.deleted_at IS NULL THEN
        UPDATE payment_methods 
        SET is_default = FALSE 
        WHERE user_id = NEW.user_id 
        AND id != NEW.id 
        AND deleted_at IS NULL;
    END IF;
    
    -- Check card expiration and update status
    IF NEW.payment_type IN ('credit_card', 'debit_card') AND NEW.exp_year IS NOT NULL AND NEW.exp_month IS NOT NULL THEN
        IF (NEW.exp_year < EXTRACT(YEAR FROM CURRENT_DATE)) OR 
           (NEW.exp_year = EXTRACT(YEAR FROM CURRENT_DATE) AND NEW.exp_month < EXTRACT(MONTH FROM CURRENT_DATE)) THEN
            NEW.status = 'expired';
            NEW.status_reason = 'Card expired';
        END IF;
    END IF;
    
    -- Increment usage count on successful use
    IF NEW.last_used_at IS NOT NULL AND OLD.last_used_at IS DISTINCT FROM NEW.last_used_at THEN
        NEW.usage_count = COALESCE(OLD.usage_count, 0) + 1;
    END IF;
    
    -- Increment failed attempts on failure
    IF NEW.last_failed_at IS NOT NULL AND OLD.last_failed_at IS DISTINCT FROM NEW.last_failed_at THEN
        NEW.failed_attempts = COALESCE(OLD.failed_attempts, 0) + 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manage_default_payment_method_trigger
    BEFORE INSERT OR UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION manage_default_payment_method();

-- Add table comments
COMMENT ON TABLE payment_methods IS 'Stores user payment methods in a PCI-compliant manner. Only tokenized payment data is stored, never raw card numbers. All sensitive data is handled by certified payment providers.';

-- Add column comments
COMMENT ON COLUMN payment_methods.id IS 'Unique identifier for the payment method (UUID)';
COMMENT ON COLUMN payment_methods.user_id IS 'Foreign key to users table - payment method owner';
COMMENT ON COLUMN payment_methods.payment_type IS 'Type of payment method';
COMMENT ON COLUMN payment_methods.stripe_payment_method_id IS 'Stripe PaymentMethod ID - tokenized reference only';
COMMENT ON COLUMN payment_methods.stripe_customer_id IS 'Stripe Customer ID for this user';
COMMENT ON COLUMN payment_methods.provider_name IS 'Payment provider handling this method';
COMMENT ON COLUMN payment_methods.provider_metadata IS 'Provider-specific data (no sensitive info)';
COMMENT ON COLUMN payment_methods.last_four_digits IS 'Last 4 digits of card number (PCI compliant)';
COMMENT ON COLUMN payment_methods.brand IS 'Card brand (visa, mastercard, etc.)';
COMMENT ON COLUMN payment_methods.funding_type IS 'Card funding type (credit, debit, prepaid)';
COMMENT ON COLUMN payment_methods.exp_month IS 'Card expiration month (1-12)';
COMMENT ON COLUMN payment_methods.exp_year IS 'Card expiration year (4 digits)';
COMMENT ON COLUMN payment_methods.country IS 'Card issuing country (ISO 3166-1 alpha-2)';
COMMENT ON COLUMN payment_methods.postal_code IS 'Billing postal code for AVS';
COMMENT ON COLUMN payment_methods.bank_name IS 'Bank name for display purposes';
COMMENT ON COLUMN payment_methods.bank_last_four IS 'Last 4 digits of bank account';
COMMENT ON COLUMN payment_methods.bank_routing_last_four IS 'Last 4 of routing number for verification';
COMMENT ON COLUMN payment_methods.bank_account_type IS 'Type of bank account';
COMMENT ON COLUMN payment_methods.fingerprint IS 'Unique fingerprint for duplicate card detection';
COMMENT ON COLUMN payment_methods.is_verified IS 'Whether payment method passed verification';
COMMENT ON COLUMN payment_methods.verification_date IS 'When verification was completed';
COMMENT ON COLUMN payment_methods.verification_method IS 'How verification was performed';
COMMENT ON COLUMN payment_methods.requires_authentication IS 'Whether 3DS or additional auth required';
COMMENT ON COLUMN payment_methods.risk_score IS 'Risk assessment score 0-100';
COMMENT ON COLUMN payment_methods.risk_factors IS 'Detailed risk factors as JSON array';
COMMENT ON COLUMN payment_methods.fraud_detected IS 'Whether fraud was detected';
COMMENT ON COLUMN payment_methods.status IS 'Current status of payment method';
COMMENT ON COLUMN payment_methods.status_reason IS 'Explanation of current status';
COMMENT ON COLUMN payment_methods.is_default IS 'User default payment method';
COMMENT ON COLUMN payment_methods.is_backup IS 'Backup payment method flag';
COMMENT ON COLUMN payment_methods.usage_count IS 'Number of successful uses';
COMMENT ON COLUMN payment_methods.failed_attempts IS 'Number of failed payment attempts';
COMMENT ON COLUMN payment_methods.last_used_at IS 'Last successful transaction timestamp';
COMMENT ON COLUMN payment_methods.last_failed_at IS 'Last failed transaction timestamp';
COMMENT ON COLUMN payment_methods.wallet_address IS 'Cryptocurrency wallet address';
COMMENT ON COLUMN payment_methods.wallet_type IS 'Type of crypto wallet';
COMMENT ON COLUMN payment_methods.chain_id IS 'Blockchain network chain ID';
COMMENT ON COLUMN payment_methods.chain_name IS 'Blockchain network name';
COMMENT ON COLUMN payment_methods.wallet_verified IS 'Whether wallet ownership is verified';
COMMENT ON COLUMN payment_methods.wallet_verification_signature IS 'Signature proving wallet ownership';
COMMENT ON COLUMN payment_methods.device_id IS 'Device ID for digital wallets';
COMMENT ON COLUMN payment_methods.device_name IS 'Device name for user recognition';
COMMENT ON COLUMN payment_methods.wallet_last_four IS 'Last 4 of device account number';
COMMENT ON COLUMN payment_methods.billing_name IS 'Name associated with payment method';
COMMENT ON COLUMN payment_methods.billing_email IS 'Billing email address';
COMMENT ON COLUMN payment_methods.billing_phone IS 'Billing phone number';
COMMENT ON COLUMN payment_methods.billing_address_line1 IS 'Billing street address';
COMMENT ON COLUMN payment_methods.billing_address_line2 IS 'Billing address line 2';
COMMENT ON COLUMN payment_methods.billing_city IS 'Billing city';
COMMENT ON COLUMN payment_methods.billing_state IS 'Billing state/province';
COMMENT ON COLUMN payment_methods.billing_country IS 'Billing country (ISO code)';
COMMENT ON COLUMN payment_methods.nickname IS 'User-friendly name for payment method';
COMMENT ON COLUMN payment_methods.notes IS 'Internal notes - never shown to users';
COMMENT ON COLUMN payment_methods.metadata IS 'Additional metadata as JSONB';
COMMENT ON COLUMN payment_methods.created_at IS 'When payment method was added';
COMMENT ON COLUMN payment_methods.updated_at IS 'Last update timestamp';
COMMENT ON COLUMN payment_methods.deleted_at IS 'Soft delete timestamp';
COMMENT ON COLUMN payment_methods.expires_at IS 'When payment method expires';

-- Sample data for testing (commented out)
/*
-- Credit card payment method
INSERT INTO payment_methods (
    user_id, payment_type, stripe_payment_method_id,
    last_four_digits, brand, exp_month, exp_year,
    country, is_verified, is_default, billing_name
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    'credit_card',
    'pm_1234567890abcdef',
    '4242',
    'visa',
    12,
    2025,
    'US',
    TRUE,
    TRUE,
    'John Doe'
);

-- Crypto wallet payment method
INSERT INTO payment_methods (
    user_id, payment_type, wallet_address,
    wallet_type, chain_name, chain_id,
    wallet_verified, is_verified, nickname
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    'crypto_wallet',
    '0x742d35Cc6634C0532925a3b844Bc9e7595f8b89a',
    'metamask',
    'ethereum',
    1,
    TRUE,
    TRUE,
    'My ETH Wallet'
);
*/

-- PCI Compliance Notes:
-- 1. NEVER store full card numbers, CVV, or PIN data
-- 2. Use tokenization through certified payment providers
-- 3. Implement proper access controls and encryption
-- 4. Regular security audits and PCI compliance validation
-- 5. Secure deletion of payment methods with audit trails

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant_id ON payment_methods(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant_created ON payment_methods(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- 6. Monitor for suspicious activity and fraud patterns
