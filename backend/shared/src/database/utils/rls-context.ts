/**
 * RLS Context Utilities
 * 
 * Provides functions to set and manage tenant context for Row Level Security.
 * Use these utilities in middleware and service layers to ensure proper
 * tenant isolation in database queries.
 * 
 * IMPORTANT: The tenant context setting name MUST match what's in the
 * database migrations (app.current_tenant_id).
 */

import { Knex } from 'knex';

// Standard tenant context setting name - MUST match database functions
export const TENANT_CONTEXT_SETTING = 'app.current_tenant_id';
export const USER_CONTEXT_SETTING = 'app.current_user_id';
export const IP_CONTEXT_SETTING = 'app.ip_address';
export const USER_AGENT_CONTEXT_SETTING = 'app.user_agent';

/**
 * Context data for database operations
 */
export interface DatabaseContext {
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Sets the tenant context for the current database session.
 * This affects all subsequent queries until the context is cleared.
 * 
 * @param knex - Knex instance
 * @param tenantId - The tenant ID to set
 */
export async function setTenantContext(knex: Knex, tenantId: string): Promise<void> {
  await knex.raw(`SELECT set_config('${TENANT_CONTEXT_SETTING}', ?, false)`, [tenantId]);
}

/**
 * Sets the tenant context for the current transaction only.
 * The context will be cleared when the transaction ends.
 * 
 * @param knex - Knex transaction instance
 * @param tenantId - The tenant ID to set
 */
export async function setTenantContextLocal(knex: Knex, tenantId: string): Promise<void> {
  await knex.raw(`SELECT set_config('${TENANT_CONTEXT_SETTING}', ?, true)`, [tenantId]);
}

/**
 * Clears the tenant context for the current session.
 * 
 * @param knex - Knex instance
 */
export async function clearTenantContext(knex: Knex): Promise<void> {
  await knex.raw(`SELECT set_config('${TENANT_CONTEXT_SETTING}', '', false)`);
}

/**
 * Gets the current tenant context.
 * 
 * @param knex - Knex instance
 * @returns The current tenant ID or null if not set
 */
export async function getTenantContext(knex: Knex): Promise<string | null> {
  const result = await knex.raw(`SELECT current_setting('${TENANT_CONTEXT_SETTING}', true) as tenant_id`);
  const tenantId = result.rows?.[0]?.tenant_id || result[0]?.tenant_id;
  return tenantId && tenantId !== '' ? tenantId : null;
}

/**
 * Sets the full request context for database operations.
 * Includes tenant, user, IP, and user agent for audit logging.
 * 
 * @param knex - Knex instance
 * @param context - The context to set
 */
export async function setFullContext(knex: Knex, context: DatabaseContext): Promise<void> {
  const queries: Promise<any>[] = [];

  // Always set tenant context
  queries.push(knex.raw(`SELECT set_config('${TENANT_CONTEXT_SETTING}', ?, false)`, [context.tenantId]));

  // Optionally set user context
  if (context.userId) {
    queries.push(knex.raw(`SELECT set_config('${USER_CONTEXT_SETTING}', ?, false)`, [context.userId]));
  }

  // Optionally set IP address
  if (context.ipAddress) {
    queries.push(knex.raw(`SELECT set_config('${IP_CONTEXT_SETTING}', ?, false)`, [context.ipAddress]));
  }

  // Optionally set user agent
  if (context.userAgent) {
    queries.push(knex.raw(`SELECT set_config('${USER_AGENT_CONTEXT_SETTING}', ?, false)`, [context.userAgent]));
  }

  await Promise.all(queries);
}

/**
 * Sets the full request context for the current transaction only.
 * 
 * @param knex - Knex transaction instance
 * @param context - The context to set
 */
export async function setFullContextLocal(knex: Knex, context: DatabaseContext): Promise<void> {
  const queries: Promise<any>[] = [];

  queries.push(knex.raw(`SELECT set_config('${TENANT_CONTEXT_SETTING}', ?, true)`, [context.tenantId]));

  if (context.userId) {
    queries.push(knex.raw(`SELECT set_config('${USER_CONTEXT_SETTING}', ?, true)`, [context.userId]));
  }

  if (context.ipAddress) {
    queries.push(knex.raw(`SELECT set_config('${IP_CONTEXT_SETTING}', ?, true)`, [context.ipAddress]));
  }

  if (context.userAgent) {
    queries.push(knex.raw(`SELECT set_config('${USER_AGENT_CONTEXT_SETTING}', ?, true)`, [context.userAgent]));
  }

  await Promise.all(queries);
}

/**
 * Clears all context settings for the current session.
 * 
 * @param knex - Knex instance
 */
export async function clearFullContext(knex: Knex): Promise<void> {
  await Promise.all([
    knex.raw(`SELECT set_config('${TENANT_CONTEXT_SETTING}', '', false)`),
    knex.raw(`SELECT set_config('${USER_CONTEXT_SETTING}', '', false)`),
    knex.raw(`SELECT set_config('${IP_CONTEXT_SETTING}', '', false)`),
    knex.raw(`SELECT set_config('${USER_AGENT_CONTEXT_SETTING}', '', false)`),
  ]);
}

/**
 * Higher-order function that wraps a database operation with tenant context.
 * Automatically sets and clears context around the operation.
 * 
 * @param knex - Knex instance
 * @param tenantId - The tenant ID to use
 * @param operation - The database operation to execute
 * @returns The result of the operation
 */
export async function withTenantContext<T>(
  knex: Knex,
  tenantId: string,
  operation: () => Promise<T>
): Promise<T> {
  await setTenantContext(knex, tenantId);
  try {
    return await operation();
  } finally {
    await clearTenantContext(knex);
  }
}

/**
 * Wraps a database transaction with tenant context.
 * The context is automatically scoped to the transaction.
 * 
 * @param knex - Knex instance
 * @param context - The context to use
 * @param operation - The transaction operation to execute
 * @returns The result of the operation
 */
export async function withContextTransaction<T>(
  knex: Knex,
  context: DatabaseContext,
  operation: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  return knex.transaction(async (trx) => {
    await setFullContextLocal(trx, context);
    return operation(trx);
  });
}

/**
 * Express/Fastify middleware creator that sets tenant context.
 * Use this to automatically set context from authenticated requests.
 * 
 * @param knex - Knex instance
 * @returns Middleware function
 */
export function createTenantContextMiddleware(knex: Knex) {
  return async (req: any, _res: any, next: () => void) => {
    // Extract tenant ID from request (assumes auth middleware has run)
    const tenantId = req.tenantId || req.user?.tenantId;
    const userId = req.user?.id || req.userId;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (tenantId) {
      const context: DatabaseContext = {
        tenantId,
        userId,
        ipAddress,
        userAgent,
      };
      
      await setFullContext(knex, context);
      
      // Store context for cleanup
      req.dbContext = context;
    }

    next();
  };
}

/**
 * Express/Fastify middleware to clear context after request.
 * Registers cleanup on response 'finish' event so context is cleared
 * AFTER the request handler completes, not before.
 * 
 * @param knex - Knex instance
 * @returns Middleware function
 */
export function createContextCleanupMiddleware(knex: Knex) {
  return (_req: any, res: any, next: () => void) => {
    // Register cleanup to run AFTER response is sent
    res.on('finish', async () => {
      try {
        await clearFullContext(knex);
      } catch (error) {
        // Log but don't throw - response already sent
        console.error('[RLS Context] Failed to clear context after request:', error);
      }
    });
    next();
  };
}

/**
 * Validates that the current context has a tenant set.
 * Throws an error if no tenant context is found.
 * 
 * @param knex - Knex instance
 * @throws Error if no tenant context is set
 */
export async function requireTenantContext(knex: Knex): Promise<string> {
  const tenantId = await getTenantContext(knex);
  if (!tenantId) {
    throw new Error('Tenant context not set. Ensure tenant middleware has run.');
  }
  return tenantId;
}
