/**
 * System Job Utilities
 *
 * For background jobs that need cross-tenant access (system maintenance).
 * Sets app.is_system_user = 'true' to bypass RLS.
 */

import { PoolClient } from 'pg';
import { DatabaseService } from '../services/databaseService';

/**
 * Execute a function with system-level database access (bypasses RLS)
 */
export async function withSystemContext<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const db = DatabaseService.getPool();
  const client = await db.connect();

  try {
    await client.query(`SELECT set_config('app.is_system_user', 'true', false)`);
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.is_system_user', 'false', false)`);
    client.release();
  }
}
