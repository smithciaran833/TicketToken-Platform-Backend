/**
 * Venue Analytics Service
 * Calculates real-time venue metrics for tier assignment
 * 
 * FIXES CRITICAL ISSUE: Replaces hardcoded $5,000 monthly volume
 */

import { query } from '../../config/database';
import { SafeLogger } from '../../utils/pci-log-scrubber.util';

const logger = new SafeLogger('VenueAnalyticsService');

export interface VenueMetrics {
  venueId: string;
  monthlyVolumeCents: number;
  transactionCount: number;
  averageTransactionCents: number;
  period: {
    start: Date;
    end: Date;
  };
}

export class VenueAnalyticsService {
  /**
   * Get monthly payment volume for a venue (last 30 days)
   * @param venueId Venue identifier
   * @returns Total volume in cents
   */
  async getMonthlyVolume(venueId: string): Promise<number> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Last 30 days
      
      const result = await query(
        `
        SELECT COALESCE(SUM(venue_payout), 0) as total_volume
        FROM payment_transactions
        WHERE venue_id = $1
          AND status = 'completed'
          AND created_at >= $2
          AND deleted_at IS NULL
        `,
        [venueId, startDate]
      );
      
      const totalVolume = parseInt(result.rows[0]?.total_volume || '0', 10);
      
      logger.info('Monthly volume calculated', {
        venueId,
        totalVolume,
        period: '30_days',
      });
      
      return totalVolume;
    } catch (error) {
      logger.error('Failed to calculate monthly volume', {
        venueId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Fallback to conservative estimate rather than failing
      // This prevents service disruption
      logger.warn('Using fallback volume estimate', { venueId });
      return 0; // Conservative: treat as new venue
    }
  }

  /**
   * Get comprehensive venue metrics
   * @param venueId Venue identifier
   * @param days Number of days to look back (default: 30)
   * @returns Detailed venue metrics
   */
  async getVenueMetrics(venueId: string, days: number = 30): Promise<VenueMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();
    
    try {
      const result = await query(
        `
        SELECT 
          COALESCE(SUM(venue_payout), 0) as total_volume,
          COUNT(*) as transaction_count,
          COALESCE(AVG(venue_payout), 0) as avg_transaction
        FROM payment_transactions
        WHERE venue_id = $1
          AND status = 'completed'
          AND created_at >= $2
          AND deleted_at IS NULL
        `,
        [venueId, startDate]
      );
      
      const row = result.rows[0];
      
      return {
        venueId,
        monthlyVolumeCents: parseInt(row.total_volume || '0', 10),
        transactionCount: parseInt(row.transaction_count || '0', 10),
        averageTransactionCents: parseInt(row.avg_transaction || '0', 10),
        period: {
          start: startDate,
          end: endDate,
        },
      };
    } catch (error) {
      logger.error('Failed to get venue metrics', {
        venueId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Return zero metrics on error
      return {
        venueId,
        monthlyVolumeCents: 0,
        transactionCount: 0,
        averageTransactionCents: 0,
        period: {
          start: startDate,
          end: endDate,
        },
      };
    }
  }

  /**
   * Get venue volume for specific date range
   * @param venueId Venue identifier
   * @param startDate Start of period
   * @param endDate End of period
   * @returns Total volume in cents
   */
  async getVolumeForPeriod(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      const result = await query(
        `
        SELECT COALESCE(SUM(venue_payout), 0) as total_volume
        FROM payment_transactions
        WHERE venue_id = $1
          AND status = 'completed'
          AND created_at >= $2
          AND created_at <= $3
          AND deleted_at IS NULL
        `,
        [venueId, startDate, endDate]
      );
      
      return parseInt(result.rows[0]?.total_volume || '0', 10);
    } catch (error) {
      logger.error('Failed to calculate period volume', {
        venueId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return 0;
    }
  }

  /**
   * Get year-to-date volume for annual reporting
   * @param venueId Venue identifier
   * @returns Total YTD volume in cents
   */
  async getYearToDateVolume(venueId: string): Promise<number> {
    const year = new Date().getFullYear();
    const startDate = new Date(year, 0, 1); // January 1st
    const endDate = new Date();
    
    return this.getVolumeForPeriod(venueId, startDate, endDate);
  }

  /**
   * Get monthly volume trend (last 12 months)
   * Useful for analytics dashboards
   * @param venueId Venue identifier
   * @returns Array of monthly volumes
   */
  async getMonthlyVolumeTrend(venueId: string): Promise<Array<{
    month: string;
    volumeCents: number;
    transactionCount: number;
  }>> {
    try {
      const result = await query(
        `
        SELECT 
          TO_CHAR(created_at, 'YYYY-MM') as month,
          COALESCE(SUM(venue_payout), 0) as volume,
          COUNT(*) as count
        FROM payment_transactions
        WHERE venue_id = $1
          AND status = 'completed'
          AND created_at >= NOW() - INTERVAL '12 months'
          AND deleted_at IS NULL
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month DESC
        `,
        [venueId]
      );
      
      return result.rows.map(row => ({
        month: row.month,
        volumeCents: parseInt(row.volume || '0', 10),
        transactionCount: parseInt(row.count || '0', 10),
      }));
    } catch (error) {
      logger.error('Failed to get monthly trend', {
        venueId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return [];
    }
  }

  /**
   * Check if venue qualifies for tier upgrade
   * @param venueId Venue identifier
   * @param targetTierVolumeThreshold Threshold in cents for next tier
   * @param months Number of months to evaluate (default: 3)
   * @returns True if consistently above threshold
   */
  async qualifiesForTierUpgrade(
    venueId: string,
    targetTierVolumeThreshold: number,
    months: number = 3
  ): Promise<boolean> {
    try {
      // Check if last N months all exceeded threshold
      const result = await query(
        `
        SELECT 
          TO_CHAR(created_at, 'YYYY-MM') as month,
          COALESCE(SUM(venue_payout), 0) as volume
        FROM payment_transactions
        WHERE venue_id = $1
          AND status = 'completed'
          AND created_at >= NOW() - INTERVAL '${months} months'
          AND deleted_at IS NULL
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT $2
        `,
        [venueId, months]
      );
      
      // Must have data for all months
      if (result.rows.length < months) {
        return false;
      }
      
      // All months must exceed threshold
      return result.rows.every(row => {
        const volume = parseInt(row.volume || '0', 10);
        return volume >= targetTierVolumeThreshold;
      });
    } catch (error) {
      logger.error('Failed to check tier upgrade eligibility', {
        venueId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return false;
    }
  }
}
