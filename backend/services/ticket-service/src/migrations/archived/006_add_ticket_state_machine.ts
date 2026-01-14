import { Pool } from 'pg';

/**
 * Migration: Add ticket state machine support
 * 
 * Fixes Batch 7 audit findings:
 * - Adds MINTED and REVOKED status to status enum
 * - Adds status tracking columns (reason, changed_by, changed_at)
 * - Adds ticket_transfers table for on-chain transfer history
 * - Adds check constraints for valid status values
 */

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- ==========================================================================
    -- UPDATE STATUS CHECK CONSTRAINT
    -- Batch 7 Fix #1: Add missing MINTED, REVOKED states
    -- ==========================================================================
    
    -- First drop existing constraint if it exists
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
    
    -- Add new constraint with all valid states (lowercase for DB consistency)
    ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
      CHECK (status IN (
        'available',
        'reserved',
        'sold',
        'minted',       -- NEW: After NFT is minted on blockchain
        'active',
        'transferred',
        'checked_in',
        'used',
        'revoked',      -- NEW: Admin cancelled with reason
        'refunded',
        'expired',
        'cancelled'
      ));

    -- ==========================================================================
    -- ADD STATUS TRACKING COLUMNS
    -- Batch 7 Fix #4, #8: Track who changed status and why
    -- ==========================================================================
    
    ALTER TABLE tickets 
      ADD COLUMN IF NOT EXISTS status_reason VARCHAR(255),
      ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS token_mint VARCHAR(64);  -- Solana token mint address

    -- Index for finding tickets by status
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
    CREATE INDEX IF NOT EXISTS idx_tickets_token_mint ON tickets (token_mint) WHERE token_mint IS NOT NULL;

    -- ==========================================================================
    -- TICKET TRANSFERS TABLE
    -- Batch 7 Fix #7: Track transfer history (linked to blockchain)
    -- ==========================================================================
    
    CREATE TABLE IF NOT EXISTS ticket_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID NOT NULL REFERENCES tickets(id),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      from_user_id UUID NOT NULL REFERENCES users(id),
      to_user_id UUID NOT NULL REFERENCES users(id),
      
      -- Blockchain tracking
      tx_signature VARCHAR(128),
      blockchain_confirmed BOOLEAN DEFAULT FALSE,
      blockchain_confirmed_at TIMESTAMPTZ,
      
      -- Timestamps
      transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      
      -- Prevent same transfer from being recorded twice
      CONSTRAINT unique_transfer UNIQUE (ticket_id, from_user_id, to_user_id, transferred_at)
    );

    -- RLS for ticket_transfers
    ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS ticket_transfers_tenant_isolation ON ticket_transfers;
    CREATE POLICY ticket_transfers_tenant_isolation ON ticket_transfers
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

    -- Indexes for ticket_transfers
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket ON ticket_transfers (ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_from ON ticket_transfers (from_user_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_to ON ticket_transfers (to_user_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_transfers_pending ON ticket_transfers (blockchain_confirmed) 
      WHERE blockchain_confirmed = FALSE;

    -- ==========================================================================
    -- REVOCATION REASONS ENUM TYPE
    -- Batch 7 Fix #8: Standardized revocation reasons
    -- ==========================================================================
    
    DO $$ BEGIN
      CREATE TYPE revocation_reason AS ENUM (
        'fraud_detected',
        'chargeback',
        'event_cancelled',
        'duplicate_ticket',
        'terms_violation',
        'admin_request',
        'refund_requested',
        'transfer_dispute'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    -- ==========================================================================
    -- STATUS CHANGE TRIGGER
    -- Automatically track status changes
    -- ==========================================================================
    
    CREATE OR REPLACE FUNCTION ticket_status_change_trigger()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_changed_at = NOW();
        
        -- Log to blockchain_sync_log for auditing
        INSERT INTO blockchain_sync_log (
          tenant_id,
          event_type,
          ticket_id,
          db_state,
          action_taken,
          severity
        ) VALUES (
          NEW.tenant_id,
          'status_changed',
          NEW.id,
          jsonb_build_object(
            'from_status', OLD.status,
            'to_status', NEW.status,
            'reason', NEW.status_reason
          ),
          'status_transition',
          'info'
        );
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS ticket_status_change ON tickets;
    CREATE TRIGGER ticket_status_change
      BEFORE UPDATE OF status ON tickets
      FOR EACH ROW
      EXECUTE FUNCTION ticket_status_change_trigger();

    -- ==========================================================================
    -- HELPER FUNCTIONS
    -- ==========================================================================

    -- Function to check if a ticket can be checked in
    CREATE OR REPLACE FUNCTION can_check_in_ticket(
      p_ticket_id UUID,
      p_event_start TIMESTAMPTZ,
      p_event_end TIMESTAMPTZ
    ) RETURNS BOOLEAN AS $$
    DECLARE
      v_status VARCHAR;
      v_window_start TIMESTAMPTZ;
      v_window_end TIMESTAMPTZ;
    BEGIN
      -- Get ticket status
      SELECT status INTO v_status
      FROM tickets WHERE id = p_ticket_id;
      
      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;
      
      -- Check status is valid for check-in
      IF v_status NOT IN ('active', 'transferred') THEN
        RETURN FALSE;
      END IF;
      
      -- Check time window (4 hours before to 2 hours after)
      v_window_start := p_event_start - INTERVAL '4 hours';
      v_window_end := p_event_end + INTERVAL '2 hours';
      
      RETURN NOW() BETWEEN v_window_start AND v_window_end;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    -- Function to get transfer history for a ticket
    CREATE OR REPLACE FUNCTION get_ticket_transfer_history(
      p_ticket_id UUID
    ) RETURNS TABLE (
      transfer_id UUID,
      from_user_id UUID,
      to_user_id UUID,
      transferred_at TIMESTAMPTZ,
      blockchain_confirmed BOOLEAN,
      tx_signature VARCHAR
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        tt.id,
        tt.from_user_id,
        tt.to_user_id,
        tt.transferred_at,
        tt.blockchain_confirmed,
        tt.tx_signature
      FROM ticket_transfers tt
      WHERE tt.ticket_id = p_ticket_id
      ORDER BY tt.transferred_at ASC;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    -- Add comments
    COMMENT ON TABLE ticket_transfers IS 
      'Transfer history for tickets, linked to blockchain transactions';
    COMMENT ON COLUMN tickets.status_reason IS 
      'Reason for current status (required for revoked/refunded)';
    COMMENT ON COLUMN tickets.token_mint IS 
      'Solana NFT token mint address';
  `);

  console.log('Migration 006_add_ticket_state_machine completed successfully');
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    -- Drop trigger
    DROP TRIGGER IF EXISTS ticket_status_change ON tickets;
    DROP FUNCTION IF EXISTS ticket_status_change_trigger;
    
    -- Drop helper functions
    DROP FUNCTION IF EXISTS get_ticket_transfer_history;
    DROP FUNCTION IF EXISTS can_check_in_ticket;
    
    -- Drop ticket_transfers table
    DROP TABLE IF EXISTS ticket_transfers CASCADE;
    
    -- Drop enum type
    DROP TYPE IF EXISTS revocation_reason;
    
    -- Remove new columns
    ALTER TABLE tickets 
      DROP COLUMN IF EXISTS status_reason,
      DROP COLUMN IF EXISTS status_changed_by,
      DROP COLUMN IF EXISTS status_changed_at,
      DROP COLUMN IF EXISTS checked_in_at,
      DROP COLUMN IF EXISTS checked_in_by,
      DROP COLUMN IF EXISTS token_mint;
    
    -- Restore original status constraint (without minted/revoked)
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
    ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
      CHECK (status IN (
        'available', 'reserved', 'sold', 'active', 'transferred',
        'checked_in', 'used', 'refunded', 'expired', 'cancelled'
      ));
  `);

  console.log('Migration 006_add_ticket_state_machine rolled back successfully');
}
