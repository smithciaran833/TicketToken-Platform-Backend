import { Knex } from 'knex';

/**
 * Phase 6: Add Orphan Tables for Order Service
 * 
 * Tables added:
 * - order_report_summaries: Daily/weekly/monthly order summaries
 * - order_revenue_reports: Revenue reports by entity (event, etc.)
 * - saved_searches: Admin saved search configurations
 * - search_history: Admin search history tracking
 * - admin_overrides: Admin override requests with approval workflow
 * - admin_override_audit: Audit log for admin overrides
 * - note_templates: Templates for order notes
 */

export async function up(knex: Knex): Promise<void> {
  // Set timeouts to prevent blocking
  await knex.raw("SET lock_timeout = '10s'");
  await knex.raw("SET statement_timeout = '60s'");

  // ============================================================================
  // ENUM TYPES
  // ============================================================================

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE report_period AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE override_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ============================================================================
  // TABLE: order_report_summaries
  // ============================================================================

  await knex.schema.createTable('order_report_summaries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.specificType('period', 'report_period').notNullable();
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.integer('total_orders').notNullable().defaultTo(0);
    table.bigInteger('total_revenue_cents').notNullable().defaultTo(0);
    table.bigInteger('average_order_value_cents').notNullable().defaultTo(0);
    table.bigInteger('total_refunds_cents').notNullable().defaultTo(0);
    table.jsonb('orders_by_status').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'period', 'start_date']);
  });

  await knex.raw(`CREATE INDEX idx_order_report_summaries_tenant ON order_report_summaries(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_order_report_summaries_period ON order_report_summaries(tenant_id, period, start_date DESC)`);

  // ============================================================================
  // TABLE: order_revenue_reports
  // ============================================================================

  await knex.schema.createTable('order_revenue_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('entity_type', 20).notNullable();
    table.uuid('entity_id').notNullable();
    table.specificType('period', 'report_period').notNullable();
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.bigInteger('total_revenue_cents').notNullable().defaultTo(0);
    table.integer('total_orders').notNullable().defaultTo(0);
    table.integer('total_tickets_sold').notNullable().defaultTo(0);
    table.bigInteger('average_order_value_cents').notNullable().defaultTo(0);
    table.jsonb('top_ticket_types').defaultTo('[]');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'entity_type', 'entity_id', 'start_date']);
  });

  await knex.raw(`CREATE INDEX idx_order_revenue_reports_tenant ON order_revenue_reports(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_order_revenue_reports_entity ON order_revenue_reports(tenant_id, entity_type, entity_id)`);

  // ============================================================================
  // TABLE: saved_searches
  // ============================================================================

  await knex.schema.createTable('saved_searches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('admin_user_id').notNullable();
    table.string('name', 255).notNullable();
    table.jsonb('filters').notNullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_saved_searches_tenant ON saved_searches(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_saved_searches_user ON saved_searches(tenant_id, admin_user_id)`);
  await knex.raw(`CREATE INDEX idx_saved_searches_default ON saved_searches(tenant_id, admin_user_id, is_default) WHERE is_default = true`);

  // ============================================================================
  // TABLE: search_history
  // ============================================================================

  await knex.schema.createTable('search_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('admin_user_id').notNullable();
    table.text('query');
    table.jsonb('filters').notNullable();
    table.integer('results_count').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_search_history_tenant ON search_history(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_search_history_user ON search_history(tenant_id, admin_user_id, created_at DESC)`);

  // ============================================================================
  // TABLE: admin_overrides
  // ============================================================================

  await knex.schema.createTable('admin_overrides', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('admin_user_id').notNullable();
    table.string('override_type', 50).notNullable();
    table.jsonb('original_value');
    table.jsonb('new_value');
    table.text('reason').notNullable();
    table.specificType('approval_status', 'override_approval_status').notNullable().defaultTo('PENDING');
    table.uuid('approved_by');
    table.timestamp('approved_at');
    table.text('rejection_reason');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_admin_overrides_tenant ON admin_overrides(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_admin_overrides_order ON admin_overrides(order_id)`);
  await knex.raw(`CREATE INDEX idx_admin_overrides_status ON admin_overrides(tenant_id, approval_status)`);
  await knex.raw(`CREATE INDEX idx_admin_overrides_pending ON admin_overrides(tenant_id, created_at ASC) WHERE approval_status = 'PENDING'`);

  // ============================================================================
  // TABLE: admin_override_audit
  // ============================================================================

  await knex.schema.createTable('admin_override_audit', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('override_id').notNullable().references('id').inTable('admin_overrides').onDelete('CASCADE');
    table.string('action', 30).notNullable();
    table.uuid('actor_user_id').notNullable();
    table.string('actor_role', 50).notNullable();
    table.jsonb('changes').notNullable();
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_admin_override_audit_tenant ON admin_override_audit(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_admin_override_audit_override ON admin_override_audit(override_id, created_at ASC)`);

  // ============================================================================
  // TABLE: note_templates
  // ============================================================================

  await knex.schema.createTable('note_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.specificType('note_type', 'order_note_type').notNullable();
    table.text('content_template').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('usage_count').notNullable().defaultTo(0);
    table.uuid('created_by').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_note_templates_tenant ON note_templates(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_note_templates_active ON note_templates(tenant_id, is_active, note_type) WHERE is_active = true`);
  await knex.raw(`CREATE INDEX idx_note_templates_usage ON note_templates(tenant_id, usage_count DESC, name ASC)`);

  // ============================================================================
  // ENABLE RLS
  // ============================================================================

  await knex.raw('ALTER TABLE order_report_summaries ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_revenue_reports ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE search_history ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE admin_overrides ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE admin_override_audit ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY');

  // ============================================================================
  // RLS POLICIES
  // ============================================================================

  await knex.raw(`CREATE POLICY order_report_summaries_tenant_isolation ON order_report_summaries FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY order_revenue_reports_tenant_isolation ON order_revenue_reports FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY saved_searches_tenant_isolation ON saved_searches FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY search_history_tenant_isolation ON search_history FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY admin_overrides_tenant_isolation ON admin_overrides FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY admin_override_audit_tenant_isolation ON admin_override_audit FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);
  await knex.raw(`CREATE POLICY note_templates_tenant_isolation ON note_templates FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)`);

  // ============================================================================
  // UPDATE TRIGGERS
  // ============================================================================

  await knex.raw(`
    CREATE TRIGGER update_order_report_summaries_updated_at
    BEFORE UPDATE ON order_report_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_order_revenue_reports_updated_at
    BEFORE UPDATE ON order_revenue_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_saved_searches_updated_at
    BEFORE UPDATE ON saved_searches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_admin_overrides_updated_at
    BEFORE UPDATE ON admin_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  await knex.raw(`
    CREATE TRIGGER update_note_templates_updated_at
    BEFORE UPDATE ON note_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS update_note_templates_updated_at ON note_templates');
  await knex.raw('DROP TRIGGER IF EXISTS update_admin_overrides_updated_at ON admin_overrides');
  await knex.raw('DROP TRIGGER IF EXISTS update_saved_searches_updated_at ON saved_searches');
  await knex.raw('DROP TRIGGER IF EXISTS update_order_revenue_reports_updated_at ON order_revenue_reports');
  await knex.raw('DROP TRIGGER IF EXISTS update_order_report_summaries_updated_at ON order_report_summaries');

  // Drop policies
  await knex.raw('DROP POLICY IF EXISTS note_templates_tenant_isolation ON note_templates');
  await knex.raw('DROP POLICY IF EXISTS admin_override_audit_tenant_isolation ON admin_override_audit');
  await knex.raw('DROP POLICY IF EXISTS admin_overrides_tenant_isolation ON admin_overrides');
  await knex.raw('DROP POLICY IF EXISTS search_history_tenant_isolation ON search_history');
  await knex.raw('DROP POLICY IF EXISTS saved_searches_tenant_isolation ON saved_searches');
  await knex.raw('DROP POLICY IF EXISTS order_revenue_reports_tenant_isolation ON order_revenue_reports');
  await knex.raw('DROP POLICY IF EXISTS order_report_summaries_tenant_isolation ON order_report_summaries');

  // Disable RLS
  await knex.raw('ALTER TABLE note_templates DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE admin_override_audit DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE admin_overrides DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE search_history DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE saved_searches DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_revenue_reports DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE order_report_summaries DISABLE ROW LEVEL SECURITY');

  // Drop tables
  await knex.schema.dropTableIfExists('note_templates');
  await knex.schema.dropTableIfExists('admin_override_audit');
  await knex.schema.dropTableIfExists('admin_overrides');
  await knex.schema.dropTableIfExists('search_history');
  await knex.schema.dropTableIfExists('saved_searches');
  await knex.schema.dropTableIfExists('order_revenue_reports');
  await knex.schema.dropTableIfExists('order_report_summaries');

  // Drop types
  await knex.raw('DROP TYPE IF EXISTS override_approval_status');
  await knex.raw('DROP TYPE IF EXISTS report_period');
}
