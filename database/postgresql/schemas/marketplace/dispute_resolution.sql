-- =============================================================================
-- Dispute Resolution Management Schema
-- =============================================================================
-- This schema manages the complete dispute resolution lifecycle:
-- - Multi-tiered dispute handling (mediation, arbitration, appeal)
-- - Evidence collection and documentation
-- - Communication tracking and deadlines
-- - Resolution decision implementation
-- - Outcome tracking and enforcement
-- - Complete audit trail for legal compliance
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects
DROP TABLE IF EXISTS marketplace.dispute_resolution CASCADE;
DROP TYPE IF EXISTS marketplace.dispute_type CASCADE;
DROP TYPE IF EXISTS marketplace.dispute_status CASCADE;
DROP TYPE IF EXISTS marketplace.priority_level CASCADE;
DROP TYPE IF EXISTS marketplace.resolution_method CASCADE;
DROP TYPE IF EXISTS marketplace.resolution_decision CASCADE;
DROP TYPE IF EXISTS marketplace.account_action CASCADE;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS marketplace;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Dispute type enumeration
CREATE TYPE marketplace.dispute_type AS ENUM (
    'non_delivery',      -- Ticket not delivered
    'fraud',             -- Fraudulent transaction
    'misrepresentation', -- Item not as described
    'technical_issue',   -- Platform technical problem
    'unauthorized_sale', -- Seller not authorized
    'duplicate_charge',  -- Multiple charges
    'event_issue',       -- Event cancelled/postponed
    'other'              -- Other disputes
);

-- Dispute status enumeration
CREATE TYPE marketplace.dispute_status AS ENUM (
    'filed',             -- Initial filing
    'under_review',      -- Being reviewed by platform
    'awaiting_response', -- Waiting for party response
    'in_mediation',      -- Active mediation
    'in_arbitration',    -- Escalated to arbitration
    'resolved',          -- Resolution reached
    'appealed',          -- Decision appealed
    'closed',            -- Case closed
    'withdrawn'          -- Dispute withdrawn
);

-- Priority level enumeration
CREATE TYPE marketplace.priority_level AS ENUM (
    'low',               -- Standard handling
    'medium',            -- Expedited review
    'high',              -- Priority handling
    'critical'           -- Immediate attention required
);

-- Resolution method enumeration
CREATE TYPE marketplace.resolution_method AS ENUM (
    'platform_decision', -- Platform makes decision
    'mediation',         -- Mediated resolution
    'arbitration',       -- Binding arbitration
    'mutual_agreement',  -- Parties reached agreement
    'automatic',         -- Automatic resolution (timeout)
    'withdrawn'          -- Complainant withdrew
);

-- Resolution decision enumeration
CREATE TYPE marketplace.resolution_decision AS ENUM (
    'full_refund',       -- Complete refund to buyer
    'partial_refund',    -- Partial refund
    'no_refund',         -- No refund, seller keeps funds
    'replacement',       -- Replace ticket/item
    'credit_issued',     -- Platform credit issued
    'split_resolution',  -- Split between parties
    'pending'            -- Decision pending
);

-- Account action enumeration
CREATE TYPE marketplace.account_action AS ENUM (
    'none',              -- No action taken
    'warning_issued',    -- Warning to user
    'temporary_suspension', -- Temporary account suspension
    'permanent_ban',     -- Permanent ban
    'selling_restricted', -- Restricted from selling
    'buying_restricted'  -- Restricted from buying
);

-- =============================================================================
-- MAIN DISPUTE RESOLUTION TABLE
-- =============================================================================

