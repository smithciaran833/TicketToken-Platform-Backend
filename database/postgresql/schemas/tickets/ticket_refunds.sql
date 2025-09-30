-- TicketToken Ticket Refunds Schema
-- This table manages all ticket refund requests and processing
-- Refund Workflow: requested -> approved -> processing -> completed (or denied at any stage)
-- Business Logic: Refunds must comply with venue policies and processing deadlines
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS ticket_refunds CASCADE;

-- Create the ticket_refunds table
CREATE TABLE ticket_refunds (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys to related tables
    ticket_id UUID NOT NULL,  -- The ticket being refunded
    user_id UUID NOT NULL,  -- User requesting the refund
    original_transaction_id UUID NOT NULL,  -- Original purchase transaction
    venue_id UUID NOT NULL,  -- Venue that issued the ticket
    
    -- Refund reason and categorization
    refund_reason VARCHAR(50) NOT NULL CHECK (refund_reason IN (
        'event_cancelled',     -- Event was cancelled by organizer
        'event_postponed',     -- Event was postponed beyond acceptable timeframe
        'user_request',        -- User initiated refund within policy
        'fraud',              -- Fraudulent transaction detected
        'venue_policy',       -- Venue-specific policy refund
        'duplicate_purchase',  -- Accidental duplicate purchase
        'technical_error',     -- Platform technical error
        'covid_related',      -- COVID-19 related cancellation
        'medical_emergency',   -- Medical emergency with documentation
        'other'               -- Other reasons with explanation required
    )),
    refund_reason_details TEXT,  -- Detailed explanation of refund reason
    
    -- Financial calculations
    original_amount DECIMAL(10, 2) NOT NULL,  -- Original ticket purchase price
    refund_amount DECIMAL(10, 2) NOT NULL,  -- Amount to be refunded
    platform_fee_refunded DECIMAL(10, 2) DEFAULT 0,  -- Platform fee portion refunded
    processing_fee DECIMAL(10, 2) DEFAULT 0,  -- Fee charged for processing refund
    venue_fee_retained DECIMAL(10, 2) DEFAULT 0,  -- Venue fee retained (if any)
    net_refund_amount DECIMAL(10, 2) GENERATED ALWAYS AS (refund_amount - processing_fee) STORED,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 currency code
    
    -- Refund status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN (
        'requested',    -- Initial refund request
        'approved',     -- Refund approved, awaiting processing
        'processing',   -- Payment processing initiated
        'completed',    -- Refund completed successfully
        'denied',       -- Refund request denied
        'cancelled',    -- Refund cancelled by user
        'failed'        -- Refund processing failed
    )),
    denial_reason TEXT,  -- Reason for denial if status is 'denied'
    failure_reason TEXT,  -- Technical reason if status is 'failed'
    
    -- Policy compliance
    refund_policy_version VARCHAR(20),  -- Version of refund policy applied
    refund_deadline TIMESTAMP WITH TIME ZONE,  -- Deadline for refund eligibility
    deadline_compliance BOOLEAN DEFAULT TRUE,  -- Whether request is within deadline
    terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,  -- User accepted refund terms
    terms_accepted_at TIMESTAMP WITH TIME ZONE,  -- When terms were accepted
    documentation_required BOOLEAN DEFAULT FALSE,  -- Whether supporting docs needed
    documentation_provided JSONB,  -- Uploaded documentation metadata
    
    -- Payment processing details
    stripe_refund_id VARCHAR(255),  -- Stripe refund transaction ID
    refund_method VARCHAR(50) CHECK (refund_method IN (
        'original_payment_method',  -- Refund to original payment method
        'credit_balance',          -- Credit to user account
        'bank_transfer',           -- Direct bank transfer
        'check',                   -- Physical check
        'crypto_wallet',           -- Cryptocurrency refund
        'other'                    -- Other method
    )),
    payment_method_details JSONB,  -- Details about refund payment method
    expected_completion_date DATE,  -- Expected date for refund completion
    actual_completion_date DATE,  -- Actual date refund was completed
    
    -- Approval workflow tracking
    requested_by UUID NOT NULL,  -- User who requested the refund
    approved_by UUID,  -- Staff member who approved
    processed_by UUID,  -- Staff member who processed payment
    auto_approved BOOLEAN DEFAULT FALSE,  -- Whether refund was auto-approved
    
    -- Risk and fraud assessment
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),  -- Risk assessment score
    risk_factors JSONB,  -- Detailed risk factors identified
    manual_review_required BOOLEAN DEFAULT FALSE,  -- Flagged for manual review
    fraud_suspected BOOLEAN DEFAULT FALSE,  -- Fraud detection flag
    
    -- Communication tracking
    notifications_sent JSONB,  -- Email/SMS notifications sent
    last_notification_at TIMESTAMP WITH TIME ZONE,  -- Last notification timestamp
    
    -- Metadata
    ip_address INET,  -- IP address of refund request
    user_agent TEXT,  -- Browser/app user agent
    metadata JSONB,  -- Additional refund data
    
    -- Timestamps for refund lifecycle
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    denied_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE RESTRICT,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_original_transaction FOREIGN KEY (original_transaction_id) REFERENCES ticket_transactions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_processed_by FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Business rule: Refund amount cannot exceed original amount
    CONSTRAINT chk_refund_amount CHECK (refund_amount <= original_amount AND refund_amount > 0),
    
    -- Business rule: Processing fee cannot exceed refund amount
    CONSTRAINT chk_processing_fee CHECK (processing_fee >= 0 AND processing_fee < refund_amount),
    
    -- Business rule: Ensure proper status transitions
    CONSTRAINT chk_status_timestamps CHECK (
        (status = 'requested' AND approved_at IS NULL AND completed_at IS NULL) OR
        (status = 'approved' AND approved_at IS NOT NULL AND completed_at IS NULL) OR
        (status = 'processing' AND approved_at IS NOT NULL AND processing_started_at IS NOT NULL) OR
        (status = 'completed' AND completed_at IS NOT NULL) OR
        (status = 'denied' AND denied_at IS NOT NULL) OR
        (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
        (status = 'failed')
    ),
    
    -- Business rule: Denial reason required when denied
    CONSTRAINT chk_denial_reason CHECK (
        (status != 'denied') OR (status = 'denied' AND denial_reason IS NOT NULL)
    ),
    
    -- Business rule: Terms must be accepted unless auto-approved
    CONSTRAINT chk_terms_acceptance CHECK (
        auto_approved = TRUE OR terms_accepted = TRUE
    ),
    
    -- Business rule: Documentation required for certain refund reasons
    CONSTRAINT chk_documentation CHECK (
        (documentation_required = FALSE) OR 
        (documentation_required = TRUE AND documentation_provided IS NOT NULL)
    )
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE INDEX idx_ticket_refunds_ticket_id ON ticket_refunds(ticket_id);
CREATE INDEX idx_ticket_refunds_user_id ON ticket_refunds(user_id);
CREATE INDEX idx_ticket_refunds_venue_id ON ticket_refunds(venue_id);
CREATE INDEX idx_ticket_refunds_transaction_id ON ticket_refunds(original_transaction_id);

-- Status tracking indexes
CREATE INDEX idx_ticket_refunds_status ON ticket_refunds(status);
CREATE INDEX idx_ticket_refunds_status_requested ON ticket_refunds(requested_at DESC) WHERE status = 'requested';
CREATE INDEX idx_ticket_refunds_status_processing ON ticket_refunds(processing_started_at) WHERE status = 'processing';

-- Financial reporting indexes
CREATE INDEX idx_ticket_refunds_financial ON ticket_refunds(venue_id, status, requested_at);
CREATE INDEX idx_ticket_refunds_amount ON ticket_refunds(refund_amount, status);

-- Composite index for user refund history
CREATE INDEX idx_ticket_refunds_user_history ON ticket_refunds(user_id, status, requested_at DESC);

-- Deadline compliance monitoring
CREATE INDEX idx_ticket_refunds_deadline ON ticket_refunds(refund_deadline, deadline_compliance) 
    WHERE deadline_compliance = FALSE;

-- Manual review queue
CREATE INDEX idx_ticket_refunds_review_queue ON ticket_refunds(manual_review_required, requested_at) 
    WHERE manual_review_required = TRUE AND status = 'requested';

-- Fraud detection index
CREATE INDEX idx_ticket_refunds_fraud ON ticket_refunds(fraud_suspected, risk_score) 
    WHERE fraud_suspected = TRUE OR risk_score > 70;

-- Refund reason analytics
CREATE INDEX idx_ticket_refunds_reason ON ticket_refunds(refund_reason, status, requested_at);

-- Payment processing tracking
CREATE INDEX idx_ticket_refunds_stripe ON ticket_refunds(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;

-- Expected completion tracking
CREATE INDEX idx_ticket_refunds_expected_completion ON ticket_refunds(expected_completion_date, status) 
    WHERE status IN ('approved', 'processing');

-- Auto-approval tracking
CREATE INDEX idx_ticket_refunds_auto_approved ON ticket_refunds(auto_approved, requested_at) 
    WHERE auto_approved = TRUE;

-- Staff workload indexes
CREATE INDEX idx_ticket_refunds_approved_by ON ticket_refunds(approved_by, approved_at) WHERE approved_by IS NOT NULL;
CREATE INDEX idx_ticket_refunds_processed_by ON ticket_refunds(processed_by, processing_started_at) WHERE processed_by IS NOT NULL;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_ticket_refunds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ticket_refunds_updated_at 
    BEFORE UPDATE ON ticket_refunds 
    FOR EACH ROW 
    EXECUTE FUNCTION update_ticket_refunds_updated_at();

-- Create function for auto-approval logic
CREATE OR REPLACE FUNCTION check_auto_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-approve event cancellations
    IF NEW.refund_reason = 'event_cancelled' THEN
        NEW.auto_approved = TRUE;
        NEW.status = 'approved';
        NEW.approved_at = CURRENT_TIMESTAMP;
        NEW.terms_accepted = TRUE;
        NEW.terms_accepted_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Auto-approve technical errors
    IF NEW.refund_reason = 'technical_error' THEN
        NEW.auto_approved = TRUE;
        NEW.status = 'approved';
        NEW.approved_at = CURRENT_TIMESTAMP;
        NEW.terms_accepted = TRUE;
        NEW.terms_accepted_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Set deadline compliance
    IF NEW.refund_deadline IS NOT NULL THEN
        NEW.deadline_compliance = (CURRENT_TIMESTAMP <= NEW.refund_deadline);
    END IF;
    
    -- Require documentation for certain reasons
    IF NEW.refund_reason IN ('medical_emergency', 'fraud') THEN
        NEW.documentation_required = TRUE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_auto_approval_before_insert
    BEFORE INSERT ON ticket_refunds
    FOR EACH ROW
    EXECUTE FUNCTION check_auto_approval();

-- Add table comments
COMMENT ON TABLE ticket_refunds IS 'Manages all ticket refund requests and processing. Workflow: requested -> approved -> processing -> completed. Includes policy compliance, financial calculations, and fraud detection.';

-- Add column comments
COMMENT ON COLUMN ticket_refunds.id IS 'Unique identifier for the refund request (UUID)';
COMMENT ON COLUMN ticket_refunds.ticket_id IS 'Foreign key to tickets table - ticket being refunded';
COMMENT ON COLUMN ticket_refunds.user_id IS 'Foreign key to users table - user requesting refund';
COMMENT ON COLUMN ticket_refunds.original_transaction_id IS 'Foreign key to ticket_transactions - original purchase';
COMMENT ON COLUMN ticket_refunds.venue_id IS 'Foreign key to venues table - venue that issued ticket';
COMMENT ON COLUMN ticket_refunds.refund_reason IS 'Categorized reason for refund request';
COMMENT ON COLUMN ticket_refunds.refund_reason_details IS 'Detailed explanation of refund reason';
COMMENT ON COLUMN ticket_refunds.original_amount IS 'Original ticket purchase price';
COMMENT ON COLUMN ticket_refunds.refund_amount IS 'Amount to be refunded (may be less than original)';
COMMENT ON COLUMN ticket_refunds.platform_fee_refunded IS 'Platform fee portion being refunded';
COMMENT ON COLUMN ticket_refunds.processing_fee IS 'Fee charged for processing the refund';
COMMENT ON COLUMN ticket_refunds.venue_fee_retained IS 'Venue fee retained per refund policy';
COMMENT ON COLUMN ticket_refunds.net_refund_amount IS 'Calculated net amount (refund_amount - processing_fee)';
COMMENT ON COLUMN ticket_refunds.currency IS 'ISO 4217 currency code';
COMMENT ON COLUMN ticket_refunds.status IS 'Current refund status in workflow';
COMMENT ON COLUMN ticket_refunds.denial_reason IS 'Explanation if refund was denied';
COMMENT ON COLUMN ticket_refunds.failure_reason IS 'Technical reason if processing failed';
COMMENT ON COLUMN ticket_refunds.refund_policy_version IS 'Version of policy applied to this refund';
COMMENT ON COLUMN ticket_refunds.refund_deadline IS 'Deadline for refund eligibility';
COMMENT ON COLUMN ticket_refunds.deadline_compliance IS 'Whether request meets deadline requirements';
COMMENT ON COLUMN ticket_refunds.terms_accepted IS 'User accepted refund terms and conditions';
COMMENT ON COLUMN ticket_refunds.terms_accepted_at IS 'Timestamp of terms acceptance';
COMMENT ON COLUMN ticket_refunds.documentation_required IS 'Whether supporting documents are needed';
COMMENT ON COLUMN ticket_refunds.documentation_provided IS 'Metadata about uploaded documentation';
COMMENT ON COLUMN ticket_refunds.stripe_refund_id IS 'Stripe refund transaction identifier';
COMMENT ON COLUMN ticket_refunds.refund_method IS 'Method used to issue refund';
COMMENT ON COLUMN ticket_refunds.payment_method_details IS 'Details about refund payment method';
COMMENT ON COLUMN ticket_refunds.expected_completion_date IS 'Expected date for refund to complete';
COMMENT ON COLUMN ticket_refunds.actual_completion_date IS 'Actual date refund was completed';
COMMENT ON COLUMN ticket_refunds.requested_by IS 'User who initiated the refund request';
COMMENT ON COLUMN ticket_refunds.approved_by IS 'Staff member who approved the refund';
COMMENT ON COLUMN ticket_refunds.processed_by IS 'Staff member who processed the payment';
COMMENT ON COLUMN ticket_refunds.auto_approved IS 'Whether refund was automatically approved';
COMMENT ON COLUMN ticket_refunds.risk_score IS 'Risk assessment score (0-100)';
COMMENT ON COLUMN ticket_refunds.risk_factors IS 'Detailed risk factors identified';
COMMENT ON COLUMN ticket_refunds.manual_review_required IS 'Flagged for manual staff review';
COMMENT ON COLUMN ticket_refunds.fraud_suspected IS 'Fraud detection system flag';
COMMENT ON COLUMN ticket_refunds.notifications_sent IS 'Record of notifications sent to user';
COMMENT ON COLUMN ticket_refunds.last_notification_at IS 'Timestamp of last notification';
COMMENT ON COLUMN ticket_refunds.ip_address IS 'IP address of refund request';
COMMENT ON COLUMN ticket_refunds.user_agent IS 'Browser/app user agent string';
COMMENT ON COLUMN ticket_refunds.metadata IS 'Additional refund data as JSONB';
COMMENT ON COLUMN ticket_refunds.requested_at IS 'When refund was initially requested';
COMMENT ON COLUMN ticket_refunds.approved_at IS 'When refund was approved';
COMMENT ON COLUMN ticket_refunds.processing_started_at IS 'When payment processing began';
COMMENT ON COLUMN ticket_refunds.completed_at IS 'When refund was completed';
COMMENT ON COLUMN ticket_refunds.denied_at IS 'When refund was denied';
COMMENT ON COLUMN ticket_refunds.cancelled_at IS 'When refund was cancelled';
COMMENT ON COLUMN ticket_refunds.updated_at IS 'Last update timestamp';

-- Sample data for testing (commented out)
/*
-- Event cancellation refund (auto-approved)
INSERT INTO ticket_refunds (
    ticket_id, user_id, original_transaction_id, venue_id,
    refund_reason, original_amount, refund_amount,
    platform_fee_refunded, requested_by
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    'event_cancelled',
    100.00,
    100.00,
    10.00,
    '550e8400-e29b-41d4-a716-446655440002'::uuid
);

-- User requested refund within policy
INSERT INTO ticket_refunds (
    ticket_id, user_id, original_transaction_id, venue_id,
    refund_reason, refund_reason_details, original_amount, 
    refund_amount, processing_fee, refund_deadline,
    terms_accepted, requested_by
) VALUES (
    '550e8400-e29b-41d4-a716-446655440005'::uuid,
    '550e8400-e29b-41d4-a716-446655440006'::uuid,
    '550e8400-e29b-41d4-a716-446655440007'::uuid,
    '550e8400-e29b-41d4-a716-446655440008'::uuid,
    'user_request',
    'Unable to attend due to schedule change',
    150.00,
    135.00,  -- 90% refund per policy
    5.00,    -- Processing fee
    CURRENT_TIMESTAMP + INTERVAL '7 days',
    TRUE,
    '550e8400-e29b-41d4-a716-446655440006'::uuid
);

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_ticket_refunds_tenant_id ON ticket_refunds(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_refunds_tenant_created ON ticket_refunds(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
*/
