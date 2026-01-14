import { Knex } from 'knex';

/**
 * Phase 6: Add Orphan Tables for Payment Service
 * 
 * Tables added:
 * - escrow_accounts: Hold funds until release conditions met
 * - escrow_events: Audit log for escrow state changes
 * - royalty_reversals: Track royalty reversals on refunds
 * - balance_transaction_snapshots: Stripe balance reconciliation snapshots
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
      CREATE TYPE escrow_status AS ENUM ('pending', 'held', 'partially_released', 'released', 'cancelled', 'disputed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ============================================================================
  // TABLE: escrow_accounts
  // ============================================================================

  await knex.schema.createTable('escrow_accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable();
    table.string('payment_intent_id', 50).notNullable();
    table.integer('amount').notNullable();
    table.integer('held_amount').notNullable();
    table.integer('released_amount').notNullable().defaultTo(0);
    table.specificType('status', 'escrow_status').notNullable().defaultTo('pending');
    table.timestamp('hold_until').notNullable();
    table.jsonb('release_conditions').defaultTo('[]');
    table.string('dispute_id', 50);
    table.uuid('tenant_id').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.check('amount >= 0', [], 'ck_escrow_accounts_amount_positive');
    table.check('held_amount >= 0', [], 'ck_escrow_accounts_held_amount_positive');
    table.check('released_amount >= 0', [], 'ck_escrow_accounts_released_amount_positive');
  });

  await knex.raw(`CREATE INDEX idx_escrow_order_id ON escrow_accounts(order_id)`);
  await knex.raw(`CREATE INDEX idx_escrow_payment_intent ON escrow_accounts(payment_intent_id)`);
  await knex.raw(`CREATE INDEX idx_escrow_tenant ON escrow_accounts(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_escrow_status_hold ON escrow_accounts(status, hold_until)`);
  await knex.raw(`CREATE INDEX idx_escrow_ready_release ON escrow_accounts(hold_until) WHERE status = 'held' AND hold_until <= NOW()`);

  // ============================================================================
  // TABLE: escrow_events
  // ============================================================================

  await knex.schema.createTable('escrow_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('escrow_id').notNullable().references('id').inTable('escrow_accounts').onDelete('CASCADE');
    table.string('event_type', 30).notNullable();
    table.integer('amount');
    table.text('reason');
    table.uuid('tenant_id').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_escrow_events_escrow ON escrow_events(escrow_id)`);
  await knex.raw(`CREATE INDEX idx_escrow_events_tenant ON escrow_events(tenant_id)`);

  // ============================================================================
  // TABLE: royalty_reversals
  // ============================================================================

  await knex.schema.createTable('royalty_reversals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('refund_id').notNullable();
    table.uuid('payment_id').notNullable();
    table.string('recipient_id', 255).notNullable();
    table.string('recipient_type', 50).notNullable();
    table.integer('original_royalty').notNullable();
    table.integer('reversed_amount').notNullable();
    table.integer('remaining_royalty').notNullable();
    table.decimal('refund_ratio', 5, 4).notNullable();
    table.uuid('tenant_id').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.check('original_royalty >= 0', [], 'ck_royalty_reversals_original_positive');
    table.check('reversed_amount >= 0', [], 'ck_royalty_reversals_reversed_positive');
    table.check('remaining_royalty >= 0', [], 'ck_royalty_reversals_remaining_positive');
    table.check('refund_ratio >= 0 AND refund_ratio <= 1', [], 'ck_royalty_reversals_ratio_valid');
  });

  await knex.raw(`CREATE INDEX idx_royalty_reversals_tenant ON royalty_reversals(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_royalty_reversals_refund ON royalty_reversals(refund_id)`);
  await knex.raw(`CREATE INDEX idx_royalty_reversals_payment ON royalty_reversals(payment_id)`);
  await knex.raw(`CREATE INDEX idx_royalty_reversals_recipient ON royalty_reversals(recipient_id, recipient_type)`);

  // ============================================================================
  // TABLE: balance_transaction_snapshots
  // ============================================================================

  await knex.schema.createTable('balance_transaction_snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.date('snapshot_date').notNullable();
    table.jsonb('charges_data').notNullable();
    table.jsonb('transfers_data').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'snapshot_date']);
  });

  await knex.raw(`CREATE INDEX idx_balance_snapshots_tenant ON balance_transaction_snapshots(tenant_id)`);
  await knex.raw(`CREATE INDEX idx_balance_snapshots_date ON balance_transaction_snapshots(tenant_id, snapshot_date DESC)`);

  // ============================================================================
  // ENABLE RLS
  // ============================================================================

  await knex.raw('ALTER TABLE escrow_accounts ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE escrow_events ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE royalty_reversals ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE balance_transaction_snapshots ENABLE ROW LEVEL SECURITY');

  // ============================================================================
  // RLS POLICIES
  // ============================================================================

  await knex.raw(`
    CREATE POLICY escrow_accounts_tenant_isolation ON escrow_accounts
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  `);

  await knex.raw(`
    CREATE POLICY escrow_events_tenant_isolation ON escrow_events
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  `);

  await knex.raw(`
    CREATE POLICY royalty_reversals_tenant_isolation ON royalty_reversals
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  `);

  await knex.raw(`
    CREATE POLICY balance_snapshots_tenant_isolation ON balance_transaction_snapshots
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  `);

  // ============================================================================
  // UPDATE TRIGGERS
  // ============================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  await knex.raw(`
    CREATE TRIGGER update_escrow_accounts_updated_at
    BEFORE UPDATE ON escrow_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS update_escrow_accounts_updated_at ON escrow_accounts');

  // Drop policies
  await knex.raw('DROP POLICY IF EXISTS balance_snapshots_tenant_isolation ON balance_transaction_snapshots');
  await knex.raw('DROP POLICY IF EXISTS royalty_reversals_tenant_isolation ON royalty_reversals');
  await knex.raw('DROP POLICY IF EXISTS escrow_events_tenant_isolation ON escrow_events');
  await knex.raw('DROP POLICY IF EXISTS escrow_accounts_tenant_isolation ON escrow_accounts');

  // Disable RLS
  await knex.raw('ALTER TABLE balance_transaction_snapshots DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE royalty_reversals DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE escrow_events DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE escrow_accounts DISABLE ROW LEVEL SECURITY');

  // Drop tables
  await knex.schema.dropTableIfExists('balance_transaction_snapshots');
  await knex.schema.dropTableIfExists('royalty_reversals');
  await knex.schema.dropTableIfExists('escrow_events');
  await knex.schema.dropTableIfExists('escrow_accounts');

  // Drop types
  await knex.raw('DROP TYPE IF EXISTS escrow_status');
}
