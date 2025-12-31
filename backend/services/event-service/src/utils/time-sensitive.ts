/**
 * Time-Sensitive Operations Utilities
 * 
 * CRITICAL FIX for audit findings:
 * - Server-side cutoff enforcement (38-time-sensitive-operations.md)
 * - Deadline checks before operations
 * - Time-based state validation
 */

import { logger } from './logger';

export interface TimingConfig {
  /** How far in advance events must be created (hours) */
  minEventAdvanceHours: number;
  /** Maximum how far in advance events can be created (days) */
  maxEventAdvanceDays: number;
  /** Cutoff before event start when modifications are blocked (hours) */
  modificationCutoffHours: number;
  /** Cutoff before event start when sales must close (minutes) */
  salesEndCutoffMinutes: number;
  /** How long before event start to auto-transition to IN_PROGRESS (minutes) */
  eventStartBufferMinutes: number;
  /** How long after event end to auto-transition to COMPLETED (minutes) */
  eventEndBufferMinutes: number;
}

const DEFAULT_CONFIG: TimingConfig = {
  minEventAdvanceHours: 2,
  maxEventAdvanceDays: 365,
  modificationCutoffHours: 24,
  salesEndCutoffMinutes: 30,
  eventStartBufferMinutes: 15,
  eventEndBufferMinutes: 60,
};

export class TimeSensitiveOperations {
  private config: TimingConfig;

