-- Production System Initialization
-- Only system-required data, NO test users or demo data

-- System roles (if not already created via migration)
INSERT INTO roles (name, description, permissions) 
VALUES 
    ('system_admin', 'System Administrator', '{"all": true}'),
    ('venue_owner', 'Venue Owner', '{"venue": ["read", "write", "delete"], "events": ["read", "write", "delete"]}'),
    ('venue_staff', 'Venue Staff', '{"events": ["read", "write"], "tickets": ["read", "validate"]}'),
    ('customer', 'Customer', '{"tickets": ["read", "purchase", "transfer"]}')
ON CONFLICT (name) DO NOTHING;

-- Default compliance settings
INSERT INTO compliance_settings (setting_key, setting_value, is_required)
VALUES
    ('kyc_required_threshold', '500', true),
    ('aml_check_threshold', '1000', true),
    ('data_retention_days', '2555', true),  -- 7 years for financial data
    ('pii_encryption_required', 'true', true)
ON CONFLICT (setting_key) DO NOTHING;

-- Platform configuration
INSERT INTO platform_settings (key, value, description)
VALUES
    ('platform_fee_percentage', '7.5', 'Platform fee for ticket sales'),
    ('max_tickets_per_purchase', '10', 'Maximum tickets per transaction'),
    ('refund_window_hours', '48', 'Hours before event when refunds are disabled')
ON CONFLICT (key) DO NOTHING;
