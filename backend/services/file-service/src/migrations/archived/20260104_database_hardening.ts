/**
 * Database Hardening Migration
 * 
 * AUDIT FIXES:
 * - DB-H1: No FOR UPDATE locking → Advisory locks documented
 * - DB-H2: No statement timeout → SET statement_timeout configured
 * - DB-H3: No unique constraint on hash → Partial unique index added
 * - DB-H4: No pool timeouts → Pool config updated
 * - DB-H5: No partial unique indexes → Added where active
 * - DB-H6: Some critical fields nullable → NOT NULL constraints added
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ===========================================================================
  // AUDIT FIX DB-H2: Set statement timeout for safety
  // ===========================================================================
  
  await knex.raw(`
    -- Set statement timeout for the database
    -- Individual connections can override, but this sets a safe default
    ALTER DATABASE CURRENT SET statement_timeout = '30s';
    
    -- Set lock timeout to prevent indefinite waits
    ALTER DATABASE CURRENT SET lock_timeout = '10s';
  `);

  // ===========================================================================
  // AUDIT FIX DB-H3 & DB-H5: Add partial unique indexes
  // ===========================================================================
  
  // Unique index on file hash per tenant (for deduplication)
  // Only applies to non-deleted files
  await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS 
      idx_files_hash_tenant_unique 
    ON files (file_hash, tenant_id) 
    WHERE deleted_at IS NULL AND file_hash IS NOT NULL;
  `);

  // Unique index on S3 key (each file must have unique storage path)
  await knex.raw(`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS 
      idx_files_s3_key_unique 
    ON files (s3_key) 
    WHERE deleted_at IS NULL;
  `);

  // Index for efficient tenant + status queries
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS 
      idx_files_tenant_status 
    ON files (tenant_id, status) 
    WHERE deleted_at IS NULL;
  `);

  // Index for pending uploads cleanup
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS 
      idx_files_pending_created 
    ON files (created_at) 
    WHERE status = 'pending' AND deleted_at IS NULL;
  `);

  // ===========================================================================
  // AUDIT FIX DB-H6: Add NOT NULL constraints where missing
  // ===========================================================================
  
  // Ensure critical fields are not nullable
  await knex.raw(`
    -- Add NOT NULL to tenant_id if not already set
    DO $$ 
    BEGIN
      -- Check if column allows NULL
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'files' 
        AND column_name = 'tenant_id' 
        AND is_nullable = 'YES'
      ) THEN
        -- First update any NULL values
        UPDATE files SET tenant_id = 'default' WHERE tenant_id IS NULL;
        -- Then add constraint
        ALTER TABLE files ALTER COLUMN tenant_id SET NOT NULL;
      END IF;
    END $$;
  `);

  await knex.raw(`
    -- Add NOT NULL to status if not already set
    DO $$ 
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'files' 
        AND column_name = 'status' 
        AND is_nullable = 'YES'
      ) THEN
        UPDATE files SET status = 'pending' WHERE status IS NULL;
        ALTER TABLE files ALTER COLUMN status SET NOT NULL;
      END IF;
    END $$;
  `);

  await knex.raw(`
    -- Add NOT NULL to mime_type if not already set
    DO $$ 
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'files' 
        AND column_name = 'mime_type' 
        AND is_nullable = 'YES'
      ) THEN
        UPDATE files SET mime_type = 'application/octet-stream' WHERE mime_type IS NULL;
        ALTER TABLE files ALTER COLUMN mime_type SET NOT NULL;
      END IF;
    END $$;
  `);

  // ===========================================================================
  // Add check constraints for data integrity
  // ===========================================================================

  await knex.raw(`
    -- Check constraint for valid status values
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_files_status'
      ) THEN
        ALTER TABLE files ADD CONSTRAINT check_files_status 
          CHECK (status IN ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted'));
      END IF;
    END $$;
  `);

  await knex.raw(`
    -- Check constraint for positive file size
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_files_size_positive'
      ) THEN
        ALTER TABLE files ADD CONSTRAINT check_files_size_positive 
          CHECK (file_size IS NULL OR file_size >= 0);
      END IF;
    END $$;
  `);

  // ===========================================================================
  // Create function for safe concurrent updates with advisory locks
  // AUDIT FIX DB-H1: Advisory lock wrapper
  // ===========================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION acquire_file_lock(p_file_id uuid) 
    RETURNS boolean AS $$
    DECLARE
      lock_key bigint;
    BEGIN
      -- Generate a unique lock key from the UUID
      lock_key := ('x' || substr(p_file_id::text, 1, 8))::bit(32)::bigint;
      
      -- Try to acquire advisory lock
      RETURN pg_try_advisory_lock(lock_key);
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION release_file_lock(p_file_id uuid) 
    RETURNS boolean AS $$
    DECLARE
      lock_key bigint;
    BEGIN
      lock_key := ('x' || substr(p_file_id::text, 1, 8))::bit(32)::bigint;
      RETURN pg_advisory_unlock(lock_key);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ===========================================================================
  // Create function for atomic file status transition
  // ===========================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION transition_file_status(
      p_file_id uuid,
      p_tenant_id uuid,
      p_from_status text,
      p_to_status text
    ) RETURNS boolean AS $$
    DECLARE
      rows_affected integer;
    BEGIN
      UPDATE files 
      SET 
        status = p_to_status,
        updated_at = NOW()
      WHERE 
        id = p_file_id 
        AND tenant_id = p_tenant_id
        AND status = p_from_status
        AND deleted_at IS NULL;
      
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      
      RETURN rows_affected > 0;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ===========================================================================
  // Add updated_at trigger
  // ===========================================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_files_updated_at'
      ) THEN
        CREATE TRIGGER trigger_files_updated_at
          BEFORE UPDATE ON files
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;
  `);

  // ===========================================================================
  // Analyze tables for query optimization
  // ===========================================================================

  await knex.raw('ANALYZE files;');
}

export async function down(knex: Knex): Promise<void> {
  // Remove triggers
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_files_updated_at ON files;
  `);

  // Remove functions
  await knex.raw(`
    DROP FUNCTION IF EXISTS update_updated_at_column();
    DROP FUNCTION IF EXISTS transition_file_status(uuid, uuid, text, text);
    DROP FUNCTION IF EXISTS release_file_lock(uuid);
    DROP FUNCTION IF EXISTS acquire_file_lock(uuid);
  `);

  // Remove check constraints
  await knex.raw(`
    ALTER TABLE files DROP CONSTRAINT IF EXISTS check_files_status;
    ALTER TABLE files DROP CONSTRAINT IF EXISTS check_files_size_positive;
  `);

  // Remove indexes (can be done concurrently)
  await knex.raw(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_files_pending_created;
    DROP INDEX CONCURRENTLY IF EXISTS idx_files_tenant_status;
    DROP INDEX CONCURRENTLY IF EXISTS idx_files_s3_key_unique;
    DROP INDEX CONCURRENTLY IF EXISTS idx_files_hash_tenant_unique;
  `);

  // Reset database settings
  await knex.raw(`
    ALTER DATABASE CURRENT RESET statement_timeout;
    ALTER DATABASE CURRENT RESET lock_timeout;
  `);
}
