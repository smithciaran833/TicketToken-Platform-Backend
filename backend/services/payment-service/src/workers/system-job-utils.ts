/**
 * System Job Utilities
 *
 * For background jobs that need cross-tenant access (system maintenance).
 * Sets app.is_system_user = 'true' to bypass RLS.
 */

import { Pool, PoolClient } from 'pg';

/**
 * Execute a function with system-level database access (bypasses RLS)
 */
export async function withSystemContextPool<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query(`SELECT set_config('app.is_system_user', 'true', false)`);
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.is_system_user', 'false', false)`);
    client.release();
  }
}