  constructor(config: Partial<TimingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if an event date is valid (not too soon, not too far)
   * CRITICAL: Enforces server-side timing rules
   */
  validateEventTiming(eventDate: Date, now: Date = new Date()): {
    valid: boolean;
    error?: string;
    code?: string;
  } {
    const eventTime = eventDate.getTime();
    const nowTime = now.getTime();

    // Check minimum advance time
    const minAdvanceMs = this.config.minEventAdvanceHours * 60 * 60 * 1000;
    if (eventTime - nowTime < minAdvanceMs) {
      return {
        valid: false,
        error: `Event must be scheduled at least ${this.config.minEventAdvanceHours} hours in advance`,
        code: 'EVENT_TOO_SOON',
      };
    }

    // Check maximum advance time
    const maxAdvanceMs = this.config.maxEventAdvanceDays * 24 * 60 * 60 * 1000;
    if (eventTime - nowTime > maxAdvanceMs) {
      return {
        valid: false,
        error: `Event cannot be scheduled more than ${this.config.maxEventAdvanceDays} days in advance`,
        code: 'EVENT_TOO_FAR',
      };
    }

    return { valid: true };
  }

  /**
   * Check if event modifications are allowed based on timing
   * CRITICAL: Enforces modification cutoff
   */
  canModifyEvent(eventStartTime: Date, now: Date = new Date()): {
    allowed: boolean;
    reason?: string;
    code?: string;
    hoursUntilCutoff?: number;
  } {
    const eventTime = eventStartTime.getTime();
    const nowTime = now.getTime();

    // If event has already started, no modifications allowed
    if (eventTime <= nowTime) {
      return {
        allowed: false,
        reason: 'Event has already started or ended',
        code: 'EVENT_STARTED',
      };
    }

    const cutoffMs = this.config.modificationCutoffHours * 60 * 60 * 1000;
    const timeUntilEvent = eventTime - nowTime;
    const hoursUntilCutoff = Math.max(0, (timeUntilEvent - cutoffMs) / (60 * 60 * 1000));

    if (timeUntilEvent < cutoffMs) {
      return {
        allowed: false,
        reason: `Modifications not allowed within ${this.config.modificationCutoffHours} hours of event start`,
        code: 'MODIFICATION_CUTOFF_PASSED',
        hoursUntilCutoff: 0,
      };
    }

    return {
      allowed: true,
      hoursUntilCutoff: Math.floor(hoursUntilCutoff * 100) / 100,
    };
  }

  /**
   * Check if ticket sales should be allowed based on timing
   * CRITICAL: Enforces sales window
   */
  canSellTickets(
    eventStartTime: Date,
    salesStartTime?: Date,
    salesEndTime?: Date,
    now: Date = new Date()
  ): {
    allowed: boolean;
    reason?: string;
    code?: string;
  } {
    const nowTime = now.getTime();
    const eventTime = eventStartTime.getTime();

    // Check if sales have started
    if (salesStartTime && nowTime < salesStartTime.getTime()) {
      return {
        allowed: false,
        reason: 'Ticket sales have not started yet',
        code: 'SALES_NOT_STARTED',
      };
    }

    // Check if sales have ended
    if (salesEndTime && nowTime > salesEndTime.getTime()) {
      return {
        allowed: false,
        reason: 'Ticket sales have ended',
        code: 'SALES_ENDED',
      };
    }

    // Check automatic cutoff before event start
    const cutoffMs = this.config.salesEndCutoffMinutes * 60 * 1000;
    if (eventTime - nowTime < cutoffMs) {
      return {
        allowed: false,
        reason: `Ticket sales close ${this.config.salesEndCutoffMinutes} minutes before event start`,
        code: 'SALES_CUTOFF_PASSED',
      };
    }

    // Check if event has already started
    if (nowTime >= eventTime) {
      return {
        allowed: false,
        reason: 'Event has already started',
        code: 'EVENT_STARTED',
      };
    }

    return { allowed: true };
  }

  /**
   * Determine what automatic state transition should occur based on timing
   * Used by scheduled jobs to transition events automatically
   */
  getRequiredStateTransition(
    currentStatus: string,
    eventStartTime: Date,
    eventEndTime: Date,
    salesStartTime?: Date,
    salesEndTime?: Date,
    now: Date = new Date()
  ): {
    transition?: string;
    targetStatus?: string;
    reason?: string;
  } {
    const nowTime = now.getTime();
    const eventStart = eventStartTime.getTime();
    const eventEnd = eventEndTime.getTime();

    // Already in terminal state
    if (['COMPLETED', 'CANCELLED'].includes(currentStatus)) {
      return {};
    }

    // Check if event should transition to COMPLETED
    const endBufferMs = this.config.eventEndBufferMinutes * 60 * 1000;
    if (nowTime > eventEnd + endBufferMs && ['IN_PROGRESS'].includes(currentStatus)) {
      return {
        transition: 'END_EVENT',
        targetStatus: 'COMPLETED',
        reason: `Event ended at ${eventEndTime.toISOString()}`,
      };
    }

    // Check if event should transition to IN_PROGRESS
    const startBufferMs = this.config.eventStartBufferMinutes * 60 * 1000;
    if (nowTime >= eventStart - startBufferMs && ['ON_SALE', 'SOLD_OUT', 'PUBLISHED'].includes(currentStatus)) {
      return {
        transition: 'START_EVENT',
        targetStatus: 'IN_PROGRESS',
        reason: `Event starting at ${eventStartTime.toISOString()}`,
      };
    }

    // Check if sales should start automatically
    if (salesStartTime && currentStatus === 'PUBLISHED') {
      if (nowTime >= salesStartTime.getTime()) {
        return {
          transition: 'START_SALES',
          targetStatus: 'ON_SALE',
          reason: `Sales start time reached: ${salesStartTime.toISOString()}`,
        };
      }
    }

    // Check if sales should end automatically
    const salesCutoffMs = this.config.salesEndCutoffMinutes * 60 * 1000;
    if (currentStatus === 'ON_SALE') {
      // Sales end time passed
      if (salesEndTime && nowTime > salesEndTime.getTime()) {
        return {
          transition: 'END_SALES',
          targetStatus: 'PUBLISHED', // Or keep as is
          reason: `Sales end time passed: ${salesEndTime.toISOString()}`,
        };
      }
      // Automatic cutoff before event start
      if (eventStart - nowTime < salesCutoffMs) {
        return {
          transition: 'PAUSE_SALES',
          targetStatus: 'PUBLISHED',
          reason: `Automatic sales cutoff ${this.config.salesEndCutoffMinutes} minutes before event`,
        };
      }
    }

    return {};
  }

  /**
   * Validate timing within a database transaction
   * Returns SQL condition for atomic timing check
   */
  getTimingCheckSQL(eventTableAlias: string = 'e', scheduleTableAlias: string = 's'): string {
    const cutoffHours = this.config.modificationCutoffHours;
    return `
      (${scheduleTableAlias}.starts_at IS NULL 
       OR ${scheduleTableAlias}.starts_at > NOW() + INTERVAL '${cutoffHours} hours')
    `;
  }

  /**
   * Check deadline for a specific operation
   * CRITICAL: Server-side deadline enforcement
   */
  checkDeadline(
    operation: 'purchase' | 'cancel' | 'transfer' | 'refund',
    eventStartTime: Date,
    deadlineHours?: number,
    now: Date = new Date()
  ): {
    allowed: boolean;
    reason?: string;
    deadline?: Date;
  } {
    const defaults: Record<string, number> = {
      purchase: this.config.salesEndCutoffMinutes / 60, // Convert to hours
      cancel: this.config.modificationCutoffHours,
      transfer: 1, // 1 hour before event
      refund: this.config.modificationCutoffHours * 2, // Refunds have longer cutoff
    };

    const cutoffHours = deadlineHours ?? defaults[operation] ?? 24;
    const cutoffMs = cutoffHours * 60 * 60 * 1000;
    const deadline = new Date(eventStartTime.getTime() - cutoffMs);

    if (now.getTime() > deadline.getTime()) {
      return {
        allowed: false,
        reason: `${operation} deadline has passed (${cutoffHours}h before event)`,
        deadline,
      };
    }

    return {
      allowed: true,
      deadline,
    };
  }

  /**
   * Log timing validation result
   */
  logTimingCheck(
    operation: string,
    eventId: string,
    result: { allowed?: boolean; valid?: boolean; reason?: string; error?: string },
    extra: Record<string, any> = {}
  ): void {
    const allowed = result.allowed ?? result.valid ?? false;
    const message = result.reason || result.error;

    if (allowed) {
      logger.debug({
        operation,
        eventId,
        ...extra,
      }, `Timing check passed for ${operation}`);
    } else {
      logger.warn({
        operation,
        eventId,
        reason: message,
        ...extra,
      }, `Timing check failed for ${operation}`);
    }
  }
}

// Export singleton instance with default config
export const timeSensitiveOps = new TimeSensitiveOperations();

// Export factory for custom config
export function createTimeSensitiveOps(config: Partial<TimingConfig>): TimeSensitiveOperations {
  return new TimeSensitiveOperations(config);
}
