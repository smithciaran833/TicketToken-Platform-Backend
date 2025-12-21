import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. COLLECTIONS TABLE
  await knex.schema.createTable('collections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000000');
    table.string('name', 255).notNullable();
    table.string('symbol', 50).notNullable();
    table.string('contract_address', 255).notNullable();
    table.string('blockchain', 50).notNullable();
    table.integer('max_supply');
    table.integer('current_supply').defaultTo(0);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);

    // Indexes
    table.index('contract_address');
    table.index('blockchain');
    table.index('tenant_id');
    table.index(['tenant_id', 'contract_address']);
    table.unique('contract_address');
  });

  // 2. NFT_MINTS TABLE
  await knex.schema.createTable('nft_mints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000000');
    table.uuid('ticket_id').notNullable();
    table.uuid('nft_id');
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, minting, completed, failed
    table.string('transaction_hash', 255);
    table.string('blockchain', 50).notNullable();
    table.text('error');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');

    // Indexes
    table.index('ticket_id');
    table.index('nft_id');
    table.index('status');
    table.index('transaction_hash');
    table.index('created_at');
    table.index('tenant_id');
    table.index(['tenant_id', 'ticket_id']);
    table.unique(['ticket_id', 'tenant_id'], { indexName: 'nft_mints_ticket_id_tenant_id_unique' });
  });

  // 3. NFTS TABLE
  await knex.schema.createTable('nfts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000000');
    table.string('token_id', 255).notNullable();
    table.string('contract_address', 255).notNullable();
    table.string('owner_address', 255).notNullable();
    table.text('metadata_uri');
    table.jsonb('metadata').defaultTo('{}');
    table.string('blockchain', 50).notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index(['token_id', 'contract_address']);
    table.index('owner_address');
    table.index('blockchain');
    table.index('tenant_id');
    table.index(['tenant_id', 'owner_address']);
    table.unique(['token_id', 'contract_address']);
  });

  // 4. TICKET_MINTS TABLE
  await knex.schema.createTable('ticket_mints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000000');
    table.uuid('ticket_id').notNullable();
    table.uuid('venue_id').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('transaction_signature', 255);
    table.integer('mint_duration');
    table.timestamps(true, true);

    // Indexes
    table.index('ticket_id');
    table.index('venue_id');
    table.index('status');
    table.index('tenant_id');
    table.index(['tenant_id', 'ticket_id']);
    table.index(['venue_id', 'status']);
  });

  // 5. RECONCILIATION_REPORTS TABLE
  await knex.schema.createTable('minting_reconciliation_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000000');
    table.uuid('venue_id').notNullable();
    table.timestamp('report_date', { useTz: true }).notNullable();
    table.integer('total_checked').defaultTo(0);
    table.integer('confirmed').defaultTo(0);
    table.integer('not_found').defaultTo(0);
    table.integer('pending').defaultTo(0);
    table.integer('errors').defaultTo(0);
    table.integer('discrepancy_count').defaultTo(0);
    table.decimal('discrepancy_rate', 5, 2).defaultTo(0);
    table.jsonb('report_data');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    // Indexes
    table.index('venue_id');
    table.index('report_date');
    table.index('tenant_id');
    table.index(['tenant_id', 'venue_id']);
    table.index(['venue_id', 'report_date']);
  });

  // Enable Row Level Security
  await knex.raw('ALTER TABLE collections ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE nft_mints ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE nfts ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE ticket_mints ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE minting_reconciliation_reports ENABLE ROW LEVEL SECURITY');

  // Create RLS policies
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON collections USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON nft_mints USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON nfts USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON ticket_mints USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON minting_reconciliation_reports USING (tenant_id::text = current_setting('app.current_tenant', true))`);
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies first
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON minting_reconciliation_reports');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON ticket_mints');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON nfts');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON nft_mints');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON collections');

  // Disable RLS
  await knex.raw('ALTER TABLE minting_reconciliation_reports DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE ticket_mints DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE nfts DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE nft_mints DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE collections DISABLE ROW LEVEL SECURITY');

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('minting_reconciliation_reports');
  await knex.schema.dropTableIfExists('ticket_mints');
  await knex.schema.dropTableIfExists('nfts');
  await knex.schema.dropTableIfExists('nft_mints');
  await knex.schema.dropTableIfExists('collections');
}
