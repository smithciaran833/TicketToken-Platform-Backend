/**
 * Shared Database Extensions Migration
 * 
 * This migration creates PostgreSQL extensions required by all services.
 * It should run FIRST before any service-specific migrations.
 * 
 * Extensions:
 * - uuid-ossp: UUID generation functions
 * - pgcrypto: Cryptographic functions
 * - pg_trgm: Trigram matching for fuzzy search
 */

import { Knex } from 'knex';

export const MIGRATION_NAME = '000_shared_extensions';
export const MIGRATION_VERSION = '1.0.0';

export async function up(knex: Knex): Promise<void> {
  console.log('[Shared Migration] Creating shared PostgreSQL extensions...');

  // UUID generation - required by all tables using UUID primary keys
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  
  // Cryptographic functions - used for hashing, encryption
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  
  // Trigram matching - used for fuzzy text search
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');

  console.log('[Shared Migration] Extensions created successfully');
}

export async function down(knex: Knex): Promise<void> {
  console.log('[Shared Migration] Removing shared PostgreSQL extensions...');
  
  // Note: We don't typically drop extensions as other schemas may depend on them
  // Only uncomment if you're absolutely sure no other schemas need these
  // await knex.raw('DROP EXTENSION IF EXISTS "pg_trgm"');
  // await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto"');
  // await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp"');

  console.log('[Shared Migration] Extensions removal skipped (other schemas may depend on them)');
}
