-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customer Segments Schema for TicketToken
-- Week 3, Day 11
-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- This schema defines customer segmentation tables for targeted marketing,
-- personalization, and customer analytics. It includes both individual
-- customer segment assignments and reusable segment definitions.
-- =====================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Create ENUM type for segment types
DO $$ BEGIN
    CREATE TYPE segment_type_enum AS ENUM ('automatic', 'manual', 'behavioral');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create segment_definitions table (master list of available segments)
CREATE TABLE IF NOT EXISTS segment_definitions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Segment identification
    segment_key VARCHAR(50) UNIQUE NOT NULL, -- Unique identifier like 'new_customer', 'vip'
    display_name VARCHAR(100) NOT NULL, -- Human-readable name
    description TEXT, -- Detailed description of the segment
    
    -- Segment configuration
    segment_type segment_type_enum NOT NULL DEFAULT 'automatic', -- How the segment is populated
    criteria JSONB NOT NULL DEFAULT '{}', -- Rules for automatic/behavioral segments
    
    -- Visual representation
    color_code VARCHAR(7) DEFAULT '#6B7280', -- Hex color for UI display
    icon_name VARCHAR(50) DEFAULT 'users', -- Icon identifier for UI
    
    -- Priority and ordering
    priority INTEGER DEFAULT 100, -- Lower number = higher priority
    display_order INTEGER DEFAULT 1000, -- For UI sorting
    
    -- Campaign settings
    default_campaign_eligible BOOLEAN DEFAULT true, -- Default campaign eligibility
    requires_opt_in BOOLEAN DEFAULT false, -- Whether explicit opt-in is required
    
    -- Status
    is_active BOOLEAN DEFAULT true, -- Whether this segment is currently in use
    is_system BOOLEAN DEFAULT false, -- System segments cannot be deleted
    
    -- Metadata
    tags TEXT[], -- Tags for categorization
    metadata JSONB DEFAULT '{}', -- Additional configuration data
    
    -- Audit fields
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT chk_color_code_format 
        CHECK (color_code ~* '^#[0-9A-Fa-f]{6}$'),
    
    CONSTRAINT chk_priority_positive 
        CHECK (priority > 0),
    
    CONSTRAINT chk_display_order_positive 
        CHECK (display_order >= 0)
);

