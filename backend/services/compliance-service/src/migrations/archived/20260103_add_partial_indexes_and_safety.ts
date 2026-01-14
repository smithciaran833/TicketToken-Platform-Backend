/**
 * Migration: Add Partial Indexes and Migration Safety
 * 
 * AUDIT FIXES:
 * - DB-M1: Add partial unique indexes for soft deletes
 * - DB-M2: Composite unique constraints with tenant
 * - MIG-M3: lock_timeout to prevent blocking
 */
import { Knex } from 'knex';

const LOCK_TIMEOUT = '10s';
const STATEMENT_TIMEOUT = '60s';

export async function up(knex: Knex): Promise<void> {
  // MIG-M3: Set lock timeout to prevent blocking
  await knex.raw(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
  await knex.raw(`SET statement_timeout = '${STATEMENT_TIMEOUT}'`);
  
  // ==========================================================================
  // DB-M1: Partial Unique Indexes for Soft Deletes
  // ==========================================================================
  
  // Unique venue_id per tenant for active records only
  await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_flags_venue_tenant_active
    ON risk_flags (venue_id, tenant_id)
    WHERE status = 'open' AND deleted_at IS NULL
  `);
  
  // Unique GDPR request per user per type per tenant (active only)
  await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_gdpr_requests_user_type_active
    ON gdpr_requests (user_id, request_type, tenant_id)
    WHERE status IN ('pending', 'in_progress') AND deleted_at IS NULL
  `);
  
  // Unique active idempotency key per tenant
  await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_keys_active
    ON idempotency_keys (key, tenant_id)
    WHERE deleted_at IS NULL AND expires_at > NOW()
  `);
  
  // ==========================================================================
  // DB-M2: Composite Unique Constraints with Tenant
  // ==========================================================================
  
  // Unique tax form per venue per year per tenant
  await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_1099_venue_year_tenant
    ON tax_1099_forms (venue_id, tax_year, tenant_id)
    WHERE deleted_at IS NULL
  `);
  
  // Unique webhook event per external ID per tenant
  await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_external_tenant
    ON webhook_logs (external_event_id, tenant_id)
    WHERE external_event_id IS NOT NULL
  `);
  
  // ==========================================================================
  // Performance Indexes
  // ==========================================================================
  
  // Index for finding pending GDPR requests
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gdpr_requests_pending_tenant
    ON gdpr_requests (tenant_id, status, created_at)
    WHERE status IN ('pending', 'in_progress')
  `);
  
  // Index for risk assessment by venue
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_flags_open_tenant
    ON risk_flags (tenant_id, venue_id, severity)
    WHERE status = 'open'
  `);
  
  // Index for webhook deduplication lookup
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_logs_recent
    ON webhook_logs (external_event_id, created_at DESC)
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `);
  
  // ==========================================================================
  // Migration Safety Columns
  // ==========================================================================
  
  // Add soft delete columns if missing
  const tablesNeedingSoftDelete = [
    'risk_flags',
    'gdpr_requests',
    'tax_1099_forms',
    'idempotency_keys',
    'webhook_logs'
  ];
  
  for (const tableName of tablesNeedingSoftDelete) {
    const hasDeletedAt = await knex.schema.hasColumn(tableName, 'deleted_at');
    if (!hasDeletedAt) {
      await knex.schema.alterTable(tableName, (table) => {
        table.timestamp('deleted_at').nullable();
      });
    }
    
    const hasDeletedBy = await knex.schema.hasColumn(tableName, 'deleted_by');
    if (!hasDeletedBy) {
      await knex.schema.alterTable(tableName, (table) => {
        table.uuid('deleted_by').nullable();
      });
    }
  }
  
  // Reset timeouts
  await knex.raw(`RESET lock_timeout`);
  await knex.raw(`RESET statement_timeout`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
  
  // Drop partial indexes
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_risk_flags_venue_tenant_active`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_gdpr_requests_user_type_active`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_idempotency_keys_active`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_tax_1099_venue_year_tenant`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_logs_external_tenant`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_gdpr_requests_pending_tenant`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_risk_flags_open_tenant`);
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_logs_recent`);
  
  await knex.raw(`RESET lock_timeout`);
}
