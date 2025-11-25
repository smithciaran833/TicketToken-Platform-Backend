-- TicketToken Payment Refunds Schema
-- This table tracks all payment refund requests and processing
-- Refund Workflow: requested -> approved -> processing -> completed
-- Policy Compliance: Enforces refund policies while allowing manual overrides
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS refunds CASCADE;

-- Create the refunds table
CREATE TABLE refunds (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    original_transaction_id UUID NOT NULL,  -- Original payment transaction
    user_id UUID NOT NULL,  -- User requesting refund
    venue_id UUID NOT NULL,  -- Venue associated with refund
    processed_by_user_id UUID,  -- Staff member who processed refund
    ticket_id UUID,  -- Specific ticket being refunded (if applicable)
    event_id UUID,  -- Event associated with refund
    
    -- Refund core details
    refund_amount DECIMAL(12, 2) NOT NULL CHECK (refund_amount > 0),  -- Amount to refund
    refund_currency VARCHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 currency code
    refund_type VARCHAR(20) NOT NULL CHECK (refund_type IN (
        'full',              -- Full refund of original payment
        'partial',           -- Partial refund
        'processing_fee',    -- Processing fee only
        'platform_fee',      -- Platform fee refund
        'venue_fee',         -- Venue fee refund
        'tax_only',          -- Tax refund only
        'custom'             -- Custom refund amount
    )),
    
    -- Refund reason categorization
    refund_reason VARCHAR(50) NOT NULL CHECK (refund_reason IN (
        'event_cancelled',        -- Event was cancelled
        'event_postponed',        -- Event postponed beyond acceptable time
        'duplicate_purchase',     -- Accidental duplicate purchase
        'customer_request',       -- Customer initiated within policy
        'customer_complaint',     -- Service complaint resolution
        'pricing_error',          -- Incorrect pricing
        'technical_error',        -- Platform technical issue
        'payment_error',          -- Payment processing error
        'fraud',                  -- Fraudulent transaction
        'chargeback_prevention',  -- Preemptive refund to avoid chargeback
        'venue_request',          -- Venue initiated refund
        'policy_violation',       -- Platform policy violation by venue
        'quality_issue',          -- Event quality did not meet standards
        'accessibility',          -- Accessibility requirements not met
        'force_majeure',          -- Act of God/Force Majeure
        'other'                   -- Other reason with details required
    )),
    refund_reason_details TEXT,  -- Detailed explanation of refund
    
    -- Original transaction information
    original_amount DECIMAL(12, 2) NOT NULL,  -- Original payment amount
    original_payment_date TIMESTAMP WITH TIME ZONE NOT NULL,  -- When original payment was made
    days_since_purchase INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - original_payment_date)) / 86400
    ) STORED,  -- Days elapsed since purchase
    
    -- Processing information
    stripe_refund_id VARCHAR(255),  -- Stripe refund ID (re_xxx)
    stripe_charge_id VARCHAR(255),  -- Original Stripe charge ID
    provider_refund_id VARCHAR(255),  -- Generic provider refund ID
    provider_name VARCHAR(50),  -- Payment provider used
    provider_response JSONB DEFAULT '{}'::jsonb,  -- Provider API response
    
    -- Fee handling
    original_platform_fee DECIMAL(10, 2) DEFAULT 0,  -- Platform fee from original transaction
    original_processing_fee DECIMAL(10, 2) DEFAULT 0,  -- Processing fee from original
    original_venue_fee DECIMAL(10, 2) DEFAULT 0,  -- Venue fee from original
    platform_fee_refunded DECIMAL(10, 2) DEFAULT 0,  -- Platform fee being refunded
    processing_fee_refunded DECIMAL(10, 2) DEFAULT 0,  -- Processing fee refunded
    venue_fee_refunded DECIMAL(10, 2) DEFAULT 0,  -- Venue fee refunded
    processing_fee_charged DECIMAL(10, 2) DEFAULT 0,  -- New processing fee for refund
    net_refund_amount DECIMAL(12, 2) GENERATED ALWAYS AS (
        refund_amount - processing_fee_charged
    ) STORED,  -- Net amount after refund processing fee
    
    -- Financial impact calculations
    platform_revenue_impact DECIMAL(10, 2) GENERATED ALWAYS AS (
        -(platform_fee_refunded)
    ) STORED,  -- Impact on platform revenue
    venue_revenue_impact DECIMAL(10, 2) GENERATED ALWAYS AS (
        -(refund_amount - platform_fee_refunded - processing_fee_refunded)
    ) STORED,  -- Impact on venue revenue
    
    -- Policy compliance
    refund_policy_applied VARCHAR(100),  -- Which refund policy was applied
    policy_version VARCHAR(20),  -- Version of policy at time of refund
    within_policy_period BOOLEAN DEFAULT TRUE,  -- Whether within standard refund period
    policy_deadline TIMESTAMP WITH TIME ZONE,  -- Deadline for policy compliance
    manual_override BOOLEAN DEFAULT FALSE,  -- Whether policy was manually overridden
    override_reason TEXT,  -- Reason for policy override
    override_authorized_by UUID,  -- Who authorized the override
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN (
        'requested',      -- Initial refund request
        'pending_review', -- Awaiting manual review
        'approved',       -- Approved for processing
        'processing',     -- Being processed by provider
        'completed',      -- Successfully refunded
        'failed',         -- Refund failed
        'cancelled',      -- Request cancelled
        'rejected',       -- Request rejected
        'expired'         -- Request expired
    )),
    status_reason TEXT,  -- Detailed reason for current status
    rejection_reason TEXT,  -- Specific reason if rejected
    failure_code VARCHAR(50),  -- Provider error code if failed
    failure_message TEXT,  -- Provider error message
    retry_count INTEGER DEFAULT 0,  -- Number of retry attempts
    
    -- Approval workflow
    approval_required BOOLEAN DEFAULT FALSE,  -- Whether manual approval needed
    approval_threshold DECIMAL(10, 2),  -- Amount threshold requiring approval
    approved_by UUID,  -- User who approved the refund
    approval_notes TEXT,  -- Notes from approver
    auto_approved BOOLEAN DEFAULT FALSE,  -- Whether auto-approved by rules
    approval_rules_applied JSONB DEFAULT '[]'::jsonb,  -- Which auto-approval rules applied
    
    -- Risk and fraud assessment
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),  -- Risk score
    risk_factors JSONB DEFAULT '[]'::jsonb,  -- Risk factors identified
    fraud_check_passed BOOLEAN DEFAULT TRUE,  -- Fraud check result
    suspicious_indicators JSONB DEFAULT '[]'::jsonb,  -- Suspicious activity flags
    
    -- Chargeback and dispute handling
    chargeback_related BOOLEAN DEFAULT FALSE,  -- Whether related to chargeback
    chargeback_id VARCHAR(255),  -- Associated chargeback ID
    chargeback_prevented BOOLEAN DEFAULT FALSE,  -- Whether refund prevented chargeback
    dispute_evidence JSONB DEFAULT '{}'::jsonb,  -- Evidence for dispute
    dispute_outcome VARCHAR(50),  -- Outcome if disputed
    
    -- Customer communication
    customer_notified BOOLEAN DEFAULT FALSE,  -- Whether customer was notified
    notification_sent_at TIMESTAMP WITH TIME ZONE,  -- When notification sent
    notification_method VARCHAR(50),  -- Email, SMS, in-app
    customer_response TEXT,  -- Any customer response
    
    -- Batch processing
    batch_id UUID,  -- For bulk refund processing
    batch_position INTEGER,  -- Position in batch
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional refund data
    ip_address INET,  -- IP address of refund request
    user_agent TEXT,  -- Browser/app user agent
    request_source VARCHAR(50),  -- Where request originated (web, app, api, admin)
    
    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,  -- When manually reviewed
    approved_at TIMESTAMP WITH TIME ZONE,  -- When approved
    processing_started_at TIMESTAMP WITH TIME ZONE,  -- When processing began
    completed_at TIMESTAMP WITH TIME ZONE,  -- When refund completed
    failed_at TIMESTAMP WITH TIME ZONE,  -- When refund failed
    cancelled_at TIMESTAMP WITH TIME ZONE,  -- When cancelled
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_original_transaction FOREIGN KEY (original_transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_processed_by FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
    CONSTRAINT fk_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
    CONSTRAINT fk_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_override_authorized_by FOREIGN KEY (override_authorized_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_batch FOREIGN KEY (batch_id) REFERENCES refund_batches(id) ON DELETE SET NULL,
    
    -- Business constraints
    CONSTRAINT chk_refund_amount_limit CHECK (refund_amount <= original_amount),
    CONSTRAINT chk_fee_refunds CHECK (
        platform_fee_refunded <= original_platform_fee AND
        processing_fee_refunded <= original_processing_fee AND
        venue_fee_refunded <= original_venue_fee
    ),
    CONSTRAINT chk_partial_refund CHECK (
        (refund_type = 'partial' AND refund_amount < original_amount) OR
        (refund_type = 'full' AND refund_amount = original_amount) OR
        (refund_type NOT IN ('partial', 'full'))
    ),
    CONSTRAINT chk_approval_threshold CHECK (
        (approval_required = FALSE) OR 
        (approval_required = TRUE AND approval_threshold IS NOT NULL)
    ),
    CONSTRAINT chk_override_authorization CHECK (
        (manual_override = FALSE) OR 
        (manual_override = TRUE AND override_reason IS NOT NULL AND override_authorized_by IS NOT NULL)
    ),
    CONSTRAINT chk_rejection_reason CHECK (
        (status != 'rejected') OR 
        (status = 'rejected' AND rejection_reason IS NOT NULL)
    ),
    CONSTRAINT chk_chargeback_fields CHECK (
        (chargeback_related = FALSE) OR 
        (chargeback_related = TRUE AND chargeback_id IS NOT NULL)
    )
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE INDEX idx_refunds_transaction ON refunds(original_transaction_id);
CREATE INDEX idx_refunds_user ON refunds(user_id);
CREATE INDEX idx_refunds_venue ON refunds(venue_id);
CREATE INDEX idx_refunds_event ON refunds(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_refunds_ticket ON refunds(ticket_id) WHERE ticket_id IS NOT NULL;

-- Status and workflow indexes
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_pending_review ON refunds(requested_at) WHERE status = 'pending_review';
CREATE INDEX idx_refunds_processing ON refunds(processing_started_at) WHERE status = 'processing';
CREATE INDEX idx_refunds_approval_required ON refunds(requested_at) WHERE approval_required = TRUE AND approved_by IS NULL;

-- Financial reporting indexes
CREATE INDEX idx_refunds_completed ON refunds(completed_at, venue_id) WHERE status = 'completed';
CREATE INDEX idx_refunds_amount ON refunds(refund_amount, status);
CREATE INDEX idx_refunds_date_range ON refunds(DATE(requested_at), status);
CREATE INDEX idx_refunds_venue_impact ON refunds(venue_id, venue_revenue_impact) WHERE status = 'completed';

-- Provider reference indexes
CREATE INDEX idx_refunds_stripe ON refunds(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;
CREATE INDEX idx_refunds_provider ON refunds(provider_refund_id) WHERE provider_refund_id IS NOT NULL;

-- Policy and compliance indexes
CREATE INDEX idx_refunds_policy ON refunds(refund_policy_applied, within_policy_period);
CREATE INDEX idx_refunds_overrides ON refunds(manual_override, override_authorized_by) WHERE manual_override = TRUE;
CREATE INDEX idx_refunds_policy_deadline ON refunds(policy_deadline) WHERE policy_deadline IS NOT NULL;

-- Risk and fraud indexes
CREATE INDEX idx_refunds_high_risk ON refunds(risk_score) WHERE risk_score > 70;
CREATE INDEX idx_refunds_fraud ON refunds(fraud_check_passed) WHERE fraud_check_passed = FALSE;

-- Chargeback related indexes
CREATE INDEX idx_refunds_chargebacks ON refunds(chargeback_id) WHERE chargeback_related = TRUE;
CREATE INDEX idx_refunds_chargeback_prevention ON refunds(chargeback_prevented) WHERE chargeback_prevented = TRUE;

-- Batch processing indexes
CREATE INDEX idx_refunds_batch ON refunds(batch_id, batch_position) WHERE batch_id IS NOT NULL;

-- Reason analysis indexes
CREATE INDEX idx_refunds_reason ON refunds(refund_reason, status);
CREATE INDEX idx_refunds_reason_date ON refunds(refund_reason, DATE(requested_at));

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_refunds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_refunds_updated_at 
    BEFORE UPDATE ON refunds 
    FOR EACH ROW 
    EXECUTE FUNCTION update_refunds_updated_at();

-- Create function to handle refund workflow
CREATE OR REPLACE FUNCTION process_refund_workflow()
RETURNS TRIGGER AS $$
DECLARE
    v_original_transaction RECORD;
BEGIN
    -- Get original transaction details if inserting
    IF TG_OP = 'INSERT' THEN
        SELECT * INTO v_original_transaction
        FROM transactions
        WHERE id = NEW.original_transaction_id;
        
        -- Set original transaction details
        NEW.original_amount = v_original_transaction.amount;
        NEW.original_payment_date = v_original_transaction.created_at;
        NEW.stripe_charge_id = v_original_transaction.stripe_charge_id;
        
        -- Set fee information from original transaction
        NEW.original_platform_fee = COALESCE(v_original_transaction.platform_fee, 0);
        NEW.original_processing_fee = COALESCE(v_original_transaction.processing_fee, 0);
        NEW.original_venue_fee = COALESCE(v_original_transaction.venue_commission, 0);
        
        -- Determine if approval is required based on amount
        IF NEW.refund_amount > 100.00 THEN
            NEW.approval_required = TRUE;
            NEW.approval_threshold = 100.00;
        END IF;
        
        -- Check if within policy period (example: 24 hours)
        IF EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.original_payment_date)) / 3600 > 24 THEN
            NEW.within_policy_period = FALSE;
            IF NOT NEW.manual_override THEN
                NEW.approval_required = TRUE;
            END IF;
        END IF;
    END IF;
    
    -- Handle status changes
    IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
        CASE NEW.status
            WHEN 'approved' THEN
                NEW.approved_at = CURRENT_TIMESTAMP;
                IF NEW.approved_by IS NULL AND NEW.auto_approved THEN
                    NEW.approval_notes = 'Auto-approved by policy rules';
                END IF;
            WHEN 'processing' THEN
                NEW.processing_started_at = CURRENT_TIMESTAMP;
            WHEN 'completed' THEN
                NEW.completed_at = CURRENT_TIMESTAMP;
                -- Update original transaction refund tracking
                UPDATE transactions 
                SET refund_amount = refund_amount + NEW.refund_amount,
                    refund_count = refund_count + 1,
                    is_fully_refunded = (refund_amount + NEW.refund_amount >= amount)
                WHERE id = NEW.original_transaction_id;
            WHEN 'failed' THEN
                NEW.failed_at = CURRENT_TIMESTAMP;
                NEW.retry_count = OLD.retry_count + 1;
            WHEN 'cancelled' THEN
                NEW.cancelled_at = CURRENT_TIMESTAMP;
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER process_refund_workflow_trigger
    BEFORE INSERT OR UPDATE ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION process_refund_workflow();

-- Create function for auto-approval rules
CREATE OR REPLACE FUNCTION check_refund_auto_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-approve if all conditions are met
    IF NEW.status = 'requested' AND NOT NEW.approval_required THEN
        -- Event cancellation auto-approval
        IF NEW.refund_reason = 'event_cancelled' THEN
            NEW.status = 'approved';
            NEW.auto_approved = TRUE;
            NEW.approval_rules_applied = NEW.approval_rules_applied || 
                jsonb_build_array(jsonb_build_object('rule', 'event_cancelled_auto_approval', 'timestamp', CURRENT_TIMESTAMP));
        
        -- Technical error auto-approval
        ELSIF NEW.refund_reason IN ('technical_error', 'payment_error', 'pricing_error') THEN
            NEW.status = 'approved';
            NEW.auto_approved = TRUE;
            NEW.approval_rules_applied = NEW.approval_rules_applied || 
                jsonb_build_array(jsonb_build_object('rule', 'platform_error_auto_approval', 'timestamp', CURRENT_TIMESTAMP));
        
        -- Small amount auto-approval (under $10)
        ELSIF NEW.refund_amount <= 10.00 AND NEW.within_policy_period THEN
            NEW.status = 'approved';
            NEW.auto_approved = TRUE;
            NEW.approval_rules_applied = NEW.approval_rules_applied || 
                jsonb_build_array(jsonb_build_object('rule', 'small_amount_auto_approval', 'timestamp', CURRENT_TIMESTAMP));
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_refund_auto_approval_trigger
    BEFORE INSERT OR UPDATE OF status ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION check_refund_auto_approval();

-- Add table comments
COMMENT ON TABLE refunds IS 'Comprehensive refund tracking table managing all payment refunds with policy compliance, approval workflows, and complete financial impact calculations. Supports both manual and automated refund processing.';

-- Add column comments (selected important columns)
COMMENT ON COLUMN refunds.id IS 'Unique refund identifier (UUID)';
COMMENT ON COLUMN refunds.original_transaction_id IS 'Reference to original payment transaction';
COMMENT ON COLUMN refunds.refund_amount IS 'Total amount to be refunded';
COMMENT ON COLUMN refunds.refund_type IS 'Type of refund (full, partial, fees only, etc.)';
COMMENT ON COLUMN refunds.refund_reason IS 'Categorized reason for refund';
COMMENT ON COLUMN refunds.days_since_purchase IS 'Auto-calculated days since original purchase';
COMMENT ON COLUMN refunds.net_refund_amount IS 'Amount after deducting refund processing fees';
COMMENT ON COLUMN refunds.platform_revenue_impact IS 'Calculated impact on platform revenue';
COMMENT ON COLUMN refunds.venue_revenue_impact IS 'Calculated impact on venue revenue';
COMMENT ON COLUMN refunds.within_policy_period IS 'Whether refund is within standard policy period';
COMMENT ON COLUMN refunds.manual_override IS 'Whether refund policy was manually overridden';
COMMENT ON COLUMN refunds.approval_required IS 'Whether manual approval is needed';
COMMENT ON COLUMN refunds.chargeback_related IS 'Whether refund is related to chargeback';
COMMENT ON COLUMN refunds.risk_score IS 'Risk assessment score 0-100';

-- Sample data for testing (commented out)
/*
-- Full refund within policy
INSERT INTO refunds (
    original_transaction_id, user_id, venue_id,
    refund_amount, refund_type, refund_reason,
    refund_reason_details
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    100.00,
    'full',
    'event_cancelled',
    'Event cancelled due to weather conditions'
);

-- Partial refund with manual override
INSERT INTO refunds (
    original_transaction_id, user_id, venue_id,
    refund_amount, refund_type, refund_reason,
    manual_override, override_reason, override_authorized_by
) VALUES (
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    '550e8400-e29b-41d4-a716-446655440005'::uuid,
    '550e8400-e29b-41d4-a716-446655440006'::uuid,
    50.00,
    'partial',
    'customer_complaint',
    TRUE,
    'Customer experienced significant issues at event',
    '550e8400-e29b-41d4-a716-446655440007'::uuid
);
*/

-- Refund Policy Notes:
-- 1. Standard refund window: 24 hours from purchase
-- 2. Event cancellations: Always eligible for full refund
-- 3. Platform errors: Auto-approved for full refund
-- 4. Amounts over $100: Require manual approval
-- 5. Chargebacks: Track refunds issued to prevent disputes
-- 6. Fee handling: Platform can choose to refund or retain fees

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_refunds_tenant_id ON refunds(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_tenant_created ON refunds(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- 7. Venue impact: Calculate exact revenue impact for settlements
