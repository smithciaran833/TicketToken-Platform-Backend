/**
 * System Job Utilities
 *
 * For background jobs that need cross-tenant access (system maintenance).
 * Sets app.is_system_user = 'true' to bypass RLS.
 */

import { PoolClient } from 'pg';
import { getDatabase } from '../config/database';

/**
 * Execute a function with system-level database access (bypasses RLS)
 * Use for: cleanup jobs, reconciliation, archiving, cross-tenant maintenance
 */
export async function withSystemContext<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const db = getDatabase();
  const client = await db.connect();

  try {
    await client.query(`SELECT set_config('app.is_system_user', 'true', false)`);
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.is_system_user', 'false', false)`);
    client.release();
  }
}
