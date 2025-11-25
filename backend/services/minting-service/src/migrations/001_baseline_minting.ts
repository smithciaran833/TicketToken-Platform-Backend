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
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('nfts');
  await knex.schema.dropTableIfExists('nft_mints');
  await knex.schema.dropTableIfExists('collections');
}
