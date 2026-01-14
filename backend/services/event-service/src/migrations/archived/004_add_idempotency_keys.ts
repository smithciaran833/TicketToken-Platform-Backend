import { Knex } from 'knex';

/**
 * Migration: Add idempotency_keys table
 * 
 * CRITICAL FIX for audit findings (07-idempotency.md):
 * - RL3: Key validated (format/uniqueness)
 * - RL4: Key storage
 * - DB7: Idempotency key table
 * 
 * This table stores idempotency keys to prevent duplicate processing
 * of retried requests.
 */
export async function up(knex: Knex): Promise<void> {
  // Create idempotency_keys table
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable().index();
    
    // The idempotency key from the request header
    table.string('idempotency_key', 255).notNullable();
    
    // HTTP method and path for context
    table.string('method', 10).notNullable();
    table.string('path', 512).notNullable();
    
    // Request fingerprint (hash of body for additional validation)
    table.string('request_hash', 64);
    
    // Cached response
    table.integer('response_status_code').notNullable();
    table.jsonb('response_body');
    table.jsonb('response_headers');
    
    // Processing state
    table.enum('state', ['processing', 'completed', 'failed']).notNullable().defaultTo('processing');
    
    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('expires_at').notNullable();
    
    // User context
    table.uuid('user_id');
    
    // Unique constraint per tenant + key
    table.unique(['tenant_id', 'idempotency_key']);
  });

  // Create index for cleanup job (expired keys)
  await knex.schema.raw(`
    CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys (expires_at)
    WHERE state = 'completed';
  `);

  // Create index for concurrent key lookup
  await knex.schema.raw(`
    CREATE INDEX idx_idempotency_keys_lookup ON idempotency_keys (tenant_id, idempotency_key, state);
  `);

  // Add comment for documentation
  await knex.raw(`
    COMMENT ON TABLE idempotency_keys IS 
    'Stores idempotency keys to prevent duplicate processing of retried requests. Keys expire after 24 hours by default.';
  `);

  console.log('✓ Created idempotency_keys table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('idempotency_keys');
  console.log('✓ Dropped idempotency_keys table');
}
