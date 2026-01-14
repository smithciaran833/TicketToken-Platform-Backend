import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ========================================
  // ANALYTICS TABLES
  // ========================================

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
    table.index(['tenant_id', 'metric_type']);
    table.index(['tenant_id', 'entity_type', 'entity_id']);
    table.index(['tenant_id', 'timestamp']);
    table.index('timestamp');
  });

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
    table.index(['tenant_id', 'aggregation_type']);
    table.index(['tenant_id', 'metric_type']);
    table.index(['tenant_id', 'entity_type', 'entity_id']);
    table.index(['tenant_id', 'time_period', 'period_start']);
    table.index('period_start');
    table.unique(['tenant_id', 'aggregation_type', 'metric_type', 'entity_type', 'entity_id', 'time_period', 'period_start']);
  });

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
    table.index(['tenant_id', 'status']);
    table.index(['tenant_id', 'alert_type']);
    table.index(['tenant_id', 'severity']);
    table.index(['tenant_id', 'entity_type', 'entity_id']);
    table.index('triggered_at');
  });

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
    table.index(['tenant_id', 'type']);
    table.index(['tenant_id', 'created_by']);
    table.index(['tenant_id', 'is_default']);
  });

  await knex.schema.createTable('analytics_widgets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('dashboard_id').notNullable().references('id').inTable('analytics_dashboards').onDelete('CASCADE');
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
    table.index(['tenant_id', 'dashboard_id']);
    table.index(['tenant_id', 'widget_type']);
  });

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
    table.index(['tenant_id', 'status']);
    table.index(['tenant_id', 'requested_by']);
    table.index(['tenant_id', 'export_type']);
    table.index('expires_at');
  });

  await knex.schema.createTable('customer_rfm_scores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('customer_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.integer('recency_score').notNullable();
    table.integer('frequency_score').notNullable();
    table.integer('monetary_score').notNullable();
    table.integer('total_score').notNullable();
    table.integer('days_since_last_purchase');
    table.integer('total_purchases').defaultTo(0);
    table.decimal('total_spent', 12, 2).defaultTo(0);
    table.decimal('average_order_value', 10, 2);
    table.string('segment', 50).notNullable();
    table.string('churn_risk', 20);
    table.timestamp('calculated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['customer_id', 'venue_id']);
    table.index('tenant_id');
    table.index('venue_id');
    table.index('segment');
    table.index('total_score');
    table.index('calculated_at');
    table.index(['venue_id', 'segment']);
    table.index(['venue_id', 'churn_risk']);
  });

  await knex.schema.createTable('customer_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.string('segment_name', 50).notNullable();
    table.integer('customer_count').defaultTo(0);
    table.decimal('total_revenue', 12, 2).defaultTo(0);
    table.decimal('avg_order_value', 10, 2);
    table.decimal('avg_lifetime_value', 10, 2);
    table.decimal('avg_purchase_frequency', 5, 2);
    table.timestamp('last_calculated_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['venue_id', 'segment_name']);
    table.index('tenant_id');
    table.index('last_calculated_at');
  });

  await knex.schema.createTable('customer_lifetime_value', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('customer_id').notNullable().unique();
    table.uuid('venue_id');
    table.uuid('tenant_id').notNullable();
    table.decimal('clv', 12, 2).notNullable();
    table.decimal('avg_order_value', 10, 2);
    table.decimal('purchase_frequency', 8, 2);
    table.integer('customer_lifespan_days');
    table.integer('total_purchases');
    table.decimal('total_revenue', 12, 2);
    table.decimal('predicted_clv_12_months', 12, 2);
    table.decimal('predicted_clv_24_months', 12, 2);
    table.decimal('churn_probability', 5, 4);
    table.timestamp('calculated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('tenant_id');
    table.index('venue_id');
    table.index('clv');
    table.index('calculated_at');
    table.index(['venue_id', 'clv']);
  });

  await knex.schema.createTable('realtime_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('venue_id').notNullable();
    table.string('metric_type', 50).notNullable();
    table.jsonb('metric_value').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamps(true, true);
    table.index(['tenant_id', 'venue_id']);
    table.index(['venue_id', 'metric_type']);
    table.index('expires_at');
    table.unique(['venue_id', 'metric_type']);
  });

  await knex.schema.createTable('venue_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    table.uuid('venue_id').notNullable();
    table.string('alert_name', 100).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.jsonb('alert_data');
    table.timestamps(true, true);
    table.index(['tenant_id', 'venue_id']);
    table.index(['venue_id', 'is_active']);
    table.index('alert_name');
  });

  await knex.schema.createTable('price_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable();
    table.integer('price_cents').notNullable();
    table.text('reason');
    table.timestamp('changed_at').notNullable().defaultTo(knex.fn.now());
    table.uuid('changed_by');
    table.index(['event_id', 'changed_at']);
  });

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

  // Enable RLS on analytics tables
  const tables = [
    'analytics_metrics', 'analytics_aggregations', 'analytics_alerts',
    'analytics_dashboards', 'analytics_widgets', 'analytics_exports',
    'customer_rfm_scores', 'customer_segments', 'customer_lifetime_value',
    'realtime_metrics', 'venue_alerts'
  ];

  for (const tableName of tables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY tenant_isolation_policy ON ${tableName}
      USING (tenant_id = current_setting('app.current_tenant')::uuid)
    `);
  }

  // ========================================
  // ANALYTICS VIEWS
  // ========================================

  // Event Summary
  await knex.raw(`
    CREATE OR REPLACE VIEW event_summary AS
    SELECT
      e.id AS event_id, e.name AS event_name, e.slug AS event_slug, e.status AS event_status,
      e.description, e.short_description, e.event_type, e.is_featured, e.visibility,
      v.id AS venue_id, v.name AS venue_name, v.slug AS venue_slug, v.city AS venue_city,
      v.state_province AS venue_state, v.country_code AS venue_country, v.max_capacity AS venue_max_capacity,
      v.venue_type, v.latitude AS venue_latitude, v.longitude AS venue_longitude,
      (SELECT MIN(es.starts_at) FROM event_schedules es WHERE es.event_id = e.id) AS event_start_time,
      (SELECT MAX(es.ends_at) FROM event_schedules es WHERE es.event_id = e.id) AS event_end_time,
      (SELECT COALESCE(SUM(ec.total_capacity), 0) FROM event_capacity ec WHERE ec.event_id = e.id) AS total_event_capacity,
      (SELECT COALESCE(SUM(ec.available_capacity), 0) FROM event_capacity ec WHERE ec.event_id = e.id) AS available_capacity,
      (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS total_tickets_sold,
      (SELECT COALESCE(SUM(t.face_value), 0) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS total_revenue,
      (SELECT COALESCE(AVG(t.face_value), 0) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS avg_ticket_price,
      CURRENT_TIMESTAMP AS view_generated_at
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    WHERE e.deleted_at IS NULL AND v.deleted_at IS NULL
  `);

  // Venue Analytics
  await knex.raw(`
    CREATE OR REPLACE VIEW venue_analytics AS
    SELECT
      v.id AS venue_id, v.name AS venue_name, v.slug AS venue_slug, v.venue_type,
      v.city, v.state_province, v.country_code, v.created_at AS venue_created_at, v.max_capacity,
      (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id) AS total_events,
      (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.status = 'COMPLETED') AS completed_events,
      (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.id AND e.status = 'ON_SALE') AS on_sale_events,
      (SELECT COUNT(*) FROM tickets t JOIN events e ON t.event_id = e.id WHERE e.venue_id = v.id AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS total_tickets_sold,
      (SELECT COALESCE(SUM(t.face_value), 0) FROM tickets t JOIN events e ON t.event_id = e.id WHERE e.venue_id = v.id AND t.status IN ('ACTIVE', 'REDEEMED', 'TRANSFERRED')) AS gross_revenue,
      CURRENT_TIMESTAMP AS last_updated
    FROM venues v WHERE v.deleted_at IS NULL
  `);

  await knex.raw(`CREATE MATERIALIZED VIEW venue_analytics_mv AS SELECT *, RANK() OVER (ORDER BY gross_revenue DESC) AS revenue_rank FROM venue_analytics`);
  await knex.raw(`CREATE INDEX idx_venue_analytics_mv_venue_id ON venue_analytics_mv(venue_id)`);
  await knex.raw(`CREATE OR REPLACE FUNCTION refresh_venue_analytics_mv() RETURNS void AS $$ BEGIN REFRESH MATERIALIZED VIEW venue_analytics_mv; END; $$ LANGUAGE plpgsql`);

  // Ticket Status
  await knex.raw(`
    CREATE OR REPLACE VIEW ticket_status_details AS
    SELECT
      t.id AS ticket_id, t.ticket_number, t.event_id, e.name AS event_name, v.name AS venue_name,
      t.ticket_type_id, tt.name AS ticket_type_name, t.face_value, t.price AS purchase_price,
      t.section, t.row, t.seat, t.status AS current_status, t.user_id AS owner_id,
      t.purchased_at, t.created_at, t.is_transferable, t.transfer_count, t.is_nft,
      CURRENT_TIMESTAMP AS view_generated_at
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    JOIN venues v ON e.venue_id = v.id
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    WHERE e.deleted_at IS NULL AND v.deleted_at IS NULL AND t.deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW ticket_inventory_summary AS
    SELECT
      e.id AS event_id, e.name AS event_name, tt.id AS ticket_type_id, tt.name AS ticket_type_name,
      COUNT(*) AS total_tickets,
      COUNT(*) FILTER (WHERE t.status = 'active') AS active_tickets,
      COUNT(*) FILTER (WHERE t.status = 'used') AS redeemed_tickets,
      COUNT(*) FILTER (WHERE t.status = 'transferred') AS transferred_tickets
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    WHERE e.deleted_at IS NULL AND t.deleted_at IS NULL
    GROUP BY e.id, e.name, tt.id, tt.name
  `);

  // Financial Summary Base
  await knex.raw(`
    CREATE OR REPLACE VIEW financial_summary_basic AS
    SELECT pt.id as transaction_id, pt.user_id, pt.amount, pt.currency, pt.status, pt.created_at
    FROM payment_transactions pt WHERE pt.deleted_at IS NULL
  `);

  // Customer 360 Views
  await knex.raw(`
    CREATE OR REPLACE VIEW customer_360_basic AS
    SELECT u.id as customer_id, u.email, u.username, u.first_name, u.last_name, u.created_at, u.status,
      (SELECT COUNT(*) FROM tickets WHERE user_id = u.id AND status IN ('active', 'used', 'transferred')) as total_purchases,
      u.total_spent, (SELECT MAX(purchased_at) FROM tickets WHERE user_id = u.id) as last_purchase_at
    FROM users u
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW customer_360_with_preferences AS
    SELECT c360.*, u.phone, u.phone_verified, u.email_verified, u.country_code, u.city,
      u.state_province, u.timezone, u.preferred_language, u.preferences, u.notification_preferences,
      u.marketing_consent, u.last_login_at, u.login_count
    FROM customer_360_basic c360 JOIN users u ON c360.customer_id = u.id
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW customer_360_with_purchases AS
    SELECT cwp.*, COUNT(DISTINCT t.id) as transaction_count,
      SUM(CASE WHEN t.type = 'payment' AND t.status = 'succeeded' THEN 1 ELSE 0 END) as successful_purchases,
      SUM(CASE WHEN t.type = 'payment' AND t.status = 'succeeded' THEN t.amount ELSE 0 END) as lifetime_value,
      AVG(CASE WHEN t.type = 'payment' AND t.status = 'succeeded' THEN t.amount END) as avg_purchase_amount,
      MAX(CASE WHEN t.type = 'payment' THEN t.created_at END) as last_transaction_date
    FROM customer_360_with_preferences cwp
    LEFT JOIN payment_transactions t ON cwp.customer_id = t.user_id
    GROUP BY cwp.customer_id, cwp.email, cwp.username, cwp.first_name, cwp.last_name, cwp.created_at,
      cwp.status, cwp.total_purchases, cwp.total_spent, cwp.last_purchase_at, cwp.phone, cwp.phone_verified,
      cwp.email_verified, cwp.country_code, cwp.city, cwp.state_province, cwp.timezone, cwp.preferred_language,
      cwp.preferences, cwp.notification_preferences, cwp.marketing_consent, cwp.last_login_at, cwp.login_count
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW customer_360_with_engagement AS
    SELECT cwpu.*,
      CASE WHEN cwpu.last_login_at > CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 'ACTIVE'
           WHEN cwpu.last_login_at > CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 'ENGAGED'
           WHEN cwpu.last_login_at > CURRENT_TIMESTAMP - INTERVAL '90 days' THEN 'DORMANT'
           ELSE 'INACTIVE' END as engagement_status,
      CASE WHEN cwpu.last_login_at IS NOT NULL THEN DATE_PART('day', CURRENT_TIMESTAMP - cwpu.last_login_at)::integer ELSE NULL END as days_since_login,
      CASE WHEN cwpu.last_transaction_date IS NOT NULL THEN DATE_PART('day', CURRENT_TIMESTAMP - cwpu.last_transaction_date)::integer ELSE NULL END as days_since_purchase
    FROM customer_360_with_purchases cwpu
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW customer_360_with_segments AS
    SELECT cwe.*,
      CASE WHEN cwe.lifetime_value > 10000 THEN 'VIP' WHEN cwe.lifetime_value > 5000 THEN 'HIGH_VALUE'
           WHEN cwe.lifetime_value > 1000 THEN 'REGULAR' WHEN cwe.lifetime_value > 0 THEN 'LOW_VALUE' ELSE 'PROSPECT' END as value_segment,
      CASE WHEN cwe.days_since_purchase IS NULL THEN 'NEVER' WHEN cwe.days_since_purchase <= 30 THEN 'RECENT'
           WHEN cwe.days_since_purchase <= 90 THEN 'COOLING' WHEN cwe.days_since_purchase <= 180 THEN 'COLD' ELSE 'LOST' END as recency_segment
    FROM customer_360_with_engagement cwe
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW customer_360_with_churn_risk AS
    SELECT cws.*,
      CASE WHEN cws.engagement_status = 'INACTIVE' THEN 'HIGH' WHEN cws.engagement_status = 'DORMANT' THEN 'MEDIUM'
           WHEN cws.recency_segment IN ('COLD', 'LOST') THEN 'MEDIUM' ELSE 'LOW' END as churn_risk_level,
      CASE WHEN cws.value_segment IN ('VIP', 'HIGH_VALUE') AND cws.recency_segment IN ('COOLING', 'COLD') THEN 'CRITICAL'
           WHEN cws.value_segment IN ('VIP', 'HIGH_VALUE') THEN 'HIGH' ELSE 'MEDIUM' END as retention_priority
    FROM customer_360_with_segments cws
  `);

  await knex.raw(`CREATE OR REPLACE VIEW customer_360 AS SELECT * FROM customer_360_with_churn_risk`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS customer_360_materialized CASCADE`);
  await knex.raw(`CREATE MATERIALIZED VIEW customer_360_materialized AS SELECT * FROM customer_360`);
  await knex.raw(`CREATE INDEX idx_cust360_mat_id ON customer_360_materialized(customer_id)`);
  await knex.raw(`CREATE INDEX idx_cust360_mat_segment ON customer_360_materialized(value_segment)`);

  // Customer Helper Views
  await knex.raw(`
    CREATE OR REPLACE VIEW customer_segment_summary AS
    SELECT value_segment, recency_segment, COUNT(*) as customer_count, AVG(lifetime_value) as avg_lifetime_value
    FROM customer_360 GROUP BY value_segment, recency_segment
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW churn_risk_dashboard AS
    SELECT churn_risk_level, retention_priority, COUNT(*) as customer_count, SUM(lifetime_value) as total_at_risk_value
    FROM customer_360 GROUP BY churn_risk_level, retention_priority
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW customer_360_gdpr AS
    SELECT customer_id, username, created_at, status, country_code, timezone, total_purchases,
      engagement_status, value_segment, recency_segment, churn_risk_level
    FROM customer_360
  `);

  // Financial Summary Views
  await knex.raw(`
    CREATE OR REPLACE VIEW financial_summary_payment_methods AS
    SELECT fsb.*, t.metadata->>'payment_method' as payment_method, t.stripe_payment_intent_id as gateway_transaction_id
    FROM financial_summary_basic fsb LEFT JOIN payment_transactions t ON fsb.transaction_id = t.id
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW financial_summary_with_refunds AS
    SELECT fspm.*, t.type as transaction_type,
      CASE WHEN t.type = 'refund' THEN fspm.amount ELSE 0 END as refund_amount,
      CASE WHEN t.type = 'payment' THEN fspm.amount ELSE 0 END as payment_amount
    FROM financial_summary_payment_methods fspm JOIN payment_transactions t ON fspm.transaction_id = t.id
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW financial_summary_with_fees AS
    SELECT fswr.*,
      CASE WHEN fswr.transaction_type = 'payment' THEN fswr.amount * 0.029 + 0.30 ELSE 0 END as processing_fee,
      CASE WHEN fswr.transaction_type = 'payment' THEN fswr.amount * 0.10 ELSE 0 END as platform_fee,
      CASE WHEN fswr.transaction_type = 'payment' THEN fswr.amount - (fswr.amount * 0.10) - (fswr.amount * 0.029 + 0.30) ELSE -fswr.amount END as net_revenue_after_fees
    FROM financial_summary_with_refunds fswr
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW financial_summary AS
    SELECT fswf.*, DATE_TRUNC('day', fswf.created_at) as transaction_date,
      SUM(fswf.net_revenue_after_fees) OVER (ORDER BY fswf.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_revenue
    FROM financial_summary_with_fees fswf
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW daily_revenue_summary AS
    SELECT transaction_date, COUNT(*) as transaction_count, SUM(payment_amount) as gross_revenue,
      SUM(refund_amount) as total_refunds, SUM(net_revenue_after_fees) as net_revenue
    FROM financial_summary GROUP BY transaction_date
  `);

  // Marketplace Activity Views
  await knex.raw(`
    CREATE OR REPLACE VIEW marketplace_activity_basic AS
    SELECT mt.id as transaction_id, mt.ticket_id, mt.listing_id, mt.buyer_id, mt.seller_id,
      mt.usd_value as sale_price, mt.status, mt.created_at
    FROM marketplace_transfers mt WHERE mt.deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW marketplace_activity_with_listings AS
    SELECT mab.*, l.price as listing_price, l.original_face_value as original_price, l.status as listing_status,
      l.listed_at as listing_created_at, l.view_count, mab.sale_price - l.price as price_difference
    FROM marketplace_activity_basic mab LEFT JOIN marketplace_listings l ON mab.listing_id = l.id
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW marketplace_activity_with_users AS
    SELECT mawl.*, buyer.username as buyer_username, seller.username as seller_username,
      DATE_TRUNC('day', mawl.created_at) as sale_date
    FROM marketplace_activity_with_listings mawl
    LEFT JOIN users buyer ON mawl.buyer_id = buyer.id
    LEFT JOIN users seller ON mawl.seller_id = seller.id
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW marketplace_activity_with_fees AS
    SELECT mawu.*, COALESCE(pf.platform_fee_amount, 0) as platform_fee, COALESCE(pf.seller_payout, 0) as seller_payout
    FROM marketplace_activity_with_users mawu
    LEFT JOIN marketplace_transfers mt ON mawu.transaction_id = mt.id
    LEFT JOIN platform_fees pf ON mt.id = pf.transfer_id
  `);

  await knex.raw(`CREATE OR REPLACE VIEW marketplace_activity AS SELECT * FROM marketplace_activity_with_fees`);

  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS marketplace_activity_materialized CASCADE`);
  await knex.raw(`CREATE MATERIALIZED VIEW marketplace_activity_materialized AS SELECT * FROM marketplace_activity`);
  await knex.raw(`CREATE INDEX idx_market_mat_date ON marketplace_activity_materialized(sale_date)`);
  await knex.raw(`CREATE INDEX idx_market_mat_ticket ON marketplace_activity_materialized(ticket_id)`);

  await knex.raw(`
    CREATE OR REPLACE VIEW daily_marketplace_summary AS
    SELECT sale_date, COUNT(DISTINCT transaction_id) as transaction_count, SUM(sale_price) as total_volume,
      AVG(sale_price) as avg_sale_price, SUM(platform_fee) as total_platform_fees
    FROM marketplace_activity WHERE status = 'COMPLETED' GROUP BY sale_date ORDER BY sale_date DESC
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW seller_performance AS
    SELECT seller_id, seller_username, COUNT(*) as total_sales, SUM(sale_price) as total_revenue,
      SUM(seller_payout) as total_earnings
    FROM marketplace_activity WHERE status = 'COMPLETED' GROUP BY seller_id, seller_username ORDER BY total_revenue DESC
  `);

  // User Dashboard View
  await knex.raw(`
    CREATE OR REPLACE VIEW user_dashboard_view AS
    SELECT
      u.id as user_id, u.email, u.username, u.display_name, u.first_name, u.last_name,
      u.role, u.status, u.created_at as member_since, u.last_login_at, u.login_count,
      u.avatar_url as profile_image_url, u.phone, u.email_verified, u.two_factor_enabled,
      COALESCE(u.loyalty_points, 0) as loyalty_points,
      CASE WHEN COALESCE(u.loyalty_points, 0) >= 10000 THEN 'platinum'
           WHEN COALESCE(u.loyalty_points, 0) >= 5000 THEN 'gold'
           WHEN COALESCE(u.loyalty_points, 0) >= 1000 THEN 'silver' ELSE 'bronze' END as loyalty_tier,
      COALESCE(u.total_spent, 0) as total_spent,
      COALESCE(u.events_attended, 0) as events_attended,
      (SELECT COUNT(*) FROM tickets t WHERE t.user_id = u.id AND t.status = 'active') as active_tickets,
      (SELECT COUNT(*) FROM marketplace_listings ml WHERE ml.seller_id = u.id AND ml.status = 'active') as active_listings,
      CURRENT_TIMESTAMP AS last_updated
    FROM users u WHERE u.deleted_at IS NULL
  `);

  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS user_dashboard_materialized CASCADE`);
  await knex.raw(`CREATE MATERIALIZED VIEW user_dashboard_materialized AS SELECT * FROM user_dashboard_view`);
  await knex.raw(`CREATE UNIQUE INDEX idx_user_dashboard_mat_user_id ON user_dashboard_materialized(user_id)`);
  await knex.raw(`CREATE INDEX idx_user_dashboard_mat_status ON user_dashboard_materialized(status)`);
  await knex.raw(`CREATE INDEX idx_user_dashboard_mat_loyalty_tier ON user_dashboard_materialized(loyalty_tier)`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION refresh_user_dashboard(p_user_ids uuid[] DEFAULT NULL) RETURNS void AS $$
    BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY user_dashboard_materialized; END;
    $$ LANGUAGE plpgsql
  `);

  // Compliance Reporting Views
  await knex.raw(`
    CREATE OR REPLACE VIEW compliance_reporting_basic AS
    SELECT al.id as audit_id, COALESCE(al.table_name, al.resource_type) as table_name,
      COALESCE(al.record_id, al.resource_id) as record_id, al.action, al.user_id, al.created_at,
      DATE_TRUNC('day', al.created_at) as audit_date
    FROM audit_logs al
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW compliance_reporting_user_activity AS
    SELECT crb.*, u.email as user_email, u.username, u.role as user_role,
      COUNT(*) OVER (PARTITION BY crb.user_id) as total_actions_by_user,
      EXTRACT(HOUR FROM crb.created_at) as activity_hour
    FROM compliance_reporting_basic crb LEFT JOIN users u ON crb.user_id = u.id
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW compliance_reporting_data_changes AS
    SELECT crua.*, COALESCE(array_length(al.changed_fields, 1), 0) as fields_changed_count, al.changed_fields,
      al.old_data, al.new_data,
      CASE WHEN crua.table_name IN ('users', 'payment_methods', 'transactions') THEN 'HIGH'
           WHEN crua.table_name IN ('tickets', 'events') THEN 'MEDIUM' ELSE 'LOW' END as sensitivity_level,
      CASE WHEN crua.action = 'DELETE' AND crua.table_name IN ('users', 'transactions') THEN 100
           WHEN crua.action = 'DELETE' THEN 80 WHEN crua.action = 'UPDATE' AND crua.table_name = 'users' THEN 70
           WHEN crua.action = 'UPDATE' THEN 50 WHEN crua.action = 'INSERT' THEN 20 ELSE 10 END as operation_risk_score
    FROM compliance_reporting_user_activity crua JOIN audit_logs al ON crua.audit_id = al.id
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW compliance_reporting_risk_analysis AS
    SELECT crdc.*,
      CASE WHEN crdc.activity_hour BETWEEN 0 AND 5 THEN true ELSE false END as unusual_hour_activity,
      CASE WHEN crdc.operation_risk_score >= 80 THEN true ELSE false END as is_high_risk_operation,
      CASE WHEN crdc.operation_risk_score >= 90 THEN 'CRITICAL' WHEN crdc.operation_risk_score >= 70 THEN 'HIGH'
           WHEN crdc.operation_risk_score >= 50 THEN 'MEDIUM' ELSE 'LOW' END as alert_level
    FROM compliance_reporting_data_changes crdc
  `);

  await knex.raw(`CREATE OR REPLACE VIEW compliance_reporting AS SELECT * FROM compliance_reporting_risk_analysis`);

  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS compliance_reporting_materialized CASCADE`);
  await knex.raw(`CREATE MATERIALIZED VIEW compliance_reporting_materialized AS SELECT * FROM compliance_reporting WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'`);
  await knex.raw(`CREATE INDEX idx_comp_mat_date ON compliance_reporting_materialized(audit_date)`);
  await knex.raw(`CREATE INDEX idx_comp_mat_user ON compliance_reporting_materialized(user_id)`);
  await knex.raw(`CREATE INDEX idx_comp_mat_alert ON compliance_reporting_materialized(alert_level)`);

  await knex.raw(`
    CREATE OR REPLACE VIEW daily_compliance_summary AS
    SELECT audit_date, COUNT(*) as total_operations, COUNT(DISTINCT user_id) as unique_users,
      COUNT(CASE WHEN sensitivity_level = 'HIGH' THEN 1 END) as high_sensitivity_ops,
      COUNT(CASE WHEN alert_level = 'CRITICAL' THEN 1 END) as critical_alerts
    FROM compliance_reporting GROUP BY audit_date ORDER BY audit_date DESC
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW user_risk_profile AS
    SELECT user_id, user_email, user_role, COUNT(*) as total_operations,
      MAX(operation_risk_score) as max_risk_score,
      COUNT(CASE WHEN is_high_risk_operation THEN 1 END) as high_risk_ops_count,
      COUNT(CASE WHEN unusual_hour_activity THEN 1 END) as after_hours_actions
    FROM compliance_reporting WHERE user_id IS NOT NULL
    GROUP BY user_id, user_email, user_role ORDER BY high_risk_ops_count DESC
  `);

  await knex.raw(`
    CREATE OR REPLACE VIEW compliance_reporting_gdpr AS
    SELECT audit_id, table_name, action, sensitivity_level, alert_level, audit_date, unusual_hour_activity,
      is_high_risk_operation, fields_changed_count, changed_fields
    FROM compliance_reporting
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION refresh_compliance_reporting_materialized() RETURNS void AS $$
    BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_reporting_materialized; END;
    $$ LANGUAGE plpgsql
  `);

  console.log('✅ Analytics Service migration complete');
}

export async function down(knex: Knex): Promise<void> {
  // Drop functions
  await knex.raw('DROP FUNCTION IF EXISTS refresh_compliance_reporting_materialized() CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS refresh_user_dashboard(uuid[]) CASCADE');
  await knex.raw('DROP FUNCTION IF EXISTS refresh_venue_analytics_mv() CASCADE');

  // Drop materialized views
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS compliance_reporting_materialized CASCADE');
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS user_dashboard_materialized CASCADE');
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS marketplace_activity_materialized CASCADE');
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS customer_360_materialized CASCADE');
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS venue_analytics_mv CASCADE');

  // Drop compliance views
  await knex.raw('DROP VIEW IF EXISTS compliance_reporting_gdpr CASCADE');
  await knex.raw('DROP VIEW IF EXISTS user_risk_profile CASCADE');
  await knex.raw('DROP VIEW IF EXISTS daily_compliance_summary CASCADE');
  await knex.raw('DROP VIEW IF EXISTS compliance_reporting CASCADE');
  await knex.raw('DROP VIEW IF EXISTS compliance_reporting_risk_analysis CASCADE');
  await knex.raw('DROP VIEW IF EXISTS compliance_reporting_data_changes CASCADE');
  await knex.raw('DROP VIEW IF EXISTS compliance_reporting_user_activity CASCADE');
  await knex.raw('DROP VIEW IF EXISTS compliance_reporting_basic CASCADE');

  // Drop user dashboard view
  await knex.raw('DROP VIEW IF EXISTS user_dashboard_view CASCADE');

  // Drop marketplace views
  await knex.raw('DROP VIEW IF EXISTS seller_performance CASCADE');
  await knex.raw('DROP VIEW IF EXISTS daily_marketplace_summary CASCADE');
  await knex.raw('DROP VIEW IF EXISTS marketplace_activity CASCADE');
  await knex.raw('DROP VIEW IF EXISTS marketplace_activity_with_fees CASCADE');
  await knex.raw('DROP VIEW IF EXISTS marketplace_activity_with_users CASCADE');
  await knex.raw('DROP VIEW IF EXISTS marketplace_activity_with_listings CASCADE');
  await knex.raw('DROP VIEW IF EXISTS marketplace_activity_basic CASCADE');

  // Drop financial views
  await knex.raw('DROP VIEW IF EXISTS daily_revenue_summary CASCADE');
  await knex.raw('DROP VIEW IF EXISTS financial_summary CASCADE');
  await knex.raw('DROP VIEW IF EXISTS financial_summary_with_fees CASCADE');
  await knex.raw('DROP VIEW IF EXISTS financial_summary_with_refunds CASCADE');
  await knex.raw('DROP VIEW IF EXISTS financial_summary_payment_methods CASCADE');
  await knex.raw('DROP VIEW IF EXISTS financial_summary_basic CASCADE');

  // Drop customer 360 views
  await knex.raw('DROP VIEW IF EXISTS customer_360_gdpr CASCADE');
  await knex.raw('DROP VIEW IF EXISTS churn_risk_dashboard CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_segment_summary CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_360 CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_360_with_churn_risk CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_360_with_segments CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_360_with_engagement CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_360_with_purchases CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_360_with_preferences CASCADE');
  await knex.raw('DROP VIEW IF EXISTS customer_360_basic CASCADE');

  // Drop ticket views
  await knex.raw('DROP VIEW IF EXISTS ticket_inventory_summary CASCADE');
  await knex.raw('DROP VIEW IF EXISTS ticket_status_details CASCADE');

  // Drop venue/event views
  await knex.raw('DROP VIEW IF EXISTS venue_analytics CASCADE');
  await knex.raw('DROP VIEW IF EXISTS event_summary CASCADE');

  // Drop tables
  await knex.schema.dropTableIfExists('venue_alerts');
  await knex.schema.dropTableIfExists('realtime_metrics');
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
