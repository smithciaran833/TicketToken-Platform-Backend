import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create analytics_metrics table
  await knex.schema.createTable('analytics_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('metric_type').notNullable();
    table.string('entity_type').notNullable();
    table.uuid('entity_id').notNullable();
    table.jsonb('dimensions').defaultTo('{}');
    table.decimal('value', 15, 2).notNullable();
    table.string('unit').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'metric_type']);
    table.index(['tenant_id', 'entity_type', 'entity_id']);
    table.index(['tenant_id', 'timestamp']);
    table.index('timestamp');
  });

  // Create analytics_aggregations table
  await knex.schema.createTable('analytics_aggregations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('aggregation_type').notNullable();
    table.string('metric_type').notNullable();
    table.string('entity_type').notNullable();
    table.uuid('entity_id');
    table.jsonb('dimensions').defaultTo('{}');
    table.string('time_period').notNullable();
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    table.decimal('value', 15, 2).notNullable();
    table.string('unit').notNullable();
    table.integer('sample_count').defaultTo(0);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'aggregation_type']);
    table.index(['tenant_id', 'metric_type']);
    table.index(['tenant_id', 'entity_type', 'entity_id']);
    table.index(['tenant_id', 'time_period', 'period_start']);
    table.index('period_start');

    // Unique constraint to prevent duplicate aggregations
    table.unique(['tenant_id', 'aggregation_type', 'metric_type', 'entity_type', 'entity_id', 'time_period', 'period_start']);
  });

  // Create analytics_alerts table
  await knex.schema.createTable('analytics_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('alert_type').notNullable();
    table.string('severity').notNullable();
    table.string('metric_type').notNullable();
    table.string('entity_type').notNullable();
    table.uuid('entity_id');
    table.jsonb('threshold_config').notNullable();
    table.decimal('current_value', 15, 2);
    table.decimal('threshold_value', 15, 2);
    table.string('status').notNullable().defaultTo('active');
    table.text('message').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('triggered_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('resolved_at');
    table.uuid('resolved_by');
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'status']);
    table.index(['tenant_id', 'alert_type']);
    table.index(['tenant_id', 'severity']);
    table.index(['tenant_id', 'entity_type', 'entity_id']);
    table.index('triggered_at');
  });

  // Create analytics_dashboards table
  await knex.schema.createTable('analytics_dashboards', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('name').notNullable();
    table.text('description');
    table.string('type').notNullable();
    table.jsonb('layout').defaultTo('{}');
    table.jsonb('filters').defaultTo('{}');
    table.string('visibility').notNullable().defaultTo('private');
    table.uuid('created_by').notNullable();
    table.boolean('is_default').defaultTo(false);
    table.integer('display_order').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'type']);
    table.index(['tenant_id', 'created_by']);
    table.index(['tenant_id', 'is_default']);
  });

  // Create analytics_widgets table
  await knex.schema.createTable('analytics_widgets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('dashboard_id').notNullable()
      .references('id')
      .inTable('analytics_dashboards')
      .onDelete('CASCADE');
    table.string('widget_type').notNullable();
    table.string('title').notNullable();
    table.text('description');
    table.jsonb('configuration').notNullable();
    table.jsonb('data_source').notNullable();
    table.jsonb('position').notNullable();
    table.jsonb('size').notNullable();
    table.jsonb('style').defaultTo('{}');
    table.integer('refresh_interval').defaultTo(60);
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'dashboard_id']);
    table.index(['tenant_id', 'widget_type']);
  });

  // Create analytics_exports table
  await knex.schema.createTable('analytics_exports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.string('export_type').notNullable();
    table.string('format').notNullable();
    table.string('status').notNullable().defaultTo('pending');
    table.jsonb('parameters').notNullable();
    table.string('file_path');
    table.string('file_url');
    table.integer('file_size');
    table.timestamp('expires_at');
    table.uuid('requested_by').notNullable();
    table.text('error_message');
    table.timestamps(true, true);

    // Indexes
    table.index(['tenant_id', 'status']);
    table.index(['tenant_id', 'requested_by']);
    table.index(['tenant_id', 'export_type']);
    table.index('expires_at');
  });

  // ========================================
  // CUSTOMER INSIGHTS TABLES
  // ========================================

  // Create customer_rfm_scores table
  await knex.schema.createTable('customer_rfm_scores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('customer_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.uuid('tenant_id').notNullable();

    // RFM Scores (1-5 scale)
    table.integer('recency_score').notNullable();
    table.integer('frequency_score').notNullable();
    table.integer('monetary_score').notNullable();
    table.integer('total_score').notNullable();

    // Raw Metrics
    table.integer('days_since_last_purchase');
    table.integer('total_purchases').defaultTo(0);
    table.decimal('total_spent', 12, 2).defaultTo(0);
    table.decimal('average_order_value', 10, 2);

    // Segmentation
    table.string('segment', 50).notNullable();
    table.string('churn_risk', 20);

    // Timestamps
    table.timestamp('calculated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes - NO DUPLICATES
    table.unique(['customer_id', 'venue_id']);
    table.index('tenant_id');
    table.index('venue_id');
    table.index('segment');
    table.index('total_score');
    table.index('calculated_at');
    table.index(['venue_id', 'segment']);
    table.index(['venue_id', 'churn_risk']);
  });

  // Create customer_segments table
  await knex.schema.createTable('customer_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.string('segment_name', 50).notNullable();

    // Aggregate Metrics
    table.integer('customer_count').defaultTo(0);
    table.decimal('total_revenue', 12, 2).defaultTo(0);
    table.decimal('avg_order_value', 10, 2);
    table.decimal('avg_lifetime_value', 10, 2);
    table.decimal('avg_purchase_frequency', 5, 2);

    // Timestamps
    table.timestamp('last_calculated_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.unique(['venue_id', 'segment_name']);
    table.index('tenant_id');
    table.index('last_calculated_at');
  });

  // Create customer_lifetime_value table
  await knex.schema.createTable('customer_lifetime_value', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('customer_id').notNullable().unique();
    table.uuid('venue_id');
    table.uuid('tenant_id').notNullable();

    // CLV Calculation
    table.decimal('clv', 12, 2).notNullable();
    table.decimal('avg_order_value', 10, 2);
    table.decimal('purchase_frequency', 8, 2);
    table.integer('customer_lifespan_days');
    table.integer('total_purchases');
    table.decimal('total_revenue', 12, 2);

    // Predictions
    table.decimal('predicted_clv_12_months', 12, 2);
    table.decimal('predicted_clv_24_months', 12, 2);
    table.decimal('churn_probability', 5, 4);

    // Timestamps
    table.timestamp('calculated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('tenant_id');
    table.index('venue_id');
    table.index('clv');
    table.index('calculated_at');
    table.index(['venue_id', 'clv']);
  });

  // ========================================
  // DYNAMIC PRICING TABLES
  // ========================================

  // Create price_history table
  await knex.schema.createTable('price_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable();
    table.integer('price_cents').notNullable();
    table.text('reason');
    table.timestamp('changed_at').notNullable().defaultTo(knex.fn.now());
    table.uuid('changed_by');

    table.index(['event_id', 'changed_at']);
  });

  // Create pending_price_changes table
  await knex.schema.createTable('pending_price_changes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable().unique();
    table.integer('current_price').notNullable();
    table.integer('recommended_price').notNullable();
    table.decimal('confidence', 3, 2).notNullable();
    table.jsonb('reasoning');
    table.integer('demand_score');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at');
    table.timestamp('approved_at');
    table.uuid('approved_by');
    table.text('approval_reason');
    table.timestamp('rejected_at');
    table.uuid('rejected_by');
    table.text('rejection_reason');

    table.index(['event_id']);
    table.index(['approved_at']);
  });

  // Add dynamic pricing columns to venue_settings
  const hasVenueSettings = await knex.schema.hasTable('venue_settings');
  if (hasVenueSettings) {
    await knex.schema.alterTable('venue_settings', (table) => {
      table.boolean('dynamic_pricing_enabled').defaultTo(false);
      table.decimal('price_min_multiplier', 3, 2).defaultTo(0.9);
      table.decimal('price_max_multiplier', 3, 2).defaultTo(2.0);
      table.integer('price_adjustment_frequency').defaultTo(60);
      table.boolean('price_require_approval').defaultTo(true);
      table.decimal('price_aggressiveness', 3, 2).defaultTo(0.5);
    });
  }

  // Enable Row Level Security on all tables
  const tables = [
    'analytics_metrics',
    'analytics_aggregations',
    'analytics_alerts',
    'analytics_dashboards',
    'analytics_widgets',
    'analytics_exports',
    'customer_rfm_scores',
    'customer_segments',
    'customer_lifetime_value'
  ];

  for (const tableName of tables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY tenant_isolation_policy ON ${tableName}
      USING (tenant_id = current_setting('app.current_tenant')::uuid)
    `);
  }

  console.log('✅ Analytics Service migration complete - 11 tables created');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customer_lifetime_value');
  await knex.schema.dropTableIfExists('customer_segments');
  await knex.schema.dropTableIfExists('customer_rfm_scores');
  await knex.schema.dropTableIfExists('pending_price_changes');
  await knex.schema.dropTableIfExists('price_history');
  await knex.schema.dropTableIfExists('analytics_exports');
  await knex.schema.dropTableIfExists('analytics_widgets');
  await knex.schema.dropTableIfExists('analytics_dashboards');
  await knex.schema.dropTableIfExists('analytics_alerts');
  await knex.schema.dropTableIfExists('analytics_aggregations');
  await knex.schema.dropTableIfExists('analytics_metrics');
}
