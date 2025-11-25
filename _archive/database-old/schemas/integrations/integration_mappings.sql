-- TicketToken Integration Mappings Schema
-- Week 3, Day 14: Field mapping configurations for data synchronization
-- Purpose: Define how data fields map between TicketToken and external systems

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS integrations;

-- Set search path
SET search_path TO integrations, public;

-- Create integration_mappings table
CREATE TABLE IF NOT EXISTS integration_mappings (
   -- Primary key
   id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
   
   -- Integration reference
   integration_id UUID,                                 -- Reference to integration config
   integration_name VARCHAR(100) NOT NULL,              -- Name of integration (redundant for queries)
   
   -- Mapping details
   mapping_name VARCHAR(255) NOT NULL,                  -- Descriptive name for this mapping
   mapping_version INTEGER DEFAULT 1,                   -- Version number for mapping
   is_active BOOLEAN DEFAULT true,                      -- Whether mapping is currently active
   
   -- Entity mapping
   source_entity VARCHAR(100) NOT NULL,                 -- Source entity/table name
   target_entity VARCHAR(100) NOT NULL,                 -- Target entity/table name
   sync_direction VARCHAR(20) NOT NULL,                 -- inbound, outbound, bidirectional
   
   -- Field mappings
   field_mappings JSONB NOT NULL DEFAULT '[]',         -- Array of field mapping objects
   /* Example structure:
   [
       {
           "source_field": "customer_email",
           "target_field": "email_address",
           "transformation": "lowercase",
           "required": true
       }
   ]
   */
   
   -- Data type information
   source_data_type VARCHAR(50),                        -- Overall source data type
   target_data_type VARCHAR(50),                        -- Overall target data type
   type_conversion VARCHAR(100),                        -- Type conversion strategy
   
   -- Transformation rules
   transformation_function TEXT,                        -- Built-in transformation function
   custom_script TEXT,                                  -- Custom transformation script
   validation_rules JSONB DEFAULT '{}',                 -- Validation rules for data
   
   -- Default values
   default_value_type VARCHAR(20),                      -- static, dynamic, null
   default_value TEXT,                                  -- Default value or expression
   null_handling VARCHAR(20) DEFAULT 'preserve',        -- preserve, skip, default, error
   
   -- Conditional logic
   conditions JSONB DEFAULT '{}',                       -- Conditions for applying mapping
   conditional_mappings JSONB DEFAULT '{}',             -- Different mappings based on conditions
   
   -- Value mappings
   value_lookup_table JSONB DEFAULT '{}',               -- Direct value translations
   enum_mappings JSONB DEFAULT '{}',                    -- Enum value mappings
   
   -- Validation settings
   required_fields TEXT[] DEFAULT '{}',                 -- Fields that must have values
   unique_fields TEXT[] DEFAULT '{}',                   -- Fields that must be unique
   validation_errors_action VARCHAR(20) DEFAULT 'skip', -- skip, fail, log
   
   -- Format settings
   date_format VARCHAR(50),                             -- Date format pattern
   number_format VARCHAR(50),                           -- Number format pattern
   timezone_handling VARCHAR(20) DEFAULT 'preserve',     -- preserve, convert, utc
   
   -- Error handling
   on_error_action VARCHAR(20) DEFAULT 'skip',         -- skip, fail, default
   error_notification BOOLEAN DEFAULT true,             -- Send notifications on errors
   
   -- Performance settings
   is_indexed BOOLEAN DEFAULT false,                    -- Whether to index mapped fields
   cache_lookups BOOLEAN DEFAULT true,                  -- Cache lookup values
   batch_size INTEGER DEFAULT 1000,                     -- Records per batch
   
   -- Testing
   test_data JSONB DEFAULT '{}',                        -- Sample data for testing
   last_tested_at TIMESTAMP WITH TIME ZONE,             -- When mapping was last tested
   test_results JSONB DEFAULT '{}',                     -- Results of last test
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   created_by UUID,                                     -- User who created mapping
   approved_by UUID,                                    -- User who approved mapping
   
   -- Constraints
   CONSTRAINT chk_sync_direction CHECK (sync_direction IN ('inbound', 'outbound', 'bidirectional')),
   CONSTRAINT chk_default_value_type CHECK (default_value_type IS NULL OR default_value_type IN ('static', 'dynamic', 'null')),
   CONSTRAINT chk_null_handling CHECK (null_handling IN ('preserve', 'skip', 'default', 'error')),
   CONSTRAINT chk_validation_errors_action CHECK (validation_errors_action IN ('skip', 'fail', 'log')),
   CONSTRAINT chk_timezone_handling CHECK (timezone_handling IN ('preserve', 'convert', 'utc')),
   CONSTRAINT chk_on_error_action CHECK (on_error_action IN ('skip', 'fail', 'default')),
   CONSTRAINT chk_mapping_version CHECK (mapping_version > 0),
   CONSTRAINT chk_batch_size CHECK (batch_size > 0 AND batch_size <= 10000)
);

