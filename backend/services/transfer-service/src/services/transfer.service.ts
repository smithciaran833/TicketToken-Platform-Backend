import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import logger from '../utils/logger';
import { ticketServiceClient, authServiceClient, RequestContext } from '@tickettoken/shared';
import {
  Transfer,
  CreateGiftTransferRequest,
  CreateGiftTransferResponse,
  AcceptTransferRequest,
  AcceptTransferResponse,
  TransferNotFoundError,
  TransferExpiredError,
  TicketNotFoundError,
  TicketNotTransferableError
} from '../models/transfer.model';

/**
 * Helper to create request context for service calls
 */
function createRequestContext(tenantId: string): RequestContext {
  return {
    tenantId,
    traceId: `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

/**
 * TRANSFER SERVICE
 *
 * Business logic for ticket transfers
 * Phase 2: Service Layer Separation
 * 
 * PHASE 5c REFACTORED:
 * - Replaced direct tickets table query with ticketServiceClient
 * - Replaced direct ticket_types table query with ticketServiceClient
 * - Replaced direct users table query with authServiceClient
 */
export class TransferService {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a gift transfer
   * 
   * REFACTORED: Uses ticketServiceClient for ticket/ticketType and authServiceClient for user
   */
  async createGiftTransfer(
    fromUserId: string,
    request: CreateGiftTransferRequest,
    tenantId: string
  ): Promise<CreateGiftTransferResponse> {
    const { ticketId, toEmail, message } = request;
    const ctx = createRequestContext(tenantId);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // REFACTORED: Verify ticket ownership and transferability via ticketServiceClient
      const ticketResult = await ticketServiceClient.getTicketForTransfer(ticketId, fromUserId, ctx);
      
      if (!ticketResult.ticket) {
        throw new TicketNotFoundError();
      }
      
      if (!ticketResult.transferable) {
        throw new TicketNotTransferableError(ticketResult.reason);
      }

      // REFACTORED: Get or create recipient user via authServiceClient
      const userResult = await authServiceClient.getOrCreateUser(toEmail, ctx, 'gift_transfer');
      const toUserId = userResult.userId;

      // Generate acceptance code
      const acceptanceCode = this.generateAcceptanceCode();

      // Calculate expiry time (48 hours by default)
      const expiryHours = parseInt(process.env.TRANSFER_EXPIRY_HOURS || '48');
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      // Create transfer record - transfer_service owned table
      const transferId = uuidv4();
      await client.query(`
        INSERT INTO ticket_transfers (
          id, ticket_id, from_user_id, to_user_id, to_email,
          transfer_method, status, acceptance_code, message, is_gift,
          expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      `, [
        transferId,
        ticketId,
        fromUserId,
        toUserId,
        toEmail,
        'GIFT',
        'PENDING',
        acceptanceCode,
        message,
        true,
        expiresAt
      ]);

      await client.query('COMMIT');

      logger.info('Gift transfer created', {
        transferId,
        ticketId,
        fromUserId,
        toEmail
      });

      return {
        transferId,
        acceptanceCode,
        status: 'PENDING',
        expiresAt
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Failed to create gift transfer');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Accept a transfer
   * 
   * REFACTORED: Uses ticketServiceClient to transfer ticket ownership
   */
  async acceptTransfer(
    transferId: string,
    request: AcceptTransferRequest,
    tenantId: string
  ): Promise<AcceptTransferResponse> {
    const { acceptanceCode } = request;
    const ctx = createRequestContext(tenantId);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get transfer and lock for update - transfer_service owned table
      const transfer = await this.getTransferForUpdate(
        client,
        transferId,
        acceptanceCode
      );

      // Verify transfer hasn't expired
      if (new Date(transfer.expires_at) < new Date()) {
        await this.expireTransfer(client, transferId);
        throw new TransferExpiredError();
      }

      // REFACTORED: Transfer ticket ownership via ticketServiceClient
      await ticketServiceClient.transferTicket(
        transfer.ticket_id,
        transfer.to_user_id,
        ctx,
        `Gift transfer from ${transfer.from_user_id}`
      );

      // Mark transfer as completed - transfer_service owned table
      await client.query(
        `UPDATE ticket_transfers
         SET status = 'COMPLETED', accepted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [transferId]
      );

      // Create transaction record - transfer_service owned table
      await this.createTransferTransaction(
        client,
        transfer.ticket_id,
        transfer.to_user_id,
        transferId,
        transfer.from_user_id
      );

      await client.query('COMMIT');

      logger.info('Transfer accepted', {
        transferId,
        ticketId: transfer.ticket_id,
        newOwnerId: transfer.to_user_id
      });

      return {
        success: true,
        ticketId: transfer.ticket_id,
        newOwnerId: transfer.to_user_id
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ err: error }, 'Failed to accept transfer');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get transfer with lock for update - transfer_service owned table
   */
  private async getTransferForUpdate(
    client: PoolClient,
    transferId: string,
    acceptanceCode: string
  ): Promise<Transfer> {
    const result = await client.query<Transfer>(
      `SELECT * FROM ticket_transfers
       WHERE id = $1 AND acceptance_code = $2 AND status = 'PENDING'
       FOR UPDATE`,
      [transferId, acceptanceCode]
    );

    if (result.rows.length === 0) {
      throw new TransferNotFoundError('Invalid transfer or acceptance code');
    }

    return result.rows[0]!;
  }

  /**
   * Mark transfer as expired - transfer_service owned table
   */
  private async expireTransfer(
    client: PoolClient,
    transferId: string
  ): Promise<void> {
    await client.query(
      "UPDATE ticket_transfers SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1",
      [transferId]
    );
  }

  /**
   * Create transfer transaction record - transfer_service owned table
   */
  private async createTransferTransaction(
    client: PoolClient,
    ticketId: string,
    userId: string,
    transferId: string,
    fromUserId: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO ticket_transactions (
        id, ticket_id, user_id, transaction_type,
        amount, status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      uuidv4(),
      ticketId,
      userId,
      'TRANSFER_RECEIVED',
      0,
      'COMPLETED',
      JSON.stringify({ transferId, fromUserId })
    ]);
  }

  /**
   * Generate cryptographically secure acceptance code
   *
   * AUDIT FIX SEC-1: Replaced Math.random() with crypto.randomBytes()
   * - Math.random() is not cryptographically secure and can be predicted
   * - crypto.randomBytes() uses OS-level entropy for true randomness
   */
  private generateAcceptanceCode(): string {
    const length = parseInt(process.env.ACCEPTANCE_CODE_LENGTH || '8');
    // Use only alphanumeric characters (excluding ambiguous chars like 0, O, l, 1)
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randomBytes = crypto.randomBytes(length);
    let code = '';

    for (let i = 0; i < length; i++) {
      const byte = randomBytes[i];
      if (byte !== undefined) {
        code += charset[byte % charset.length];
      }
    }

    return code;
  }
}
