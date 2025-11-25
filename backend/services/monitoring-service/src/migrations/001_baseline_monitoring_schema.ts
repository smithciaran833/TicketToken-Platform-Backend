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
    });

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
    });

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
    });

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
    });

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
  // NFT MINTS TABLE
  // =====================================================
  const nftMintsExists = await knex.schema.hasTable('nft_mints');
  if (!nftMintsExists) {
    await knex.schema.createTable('nft_mints', (table: any) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('ticket_id', 255).notNullable().unique();
      table.string('mint_address', 255).notNullable();
      table.jsonb('metadata');
      table.string('status', 50).notNullable().defaultTo('pending');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_mints_ticket_id ON nft_mints(ticket_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_mints_mint_address ON nft_mints(mint_address)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_nft_mints_status ON nft_mints(status)');
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
    });

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
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_user ON fraud_events(user_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_pattern ON fraud_events(pattern)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_risk_level ON fraud_events(risk_level)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_timestamp ON fraud_events(timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_fraud_events_investigated ON fraud_events(investigated) WHERE investigated = false');
    await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS idx_fraud_events_unique ON fraud_events(user_id, pattern, timestamp)');
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
};

exports.down = async function(knex: any): Promise<void> {
  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS update_alerts_updated_at ON alerts');
  await knex.raw('DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules');
  await knex.raw('DROP TRIGGER IF EXISTS update_dashboards_updated_at ON dashboards');
  await knex.raw('DROP TRIGGER IF EXISTS update_nft_mints_updated_at ON nft_mints');

  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_old_metrics()');
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_old_fraud_events()');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('fraud_events');
  await knex.schema.dropTableIfExists('nft_transfers');
  await knex.schema.dropTableIfExists('nft_mints');
  await knex.schema.dropTableIfExists('metrics');
  await knex.schema.dropTableIfExists('dashboards');
  await knex.schema.dropTableIfExists('alert_rules');
  await knex.schema.dropTableIfExists('alerts');
};
