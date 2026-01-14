/**
 * Shared Database Functions Migration
 * 
 * This migration creates common database functions used by multiple services.
 * Consolidates duplicate functions that were previously created in 8+ services.
 * 
 * Functions:
 * - update_updated_at_column(): Auto-updates updated_at timestamp on row changes
 * - audit_trigger_function(): Creates audit log entries for INSERT/UPDATE/DELETE
 * - set_tenant_context(): Sets the tenant context for RLS policies
 * - get_tenant_context(): Gets the current tenant context
 * 
 * These functions should run BEFORE any service-specific migrations.
 */

import { Knex } from 'knex';

export const MIGRATION_NAME = '001_shared_functions';
export const MIGRATION_VERSION = '1.0.0';

// Standard tenant context setting name - USE THIS EVERYWHERE
export const TENANT_CONTEXT_SETTING = 'app.current_tenant_id';

export async function up(knex: Knex): Promise<void> {
  console.log('[Shared Migration] Creating shared database functions...');

  // ==========================================
  // FUNCTION: update_updated_at_column
  // ==========================================
  // Previously duplicated in: auth, payment, notification, venue, event, order, transfer, monitoring
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: set_tenant_context
  // ==========================================
  // Helper function to set tenant context for RLS
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID)
    RETURNS void AS $$
    BEGIN
      PERFORM set_config('${TENANT_CONTEXT_SETTING}', tenant_id::TEXT, false);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // ==========================================
  // FUNCTION: set_tenant_context_local
  // ==========================================
  // Sets tenant context for current transaction only
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_tenant_context_local(tenant_id UUID)
    RETURNS void AS $$
    BEGIN
      PERFORM set_config('${TENANT_CONTEXT_SETTING}', tenant_id::TEXT, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // ==========================================
  // FUNCTION: get_tenant_context
  // ==========================================
  // Helper function to get current tenant context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_tenant_context()
    RETURNS UUID AS $$
    DECLARE
      tenant_id UUID;
    BEGIN
      BEGIN
        tenant_id := current_setting('${TENANT_CONTEXT_SETTING}', true)::UUID;
      EXCEPTION WHEN OTHERS THEN
        tenant_id := NULL;
      END;
      RETURN tenant_id;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // ==========================================
  // FUNCTION: require_tenant_context
  // ==========================================
  // Raises error if tenant context is not set (use in triggers)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION require_tenant_context()
    RETURNS UUID AS $$
    DECLARE
      tenant_id UUID;
    BEGIN
      tenant_id := get_tenant_context();
      IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context not set. Call set_tenant_context() first.';
      END IF;
      RETURN tenant_id;
    END;
    $$ LANGUAGE plpgsql STABLE;
  `);

  // ==========================================
  // FUNCTION: audit_trigger_function
  // ==========================================
  // Previously created only in auth-service but expected by others
  // Now shared and uses standardized tenant context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_trigger_function()
    RETURNS TRIGGER SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DECLARE
      old_data_json JSONB;
      new_data_json JSONB;
      changed_fields_array TEXT[];
      field_name TEXT;
      current_user_id UUID;
      current_ip TEXT;
      current_user_agent TEXT;
      current_tenant UUID;
    BEGIN
      -- Get context from session settings
      BEGIN
        current_user_id := current_setting('app.current_user_id', true)::UUID;
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

      BEGIN
        current_tenant := current_setting('${TENANT_CONTEXT_SETTING}', true)::UUID;
      EXCEPTION WHEN OTHERS THEN
        current_tenant := NULL;
      END;

      IF (TG_OP = 'DELETE') THEN
        old_data_json := to_jsonb(OLD);
        INSERT INTO audit_logs (
          service, action, action_type, user_id, tenant_id,
          table_name, record_id, resource_type, resource_id,
          old_data, ip_address, user_agent, success
        )
        VALUES (
          'database-trigger', 'DELETE', 'DELETE', current_user_id, current_tenant,
          TG_TABLE_NAME, OLD.id, TG_TABLE_NAME, OLD.id,
          old_data_json, current_ip, current_user_agent, true
        );
        RETURN OLD;
        
      ELSIF (TG_OP = 'UPDATE') THEN
        old_data_json := to_jsonb(OLD);
        new_data_json := to_jsonb(NEW);
        changed_fields_array := ARRAY[]::TEXT[];
        
        FOR field_name IN SELECT jsonb_object_keys(old_data_json) LOOP
          IF field_name != 'updated_at' AND old_data_json->field_name IS DISTINCT FROM new_data_json->field_name THEN
            changed_fields_array := array_append(changed_fields_array, field_name);
          END IF;
        END LOOP;
        
        IF array_length(changed_fields_array, 1) > 0 THEN
          INSERT INTO audit_logs (
            service, action, action_type, user_id, tenant_id,
            table_name, record_id, resource_type, resource_id,
            changed_fields, old_data, new_data, ip_address, user_agent, success
          )
          VALUES (
            'database-trigger', 'UPDATE', 'UPDATE', current_user_id, current_tenant,
            TG_TABLE_NAME, NEW.id, TG_TABLE_NAME, NEW.id,
            changed_fields_array, old_data_json, new_data_json, current_ip, current_user_agent, true
          );
        END IF;
        RETURN NEW;
        
      ELSIF (TG_OP = 'INSERT') THEN
        new_data_json := to_jsonb(NEW);
        INSERT INTO audit_logs (
          service, action, action_type, user_id, tenant_id,
          table_name, record_id, resource_type, resource_id,
          new_data, ip_address, user_agent, success
        )
        VALUES (
          'database-trigger', 'INSERT', 'INSERT', current_user_id, current_tenant,
          TG_TABLE_NAME, NEW.id, TG_TABLE_NAME, NEW.id,
          new_data_json, current_ip, current_user_agent, true
        );
        RETURN NEW;
      END IF;
      
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // FUNCTION: validate_tenant_id
  // ==========================================
  // Validates that a tenant_id column matches the current context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_tenant_id()
    RETURNS TRIGGER AS $$
    DECLARE
      current_tenant UUID;
    BEGIN
      current_tenant := get_tenant_context();
      
      -- Skip validation if no tenant context is set (e.g., during migrations)
      IF current_tenant IS NULL THEN
        RETURN NEW;
      END IF;
      
      -- Validate tenant_id matches context
      IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id != current_tenant THEN
        RAISE EXCEPTION 'Tenant ID mismatch: expected %, got %', current_tenant, NEW.tenant_id;
      END IF;
      
      -- Auto-populate tenant_id if not provided
      IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := current_tenant;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================
  // PII MASKING FUNCTIONS
  // ==========================================
  // Useful for audit logs and support views
  
  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_email(email TEXT)
    RETURNS TEXT AS $$
    BEGIN
      IF email IS NULL THEN RETURN NULL; END IF;
      RETURN CASE 
        WHEN position('@' IN email) > 3
        THEN left(email, 2) || repeat('*', position('@' IN email) - 3) || substring(email from position('@' IN email))
        ELSE repeat('*', position('@' IN email) - 1) || substring(email from position('@' IN email))
      END;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_phone(phone TEXT)
    RETURNS TEXT AS $$
    BEGIN
      IF phone IS NULL THEN RETURN NULL; END IF;
      RETURN regexp_replace(phone, '(\\d{3})(\\d+)(\\d{4})', '\\1-***-\\3');
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_card_number(card TEXT)
    RETURNS TEXT AS $$
    BEGIN
      IF card IS NULL THEN RETURN NULL; END IF;
      RETURN repeat('*', length(card) - 4) || right(card, 4);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION mask_tax_id(tax_id TEXT)
    RETURNS TEXT AS $$
    BEGIN
      IF tax_id IS NULL THEN RETURN NULL; END IF;
      RETURN '***-**-' || right(tax_id, 4);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  console.log('[Shared Migration] Shared functions created successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('[Shared Migration] Removing shared database functions...');

  // Drop PII masking functions (CASCADE to handle dependencies)
  await knex.raw('DROP FUNCTION IF EXISTS mask_tax_id(TEXT) CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS mask_card_number(TEXT) CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS mask_phone(TEXT) CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS mask_email(TEXT) CASCADE');

  // Drop helper functions (CASCADE to handle trigger dependencies)
  await knex.raw('DROP FUNCTION IF EXISTS validate_tenant_id() CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS audit_trigger_function() CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS require_tenant_context() CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS get_tenant_context() CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS set_tenant_context_local(UUID) CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS set_tenant_context(UUID) CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');

  console.log('[Shared Migration] Shared functions removed successfully');
}