-- Add comments
COMMENT ON TABLE integration_mappings IS 'Field mapping configurations for data synchronization between systems';

COMMENT ON COLUMN integration_mappings.id IS 'Unique identifier for mapping configuration';
COMMENT ON COLUMN integration_mappings.integration_id IS 'Reference to integration configuration';
COMMENT ON COLUMN integration_mappings.integration_name IS 'Name of integration for easy querying';

COMMENT ON COLUMN integration_mappings.mapping_name IS 'Human-readable name for this mapping';
COMMENT ON COLUMN integration_mappings.mapping_version IS 'Version number for tracking changes';
COMMENT ON COLUMN integration_mappings.is_active IS 'Whether this mapping is currently in use';

COMMENT ON COLUMN integration_mappings.source_entity IS 'Source table/entity name';
COMMENT ON COLUMN integration_mappings.target_entity IS 'Target table/entity name';
COMMENT ON COLUMN integration_mappings.sync_direction IS 'Direction of data flow';

COMMENT ON COLUMN integration_mappings.field_mappings IS 'JSON array of field mapping definitions';

COMMENT ON COLUMN integration_mappings.source_data_type IS 'Overall data type in source system';
COMMENT ON COLUMN integration_mappings.target_data_type IS 'Overall data type in target system';
COMMENT ON COLUMN integration_mappings.type_conversion IS 'Strategy for type conversion';

COMMENT ON COLUMN integration_mappings.transformation_function IS 'Built-in transformation to apply';
COMMENT ON COLUMN integration_mappings.custom_script IS 'Custom transformation logic';
COMMENT ON COLUMN integration_mappings.validation_rules IS 'Rules for validating data';

COMMENT ON COLUMN integration_mappings.default_value_type IS 'Type of default value';
COMMENT ON COLUMN integration_mappings.default_value IS 'Default value or expression';
COMMENT ON COLUMN integration_mappings.null_handling IS 'How to handle null values';

COMMENT ON COLUMN integration_mappings.conditions IS 'Conditions for applying this mapping';
COMMENT ON COLUMN integration_mappings.conditional_mappings IS 'Alternative mappings based on conditions';

COMMENT ON COLUMN integration_mappings.value_lookup_table IS 'Direct value-to-value mappings';
COMMENT ON COLUMN integration_mappings.enum_mappings IS 'Enumeration value mappings';

COMMENT ON COLUMN integration_mappings.required_fields IS 'Fields that must have values';
COMMENT ON COLUMN integration_mappings.unique_fields IS 'Fields that must be unique';
COMMENT ON COLUMN integration_mappings.validation_errors_action IS 'Action on validation errors';

COMMENT ON COLUMN integration_mappings.date_format IS 'Format for date fields';
COMMENT ON COLUMN integration_mappings.number_format IS 'Format for number fields';
COMMENT ON COLUMN integration_mappings.timezone_handling IS 'How to handle timezones';

COMMENT ON COLUMN integration_mappings.on_error_action IS 'Action to take on mapping errors';
COMMENT ON COLUMN integration_mappings.error_notification IS 'Whether to send error notifications';

COMMENT ON COLUMN integration_mappings.is_indexed IS 'Whether to create indexes on mapped fields';
COMMENT ON COLUMN integration_mappings.cache_lookups IS 'Whether to cache lookup values';
COMMENT ON COLUMN integration_mappings.batch_size IS 'Number of records to process per batch';

COMMENT ON COLUMN integration_mappings.test_data IS 'Sample data for testing mappings';
COMMENT ON COLUMN integration_mappings.last_tested_at IS 'When mapping was last tested';
COMMENT ON COLUMN integration_mappings.test_results IS 'Results from last test run';

