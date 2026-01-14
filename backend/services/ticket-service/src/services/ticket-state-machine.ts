/**
 * TICKET STATE MACHINE
 * 
 * Fixes Batch 7 audit findings:
 * 1. All states defined (including MINTED, ACTIVE, CHECKED_IN)
 * 2. States match DB/code (UPPERCASE enum, lowercase DB)
 * 3. Invalid transitions throw
 * 4. Validation before update
 * 5. Status before check-in
 * 6. Time window validation
 * 7. Transfer history on-chain (integration)
 * 8. Reasons enumerated
 * 9. Revoked unusable
 * 10. Holder notified
 * 11. Refund triggered
 * 12. Admin auth required
 * 13. Authorized roles only (RBAC)
 */

import { DatabaseService } from './databaseService';
import { QueueService } from './queueService';
import { SolanaService } from './solanaService';
import { logger } from '../utils/logger';
import { ValidationError, ForbiddenError, NotFoundError } from '../utils/errors';

const log = logger.child({ component: 'TicketStateMachine' });

// =============================================================================
// TICKET STATUS ENUM - Item #1, #2
// Defines ALL valid ticket states with UPPERCASE names matching DB lowercase
// =============================================================================

export enum TicketStatus {
  // Pre-purchase states
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  
  // Purchase states
  SOLD = 'sold',
  MINTED = 'minted',    // NEW: After NFT is minted on blockchain
  
  // Active ownership states
  ACTIVE = 'active',    // Ticket is ready to use
  TRANSFERRED = 'transferred',
  
  // Usage states
  CHECKED_IN = 'checked_in',  // Terminal: Ticket has been scanned at venue
  USED = 'used',              // Alias for checked_in
  
  // Terminal/Invalid states
  REVOKED = 'revoked',   // Admin cancelled with reason
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

// =============================================================================
// REVOCATION REASONS ENUM - Item #8
// =============================================================================

export enum RevocationReason {
  FRAUD_DETECTED = 'fraud_detected',
  CHARGEBACK = 'chargeback',
  EVENT_CANCELLED = 'event_cancelled',
  DUPLICATE_TICKET = 'duplicate_ticket',
  TERMS_VIOLATION = 'terms_violation',
  ADMIN_REQUEST = 'admin_request',
  REFUND_REQUESTED = 'refund_requested',
  TRANSFER_DISPUTE = 'transfer_dispute',
}

// =============================================================================
// USER ROLES FOR RBAC - Item #13
// =============================================================================

export enum UserRole {
  USER = 'user',
  VENUE_ADMIN = 'venue_admin',
  EVENT_ADMIN = 'event_admin',
  SUPER_ADMIN = 'super_admin',
  SYSTEM = 'system',  // For automated processes
}

// =============================================================================
// VALID STATE TRANSITIONS - Item #3
// =============================================================================

export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  // Pre-purchase: Can move to sold or cancelled
  [TicketStatus.AVAILABLE]: [
    TicketStatus.RESERVED, 
    TicketStatus.SOLD, 
    TicketStatus.CANCELLED
  ],
  
  // Reserved: Can expire, sell, or release back
  [TicketStatus.RESERVED]: [
    TicketStatus.AVAILABLE, 
    TicketStatus.SOLD, 
    TicketStatus.EXPIRED, 
    TicketStatus.CANCELLED
  ],
  
  // Sold: Waiting for NFT mint
  [TicketStatus.SOLD]: [
    TicketStatus.MINTED,
    TicketStatus.REFUNDED, 
    TicketStatus.CANCELLED
  ],
  
  // Minted: NFT created, activating ticket
  [TicketStatus.MINTED]: [
    TicketStatus.ACTIVE,
    TicketStatus.REFUNDED,
    TicketStatus.REVOKED,
  ],
  
  // Active: Ready to use
  [TicketStatus.ACTIVE]: [
    TicketStatus.TRANSFERRED, 
    TicketStatus.CHECKED_IN, 
    TicketStatus.REFUNDED, 
    TicketStatus.REVOKED,
  ],
  
  // Transferred: Can be transferred again, checked in, or revoked
  [TicketStatus.TRANSFERRED]: [
    TicketStatus.ACTIVE,
    TicketStatus.TRANSFERRED, 
    TicketStatus.CHECKED_IN, 
    TicketStatus.REFUNDED, 
    TicketStatus.REVOKED,
  ],
  
