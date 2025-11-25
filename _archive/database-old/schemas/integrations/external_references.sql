-- TicketToken External References Schema
-- Week 3, Day 14: External system ID mappings and cross-references
-- Purpose: Map internal entities to their corresponding external system identifiers

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS integrations;

-- Set search path
SET search_path TO integrations, public;

-- Create external_references table
CREATE TABLE IF NOT EXISTS external_references (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Internal reference
   internal_entity_type VARCHAR(100) NOT NULL,          -- Type of internal entity (user, event, ticket)
   internal_entity_id UUID NOT NULL,                    -- Internal entity UUID
   
   -- External reference
   external_system VARCHAR(100) NOT NULL,               -- Name of external system (Stripe, Eventbrite, etc.)
   external_entity_type VARCHAR(100) NOT NULL,          -- Type in external system
   external_entity_id VARCHAR(255) NOT NULL,            -- ID in external system
   
   -- Integration details
   integration_id UUID,                                 -- Reference to integration configuration
   integration_name VARCHAR(100),                       -- Denormalized for performance
   
   -- Sync status
   last_synced_at TIMESTAMP WITH TIME ZONE,             -- Last successful sync
   sync_status VARCHAR(20) DEFAULT 'active',           -- active, deleted, archived, error
   
   -- Version tracking
   external_version VARCHAR(50),                        -- Version/revision in external system
   internal_version INTEGER DEFAULT 1,                  -- Version in our system
   version_conflict BOOLEAN DEFAULT false,              -- Whether versions are out of sync
   
   -- Mapping metadata
   mapped_fields JSONB DEFAULT '{}',                    -- Which fields are mapped
   unmapped_fields JSONB DEFAULT '{}',                  -- Fields that couldn't be mapped
   custom_fields JSONB DEFAULT '{}',                    -- Custom field mappings
   
   -- Validation
   is_validated BOOLEAN DEFAULT false,                  -- Whether mapping has been validated
   validation_errors JSONB DEFAULT '[]',                -- Array of validation errors
   last_validated_at TIMESTAMP WITH TIME ZONE,          -- When last validated
   
   -- Conflict resolution
   conflict_strategy VARCHAR(20) DEFAULT 'manual',      -- internal_wins, external_wins, manual, newest_wins
   
   -- Change tracking
   internal_updated_at TIMESTAMP WITH TIME ZONE,        -- When internal entity last updated
   external_updated_at TIMESTAMP WITH TIME ZONE,        -- When external entity last updated
   needs_sync BOOLEAN DEFAULT false,                    -- Whether sync is needed
   
   -- Relationship data
   parent_external_id VARCHAR(255),                     -- Parent ID in external system
   child_external_ids TEXT[] DEFAULT '{}',              -- Child IDs in external system
   related_entities JSONB DEFAULT '{}',                 -- Other related entities
   
   -- System metadata from external
   external_created_at TIMESTAMP WITH TIME ZONE,        -- Created timestamp in external system
   external_modified_at TIMESTAMP WITH TIME ZONE,       -- Modified timestamp in external system
   external_created_by VARCHAR(255),                    -- Creator in external system
   
   -- Data quality
   confidence_score DECIMAL(3,2) DEFAULT 1.00,          -- Confidence in mapping (0.00-1.00)
   data_completeness DECIMAL(3,2) DEFAULT 1.00,        -- How complete the data is (0.00-1.00)
   quality_issues JSONB DEFAULT '[]',                   -- Array of quality issues
   
   -- Access information
   external_url VARCHAR(500),                           -- Direct URL to entity in external system
   external_api_endpoint VARCHAR(500),                  -- API endpoint for this entity
   requires_auth BOOLEAN DEFAULT true,                  -- Whether auth required for access
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   created_by UUID,                                     -- User who created mapping
   
   -- Constraints
   CONSTRAINT chk_sync_status CHECK (sync_status IN ('active', 'deleted', 'archived', 'error')),
   CONSTRAINT chk_conflict_strategy CHECK (conflict_strategy IN ('internal_wins', 'external_wins', 'manual', 'newest_wins')),
   CONSTRAINT chk_confidence_score CHECK (confidence_score >= 0 AND confidence_score <= 1),
   CONSTRAINT chk_data_completeness CHECK (data_completeness >= 0 AND data_completeness <= 1)
);