CREATE TABLE marketplace.dispute_resolution (
    -- Primary identification
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    
    -- Foreign key relationships
    marketplace_transaction_id  UUID NOT NULL,
    complainant_user_id         UUID NOT NULL,
    respondent_user_id          UUID NOT NULL,
    mediator_user_id            UUID,
    
    -- Dispute details
    dispute_type                marketplace.dispute_type NOT NULL,
    case_number                 VARCHAR(20) UNIQUE NOT NULL,
    priority_level              marketplace.priority_level NOT NULL DEFAULT 'medium',
    dispute_amount              DECIMAL(10, 2) NOT NULL CHECK (dispute_amount >= 0),
    dispute_reason              TEXT NOT NULL,
    detailed_description        TEXT,
    
    -- Evidence tracking
    evidence_submitted          JSONB DEFAULT '{}',
    documentation_urls          TEXT[] DEFAULT '{}',
    chat_transcripts            JSONB DEFAULT '{}',
    platform_evidence           JSONB DEFAULT '{}',
    evidence_submission_deadline TIMESTAMPTZ,
    
    -- Resolution process
    mediation_required          BOOLEAN NOT NULL DEFAULT false,
    arbitration_required        BOOLEAN NOT NULL DEFAULT false,
    resolution_method           marketplace.resolution_method,
    mediator_notes              TEXT,
    arbitrator_notes            TEXT,
    
    -- Status progression
    status                      marketplace.dispute_status NOT NULL DEFAULT 'filed',
    previous_status             marketplace.dispute_status,
    status_history              JSONB DEFAULT '[]',
    escalation_count            INTEGER NOT NULL DEFAULT 0 CHECK (escalation_count >= 0),
    
    -- Decision tracking
    resolution_decision         marketplace.resolution_decision DEFAULT 'pending',
    awarded_amount              DECIMAL(10, 2) CHECK (awarded_amount >= 0),
    resolution_fees             DECIMAL(10, 2) DEFAULT 0 CHECK (resolution_fees >= 0),
    fee_split                   JSONB DEFAULT '{}', -- How fees are split between parties
    decision_rationale          TEXT,
    
    -- Communication log
    messages_count              INTEGER NOT NULL DEFAULT 0 CHECK (messages_count >= 0),
    last_response_at            TIMESTAMPTZ,
    response_deadline           TIMESTAMPTZ,
    complainant_last_response   TIMESTAMPTZ,
    respondent_last_response    TIMESTAMPTZ,
    communication_log           JSONB DEFAULT '[]',
    
    -- Outcome implementation
    refund_issued               BOOLEAN NOT NULL DEFAULT false,
    refund_transaction_id       VARCHAR(255),
    payment_released            BOOLEAN NOT NULL DEFAULT false,
    payment_release_id          VARCHAR(255),
    account_actions             JSONB DEFAULT '{}',
    complainant_action          marketplace.account_action DEFAULT 'none',
    respondent_action           marketplace.account_action DEFAULT 'none',
    
    -- Appeal information
    appeal_allowed              BOOLEAN NOT NULL DEFAULT true,
    appeal_deadline             TIMESTAMPTZ,
    appeal_reason               TEXT,
    appeal_decision             TEXT,
    
    -- Compliance and documentation
    terms_violated              TEXT[],
    policy_references           JSONB DEFAULT '{}',
    legal_notes                 TEXT,
    requires_legal_review       BOOLEAN NOT NULL DEFAULT false,
    
    -- Metrics and analytics
    resolution_time             INTERVAL GENERATED ALWAYS AS (
        CASE 
            WHEN resolved_at IS NOT NULL THEN resolved_at - filed_at
            ELSE NULL
        END
    ) STORED,
    total_response_time         INTERVAL,
    satisfaction_rating         INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
    
    -- Timestamps
    filed_at                    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_at                 TIMESTAMPTZ,
    resolved_at                 TIMESTAMPTZ,
    closed_at                   TIMESTAMPTZ,
    appealed_at                 TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_dispute_transaction FOREIGN KEY (marketplace_transaction_id) 
        REFERENCES marketplace.marketplace_transactions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dispute_complainant FOREIGN KEY (complainant_user_id) 
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dispute_respondent FOREIGN KEY (respondent_user_id) 
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_dispute_mediator FOREIGN KEY (mediator_user_id) 
        REFERENCES users(id) ON DELETE SET NULL,
    
    -- Business logic constraints
    CONSTRAINT chk_parties_different CHECK (complainant_user_id != respondent_user_id),
    CONSTRAINT chk_awarded_amount CHECK (
        awarded_amount IS NULL OR awarded_amount <= dispute_amount
    ),
    CONSTRAINT chk_resolution_status CHECK (
        (status IN ('resolved', 'closed') AND resolution_decision != 'pending')
        OR status NOT IN ('resolved', 'closed')
    ),
    CONSTRAINT chk_mediation_assignment CHECK (
        (mediation_required = true AND mediator_user_id IS NOT NULL)
        OR mediation_required = false
    ),
    CONSTRAINT chk_refund_consistency CHECK (
        (resolution_decision IN ('full_refund', 'partial_refund') AND refund_issued = true)
        OR resolution_decision NOT IN ('full_refund', 'partial_refund')
        OR status NOT IN ('resolved', 'closed')
    ),
    CONSTRAINT chk_appeal_timing CHECK (
        (appealed_at IS NOT NULL AND status = 'appealed')
        OR appealed_at IS NULL
    ),
    CONSTRAINT chk_priority_fraud CHECK (
        (dispute_type = 'fraud' AND priority_level IN ('high', 'critical'))
        OR dispute_type != 'fraud'
    )
);

