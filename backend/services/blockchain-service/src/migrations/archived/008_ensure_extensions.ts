/**
 * Migration: Ensure Required PostgreSQL Extensions
 * 
 * AUDIT FIX #64: Add uuid-ossp extension check
 * 
 * Changes:
 * - Ensures uuid-ossp extension is installed for UUID generation
 * - Ensures pgcrypto extension is installed for gen_random_uuid()
 * - Makes migration idempotent with IF NOT EXISTS
 * - Run this early in migration sequence before any UUID operations
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // =========================================================================
  // UUID-OSSP Extension
  // Required for uuid_generate_v4() function
  // =========================================================================
  
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    WITH SCHEMA public;
  `);

  // =========================================================================
  // PGCRYPTO Extension
  // Required for gen_random_uuid() function (PostgreSQL 13+)
  // Also provides cryptographic functions for secure operations
  // =========================================================================
  
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    WITH SCHEMA public;
  `);

  // =========================================================================
  // BTREE_GIN Extension (optional but useful)
  // Enables GIN indexes on standard data types for faster queries
  // =========================================================================
  
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS "btree_gin"
    WITH SCHEMA public;
  `).catch(() => {
    // btree_gin may not be available in all installations
  });

  // =========================================================================
  // Verify Extensions are Available
  // =========================================================================
  
  // Test uuid_generate_v4()
  const uuidTest = await knex.raw(`
    SELECT uuid_generate_v4() as test_uuid
  `);
  
  if (!uuidTest.rows[0]?.test_uuid) {
    throw new Error('uuid-ossp extension not properly installed: uuid_generate_v4() failed');
  }

  // Test gen_random_uuid()
  const randomUuidTest = await knex.raw(`
    SELECT gen_random_uuid() as test_uuid
  `);
  
  if (!randomUuidTest.rows[0]?.test_uuid) {
    throw new Error('pgcrypto extension not properly installed: gen_random_uuid() failed');
  }

  // =========================================================================
  // Add Comments
  // =========================================================================
  
  await knex.raw(`
    COMMENT ON EXTENSION "uuid-ossp" IS 'UUID generation functions including uuid_generate_v4()';
  `).catch(() => { /* Comment on extension requires superuser in some configs */ });

  await knex.raw(`
    COMMENT ON EXTENSION "pgcrypto" IS 'Cryptographic functions including gen_random_uuid()';
  `).catch(() => { /* Comment on extension requires superuser in some configs */ });
}

export async function down(knex: Knex): Promise<void> {
  // NOTE: We don't drop extensions in down() because:
  // 1. Other tables/functions may depend on them
  // 2. They are generally always needed
  // 3. Dropping would cause data loss for UUID columns
  
  // If you really need to drop (not recommended):
  // await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE');
  // await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto" CASCADE');
  
  // Instead, just log that we're not removing extensions
  // eslint-disable-next-line no-console
  console.log('Note: Extensions uuid-ossp and pgcrypto are not removed in rollback to prevent data loss');
}
