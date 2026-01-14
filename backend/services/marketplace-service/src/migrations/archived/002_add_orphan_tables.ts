import { Knex } from 'knex';

/**
 * Phase 6: Add Orphan Tables for Marketplace Service
 * 
 * Tables added:
 * - listing_audit_log: Audit log for listing status changes
 * - anonymization_log: Track user data anonymization for GDPR/privacy
 * - user_activity_log: User activity for retention policies
 * 
 * Note: These tables don't require tenant_id as they are cross-tenant
 * audit/compliance tables for data lifecycle management.
 */

export async function up(knex: Knex): Promise<void> {
  // Set timeouts to prevent blocking
  await knex.raw("SET lock_timeout = '10s'");
  await knex.raw("SET statement_timeout = '60s'");

  // ============================================================================
  // TABLE: listing_audit_log
  // ============================================================================

  await knex.schema.createTable('listing_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('listing_id').notNullable();
    table.string('action', 50).notNullable();
    table.string('old_status', 30);
    table.string('new_status', 30);
    table.text('reason');
    table.timestamp('event_start_time');
    table.jsonb('metadata');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_listing_audit_log_listing ON listing_audit_log(listing_id)`);
  await knex.raw(`CREATE INDEX idx_listing_audit_log_action ON listing_audit_log(action, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_listing_audit_log_created ON listing_audit_log(created_at DESC)`);

  // ============================================================================
  // TABLE: anonymization_log
  // ============================================================================

  await knex.schema.createTable('anonymization_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('anonymized_id', 50).notNullable();
    table.text('tables_affected').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_anonymization_log_user ON anonymization_log(user_id)`);
  await knex.raw(`CREATE INDEX idx_anonymization_log_anonymized ON anonymization_log(anonymized_id)`);
  await knex.raw(`CREATE INDEX idx_anonymization_log_created ON anonymization_log(created_at DESC)`);

  // ============================================================================
  // TABLE: user_activity_log
  // ============================================================================

  await knex.schema.createTable('user_activity_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id');
    table.string('activity_type', 50).notNullable();
    table.jsonb('metadata');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`CREATE INDEX idx_user_activity_log_user ON user_activity_log(user_id)`);
  await knex.raw(`CREATE INDEX idx_user_activity_log_type ON user_activity_log(activity_type, created_at DESC)`);
  await knex.raw(`CREATE INDEX idx_user_activity_log_created ON user_activity_log(created_at DESC)`);

  // Note: These are cross-tenant tables used for GDPR compliance and data lifecycle.
  // RLS is NOT enabled as they need to be accessed across tenant boundaries for
  // regulatory compliance operations (anonymization, retention cleanup, etc.)
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables
  await knex.schema.dropTableIfExists('user_activity_log');
  await knex.schema.dropTableIfExists('anonymization_log');
  await knex.schema.dropTableIfExists('listing_audit_log');
}
