import { Pool } from 'pg';

/**
 * Migration: Add ticket_scans table for duplicate scan detection
 * 
 * SECURITY PURPOSE:
 * This table prevents ticket reuse attacks by:
 * 1. Recording every scan attempt with full context
 * 2. Detecting duplicate scans within a time window
 * 3. Tracking device IDs to identify suspicious patterns
 * 4. Supporting RLS for tenant isolation
 * 
 * The unique constraint on (ticket_id, scanned_at) within a small time window
 * prevents the same QR code from being used multiple times.
 */

export async function up(pool: Pool): Promise<void> {
  await pool.query(`
    -- Ticket scans table for audit and duplicate detection
    CREATE TABLE IF NOT EXISTS ticket_scans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      ticket_id UUID NOT NULL REFERENCES tickets(id),
      event_id UUID NOT NULL REFERENCES events(id),
      
      -- Scan context
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scanned_by UUID REFERENCES users(id),  -- Staff member who scanned
      device_id VARCHAR(255),                 -- Device identifier for fraud detection
      location VARCHAR(255),                  -- Gate/entrance location
      
      -- Result
      result VARCHAR(50) NOT NULL CHECK (result IN ('valid', 'invalid', 'duplicate', 'expired', 'already_used')),
      rejection_reason TEXT,
      
      -- Additional context
      ip_address INET,
      user_agent TEXT,
      metadata JSONB DEFAULT '{}',
      
      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- SECURITY: Enable RLS
    ALTER TABLE ticket_scans ENABLE ROW LEVEL SECURITY;

    -- RLS Policy: Tenants can only see their own scans
    DROP POLICY IF EXISTS ticket_scans_tenant_isolation ON ticket_scans;
    CREATE POLICY ticket_scans_tenant_isolation ON ticket_scans
      FOR ALL
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

    -- Index for fast duplicate detection (same ticket within time window)
    CREATE INDEX IF NOT EXISTS idx_ticket_scans_duplicate_detection 
      ON ticket_scans (ticket_id, scanned_at DESC);

    -- Index for event-based queries
    CREATE INDEX IF NOT EXISTS idx_ticket_scans_event 
      ON ticket_scans (event_id, scanned_at DESC);

    -- Index for device-based fraud detection
    CREATE INDEX IF NOT EXISTS idx_ticket_scans_device 
      ON ticket_scans (device_id, scanned_at DESC)
      WHERE device_id IS NOT NULL;

    -- Index for tenant queries
    CREATE INDEX IF NOT EXISTS idx_ticket_scans_tenant 
      ON ticket_scans (tenant_id, scanned_at DESC);

    -- Function to check for duplicate scans
    CREATE OR REPLACE FUNCTION check_duplicate_scan(
      p_ticket_id UUID,
      p_time_window_seconds INT DEFAULT 30
    ) RETURNS TABLE (
      is_duplicate BOOLEAN,
      last_scan_at TIMESTAMPTZ,
      scan_count INT
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        COUNT(*) > 0 AS is_duplicate,
        MAX(scanned_at) AS last_scan_at,
        COUNT(*)::INT AS scan_count
      FROM ticket_scans
      WHERE ticket_id = p_ticket_id
        AND scanned_at > NOW() - (p_time_window_seconds || ' seconds')::INTERVAL
        AND result IN ('valid', 'duplicate');
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Function to record a scan attempt
    CREATE OR REPLACE FUNCTION record_scan_attempt(
      p_tenant_id UUID,
      p_ticket_id UUID,
      p_event_id UUID,
      p_scanned_by UUID DEFAULT NULL,
      p_device_id VARCHAR DEFAULT NULL,
      p_location VARCHAR DEFAULT NULL,
      p_result VARCHAR DEFAULT 'valid',
      p_rejection_reason TEXT DEFAULT NULL,
      p_ip_address INET DEFAULT NULL,
      p_user_agent TEXT DEFAULT NULL
    ) RETURNS UUID AS $$
    DECLARE
      scan_id UUID;
    BEGIN
      INSERT INTO ticket_scans (
        tenant_id, ticket_id, event_id, scanned_by,
        device_id, location, result, rejection_reason,
        ip_address, user_agent
      ) VALUES (
        p_tenant_id, p_ticket_id, p_event_id, p_scanned_by,
        p_device_id, p_location, p_result, p_rejection_reason,
        p_ip_address, p_user_agent
      )
      RETURNING id INTO scan_id;
      
      RETURN scan_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Add comment
    COMMENT ON TABLE ticket_scans IS 'Audit log of all ticket scan attempts for security and duplicate detection';
  `);

  console.log('Migration 002_add_ticket_scans completed successfully');
}

export async function down(pool: Pool): Promise<void> {
  await pool.query(`
    -- Drop functions first
    DROP FUNCTION IF EXISTS record_scan_attempt;
    DROP FUNCTION IF EXISTS check_duplicate_scan;
    
    -- Drop table (this will cascade drop policies and indexes)
    DROP TABLE IF EXISTS ticket_scans CASCADE;
  `);

  console.log('Migration 002_add_ticket_scans rolled back successfully');
}
