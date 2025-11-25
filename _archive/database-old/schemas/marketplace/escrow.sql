-- =============================================================================
-- Payment Escrow Management Schema
-- =============================================================================
-- This schema manages secure payment escrow for marketplace transactions:
-- - Automated fund holding and release mechanisms
-- - Comprehensive dispute resolution workflow
-- - Fraud prevention and risk assessment
-- - Multi-party confirmation requirements
-- - Automatic and manual release triggers
-- - Complete audit trail for compliance
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects
DROP TABLE IF EXISTS marketplace.escrow CASCADE;
DROP TYPE IF EXISTS marketplace.escrow_type CASCADE;
DROP TYPE IF EXISTS marketplace.escrow_status CASCADE;
DROP TYPE IF EXISTS marketplace.hold_reason CASCADE;
DROP TYPE IF EXISTS marketplace.dispute_resolution CASCADE;
DROP TYPE IF EXISTS marketplace.refund_reason CASCADE;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS marketplace;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Escrow type enumeration
CREATE TYPE marketplace.escrow_type AS ENUM (
    'sale',         -- Standard sale escrow
    'auction',      -- Auction winner payment
    'dispute'       -- Funds held due to dispute
);

-- Escrow status enumeration
CREATE TYPE marketplace.escrow_status AS ENUM (
    'created',      -- Escrow created, awaiting funding
    'funded',       -- Payment received from buyer
    'held',         -- Funds held pending conditions
    'released',     -- Funds released to seller
    'refunded',     -- Funds returned to buyer
    'disputed',     -- Under dispute resolution
    'expired',      -- Escrow period expired
    'cancelled'     -- Escrow cancelled before funding
);

-- Hold reason enumeration
CREATE TYPE marketplace.hold_reason AS ENUM (
    'standard_hold',        -- Normal escrow period
    'verification_pending', -- Awaiting identity verification
    'fraud_review',         -- Under fraud investigation
    'dispute_hold',         -- Held due to dispute
    'regulatory_hold',      -- Regulatory compliance hold
    'manual_review'         -- Requires manual approval
);

-- Dispute resolution enumeration
CREATE TYPE marketplace.dispute_resolution AS ENUM (
    'pending',              -- Dispute awaiting resolution
    'buyer_favored',        -- Resolved in buyer's favor
    'seller_favored',       -- Resolved in seller's favor
    'split_resolution',     -- Partial refund/release
    'escalated',            -- Escalated to higher authority
    'withdrawn',            -- Dispute withdrawn
    'expired'               -- Dispute period expired
);

-- Refund reason enumeration
CREATE TYPE marketplace.refund_reason AS ENUM (
    'buyer_cancellation',   -- Buyer cancelled
    'seller_cancellation',  -- Seller cancelled
    'failed_delivery',      -- Ticket delivery failed
    'fraud_detected',       -- Fraudulent transaction
    'dispute_resolution',   -- Result of dispute
    'event_cancelled',      -- Event was cancelled
    'duplicate_purchase',   -- Duplicate transaction
    'other'                 -- Other reasons
);

-- =============================================================================
-- MAIN ESCROW TABLE
-- =============================================================================

