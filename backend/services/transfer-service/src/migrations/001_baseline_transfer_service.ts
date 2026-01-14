import { Knex } from 'knex';

/**
 * Transfer Service - Consolidated Baseline Migration
 * 
 * Generated: January 13, 2026
 * Consolidates: 001, 002, 20260103 migrations
 * 
 * Tables: 10 (all tenant-scoped)
 * 
 * Standards Applied:
 * - gen_random_uuid() for all UUIDs
 * - UUID PK for batch_transfers (was string)
 * - tenant_id NOT NULL on all tables (no default)
 * - RLS with app.current_tenant_id + app.is_system_user
 * - External FKs converted to comments (including ticket_transfers)
 * - Internal FKs preserved
 * 
 * Note: ticket_transfers table lives in ticket-service
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // FUNCTIONS
  // ============================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================================
  // TENANT-SCOPED TABLES (10) - All with tenant_id and RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // 1. ticket_transactions - Transaction history
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('ticket_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('ticket_id').notNullable().comment('FK: ticket-service.tickets.id');
    table.uuid('user_id').notNullable().comment('FK: auth-service.users.id');
    table.string('transaction_type', 100).notNullable();
    table.decimal('amount', 10, 2).defaultTo(0);
    table.string('status', 50).notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_ticket_transactions_tenant ON ticket_transactions(tenant_id)');
  await knex.raw('CREATE INDEX idx_ticket_transactions_ticket ON ticket_transactions(ticket_id)');
  await knex.raw('CREATE INDEX idx_ticket_transactions_user ON ticket_transactions(user_id)');
  await knex.raw('CREATE INDEX idx_ticket_transactions_type ON ticket_transactions(transaction_type)');
  await knex.raw('CREATE INDEX idx_ticket_transactions_status ON ticket_transactions(status)');
  await knex.raw('CREATE INDEX idx_ticket_transactions_created ON ticket_transactions(created_at)');
  await knex.raw('CREATE INDEX idx_ticket_transactions_ticket_created ON ticket_transactions(ticket_id, created_at)');

  // ---------------------------------------------------------------------------
  // 2. batch_transfers - Bulk transfer operations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('batch_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: auth-service.users.id');
    table.integer('total_items').notNullable();
    table.integer('success_count').defaultTo(0);
    table.integer('failure_count').defaultTo(0);
    table.string('status', 50).notNullable().defaultTo('PROCESSING');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_batch_transfers_tenant ON batch_transfers(tenant_id)');
  await knex.raw('CREATE INDEX idx_batch_transfers_user ON batch_transfers(user_id)');
  await knex.raw('CREATE INDEX idx_batch_transfers_status ON batch_transfers(status)');
  await knex.raw('CREATE INDEX idx_batch_transfers_created ON batch_transfers(created_at)');

  // ---------------------------------------------------------------------------
  // 3. batch_transfer_items - Batch transfer details
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('batch_transfer_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('batch_id').notNullable();
    table.uuid('ticket_id').notNullable().comment('FK: ticket-service.tickets.id');
    table.uuid('transfer_id').comment('FK: ticket-service.ticket_transfers.id');
    table.string('status', 50).notNullable();
    table.text('error_message');
    table.timestamp('processed_at').defaultTo(knex.fn.now());

    table.foreign('batch_id').references('batch_transfers.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_batch_transfer_items_tenant ON batch_transfer_items(tenant_id)');
  await knex.raw('CREATE INDEX idx_batch_transfer_items_batch ON batch_transfer_items(batch_id)');
  await knex.raw('CREATE INDEX idx_batch_transfer_items_ticket ON batch_transfer_items(ticket_id)');
  await knex.raw('CREATE INDEX idx_batch_transfer_items_transfer ON batch_transfer_items(transfer_id)');
  await knex.raw('CREATE INDEX idx_batch_transfer_items_status ON batch_transfer_items(status)');

  // ---------------------------------------------------------------------------
  // 4. promotional_codes - Discount codes
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('promotional_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('code', 50).notNullable();
    table.decimal('discount_percentage', 5, 2);
    table.decimal('discount_flat', 10, 2);
    table.boolean('is_active').defaultTo(true);
    table.integer('usage_limit');
    table.integer('usage_count').defaultTo(0);
    table.timestamp('expires_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['tenant_id', 'code']);
  });

  await knex.raw('CREATE INDEX idx_promotional_codes_tenant ON promotional_codes(tenant_id)');
  await knex.raw('CREATE INDEX idx_promotional_codes_code ON promotional_codes(code)');
  await knex.raw('CREATE INDEX idx_promotional_codes_active ON promotional_codes(is_active)');
  await knex.raw('CREATE INDEX idx_promotional_codes_expires ON promotional_codes(expires_at)');

  // ---------------------------------------------------------------------------
  // 5. transfer_fees - Fee tracking
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('transfer_fees', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transfer_id').notNullable().unique().comment('FK: ticket-service.ticket_transfers.id');
    table.decimal('base_fee', 10, 2).notNullable();
    table.decimal('platform_fee', 10, 2).defaultTo(0);
    table.decimal('service_fee', 10, 2).defaultTo(0);
    table.decimal('total_fee', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('payment_method', 50);
    table.timestamp('paid_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_transfer_fees_tenant ON transfer_fees(tenant_id)');
  await knex.raw('CREATE INDEX idx_transfer_fees_transfer ON transfer_fees(transfer_id)');

  // ---------------------------------------------------------------------------
  // 6. transfer_rules - Business rules engine
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('transfer_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('rule_name', 255).notNullable();
    table.string('rule_type', 100).notNullable();
    table.uuid('ticket_type_id').comment('FK: ticket-service.ticket_types.id');
    table.uuid('event_id').comment('FK: event-service.events.id');
    table.integer('priority').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_blocking').defaultTo(true);
    table.jsonb('config').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_transfer_rules_tenant ON transfer_rules(tenant_id)');
  await knex.raw('CREATE INDEX idx_transfer_rules_ticket_type ON transfer_rules(ticket_type_id)');
  await knex.raw('CREATE INDEX idx_transfer_rules_event ON transfer_rules(event_id)');
  await knex.raw('CREATE INDEX idx_transfer_rules_type ON transfer_rules(rule_type)');
  await knex.raw('CREATE INDEX idx_transfer_rules_active ON transfer_rules(is_active)');
  await knex.raw('CREATE INDEX idx_transfer_rules_priority ON transfer_rules(priority)');
  await knex.raw('CREATE INDEX idx_transfer_rules_composite ON transfer_rules(ticket_type_id, event_id, is_active)');

  // ---------------------------------------------------------------------------
  // 7. user_blacklist - Fraud prevention
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('user_blacklist', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('user_id').notNullable().comment('FK: auth-service.users.id');
    table.text('reason').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('blacklisted_at').defaultTo(knex.fn.now());
    table.uuid('blacklisted_by').comment('FK: auth-service.users.id');
    table.timestamp('expires_at');
    table.text('notes');

    table.unique(['tenant_id', 'user_id']);
  });

  await knex.raw('CREATE INDEX idx_user_blacklist_tenant ON user_blacklist(tenant_id)');
  await knex.raw('CREATE INDEX idx_user_blacklist_user ON user_blacklist(user_id)');
  await knex.raw('CREATE INDEX idx_user_blacklist_active ON user_blacklist(is_active)');

  // ---------------------------------------------------------------------------
  // 8. webhook_subscriptions - Event notifications
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('webhook_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.text('url').notNullable();
    table.specificType('events', 'text[]').notNullable();
    table.string('secret', 255).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_webhook_subscriptions_tenant ON webhook_subscriptions(tenant_id)');
  await knex.raw('CREATE INDEX idx_webhook_subscriptions_active ON webhook_subscriptions(is_active)');
  await knex.raw('CREATE INDEX idx_webhook_subscriptions_url ON webhook_subscriptions(url)');

  // ---------------------------------------------------------------------------
  // 9. webhook_deliveries - Webhook delivery tracking
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('webhook_deliveries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('subscription_id').notNullable();
    table.string('event', 100).notNullable();
    table.string('status', 20).notNullable();
    table.integer('http_status').notNullable();
    table.text('error_message');
    table.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('subscription_id').references('webhook_subscriptions.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id)');
  await knex.raw('CREATE INDEX idx_webhook_deliveries_subscription ON webhook_deliveries(subscription_id)');
  await knex.raw('CREATE INDEX idx_webhook_deliveries_attempted ON webhook_deliveries(attempted_at DESC)');
  await knex.raw('CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, attempted_at DESC)');
  await knex.raw(`CREATE INDEX idx_webhook_deliveries_failed ON webhook_deliveries(subscription_id, attempted_at DESC) WHERE status = 'FAILED'`);

  // ---------------------------------------------------------------------------
  // 10. failed_blockchain_transfers - Blockchain retry queue
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('failed_blockchain_transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('transfer_id').notNullable().unique().comment('FK: ticket-service.ticket_transfers.id');
    table.text('error_message').notNullable();
    table.timestamp('failed_at').notNullable().defaultTo(knex.fn.now());
    table.integer('retry_count').notNullable().defaultTo(0);
  });

  await knex.raw('CREATE INDEX idx_failed_blockchain_transfers_tenant ON failed_blockchain_transfers(tenant_id)');
  await knex.raw('CREATE INDEX idx_failed_blockchain_transfers_transfer ON failed_blockchain_transfers(transfer_id)');
  await knex.raw('CREATE INDEX idx_failed_blockchain_transfers_retry ON failed_blockchain_transfers(retry_count ASC, failed_at ASC)');
  await knex.raw(`CREATE INDEX idx_failed_blockchain_transfers_ready ON failed_blockchain_transfers(failed_at ASC) WHERE retry_count < 5`);

  await knex.raw(`
    ALTER TABLE failed_blockchain_transfers 
    ADD CONSTRAINT chk_retry_count_positive CHECK (retry_count >= 0)
  `);

  // ============================================================================
  // ROW LEVEL SECURITY - All 10 Tables
  // ============================================================================

  const tenantTables = [
    'ticket_transactions',
    'batch_transfers',
    'batch_transfer_items',
    'promotional_codes',
    'transfer_fees',
    'transfer_rules',
    'user_blacklist',
    'webhook_subscriptions',
    'webhook_deliveries',
    'failed_blockchain_transfers',
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

  console.log('✅ Transfer Service consolidated migration complete');
}

export async function down(knex: Knex): Promise<void> {
  const tenantTables = [
    'ticket_transactions',
    'batch_transfers',
    'batch_transfer_items',
    'promotional_codes',
    'transfer_fees',
    'transfer_rules',
    'user_blacklist',
    'webhook_subscriptions',
    'webhook_deliveries',
    'failed_blockchain_transfers',
  ];

  // Drop RLS policies
  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('failed_blockchain_transfers');
  await knex.schema.dropTableIfExists('webhook_deliveries');
  await knex.schema.dropTableIfExists('webhook_subscriptions');
  await knex.schema.dropTableIfExists('user_blacklist');
  await knex.schema.dropTableIfExists('transfer_rules');
  await knex.schema.dropTableIfExists('transfer_fees');
  await knex.schema.dropTableIfExists('promotional_codes');
  await knex.schema.dropTableIfExists('batch_transfer_items');
  await knex.schema.dropTableIfExists('batch_transfers');
  await knex.schema.dropTableIfExists('ticket_transactions');

  // Drop function
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  console.log('✅ Transfer Service rollback complete');
}
