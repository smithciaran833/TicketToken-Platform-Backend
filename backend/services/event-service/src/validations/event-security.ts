/**
 * Event Security Validator
 * 
 * CRITICAL FIX for audit findings:
 * - Validates event modifications based on sales status (BL2)
 * - Blocks deletion after ticket sales (BL2)
 * - Enforces business rules for event lifecycle
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';
import { getRedis } from '../config/redis';
import {
  ValidationError,
  ForbiddenError,
  BadRequestError,
  EventStateError,
  ErrorCodes
} from '../utils/errors';

export interface EventSecurityConfig {
  maxAdvanceDays: number;
  minAdvanceHours: number;
  maxTicketsPerOrder: number;
  maxTicketsPerCustomer: number;
  /** CRITICAL FIX: Refund window duration in hours after major modification */
  refundWindowHours: number;
  /** Minimum hours before event for modification with refund window */
  minHoursBeforeEventForModification: number;
}

/**
 * CRITICAL FIX: Refund window configuration for major modifications
 */
export interface RefundWindowConfig {
  /** Whether refund window is active */
  isActive: boolean;
  /** When the refund window started */
  startedAt: Date;
  /** When the refund window expires */
  expiresAt: Date;
  /** Reason for refund window */
  reason: string;
  /** Fields that triggered the refund window */
  triggeringFields: string[];
  /** Number of tickets affected */
  affectedTicketCount: number;
}

/**
 * Options for event modification/deletion validation
 */
export interface EventValidationOptions {
  /** Current event data */
  event: {
    id: string;
    status: string;
    starts_at?: Date | string;
  };
  /** Number of tickets already sold for this event */
  soldTicketCount: number;
  /** Whether the user has admin role */
  isAdmin?: boolean;
  /** Whether this is an admin override action */
  forceAdminOverride?: boolean;
}

/**
 * Fields that cannot be modified after tickets have been sold
 * CRITICAL FIX: These require confirmation flow when changed after sales
 */
const CRITICAL_FIELDS_AFTER_SALES = [
  'venue_id',
  'starts_at',
  'ends_at',
  'event_date',
  'total_capacity',
  'timezone'
];

/**
 * Confirmation token for critical field changes
 * Generated when user attempts to change critical fields
 * Must be provided on subsequent request to confirm the change
 */
export interface CriticalChangeConfirmation {
  /** Unique confirmation token */
  confirmationToken: string;
  /** Event ID being modified */
  eventId: string;
  /** Fields being changed */
  fieldsChanging: string[];
  /** Number of tickets that will be affected */
  affectedTicketCount: number;
  /** Whether refund window will open */
  refundWindowOpened: boolean;
  /** Expiration time for the confirmation (5 minutes) */
  expiresAt: Date;
  /** Warning messages to display to user */
  warnings: string[];
}

/**
 * Generate confirmation token for critical changes
 */
function generateConfirmationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Statuses that indicate the event is locked
 */
const LOCKED_STATUSES = ['COMPLETED', 'CANCELLED'];

export class EventSecurityValidator {
  private config: EventSecurityConfig;

  constructor(config?: Partial<EventSecurityConfig>) {
    // Load configuration from environment with defaults
    this.config = {
      maxAdvanceDays: config?.maxAdvanceDays ?? 
        parseInt(process.env.EVENT_MAX_ADVANCE_DAYS || '365', 10),
      minAdvanceHours: config?.minAdvanceHours ?? 
        parseInt(process.env.EVENT_MIN_ADVANCE_HOURS || '2', 10),
      maxTicketsPerOrder: config?.maxTicketsPerOrder ?? 
        parseInt(process.env.EVENT_MAX_TICKETS_PER_ORDER || '10', 10),
      maxTicketsPerCustomer: config?.maxTicketsPerCustomer ?? 
        parseInt(process.env.EVENT_MAX_TICKETS_PER_CUSTOMER || '50', 10),
      // CRITICAL FIX: Refund window defaults
      refundWindowHours: config?.refundWindowHours ?? 
        parseInt(process.env.EVENT_REFUND_WINDOW_HOURS || '48', 10),
      minHoursBeforeEventForModification: config?.minHoursBeforeEventForModification ?? 
        parseInt(process.env.EVENT_MIN_HOURS_BEFORE_MODIFICATION || '72', 10),
    };
  }

