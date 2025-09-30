-- TicketToken Marketing Campaigns Schema
-- Week 3, Day 13: Marketing campaign management and tracking
-- Purpose: Manage multi-channel marketing campaigns with targeting, scheduling, and performance tracking

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS notifications;

-- Set search path
SET search_path TO notifications, public;

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Campaign details
    name VARCHAR(255) NOT NULL,                          -- Campaign name for internal use
    slug VARCHAR(255) UNIQUE NOT NULL,                   -- URL-friendly identifier
    description TEXT,                                    -- Detailed campaign description
    
    -- Campaign type and channel
    type VARCHAR(50) NOT NULL DEFAULT 'email',          -- email, sms, push, multi_channel
    
    -- Campaign status
    status VARCHAR(50) NOT NULL DEFAULT 'draft',        -- draft, scheduled, active, paused, completed, cancelled
    
    -- Targeting and audience
    audience_segment_ids UUID[] DEFAULT '{}',           -- References to audience segments
    audience_count INTEGER DEFAULT 0,                    -- Total audience size
    audience_criteria JSONB DEFAULT '{}',                -- Dynamic audience criteria
    
    -- Schedule
    scheduled_at TIMESTAMP WITH TIME ZONE,               -- When campaign should start
    started_at TIMESTAMP WITH TIME ZONE,                 -- When campaign actually started
    completed_at TIMESTAMP WITH TIME ZONE,               -- When campaign finished
    
    -- Content
    template_id UUID,                                    -- Reference to notification template
    subject_line VARCHAR(500),                           -- Email subject or notification title
    preview_text VARCHAR(200),                           -- Preview text for emails
    
    -- A/B testing
    is_ab_test BOOLEAN DEFAULT FALSE,                    -- Whether this is an A/B test
    variants JSONB DEFAULT '{}',                         -- A/B test variant configurations
    winning_variant_id UUID,                             -- ID of winning variant (if A/B test)
    
    -- Goals and objectives
    goal_type VARCHAR(50),                               -- clicks, conversions, revenue, engagement
    goal_target INTEGER,                                 -- Target number for goal
    goal_achieved INTEGER DEFAULT 0,                     -- Actual achievement
    
    -- Budget and costs
    budget_amount DECIMAL(10, 2) DEFAULT 0,              -- Total budget allocated
    spent_amount DECIMAL(10, 2) DEFAULT 0,               -- Amount spent so far
    cost_per_send DECIMAL(10, 4) DEFAULT 0,              -- Average cost per notification
    
    -- Performance metrics
    sends_count INTEGER DEFAULT 0,                       -- Total notifications sent
    opens_count INTEGER DEFAULT 0,                       -- Total opens/views
    clicks_count INTEGER DEFAULT 0,                      -- Total clicks
    
    -- Conversion tracking
    conversions_count INTEGER DEFAULT 0,                 -- Total conversions
    revenue_generated DECIMAL(12, 2) DEFAULT 0,          -- Total revenue from campaign
    
    -- Suppression and exclusions
    suppression_list_ids UUID[] DEFAULT '{}',            -- Lists of contacts to exclude
    excluded_count INTEGER DEFAULT 0,                    -- Number of contacts excluded
    
    -- Approval workflow
    requires_approval BOOLEAN DEFAULT FALSE,             -- Whether campaign needs approval
    approved_by UUID,                                    -- User who approved
    approved_at TIMESTAMP WITH TIME ZONE,                -- When approved
    
    -- Tags and metadata
    tags TEXT[] DEFAULT '{}',                            -- Campaign tags for organization
    metadata JSONB DEFAULT '{}',                         -- Additional campaign data
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,                                     -- User who created campaign
    
    -- Constraints
    CONSTRAINT chk_campaign_type CHECK (type IN ('email', 'sms', 'push', 'multi_channel')),
    CONSTRAINT chk_campaign_status CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
    CONSTRAINT chk_goal_type CHECK (goal_type IS NULL OR goal_type IN ('clicks', 'conversions', 'revenue', 'engagement', 'opens')),
    CONSTRAINT chk_audience_count CHECK (audience_count >= 0),
    CONSTRAINT chk_budget_amount CHECK (budget_amount >= 0),
    CONSTRAINT chk_spent_amount CHECK (spent_amount >= 0),
    CONSTRAINT chk_sends_count CHECK (sends_count >= 0),
    CONSTRAINT chk_opens_count CHECK (opens_count >= 0),
    CONSTRAINT chk_clicks_count CHECK (clicks_count >= 0),
    CONSTRAINT chk_conversions_count CHECK (conversions_count >= 0),
    CONSTRAINT chk_revenue_generated CHECK (revenue_generated >= 0),
    CONSTRAINT chk_excluded_count CHECK (excluded_count >= 0),
    CONSTRAINT chk_cost_per_send CHECK (cost_per_send >= 0),
    CONSTRAINT chk_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT chk_approval_required CHECK (
        (requires_approval = FALSE) OR 
        (requires_approval = TRUE AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
        (requires_approval = TRUE AND status = 'draft')
    )
);

