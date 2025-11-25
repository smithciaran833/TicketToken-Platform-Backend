-- Notification Templates Schema for TicketToken
-- This table stores reusable notification templates for various communication channels
-- Supports multi-channel, multi-language, and dynamic content generation

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types for categories and channels
DO $$ BEGIN
    CREATE TYPE notification_category AS ENUM ('transactional', 'marketing', 'system', 'reminder');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Drop existing table if it exists
DROP TABLE IF EXISTS notification_templates CASCADE;

-- Create the notification templates table
CREATE TABLE notification_templates (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Template identification
    name VARCHAR(255) UNIQUE NOT NULL
        CONSTRAINT chk_name_not_empty CHECK (TRIM(name) != ''),
    slug VARCHAR(255) UNIQUE NOT NULL
        CONSTRAINT chk_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    version INTEGER NOT NULL DEFAULT 1
        CONSTRAINT chk_version_positive CHECK (version > 0),
    
    -- Template categorization
    category notification_category NOT NULL,
    channel notification_channel NOT NULL,
    
    -- Content fields
    subject VARCHAR(255)
        CONSTRAINT chk_subject_required_for_email CHECK (
            channel != 'email' OR subject IS NOT NULL
        ),
    preview_text VARCHAR(255),
    body_html TEXT,
    body_text TEXT NOT NULL
        CONSTRAINT chk_body_text_not_empty CHECK (TRIM(body_text) != ''),
    
    -- Variable definitions
    available_variables JSONB NOT NULL DEFAULT '[]'::JSONB,
    required_variables TEXT[] NOT NULL DEFAULT '{}',
    
    -- Sender information
    from_name VARCHAR(100),
    from_email VARCHAR(255)
        CONSTRAINT chk_from_email_format CHECK (
            from_email IS NULL OR 
            from_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        ),
    reply_to_email VARCHAR(255)
        CONSTRAINT chk_reply_to_email_format CHECK (
            reply_to_email IS NULL OR 
            reply_to_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        ),
    
    -- Template settings
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    requires_consent BOOLEAN NOT NULL DEFAULT FALSE,
    priority INTEGER NOT NULL DEFAULT 5
        CONSTRAINT chk_priority_range CHECK (priority BETWEEN 1 AND 10),
    
    -- Localization support
    language VARCHAR(10) NOT NULL DEFAULT 'en'
        CONSTRAINT chk_language_format CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    parent_template_id UUID
        CONSTRAINT fk_parent_template FOREIGN KEY (parent_template_id) 
        REFERENCES notification_templates(id) ON DELETE CASCADE,
    
    -- Testing fields
    test_data JSONB DEFAULT '{}'::JSONB,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    
    -- Performance metrics
    sends_count INTEGER NOT NULL DEFAULT 0
        CONSTRAINT chk_sends_count_positive CHECK (sends_count >= 0),
    open_rate DECIMAL(5, 4) DEFAULT 0.0000
        CONSTRAINT chk_open_rate_valid CHECK (open_rate >= 0 AND open_rate <= 1),
    click_rate DECIMAL(5, 4) DEFAULT 0.0000
        CONSTRAINT chk_click_rate_valid CHECK (click_rate >= 0 AND click_rate <= 1),
    
    -- Compliance fields
    includes_unsubscribe BOOLEAN NOT NULL DEFAULT FALSE,
    regulatory_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approval_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional constraints
    CONSTRAINT chk_email_sender_required CHECK (
        channel != 'email' OR (from_name IS NOT NULL AND from_email IS NOT NULL)
    ),
    CONSTRAINT chk_marketing_requires_consent CHECK (
        category != 'marketing' OR requires_consent = TRUE
    ),
    CONSTRAINT chk_unsubscribe_for_marketing CHECK (
        category != 'marketing' OR includes_unsubscribe = TRUE
    ),
    CONSTRAINT chk_parent_template_language CHECK (
        parent_template_id IS NULL OR language != 'en'
    ),
    CONSTRAINT chk_approval_consistency CHECK (
        (regulatory_approved = FALSE AND approved_by IS NULL AND approved_at IS NULL) OR
        (regulatory_approved = TRUE AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

-- Create indexes for performance
CREATE INDEX idx_notification_templates_slug 
    ON notification_templates(slug);

CREATE INDEX idx_notification_templates_category_channel 
    ON notification_templates(category, channel) WHERE is_active = TRUE;

CREATE INDEX idx_notification_templates_parent 
    ON notification_templates(parent_template_id) WHERE parent_template_id IS NOT NULL;

CREATE INDEX idx_notification_templates_language 
    ON notification_templates(language) WHERE is_active = TRUE;

CREATE INDEX idx_notification_templates_priority 
    ON notification_templates(priority DESC) WHERE is_active = TRUE;

CREATE INDEX idx_notification_templates_created_by 
    ON notification_templates(created_by);

CREATE INDEX idx_notification_templates_performance 
    ON notification_templates(sends_count DESC, open_rate DESC) WHERE sends_count > 0;

-- Create GIN index for JSONB columns
CREATE INDEX idx_notification_templates_available_variables_gin 
    ON notification_templates USING GIN (available_variables);

CREATE INDEX idx_notification_templates_test_data_gin 
    ON notification_templates USING GIN (test_data);

-- Add table comment
COMMENT ON TABLE notification_templates IS 
    'Stores reusable notification templates for multi-channel communications with support for localization, dynamic content, and performance tracking';

-- Add column comments
COMMENT ON COLUMN notification_templates.id IS 'Unique identifier for the notification template';
COMMENT ON COLUMN notification_templates.name IS 'Human-readable name for the template';
COMMENT ON COLUMN notification_templates.slug IS 'URL-safe unique identifier for API access';
COMMENT ON COLUMN notification_templates.version IS 'Version number for template iterations';
COMMENT ON COLUMN notification_templates.category IS 'Template category: transactional, marketing, system, or reminder';
COMMENT ON COLUMN notification_templates.channel IS 'Communication channel: email, sms, push, or in_app';
COMMENT ON COLUMN notification_templates.subject IS 'Email subject line (required for email channel)';
COMMENT ON COLUMN notification_templates.preview_text IS 'Preview text shown in email clients';
COMMENT ON COLUMN notification_templates.body_html IS 'HTML version of the message body';
COMMENT ON COLUMN notification_templates.body_text IS 'Plain text version of the message body (required)';
COMMENT ON COLUMN notification_templates.available_variables IS 'JSON array of variables that can be used in this template';
COMMENT ON COLUMN notification_templates.required_variables IS 'Array of variable names that must be provided when sending';
COMMENT ON COLUMN notification_templates.from_name IS 'Sender display name';
COMMENT ON COLUMN notification_templates.from_email IS 'Sender email address';
COMMENT ON COLUMN notification_templates.reply_to_email IS 'Reply-to email address';
COMMENT ON COLUMN notification_templates.is_active IS 'Whether this template is currently active and can be used';
COMMENT ON COLUMN notification_templates.requires_consent IS 'Whether user consent is required before sending';
COMMENT ON COLUMN notification_templates.priority IS 'Send priority (1-10, higher is more important)';
COMMENT ON COLUMN notification_templates.language IS 'Language code (e.g., en, es-MX)';
COMMENT ON COLUMN notification_templates.parent_template_id IS 'Reference to parent template for translations';
COMMENT ON COLUMN notification_templates.test_data IS 'Sample data for testing template rendering';
COMMENT ON COLUMN notification_templates.last_tested_at IS 'Timestamp of last test send';
COMMENT ON COLUMN notification_templates.sends_count IS 'Total number of times this template has been used';
COMMENT ON COLUMN notification_templates.open_rate IS 'Email open rate (0-1)';
COMMENT ON COLUMN notification_templates.click_rate IS 'Click-through rate (0-1)';
COMMENT ON COLUMN notification_templates.includes_unsubscribe IS 'Whether template includes unsubscribe link';
COMMENT ON COLUMN notification_templates.regulatory_approved IS 'Whether template has regulatory approval';
COMMENT ON COLUMN notification_templates.approval_notes IS 'Notes about regulatory approval';
COMMENT ON COLUMN notification_templates.created_by IS 'User who created the template';
COMMENT ON COLUMN notification_templates.approved_by IS 'User who approved the template';
COMMENT ON COLUMN notification_templates.approved_at IS 'Timestamp of approval';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_templates_updated_at();

-- Insert sample templates
INSERT INTO notification_templates (
    name, slug, category, channel, subject, preview_text, body_html, body_text,
    available_variables, required_variables, from_name, from_email,
    includes_unsubscribe, regulatory_approved, priority
) VALUES
-- Welcome email template
(
    'Welcome to TicketToken',
    'welcome-email',
    'transactional',
    'email',
    'Welcome to TicketToken, {{first_name}}!',
    'Start discovering amazing events in your area',
    '<h1>Welcome to TicketToken, {{first_name}}!</h1>
<p>We''re thrilled to have you join our community of event enthusiasts.</p>
<p>Here''s what you can do now:</p>
<ul>
    <li>Browse upcoming events in {{city}}</li>
    <li>Set up event alerts for your favorite artists</li>
    <li>Get early access to exclusive presales</li>
</ul>
<p>Best regards,<br>The TicketToken Team</p>',
    'Welcome to TicketToken, {{first_name}}!

We''re thrilled to have you join our community of event enthusiasts.

Here''s what you can do now:
- Browse upcoming events in {{city}}
- Set up event alerts for your favorite artists
- Get early access to exclusive presales

Best regards,
The TicketToken Team',
    '[{"name": "first_name", "type": "string", "description": "User first name"},
      {"name": "city", "type": "string", "description": "User city"}]'::jsonb,
    ARRAY['first_name', 'city'],
    'TicketToken',
    'welcome@tickettoken.io',
    FALSE,
    TRUE,
    8
),

-- Purchase confirmation email
(
    'Purchase Confirmation',
    'purchase-confirmation',
    'transactional',
    'email',
    'Your TicketToken Order #{{order_number}} is Confirmed',
    'Thank you for your purchase of {{event_name}}',
    '<h1>Order Confirmed!</h1>
<p>Hi {{first_name}},</p>
<p>Your tickets for <strong>{{event_name}}</strong> have been confirmed.</p>
<div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
    <h2>Order Details</h2>
    <p><strong>Order Number:</strong> {{order_number}}<br>
    <strong>Event:</strong> {{event_name}}<br>
    <strong>Date:</strong> {{event_date}}<br>
    <strong>Venue:</strong> {{venue_name}}<br>
    <strong>Tickets:</strong> {{ticket_count}}<br>
    <strong>Total:</strong> ${{total_amount}}</p>
</div>
<p>Your tickets have been sent to your TicketToken wallet.</p>
<p>Questions? Contact support@tickettoken.io</p>',
    'Order Confirmed!

Hi {{first_name}},

Your tickets for {{event_name}} have been confirmed.

Order Details:
- Order Number: {{order_number}}
- Event: {{event_name}}
- Date: {{event_date}}
- Venue: {{venue_name}}
- Tickets: {{ticket_count}}
- Total: ${{total_amount}}

Your tickets have been sent to your TicketToken wallet.

Questions? Contact support@tickettoken.io',
    '[{"name": "first_name", "type": "string"},
      {"name": "order_number", "type": "string"},
      {"name": "event_name", "type": "string"},
      {"name": "event_date", "type": "string"},
      {"name": "venue_name", "type": "string"},
      {"name": "ticket_count", "type": "number"},
      {"name": "total_amount", "type": "number"}]'::jsonb,
    ARRAY['first_name', 'order_number', 'event_name', 'event_date', 'venue_name', 'ticket_count', 'total_amount'],
    'TicketToken',
    'orders@tickettoken.io',
    FALSE,
    TRUE,
    10
),

-- Password reset email
(
    'Password Reset Request',
    'password-reset',
    'transactional',
    'email',
    'Reset Your TicketToken Password',
    'Password reset requested for your account',
    '<h1>Password Reset Request</h1>
<p>Hi {{first_name}},</p>
<p>We received a request to reset your password. Click the button below to create a new password:</p>
<div style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Reset Password</a>
</div>
<p>Or copy this link: {{reset_link}}</p>
<p>This link will expire in {{expiry_hours}} hours.</p>
<p>If you didn''t request this, please ignore this email.</p>
<p>Best regards,<br>The TicketToken Security Team</p>',
    'Password Reset Request

Hi {{first_name}},

We received a request to reset your password. Click the link below to create a new password:

{{reset_link}}

This link will expire in {{expiry_hours}} hours.

If you didn''t request this, please ignore this email.

Best regards,
The TicketToken Security Team',
    '[{"name": "first_name", "type": "string"},
      {"name": "reset_link", "type": "string"},
      {"name": "expiry_hours", "type": "number"}]'::jsonb,
    ARRAY['first_name', 'reset_link', 'expiry_hours'],
    'TicketToken Security',
    'security@tickettoken.io',
    FALSE,
    TRUE,
    10
),

