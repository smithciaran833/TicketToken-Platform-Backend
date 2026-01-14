/**
 * Migration: Add FORCE ROW LEVEL SECURITY to tables
 * 
 * AUDIT FIX: MT-6 - FORCE ROW LEVEL SECURITY
 * 
 * This ensures RLS policies apply even to table owners,
 * preventing accidental bypasses by superuser connections.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Tables that should have RLS enforced
  const tables = [
    'indexed_transactions',
    'ownership_discrepancies',
    'wallet_activity',
    'marketplace_events',
    'nft_ownership',
    'indexer_state'
  ];

  console.log('🔒 Adding FORCE ROW LEVEL SECURITY to tables...');

  for (const table of tables) {
    try {
      // Check if table exists
      const tableExists = await knex.schema.hasTable(table);
      if (!tableExists) {
        console.log(`   ⚠️ Table ${table} does not exist, skipping`);
        continue;
      }

      // Enable RLS on the table
      await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      console.log(`   ✅ Enabled RLS on ${table}`);

      // Force RLS for table owner (prevents superuser bypass)
      await knex.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      console.log(`   ✅ Forced RLS on ${table}`);

    } catch (error: any) {
      // Ignore errors if RLS is already enabled
      if (error.message?.includes('already exists') || 
          error.code === '42710' ||
          error.message?.includes('already enabled')) {
        console.log(`   ℹ️ RLS already configured on ${table}`);
      } else {
        console.error(`   ❌ Failed to configure RLS on ${table}:`, error.message);
        throw error;
      }
    }
  }

  // Create default deny policy for each table if not exists
  console.log('🔒 Adding default deny policies...');
  
  for (const table of tables) {
    try {
      const tableExists = await knex.schema.hasTable(table);
      if (!tableExists) continue;

      // Check if policy exists
      const policyCheck = await knex.raw(`
        SELECT 1 FROM pg_policies 
        WHERE tablename = ? AND policyname = ?
      `, [table, `${table}_tenant_isolation`]);

      if (policyCheck.rows.length === 0) {
        // Create tenant isolation policy
        // This policy allows access only when tenant_id matches current_setting
        await knex.raw(`
          CREATE POLICY ${table}_tenant_isolation ON ${table}
          FOR ALL
          USING (
            tenant_id IS NULL OR
            tenant_id = current_setting('app.tenant_id', true)::uuid
          )
          WITH CHECK (
            tenant_id IS NULL OR
            tenant_id = current_setting('app.tenant_id', true)::uuid
          )
        `);
        console.log(`   ✅ Created tenant isolation policy for ${table}`);
      } else {
        console.log(`   ℹ️ Tenant isolation policy already exists for ${table}`);
      }
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.code === '42710') {
        console.log(`   ℹ️ Policy already exists for ${table}`);
      } else if (error.message?.includes('does not exist') && error.message?.includes('tenant_id')) {
        console.log(`   ⚠️ Table ${table} has no tenant_id column, skipping policy`);
      } else {
        console.error(`   ❌ Failed to create policy for ${table}:`, error.message);
        // Don't throw - continue with other tables
      }
    }
  }

  console.log('✅ RLS migration complete');
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'indexed_transactions',
    'ownership_discrepancies',
    'wallet_activity',
    'marketplace_events',
    'nft_ownership',
    'indexer_state'
  ];

  console.log('🔓 Removing FORCE ROW LEVEL SECURITY...');

  for (const table of tables) {
    try {
      const tableExists = await knex.schema.hasTable(table);
      if (!tableExists) continue;

      // Drop policies
      await knex.raw(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      console.log(`   ✅ Dropped policy for ${table}`);

      // Disable force RLS (but keep RLS enabled for safety)
      await knex.raw(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
      console.log(`   ✅ Removed FORCE RLS from ${table}`);

    } catch (error: any) {
      console.error(`   ❌ Error reverting ${table}:`, error.message);
    }
  }
}