  // TERMINAL STATES - No outgoing transitions
  [TicketStatus.CHECKED_IN]: [],
  [TicketStatus.USED]: [],
  [TicketStatus.REVOKED]: [],
  [TicketStatus.REFUNDED]: [],
  [TicketStatus.EXPIRED]: [],
  [TicketStatus.CANCELLED]: [],
};

// =============================================================================
// RBAC PERMISSIONS - Item #12, #13
// =============================================================================

interface TransitionPermission {
  allowedRoles: UserRole[];
  requiresAdmin?: boolean;
  requiresReason?: boolean;
}

const TRANSITION_PERMISSIONS: Partial<Record<TicketStatus, TransitionPermission>> = {
  [TicketStatus.REVOKED]: {
    allowedRoles: [UserRole.VENUE_ADMIN, UserRole.EVENT_ADMIN, UserRole.SUPER_ADMIN, UserRole.SYSTEM],
    requiresAdmin: true,
    requiresReason: true,
  },
  [TicketStatus.REFUNDED]: {
    allowedRoles: [UserRole.VENUE_ADMIN, UserRole.EVENT_ADMIN, UserRole.SUPER_ADMIN, UserRole.SYSTEM],
    requiresAdmin: true,
    requiresReason: true,
  },
  [TicketStatus.CANCELLED]: {
    allowedRoles: [UserRole.VENUE_ADMIN, UserRole.EVENT_ADMIN, UserRole.SUPER_ADMIN, UserRole.SYSTEM],
    requiresAdmin: true,
    requiresReason: true,
  },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalize status to enum value
 */
export function normalizeStatus(status: string): TicketStatus {
  const upper = status.toUpperCase();
  const lower = status.toLowerCase() as TicketStatus;
  
  // Check if it's a valid TicketStatus
  if (Object.values(TicketStatus).includes(lower)) {
    return lower;
  }
  
  throw new ValidationError(`Unknown ticket status: ${status}`);
}

/**
 * Check if status is terminal
 */
export function isTerminalStatus(status: TicketStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

/**
 * Check if status allows check-in
 */
export function canCheckIn(status: TicketStatus): boolean {
  return [TicketStatus.ACTIVE, TicketStatus.TRANSFERRED].includes(status);
}

// =============================================================================
// STATE MACHINE CLASS
// =============================================================================

export interface TransitionContext {
  ticketId: string;
  tenantId: string;
  userId: string;
  userRole: UserRole;
  reason?: RevocationReason | string;
  eventId?: string;
  eventStartTime?: Date;
  eventEndTime?: Date;
  toUserId?: string;  // For transfers
}

export class TicketStateMachine {
  // =========================================================================
  // VALIDATION - Items #3, #4, #5, #6, #12, #13
  // =========================================================================

  /**
   * Validate a state transition is allowed
   * @throws ValidationError if invalid
   * @throws ForbiddenError if unauthorized
   */
  static validateTransition(
    fromStatus: TicketStatus,
    toStatus: TicketStatus,
    context: TransitionContext
  ): void {
    // Item #3: Check if transition is valid
    const allowedTransitions = VALID_TRANSITIONS[fromStatus];
    
    if (!allowedTransitions) {
      throw new ValidationError(`Unknown source status: ${fromStatus}`);
    }
    
    if (!allowedTransitions.includes(toStatus)) {
      if (isTerminalStatus(fromStatus)) {
        throw new ValidationError(
          `Cannot transition from terminal status '${fromStatus}'`,
          { from: fromStatus, to: toStatus, ticketId: context.ticketId }
        );
      }
      throw new ValidationError(
        `Invalid transition from '${fromStatus}' to '${toStatus}'`,
        { from: fromStatus, to: toStatus, allowed: allowedTransitions }
      );
    }
    
    // Item #12, #13: Check RBAC permissions
    const permission = TRANSITION_PERMISSIONS[toStatus];
    if (permission) {
      if (permission.requiresAdmin && !permission.allowedRoles.includes(context.userRole)) {
        throw new ForbiddenError(
          `Role '${context.userRole}' cannot transition to '${toStatus}'`,
          { requiredRoles: permission.allowedRoles }
        );
      }
      
      if (permission.requiresReason && !context.reason) {
        throw new ValidationError(
          `Reason required for transition to '${toStatus}'`,
          { to: toStatus }
        );
      }
    }
    
    // Item #5, #6: Special validation for check-in
    if (toStatus === TicketStatus.CHECKED_IN) {
      this.validateCheckIn(fromStatus, context);
    }
  }

  /**
   * Item #5, #6: Validate check-in is allowed
   */
  private static validateCheckIn(currentStatus: TicketStatus, context: TransitionContext): void {
    // Item #5: Status must allow check-in
    if (!canCheckIn(currentStatus)) {
      throw new ValidationError(
        `Ticket cannot be checked in from status '${currentStatus}'`,
        { 
          currentStatus, 
          allowedStatuses: [TicketStatus.ACTIVE, TicketStatus.TRANSFERRED] 
        }
      );
    }
    
    // Item #6: Time window validation
    if (context.eventStartTime && context.eventEndTime) {
      const now = new Date();
      const checkInWindowStart = new Date(context.eventStartTime);
      checkInWindowStart.setHours(checkInWindowStart.getHours() - 4); // 4 hours before
      
      const checkInWindowEnd = new Date(context.eventEndTime);
      checkInWindowEnd.setHours(checkInWindowEnd.getHours() + 2); // 2 hours after
      
      if (now < checkInWindowStart) {
        throw new ValidationError(
          'Check-in not yet available. Window opens 4 hours before event.',
          { 
            eventStart: context.eventStartTime, 
            windowOpens: checkInWindowStart,
            currentTime: now
          }
        );
      }
      
      if (now > checkInWindowEnd) {
        throw new ValidationError(
          'Check-in window has closed.',
          { 
            eventEnd: context.eventEndTime, 
            windowClosed: checkInWindowEnd,
            currentTime: now
          }
        );
      }
    }
    
    // Item #9: Verify ticket is not revoked (already covered by state machine but double-check)
    if (currentStatus === TicketStatus.REVOKED) {
      throw new ValidationError('Revoked tickets cannot be used');
    }
  }

  // =========================================================================
  // TRANSITION EXECUTION
  // =========================================================================

  /**
   * Execute a state transition with all validations and side effects
   */
  static async transition(
    fromStatus: TicketStatus,
    toStatus: TicketStatus,
    context: TransitionContext
  ): Promise<void> {
    // Validate the transition
    this.validateTransition(fromStatus, toStatus, context);
    
    log.info('Executing ticket state transition', {
      ticketId: context.ticketId,
      from: fromStatus,
      to: toStatus,
      userId: context.userId,
      reason: context.reason,
    });
    
    // Update database
    await this.updateTicketStatus(context.ticketId, toStatus, context);
    
    // Execute side effects based on target status
    await this.executeSideEffects(toStatus, context);
  }

  /**
   * Update ticket status in database
   */
  private static async updateTicketStatus(
    ticketId: string,
    status: TicketStatus,
    context: TransitionContext
  ): Promise<void> {
    const query = `
      UPDATE tickets 
      SET 
        status = $1,
        status_reason = $2,
        status_changed_by = $3,
        status_changed_at = NOW(),
        updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5
    `;
    
    const result = await DatabaseService.query(query, [
      status,
      context.reason || null,
      context.userId,
      ticketId,
      context.tenantId,
    ]);
    
    if (result.rowCount === 0) {
      throw new NotFoundError('Ticket', { ticketId, tenantId: context.tenantId });
    }
  }

  // =========================================================================
  // SIDE EFFECTS - Items #7, #10, #11
  // =========================================================================

  /**
   * Execute side effects based on status change
   */
  private static async executeSideEffects(
    status: TicketStatus,
    context: TransitionContext
  ): Promise<void> {
    switch (status) {
      case TicketStatus.TRANSFERRED:
        await this.handleTransfer(context);
        break;
        
      case TicketStatus.CHECKED_IN:
        await this.handleCheckIn(context);
        break;
        
      case TicketStatus.REVOKED:
        await this.handleRevocation(context);
        break;
        
      case TicketStatus.REFUNDED:
        await this.handleRefund(context);
        break;
    }
  }

  /**
   * Item #7: Handle transfer - record on-chain
   */
  private static async handleTransfer(context: TransitionContext): Promise<void> {
    if (!context.toUserId) {
      throw new ValidationError('toUserId required for transfer');
    }
    
    try {
      // Record transfer in database
      await DatabaseService.query(
        `INSERT INTO ticket_transfers 
         (ticket_id, tenant_id, from_user_id, to_user_id, transferred_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [context.ticketId, context.tenantId, context.userId, context.toUserId]
      );
      
      // Item #7: Record transfer on blockchain
      const ticket = await DatabaseService.query<{ token_mint: string }>(
        'SELECT token_mint FROM tickets WHERE id = $1',
        [context.ticketId]
      );
      
      if (ticket.rows[0]?.token_mint) {
        // Queue blockchain transfer (actual transfer happens async)
        await QueueService.publish('ticket-transfers', {
          ticketId: context.ticketId,
          fromUserId: context.userId,
          toUserId: context.toUserId,
          tokenMint: ticket.rows[0].token_mint,
        });
      }
      
      // Item #10: Notify holder
      await this.notifyUser(context.toUserId, 'TICKET_RECEIVED', {
        ticketId: context.ticketId,
        fromUserId: context.userId,
      });
      
      await this.notifyUser(context.userId, 'TICKET_TRANSFERRED', {
        ticketId: context.ticketId,
        toUserId: context.toUserId,
      });
      
    } catch (error) {
      log.error('Transfer side effects failed', { context, error });
      throw error;
    }
  }

  /**
   * Handle check-in recording
   */
  private static async handleCheckIn(context: TransitionContext): Promise<void> {
    await DatabaseService.query(
      `UPDATE tickets 
       SET checked_in_at = NOW(), checked_in_by = $1 
       WHERE id = $2`,
      [context.userId, context.ticketId]
    );
    
    // Record in scans table
    await DatabaseService.query(
      `INSERT INTO ticket_scans 
       (ticket_id, tenant_id, scanned_by, scan_type, scan_result, scanned_at)
       VALUES ($1, $2, $3, 'check_in', 'success', NOW())`,
      [context.ticketId, context.tenantId, context.userId]
    );
  }

  /**
   * Item #10: Handle revocation with notification
   */
  private static async handleRevocation(context: TransitionContext): Promise<void> {
    // Get current holder to notify
    const ticket = await DatabaseService.query<{ user_id: string }>(
      'SELECT user_id FROM tickets WHERE id = $1',
      [context.ticketId]
    );
    
    if (ticket.rows[0]) {
      await this.notifyUser(ticket.rows[0].user_id, 'TICKET_REVOKED', {
        ticketId: context.ticketId,
        reason: context.reason,
      });
    }
    
    log.warn('Ticket revoked', {
      ticketId: context.ticketId,
      reason: context.reason,
      revokedBy: context.userId,
    });
  }

  /**
   * Item #11: Handle refund - trigger payment refund
   */
  private static async handleRefund(context: TransitionContext): Promise<void> {
    // Get payment info
    const ticket = await DatabaseService.query<{ 
      user_id: string; 
      payment_id: string;
      price_cents: number;
    }>(
      'SELECT user_id, payment_id, price_cents FROM tickets WHERE id = $1',
      [context.ticketId]
    );
    
    if (ticket.rows[0]) {
      const { user_id, payment_id, price_cents } = ticket.rows[0];
      
      // Queue refund processing
      await QueueService.publish('payment-refunds', {
        ticketId: context.ticketId,
        paymentId: payment_id,
        amountCents: price_cents,
        reason: context.reason,
        requestedBy: context.userId,
      });
      
      // Notify holder
      await this.notifyUser(user_id, 'TICKET_REFUNDED', {
        ticketId: context.ticketId,
        amount: price_cents,
        reason: context.reason,
      });
    }
    
    log.info('Refund triggered', {
      ticketId: context.ticketId,
      reason: context.reason,
    });
  }

  /**
   * Item #10: Send notification to user
   */
  private static async notifyUser(
    userId: string, 
    notificationType: string, 
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      await QueueService.publish('notifications', {
        userId,
        type: notificationType,
        data,
        timestamp: new Date().toISOString(),
      });
      log.debug('Notification queued', { userId, type: notificationType });
    } catch (error) {
      // Don't fail the transition if notification fails
      log.warn('Failed to queue notification', { userId, type: notificationType, error });
    }
  }

  // =========================================================================
  // QUERY HELPERS
  // =========================================================================

  /**
   * Get ticket with event time window for check-in validation
   */
  static async getTicketForCheckIn(
    ticketId: string,
    tenantId: string
  ): Promise<{
    status: TicketStatus;
    eventStartTime: Date;
    eventEndTime: Date;
    userId: string;
  } | null> {
    const result = await DatabaseService.query<{
      status: string;
      event_start: Date;
      event_end: Date;
      user_id: string;
    }>(
      `SELECT t.status, t.user_id, e.start_time as event_start, e.end_time as event_end
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       WHERE t.id = $1 AND t.tenant_id = $2`,
      [ticketId, tenantId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      status: normalizeStatus(row.status),
      eventStartTime: row.event_start,
      eventEndTime: row.event_end,
      userId: row.user_id,
    };
  }
}

export default TicketStateMachine;