-- Create customer_segments table (individual customer segment assignments)
CREATE TABLE IF NOT EXISTS customer_segments (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    customer_profile_id UUID NOT NULL, -- Link to customer
    segment_definition_id UUID NOT NULL, -- Link to segment definition
    
    -- Segment details (denormalized for performance)
    segment_name VARCHAR(100) NOT NULL, -- Cached from segment_definitions
    segment_type segment_type_enum NOT NULL, -- Cached from segment_definitions
    
    -- Segment rules (for dynamic segments)
    criteria JSONB DEFAULT '{}', -- Snapshot of criteria at assignment time
    
    -- Assignment information
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When customer was added to segment
    assigned_by UUID, -- User who assigned (NULL for automatic)
    assignment_reason TEXT, -- Why the customer was added to this segment
    assignment_method VARCHAR(50), -- 'automatic', 'manual', 'import', 'api', etc.
    
    -- Engagement tracking
    last_engaged_at TIMESTAMP WITH TIME ZONE, -- Last interaction while in this segment
    engagement_score DECIMAL(5, 2) DEFAULT 0.00, -- 0-100 engagement score
    engagement_metrics JSONB DEFAULT '{}', -- Detailed engagement data
    
    -- Segment metadata (cached from definition)
    priority INTEGER DEFAULT 100, -- Segment priority
    color_code VARCHAR(7) DEFAULT '#6B7280', -- Hex color
    icon_name VARCHAR(50) DEFAULT 'users', -- Icon identifier
    
    -- Status fields
    is_active BOOLEAN DEFAULT true, -- Whether assignment is currently active
    expires_at TIMESTAMP WITH TIME ZONE, -- When segment assignment expires
    removal_reason TEXT, -- Why customer was removed from segment
    removed_at TIMESTAMP WITH TIME ZONE, -- When customer was removed
    removed_by UUID, -- Who removed the customer
    
    -- Campaign eligibility
    eligible_for_campaigns BOOLEAN DEFAULT true, -- Can receive campaigns for this segment
    suppression_reason TEXT, -- Why customer is suppressed from campaigns
    suppressed_at TIMESTAMP WITH TIME ZONE, -- When suppression started
    suppressed_until TIMESTAMP WITH TIME ZONE, -- When suppression ends
    
    -- Performance tracking
    campaigns_received INTEGER DEFAULT 0, -- Number of campaigns received
    campaigns_engaged INTEGER DEFAULT 0, -- Number of campaigns engaged with
    last_campaign_at TIMESTAMP WITH TIME ZONE, -- Last campaign sent
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_segment_customer_profile 
        FOREIGN KEY (customer_profile_id) 
        REFERENCES customer_profiles(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_segment_definition 
        FOREIGN KEY (segment_definition_id) 
        REFERENCES segment_definitions(id) 
        ON DELETE RESTRICT,
    
    CONSTRAINT fk_segment_assigned_by 
        FOREIGN KEY (assigned_by) 
        REFERENCES users(id) 
        ON DELETE SET NULL,
    
    CONSTRAINT fk_segment_removed_by 
        FOREIGN KEY (removed_by) 
        REFERENCES users(id) 
        ON DELETE SET NULL,
    
    CONSTRAINT uq_customer_segment_active 
        UNIQUE (customer_profile_id, segment_definition_id) 
        WHERE is_active = true,
    
    CONSTRAINT chk_engagement_score_range 
        CHECK (engagement_score >= 0 AND engagement_score <= 100),
    
    CONSTRAINT chk_expiry_future 
        CHECK (expires_at IS NULL OR expires_at > assigned_at),
    
    CONSTRAINT chk_removal_consistency 
        CHECK (
            (is_active = true AND removed_at IS NULL AND removal_reason IS NULL) OR
            (is_active = false AND removed_at IS NOT NULL AND removal_reason IS NOT NULL)
        ),
    
    CONSTRAINT chk_suppression_consistency 
        CHECK (
            (suppression_reason IS NULL AND suppressed_at IS NULL) OR
            (suppression_reason IS NOT NULL AND suppressed_at IS NOT NULL)
        ),
    
    CONSTRAINT chk_campaign_counts 
        CHECK (campaigns_engaged <= campaigns_received)
);

-- Create indexes for performance
-- Indexes for segment_definitions
CREATE INDEX idx_segment_definitions_key 
    ON segment_definitions(segment_key) 
    WHERE is_active = true;

CREATE INDEX idx_segment_definitions_type 
    ON segment_definitions(segment_type) 
    WHERE is_active = true;

CREATE INDEX idx_segment_definitions_priority 
    ON segment_definitions(priority) 
    WHERE is_active = true;

CREATE INDEX idx_segment_definitions_system 
    ON segment_definitions(is_system) 
    WHERE is_system = true;

-- Indexes for customer_segments
CREATE INDEX idx_customer_segments_profile 
    ON customer_segments(customer_profile_id) 
    WHERE is_active = true;

CREATE INDEX idx_customer_segments_definition 
    ON customer_segments(segment_definition_id) 
    WHERE is_active = true;

CREATE INDEX idx_customer_segments_name 
    ON customer_segments(segment_name) 
    WHERE is_active = true;

CREATE INDEX idx_customer_segments_type 
    ON customer_segments(segment_type) 
    WHERE is_active = true;

CREATE INDEX idx_customer_segments_assigned 
    ON customer_segments(assigned_at DESC) 
    WHERE is_active = true;

CREATE INDEX idx_customer_segments_expires 
    ON customer_segments(expires_at) 
    WHERE is_active = true AND expires_at IS NOT NULL;

CREATE INDEX idx_customer_segments_campaign_eligible 
    ON customer_segments(eligible_for_campaigns, segment_definition_id) 
    WHERE is_active = true AND eligible_for_campaigns = true;

CREATE INDEX idx_customer_segments_engagement 
    ON customer_segments(engagement_score DESC) 
    WHERE is_active = true;

CREATE INDEX idx_customer_segments_priority 
    ON customer_segments(priority, customer_profile_id) 
    WHERE is_active = true;

-- Composite index for finding customers in specific segments
CREATE INDEX idx_customer_segments_lookup 
    ON customer_segments(segment_definition_id, customer_profile_id) 
    WHERE is_active = true;

-- GIN indexes for JSONB fields
CREATE INDEX idx_segment_definitions_criteria 
    ON segment_definitions USING GIN (criteria);

CREATE INDEX idx_segment_definitions_metadata 
    ON segment_definitions USING GIN (metadata);

CREATE INDEX idx_customer_segments_criteria 
    ON customer_segments USING GIN (criteria);

CREATE INDEX idx_customer_segments_metrics 
    ON customer_segments USING GIN (engagement_metrics);

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_segment_definitions_updated_at 
    BEFORE UPDATE ON segment_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_segments_updated_at 
    BEFORE UPDATE ON customer_segments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments to tables and columns
COMMENT ON TABLE segment_definitions IS 'Master list of available customer segments with their rules and configuration';
COMMENT ON TABLE customer_segments IS 'Individual customer assignments to segments with engagement tracking';

-- Comments for segment_definitions
COMMENT ON COLUMN segment_definitions.id IS 'Unique identifier for the segment definition';
COMMENT ON COLUMN segment_definitions.segment_key IS 'Unique key identifier (e.g., new_customer, vip)';
COMMENT ON COLUMN segment_definitions.display_name IS 'Human-readable name for UI display';
COMMENT ON COLUMN segment_definitions.description IS 'Detailed description of segment purpose and criteria';
COMMENT ON COLUMN segment_definitions.segment_type IS 'How the segment is populated (automatic, manual, behavioral)';
COMMENT ON COLUMN segment_definitions.criteria IS 'JSON rules for automatic segment assignment';
COMMENT ON COLUMN segment_definitions.color_code IS 'Hex color code for UI representation';
COMMENT ON COLUMN segment_definitions.icon_name IS 'Icon identifier for UI display';
COMMENT ON COLUMN segment_definitions.priority IS 'Segment priority (lower = higher priority)';
COMMENT ON COLUMN segment_definitions.display_order IS 'Order for UI display';
COMMENT ON COLUMN segment_definitions.default_campaign_eligible IS 'Default campaign eligibility for new assignments';
COMMENT ON COLUMN segment_definitions.requires_opt_in IS 'Whether customers must explicitly opt into this segment';
COMMENT ON COLUMN segment_definitions.is_active IS 'Whether this segment is currently in use';
COMMENT ON COLUMN segment_definitions.is_system IS 'System segments cannot be deleted';
COMMENT ON COLUMN segment_definitions.tags IS 'Tags for categorization and filtering';
COMMENT ON COLUMN segment_definitions.metadata IS 'Additional configuration data';

-- Comments for customer_segments
COMMENT ON COLUMN customer_segments.id IS 'Unique identifier for the segment assignment';
COMMENT ON COLUMN customer_segments.customer_profile_id IS 'Reference to the customer profile';
COMMENT ON COLUMN customer_segments.segment_definition_id IS 'Reference to the segment definition';
COMMENT ON COLUMN customer_segments.segment_name IS 'Cached segment name for performance';
COMMENT ON COLUMN customer_segments.segment_type IS 'Cached segment type for performance';
COMMENT ON COLUMN customer_segments.criteria IS 'Snapshot of criteria at assignment time';
COMMENT ON COLUMN customer_segments.assigned_at IS 'When the customer was added to this segment';
COMMENT ON COLUMN customer_segments.assigned_by IS 'User who assigned the segment (NULL for automatic)';
COMMENT ON COLUMN customer_segments.assignment_reason IS 'Explanation of why customer was added';
COMMENT ON COLUMN customer_segments.assignment_method IS 'How the assignment was made (automatic, manual, import, api)';
COMMENT ON COLUMN customer_segments.last_engaged_at IS 'Last customer interaction while in this segment';
COMMENT ON COLUMN customer_segments.engagement_score IS 'Calculated engagement score (0-100)';
COMMENT ON COLUMN customer_segments.engagement_metrics IS 'Detailed engagement metrics JSON';
COMMENT ON COLUMN customer_segments.priority IS 'Cached segment priority';
COMMENT ON COLUMN customer_segments.color_code IS 'Cached hex color for UI';
COMMENT ON COLUMN customer_segments.icon_name IS 'Cached icon identifier';
COMMENT ON COLUMN customer_segments.is_active IS 'Whether this assignment is currently active';
COMMENT ON COLUMN customer_segments.expires_at IS 'When this segment assignment expires';
COMMENT ON COLUMN customer_segments.removal_reason IS 'Why the customer was removed from segment';
COMMENT ON COLUMN customer_segments.removed_at IS 'When the customer was removed';
COMMENT ON COLUMN customer_segments.removed_by IS 'User who removed the customer';
COMMENT ON COLUMN customer_segments.eligible_for_campaigns IS 'Whether customer can receive campaigns for this segment';
COMMENT ON COLUMN customer_segments.suppression_reason IS 'Why customer is suppressed from campaigns';
COMMENT ON COLUMN customer_segments.suppressed_at IS 'When suppression started';
COMMENT ON COLUMN customer_segments.suppressed_until IS 'When suppression ends';
COMMENT ON COLUMN customer_segments.campaigns_received IS 'Count of campaigns sent to customer';
COMMENT ON COLUMN customer_segments.campaigns_engaged IS 'Count of campaigns customer engaged with';
COMMENT ON COLUMN customer_segments.last_campaign_at IS 'Timestamp of last campaign sent';

-- Insert default segment definitions
INSERT INTO segment_definitions (segment_key, display_name, description, segment_type, criteria, color_code, icon_name, priority, is_system)
VALUES 
    (
        'new_customer',
        'New Customer',
        'Customers who registered within the last 30 days',
        'automatic',
        '{"rules": [{"field": "customer_since", "operator": ">=", "value": "now() - interval ''30 days''"}]}',
        '#10B981',
        'user-plus',
        10,
        true
    ),
    (
        'vip',
        'VIP Customer',
        'High-value customers with significant purchase history',
        'automatic',
        '{"rules": [{"field": "total_spent", "operator": ">=", "value": 1000}, {"field": "total_events_attended", "operator": ">=", "value": 5}]}',
        '#F59E0B',
        'star',
        1,
        true
    ),
    (
        'at_risk',
        'At Risk',
        'Previously active customers who haven''t engaged recently',
        'behavioral',
        '{"rules": [{"field": "last_purchase_at", "operator": "<", "value": "now() - interval ''90 days''"}, {"field": "total_events_attended", "operator": ">=", "value": 1}]}',
        '#EF4444',
        'alert-triangle',
        5,
        true
    ),
    (
        'high_value',
        'High Value',
        'Customers with high lifetime value',
        'automatic',
        '{"rules": [{"field": "total_spent", "operator": ">=", "value": 500}]}',
        '#8B5CF6',
        'trending-up',
        20,
        true
    ),
    (
        'frequent_attendee',
        'Frequent Attendee',
        'Customers who attend events regularly',
        'behavioral',
        '{"rules": [{"field": "total_events_attended", "operator": ">=", "value": 10}, {"field": "last_purchase_at", "operator": ">=", "value": "now() - interval ''60 days''"}]}',
        '#3B82F6',
        'calendar',
        30,
        false
    ),
    (
        'inactive',
        'Inactive',
        'Customers with no recent activity',
        'automatic',
        '{"rules": [{"field": "last_purchase_at", "operator": "<", "value": "now() - interval ''180 days''"}, {"or": [{"field": "last_purchase_at", "operator": "is", "value": "null"}]}]}',
        '#6B7280',
        'user-x',
        90,
        false
    )
ON CONFLICT (segment_key) DO NOTHING;

-- Grant appropriate permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON segment_definitions TO tickettoken_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON customer_segments TO tickettoken_app;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant_id ON customer_segments(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_segments_tenant_created ON customer_segments(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