-- =============================================================================
-- DISPUTE MESSAGES TABLE
-- =============================================================================

CREATE TABLE marketplace.dispute_messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    dispute_id          UUID NOT NULL,
    sender_user_id      UUID NOT NULL,
    message_type        VARCHAR(50) NOT NULL, -- 'user_message', 'system_message', 'mediator_message'
    message_content     TEXT NOT NULL,
    attachments         JSONB DEFAULT '[]',
    is_public           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_message_dispute FOREIGN KEY (dispute_id) 
        REFERENCES marketplace.dispute_resolution(id) ON DELETE CASCADE,
    CONSTRAINT fk_message_sender FOREIGN KEY (sender_user_id) 
        REFERENCES users(id) ON DELETE RESTRICT
);

-- =============================================================================
-- INDEXES FOR DISPUTE MANAGEMENT AND RESOLUTION TRACKING
-- =============================================================================

-- Primary operational indexes
CREATE INDEX idx_disputes_transaction ON marketplace.dispute_resolution(marketplace_transaction_id);
CREATE INDEX idx_disputes_complainant ON marketplace.dispute_resolution(complainant_user_id, status);
CREATE INDEX idx_disputes_respondent ON marketplace.dispute_resolution(respondent_user_id, status);
CREATE INDEX idx_disputes_case_number ON marketplace.dispute_resolution(case_number);

-- Status and priority management
CREATE INDEX idx_disputes_active_status ON marketplace.dispute_resolution(status, priority_level, filed_at) 
    WHERE status NOT IN ('closed', 'withdrawn', 'resolved');
CREATE INDEX idx_disputes_priority_queue ON marketplace.dispute_resolution(priority_level, filed_at) 
    WHERE status IN ('filed', 'under_review');
CREATE INDEX idx_disputes_response_deadline ON marketplace.dispute_resolution(response_deadline) 
    WHERE status = 'awaiting_response' AND response_deadline IS NOT NULL;

-- Mediation and arbitration tracking
CREATE INDEX idx_disputes_mediation_queue ON marketplace.dispute_resolution(mediator_user_id, status) 
    WHERE mediation_required = true;
CREATE INDEX idx_disputes_unassigned_mediation ON marketplace.dispute_resolution(filed_at) 
    WHERE mediation_required = true AND mediator_user_id IS NULL;
CREATE INDEX idx_disputes_arbitration ON marketplace.dispute_resolution(arbitration_required, status) 
    WHERE arbitration_required = true;

-- Resolution and outcome tracking
CREATE INDEX idx_disputes_pending_implementation ON marketplace.dispute_resolution(resolution_decision, refund_issued, payment_released) 
    WHERE status = 'resolved' AND (
        (resolution_decision IN ('full_refund', 'partial_refund') AND refund_issued = false) OR
        (resolution_decision = 'no_refund' AND payment_released = false)
    );
CREATE INDEX idx_disputes_appeals ON marketplace.dispute_resolution(appeal_deadline, status) 
    WHERE appeal_allowed = true AND status = 'resolved';

-- Analytics and reporting
CREATE INDEX idx_disputes_type_status ON marketplace.dispute_resolution(dispute_type, status, filed_at);
CREATE INDEX idx_disputes_resolution_time ON marketplace.dispute_resolution(resolution_time, dispute_type) 
    WHERE resolution_time IS NOT NULL;
CREATE INDEX idx_disputes_amount_range ON marketplace.dispute_resolution(dispute_amount, status);
CREATE INDEX idx_disputes_account_actions ON marketplace.dispute_resolution(complainant_action, respondent_action) 
    WHERE complainant_action != 'none' OR respondent_action != 'none';

-- Legal and compliance
CREATE INDEX idx_disputes_legal_review ON marketplace.dispute_resolution(requires_legal_review, filed_at) 
    WHERE requires_legal_review = true;

