import { getDb } from '../../config/database';

export interface AggregationOptions {
  venueId: string;
  startDate: Date;
  endDate: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

interface CustomerStat {
  user_id: string;
  purchase_count: number;
  total_spent: string;
  first_purchase: Date;
  last_purchase: Date;
}

export class MetricsAggregator {
  private mainDb = getDb();

  async aggregateSalesMetrics(options: AggregationOptions) {
    const { venueId, startDate, endDate, granularity } = options;
    
    // Define date truncation based on granularity
    const dateTrunc = this.getDateTruncExpression(granularity);
    
    const results = await this.mainDb('tickets')
      .select(
        this.mainDb.raw(`${dateTrunc} as period`),
        this.mainDb.raw('COUNT(*) as tickets_sold'),
        this.mainDb.raw('SUM(price) as revenue'),
        this.mainDb.raw('COUNT(DISTINCT user_id) as unique_customers'),
        this.mainDb.raw('AVG(price) as avg_ticket_price')
      )
      .join('events', 'tickets.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .whereBetween('tickets.created_at', [startDate, endDate])
      .whereNotNull('tickets.purchased_at')
      .groupBy('period')
      .orderBy('period');

    return this.enhanceWithCalculatedMetrics(results);
  }

  async aggregateCustomerMetrics(options: AggregationOptions) {
    const { venueId, startDate, endDate } = options;
    
    // Get customer behavior metrics
    const customerStats: CustomerStat[] = await this.mainDb('tickets')
      .select(
        'user_id',
        this.mainDb.raw('COUNT(*) as purchase_count'),
        this.mainDb.raw('SUM(price) as total_spent'),
        this.mainDb.raw('MIN(created_at) as first_purchase'),
        this.mainDb.raw('MAX(created_at) as last_purchase')
      )
      .join('events', 'tickets.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .whereBetween('tickets.created_at', [startDate, endDate])
      .whereNotNull('user_id')
      .groupBy('user_id');

    // Calculate segments
    const segments = {
      newCustomers: 0,
      returningCustomers: 0,
      vipCustomers: 0,
      atRiskCustomers: 0
    };

    const now = new Date();
    customerStats.forEach((customer: CustomerStat) => {
      const daysSinceFirst = (now.getTime() - new Date(customer.first_purchase).getTime()) / (1000 * 60 * 60 * 24);
      const daysSinceLast = (now.getTime() - new Date(customer.last_purchase).getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceFirst < 30) segments.newCustomers++;
      if (customer.purchase_count > 1) segments.returningCustomers++;
      if (parseFloat(customer.total_spent) > 500) segments.vipCustomers++;
      if (daysSinceLast > 90) segments.atRiskCustomers++;
    });

    const totalSpent = customerStats.reduce((sum: number, c: CustomerStat) => sum + parseFloat(c.total_spent), 0);
    const totalPurchases = customerStats.reduce((sum: number, c: CustomerStat) => sum + c.purchase_count, 0);

    return {
      totalCustomers: customerStats.length,
      segments,
      avgOrderValue: customerStats.length > 0 ? totalSpent / customerStats.length : 0,
      avgPurchaseFrequency: customerStats.length > 0 ? totalPurchases / customerStats.length : 0
    };
  }

  async aggregateEventPerformance(venueId: string, startDate: Date, endDate: Date) {
    const events = await this.mainDb('events')
      .select(
        'events.id',
        'events.name',
        'events.start_date',
        'events.capacity',
        this.mainDb.raw('COUNT(tickets.id) as tickets_sold'),
        this.mainDb.raw('COALESCE(SUM(tickets.price), 0) as revenue'),
        this.mainDb.raw('CASE WHEN events.capacity > 0 THEN (COUNT(tickets.id)::float / events.capacity * 100) ELSE 0 END as capacity_utilization')
      )
      .leftJoin('tickets', 'events.id', 'tickets.event_id')
      .where('events.venue_id', venueId)
      .whereBetween('events.start_date', [startDate, endDate])
      .groupBy('events.id', 'events.name', 'events.start_date', 'events.capacity')
      .orderBy('revenue', 'desc')
      .limit(20);

    return events.map((event: any) => ({
      id: event.id,
      name: event.name,
      date: event.start_date,
      capacity: event.capacity,
      ticketsSold: parseInt(event.tickets_sold),
      revenue: parseFloat(event.revenue),
      capacityUtilization: parseFloat(event.capacity_utilization).toFixed(2)
    }));
  }

  private getDateTruncExpression(granularity: string): string {
    switch (granularity) {
      case 'hour':
        return "DATE_TRUNC('hour', tickets.created_at)";
      case 'week':
        return "DATE_TRUNC('week', tickets.created_at)";
      case 'month':
        return "DATE_TRUNC('month', tickets.created_at)";
      default:
        return "DATE_TRUNC('day', tickets.created_at)";
    }
  }

  private enhanceWithCalculatedMetrics(results: any[]) {
    return results.map((row: any, index: number) => {
      const previousRow = index > 0 ? results[index - 1] : null;
      
      return {
        period: row.period,
        ticketsSold: parseInt(row.tickets_sold),
        revenue: parseFloat(row.revenue),
        uniqueCustomers: parseInt(row.unique_customers),
        avgTicketPrice: parseFloat(row.avg_ticket_price),
        growth: previousRow ? {
          revenue: ((parseFloat(row.revenue) - parseFloat(previousRow.revenue)) / parseFloat(previousRow.revenue) * 100).toFixed(2),
          tickets: ((parseInt(row.tickets_sold) - parseInt(previousRow.tickets_sold)) / parseInt(previousRow.tickets_sold) * 100).toFixed(2)
        } : null
      };
    });
  }
}
