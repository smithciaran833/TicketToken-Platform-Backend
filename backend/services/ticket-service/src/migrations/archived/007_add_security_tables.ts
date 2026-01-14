/**
 * MIGRATION: Add Security Tables
 * 
 * Fixes Batch 9 audit findings:
 * - SEC-R11: Account lockout tracking
 * - SEC-EXT11: Spending limits
 * - SEC-EXT12: Multi-sig approval requests
 */

import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // =========================================================================
    // 1. SPENDING LIMITS TABLE (SEC-EXT11)
    // =========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS spending_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        
        -- Limits in cents
        daily_limit INTEGER NOT NULL DEFAULT 100000,       -- $1,000
        weekly_limit INTEGER NOT NULL DEFAULT 500000,      -- $5,000
        monthly_limit INTEGER NOT NULL DEFAULT 2000000,    -- $20,000
        per_transaction_limit INTEGER NOT NULL DEFAULT 50000, -- $500
        
        -- Metadata
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID,
        
        UNIQUE (user_id, tenant_id),
        
        -- Constraints
        CONSTRAINT chk_daily_limit_positive CHECK (daily_limit > 0),
        CONSTRAINT chk_weekly_limit_positive CHECK (weekly_limit > 0),
        CONSTRAINT chk_monthly_limit_positive CHECK (monthly_limit > 0),
        CONSTRAINT chk_per_tx_limit_positive CHECK (per_transaction_limit > 0),
        CONSTRAINT chk_limits_hierarchy CHECK (
          daily_limit <= weekly_limit AND 
          weekly_limit <= monthly_limit AND
          per_transaction_limit <= daily_limit
        )
      )
    `);

    // Add RLS policy for spending_limits
    await client.query(`
      ALTER TABLE spending_limits ENABLE ROW LEVEL SECURITY
    `);

    await client.query(`
      CREATE POLICY spending_limits_tenant_isolation ON spending_limits
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    `);

    // Index for lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_spending_limits_user_tenant 
        ON spending_limits (user_id, tenant_id)
    `);

    // =========================================================================
    // 2. LOCKOUT EVENTS TABLE (SEC-R11) - For audit trail
    // =========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_lockout_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier VARCHAR(255) NOT NULL,      -- Email, user_id, or IP
        identifier_type VARCHAR(50) NOT NULL,  -- 'email', 'user_id', 'ip'
        tenant_id UUID,
        
        event_type VARCHAR(50) NOT NULL,       -- 'failed_attempt', 'locked', 'unlocked'
        failed_attempt_count INTEGER DEFAULT 0,
        reason TEXT,
        
        -- Lockout details (for 'locked' events)
        locked_until TIMESTAMPTZ,
        locked_by VARCHAR(50),                 -- 'system' or admin user_id
        
        -- Unlock details (for 'unlocked' events)
        unlocked_by UUID,
        
        -- Metadata
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes for querying lockout history
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lockout_events_identifier 
        ON account_lockout_events (identifier, created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lockout_events_tenant 
        ON account_lockout_events (tenant_id, created_at DESC) 
        WHERE tenant_id IS NOT NULL
    `);

    // =========================================================================
    // 3. MULTI-SIG APPROVAL REQUESTS TABLE (SEC-EXT12)
    // =========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS multisig_approval_requests (
        id VARCHAR(100) PRIMARY KEY,
        tenant_id UUID NOT NULL,
        
        -- Operation details
        operation_type VARCHAR(100) NOT NULL,
        operation_data JSONB NOT NULL,
        
        -- Request info
        requested_by UUID NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        required_approvals INTEGER NOT NULL DEFAULT 2,
        
        -- Status
        status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, expired, executed
        expires_at TIMESTAMPTZ NOT NULL,
        
        -- Execution details
        executed_at TIMESTAMPTZ,
        executed_by UUID,
        execution_result JSONB,
        
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT chk_status_valid CHECK (
          status IN ('pending', 'approved', 'rejected', 'expired', 'executed')
        ),
        CONSTRAINT chk_required_approvals CHECK (required_approvals > 0)
      )
    `);

    // Approvals table (junction table for many-to-many)
    await client.query(`
      CREATE TABLE IF NOT EXISTS multisig_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR(100) NOT NULL REFERENCES multisig_approval_requests(id) ON DELETE CASCADE,
        
        approver_id UUID NOT NULL,
        approver_role VARCHAR(100) NOT NULL,
        approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        -- Optional cryptographic signature
        signature TEXT,
        signature_algorithm VARCHAR(50),
        
        UNIQUE (request_id, approver_id)
      )
    `);

    // Rejections table
    await client.query(`
      CREATE TABLE IF NOT EXISTS multisig_rejections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR(100) NOT NULL REFERENCES multisig_approval_requests(id) ON DELETE CASCADE,
        
        rejecter_id UUID NOT NULL,
        rejecter_role VARCHAR(100) NOT NULL,
        rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason TEXT NOT NULL,
        
        UNIQUE (request_id, rejecter_id)
      )
    `);

    // RLS for multi-sig tables
    await client.query(`
      ALTER TABLE multisig_approval_requests ENABLE ROW LEVEL SECURITY
    `);

    await client.query(`
      CREATE POLICY multisig_requests_tenant_isolation ON multisig_approval_requests
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    `);

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_multisig_requests_status 
        ON multisig_approval_requests (tenant_id, status, expires_at)
        WHERE status = 'pending'
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_multisig_requests_requested_by 
        ON multisig_approval_requests (requested_by, status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_multisig_approvals_request 
        ON multisig_approvals (request_id)
    `);

    // =========================================================================
    // 4. SPENDING TRANSACTIONS TABLE (for tracking)
    // =========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS spending_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        
        amount_cents INTEGER NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,  -- 'purchase', 'transfer', 'refund'
        transaction_reference VARCHAR(255),      -- External reference (order_id, etc.)
        
        -- Period tracking
        transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
        
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT chk_amount_positive CHECK (amount_cents > 0)
      )
    `);

    await client.query(`
      ALTER TABLE spending_transactions ENABLE ROW LEVEL SECURITY
    `);

    await client.query(`
      CREATE POLICY spending_tx_tenant_isolation ON spending_transactions
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_spending_tx_user_date 
        ON spending_transactions (user_id, tenant_id, transaction_date DESC)
    `);

    await client.query('COMMIT');
    
    console.log('Migration 007_add_security_tables completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Drop tables in reverse order (respecting foreign keys)
    await client.query('DROP TABLE IF EXISTS spending_transactions CASCADE');
    await client.query('DROP TABLE IF EXISTS multisig_rejections CASCADE');
    await client.query('DROP TABLE IF EXISTS multisig_approvals CASCADE');
    await client.query('DROP TABLE IF EXISTS multisig_approval_requests CASCADE');
    await client.query('DROP TABLE IF EXISTS account_lockout_events CASCADE');
    await client.query('DROP TABLE IF EXISTS spending_limits CASCADE');

    await client.query('COMMIT');
    
    console.log('Migration 007_add_security_tables rolled back successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
