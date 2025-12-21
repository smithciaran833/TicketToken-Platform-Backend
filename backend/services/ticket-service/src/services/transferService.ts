import { QueueService as queueService } from '../services/queueService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface TransferRecord {
  id?: string;
  ticketId?: string;
  fromUserId: string;
  toUserId: string;
  toEmail?: string;
  transferredAt: Date;
  reason?: string;
  status?: string;
}

export class TransferService {
  private log = logger.child({ component: 'TransferService' });

  // Transfer configuration constants
  private readonly TRANSFER_COOLDOWN_MINUTES = 30;
  private readonly MAX_DAILY_TRANSFERS = 10;

  async transferTicket(
    ticketId: string,
    fromUserId: string,
    toUserId: string,
    reason?: string
  ): Promise<TransferRecord> {
    // Validate transfer before processing
    const validation = await this.validateTransferRequest(ticketId, fromUserId, toUserId);
    if (!validation.valid) {
      throw new ValidationError(`Transfer not allowed: ${validation.reason}`);
    }

    return await DatabaseService.transaction(async (client) => {
      // Lock ticket for update
      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE';
      const ticketResult = await client.query(ticketQuery, [ticketId]);

      if (ticketResult.rows.length === 0) {
        throw new NotFoundError('Ticket');
      }

      const ticket = ticketResult.rows[0];

      // Validate ownership
      if (ticket.user_id !== fromUserId) {
        throw new ForbiddenError('You do not own this ticket');
      }

      // Validate ticket status (must be 'active' to transfer)
      if (ticket.status !== 'active') {
        throw new ValidationError(`Cannot transfer ticket with status: ${ticket.status}`);
      }

      // Check if ticket is transferable
      if (ticket.is_transferable === false) {
        throw new ValidationError('This ticket is non-transferable');
      }

      // Enhanced transfer restrictions checking
      const eventQuery = `
        SELECT
          e.*,
          v.transfer_deadline_hours
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        WHERE e.id = $1
      `;
      const eventResult = await client.query(eventQuery, [ticket.event_id]);
      const event = eventResult.rows[0];

      // Check if transfers are allowed for this event
      if (event.allow_transfers === false) {
        throw new ValidationError('Transfers are not allowed for this event');
      }

      // Check transfer deadline
      if (event.start_date && event.transfer_deadline_hours) {
        const hoursUntilEvent = (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilEvent < event.transfer_deadline_hours) {
          throw new ValidationError('Transfer deadline has passed for this event');
        }
      }

      // Check blackout periods
      const now = new Date();
      if (event.transfer_blackout_start && event.transfer_blackout_end) {
        if (now >= new Date(event.transfer_blackout_start) && now <= new Date(event.transfer_blackout_end)) {
          throw new ValidationError('Transfers are currently in blackout period');
        }
      }

      // Check max transfers limit
      const transferCountQuery = `
        SELECT COUNT(*) as transfer_count
        FROM ticket_transfers
        WHERE ticket_id = $1 AND status = 'completed'
      `;
      const transferCountResult = await client.query(transferCountQuery, [ticketId]);
      const transferCount = parseInt(transferCountResult.rows[0].transfer_count);

      if (event.max_transfers_per_ticket && transferCount >= event.max_transfers_per_ticket) {
        throw new ValidationError(`Maximum transfer limit (${event.max_transfers_per_ticket}) reached`);
      }

      // Get recipient email for transfer record
      const recipientQuery = 'SELECT email, identity_verified FROM users WHERE id = $1';
      const recipientResult = await client.query(recipientQuery, [toUserId]);
      
      if (recipientResult.rows.length === 0) {
        throw new NotFoundError('Recipient user');
      }

      const recipient = recipientResult.rows[0];

      // Check identity verification requirement if event requires it
      if (event.require_identity_verification) {
        const fromUserQuery = 'SELECT identity_verified FROM users WHERE id = $1';
        const fromUserResult = await client.query(fromUserQuery, [fromUserId]);
        
        if (!fromUserResult.rows[0]?.identity_verified || !recipient.identity_verified) {
          throw new ValidationError('Identity verification required for transfers');
        }
      }

      // Update ticket ownership and status
      const updateQuery = `
        UPDATE tickets
        SET user_id = $1, status = 'transferred', transfer_count = transfer_count + 1, updated_at = NOW()
        WHERE id = $2
      `;
      await client.query(updateQuery, [toUserId, ticketId]);

      // Create transfer record with all required fields
      const transferId = uuidv4();
      const acceptanceCode = Math.random().toString(36).substring(2, 14).toUpperCase();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const transferQuery = `
        INSERT INTO ticket_transfers
        (id, tenant_id, ticket_id, from_user_id, to_user_id, to_email, transfer_method, 
         status, acceptance_code, is_gift, expires_at, message, transferred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *
      `;
      await client.query(transferQuery, [
        transferId,
        ticket.tenant_id,
        ticketId,
        fromUserId,
        toUserId,
        recipient.email,
        'direct', // Direct transfer between users
        'completed',
        acceptanceCode,
        true, // is_gift
        expiresAt,
        reason || null
      ]);

      // Clear cache (non-blocking)
      try {
        await RedisService.del(`ticket:${ticketId}`);
      } catch (error) {
        this.log.warn('Failed to delete ticket cache, continuing transfer:', error);
      }

      // Publish transfer event
      try {
        await queueService.publish(config.rabbitmq?.queues?.ticketEvents || 'ticket.events', {
          type: 'ticket.transferred',
          ticketId,
          fromUserId,
          toUserId,
          timestamp: new Date()
        });

        // Send notifications
        await queueService.publish(config.rabbitmq?.queues?.notifications || 'notifications', {
          type: 'ticket.transfer.sender',
          userId: fromUserId,
          ticketId,
          toUserId
        });

        await queueService.publish(config.rabbitmq?.queues?.notifications || 'notifications', {
          type: 'ticket.transfer.receiver',
          userId: toUserId,
          ticketId,
          fromUserId
        });
      } catch (error) {
        this.log.warn('Failed to publish transfer events:', error);
      }

      const transferRecord: TransferRecord = {
        id: transferId,
        ticketId,
        fromUserId,
        toUserId,
        toEmail: recipient.email,
        transferredAt: new Date(),
        reason,
        status: 'completed'
      };

      return transferRecord;
    });
  }

