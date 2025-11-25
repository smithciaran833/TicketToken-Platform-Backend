-- Migration: Create notification templates
-- Service: notification-service
-- Created: 2025-11-17

-- Create notification_templates table
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'sms', 'push', 'in_app')),
    subject VARCHAR(500),
    content TEXT NOT NULL,
    html_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    version INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    category VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en',
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT templates_name_version_unique UNIQUE (name, version)
);

-- Create template_versions table for version history
CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES notification_templates(id) ON DELETE CASCADE,
    version INT NOT NULL,
    content TEXT NOT NULL,
    html_content TEXT,
    variables JSONB,
    changed_by VARCHAR(255),
    change_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT template_versions_unique UNIQUE (template_id, version)
);

-- Create template_usage table for tracking
CREATE TABLE IF NOT EXISTS template_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES notification_templates(id) ON DELETE CASCADE,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notification_id UUID,
    campaign_id UUID,
    success BOOLEAN DEFAULT true,
    metadata JSONB
);

-- Create indexes
CREATE INDEX idx_templates_type ON notification_templates(type);
CREATE INDEX idx_templates_status ON notification_templates(status);
CREATE INDEX idx_templates_category ON notification_templates(category);
CREATE INDEX idx_templates_created_at ON notification_templates(created_at DESC);
CREATE INDEX idx_template_usage_template_id ON template_usage(template_id);
CREATE INDEX idx_template_usage_used_at ON template_usage(used_at DESC);
CREATE INDEX idx_template_versions_template_id ON template_versions(template_id);

-- Add comments
COMMENT ON TABLE notification_templates IS 'Notification templates with versioning support';
COMMENT ON TABLE template_versions IS 'Template version history';
COMMENT ON TABLE template_usage IS 'Template usage tracking for analytics';
