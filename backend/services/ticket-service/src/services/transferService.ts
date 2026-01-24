/**
 * Transfer Service - ticket-service
 *
 * PHASE 5c REFACTORED: Service Boundary Fix
 *
 * This service now uses proper service clients for cross-service data:
 * - Events data: EventServiceClient (from @tickettoken/shared)
 * - Users data: AuthServiceClient (from @tickettoken/shared)
 * - Tickets/Transfers: Local database (our domain)
 *
 * CRITICAL: Direct database queries to events and users tables have been replaced
 * with HTTP calls to their respective services.
 */

import { QueueService as queueService } from '../services/queueService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';
import { createRequestContext } from '@tickettoken/shared';
import {
  ExtendedEventServiceClient,
  ExtendedAuthServiceClient,
} from '../clients/extended-clients';

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

// Initialize service clients (using extended clients with additional methods)
const eventServiceClient = new ExtendedEventServiceClient();
const authServiceClient = new ExtendedAuthServiceClient();

export class TransferService {
  private log = logger.child({ component: 'TransferService' });

  // Transfer configuration constants
  private readonly TRANSFER_COOLDOWN_MINUTES = 30;
  private readonly MAX_DAILY_TRANSFERS = 10;

  /**
   * Transfer a ticket to another user
   *
   * SERVICE BOUNDARY:
   * - Event restrictions: Fetched from event-service via HTTP
   * - User verification: Fetched from auth-service via HTTP
   * - Ticket updates: Local database transaction
   */
  async transferTicket(
    ticketId: string,
    fromUserId: string,
    toUserId: string,
    reason?: string,
    tenantId?: string
  ): Promise<TransferRecord> {
    // Validate transfer before processing
    const validation = await this.validateTransferRequest(ticketId, fromUserId, toUserId, tenantId);
    if (!validation.valid) {
      throw new ValidationError(`Transfer not allowed: ${validation.reason}`);
    }

    // Create request context for service calls
    const ctx = createRequestContext(tenantId || 'default', fromUserId);

    // First, get the ticket to find the event_id (local query)
    const ticketPreCheck = await DatabaseService.query(
      `SELECT event_id, tenant_id FROM tickets WHERE id = $1 AND deleted_at IS NULL`,
      [ticketId]
    );

    if (ticketPreCheck.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    const { event_id: eventId, tenant_id: ticketTenantId } = ticketPreCheck.rows[0];

    // SERVICE BOUNDARY FIX: Fetch event restrictions from event-service
    let eventRestrictions;
    try {
      eventRestrictions = await eventServiceClient.getEventTransferRestrictions(eventId, ctx);
    } catch (error: any) {
      this.log.error('Failed to fetch event transfer restrictions', {
        eventId,
        error: error.message
      });
      throw new ValidationError('Unable to verify event transfer restrictions');
    }

    // SERVICE BOUNDARY FIX: Fetch recipient info from auth-service
    let recipientInfo;
    try {
      recipientInfo = await authServiceClient.getUserBasicInfo(toUserId, ctx);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Recipient user');
      }
      this.log.error('Failed to fetch recipient info', {
        toUserId,
        error: error.message
      });
      throw new ValidationError('Unable to verify recipient');
    }

    // Check identity verification if event requires it
    if (eventRestrictions.requireIdentityVerification) {
      let fromUserInfo;
      try {
        fromUserInfo = await authServiceClient.getUserBasicInfo(fromUserId, ctx);
      } catch (error: any) {
        this.log.error('Failed to fetch sender info', {
          fromUserId,
          error: error.message
        });
        throw new ValidationError('Unable to verify sender identity');
      }

      if (!fromUserInfo.identityVerified || !recipientInfo.identityVerified) {
        throw new ValidationError('Identity verification required for transfers');
      }
    }

    // Now execute the database transaction with all validation data
    return await DatabaseService.transaction(async (client) => {
      // Lock ticket for update - only select fields needed for transfer validation
      const ticketQuery = `
        SELECT id, user_id, status, is_transferable, event_id, tenant_id, transfer_count
        FROM tickets
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE
      `;
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

      // Apply event-level restrictions (from event-service data)
      if (eventRestrictions.allowTransfers === false) {
        throw new ValidationError('Transfers are not allowed for this event');
      }

      // Check transfer deadline
      if (eventRestrictions.startDate && eventRestrictions.transferDeadlineHours) {
        const hoursUntilEvent = (new Date(eventRestrictions.startDate).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilEvent < eventRestrictions.transferDeadlineHours) {
          throw new ValidationError('Transfer deadline has passed for this event');
        }
      }

      // Check blackout periods
      const now = new Date();
      if (eventRestrictions.transferBlackoutStart && eventRestrictions.transferBlackoutEnd) {
        if (now >= new Date(eventRestrictions.transferBlackoutStart) &&
            now <= new Date(eventRestrictions.transferBlackoutEnd)) {
          throw new ValidationError('Transfers are currently in blackout period');
        }
      }

      // Check max transfers limit (local query - ticket_transfers is our domain)
      const transferCountQuery = `
        SELECT COUNT(*) as transfer_count
        FROM ticket_transfers
        WHERE ticket_id = $1 AND status = 'completed'
      `;
      const transferCountResult = await client.query(transferCountQuery, [ticketId]);
      const transferCount = parseInt(transferCountResult.rows[0].transfer_count);

      if (eventRestrictions.maxTransfersPerTicket && transferCount >= eventRestrictions.maxTransfersPerTicket) {
        throw new ValidationError(`Maximum transfer limit (${eventRestrictions.maxTransfersPerTicket}) reached`);
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
        ticketTenantId,
        ticketId,
        fromUserId,
        toUserId,
        recipientInfo.email, // From auth-service
        'direct',
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
        toEmail: recipientInfo.email,
        transferredAt: new Date(),
        reason,
        status: 'completed'
      };

      return transferRecord;
    });
  }

