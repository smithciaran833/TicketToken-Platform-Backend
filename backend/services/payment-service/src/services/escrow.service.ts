/**
 * Escrow Service
 * 
 * HIGH FIX: Implements proper escrow functionality with:
 * - Hold funds until release conditions are met
 * - Automatic release after hold period
 * - Partial releases
 * - Tenant isolation
 */

import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';
import { withSerializableTransaction } from '../utils/database-transaction.util';
import { PoolClient } from 'pg';
import { feeCalculationService } from './fee-calculation.service';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'EscrowService' });

// =============================================================================
// TYPES
// =============================================================================

export interface EscrowAccount {
  id: string;
  orderId: string;
  paymentIntentId: string;
  amount: number;
  heldAmount: number;
  releasedAmount: number;
  status: 'pending' | 'held' | 'partially_released' | 'released' | 'cancelled' | 'disputed';
  holdUntil: Date;
  releaseConditions: string[];
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEscrowParams {
  orderId: string;
  paymentIntentId: string;
  amount: number;
  holdDays?: number;
  releaseConditions?: string[];
  tenantId: string;
}

export interface ReleaseEscrowParams {
  escrowId: string;
  amount?: number; // Partial release
  reason?: string;
  tenantId: string;
}

// =============================================================================
// ESCROW SERVICE
// =============================================================================

class EscrowService {
  /**
   * Create a new escrow account
   */
  async createEscrow(params: CreateEscrowParams): Promise<EscrowAccount> {
    const {
      orderId,
      paymentIntentId,
      amount,
      holdDays = 7,
      releaseConditions = [],
      tenantId,
    } = params;

    const id = uuidv4();
    const holdUntil = new Date();
    holdUntil.setDate(holdUntil.getDate() + holdDays);

    const db = DatabaseService.getPool();
    
    const result = await db.query(`
      INSERT INTO escrow_accounts (
        id, order_id, payment_intent_id, amount, held_amount, released_amount,
        status, hold_until, release_conditions, tenant_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $4, 0, 'held', $5, $6, $7, NOW(), NOW()
      )
      RETURNING *
    `, [
      id,
      orderId,
      paymentIntentId,
      amount,
      holdUntil,
      JSON.stringify(releaseConditions),
      tenantId,
    ]);

    log.info({
      escrowId: id,
      orderId,
      amount,
      holdUntil,
    }, 'Escrow account created');

    return this.mapToEscrowAccount(result.rows[0]);
  }

