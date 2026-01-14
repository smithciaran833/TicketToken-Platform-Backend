/**
 * RFM Calculator Worker
 * 
 * AUDIT FIX: CRON-1 - Add distributed locking to prevent duplicate calculations
 */

import schedule from 'node-schedule';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { acquireRFMLock, getDistributedLock } from '../utils/distributed-lock';

interface CustomerData {
  customer_id: string;
  last_purchase_date: Date;
  first_purchase_date: Date;
  total_purchases: number;
  total_spent: number;
}

class RFMCalculatorWorker {
  // AUDIT FIX: CRON-1 - Removed local isRunning flag, using distributed lock instead
  private scheduledJob: schedule.Job | null = null;

  async start() {
    logger.info('Starting RFM Calculator Worker');

    // Run every night at 2 AM
    this.scheduledJob = schedule.scheduleJob('0 2 * * *', async () => {
      logger.info('Starting scheduled RFM calculation');
      await this.calculateAllVenueRFM();
    });

    // Also run on startup for immediate availability (with small delay to let Redis connect)
    setTimeout(async () => {
      logger.info('Running initial RFM calculation on startup');
      await this.calculateAllVenueRFM();
    }, 5000);
  }

  async stop() {
    if (this.scheduledJob) {
      this.scheduledJob.cancel();
      this.scheduledJob = null;
      logger.info('RFM Calculator Worker stopped');
    }
    // Release any held locks
    await getDistributedLock().releaseAll();
  }

