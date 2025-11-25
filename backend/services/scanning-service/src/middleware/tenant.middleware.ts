import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database';
import logger from '../utils/logger';

/**
 * Tenant Context Middleware
 * SECURITY (Phase 1.5): Sets tenant context in database for Row Level Security
 * 
 * This middleware MUST run after authentication middleware since it requires
 * request.tenantId to be set by the auth middleware.
 */
export async function setTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Only set tenant context if user is authenticated
  if (!request.tenantId) {
    logger.debug('No tenant context to set - request not authenticated');
    return;
  }

  try {
    const pool = getPool();
    
    // Set tenant context for this request's database queries
    // This enables PostgreSQL Row Level Security (RLS) policies
    await pool.query('SELECT set_tenant_context($1)', [request.tenantId]);

    logger.debug('Tenant context set', {
      tenantId: request.tenantId,
      userId: request.user?.userId,
      path: request.url
    });

  } catch (error) {
    logger.error('Failed to set tenant context', {
      tenantId: request.tenantId,
      error
    });

    // This is a critical security failure - do not allow request to proceed
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to establish security context'
    });
  }
}

/**
 * Helper function to get a database client with tenant context already set
 * Use this for operations that need explicit tenant isolation
 * 
 * @example
 * const client = await getTenantClient(request.tenantId);
 * try {
 *   await client.query('BEGIN');
 *   // Your queries here...
 *   await client.query('COMMIT');
 * } finally {
 *   client.release();
 * }
 */
export async function getTenantClient(tenantId: string) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Set tenant context on this specific client
    await client.query('SELECT set_tenant_context($1)', [tenantId]);
    return client;
  } catch (error) {
    // If setting context fails, release client and throw
    client.release();
    throw error;
  }
}

/**
 * Wrapper for database queries with automatic tenant context
 * Use this as a convenience method for simple queries
 * 
 * @example
 * const result = await queryWithTenant(
 *   request.tenantId,
 *   'SELECT * FROM devices WHERE id = $1',
 *   [deviceId]
 * );
 */
export async function queryWithTenant(
  tenantId: string,
  query: string,
  params?: any[]
) {
  const client = await getTenantClient(tenantId);

  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Transaction wrapper with automatic tenant context
 * Use this for multi-query transactions
 * 
 * @example
 * await transactionWithTenant(request.tenantId, async (client) => {
 *   await client.query('INSERT INTO devices...');
 *   await client.query('INSERT INTO scans...');
 * });
 */
export async function transactionWithTenant<T>(
  tenantId: string,
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await getTenantClient(tenantId);

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
