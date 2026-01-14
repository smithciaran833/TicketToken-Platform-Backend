import { Knex } from 'knex';

/**
 * Phase 6: Add Orphan Tables for Venue Service
 * 
 * Tables added:
 * - resale_blocks: Block users from resale activities (anti-scalping)
 * - fraud_logs: Log fraud detection results for resale transactions
 */

export async function up(knex: Knex): Promise<void> {
  // Set timeouts to prevent blocking
  await knex.raw("SET lock_timeout = '10s'");
  await knex.raw("SET statement_timeout = '60s'");

  // ============================================================================
  // TABLE: resale_blocks
  // ============================================================================

  await knex.schema.createTable('resale_blocks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.text('reason').notNullable();
    table.uuid('blocked_by').notNullable();
    table.timestamp('blocked_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.boolean('active').notNullable().defaultTo(true);
  });

  await knex.raw(`CREATE INDEX idx_resale_blocks_tenant ON resale_blocks(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_resale_blocks_user ON resale_blocks(user_id, tenant_id)`);
  await knex.raw(`CREATE INDEX idx_resale_blocks_active ON resale_blocks(user_id, tenant_id, active) WHERE active = true`);
  await knex.raw(`CREATE INDEX idx_resale_blocks_expires ON resale_blocks(expires_at) WHERE active = true AND expires_at IS NOT NULL`);

  // ============================================================================
  // TABLE: fraud_logs
  // ============================================================================

  await knex.schema.createTable('fraud_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable();
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('seller_id').notNullable();
    table.uuid('buyer_id').notNullable();
    table.integer('risk_score').notNullable();
    table.jsonb('signals').notNullable();
    table.string('action', 30).notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.check('risk_score >= 0 AND risk_score <= 100', [], 'ck_fraud_logs_risk_score_valid');
  });

  await knex.raw(`CREATE INDEX idx_fraud_logs_tenant ON fraud_logs(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_fraud_logs_transaction ON fraud_logs(transaction_id)`);
  await knex.raw(`CREATE INDEX idx_fraud_logs_seller ON fraud_logs(seller_id, tenant_id)`);
  await knex.raw(`CREATE INDEX idx_fraud_logs_buyer ON fraud_logs(buyer_id, tenant_id)`);
  await knex.raw(`CREATE INDEX idx_fraud_logs_ticket ON fraud_logs(ticket_id)`);
  await knex.raw(`CREATE INDEX idx_fraud_logs_risk ON fraud_logs(tenant_id, risk_score DESC, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_fraud_logs_action ON fraud_logs(tenant_id, action, created_at DESC)`);

  // ============================================================================
  // ENABLE RLS
  // ============================================================================

  await knex.raw('ALTER TABLE resale_blocks ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE fraud_logs ENABLE ROW LEVEL SECURITY');

  // ============================================================================
  // RLS POLICIES
  // ============================================================================

  await knex.raw(`
    CREATE POLICY resale_blocks_tenant_isolation ON resale_blocks
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid)
  `);

  await knex.raw(`
    CREATE POLICY fraud_logs_tenant_isolation ON fraud_logs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop policies
  await knex.raw('DROP POLICY IF EXISTS fraud_logs_tenant_isolation ON fraud_logs');
  await knex.raw('DROP POLICY IF EXISTS resale_blocks_tenant_isolation ON resale_blocks');

  // Disable RLS
  await knex.raw('ALTER TABLE fraud_logs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE resale_blocks DISABLE ROW LEVEL SECURITY');

  // Drop tables
  await knex.schema.dropTableIfExists('fraud_logs');
  await knex.schema.dropTableIfExists('resale_blocks');
}
