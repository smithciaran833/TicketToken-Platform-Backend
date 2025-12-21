-- =====================================================================
-- GENERIC AUDIT TRIGGER FUNCTION
-- =====================================================================
-- Purpose: Automatically capture INSERT, UPDATE, DELETE operations
-- for regulatory compliance and change tracking
-- 
-- Usage: Apply this trigger to any table that requires audit tracking
-- Created: 2025-11-28
-- =====================================================================

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_data_json JSONB;
  new_data_json JSONB;
  changed_fields_array TEXT[];
  field_name TEXT;
  current_user_id UUID;
  current_ip TEXT;
  current_user_agent TEXT;
BEGIN
  -- Safely retrieve session variables (may be NULL)
  BEGIN
    current_user_id := current_setting('app.user_id', true)::UUID;
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
  END;
  
  BEGIN
    current_ip := current_setting('app.ip_address', true);
  EXCEPTION WHEN OTHERS THEN
    current_ip := NULL;
  END;
  
  BEGIN
    current_user_agent := current_setting('app.user_agent', true);
  EXCEPTION WHEN OTHERS THEN
    current_user_agent := NULL;
  END;

  -- Handle DELETE operations
  IF (TG_OP = 'DELETE') THEN
    old_data_json := to_jsonb(OLD);
    
    INSERT INTO audit_logs (
      service,
      action,
      action_type,
      user_id,
      table_name,
      record_id,
      resource_type,
      resource_id,
      old_data,
      ip_address,
      user_agent,
      success
    ) VALUES (
      'database-trigger',
      'DELETE',
      'DELETE',
      current_user_id,
      TG_TABLE_NAME,
      OLD.id,
      TG_TABLE_NAME,
      OLD.id,
      old_data_json,
      current_ip,
      current_user_agent,
      true
    );
    
    RETURN OLD;
    
  -- Handle UPDATE operations
  ELSIF (TG_OP = 'UPDATE') THEN
    old_data_json := to_jsonb(OLD);
    new_data_json := to_jsonb(NEW);
    changed_fields_array := ARRAY[]::TEXT[];
    
    -- Detect which fields changed
    FOR field_name IN 
      SELECT jsonb_object_keys(old_data_json)
    LOOP
      -- Compare old and new values, excluding updated_at to avoid noise
      IF field_name != 'updated_at' AND 
         old_data_json->field_name IS DISTINCT FROM new_data_json->field_name THEN
        changed_fields_array := array_append(changed_fields_array, field_name);
      END IF;
    END LOOP;
    
    -- Only log if fields actually changed (excluding just updated_at)
    IF array_length(changed_fields_array, 1) > 0 THEN
      INSERT INTO audit_logs (
        service,
        action,
        action_type,
        user_id,
        table_name,
        record_id,
        resource_type,
        resource_id,
        changed_fields,
        old_data,
        new_data,
        ip_address,
        user_agent,
        success
      ) VALUES (
        'database-trigger',
        'UPDATE',
        'UPDATE',
        current_user_id,
        TG_TABLE_NAME,
        NEW.id,
        TG_TABLE_NAME,
        NEW.id,
        changed_fields_array,
        old_data_json,
        new_data_json,
        current_ip,
        current_user_agent,
        true
      );
    END IF;
    
    RETURN NEW;
    
  -- Handle INSERT operations
  ELSIF (TG_OP = 'INSERT') THEN
    new_data_json := to_jsonb(NEW);
    
    INSERT INTO audit_logs (
      service,
      action,
      action_type,
      user_id,
      table_name,
      record_id,
      resource_type,
      resource_id,
      new_data,
      ip_address,
      user_agent,
      success
    ) VALUES (
      'database-trigger',
      'INSERT',
      'INSERT',
      current_user_id,
      TG_TABLE_NAME,
      NEW.id,
      TG_TABLE_NAME,
      NEW.id,
      new_data_json,
      current_ip,
      current_user_agent,
      true
    );
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION audit_trigger_function() IS 
  'Generic audit trigger function that captures INSERT/UPDATE/DELETE operations with field-level change tracking';

-- =====================================================================
-- APPLY TRIGGERS TO CRITICAL TABLES FOR COMPLIANCE
-- =====================================================================

-- Drop existing triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS audit_users_changes ON users;
DROP TRIGGER IF EXISTS audit_venues_changes ON venues;
DROP TRIGGER IF EXISTS audit_venue_compliance_changes ON venue_compliance;
DROP TRIGGER IF EXISTS audit_events_changes ON events;

-- Users table (PII and critical data)
CREATE TRIGGER audit_users_changes
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW 
  EXECUTE FUNCTION audit_trigger_function();

-- Venues table (business critical)
CREATE TRIGGER audit_venues_changes
  AFTER INSERT OR UPDATE OR DELETE ON venues
  FOR EACH ROW 
  EXECUTE FUNCTION audit_trigger_function();

-- Venue compliance table (regulatory requirement)
CREATE TRIGGER audit_venue_compliance_changes
  AFTER INSERT OR UPDATE OR DELETE ON venue_compliance
  FOR EACH ROW 
  EXECUTE FUNCTION audit_trigger_function();

-- Events table (business critical)
CREATE TRIGGER audit_events_changes
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW 
  EXECUTE FUNCTION audit_trigger_function();

-- Add more table triggers as needed:
-- CREATE TRIGGER audit_<table_name>_changes
--   AFTER INSERT OR UPDATE OR DELETE ON <table_name>
--   FOR EACH ROW 
--   EXECUTE FUNCTION audit_trigger_function();

-- =====================================================================
-- USAGE INSTRUCTIONS
-- =====================================================================
/*

To enable audit tracking on additional tables:

1. Apply trigger to table:
   CREATE TRIGGER audit_<table_name>_changes
     AFTER INSERT OR UPDATE OR DELETE ON <table_name>
     FOR EACH ROW 
     EXECUTE FUNCTION audit_trigger_function();

2. Set context variables in your application before database operations:
   
   SET LOCAL app.user_id = '<user-uuid>';
   SET LOCAL app.ip_address = '<ip-address>';
   SET LOCAL app.user_agent = '<user-agent>';
   
   -- Then perform your INSERT/UPDATE/DELETE
   UPDATE users SET status = 'ACTIVE' WHERE id = '...';

3. Query audit logs:
   SELECT * FROM audit_logs 
   WHERE table_name = 'users' 
     AND record_id = '<user-id>'
   ORDER BY created_at DESC;

4. View what fields changed:
   SELECT 
     created_at,
     action,
     changed_fields,
     old_data,
     new_data
   FROM audit_logs
   WHERE table_name = 'users'
     AND record_id = '<user-id>'
     AND changed_fields IS NOT NULL;

*/
