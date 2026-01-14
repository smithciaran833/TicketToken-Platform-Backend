import { Pool } from 'pg';

/**
 * Migration: Add blockchain transaction tracking tables
 * 
 * CRITICAL SECURITY PURPOSE:
 * These tables ensure blockchain-database consistency by:
 * 1. Tracking pending blockchain transactions
 * 2. Preventing DB updates until blockchain confirms
 * 3. Enabling reconciliation between DB and blockchain
 * 4. Detecting and handling transaction failures/expirations
 * 
 * Without this, the DB can get out of sync with blockchain state,
 * leading to security vulnerabilities where:
 * - Tickets show as minted in DB but aren't on-chain
 * - Transfers complete in DB but fail on-chain
 * - Users can exploit race conditions
 */

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- ==========================================================================
    -- PENDING TRANSACTIONS TABLE
    -- Tracks all blockchain transactions from submission to confirmation
    -- ==========================================================================
    CREATE TABLE IF NOT EXISTS pending_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      
      -- Transaction identification
      tx_signature VARCHAR(128) NOT NULL,
      tx_type VARCHAR(50) NOT NULL CHECK (tx_type IN (
        'mint', 'transfer', 'burn', 'metadata_update', 'verify'
      )),
      
      -- Related entities
      ticket_id UUID REFERENCES tickets(id),
      event_id UUID REFERENCES events(id),
      from_user_id UUID REFERENCES users(id),
      to_user_id UUID REFERENCES users(id),
      
      -- Blockchain state
      status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Submitted, waiting for confirmation
        'confirming',   -- Has some confirmations, waiting for finality
        'confirmed',    -- Finalized on blockchain
        'failed',       -- Transaction failed
        'expired',      -- Blockhash expired before confirmation
        'replaced'      -- Replaced by a new transaction
      )),
      
      -- Confirmation tracking
      slot BIGINT,
      block_time TIMESTAMPTZ,
      confirmation_count INT DEFAULT 0,
      required_confirmations INT DEFAULT 1,
      
      -- Blockhash tracking (for expiration detection)
      blockhash VARCHAR(64),
      last_valid_block_height BIGINT,
      
      -- Retry tracking
      retry_count INT DEFAULT 0,
      max_retries INT DEFAULT 3,
      last_retry_at TIMESTAMPTZ,
      
      -- Error handling
      error_code VARCHAR(100),
      error_message TEXT,
      error_details JSONB DEFAULT '{}',
      
      -- Timestamps
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      
      -- Prevent duplicate transaction submissions
      CONSTRAINT unique_tx_signature UNIQUE(tx_signature)
    );

    -- ==========================================================================
    -- BLOCKCHAIN SYNC LOG TABLE
    -- Audit log of all blockchain synchronization events
    -- ==========================================================================
    CREATE TABLE IF NOT EXISTS blockchain_sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      
      -- Sync event type
      event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'transaction_confirmed',
        'transaction_failed',
        'transaction_expired',
        'reconciliation_mismatch',
        'reconciliation_resolved',
        'ownership_verified',
        'ownership_mismatch',
        'balance_check',
        'rpc_error',
        'manual_intervention'
      )),
      
      -- Related entities
      tx_signature VARCHAR(128),
      ticket_id UUID REFERENCES tickets(id),
      
      -- Event details
      db_state JSONB,           -- State in database
      blockchain_state JSONB,   -- State on blockchain
      action_taken VARCHAR(100),
      resolution TEXT,
      
      -- Metadata
      severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN (
        'info', 'warning', 'error', 'critical'
      )),
      metadata JSONB DEFAULT '{}',
      
      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ==========================================================================
    -- RLS POLICIES
    -- ==========================================================================
    ALTER TABLE pending_transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE blockchain_sync_log ENABLE ROW LEVEL SECURITY;

    -- Tenant isolation for pending_transactions
    DROP POLICY IF EXISTS pending_transactions_tenant_isolation ON pending_transactions;
    CREATE POLICY pending_transactions_tenant_isolation ON pending_transactions
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

    -- Tenant isolation for blockchain_sync_log
    DROP POLICY IF EXISTS blockchain_sync_log_tenant_isolation ON blockchain_sync_log;
    CREATE POLICY blockchain_sync_log_tenant_isolation ON blockchain_sync_log
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

    -- ==========================================================================
    -- INDEXES
    -- ==========================================================================
    
    -- Fast lookup by signature
    CREATE INDEX IF NOT EXISTS idx_pending_tx_signature 
      ON pending_transactions (tx_signature);
    
    -- Find pending transactions for a ticket
    CREATE INDEX IF NOT EXISTS idx_pending_tx_ticket 
      ON pending_transactions (ticket_id) WHERE status = 'pending';
    
    -- Find all pending for confirmation job
    CREATE INDEX IF NOT EXISTS idx_pending_tx_status 
      ON pending_transactions (status, submitted_at) WHERE status IN ('pending', 'confirming');
    
    -- Find expired transactions
    CREATE INDEX IF NOT EXISTS idx_pending_tx_expired 
      ON pending_transactions (last_valid_block_height) WHERE status = 'pending';
    
    -- Sync log by ticket
    CREATE INDEX IF NOT EXISTS idx_sync_log_ticket 
      ON blockchain_sync_log (ticket_id, created_at DESC);
    
    -- Sync log by severity for alerts
    CREATE INDEX IF NOT EXISTS idx_sync_log_severity 
      ON blockchain_sync_log (severity, created_at DESC) 
      WHERE severity IN ('error', 'critical');

    -- ==========================================================================
    -- HELPER FUNCTIONS
    -- ==========================================================================

    -- Function to create a pending transaction record
    CREATE OR REPLACE FUNCTION create_pending_transaction(
      p_tenant_id UUID,
      p_tx_signature VARCHAR,
      p_tx_type VARCHAR,
      p_ticket_id UUID DEFAULT NULL,
      p_event_id UUID DEFAULT NULL,
      p_from_user_id UUID DEFAULT NULL,
      p_to_user_id UUID DEFAULT NULL,
      p_blockhash VARCHAR DEFAULT NULL,
      p_last_valid_block_height BIGINT DEFAULT NULL
    ) RETURNS UUID AS $$
    DECLARE
      tx_id UUID;
    BEGIN
      INSERT INTO pending_transactions (
        tenant_id, tx_signature, tx_type, ticket_id, event_id,
        from_user_id, to_user_id, blockhash, last_valid_block_height
      ) VALUES (
        p_tenant_id, p_tx_signature, p_tx_type, p_ticket_id, p_event_id,
        p_from_user_id, p_to_user_id, p_blockhash, p_last_valid_block_height
      )
      RETURNING id INTO tx_id;
      
      RETURN tx_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Function to confirm a transaction
    CREATE OR REPLACE FUNCTION confirm_transaction(
      p_tx_signature VARCHAR,
      p_slot BIGINT,
      p_block_time TIMESTAMPTZ DEFAULT NULL
    ) RETURNS BOOLEAN AS $$
    DECLARE
      tx_record RECORD;
    BEGIN
      -- Get and lock the transaction record
      SELECT * INTO tx_record
      FROM pending_transactions
      WHERE tx_signature = p_tx_signature
      FOR UPDATE;
      
      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;
      
      -- Update status to confirmed
      UPDATE pending_transactions
      SET 
        status = 'confirmed',
        slot = p_slot,
        block_time = COALESCE(p_block_time, NOW()),
        confirmed_at = NOW(),
        updated_at = NOW()
      WHERE tx_signature = p_tx_signature;
      
      -- Log the confirmation
      INSERT INTO blockchain_sync_log (
        tenant_id, event_type, tx_signature, ticket_id,
        action_taken, severity
      ) VALUES (
        tx_record.tenant_id, 'transaction_confirmed', p_tx_signature,
        tx_record.ticket_id, 'status_updated', 'info'
      );
      
      RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Function to fail a transaction
    CREATE OR REPLACE FUNCTION fail_transaction(
      p_tx_signature VARCHAR,
      p_error_code VARCHAR,
      p_error_message TEXT DEFAULT NULL
    ) RETURNS BOOLEAN AS $$
    DECLARE
      tx_record RECORD;
    BEGIN
      SELECT * INTO tx_record
      FROM pending_transactions
      WHERE tx_signature = p_tx_signature
      FOR UPDATE;
      
      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;
      
      UPDATE pending_transactions
      SET 
        status = 'failed',
        error_code = p_error_code,
        error_message = p_error_message,
        failed_at = NOW(),
        updated_at = NOW()
      WHERE tx_signature = p_tx_signature;
      
      -- Log the failure with error severity
      INSERT INTO blockchain_sync_log (
        tenant_id, event_type, tx_signature, ticket_id,
        action_taken, severity, metadata
      ) VALUES (
        tx_record.tenant_id, 'transaction_failed', p_tx_signature,
        tx_record.ticket_id, 'marked_failed', 'error',
        jsonb_build_object('error_code', p_error_code, 'error_message', p_error_message)
      );
      
      RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Function to check if ticket has pending transactions
    CREATE OR REPLACE FUNCTION has_pending_transaction(
      p_ticket_id UUID
    ) RETURNS BOOLEAN AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM pending_transactions
        WHERE ticket_id = p_ticket_id
          AND status IN ('pending', 'confirming')
      );
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    -- Function to wait for transaction confirmation (for use in application)
    CREATE OR REPLACE FUNCTION get_pending_transaction_status(
      p_tx_signature VARCHAR
    ) RETURNS TABLE (
      status VARCHAR,
      confirmation_count INT,
      slot BIGINT,
      error_code VARCHAR,
      error_message TEXT
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        pt.status,
        pt.confirmation_count,
        pt.slot,
        pt.error_code,
        pt.error_message
      FROM pending_transactions pt
      WHERE pt.tx_signature = p_tx_signature;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    -- Add comments
    COMMENT ON TABLE pending_transactions IS 
      'Tracks blockchain transactions from submission to confirmation for DB-blockchain consistency';
    COMMENT ON TABLE blockchain_sync_log IS 
      'Audit log of blockchain synchronization events for debugging and alerting';
  `);

  console.log('Migration 003_add_blockchain_tracking completed successfully');
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    -- Drop functions first
    DROP FUNCTION IF EXISTS get_pending_transaction_status;
    DROP FUNCTION IF EXISTS has_pending_transaction;
    DROP FUNCTION IF EXISTS fail_transaction;
    DROP FUNCTION IF EXISTS confirm_transaction;
    DROP FUNCTION IF EXISTS create_pending_transaction;
    
    -- Drop tables (cascades policies and indexes)
    DROP TABLE IF EXISTS blockchain_sync_log CASCADE;
    DROP TABLE IF EXISTS pending_transactions CASCADE;
  `);

  console.log('Migration 003_add_blockchain_tracking rolled back successfully');
}