-- Add unique constraint for preventing duplicate mappings
ALTER TABLE external_references
   ADD CONSTRAINT uq_external_references_mapping 
   UNIQUE (internal_entity_type, internal_entity_id, external_system);

-- Add comments
COMMENT ON TABLE external_references IS 'Maps internal entities to their corresponding external system identifiers';

COMMENT ON COLUMN external_references.id IS 'Unique identifier for reference mapping';

COMMENT ON COLUMN external_references.internal_entity_type IS 'Type of internal entity (user, event, ticket, etc.)';
COMMENT ON COLUMN external_references.internal_entity_id IS 'UUID of internal entity';

COMMENT ON COLUMN external_references.external_system IS 'Name of external system (Stripe, Eventbrite, etc.)';
COMMENT ON COLUMN external_references.external_entity_type IS 'Entity type in external system';
COMMENT ON COLUMN external_references.external_entity_id IS 'Unique identifier in external system';

COMMENT ON COLUMN external_references.integration_id IS 'Reference to integration configuration';
COMMENT ON COLUMN external_references.integration_name IS 'Name of integration (denormalized)';

COMMENT ON COLUMN external_references.last_synced_at IS 'Last successful synchronization timestamp';
COMMENT ON COLUMN external_references.sync_status IS 'Current sync status: active, deleted, archived, error';

COMMENT ON COLUMN external_references.external_version IS 'Version/revision number in external system';
COMMENT ON COLUMN external_references.internal_version IS 'Version number in internal system';
COMMENT ON COLUMN external_references.version_conflict IS 'Flag indicating version mismatch';

COMMENT ON COLUMN external_references.mapped_fields IS 'JSON object of successfully mapped fields';
COMMENT ON COLUMN external_references.unmapped_fields IS 'JSON object of fields that could not be mapped';
COMMENT ON COLUMN external_references.custom_fields IS 'JSON object of custom field mappings';

COMMENT ON COLUMN external_references.is_validated IS 'Whether this mapping has been validated';
COMMENT ON COLUMN external_references.validation_errors IS 'Array of validation error details';
COMMENT ON COLUMN external_references.last_validated_at IS 'Timestamp of last validation';

COMMENT ON COLUMN external_references.conflict_strategy IS 'How to resolve conflicts during sync';

COMMENT ON COLUMN external_references.internal_updated_at IS 'Last update timestamp for internal entity';
COMMENT ON COLUMN external_references.external_updated_at IS 'Last update timestamp for external entity';
COMMENT ON COLUMN external_references.needs_sync IS 'Flag indicating sync is needed';

COMMENT ON COLUMN external_references.parent_external_id IS 'Parent entity ID in external system';
COMMENT ON COLUMN external_references.child_external_ids IS 'Array of child entity IDs in external system';
COMMENT ON COLUMN external_references.related_entities IS 'JSON object of related entity mappings';

COMMENT ON COLUMN external_references.external_created_at IS 'Creation timestamp in external system';
COMMENT ON COLUMN external_references.external_modified_at IS 'Last modification timestamp in external system';
COMMENT ON COLUMN external_references.external_created_by IS 'Creator identifier in external system';

COMMENT ON COLUMN external_references.confidence_score IS 'Confidence level in mapping accuracy (0-1)';
COMMENT ON COLUMN external_references.data_completeness IS 'Percentage of data completeness (0-1)';
COMMENT ON COLUMN external_references.quality_issues IS 'Array of identified data quality issues';

COMMENT ON COLUMN external_references.external_url IS 'Direct URL to entity in external system UI';
COMMENT ON COLUMN external_references.external_api_endpoint IS 'API endpoint for accessing entity';
COMMENT ON COLUMN external_references.requires_auth IS 'Whether authentication is required for access';

-- Create indexes for lookups

-- Internal entity lookup
CREATE INDEX idx_external_references_internal 
   ON external_references(internal_entity_type, internal_entity_id);