-- Add comments to table and columns
COMMENT ON TABLE campaigns IS 'Marketing campaigns for multi-channel customer communication';

COMMENT ON COLUMN campaigns.id IS 'Unique identifier for the campaign';
COMMENT ON COLUMN campaigns.name IS 'Human-readable campaign name for internal use';
COMMENT ON COLUMN campaigns.slug IS 'URL-friendly unique identifier for API and routing';
COMMENT ON COLUMN campaigns.description IS 'Detailed description of campaign purpose and goals';

COMMENT ON COLUMN campaigns.type IS 'Campaign channel type: email, sms, push, or multi_channel';
COMMENT ON COLUMN campaigns.status IS 'Current campaign status in lifecycle';

COMMENT ON COLUMN campaigns.audience_segment_ids IS 'Array of audience segment IDs to target';
COMMENT ON COLUMN campaigns.audience_count IS 'Total number of recipients in target audience';
COMMENT ON COLUMN campaigns.audience_criteria IS 'Dynamic criteria for audience selection (filters, rules)';

COMMENT ON COLUMN campaigns.scheduled_at IS 'Planned start time for the campaign';
COMMENT ON COLUMN campaigns.started_at IS 'Actual start time when campaign began sending';
COMMENT ON COLUMN campaigns.completed_at IS 'Time when campaign finished sending';

COMMENT ON COLUMN campaigns.template_id IS 'Reference to notification template to use';
COMMENT ON COLUMN campaigns.subject_line IS 'Email subject or push notification title';
COMMENT ON COLUMN campaigns.preview_text IS 'Preview text shown in email clients';

COMMENT ON COLUMN campaigns.is_ab_test IS 'Whether campaign is running A/B test variants';
COMMENT ON COLUMN campaigns.variants IS 'Configuration for each A/B test variant';
COMMENT ON COLUMN campaigns.winning_variant_id IS 'ID of variant that won A/B test';

COMMENT ON COLUMN campaigns.goal_type IS 'Primary goal metric: clicks, conversions, revenue, engagement';
COMMENT ON COLUMN campaigns.goal_target IS 'Target value for the primary goal';
COMMENT ON COLUMN campaigns.goal_achieved IS 'Actual value achieved for the goal';

COMMENT ON COLUMN campaigns.budget_amount IS 'Total budget allocated for campaign';
COMMENT ON COLUMN campaigns.spent_amount IS 'Amount spent so far on campaign';
COMMENT ON COLUMN campaigns.cost_per_send IS 'Average cost per notification sent';

COMMENT ON COLUMN campaigns.sends_count IS 'Total number of notifications sent';
COMMENT ON COLUMN campaigns.opens_count IS 'Total number of opens/views tracked';
COMMENT ON COLUMN campaigns.clicks_count IS 'Total number of clicks tracked';

COMMENT ON COLUMN campaigns.conversions_count IS 'Total conversions attributed to campaign';
COMMENT ON COLUMN campaigns.revenue_generated IS 'Total revenue attributed to campaign';

COMMENT ON COLUMN campaigns.suppression_list_ids IS 'IDs of suppression lists to exclude recipients';
COMMENT ON COLUMN campaigns.excluded_count IS 'Number of recipients excluded by suppression';

COMMENT ON COLUMN campaigns.requires_approval IS 'Whether campaign must be approved before sending';
COMMENT ON COLUMN campaigns.approved_by IS 'User who approved the campaign';
COMMENT ON COLUMN campaigns.approved_at IS 'Timestamp of approval';

COMMENT ON COLUMN campaigns.tags IS 'Tags for categorizing and filtering campaigns';
COMMENT ON COLUMN campaigns.metadata IS 'Additional flexible data specific to campaign';

COMMENT ON COLUMN campaigns.created_by IS 'User who created the campaign';

-- Create indexes for performance

-- Primary lookup indexes
CREATE INDEX idx_campaigns_slug ON campaigns(slug);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_type ON campaigns(type);

-- Date-based indexes for scheduling
CREATE INDEX idx_campaigns_scheduled_at ON campaigns(scheduled_at) 
    WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_campaigns_started_at ON campaigns(started_at DESC) 
    WHERE started_at IS NOT NULL;
CREATE INDEX idx_campaigns_completed_at ON campaigns(completed_at DESC) 
    WHERE completed_at IS NOT NULL;

-- Active campaigns index
CREATE INDEX idx_campaigns_active ON campaigns(scheduled_at, status) 
    WHERE status IN ('scheduled', 'active');

-- Performance query indexes
CREATE INDEX idx_campaigns_performance ON campaigns(sends_count DESC, opens_count DESC, clicks_count DESC) 
    WHERE status = 'completed';

-- A/B test campaigns
CREATE INDEX idx_campaigns_ab_tests ON campaigns(is_ab_test, created_at DESC) 
    WHERE is_ab_test = TRUE;

-- Approval workflow
CREATE INDEX idx_campaigns_pending_approval ON campaigns(created_at, requires_approval) 
    WHERE requires_approval = TRUE AND approved_at IS NULL;

