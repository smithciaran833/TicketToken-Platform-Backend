/**
 * Tenant Context Middleware for Notification Service
 * 
 * AUDIT FIXES:
 * - MT-1: Default tenant bypass → Reject requests without tenant_id
 * - MT-2: Default tenant fallback → No fallback, strict enforcement
 * - MT-H3: Tenant context lost in async → AsyncLocalStorage
 * 
 * Features:
 * - Strict tenant ID enforcement (no default fallback)
 * - UUID format validation
 * - AsyncLocalStorage for context propagation
 * - PostgreSQL RLS session variable setting
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AsyncLocalStorage } from 'async_hooks';
import { db } from '../config/database';
import { logger } from '../config/logger';

// =============================================================================
// TYPES
// =============================================================================

interface TenantContextData {
  tenantId: string;
  userId?: string;
  userRole?: string;
  requestId?: string;
}

// AsyncLocalStorage for tenant context propagation
const tenantStorage = new AsyncLocalStorage<TenantContextData>();

// =============================================================================
// CONFIGURATION
// =============================================================================

// Routes that don't require tenant context
const EXEMPT_ROUTES = new Set([
  '/health',
  '/health/ready',
  '/health/live',
  '/health/db',
  '/metrics',
  '/api/v1/internal',
  '/api/v1/webhooks'  // Webhooks use provider auth, not tenant auth
]);

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// FASTIFY REQUEST EXTENSION
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    tenantContext?: TenantContextData;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * AUDIT FIX MT-1, MT-2: Extract tenant ID from request - NO DEFAULT FALLBACK
 */
function extractTenantId(request: FastifyRequest): string | undefined {
  // 1. From JWT claims (preferred)
  const user = (request as any).user;
  if (user?.tenantId || user?.tenant_id) {
    return user.tenantId || user.tenant_id;
  }
  
  // 2. From header (for S2S calls)
  const headerTenant = request.headers['x-tenant-id'];
  if (typeof headerTenant === 'string' && headerTenant.length > 0) {
    return headerTenant;
  }
  
  // 3. From query parameter (for specific use cases)
  const queryTenant = (request.query as any)?.tenantId;
  if (typeof queryTenant === 'string' && queryTenant.length > 0) {
    return queryTenant;
  }
  
  // AUDIT FIX MT-1, MT-2: NO DEFAULT FALLBACK - return undefined
  return undefined;
}

/**
 * AUDIT FIX MT-2: Validate tenant ID format
 */
function validateTenantIdFormat(tenantId: string): boolean {
  return UUID_REGEX.test(tenantId);
}

/**
 * Set PostgreSQL session variable for RLS policies
 */
async function setPostgresRlsContext(tenantId: string): Promise<void> {
  try {
    await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  } catch (error) {
    logger.error('Failed to set PostgreSQL tenant context', {
      error: (error as Error).message,
      tenantId
    });
    throw error;
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * AUDIT FIX MT-1, MT-2: Main tenant context middleware
 * CRITICAL: No default tenant fallback - requests without valid tenant are rejected
 */
export async function setTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check if route is exempt
  const path = request.url.split('?')[0];
  
  for (const exemptRoute of EXEMPT_ROUTES) {
    if (path === exemptRoute || path.startsWith(exemptRoute + '/')) {
      return;
    }
  }
  
  // Extract tenant ID
  const tenantId = extractTenantId(request);
  
  // AUDIT FIX MT-1, MT-2: Reject requests without tenant ID (NO DEFAULT)
  if (!tenantId) {
    logger.warn('Request rejected: Missing tenant ID', {
      path,
      method: request.method,
      userId: (request as any).user?.id,
      ip: request.ip
    });
    
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Tenant ID is required. Include tenant_id in JWT claims or x-tenant-id header.',
      code: 'MISSING_TENANT_ID'
    });
  }
  
  // AUDIT FIX MT-2: Validate UUID format
  if (!validateTenantIdFormat(tenantId)) {
    logger.warn('Request rejected: Invalid tenant ID format', {
      tenantId,
      path,
      method: request.method
    });
    
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid tenant ID format. Must be a valid UUID v4.',
      code: 'INVALID_TENANT_ID'
    });
  }
  
  // Create tenant context
  const context: TenantContextData = {
    tenantId,
    userId: (request as any).user?.id,
    userRole: (request as any).user?.role,
    requestId: request.id as string
  };
  
  // Attach to request
  request.tenantId = tenantId;
  request.tenantContext = context;
  
  // Set PostgreSQL RLS context
  try {
    await setPostgresRlsContext(tenantId);
  } catch (error) {
    logger.error('Failed to set RLS context', { error, tenantId });
    // Don't fail the request - RLS will block unauthorized access
  }
  
  logger.debug('Tenant context set', { tenantId, path });
}

// =============================================================================
// ASYNC LOCAL STORAGE UTILITIES
// =============================================================================

/**
 * AUDIT FIX MT-H3: Run function with tenant context in AsyncLocalStorage
 */
export function runWithTenantContext<T>(
  context: TenantContextData,
  fn: () => T
): T {
  return tenantStorage.run(context, fn);
}

/**
 * AUDIT FIX MT-H3: Get current tenant context from AsyncLocalStorage
 */
export function getCurrentTenantContext(): TenantContextData | undefined {
  return tenantStorage.getStore();
}

/**
 * AUDIT FIX MT-H3: Get current tenant ID from AsyncLocalStorage
 */
export function getCurrentTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

/**
 * Generate tenant-scoped cache key
 */
export function getTenantCacheKey(key: string, tenantId?: string): string {
  const tid = tenantId || getCurrentTenantId();
  if (!tid) {
    throw new Error('No tenant context available for cache key generation');
  }
  return `tenant:${tid}:${key}`;
}

/**
 * Require tenant context middleware - use for routes that MUST have tenant
 */
export async function requireTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.tenantId) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Tenant context required for this endpoint',
      code: 'TENANT_REQUIRED'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  setTenantContext,
  requireTenantContext,
  runWithTenantContext,
  getCurrentTenantContext,
  getCurrentTenantId,
  getTenantCacheKey
};