  async calculateAllVenueRFM() {
    // AUDIT FIX: CRON-1 - Acquire distributed lock before processing
    const lock = await acquireRFMLock(undefined, { 
      ttl: 300000, // 5 minutes
      retryCount: 0 // Don't retry - if locked, another instance is handling it
    });
    
    if (!lock) {
      logger.info('RFM calculation already running on another instance, skipping...');
      return;
    }
    
    const startTime = Date.now();

    try {
      // Get all venues (assuming venues table exists)
      // If not, we'll need to get distinct venue_ids from orders
      let venues;
      const hasVenuesTable = await db.schema.hasTable('venues');

      if (hasVenuesTable) {
        venues = await db('venues').select('id', 'name');
      } else {
        // Get unique venue_ids from orders
        const venueIds = await db('orders')
          .distinct('venue_id')
          .whereNotNull('venue_id')
          .pluck('venue_id');

        venues = venueIds.map((id: any) => ({ id, name: `Venue ${id}` }));
      }

      logger.info(`Calculating RFM for ${venues.length} venues`);

      for (const venue of venues) {
        try {
          await this.calculateVenueRFM(venue.id);
          logger.info(`✓ RFM calculated for venue: ${venue.name || venue.id}`);
        } catch (error) {
          logger.error(`✗ Failed to calculate RFM for venue ${venue.id}:`, error);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`RFM calculation complete for all venues in ${duration}s`);
    } catch (error) {
      logger.error('RFM calculation failed:', error);
    } finally {
      // AUDIT FIX: CRON-1 - Release the distributed lock
      await getDistributedLock().release(lock);
    }
  }

  async calculateVenueRFM(venueId: string) {
    // Get tenant_id from venue if possible, otherwise use a default
    let tenantId;
    const hasVenuesTable = await db.schema.hasTable('venues');
    if (hasVenuesTable) {
      const venue = await db('venues').where('id', venueId).first();
      tenantId = venue?.tenant_id || '00000000-0000-0000-0000-000000000000';
    } else {
      tenantId = '00000000-0000-0000-0000-000000000000';
    }

    // Get all customers who have purchased from this venue
    const customers: CustomerData[] = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .where('orders.venue_id', venueId)
      .where('orders.status', 'completed')
      .groupBy('users.id')
      .select(
        'users.id as customer_id',
        db.raw('MAX(orders.created_at) as last_purchase_date'),
        db.raw('MIN(orders.created_at) as first_purchase_date'),
        db.raw('COUNT(*) as total_purchases'),
        db.raw('SUM(orders.total_amount) as total_spent')
      );

    if (customers.length === 0) {
      logger.debug(`No customers found for venue ${venueId}`);
      return;
    }

    const now = new Date();

    for (const customer of customers) {
      try {
        // Calculate RFM scores
        const daysSinceLastPurchase = Math.floor(
          (now.getTime() - new Date(customer.last_purchase_date).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        const recencyScore = this.scoreRecency(daysSinceLastPurchase);
        const frequencyScore = this.scoreFrequency(customer.total_purchases);
        const monetaryScore = await this.scoreMonetary(
          venueId,
          parseFloat(customer.total_spent.toString())
        );

        const totalScore = recencyScore + frequencyScore + monetaryScore;
        const segment = this.determineSegment(totalScore, daysSinceLastPurchase);
        const churnRisk = this.calculateChurnRisk(
          daysSinceLastPurchase,
          customer.total_purchases
        );

        const avgOrderValue = parseFloat(customer.total_spent.toString()) / customer.total_purchases;

        // Upsert to cache table
        await db('customer_rfm_scores')
          .insert({
            customer_id: customer.customer_id,
            venue_id: venueId,
            tenant_id: tenantId,
            recency_score: recencyScore,
            frequency_score: frequencyScore,
            monetary_score: monetaryScore,
            total_score: totalScore,
            days_since_last_purchase: daysSinceLastPurchase,
            total_purchases: customer.total_purchases,
            total_spent: customer.total_spent,
            average_order_value: avgOrderValue,
            segment,
            churn_risk: churnRisk,
            calculated_at: new Date(),
            updated_at: new Date(),
          })
          .onConflict(['customer_id', 'venue_id'])
          .merge();
      } catch (error) {
        logger.error(`Failed to calculate RFM for customer ${customer.customer_id}:`, error);
      }
    }

    // Update segment summary
    await this.updateSegmentSummary(venueId, tenantId);

    // Calculate CLV for all customers
    await this.calculateCLVForVenue(venueId, tenantId);
  }

  private scoreRecency(days: number): number {
    if (days <= 30) return 5;
    if (days <= 60) return 4;
    if (days <= 90) return 3;
    if (days <= 180) return 2;
    return 1;
  }

  private scoreFrequency(purchases: number): number {
    if (purchases >= 10) return 5;
    if (purchases >= 7) return 4;
    if (purchases >= 4) return 3;
    if (purchases >= 2) return 2;
    return 1;
  }

  private async scoreMonetary(venueId: string, totalSpent: number): Promise<number> {
    // Get all customer spending for this venue
    const allSpending = await db('orders')
      .where('venue_id', venueId)
      .where('status', 'completed')
      .groupBy('user_id')
      .select(db.raw('SUM(total_amount) as total'))
      .orderBy('total', 'desc');

    if (allSpending.length === 0) return 3; // Default to middle score

    const spendingAmounts = allSpending.map((s: any) => parseFloat(s.total.toString()));
    const percentile = this.calculatePercentile(spendingAmounts, totalSpent);

    if (percentile >= 80) return 5; // Top 20%
    if (percentile >= 60) return 4; // Next 20%
    if (percentile >= 40) return 3; // Middle 20%
    if (percentile >= 20) return 2; // Next 20%
    return 1; // Bottom 20%
  }

  private calculatePercentile(values: number[], target: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = sorted.findIndex((v) => v >= target);
    if (index === -1) return 100; // Higher than all values
    return (index / sorted.length) * 100;
  }

  private determineSegment(totalScore: number, daysSinceLastPurchase: number): string {
    if (totalScore >= 12) return 'VIP';
    if (totalScore >= 8) return 'Regular';
    if (totalScore >= 5 && daysSinceLastPurchase <= 180) return 'At-Risk';
    return 'Lost';
  }

  private calculateChurnRisk(daysSinceLastPurchase: number, totalPurchases: number): string {
    if (daysSinceLastPurchase > 180 && totalPurchases >= 3) return 'high';
    if (daysSinceLastPurchase > 90 && totalPurchases >= 2) return 'medium';
    return 'low';
  }

  private async updateSegmentSummary(venueId: string, tenantId: string) {
    const segments = ['VIP', 'Regular', 'At-Risk', 'Lost'];

    for (const segment of segments) {
      const stats = await db('customer_rfm_scores')
        .where('venue_id', venueId)
        .where('segment', segment)
        .select(
          db.raw('COUNT(*) as customer_count'),
          db.raw('SUM(total_spent) as total_revenue'),
          db.raw('AVG(average_order_value) as avg_order_value'),
          db.raw('AVG(total_purchases) / (AVG(days_since_last_purchase) / 365.0) as avg_purchase_frequency')
        )
        .first();

      await db('customer_segments')
        .insert({
          venue_id: venueId,
          tenant_id: tenantId,
          segment_name: segment,
          customer_count: stats.customer_count || 0,
          total_revenue: stats.total_revenue || 0,
          avg_order_value: stats.avg_order_value || 0,
          avg_purchase_frequency: stats.avg_purchase_frequency || 0,
          last_calculated_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict(['venue_id', 'segment_name'])
        .merge();
    }
  }

  private async calculateCLVForVenue(venueId: string, tenantId: string) {
    const customers = await db('customer_rfm_scores')
      .where('venue_id', venueId)
      .select('*');

    for (const customer of customers) {
      const lifespanDays = customer.days_since_last_purchase +
        (await this.getCustomerAgeDays(customer.customer_id, venueId));

      const purchaseFrequency = customer.total_purchases / (lifespanDays / 365.0);
      const clv = customer.average_order_value * purchaseFrequency * (lifespanDays / 365.0);

      // Simple predictions based on current behavior
      const predicted12Months = customer.average_order_value * purchaseFrequency * 1;
      const predicted24Months = customer.average_order_value * purchaseFrequency * 2;

      // Churn probability based on recency
      let churnProb = 0;
      if (customer.days_since_last_purchase > 180) churnProb = 0.7;
      else if (customer.days_since_last_purchase > 90) churnProb = 0.4;
      else if (customer.days_since_last_purchase > 60) churnProb = 0.2;
      else churnProb = 0.1;

      await db('customer_lifetime_value')
        .insert({
          customer_id: customer.customer_id,
          venue_id: venueId,
          tenant_id: tenantId,
          clv: clv || 0,
          avg_order_value: customer.average_order_value,
          purchase_frequency: purchaseFrequency,
          customer_lifespan_days: lifespanDays,
          total_purchases: customer.total_purchases,
          total_revenue: customer.total_spent,
          predicted_clv_12_months: predicted12Months,
          predicted_clv_24_months: predicted24Months,
          churn_probability: churnProb,
          calculated_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict('customer_id')
        .merge();
    }
  }

  private async getCustomerAgeDays(customerId: string, venueId: string): Promise<number> {
    const firstOrder = await db('orders')
      .where('user_id', customerId)
      .where('venue_id', venueId)
      .orderBy('created_at', 'asc')
      .first();

    if (!firstOrder) return 0;

    const days = Math.floor(
      (Date.now() - new Date(firstOrder.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  }
}

export const rfmCalculatorWorker = new RFMCalculatorWorker();
