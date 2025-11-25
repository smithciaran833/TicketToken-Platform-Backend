/**
 * Refund Policy Enforcement Service
 * Manages refund windows and eligibility rules
 */

import { Pool } from 'pg';
import { SafeLogger } from '../utils/pci-log-scrubber.util';
import { cacheService } from './cache.service';

const logger = new SafeLogger('RefundPolicyService');

export interface RefundWindow {
  eventDate: Date;
  purchaseDate: Date;
  refundDeadline: Date;
  isEligible: boolean;
  reason?: string;
  hoursRemaining?: number;
}

export interface RefundStatistics {
  total_refunds: string;
  total_refunded_cents: string | null;
  avg_refund_cents: string | null;
  completed_refunds: string;
  pending_refunds: string;
  rejected_refunds: string;
}

export interface RefundPolicy {
  defaultWindowHours: number;  // Default 48 hours before event
  minimumWindowHours: number;  // Minimum 2 hours before event
  customWindows: {
    venueId?: string;
    eventType?: string;
    windowHours: number;
  }[];
}

export class RefundPolicyService {
  private pool: Pool;
  private defaultPolicy: RefundPolicy = {
    defaultWindowHours: 48,
    minimumWindowHours: 2,
    customWindows: [],
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Check if a ticket is eligible for refund
   */
  async checkRefundEligibility(
    ticketId: string,
    tenantId: string
  ): Promise<RefundWindow> {
    const cacheKey = `refund:eligibility:${ticketId}`;

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        const query = `
          SELECT 
            t.ticket_id,
            t.purchase_date,
            t.status,
            e.event_date,
            e.event_type,
            e.venue_id,
            v.refund_policy_hours
          FROM tickets t
          JOIN events e ON t.event_id = e.event_id
          LEFT JOIN venues v ON e.venue_id = v.venue_id
          WHERE t.ticket_id = $1 
            AND t.tenant_id = $2
            AND t.status != 'refunded'
        `;

        const result = await this.pool.query(query, [ticketId, tenantId]);

        if (result.rows.length === 0) {
          return {
            eventDate: new Date(),
            purchaseDate: new Date(),
            refundDeadline: new Date(),
            isEligible: false,
            reason: 'Ticket not found or already refunded',
          };
        }

        const ticket = result.rows[0];
        const eventDate = new Date(ticket.event_date);
        const purchaseDate = new Date(ticket.purchase_date);

        // Get custom or default refund window
        const windowHours = ticket.refund_policy_hours || 
                           this.getCustomWindow(ticket.venue_id, ticket.event_type) ||
                           this.defaultPolicy.defaultWindowHours;

        // Calculate refund deadline
        const refundDeadline = new Date(eventDate.getTime() - (windowHours * 60 * 60 * 1000));
        const now = new Date();

        // Check minimum window (can't be too close to event)
        const minimumDeadline = new Date(
          eventDate.getTime() - (this.defaultPolicy.minimumWindowHours * 60 * 60 * 1000)
        );

        // Check if eligible
        const isEligible = now <= refundDeadline;
        const hoursRemaining = Math.max(0, (refundDeadline.getTime() - now.getTime()) / (1000 * 60 * 60));

        let reason: string | undefined;
        if (!isEligible) {
          if (now > minimumDeadline) {
            reason = `Event is within ${this.defaultPolicy.minimumWindowHours} hours, refunds not allowed`;
          } else {
            reason = `Refund window closed (deadline was ${refundDeadline.toISOString()})`;
          }
        }

        logger.info('Refund eligibility checked', {
          ticketId,
          isEligible,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        });

        return {
          eventDate,
          purchaseDate,
          refundDeadline,
          isEligible,
          reason,
          hoursRemaining: isEligible ? hoursRemaining : undefined,
        };
      },
      300 // 5 minute cache
    );
  }

  /**
   * Process refund request with validation
   */
  async processRefundRequest(
    ticketId: string,
    tenantId: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; message: string; refundId?: string }> {
    // Check eligibility
    const eligibility = await this.checkRefundEligibility(ticketId, tenantId);

    if (!eligibility.isEligible) {
      logger.warn('Refund request denied', {
        ticketId,
        userId,
        reason: eligibility.reason,
      });

      return {
        success: false,
        message: eligibility.reason || 'Refund not eligible',
      };
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create refund record
      const refundQuery = `
        INSERT INTO payment_refunds (
          ticket_id,
          tenant_id,
          user_id,
          refund_amount_cents,
          refund_reason,
          refund_status,
          requested_at
        )
        SELECT 
          t.ticket_id,
          t.tenant_id,
          $3,
          t.price_cents,
          $4,
          'pending',
          NOW()
        FROM tickets t
        WHERE t.ticket_id = $1 AND t.tenant_id = $2
        RETURNING refund_id, refund_amount_cents
      `;

      const refundResult = await client.query(refundQuery, [
        ticketId,
        tenantId,
        userId,
        reason,
      ]);

      if (refundResult.rows.length === 0) {
        throw new Error('Failed to create refund record');
      }

      const refundId = refundResult.rows[0].refund_id;

      // Update ticket status
      await client.query(
        `UPDATE tickets 
         SET status = 'refund_pending', updated_at = NOW()
         WHERE ticket_id = $1 AND tenant_id = $2`,
        [ticketId, tenantId]
      );

      await client.query('COMMIT');

      // Invalidate cache
      await cacheService.delete(`refund:eligibility:${ticketId}`);

      logger.info('Refund request created', {
        refundId,
        ticketId,
        userId,
      });

      return {
        success: true,
        message: 'Refund request submitted successfully',
        refundId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Refund request failed', {
        ticketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        message: 'Failed to process refund request',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get custom refund window for venue or event type
   */
  private getCustomWindow(venueId?: string, eventType?: string): number | null {
    const customWindow = this.defaultPolicy.customWindows.find(
      (w) => w.venueId === venueId || w.eventType === eventType
    );

    return customWindow?.windowHours || null;
  }

  /**
   * Update refund policy for a venue
   */
  async updateVenueRefundPolicy(
    venueId: string,
    tenantId: string,
    windowHours: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE venues 
       SET refund_policy_hours = $1, updated_at = NOW()
       WHERE venue_id = $2 AND tenant_id = $3`,
      [windowHours, venueId, tenantId]
    );

    logger.info('Venue refund policy updated', { venueId, windowHours });
  }

  /**
   * Get refund statistics for analytics
   */
  async getRefundStatistics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RefundStatistics> {
    const query = `
      SELECT 
        COUNT(*) as total_refunds,
        SUM(refund_amount_cents) as total_refunded_cents,
        AVG(refund_amount_cents) as avg_refund_cents,
        COUNT(CASE WHEN refund_status = 'completed' THEN 1 END) as completed_refunds,
        COUNT(CASE WHEN refund_status = 'pending' THEN 1 END) as pending_refunds,
        COUNT(CASE WHEN refund_status = 'rejected' THEN 1 END) as rejected_refunds
      FROM payment_refunds
      WHERE tenant_id = $1
        AND requested_at BETWEEN $2 AND $3
    `;

    const result = await this.pool.query(query, [tenantId, startDate, endDate]);
    return result.rows[0];
  }
}