-- Budget tracking
CREATE INDEX idx_campaigns_budget ON campaigns(budget_amount, spent_amount) 
    WHERE budget_amount > 0;

-- Tags index (GIN for array search)
CREATE INDEX idx_campaigns_tags ON campaigns USING GIN(tags);

-- Metadata index (GIN for JSONB search)
CREATE INDEX idx_campaigns_metadata ON campaigns USING GIN(metadata);

-- Created by user
CREATE INDEX idx_campaigns_created_by ON campaigns(created_by, created_at DESC);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaigns_updated_at 
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_campaigns_updated_at();

-- Create function to update audience count
CREATE OR REPLACE FUNCTION update_campaign_audience_count()
RETURNS TRIGGER AS $$
DECLARE
    total_count INTEGER;
BEGIN
    -- This is a placeholder - actual implementation would calculate from segments
    -- For now, just ensure the count is non-negative
    IF NEW.audience_count < 0 THEN
        NEW.audience_count = 0;
    END IF;
    
    -- Update excluded count if suppression lists change
    IF NEW.suppression_list_ids != OLD.suppression_list_ids THEN
        -- Placeholder: actual implementation would calculate from suppression lists
        NEW.excluded_count = COALESCE(array_length(NEW.suppression_list_ids, 1), 0) * 100;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_audience_count 
    BEFORE INSERT OR UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_campaign_audience_count();

-- Create function to calculate campaign metrics
CREATE OR REPLACE FUNCTION calculate_campaign_metrics(campaign_id UUID)
RETURNS TABLE (
    open_rate DECIMAL,
    click_rate DECIMAL,
    conversion_rate DECIMAL,
    roi DECIMAL,
    cost_per_conversion DECIMAL
) AS $$
DECLARE
    campaign_record RECORD;
BEGIN
    SELECT * INTO campaign_record FROM campaigns WHERE id = campaign_id;
    
    RETURN QUERY
    SELECT 
        CASE WHEN campaign_record.sends_count > 0 
            THEN ROUND((campaign_record.opens_count::DECIMAL / campaign_record.sends_count) * 100, 2)
            ELSE 0 
        END AS open_rate,
        CASE WHEN campaign_record.opens_count > 0 
            THEN ROUND((campaign_record.clicks_count::DECIMAL / campaign_record.opens_count) * 100, 2)
            ELSE 0 
        END AS click_rate,
        CASE WHEN campaign_record.sends_count > 0 
            THEN ROUND((campaign_record.conversions_count::DECIMAL / campaign_record.sends_count) * 100, 2)
            ELSE 0 
        END AS conversion_rate,
        CASE WHEN campaign_record.spent_amount > 0 
            THEN ROUND((campaign_record.revenue_generated - campaign_record.spent_amount) / campaign_record.spent_amount * 100, 2)
            ELSE 0 
        END AS roi,
        CASE WHEN campaign_record.conversions_count > 0 
            THEN ROUND(campaign_record.spent_amount / campaign_record.conversions_count, 2)
            ELSE 0 
        END AS cost_per_conversion;
END;
$$ LANGUAGE plpgsql;

-- Create view for active campaigns
CREATE OR REPLACE VIEW active_campaigns AS
SELECT 
    c.*,
    CASE 
        WHEN c.sends_count > 0 THEN ROUND((c.opens_count::DECIMAL / c.sends_count) * 100, 2)
        ELSE 0 
    END AS open_rate,
    CASE 
        WHEN c.opens_count > 0 THEN ROUND((c.clicks_count::DECIMAL / c.opens_count) * 100, 2)
        ELSE 0 
    END AS click_rate,
    CASE 
        WHEN c.budget_amount > 0 THEN ROUND((c.spent_amount / c.budget_amount) * 100, 2)
        ELSE 0 
    END AS budget_used_percentage
FROM campaigns c
WHERE c.status IN ('scheduled', 'active')
ORDER BY c.scheduled_at ASC;

COMMENT ON VIEW active_campaigns IS 'View of currently active and scheduled campaigns with calculated metrics';

-- Create foreign key constraints (commented out until related tables exist)
-- ALTER TABLE campaigns
--     ADD CONSTRAINT fk_campaigns_template
--     FOREIGN KEY (template_id) 
--     REFERENCES notification_templates(id) ON DELETE SET NULL;

-- ALTER TABLE campaigns
--     ADD CONSTRAINT fk_campaigns_created_by
--     FOREIGN KEY (created_by) 
--     REFERENCES users(id) ON DELETE SET NULL;

-- ALTER TABLE campaigns
--     ADD CONSTRAINT fk_campaigns_approved_by
--     FOREIGN KEY (approved_by) 
--     REFERENCES users(id) ON DELETE SET NULL;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON campaigns TO app_user;
-- GRANT SELECT ON active_campaigns TO app_user;
-- GRANT EXECUTE ON FUNCTION calculate_campaign_metrics(UUID) TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON campaigns(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_created ON campaigns(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