-- Event reminder SMS
(
    'Event Reminder',
    'event-reminder-sms',
    'reminder',
    'sms',
    NULL,
    NULL,
    NULL,
    'Hi {{first_name}}, reminder: {{event_name}} is tomorrow at {{event_time}} at {{venue_name}}. Check your TicketToken app for tickets and directions.',
    '[{"name": "first_name", "type": "string"},
      {"name": "event_name", "type": "string"},
      {"name": "event_time", "type": "string"},
      {"name": "venue_name", "type": "string"}]'::jsonb,
    ARRAY['first_name', 'event_name', 'event_time', 'venue_name'],
    'TicketToken',
    NULL,
    FALSE,
    TRUE,
    7
),

-- Marketing push notification
(
    'New Events Alert',
    'new-events-push',
    'marketing',
    'push',
    NULL,
    NULL,
    NULL,
    '🎟️ New {{category}} events just announced in {{city}}! Check them out before they sell out.',
    '[{"name": "category", "type": "string"},
      {"name": "city", "type": "string"}]'::jsonb,
    ARRAY['category', 'city'],
    'TicketToken',
    NULL,
    TRUE,
    FALSE,
    5
);

-- Create a view for active templates by channel
CREATE OR REPLACE VIEW active_notification_templates AS
SELECT 
    id,
    name,
    slug,
    category,
    channel,
    subject,
    priority,
    sends_count,
    open_rate,
    click_rate,
    language,
    updated_at
FROM notification_templates
WHERE is_active = TRUE
  AND regulatory_approved = TRUE
ORDER BY channel, priority DESC, name;

-- Grant permissions
GRANT SELECT ON notification_templates TO analytics_read_role;
GRANT SELECT, INSERT, UPDATE ON notification_templates TO analytics_write_role;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant_id ON notification_templates(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant_created ON notification_templates(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
GRANT SELECT ON active_notification_templates TO analytics_read_role;
