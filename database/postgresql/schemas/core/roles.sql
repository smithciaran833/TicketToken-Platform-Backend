-- =====================================================
-- TicketToken Platform - Core Roles RBAC Schema
-- Week 1, Day 1 Development
-- =====================================================
-- Description: Role-based access control (RBAC) system
-- Version: 1.0
-- Created: 2025-07-16 13:52:53
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- For UUID generation

-- Create ENUM types for role management
CREATE TYPE role_permission_level AS ENUM (
    'super_admin',    -- Highest level: full system access
    'admin',          -- High level: venue and system management
    'manager',        -- Mid level: venue operations management
    'staff',          -- Low level: basic venue operations
    'customer'        -- Lowest level: end user access
);

CREATE TYPE role_status AS ENUM (
    'active',         -- Role is active and can be assigned
    'inactive'        -- Role is inactive and cannot be assigned
);

CREATE TYPE role_category AS ENUM (
    'system',         -- System-wide roles (cross-venue)
    'venue',          -- Venue-specific roles
    'event',          -- Event-specific roles
    'custom'          -- Custom user-defined roles
);

-- =====================================================
-- ROLES TABLE
-- =====================================================
-- Core roles table for role-based access control system
CREATE TABLE IF NOT EXISTS roles (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Role identification
    role_name VARCHAR(100) NOT NULL UNIQUE,               -- Unique role name (e.g., 'venue_manager')
    display_name VARCHAR(150) NOT NULL,                   -- Human-readable name (e.g., 'Venue Manager')
    description TEXT,                                     -- Detailed role description
    
    -- Role classification
    permission_level role_permission_level NOT NULL,     -- Hierarchical permission level
    role_category role_category NOT NULL DEFAULT 'custom', -- Role category classification
    role_status role_status NOT NULL DEFAULT 'active',   -- Role activation status
    
    -- System role flags
    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,       -- True for predefined system roles
    is_default_role BOOLEAN NOT NULL DEFAULT FALSE,      -- True if this is a default role for new users
    is_deletable BOOLEAN NOT NULL DEFAULT TRUE,          -- False for system roles that cannot be deleted
    
    -- Role hierarchy and inheritance
    parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL, -- Parent role for inheritance
    role_priority INTEGER NOT NULL DEFAULT 0,            -- Priority for role conflicts (higher = priority)
    
    -- Role scope and limitations
    max_assignable_users INTEGER,                        -- Maximum users that can have this role (NULL = unlimited)
    session_timeout_minutes INTEGER DEFAULT 480,         -- Session timeout in minutes (8 hours default)
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- Role creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),       -- Last update timestamp
    created_by_user_id UUID,                             -- User who created this role
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,                              -- Soft delete timestamp (NULL = not deleted)
    deleted_by_user_id UUID,                             -- User who deleted this role
    
    -- Constraints
    CONSTRAINT roles_name_format CHECK (role_name ~* '^[a-z0-9_]{2,100}$'),
    CONSTRAINT roles_priority_positive CHECK (role_priority >= 0),
    CONSTRAINT roles_max_users_positive CHECK (max_assignable_users IS NULL OR max_assignable_users > 0),
    CONSTRAINT roles_session_timeout_positive CHECK (session_timeout_minutes > 0),
    CONSTRAINT roles_no_self_parent CHECK (parent_role_id != id)
);