CREATE TABLE marketplace.escrow (
    -- Primary identification
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Foreign key relationships
    marketplace_transaction_id  UUID NOT NULL UNIQUE,
    buyer_user_id               UUID NOT NULL,
    seller_user_id              UUID NOT NULL,
    payment_method_id           UUID NOT NULL,
    
    -- Escrow details
    escrow_amount               DECIMAL(10, 2) NOT NULL CHECK (escrow_amount > 0),
    currency                    VARCHAR(3) NOT NULL DEFAULT 'USD',
    escrow_type                 marketplace.escrow_type NOT NULL,
    
    -- Status tracking
    status                      marketplace.escrow_status NOT NULL DEFAULT 'created',
    previous_status             marketplace.escrow_status,
    status_history              JSONB DEFAULT '[]',
    
    -- Hold conditions
    hold_reason                 marketplace.hold_reason NOT NULL DEFAULT 'standard_hold',
    release_conditions          JSONB DEFAULT '{}',
    automatic_release_date      TIMESTAMPTZ,
    hold_extension_count        INTEGER NOT NULL DEFAULT 0 CHECK (hold_extension_count >= 0),
    
    -- Dispute management
    dispute_initiated           BOOLEAN NOT NULL DEFAULT false,
    dispute_reason              TEXT,
    dispute_evidence            JSONB DEFAULT '{}',
    mediator_assigned           UUID,
    mediator_notes              TEXT,
    resolution                  marketplace.dispute_resolution,
    resolution_details          JSONB DEFAULT '{}',
    
    -- Payment processing
    stripe_payment_intent_id    VARCHAR(255) NOT NULL,
    held_payment_amount         DECIMAL(10, 2) NOT NULL CHECK (held_payment_amount >= escrow_amount),
    processing_fees             DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (processing_fees >= 0),
    stripe_transfer_id          VARCHAR(255),
    stripe_refund_id            VARCHAR(255),
    
    -- Release triggers
    seller_confirmation         BOOLEAN NOT NULL DEFAULT false,
    buyer_confirmation          BOOLEAN NOT NULL DEFAULT false,
    automatic_triggers          JSONB DEFAULT '{}',
    manual_release_authorized   BOOLEAN NOT NULL DEFAULT false,
    release_authorized_by       UUID,
    
    -- Refund scenarios
    refund_reason               marketplace.refund_reason,
    refund_amount               DECIMAL(10, 2) CHECK (refund_amount >= 0 AND refund_amount <= escrow_amount),
    refund_processing_fee       DECIMAL(10, 2) DEFAULT 0 CHECK (refund_processing_fee >= 0),
    partial_refund_details      JSONB DEFAULT '{}',
    
    -- Security measures
    fraud_hold                  BOOLEAN NOT NULL DEFAULT false,
    manual_review_required      BOOLEAN NOT NULL DEFAULT false,
    risk_assessment_score       DECIMAL(3, 2) CHECK (risk_assessment_score >= 0 AND risk_assessment_score <= 100),
    risk_factors                JSONB DEFAULT '{}',
    security_checks_passed      JSONB DEFAULT '{}',
    
    -- Compliance and audit
    compliance_notes            TEXT,
    audit_log                   JSONB DEFAULT '[]',
    ip_address                  INET,
    user_agent                  TEXT,
    
    -- Timestamps
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    funded_at                   TIMESTAMPTZ,
    held_until                  TIMESTAMPTZ,
    released_at                 TIMESTAMPTZ,
    disputed_at                 TIMESTAMPTZ,
    resolved_at                 TIMESTAMPTZ,
    refunded_at                 TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_escrow_transaction FOREIGN KEY (marketplace_transaction_id) 
        REFERENCES marketplace.marketplace_transactions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_escrow_buyer FOREIGN KEY (buyer_user_id) 
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_escrow_seller FOREIGN KEY (seller_user_id) 
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_escrow_payment_method FOREIGN KEY (payment_method_id) 
        REFERENCES payment_methods(id) ON DELETE RESTRICT,
    CONSTRAINT fk_escrow_mediator FOREIGN KEY (mediator_assigned) 
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_escrow_release_authorizer FOREIGN KEY (release_authorized_by) 
        REFERENCES users(id) ON DELETE SET NULL,
    
    -- Status-based constraints
    CONSTRAINT chk_funded_status CHECK (
        (status IN ('funded', 'held', 'released', 'refunded', 'disputed') AND funded_at IS NOT NULL)
        OR status IN ('created', 'cancelled', 'expired')
    ),
    CONSTRAINT chk_released_status CHECK (
        (status = 'released' AND released_at IS NOT NULL)
        OR status != 'released'
    ),
    CONSTRAINT chk_refunded_status CHECK (
        (status = 'refunded' AND refunded_at IS NOT NULL AND refund_reason IS NOT NULL AND refund_amount IS NOT NULL)
        OR status != 'refunded'
    ),
    CONSTRAINT chk_disputed_status CHECK (
        (status = 'disputed' AND dispute_initiated = true AND disputed_at IS NOT NULL AND dispute_reason IS NOT NULL)
        OR status != 'disputed'
    ),
    
    -- Release conditions
    CONSTRAINT chk_release_conditions CHECK (
        (status = 'released' AND (
            (seller_confirmation = true AND buyer_confirmation = true) OR
            (automatic_release_date IS NOT NULL AND automatic_release_date <= released_at) OR
            manual_release_authorized = true
        ))
        OR status != 'released'
    ),
    
    -- Dispute constraints
    CONSTRAINT chk_dispute_resolution CHECK (
        (dispute_initiated = true AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
        OR dispute_initiated = false
    ),
    CONSTRAINT chk_mediator_assignment CHECK (
        (resolution IN ('escalated', 'split_resolution') AND mediator_assigned IS NOT NULL)
        OR resolution NOT IN ('escalated', 'split_resolution')
        OR resolution IS NULL
    ),
    
    -- Security constraints
    CONSTRAINT chk_risk_review CHECK (
        (risk_assessment_score > 80 AND manual_review_required = true)
        OR risk_assessment_score <= 80
        OR risk_assessment_score IS NULL
    )
);

-- =============================================================================
-- INDEXES FOR ESCROW MANAGEMENT AND DISPUTE RESOLUTION
-- =============================================================================

-- Primary operational indexes
CREATE INDEX idx_escrow_transaction ON marketplace.escrow(marketplace_transaction_id);
CREATE INDEX idx_escrow_buyer ON marketplace.escrow(buyer_user_id, status);
CREATE INDEX idx_escrow_seller ON marketplace.escrow(seller_user_id, status);
CREATE INDEX idx_escrow_status ON marketplace.escrow(status, created_at DESC);

-- Active escrow tracking
CREATE INDEX idx_escrow_active_holds ON marketplace.escrow(status, held_until) 
    WHERE status IN ('funded', 'held');
CREATE INDEX idx_escrow_pending_release ON marketplace.escrow(automatic_release_date) 
    WHERE status = 'held' AND automatic_release_date IS NOT NULL;
CREATE INDEX idx_escrow_awaiting_funding ON marketplace.escrow(created_at) 
    WHERE status = 'created';

-- Dispute management indexes
CREATE INDEX idx_escrow_active_disputes ON marketplace.escrow(dispute_initiated, disputed_at) 
    WHERE dispute_initiated = true AND resolution IS NULL;
CREATE INDEX idx_escrow_mediator_queue ON marketplace.escrow(mediator_assigned, disputed_at) 
    WHERE status = 'disputed';
CREATE INDEX idx_escrow_dispute_resolution ON marketplace.escrow(resolution, resolved_at) 
    WHERE resolution IS NOT NULL;

-- Security and fraud indexes
CREATE INDEX idx_escrow_fraud_review ON marketplace.escrow(fraud_hold, risk_assessment_score) 
    WHERE fraud_hold = true OR manual_review_required = true;
CREATE INDEX idx_escrow_high_risk ON marketplace.escrow(risk_assessment_score, created_at) 
    WHERE risk_assessment_score > 70;
CREATE INDEX idx_escrow_manual_review ON marketplace.escrow(manual_review_required, created_at) 
    WHERE manual_review_required = true AND status IN ('funded', 'held');

-- Payment processing indexes
CREATE INDEX idx_escrow_stripe_intent ON marketplace.escrow(stripe_payment_intent_id);
CREATE INDEX idx_escrow_stripe_transfer ON marketplace.escrow(stripe_transfer_id) 
    WHERE stripe_transfer_id IS NOT NULL;
CREATE INDEX idx_escrow_stripe_refund ON marketplace.escrow(stripe_refund_id) 
    WHERE stripe_refund_id IS NOT NULL;

-- Release and refund tracking
CREATE INDEX idx_escrow_pending_confirmation ON marketplace.escrow(seller_confirmation, buyer_confirmation) 
    WHERE status = 'held' AND (seller_confirmation = false OR buyer_confirmation = false);
CREATE INDEX idx_escrow_refund_tracking ON marketplace.escrow(refund_reason, refunded_at) 
    WHERE status = 'refunded';

-- Analytics and reporting
CREATE INDEX idx_escrow_type_status ON marketplace.escrow(escrow_type, status, created_at);
CREATE INDEX idx_escrow_hold_reasons ON marketplace.escrow(hold_reason, status);
CREATE INDEX idx_escrow_completion_time ON marketplace.escrow(created_at, released_at) 
    WHERE status = 'released';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp and audit log trigger
CREATE OR REPLACE FUNCTION marketplace.update_escrow_audit()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Add status change to history
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_history = NEW.status_history || jsonb_build_object(
            'timestamp', CURRENT_TIMESTAMP,
            'from_status', OLD.status,
            'to_status', NEW.status,
            'reason', COALESCE(
                CASE 
                    WHEN NEW.dispute_initiated THEN 'dispute_initiated'
                    WHEN NEW.fraud_hold THEN 'fraud_hold'
                    WHEN NEW.manual_release_authorized THEN 'manual_release'
                    ELSE 'status_change'
                END,
                'status_change'
            )
        );
        NEW.previous_status = OLD.status;
    END IF;
    
    -- Add to audit log
    NEW.audit_log = NEW.audit_log || jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'action', TG_OP,
        'changed_fields', (
            SELECT jsonb_object_agg(key, value)
            FROM jsonb_each(to_jsonb(NEW))
            WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_escrow_update_audit
    BEFORE UPDATE ON marketplace.escrow
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_escrow_audit();

-- Automatic release date calculation trigger
CREATE OR REPLACE FUNCTION marketplace.calculate_release_date()
RETURNS TRIGGER AS $$
DECLARE
    v_hold_period INTERVAL;
BEGIN
    -- Only calculate for new escrows
    IF TG_OP = 'INSERT' THEN
        -- Determine hold period based on type and risk
        v_hold_period := CASE
            WHEN NEW.escrow_type = 'auction' THEN INTERVAL '72 hours'
            WHEN NEW.risk_assessment_score > 70 THEN INTERVAL '7 days'
            WHEN NEW.escrow_type = 'sale' THEN INTERVAL '48 hours'
            ELSE INTERVAL '48 hours'
        END;
        
        -- Set automatic release date if not manually specified
        IF NEW.automatic_release_date IS NULL THEN
            NEW.automatic_release_date = CURRENT_TIMESTAMP + v_hold_period;
        END IF;
        
        -- Set held_until date
        NEW.held_until = NEW.automatic_release_date;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_escrow_calculate_release
    BEFORE INSERT ON marketplace.escrow
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.calculate_release_date();

-- Status transition validation trigger
CREATE OR REPLACE FUNCTION marketplace.validate_escrow_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate status transitions
    IF OLD.status = 'released' AND NEW.status != 'released' THEN
        RAISE EXCEPTION 'Cannot change status from released';
    END IF;
    
    IF OLD.status = 'refunded' AND NEW.status != 'refunded' THEN
        RAISE EXCEPTION 'Cannot change status from refunded';
    END IF;
    
    -- Validate dispute initiation
    IF NEW.dispute_initiated = true AND OLD.dispute_initiated = false THEN
        IF NEW.status NOT IN ('funded', 'held') THEN
            RAISE EXCEPTION 'Can only initiate dispute for funded or held escrows';
        END IF;
        NEW.status = 'disputed';
        NEW.disputed_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Update timestamps based on status changes
    CASE NEW.status
        WHEN 'funded' THEN
            IF OLD.status != 'funded' THEN
                NEW.funded_at = CURRENT_TIMESTAMP;
            END IF;
        WHEN 'released' THEN
            IF OLD.status != 'released' THEN
                NEW.released_at = CURRENT_TIMESTAMP;
            END IF;
        WHEN 'refunded' THEN
            IF OLD.status != 'refunded' THEN
                NEW.refunded_at = CURRENT_TIMESTAMP;
            END IF;
        ELSE
            -- No special handling
    END CASE;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_escrow_validate_transition
    BEFORE UPDATE ON marketplace.escrow
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.validate_escrow_transition();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to initiate escrow release
CREATE OR REPLACE FUNCTION marketplace.release_escrow_funds(
    p_escrow_id UUID,
    p_release_type TEXT DEFAULT 'automatic',
    p_authorized_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_can_release BOOLEAN;
    v_escrow_record RECORD;
BEGIN
    -- Get escrow details
    SELECT * INTO v_escrow_record
    FROM marketplace.escrow
    WHERE id = p_escrow_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Check release conditions
    v_can_release := CASE
        WHEN v_escrow_record.status != 'held' THEN FALSE
        WHEN v_escrow_record.fraud_hold = true THEN FALSE
        WHEN v_escrow_record.dispute_initiated = true THEN FALSE
        WHEN p_release_type = 'automatic' AND v_escrow_record.automatic_release_date <= CURRENT_TIMESTAMP THEN TRUE
        WHEN p_release_type = 'manual' AND p_authorized_by IS NOT NULL THEN TRUE
        WHEN p_release_type = 'confirmed' AND v_escrow_record.seller_confirmation = true AND v_escrow_record.buyer_confirmation = true THEN TRUE
        ELSE FALSE
    END;
    
    IF v_can_release THEN
        UPDATE marketplace.escrow
        SET 
            status = 'released',
            manual_release_authorized = (p_release_type = 'manual'),
            release_authorized_by = p_authorized_by,
            automatic_triggers = automatic_triggers || jsonb_build_object(
                'release_type', p_release_type,
                'release_time', CURRENT_TIMESTAMP
            )
        WHERE id = p_escrow_id;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to initiate dispute
CREATE OR REPLACE FUNCTION marketplace.initiate_escrow_dispute(
    p_escrow_id UUID,
    p_dispute_reason TEXT,
    p_dispute_evidence JSONB DEFAULT '{}'::jsonb,
    p_initiated_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE marketplace.escrow
    SET 
        dispute_initiated = true,
        dispute_reason = p_dispute_reason,
        dispute_evidence = p_dispute_evidence || jsonb_build_object(
            'initiated_by', p_initiated_by,
            'initiated_at', CURRENT_TIMESTAMP
        ),
        resolution = 'pending'
    WHERE id = p_escrow_id
        AND status IN ('funded', 'held')
        AND dispute_initiated = false;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate escrow metrics
CREATE OR REPLACE FUNCTION marketplace.get_escrow_metrics(
    p_start_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
    total_escrows BIGINT,
    total_amount DECIMAL(15, 2),
    avg_hold_time INTERVAL,
    release_rate DECIMAL(5, 2),
    dispute_rate DECIMAL(5, 2),
    avg_resolution_time INTERVAL,
    fraud_detection_rate DECIMAL(5, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_escrows,
        SUM(escrow_amount) as total_amount,
        AVG(released_at - funded_at) FILTER (WHERE status = 'released') as avg_hold_time,
        (COUNT(*) FILTER (WHERE status = 'released')::DECIMAL / NULLIF(COUNT(*), 0) * 100) as release_rate,
        (COUNT(*) FILTER (WHERE dispute_initiated = true)::DECIMAL / NULLIF(COUNT(*), 0) * 100) as dispute_rate,
        AVG(resolved_at - disputed_at) FILTER (WHERE resolution IS NOT NULL) as avg_resolution_time,
        (COUNT(*) FILTER (WHERE fraud_hold = true)::DECIMAL / NULLIF(COUNT(*), 0) * 100) as fraud_detection_rate
    FROM marketplace.escrow
    WHERE created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE marketplace.escrow IS 'Payment escrow management for secure marketplace transactions';

-- Column comments
COMMENT ON COLUMN marketplace.escrow.id IS 'Unique identifier for the escrow record';
COMMENT ON COLUMN marketplace.escrow.escrow_type IS 'Type of escrow: sale, auction, or dispute-related';
COMMENT ON COLUMN marketplace.escrow.status IS 'Current status of the escrow';
COMMENT ON COLUMN marketplace.escrow.hold_reason IS 'Primary reason for holding funds';
COMMENT ON COLUMN marketplace.escrow.release_conditions IS 'JSON object defining release requirements';
COMMENT ON COLUMN marketplace.escrow.automatic_release_date IS 'Date when funds will be automatically released';
COMMENT ON COLUMN marketplace.escrow.dispute_evidence IS 'JSON object containing dispute evidence from both parties';
COMMENT ON COLUMN marketplace.escrow.resolution IS 'Final outcome of dispute if applicable';
COMMENT ON COLUMN marketplace.escrow.automatic_triggers IS 'JSON log of automatic system actions';
COMMENT ON COLUMN marketplace.escrow.risk_assessment_score IS 'Risk score from 0-100 (higher = riskier)';
COMMENT ON COLUMN marketplace.escrow.security_checks_passed IS 'JSON object of passed security validations';
COMMENT ON COLUMN marketplace.escrow.audit_log IS 'Complete audit trail of all changes';

-- Function comments
COMMENT ON FUNCTION marketplace.release_escrow_funds IS 'Release escrowed funds with validation';
COMMENT ON FUNCTION marketplace.initiate_escrow_dispute IS 'Start dispute process for an escrow';
COMMENT ON FUNCTION marketplace.get_escrow_metrics IS 'Calculate escrow system performance metrics';

-- =============================================================================
-- SAMPLE DATA FOR TESTING (commented out for production)
-- =============================================================================

/*
-- Example: Standard sale escrow
INSERT INTO marketplace.escrow (
    marketplace_transaction_id, buyer_user_id, seller_user_id, payment_method_id,
    escrow_amount, escrow_type,
    stripe_payment_intent_id, held_payment_amount,
    risk_assessment_score
) VALUES (
    'transaction-uuid', 'buyer-uuid', 'seller-uuid', 'payment-method-uuid',
    250.00, 'sale',
    'pi_1234567890', 250.00,
    15.5
);

-- Example: High-risk auction escrow with manual review
INSERT INTO marketplace.escrow (
    marketplace_transaction_id, buyer_user_id, seller_user_id, payment_method_id,
    escrow_amount, escrow_type,
    stripe_payment_intent_id, held_payment_amount,
    risk_assessment_score, manual_review_required,
    hold_reason
) VALUES (
    'auction-transaction-uuid', 'buyer-uuid-2', 'seller-uuid-2', 'payment-method-uuid-2',
    1500.00, 'auction',
    'pi_0987654321', 1500.00,
    85.0, true,
    'fraud_review'
);

-- Example: Disputed escrow
INSERT INTO marketplace.escrow (
    marketplace_transaction_id, buyer_user_id, seller_user_id, payment_method_id,
    escrow_amount, escrow_type, status,
    stripe_payment_intent_id, held_payment_amount,
    dispute_initiated, dispute_reason,
    resolution
) VALUES (
    'disputed-transaction-uuid', 'buyer-uuid-3', 'seller-uuid-3', 'payment-method-uuid-3',
    500.00, 'sale', 'disputed',
    'pi_1122334455', 500.00,
    true, 'Ticket not delivered as promised',
    'pending'
);
*/

-- =============================================================================
-- END OF SCHEMA

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_escrow_tenant_id ON escrow(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_escrow_tenant_created ON escrow(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =============================================================================
