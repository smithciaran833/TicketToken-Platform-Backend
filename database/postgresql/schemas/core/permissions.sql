-- =====================================================
-- TicketToken Platform - Core Permissions Management Schema
-- Week 1, Day 1 Development
-- =====================================================
-- Description: Comprehensive permission management system for RBAC
-- Version: 1.0
-- Created: 2025-07-16 13:56:47
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- For UUID generation

-- Create ENUM types for permission management
CREATE TYPE permission_category AS ENUM (
    'user_management',      -- User account and profile operations
    'venue_management',     -- Venue creation, editing, and configuration
    'event_management',     -- Event creation, scheduling, and management
    'ticket_management',    -- Ticket creation, sales, and validation
    'financial',           -- Payment processing and financial operations
    'analytics',           -- Reporting and analytics access
    'system',              -- System configuration and administration
    'content_management'   -- Content and media management
);

CREATE TYPE permission_action AS ENUM (
    'create',              -- Create new resources
    'read',                -- View/read resources
    'update',              -- Modify existing resources
    'delete',              -- Remove resources
    'manage',              -- Full management (CRUD + special operations)
    'approve',             -- Approve pending items
    'reject',              -- Reject pending items
    'publish',             -- Publish content
    'archive',             -- Archive resources
    'restore',             -- Restore archived resources
    'export',              -- Export data
    'import'               -- Import data
);

CREATE TYPE permission_scope AS ENUM (
    'global',              -- System-wide permission
    'organization',        -- Organization-level permission
    'venue',               -- Venue-specific permission
    'event',               -- Event-specific permission
    'own'                  -- Own resources only
);

-- =====================================================
-- PERMISSIONS TABLE
-- =====================================================
-- Core permissions table defining all system permissions
CREATE TABLE IF NOT EXISTS permissions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Permission identification
    permission_name VARCHAR(150) NOT NULL UNIQUE,        -- Unique permission identifier (e.g., 'venue.create')
    display_name VARCHAR(200) NOT NULL,                  -- Human-readable permission name
    description TEXT,                                    -- Detailed permission description
    
    -- Permission classification
    category permission_category NOT NULL,               -- Permission category
    resource VARCHAR(100) NOT NULL,                      -- Resource type (e.g., 'venue', 'event', 'ticket')
    action permission_action NOT NULL,                   -- Action type (create, read, update, delete, etc.)
    scope permission_scope NOT NULL DEFAULT 'global',    -- Permission scope
    
    -- Permission hierarchy and grouping
    parent_permission_id UUID REFERENCES permissions(id) ON DELETE SET NULL, -- Parent permission for inheritance
    permission_group VARCHAR(100),                       -- Logical grouping of related permissions
    permission_priority INTEGER NOT NULL DEFAULT 0,      -- Priority for permission conflicts
    
    -- Permission constraints and metadata
    is_system_permission BOOLEAN NOT NULL DEFAULT FALSE, -- True for core system permissions
    is_inheritable BOOLEAN NOT NULL DEFAULT TRUE,        -- Whether child permissions inherit this
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,    -- Whether granting requires approval
    is_dangerous BOOLEAN NOT NULL DEFAULT FALSE,         -- Flags potentially dangerous permissions
    
    -- Permission status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,             -- Permission is available for assignment
    is_revocable BOOLEAN NOT NULL DEFAULT TRUE,          -- Permission can be revoked
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- Permission creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- Last update timestamp
    created_by_user_id UUID,                             -- User who created this permission
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,                              -- Soft delete timestamp
    deleted_by_user_id UUID,                             -- User who deleted this permission
    
    -- Constraints
    CONSTRAINT permissions_name_format CHECK (permission_name ~* '^[a-z0-9_.]{3,150}$'),
    CONSTRAINT permissions_resource_format CHECK (resource ~* '^[a-z0-9_]{2,100}$'),
    CONSTRAINT permissions_priority_positive CHECK (permission_priority >= 0),
    CONSTRAINT permissions_no_self_parent CHECK (parent_permission_id != id)
);

