/**
 * RLS Policies Migration for File Service
 * 
 * AUDIT FIX: MT-1, DB-3 - Multi-tenant Row Level Security
 * 
 * This migration:
 * 1. Adds tenant_id column to files table (if not exists)
 * 2. Enables RLS on files table
 * 3. Creates RLS policies to ensure tenant isolation
 * 4. Creates indexes for tenant_id queries
 * 5. Forces RLS for all users including table owner
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Use a transaction for safety
  await knex.transaction(async (trx) => {
    console.log('Starting RLS migration for file-service...');

    // =========================================================================
    // Step 1: Ensure tenant_id column exists on files table
    // =========================================================================
    
    const hasFilesTable = await trx.schema.hasTable('files');
    
    if (hasFilesTable) {
      const hasTenantIdColumn = await trx.schema.hasColumn('files', 'tenant_id');
      
      if (!hasTenantIdColumn) {
        console.log('Adding tenant_id column to files table...');
        await trx.schema.alterTable('files', (table) => {
          table.uuid('tenant_id').nullable();
          table.index('tenant_id', 'idx_files_tenant_id');
        });
        
        // Backfill existing records with a default tenant (or mark for review)
        // In production, you'd want to properly backfill this from related data
        console.log('Warning: Existing files without tenant_id need to be backfilled');
      }
      
      // Add composite index for common queries
      const hasCompositeIndex = await trx.raw(`
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'files' 
        AND indexname = 'idx_files_tenant_id_created_at'
      `);
      
      if (hasCompositeIndex.rows.length === 0) {
        console.log('Creating composite index on files (tenant_id, created_at)...');
        await trx.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_tenant_id_created_at 
          ON files (tenant_id, created_at DESC)
        `);
      }
    }

    // =========================================================================
    // Step 2: Enable Row Level Security
    // =========================================================================
    
    console.log('Enabling RLS on files table...');
    await trx.raw(`ALTER TABLE files ENABLE ROW LEVEL SECURITY`);
    
    // AUDIT FIX: Force RLS even for table owner (prevents bypassing)
    console.log('Forcing RLS for table owner...');
    await trx.raw(`ALTER TABLE files FORCE ROW LEVEL SECURITY`);

    // =========================================================================
    // Step 3: Create RLS Policies
    // =========================================================================
    
    // Drop existing policies if they exist (for idempotency)
    console.log('Dropping existing RLS policies...');
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_select ON files`);
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_insert ON files`);
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_update ON files`);
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_delete ON files`);
    await trx.raw(`DROP POLICY IF EXISTS files_system_admin_all ON files`);
    
    // Create SELECT policy - users can only see their tenant's files
    console.log('Creating SELECT policy for files...');
    await trx.raw(`
      CREATE POLICY files_tenant_isolation_select ON files
      FOR SELECT
      USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('app.is_system_admin', true) = 'true'
      )
    `);
    
    // Create INSERT policy - users can only insert files for their tenant
    console.log('Creating INSERT policy for files...');
    await trx.raw(`
      CREATE POLICY files_tenant_isolation_insert ON files
      FOR INSERT
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('app.is_system_admin', true) = 'true'
      )
    `);
    
    // Create UPDATE policy - users can only update their tenant's files
    console.log('Creating UPDATE policy for files...');
    await trx.raw(`
      CREATE POLICY files_tenant_isolation_update ON files
      FOR UPDATE
      USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('app.is_system_admin', true) = 'true'
      )
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('app.is_system_admin', true) = 'true'
      )
    `);
    
    // Create DELETE policy - users can only delete their tenant's files
    console.log('Creating DELETE policy for files...');
    await trx.raw(`
      CREATE POLICY files_tenant_isolation_delete ON files
      FOR DELETE
      USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR current_setting('app.is_system_admin', true) = 'true'
      )
    `);

    // =========================================================================
    // Step 4: Apply to related tables (if they exist)
    // =========================================================================
    
    const relatedTables = ['file_versions', 'file_thumbnails', 'file_access_logs'];
    
    for (const tableName of relatedTables) {
      const hasTable = await trx.schema.hasTable(tableName);
      
      if (hasTable) {
        console.log(`Enabling RLS on ${tableName}...`);
        
        // Add tenant_id if not exists
        const hasTenantId = await trx.schema.hasColumn(tableName, 'tenant_id');
        if (!hasTenantId) {
          await trx.schema.alterTable(tableName, (table) => {
            table.uuid('tenant_id').nullable();
            table.index('tenant_id', `idx_${tableName}_tenant_id`);
          });
        }
        
        // Enable RLS
        await trx.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
        await trx.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
        
        // Drop and recreate policies
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_select ON ${tableName}`);
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_insert ON ${tableName}`);
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_update ON ${tableName}`);
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_delete ON ${tableName}`);
        
        await trx.raw(`
          CREATE POLICY ${tableName}_tenant_select ON ${tableName}
          FOR SELECT
          USING (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR current_setting('app.is_system_admin', true) = 'true'
          )
        `);
        
        await trx.raw(`
          CREATE POLICY ${tableName}_tenant_insert ON ${tableName}
          FOR INSERT
          WITH CHECK (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR current_setting('app.is_system_admin', true) = 'true'
          )
        `);
        
        await trx.raw(`
          CREATE POLICY ${tableName}_tenant_update ON ${tableName}
          FOR UPDATE
          USING (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR current_setting('app.is_system_admin', true) = 'true'
          )
        `);
        
        await trx.raw(`
          CREATE POLICY ${tableName}_tenant_delete ON ${tableName}
          FOR DELETE
          USING (
            tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
            OR current_setting('app.is_system_admin', true) = 'true'
          )
        `);
      }
    }

    // =========================================================================
    // Step 5: Create helper function for setting tenant context
    // =========================================================================
    
    console.log('Creating set_tenant_context function...');
    await trx.raw(`
      CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id uuid, p_is_admin boolean DEFAULT false)
      RETURNS void AS $$
      BEGIN
        PERFORM set_config('app.tenant_id', COALESCE(p_tenant_id::text, ''), true);
        PERFORM set_config('app.is_system_admin', p_is_admin::text, true);
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // =========================================================================
    // Step 6: Create trigger to auto-set tenant_id on INSERT
    // =========================================================================
    
    console.log('Creating auto-set tenant_id trigger...');
    await trx.raw(`
      CREATE OR REPLACE FUNCTION set_tenant_id_on_insert()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only set tenant_id if not already provided
        IF NEW.tenant_id IS NULL THEN
          NEW.tenant_id := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Apply trigger to files table
    await trx.raw(`DROP TRIGGER IF EXISTS files_set_tenant_id ON files`);
    await trx.raw(`
      CREATE TRIGGER files_set_tenant_id
      BEFORE INSERT ON files
      FOR EACH ROW
      EXECUTE FUNCTION set_tenant_id_on_insert()
    `);

    console.log('RLS migration completed successfully!');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    console.log('Rolling back RLS migration...');

    // Disable RLS on files table
    await trx.raw(`ALTER TABLE files DISABLE ROW LEVEL SECURITY`);
    
    // Drop policies
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_select ON files`);
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_insert ON files`);
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_update ON files`);
    await trx.raw(`DROP POLICY IF EXISTS files_tenant_isolation_delete ON files`);
    
    // Drop trigger
    await trx.raw(`DROP TRIGGER IF EXISTS files_set_tenant_id ON files`);
    
    // Drop functions
    await trx.raw(`DROP FUNCTION IF EXISTS set_tenant_id_on_insert()`);
    await trx.raw(`DROP FUNCTION IF EXISTS set_tenant_context(uuid, boolean)`);
    
    // Handle related tables
    const relatedTables = ['file_versions', 'file_thumbnails', 'file_access_logs'];
    
    for (const tableName of relatedTables) {
      const hasTable = await trx.schema.hasTable(tableName);
      if (hasTable) {
        await trx.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_select ON ${tableName}`);
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_insert ON ${tableName}`);
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_update ON ${tableName}`);
        await trx.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_delete ON ${tableName}`);
      }
    }
    
    // Note: We don't drop the tenant_id column as it may contain data
    console.log('Note: tenant_id column preserved to prevent data loss');
    
    console.log('RLS rollback completed');
  });
}