  /**
   * CRITICAL FIX: Check if a major modification requires opening a refund window
   * 
   * Returns refund window configuration if one should be opened.
   * A refund window allows ticket holders to request refunds for a limited time
   * after a major event change (date, venue, time).
   * 
   * @param eventId - Event being modified
   * @param data - Fields being changed
   * @param currentEvent - Current event data
   * @param soldTicketCount - Number of tickets sold
   */
  calculateRefundWindow(
    eventId: string,
    data: Record<string, any>,
    currentEvent: { starts_at?: Date | string; venue_id?: string },
    soldTicketCount: number
  ): RefundWindowConfig | null {
    // No refund window needed if no tickets sold
    if (soldTicketCount === 0) {
      return null;
    }

    // Check which major fields are changing
    const majorChanges: string[] = [];
    let reason = '';

    // Date/time change
    if (data.starts_at || data.event_date) {
      const oldDate = currentEvent.starts_at ? new Date(currentEvent.starts_at) : null;
      const newDate = new Date(data.starts_at || data.event_date);
      
      if (oldDate && Math.abs(oldDate.getTime() - newDate.getTime()) > 60 * 60 * 1000) {
        // More than 1 hour change
        majorChanges.push('starts_at');
        reason = 'Event date/time changed';
      }
    }

    // Venue change
    if (data.venue_id && data.venue_id !== currentEvent.venue_id) {
      majorChanges.push('venue_id');
      reason = reason ? `${reason} and venue changed` : 'Event venue changed';
    }

    // No major changes, no refund window
    if (majorChanges.length === 0) {
      return null;
    }

    // Calculate refund window times
    const now = new Date();
    const refundWindowStart = now;
    const refundWindowEnd = new Date(now.getTime() + this.config.refundWindowHours * 60 * 60 * 1000);

    return {
      isActive: true,
      startedAt: refundWindowStart,
      expiresAt: refundWindowEnd,
      reason,
      triggeringFields: majorChanges,
      affectedTicketCount: soldTicketCount,
    };
  }

  /**
   * CRITICAL FIX: Check if modification is allowed based on time until event
   * 
   * Prevents major modifications too close to the event start.
   * 
   * @param eventStartsAt - Event start time
   * @param fieldsBeingChanged - Fields that are being modified
   */
  validateModificationTiming(
    eventStartsAt: Date | string | undefined,
    fieldsBeingChanged: string[]
  ): void {
    if (!eventStartsAt) return;

    const eventStart = new Date(eventStartsAt);
    const now = new Date();
    const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Check if any critical fields are being changed
    const criticalChanges = fieldsBeingChanged.filter(f => 
      CRITICAL_FIELDS_AFTER_SALES.includes(f)
    );

    if (criticalChanges.length > 0 && hoursUntilEvent < this.config.minHoursBeforeEventForModification) {
      throw new ForbiddenError(
        `Cannot modify ${criticalChanges.join(', ')} within ${this.config.minHoursBeforeEventForModification} hours ` +
        `of the event. Event starts in ${Math.round(hoursUntilEvent)} hours.`
      );
    }
  }

  /**
   * Get current config for external use
   */
  getConfig(): EventSecurityConfig {
    return { ...this.config };
  }

  validateTicketPurchase(
    _customerId: string,
    _eventId: string,
    quantity: number,
    existingTicketCount: number
  ): void {
    if (quantity > this.config.maxTicketsPerOrder) {
      throw new ValidationError(
        `Cannot purchase more than ${this.config.maxTicketsPerOrder} tickets per order`,
        [{
          field: 'quantity',
          message: `Exceeds maximum of ${this.config.maxTicketsPerOrder} tickets per order`,
          code: ErrorCodes.VALIDATION_ERROR
        }]
      );
    }

    if (existingTicketCount + quantity > this.config.maxTicketsPerCustomer) {
      throw new ValidationError(
        `Cannot purchase more than ${this.config.maxTicketsPerCustomer} tickets per event`,
        [{
          field: 'quantity',
          message: `Total would exceed maximum of ${this.config.maxTicketsPerCustomer} tickets per customer`,
          code: ErrorCodes.VALIDATION_ERROR
        }]
      );
    }
  }

