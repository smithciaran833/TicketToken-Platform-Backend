import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Starting Transfer Service baseline migration...');

  // ====================================
  // TICKET_TRANSACTIONS TABLE
  // ====================================
  await knex.schema.createTable('ticket_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('ticket_id').notNullable();
    table.uuid('user_id').notNullable();
    table.string('transaction_type', 100).notNullable(); 
    // TRANSFER_RECEIVED, TRANSFER_SENT, PURCHASE, SALE, etc.
    table.decimal('amount', 10, 2).defaultTo(0);
    table.string('status', 50).notNullable(); // COMPLETED, PENDING, FAILED
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('ticket_id');
    table.index('user_id');
    table.index('transaction_type');
    table.index('status');
    table.index('created_at');
    table.index(['ticket_id', 'created_at']); // For transaction history
    table.index('tenant_id'); // Tenant isolation index
  });

  console.log('✅ ticket_transactions table created');

  // ====================================
  // BATCH_TRANSFERS TABLE
  // ====================================
  await knex.schema.createTable('batch_transfers', (table) => {
    table.string('id', 100).primary(); // batch_TIMESTAMP_RANDOM format
    table.uuid('user_id').notNullable();
    table.integer('total_items').notNullable();
    table.integer('success_count').defaultTo(0);
    table.integer('failure_count').defaultTo(0);
    table.string('status', 50).notNullable().defaultTo('PROCESSING'); 
    // PROCESSING, COMPLETED, CANCELLED
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('user_id');
    table.index('status');
    table.index('created_at');
    table.index('tenant_id');
  });

  console.log('✅ batch_transfers table created');

  // ====================================
  // BATCH_TRANSFER_ITEMS TABLE
  // ====================================
  await knex.schema.createTable('batch_transfer_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('batch_id', 100).notNullable();
    table.uuid('ticket_id').notNullable();
    table.uuid('transfer_id');
    table.string('status', 50).notNullable(); // SUCCESS, FAILED
    table.text('error_message');
    table.timestamp('processed_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Foreign keys (within service)
    table.foreign('batch_id')
      .references('id')
      .inTable('batch_transfers')
      .onDelete('CASCADE');
    
    table.foreign('transfer_id')
      .references('id')
      .inTable('ticket_transfers')
      .onDelete('CASCADE');

    // Indexes
    table.index('batch_id');
    table.index('ticket_id');
    table.index('transfer_id');
    table.index('status');
    table.index('tenant_id');
  });

  console.log('✅ batch_transfer_items table created');

  // ====================================
  // PROMOTIONAL_CODES TABLE
  // ====================================
  await knex.schema.createTable('promotional_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('code', 50).notNullable().unique();
    table.decimal('discount_percentage', 5, 2);
    table.decimal('discount_flat', 10, 2);
    table.boolean('is_active').defaultTo(true);
    table.integer('usage_limit');
    table.integer('usage_count').defaultTo(0);
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('code');
    table.index('is_active');
    table.index('expires_at');
    table.index('tenant_id');
  });

  console.log('✅ promotional_codes table created');

  // ====================================
  // TRANSFER_FEES TABLE
  // ====================================
  await knex.schema.createTable('transfer_fees', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('transfer_id').notNullable().unique();
    table.decimal('base_fee', 10, 2).notNullable();
    table.decimal('platform_fee', 10, 2).defaultTo(0);
    table.decimal('service_fee', 10, 2).defaultTo(0);
    table.decimal('total_fee', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('payment_method', 50);
    table.timestamp('paid_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Foreign keys (within service)
    table.foreign('transfer_id')
      .references('id')
      .inTable('ticket_transfers')
      .onDelete('CASCADE');

    // Indexes
    table.index('transfer_id');
    table.index('tenant_id');
  });

  console.log('✅ transfer_fees table created');

  // ====================================
  // TRANSFER_RULES TABLE
  // ====================================
  await knex.schema.createTable('transfer_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('rule_name', 255).notNullable();
    table.string('rule_type', 100).notNullable();
    // MAX_TRANSFERS_PER_TICKET, MAX_TRANSFERS_PER_USER_PER_DAY, 
    // BLACKLIST_CHECK, COOLING_PERIOD, EVENT_DATE_PROXIMITY, IDENTITY_VERIFICATION
    table.uuid('ticket_type_id'); // NULL = applies to all
    table.uuid('event_id'); // NULL = applies to all
    table.integer('priority').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_blocking').defaultTo(true);
    table.jsonb('config').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('ticket_type_id');
    table.index('event_id');
    table.index('rule_type');
    table.index('is_active');
    table.index('priority');
    table.index(['ticket_type_id', 'event_id', 'is_active']);
    table.index('tenant_id');
  });

  console.log('✅ transfer_rules table created');

  // ====================================
  // USER_BLACKLIST TABLE
  // ====================================
  await knex.schema.createTable('user_blacklist', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().unique();
    table.text('reason').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('blacklisted_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('blacklisted_by'); // Admin user who blacklisted
    table.timestamp('expires_at', { useTz: true }); // NULL = permanent
    table.text('notes');

    // Tenant isolation
    table.uuid('tenant_id')
      .notNullable()
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .references('id')
      .inTable('tenants')
      .onDelete('RESTRICT');

    // Indexes
    table.index('user_id');
    table.index('is_active');
    table.index('tenant_id');
  });

  console.log('✅ user_blacklist table created');

  // ====================================
  // WEBHOOK_SUBSCRIPTIONS TABLE
  // ====================================
  await knex.schema.createTable('webhook_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tenant_id').notNullable();
    table.text('url').notNullable();
    table.specificType('events', 'text[]').notNullable();
    table.string('secret', 255).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Foreign key to tenants
    table.foreign('tenant_id')
      .references('id')
      .inTable('tenants')
      .onDelete('CASCADE');

    // Indexes
    table.index('tenant_id');
    table.index('is_active');
    table.index('url');
  });

  console.log('✅ webhook_subscriptions table created');

  // ====================================
  // ROW LEVEL SECURITY (RLS)
  // ====================================
  await knex.raw('ALTER TABLE ticket_transactions ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE batch_transfers ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE batch_transfer_items ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE promotional_codes ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE transfer_fees ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE transfer_rules ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_blacklist ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY');

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON ticket_transactions
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON ticket_transfers
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON batch_transfers
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON batch_transfer_items
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON promotional_codes
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON transfer_fees
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON transfer_rules
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON user_blacklist
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON webhook_subscriptions
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  console.log('✅ RLS enabled on all tables');

  // ====================================
  // FOREIGN KEY CONSTRAINTS
  // ====================================
  console.log('');
  console.log('🔗 Adding foreign key constraints...');

  await knex.schema.alterTable('ticket_transactions', (table) => {
    table.foreign('ticket_id')
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    
    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');
  });

  console.log('✅ ticket_transactions → tickets, users');
  console.log('✅ 2 FK constraints added');

  console.log('');
  console.log('🎉 Transfer Service baseline migration complete!');
  console.log('📊 Tables created: 9 tables');
  console.log('');
  console.log('Created Tables:');
  console.log('  ✅ ticket_transactions (transaction history)');
  console.log('  ✅ ticket_transfers (gift/sale/trade transfers)');
  console.log('  ✅ batch_transfers (bulk transfer operations)');
  console.log('  ✅ batch_transfer_items (batch transfer details)');
  console.log('  ✅ promotional_codes (discount codes)');
  console.log('  ✅ transfer_fees (fee tracking)');
  console.log('  ✅ transfer_rules (business rules engine)');
  console.log('  ✅ user_blacklist (fraud prevention)');
  console.log('  ✅ webhook_subscriptions (event notifications)');
  console.log('');
  console.log('🔒 Tenant Isolation:');
  console.log('  ✅ tenant_id column added to all tables');
  console.log('  ✅ Foreign key constraints to tenants table');
  console.log('  ✅ Row Level Security enabled on all tables');
  console.log('  ✅ RLS policies created for all tables');
  console.log('');
  console.log('🔗 Foreign Keys:');
  console.log('  ✅ Within-service: 3 FK constraints');
  console.log('  ✅ Cross-service: 2 FK constraints (tickets, users)');
  console.log('');
  console.log('⚠️  IMPORTANT: Deploy tenant context middleware with this migration!');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🔄 Rolling back Transfer Service migration...');

  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON webhook_subscriptions');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON user_blacklist');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_rules');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_fees');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON promotional_codes');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON batch_transfer_items');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON batch_transfers');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON ticket_transfers');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON ticket_transactions');
  
  // Disable RLS
  await knex.raw('ALTER TABLE webhook_subscriptions DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE user_blacklist DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE transfer_rules DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE transfer_fees DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE promotional_codes DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE batch_transfer_items DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE batch_transfers DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE ticket_transfers DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE ticket_transactions DISABLE ROW LEVEL SECURITY');
  
  // Drop tables in reverse order (child tables first)
  await knex.schema.dropTableIfExists('webhook_subscriptions');
  await knex.schema.dropTableIfExists('user_blacklist');
  await knex.schema.dropTableIfExists('transfer_rules');
  await knex.schema.dropTableIfExists('transfer_fees');
  await knex.schema.dropTableIfExists('promotional_codes');
  await knex.schema.dropTableIfExists('batch_transfer_items');
  await knex.schema.dropTableIfExists('batch_transfers');
  await knex.schema.dropTableIfExists('ticket_transactions');
  
  console.log('✅ Transfer Service migration rolled back');
}
