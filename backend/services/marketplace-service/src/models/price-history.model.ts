import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface PriceHistoryEntry {
  id: string;
  listing_id: string;
  old_price: number;        // INTEGER CENTS
  new_price: number;        // INTEGER CENTS
  price_change: number;     // INTEGER CENTS
  percentage_change: number; // DECIMAL (e.g., 5.5 = 5.5%)
  changed_by: string;
  reason?: string;
  changed_at: Date;
}

export interface PriceTrend {
  period: string;
  average_price: number;    // INTEGER CENTS
  min_price: number;        // INTEGER CENTS
  max_price: number;        // INTEGER CENTS
  total_changes: number;
  trend_direction: 'up' | 'down' | 'stable';
}

export class PriceHistoryModel {
  private readonly tableName = 'price_history';

  async recordPriceChange(
    listingId: string,
    oldPriceCents: number,
    newPriceCents: number,
    changedBy: string,
    reason?: string
  ): Promise<PriceHistoryEntry> {
    try {
      const priceChangeCents = newPriceCents - oldPriceCents;
      // Calculate percentage with precision, store as decimal
      const percentageChange = (priceChangeCents / oldPriceCents) * 100;

      const entry: PriceHistoryEntry = {
        id: uuidv4(),
        listing_id: listingId,
        old_price: oldPriceCents,
        new_price: newPriceCents,
        price_change: priceChangeCents,
        percentage_change: percentageChange,
        changed_by: changedBy,
        reason,
        changed_at: new Date()
      };

      await db(this.tableName).insert(entry);

      logger.info(`Price change recorded for listing ${listingId}: $${oldPriceCents/100} -> $${newPriceCents/100}`);
      return entry;
    } catch (error) {
      logger.error('Error recording price change:', error);
      throw error;
    }
  }

  async getPriceHistory(listingId: string): Promise<PriceHistoryEntry[]> {
    try {
      return await db(this.tableName)
        .where('listing_id', listingId)
        .orderBy('changed_at', 'desc')
        .select('*');
    } catch (error) {
      logger.error('Error getting price history:', error);
      return [];
    }
  }

  async getAveragePrice(
    eventId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    try {
      const query = db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId);

      if (startDate) {
        query.where('ph.changed_at', '>=', startDate);
      }
      if (endDate) {
        query.where('ph.changed_at', '<=', endDate);
      }

      const result = await query.avg('ph.new_price as average');

      // Return average as integer cents
      return Math.round(parseFloat(result[0]?.average || '0'));
    } catch (error) {
      logger.error('Error calculating average price:', error);
      return 0;
    }
  }

  async getPriceTrends(
    eventId: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<PriceTrend> {
    try {
      const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const stats = await db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId)
        .where('ph.changed_at', '>=', startDate)
        .select(
          db.raw('AVG(ph.new_price) as average_price'),
          db.raw('MIN(ph.new_price) as min_price'),
          db.raw('MAX(ph.new_price) as max_price'),
          db.raw('COUNT(*) as total_changes'),
          db.raw('AVG(ph.percentage_change) as avg_change')
        )
        .first();

      const avgChange = parseFloat(stats?.avg_change || '0');
      const trendDirection = avgChange > 1 ? 'up' : avgChange < -1 ? 'down' : 'stable';

      return {
        period,
        average_price: Math.round(parseFloat(stats?.average_price || '0')),  // INTEGER CENTS
        min_price: Math.round(parseFloat(stats?.min_price || '0')),          // INTEGER CENTS
        max_price: Math.round(parseFloat(stats?.max_price || '0')),          // INTEGER CENTS
        total_changes: parseInt(stats?.total_changes || '0', 10),
        trend_direction: trendDirection
      };
    } catch (error) {
      logger.error('Error getting price trends:', error);
      return {
        period,
        average_price: 0,
        min_price: 0,
        max_price: 0,
        total_changes: 0,
        trend_direction: 'stable'
      };
    }
  }
}

export const priceHistoryModel = new PriceHistoryModel();
