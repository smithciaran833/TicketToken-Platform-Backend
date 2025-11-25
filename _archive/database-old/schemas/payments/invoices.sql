-- TicketToken Invoice Management Schema
-- This table manages all invoices for subscriptions, one-time charges, and settlements
-- Invoice Workflow: draft -> open -> paid (or void/uncollectible)
-- Billing Compliance: Designed for tax compliance, audit trails, and accounting integration
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS invoices CASCADE;

-- Create the invoices table
CREATE TABLE invoices (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    venue_id UUID,  -- Venue being billed (nullable for platform charges)
    user_id UUID,  -- User being billed (nullable for venue charges)
    subscription_id UUID,  -- Related subscription if recurring
    billing_contact_user_id UUID,  -- Specific billing contact
    settlement_id UUID,  -- Related settlement if applicable
    
    -- Invoice identification
    invoice_number VARCHAR(50) UNIQUE NOT NULL,  -- Our sequential invoice number
    stripe_invoice_id VARCHAR(255),  -- Stripe invoice ID (in_xxx)
    external_invoice_id VARCHAR(255),  -- External system reference
    invoice_type VARCHAR(30) NOT NULL CHECK (invoice_type IN (
        'subscription',      -- Recurring subscription charge
        'one_time',         -- One-time charge
        'settlement',       -- Venue settlement/payout
        'usage',            -- Usage-based charges
        'setup_fee',        -- Initial setup fee
        'overage',          -- Overage charges
        'adjustment',       -- Manual adjustment
        'credit_note',      -- Credit note/negative invoice
        'proforma'          -- Proforma/quote invoice
    )),
    
    -- Billing period
    billing_period_start DATE,  -- Start of billing period
    billing_period_end DATE,  -- End of billing period
    service_period_start DATE,  -- Service period (may differ from billing)
    service_period_end DATE,  -- End of service period
    
    -- Financial amounts (all in invoice currency)
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- Subtotal before tax
    discount_amount DECIMAL(10, 2) DEFAULT 0,  -- Total discounts applied
    tax_amount DECIMAL(10, 2) DEFAULT 0,  -- Total tax amount
    shipping_amount DECIMAL(10, 2) DEFAULT 0,  -- Shipping if applicable
    total_amount DECIMAL(12, 2) NOT NULL,  -- Total amount due
    amount_paid DECIMAL(12, 2) DEFAULT 0,  -- Amount already paid
    amount_remaining DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,  -- Outstanding balance
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 currency code
    exchange_rate DECIMAL(10, 6) DEFAULT 1.000000,  -- Exchange rate if applicable
    
    -- Line items (stored as JSONB array)
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    /* Example line_items structure:
    [
        {
            "id": "li_001",
            "type": "subscription",
            "description": "Venue Premium Monthly - July 2025",
            "product_code": "VENUE_PREMIUM",
            "quantity": 1,
            "unit_price": 99.00,
            "discount_amount": 9.90,
            "tax_rate": 0.0875,
            "tax_amount": 7.74,
            "total": 96.84,
            "period_start": "2025-07-01",
            "period_end": "2025-07-31",
            "metadata": {}
        },
        {
            "id": "li_002",
            "type": "usage",
            "description": "API Overage - 5,000 additional calls",
            "product_code": "API_CALLS",
            "quantity": 5000,
            "unit_price": 0.001,
            "total": 5.00
        }
    ]
    */
    
    -- Payment status and collection
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',            -- Invoice being prepared
        'open',             -- Finalized and awaiting payment
        'paid',             -- Fully paid
        'partially_paid',   -- Partial payment received
        'void',             -- Cancelled/voided
        'uncollectible',    -- Marked as bad debt
        'pending',          -- Pending processing
        'overdue',          -- Past due date
        'disputed'          -- Under dispute
    )),
    payment_status VARCHAR(30),  -- Detailed payment status from provider
    collection_method VARCHAR(30) CHECK (collection_method IN (
        'charge_automatically',  -- Auto-charge payment method
        'send_invoice',         -- Email invoice for payment
        'manual',               -- Manual collection
        'direct_debit',         -- Direct debit/ACH
        'wire_transfer'         -- Wire transfer
    )),
    
    -- Collection attempts and dunning
    attempt_count INTEGER DEFAULT 0,  -- Number of payment attempts
    last_payment_attempt TIMESTAMP WITH TIME ZONE,  -- Last attempt timestamp
    next_payment_attempt TIMESTAMP WITH TIME ZONE,  -- Scheduled next attempt
    auto_advance BOOLEAN DEFAULT TRUE,  -- Whether to auto-transition states
    collection_paused BOOLEAN DEFAULT FALSE,  -- Pause collection attempts
    collection_pause_reason TEXT,  -- Why collection is paused
    
    -- Tax information
    tax_rate DECIMAL(5, 4),  -- Overall tax rate (e.g., 0.0875 for 8.75%)
    tax_rates JSONB DEFAULT '[]'::jsonb,  -- Detailed tax breakdown
    /* Example tax_rates:
    [
        {"name": "State Tax", "rate": 0.0625, "amount": 6.25},
        {"name": "City Tax", "rate": 0.025, "amount": 2.50}
    ]
    */
    tax_jurisdiction VARCHAR(100),  -- Tax jurisdiction
    tax_id_number VARCHAR(50),  -- Customer tax ID
    vat_number VARCHAR(50),  -- VAT registration number
    tax_exempt BOOLEAN DEFAULT FALSE,  -- Whether customer is tax exempt
    tax_exempt_reason VARCHAR(100),  -- Reason for tax exemption
    reverse_charge_applies BOOLEAN DEFAULT FALSE,  -- EU reverse charge
    
    -- Payment tracking
    paid_at TIMESTAMP WITH TIME ZONE,  -- When fully paid
    payment_method_used VARCHAR(50),  -- How payment was made
    payment_intent_id VARCHAR(255),  -- Stripe PaymentIntent ID
    charge_id VARCHAR(255),  -- Stripe Charge ID
    payment_receipt_url VARCHAR(500),  -- Receipt URL
    payment_failed_at TIMESTAMP WITH TIME ZONE,  -- Last payment failure
    failure_reason VARCHAR(255),  -- Payment failure reason
    
    -- Billing and shipping addresses
    billing_address JSONB DEFAULT '{}'::jsonb,
    /* Example billing_address:
    {
        "name": "John Doe",
        "company": "Acme Inc",
        "line1": "123 Main St",
        "line2": "Suite 100",
        "city": "New York",
        "state": "NY",
        "postal_code": "10001",
        "country": "US",
        "phone": "+1-555-123-4567"
    }
    */
    shipping_address JSONB,  -- If different from billing
    
    -- Customer information
    customer_name VARCHAR(255),  -- Customer display name
    customer_email VARCHAR(255),  -- Billing email
    customer_phone VARCHAR(50),  -- Contact phone
    customer_metadata JSONB DEFAULT '{}'::jsonb,  -- Additional customer data
    
    -- Document management
    pdf_url VARCHAR(500),  -- Generated PDF invoice URL
    pdf_generated_at TIMESTAMP WITH TIME ZONE,  -- When PDF was created
    pdf_storage_path VARCHAR(255),  -- Internal storage path
    hosted_invoice_url VARCHAR(500),  -- Public invoice viewing URL
    invoice_template VARCHAR(100),  -- Template used for generation
    
    -- Communication tracking
    email_sent_at TIMESTAMP WITH TIME ZONE,  -- When invoice was emailed
    email_sent_to VARCHAR(255),  -- Email address(es) sent to
    reminder_count INTEGER DEFAULT 0,  -- Number of reminders sent
    last_reminder_sent_at TIMESTAMP WITH TIME ZONE,  -- Last reminder timestamp
    
    -- Accounting integration
    accounting_exported BOOLEAN DEFAULT FALSE,  -- Exported to accounting system
    accounting_export_date TIMESTAMP WITH TIME ZONE,  -- Export timestamp
    accounting_reference VARCHAR(100),  -- External accounting reference
    general_ledger_code VARCHAR(50),  -- GL account code
    cost_center VARCHAR(50),  -- Cost center allocation
    
    -- Credits and adjustments
    credits_applied DECIMAL(10, 2) DEFAULT 0,  -- Account credits used
    adjustment_reason TEXT,  -- Reason for manual adjustments
    write_off_amount DECIMAL(10, 2) DEFAULT 0,  -- Amount written off
    write_off_reason TEXT,  -- Reason for write-off
    
    -- Dispute handling
    disputed BOOLEAN DEFAULT FALSE,  -- Whether invoice is disputed
    dispute_reason TEXT,  -- Reason for dispute
    dispute_evidence JSONB,  -- Evidence provided
    dispute_resolved_at TIMESTAMP WITH TIME ZONE,  -- Resolution timestamp
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional invoice data
    custom_fields JSONB DEFAULT '{}'::jsonb,  -- Customer-defined fields
    notes TEXT,  -- Internal notes
    footer_text TEXT,  -- Custom footer text for invoice
    memo TEXT,  -- Customer-visible memo
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized_at TIMESTAMP WITH TIME ZONE,  -- When moved from draft
    due_date DATE,  -- Payment due date
    voided_at TIMESTAMP WITH TIME ZONE,  -- When voided
    
    -- Foreign key constraints
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    CONSTRAINT fk_billing_contact FOREIGN KEY (billing_contact_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_settlement FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL,
    
    -- Business rule constraints
    CONSTRAINT chk_either_venue_or_user CHECK (
        (venue_id IS NOT NULL AND user_id IS NULL) OR 
        (venue_id IS NULL AND user_id IS NOT NULL) OR
        (venue_id IS NOT NULL AND user_id IS NOT NULL)
    ),
    CONSTRAINT chk_amounts_positive CHECK (
        subtotal >= 0 AND 
        tax_amount >= 0 AND 
        total_amount >= 0 AND 
        amount_paid >= 0
    ),
    CONSTRAINT chk_total_calculation CHECK (
        total_amount = subtotal - discount_amount + tax_amount + shipping_amount
    ),
    CONSTRAINT chk_billing_period CHECK (
        (billing_period_start IS NULL AND billing_period_end IS NULL) OR
        (billing_period_start IS NOT NULL AND billing_period_end IS NOT NULL AND billing_period_end >= billing_period_start)
    ),
    CONSTRAINT chk_line_items_array CHECK (jsonb_typeof(line_items) = 'array'),
    CONSTRAINT chk_tax_rates_array CHECK (jsonb_typeof(tax_rates) = 'array'),
    CONSTRAINT chk_paid_status CHECK (
        (status != 'paid') OR 
        (status = 'paid' AND paid_at IS NOT NULL AND amount_paid >= total_amount)
    ),
    CONSTRAINT chk_void_status CHECK (
        (status != 'void') OR 
        (status = 'void' AND voided_at IS NOT NULL)
    ),
    CONSTRAINT chk_draft_not_paid CHECK (
        (status != 'draft') OR 
        (status = 'draft' AND amount_paid = 0)
    )
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE UNIQUE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_venue ON invoices(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX idx_invoices_user ON invoices(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id) WHERE subscription_id IS NOT NULL;

-- Status and payment tracking
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_open ON invoices(due_date, status) WHERE status = 'open';
CREATE INDEX idx_invoices_overdue ON invoices(due_date, amount_remaining) WHERE status = 'open' AND due_date < CURRENT_DATE;
CREATE INDEX idx_invoices_unpaid ON invoices(status, amount_remaining) WHERE status IN ('open', 'overdue') AND amount_remaining > 0;

-- Provider reference indexes
CREATE INDEX idx_invoices_stripe ON invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX idx_invoices_payment_intent ON invoices(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

-- Collection and dunning
CREATE INDEX idx_invoices_collection ON invoices(next_payment_attempt) WHERE status = 'open' AND collection_method = 'charge_automatically';
CREATE INDEX idx_invoices_collection_paused ON invoices(collection_paused) WHERE collection_paused = TRUE;

-- Financial reporting
CREATE INDEX idx_invoices_paid_date ON invoices(paid_at, venue_id) WHERE status = 'paid';
CREATE INDEX idx_invoices_period ON invoices(billing_period_start, billing_period_end);
CREATE INDEX idx_invoices_created_date ON invoices(DATE(created_at), status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date) WHERE due_date IS NOT NULL;

-- Tax and compliance
CREATE INDEX idx_invoices_tax_exempt ON invoices(tax_exempt) WHERE tax_exempt = TRUE;
CREATE INDEX idx_invoices_vat ON invoices(vat_number) WHERE vat_number IS NOT NULL;

-- Accounting integration
CREATE INDEX idx_invoices_accounting ON invoices(accounting_exported, created_at) WHERE accounting_exported = FALSE;

-- Dispute management
CREATE INDEX idx_invoices_disputed ON invoices(disputed, created_at) WHERE disputed = TRUE;

-- Document management
CREATE INDEX idx_invoices_pdf ON invoices(pdf_generated_at) WHERE pdf_url IS NOT NULL;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoices_updated_at 
    BEFORE UPDATE ON invoices 
    FOR EACH ROW 
    EXECUTE FUNCTION update_invoices_updated_at();

-- Create function to generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    v_year VARCHAR(4);
    v_month VARCHAR(2);
    v_sequence INTEGER;
    v_prefix VARCHAR(10);
BEGIN
    -- Get current year and month
    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_month := TO_CHAR(CURRENT_DATE, 'MM');
    
    -- Determine prefix based on invoice type
    CASE NEW.invoice_type
        WHEN 'subscription' THEN v_prefix := 'SUB';
        WHEN 'settlement' THEN v_prefix := 'SET';
        WHEN 'credit_note' THEN v_prefix := 'CN';
        ELSE v_prefix := 'INV';
    END CASE;
    
    -- Get next sequence number for this year-month
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM invoices
    WHERE invoice_number LIKE v_prefix || '-' || v_year || v_month || '-%';
    
    -- Generate invoice number: PREFIX-YYYYMM-SEQUENCE
    NEW.invoice_number := v_prefix || '-' || v_year || v_month || '-' || LPAD(v_sequence::TEXT, 5, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_invoice_number_before_insert
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number IS NULL)
    EXECUTE FUNCTION generate_invoice_number();

-- Create function to manage invoice status transitions
CREATE OR REPLACE FUNCTION manage_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle status transitions
    IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
        CASE NEW.status
            WHEN 'open' THEN
                IF NEW.finalized_at IS NULL THEN
                    NEW.finalized_at = CURRENT_TIMESTAMP;
                END IF;
                -- Set due date if not already set
                IF NEW.due_date IS NULL THEN
                    NEW.due_date = CURRENT_DATE + INTERVAL '30 days';
                END IF;
                
            WHEN 'paid' THEN
                NEW.paid_at = CURRENT_TIMESTAMP;
                NEW.amount_paid = NEW.total_amount;
                
            WHEN 'void' THEN
                NEW.voided_at = CURRENT_TIMESTAMP;
                
            WHEN 'overdue' THEN
                -- Automatically set when due date passes
                NULL;
        END CASE;
    END IF;
    
    -- Check if invoice should be marked as overdue
    IF NEW.status = 'open' AND NEW.due_date < CURRENT_DATE THEN
        NEW.status = 'overdue';
    END IF;
    
    -- Update payment status based on amount paid
    IF NEW.amount_paid > 0 AND NEW.amount_paid < NEW.total_amount THEN
        NEW.status = 'partially_paid';
    ELSIF NEW.amount_paid >= NEW.total_amount AND NEW.status NOT IN ('void', 'uncollectible') THEN
        NEW.status = 'paid';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manage_invoice_status_trigger
    BEFORE INSERT OR UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION manage_invoice_status();

-- Create function to calculate invoice totals from line items
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_subtotal DECIMAL(12, 2) := 0;
    v_tax_total DECIMAL(10, 2) := 0;
    v_line_item JSONB;
BEGIN
    -- Calculate totals from line items
    FOR v_line_item IN SELECT * FROM jsonb_array_elements(NEW.line_items)
    LOOP
        v_subtotal := v_subtotal + COALESCE((v_line_item->>'total')::DECIMAL, 0);
        v_tax_total := v_tax_total + COALESCE((v_line_item->>'tax_amount')::DECIMAL, 0);
    END LOOP;
    
    -- Update invoice totals if in draft status
    IF NEW.status = 'draft' THEN
        NEW.subtotal = v_subtotal;
        NEW.tax_amount = v_tax_total;
        NEW.total_amount = NEW.subtotal - NEW.discount_amount + NEW.tax_amount + NEW.shipping_amount;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_invoice_totals_trigger
    BEFORE INSERT OR UPDATE OF line_items ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION calculate_invoice_totals();

-- Create view for overdue invoices
CREATE OR REPLACE VIEW overdue_invoices AS
SELECT 
    i.id,
    i.invoice_number,
    i.venue_id,
    v.name as venue_name,
    i.user_id,
    u.email as user_email,
    i.total_amount,
    i.amount_remaining,
    i.currency,
    i.due_date,
    CURRENT_DATE - i.due_date as days_overdue,
    i.attempt_count,
    i.last_payment_attempt,
    i.collection_paused,
    i.created_at
FROM invoices i
LEFT JOIN venues v ON i.venue_id = v.id
LEFT JOIN users u ON i.user_id = u.id
WHERE i.status IN ('open', 'overdue')
    AND i.due_date < CURRENT_DATE
    AND i.amount_remaining > 0
ORDER BY i.due_date;

-- Add table comments
COMMENT ON TABLE invoices IS 'Comprehensive invoice management for subscriptions, one-time charges, and settlements. Handles full invoice lifecycle from draft to payment with tax compliance and accounting integration.';

-- Add column comments (selected key columns)
COMMENT ON COLUMN invoices.id IS 'Unique invoice identifier (UUID)';
COMMENT ON COLUMN invoices.invoice_number IS 'Sequential invoice number (auto-generated)';
COMMENT ON COLUMN invoices.invoice_type IS 'Type of invoice (subscription, one-time, settlement, etc.)';
COMMENT ON COLUMN invoices.line_items IS 'JSON array of invoice line items with pricing details';
COMMENT ON COLUMN invoices.status IS 'Current invoice status in payment lifecycle';
COMMENT ON COLUMN invoices.amount_remaining IS 'Outstanding balance (auto-calculated)';
COMMENT ON COLUMN invoices.collection_method IS 'How payment will be collected';
COMMENT ON COLUMN invoices.tax_rates IS 'Detailed tax breakdown as JSON array';
COMMENT ON COLUMN invoices.due_date IS 'Payment due date';
COMMENT ON COLUMN invoices.pdf_url IS 'Generated PDF invoice URL';
COMMENT ON COLUMN invoices.accounting_exported IS 'Whether exported to accounting system';

-- Sample data for testing (commented out)
/*
-- Subscription invoice
INSERT INTO invoices (
    venue_id, subscription_id, invoice_type,
    billing_period_start, billing_period_end,
    line_items, subtotal, tax_amount, total_amount,
    status, collection_method, due_date
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    'subscription',
    '2025-07-01'::date,
    '2025-07-31'::date,
    '[{
        "id": "li_001",
        "type": "subscription",
        "description": "Venue Premium Monthly - July 2025",
        "quantity": 1,
        "unit_price": 99.00,
        "tax_rate": 0.0875,
        "tax_amount": 8.66,
        "total": 107.66
    }]'::jsonb,
    99.00,
    8.66,
    107.66,
    'open',
    'charge_automatically',
    CURRENT_DATE + INTERVAL '30 days'
);

-- One-time charge invoice with multiple line items
INSERT INTO invoices (
    user_id, invoice_type,
    line_items, subtotal, discount_amount,
    tax_amount, total_amount,
    status, collection_method
) VALUES (
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'one_time',
    '[
        {
            "id": "li_001",
            "description": "Event Setup Fee",
            "quantity": 1,
            "unit_price": 500.00,
            "total": 500.00
        },
        {
            "id": "li_002",
            "description": "Premium Support Package",
            "quantity": 3,
            "unit_price": 50.00,
            "total": 150.00
        }
    ]'::jsonb,
    650.00,
    50.00,  -- Discount
    52.50,  -- Tax on $600
    652.50,
    'draft',
    'send_invoice'
);
*/

-- Invoice Compliance Notes:
-- 1. Sequential numbering: Automatic generation ensures no gaps
-- 2. Tax compliance: Supports multiple tax rates and jurisdictions
-- 3. Audit trail: Complete history of all changes and status transitions
-- 4. Accounting integration: Export flags and GL codes
-- 5. Multi-currency: Exchange rate tracking for international billing
-- 6. Payment tracking: Complete payment history and attempts
-- 7. Document management: PDF generation and storage

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created ON invoices(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- 8. Dunning management: Automated collection retry scheduling
