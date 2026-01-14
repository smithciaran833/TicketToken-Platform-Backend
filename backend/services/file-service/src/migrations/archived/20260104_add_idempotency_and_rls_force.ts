/**
 * Migration: Add Idempotency Keys Table and FORCE RLS
 * 
 * AUDIT FIXES:
 * - IDP-2: No idempotency_keys table → Create storage for idempotency keys
 * - MT-6: No FORCE ROW LEVEL SECURITY → Prevent superuser RLS bypass
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // AUDIT FIX IDP-2: Create idempotency_keys table
  // ==========================================================================
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('idempotency_key', 128).notNullable();
    table.string('request_hash', 64); // SHA-256 hash of request body
    table.string('endpoint', 512).notNullable();
    table.string('method', 10).notNullable();
    table.enum('status', ['processing', 'completed', 'failed']).defaultTo('processing');
    table.jsonb('response').nullable();
    table.uuid('file_id').nullable();
    table.string('file_hash', 64).nullable(); // SHA-256 hash of file content
    table.string('recovery_point', 64).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    
    // Unique constraint per tenant
    table.unique(['tenant_id', 'idempotency_key']);
    
    // Index for cleanup
    table.index(['expires_at']);
    
    // Index for file hash lookups (deduplication)
    table.index(['tenant_id', 'file_hash']);
    
    // Foreign key to files table (optional - file may not exist yet)
    // Note: Not enforced to allow for in-progress uploads
    table.index(['file_id']);
  });

  // ==========================================================================
  // AUDIT FIX MT-6: Add FORCE ROW LEVEL SECURITY
  // Prevents superusers from bypassing RLS policies
  // ==========================================================================
  
  // Enable FORCE RLS on files table
  await knex.raw(`
    ALTER TABLE files FORCE ROW LEVEL SECURITY;
  `);

  // Enable FORCE RLS on idempotency_keys table
  await knex.raw(`
    ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
  `);
  await knex.raw(`
    ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
  `);

  // Create RLS policy for idempotency_keys
  await knex.raw(`
    CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  `);

  // ==========================================================================
  // Create function for automatic updated_at
  // ==========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_idempotency_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER idempotency_keys_updated_at
    BEFORE UPDATE ON idempotency_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_idempotency_updated_at();
  `);

  // ==========================================================================
  // Create function for automatic cleanup of expired keys
  // ==========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
    RETURNS void AS $$
    BEGIN
      DELETE FROM idempotency_keys WHERE expires_at < NOW();
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Optional: Create a scheduled job using pg_cron if available
  // This requires pg_cron extension to be installed
  // await knex.raw(`
  //   SELECT cron.schedule(
  //     'cleanup_idempotency_keys',
  //     '0 */6 * * *',
  //     'SELECT cleanup_expired_idempotency_keys()'
  //   );
  // `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove RLS from files table (revert to default)
  await knex.raw(`
    ALTER TABLE files NO FORCE ROW LEVEL SECURITY;
  `);

  // Drop RLS policy
  await knex.raw(`
    DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON idempotency_keys;
  `);

  // Drop trigger and function
  await knex.raw(`
    DROP TRIGGER IF EXISTS idempotency_keys_updated_at ON idempotency_keys;
  `);
  await knex.raw(`
    DROP FUNCTION IF EXISTS update_idempotency_updated_at();
  `);
  await knex.raw(`
    DROP FUNCTION IF EXISTS cleanup_expired_idempotency_keys();
  `);

  // Drop table
  await knex.schema.dropTableIfExists('idempotency_keys');
}