-- Message indexes
CREATE INDEX idx_messages_dispute ON marketplace.dispute_messages(dispute_id, created_at);
CREATE INDEX idx_messages_sender ON marketplace.dispute_messages(sender_user_id, created_at);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp and status history trigger
CREATE OR REPLACE FUNCTION marketplace.update_dispute_history()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Track status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_history = NEW.status_history || jsonb_build_object(
            'timestamp', CURRENT_TIMESTAMP,
            'from_status', OLD.status,
            'to_status', NEW.status,
            'changed_by', current_user,
            'notes', CASE 
                WHEN NEW.status = 'resolved' THEN NEW.decision_rationale
                WHEN NEW.status = 'appealed' THEN NEW.appeal_reason
                ELSE NULL
            END
        );
        NEW.previous_status = OLD.status;
        
        -- Update relevant timestamps
        CASE NEW.status
            WHEN 'under_review' THEN
                IF NEW.assigned_at IS NULL THEN
                    NEW.assigned_at = CURRENT_TIMESTAMP;
                END IF;
            WHEN 'resolved' THEN
                NEW.resolved_at = CURRENT_TIMESTAMP;
                -- Set appeal deadline (typically 7 days)
                IF NEW.appeal_allowed THEN
                    NEW.appeal_deadline = CURRENT_TIMESTAMP + INTERVAL '7 days';
                END IF;
            WHEN 'closed' THEN
                NEW.closed_at = CURRENT_TIMESTAMP;
            WHEN 'appealed' THEN
                NEW.appealed_at = CURRENT_TIMESTAMP;
                NEW.escalation_count = NEW.escalation_count + 1;
            ELSE
                -- No special handling
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_disputes_update_history
    BEFORE UPDATE ON marketplace.dispute_resolution
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_dispute_history();

-- Generate case number trigger
CREATE OR REPLACE FUNCTION marketplace.generate_case_number()
RETURNS TRIGGER AS $$
DECLARE
    v_year TEXT;
    v_sequence INTEGER;