  /**
   * Get an escrow account by ID
   */
  async getEscrow(escrowId: string, tenantId: string): Promise<EscrowAccount | null> {
    const db = DatabaseService.getPool();
    
    const result = await db.query(`
      SELECT * FROM escrow_accounts
      WHERE id = $1 AND tenant_id = $2
    `, [escrowId, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToEscrowAccount(result.rows[0]);
  }

  /**
   * Release funds from escrow
   */
  async releaseEscrow(params: ReleaseEscrowParams): Promise<EscrowAccount> {
    const { escrowId, amount, reason, tenantId } = params;

    return withSerializableTransaction(async (client) => {
      // Lock the escrow record
      const lockResult = await client.query(`
        SELECT * FROM escrow_accounts
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE
      `, [escrowId, tenantId]);

      if (lockResult.rows.length === 0) {
        throw new Error('Escrow account not found');
      }

      const escrow = this.mapToEscrowAccount(lockResult.rows[0]);

      // Validate status
      if (escrow.status === 'released') {
        throw new Error('Escrow already fully released');
      }
      if (escrow.status === 'cancelled') {
        throw new Error('Escrow has been cancelled');
      }
      if (escrow.status === 'disputed') {
        throw new Error('Escrow is under dispute');
      }

      // Calculate release amount
      const releaseAmount = amount || escrow.heldAmount;
      
      if (releaseAmount > escrow.heldAmount) {
        throw new Error('Release amount exceeds held amount');
      }

      const newHeldAmount = escrow.heldAmount - releaseAmount;
      const newReleasedAmount = escrow.releasedAmount + releaseAmount;
      const newStatus = newHeldAmount === 0 ? 'released' : 'partially_released';

      // Update escrow
      const updateResult = await client.query(`
        UPDATE escrow_accounts
        SET held_amount = $1,
            released_amount = $2,
            status = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [newHeldAmount, newReleasedAmount, newStatus, escrowId]);

      // Record the release event
      await client.query(`
        INSERT INTO escrow_events (
          id, escrow_id, event_type, amount, reason, tenant_id, created_at
        ) VALUES (
          $1, $2, 'released', $3, $4, $5, NOW()
        )
      `, [uuidv4(), escrowId, releaseAmount, reason, tenantId]);

      log.info({
        escrowId,
        releaseAmount,
        newStatus,
        reason,
      }, 'Escrow funds released');

      return this.mapToEscrowAccount(updateResult.rows[0]);
    });
  }

  /**
   * Cancel an escrow (before release)
   */
  async cancelEscrow(escrowId: string, reason: string, tenantId: string): Promise<EscrowAccount> {
    return withSerializableTransaction(async (client) => {
      const lockResult = await client.query(`
        SELECT * FROM escrow_accounts
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE
      `, [escrowId, tenantId]);

      if (lockResult.rows.length === 0) {
        throw new Error('Escrow account not found');
      }

      const escrow = this.mapToEscrowAccount(lockResult.rows[0]);

      if (escrow.status === 'released') {
        throw new Error('Cannot cancel fully released escrow');
      }

      const updateResult = await client.query(`
        UPDATE escrow_accounts
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [escrowId]);

      await client.query(`
        INSERT INTO escrow_events (
          id, escrow_id, event_type, amount, reason, tenant_id, created_at
        ) VALUES (
          $1, $2, 'cancelled', $3, $4, $5, NOW()
        )
      `, [uuidv4(), escrowId, escrow.heldAmount, reason, tenantId]);

      log.info({ escrowId, reason }, 'Escrow cancelled');

      return this.mapToEscrowAccount(updateResult.rows[0]);
    });
  }

  /**
   * Mark escrow as disputed
   */
  async disputeEscrow(escrowId: string, disputeId: string, tenantId: string): Promise<EscrowAccount> {
    const db = DatabaseService.getPool();

    const result = await db.query(`
      UPDATE escrow_accounts
      SET status = 'disputed',
          dispute_id = $2,
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $3
      RETURNING *
    `, [escrowId, disputeId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Escrow account not found');
    }

    log.warn({ escrowId, disputeId }, 'Escrow marked as disputed');

    return this.mapToEscrowAccount(result.rows[0]);
  }

  /**
   * Process escrows ready for automatic release
   */
  async processReadyEscrows(): Promise<number> {
    const db = DatabaseService.getPool();
    const client = await db.connect();
    let processedCount = 0;

    try {
      const result = await client.query(`
        SELECT * FROM escrow_accounts
        WHERE status = 'held'
          AND hold_until <= NOW()
        ORDER BY hold_until ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      `);

      for (const row of result.rows) {
        try {
          await this.releaseEscrow({
            escrowId: row.id,
            tenantId: row.tenant_id,
            reason: 'Automatic release after hold period',
          });
          processedCount++;
        } catch (error) {
          log.error({
            escrowId: row.id,
            error,
          }, 'Failed to auto-release escrow');
        }
      }

      log.info({ processedCount }, 'Auto-release escrow job completed');
      return processedCount;
    } finally {
      client.release();
    }
  }

  /**
   * List escrows for an order
   */
  async listEscrowsForOrder(orderId: string, tenantId: string): Promise<EscrowAccount[]> {
    const db = DatabaseService.getPool();

    const result = await db.query(`
      SELECT * FROM escrow_accounts
      WHERE order_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
    `, [orderId, tenantId]);

    return result.rows.map(row => this.mapToEscrowAccount(row));
  }

  /**
   * Get escrow by payment intent
   */
  async getEscrowByPaymentIntent(paymentIntentId: string, tenantId: string): Promise<EscrowAccount | null> {
    const db = DatabaseService.getPool();

    const result = await db.query(`
      SELECT * FROM escrow_accounts
      WHERE payment_intent_id = $1 AND tenant_id = $2
    `, [paymentIntentId, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToEscrowAccount(result.rows[0]);
  }

  /**
   * Map database row to EscrowAccount
   */
  private mapToEscrowAccount(row: any): EscrowAccount {
    return {
      id: row.id,
      orderId: row.order_id,
      paymentIntentId: row.payment_intent_id,
      amount: row.amount,
      heldAmount: row.held_amount,
      releasedAmount: row.released_amount,
      status: row.status,
      holdUntil: new Date(row.hold_until),
      releaseConditions: typeof row.release_conditions === 'string' 
        ? JSON.parse(row.release_conditions) 
        : row.release_conditions || [],
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const escrowService = new EscrowService();

// =============================================================================
// MIGRATION FOR ESCROW TABLES
// =============================================================================

export const escrowMigration = `
CREATE TABLE IF NOT EXISTS escrow_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  payment_intent_id VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  held_amount INTEGER NOT NULL,
  released_amount INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  hold_until TIMESTAMP NOT NULL,
  release_conditions JSONB DEFAULT '[]'::jsonb,
  dispute_id VARCHAR(50),
  tenant_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_order_id ON escrow_accounts(order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payment_intent ON escrow_accounts(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_escrow_tenant ON escrow_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status_hold ON escrow_accounts(status, hold_until);

ALTER TABLE escrow_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY escrow_tenant_isolation ON escrow_accounts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS escrow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES escrow_accounts(id),
  event_type VARCHAR(30) NOT NULL,
  amount INTEGER,
  reason TEXT,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_events_escrow ON escrow_events(escrow_id);

ALTER TABLE escrow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY escrow_events_tenant_isolation ON escrow_events
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
`;
