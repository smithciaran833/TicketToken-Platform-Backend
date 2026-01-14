/**
 * Shared Database Module
 * 
 * Centralized exports for database-related utilities, migrations,
 * and RLS context management.
 * 
 * Usage:
 * ```typescript
 * import { 
 *   setTenantContext, 
 *   createStandardTable, 
 *   enableTableRLS 
 * } from '@tickettoken/shared/database';
 * ```
 */

// RLS Context utilities for runtime tenant isolation
export {
  TENANT_CONTEXT_SETTING,
  USER_CONTEXT_SETTING,
  IP_CONTEXT_SETTING,
  USER_AGENT_CONTEXT_SETTING,
  DatabaseContext,
  setTenantContext,
  setTenantContextLocal,
  clearTenantContext,
  getTenantContext,
  setFullContext,
  setFullContextLocal,
  clearFullContext,
  withTenantContext,
  withContextTransaction,
  createTenantContextMiddleware,
  createContextCleanupMiddleware,
  requireTenantContext,
} from './utils/rls-context';

// Migration helper utilities
export {
  StandardTableOptions,
  createStandardTable,
  addUpdatedAtTrigger,
  removeUpdatedAtTrigger,
  addAuditTrigger,
  removeAuditTrigger,
  enableTableRLS,
  disableTableRLS,
  addForeignKey,
  addNullableForeignKey,
  createCompositeUniqueIndex,
  createSoftDeleteUniqueIndex,
  createJsonbIndex,
  createFullTextSearchIndex,
  dropTableSafely,
  tableExists,
  columnExists,
  addColumnIfNotExists,
  runSharedMigrations,
  revertSharedMigrations,
} from './utils/migration-helpers';

// Migration files for programmatic access
export * as sharedExtensions from './migrations/000_shared_extensions';
export * as sharedFunctions from './migrations/001_shared_functions';
export * as sharedRlsHelpers from './migrations/002_shared_rls_helpers';