-- =====================================================
-- ROLE_PERMISSIONS JUNCTION TABLE
-- =====================================================
-- Many-to-many relationship between roles and permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    role_id UUID NOT NULL,                               -- Reference to roles.id
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    
    -- Grant metadata
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- When permission was granted to role
    granted_by_user_id UUID,                             -- Who granted this permission
    
    -- Permission scope modifiers
    venue_id UUID,                                       -- Venue-specific permission (NULL = all venues)
    event_id UUID,                                       -- Event-specific permission (NULL = all events)
    
    -- Grant constraints
    conditions JSONB,                                    -- Additional conditions for permission (e.g., time limits, IP restrictions)
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(role_id, permission_id, venue_id, event_id)   -- Prevent duplicate role permission assignments
);

-- =====================================================
-- USER_PERMISSIONS TABLE
-- =====================================================
-- Direct user permission overrides (bypass role permissions)
CREATE TABLE IF NOT EXISTS user_permissions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    user_id UUID NOT NULL,                               -- Reference to users.id
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    
    -- Permission grant/deny
    is_granted BOOLEAN NOT NULL,                         -- True = grant permission, False = explicitly deny
    
    -- Grant metadata
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- When permission was granted/denied
    granted_by_user_id UUID,                             -- Who granted/denied this permission
    expires_at TIMESTAMPTZ,                              -- Permission expiration (NULL = never expires)
    
    -- Permission scope modifiers
    venue_id UUID,                                       -- Venue-specific permission (NULL = all venues)
    event_id UUID,                                       -- Event-specific permission (NULL = all events)
    
    -- Grant constraints and metadata
    conditions JSONB,                                    -- Additional conditions for permission
    reason TEXT,                                         -- Reason for granting/denying permission
    
    -- Revocation support
    is_active BOOLEAN NOT NULL DEFAULT TRUE,             -- Permission assignment is active
    revoked_at TIMESTAMPTZ,                             -- When permission was revoked
    revoked_by_user_id UUID,                            -- Who revoked this permission
    revoke_reason TEXT,                                  -- Reason for revocation
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, permission_id, venue_id, event_id), -- Prevent duplicate user permission assignments
    CONSTRAINT user_permissions_valid_expiry CHECK (expires_at IS NULL OR expires_at > granted_at),
    CONSTRAINT user_permissions_valid_revocation CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

