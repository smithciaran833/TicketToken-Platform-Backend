import { QueueService as queueService } from '../services/queueService';
import { QUEUES } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import { SolanaService } from './solanaService';
import { TicketStatus, TransferRecord } from '../types';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';

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
      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
      const ticketResult = await client.query(ticketQuery, [ticketId]);

      if (ticketResult.rows.length === 0) {
        throw new NotFoundError('Ticket');
      }

      const ticket = ticketResult.rows[0];

      // Validate ownership
      if (ticket.user_id !== fromUserId) {
        throw new ForbiddenError('You do not own this ticket');
      }

      // Validate ticket status
      if (ticket.status !== TicketStatus.SOLD) {
        throw new ValidationError(`Cannot transfer ticket with status: ${ticket.status}`);
      }

      // Enhanced transfer restrictions checking
      const eventQuery = `
        SELECT 
          e.*, 
          v.transfer_deadline_hours,
          e.allow_transfers,
          e.max_transfers_per_ticket,
          e.transfer_blackout_start,
          e.transfer_blackout_end,
          e.require_identity_verification
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
      const hoursUntilEvent = (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilEvent < event.transfer_deadline_hours) {
        throw new ValidationError('Transfer deadline has passed for this event');
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
        WHERE ticket_id = $1
      `;
      const transferCountResult = await client.query(transferCountQuery, [ticketId]);
      const transferCount = parseInt(transferCountResult.rows[0].transfer_count);
      
      if (event.max_transfers_per_ticket && transferCount >= event.max_transfers_per_ticket) {
        throw new ValidationError(`Maximum transfer limit (${event.max_transfers_per_ticket}) reached`);
      }

      // Check identity verification requirement
      if (event.require_identity_verification) {
        const verificationQuery = `
          SELECT identity_verified 
          FROM users 
          WHERE id IN ($1, $2)
        `;
        const verificationResult = await client.query(verificationQuery, [fromUserId, toUserId]);
        
        for (const user of verificationResult.rows) {
          if (!user.identity_verified) {
            throw new ValidationError('Identity verification required for transfers');
          }
        }
      }

      // Update ticket ownership
      const updateQuery = `
        UPDATE tickets
        SET user_id = $1, status = $2, updated_at = NOW()
        WHERE id = $3
      `;
      await client.query(updateQuery, [toUserId, TicketStatus.TRANSFERRED, ticketId]);

      // Record transfer
      const transferRecord: TransferRecord = {
        fromUserId,
        toUserId,
        transferredAt: new Date(),
        reason
      };

      const transferQuery = `
        INSERT INTO ticket_transfers
        (id, ticket_id, from_user_id, to_user_id, reason, transferred_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await client.query(transferQuery, [
        uuidv4(),
        ticketId,
        fromUserId,
        toUserId,
        reason || null,
        new Date()
      ]);

      // Update transfer history
      const historyQuery = `
        UPDATE tickets
        SET transfer_history = transfer_history || $1::jsonb
        WHERE id = $2
      `;
      await client.query(historyQuery, [
        JSON.stringify([transferRecord]),
        ticketId
      ]);

      // Transfer NFT if minted
      if (ticket.nft_token_id) {
        try {
          const txHash = await SolanaService.transferNFT(
            ticket.nft_token_id,
            fromUserId,
            toUserId
          );

          transferRecord.transactionHash = txHash;

          // Update transfer record with blockchain transaction
          await client.query(
            'UPDATE ticket_transfers SET transaction_hash = $1 WHERE ticket_id = $2 AND transferred_at = $3',
            [txHash, ticketId, transferRecord.transferredAt]
          );
        } catch (error) {
          this.log.error('NFT transfer failed:', error);
          // Continue with database transfer even if blockchain fails
        }
      }

      // Clear cache
      await RedisService.del(`ticket:${ticketId}`);

      // Publish transfer event
      await queueService.publish(config.rabbitmq.queues.ticketEvents, {
        type: 'ticket.transferred',
        ticketId,
        fromUserId,
        toUserId,
        timestamp: new Date()
      });

      // Send notifications
      await queueService.publish(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.sender',
        userId: fromUserId,
        ticketId,
        toUserId
      });

      await queueService.publish(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.receiver',
        userId: toUserId,
        ticketId,
        fromUserId
      });

      return transferRecord;
    });
  }

  async getTransferHistory(ticketId: string): Promise<TransferRecord[]> {
    const query = `
      SELECT * FROM ticket_transfers
      WHERE ticket_id = $1
      ORDER BY transferred_at DESC
    `;

    const result = await DatabaseService.query<TransferRecord>(query, [ticketId]);
    return result.rows;
  }

  async validateTransferRequest(
    ticketId: string,
    fromUserId: string,
    toUserId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check if users exist and are not the same
      if (fromUserId === toUserId) {
        return { valid: false, reason: 'Cannot transfer ticket to yourself' };
      }

      // Check user blacklists
      const blacklistQuery = `
        SELECT 1 FROM user_blacklists 
        WHERE (user_id = $1 OR user_id = $2) 
        AND (action_type = 'transfer' OR action_type = 'all')
        AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      const blacklistResult = await DatabaseService.query(blacklistQuery, [fromUserId, toUserId]);
      
      if (blacklistResult.rows.length > 0) {
        return { valid: false, reason: 'User is blacklisted from transfers' };
      }

      // Check transfer cooldown period (prevent rapid transfers)
      const cooldownQuery = `
        SELECT transferred_at 
        FROM ticket_transfers 
        WHERE ticket_id = $1 
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
          account_status,
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
      
      if (recipient.account_status !== 'active') {
        return { valid: false, reason: 'Recipient account is not active' };
      }
      
      if (recipient.can_receive_transfers === false) {
        return { valid: false, reason: 'Recipient cannot receive transfers' };
      }
      
      if (!recipient.email_verified) {
        return { valid: false, reason: 'Recipient must verify email to receive transfers' };
      }

      // Check ticket-specific transfer rules
      const ticketQuery = `
        SELECT 
          t.status,
          t.is_transferable,
          t.transfer_locked_until,
          e.id as event_id
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = $1
      `;
      const ticketResult = await DatabaseService.query(ticketQuery, [ticketId]);
      
      if (ticketResult.rows.length === 0) {
        return { valid: false, reason: 'Ticket not found' };
      }
      
      const ticket = ticketResult.rows[0];
      
      if (ticket.is_transferable === false) {
        return { valid: false, reason: 'This ticket is non-transferable' };
      }
      
      if (ticket.transfer_locked_until && new Date(ticket.transfer_locked_until) > new Date()) {
        return { 
          valid: false, 
          reason: `Ticket is locked from transfers until ${new Date(ticket.transfer_locked_until).toLocaleString()}` 
        };
      }

      return { valid: true };
    } catch (error) {
      this.log.error('Transfer validation error:', error);
      return { valid: false, reason: error instanceof Error ? error.message : 'Unknown validation error' };
    }
  }
}

export const transferService = new TransferService();
