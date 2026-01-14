/**
 * Migration: Add Idempotency Keys Table
 * 
 * Fixes audit findings:
 * - Key format includes tenant_id - Added tenant_id to composite key
 * - Idempotency includes tenant_id - tenant_id column added
 * - Keys scoped to tenant - Unique constraint on (tenant_id, idempotency_key, operation)
 * - Checks are atomic - Uses INSERT ON CONFLICT for atomic operations
 * 
 * This table stores idempotency keys to prevent duplicate operations.
 * Keys are scoped to tenant for proper multi-tenant isolation.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create idempotency keys table with tenant scoping
  await knex.raw(`
    -- ============================================================================
    -- Idempotency Keys Table
    -- Fixes: "Idempotency includes tenant_id - No tenant_id in table"
    -- Fixes: "Keys scoped to tenant - No tenant_id"
    -- ============================================================================
    
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      -- Primary identifier
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      
      -- SECURITY: Tenant scoping for multi-tenant isolation
      -- Fixes: "Key format includes tenant_id"
      tenant_id UUID NOT NULL,
      
      -- The idempotency key provided by the client
      idempotency_key VARCHAR(255) NOT NULL,
      
      -- Operation type (purchase, reservation, transfer, etc.)
      operation VARCHAR(100) NOT NULL,
      
      -- Request fingerprint (hash of request body for extra validation)
      request_hash VARCHAR(64),
      
      -- State of the operation
      status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      
      -- The response to return for duplicate requests
      response_status INTEGER,
      response_body JSONB,
      
      -- Resource created by this operation (for idempotent responses)
      resource_id UUID,
      resource_type VARCHAR(100),
      
      -- Lock for concurrent request handling
      -- Fixes: "Concurrent returns 409 - No locking, race window"
      locked_at TIMESTAMPTZ,
      locked_by VARCHAR(255),
      lock_expires_at TIMESTAMPTZ,
      
      -- Metadata
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
      
      -- Audit fields
      client_ip INET,
      user_agent TEXT,
      request_id VARCHAR(255)
    );

    -- ============================================================================
    -- UNIQUE CONSTRAINT: Tenant-scoped idempotency
    -- Fixes: "Keys scoped to tenant - No tenant_id"
    -- ============================================================================
    
    -- Composite unique constraint ensures keys are unique per tenant per operation
    CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_tenant_key_op 
    ON idempotency_keys(tenant_id, idempotency_key, operation);

    -- Index for cleanup of expired keys
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires 
    ON idempotency_keys(expires_at) 
    WHERE expires_at < NOW();

    -- Index for lock expiry checks
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_lock_expires 
    ON idempotency_keys(lock_expires_at) 
    WHERE locked_at IS NOT NULL;

    -- ============================================================================
    -- ATOMIC OPERATIONS: Functions for idempotency handling
    -- Fixes: "Checks are atomic - SELECT before INSERT"
    -- ============================================================================
    
    -- Function to atomically acquire or check idempotency key
    -- Uses INSERT ON CONFLICT for atomic check-and-insert
    CREATE OR REPLACE FUNCTION acquire_idempotency_key(
      p_tenant_id UUID,
      p_idempotency_key VARCHAR(255),
      p_operation VARCHAR(100),
      p_request_hash VARCHAR(64),
      p_lock_holder VARCHAR(255),
      p_lock_duration INTERVAL DEFAULT INTERVAL '5 minutes'
    ) RETURNS TABLE (
      key_id UUID,
      status VARCHAR(50),
      is_new BOOLEAN,
      is_locked BOOLEAN,
      response_status INTEGER,
      response_body JSONB,
      resource_id UUID
    ) AS $$
    DECLARE
      v_key_id UUID;
      v_status VARCHAR(50);
      v_is_new BOOLEAN := false;
      v_is_locked BOOLEAN := false;
      v_response_status INTEGER;
      v_response_body JSONB;
      v_resource_id UUID;
      v_lock_expires TIMESTAMPTZ;
    BEGIN
      -- First, try to insert atomically
      -- Fixes: "Checks are atomic - SELECT before INSERT"
      INSERT INTO idempotency_keys (
        tenant_id,
        idempotency_key,
        operation,
        request_hash,
        status,
        locked_at,
        locked_by,
        lock_expires_at
      ) VALUES (
        p_tenant_id,
        p_idempotency_key,
        p_operation,
        p_request_hash,
        'processing',
        NOW(),
        p_lock_holder,
        NOW() + p_lock_duration
      )
      ON CONFLICT (tenant_id, idempotency_key, operation) DO NOTHING
      RETURNING id, status INTO v_key_id, v_status;
      
      IF v_key_id IS NOT NULL THEN
        -- New key was inserted and locked
        v_is_new := true;
        v_is_locked := true;
        v_status := 'processing';
      ELSE
        -- Key exists, check its state
        SELECT 
          ik.id,
          ik.status,
          ik.response_status,
          ik.response_body,
          ik.resource_id,
          ik.lock_expires_at
        INTO 
          v_key_id,
          v_status,
          v_response_status,
          v_response_body,
          v_resource_id,
          v_lock_expires
        FROM idempotency_keys ik
        WHERE ik.tenant_id = p_tenant_id
          AND ik.idempotency_key = p_idempotency_key
          AND ik.operation = p_operation
        FOR UPDATE NOWAIT;  -- Fail fast if locked
        
        -- Check if lock is expired and we can take it
        IF v_status = 'processing' AND v_lock_expires < NOW() THEN
          -- Lock expired, take over
          UPDATE idempotency_keys
          SET locked_at = NOW(),
              locked_by = p_lock_holder,
              lock_expires_at = NOW() + p_lock_duration
          WHERE id = v_key_id;
          v_is_locked := true;
        ELSIF v_status = 'processing' THEN
          -- Currently being processed by another request
          v_is_locked := false;
        ELSE
          -- Completed or failed - return cached response
          v_is_locked := false;
        END IF;
      END IF;
      
      RETURN QUERY SELECT 
        v_key_id,
        v_status,
        v_is_new,
        v_is_locked,
        v_response_status,
        v_response_body,
        v_resource_id;
    
    EXCEPTION
      WHEN lock_not_available THEN
        -- Another transaction has the row locked
        -- Fixes: "Concurrent returns 409 - No locking, race window"
        RETURN QUERY SELECT 
          NULL::UUID,
          'processing'::VARCHAR(50),
          false,
          false,
          NULL::INTEGER,
          NULL::JSONB,
          NULL::UUID;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to complete an idempotency key with response
    CREATE OR REPLACE FUNCTION complete_idempotency_key(
      p_key_id UUID,
      p_status VARCHAR(50),
      p_response_status INTEGER,
      p_response_body JSONB,
      p_resource_id UUID DEFAULT NULL,
      p_resource_type VARCHAR(100) DEFAULT NULL
    ) RETURNS BOOLEAN AS $$
    BEGIN
      UPDATE idempotency_keys
      SET status = p_status,
          response_status = p_response_status,
          response_body = p_response_body,
          resource_id = p_resource_id,
          resource_type = p_resource_type,
          locked_at = NULL,
          locked_by = NULL,
          lock_expires_at = NULL,
          updated_at = NOW()
      WHERE id = p_key_id;
      
      RETURN FOUND;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to release a lock (e.g., on error)
    CREATE OR REPLACE FUNCTION release_idempotency_lock(
      p_key_id UUID,
      p_set_failed BOOLEAN DEFAULT false
    ) RETURNS BOOLEAN AS $$
    BEGIN
      IF p_set_failed THEN
        UPDATE idempotency_keys
        SET status = 'failed',
            locked_at = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            updated_at = NOW()
        WHERE id = p_key_id;
      ELSE
        -- Just release lock, keep pending status
        UPDATE idempotency_keys
        SET locked_at = NULL,
            locked_by = NULL,
            lock_expires_at = NULL,
            updated_at = NOW()
        WHERE id = p_key_id
          AND status = 'processing';
      END IF;
      
      RETURN FOUND;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to clean up expired idempotency keys
    CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
    RETURNS INTEGER AS $$
    DECLARE
      deleted_count INTEGER;
    BEGIN
      DELETE FROM idempotency_keys
      WHERE expires_at < NOW()
      RETURNING * INTO deleted_count;
      
      RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;

    -- ============================================================================
    -- Enable RLS for tenant isolation
    -- ============================================================================
    
    ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

    -- Policy: Users can only access their tenant's idempotency keys
    CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
      USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

    -- ============================================================================
    -- Grants for application role
    -- ============================================================================
    
    DO $$
    DECLARE
      app_role TEXT := coalesce(current_setting('app.role', true), 'ticket_service_app');
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO %I', app_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION acquire_idempotency_key TO %I', app_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION complete_idempotency_key TO %I', app_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION release_idempotency_lock TO %I', app_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION cleanup_expired_idempotency_keys TO %I', app_role);
    EXCEPTION
      WHEN undefined_object THEN
        RAISE NOTICE 'Application role not found, skipping grants';
    END
    $$;
  `);

  console.log('Migration 005: Idempotency keys table and functions created');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    -- Drop policies
    DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON idempotency_keys;
    
    -- Drop functions
    DROP FUNCTION IF EXISTS cleanup_expired_idempotency_keys();
    DROP FUNCTION IF EXISTS release_idempotency_lock(UUID, BOOLEAN);
    DROP FUNCTION IF EXISTS complete_idempotency_key(UUID, VARCHAR, INTEGER, JSONB, UUID, VARCHAR);
    DROP FUNCTION IF EXISTS acquire_idempotency_key(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, INTERVAL);
    
    -- Drop table
    DROP TABLE IF EXISTS idempotency_keys;
  `);

  console.log('Migration 005: Idempotency keys table and functions removed');
}