-- =====================================================
-- PERMISSION_DEPENDENCIES TABLE
-- =====================================================
-- Define permission dependencies (required permissions for granting others)
CREATE TABLE IF NOT EXISTS permission_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,      -- Permission that has dependencies
    required_permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE, -- Required permission
    dependency_type VARCHAR(50) NOT NULL DEFAULT 'prerequisite',                   -- Type of dependency
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(permission_id, required_permission_id),
    CONSTRAINT permission_dependencies_no_self_dependency CHECK (permission_id != required_permission_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for permissions
CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(permission_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_action ON permissions(action) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_scope ON permissions(scope) WHERE deleted_at IS NULL;

-- Permission hierarchy indexes
CREATE INDEX IF NOT EXISTS idx_permissions_parent ON permissions(parent_permission_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_group ON permissions(permission_group) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_priority ON permissions(permission_priority) WHERE deleted_at IS NULL;

-- Permission flags indexes
CREATE INDEX IF NOT EXISTS idx_permissions_system ON permissions(is_system_permission) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_active ON permissions(is_active) WHERE deleted_at IS NULL;

-- Role permissions indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_venue_id ON role_permissions(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_role_permissions_event_id ON role_permissions(event_id) WHERE event_id IS NOT NULL;

-- User permissions indexes
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_permissions_granted ON user_permissions(is_granted) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_permissions_venue_id ON user_permissions(venue_id) WHERE venue_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_permissions_event_id ON user_permissions(event_id) WHERE event_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_permissions_expires_at ON user_permissions(expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

-- Composite indexes for permission checking
CREATE INDEX IF NOT EXISTS idx_user_permissions_check ON user_permissions(user_id, permission_id, is_granted, is_active)
    WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW());

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS trigger_permissions_updated_at ON permissions;
CREATE TRIGGER trigger_permissions_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_permissions_updated_at();

DROP TRIGGER IF EXISTS trigger_role_permissions_updated_at ON role_permissions;
CREATE TRIGGER trigger_role_permissions_updated_at
    BEFORE UPDATE ON role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_permissions_updated_at();

DROP TRIGGER IF EXISTS trigger_user_permissions_updated_at ON user_permissions;
CREATE TRIGGER trigger_user_permissions_updated_at
    BEFORE UPDATE ON user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_permissions_updated_at();

-- =====================================================
-- PERMISSION MANAGEMENT HELPER FUNCTIONS
-- =====================================================

-- Function to create a new permission
CREATE OR REPLACE FUNCTION create_permission(
    p_permission_name VARCHAR(150),
    p_display_name VARCHAR(200),
    p_description TEXT,
    p_category permission_category,
    p_resource VARCHAR(100),
    p_action permission_action,
    p_scope permission_scope DEFAULT 'global',
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_permission_id UUID;
BEGIN
    INSERT INTO permissions (
        permission_name, display_name, description, category,
        resource, action, scope, created_by_user_id
    )
    VALUES (
        p_permission_name, p_display_name, p_description, p_category,
        p_resource, p_action, p_scope, p_created_by_user_id
    )
    RETURNING id INTO new_permission_id;
    
    RETURN new_permission_id;
END;
$$ LANGUAGE plpgsql;

-- Function to grant permission to role
CREATE OR REPLACE FUNCTION grant_role_permission(
    p_role_id UUID,
    p_permission_id UUID,
    p_granted_by_user_id UUID DEFAULT NULL,
    p_venue_id UUID DEFAULT NULL,
    p_event_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    assignment_id UUID;
BEGIN
    INSERT INTO role_permissions (
        role_id, permission_id, granted_by_user_id, venue_id, event_id
    )
    VALUES (
        p_role_id, p_permission_id, p_granted_by_user_id, p_venue_id, p_event_id
    )
    ON CONFLICT (role_id, permission_id, venue_id, event_id) DO NOTHING
    RETURNING id INTO assignment_id;
    
    RETURN assignment_id;
END;
$$ LANGUAGE plpgsql;

-- Function to grant/deny permission to user directly
CREATE OR REPLACE FUNCTION grant_user_permission(
    p_user_id UUID,
    p_permission_id UUID,
    p_is_granted BOOLEAN,
    p_granted_by_user_id UUID DEFAULT NULL,
    p_venue_id UUID DEFAULT NULL,
    p_event_id UUID DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    assignment_id UUID;
BEGIN
    INSERT INTO user_permissions (
        user_id, permission_id, is_granted, granted_by_user_id,
        venue_id, event_id, expires_at, reason
    )
    VALUES (
        p_user_id, p_permission_id, p_is_granted, p_granted_by_user_id,
        p_venue_id, p_event_id, p_expires_at, p_reason
    )
    ON CONFLICT (user_id, permission_id, venue_id, event_id) 
    DO UPDATE SET
        is_granted = EXCLUDED.is_granted,
        granted_by_user_id = EXCLUDED.granted_by_user_id,
        expires_at = EXCLUDED.expires_at,
        reason = EXCLUDED.reason,
        updated_at = NOW()
    RETURNING id INTO assignment_id;
    
    RETURN assignment_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION user_has_permission(
    p_user_id UUID,
    p_permission_name VARCHAR(150),
    p_venue_id UUID DEFAULT NULL,
    p_event_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    has_permission BOOLEAN := FALSE;
    permission_uuid UUID;
BEGIN
    -- Get permission ID
    SELECT id INTO permission_uuid 
    FROM permissions 
    WHERE permission_name = p_permission_name 
    AND is_active = true 
    AND deleted_at IS NULL;
    
    IF permission_uuid IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check direct user permissions first (takes precedence)
    SELECT is_granted INTO has_permission
    FROM user_permissions up
    WHERE up.user_id = p_user_id
    AND up.permission_id = permission_uuid
    AND up.is_active = true
    AND (up.expires_at IS NULL OR up.expires_at > NOW())
    AND (p_venue_id IS NULL OR up.venue_id IS NULL OR up.venue_id = p_venue_id)
    AND (p_event_id IS NULL OR up.event_id IS NULL OR up.event_id = p_event_id)
    ORDER BY up.venue_id NULLS LAST, up.event_id NULLS LAST
    LIMIT 1;
    
    -- If direct permission found, return it
    IF has_permission IS NOT NULL THEN
        RETURN has_permission;
    END IF;
    
    -- Check role-based permissions
    SELECT COUNT(*) > 0 INTO has_permission
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = p_user_id
    AND rp.permission_id = permission_uuid
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND (p_venue_id IS NULL OR rp.venue_id IS NULL OR rp.venue_id = p_venue_id)
    AND (p_event_id IS NULL OR rp.event_id IS NULL OR rp.event_id = p_event_id);
    
    RETURN COALESCE(has_permission, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Function to get all user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(
    permission_name VARCHAR(150),
    display_name VARCHAR(200),
    category permission_category,
    resource VARCHAR(100),
    action permission_action,
    scope permission_scope,
    source VARCHAR(20),
    venue_id UUID,
    event_id UUID
) AS $$
BEGIN
    RETURN QUERY
    -- Direct user permissions
    SELECT p.permission_name, p.display_name, p.category, p.resource, 
           p.action, p.scope, 'direct'::VARCHAR(20) as source,
           up.venue_id, up.event_id
    FROM user_permissions up
    JOIN permissions p ON up.permission_id = p.id
    WHERE up.user_id = p_user_id
    AND up.is_granted = true
    AND up.is_active = true
    AND (up.expires_at IS NULL OR up.expires_at > NOW())
    AND p.is_active = true
    AND p.deleted_at IS NULL
    
    UNION
    
    -- Role-based permissions
    SELECT p.permission_name, p.display_name, p.category, p.resource,
           p.action, p.scope, 'role'::VARCHAR(20) as source,
           rp.venue_id, rp.event_id
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND p.is_active = true
    AND p.deleted_at IS NULL
    -- Exclude if user has explicit deny for this permission
    AND NOT EXISTS (
        SELECT 1 FROM user_permissions up2
        WHERE up2.user_id = p_user_id
        AND up2.permission_id = p.id
        AND up2.is_granted = false
        AND up2.is_active = true
        AND (up2.expires_at IS NULL OR up2.expires_at > NOW())
    )
    
    ORDER BY permission_name, source;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INSERT PREDEFINED SYSTEM PERMISSIONS
-- =====================================================

-- Insert comprehensive system permissions
INSERT INTO permissions (permission_name, display_name, description, category, resource, action, is_system_permission) VALUES

-- User Management Permissions
('user.create', 'Create Users', 'Create new user accounts', 'user_management', 'user', 'create', true),
('user.read', 'View Users', 'View user account information', 'user_management', 'user', 'read', true),
('user.update', 'Update Users', 'Modify user account information', 'user_management', 'user', 'update', true),
('user.delete', 'Delete Users', 'Delete user accounts', 'user_management', 'user', 'delete', true),
('user.manage', 'Manage Users', 'Full user account management', 'user_management', 'user', 'manage', true),
('user.approve', 'Approve Users', 'Approve pending user registrations', 'user_management', 'user', 'approve', true),
('user.suspend', 'Suspend Users', 'Suspend user accounts', 'user_management', 'user', 'update', true),

-- Venue Management Permissions
('venue.create', 'Create Venues', 'Create new venues', 'venue_management', 'venue', 'create', true),
('venue.read', 'View Venues', 'View venue information', 'venue_management', 'venue', 'read', true),
('venue.update', 'Update Venues', 'Modify venue information', 'venue_management', 'venue', 'update', true),
('venue.delete', 'Delete Venues', 'Delete venues', 'venue_management', 'venue', 'delete', true),
('venue.manage', 'Manage Venues', 'Full venue management', 'venue_management', 'venue', 'manage', true),
('venue.publish', 'Publish Venues', 'Publish venues for public view', 'venue_management', 'venue', 'publish', true),
('venue.archive', 'Archive Venues', 'Archive inactive venues', 'venue_management', 'venue', 'archive', true),

-- Event Management Permissions
('event.create', 'Create Events', 'Create new events', 'event_management', 'event', 'create', true),
('event.read', 'View Events', 'View event information', 'event_management', 'event', 'read', true),
('event.update', 'Update Events', 'Modify event information', 'event_management', 'event', 'update', true),
('event.delete', 'Delete Events', 'Delete events', 'event_management', 'event', 'delete', true),
('event.manage', 'Manage Events', 'Full event management', 'event_management', 'event', 'manage', true),
('event.publish', 'Publish Events', 'Publish events for ticket sales', 'event_management', 'event', 'publish', true),
('event.approve', 'Approve Events', 'Approve pending events', 'event_management', 'event', 'approve', true),
('event.archive', 'Archive Events', 'Archive completed events', 'event_management', 'event', 'archive', true),

-- Ticket Management Permissions
('ticket.create', 'Create Tickets', 'Create ticket types and inventory', 'ticket_management', 'ticket', 'create', true),
('ticket.read', 'View Tickets', 'View ticket information and sales', 'ticket_management', 'ticket', 'read', true),
('ticket.update', 'Update Tickets', 'Modify ticket information', 'ticket_management', 'ticket', 'update', true),
('ticket.delete', 'Delete Tickets', 'Delete ticket types', 'ticket_management', 'ticket', 'delete', true),
('ticket.manage', 'Manage Tickets', 'Full ticket management', 'ticket_management', 'ticket', 'manage', true),
('ticket.scan', 'Scan Tickets', 'Validate and scan tickets at entry', 'ticket_management', 'ticket', 'update', true),
('ticket.refund', 'Refund Tickets', 'Process ticket refunds', 'ticket_management', 'ticket', 'update', true),
('ticket.transfer', 'Transfer Tickets', 'Transfer ticket ownership', 'ticket_management', 'ticket', 'update', true),

-- Financial Permissions
('payment.create', 'Process Payments', 'Process customer payments', 'financial', 'payment', 'create', true),
('payment.read', 'View Payments', 'View payment information', 'financial', 'payment', 'read', true),
('payment.refund', 'Process Refunds', 'Process payment refunds', 'financial', 'payment', 'update', true),
('financial.reports', 'Financial Reports', 'Access financial reports', 'financial', 'report', 'read', true),
('financial.export', 'Export Financial Data', 'Export financial data', 'financial', 'report', 'export', true),

-- Analytics Permissions
('analytics.view', 'View Analytics', 'Access analytics dashboards', 'analytics', 'analytics', 'read', true),
('analytics.export', 'Export Analytics', 'Export analytics data', 'analytics', 'analytics', 'export', true),
('analytics.advanced', 'Advanced Analytics', 'Access advanced analytics features', 'analytics', 'analytics', 'manage', true),

-- System Permissions
('system.settings', 'System Settings', 'Modify system settings', 'system', 'settings', 'manage', true),
('system.backup', 'System Backup', 'Create and manage system backups', 'system', 'backup', 'manage', true),
('system.logs', 'View System Logs', 'Access system logs', 'system', 'logs', 'read', true),
('system.maintenance', 'System Maintenance', 'Perform system maintenance', 'system', 'maintenance', 'manage', true),

-- Content Management Permissions
('content.create', 'Create Content', 'Create content and media', 'content_management', 'content', 'create', true),
('content.read', 'View Content', 'View content and media', 'content_management', 'content', 'read', true),
('content.update', 'Update Content', 'Modify content and media', 'content_management', 'content', 'update', true),
('content.delete', 'Delete Content', 'Delete content and media', 'content_management', 'content', 'delete', true),
('content.publish', 'Publish Content', 'Publish content for public view', 'content_management', 'content', 'publish', true)

ON CONFLICT (permission_name) DO NOTHING;

-- =====================================================
-- PERMISSION HIERARCHY SETUP
-- =====================================================

-- Set up permission hierarchies (manage permissions include all sub-permissions)
UPDATE permissions SET parent_permission_id = (SELECT id FROM permissions WHERE permission_name = 'user.manage')
WHERE permission_name IN ('user.create', 'user.read', 'user.update', 'user.delete', 'user.approve');

UPDATE permissions SET parent_permission_id = (SELECT id FROM permissions WHERE permission_name = 'venue.manage')
WHERE permission_name IN ('venue.create', 'venue.read', 'venue.update', 'venue.delete', 'venue.publish', 'venue.archive');

UPDATE permissions SET parent_permission_id = (SELECT id FROM permissions WHERE permission_name = 'event.manage')
WHERE permission_name IN ('event.create', 'event.read', 'event.update', 'event.delete', 'event.publish', 'event.approve', 'event.archive');

UPDATE permissions SET parent_permission_id = (SELECT id FROM permissions WHERE permission_name = 'ticket.manage')
WHERE permission_name IN ('ticket.create', 'ticket.read', 'ticket.update', 'ticket.delete', 'ticket.scan', 'ticket.refund', 'ticket.transfer');

UPDATE permissions SET parent_permission_id = (SELECT id FROM permissions WHERE permission_name = 'content.manage')
WHERE permission_name IN ('content.create', 'content.read', 'content.update', 'content.delete', 'content.publish');

-- Mark dangerous permissions
UPDATE permissions SET is_dangerous = true 
WHERE permission_name IN ('user.delete', 'venue.delete', 'event.delete', 'system.settings', 'system.maintenance', 'financial.export');

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE permissions IS 'Comprehensive permission management system for TicketToken platform';
COMMENT ON TABLE role_permissions IS 'Many-to-many relationship between roles and permissions';
COMMENT ON TABLE user_permissions IS 'Direct user permission overrides with grant/deny capability';
COMMENT ON TABLE permission_dependencies IS 'Permission dependencies and prerequisites';

-- Permissions table comments
COMMENT ON COLUMN permissions.permission_name IS 'Unique permission identifier: dot notation (e.g., venue.create)';
COMMENT ON COLUMN permissions.display_name IS 'Human-readable permission name for UI display';
COMMENT ON COLUMN permissions.description IS 'Detailed description of permission capabilities';
COMMENT ON COLUMN permissions.category IS 'Permission category for organization and filtering';
COMMENT ON COLUMN permissions.resource IS 'Target resource type (venue, event, ticket, etc.)';
COMMENT ON COLUMN permissions.action IS 'Action type (create, read, update, delete, manage, etc.)';
COMMENT ON COLUMN permissions.scope IS 'Permission scope (global, organization, venue, event, own)';
COMMENT ON COLUMN permissions.parent_permission_id IS 'Parent permission for hierarchical inheritance';
COMMENT ON COLUMN permissions.is_system_permission IS 'System permission flag: core platform permissions';
COMMENT ON COLUMN permissions.is_inheritable IS 'Inheritance flag: whether child permissions inherit this';
COMMENT ON COLUMN permissions.requires_approval IS 'Approval flag: granting requires admin approval';
COMMENT ON COLUMN permissions.is_dangerous IS 'Danger flag: potentially dangerous operations';

-- =====================================================
-- PERMISSION SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive permission management system with:
-- - Granular permission definitions
-- - Role and user permission assignments
-- - Permission hierarchy and inheritance
-- - Scope-based permissions (venue/event specific)
-- - Direct user permission overrides
-- - Comprehensive audit trail
-- - Helper functions for permission checking
-- - Predefined system permissions
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_permissions_tenant_id ON permissions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_tenant_created ON permissions(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
