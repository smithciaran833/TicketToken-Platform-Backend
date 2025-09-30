import { getAnalyticsDb } from '../../config/database';

export class PredictiveAnalytics {
  private analyticsDb = getAnalyticsDb();

  async predictTicketDemand(venueId: string, eventDate: Date, eventType: string) {
    // Get historical data for similar events
    const historicalEvents = await this.analyticsDb.raw(`
      SELECT 
        date,
        EXTRACT(DOW FROM date) as day_of_week,
        EXTRACT(MONTH FROM date) as month,
        tickets_sold,
        capacity_sold_percentage,
        revenue
      FROM venue_analytics
      WHERE venue_id = ?
        AND date >= CURRENT_DATE - INTERVAL '365 days'
      ORDER BY date
    `, [venueId]);

    if (historicalEvents.rows.length < 30) {
      return { error: 'Insufficient historical data' };
    }

    // Simple prediction based on averages and patterns
    const targetDayOfWeek = eventDate.getDay();
    const targetMonth = eventDate.getMonth() + 1;

    // Find similar events
    const similarEvents = historicalEvents.rows.filter((event: any) => 
      event.day_of_week === targetDayOfWeek &&
      Math.abs(event.month - targetMonth) <= 1
    );

    if (similarEvents.length === 0) {
      return { error: 'No similar events found' };
    }

    // Calculate predictions
    const avgTickets = similarEvents.reduce((sum: number, e: any) => sum + e.tickets_sold, 0) / similarEvents.length;
    const avgCapacity = similarEvents.reduce((sum: number, e: any) => sum + parseFloat(e.capacity_sold_percentage), 0) / similarEvents.length;
    const avgRevenue = similarEvents.reduce((sum: number, e: any) => sum + parseFloat(e.revenue), 0) / similarEvents.length;

    // Calculate trend
    const recentEvents = similarEvents.slice(-5);
    const trend = recentEvents.length > 1 ? 
      (recentEvents[recentEvents.length - 1].tickets_sold - recentEvents[0].tickets_sold) / recentEvents[0].tickets_sold * 100 : 0;

    return {
      predictedTickets: Math.round(avgTickets * (1 + trend / 100)),
      predictedCapacityUtilization: avgCapacity,
      predictedRevenue: avgRevenue * (1 + trend / 100),
      confidence: this.calculateConfidence(similarEvents.length, trend),
      basedOnEvents: similarEvents.length,
      trend: trend.toFixed(2) + '%'
    };
  }

  async predictSeasonalTrends(venueId: string) {
    // Analyze seasonal patterns
    const seasonalData = await this.analyticsDb.raw(`
      WITH monthly_stats AS (
        SELECT 
          EXTRACT(MONTH FROM date) as month,
          EXTRACT(YEAR FROM date) as year,
          SUM(tickets_sold) as total_tickets,
          SUM(revenue) as total_revenue,
          COUNT(DISTINCT date) as days_with_events
        FROM venue_analytics
        WHERE venue_id = ?
          AND date >= CURRENT_DATE - INTERVAL '2 years'
        GROUP BY EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date)
      )
      SELECT 
        month,
        AVG(total_tickets) as avg_tickets,
        AVG(total_revenue) as avg_revenue,
        AVG(days_with_events) as avg_event_days,
        STDDEV(total_tickets) as tickets_stddev
      FROM monthly_stats
      GROUP BY month
      ORDER BY month
    `, [venueId]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return seasonalData.rows.map((row: any) => ({
      month: months[row.month - 1],
      avgTickets: Math.round(row.avg_tickets),
      avgRevenue: parseFloat(row.avg_revenue).toFixed(2),
      avgEventDays: Math.round(row.avg_event_days),
      volatility: row.tickets_stddev ? (parseFloat(row.tickets_stddev) / row.avg_tickets * 100).toFixed(2) + '%' : '0%',
      seasonality: this.categorizeSeasonality(row.avg_tickets, seasonalData.rows)
    }));
  }

  async predictOptimalPricing(venueId: string, eventType: string) {
    // Price elasticity analysis
    const priceData = await this.analyticsDb.raw(`
      WITH price_bands AS (
        SELECT 
          WIDTH_BUCKET(avg_ticket_price, 0, 200, 10) as price_band,
          AVG(avg_ticket_price) as avg_price,
          AVG(tickets_sold) as avg_tickets,
          AVG(revenue) as avg_revenue,
          COUNT(*) as sample_size
        FROM venue_analytics
        WHERE venue_id = ?
          AND avg_ticket_price IS NOT NULL
          AND tickets_sold > 0
        GROUP BY price_band
      )
      SELECT * FROM price_bands
      ORDER BY price_band
    `, [venueId]);

    // Find optimal price point
    let optimalBand = priceData.rows[0];
    let maxRevenue = 0;

    priceData.rows.forEach((band: any) => {
      if (parseFloat(band.avg_revenue) > maxRevenue) {
        maxRevenue = parseFloat(band.avg_revenue);
        optimalBand = band;
      }
    });

    // Calculate price elasticity
    const elasticityData = [];
    for (let i = 1; i < priceData.rows.length; i++) {
      const priceDiff = priceData.rows[i].avg_price - priceData.rows[i-1].avg_price;
      const quantityDiff = priceData.rows[i].avg_tickets - priceData.rows[i-1].avg_tickets;
      
      if (priceDiff !== 0) {
        const elasticity = (quantityDiff / priceData.rows[i-1].avg_tickets) / (priceDiff / priceData.rows[i-1].avg_price);
        elasticityData.push({
          priceRange: `$${priceData.rows[i-1].avg_price}-$${priceData.rows[i].avg_price}`,
          elasticity: elasticity.toFixed(2),
          interpretation: Math.abs(elasticity) > 1 ? 'Elastic' : 'Inelastic'
        });
      }
    }

    return {
      optimalPrice: parseFloat(optimalBand.avg_price).toFixed(2),
      expectedTickets: Math.round(optimalBand.avg_tickets),
      expectedRevenue: parseFloat(optimalBand.avg_revenue).toFixed(2),
      priceElasticity: elasticityData,
      recommendation: this.generatePricingRecommendation(optimalBand, elasticityData)
    };
  }

  private calculateConfidence(sampleSize: number, trend: number): string {
    if (sampleSize < 5) return 'Low';
    if (sampleSize < 20) return 'Medium';
    if (Math.abs(trend) > 50) return 'Medium';
    return 'High';
  }

  private categorizeSeasonality(monthAvg: number, allMonths: any[]): string {
    const overallAvg = allMonths.reduce((sum, m) => sum + m.avg_tickets, 0) / allMonths.length;
    const ratio = monthAvg / overallAvg;
    
    if (ratio > 1.2) return 'Peak Season';
    if (ratio > 0.8) return 'Normal Season';
    return 'Off Season';
  }

  private generatePricingRecommendation(optimalBand: any, elasticity: any[]): string {
    const avgElasticity = elasticity.reduce((sum, e) => sum + Math.abs(parseFloat(e.elasticity)), 0) / elasticity.length;
    
    if (avgElasticity > 1) {
      return 'Demand is price-sensitive. Consider dynamic pricing or promotions.';
    } else {
      return 'Demand is relatively price-insensitive. You may have room to increase prices.';
    }
  }
}
