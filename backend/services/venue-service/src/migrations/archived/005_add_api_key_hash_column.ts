import { Knex } from 'knex';
import { createHash } from 'crypto';

/**
 * Migration: Add key_hash column to api_keys table for secure storage
 * Security Fix: SEC-DB6 - API keys should be hashed with SHA-256
 * 
 * This migration:
 * 1. Adds a key_hash column
 * 2. Migrates existing plaintext keys to hashed storage
 * 3. Creates index on key_hash for fast lookups
 * 
 * Note: The plaintext 'key' column is kept temporarily for backward compatibility
 * A follow-up migration should remove it after all clients are updated
 */
export async function up(knex: Knex): Promise<void> {
  // Add key_hash column
  await knex.schema.alterTable('api_keys', (table) => {
    table.string('key_hash', 64).nullable(); // SHA-256 produces 64 hex characters
  });

  // Migrate existing plaintext keys to hashed storage
  const existingKeys = await knex('api_keys').select('id', 'key');
  
  for (const keyRecord of existingKeys) {
    if (keyRecord.key) {
      const hashedKey = createHash('sha256').update(keyRecord.key).digest('hex');
      await knex('api_keys')
        .where('id', keyRecord.id)
        .update({ key_hash: hashedKey });
    }
  }

  // Create index on key_hash for fast lookups
  await knex.raw('CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE is_active = TRUE');

  // Add comment explaining the security fix
  await knex.raw(`
    COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of API key for secure storage (SEC-DB6 security fix)';
  `);

  console.log('✅ Migrated existing API keys to hashed storage');
  console.log('⚠️  Remember to update API key creation to store hashed keys');
  console.log('⚠️  The plaintext key column should be removed in a future migration');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_api_keys_key_hash');
  
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropColumn('key_hash');
  });
}