-- =====================================================
-- USER_ROLES JUNCTION TABLE
-- =====================================================
-- Junction table to assign roles to users with additional metadata
CREATE TABLE IF NOT EXISTS user_roles (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Foreign keys
    user_id UUID NOT NULL,                               -- Reference to users.id
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    
    -- Assignment metadata
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- When role was assigned
    assigned_by_user_id UUID,                            -- Who assigned this role
    expires_at TIMESTAMPTZ,                              -- Role expiration (NULL = never expires)
    
    -- Assignment scope (for venue/event specific roles)
    venue_id UUID,                                       -- Venue scope (NULL = all venues)
    event_id UUID,                                       -- Event scope (NULL = all events)
    
    -- Assignment status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,             -- Assignment is currently active
    revoked_at TIMESTAMPTZ,                             -- When role was revoked
    revoked_by_user_id UUID,                            -- Who revoked this role
    revoke_reason TEXT,                                  -- Reason for revocation
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, role_id, venue_id, event_id),       -- Prevent duplicate role assignments
    CONSTRAINT user_roles_valid_expiry CHECK (expires_at IS NULL OR expires_at > assigned_at),
    CONSTRAINT user_roles_valid_revocation CHECK (revoked_at IS NULL OR revoked_at >= assigned_at)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for roles
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(role_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roles_permission_level ON roles(permission_level) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roles_category ON roles(role_category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roles_status ON roles(role_status) WHERE deleted_at IS NULL;

-- System role indexes
CREATE INDEX IF NOT EXISTS idx_roles_system_roles ON roles(is_system_role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roles_default_roles ON roles(is_default_role) WHERE deleted_at IS NULL;

-- Hierarchy indexes
CREATE INDEX IF NOT EXISTS idx_roles_parent_role ON roles(parent_role_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roles_priority ON roles(role_priority) WHERE deleted_at IS NULL;

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_roles_created_at ON roles(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roles_deleted_at ON roles(deleted_at) WHERE deleted_at IS NOT NULL;

-- User roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_roles_venue_id ON user_roles(venue_id) WHERE venue_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_roles_event_id ON user_roles(event_id) WHERE event_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at ON user_roles(expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_roles_active_assignments ON user_roles(user_id, role_id) 
    WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW());

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for roles table
DROP TRIGGER IF EXISTS trigger_roles_updated_at ON roles;
CREATE TRIGGER trigger_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_roles_updated_at();

-- Trigger for user_roles table
DROP TRIGGER IF EXISTS trigger_user_roles_updated_at ON user_roles;
CREATE TRIGGER trigger_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_roles_updated_at();

-- =====================================================
-- RBAC HELPER FUNCTIONS
-- =====================================================

-- Function to create a new role
CREATE OR REPLACE FUNCTION create_role(
    p_role_name VARCHAR(100),
    p_display_name VARCHAR(150),
    p_description TEXT,
    p_permission_level role_permission_level,
    p_role_category role_category DEFAULT 'custom',
    p_is_system_role BOOLEAN DEFAULT FALSE,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_role_id UUID;
BEGIN
    INSERT INTO roles (
        role_name, display_name, description, permission_level, 
        role_category, is_system_role, created_by_user_id
    )
    VALUES (
        p_role_name, p_display_name, p_description, p_permission_level,
        p_role_category, p_is_system_role, p_created_by_user_id
    )
    RETURNING id INTO new_role_id;
    
    RETURN new_role_id;
END;
$$ LANGUAGE plpgsql;

-- Function to assign role to user
CREATE OR REPLACE FUNCTION assign_user_role(
    p_user_id UUID,
    p_role_id UUID,
    p_assigned_by_user_id UUID DEFAULT NULL,
    p_venue_id UUID DEFAULT NULL,
    p_event_id UUID DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    assignment_id UUID;
BEGIN
    -- Check if role assignment already exists and is active
    IF EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_user_id AND role_id = p_role_id 
        AND venue_id IS NOT DISTINCT FROM p_venue_id 
        AND event_id IS NOT DISTINCT FROM p_event_id
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    ) THEN
        RAISE EXCEPTION 'User already has this role assignment';
    END IF;
    
    INSERT INTO user_roles (
        user_id, role_id, assigned_by_user_id, venue_id, event_id, expires_at
    )
    VALUES (
        p_user_id, p_role_id, p_assigned_by_user_id, p_venue_id, p_event_id, p_expires_at
    )
    RETURNING id INTO assignment_id;
    
    RETURN assignment_id;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke user role
CREATE OR REPLACE FUNCTION revoke_user_role(
    p_user_id UUID,
    p_role_id UUID,
    p_revoked_by_user_id UUID DEFAULT NULL,
    p_revoke_reason TEXT DEFAULT NULL,
    p_venue_id UUID DEFAULT NULL,
    p_event_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE user_roles 
    SET is_active = false,
        revoked_at = NOW(),
        revoked_by_user_id = p_revoked_by_user_id,
        revoke_reason = p_revoke_reason
    WHERE user_id = p_user_id 
    AND role_id = p_role_id
    AND venue_id IS NOT DISTINCT FROM p_venue_id
    AND event_id IS NOT DISTINCT FROM p_event_id
    AND is_active = true;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has permission level
CREATE OR REPLACE FUNCTION user_has_permission_level(
    p_user_id UUID,
    p_required_level role_permission_level,
    p_venue_id UUID DEFAULT NULL,
    p_event_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    user_max_level role_permission_level;
    level_hierarchy INTEGER;
    required_hierarchy INTEGER;
BEGIN
    -- Define permission level hierarchy (lower number = higher permission)
    CASE p_required_level
        WHEN 'super_admin' THEN required_hierarchy := 1;
        WHEN 'admin' THEN required_hierarchy := 2;
        WHEN 'manager' THEN required_hierarchy := 3;
        WHEN 'staff' THEN required_hierarchy := 4;
        WHEN 'customer' THEN required_hierarchy := 5;
        ELSE required_hierarchy := 999;
    END CASE;
    
    -- Get user's highest permission level
    SELECT MIN(
        CASE r.permission_level
            WHEN 'super_admin' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'manager' THEN 3
            WHEN 'staff' THEN 4
            WHEN 'customer' THEN 5
            ELSE 999
        END
    )
    INTO level_hierarchy
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND (p_venue_id IS NULL OR ur.venue_id IS NULL OR ur.venue_id = p_venue_id)
    AND (p_event_id IS NULL OR ur.event_id IS NULL OR ur.event_id = p_event_id)
    AND r.role_status = 'active'
    AND r.deleted_at IS NULL;
    
    RETURN COALESCE(level_hierarchy <= required_hierarchy, false);
END;
$$ LANGUAGE plpgsql;

-- Function to get user roles
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id UUID)
RETURNS TABLE(
    role_id UUID,
    role_name VARCHAR(100),
    display_name VARCHAR(150),
    permission_level role_permission_level,
    venue_id UUID,
    event_id UUID,
    assigned_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT r.id, r.role_name, r.display_name, r.permission_level,
           ur.venue_id, ur.event_id, ur.assigned_at, ur.expires_at
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND r.role_status = 'active'
    AND r.deleted_at IS NULL
    ORDER BY r.role_priority DESC, r.permission_level;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INSERT PREDEFINED SYSTEM ROLES
-- =====================================================

-- Insert system roles (will be ignored if roles already exist due to UNIQUE constraint)
INSERT INTO roles (role_name, display_name, description, permission_level, role_category, is_system_role, is_deletable, role_priority) VALUES
-- Super Admin Role
('super_admin', 'Super Administrator', 'Full system access with all permissions across all venues and events', 'super_admin', 'system', true, false, 1000),

-- Venue Owner Role  
('venue_owner', 'Venue Owner', 'Full control over owned venues including staff management and financial operations', 'admin', 'venue', true, false, 900),

-- Venue Manager Role
('venue_manager', 'Venue Manager', 'Operational management of venue including event coordination and staff supervision', 'manager', 'venue', true, false, 800),

-- Venue Staff Role
('venue_staff', 'Venue Staff', 'Basic venue operations including ticket scanning and customer service', 'staff', 'venue', true, false, 700),

-- Customer Role (Default)
('customer', 'Customer', 'Standard user with ticket purchasing and account management capabilities', 'customer', 'system', true, false, 100)

ON CONFLICT (role_name) DO NOTHING;

-- Set customer as default role
UPDATE roles SET is_default_role = true WHERE role_name = 'customer';

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE roles IS 'Role-based access control (RBAC) system for TicketToken platform';
COMMENT ON TABLE user_roles IS 'Junction table assigning roles to users with scope and expiration support';

-- Roles table comments
COMMENT ON COLUMN roles.id IS 'Primary key: UUID identifier for the role';
COMMENT ON COLUMN roles.role_name IS 'Unique role identifier: machine-readable name (e.g., venue_manager)';
COMMENT ON COLUMN roles.display_name IS 'Human-readable role name: displayed in UI (e.g., Venue Manager)';
COMMENT ON COLUMN roles.description IS 'Role description: detailed explanation of role responsibilities';
COMMENT ON COLUMN roles.permission_level IS 'Permission hierarchy: defines access level (super_admin > admin > manager > staff > customer)';
COMMENT ON COLUMN roles.role_category IS 'Role classification: system, venue, event, or custom';
COMMENT ON COLUMN roles.role_status IS 'Role status: active roles can be assigned, inactive cannot';
COMMENT ON COLUMN roles.is_system_role IS 'System role flag: true for predefined platform roles';
COMMENT ON COLUMN roles.is_default_role IS 'Default role flag: true if assigned to new users automatically';
COMMENT ON COLUMN roles.is_deletable IS 'Deletable flag: false for system roles that cannot be removed';
COMMENT ON COLUMN roles.parent_role_id IS 'Role inheritance: parent role for permission inheritance';
COMMENT ON COLUMN roles.role_priority IS 'Role priority: higher values take precedence in conflicts';
COMMENT ON COLUMN roles.max_assignable_users IS 'User limit: maximum users that can have this role (NULL = unlimited)';
COMMENT ON COLUMN roles.session_timeout_minutes IS 'Session timeout: minutes before session expires for this role';

-- User roles table comments  
COMMENT ON COLUMN user_roles.user_id IS 'User reference: ID of user assigned this role';
COMMENT ON COLUMN user_roles.role_id IS 'Role reference: ID of role being assigned';
COMMENT ON COLUMN user_roles.assigned_at IS 'Assignment timestamp: when role was assigned to user';
COMMENT ON COLUMN user_roles.assigned_by_user_id IS 'Assigner reference: user who assigned this role';
COMMENT ON COLUMN user_roles.expires_at IS 'Expiration timestamp: when role assignment expires (NULL = never)';
COMMENT ON COLUMN user_roles.venue_id IS 'Venue scope: limits role to specific venue (NULL = all venues)';
COMMENT ON COLUMN user_roles.event_id IS 'Event scope: limits role to specific event (NULL = all events)';
COMMENT ON COLUMN user_roles.is_active IS 'Active status: whether role assignment is currently active';
COMMENT ON COLUMN user_roles.revoked_at IS 'Revocation timestamp: when role was revoked';
COMMENT ON COLUMN user_roles.revoked_by_user_id IS 'Revoker reference: user who revoked this role';
COMMENT ON COLUMN user_roles.revoke_reason IS 'Revocation reason: explanation for why role was revoked';

-- =====================================================
-- RBAC SCHEMA CREATION COMPLETE
-- =====================================================
-- Role-based access control system with:
-- - Hierarchical permission levels
-- - Role inheritance support  
-- - Venue and event scoping
-- - Comprehensive audit trail
-- - Helper functions for role management
-- - Predefined system roles
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_tenant_created ON roles(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
