/**
 * Migration: Add Row-Level Security Policies
 * AUDIT FIX: DB-4,5 - Enable RLS for multi-tenant data isolation
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // 1. Create app user for connection pooling (if not exists)
  // ==========================================================================
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'analytics_app') THEN
        CREATE ROLE analytics_app WITH LOGIN PASSWORD 'change-in-production';
      END IF;
    END
    $$;
  `);

  // ==========================================================================
  // 2. Enable RLS on all tenant-scoped tables
  // ==========================================================================
  const tenantTables = [
    'customers',
    'customer_segments',
    'customer_rfm_scores',
    'analytics_events',
    'dashboards',
    'dashboard_widgets',
    'reports',
    'scheduled_reports',
    'alerts',
    'alert_history',
    'campaigns',
    'campaign_metrics',
    'exports',
  ];

  for (const table of tenantTables) {
    // Check if table exists before enabling RLS
    const exists = await knex.raw(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ?
      );
    `, [table]);

    if (exists.rows[0]?.exists) {
      // Enable RLS
      await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

      // Drop existing policies if any
      await knex.raw(`
        DO $$
        BEGIN
          DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table};
          DROP POLICY IF EXISTS ${table}_tenant_select ON ${table};
          DROP POLICY IF EXISTS ${table}_tenant_insert ON ${table};
          DROP POLICY IF EXISTS ${table}_tenant_update ON ${table};
          DROP POLICY IF EXISTS ${table}_tenant_delete ON ${table};
        EXCEPTION WHEN undefined_object THEN
          NULL;
        END
        $$;
      `);

      // Create tenant isolation policies
      await knex.raw(`
        CREATE POLICY ${table}_tenant_select ON ${table}
          FOR SELECT
          USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      `);

      await knex.raw(`
        CREATE POLICY ${table}_tenant_insert ON ${table}
          FOR INSERT
          WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      `);

      await knex.raw(`
        CREATE POLICY ${table}_tenant_update ON ${table}
          FOR UPDATE
          USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
          WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      `);

      await knex.raw(`
        CREATE POLICY ${table}_tenant_delete ON ${table}
          FOR DELETE
          USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      `);

      console.log(`✅ RLS enabled on ${table}`);
    }
  }

  // ==========================================================================
  // 3. Grant permissions to app user
  // ==========================================================================
  await knex.raw(`
    GRANT USAGE ON SCHEMA public TO analytics_app;
  `);

  for (const table of tenantTables) {
    const exists = await knex.raw(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ?
      );
    `, [table]);

    if (exists.rows[0]?.exists) {
      await knex.raw(`
        GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO analytics_app;
      `);
    }
  }

  // Grant sequence permissions
  await knex.raw(`
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_app;
  `);

  // ==========================================================================
  // 4. Create audit trigger function
  // ==========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_trigger_func()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        NEW.created_at = COALESCE(NEW.created_at, NOW());
        NEW.updated_at = NOW();
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        NEW.updated_at = NOW();
        RETURN NEW;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Apply audit triggers to tenant tables
  for (const table of tenantTables) {
    const exists = await knex.raw(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ?
      );
    `, [table]);

    if (exists.rows[0]?.exists) {
      await knex.raw(`
        DROP TRIGGER IF EXISTS ${table}_audit_trigger ON ${table};
        CREATE TRIGGER ${table}_audit_trigger
          BEFORE INSERT OR UPDATE ON ${table}
          FOR EACH ROW
          EXECUTE FUNCTION audit_trigger_func();
      `);
    }
  }

  // ==========================================================================
  // 5. Create indexes for tenant_id columns
  // ==========================================================================
  for (const table of tenantTables) {
    const exists = await knex.raw(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ?
      );
    `, [table]);

    if (exists.rows[0]?.exists) {
      // Check if index already exists
      const indexExists = await knex.raw(`
        SELECT EXISTS (
          SELECT FROM pg_indexes 
          WHERE tablename = ? 
          AND indexname = ?
        );
      `, [table, `idx_${table}_tenant_id`]);

      if (!indexExists.rows[0]?.exists) {
        await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${table}_tenant_id 
          ON ${table}(tenant_id);
        `);
      }
    }
  }

  console.log('✅ RLS migration complete');
}

export async function down(knex: Knex): Promise<void> {
  const tenantTables = [
    'customers',
    'customer_segments',
    'customer_rfm_scores',
    'analytics_events',
    'dashboards',
    'dashboard_widgets',
    'reports',
    'scheduled_reports',
    'alerts',
    'alert_history',
    'campaigns',
    'campaign_metrics',
    'exports',
  ];

  // Disable RLS on all tables
  for (const table of tenantTables) {
    const exists = await knex.raw(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ?
      );
    `, [table]);

    if (exists.rows[0]?.exists) {
      // Drop policies
      await knex.raw(`
        DO $$
        BEGIN
          DROP POLICY IF EXISTS ${table}_tenant_select ON ${table};
          DROP POLICY IF EXISTS ${table}_tenant_insert ON ${table};
          DROP POLICY IF EXISTS ${table}_tenant_update ON ${table};
          DROP POLICY IF EXISTS ${table}_tenant_delete ON ${table};
        EXCEPTION WHEN undefined_object THEN
          NULL;
        END
        $$;
      `);

      // Disable RLS
      await knex.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);

      // Drop triggers
      await knex.raw(`DROP TRIGGER IF EXISTS ${table}_audit_trigger ON ${table}`);
    }
  }

  // Drop audit function
  await knex.raw(`DROP FUNCTION IF EXISTS audit_trigger_func()`);

  console.log('✅ RLS rollback complete');
}
