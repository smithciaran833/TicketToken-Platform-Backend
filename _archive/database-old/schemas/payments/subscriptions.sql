-- TicketToken Recurring Billing Subscriptions Schema
-- This table manages all subscription-based services and recurring billing
-- Subscription Lifecycle: created -> trialing -> active -> cancelled/past_due -> expired
-- Billing Workflow: Generate invoice -> Charge payment method -> Update subscription status
-- Created: 2025-07-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists (for development/testing)
-- DROP TABLE IF EXISTS subscriptions CASCADE;

-- Create the subscriptions table
CREATE TABLE subscriptions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    user_id UUID NOT NULL,  -- User who owns the subscription
    venue_id UUID,  -- Venue if this is a venue-specific subscription
    payment_method_id UUID,  -- Default payment method for billing
    
    -- Subscription type and tier
    subscription_type VARCHAR(50) NOT NULL CHECK (subscription_type IN (
        'venue_premium',      -- Premium venue features
        'venue_plus',         -- Mid-tier venue features
        'venue_basic',        -- Basic venue features
        'analytics_pro',      -- Advanced analytics package
        'analytics_standard', -- Standard analytics
        'marketing_tools',    -- Marketing automation tools
        'api_access',         -- API access tier
        'enterprise',         -- Enterprise custom plan
        'platform_bundle',    -- Bundled services
        'event_insurance',    -- Event insurance coverage
        'priority_support',   -- Priority customer support
        'custom'              -- Custom subscription plan
    )),
    
    -- Plan details
    plan_name VARCHAR(255) NOT NULL,  -- Human-readable plan name
    plan_code VARCHAR(100) NOT NULL,  -- Internal plan code
    plan_features JSONB DEFAULT '[]'::jsonb,  -- Array of included features
    /* Example plan_features:
    [
        {"feature": "unlimited_events", "enabled": true},
        {"feature": "custom_branding", "enabled": true},
        {"feature": "api_calls", "limit": 10000},
        {"feature": "support_level", "value": "priority"},
        {"feature": "analytics_retention_days", "value": 365}
    ]
    */
    
    -- Billing information
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),  -- Subscription price
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 currency code
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN (
        'weekly',      -- Weekly billing
        'biweekly',    -- Every two weeks
        'monthly',     -- Monthly billing
        'quarterly',   -- Every 3 months
        'semiannual',  -- Every 6 months
        'annual',      -- Yearly billing
        'biennial',    -- Every 2 years
        'custom'       -- Custom interval
    )),
    billing_interval INTEGER,  -- Custom interval in days
    billing_anchor_day INTEGER CHECK (billing_anchor_day >= 1 AND billing_anchor_day <= 31),  -- Day of month for billing
    
    -- Provider integration
    stripe_subscription_id VARCHAR(255),  -- Stripe subscription ID (sub_xxx)
    stripe_customer_id VARCHAR(255),  -- Stripe customer ID (cus_xxx)
    stripe_price_id VARCHAR(255),  -- Stripe price ID (price_xxx)
    provider_name VARCHAR(50) DEFAULT 'stripe',  -- Payment provider
    provider_metadata JSONB DEFAULT '{}'::jsonb,  -- Provider-specific data
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'incomplete' CHECK (status IN (
        'incomplete',         -- Setup not finished
        'incomplete_expired', -- Setup expired
        'trialing',          -- In trial period
        'active',            -- Active and paid
        'past_due',          -- Payment failed, still trying
        'unpaid',            -- Payment failed, stopped trying
        'cancelled',         -- Cancelled by user
        'paused',            -- Temporarily paused
        'expired',           -- Subscription ended
        'pending',           -- Awaiting first payment
        'suspended'          -- Suspended by admin
    )),
    status_reason TEXT,  -- Detailed reason for current status
    previous_status VARCHAR(20),  -- Status before current
    
    -- Trial management
    trial_start TIMESTAMP WITH TIME ZONE,  -- Trial period start
    trial_end TIMESTAMP WITH TIME ZONE,  -- Trial period end
    trial_days INTEGER DEFAULT 0,  -- Total trial days offered
    trial_used BOOLEAN DEFAULT FALSE,  -- Whether trial has been used
    trial_days_remaining INTEGER GENERATED ALWAYS AS (
        CASE 
            WHEN trial_end IS NULL THEN 0
            WHEN CURRENT_TIMESTAMP > trial_end THEN 0
            ELSE GREATEST(0, EXTRACT(DAY FROM (trial_end - CURRENT_TIMESTAMP))::INTEGER)
        END
    ) STORED,  -- Calculated days remaining in trial
    trial_conversion_tracked BOOLEAN DEFAULT FALSE,  -- Whether conversion was tracked
    
    -- Billing cycle management
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,  -- Current billing period start
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,  -- Current billing period end
    next_billing_date TIMESTAMP WITH TIME ZONE,  -- Next charge attempt
    billing_cycles_completed INTEGER DEFAULT 0,  -- Number of successful billing cycles
    last_invoice_id UUID,  -- Reference to last invoice
    last_payment_date TIMESTAMP WITH TIME ZONE,  -- Last successful payment
    last_payment_amount DECIMAL(10, 2),  -- Amount of last payment
    failed_payment_count INTEGER DEFAULT 0,  -- Consecutive failed payments
    
    -- Discount and promotion handling
    coupon_id VARCHAR(255),  -- Applied coupon code
    coupon_name VARCHAR(255),  -- Coupon display name
    discount_amount DECIMAL(10, 2),  -- Fixed discount amount
    discount_percentage DECIMAL(5, 2) CHECK (discount_percentage >= 0 AND discount_percentage <= 100),  -- Percentage discount
    discount_end_date DATE,  -- When discount expires
    promotional_credit DECIMAL(10, 2) DEFAULT 0,  -- Account credit balance
    referral_code VARCHAR(100),  -- Referral code used
    referrer_user_id UUID,  -- User who referred
    
    -- Price calculations
    base_amount DECIMAL(10, 2) NOT NULL,  -- Base price before discounts
    discounted_amount DECIMAL(10, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN discount_percentage IS NOT NULL THEN base_amount * (1 - discount_percentage / 100)
            WHEN discount_amount IS NOT NULL THEN GREATEST(0, base_amount - discount_amount)
            ELSE base_amount
        END
    ) STORED,  -- Price after discount
    tax_rate DECIMAL(5, 2) DEFAULT 0,  -- Tax rate percentage
    tax_amount DECIMAL(10, 2) DEFAULT 0,  -- Calculated tax
    total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN discount_percentage IS NOT NULL THEN base_amount * (1 - discount_percentage / 100) * (1 + tax_rate / 100)
            WHEN discount_amount IS NOT NULL THEN GREATEST(0, base_amount - discount_amount) * (1 + tax_rate / 100)
            ELSE base_amount * (1 + tax_rate / 100)
        END
    ) STORED,  -- Total after discount and tax
    
    -- Cancellation management
    cancel_at_period_end BOOLEAN DEFAULT FALSE,  -- Whether to cancel at end of period
    cancel_at TIMESTAMP WITH TIME ZONE,  -- Scheduled cancellation time
    cancelled_at TIMESTAMP WITH TIME ZONE,  -- When cancellation occurred
    cancel_reason VARCHAR(100) CHECK (cancel_reason IN (
        'too_expensive',           -- Price was too high
        'missing_features',        -- Needed features not available
        'switched_competitor',     -- Moved to competitor
        'no_longer_needed',        -- No longer need service
        'poor_experience',         -- Bad user experience
        'technical_issues',        -- Too many technical problems
        'insufficient_value',      -- Not worth the cost
        'temporary_pause',         -- Temporarily don't need
        'billing_issues',          -- Payment problems
        'customer_service',        -- Poor support experience
        'other'                    -- Other reason
    )),
    cancel_reason_details TEXT,  -- Detailed cancellation feedback
    cancel_feedback_score INTEGER CHECK (cancel_feedback_score >= 1 AND cancel_feedback_score <= 5),  -- Satisfaction score
    win_back_eligible BOOLEAN DEFAULT TRUE,  -- Eligible for win-back campaigns
    win_back_offer_sent_at TIMESTAMP WITH TIME ZONE,  -- When win-back offer was sent
    
    -- Usage and limits
    usage_data JSONB DEFAULT '{}'::jsonb,  -- Current usage metrics
    /* Example usage_data:
    {
        "api_calls": {"used": 8543, "limit": 10000},
        "events_created": {"used": 45, "limit": 100},
        "storage_gb": {"used": 2.5, "limit": 10},
        "team_members": {"used": 5, "limit": 10}
    }
    */
    overage_charges DECIMAL(10, 2) DEFAULT 0,  -- Additional charges for overages
    usage_reset_date TIMESTAMP WITH TIME ZONE,  -- When usage counters reset
    
    -- Subscription modifications
    upgrade_available BOOLEAN DEFAULT TRUE,  -- Can upgrade to higher tier
    downgrade_available BOOLEAN DEFAULT TRUE,  -- Can downgrade to lower tier
    modification_pending BOOLEAN DEFAULT FALSE,  -- Plan change scheduled
    modification_effective_date TIMESTAMP WITH TIME ZONE,  -- When plan change takes effect
    previous_plan_code VARCHAR(100),  -- Plan before modification
    
    -- Revenue recognition
    mrr DECIMAL(10, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN status IN ('active', 'trialing', 'past_due') THEN
                CASE billing_cycle
                    WHEN 'monthly' THEN total_amount
                    WHEN 'quarterly' THEN total_amount / 3
                    WHEN 'semiannual' THEN total_amount / 6
                    WHEN 'annual' THEN total_amount / 12
                    WHEN 'biennial' THEN total_amount / 24
                    ELSE 0
                END
            ELSE 0
        END
    ) STORED,  -- Monthly Recurring Revenue
    ltv_estimate DECIMAL(10, 2),  -- Estimated lifetime value
    churn_risk_score INTEGER CHECK (churn_risk_score >= 0 AND churn_risk_score <= 100),  -- Churn prediction score
    
    -- Metadata and settings
    auto_renew BOOLEAN DEFAULT TRUE,  -- Whether subscription auto-renews
    reminder_sent_dates JSONB DEFAULT '[]'::jsonb,  -- Array of reminder timestamps
    metadata JSONB DEFAULT '{}'::jsonb,  -- Additional subscription data
    tags JSONB DEFAULT '[]'::jsonb,  -- Tags for segmentation
    notes TEXT,  -- Internal notes
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP WITH TIME ZONE,  -- When first activated
    last_modified_at TIMESTAMP WITH TIME ZONE,  -- Last plan modification
    paused_at TIMESTAMP WITH TIME ZONE,  -- When paused
    resumed_at TIMESTAMP WITH TIME ZONE,  -- When resumed from pause
    expired_at TIMESTAMP WITH TIME ZONE,  -- When subscription expired
    
    -- Foreign key constraints
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT,
    CONSTRAINT fk_referrer_user FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_last_invoice FOREIGN KEY (last_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    
    -- Business rule constraints
    CONSTRAINT chk_trial_dates CHECK (
        (trial_start IS NULL AND trial_end IS NULL) OR
        (trial_start IS NOT NULL AND trial_end IS NOT NULL AND trial_end > trial_start)
    ),
    CONSTRAINT chk_billing_period CHECK (current_period_end > current_period_start),
    CONSTRAINT chk_base_amount CHECK (base_amount >= 0),
    CONSTRAINT chk_promotional_credit CHECK (promotional_credit >= 0),
    CONSTRAINT chk_discount_values CHECK (
        (discount_amount IS NULL OR discount_amount >= 0) AND
        (discount_percentage IS NULL OR (discount_percentage >= 0 AND discount_percentage <= 100))
    ),
    CONSTRAINT chk_only_one_discount CHECK (
        (discount_amount IS NULL OR discount_percentage IS NULL)
    ),
    CONSTRAINT chk_cancel_reason_required CHECK (
        (cancelled_at IS NULL) OR 
        (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
    ),
    CONSTRAINT chk_venue_required_for_venue_plans CHECK (
        (subscription_type NOT LIKE 'venue_%') OR 
        (subscription_type LIKE 'venue_%' AND venue_id IS NOT NULL)
    )
);

-- Create indexes for performance optimization

-- Primary lookup indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_venue_id ON subscriptions(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX idx_subscriptions_payment_method ON subscriptions(payment_method_id);

-- Status and billing indexes
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_active ON subscriptions(user_id, status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date) WHERE status IN ('active', 'trialing', 'past_due');
CREATE INDEX idx_subscriptions_past_due ON subscriptions(status, failed_payment_count) WHERE status = 'past_due';

-- Provider reference indexes
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Trial management indexes
CREATE INDEX idx_subscriptions_trial_ending ON subscriptions(trial_end) WHERE status = 'trialing' AND trial_end IS NOT NULL;
CREATE INDEX idx_subscriptions_trial_conversion ON subscriptions(trial_conversion_tracked, trial_end) WHERE trial_used = TRUE;

-- Cancellation and retention indexes
CREATE INDEX idx_subscriptions_cancel_pending ON subscriptions(cancel_at_period_end) WHERE cancel_at_period_end = TRUE;
CREATE INDEX idx_subscriptions_cancelled ON subscriptions(cancelled_at, cancel_reason) WHERE cancelled_at IS NOT NULL;
CREATE INDEX idx_subscriptions_win_back ON subscriptions(win_back_eligible, cancelled_at) WHERE win_back_eligible = TRUE;

-- Revenue and analytics indexes
CREATE INDEX idx_subscriptions_mrr ON subscriptions(status, mrr) WHERE mrr > 0;
CREATE INDEX idx_subscriptions_churn_risk ON subscriptions(churn_risk_score) WHERE churn_risk_score > 70;
CREATE INDEX idx_subscriptions_type_status ON subscriptions(subscription_type, status);

-- Discount and promotion indexes
CREATE INDEX idx_subscriptions_coupon ON subscriptions(coupon_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX idx_subscriptions_discount_expiring ON subscriptions(discount_end_date) WHERE discount_end_date IS NOT NULL;
CREATE INDEX idx_subscriptions_referral ON subscriptions(referrer_user_id) WHERE referrer_user_id IS NOT NULL;

-- Plan modification indexes
CREATE INDEX idx_subscriptions_modifications ON subscriptions(modification_pending, modification_effective_date) WHERE modification_pending = TRUE;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at 
    BEFORE UPDATE ON subscriptions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_subscriptions_updated_at();

-- Create function to manage subscription lifecycle
CREATE OR REPLACE FUNCTION manage_subscription_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle status transitions
    IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
        NEW.previous_status = OLD.status;
        
        CASE NEW.status
            WHEN 'active' THEN
                IF NEW.activated_at IS NULL THEN
                    NEW.activated_at = CURRENT_TIMESTAMP;
                END IF;
                NEW.failed_payment_count = 0;
                
            WHEN 'cancelled' THEN
                IF NEW.cancelled_at IS NULL THEN
                    NEW.cancelled_at = CURRENT_TIMESTAMP;
                END IF;
                
            WHEN 'paused' THEN
                NEW.paused_at = CURRENT_TIMESTAMP;
                
            WHEN 'expired' THEN
                NEW.expired_at = CURRENT_TIMESTAMP;
                
            WHEN 'trialing' THEN
                IF NEW.trial_start IS NULL THEN
                    NEW.trial_start = CURRENT_TIMESTAMP;
                END IF;
                NEW.trial_used = TRUE;
        END CASE;
        
        -- Handle resumption from pause
        IF OLD.status = 'paused' AND NEW.status = 'active' THEN
            NEW.resumed_at = CURRENT_TIMESTAMP;
        END IF;
    END IF;
    
    -- Calculate next billing date based on cycle
    IF NEW.status IN ('active', 'trialing') AND NEW.current_period_end IS NOT NULL THEN
        NEW.next_billing_date = NEW.current_period_end;
    END IF;
    
    -- Track trial conversion
    IF OLD.status = 'trialing' AND NEW.status = 'active' AND NOT NEW.trial_conversion_tracked THEN
        NEW.trial_conversion_tracked = TRUE;
    END IF;
    
    -- Reset usage counters if needed
    IF NEW.usage_reset_date IS NOT NULL AND NEW.usage_reset_date <= CURRENT_TIMESTAMP THEN
        -- Reset usage data (this would be more complex in practice)
        NEW.usage_data = jsonb_set(NEW.usage_data, '{api_calls,used}', '0');
        NEW.usage_data = jsonb_set(NEW.usage_data, '{events_created,used}', '0');
        
        -- Set next reset date based on billing cycle
        CASE NEW.billing_cycle
            WHEN 'monthly' THEN
                NEW.usage_reset_date = NEW.usage_reset_date + INTERVAL '1 month';
            WHEN 'quarterly' THEN
                NEW.usage_reset_date = NEW.usage_reset_date + INTERVAL '3 months';
            WHEN 'annual' THEN
                NEW.usage_reset_date = NEW.usage_reset_date + INTERVAL '1 year';
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manage_subscription_lifecycle_trigger
    BEFORE INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION manage_subscription_lifecycle();

-- Create function to calculate billing periods
CREATE OR REPLACE FUNCTION calculate_next_billing_period(
    p_current_end TIMESTAMP WITH TIME ZONE,
    p_billing_cycle VARCHAR(20),
    p_billing_interval INTEGER DEFAULT NULL
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    v_next_end TIMESTAMP WITH TIME ZONE;
BEGIN
    CASE p_billing_cycle
        WHEN 'weekly' THEN
            v_next_end := p_current_end + INTERVAL '1 week';
        WHEN 'biweekly' THEN
            v_next_end := p_current_end + INTERVAL '2 weeks';
        WHEN 'monthly' THEN
            v_next_end := p_current_end + INTERVAL '1 month';
        WHEN 'quarterly' THEN
            v_next_end := p_current_end + INTERVAL '3 months';
        WHEN 'semiannual' THEN
            v_next_end := p_current_end + INTERVAL '6 months';
        WHEN 'annual' THEN
            v_next_end := p_current_end + INTERVAL '1 year';
        WHEN 'biennial' THEN
            v_next_end := p_current_end + INTERVAL '2 years';
        WHEN 'custom' THEN
            v_next_end := p_current_end + (p_billing_interval || ' days')::INTERVAL;
        ELSE
            v_next_end := p_current_end + INTERVAL '1 month';
    END CASE;
    
    RETURN v_next_end;
END;
$$ LANGUAGE plpgsql;

-- Create view for active subscriptions summary
CREATE OR REPLACE VIEW active_subscriptions_summary AS
SELECT 
    s.id,
    s.user_id,
    u.email as user_email,
    s.venue_id,
    v.name as venue_name,
    s.subscription_type,
    s.plan_name,
    s.status,
    s.mrr,
    s.next_billing_date,
    s.trial_days_remaining,
    s.failed_payment_count,
    s.churn_risk_score,
    s.created_at,
    s.activated_at
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
LEFT JOIN venues v ON s.venue_id = v.id
WHERE s.status IN ('active', 'trialing', 'past_due')
ORDER BY s.mrr DESC;

-- Add table comments
COMMENT ON TABLE subscriptions IS 'Manages all recurring billing subscriptions for platform services. Handles subscription lifecycle from trial through cancellation, including billing cycles, discounts, and usage tracking.';

-- Add column comments (selected key columns)
COMMENT ON COLUMN subscriptions.id IS 'Unique subscription identifier (UUID)';
COMMENT ON COLUMN subscriptions.subscription_type IS 'Type of subscription service';
COMMENT ON COLUMN subscriptions.billing_cycle IS 'Frequency of billing';
COMMENT ON COLUMN subscriptions.status IS 'Current subscription status in lifecycle';
COMMENT ON COLUMN subscriptions.trial_days_remaining IS 'Auto-calculated days left in trial';
COMMENT ON COLUMN subscriptions.mrr IS 'Monthly Recurring Revenue calculation';
COMMENT ON COLUMN subscriptions.current_period_start IS 'Start of current billing period';
COMMENT ON COLUMN subscriptions.next_billing_date IS 'When next payment will be attempted';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'Whether to cancel after current period';
COMMENT ON COLUMN subscriptions.usage_data IS 'Current usage metrics against limits';
COMMENT ON COLUMN subscriptions.churn_risk_score IS 'Predicted likelihood of cancellation';

-- Sample data for testing (commented out)
/*
-- Active venue premium subscription
INSERT INTO subscriptions (
    user_id, venue_id, payment_method_id,
    subscription_type, plan_name, plan_code,
    base_amount, amount, billing_cycle,
    stripe_subscription_id, stripe_customer_id,
    status, current_period_start, current_period_end
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    'venue_premium',
    'Venue Premium Monthly',
    'VENUE_PREMIUM_MONTHLY',
    99.00,
    99.00,
    'monthly',
    'sub_1234567890',
    'cus_1234567890',
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '1 month'
);

-- Trial analytics subscription with discount
INSERT INTO subscriptions (
    user_id, payment_method_id,
    subscription_type, plan_name, plan_code,
    base_amount, amount, billing_cycle,
    status, trial_start, trial_end, trial_days,
    coupon_id, discount_percentage,
    current_period_start, current_period_end
) VALUES (
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    '550e8400-e29b-41d4-a716-446655440005'::uuid,
    'analytics_pro',
    'Analytics Pro Annual',
    'ANALYTICS_PRO_ANNUAL',
    499.00,
    499.00,
    'annual',
    'trialing',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '14 days',
    14,
    'LAUNCH20',
    20.00,  -- 20% off
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '14 days'
);
*/

-- Subscription Lifecycle Notes:
-- 1. Trial Period: Optional free trial before billing starts
-- 2. Active: Successfully billing on schedule
-- 3. Past Due: Payment failed but still retrying
-- 4. Unpaid: Payment failed, service suspended
-- 5. Cancelled: User cancelled, may continue until period end
-- 6. Paused: Temporarily suspended with option to resume
-- 7. Win-back: Cancelled users eligible for special offers

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_created ON subscriptions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- 8. Usage-based: Track usage against plan limits for overages