-- External entity lookup
CREATE INDEX idx_external_references_external 
   ON external_references(external_system, external_entity_type, external_entity_id);

-- Integration lookup
CREATE INDEX idx_external_references_integration 
   ON external_references(integration_id);

-- System-specific lookups
CREATE INDEX idx_external_references_system 
   ON external_references(external_system);

-- Sync status tracking
CREATE INDEX idx_external_references_sync_status 
   ON external_references(sync_status, last_synced_at);

-- Needs sync tracking
CREATE INDEX idx_external_references_needs_sync 
   ON external_references(needs_sync, last_synced_at) 
   WHERE needs_sync = true;

-- Version conflict tracking
CREATE INDEX idx_external_references_version_conflict 
   ON external_references(version_conflict, external_system) 
   WHERE version_conflict = true;

-- Validation tracking
CREATE INDEX idx_external_references_validation 
   ON external_references(is_validated, last_validated_at);

-- Parent-child relationships
CREATE INDEX idx_external_references_parent 
   ON external_references(parent_external_id) 
   WHERE parent_external_id IS NOT NULL;

-- JSONB indexes
CREATE INDEX idx_external_references_mapped_fields 
   ON external_references USING GIN(mapped_fields);
CREATE INDEX idx_external_references_quality_issues 
   ON external_references USING GIN(quality_issues);
CREATE INDEX idx_external_references_related_entities 
   ON external_references USING GIN(related_entities);

-- Create trigger to set needs_sync on updates
CREATE OR REPLACE FUNCTION check_needs_sync()
RETURNS TRIGGER AS $$
BEGIN
   -- If internal or external updated timestamps change, set needs_sync
   IF (OLD.internal_updated_at IS DISTINCT FROM NEW.internal_updated_at OR
       OLD.external_updated_at IS DISTINCT FROM NEW.external_updated_at) THEN
       NEW.needs_sync := true;
   END IF;
   
   -- If version conflict detected, set needs_sync
   IF NEW.version_conflict = true THEN
       NEW.needs_sync := true;
   END IF;
   
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_needs_sync_trigger
   BEFORE UPDATE ON external_references
   FOR EACH ROW EXECUTE FUNCTION check_needs_sync();

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_external_references_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_external_references_updated_at 
   BEFORE UPDATE ON external_references
   FOR EACH ROW EXECUTE FUNCTION update_external_references_updated_at();

-- Create function to find external reference
CREATE OR REPLACE FUNCTION find_external_reference(
   p_internal_type VARCHAR,
   p_internal_id UUID,
   p_external_system VARCHAR
) RETURNS TABLE (
   external_id VARCHAR,
   external_type VARCHAR,
   sync_status VARCHAR,
   last_synced_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
   RETURN QUERY
   SELECT 
       er.external_entity_id,
       er.external_entity_type,
       er.sync_status,
       er.last_synced_at
   FROM external_references er
   WHERE er.internal_entity_type = p_internal_type
     AND er.internal_entity_id = p_internal_id
     AND er.external_system = p_external_system;
END;
$$ LANGUAGE plpgsql;

-- Create view for sync status overview
CREATE OR REPLACE VIEW external_reference_sync_status AS
SELECT 
   external_system,
   internal_entity_type,
   sync_status,
   COUNT(*) as count,
   COUNT(*) FILTER (WHERE needs_sync = true) as needs_sync_count,
   COUNT(*) FILTER (WHERE version_conflict = true) as version_conflicts,
   AVG(confidence_score) as avg_confidence,
   AVG(data_completeness) as avg_completeness,
   MAX(last_synced_at) as latest_sync
FROM external_references
GROUP BY external_system, internal_entity_type, sync_status
ORDER BY external_system, internal_entity_type, sync_status;

COMMENT ON VIEW external_reference_sync_status IS 'Overview of external reference synchronization status';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON external_references TO app_user;
-- GRANT SELECT ON external_reference_sync_status TO app_user;
-- GRANT EXECUTE ON FUNCTION find_external_reference(VARCHAR, UUID, VARCHAR) TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_external_references_tenant_id ON external_references(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_external_references_tenant_created ON external_references(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