BEGIN
    -- Generate case number format: DIS-YYYY-NNNNNN
    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    SELECT COUNT(*) + 1 INTO v_sequence
    FROM marketplace.dispute_resolution
    WHERE EXTRACT(YEAR FROM filed_at) = EXTRACT(YEAR FROM CURRENT_DATE);
    
    NEW.case_number := 'DIS-' || v_year || '-' || LPAD(v_sequence::TEXT, 6, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_disputes_generate_case_number
    BEFORE INSERT ON marketplace.dispute_resolution
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.generate_case_number();

-- Update communication tracking trigger
CREATE OR REPLACE FUNCTION marketplace.update_communication_log()
RETURNS TRIGGER AS $$
DECLARE
    v_dispute_id UUID;
BEGIN
    v_dispute_id := NEW.dispute_id;
    
    -- Update dispute communication metrics
    UPDATE marketplace.dispute_resolution
    SET 
        messages_count = messages_count + 1,
        last_response_at = NEW.created_at,
        communication_log = communication_log || jsonb_build_object(
            'message_id', NEW.id,
            'sender_id', NEW.sender_user_id,
            'timestamp', NEW.created_at,
            'type', NEW.message_type
        ),
        complainant_last_response = CASE 
            WHEN NEW.sender_user_id = complainant_user_id THEN NEW.created_at
            ELSE complainant_last_response
        END,
        respondent_last_response = CASE 
            WHEN NEW.sender_user_id = respondent_user_id THEN NEW.created_at
            ELSE respondent_last_response
        END
    WHERE id = v_dispute_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_update_communication
    AFTER INSERT ON marketplace.dispute_messages
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.update_communication_log();

-- Priority escalation trigger
CREATE OR REPLACE FUNCTION marketplace.escalate_priority()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-escalate priority based on conditions
    IF NEW.dispute_type = 'fraud' AND OLD.priority_level NOT IN ('high', 'critical') THEN
        NEW.priority_level = 'high';
    END IF;
    
    -- Escalate if response deadline missed
    IF NEW.response_deadline < CURRENT_TIMESTAMP AND OLD.priority_level = 'low' THEN
        NEW.priority_level = 'medium';
    ELSIF NEW.response_deadline < CURRENT_TIMESTAMP AND OLD.priority_level = 'medium' THEN
        NEW.priority_level = 'high';
    END IF;
    
    -- Escalate high-value disputes
    IF NEW.dispute_amount > 1000 AND OLD.priority_level = 'low' THEN
        NEW.priority_level = 'medium';
    ELSIF NEW.dispute_amount > 5000 AND OLD.priority_level != 'critical' THEN
        NEW.priority_level = 'high';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_disputes_escalate_priority
    BEFORE UPDATE ON marketplace.dispute_resolution
    FOR EACH ROW
    EXECUTE FUNCTION marketplace.escalate_priority();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to file a dispute
CREATE OR REPLACE FUNCTION marketplace.file_dispute(
    p_transaction_id UUID,
    p_complainant_id UUID,
    p_dispute_type marketplace.dispute_type,
    p_reason TEXT,
    p_description TEXT DEFAULT NULL,
    p_evidence JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_dispute_id UUID;
    v_transaction RECORD;
BEGIN
    -- Get transaction details
    SELECT * INTO v_transaction
    FROM marketplace.marketplace_transactions
    WHERE id = p_transaction_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found';
    END IF;
    
    -- Determine respondent (opposite party)
    DECLARE
        v_respondent_id UUID;
    BEGIN
        IF p_complainant_id = v_transaction.buyer_user_id THEN
            v_respondent_id := v_transaction.seller_user_id;
        ELSIF p_complainant_id = v_transaction.seller_user_id THEN
            v_respondent_id := v_transaction.buyer_user_id;
        ELSE
            RAISE EXCEPTION 'Complainant must be buyer or seller of the transaction';
        END IF;
        
        -- Create dispute
        INSERT INTO marketplace.dispute_resolution (
            marketplace_transaction_id,
            complainant_user_id,
            respondent_user_id,
            dispute_type,
            dispute_amount,
            dispute_reason,
            detailed_description,
            evidence_submitted,
            response_deadline,
            evidence_submission_deadline,
            priority_level
        ) VALUES (
            p_transaction_id,
            p_complainant_id,
            v_respondent_id,
            p_dispute_type,
            v_transaction.sale_price,
            p_reason,
            p_description,
            p_evidence,
            CURRENT_TIMESTAMP + INTERVAL '72 hours',
            CURRENT_TIMESTAMP + INTERVAL '7 days',
            CASE 
                WHEN p_dispute_type = 'fraud' THEN 'high'::marketplace.priority_level
                WHEN v_transaction.sale_price > 1000 THEN 'medium'::marketplace.priority_level
                ELSE 'low'::marketplace.priority_level
            END
        ) RETURNING id INTO v_dispute_id;
        
        -- Update transaction status
        UPDATE marketplace.marketplace_transactions
        SET payment_status = 'disputed'
        WHERE id = p_transaction_id;
        
        RETURN v_dispute_id;
    END;
END;
$$ LANGUAGE plpgsql;

-- Function to resolve a dispute
CREATE OR REPLACE FUNCTION marketplace.resolve_dispute(
    p_dispute_id UUID,
    p_decision marketplace.resolution_decision,
    p_awarded_amount DECIMAL(10, 2) DEFAULT NULL,
    p_rationale TEXT DEFAULT NULL,
    p_account_actions JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE marketplace.dispute_resolution
    SET 
        status = 'resolved',
        resolution_decision = p_decision,
        awarded_amount = COALESCE(p_awarded_amount, 
            CASE 
                WHEN p_decision = 'full_refund' THEN dispute_amount
                WHEN p_decision = 'no_refund' THEN 0
                ELSE p_awarded_amount
            END
        ),
        decision_rationale = p_rationale,
        account_actions = p_account_actions,
        resolution_method = CASE 
            WHEN mediation_required THEN 'mediation'
            WHEN arbitration_required THEN 'arbitration'
            ELSE 'platform_decision'
        END
    WHERE id = p_dispute_id
        AND status IN ('under_review', 'in_mediation', 'in_arbitration');
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get dispute metrics
CREATE OR REPLACE FUNCTION marketplace.get_dispute_metrics(
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_disputes BIGINT,
    resolution_rate DECIMAL(5, 2),
    avg_resolution_time INTERVAL,
    buyer_win_rate DECIMAL(5, 2),
    total_disputed_amount DECIMAL(15, 2),
    total_refunded_amount DECIMAL(15, 2),
    appeal_rate DECIMAL(5, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_disputes,
        (COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::DECIMAL / 
            NULLIF(COUNT(*), 0) * 100) as resolution_rate,
        AVG(resolution_time) FILTER (WHERE resolution_time IS NOT NULL) as avg_resolution_time,
        (COUNT(*) FILTER (WHERE resolution_decision IN ('full_refund', 'partial_refund'))::DECIMAL / 
            NULLIF(COUNT(*) FILTER (WHERE status = 'resolved'), 0) * 100) as buyer_win_rate,
        SUM(dispute_amount) as total_disputed_amount,
        SUM(awarded_amount) FILTER (WHERE resolution_decision IN ('full_refund', 'partial_refund')) as total_refunded_amount,
        (COUNT(*) FILTER (WHERE status = 'appealed')::DECIMAL / 
            NULLIF(COUNT(*) FILTER (WHERE appeal_allowed = true), 0) * 100) as appeal_rate
    FROM marketplace.dispute_resolution
    WHERE filed_at::DATE BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE marketplace.dispute_resolution IS 'Complete dispute resolution management for marketplace transactions';

-- Column comments
COMMENT ON COLUMN marketplace.dispute_resolution.id IS 'Unique identifier for the dispute';
COMMENT ON COLUMN marketplace.dispute_resolution.case_number IS 'Human-readable case number (format: DIS-YYYY-NNNNNN)';
COMMENT ON COLUMN marketplace.dispute_resolution.dispute_type IS 'Category of dispute';
COMMENT ON COLUMN marketplace.dispute_resolution.priority_level IS 'Urgency level for handling the dispute';
COMMENT ON COLUMN marketplace.dispute_resolution.evidence_submitted IS 'JSON object containing all submitted evidence';
COMMENT ON COLUMN marketplace.dispute_resolution.resolution_method IS 'How the dispute was resolved';
COMMENT ON COLUMN marketplace.dispute_resolution.resolution_decision IS 'Final decision on the dispute';
COMMENT ON COLUMN marketplace.dispute_resolution.fee_split IS 'How resolution fees are divided between parties';
COMMENT ON COLUMN marketplace.dispute_resolution.communication_log IS 'Complete log of all communications';
COMMENT ON COLUMN marketplace.dispute_resolution.account_actions IS 'Actions taken against user accounts';
COMMENT ON COLUMN marketplace.dispute_resolution.resolution_time IS 'Calculated time from filing to resolution';

-- Function comments
COMMENT ON FUNCTION marketplace.file_dispute IS 'File a new dispute for a transaction';
COMMENT ON FUNCTION marketplace.resolve_dispute IS 'Resolve a dispute with a decision';
COMMENT ON FUNCTION marketplace.get_dispute_metrics IS 'Calculate dispute resolution metrics';

-- =============================================================================
-- SAMPLE DATA FOR TESTING (commented out for production)
-- =============================================================================

/*
-- Example: Non-delivery dispute
INSERT INTO marketplace.dispute_resolution (
    marketplace_transaction_id, complainant_user_id, respondent_user_id,
    dispute_type, dispute_amount, dispute_reason,
    evidence_submitted
) VALUES (
    'transaction-uuid', 'buyer-uuid', 'seller-uuid',
    'non_delivery', 250.00, 'Tickets were not transferred after payment',
    '{"payment_proof": "receipt_url", "communication": ["email1", "email2"]}'::jsonb
);

-- Example: Fraud dispute with high priority
INSERT INTO marketplace.dispute_resolution (
    marketplace_transaction_id, complainant_user_id, respondent_user_id,
    dispute_type, priority_level, dispute_amount, dispute_reason,
    mediation_required, requires_legal_review
) VALUES (
    'fraud-transaction-uuid', 'buyer-uuid-2', 'seller-uuid-2',
    'fraud', 'critical', 5000.00, 'Seller used stolen credit card information',
    true, true
);

-- Example: Add message to dispute
INSERT INTO marketplace.dispute_messages (
    dispute_id, sender_user_id, message_type, message_content
) VALUES (
    'dispute-uuid', 'buyer-uuid', 'user_message',
    'I have provided all evidence showing the payment was completed but tickets were never received.'
);
*/

-- =============================================================================
-- END OF SCHEMA

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_dispute_resolution_tenant_id ON dispute_resolution(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dispute_resolution_tenant_created ON dispute_resolution(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =============================================================================