  async getTransferHistory(ticketId: string): Promise<TransferRecord[]> {
    // SECURITY: Select only safe fields for transfer history
    // Do NOT select: to_email, acceptance_code, transfer_code (sensitive PII/auth data)
    const query = `
      SELECT
        id,
        ticket_id,
        status,
        transfer_type,
        transfer_method,
        is_gift,
        expires_at,
        transferred_at,
        blockchain_transferred_at,
        created_at,
        updated_at
      FROM ticket_transfers
      WHERE ticket_id = $1
      ORDER BY transferred_at DESC
    `;

    const result = await DatabaseService.query(query, [ticketId]);
    return result.rows;
  }

  /**
   * Validate transfer request
   *
   * SERVICE BOUNDARY:
   * - User validation: Uses auth-service via HTTP
   * - Ticket validation: Local database (our domain)
   */
  async validateTransferRequest(
    ticketId: string,
    fromUserId: string,
    toUserId: string,
    tenantId?: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check if users are not the same
      if (fromUserId === toUserId) {
        return { valid: false, reason: 'Cannot transfer ticket to yourself' };
      }

      // Check transfer cooldown period (prevent rapid transfers) - local query
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

      // Check rate limiting for user transfers - local query
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

      // SERVICE BOUNDARY FIX: Verify recipient via auth-service
      const ctx = createRequestContext(tenantId || 'default', fromUserId);

      try {
        const recipientInfo = await authServiceClient.getUserTransferEligibility(toUserId, ctx);

        if (recipientInfo.accountStatus !== 'ACTIVE') {
          return { valid: false, reason: 'Recipient account is not active' };
        }

        if (recipientInfo.canReceiveTransfers === false) {
          return { valid: false, reason: 'Recipient cannot receive transfers' };
        }

        if (!recipientInfo.emailVerified) {
          return { valid: false, reason: 'Recipient must verify email to receive transfers' };
        }
      } catch (error: any) {
        if (error.statusCode === 404) {
          return { valid: false, reason: 'Recipient user not found' };
        }
        this.log.error('Failed to validate recipient', {
          toUserId,
          error: error.message
        });
        return { valid: false, reason: 'Unable to verify recipient' };
      }

      // Check ticket exists and is transferable - local query (no events JOIN)
      const ticketQuery = `
        SELECT
          status,
          is_transferable,
          tenant_id,
          event_id
        FROM tickets
        WHERE id = $1 AND deleted_at IS NULL
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
