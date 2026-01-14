import { Knex } from 'knex';

/**
 * Scanning Service - Consolidated Baseline Migration
 *
 * Consolidated from 1 migration on January 2025
 *
 * Tables (7 total):
 *   Tenant-scoped (7): scanner_devices, devices, scans, scan_policy_templates,
 *                      scan_policies, offline_validation_cache, scan_anomalies
 *
 * Key fixes applied:
 *   - Changed uuid_generate_v4() to gen_random_uuid()
 *   - Removed zero UUID default on tenant_id
 *   - Standardized RLS pattern with NULLIF + app.is_system_user
 *   - Added FORCE RLS to all tenant tables
 *   - Converted 9 external FKs to comments (cross-service)
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // TENANT-SCOPED TABLES (7)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. SCANNER_DEVICES - Device registry with offline capability
  // --------------------------------------------------------------------------
  await knex.schema.createTable('scanner_devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('device_id', 255).notNullable().unique();
    table.string('device_name', 255).notNullable();
    table.string('device_type', 50).defaultTo('mobile');
    table.uuid('venue_id');
    table.uuid('registered_by');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('app_version', 50);
    table.boolean('can_scan_offline').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_sync_at', { useTz: true });
    table.timestamp('revoked_at', { useTz: true });
    table.uuid('revoked_by');
    table.text('revoked_reason');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('device_id', 'idx_scanner_devices_device_id');
    table.index('venue_id', 'idx_scanner_devices_venue_id');
    table.index('is_active', 'idx_scanner_devices_is_active');
    table.index('can_scan_offline', 'idx_scanner_devices_can_scan_offline');
    table.index(['venue_id', 'is_active'], 'idx_scanner_devices_venue_active');
    table.index('tenant_id', 'idx_scanner_devices_tenant_id');
  });

  // External FK comments
  await knex.raw(`COMMENT ON COLUMN scanner_devices.venue_id IS 'FK: venue-service.venues(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN scanner_devices.registered_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN scanner_devices.revoked_by IS 'FK: auth-service.users(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 2. DEVICES - Simple device tracking
  // --------------------------------------------------------------------------
  await knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('device_id', 255).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('zone', 100);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('device_id', 'idx_devices_device_id');
    table.index('zone', 'idx_devices_zone');
    table.index('is_active', 'idx_devices_is_active');
    table.index('tenant_id', 'idx_devices_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 3. SCANS - Scan event records
  // --------------------------------------------------------------------------
  await knex.schema.createTable('scans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('device_id');
    table.string('result', 50).notNullable();
    table.string('reason', 100);
    table.timestamp('scanned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.jsonb('metadata').defaultTo('{}');

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('ticket_id', 'idx_scans_ticket_id');
    table.index('device_id', 'idx_scans_device_id');
    table.index('result', 'idx_scans_result');
    table.index('scanned_at', 'idx_scans_scanned_at');
    table.index(['ticket_id', 'result', 'scanned_at'], 'idx_scans_ticket_result_time');
    table.index('tenant_id', 'idx_scans_tenant_id');
  });

  await knex.raw(`COMMENT ON COLUMN scans.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 4. SCAN_POLICY_TEMPLATES - Reusable policy templates
  // --------------------------------------------------------------------------
  await knex.schema.createTable('scan_policy_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('policy_set').notNullable();
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('is_default', 'idx_scan_policy_templates_is_default');
    table.index('name', 'idx_scan_policy_templates_name');
    table.index('tenant_id', 'idx_scan_policy_templates_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 5. SCAN_POLICIES - Event-specific scan rules
  // --------------------------------------------------------------------------
  await knex.schema.createTable('scan_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('event_id').notNullable();
    table.uuid('venue_id');
    table.string('policy_type', 100).notNullable();
    table.string('name', 255).notNullable();
    table.jsonb('config').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.unique(['event_id', 'policy_type'], 'uq_scan_policies_event_type');

    table.index('event_id', 'idx_scan_policies_event_id');
    table.index('venue_id', 'idx_scan_policies_venue_id');
    table.index('policy_type', 'idx_scan_policies_policy_type');
    table.index('is_active', 'idx_scan_policies_is_active');
    table.index('tenant_id', 'idx_scan_policies_tenant_id');
  });

  await knex.raw(`COMMENT ON COLUMN scan_policies.event_id IS 'FK: event-service.events(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN scan_policies.venue_id IS 'FK: venue-service.venues(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 6. OFFLINE_VALIDATION_CACHE - Offline validation data
  // --------------------------------------------------------------------------
  await knex.schema.createTable('offline_validation_cache', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('event_id').notNullable();
    table.string('validation_hash', 255).notNullable();
    table.timestamp('valid_from', { useTz: true }).notNullable();
    table.timestamp('valid_until', { useTz: true }).notNullable();
    table.jsonb('ticket_data').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.unique(['ticket_id', 'valid_from'], 'uq_offline_validation_cache_ticket_valid');

    table.index('ticket_id', 'idx_offline_validation_cache_ticket_id');
    table.index('event_id', 'idx_offline_validation_cache_event_id');
    table.index('valid_until', 'idx_offline_validation_cache_valid_until');
    table.index(['event_id', 'valid_until'], 'idx_offline_validation_cache_event_valid');
    table.index('tenant_id', 'idx_offline_validation_cache_tenant_id');
  });

  await knex.raw(`COMMENT ON COLUMN offline_validation_cache.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service'`);
  await knex.raw(`COMMENT ON COLUMN offline_validation_cache.event_id IS 'FK: event-service.events(id) - not enforced, cross-service'`);

  // --------------------------------------------------------------------------
  // 7. SCAN_ANOMALIES - Anomaly detection records
  // --------------------------------------------------------------------------
  await knex.schema.createTable('scan_anomalies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.string('device_id', 255).notNullable();
    table.specificType('anomaly_types', 'TEXT[]').notNullable();
    table.integer('risk_score').notNullable();
    table.jsonb('details').notNullable();
    table.timestamp('detected_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('ticket_id', 'idx_scan_anomalies_ticket_id');
    table.index('device_id', 'idx_scan_anomalies_device_id');
    table.index('detected_at', 'idx_scan_anomalies_detected_at');
    table.index('risk_score', 'idx_scan_anomalies_risk_score');
    table.index(['device_id', 'detected_at'], 'idx_scan_anomalies_device_detected');
    table.index('tenant_id', 'idx_scan_anomalies_tenant_id');
  });

  await knex.raw(`COMMENT ON COLUMN scan_anomalies.ticket_id IS 'FK: ticket-service.tickets(id) - not enforced, cross-service'`);

  // ==========================================================================
  // ROW LEVEL SECURITY (7 Tenant Tables)
  // ==========================================================================

  const tenantTables = [
    'scanner_devices',
    'devices',
    'scans',
    'scan_policy_templates',
    'scan_policies',
    'offline_validation_cache',
    'scan_anomalies'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
        FOR ALL
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);
  }

  // ==========================================================================
  // COMPLETION
  // ==========================================================================

  console.log('✅ Scanning Service consolidated baseline migration complete');
  console.log('📊 Tables created: 7 (all tenant-scoped)');
  console.log('🔒 RLS enabled on all tables');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
    'scan_anomalies',
    'offline_validation_cache',
    'scan_policies',
    'scan_policy_templates',
    'scans',
    'devices',
    'scanner_devices'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('scan_anomalies');
  await knex.schema.dropTableIfExists('offline_validation_cache');
  await knex.schema.dropTableIfExists('scan_policies');
  await knex.schema.dropTableIfExists('scan_policy_templates');
  await knex.schema.dropTableIfExists('scans');
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('scanner_devices');

  console.log('✅ Scanning Service consolidated baseline rolled back');
}