  validateEventDate(eventDate: Date): void {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + this.config.maxAdvanceDays);
    
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + this.config.minAdvanceHours);

    if (eventDate < minDate) {
      throw new ValidationError(
        `Event must be scheduled at least ${this.config.minAdvanceHours} hours in advance`,
        [{
          field: 'date',
          message: `Event date is too soon (minimum ${this.config.minAdvanceHours} hours in advance)`,
          code: ErrorCodes.VALIDATION_ERROR
        }]
      );
    }

    if (eventDate > maxDate) {
      throw new ValidationError(
        `Event cannot be scheduled more than ${this.config.maxAdvanceDays} days in advance`,
        [{
          field: 'date',
          message: `Event date is too far in future (maximum ${this.config.maxAdvanceDays} days)`,
          code: ErrorCodes.VALIDATION_ERROR
        }]
      );
    }
  }

  /**
   * Validate event modification based on sales status
   * CRITICAL: Blocks changes to critical fields after ticket sales
   * 
   * @param eventId - Event ID being modified
   * @param data - Fields being updated
   * @param options - Validation options including sold ticket count
   * @throws Error if modification is not allowed
   */
  async validateEventModification(
    eventId: string,
    data: Record<string, any>,
    options?: EventValidationOptions
  ): Promise<void> {
    if (!eventId) {
      throw new BadRequestError('Event ID is required for modification', ErrorCodes.BAD_REQUEST);
    }

    // If no options provided (legacy call), just validate date
    if (!options) {
      if (data.date || data.starts_at || data.event_date) {
        const dateValue = data.date || data.starts_at || data.event_date;
        this.validateEventDate(new Date(dateValue));
      }
      return;
    }

    const { event, soldTicketCount, isAdmin, forceAdminOverride } = options;

    // Check if event is in a locked status
    if (LOCKED_STATUSES.includes(event.status)) {
      if (!forceAdminOverride) {
        throw new EventStateError(
          `Cannot modify event with status '${event.status}'`,
          event.status,
          'any'
        );
      }
    }

    // If tickets have been sold, restrict critical field changes
    if (soldTicketCount > 0) {
      const attemptedCriticalChanges = Object.keys(data).filter(
        field => CRITICAL_FIELDS_AFTER_SALES.includes(field)
      );

      if (attemptedCriticalChanges.length > 0) {
        // Admin can override with explicit flag
        if (isAdmin && forceAdminOverride) {
          logger.warn(
            {
              eventId,
              soldTicketCount,
              criticalFields: attemptedCriticalChanges,
              action: 'admin_override_modification'
            },
            `ADMIN OVERRIDE: Modifying critical fields [${attemptedCriticalChanges.join(', ')}] for event ${eventId} with ${soldTicketCount} tickets sold`
          );
          return;
        }

        throw new ForbiddenError(
          `Cannot modify ${attemptedCriticalChanges.join(', ')} after tickets have been sold. ` +
          `${soldTicketCount} ticket(s) already sold. ` +
          (isAdmin ? 'Use admin override to force this change.' : 'Contact support for assistance.')
        );
      }
    }

    // Validate new date if being changed
    if (data.date || data.starts_at || data.event_date) {
      const dateValue = data.date || data.starts_at || data.event_date;
      this.validateEventDate(new Date(dateValue));
    }
  }

  /**
   * Validate event deletion based on sales status
   * CRITICAL: Blocks deletion after ticket sales
   * 
   * @param eventId - Event ID being deleted
   * @param options - Validation options including sold ticket count
   * @throws Error if deletion is not allowed
   */
  async validateEventDeletion(
    eventId: string,
    options?: EventValidationOptions
  ): Promise<void> {
    if (!eventId) {
      throw new BadRequestError('Event ID is required for deletion', ErrorCodes.BAD_REQUEST);
    }

    // If no options provided (legacy call), allow deletion
    if (!options) {
      return;
    }

    const { event, soldTicketCount, isAdmin, forceAdminOverride } = options;

    // Check if event is already completed
    if (event.status === 'COMPLETED') {
      throw new ForbiddenError('Cannot delete a completed event');
    }

    // If tickets have been sold, block deletion unless admin override
    if (soldTicketCount > 0) {
      if (isAdmin && forceAdminOverride) {
        logger.warn(
          {
            eventId,
            soldTicketCount,
            action: 'admin_override_deletion'
          },
          `ADMIN OVERRIDE: Deleting event ${eventId} with ${soldTicketCount} tickets sold. Refunds must be processed separately.`
        );
        return;
      }

      throw new ForbiddenError(
        `Cannot delete event with ${soldTicketCount} ticket(s) sold. ` +
        'Please cancel the event and process refunds instead. ' +
        (isAdmin ? 'Use admin override with forceDelete=true to proceed.' : '')
      );
    }

    // Check if event date has passed
    if (event.starts_at) {
      const eventDate = new Date(event.starts_at);
      if (eventDate < new Date()) {
        throw new ForbiddenError('Cannot delete an event that has already started');
      }
    }
  }

  /**
   * Validate venue capacity against event capacity
   */
  async validateVenueCapacity(requestedCapacity: number, venueCapacity: number): Promise<void> {
    if (requestedCapacity > venueCapacity) {
      throw new ValidationError(
        `Event capacity (${requestedCapacity}) cannot exceed venue capacity (${venueCapacity})`,
        [{
          field: 'capacity',
          message: `Requested capacity exceeds venue capacity of ${venueCapacity}`,
          code: ErrorCodes.VALIDATION_ERROR
        }]
      );
    }
  }

  /**
   * Check if event can transition to the target status
   */
  validateStatusTransition(currentStatus: string, targetStatus: string, soldTicketCount: number): void {
    // Cannot go back to DRAFT if tickets sold
    if (targetStatus === 'DRAFT' && soldTicketCount > 0) {
      throw new EventStateError(
        'Cannot return to DRAFT status after tickets have been sold',
        currentStatus,
        targetStatus
      );
    }

    // Cannot publish cancelled event
    if (currentStatus === 'CANCELLED' && ['PUBLISHED', 'ON_SALE'].includes(targetStatus)) {
      throw new EventStateError(
        'Cannot publish a cancelled event',
        currentStatus,
        targetStatus
      );
    }

    // Cannot cancel completed event
    if (currentStatus === 'COMPLETED' && targetStatus === 'CANCELLED') {
      throw new EventStateError(
        'Cannot cancel a completed event',
        currentStatus,
        targetStatus
      );
    }
  }

  /**
   * CRITICAL FIX: Generate confirmation requirement for critical field changes
   * 
   * This implements a two-step confirmation flow:
   * 1. User attempts to change critical fields
   * 2. System returns confirmation requirement with token
   * 3. User sends same request with confirmation token
   * 4. System validates token and applies changes
   * 
   * @param eventId - Event being modified
   * @param data - Fields being changed
   * @param soldTicketCount - Number of tickets sold
   * @returns Confirmation requirement or null if no confirmation needed
   */
  generateCriticalChangeConfirmation(
    eventId: string,
    data: Record<string, any>,
    soldTicketCount: number
  ): CriticalChangeConfirmation | null {
    // No confirmation needed if no tickets sold
    if (soldTicketCount === 0) {
      return null;
    }

    // Check for critical field changes
    const criticalFieldsChanging = Object.keys(data).filter(
      field => CRITICAL_FIELDS_AFTER_SALES.includes(field)
    );

    // No confirmation needed if no critical fields changing
    if (criticalFieldsChanging.length === 0) {
      return null;
    }

    // Build warnings based on what's changing
    const warnings: string[] = [];

    if (criticalFieldsChanging.includes('venue_id')) {
      warnings.push('Changing venue will affect all ticket holders and may require reissuance.');
    }

    if (criticalFieldsChanging.includes('starts_at') || criticalFieldsChanging.includes('event_date')) {
      warnings.push('Changing event date/time will notify all ticket holders and may trigger refund requests.');
    }

    if (criticalFieldsChanging.includes('total_capacity')) {
      const newCapacity = data.total_capacity;
      if (newCapacity < soldTicketCount) {
        warnings.push(`Cannot reduce capacity below ${soldTicketCount} (tickets already sold).`);
      } else {
        warnings.push(`Reducing capacity may affect future sales availability.`);
      }
    }

    if (criticalFieldsChanging.includes('timezone')) {
      warnings.push('Changing timezone will affect displayed event times for all users.');
    }

    // Generate confirmation requirement
    const confirmation: CriticalChangeConfirmation = {
      confirmationToken: generateConfirmationToken(),
      eventId,
      fieldsChanging: criticalFieldsChanging,
      affectedTicketCount: soldTicketCount,
      refundWindowOpened: criticalFieldsChanging.includes('starts_at') || 
                          criticalFieldsChanging.includes('event_date') ||
                          criticalFieldsChanging.includes('venue_id'),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      warnings,
    };

    return confirmation;
  }

  /**
   * Validate a confirmation token for critical changes
   * 
   * @param confirmation - Previously generated confirmation
   * @param providedToken - Token provided by user
   * @returns true if valid, throws otherwise
   */
  validateConfirmationToken(
    confirmation: CriticalChangeConfirmation,
    providedToken: string
  ): boolean {
    // Check token matches
    if (confirmation.confirmationToken !== providedToken) {
      throw new BadRequestError('Invalid confirmation token', ErrorCodes.BAD_REQUEST);
    }

    // Check not expired
    if (new Date() > confirmation.expiresAt) {
      throw new BadRequestError(
        'Confirmation token has expired. Please retry the operation.',
        ErrorCodes.BAD_REQUEST
      );
    }

    return true;
  }

  /**
   * Check if the given data requires confirmation before modifying
   */
  requiresConfirmation(
    data: Record<string, any>,
    soldTicketCount: number
  ): { required: boolean; fields: string[] } {
    if (soldTicketCount === 0) {
      return { required: false, fields: [] };
    }

    const criticalFields = Object.keys(data).filter(
      field => CRITICAL_FIELDS_AFTER_SALES.includes(field)
    );

    return {
      required: criticalFields.length > 0,
      fields: criticalFields,
    };
  }
}

