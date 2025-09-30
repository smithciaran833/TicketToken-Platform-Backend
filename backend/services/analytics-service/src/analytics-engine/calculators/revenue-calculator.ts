import { getDb, getAnalyticsDb } from '../../config/database';

export class RevenueCalculator {
  private mainDb = getDb();
  private analyticsDb = getAnalyticsDb();

  async calculateRevenueByChannel(venueId: string, startDate: Date, endDate: Date) {
    // Use venue_analytics table which has the data we need
    const analytics = await this.analyticsDb('venue_analytics')
      .select(
        this.analyticsDb.raw('SUM(revenue) as total_revenue'),
        this.analyticsDb.raw('SUM(ticket_sales) as total_tickets'),
        this.analyticsDb.raw('COUNT(*) as days_count')
      )
      .where('venue_id', venueId)
      .whereBetween('date', [startDate, endDate]);

    const total = parseFloat(analytics[0]?.total_revenue || '0');
    
    return {
      channels: [{
        channel: 'Direct Sales',
        ticket_count: parseInt(analytics[0]?.total_tickets || '0'),
        revenue: total,
        percentage: '100.00'
      }],
      total
    };
  }

  async calculateRevenueByEventType(venueId: string, startDate: Date, endDate: Date) {
    // Use event_analytics table
    const eventAnalytics = await this.analyticsDb('event_analytics')
      .select(
        this.analyticsDb.raw('SUM(revenue) as total_revenue'),
        this.analyticsDb.raw('SUM(ticket_sales) as tickets_sold'),
        this.analyticsDb.raw('COUNT(DISTINCT event_id) as event_count')
      )
      .join('events', 'event_analytics.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .whereBetween('event_analytics.date', [startDate, endDate]);

    return [{
      event_type: 'All Events',
      event_count: parseInt(eventAnalytics[0]?.event_count || '0'),
      revenue: parseFloat(eventAnalytics[0]?.total_revenue || '0'),
      tickets_sold: parseInt(eventAnalytics[0]?.tickets_sold || '0')
    }];
  }

  async projectRevenue(venueId: string, days: number) {
    // Simple projection based on average daily revenue
    const last30Days = await this.analyticsDb('venue_analytics')
      .select(
        this.analyticsDb.raw('AVG(revenue) as avg_daily_revenue')
      )
      .where('venue_id', venueId)
      .where('date', '>=', this.analyticsDb.raw('CURRENT_DATE - INTERVAL \'30 days\''));
    
    const avgDaily = parseFloat(last30Days[0]?.avg_daily_revenue || '0');
    
    return {
      projectedRevenue: avgDaily * days,
      avgDailyRevenue: avgDaily,
      daysProjected: days
    };
  }
}
