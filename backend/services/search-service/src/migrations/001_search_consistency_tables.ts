import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    // Track index versions for consistency
    .createTable('index_versions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('entity_type', 50).notNullable();
      table.string('entity_id', 255).notNullable();
      table.bigInteger('version').notNullable().defaultTo(1);
      table.timestamp('indexed_at').nullable();
      table.string('index_status', 50).defaultTo('PENDING');
      table.integer('retry_count').defaultTo(0);
      table.text('last_error').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['entity_type', 'entity_id']);
      table.index(['index_status', 'created_at'], 'idx_index_versions_status');
      table.index(['entity_type', 'entity_id'], 'idx_index_versions_entity');
    })
    // Track pending index operations
    .createTable('index_queue', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('entity_type', 50).notNullable();
      table.string('entity_id', 255).notNullable();
      table.string('operation', 20).notNullable(); // CREATE, UPDATE, DELETE
      table.jsonb('payload').notNullable();
      table.integer('priority').defaultTo(5);
      table.bigInteger('version').nullable();
      table.string('idempotency_key', 255).unique();
      table.timestamp('processed_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('processed_at', 'idx_index_queue_unprocessed');
      table.index(['priority', 'created_at'], 'idx_index_queue_priority');
    })
    // Client read tracking for consistency
    .createTable('read_consistency_tokens', function(table) {
      table.string('token', 255).primary();
      table.string('client_id', 255).notNullable();
      table.jsonb('required_versions').notNullable(); // { "events": { "id1": 2, "id2": 3 }, "venues": { "id3": 1 } }
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('expires_at', 'idx_read_consistency_expires');
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .dropTableIfExists('read_consistency_tokens')
    .dropTableIfExists('index_queue')
    .dropTableIfExists('index_versions');
}
