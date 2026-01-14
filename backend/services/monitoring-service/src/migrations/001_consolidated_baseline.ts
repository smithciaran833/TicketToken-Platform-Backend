import { Knex } from 'knex';

/**
 * Monitoring Service - Consolidated Baseline Migration
 *
 * Consolidated from 1 migration on January 2025
 *
 * Tables (11 total):
 *   Tenant-scoped (11): alerts, alert_rules, dashboards, metrics, nft_transfers,
 *                       fraud_events, incidents, sla_metrics, performance_metrics,
 *                       reports, report_history
 *
 * Functions (3): update_updated_at_column, cleanup_old_metrics, cleanup_old_fraud_events
 * Triggers (5): Auto-update updated_at on 5 tables
 *
 * Key fixes applied:
 *   - Changed uuid_generate_v4() to gen_random_uuid()
 *   - Removed uuid-ossp extension
 *   - Removed zero UUID default on tenant_id
 *   - Standardized RLS pattern with NULLIF + app.is_system_user
 *   - Added FORCE RLS to all tenant tables
 *   - Converted reports.user_id external FK to comment
 *   - Removed broken nft_mints trigger
 *   - Converted from CommonJS to ES module
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // ENUMS
  // ==========================================================================

  await knex.raw(`
    CREATE TYPE alert_type AS ENUM ('error', 'warning', 'info');
    CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
  `);

  // ==========================================================================
  // TENANT-SCOPED TABLES (11)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. ALERTS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.specificType('type', 'alert_type').notNullable();
    table.specificType('severity', 'alert_severity').notNullable();
    table.text('message').notNullable();
    table.string('source', 255).notNullable();
    table.jsonb('metadata');
    table.boolean('resolved').defaultTo(false);
    table.timestamp('resolved_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_alerts_tenant_id');
    table.index('severity', 'idx_alerts_severity');
    table.index('type', 'idx_alerts_type');
    table.index('source', 'idx_alerts_source');
  });

  await knex.raw(`CREATE INDEX idx_alerts_resolved ON alerts(resolved) WHERE resolved = false`);
  await knex.raw(`CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC)`);

  // --------------------------------------------------------------------------
  // 2. ALERT_RULES
  // --------------------------------------------------------------------------
  await knex.schema.createTable('alert_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('rule_name', 255).notNullable();
    table.string('metric_name', 255).notNullable();
    table.string('condition', 50).notNullable();
    table.decimal('threshold').notNullable();
    table.specificType('severity', 'alert_severity').notNullable();
    table.boolean('enabled').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_alert_rules_tenant_id');
    table.index('metric_name', 'idx_alert_rules_metric');
    table.index('severity', 'idx_alert_rules_severity');
  });

  await knex.raw(`CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled) WHERE enabled = true`);

  // --------------------------------------------------------------------------
  // 3. DASHBOARDS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('dashboards', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('widgets').defaultTo('[]');
    table.jsonb('layout');
    table.string('owner', 255);
    table.boolean('shared').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_dashboards_tenant_id');
    table.index('owner', 'idx_dashboards_owner');
    table.index('name', 'idx_dashboards_name');
  });

  await knex.raw(`CREATE INDEX idx_dashboards_shared ON dashboards(shared) WHERE shared = true`);

  // --------------------------------------------------------------------------
  // 4. METRICS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.string('metric_name', 255).notNullable();
    table.string('service_name', 255).notNullable();
    table.decimal('value').notNullable();
    table.string('metric_type', 50);
    table.string('unit', 50);
    table.string('service', 255);
    table.jsonb('labels');
    table.jsonb('tags');
    table.timestamp('timestamp', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_metrics_tenant_id');
    table.index('name', 'idx_metrics_name');
    table.index('metric_name', 'idx_metrics_metric_name');
    table.index('service', 'idx_metrics_service');
    table.index('service_name', 'idx_metrics_service_name');
  });

  await knex.raw(`CREATE INDEX idx_metrics_timestamp ON metrics(timestamp DESC)`);
  await knex.raw(`CREATE INDEX idx_metrics_service_timestamp ON metrics(service, timestamp DESC)`);
  await knex.raw(`CREATE INDEX idx_metrics_name_timestamp ON metrics(name, timestamp DESC)`);
  await knex.raw(`CREATE INDEX idx_metrics_service_name_timestamp ON metrics(service_name, timestamp DESC)`);
  await knex.raw(`CREATE INDEX idx_metrics_service_metric_timestamp ON metrics(service_name, metric_name, timestamp DESC)`);

  // --------------------------------------------------------------------------
  // 5. NFT_TRANSFERS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('nft_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('token_address', 255).notNullable();
    table.string('from_address', 255).notNullable();
    table.string('to_address', 255).notNullable();
    table.decimal('amount').notNullable().defaultTo(1);
    table.string('signature', 255);
    table.string('status', 50).notNullable().defaultTo('pending');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_nft_transfers_tenant_id');
    table.index('token_address', 'idx_nft_transfers_token');
    table.index('from_address', 'idx_nft_transfers_from');
    table.index('to_address', 'idx_nft_transfers_to');
  });

  await knex.raw(`CREATE INDEX idx_nft_transfers_created ON nft_transfers(created_at DESC)`);

  // --------------------------------------------------------------------------
  // 6. FRAUD_EVENTS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('fraud_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('user_id', 255).notNullable();
    table.string('pattern', 255).notNullable();
    table.string('risk_level', 50).notNullable();
    table.timestamp('timestamp', { useTz: true }).notNullable();
    table.jsonb('data');
    table.boolean('investigated').defaultTo(false);
    table.timestamp('investigated_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_fraud_events_tenant_id');
    table.index('user_id', 'idx_fraud_events_user');
    table.index('pattern', 'idx_fraud_events_pattern');
    table.index('risk_level', 'idx_fraud_events_risk_level');
  });

  await knex.raw(`CREATE INDEX idx_fraud_events_timestamp ON fraud_events(timestamp DESC)`);
  await knex.raw(`CREATE INDEX idx_fraud_events_investigated ON fraud_events(investigated) WHERE investigated = false`);
  await knex.raw(`CREATE UNIQUE INDEX idx_fraud_events_unique ON fraud_events(user_id, pattern, timestamp)`);

  // --------------------------------------------------------------------------
  // 7. INCIDENTS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('incidents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('title', 255).notNullable();
    table.text('description');
    table.string('status', 50).notNullable().defaultTo('open');
    table.specificType('severity', 'alert_severity').notNullable();
    table.string('service_name', 255);
    table.timestamp('detected_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('resolved_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_incidents_tenant_id');
    table.index('status', 'idx_incidents_status');
    table.index('severity', 'idx_incidents_severity');
    table.index('service_name', 'idx_incidents_service_name');
  });

  await knex.raw(`CREATE INDEX idx_incidents_detected_at ON incidents(detected_at DESC)`);
  await knex.raw(`CREATE INDEX idx_incidents_status_severity_detected ON incidents(status, severity, detected_at DESC)`);

  // --------------------------------------------------------------------------
  // 8. SLA_METRICS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('sla_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('service_name', 255).notNullable();
    table.decimal('uptime_percentage', 5, 2).notNullable();
    table.decimal('response_time_p95', 10, 2).notNullable();
    table.integer('violations').defaultTo(0);
    table.timestamp('period_start', { useTz: true }).notNullable();
    table.timestamp('period_end', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_sla_metrics_tenant_id');
    table.index('service_name', 'idx_sla_metrics_service_name');
  });

  await knex.raw(`CREATE INDEX idx_sla_metrics_period_start ON sla_metrics(period_start DESC)`);
  await knex.raw(`CREATE INDEX idx_sla_metrics_period_service ON sla_metrics(period_start, service_name)`);

  // --------------------------------------------------------------------------
  // 9. PERFORMANCE_METRICS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('performance_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('service_name', 255).notNullable();
    table.string('endpoint', 500).notNullable();
    table.decimal('response_time_ms', 10, 2).notNullable();
    table.integer('status_code');
    table.string('method', 10);
    table.timestamp('timestamp', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_performance_metrics_tenant_id');
    table.index('service_name', 'idx_performance_metrics_service_name');
    table.index('endpoint', 'idx_performance_metrics_endpoint');
  });

  await knex.raw(`CREATE INDEX idx_performance_metrics_timestamp ON performance_metrics(timestamp DESC)`);
  await knex.raw(`CREATE INDEX idx_performance_metrics_service_endpoint_timestamp ON performance_metrics(service_name, endpoint, timestamp DESC)`);

  // --------------------------------------------------------------------------
  // 10. REPORTS
  // --------------------------------------------------------------------------
  await knex.schema.createTable('reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('query').notNullable();
    table.string('format', 20).notNullable();
    table.string('schedule', 100);
    table.boolean('is_public').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('tenant_id', 'idx_reports_tenant_id');
    table.index('user_id', 'idx_reports_user_id');
  });

  await knex.raw(`COMMENT ON COLUMN reports.user_id IS 'FK: auth-service.users(id) - not enforced, cross-service'`);
  await knex.raw(`CREATE INDEX idx_reports_is_public ON reports(is_public) WHERE is_public = true`);
  await knex.raw(`CREATE INDEX idx_reports_schedule ON reports(schedule) WHERE schedule IS NOT NULL`);
  await knex.raw(`CREATE INDEX idx_reports_created_at ON reports(created_at DESC)`);

  // --------------------------------------------------------------------------
  // 11. REPORT_HISTORY
  // --------------------------------------------------------------------------
  await knex.schema.createTable('report_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('report_id').notNullable();
    table.timestamp('generated_at', { useTz: true }).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.text('file_url');
    table.text('error');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');
    table.foreign('report_id').references('id').inTable('reports').onDelete('CASCADE');

    table.index('tenant_id', 'idx_report_history_tenant_id');
    table.index('report_id', 'idx_report_history_report_id');
    table.index('status', 'idx_report_history_status');
  });

  await knex.raw(`CREATE INDEX idx_report_history_generated_at ON report_history(generated_at DESC)`);

  // ==========================================================================
  // FUNCTIONS
  // ==========================================================================

  // Function: Auto-update updated_at column
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function: Cleanup old metrics (90 days retention)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_old_metrics()
    RETURNS void AS $$
    BEGIN
      DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '90 days';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Function: Cleanup old fraud events (1 year retention for investigated)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_old_fraud_events()
    RETURNS void AS $$
    BEGIN
      DELETE FROM fraud_events WHERE investigated = true AND investigated_at < NOW() - INTERVAL '1 year';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ==========================================================================
  // TRIGGERS
  // ==========================================================================

  await knex.raw(`
    CREATE TRIGGER update_alerts_updated_at
      BEFORE UPDATE ON alerts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_alert_rules_updated_at
      BEFORE UPDATE ON alert_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_dashboards_updated_at
      BEFORE UPDATE ON dashboards
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_incidents_updated_at
      BEFORE UPDATE ON incidents
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_reports_updated_at
      BEFORE UPDATE ON reports
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // ==========================================================================
  // ROW LEVEL SECURITY (11 Tenant Tables)
  // ==========================================================================

  const tenantTables = [
    'alerts',
    'alert_rules',
    'dashboards',
    'metrics',
    'nft_transfers',
    'fraud_events',
    'incidents',
    'sla_metrics',
    'performance_metrics',
    'reports',
    'report_history'
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

  console.log('✅ Monitoring Service consolidated baseline migration complete');
  console.log('📊 Tables created: 11 (all tenant-scoped)');
  console.log('🔒 RLS enabled on all tables');
  console.log('⚡ Functions: 3, Triggers: 5');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
    'report_history',
    'reports',
    'performance_metrics',
    'sla_metrics',
    'incidents',
    'fraud_events',
    'nft_transfers',
    'metrics',
    'dashboards',
    'alert_rules',
    'alerts'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop triggers
  await knex.raw(`DROP TRIGGER IF EXISTS update_reports_updated_at ON reports`);
  await knex.raw(`DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents`);
  await knex.raw(`DROP TRIGGER IF EXISTS update_dashboards_updated_at ON dashboards`);
  await knex.raw(`DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules`);
  await knex.raw(`DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts`);

  // Drop functions
  await knex.raw(`DROP FUNCTION IF EXISTS update_updated_at_column()`);
  await knex.raw(`DROP FUNCTION IF EXISTS cleanup_old_metrics()`);
  await knex.raw(`DROP FUNCTION IF EXISTS cleanup_old_fraud_events()`);

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('report_history');
  await knex.schema.dropTableIfExists('reports');
  await knex.schema.dropTableIfExists('performance_metrics');
  await knex.schema.dropTableIfExists('sla_metrics');
  await knex.schema.dropTableIfExists('incidents');
  await knex.schema.dropTableIfExists('fraud_events');
  await knex.schema.dropTableIfExists('nft_transfers');
  await knex.schema.dropTableIfExists('metrics');
  await knex.schema.dropTableIfExists('dashboards');
  await knex.schema.dropTableIfExists('alert_rules');
  await knex.schema.dropTableIfExists('alerts');

  // Drop enums
  await knex.raw(`DROP TYPE IF EXISTS alert_severity`);
  await knex.raw(`DROP TYPE IF EXISTS alert_type`);

  console.log('✅ Monitoring Service consolidated baseline rolled back');
}