/**
 * Redis-based distributed confirmation cache
 *
 * IMPLEMENTED: Phase 2 Issue #1 - Redis migration for confirmation tokens
 * Supports horizontal scaling across service instances.
 * Falls back to in-memory Map when Redis unavailable (tests/development).
 */
const CONFIRMATION_CACHE_PREFIX = 'event:confirm:';
const CONFIRMATION_TTL = 5 * 60; // 5 minutes in seconds

// In-memory fallback for tests/development when Redis unavailable
const pendingConfirmationsFallback = new Map<string, CriticalChangeConfirmation>();

/**
 * Store a confirmation requirement in Redis (with in-memory fallback)
 *
 * @param confirmation - The confirmation to store
 */
export async function storePendingConfirmation(confirmation: CriticalChangeConfirmation): Promise<void> {
  const key = `${CONFIRMATION_CACHE_PREFIX}${confirmation.confirmationToken}`;

  try {
    const redis = getRedis();
    await redis.setex(key, CONFIRMATION_TTL, JSON.stringify(confirmation));
    logger.debug({ token: confirmation.confirmationToken.substring(0, 8) }, 'Confirmation stored in Redis');
  } catch (error: any) {
    // Fallback to in-memory for tests/development
    logger.warn({ error: error.message }, 'Redis unavailable, using in-memory fallback for confirmation');
    pendingConfirmationsFallback.set(confirmation.confirmationToken, confirmation);

    // Auto-cleanup after expiry for fallback
    setTimeout(() => {
      pendingConfirmationsFallback.delete(confirmation.confirmationToken);
    }, CONFIRMATION_TTL * 1000);
  }
}

