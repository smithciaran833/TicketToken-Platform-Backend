import { Knex } from 'knex';

/**
 * Migration: Add WITH CHECK clause to RLS policies and set lock_timeout
 * 
 * Security Fixes:
 * - RLS7: Only USING clause, no WITH CHECK for INSERT - Add WITH CHECK clause
 * - lock_timeout: Not set in database config - Add lock_timeout setting
 */
export async function up(knex: Knex): Promise<void> {
  // SECURITY FIX: Set lock_timeout to prevent long waits on locks
  await knex.raw('ALTER DATABASE CURRENT SET lock_timeout = 10000'); // 10 seconds

  // SECURITY FIX (RLS7): Drop and recreate RLS policies with both USING and WITH CHECK
  // This ensures tenant isolation for both reads AND writes
  
  const tables = ['venues', 'venue_settings', 'venue_integrations', 'venue_audit_log'];
  
  for (const table of tables) {
    // Check if table exists before modifying
    const tableExists = await knex.schema.hasTable(table);
    if (!tableExists) {
      console.log(`Table ${table} does not exist, skipping RLS policy update`);
      continue;
    }

    // Drop existing policies
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_select ON ${table}`);
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_insert ON ${table}`);
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_update ON ${table}`);
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_delete ON ${table}`);
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);

    // Enable RLS on table if not already enabled
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    // Create separate policies for each operation with WITH CHECK
    // SELECT - uses USING clause only (reads)
    await knex.raw(`
      CREATE POLICY tenant_isolation_select ON ${table}
        FOR SELECT
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);

    // INSERT - uses WITH CHECK clause (ensures new rows have correct tenant)
    await knex.raw(`
      CREATE POLICY tenant_isolation_insert ON ${table}
        FOR INSERT
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);

    // UPDATE - uses both USING (filter existing) and WITH CHECK (verify new values)
    await knex.raw(`
      CREATE POLICY tenant_isolation_update ON ${table}
        FOR UPDATE
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);

    // DELETE - uses USING clause only (filter existing rows)
    await knex.raw(`
      CREATE POLICY tenant_isolation_delete ON ${table}
        FOR DELETE
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);

    console.log(`✅ Updated RLS policies for ${table} with WITH CHECK clause`);
  }

  // Add comment explaining the security fix
  await knex.raw(`
    COMMENT ON POLICY tenant_isolation_insert ON venues IS 
    'RLS7 FIX: WITH CHECK ensures new rows can only be inserted with the current tenant_id';
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Reset lock_timeout to default
  await knex.raw('ALTER DATABASE CURRENT RESET lock_timeout');

  // Restore original simple policies (single policy per table)
  const tables = ['venues', 'venue_settings', 'venue_integrations', 'venue_audit_log'];
  
  for (const table of tables) {
    const tableExists = await knex.schema.hasTable(table);
    if (!tableExists) continue;

    // Drop new policies
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_select ON ${table}`);
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_insert ON ${table}`);
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_update ON ${table}`);
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_delete ON ${table}`);

    // Recreate original policy
    await knex.raw(`
      CREATE POLICY tenant_isolation ON ${table}
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
    `);
  }
}
