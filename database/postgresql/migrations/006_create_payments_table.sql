-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration: Create Payments and Financial Tables
-- Version: 006
-- Description: Creates payment system tables with PCI compliance and encryption
-- Estimated execution time: < 3 seconds
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- UP Migration
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create payment_methods table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.payment_methods (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- User relationship
   user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
   
   -- Payment method details
   type VARCHAR(50) NOT NULL, -- credit_card, debit_card, bank_account, crypto, paypal
   provider VARCHAR(50), -- stripe, coinbase, paypal, etc.
   
   -- Card data (PCI compliant - tokenized)
   payment_token TEXT, -- Provider's token (encrypted)
   last_four VARCHAR(4), -- Last 4 digits only
   card_brand VARCHAR(20), -- visa, mastercard, amex, etc.
   card_type VARCHAR(20), -- credit, debit, prepaid
   
   -- Bank account data (tokenized)
   account_last_four VARCHAR(4),
   routing_number_encrypted TEXT, -- Encrypted
   account_type VARCHAR(20), -- checking, savings
   
   -- Crypto wallet data
   wallet_address VARCHAR(44),
   wallet_type VARCHAR(20), -- sol, eth, btc, usdc
   network VARCHAR(50), -- mainnet, testnet
   
   -- Billing information
   billing_name VARCHAR(200),
   billing_email VARCHAR(255),
   billing_phone VARCHAR(20),
   billing_address_line1 VARCHAR(255),
   billing_address_line2 VARCHAR(255),
   billing_city VARCHAR(100),
   billing_state VARCHAR(100),
   billing_postal_code VARCHAR(20),
   billing_country VARCHAR(2),
   
   -- Verification
   is_verified BOOLEAN DEFAULT FALSE,
   verified_at TIMESTAMP WITH TIME ZONE,
   verification_method VARCHAR(50),
   
   -- Expiration (for cards)
   expiry_month INTEGER,
   expiry_year INTEGER,
   
   -- Status and preferences
   is_active BOOLEAN DEFAULT TRUE,
   is_default BOOLEAN DEFAULT FALSE,
   nickname VARCHAR(100),
   
   -- Risk and compliance
   risk_score INTEGER DEFAULT 0,
   fraud_check_passed BOOLEAN,
   requires_3ds BOOLEAN DEFAULT TRUE,
   
   -- Provider data
   provider_customer_id TEXT, -- Encrypted
   provider_payment_method_id TEXT, -- Encrypted
   provider_metadata JSONB DEFAULT '{}', -- Encrypted
   
   -- Metadata
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   last_used_at TIMESTAMP WITH TIME ZONE,
   
   -- Constraints
   CONSTRAINT valid_payment_type CHECK (type IN (
       'credit_card', 'debit_card', 'bank_account', 'crypto', 
       'paypal', 'apple_pay', 'google_pay', 'other'
   )),
   CONSTRAINT valid_card_expiry CHECK (
       (type NOT IN ('credit_card', 'debit_card')) OR 
       (expiry_month BETWEEN 1 AND 12 AND expiry_year >= EXTRACT(YEAR FROM CURRENT_DATE))
   )
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create transactions table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.transactions (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   user_id UUID NOT NULL REFERENCES public.users(id),
   payment_method_id UUID REFERENCES public.payment_methods(id),
   order_id UUID, -- Future orders table reference
   
   -- Transaction details
   type VARCHAR(50) NOT NULL, -- payment, refund, payout, fee, adjustment
   status VARCHAR(50) NOT NULL DEFAULT 'pending',
   
   -- Financial amounts (all in smallest currency unit)
   amount BIGINT NOT NULL, -- In cents/wei/lamports
   currency VARCHAR(10) NOT NULL DEFAULT 'USD',
   exchange_rate NUMERIC(20, 10) DEFAULT 1.0,
   
   -- Fees breakdown
   platform_fee BIGINT DEFAULT 0,
   payment_processor_fee BIGINT DEFAULT 0,
   network_fee BIGINT DEFAULT 0, -- For crypto
   total_fee BIGINT GENERATED ALWAYS AS (platform_fee + payment_processor_fee + network_fee) STORED,
   
   -- Net amounts
   net_amount BIGINT GENERATED ALWAYS AS (amount - platform_fee - payment_processor_fee - network_fee) STORED,
   
   -- Payment provider data
   provider VARCHAR(50),
   provider_transaction_id TEXT, -- Encrypted
   provider_reference TEXT, -- Encrypted
   provider_response JSONB, -- Encrypted
   
   -- Blockchain data (for crypto payments)
   blockchain_network VARCHAR(50),
   transaction_hash VARCHAR(100),
   block_number BIGINT,
   confirmations INTEGER DEFAULT 0,
   
   -- 3D Secure / Authentication
   authentication_required BOOLEAN DEFAULT FALSE,
   authentication_status VARCHAR(50),
   authentication_response JSONB, -- Encrypted
   
   -- Risk assessment
   risk_score INTEGER,
   risk_factors JSONB DEFAULT '[]',
   fraud_detected BOOLEAN DEFAULT FALSE,
   
   -- Processing times
   initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   processing_started_at TIMESTAMP WITH TIME ZONE,
   completed_at TIMESTAMP WITH TIME ZONE,
   failed_at TIMESTAMP WITH TIME ZONE,
   
   -- Error handling
   error_code VARCHAR(50),
   error_message TEXT,
   retry_count INTEGER DEFAULT 0,
   
   -- Metadata
   description TEXT,
   metadata JSONB DEFAULT '{}',
   ip_address INET,
   user_agent TEXT,
   
   -- Idempotency
   idempotency_key VARCHAR(100) UNIQUE,
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_transaction_type CHECK (type IN (
       'payment', 'refund', 'partial_refund', 'payout', 
       'fee', 'adjustment', 'chargeback', 'dispute'
   )),
   CONSTRAINT valid_transaction_status CHECK (status IN (
       'pending', 'processing', 'requires_action', 'succeeded', 
       'failed', 'cancelled', 'reversed'
   )),
   CONSTRAINT positive_amount CHECK (amount > 0)
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create settlements table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.settlements (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Settlement details
   settlement_date DATE NOT NULL,
   provider VARCHAR(50) NOT NULL,
   provider_settlement_id TEXT, -- Encrypted
   
   -- Financial summary
   currency VARCHAR(10) NOT NULL DEFAULT 'USD',
   gross_amount BIGINT NOT NULL,
   fee_amount BIGINT NOT NULL,
   net_amount BIGINT NOT NULL,
   
   -- Transaction counts
   transaction_count INTEGER NOT NULL,
   refund_count INTEGER DEFAULT 0,
   chargeback_count INTEGER DEFAULT 0,
   
   -- Bank transfer details
   bank_account_id UUID REFERENCES public.payment_methods(id),
   transfer_initiated_at TIMESTAMP WITH TIME ZONE,
   transfer_completed_at TIMESTAMP WITH TIME ZONE,
   transfer_reference VARCHAR(100),
   
   -- Status
   status VARCHAR(50) NOT NULL DEFAULT 'pending',
   
   -- Breakdown by type
   payment_volume BIGINT DEFAULT 0,
   refund_volume BIGINT DEFAULT 0,
   fee_breakdown JSONB DEFAULT '{}',
   
   -- Reconciliation
   is_reconciled BOOLEAN DEFAULT FALSE,
   reconciled_at TIMESTAMP WITH TIME ZONE,
   reconciliation_notes TEXT,
   discrepancy_amount BIGINT DEFAULT 0,
   
   -- Documents
   report_url TEXT,
   invoice_url TEXT,
   
   -- Metadata
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_settlement_status CHECK (status IN (
       'pending', 'processing', 'paid', 'failed', 'reversed'
   ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create refunds table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.refunds (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   transaction_id UUID NOT NULL REFERENCES public.transactions(id),
   user_id UUID NOT NULL REFERENCES public.users(id),
   
   -- Refund details
   amount BIGINT NOT NULL,
   currency VARCHAR(10) NOT NULL,
   reason VARCHAR(100) NOT NULL,
   reason_details TEXT,
   
   -- Status
   status VARCHAR(50) NOT NULL DEFAULT 'pending',
   
   -- Provider data
   provider_refund_id TEXT, -- Encrypted
   provider_status VARCHAR(50),
   provider_response JSONB, -- Encrypted
   
   -- Processing
   requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   approved_at TIMESTAMP WITH TIME ZONE,
   processed_at TIMESTAMP WITH TIME ZONE,
   completed_at TIMESTAMP WITH TIME ZONE,
   
   -- Approval
   approved_by UUID REFERENCES public.users(id),
   approval_notes TEXT,
   auto_approved BOOLEAN DEFAULT FALSE,
   
   -- Fees
   refund_fee BIGINT DEFAULT 0,
   net_refund_amount BIGINT GENERATED ALWAYS AS (amount - refund_fee) STORED,
   
   -- Metadata
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_refund_status CHECK (status IN (
       'pending', 'approved', 'processing', 'completed', 
       'failed', 'cancelled', 'reversed'
   )),
   CONSTRAINT valid_refund_reason CHECK (reason IN (
       'duplicate', 'fraudulent', 'requested_by_customer',
       'event_cancelled', 'technical_issue', 'other'
   ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create subscriptions table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.subscriptions (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   user_id UUID NOT NULL REFERENCES public.users(id),
   payment_method_id UUID REFERENCES public.payment_methods(id),
   
   -- Subscription details
   plan_id VARCHAR(100) NOT NULL,
   plan_name VARCHAR(200),
   status VARCHAR(50) NOT NULL DEFAULT 'active',
   
   -- Pricing
   amount BIGINT NOT NULL, -- Per billing period
   currency VARCHAR(10) NOT NULL DEFAULT 'USD',
   interval VARCHAR(20) NOT NULL, -- daily, weekly, monthly, yearly
   interval_count INTEGER DEFAULT 1,
   
   -- Trial
   trial_start DATE,
   trial_end DATE,
   trial_days INTEGER DEFAULT 0,
   
   -- Billing periods
   current_period_start DATE NOT NULL,
   current_period_end DATE NOT NULL,
   billing_cycle_anchor DATE,
   
   -- Cancellation
   cancel_at_period_end BOOLEAN DEFAULT FALSE,
   cancelled_at TIMESTAMP WITH TIME ZONE,
   cancellation_reason VARCHAR(100),
   
   -- Provider data
   provider VARCHAR(50),
   provider_subscription_id TEXT, -- Encrypted
   provider_customer_id TEXT, -- Encrypted
   
   -- Usage-based billing
   usage_based BOOLEAN DEFAULT FALSE,
   usage_limit BIGINT,
   current_usage BIGINT DEFAULT 0,
   
   -- Discounts
   discount_percentage NUMERIC(5, 2),
   discount_amount BIGINT,
   discount_end_date DATE,
   
   -- Metadata
   metadata JSONB DEFAULT '{}',
   features JSONB DEFAULT '[]', -- Features included in plan
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_subscription_status CHECK (status IN (
       'trialing', 'active', 'past_due', 'cancelled', 
       'unpaid', 'incomplete', 'incomplete_expired', 'paused'
   )),
   CONSTRAINT valid_interval CHECK (interval IN (
       'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
   ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create invoices table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.invoices (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   user_id UUID NOT NULL REFERENCES public.users(id),
   subscription_id UUID REFERENCES public.subscriptions(id),
   
   -- Invoice details
   invoice_number VARCHAR(50) UNIQUE NOT NULL,
   status VARCHAR(50) NOT NULL DEFAULT 'draft',
   
   -- Dates
   issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
   due_date DATE NOT NULL,
   payment_date DATE,
   
   -- Amounts
   subtotal BIGINT NOT NULL,
   tax_amount BIGINT DEFAULT 0,
   discount_amount BIGINT DEFAULT 0,
   total_amount BIGINT GENERATED ALWAYS AS (subtotal + tax_amount - discount_amount) STORED,
   amount_paid BIGINT DEFAULT 0,
   amount_due BIGINT GENERATED ALWAYS AS (subtotal + tax_amount - discount_amount - amount_paid) STORED,
   
   -- Currency
   currency VARCHAR(10) NOT NULL DEFAULT 'USD',
   
   -- Line items stored as JSONB
   line_items JSONB NOT NULL DEFAULT '[]',
   /* Format:
   [{
       "description": "Premium Plan - Monthly",
       "quantity": 1,
       "unit_price": 9900,
       "amount": 9900,
       "tax_rate": 0.0875,
       "tax_amount": 866
   }]
   */
   
   -- Tax details
   tax_rate NUMERIC(5, 4),
   tax_id VARCHAR(50),
   
   -- Payment
   payment_method_id UUID REFERENCES public.payment_methods(id),
   transaction_id UUID REFERENCES public.transactions(id),
   
   -- Provider data
   provider_invoice_id TEXT, -- Encrypted
   provider_invoice_url TEXT,
   
   -- PDF storage
   pdf_url TEXT,
   pdf_generated_at TIMESTAMP WITH TIME ZONE,
   
   -- Metadata
   notes TEXT,
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_invoice_status CHECK (status IN (
       'draft', 'open', 'paid', 'void', 'uncollectible'
   ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create financial_reports table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.financial_reports (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Report details
   report_type VARCHAR(50) NOT NULL,
   report_period VARCHAR(20) NOT NULL, -- daily, weekly, monthly, quarterly, yearly
   period_start DATE NOT NULL,
   period_end DATE NOT NULL,
   
   -- Financial metrics
   gross_revenue BIGINT NOT NULL DEFAULT 0,
   refund_amount BIGINT NOT NULL DEFAULT 0,
   net_revenue BIGINT NOT NULL DEFAULT 0,
   
   -- Transaction metrics
   total_transactions INTEGER NOT NULL DEFAULT 0,
   successful_transactions INTEGER NOT NULL DEFAULT 0,
   failed_transactions INTEGER NOT NULL DEFAULT 0,
   
   -- Fee breakdown
   platform_fees BIGINT NOT NULL DEFAULT 0,
   processing_fees BIGINT NOT NULL DEFAULT 0,
   network_fees BIGINT NOT NULL DEFAULT 0,
   total_fees BIGINT GENERATED ALWAYS AS (platform_fees + processing_fees + network_fees) STORED,
   
   -- By payment method
   revenue_by_method JSONB DEFAULT '{}',
   transactions_by_method JSONB DEFAULT '{}',
   
   -- By currency
   revenue_by_currency JSONB DEFAULT '{}',
   
   -- Average metrics
   average_transaction_value BIGINT,
   average_fee_percentage NUMERIC(5, 4),
   
   -- Subscription metrics
   new_subscriptions INTEGER DEFAULT 0,
   cancelled_subscriptions INTEGER DEFAULT 0,
   mrr BIGINT DEFAULT 0, -- Monthly Recurring Revenue
   arr BIGINT DEFAULT 0, -- Annual Recurring Revenue
   
   -- Status
   status VARCHAR(50) NOT NULL DEFAULT 'pending',
   generated_at TIMESTAMP WITH TIME ZONE,
   
   -- Storage
   report_url TEXT,
   report_data JSONB DEFAULT '{}',
   
   -- Metadata
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_report_type CHECK (report_type IN (
       'revenue', 'transaction', 'settlement', 'tax', 
       'subscription', 'chargeback', 'comprehensive'
   )),
   CONSTRAINT valid_report_period CHECK (report_period IN (
       'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'
   )),
   CONSTRAINT valid_report_status CHECK (status IN (
       'pending', 'generating', 'completed', 'failed'
   ))
);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Indexes
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Payment methods indexes
CREATE INDEX idx_payment_methods_user_id ON public.payment_methods(user_id);
CREATE INDEX idx_payment_methods_type ON public.payment_methods(type);
CREATE INDEX idx_payment_methods_is_default ON public.payment_methods(user_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_payment_methods_active ON public.payment_methods(is_active) WHERE is_active = TRUE;

-- Transactions indexes
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX idx_transactions_provider ON public.transactions(provider);
CREATE INDEX idx_transactions_idempotency ON public.transactions(idempotency_key);

-- Settlements indexes
CREATE INDEX idx_settlements_date ON public.settlements(settlement_date);
CREATE INDEX idx_settlements_provider ON public.settlements(provider);
CREATE INDEX idx_settlements_status ON public.settlements(status);

-- Refunds indexes
CREATE INDEX idx_refunds_transaction_id ON public.refunds(transaction_id);
CREATE INDEX idx_refunds_user_id ON public.refunds(user_id);
CREATE INDEX idx_refunds_status ON public.refunds(status);
CREATE INDEX idx_refunds_created_at ON public.refunds(created_at);

-- Subscriptions indexes
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_current_period ON public.subscriptions(current_period_end);

-- Invoices indexes
CREATE INDEX idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX idx_invoices_subscription_id ON public.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX idx_invoices_number ON public.invoices(invoice_number);

-- Financial reports indexes
CREATE INDEX idx_financial_reports_type ON public.financial_reports(report_type);
CREATE INDEX idx_financial_reports_period ON public.financial_reports(period_start, period_end);
CREATE INDEX idx_financial_reports_status ON public.financial_reports(status);

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Triggers
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Update timestamp triggers
CREATE TRIGGER trigger_update_payment_methods_timestamp
   BEFORE UPDATE ON public.payment_methods
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_transactions_timestamp
   BEFORE UPDATE ON public.transactions
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_settlements_timestamp
   BEFORE UPDATE ON public.settlements
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_refunds_timestamp
   BEFORE UPDATE ON public.refunds
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_subscriptions_timestamp
   BEFORE UPDATE ON public.subscriptions
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_invoices_timestamp
   BEFORE UPDATE ON public.invoices
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_financial_reports_timestamp
   BEFORE UPDATE ON public.financial_reports
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();

-- Ensure only one default payment method per user
CREATE OR REPLACE FUNCTION ensure_one_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
   IF NEW.is_default = TRUE THEN
       UPDATE public.payment_methods
       SET is_default = FALSE
       WHERE user_id = NEW.user_id 
           AND id != NEW.id
           AND is_default = TRUE;
   END IF;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_one_default_payment
   BEFORE INSERT OR UPDATE OF is_default ON public.payment_methods
   FOR EACH ROW
   WHEN (NEW.is_default = TRUE)
   EXECUTE FUNCTION ensure_one_default_payment_method();

-- Generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
   year_month VARCHAR(6);
   sequence_num INTEGER;
BEGIN
   -- Format: INV-YYYYMM-0001
   year_month := TO_CHAR(CURRENT_DATE, 'YYYYMM');
   
   SELECT COUNT(*) + 1 INTO sequence_num
   FROM public.invoices
   WHERE invoice_number LIKE 'INV-' || year_month || '-%';
   
   NEW.invoice_number := 'INV-' || year_month || '-' || LPAD(sequence_num::TEXT, 4, '0');
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_invoice_number
   BEFORE INSERT ON public.invoices
   FOR EACH ROW
   WHEN (NEW.invoice_number IS NULL)
   EXECUTE FUNCTION generate_invoice_number();

-- Update subscription on successful payment
CREATE OR REPLACE FUNCTION update_subscription_on_payment()
RETURNS TRIGGER AS $$
BEGIN
   -- Only process subscription payments
   IF NEW.type = 'payment' AND NEW.status = 'succeeded' AND 
      EXISTS (SELECT 1 FROM public.invoices WHERE transaction_id = NEW.id AND subscription_id IS NOT NULL) THEN
       
       UPDATE public.subscriptions
       SET current_period_start = current_period_end,
           current_period_end = current_period_end + 
               CASE interval
                   WHEN 'daily' THEN INTERVAL '1 day' * interval_count
                   WHEN 'weekly' THEN INTERVAL '1 week' * interval_count
                   WHEN 'monthly' THEN INTERVAL '1 month' * interval_count
                   WHEN 'quarterly' THEN INTERVAL '3 months' * interval_count
                   WHEN 'yearly' THEN INTERVAL '1 year' * interval_count
               END
       WHERE id = (SELECT subscription_id FROM public.invoices WHERE transaction_id = NEW.id);
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_subscription_on_payment
   AFTER UPDATE OF status ON public.transactions
   FOR EACH ROW
   WHEN (NEW.status = 'succeeded' AND OLD.status != 'succeeded')
   EXECUTE FUNCTION update_subscription_on_payment();

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Functions
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Function to encrypt sensitive data
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data TEXT)
RETURNS TEXT AS $$
BEGIN
   -- In production, use proper encryption with pgcrypto
   -- This is a placeholder
   RETURN encode(data::bytea, 'base64');
END;
$$ LANGUAGE plpgsql;

-- Function to decrypt sensitive data
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data TEXT)
RETURNS TEXT AS $$
BEGIN
   -- In production, use proper decryption with pgcrypto
   -- This is a placeholder
   RETURN convert_from(decode(encrypted_data, 'base64'), 'UTF8');
END;
$$ LANGUAGE plpgsql;

-- Function to calculate transaction fees
CREATE OR REPLACE FUNCTION calculate_transaction_fees(
   amount BIGINT,
   payment_type VARCHAR,
   provider VARCHAR
) RETURNS TABLE (
   platform_fee BIGINT,
   processor_fee BIGINT,
   total_fee BIGINT
) AS $$
DECLARE
   platform_rate NUMERIC;
   processor_rate NUMERIC;
BEGIN
   -- Platform fee rates
   platform_rate := CASE payment_type
       WHEN 'credit_card' THEN 0.015  -- 1.5%
       WHEN 'crypto' THEN 0.01        -- 1%
       ELSE 0.02                      -- 2%
   END;
   
   -- Processor fee rates
   processor_rate := CASE provider
       WHEN 'stripe' THEN 0.029       -- 2.9%
       WHEN 'coinbase' THEN 0.01      -- 1%
       ELSE 0.025                     -- 2.5%
   END;
   
   platform_fee := ROUND(amount * platform_rate);
   processor_fee := ROUND(amount * processor_rate);
   total_fee := platform_fee + processor_fee;
   
   RETURN QUERY SELECT platform_fee, processor_fee, total_fee;
END;
$$ LANGUAGE plpgsql;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row Level Security
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Enable RLS on all tables
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;

-- Payment methods policies
CREATE POLICY payment_methods_own ON public.payment_methods
   FOR ALL
   USING (user_id = auth.user_id());

-- Transactions policies
CREATE POLICY transactions_own ON public.transactions
   FOR SELECT
   USING (user_id = auth.user_id());

-- Refunds policies
CREATE POLICY refunds_own ON public.refunds
   FOR SELECT
   USING (user_id = auth.user_id());

-- Subscriptions policies
CREATE POLICY subscriptions_own ON public.subscriptions
   FOR ALL
   USING (user_id = auth.user_id());

-- Invoices policies
CREATE POLICY invoices_own ON public.invoices
   FOR SELECT
   USING (user_id = auth.user_id());

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grants
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


GRANT SELECT, INSERT, UPDATE ON public.payment_methods TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.transactions TO tickettoken_app;
GRANT SELECT ON public.settlements TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.refunds TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE ON public.invoices TO tickettoken_app;
GRANT SELECT ON public.financial_reports TO tickettoken_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Migration Tracking
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


INSERT INTO public.schema_migrations (version, name) 
VALUES (6, '006_create_payments_table.sql')
ON CONFLICT (version) DO NOTHING;

-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Validation Queries
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


DO $$
DECLARE
   table_count INTEGER;
   index_count INTEGER;
   policy_count INTEGER;
BEGIN
   -- Count tables created
   SELECT COUNT(*) INTO table_count
   FROM information_schema.tables
   WHERE table_schema = 'public' 
   AND table_name IN ('payment_methods', 'transactions', 'settlements', 
                      'refunds', 'subscriptions', 'invoices', 'financial_reports');
   
   -- Count indexes created
   SELECT COUNT(*) INTO index_count
   FROM pg_indexes
   WHERE schemaname = 'public'
   AND tablename IN ('payment_methods', 'transactions', 'settlements', 
                     'refunds', 'subscriptions', 'invoices', 'financial_reports');
   
   -- Count RLS policies
   SELECT COUNT(*) INTO policy_count
   FROM pg_policies
   WHERE schemaname = 'public'
   AND tablename IN ('payment_methods', 'transactions', 'settlements', 
                     'refunds', 'subscriptions', 'invoices', 'financial_reports');
   
   RAISE NOTICE 'Payments migration completed: % tables, % indexes, % RLS policies', 
       table_count, index_count, policy_count;
END $$;


-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DOWN Migration (Commented Out)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/*

-- Drop RLS policies
DROP POLICY IF EXISTS payment_methods_own ON public.payment_methods;
DROP POLICY IF EXISTS transactions_own ON public.transactions;
DROP POLICY IF EXISTS refunds_own ON public.refunds;
DROP POLICY IF EXISTS subscriptions_own ON public.subscriptions;
DROP POLICY IF EXISTS invoices_own ON public.invoices;

-- Drop functions
DROP FUNCTION IF EXISTS calculate_transaction_fees(BIGINT, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS decrypt_sensitive_data(TEXT);
DROP FUNCTION IF EXISTS encrypt_sensitive_data(TEXT);
DROP FUNCTION IF EXISTS update_subscription_on_payment();
DROP FUNCTION IF EXISTS generate_invoice_number();
DROP FUNCTION IF EXISTS ensure_one_default_payment_method();

-- Drop tables in correct order
DROP TABLE IF EXISTS public.financial_reports CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.refunds CASCADE;
DROP TABLE IF EXISTS public.settlements CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;

-- Remove migration record
DELETE FROM public.schema_migrations WHERE version = 6;

*/
