import { getDb, getAnalyticsDb } from '../config/database';
import { logger } from '../utils/logger';

export class DataAggregationService {
  private mainDb = getDb(); // tickettoken_db
  private analyticsDb = getAnalyticsDb(); // tickettoken_analytics
  
  async aggregateVenueMetrics(venueId: string, date: Date) {
    try {
      // Read from main database
      const ticketsSold = await this.mainDb('tickets')
        .where('venue_id', venueId)
        .whereRaw('DATE(created_at) = ?', [date])
        .count('id as count')
        .first();
        
      const revenue = await this.mainDb('tickets')
        .where('venue_id', venueId)
        .whereRaw('DATE(created_at) = ?', [date])
        .sum('price as total')
        .first();
      
      // Write to analytics database
      await this.analyticsDb('venue_analytics')
        .insert({
          venue_id: venueId,
          date: date,
          tickets_sold: ticketsSold?.count || 0,
          revenue: revenue?.total || 0,
          updated_at: new Date()
        })
        .onConflict(['venue_id', 'date', 'hour'])
        .merge();
        
      logger.info('Aggregated venue metrics', { venueId, date });
    } catch (error) {
      logger.error('Failed to aggregate venue metrics', error);
      throw error;
    }
  }
}
