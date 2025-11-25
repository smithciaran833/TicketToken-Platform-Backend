import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import {
  Transfer,
  Ticket,
  TicketType,
  User,
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
 * TRANSFER SERVICE
 * 
 * Business logic for ticket transfers
 * Phase 2: Service Layer Separation
 */
export class TransferService {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a gift transfer
   */
  async createGiftTransfer(
    fromUserId: string,
    request: CreateGiftTransferRequest
  ): Promise<CreateGiftTransferResponse> {
    const { ticketId, toEmail, message } = request;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify ticket ownership and lock for update
      const ticket = await this.getTicketForUpdate(client, ticketId, fromUserId);
      
      // Verify ticket is transferable
      const ticketType = await this.getTicketType(client, ticket.ticket_type_id);
      if (!ticketType.is_transferable) {
        throw new TicketNotTransferableError();
      }

      // Get or create recipient user
      const toUserId = await this.getOrCreateUser(client, toEmail);

      // Generate acceptance code
      const acceptanceCode = this.generateAcceptanceCode();
      
      // Calculate expiry time (48 hours by default)
      const expiryHours = parseInt(process.env.TRANSFER_EXPIRY_HOURS || '48');
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      // Create transfer record
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
   */
  async acceptTransfer(
    transferId: string,
    request: AcceptTransferRequest
  ): Promise<AcceptTransferResponse> {
    const { acceptanceCode, userId } = request;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get transfer and lock for update
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

      // Transfer ticket ownership
      await client.query(
        'UPDATE tickets SET user_id = $1, updated_at = NOW() WHERE id = $2',
        [transfer.to_user_id, transfer.ticket_id]
      );

      // Mark transfer as completed
      await client.query(
        `UPDATE ticket_transfers
         SET status = 'COMPLETED', accepted_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [transferId]
      );

      // Create transaction record
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
   * Get ticket with lock for update
   */
  private async getTicketForUpdate(
    client: PoolClient,
    ticketId: string,
    userId: string
  ): Promise<Ticket> {
    const result = await client.query<Ticket>(
      'SELECT * FROM tickets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [ticketId, userId]
    );

    if (result.rows.length === 0) {
      throw new TicketNotFoundError();
    }

    return result.rows[0];
  }

  /**
   * Get ticket type information
   */
  private async getTicketType(
    client: PoolClient,
    ticketTypeId: string
  ): Promise<TicketType> {
    const result = await client.query<TicketType>(
      'SELECT * FROM ticket_types WHERE id = $1',
      [ticketTypeId]
    );

    if (result.rows.length === 0) {
      throw new Error('Ticket type not found');
    }

    return result.rows[0];
  }

  /**
   * Get or create user by email
   */
  private async getOrCreateUser(
    client: PoolClient,
    email: string
  ): Promise<string> {
    // Try to find existing user
    let result = await client.query<User>(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // Create new user
    const newUserId = uuidv4();
    await client.query(
      'INSERT INTO users (id, email, status) VALUES ($1, $2, $3)',
      [newUserId, email, 'pending']
    );

    return newUserId;
  }

  /**
   * Get transfer with lock for update
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

    return result.rows[0];
  }

  /**
   * Mark transfer as expired
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
   * Create transfer transaction record
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
   * Generate random acceptance code
   */
  private generateAcceptanceCode(): string {
    const length = parseInt(process.env.ACCEPTANCE_CODE_LENGTH || '8');
    return Math.random()
      .toString(36)
      .substring(2, 2 + length)
      .toUpperCase();
  }
}