  async getTransferHistory(ticketId: string): Promise<TransferRecord[]> {
    const query = `
      SELECT 
        id,
        ticket_id as "ticketId",
        from_user_id as "fromUserId",
        to_user_id as "toUserId",
        to_email as "toEmail",
        transferred_at as "transferredAt",
        message as reason,
        status
      FROM ticket_transfers
      WHERE ticket_id = $1
      ORDER BY transferred_at DESC
    `;

    const result = await DatabaseService.query(query, [ticketId]);
    return result.rows;
  }

  async validateTransferRequest(
    ticketId: string,
    fromUserId: string,
    toUserId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check if users are not the same
      if (fromUserId === toUserId) {
        return { valid: false, reason: 'Cannot transfer ticket to yourself' };
      }

      // Check transfer cooldown period (prevent rapid transfers)
      const cooldownQuery = `
        SELECT transferred_at
        FROM ticket_transfers
        WHERE ticket_id = $1 AND status = 'completed'
        ORDER BY transferred_at DESC
        LIMIT 1
      `;
      const cooldownResult = await DatabaseService.query(cooldownQuery, [ticketId]);

      if (cooldownResult.rows.length > 0) {
        const lastTransfer = new Date(cooldownResult.rows[0].transferred_at);
        const minutesSinceLastTransfer = (Date.now() - lastTransfer.getTime()) / (1000 * 60);

        if (minutesSinceLastTransfer < this.TRANSFER_COOLDOWN_MINUTES) {
          return {
            valid: false,
            reason: `Please wait ${Math.ceil(this.TRANSFER_COOLDOWN_MINUTES - minutesSinceLastTransfer)} minutes before transferring again`
          };
        }
      }

      // Check rate limiting for user transfers
      const rateLimitQuery = `
        SELECT COUNT(*) as transfer_count
        FROM ticket_transfers
        WHERE from_user_id = $1
        AND transferred_at > NOW() - INTERVAL '24 hours'
        AND status = 'completed'
      `;
      const rateLimitResult = await DatabaseService.query(rateLimitQuery, [fromUserId]);
      const dailyTransfers = parseInt(rateLimitResult.rows[0].transfer_count);

      if (dailyTransfers >= this.MAX_DAILY_TRANSFERS) {
        return {
          valid: false,
          reason: `Daily transfer limit (${this.MAX_DAILY_TRANSFERS}) exceeded`
        };
      }

      // Verify recipient can receive tickets
      const recipientQuery = `
        SELECT
          status as account_status,
          can_receive_transfers,
          email_verified
        FROM users
        WHERE id = $1
      `;
      const recipientResult = await DatabaseService.query(recipientQuery, [toUserId]);

      if (recipientResult.rows.length === 0) {
        return { valid: false, reason: 'Recipient user not found' };
      }

      const recipient = recipientResult.rows[0];

      if (recipient.account_status !== 'ACTIVE') {
        return { valid: false, reason: 'Recipient account is not active' };
      }

      if (recipient.can_receive_transfers === false) {
        return { valid: false, reason: 'Recipient cannot receive transfers' };
      }

      if (!recipient.email_verified) {
        return { valid: false, reason: 'Recipient must verify email to receive transfers' };
      }

      // Check ticket exists and is transferable
      const ticketQuery = `
        SELECT
          t.status,
          t.is_transferable,
          t.tenant_id,
          e.id as event_id
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = $1 AND t.deleted_at IS NULL
      `;
      const ticketResult = await DatabaseService.query(ticketQuery, [ticketId]);

      if (ticketResult.rows.length === 0) {
        return { valid: false, reason: 'Ticket not found' };
      }

      const ticket = ticketResult.rows[0];

      if (ticket.is_transferable === false) {
        return { valid: false, reason: 'This ticket is non-transferable' };
      }

      if (ticket.status !== 'active') {
        return { valid: false, reason: `Ticket status '${ticket.status}' does not allow transfers` };
      }

      return { valid: true };
    } catch (error) {
      this.log.error('Transfer validation error:', error);
      return { valid: false, reason: error instanceof Error ? error.message : 'Unknown validation error' };
    }
  }
}

export const transferService = new TransferService();
