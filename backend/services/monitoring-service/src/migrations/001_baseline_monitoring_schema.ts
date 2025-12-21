// Pure CommonJS migration with inline types

exports.up = async function(knex: any): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // =====================================================
  // ALERTS TABLE
  // =====================================================
  const alertsExists = await knex.schema.hasTable('alerts');
  if (!alertsExists) {
    await knex.schema.createTable('alerts', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('name', 255).notNullable();
      table.enum('type', ['error', 'warning', 'info']).notNullable();
      table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
      table.text('message').notNullable();
      table.string('source', 255).notNullable();
      table.jsonb('metadata');
      table.boolean('resolved').defaultTo(false);
      table.timestamp('resolved_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alerts_tenant_id ON alerts(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved) WHERE resolved = false');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC)');
  }

  // =====================================================
  // ALERT RULES TABLE
  // =====================================================
  const alertRulesExists = await knex.schema.hasTable('alert_rules');
  if (!alertRulesExists) {
    await knex.schema.createTable('alert_rules', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('rule_name', 255).notNullable();
      table.string('metric_name', 255).notNullable();
      table.string('condition', 50).notNullable();
      table.decimal('threshold').notNullable();
      table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
      table.boolean('enabled').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant_id ON alert_rules(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled) WHERE enabled = true');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alert_rules_metric ON alert_rules(metric_name)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_alert_rules_severity ON alert_rules(severity)');
  }

  // =====================================================
  // DASHBOARDS TABLE
  // =====================================================
  const dashboardsExists = await knex.schema.hasTable('dashboards');
  if (!dashboardsExists) {
    await knex.schema.createTable('dashboards', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('name', 255).notNullable();
      table.text('description');
      table.jsonb('widgets').defaultTo('[]');
      table.jsonb('layout');
      table.string('owner', 255);
      table.boolean('shared').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_dashboards_tenant_id ON dashboards(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON dashboards(owner)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_dashboards_shared ON dashboards(shared) WHERE shared = true');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_dashboards_name ON dashboards(name)');
  }

  // =====================================================
  // METRICS TABLE
  // =====================================================
  const metricsExists = await knex.schema.hasTable('metrics');
  if (!metricsExists) {
    await knex.schema.createTable('metrics', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('name', 255).notNullable();
      table.string('metric_name', 255).notNullable();
      table.string('service_name', 255).notNullable();
      table.decimal('value').notNullable();
      table.string('metric_type', 50);
      table.string('unit', 50);
      table.string('service', 255);
      table.jsonb('labels');
      table.jsonb('tags');
      table.timestamp('timestamp').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_tenant_id ON metrics(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_metric_name ON metrics(metric_name)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_service ON metrics(service)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_service_name ON metrics(service_name)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_service_timestamp ON metrics(service, timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(name, timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_service_name_timestamp ON metrics(service_name, timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_metrics_service_metric_timestamp ON metrics(service_name, metric_name, timestamp DESC)');
  }

  // =====================================================
  // NFT TRANSFERS TABLE
  // =====================================================
  const nftTransfersExists = await knex.schema.hasTable('nft_transfers');
  if (!nftTransfersExists) {
    await knex.schema.createTable('nft_transfers', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('token_address', 255).notNullable();
      table.string('from_address', 255).notNullable();
      table.string('to_address', 255).notNullable();
      table.decimal('amount').notNullable().defaultTo(1);
      table.string('signature', 255);
      table.string('status', 50).notNullable().defaultTo('pending');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_transfers_tenant_id ON nft_transfers(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_transfers_token ON nft_transfers(token_address)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_transfers_from ON nft_transfers(from_address)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_transfers_to ON nft_transfers(to_address)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_transfers_created ON nft_transfers(created_at DESC)');
  }

  // =====================================================
  // FRAUD EVENTS TABLE
  // =====================================================
  const fraudEventsExists = await knex.schema.hasTable('fraud_events');
  if (!fraudEventsExists) {
    await knex.schema.createTable('fraud_events', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('user_id', 255).notNullable();
      table.string('pattern', 255).notNullable();
      table.string('risk_level', 50).notNullable();
      table.timestamp('timestamp').notNullable();
      table.jsonb('data');
      table.boolean('investigated').defaultTo(false);
      table.timestamp('investigated_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_tenant_id ON fraud_events(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_user ON fraud_events(user_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_pattern ON fraud_events(pattern)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_risk_level ON fraud_events(risk_level)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_timestamp ON fraud_events(timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_investigated ON fraud_events(investigated) WHERE investigated = false');
    await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS idx_fraud_events_unique ON fraud_events(user_id, pattern, timestamp)');
  }

  // =====================================================
  // INCIDENTS TABLE
  // =====================================================
  const incidentsExists = await knex.schema.hasTable('incidents');
  if (!incidentsExists) {
    await knex.schema.createTable('incidents', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('title', 255).notNullable();
      table.text('description');
      table.string('status', 50).notNullable().defaultTo('open');
      table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
      table.string('service_name', 255);
      table.timestamp('detected_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('resolved_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_incidents_tenant_id ON incidents(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_incidents_detected_at ON incidents(detected_at DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_incidents_service_name ON incidents(service_name)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_incidents_status_severity_detected ON incidents(status, severity, detected_at DESC)');
  }

  // =====================================================
  // SLA METRICS TABLE
  // =====================================================
  const slaMetricsExists = await knex.schema.hasTable('sla_metrics');
  if (!slaMetricsExists) {
    await knex.schema.createTable('sla_metrics', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('service_name', 255).notNullable();
      table.decimal('uptime_percentage', 5, 2).notNullable();
      table.decimal('response_time_p95', 10, 2).notNullable();
      table.integer('violations').defaultTo(0);
      table.timestamp('period_start').notNullable();
      table.timestamp('period_end').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_sla_metrics_tenant_id ON sla_metrics(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_sla_metrics_service_name ON sla_metrics(service_name)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_sla_metrics_period_start ON sla_metrics(period_start DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_sla_metrics_period_service ON sla_metrics(period_start, service_name)');
  }

  // =====================================================
  // PERFORMANCE METRICS TABLE
  // =====================================================
  const performanceMetricsExists = await knex.schema.hasTable('performance_metrics');
  if (!performanceMetricsExists) {
    await knex.schema.createTable('performance_metrics', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('service_name', 255).notNullable();
      table.string('endpoint', 500).notNullable();
      table.decimal('response_time_ms', 10, 2).notNullable();
      table.integer('status_code');
      table.string('method', 10);
      table.timestamp('timestamp').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_performance_metrics_tenant_id ON performance_metrics(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_performance_metrics_service_name ON performance_metrics(service_name)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_performance_metrics_endpoint ON performance_metrics(endpoint)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_performance_metrics_service_endpoint_timestamp ON performance_metrics(service_name, endpoint, timestamp DESC)');
  }

  // =====================================================
  // REPORTS TABLE
  // =====================================================
  const reportsExists = await knex.schema.hasTable('reports');
  if (!reportsExists) {
    await knex.schema.createTable('reports', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('user_id').notNullable();
      table.string('name', 255).notNullable();
      table.text('description');
      table.jsonb('query').notNullable();
      table.string('format', 20).notNullable();
      table.string('schedule', 100);
      table.boolean('is_public').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_reports_tenant_id ON reports(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_reports_is_public ON reports(is_public) WHERE is_public = true');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_reports_schedule ON reports(schedule) WHERE schedule IS NOT NULL');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC)');
  }

  // =====================================================
  // REPORT HISTORY TABLE
  // =====================================================
  const reportHistoryExists = await knex.schema.hasTable('report_history');
  if (!reportHistoryExists) {
    await knex.schema.createTable('report_history', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('report_id').notNullable();
      table.timestamp('generated_at').notNullable();
      table.string('status', 20).notNullable().defaultTo('pending');
      table.text('file_url');
      table.text('error');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
      
      // Foreign key to reports
      table.foreign('report_id').references('id').inTable('reports').onDelete('CASCADE');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_report_history_tenant_id ON report_history(tenant_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_report_history_report_id ON report_history(report_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_report_history_generated_at ON report_history(generated_at DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_report_history_status ON report_history(status)');
  }

  // =====================================================
  // TRIGGERS FOR UPDATED_AT
  // =====================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw('DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts');
  await knex.raw('CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  
  await knex.raw('DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules');
  await knex.raw('CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  
  await knex.raw('DROP TRIGGER IF EXISTS update_dashboards_updated_at ON dashboards');
  await knex.raw('CREATE TRIGGER update_dashboards_updated_at BEFORE UPDATE ON dashboards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  
  await knex.raw('DROP TRIGGER IF EXISTS update_nft_mints_updated_at ON nft_mints');
  await knex.raw('CREATE TRIGGER update_nft_mints_updated_at BEFORE UPDATE ON nft_mints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  
  await knex.raw('DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents');
  await knex.raw('CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');
  
  await knex.raw('DROP TRIGGER IF EXISTS update_reports_updated_at ON reports');
  await knex.raw('CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()');

  // =====================================================
  // DATA RETENTION FUNCTIONS
  // =====================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_old_metrics() RETURNS void AS $$
    BEGIN
        DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '90 days';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_old_fraud_events() RETURNS void AS $$
    BEGIN
        DELETE FROM fraud_events WHERE investigated = true AND investigated_at < NOW() - INTERVAL '1 year';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // =====================================================
  // ROW LEVEL SECURITY
  // =====================================================
  await knex.raw('ALTER TABLE alerts ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE metrics ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE nft_transfers ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE fraud_events ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE incidents ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE sla_metrics ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE reports ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE report_history ENABLE ROW LEVEL SECURITY');

  await knex.raw(`CREATE POLICY tenant_isolation_policy ON alerts USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON alert_rules USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON dashboards USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON metrics USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON nft_transfers USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON fraud_events USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON incidents USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON sla_metrics USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON performance_metrics USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON reports USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON report_history USING (tenant_id::text = current_setting('app.current_tenant', true))`);
};

exports.down = async function(knex: any): Promise<void> {
  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON report_history');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON reports');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON performance_metrics');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON sla_metrics');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON incidents');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON fraud_events');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON nft_transfers');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON metrics');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON dashboards');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON alert_rules');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON alerts');

  await knex.raw('ALTER TABLE report_history DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE reports DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE performance_metrics DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE sla_metrics DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE incidents DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE fraud_events DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE nft_transfers DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE metrics DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE dashboards DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE alert_rules DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE alerts DISABLE ROW LEVEL SECURITY');

  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS update_reports_updated_at ON reports');
  await knex.raw('DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents');
  await knex.raw('DROP TRIGGER IF EXISTS update_dashboards_updated_at ON dashboards');
  await knex.raw('DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules');
  await knex.raw('DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_old_metrics()');
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_old_fraud_events()');

  // Drop tables in reverse order (child tables first)
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
};
