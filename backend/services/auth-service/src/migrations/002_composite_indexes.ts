/**
 * Migration: Add Composite Indexes for Multi-Tenant Query Performance
 *
 * AUDIT FINDING: Multi-tenant queries were missing composite indexes that
 * combine tenant_id with commonly queried columns.
 *
 * These indexes optimize the following query patterns:
 *
 * 1. users (tenant_id, email) - Login by email within tenant
 *    Query: SELECT * FROM users WHERE tenant_id = $1 AND email = $2
 *    Before: Full table scan or email-only index
 *    After: Direct B-tree lookup on composite index
 *
 * 2. users (tenant_id, status) - List active users by tenant
 *    Query: SELECT * FROM users WHERE tenant_id = $1 AND status = $2
 *    Before: Filter after tenant lookup
 *    After: Direct index scan
 *
 * 3. users (tenant_id, role) - List users by role within tenant
 *    Query: SELECT * FROM users WHERE tenant_id = $1 AND role = $2
 *    Before: Full scan with filter
 *    After: Index-optimized lookup
 *
 * 4. user_sessions (tenant_id, user_id, ended_at) - Active sessions
 *    Query: SELECT * FROM user_sessions WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL
 *    Before: Sequential scan
 *    After: Partial index for active sessions only
 *
 * 5. user_venue_roles (tenant_id, user_id) - User venue roles lookup
 *    Query: SELECT * FROM user_venue_roles WHERE tenant_id = $1 AND user_id = $2
 *    Before: No composite index
 *    After: Efficient lookup by tenant and user
 *
 * 6. audit_logs (tenant_id, user_id, created_at DESC) - User audit history
 *    Query: SELECT * FROM audit_logs WHERE tenant_id = $1 AND user_id = $2 ORDER BY created_at DESC
 *    Before: Sort after filter
 *    After: Index-ordered scan
 *
 * Impact: Expected 2-10x improvement for tenant-scoped queries at scale.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Index 1: users (tenant_id, email) - Login optimization
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_email
    ON users (tenant_id, email)
    WHERE deleted_at IS NULL
  `);

  // Index 2: users (tenant_id, status) - Active user listing
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_status
    ON users (tenant_id, status)
    WHERE deleted_at IS NULL
  `);

  // Index 3: users (tenant_id, role) - Role-based listing
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_role
    ON users (tenant_id, role)
    WHERE deleted_at IS NULL
  `);

  // Index 4: user_sessions (tenant_id, user_id) - Active sessions (partial index)
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_tenant_user_active
    ON user_sessions (tenant_id, user_id)
    WHERE ended_at IS NULL
  `);

  // Index 5: user_venue_roles (tenant_id, user_id) - Role lookup
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_venue_roles_tenant_user
    ON user_venue_roles (tenant_id, user_id)
    WHERE is_active = true
  `);

  // Index 6: audit_logs (tenant_id, user_id, created_at DESC) - Audit history
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_user_created
    ON audit_logs (tenant_id, user_id, created_at DESC)
  `);

  // Index 7: oauth_connections (tenant_id, user_id) - OAuth provider lookup
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oauth_connections_tenant_user
    ON oauth_connections (tenant_id, user_id)
  `);

  // Index 8: invalidated_tokens (tenant_id, expires_at) - Token cleanup
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invalidated_tokens_tenant_expires
    ON invalidated_tokens (tenant_id, expires_at)
  `);

  console.log('Composite indexes created for multi-tenant query optimization');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_users_tenant_email');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_users_tenant_status');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_users_tenant_role');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_user_sessions_tenant_user_active');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_user_venue_roles_tenant_user');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_audit_logs_tenant_user_created');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_oauth_connections_tenant_user');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_invalidated_tokens_tenant_expires');
}