-- Create indexes
CREATE INDEX idx_integration_mappings_integration_id ON integration_mappings(integration_id);
CREATE INDEX idx_integration_mappings_integration_name ON integration_mappings(integration_name);
CREATE INDEX idx_integration_mappings_source_entity ON integration_mappings(source_entity);
CREATE INDEX idx_integration_mappings_target_entity ON integration_mappings(target_entity);
CREATE INDEX idx_integration_mappings_is_active ON integration_mappings(is_active);
CREATE INDEX idx_integration_mappings_sync_direction ON integration_mappings(sync_direction);
CREATE INDEX idx_integration_mappings_mapping_name ON integration_mappings(mapping_name);

-- Composite indexes
CREATE INDEX idx_integration_mappings_entity_pair ON integration_mappings(source_entity, target_entity);
CREATE INDEX idx_integration_mappings_active_direction ON integration_mappings(is_active, sync_direction)
   WHERE is_active = true;

-- JSONB indexes
CREATE INDEX idx_integration_mappings_field_mappings ON integration_mappings USING GIN(field_mappings);
CREATE INDEX idx_integration_mappings_conditions ON integration_mappings USING GIN(conditions);
CREATE INDEX idx_integration_mappings_value_lookups ON integration_mappings USING GIN(value_lookup_table);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_integration_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_integration_mappings_updated_at 
   BEFORE UPDATE ON integration_mappings
   FOR EACH ROW EXECUTE FUNCTION update_integration_mappings_updated_at();

-- Create function to validate field mapping
CREATE OR REPLACE FUNCTION validate_field_mapping(
   p_mapping_id UUID,
   p_test_data JSONB
) RETURNS TABLE (
   is_valid BOOLEAN,
   errors JSONB,
   warnings JSONB,
   transformed_data JSONB
) AS $$
DECLARE
   v_mapping RECORD;
   v_errors JSONB := '[]'::JSONB;
   v_warnings JSONB := '[]'::JSONB;
   v_result JSONB := '{}'::JSONB;
BEGIN
   -- Get mapping configuration
   SELECT * INTO v_mapping FROM integration_mappings WHERE id = p_mapping_id;
   
   -- Basic validation logic (placeholder for actual implementation)
   IF v_mapping.id IS NULL THEN
       v_errors := v_errors || '["Mapping not found"]'::JSONB;
       RETURN QUERY SELECT false, v_errors, v_warnings, NULL::JSONB;
       RETURN;
   END IF;
   
   -- Check required fields
   IF v_mapping.required_fields IS NOT NULL THEN
       -- Add validation logic here
       v_result := p_test_data; -- Placeholder
   END IF;
   
   -- Update test results
   UPDATE integration_mappings 
   SET last_tested_at = CURRENT_TIMESTAMP,
       test_results = jsonb_build_object(
           'timestamp', CURRENT_TIMESTAMP,
           'errors', v_errors,
           'warnings', v_warnings,
           'sample_output', v_result
       )
   WHERE id = p_mapping_id;
   
   RETURN QUERY SELECT 
       jsonb_array_length(v_errors) = 0,
       v_errors,
       v_warnings,
       v_result;
END;
$$ LANGUAGE plpgsql;

-- Create view for active mappings
CREATE OR REPLACE VIEW active_integration_mappings AS
SELECT 
   im.*,
   jsonb_array_length(im.field_mappings) as field_count,
   CASE 
       WHEN im.last_tested_at IS NULL THEN 'never_tested'
       WHEN im.last_tested_at < CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'needs_testing'
       ELSE 'recently_tested'
   END AS test_status
FROM integration_mappings im
WHERE im.is_active = true
ORDER BY im.integration_name, im.source_entity, im.target_entity;

COMMENT ON VIEW active_integration_mappings IS 'Currently active integration mappings with test status';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON integration_mappings TO app_user;
-- GRANT SELECT ON active_integration_mappings TO app_user;
-- GRANT EXECUTE ON FUNCTION validate_field_mapping(UUID, JSONB) TO app_user;

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_integration_mappings_tenant_id ON integration_mappings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integration_mappings_tenant_created ON integration_mappings(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

