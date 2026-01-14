/**
 * Migration: Add Row Level Security Policies
 * 
 * AUDIT FIXES:
 * - MT-1: No RLS policies - enables row-level tenant isolation
 * - MT-3: No tenant session variable setting
 * - DB-2: No RLS enabled on tables
 * - DB-1: CASCADE DELETE on compliance data - changed to RESTRICT
 * 
 * This migration:
 * 1. Enables RLS on all compliance tables
 * 2. Creates tenant-based policies
 * 3. Fixes CASCADE DELETE to RESTRICT for tax data
 * 4. Adds audit triggers
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // STEP 1: Create app_compliance role if not exists
  // ============================================================================
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_compliance') THEN
        CREATE ROLE app_compliance;
      END IF;
    END
    $$;
  `);

  // ============================================================================
  // STEP 2: Create tenant_id setting function
  // ============================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION compliance.get_current_tenant_id()
    RETURNS TEXT AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_tenant_id', true), '');
    EXCEPTION
      WHEN OTHERS THEN
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  // ============================================================================
  // STEP 3: Add tenant_id column to tables if missing
  // ============================================================================
  const tables = [
    'venue_verifications',
    'venue_documents',
    'tax_records',
    'tax_summaries',
    'ofac_screenings',
    'risk_assessments',
    'risk_flags',
    'bank_verifications',
    'gdpr_requests',
    'compliance_settings',
    'audit_logs'
  ];

  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      const hasColumn = await knex.schema.hasColumn(table, 'tenant_id');
      if (!hasColumn) {
        await knex.schema.alterTable(table, (t) => {
          t.string('tenant_id', 100).notNullable().defaultTo('default');
          t.index(['tenant_id'], `idx_${table}_tenant_id`);
        });
      }
    }
  }

  // ============================================================================
  // STEP 4: Enable RLS on all tables
  // ============================================================================
  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }
  }

  // ============================================================================
  // STEP 5: Create RLS policies for each table
  // ============================================================================
  
  // Drop existing policies first
  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_insert ON ${table}`);
    }
  }

  // Create tenant isolation policies
  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      // SELECT/UPDATE/DELETE policy
      await knex.raw(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
        FOR ALL
        TO app_compliance
        USING (tenant_id = compliance.get_current_tenant_id())
        WITH CHECK (tenant_id = compliance.get_current_tenant_id())
      `);
    }
  }

  // ============================================================================
  // STEP 6: Fix CASCADE DELETE issues (DB-1)
  // ============================================================================
  
  // Tax records should NOT be deleted when venue is deleted (legal requirement)
  await knex.raw(`
    DO $$
    BEGIN
      -- Drop existing constraint if any
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_tax_records_venue'
      ) THEN
        ALTER TABLE tax_records DROP CONSTRAINT fk_tax_records_venue;
      END IF;
      
      -- Add RESTRICT constraint
      ALTER TABLE tax_records 
      ADD CONSTRAINT fk_tax_records_venue 
      FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT;
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN undefined_column THEN NULL;
    END
    $$;
  `);

  // Tax summaries should NOT be deleted when venue is deleted
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_tax_summaries_venue'
      ) THEN
        ALTER TABLE tax_summaries DROP CONSTRAINT fk_tax_summaries_venue;
      END IF;
      
      ALTER TABLE tax_summaries 
      ADD CONSTRAINT fk_tax_summaries_venue 
      FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT;
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN undefined_column THEN NULL;
    END
    $$;
  `);

  // OFAC screenings - keep for audit trail
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_ofac_screenings_venue'
      ) THEN
        ALTER TABLE ofac_screenings DROP CONSTRAINT fk_ofac_screenings_venue;
      END IF;
      
      ALTER TABLE ofac_screenings 
      ADD CONSTRAINT fk_ofac_screenings_venue 
      FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN undefined_column THEN NULL;
    END
    $$;
  `);

  // ============================================================================
  // STEP 7: Create audit trigger function
  // ============================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION compliance.audit_trigger_func()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_values,
        new_values,
        tenant_id,
        user_id,
        created_at
      ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        COALESCE(NEW.tenant_id, OLD.tenant_id, compliance.get_current_tenant_id()),
        current_setting('app.current_user_id', true),
        NOW()
      );
      RETURN COALESCE(NEW, OLD);
    EXCEPTION
      WHEN undefined_table THEN
        RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // ============================================================================
  // STEP 8: Add audit triggers to sensitive tables
  // ============================================================================
  const auditTables = [
    'tax_records',
    'tax_summaries',
    'venue_verifications',
    'bank_verifications',
    'gdpr_requests'
  ];

  for (const table of auditTables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`
        DROP TRIGGER IF EXISTS ${table}_audit_trigger ON ${table};
        CREATE TRIGGER ${table}_audit_trigger
        AFTER INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION compliance.audit_trigger_func();
      `);
    }
  }

  // ============================================================================
  // STEP 9: Grant permissions to app_compliance role
  // ============================================================================
  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO app_compliance`);
    }
  }

  await knex.raw(`GRANT EXECUTE ON FUNCTION compliance.get_current_tenant_id() TO app_compliance`);

  // ============================================================================
  // STEP 10: Add CHECK constraints (DB-3)
  // ============================================================================
  
  // EIN format check
  await knex.raw(`
    DO $$
    BEGIN
      ALTER TABLE venue_verifications 
      ADD CONSTRAINT chk_ein_format CHECK (ein ~ '^[0-9]{2}-[0-9]{7}$');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END
    $$;
  `);

  // Tax amount check - must be positive
  await knex.raw(`
    DO $$
    BEGIN
      ALTER TABLE tax_records 
      ADD CONSTRAINT chk_amount_positive CHECK (amount >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END
    $$;
  `);

  // Risk score check - 0-100 range
  await knex.raw(`
    DO $$
    BEGIN
      ALTER TABLE risk_assessments 
      ADD CONSTRAINT chk_risk_score_range CHECK (risk_score >= 0 AND risk_score <= 100);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END
    $$;
  `);

  // Status enum check for verifications
  await knex.raw(`
    DO $$
    BEGIN
      ALTER TABLE venue_verifications 
      ADD CONSTRAINT chk_status_valid CHECK (status IN ('pending', 'verified', 'rejected', 'expired'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'venue_verifications',
    'venue_documents',
    'tax_records',
    'tax_summaries',
    'ofac_screenings',
    'risk_assessments',
    'risk_flags',
    'bank_verifications',
    'gdpr_requests',
    'compliance_settings',
    'audit_logs'
  ];

  // Drop audit triggers
  const auditTables = [
    'tax_records',
    'tax_summaries',
    'venue_verifications',
    'bank_verifications',
    'gdpr_requests'
  ];

  for (const table of auditTables) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_audit_trigger ON ${table}`);
  }

  // Drop audit function
  await knex.raw(`DROP FUNCTION IF EXISTS compliance.audit_trigger_func()`);

  // Drop RLS policies
  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_insert ON ${table}`);
    }
  }

  // Disable RLS
  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }
  }

  // Drop CHECK constraints
  await knex.raw(`
    DO $$
    BEGIN
      ALTER TABLE venue_verifications DROP CONSTRAINT IF EXISTS chk_ein_format;
      ALTER TABLE venue_verifications DROP CONSTRAINT IF EXISTS chk_status_valid;
      ALTER TABLE tax_records DROP CONSTRAINT IF EXISTS chk_amount_positive;
      ALTER TABLE risk_assessments DROP CONSTRAINT IF EXISTS chk_risk_score_range;
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END
    $$;
  `);

  // Drop tenant function
  await knex.raw(`DROP FUNCTION IF EXISTS compliance.get_current_tenant_id()`);
}
