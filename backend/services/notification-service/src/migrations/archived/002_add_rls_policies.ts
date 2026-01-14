import { Knex } from 'knex';

/**
 * Migration: Add Row Level Security (RLS) Policies to Notification Service
 * 
 * CRITICAL SECURITY FIX:
 * - Enables RLS on all notification tables with tenant_id
 * - Creates tenant isolation policies
 * - Adds venue isolation policies for venue-scoped tables
 * 
 * This prevents cross-tenant data access at the database level.
 */

// Tables with tenant_id that need tenant RLS
const TABLES_WITH_TENANT = [
  'scheduled_notifications',
  'notification_tracking',
  'ab_test_metrics',
  'automation_executions',
  'bounces',
  'campaign_stats',
  'engagement_events',
  'notification_analytics_daily',
  'pending_deletions',
  'template_usage',
  'template_versions',
  'translations',
  'venue_health_scores',
];

// Tables with venue_id that need venue RLS
const TABLES_WITH_VENUE = [
  'notification_history',
  'consent_records',
  'notification_templates',
  'notification_campaigns',
  'audience_segments',
  'email_automation_triggers',
  'ab_tests',
  'abandoned_carts',
  'venue_notification_settings',
  'notification_costs',
];

// Tables with user_id that need user-scoped RLS
const TABLES_WITH_USER = [
  'notification_preferences',
  'notification_preference_history',
  'notification_engagement',
  'notification_clicks',
];

// System/global tables - skip RLS
const SKIP_TABLES = [
  'suppression_list', // Global lookup
  'notification_delivery_stats', // Aggregate stats
  'notification_analytics', // Aggregate stats
];

export async function up(knex: Knex): Promise<void> {
  console.log('🔒 Starting RLS migration for notification-service...');

  // ==========================================================================
  // STEP 1: Enable RLS on tenant-scoped tables
  // ==========================================================================
  console.log('1. Enabling RLS on tenant-scoped tables...');

  for (const tableName of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`   ⚠️  Table ${tableName} does not exist, skipping...`);
      continue;
    }

    try {
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

      // Create tenant isolation policy
      await knex.raw(`
        DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName};
        CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
          FOR ALL
          USING (
            tenant_id = COALESCE(
              NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          )
          WITH CHECK (
            tenant_id = COALESCE(
              NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          );
      `);
      console.log(`   ✅ RLS enabled on ${tableName}`);
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  // ==========================================================================
  // STEP 2: Enable RLS on venue-scoped tables
  // ==========================================================================
  console.log('2. Enabling RLS on venue-scoped tables...');

  for (const tableName of TABLES_WITH_VENUE) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`   ⚠️  Table ${tableName} does not exist, skipping...`);
      continue;
    }

    try {
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

      // Create venue isolation policy
      await knex.raw(`
        DROP POLICY IF EXISTS ${tableName}_venue_isolation ON ${tableName};
        CREATE POLICY ${tableName}_venue_isolation ON ${tableName}
          FOR ALL
          USING (
            venue_id = COALESCE(
              NULLIF(current_setting('app.current_venue_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          )
          WITH CHECK (
            venue_id = COALESCE(
              NULLIF(current_setting('app.current_venue_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          );
      `);
      console.log(`   ✅ RLS enabled on ${tableName}`);
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  // ==========================================================================
  // STEP 3: Enable RLS on user-scoped tables
  // ==========================================================================
  console.log('3. Enabling RLS on user-scoped tables...');

  for (const tableName of TABLES_WITH_USER) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`   ⚠️  Table ${tableName} does not exist, skipping...`);
      continue;
    }

    try {
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

      // Create user isolation policy
      await knex.raw(`
        DROP POLICY IF EXISTS ${tableName}_user_isolation ON ${tableName};
        CREATE POLICY ${tableName}_user_isolation ON ${tableName}
          FOR ALL
          USING (
            user_id = COALESCE(
              NULLIF(current_setting('app.current_user_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          )
          WITH CHECK (
            user_id = COALESCE(
              NULLIF(current_setting('app.current_user_id', true), '')::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
            OR current_setting('app.bypass_rls', true) = 'true'
            OR current_user = 'postgres'
          );
      `);
      console.log(`   ✅ RLS enabled on ${tableName}`);
    } catch (err: any) {
      console.error(`   ❌ Error on ${tableName}: ${err.message}`);
    }
  }

  // ==========================================================================
  // STEP 4: Create helper functions
  // ==========================================================================
  console.log('4. Creating tenant context helper functions...');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION notification_set_tenant_context(p_tenant_id UUID)
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION notification_set_venue_context(p_venue_id UUID)
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_venue_id', p_venue_id::text, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION notification_set_user_context(p_user_id UUID)
    RETURNS VOID AS $$
    BEGIN
      PERFORM set_config('app.current_user_id', p_user_id::text, true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log('   ✅ Helper functions created');
  console.log('✅ RLS migration completed for notification-service!');
  console.log(`   - Tenant-scoped tables: ${TABLES_WITH_TENANT.length}`);
  console.log(`   - Venue-scoped tables: ${TABLES_WITH_VENUE.length}`);
  console.log(`   - User-scoped tables: ${TABLES_WITH_USER.length}`);
  console.log(`   - Skipped tables: ${SKIP_TABLES.length}`);
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔓 Rolling back RLS migration for notification-service...');

  // Drop policies from tenant-scoped tables
  for (const tableName of TABLES_WITH_TENANT) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) continue;
    
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop policies from venue-scoped tables
  for (const tableName of TABLES_WITH_VENUE) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) continue;
    
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_venue_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop policies from user-scoped tables
  for (const tableName of TABLES_WITH_USER) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) continue;
    
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_user_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop helper functions
  await knex.raw('DROP FUNCTION IF EXISTS notification_set_tenant_context(UUID)');
  await knex.raw('DROP FUNCTION IF EXISTS notification_set_venue_context(UUID)');
  await knex.raw('DROP FUNCTION IF EXISTS notification_set_user_context(UUID)');

  console.log('✅ RLS rollback completed for notification-service!');
}
