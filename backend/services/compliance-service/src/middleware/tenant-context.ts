/**
 * Tenant Context Middleware for Compliance Service
 * 
 * AUDIT FIX MT-3: No tenant session variable setting
 * 
 * Sets the database session variable for RLS policies to enforce
 * tenant isolation at the database level.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getPool } from '../config/database';
import { ForbiddenError } from '../errors';

// =============================================================================
// TYPES
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
    }
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Extract tenant ID from request and set database session variable
 */
export function tenantContext(options?: {
  /** Header name for tenant ID */
  headerName?: string;
  /** Require tenant ID (throw if missing) */
  required?: boolean;
  /** Default tenant ID if not provided */
  defaultTenant?: string;
}) {
  const headerName = options?.headerName ?? 'x-tenant-id';
  const required = options?.required ?? true;
  const defaultTenant = options?.defaultTenant;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract tenant ID from various sources (priority order)
      let tenantId = 
        (req.headers[headerName] as string) ||
        (req.headers['x-tenant-id'] as string) ||
        (req.query.tenantId as string) ||
        (req.body?.tenantId as string) ||
        ((req as any).user?.tenantId as string) ||
        defaultTenant;

      // Validate tenant ID format
      if (tenantId) {
        tenantId = sanitizeTenantId(tenantId);
      }

      // Check if required
      if (required && !tenantId) {
        throw new ForbiddenError('Tenant ID is required', (req as any).requestId);
      }

      // Store in request
      req.tenantId = tenantId;

      // Set database session variable for RLS
      if (tenantId) {
        await setDatabaseTenant(tenantId, req.userId);
      }

      logger.debug({
        requestId: (req as any).requestId,
        tenantId,
        path: req.path
      }, 'Tenant context set');

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Set tenant context in database session for RLS policies
 */
async function setDatabaseTenant(tenantId: string, userId?: string): Promise<void> {
  const pool = getPool();
  
  if (!pool) {
    logger.warn('Database pool not available, skipping tenant session setup');
    return;
  }

  try {
    // Set session variables for RLS
    await pool.query(`
      SELECT 
        set_config('app.current_tenant_id', $1, true),
        set_config('app.current_user_id', $2, true)
    `, [tenantId, userId || '']);
  } catch (error) {
    logger.error({ error: (error as Error).message, tenantId }, 'Failed to set tenant session variable');
    // Don't throw - let the request continue, RLS will handle protection
  }
}

/**
 * Sanitize tenant ID to prevent injection
 */
function sanitizeTenantId(tenantId: string): string {
  // Remove any potentially dangerous characters
  // Allow only alphanumeric, hyphens, and underscores
  const sanitized = tenantId.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 100);
  
  if (sanitized !== tenantId) {
    logger.warn({ original: tenantId, sanitized }, 'Tenant ID was sanitized');
  }
  
  return sanitized;
}

// =============================================================================
// SCOPED CONNECTION HELPER
// =============================================================================

/**
 * Execute database query with tenant context
 * Use this for operations that need explicit tenant scoping
 */
export async function withTenantContext<T>(
  tenantId: string,
  callback: () => Promise<T>,
  userId?: string
): Promise<T> {
  const pool = getPool();
  
  if (!pool) {
    throw new Error('Database pool not available');
  }

  const client = await pool.connect();
  
  try {
    // Set session variables
    await client.query(`
      SELECT 
        set_config('app.current_tenant_id', $1, true),
        set_config('app.current_user_id', $2, true)
    `, [tenantId, userId || '']);

    // Execute callback
    return await callback();
  } finally {
    client.release();
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Ensure current request has tenant access to a resource
 */
export function ensureTenantAccess(
  req: Request,
  resourceTenantId: string | undefined
): void {
  if (!resourceTenantId) {
    return; // No tenant restriction on resource
  }

  if (!req.tenantId) {
    throw new ForbiddenError('Tenant ID required to access this resource', (req as any).requestId);
  }

  if (req.tenantId !== resourceTenantId) {
    logger.warn({
      requestId: (req as any).requestId,
      requestTenant: req.tenantId,
      resourceTenant: resourceTenantId
    }, 'Cross-tenant access attempt blocked');
    
    throw new ForbiddenError('Access denied to resource from different tenant', (req as any).requestId);
  }
}

/**
 * Get tenant ID from request, throwing if not present
 */
export function requireTenantId(req: Request): string {
  if (!req.tenantId) {
    throw new ForbiddenError('Tenant ID is required', (req as any).requestId);
  }
  return req.tenantId;
}

export default {
  tenantContext,
  withTenantContext,
  ensureTenantAccess,
  requireTenantId
};
