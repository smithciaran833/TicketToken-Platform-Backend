import { Pool } from 'pg';
import logger from '../utils/logger';
import { ticketServiceClient, authServiceClient, RequestContext } from '@tickettoken/shared';

/**
 * TRANSFER RULES SERVICE
 * 
 * Enforces transfer restrictions and business rules
 * Phase 6: Enhanced Features & Business Logic
 * 
 * PHASE 5c REFACTORED:
 * - Replaced direct tickets/events table join with ticketServiceClient
 * - Replaced direct users table query with authServiceClient
 */

/**
 * Helper to create request context for service calls
 */
function createRequestContext(tenantId: string): RequestContext {
  return {
    tenantId,
    traceId: `transfer-rules-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

export interface TransferRule {
  id: string;
  name: string;
  ruleType: string;
  enabled: boolean;
  config: any;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  violatedRules?: string[];
}

export class TransferRulesService {
  constructor(private readonly pool: Pool) {}

  /**
   * Validate transfer against all rules
   */
  async validateTransfer(params: {
    ticketId: string;
    ticketTypeId: string;
    eventId: string;
    fromUserId: string;
    toUserId?: string;
    toEmail?: string;
    tenantId: string;
  }): Promise<ValidationResult> {
    const { ticketId, ticketTypeId, eventId, tenantId } = params;

    try {
      // Get all active transfer rules for this ticket type/event - transfer_service owned table
      const rulesResult = await this.pool.query(`
        SELECT * FROM transfer_rules
        WHERE (ticket_type_id = $1 OR event_id = $2 OR (ticket_type_id IS NULL AND event_id IS NULL))
          AND is_active = true
        ORDER BY priority DESC
      `, [ticketTypeId, eventId]);

      const violatedRules: string[] = [];

      // Check each rule
      for (const rule of rulesResult.rows) {
        const checkResult = await this.checkRule(rule, { ...params, tenantId });
        if (!checkResult.allowed) {
          violatedRules.push(rule.rule_name);
          
          // Stop on first blocking rule
          if (rule.is_blocking) {
            return {
              allowed: false,
              reason: checkResult.reason || `Transfer blocked by rule: ${rule.rule_name}`,
              violatedRules
            };
          }
        }
      }

      // If we have non-blocking violations, log them but allow
      if (violatedRules.length > 0) {
        logger.warn('Non-blocking transfer rules violated', {
          ticketId,
          violatedRules
        });
      }

      return {
        allowed: true,
        violatedRules: violatedRules.length > 0 ? violatedRules : undefined
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to validate transfer rules');
      throw error;
    }
  }

  /**
   * Check individual rule
   */
  private async checkRule(
    rule: any,
    params: {
      ticketId: string;
      fromUserId: string;
      toUserId?: string;
      tenantId: string;
    }
  ): Promise<ValidationResult> {
    const { ticketId, fromUserId, toUserId, tenantId } = params;

    switch (rule.rule_type) {
      case 'MAX_TRANSFERS_PER_TICKET':
        return await this.checkMaxTransfersPerTicket(ticketId, rule.config);

      case 'MAX_TRANSFERS_PER_USER_PER_DAY':
        return await this.checkMaxTransfersPerUserPerDay(fromUserId, rule.config);

      case 'BLACKLIST_CHECK':
        return await this.checkBlacklist(fromUserId, toUserId);

      case 'COOLING_PERIOD':
        return await this.checkCoolingPeriod(ticketId, rule.config);

      case 'EVENT_DATE_PROXIMITY':
        return await this.checkEventDateProximity(ticketId, rule.config, tenantId);

      case 'IDENTITY_VERIFICATION':
        return await this.checkIdentityVerification(fromUserId, toUserId, rule.config, tenantId);

      default:
        logger.warn('Unknown rule type', { ruleType: rule.rule_type });
        return { allowed: true };
    }
  }

  /**
   * Check max transfers per ticket - transfer_service owned table
   */
  private async checkMaxTransfersPerTicket(
    ticketId: string,
    config: any
  ): Promise<ValidationResult> {
    const maxTransfers = config.max_transfers || 5;

    const result = await this.pool.query(`
      SELECT COUNT(*) as transfer_count
      FROM ticket_transfers
      WHERE ticket_id = $1
        AND status = 'COMPLETED'
    `, [ticketId]);

    const count = parseInt(result.rows[0].transfer_count);

    if (count >= maxTransfers) {
      return {
        allowed: false,
        reason: `Ticket has exceeded maximum transfers (${maxTransfers})`
      };
    }

    return { allowed: true };
  }

  /**
   * Check max transfers per user per day - transfer_service owned table
   */
  private async checkMaxTransfersPerUserPerDay(
    userId: string,
    config: any
  ): Promise<ValidationResult> {
    const maxPerDay = config.max_per_day || 10;

    const result = await this.pool.query(`
      SELECT COUNT(*) as transfer_count
      FROM ticket_transfers
      WHERE from_user_id = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
    `, [userId]);

    const count = parseInt(result.rows[0].transfer_count);

    if (count >= maxPerDay) {
      return {
        allowed: false,
        reason: `User has exceeded daily transfer limit (${maxPerDay})`
      };
    }

    return { allowed: true };
  }

  /**
   * Check user blacklist - transfer_service owned table
   */
  private async checkBlacklist(
    fromUserId: string,
    toUserId?: string
  ): Promise<ValidationResult> {
    const result = await this.pool.query(`
      SELECT user_id, reason
      FROM user_blacklist
      WHERE user_id = ANY($1::uuid[])
        AND is_active = true
    `, [[fromUserId, toUserId].filter(Boolean)]);

    if (result.rows.length > 0) {
      const blacklistedUser = result.rows[0];
      return {
        allowed: false,
        reason: `User is blacklisted: ${blacklistedUser.reason}`
      };
    }

    return { allowed: true };
  }

  /**
   * Check cooling period between transfers - transfer_service owned table
   */
  private async checkCoolingPeriod(
    ticketId: string,
    config: any
  ): Promise<ValidationResult> {
    const coolingHours = config.cooling_hours || 24;

    const result = await this.pool.query(`
      SELECT MAX(created_at) as last_transfer
      FROM ticket_transfers
      WHERE ticket_id = $1
        AND status = 'COMPLETED'
    `, [ticketId]);

    if (result.rows[0].last_transfer) {
      const lastTransfer = new Date(result.rows[0].last_transfer);
      const hoursSince = (Date.now() - lastTransfer.getTime()) / (1000 * 60 * 60);

      if (hoursSince < coolingHours) {
        return {
          allowed: false,
          reason: `Cooling period active. Wait ${Math.ceil(coolingHours - hoursSince)} more hours`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * REFACTORED: Check proximity to event date
   * Uses ticketServiceClient instead of direct tickets/events table join
   */
  private async checkEventDateProximity(
    ticketId: string,
    config: any,
    tenantId: string
  ): Promise<ValidationResult> {
    const minDaysBefore = config.min_days_before_event || 7;
    const ctx = createRequestContext(tenantId);

    try {
      // REFACTORED: Get event date via ticketServiceClient instead of direct DB join
      const eventInfo = await ticketServiceClient.getTicketEventDate(ticketId, ctx);
      
      if (eventInfo && eventInfo.eventStartDate) {
        const daysUntil = eventInfo.daysUntilEvent;

        if (daysUntil < minDaysBefore) {
          return {
            allowed: false,
            reason: `Too close to event date. Transfers blocked within ${minDaysBefore} days`
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      logger.warn({ error, ticketId }, 'Failed to check event date proximity, allowing transfer');
      return { allowed: true };
    }
  }

  /**
   * REFACTORED: Check identity verification requirements
   * Uses authServiceClient instead of direct users table query
   */
  private async checkIdentityVerification(
    fromUserId: string,
    toUserId: string | undefined,
    config: any,
    tenantId: string
  ): Promise<ValidationResult> {
    const requireVerification = config.require_verification || false;

    if (!requireVerification) {
      return { allowed: true };
    }

    const userIds = [fromUserId, toUserId].filter(Boolean) as string[];
    const ctx = createRequestContext(tenantId);
    
    try {
      // REFACTORED: Get identity verification status via authServiceClient instead of direct DB query
      const result = await authServiceClient.batchIdentityCheck(userIds, ctx);

      if (!result.allVerified) {
        return {
          allowed: false,
          reason: 'Identity verification required for all parties'
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.warn({ error, userIds }, 'Failed to check identity verification, rejecting transfer');
      return {
        allowed: false,
        reason: 'Unable to verify identity status'
      };
    }
  }
}