/**
 * Retrieve a pending confirmation by token from Redis (with in-memory fallback)
 *
 * @param token - The confirmation token
 * @returns The confirmation or null if not found/expired
 */
export async function getPendingConfirmation(token: string): Promise<CriticalChangeConfirmation | null> {
  const key = `${CONFIRMATION_CACHE_PREFIX}${token}`;

  try {
    const redis = getRedis();
    const cached = await redis.get(key);

    if (cached) {
      const confirmation = JSON.parse(cached) as CriticalChangeConfirmation;
      // Restore Date objects
      confirmation.expiresAt = new Date(confirmation.expiresAt);
      return confirmation;
    }
    return null;
  } catch (error: any) {
    // Fallback to in-memory
    logger.warn({ error: error.message }, 'Redis unavailable, checking in-memory fallback');
    return pendingConfirmationsFallback.get(token) || null;
  }
}

/**
 * Remove a used confirmation from Redis (with in-memory fallback)
 *
 * @param token - The confirmation token to remove
 */
export async function removePendingConfirmation(token: string): Promise<void> {
  const key = `${CONFIRMATION_CACHE_PREFIX}${token}`;

  try {
    const redis = getRedis();
    await redis.del(key);
    logger.debug({ token: token.substring(0, 8) }, 'Confirmation removed from Redis');
  } catch (error: any) {
    // Fallback to in-memory
    logger.warn({ error: error.message }, 'Redis unavailable, removing from in-memory fallback');
    pendingConfirmationsFallback.delete(token);
  }
}

/**
 * Clear all pending confirmations (for testing purposes)
 */
export async function clearAllPendingConfirmations(): Promise<void> {
  pendingConfirmationsFallback.clear();
  // Note: Redis keys will expire naturally via TTL
}
