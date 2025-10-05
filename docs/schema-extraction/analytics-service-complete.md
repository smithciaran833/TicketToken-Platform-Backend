# COMPLETE DATABASE ANALYSIS: analytics-service
Generated: Thu Oct  2 15:07:46 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/prediction.routes.ts
```typescript
import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, param } from 'express-validator';
import { predictionController } from '../controllers/prediction.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Predict demand
router.post(
  '/demand',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('eventId').isUUID(),
    body('daysAhead').optional().isInt({ min: 1, max: 365 })
  ]),
  predictionController.predictDemand
);

// Optimize pricing
router.post(
  '/pricing',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('eventId').isUUID(),
    body('ticketTypeId').isUUID(),
    body('currentPrice').isNumeric()
  ]),
  predictionController.optimizePricing
);

// Predict churn
router.post(
  '/churn',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('customerId').isString().notEmpty()
  ]),
  predictionController.predictChurn
);

// Predict customer lifetime value
router.post(
  '/clv',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('customerId').isString().notEmpty()
  ]),
  predictionController.predictCLV
);

// Predict no-show
router.post(
  '/no-show',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('ticketId').isUUID(),
    body('customerId').isString().notEmpty(),
    body('eventId').isUUID()
  ]),
  predictionController.predictNoShow
);

// Run what-if scenario
router.post(
  '/what-if',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('scenario').isObject(),
    body('scenario.type').isIn(['pricing', 'capacity', 'marketing']),
    body('scenario.parameters').isObject()
  ]),
  predictionController.runWhatIfScenario
);

// Get model performance
router.get(
  '/models/:modelType/performance',
  authorize(['analytics.admin']),
  validateRequest([
    param('modelType').isIn(['demand', 'pricing', 'churn', 'clv', 'no_show'])
  ]),
  predictionController.getModelPerformance
);

export { router as predictionRouter };
```

### FILE: src/analytics-engine/analytics-engine.ts
```typescript
import { getRedis } from '../config/redis';
import CacheManager from '../config/redis-cache-strategies';
import { logger } from '../utils/logger';

export interface TimeRange {
  start: Date;
  end: Date;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface AnalyticsQuery {
  venueId: string;
  metrics: string[];
  timeRange: TimeRange;
  filters?: Record<string, any>;
  groupBy?: string[];
}

export class AnalyticsEngine {
  private cache!: CacheManager;

  constructor() {
    // Cache will be initialized when needed
  }

  // Main query method
  async query(query: AnalyticsQuery): Promise<any> {
    if (!this.cache) this.cache = new CacheManager(getRedis());
    const cacheKey = this.generateCacheKey(query);

    // Try cache first
    const cached = await this.cache.get('analyticsQuery', cacheKey);
    if (cached) return cached;

    // Execute query based on metrics requested
    const results = await this.executeQuery(query);

    // Cache results
    await this.cache.set('analyticsQuery', cacheKey, results, 300); // 5 min cache

    return results;
  }

  private async executeQuery(query: AnalyticsQuery) {
    const results: Record<string, any> = {};

    for (const metric of query.metrics) {
      switch (metric) {
        case 'revenue':
          results.revenue = await this.calculateRevenue(query);
          break;
        case 'ticketSales':
          results.ticketSales = await this.calculateTicketSales(query);
          break;
        case 'conversionRate':
          results.conversionRate = await this.calculateConversionRate(query);
          break;
        case 'customerMetrics':
          results.customerMetrics = await this.calculateCustomerMetrics(query);
          break;
        case 'topEvents':
          results.topEvents = await this.getTopEvents(query);
          break;
        case 'salesTrends':
          results.salesTrends = await this.calculateSalesTrends(query);
          break;
        default:
          logger.warn(`Unknown metric requested: ${metric}`);
      }
    }

    return results;
  }

  private async calculateRevenue(query: AnalyticsQuery) {
    const { RevenueCalculator } = await import('./calculators/revenue-calculator');
    const calculator = new RevenueCalculator();
    
    const [byChannel, byEventType] = await Promise.all([
      calculator.calculateRevenueByChannel(query.venueId, query.timeRange.start, query.timeRange.end),
      calculator.calculateRevenueByEventType(query.venueId, query.timeRange.start, query.timeRange.end)
    ]);

    return { byChannel, byEventType };
  }

  private async calculateTicketSales(query: AnalyticsQuery) {
    const { MetricsAggregator } = await import('./aggregators/metrics-aggregator');
    const aggregator = new MetricsAggregator();
    
    return aggregator.aggregateSalesMetrics({
      venueId: query.venueId,
      startDate: query.timeRange.start,
      endDate: query.timeRange.end,
      granularity: query.timeRange.granularity || 'day'
    });
  }

  private async calculateConversionRate(query: AnalyticsQuery) {
    // Get page views from Redis
    const redis = getRedis();
    const dates = this.getDateRange(query.timeRange.start, query.timeRange.end);
    
    const conversionData = await Promise.all(dates.map(async (date: Date) => {
      const dateStr = date.toISOString().split('T')[0];
      const trafficKey = `metrics:traffic:${query.venueId}:${dateStr}`;
      const purchaseKey = `metrics:purchase:${query.venueId}:${dateStr}`;
      
      const [traffic, purchase] = await Promise.all([
        redis.hget(trafficKey, 'page_views'),
        redis.hget(purchaseKey, 'total_sales')
      ]);
      
      const views = parseInt(traffic || '0');
      const sales = parseInt(purchase || '0');
      
      return {
        date: dateStr,
        pageViews: views,
        conversions: sales,
        rate: views > 0 ? (sales / views * 100).toFixed(2) : '0.00'
      };
    }));
    
    return conversionData;
  }

  private async calculateCustomerMetrics(query: AnalyticsQuery) {
    const { CustomerAnalytics } = await import('./calculators/customer-analytics');
    const analytics = new CustomerAnalytics();
    
    const [clv, churnRisk, segmentation] = await Promise.all([
      analytics.calculateCustomerLifetimeValue(query.venueId),
      analytics.identifyChurnRisk(query.venueId),
      analytics.calculateCustomerSegmentation(query.venueId)
    ]);
    
    return { clv, churnRisk, segmentation };
  }

  private async getTopEvents(query: AnalyticsQuery) {
    const { MetricsAggregator } = await import('./aggregators/metrics-aggregator');
    const aggregator = new MetricsAggregator();
    
    return aggregator.aggregateEventPerformance(
      query.venueId,
      query.timeRange.start,
      query.timeRange.end
    );
  }

  private async calculateSalesTrends(query: AnalyticsQuery) {
    const { PredictiveAnalytics } = await import('./calculators/predictive-analytics');
    const predictor = new PredictiveAnalytics();
    
    const [seasonal, pricing] = await Promise.all([
      predictor.predictSeasonalTrends(query.venueId),
      predictor.predictOptimalPricing(query.venueId, 'concert') // Default to concert
    ]);
    
    return { seasonal, pricing };
  }

  private generateCacheKey(query: AnalyticsQuery): string {
    return `${query.venueId}:${query.metrics.join(',')}:${query.timeRange.start.toISOString()}:${query.timeRange.end.toISOString()}`;
  }

  private getDateRange(start: Date, end: Date): Date[] {
    const dates = [];
    const current = new Date(start);
    
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }
}

export const analyticsEngine = new AnalyticsEngine();
```

### FILE: src/analytics-engine/aggregators/metrics-aggregator.ts
```typescript
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

    // SECURITY FIX: Validate and whitelist granularity
    const validGranularities = ['hour', 'day', 'week', 'month'];
    if (!validGranularities.includes(granularity)) {
      throw new Error(`Invalid granularity: ${granularity}. Must be one of: ${validGranularities.join(', ')}`);
    }

    // Define date truncation based on granularity - now safe because granularity is validated
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
    // SECURITY: This is now safe because granularity is validated in aggregateSalesMetrics
    // But we'll still use a whitelist approach for defense in depth
    const expressions: Record<string, string> = {
      'hour': "DATE_TRUNC('hour', tickets.created_at)",
      'week': "DATE_TRUNC('week', tickets.created_at)",
      'month': "DATE_TRUNC('month', tickets.created_at)",
      'day': "DATE_TRUNC('day', tickets.created_at)"
    };
    
    return expressions[granularity] || expressions['day'];
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
```

### FILE: src/analytics-engine/calculators/customer-analytics.ts
```typescript
import { getDb } from '../../config/database';

interface CustomerData {
  user_id: string;
  purchase_count: number;
  total_revenue: string;
  first_purchase: Date;
  last_purchase: Date;
}

interface CLVData {
  customerId: string;
  totalRevenue: number;
  purchaseCount: number;
  avgOrderValue: number;
  customerLifespanDays: number;
  purchaseFrequency: number;
}

export class CustomerAnalytics {
  private mainDb = getDb();

  async calculateCustomerLifetimeValue(venueId: string) {
    const customerData = await this.mainDb('tickets')
      .select(
        'user_id',
        this.mainDb.raw('COUNT(*) as purchase_count'),
        this.mainDb.raw('SUM(price) as total_revenue'),
        this.mainDb.raw('MIN(tickets.created_at) as first_purchase'),
        this.mainDb.raw('MAX(tickets.created_at) as last_purchase')
      )
      .join('events', 'tickets.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .whereNotNull('user_id')
      .groupBy('user_id');

    // Calculate CLV metrics
    const clvData: CLVData[] = customerData.map((customer: CustomerData) => {
      const firstPurchase = new Date(customer.first_purchase);
      const lastPurchase = new Date(customer.last_purchase);
      const customerLifespan = (lastPurchase.getTime() - firstPurchase.getTime()) / (1000 * 60 * 60 * 24); // days

      return {
        customerId: customer.user_id,
        totalRevenue: parseFloat(customer.total_revenue),
        purchaseCount: customer.purchase_count,
        avgOrderValue: parseFloat(customer.total_revenue) / customer.purchase_count,
        customerLifespanDays: Math.max(1, customerLifespan),
        purchaseFrequency: customer.purchase_count / Math.max(1, customerLifespan / 30) // purchases per month
      };
    });

    // Calculate average CLV
    const avgClv = clvData.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / clvData.length;

    // Segment customers
    const segments = {
      high: clvData.filter((c: CLVData) => c.totalRevenue > avgClv * 2),
      medium: clvData.filter((c: CLVData) => c.totalRevenue > avgClv * 0.5 && c.totalRevenue <= avgClv * 2),
      low: clvData.filter((c: CLVData) => c.totalRevenue <= avgClv * 0.5)
    };

    return {
      averageClv: avgClv,
      totalCustomers: clvData.length,
      segments: {
        high: {
          count: segments.high.length,
          avgValue: segments.high.length > 0 ? segments.high.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / segments.high.length : 0
        },
        medium: {
          count: segments.medium.length,
          avgValue: segments.medium.length > 0 ? segments.medium.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / segments.medium.length : 0
        },
        low: {
          count: segments.low.length,
          avgValue: segments.low.length > 0 ? segments.low.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / segments.low.length : 0
        }
      }
    };
  }

  async identifyChurnRisk(venueId: string, daysThreshold: number = 90) {
    const now = new Date();
    const thresholdDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);

    // Find customers who haven't purchased recently
    const atRiskCustomers = await this.mainDb('tickets')
      .select(
        'user_id',
        this.mainDb.raw('MAX(tickets.created_at) as last_purchase'),
        this.mainDb.raw('COUNT(*) as total_purchases'),
        this.mainDb.raw('AVG(price) as avg_order_value')
      )
      .join('events', 'tickets.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .whereNotNull('user_id')
      .groupBy('user_id')
      .havingRaw('MAX(tickets.created_at) < ?', [thresholdDate])
      .orderBy('total_purchases', 'desc');

    // Calculate churn risk score
    const enrichedCustomers = atRiskCustomers.map((customer: any) => {
      const daysSinceLastPurchase = Math.floor((now.getTime() - new Date(customer.last_purchase).getTime()) / (1000 * 60 * 60 * 24));
      
      // Simple scoring: higher score = higher risk
      let riskScore = Math.min(100, (daysSinceLastPurchase / daysThreshold) * 50);
      
      // Adjust based on purchase history
      if (customer.total_purchases > 5) riskScore -= 10;
      if (customer.total_purchases > 10) riskScore -= 10;
      if (parseFloat(customer.avg_order_value) > 100) riskScore -= 5;
      
      return {
        customerId: customer.user_id,
        lastPurchase: customer.last_purchase,
        daysSinceLastPurchase,
        totalPurchases: customer.total_purchases,
        avgOrderValue: parseFloat(customer.avg_order_value),
        riskScore: Math.max(0, Math.min(100, riskScore))
      };
    });

    return {
      totalAtRisk: enrichedCustomers.length,
      highRisk: enrichedCustomers.filter((c: any) => c.riskScore > 70),
      mediumRisk: enrichedCustomers.filter((c: any) => c.riskScore > 40 && c.riskScore <= 70),
      lowRisk: enrichedCustomers.filter((c: any) => c.riskScore <= 40)
    };
  }

  async calculateCustomerSegmentation(venueId: string) {
    // RFM Analysis (Recency, Frequency, Monetary)
    const customers = await this.mainDb.raw(`
      WITH customer_metrics AS (
        SELECT 
          t.user_id,
          MAX(t.created_at) as last_purchase,
          COUNT(*) as purchase_frequency,
          SUM(t.price) as monetary_value,
          CURRENT_DATE - MAX(t.created_at::date) as recency_days
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE e.venue_id = ? AND t.user_id IS NOT NULL
        GROUP BY t.user_id
      ),
      rfm_scores AS (
        SELECT 
          user_id,
          recency_days,
          purchase_frequency,
          monetary_value,
          NTILE(5) OVER (ORDER BY recency_days DESC) as recency_score,
          NTILE(5) OVER (ORDER BY purchase_frequency) as frequency_score,
          NTILE(5) OVER (ORDER BY monetary_value) as monetary_score
        FROM customer_metrics
      )
      SELECT 
        *,
        CONCAT(recency_score, frequency_score, monetary_score) as rfm_segment
      FROM rfm_scores
    `, [venueId]);

    // Categorize segments
    const segments = {
      champions: customers.rows.filter((c: any) => c.rfm_segment.match(/[45][45][45]/)),
      loyalCustomers: customers.rows.filter((c: any) => c.rfm_segment.match(/[345][45][345]/)),
      potentialLoyalists: customers.rows.filter((c: any) => c.rfm_segment.match(/[45][23][345]/)),
      newCustomers: customers.rows.filter((c: any) => c.rfm_segment.match(/[45][12][12]/)),
      atRisk: customers.rows.filter((c: any) => c.rfm_segment.match(/[12][45][45]/)),
      cantLose: customers.rows.filter((c: any) => c.rfm_segment.match(/[12][45][45]/)),
      hibernating: customers.rows.filter((c: any) => c.rfm_segment.match(/[12][12][12]/))
    };

    return Object.entries(segments).map(([name, customers]) => ({
      segment: name,
      count: customers.length,
      avgValue: customers.length > 0 ? customers.reduce((sum: number, c: any) => sum + parseFloat(c.monetary_value), 0) / customers.length : 0,
      characteristics: this.getSegmentCharacteristics(name)
    }));
  }

  private getSegmentCharacteristics(segment: string) {
    const characteristics: Record<string, string> = {
      champions: 'Best customers - recent, frequent, high spenders',
      loyalCustomers: 'Spend good money, responsive to promotions',
      potentialLoyalists: 'Recent customers with average frequency',
      newCustomers: 'Recently acquired, need nurturing',
      atRisk: 'Were great customers, but slipping away',
      cantLose: 'Were champions, now at risk of churning',
      hibernating: 'Low engagement, may be lost'
    };
    
    return characteristics[segment] || 'Unknown segment';
  }
}
```

### FILE: src/analytics-engine/calculators/predictive-analytics.ts
```typescript
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
```

### FILE: src/config/mongodb-schemas.ts
```typescript
import { Db } from 'mongodb';
import { logger } from '../utils/logger';

// Define schema validators for each collection
const schemas = {
  raw_analytics: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'event_type', 'timestamp'],
      properties: {
        venue_id: {
          bsonType: 'string',
          description: 'Venue ID is required'
        },
        event_type: {
          bsonType: 'string',
          enum: [
            'ticket_purchase',
            'ticket_scan',
            'page_view',
            'cart_abandonment',
            'search_query',
            'user_action'
          ],
          description: 'Event type must be valid'
        },
        timestamp: {
          bsonType: 'date',
          description: 'Timestamp is required'
        },
        metadata: {
          bsonType: 'object',
          description: 'Additional event metadata'
        }
      }
    }
  },
  
  user_behavior: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'session_id', 'timestamp'],
      properties: {
        venue_id: { bsonType: 'string' },
        session_id: { bsonType: 'string' },
        user_hash: { bsonType: 'string' },
        timestamp: { bsonType: 'date' },
        events: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['action', 'timestamp'],
            properties: {
              action: { bsonType: 'string' },
              timestamp: { bsonType: 'date' },
              metadata: { bsonType: 'object' }
            }
          }
        }
      }
    }
  },
  
  campaign_performance: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'campaign_id', 'date'],
      properties: {
        venue_id: { bsonType: 'string' },
        campaign_id: { bsonType: 'string' },
        date: { bsonType: 'date' },
        metrics: {
          bsonType: 'object',
          properties: {
            impressions: { bsonType: 'int' },
            clicks: { bsonType: 'int' },
            conversions: { bsonType: 'int' },
            spend: { bsonType: 'double' },
            revenue: { bsonType: 'double' }
          }
        }
      }
    }
  }
};

// Apply schema validation to collections
export async function applyMongoSchemas(db: Db): Promise<void> {
  for (const [collectionName, schema] of Object.entries(schemas)) {
    try {
      // Check if collection exists
      const collections = await db.listCollections({ name: collectionName }).toArray();
      
      if (collections.length === 0) {
        // Create collection with validation
        await db.createCollection(collectionName, {
          validator: schema,
          validationLevel: 'moderate', // Allow invalid documents but log warnings
          validationAction: 'warn'
        });
        logger.info(`Created collection ${collectionName} with schema validation`);
      } else {
        // Update existing collection validation
        await db.command({
          collMod: collectionName,
          validator: schema,
          validationLevel: 'moderate',
          validationAction: 'warn'
        });
        logger.info(`Updated schema validation for ${collectionName}`);
      }
      
      // Create indexes for better performance
      await createMongoIndexes(db, collectionName);
      
    } catch (error) {
      logger.error(`Failed to apply schema for ${collectionName}:`, error);
    }
  }
}

// Create performance indexes for MongoDB collections
async function createMongoIndexes(db: Db, collectionName: string): Promise<void> {
  const collection = db.collection(collectionName);
  
  switch (collectionName) {
    case 'raw_analytics':
      await collection.createIndex({ venue_id: 1, timestamp: -1 });
      await collection.createIndex({ event_type: 1, timestamp: -1 });
      await collection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60 } // TTL: 90 days
      );
      break;
      
    case 'user_behavior':
      await collection.createIndex({ venue_id: 1, session_id: 1 });
      await collection.createIndex({ venue_id: 1, user_hash: 1, timestamp: -1 });
      await collection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 180 * 24 * 60 * 60 } // TTL: 180 days
      );
      break;
      
    case 'campaign_performance':
      await collection.createIndex({ venue_id: 1, campaign_id: 1, date: -1 });
      await collection.createIndex({ venue_id: 1, date: -1 });
      break;
  }
  
  logger.info(`Created indexes for ${collectionName}`);
}

export default schemas;
```

### FILE: src/config/rabbitmq.ts
```typescript
const amqp = require('amqplib/callback_api');
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { config } from './index';
import { logger } from '../utils/logger';

let connection: any;
let channel: any;

export async function connectRabbitMQ(): Promise<void> {
  return new Promise((resolve, reject) => {
    amqp.connect(config.rabbitmq.url, (error: any, conn: any) => {
      if (error) {
        logger.error('Failed to connect to RabbitMQ:', error);
        reject(error);
        return;
      }
      
      connection = conn;
      
      connection.createChannel((error: any, ch: any) => {
        if (error) {
          logger.error('Failed to create channel:', error);
          reject(error);
          return;
        }
        
        channel = ch;
        
        // Create exchange
        channel.assertExchange(config.rabbitmq.exchange, 'topic', {
          durable: true,
        });
        
        // Create queue
        channel.assertQueue(config.rabbitmq.queue, {
          durable: true,
          exclusive: false,
          autoDelete: false,
        }, (error: any, queue: any) => {
          if (error) {
            logger.error('Failed to create queue:', error);
            reject(error);
            return;
          }
          
          // Bind queue to exchange for all event types
          channel.bindQueue(queue.queue, config.rabbitmq.exchange, '#');
          
          logger.info('RabbitMQ connected and configured');
          
          // Handle connection events
          connection.on('error', (err: any) => {
            logger.error('RabbitMQ connection error:', err);
          });
          
          connection.on('close', () => {
            logger.warn('RabbitMQ connection closed');
          });
          
          resolve();
        });
      });
    });
  });
}

export function getChannel() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return channel;
}

export async function publishEvent(routingKey: string, data: any) {
  try {
    const message = Buffer.from(JSON.stringify(data));
    channel.publish(
      config.rabbitmq.exchange,
      routingKey,
      message,
      { persistent: true }
    );
  } catch (error) {
    logger.error('Failed to publish event:', error);
    throw error;
  }
}

export async function closeRabbitMQ() {
  return new Promise<void>((resolve) => {
    if (channel) {
      channel.close(() => {
        if (connection) {
          connection.close(() => {
            logger.info('RabbitMQ connection closed');
            resolve();
          });
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}
```

### FILE: src/config/index.ts
```typescript
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3007', 10),
  serviceName: process.env.SERVICE_NAME || 'analytics-service',
  
  database: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    },
  },
  
  analyticsDatabase: {
    host: process.env.ANALYTICS_DB_HOST || 'postgres',
    port: parseInt(process.env.ANALYTICS_DB_PORT || '5432', 10),
    database: process.env.ANALYTICS_DB_NAME || 'tickettoken_db',
    user: process.env.ANALYTICS_DB_USER || 'postgres',
    password: process.env.ANALYTICS_DB_PASSWORD || 'postgres',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '7', 10),
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://mongodb:27017/tickettoken_analytics',
    user: process.env.MONGODB_USER || '',
    password: process.env.MONGODB_PASSWORD || 'postgres',
  },
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'tickettoken_events',
    queue: process.env.RABBITMQ_QUEUE || 'analytics_events',
  },
  
  websocket: {
    port: parseInt(process.env.WEBSOCKET_PORT || '3008', 10),
    path: process.env.WEBSOCKET_PATH || '/analytics/realtime',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    venue: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    event: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
    ticket: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3004',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
    marketplace: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006',
  },
  
  ml: {
    modelPath: process.env.ML_MODEL_PATH || '/app/models',
    trainingEnabled: process.env.ML_TRAINING_ENABLED === 'true',
    updateInterval: parseInt(process.env.ML_UPDATE_INTERVAL || '86400', 10),
  },
  
  export: {
    tempPath: process.env.EXPORT_TEMP_PATH || '/tmp/exports',
    s3Bucket: process.env.EXPORT_S3_BUCKET || 'tickettoken-exports',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  
  monitoring: {
    enabled: process.env.ENABLE_METRICS === 'true',
    port: parseInt(process.env.METRICS_PORT || '9090', 10),
  },
  
  privacy: {
    customerHashSalt: process.env.CUSTOMER_HASH_SALT || 'default-salt-change-this',
    dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
  },
};
```

### FILE: src/config/dependencies.ts
```typescript
// This file will be used to manage service dependencies and dependency injection
// For now, it's a placeholder for future dependency injection setup

export interface Dependencies {
  // Services
  metricsService?: any;
  aggregationService?: any;
  customerIntelService?: any;
  predictionService?: any;
  messageGatewayService?: any;
  attributionService?: any;
  exportService?: any;
  alertService?: any;
  anonymizationService?: any;
  websocketService?: any;
}

const dependencies: Dependencies = {};

export function setDependency(key: keyof Dependencies, value: any) {
  dependencies[key] = value;
}

export function getDependency(key: keyof Dependencies) {
  return dependencies[key];
}

export function getAllDependencies(): Dependencies {
  return dependencies;
}
```

### FILE: src/config/redis-cache-strategies.ts
```typescript
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface CacheStrategy {
  ttl: number; // Time to live in seconds
  keyPrefix: string;
  version: number; // For cache invalidation
}

// Define caching strategies for different data types
export const cacheStrategies: Record<string, CacheStrategy> = {
  // Real-time metrics - very short TTL
  realTimeMetrics: {
    ttl: 5, // 5 seconds
    keyPrefix: 'rtm',
    version: 1
  },
  
  // Aggregated metrics - medium TTL
  aggregatedMetrics: {
    ttl: 300, // 5 minutes
    keyPrefix: 'agg',
    version: 1
  },
  
  // Customer profiles - longer TTL
  customerProfile: {
    ttl: 3600, // 1 hour
    keyPrefix: 'cust',
    version: 1
  },
  
  // Dashboard configs - long TTL
  dashboardConfig: {
    ttl: 86400, // 24 hours
    keyPrefix: 'dash',
    version: 1
  },
  
  // Widget data - varies by widget
  widgetData: {
    ttl: 60, // 1 minute default
    keyPrefix: 'widget',
    version: 1
  },
  
  // Session data - medium TTL
  sessionData: {
    ttl: 1800, // 30 minutes
    keyPrefix: 'sess',
    version: 1
  }
};

export class CacheManager {
  private redis: Redis;
  private prefix: string;
  
  constructor(redis: Redis, prefix: string = 'analytics') {
    this.redis = redis;
    this.prefix = prefix;
  }
  
  // Generate cache key with versioning
  private generateKey(strategy: CacheStrategy, identifier: string): string {
    return `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${identifier}`;
  }
  
  // Set cache with strategy
  async set(
    strategyName: string,
    identifier: string,
    data: any,
    customTTL?: number
  ): Promise<void> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      logger.warn(`Unknown cache strategy: ${strategyName}`);
      return;
    }
    
    const key = this.generateKey(strategy, identifier);
    const ttl = customTTL || strategy.ttl;
    
    try {
      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(data)
      );
      
      logger.debug(`Cached ${strategyName} for ${identifier} with TTL ${ttl}s`);
    } catch (error) {
      logger.error(`Cache set error for ${strategyName}:`, error);
    }
  }
  
  // Get from cache
  async get(strategyName: string, identifier: string): Promise<any | null> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return null;
    }
    
    const key = this.generateKey(strategy, identifier);
    
    try {
      const data = await this.redis.get(key);
      if (data) {
        logger.debug(`Cache hit for ${strategyName}: ${identifier}`);
        return JSON.parse(data);
      }
      logger.debug(`Cache miss for ${strategyName}: ${identifier}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error for ${strategyName}:`, error);
      return null;
    }
  }
  
  // Invalidate cache by pattern
  async invalidate(strategyName: string, pattern?: string): Promise<void> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return;
    }
    
    const keyPattern = pattern
      ? `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${pattern}*`
      : `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:*`;
    
    try {
      const keys = await this.redis.keys(keyPattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Invalidated ${keys.length} cache entries for ${strategyName}`);
      }
    } catch (error) {
      logger.error(`Cache invalidation error for ${strategyName}:`, error);
    }
  }
  
  // Implement cache-aside pattern
  async getOrSet<T>(
    strategyName: string,
    identifier: string,
    fetchFunction: () => Promise<T>,
    customTTL?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get(strategyName, identifier);
    if (cached !== null) {
      return cached;
    }
    
    // Fetch fresh data
    const data = await fetchFunction();
    
    // Cache the result
    await this.set(strategyName, identifier, data, customTTL);
    
    return data;
  }
  
  // Batch get with multi-get optimization
  async mget(strategyName: string, identifiers: string[]): Promise<Map<string, any>> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return new Map();
    }
    
    const keys = identifiers.map(id => this.generateKey(strategy, id));
    const results = new Map<string, any>();
    
    try {
      const values = await this.redis.mget(...keys);
      
      identifiers.forEach((id, index) => {
        const value = values[index];
        if (value) {
          try {
            results.set(id, JSON.parse(value));
          } catch (e) {
            logger.error(`Failed to parse cached value for ${id}:`, e);
          }
        }
      });
      
      logger.debug(`Cache multi-get: ${results.size}/${identifiers.length} hits`);
    } catch (error) {
      logger.error(`Cache mget error for ${strategyName}:`, error);
    }
    
    return results;
  }
  
  // Get cache statistics
  async getStats(): Promise<Record<string, any>> {
    const info = await this.redis.info('stats');
    const dbSize = await this.redis.dbsize();
    
    return {
      dbSize,
      info: info.split('\n').reduce((acc, line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>)
    };
  }
}

export default CacheManager;
```

### FILE: src/config/database.ts
```typescript
import knex from 'knex';
import { config } from './index';
import { logger } from '../utils/logger';

let db: any;
let analyticsDb: any;

export async function connectDatabases() {
  try {
    // Main database connection (through PgBouncer)
    db = knex({
      client: 'postgresql',
      connection: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
      },
      pool: {
        min: config.database.pool.min,
        max: config.database.pool.max,
        createTimeoutMillis: 3000,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
      },
      acquireConnectionTimeout: 30000,
    });

    // Analytics database connection (direct for read replicas)
    analyticsDb = knex({
      client: 'postgresql',
      connection: {
        host: config.analyticsDatabase.host,
        port: config.analyticsDatabase.port,
        database: config.analyticsDatabase.database,
        user: config.analyticsDatabase.user,
        password: config.analyticsDatabase.password,
      },
      pool: {
        min: 2,
        max: 10,
      },
    });

    // SECURITY FIX: Set tenant context using parameterized query
    db.on('query', (query: any) => {
      if ((global as any).currentTenant) {
        query.on('query', async () => {
          // Use parameterized query to prevent SQL injection
          // PostgreSQL doesn't allow parameterization of SET statements directly,
          // but we can validate the tenant ID format
          const tenantId = (global as any).currentTenant;
          
          // Validate tenant ID (should be UUID or similar safe format)
          if (!isValidTenantId(tenantId)) {
            logger.error(`Invalid tenant ID format: ${tenantId}`);
            throw new Error('Invalid tenant ID');
          }
          
          // Since SET doesn't support parameters, we validate and escape
          const escapedTenantId = escapeTenantId(tenantId);
          await db.raw(`SET app.current_tenant = ?`, [escapedTenantId]);
        });
      }
    });

    // Test connections
    await db.raw('SELECT 1');
    await analyticsDb.raw('SELECT 1');

    logger.info('Database connections established');
  } catch (error) {
    logger.error('Failed to connect to databases:', error);
    throw error;
  }
}

// Validate tenant ID format (adjust regex based on your tenant ID format)
function isValidTenantId(tenantId: string): boolean {
  // Example: UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Or alphanumeric with underscores/hyphens
  const alphanumericRegex = /^[a-zA-Z0-9_-]+$/;
  
  return uuidRegex.test(tenantId) || alphanumericRegex.test(tenantId);
}

// Escape tenant ID for safe SQL usage
function escapeTenantId(tenantId: string): string {
  // Remove any potentially dangerous characters
  // This is a backup in case validation fails
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function getAnalyticsDb() {
  if (!analyticsDb) {
    throw new Error('Analytics database not initialized');
  }
  return analyticsDb;
}

export async function closeDatabases() {
  if (db) {
    await db.destroy();
  }
  if (analyticsDb) {
    await analyticsDb.destroy();
  }
  logger.info('Database connections closed');
}
```

### FILE: src/controllers/prediction.controller.ts
```typescript
// import { serviceCache } from '../services/cache-integration'; // TODO: Remove if not needed
import { Request, Response, NextFunction } from 'express';
import { BaseController } from './base.controller';

class PredictionController extends BaseController {
  predictDemand = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { forecast: {} });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  optimizePricing = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { optimization: {} });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  predictChurn = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { prediction: {} });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  predictCLV = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { clv: {} });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  predictNoShow = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { prediction: {} });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  runWhatIfScenario = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { scenario: {} });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getModelPerformance = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { performance: {} });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };
}

export const predictionController = new PredictionController();
```

### FILE: src/controllers/analytics.controller.ts
```typescript
// import { serviceCache } from '../services/cache-integration'; // TODO: Remove if not needed
import { Request, Response, NextFunction } from 'express';
import { analyticsEngine } from '../analytics-engine/analytics-engine';
import { getRedis } from '../config/redis';

interface AuthenticatedRequest extends Request {
  venue?: { id: string; name: string };
}

class AnalyticsController {
  async getRevenueSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.revenue
      });
    } catch (error) {
      next(error);
    }
  }

  async getRevenueByChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.revenue?.byChannel || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getRevenueProjections(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      const venueId = req.venue!.id;

      // Import revenue calculator directly for projections
      const { RevenueCalculator } = await import('../analytics-engine/calculators/revenue-calculator');
      const calculator = new RevenueCalculator();
      
      const projections = await calculator.projectRevenue(venueId, Number(days));

      res.json({
        success: true,
        data: projections
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerLifetimeValue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.clv || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerSegments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.segmentation || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getChurnRiskAnalysis(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.churnRisk || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, granularity = 'day' } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['ticketSales'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string),
          granularity: granularity as 'hour' | 'day' | 'week' | 'month'
        }
      });

      res.json({
        success: true,
        data: result.ticketSales || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesTrends(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['salesTrends'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.salesTrends || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getEventPerformance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.topEvents || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getTopPerformingEvents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, limit = 10 } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      const topEvents = (result.topEvents || []).slice(0, Number(limit));

      res.json({
        success: true,
        data: topEvents
      });
    } catch (error) {
      next(error);
    }
  }

  async getRealtimeSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;
      const redis = getRedis();
      
      const today = new Date().toISOString().split('T')[0];
      const purchaseKey = `metrics:purchase:${venueId}:${today}`;
      const trafficKey = `metrics:traffic:${venueId}:${today}`;
      
      const [purchases, traffic] = await Promise.all([
        redis.hgetall(purchaseKey),
        redis.hgetall(trafficKey)
      ]);

      res.json({
        success: true,
        data: {
          timestamp: new Date(),
          sales: {
            count: parseInt(purchases.total_sales || '0'),
            revenue: parseFloat(purchases.revenue || '0')
          },
          traffic: {
            pageViews: parseInt(traffic.page_views || '0')
          },
          conversionRate: traffic.page_views ? 
            ((parseInt(purchases.total_sales || '0') / parseInt(traffic.page_views)) * 100).toFixed(2) : '0.00'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getConversionFunnel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['conversionRate'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.conversionRate || []
      });
    } catch (error) {
      next(error);
    }
  }

  async executeCustomQuery(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { metrics, timeRange, filters, groupBy } = req.body;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics,
        timeRange: {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end),
          granularity: timeRange.granularity
        },
        filters,
        groupBy
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboardData(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { period = '7d' } = req.query;
      const venueId = req.venue!.id;

      // Calculate date range based on period
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Fetch multiple metrics in parallel
      const [revenueResult, salesResult, customerResult, eventsResult] = await Promise.all([
        analyticsEngine.query({
          venueId,
          metrics: ['revenue'],
          timeRange: { start: startDate, end: endDate }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['ticketSales'],
          timeRange: { 
            start: startDate, 
            end: endDate,
            granularity: period === '24h' ? 'hour' : 'day'
          }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['customerMetrics'],
          timeRange: { start: startDate, end: endDate }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['topEvents'],
          timeRange: { start: startDate, end: endDate }
        })
      ]);

      // Get real-time metrics
      const redis = getRedis();
      const today = new Date().toISOString().split('T')[0];
      const [todayPurchases, todayTraffic] = await Promise.all([
        redis.hgetall(`metrics:purchase:${venueId}:${today}`),
        redis.hgetall(`metrics:traffic:${venueId}:${today}`)
      ]);

      res.json({
        success: true,
        data: {
          period,
          summary: {
            totalRevenue: revenueResult.revenue?.byChannel?.total || 0,
            totalTicketsSold: salesResult.ticketSales?.reduce((sum: number, day: any) => sum + day.ticketsSold, 0) || 0,
            uniqueCustomers: customerResult.customerMetrics?.clv?.totalCustomers || 0,
            topEvent: eventsResult.topEvents?.[0] || null
          },
          realtime: {
            todayRevenue: parseFloat(todayPurchases.revenue || '0'),
            todaySales: parseInt(todayPurchases.total_sales || '0'),
            currentTraffic: parseInt(todayTraffic.page_views || '0')
          },
          charts: {
            revenue: revenueResult.revenue,
            sales: salesResult.ticketSales,
            customerSegments: customerResult.customerMetrics?.segmentation
          },
          topEvents: eventsResult.topEvents?.slice(0, 5)
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
```

### FILE: src/models/index.ts
```typescript
// PostgreSQL Models
export * from './postgres/metric.model';
export * from './postgres/aggregation.model';
export * from './postgres/alert.model';
export * from './postgres/dashboard.model';
export * from './postgres/widget.model';
export * from './postgres/export.model';

// MongoDB Schemas
export * from './mongodb/event.schema';
export * from './mongodb/user-behavior.schema';
export * from './mongodb/campaign.schema';
export * from './mongodb/raw-analytics.schema';

// Redis Models
export * from './redis/cache.model';
export * from './redis/realtime.model';
export * from './redis/session.model';
```

### FILE: src/models/mongodb/user-behavior.schema.ts
```typescript
import { getMongoDB } from '../../config/mongodb';
import { v4 as uuidv4 } from 'uuid';

export interface UserBehavior {
  id: string;
  venueId: string;
  userId: string; // Hashed user ID
  sessionId: string;
  timestamp: Date;
  eventType: string;
  pageUrl?: string;
  referrer?: string;
  deviceInfo?: {
    type: string;
    os: string;
    browser: string;
    userAgent: string;
  };
  geoInfo?: {
    country: string;
    region: string;
    city: string;
  };
  properties?: Record<string, any>;
  duration?: number;
}

export class UserBehaviorSchema {
  private static collectionName = 'user_behavior';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<UserBehavior>(this.collectionName);
  }
  
  static async trackBehavior(behavior: Omit<UserBehavior, 'id'>): Promise<UserBehavior> {
    const collection = this.getCollection();
    const behaviorWithId = {
      id: uuidv4(),
      ...behavior,
      timestamp: new Date()
    };
    
    await collection.insertOne(behaviorWithId);
    return behaviorWithId;
  }
  
  static async getUserJourney(
    venueId: string,
    userId: string,
    limit: number = 100
  ): Promise<UserBehavior[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({ venueId, userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
  
  static async getSessionActivity(
    sessionId: string
  ): Promise<UserBehavior[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray();
  }
  
  static async aggregateUserBehavior(
    venueId: string,
    pipeline: any[]
  ): Promise<any[]> {
    const collection = this.getCollection();
    
    const fullPipeline = [
      { $match: { venueId } },
      ...pipeline
    ];
    
    return await collection.aggregate(fullPipeline).toArray();
  }
  
  static async getPageViews(
    venueId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ _id: string; views: number; uniqueUsers: number }>> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      {
        $group: {
          _id: '$pageUrl',
          views: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 1,
          views: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { views: -1 } }
    );
    
    return await this.aggregateUserBehavior(venueId, pipeline);
  }
  
  static async getDeviceStats(
    venueId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      {
        $group: {
          _id: {
            type: '$deviceInfo.type',
            os: '$deviceInfo.os',
            browser: '$deviceInfo.browser'
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 1,
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { count: -1 } }
    );
    
    return await this.aggregateUserBehavior(venueId, pipeline);
  }
}
```

### FILE: src/models/mongodb/event.schema.ts
```typescript
import { getMongoDB } from '../../config/mongodb';
import { AnalyticsEvent } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class EventSchema {
  private static collectionName = 'analytics_events';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<AnalyticsEvent>(this.collectionName);
  }
  
  static async createEvent(event: Omit<AnalyticsEvent, 'id'>): Promise<AnalyticsEvent> {
    const collection = this.getCollection();
    const eventWithId = {
      id: uuidv4(),
      ...event,
      timestamp: new Date()
    };
    
    await collection.insertOne(eventWithId);
    return eventWithId;
  }
  
  static async bulkCreateEvents(events: Omit<AnalyticsEvent, 'id'>[]): Promise<void> {
    const collection = this.getCollection();
    const eventsWithIds = events.map(event => ({
      id: uuidv4(),
      ...event,
      timestamp: new Date()
    }));
    
    await collection.insertMany(eventsWithIds);
  }
  
  static async getEvents(
    venueId: string,
    filters: {
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      eventId?: string;
      limit?: number;
    } = {}
  ): Promise<AnalyticsEvent[]> {
    const collection = this.getCollection();
    const query: any = { venueId };
    
    if (filters.eventType) {
      query.eventType = filters.eventType;
    }
    
    if (filters.userId) {
      query.userId = filters.userId;
    }
    
    if (filters.eventId) {
      query.eventId = filters.eventId;
    }
    
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.timestamp.$lte = filters.endDate;
      }
    }
    
    return await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(filters.limit || 1000)
      .toArray();
  }
  
  static async aggregateEvents(
    venueId: string,
    pipeline: any[]
  ): Promise<any[]> {
    const collection = this.getCollection();
    
    const fullPipeline = [
      { $match: { venueId } },
      ...pipeline
    ];
    
    return await collection.aggregate(fullPipeline).toArray();
  }
  
  static async getEventCounts(
    venueId: string,
    groupBy: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ _id: string; count: number }>> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      { $group: { _id: `$${groupBy}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    );
    
    return await this.aggregateEvents(venueId, pipeline);
  }
}
```

### FILE: src/models/mongodb/campaign.schema.ts
```typescript
import { getMongoDB } from '../../config/mongodb';
import { Campaign, TouchPoint } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class CampaignSchema {
  private static collectionName = 'campaigns';
  private static touchpointsCollection = 'campaign_touchpoints';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<Campaign>(this.collectionName);
  }
  
  static getTouchpointsCollection() {
    const db = getMongoDB();
    return db.collection<TouchPoint>(this.touchpointsCollection);
  }
  
  static async createCampaign(campaign: Omit<Campaign, 'id'>): Promise<Campaign> {
    const collection = this.getCollection();
    const campaignWithId = {
      id: uuidv4(),
      ...campaign,
      createdAt: new Date()
    };
    
    await collection.insertOne(campaignWithId);
    return campaignWithId;
  }
  
  static async updateCampaign(
    id: string,
    updates: Partial<Campaign>
  ): Promise<Campaign | null> {
    const collection = this.getCollection();
    
    const result = await collection.findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after' }
    );
    
    return result;
  }
  
  static async getCampaigns(
    venueId: string,
    filters: {
      status?: string;
      type?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<Campaign[]> {
    const collection = this.getCollection();
    const query: any = { venueId };
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.startDate || filters.endDate) {
      query.$or = [];
      
      if (filters.startDate) {
        query.$or.push({ endDate: { $gte: filters.startDate } });
      }
      
      if (filters.endDate) {
        query.$or.push({ startDate: { $lte: filters.endDate } });
      }
    }
    
    return await collection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
  }
  
  static async trackTouchpoint(touchpoint: TouchPoint): Promise<void> {
    const collection = this.getTouchpointsCollection();
    await collection.insertOne({
      ...touchpoint,
      timestamp: new Date()
    });
  }
  
  static async bulkTrackTouchpoints(touchpoints: TouchPoint[]): Promise<void> {
    const collection = this.getTouchpointsCollection();
    const touchpointsWithTimestamp = touchpoints.map(tp => ({
      ...tp,
      timestamp: new Date()
    }));
    
    await collection.insertMany(touchpointsWithTimestamp);
  }
  
  static async getCustomerTouchpoints(
    venueId: string,
    customerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TouchPoint[]> {
    const collection = this.getTouchpointsCollection();
    const query: any = { venueId, customerId };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }
    
    return await collection
      .find(query)
      .sort({ timestamp: 1 })
      .toArray();
  }
  
  static async getCampaignPerformance(
    campaignId: string
  ): Promise<any> {
    const collection = this.getTouchpointsCollection();
    
    const pipeline = [
      { $match: { campaign: campaignId } },
      {
        $group: {
          _id: '$channel',
          impressions: {
            $sum: { $cond: [{ $eq: ['$action', 'impression'] }, 1, 0] }
          },
          clicks: {
            $sum: { $cond: [{ $eq: ['$action', 'click'] }, 1, 0] }
          },
          conversions: {
            $sum: { $cond: [{ $eq: ['$action', 'conversion'] }, 1, 0] }
          },
          revenue: {
            $sum: { $cond: [{ $eq: ['$action', 'conversion'] }, '$value', 0] }
          }
        }
      }
    ];
    
    return await collection.aggregate(pipeline).toArray();
  }
}
```

### FILE: src/models/mongodb/raw-analytics.schema.ts
```typescript
import { getMongoDB } from '../../config/mongodb';
import { v4 as uuidv4 } from 'uuid';

export interface RawAnalyticsData {
  id: string;
  venueId: string;
  dataType: string;
  source: string;
  timestamp: Date;
  data: any;
  processed: boolean;
  processingAttempts: number;
  lastProcessingError?: string;
  metadata?: Record<string, any>;
}

export class RawAnalyticsSchema {
  private static collectionName = 'raw_analytics';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<RawAnalyticsData>(this.collectionName);
  }
  
  static async storeRawData(data: Omit<RawAnalyticsData, 'id'>): Promise<RawAnalyticsData> {
    const collection = this.getCollection();
    const rawData = {
      id: uuidv4(),
      ...data,
      timestamp: new Date(),
      processed: false,
      processingAttempts: 0
    };
    
    await collection.insertOne(rawData);
    return rawData;
  }
  
  static async bulkStoreRawData(dataArray: Omit<RawAnalyticsData, 'id'>[]): Promise<void> {
    const collection = this.getCollection();
    const rawDataWithIds = dataArray.map(data => ({
      id: uuidv4(),
      ...data,
      timestamp: new Date(),
      processed: false,
      processingAttempts: 0
    }));
    
    await collection.insertMany(rawDataWithIds);
  }
  
  static async getUnprocessedData(
    limit: number = 100,
    maxAttempts: number = 3
  ): Promise<RawAnalyticsData[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({
        processed: false,
        processingAttempts: { $lt: maxAttempts }
      })
      .sort({ timestamp: 1 })
      .limit(limit)
      .toArray();
  }
  
  static async markAsProcessed(
    id: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    const collection = this.getCollection();
    
    const update: any = {
      $inc: { processingAttempts: 1 }
    };
    
    if (success) {
      update.$set = { processed: true };
    } else {
      update.$set = { lastProcessingError: error };
    }
    
    await collection.updateOne({ id }, update);
  }
  
  static async getRawDataByType(
    venueId: string,
    dataType: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<RawAnalyticsData[]> {
    const collection = this.getCollection();
    const query: any = { venueId, dataType };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }
    
    return await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
  
  static async cleanupOldData(
    retentionDays: number
  ): Promise<number> {
    const collection = this.getCollection();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await collection.deleteMany({
      timestamp: { $lt: cutoffDate },
      processed: true
    });
    
    return result.deletedCount || 0;
  }
  
  static async getDataStats(
    venueId: string
  ): Promise<any> {
    const collection = this.getCollection();
    
    const pipeline = [
      { $match: { venueId } },
      {
        $group: {
          _id: {
            dataType: '$dataType',
            source: '$source',
            processed: '$processed'
          },
          count: { $sum: 1 },
          oldestRecord: { $min: '$timestamp' },
          newestRecord: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ];
    
    return await collection.aggregate(pipeline).toArray();
  }
}
```

### FILE: src/models/postgres/dashboard.model.ts
```typescript
import { BaseModel } from './base.model';
import { Dashboard } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class DashboardModel extends BaseModel {
  protected static tableName = 'analytics_dashboards';
  
  static async createDashboard(
    data: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Dashboard> {
    const dashboard = {
      id: uuidv4(),
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(dashboard);
  }
  
  static async getDashboardsByVenue(
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orWhere('is_public', true)
      .orderBy('name', 'asc');
  }
  
  static async getDashboardsForUser(
    userId: string,
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .andWhere((builder: any) => {
        builder.where('owner_id', userId)
          .orWhere('is_public', true)
          .orWhereRaw(`permissions->'sharedWith' @> '[{"userId": "${userId}"}]'`);
      })
      .orderBy('name', 'asc');
  }
  
  static async updateDashboard(
    id: string,
    data: Partial<Dashboard>
  ): Promise<Dashboard> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async duplicateDashboard(
    dashboardId: string,
    newName: string,
    userId: string
  ): Promise<Dashboard> {
    const original = await this.findById(dashboardId);
    
    if (!original) {
      throw new Error('Dashboard not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      name: newName,
      isDefault: false,
      permissions: {
        ownerId: userId,
        public: false,
        sharedWith: []
      },
      created_at: new Date(),
      updated_at: new Date(),
      created_by: userId,
      updated_by: userId
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async shareDashboard(
    dashboardId: string,
    shareWith: Array<{
      userId?: string;
      roleId?: string;
      permission: 'view' | 'edit' | 'admin';
    }>
  ): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId);
    
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }
    
    const permissions = dashboard.permissions;
    permissions.sharedWith = [
      ...permissions.sharedWith,
      ...shareWith
    ];
    
    return await this.update(dashboardId, { permissions });
  }
  
  static async getDefaultDashboard(
    venueId: string
  ): Promise<Dashboard | null> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('is_default', true)
      .first();
  }
}
```

### FILE: src/models/postgres/metric.model.ts
```typescript
import { BaseModel } from './base.model';
import { Metric, MetricType, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class MetricModel extends BaseModel {
  protected static tableName = 'analytics_metrics';

  static async createMetric(data: Omit<Metric, 'id'>): Promise<Metric> {
    const metric = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    return await this.create(metric);
  }

  static async getMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    const db = this.db();
    let query = db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .orderBy('timestamp', 'asc');

    if (granularity) {
      query = query.where('granularity', granularity);
    }

    return await query;
  }

  static async aggregateMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    const db = this.db();
    
    // SECURITY FIX: Whitelist aggregation functions
    const validAggregations: Record<string, string> = {
      'sum': 'SUM',
      'avg': 'AVG',
      'min': 'MIN',
      'max': 'MAX',
      'count': 'COUNT'
    };
    
    const aggFunction = validAggregations[aggregation];
    if (!aggFunction) {
      throw new Error(`Invalid aggregation function: ${aggregation}. Must be one of: ${Object.keys(validAggregations).join(', ')}`);
    }
    
    // Now safe to use the whitelisted aggregation function
    const result = await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .select(db.raw(`${aggFunction}(value) as result`))
      .first();

    return result?.result || 0;
  }

  static async getLatestMetric(
    venueId: string,
    metricType: MetricType
  ): Promise<Metric | null> {
    const db = this.db();
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .orderBy('timestamp', 'desc')
      .first();
  }

  static async bulkInsert(metrics: Omit<Metric, 'id'>[]): Promise<void> {
    const db = this.db();
    const metricsWithIds = metrics.map(metric => ({
      id: uuidv4(),
      ...metric,
      created_at: new Date()
    }));
    await db(this.tableName).insert(metricsWithIds);
  }

  static async deleteOldMetrics(
    retentionDays: number
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    return await db(this.tableName)
      .where('timestamp', '<', cutoffDate)
      .delete();
  }
}
```

### FILE: src/models/postgres/aggregation.model.ts
```typescript
import { BaseModel } from './base.model';
import { MetricAggregation, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AggregationModel extends BaseModel {
  protected static tableName = 'analytics_aggregations';
  
  static async createAggregation(
    venueId: string,
    data: MetricAggregation
  ): Promise<MetricAggregation> {
    const aggregation = {
      id: uuidv4(),
      venue_id: venueId,
      metric_type: data.metricType,
      period_start: data.period.startDate,
      period_end: data.period.endDate,
      granularity: JSON.stringify(data.granularity),
      data: JSON.stringify(data.data),
      summary: JSON.stringify(data.summary),
      created_at: new Date()
    };
    
    return await this.create(aggregation);
  }
  
  static async getAggregations(
    venueId: string,
    filters: {
      metricType?: string;
      granularity?: TimeGranularity;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<MetricAggregation[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (filters.metricType) {
      query = query.where('metric_type', filters.metricType);
    }
    
    if (filters.granularity) {
      query = query.where('granularity', JSON.stringify(filters.granularity));
    }
    
    if (filters.startDate && filters.endDate) {
      query = query.whereBetween('period_start', [
        filters.startDate,
        filters.endDate
      ]);
    }
    
    const results = await query.orderBy('period_start', 'asc');
    
    // Transform back to proper format
    return results.map((row: any) => ({
      metricType: row.metric_type,
      period: {
        startDate: row.period_start,
        endDate: row.period_end
      },
      granularity: JSON.parse(row.granularity),
      data: JSON.parse(row.data),
      summary: JSON.parse(row.summary)
    }));
  }
  
  static async upsertAggregation(
    venueId: string,
    aggregation: MetricAggregation
  ): Promise<MetricAggregation> {
    const db = this.db();
    
    const existing = await db(this.tableName)
      .where({
        venue_id: venueId,
        metric_type: aggregation.metricType,
        period_start: aggregation.period.startDate,
        period_end: aggregation.period.endDate,
        granularity: JSON.stringify(aggregation.granularity)
      })
      .first();
    
    if (existing) {
      return await this.update(existing.id, {
        data: JSON.stringify(aggregation.data),
        summary: JSON.stringify(aggregation.summary),
        updated_at: new Date()
      });
    } else {
      return await this.createAggregation(venueId, aggregation);
    }
  }
  
  static async getHourlyAggregations(
    venueId: string,
    date: Date
  ): Promise<MetricAggregation[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await this.getAggregations(venueId, {
      granularity: { unit: 'hour', value: 1 },
      startDate: startOfDay,
      endDate: endOfDay
    });
  }
  
  static async getDailyAggregations(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MetricAggregation[]> {
    return await this.getAggregations(venueId, {
      granularity: { unit: 'day', value: 1 },
      startDate,
      endDate
    });
  }
}
```

### FILE: src/models/postgres/widget.model.ts
```typescript
import { BaseModel } from './base.model';
import { WidgetConfig, WidgetData } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class WidgetModel extends BaseModel {
  protected static tableName = 'analytics_widgets';
  
  static async createWidget(
    data: Omit<WidgetConfig, 'id'>
  ): Promise<WidgetConfig> {
    const widget = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    
    return await this.create(widget);
  }
  
  static async getWidgetsByDashboard(
    dashboardId: string
  ): Promise<WidgetConfig[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('dashboard_id', dashboardId)
      .orderBy('position_y', 'asc')
      .orderBy('position_x', 'asc');
  }
  
  static async updateWidget(
    id: string,
    data: Partial<WidgetConfig>
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetPosition(
    id: string,
    position: { x: number; y: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      position,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetSize(
    id: string,
    size: { width: number; height: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      size,
      updated_at: new Date()
    });
  }
  
  static async duplicateWidget(
    widgetId: string
  ): Promise<WidgetConfig> {
    const original = await this.findById(widgetId);
    
    if (!original) {
      throw new Error('Widget not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      title: `${original.title} (Copy)`,
      position: {
        x: original.position.x + 1,
        y: original.position.y + 1
      },
      created_at: new Date()
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async getWidgetData(
    widgetId: string,
    limit: number = 1
  ): Promise<WidgetData[]> {
    const db = this.db();
    
    return await db('analytics_widget_data')
      .where('widget_id', widgetId)
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }
  
  static async saveWidgetData(
    widgetId: string,
    data: any
  ): Promise<void> {
    const db = this.db();
    
    await db('analytics_widget_data').insert({
      id: uuidv4(),
      widget_id: widgetId,
      data,
      timestamp: new Date()
    });
  }
}
```

### FILE: src/models/postgres/alert.model.ts
```typescript
import { BaseModel } from './base.model';
import { Alert, AlertInstance, AlertStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AlertModel extends BaseModel {
  protected static tableName = 'analytics_alerts';
  
  static async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    const alert = {
      id: uuidv4(),
      ...data,
      trigger_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(alert);
  }
  
  static async getAlertsByVenue(
    venueId: string,
    enabled?: boolean
  ): Promise<Alert[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (enabled !== undefined) {
      query = query.where('enabled', enabled);
    }
    
    return await query.orderBy('severity', 'desc');
  }
  
  static async updateAlert(
    id: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async toggleAlert(
    id: string,
    enabled: boolean
  ): Promise<Alert> {
    return await this.updateAlert(id, { enabled });
  }
  
  static async incrementTriggerCount(
    id: string
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .increment('trigger_count', 1)
      .update({
        last_triggered: new Date(),
        status: AlertStatus.TRIGGERED
      });
  }
  
  static async createAlertInstance(
    data: Omit<AlertInstance, 'id'>
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const instance = {
      id: uuidv4(),
      ...data,
      status: 'active'
    };
    
    const [result] = await db('analytics_alert_instances')
      .insert(instance)
      .returning('*');
    
    return result;
  }
  
  static async getAlertInstances(
    alertId: string,
    limit: number = 50
  ): Promise<AlertInstance[]> {
    const db = this.db();
    
    return await db('analytics_alert_instances')
      .where('alert_id', alertId)
      .orderBy('triggered_at', 'desc')
      .limit(limit);
  }
  
  static async acknowledgeAlertInstance(
    instanceId: string,
    userId: string,
    notes?: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'acknowledged',
        acknowledged_by: userId,
        notes,
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
  
  static async resolveAlertInstance(
    instanceId: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'resolved',
        resolved_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
}
```

### FILE: src/models/postgres/base.model.ts
```typescript
import { getDb } from '../../config/database';
import { logger } from '../../utils/logger';

export abstract class BaseModel {
  protected static tableName: string;
  protected static db = getDb;
  
  protected static async query(sql: string, params?: any[]): Promise<any> {
    try {
      const db = this.db();
      return await db.raw(sql, params);
    } catch (error) {
      logger.error(`Query error in ${this.tableName}:`, error);
      throw error;
    }
  }
  
  protected static async transaction<T>(
    callback: (trx: any) => Promise<T>
  ): Promise<T> {
    const db = this.db();
    return await db.transaction(callback);
  }
  
  static async findById(id: string): Promise<any> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .first();
    return result;
  }
  
  static async findAll(
    filters: Record<string, any> = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: 'asc' | 'desc';
    } = {}
  ): Promise<any[]> {
    const db = this.db();
    let query = db(this.tableName).where(filters);
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.order || 'asc');
    }
    
    return await query;
  }
  
  static async create(data: Record<string, any>): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .insert(data)
      .returning('*');
    return result;
  }
  
  static async update(
    id: string,
    data: Record<string, any>
  ): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');
    return result;
  }
  
  static async delete(id: string): Promise<boolean> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .delete();
    return result > 0;
  }
}
```

### FILE: src/models/postgres/export.model.ts
```typescript
import { BaseModel } from './base.model';
import { ExportRequest, ExportStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class ExportModel extends BaseModel {
  protected static tableName = 'analytics_exports';
  
  static async createExport(
    data: Omit<ExportRequest, 'id' | 'createdAt'>
  ): Promise<ExportRequest> {
    const exportRequest = {
      id: uuidv4(),
      ...data,
      status: ExportStatus.PENDING,
      progress: 0,
      created_at: new Date()
    };
    
    return await this.create(exportRequest);
  }
  
  static async getExportsByVenue(
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async getExportsByUser(
    userId: string,
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('user_id', userId)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async updateExportStatus(
    id: string,
    status: ExportStatus,
    data?: {
      progress?: number;
      fileUrl?: string;
      fileSize?: number;
      error?: string;
      completedAt?: Date;
    }
  ): Promise<ExportRequest> {
    return await this.update(id, {
      status,
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateProgress(
    id: string,
    progress: number
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .update({
        progress,
        updated_at: new Date()
      });
  }
  
  static async getPendingExports(
    limit: number = 10
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('status', ExportStatus.PENDING)
      .orderBy('created_at', 'asc')
      .limit(limit);
  }
  
  static async cleanupExpiredExports(
    expirationDays: number = 7
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - expirationDays);
    
    return await db(this.tableName)
      .where('status', ExportStatus.COMPLETED)
      .where('created_at', '<', cutoffDate)
      .delete();
  }
}
```

### FILE: src/models/redis/session.model.ts
```typescript
import { getRedis } from '../../config/redis';
import { v4 as uuidv4 } from 'uuid';

export interface AnalyticsSession {
  sessionId: string;
  userId: string;
  venueId: string;
  startTime: Date;
  lastActivity: Date;
  pageViews: number;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
  metadata?: Record<string, any>;
}

export class SessionModel {
  private static redis = getRedis;
  private static SESSION_TTL = 1800; // 30 minutes
  
  static async createSession(
    userId: string,
    venueId: string,
    metadata?: Record<string, any>
  ): Promise<AnalyticsSession> {
    const redis = this.redis();
    const sessionId = uuidv4();
    const key = `session:${sessionId}`;
    
    const session: AnalyticsSession = {
      sessionId,
      userId,
      venueId,
      startTime: new Date(),
      lastActivity: new Date(),
      pageViews: 0,
      events: [],
      metadata
    };
    
    await redis.set(key, JSON.stringify(session));
    await redis.expire(key, this.SESSION_TTL);
    
    // Add to user's active sessions
    await redis.sadd(`user:sessions:${userId}`, sessionId);
    await redis.expire(`user:sessions:${userId}`, this.SESSION_TTL);
    
    return session;
  }
  
  static async getSession(
    sessionId: string
  ): Promise<AnalyticsSession | null> {
    const redis = this.redis();
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    
    return data ? JSON.parse(data) : null;
  }
  
  static async updateSession(
    sessionId: string,
    updates: Partial<AnalyticsSession>
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    const redis = this.redis();
    const key = `session:${sessionId}`;
    
    const updated = {
      ...session,
      ...updates,
      lastActivity: new Date()
    };
    
    await redis.set(key, JSON.stringify(updated));
    await redis.expire(key, this.SESSION_TTL);
  }
  
  static async trackEvent(
    sessionId: string,
    eventType: string,
    eventData?: any
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.events.push({
      type: eventType,
      timestamp: new Date(),
      data: eventData
    });
    
    await this.updateSession(sessionId, {
      events: session.events,
      pageViews: eventType === 'page_view' ? session.pageViews + 1 : session.pageViews
    });
  }
  
  static async getUserSessions(
    userId: string
  ): Promise<string[]> {
    const redis = this.redis();
    return await redis.smembers(`user:sessions:${userId}`);
  }
  
  static async getActiveSessions(
    venueId: string
  ): Promise<number> {
    const redis = this.redis();
    const pattern = `session:*`;
    const keys = await redis.keys(pattern);
    
    let activeCount = 0;
    
    for (const key of keys) {
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.venueId === venueId) {
          activeCount++;
        }
      }
    }
    
    return activeCount;
  }
  
  static async endSession(
    sessionId: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return;
    }
    
    const redis = this.redis();
    
    // Remove from active sessions
    await redis.srem(`user:sessions:${session.userId}`, sessionId);
    
    // Store session summary for analytics
    const summaryKey = `session:summary:${sessionId}`;
    const summary = {
      sessionId,
      userId: session.userId,
      venueId: session.venueId,
      startTime: session.startTime,
      endTime: new Date(),
      duration: new Date().getTime() - new Date(session.startTime).getTime(),
      pageViews: session.pageViews,
      eventCount: session.events.length
    };
    
    await redis.set(summaryKey, JSON.stringify(summary));
    await redis.expire(summaryKey, 86400); // Keep for 24 hours
    
    // Delete session
    await redis.del(`session:${sessionId}`);
  }
  
  static async getSessionMetrics(
    venueId: string
  ): Promise<any> {
    const redis = this.redis();
    const pattern = `session:summary:*`;
    const keys = await redis.keys(pattern);
    
    const metrics = {
      totalSessions: 0,
      averageDuration: 0,
      averagePageViews: 0,
      totalDuration: 0
    };
    
    for (const key of keys) {
      const summaryData = await redis.get(key);
      if (summaryData) {
        const summary = JSON.parse(summaryData);
        if (summary.venueId === venueId) {
          metrics.totalSessions++;
          metrics.totalDuration += summary.duration;
          metrics.averagePageViews += summary.pageViews;
        }
      }
    }
    
    if (metrics.totalSessions > 0) {
      metrics.averageDuration = metrics.totalDuration / metrics.totalSessions;
      metrics.averagePageViews = metrics.averagePageViews / metrics.totalSessions;
    }
    
    return metrics;
  }
}
```

### FILE: src/models/redis/cache.model.ts
```typescript
import { getRedis } from '../../config/redis';
import { CONSTANTS } from '../../config/constants';

export class CacheModel {
  private static redis = getRedis;
  
  static async get<T>(key: string): Promise<T | null> {
    const redis = this.redis();
    const value = await redis.get(key);
    
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value as any;
      }
    }
    
    return null;
  }
  
  static async set(
    key: string,
    value: any,
    ttl?: number
  ): Promise<void> {
    const redis = this.redis();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  }
  
  static async delete(key: string): Promise<void> {
    const redis = this.redis();
    await redis.del(key);
  }
  
  static async deletePattern(pattern: string): Promise<number> {
    const redis = this.redis();
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    
    return 0;
  }
  
  static async exists(key: string): Promise<boolean> {
    const redis = this.redis();
    return (await redis.exists(key)) === 1;
  }
  
  static async expire(key: string, ttl: number): Promise<void> {
    const redis = this.redis();
    await redis.expire(key, ttl);
  }
  
  static async increment(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.incrby(key, by);
  }
  
  static async decrement(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.decrby(key, by);
  }
  
  // Cache helpers for specific data types
  static getCacheKey(type: string, ...parts: string[]): string {
    return `analytics:${type}:${parts.join(':')}`;
  }
  
  static async cacheMetric(
    venueId: string,
    metricType: string,
    value: any,
    ttl: number = CONSTANTS.CACHE_TTL.METRICS
  ): Promise<void> {
    const key = this.getCacheKey('metric', venueId, metricType);
    await this.set(key, value, ttl);
  }
  
  static async getCachedMetric<T>(
    venueId: string,
    metricType: string
  ): Promise<T | null> {
    const key = this.getCacheKey('metric', venueId, metricType);
    return await this.get<T>(key);
  }
  
  static async cacheWidget(
    widgetId: string,
    data: any,
    ttl: number = CONSTANTS.CACHE_TTL.DASHBOARD
  ): Promise<void> {
    const key = this.getCacheKey('widget', widgetId);
    await this.set(key, data, ttl);
  }
  
  static async getCachedWidget<T>(
    widgetId: string
  ): Promise<T | null> {
    const key = this.getCacheKey('widget', widgetId);
    return await this.get<T>(key);
  }
  
  static async invalidateVenueCache(venueId: string): Promise<void> {
    const pattern = this.getCacheKey('*', venueId, '*');
    await this.deletePattern(pattern);
  }
}
```

### FILE: src/models/redis/realtime.model.ts
```typescript
import { getRedis, getPubClient, getSubClient } from '../../config/redis';
import { RealTimeMetric } from '../../types';

export class RealtimeModel {
  private static redis = getRedis;
  private static pub = getPubClient;
  private static sub = getSubClient;
  
  static async updateRealTimeMetric(
    venueId: string,
    metricType: string,
    value: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    
    // Get previous value
    const previousValue = await redis.get(key);
    const prev = previousValue ? parseFloat(previousValue) : 0;
    
    // Update current value
    await redis.set(key, value.toString());
    await redis.expire(key, 300); // 5 minutes TTL
    
    // Calculate change
    const change = value - prev;
    const changePercent = prev > 0 ? ((change / prev) * 100) : 0;
    
    // Create metric object
    const metric: RealTimeMetric = {
      metricType: metricType as any,
      currentValue: value,
      previousValue: prev,
      change,
      changePercent,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      lastUpdated: new Date()
    };
    
    // Publish update
    await this.publishMetricUpdate(venueId, metricType, metric);
  }
  
  static async getRealTimeMetric(
    venueId: string,
    metricType: string
  ): Promise<RealTimeMetric | null> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    const value = await redis.get(key);
    const data = await redis.get(dataKey);
    
    if (value && data) {
      return JSON.parse(data);
    }
    
    return null;
  }
  
  static async incrementCounter(
    venueId: string,
    counterType: string,
    by: number = 1
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.incrby(key, by);
    
    // Update real-time metric
    await this.updateRealTimeMetric(venueId, counterType, value);
    
    return value;
  }
  
  static async getCounter(
    venueId: string,
    counterType: string
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.get(key);
    
    return value ? parseInt(value) : 0;
  }
  
  static async resetCounter(
    venueId: string,
    counterType: string
  ): Promise<void> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    await redis.set(key, '0');
  }
  
  static async publishMetricUpdate(
    venueId: string,
    metricType: string,
    data: any
  ): Promise<void> {
    const pub = this.pub();
    const channel = `metrics:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    // Store data for future requests
    const redis = this.redis();
    await redis.set(dataKey, JSON.stringify(data));
    await redis.expire(dataKey, 300);
    
    // Publish to subscribers
    await pub.publish(channel, JSON.stringify(data));
  }
  
  static async subscribeToMetric(
    venueId: string,
    metricType: string,
    callback: (data: any) => void
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    
    await sub.subscribe(channel);
    
    sub.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          console.error('Error parsing metric update:', error);
        }
      }
    });
  }
  
  static async unsubscribeFromMetric(
    venueId: string,
    metricType: string
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    await sub.unsubscribe(channel);
  }
  
  static async setGauge(
    venueId: string,
    gaugeName: string,
    value: number,
    max: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    
    const data = {
      current: value,
      max,
      percentage: (value / max) * 100,
      timestamp: new Date()
    };
    
    await redis.set(key, JSON.stringify(data));
    await redis.expire(key, 300);
    
    // Publish update
    await this.publishMetricUpdate(venueId, `gauge:${gaugeName}`, data);
  }
  
  static async getGauge(
    venueId: string,
    gaugeName: string
  ): Promise<any | null> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    const value = await redis.get(key);
    
    return value ? JSON.parse(value) : null;
  }
}
```

### FILE: src/middleware/auth.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    permissions: string[];
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // In production, this would validate JWT token
    // For now, mock authentication
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    // Mock user - in production, decode and verify JWT
    req.user = {
      id: 'user-123',
      venueId: req.params.venueId || req.body?.venueId,
      permissions: ['analytics.read', 'analytics.write', 'analytics.export']
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Not authenticated'));
    }

    const hasPermission = requiredPermissions.some(permission =>
      req.user!.permissions.includes(permission)
    );

    if (!hasPermission) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
  venue?: {
    id: string;
    name: string;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new ApiError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
    req.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    // Also set venue info if available
    if (decoded.venueId) {
      req.venue = {
        id: decoded.venueId,
        name: decoded.venueName || 'Venue'
      };
    }

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(new ApiError(401, 'Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      next(new ApiError(401, 'Invalid token'));
    } else {
      next(error);
    }
  }
};

export const authorize = (permissions: string[] | string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, 'Authentication required'));
      return;
    }

    const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
    const userPerms = req.user.permissions || [];
    
    // Check if user has admin role (bypass permissions)
    if (req.user.role === 'admin') {
      next();
      return;
    }
    
    // Check if user has required permissions
    const hasPermission = requiredPerms.some(perm => 
      userPerms.includes(perm) || userPerms.includes('*')
    );

    if (!hasPermission) {
      next(new ApiError(403, 'Insufficient permissions'));
      return;
    }

    next();
  };
};

// Legacy function name support
export const authenticateVenue = authenticate;
```

### FILE: src/services/realtime-aggregation.service.ts
```typescript
import { getRedis } from '../config/redis';
import { getAnalyticsDb } from '../config/database';
import { logger } from '../utils/logger';
import { emitMetricUpdate, emitAlert } from '../config/websocket';

interface AggregationWindow {
  interval: number; // in seconds
  retention: number; // in seconds
}

export class RealtimeAggregationService {
  private redis = getRedis();
  private analyticsDb = getAnalyticsDb();
  private intervalHandles: NodeJS.Timeout[] = [];
  
  private aggregationWindows: Record<string, AggregationWindow> = {
    '1min': { interval: 60, retention: 3600 },      // 1 hour retention
    '5min': { interval: 300, retention: 86400 },    // 24 hour retention
    '1hour': { interval: 3600, retention: 604800 }, // 7 day retention
  };

  async startAggregationPipeline() {
    logger.info('Starting real-time aggregation pipeline');

    // Set up aggregation intervals
    this.setupAggregationIntervals();

    // Set up alert monitoring
    this.setupAlertMonitoring();
  }

  private setupAggregationIntervals() {
    // Use the configuration to set up intervals
    if (this.aggregationWindows['1min']) {
      const interval = setInterval(
        () => this.aggregate1Minute(), 
        this.aggregationWindows['1min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 1-minute aggregation (interval: ${this.aggregationWindows['1min'].interval}s)`);
    }

    if (this.aggregationWindows['5min']) {
      const interval = setInterval(
        () => this.aggregate5Minutes(), 
        this.aggregationWindows['5min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 5-minute aggregation (interval: ${this.aggregationWindows['5min'].interval}s)`);
    }

    if (this.aggregationWindows['1hour']) {
      const interval = setInterval(
        () => this.aggregateHourly(), 
        this.aggregationWindows['1hour'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started hourly aggregation (interval: ${this.aggregationWindows['1hour'].interval}s)`);
    }
  }

  // Method to stop all intervals (useful for cleanup)
  stopAggregationPipeline() {
    this.intervalHandles.forEach(handle => clearInterval(handle));
    this.intervalHandles = [];
    logger.info('Stopped aggregation pipeline');
  }

  private async aggregate1Minute() {
    try {
      const venues = await this.getActiveVenues();
      const retention = this.aggregationWindows['1min'].retention;

      for (const venueId of venues) {
        const metrics = await this.calculate1MinuteMetrics(venueId);

        // Store in real-time metrics table with configured retention
        await this.analyticsDb('realtime_metrics')
          .insert({
            venue_id: venueId,
            metric_type: '1min_summary',
            metric_value: metrics,
            expires_at: new Date(Date.now() + retention * 1000)
          })
          .onConflict(['venue_id', 'metric_type'])
          .merge();

        // Emit to WebSocket
        emitMetricUpdate(venueId, 'realtime-summary', metrics);

        // Check for alerts
        await this.checkAlertConditions(venueId, metrics);
      }
    } catch (error) {
      logger.error('Failed to run 1-minute aggregation', error);
    }
  }

  private async calculate1MinuteMetrics(venueId: string) {
    const now = new Date();

    // Get Redis metrics
    const purchaseKey = `metrics:purchase:${venueId}:${now.toISOString().split('T')[0]}`;
    const trafficKey = `metrics:traffic:${venueId}:${now.toISOString().split('T')[0]}`;

    const [purchases, traffic] = await Promise.all([
      this.redis.hgetall(purchaseKey),
      this.redis.hgetall(trafficKey)
    ]);

    // Calculate rates
    const salesRate = parseInt(purchases.total_sales || '0') / 60; // per second
    const trafficRate = parseInt(traffic.page_views || '0') / 60;

    return {
      timestamp: now,
      sales: {
        count: parseInt(purchases.total_sales || '0'),
        revenue: parseFloat(purchases.revenue || '0'),
        rate: salesRate
      },
      traffic: {
        pageViews: parseInt(traffic.page_views || '0'),
        rate: trafficRate
      },
      conversion: {
        rate: trafficRate > 0 ? salesRate / trafficRate : 0
      }
    };
  }

  private async aggregate5Minutes() {
    // Similar to 1-minute but with 5-minute window
    logger.debug('Running 5-minute aggregation');
    // TODO: Implement 5-minute aggregation logic
  }

  private async aggregateHourly() {
    try {
      const venues = await this.getActiveVenues();

      for (const venueId of venues) {
        // Calculate hourly metrics
        const hour = new Date().getHours();
        const today = new Date().toISOString().split('T')[0];

        // Get all Redis metrics for the hour
        const hourlyMetrics = await this.calculateHourlyMetrics(venueId);

        // Update database
        await this.analyticsDb('venue_analytics')
          .where({
            venue_id: venueId,
            date: today,
            hour: hour
          })
          .update({
            unique_customers: hourlyMetrics.uniqueCustomers,
            events_active: hourlyMetrics.activeEvents,
            updated_at: new Date()
          });
      }
    } catch (error) {
      logger.error('Failed to run hourly aggregation', error);
    }
  }

  private async calculateHourlyMetrics(venueId: string) {
    // Implementation for hourly metrics
    return {
      uniqueCustomers: 0,
      activeEvents: 0
    };
  }

  private async getActiveVenues(): Promise<string[]> {
    // Get venues with recent activity
    const result = await this.analyticsDb('venue_analytics')
      .distinct('venue_id')
      .where('updated_at', '>', new Date(Date.now() - 86400000)) // Last 24 hours
      .pluck('venue_id');

    return result;
  }

  private setupAlertMonitoring() {
    // Monitor for alert conditions
    setInterval(() => this.monitorAlerts(), 30000); // Every 30 seconds
  }

  private async checkAlertConditions(venueId: string, metrics: any) {
    // High traffic alert
    if (metrics.traffic.rate > 100) { // 100 views per second
      await this.createAlert(venueId, {
        type: 'high_traffic',
        severity: 'info',
        message: `High traffic detected: ${metrics.traffic.rate.toFixed(2)} views/second`,
        data: metrics.traffic
      });
    }

    // Low conversion alert
    if (metrics.traffic.pageViews > 1000 && metrics.conversion.rate < 0.01) {
      await this.createAlert(venueId, {
        type: 'low_conversion',
        severity: 'warning',
        message: `Low conversion rate: ${(metrics.conversion.rate * 100).toFixed(2)}%`,
        data: metrics.conversion
      });
    }
  }

  private async createAlert(venueId: string, alert: any) {
    // Store alert
    await this.analyticsDb('venue_alerts')
      .insert({
        venue_id: venueId,
        alert_name: alert.type,
        is_active: true
      });

    // Emit alert via WebSocket
    emitAlert(venueId, alert);
  }

  private async monitorAlerts() {
    // Monitor and clear expired alerts
    logger.debug('Monitoring alerts');
  }
}

export const realtimeAggregationService = new RealtimeAggregationService();
```

### FILE: src/services/metrics.service.ts
```typescript
import { MetricModel } from '../models';
import { RealtimeModel, CacheModel } from '../models';
import { 
  Metric, 
  MetricType, 
  RealTimeMetric, 
  TimeGranularity,
  DateRange 
} from '../types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

export class MetricsService {
  private static instance: MetricsService;
  private log = logger.child({ component: 'MetricsService' });

  static getInstance(): MetricsService {
    if (!this.instance) {
      this.instance = new MetricsService();
    }
    return this.instance;
  }

  async recordMetric(
    venueId: string,
    metricType: MetricType,
    value: number,
    dimensions?: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<Metric> {
    try {
      // Create metric
      const metric = await MetricModel.createMetric({
        venueId,
        metricType,
        value,
        timestamp: new Date(),
        granularity: { unit: 'minute', value: 1 },
        dimensions,
        metadata
      });

      // Update real-time counter
      await RealtimeModel.updateRealTimeMetric(venueId, metricType, value);

      // Invalidate cache
      await CacheModel.invalidateVenueCache(venueId);

      this.log.debug('Metric recorded', {
        venueId,
        metricType,
        value
      });

      return metric;
    } catch (error) {
      this.log.error('Failed to record metric', { error, venueId, metricType });
      throw error;
    }
  }

  async getMetrics(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    try {
      // Check cache first
      const cacheKey = CacheModel.getCacheKey(
        'metrics',
        venueId,
        metricType,
        dateRange.startDate.toISOString(),
        dateRange.endDate.toISOString()
      );
      
      const cached = await CacheModel.get<Metric[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get from database
      const metrics = await MetricModel.getMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        granularity
      );

      // Cache results
      await CacheModel.set(cacheKey, metrics, CONSTANTS.CACHE_TTL.METRICS);

      return metrics;
    } catch (error) {
      this.log.error('Failed to get metrics', { error, venueId, metricType });
      throw error;
    }
  }

  async getRealTimeMetric(
    venueId: string,
    metricType: MetricType
  ): Promise<RealTimeMetric | null> {
    try {
      return await RealtimeModel.getRealTimeMetric(venueId, metricType);
    } catch (error) {
      this.log.error('Failed to get real-time metric', { error, venueId, metricType });
      throw error;
    }
  }

  async getRealTimeMetrics(
    venueId: string
  ): Promise<Record<string, RealTimeMetric>> {
    try {
      const metricTypes = Object.values(MetricType);
      const metrics: Record<string, RealTimeMetric> = {};

      await Promise.all(
        metricTypes.map(async (type) => {
          const metric = await this.getRealTimeMetric(venueId, type);
          if (metric) {
            metrics[type] = metric;
          }
        })
      );

      return metrics;
    } catch (error) {
      this.log.error('Failed to get real-time metrics', { error, venueId });
      throw error;
    }
  }

  async incrementCounter(
    venueId: string,
    counterType: string,
    by: number = 1
  ): Promise<number> {
    try {
      return await RealtimeModel.incrementCounter(venueId, counterType, by);
    } catch (error) {
      this.log.error('Failed to increment counter', { error, venueId, counterType });
      throw error;
    }
  }

  async aggregateMetric(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    try {
      return await MetricModel.aggregateMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        aggregation
      );
    } catch (error) {
      this.log.error('Failed to aggregate metric', { 
        error, 
        venueId, 
        metricType,
        aggregation 
      });
      throw error;
    }
  }

  async getMetricTrend(
    venueId: string,
    metricType: MetricType,
    periods: number,
    periodUnit: 'hour' | 'day' | 'week' | 'month'
  ): Promise<Array<{ period: Date; value: number; change: number }>> {
    try {
      const now = new Date();
      const results = [];

      for (let i = periods - 1; i >= 0; i--) {
        const periodStart = new Date(now);
        const periodEnd = new Date(now);

        switch (periodUnit) {
          case 'hour':
            periodStart.setHours(periodStart.getHours() - i - 1);
            periodEnd.setHours(periodEnd.getHours() - i);
            break;
          case 'day':
            periodStart.setDate(periodStart.getDate() - i - 1);
            periodEnd.setDate(periodEnd.getDate() - i);
            break;
          case 'week':
            periodStart.setDate(periodStart.getDate() - (i + 1) * 7);
            periodEnd.setDate(periodEnd.getDate() - i * 7);
            break;
          case 'month':
            periodStart.setMonth(periodStart.getMonth() - i - 1);
            periodEnd.setMonth(periodEnd.getMonth() - i);
            break;
        }

        const value = await this.aggregateMetric(
          venueId,
          metricType,
          { startDate: periodStart, endDate: periodEnd },
          'sum'
        );

        const previousValue: number = results[results.length - 1]?.value || 0;
        const change: number = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;

        results.push({
          period: periodEnd,
          value,
          change
        });
      }

      return results;
    } catch (error) {
      this.log.error('Failed to get metric trend', { error, venueId, metricType });
      throw error;
    }
  }

  async bulkRecordMetrics(
    metrics: Array<{
      venueId: string;
      metricType: MetricType;
      value: number;
      timestamp?: Date;
      dimensions?: Record<string, string>;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      const metricsToInsert = metrics.map(m => ({
        ...m,
        timestamp: m.timestamp || new Date(),
        granularity: { unit: 'minute' as const, value: 1 }
      }));

      await MetricModel.bulkInsert(metricsToInsert);

      // Update real-time metrics
      await Promise.all(
        metrics.map(m => 
          RealtimeModel.updateRealTimeMetric(m.venueId, m.metricType, m.value)
        )
      );

      this.log.debug('Bulk metrics recorded', { count: metrics.length });
    } catch (error) {
      this.log.error('Failed to bulk record metrics', { error });
      throw error;
    }
  }

  async getCapacityMetrics(
    venueId: string,
    eventId: string
  ): Promise<{
    totalCapacity: number;
    soldTickets: number;
    availableTickets: number;
    occupancyRate: number;
  }> {
    try {
      // This would integrate with the venue and ticket services
      // For now, return mock data
      const totalCapacity = 1000;
      const soldTickets = 750;
      const availableTickets = totalCapacity - soldTickets;
      const occupancyRate = (soldTickets / totalCapacity) * 100;

      return {
        totalCapacity,
        soldTickets,
        availableTickets,
        occupancyRate
      };
    } catch (error) {
      this.log.error('Failed to get capacity metrics', { error, venueId, eventId });
      throw error;
    }
  }
}

export const metricsService = MetricsService.getInstance();
```

### FILE: src/services/attribution.service.ts
```typescript
import { CampaignSchema } from '../models';
import {
  MarketingAttribution,
  AttributionPath,
  TouchPoint,
} from '../types';
import { logger } from '../utils/logger';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class AttributionService {
  private static instance: AttributionService;
  private log = logger.child({ component: 'AttributionService' });

  static getInstance(): AttributionService {
    if (!this.instance) {
      this.instance = new AttributionService();
    }
    return this.instance;
  }

  async trackTouchpoint(
    venueId: string,
    customerId: string,
    touchpoint: TouchPoint
  ): Promise<void> {
    try {
      await CampaignSchema.trackTouchpoint({
        ...touchpoint,
        venueId,
        customerId
      } as any);

      this.log.debug('Touchpoint tracked', {
        venueId,
        customerId,
        channel: touchpoint.channel
      });
    } catch (error) {
      this.log.error('Failed to track touchpoint', { error, venueId });
      throw error;
    }
  }

  async getCustomerJourney(
    venueId: string,
    customerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TouchPoint[]> {
    try {
      return await CampaignSchema.getCustomerTouchpoints(
        venueId,
        customerId,
        startDate,
        endDate
      );
    } catch (error) {
      this.log.error('Failed to get customer journey', { error, venueId });
      throw error;
    }
  }

  async calculateAttribution(
    venueId: string,
    conversionId: string,
    revenue: number,
    model: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven' = 'last_touch'
  ): Promise<AttributionPath> {
    try {
      // Get all touchpoints for this conversion
      const touchpoints = await this.getConversionTouchpoints(venueId, conversionId);

      if (touchpoints.length === 0) {
        throw new Error('No touchpoints found for conversion');
      }

      const attribution = this.applyAttributionModel(touchpoints, revenue, model);

      const path: AttributionPath = {
        customerId: touchpoints[0].customerId || '',
        conversionId,
        revenue,
        touchpoints,
        attribution
      };

      // Cache attribution result
      const cacheKey = CacheModel.getCacheKey('attribution', venueId, conversionId);
      await CacheModel.set(cacheKey, path, CONSTANTS.CACHE_TTL.INSIGHTS);

      return path;
    } catch (error) {
      this.log.error('Failed to calculate attribution', { error, venueId });
      throw error;
    }
  }

  private applyAttributionModel(
    touchpoints: TouchPoint[],
    revenue: number,
    model: string
  ): Array<{ touchpointIndex: number; credit: number; revenue: number }> {
    const attribution = [];
    const n = touchpoints.length;

    switch (model) {
      case 'first_touch':
        attribution.push({
          touchpointIndex: 0,
          credit: 1.0,
          revenue: revenue
        });
        break;

      case 'last_touch':
        attribution.push({
          touchpointIndex: n - 1,
          credit: 1.0,
          revenue: revenue
        });
        break;

      case 'linear':
        const linearCredit = 1.0 / n;
        for (let i = 0; i < n; i++) {
          attribution.push({
            touchpointIndex: i,
            credit: linearCredit,
            revenue: revenue * linearCredit
          });
        }
        break;

      case 'time_decay':
        const halfLife = 7; // days
        const lastTouch = touchpoints[n - 1].timestamp;
        let totalWeight = 0;
        const weights = touchpoints.map(tp => {
          const daysFromLast = (lastTouch.getTime() - tp.timestamp.getTime()) / (1000 * 60 * 60 * 24);
          const weight = Math.pow(2, -daysFromLast / halfLife);
          totalWeight += weight;
          return weight;
        });

        touchpoints.forEach((_, i) => {
          const credit = weights[i] / totalWeight;
          attribution.push({
            touchpointIndex: i,
            credit,
            revenue: revenue * credit
          });
        });
        break;

      case 'data_driven':
        // Simplified data-driven model
        // In production, this would use ML models
        const channelWeights: Record<string, number> = {
          'organic': 0.3,
          'paid_search': 0.25,
          'social': 0.2,
          'email': 0.15,
          'direct': 0.1
        };

        let totalChannelWeight = 0;
        const credits = touchpoints.map(tp => {
          const weight = channelWeights[tp.channel] || 0.1;
          totalChannelWeight += weight;
          return weight;
        });

        touchpoints.forEach((_, i) => {
          const credit = credits[i] / totalChannelWeight;
          attribution.push({
            touchpointIndex: i,
            credit,
            revenue: revenue * credit
          });
        });
        break;
    }

    return attribution;
  }

  async getChannelPerformance(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MarketingAttribution> {
    try {
      // Get all conversions and their touchpoints
      const conversions = await this.getConversions(venueId, startDate, endDate);
      const channelMetrics = new Map<string, any>();

      for (const conversion of conversions) {
        const attribution = await this.calculateAttribution(
          venueId,
          conversion.id,
          conversion.revenue,
          'linear'
        );

        // Aggregate by channel
        attribution.attribution.forEach((attr) => {
          const touchpoint = attribution.touchpoints[attr.touchpointIndex];
          const channel = touchpoint.channel;

          if (!channelMetrics.has(channel)) {
            channelMetrics.set(channel, {
              channel,
              source: touchpoint.channel,
              medium: touchpoint.channel,
              visits: 0,
              conversions: 0,
              revenue: 0,
              cost: 0
            });
          }

          const metrics = channelMetrics.get(channel);
          metrics.visits += attr.credit;
          metrics.conversions += attr.credit;
          metrics.revenue += attr.revenue;
        });
      }

      // Calculate ROI and CPA
      const channels = Array.from(channelMetrics.values()).map(metrics => ({
        ...metrics,
        roi: metrics.cost > 0 ? ((metrics.revenue - metrics.cost) / metrics.cost) * 100 : 0,
        costPerAcquisition: metrics.conversions > 0 ? metrics.cost / metrics.conversions : 0
      }));

      // Multi-touch attribution summary
      const multiTouchAttribution = channels.map(ch => ({
        touchpoint: ch.channel,
        attribution: ch.conversions,
        revenue: ch.revenue
      }));

      return {
        channels,
        multiTouchAttribution
      };
    } catch (error) {
      this.log.error('Failed to get channel performance', { error, venueId });
      throw error;
    }
  }

  async getCampaignROI(
    venueId: string,
    campaignId: string
  ): Promise<{
    revenue: number;
    cost: number;
    roi: number;
    conversions: number;
    costPerAcquisition: number;
  }> {
    try {
      const performance = await CampaignSchema.getCampaignPerformance(campaignId);

      const totals = performance.reduce((acc: any, channel: any) => ({
        revenue: acc.revenue + channel.revenue,
        conversions: acc.conversions + channel.conversions,
        cost: acc.cost + (channel.cost || 0)
      }), { revenue: 0, conversions: 0, cost: 0 });

      return {
        ...totals,
        roi: totals.cost > 0 ? ((totals.revenue - totals.cost) / totals.cost) * 100 : 0,
        costPerAcquisition: totals.conversions > 0 ? totals.cost / totals.conversions : 0
      };
    } catch (error) {
      this.log.error('Failed to get campaign ROI', { error, venueId, campaignId });
      throw error;
    }
  }

  private async getConversionTouchpoints(
    _venueId: string,
    _conversionId: string
  ): Promise<TouchPoint[]> {
    // In production, this would query the actual conversion data
    // For now, return mock touchpoints
    return [
      {
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        channel: 'organic',
        action: 'visit',
        value: 0,
        campaign: 'none',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        channel: 'email',
        action: 'click',
        value: 0,
        campaign: 'weekly-newsletter',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        channel: 'paid_search',
        action: 'click',
        value: 0,
        campaign: 'brand-campaign',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(),
        channel: 'direct',
        action: 'conversion',
        value: 150,
        campaign: 'none',
        customerId: 'cust-1'
      }
    ];
  }

  private async getConversions(
    _venueId: string,
    _startDate: Date,
    _endDate: Date
  ): Promise<Array<{ id: string; revenue: number; customerId: string }>> {
    // In production, this would query actual conversion data
    // For now, return mock data
    return [
      { id: 'conv-1', revenue: 150, customerId: 'cust-1' },
      { id: 'conv-2', revenue: 200, customerId: 'cust-2' },
      { id: 'conv-3', revenue: 100, customerId: 'cust-3' }
    ];
  }
}

export const attributionService = AttributionService.getInstance();
```

### FILE: src/services/websocket.service.ts
```typescript
import { getIO, emitMetricUpdate, emitWidgetUpdate } from '../config/websocket';
import { RealTimeMetric, WidgetData } from '../types';
import { logger } from '../utils/logger';
import { RealtimeModel } from '../models';

export class WebSocketService {
  private static instance: WebSocketService;
  private log = logger.child({ component: 'WebSocketService' });

  static getInstance(): WebSocketService {
    if (!this.instance) {
      this.instance = new WebSocketService();
    }
    return this.instance;
  }

  async broadcastMetricUpdate(
    venueId: string,
    metricType: string,
    data: RealTimeMetric
  ): Promise<void> {
    try {
      // Emit to all subscribers of this metric
      emitMetricUpdate(metricType, venueId, data);
      
      // Also update Redis for future connections
      await RealtimeModel.publishMetricUpdate(venueId, metricType, data);
      
      this.log.debug('Metric update broadcasted', { venueId, metricType });
    } catch (error) {
      this.log.error('Failed to broadcast metric update', { error, venueId, metricType });
    }
  }

  async broadcastWidgetUpdate(
    widgetId: string,
    data: WidgetData
  ): Promise<void> {
    try {
      emitWidgetUpdate(widgetId, data);
      this.log.debug('Widget update broadcasted', { widgetId });
    } catch (error) {
      this.log.error('Failed to broadcast widget update', { error, widgetId });
    }
  }

  async broadcastToVenue(
    venueId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      io.to(`venue:${venueId}`).emit(event, data);
      this.log.debug('Event broadcasted to venue', { venueId, event });
    } catch (error) {
      this.log.error('Failed to broadcast to venue', { error, venueId, event });
    }
  }

  async broadcastToUser(
    userId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      // Find sockets for this user
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);
      
      userSockets.forEach(socket => {
        socket.emit(event, data);
      });
      
      this.log.debug('Event broadcasted to user', { userId, event, socketCount: userSockets.length });
    } catch (error) {
      this.log.error('Failed to broadcast to user', { error, userId, event });
    }
  }

  async getConnectedClients(): Promise<{
    total: number;
    byVenue: Record<string, number>;
  }> {
    try {
      const io = getIO();
      const sockets = await io.fetchSockets();
      
      const byVenue: Record<string, number> = {};
      
      sockets.forEach(socket => {
        const venueId = socket.data.venueId;
        if (venueId) {
          byVenue[venueId] = (byVenue[venueId] || 0) + 1;
        }
      });
      
      return {
        total: sockets.length,
        byVenue
      };
    } catch (error) {
      this.log.error('Failed to get connected clients', { error });
      return { total: 0, byVenue: {} };
    }
  }

  async disconnectUser(userId: string, reason?: string): Promise<void> {
    try {
      const io = getIO();
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);
      
      userSockets.forEach(socket => {
        socket.disconnect(true);
      });
      
      this.log.info('User disconnected', { userId, reason, socketCount: userSockets.length });
    } catch (error) {
      this.log.error('Failed to disconnect user', { error, userId });
    }
  }

  async subscribeToMetrics(
    socketId: string,
    venueId: string,
    metrics: string[]
  ): Promise<void> {
    try {
      const io = getIO();
      const socket = io.sockets.sockets.get(socketId);
      
      if (!socket) {
        throw new Error('Socket not found');
      }
      
      // Join metric rooms
      metrics.forEach(metric => {
        socket.join(`metrics:${metric}:${venueId}`);
      });
      
      // Send current values
      for (const metric of metrics) {
        const currentValue = await RealtimeModel.getRealTimeMetric(venueId, metric);
        if (currentValue) {
          socket.emit('metric:update', {
            type: metric,
            venueId,
            data: currentValue,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      this.log.debug('Socket subscribed to metrics', { socketId, venueId, metrics });
    } catch (error) {
      this.log.error('Failed to subscribe to metrics', { error, socketId });
    }
  }

  async unsubscribeFromMetrics(
    socketId: string,
    venueId: string,
    metrics: string[]
  ): Promise<void> {
    try {
      const io = getIO();
      const socket = io.sockets.sockets.get(socketId);
      
      if (!socket) {
        return;
      }
      
      // Leave metric rooms
      metrics.forEach(metric => {
        socket.leave(`metrics:${metric}:${venueId}`);
      });
      
      this.log.debug('Socket unsubscribed from metrics', { socketId, venueId, metrics });
    } catch (error) {
      this.log.error('Failed to unsubscribe from metrics', { error, socketId });
    }
  }

  async getRoomSubscribers(room: string): Promise<number> {
    try {
      const io = getIO();
      const sockets = await io.in(room).fetchSockets();
      return sockets.length;
    } catch (error) {
      this.log.error('Failed to get room subscribers', { error, room });
      return 0;
    }
  }
}

export const websocketService = WebSocketService.getInstance();
```

### FILE: src/services/alert.service.ts
```typescript
import { AlertModel } from '../models';
import {
  Alert,
  AlertInstance,
  ComparisonOperator
} from '../types';
import { logger } from '../utils/logger';
import { messageGatewayService } from './message-gateway.service';
import { metricsService } from './metrics.service';

export class AlertService {
  private static instance: AlertService;
  private log = logger.child({ component: 'AlertService' });
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): AlertService {
    if (!this.instance) {
      this.instance = new AlertService();
    }
    return this.instance;
  }

  async startMonitoring(): Promise<void> {
    // Check alerts every minute
    this.checkInterval = setInterval(() => {
      this.checkAllAlerts();
    }, 60000);

    this.log.info('Alert monitoring started');
  }

  async stopMonitoring(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.log.info('Alert monitoring stopped');
  }

  async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    try {
      const alert = await AlertModel.createAlert(data);
      this.log.info('Alert created', { alertId: alert.id, name: alert.name });
      return alert;
    } catch (error) {
      this.log.error('Failed to create alert', { error });
      throw error;
    }
  }

  async updateAlert(
    alertId: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    try {
      const alert = await AlertModel.updateAlert(alertId, data);
      this.log.info('Alert updated', { alertId });
      return alert;
    } catch (error) {
      this.log.error('Failed to update alert', { error, alertId });
      throw error;
    }
  }

  async toggleAlert(alertId: string, enabled: boolean): Promise<Alert> {
    try {
      const alert = await AlertModel.toggleAlert(alertId, enabled);
      this.log.info('Alert toggled', { alertId, enabled });
      return alert;
    } catch (error) {
      this.log.error('Failed to toggle alert', { error, alertId });
      throw error;
    }
  }

  private async checkAllAlerts(): Promise<void> {
    try {
      // Get all enabled alerts
      const venues = await this.getMonitoredVenues();

      for (const venueId of venues) {
        const alerts = await AlertModel.getAlertsByVenue(venueId, true);

        for (const alert of alerts) {
          await this.checkAlert(alert);
        }
      }
    } catch (error) {
      this.log.error('Failed to check alerts', { error });
    }
  }

  private async checkAlert(alert: Alert): Promise<void> {
    try {
      // Check if within schedule
      if (!this.isWithinSchedule(alert)) {
        return;
      }

      // Evaluate all conditions
      const triggered = await this.evaluateConditions(alert);

      if (triggered) {
        // Check if already triggered recently
        const recentInstance = await this.getRecentAlertInstance(alert.id);
        if (recentInstance && recentInstance.status === 'active') {
          return; // Already triggered
        }

        // Create alert instance
        const instance = await this.triggerAlert(alert);

        // Execute actions
        await this.executeActions(alert, instance);
      } else {
        // Check if we need to resolve an active alert
        const activeInstance = await this.getActiveAlertInstance(alert.id);
        if (activeInstance) {
          await this.resolveAlert(activeInstance);
        }
      }
    } catch (error) {
      this.log.error('Failed to check alert', { error, alertId: alert.id });
    }
  }

  private async evaluateConditions(alert: Alert): Promise<boolean> {
    try {
      for (const condition of alert.conditions) {
        const currentValue = await this.getMetricValue(
          alert.venueId,
          condition.metric
        );

        if (!this.evaluateCondition(currentValue, condition.operator, condition.value)) {
          return false; // All conditions must be met
        }
      }

      return true;
    } catch (error) {
      this.log.error('Failed to evaluate conditions', { error, alertId: alert.id });
      return false;
    }
  }

  private evaluateCondition(
    currentValue: number,
    operator: ComparisonOperator,
    threshold: number
  ): boolean {
    switch (operator) {
      case ComparisonOperator.EQUALS:
        return currentValue === threshold;
      case ComparisonOperator.NOT_EQUALS:
        return currentValue !== threshold;
      case ComparisonOperator.GREATER_THAN:
        return currentValue > threshold;
      case ComparisonOperator.LESS_THAN:
        return currentValue < threshold;
      case ComparisonOperator.GREATER_THAN_OR_EQUALS:
        return currentValue >= threshold;
      case ComparisonOperator.LESS_THAN_OR_EQUALS:
        return currentValue <= threshold;
      default:
        return false;
    }
  }

  private async getMetricValue(venueId: string, metric: string): Promise<number> {
    // Get current metric value from real-time metrics
    const realTimeMetric = await metricsService.getRealTimeMetric(venueId, metric as any);
    return realTimeMetric?.currentValue || 0;
  }

  private async triggerAlert(alert: Alert): Promise<AlertInstance> {
    try {
      // Increment trigger count
      await AlertModel.incrementTriggerCount(alert.id);

      // Create alert instance
      const instance = await AlertModel.createAlertInstance({
        alertId: alert.id,
        triggeredAt: new Date(),
        severity: alert.severity,
        status: 'active',
        triggerValues: await this.getCurrentTriggerValues(alert),
        message: this.generateAlertMessage(alert),
        actions: alert.actions.map(action => ({
          type: action.type,
          status: 'pending'
        }))
      });

      this.log.info('Alert triggered', {
        alertId: alert.id,
        instanceId: instance.id,
        severity: alert.severity
      });

      return instance;
    } catch (error) {
      this.log.error('Failed to trigger alert', { error, alertId: alert.id });
      throw error;
    }
  }

  private async executeActions(alert: Alert, instance: AlertInstance): Promise<void> {
    for (const action of alert.actions) {
      try {
        // Apply delay if specified
        if (action.delay) {
          await new Promise(resolve => setTimeout(resolve, action.delay! * 60000));
        }

        switch (action.type) {
          case 'email':
            await messageGatewayService.sendAlertNotification(
              instance,
              'email',
              action.config.recipients?.[0] || ''
            );
            break;

          case 'sms':
            await messageGatewayService.sendAlertNotification(
              instance,
              'sms',
              action.config.phoneNumbers?.[0] || ''
            );
            break;

          case 'slack':
            await messageGatewayService.sendAlertNotification(
              instance,
              'slack',
              action.config.channel || ''
            );
            break;

          case 'webhook':
            await this.sendWebhook(action.config, instance);
            break;
        }
      } catch (error) {
        this.log.error('Failed to execute alert action', {
          error,
          alertId: alert.id,
          actionType: action.type
        });
      }
    }
  }

  private async sendWebhook(config: any, _instance: AlertInstance): Promise<void> {
    // In production, make actual HTTP request
    this.log.info('Webhook sent', { url: config.url });
  }

  private async resolveAlert(instance: AlertInstance): Promise<void> {
    try {
      await AlertModel.resolveAlertInstance(instance.id);
      this.log.info('Alert resolved', { instanceId: instance.id });
    } catch (error) {
      this.log.error('Failed to resolve alert', { error, instanceId: instance.id });
    }
  }

  private isWithinSchedule(alert: Alert): boolean {
    if (!alert.schedule) return true;

    const now = new Date();
    const { activeHours, activeDays } = alert.schedule;

    // Check active days
    if (activeDays && !activeDays.includes(now.getDay())) {
      return false;
    }

    // Check active hours
    if (activeHours) {
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [startHour, startMin] = activeHours.start.split(':').map(Number);
      const [endHour, endMin] = activeHours.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }

    return true;
  }

  private async getCurrentTriggerValues(alert: Alert): Promise<Record<string, any>> {
    const values: Record<string, any> = {};

    for (const condition of alert.conditions) {
      values[condition.metric] = await this.getMetricValue(alert.venueId, condition.metric);
    }

    return values;
  }

  private generateAlertMessage(alert: Alert): string {
    return `Alert: ${alert.name} - ${alert.description || 'Threshold exceeded'}`;
  }

  private async getRecentAlertInstance(alertId: string): Promise<AlertInstance | null> {
    const instances = await AlertModel.getAlertInstances(alertId, 1);
    return instances[0] || null;
  }

  private async getActiveAlertInstance(alertId: string): Promise<AlertInstance | null> {
    const instances = await AlertModel.getAlertInstances(alertId, 10);
    return instances.find(i => i.status === 'active') || null;
  }

  private async getMonitoredVenues(): Promise<string[]> {
    // In production, get list of venues with active alerts
    // For now, return mock data
    return ['venue-1', 'venue-2'];
  }

  async getAlertsByVenue(venueId: string): Promise<Alert[]> {
    return await AlertModel.getAlertsByVenue(venueId);
  }

  async getAlertInstances(alertId: string, limit: number = 50): Promise<AlertInstance[]> {
    return await AlertModel.getAlertInstances(alertId, limit);
  }

  async acknowledgeAlert(instanceId: string, userId: string, notes?: string): Promise<AlertInstance> {
    return await AlertModel.acknowledgeAlertInstance(instanceId, userId, notes);
  }
}

export const alertService = AlertService.getInstance();
```

### FILE: src/services/customer-intelligence.service.ts
```typescript
import { EventSchema } from '../models';
import { 
  CustomerProfile,
  CustomerSegment,
  CustomerInsight,
  InsightType,
  RFMAnalysis,
} from '../types';
import { logger } from '../utils/logger';
import { anonymizationService } from './anonymization.service';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class CustomerIntelligenceService {
  private static instance: CustomerIntelligenceService;
  private log = logger.child({ component: 'CustomerIntelligenceService' });

  static getInstance(): CustomerIntelligenceService {
    if (!this.instance) {
      this.instance = new CustomerIntelligenceService();
    }
    return this.instance;
  }

  async getCustomerProfile(
    venueId: string,
    customerId: string
  ): Promise<CustomerProfile | null> {
    try {
      // Hash the customer ID for privacy
      const hashedCustomerId = await anonymizationService.hashCustomerId(customerId);

      // Check cache
      const cacheKey = CacheModel.getCacheKey('customer', venueId, hashedCustomerId);
      const cached = await CacheModel.get<CustomerProfile>(cacheKey);
      if (cached) {
        return cached;
      }

      // Aggregate customer data from events
      const events = await EventSchema.getEvents(venueId, {
        userId: hashedCustomerId,
        limit: 10000
      });

      if (events.length === 0) {
        return null;
      }

      // Calculate metrics
      const profile = await this.calculateCustomerMetrics(
        venueId,
        hashedCustomerId,
        events
      );

      // Cache profile
      await CacheModel.set(cacheKey, profile, CONSTANTS.CACHE_TTL.CUSTOMER_PROFILE);

      return profile;
    } catch (error) {
      this.log.error('Failed to get customer profile', { error, venueId });
      throw error;
    }
  }

  private async calculateCustomerMetrics(
    venueId: string,
    customerId: string,
    events: any[]
  ): Promise<CustomerProfile> {
    const purchaseEvents = events.filter(e => e.eventType === 'ticket.purchased');
    const firstPurchase = purchaseEvents[0];
    const lastPurchase = purchaseEvents[purchaseEvents.length - 1];

    const totalSpent = purchaseEvents.reduce((sum, e) => 
      sum + (e.properties?.amount || 0), 0
    );
    
    const totalTickets = purchaseEvents.reduce((sum, e) => 
      sum + (e.properties?.quantity || 1), 0
    );

    const averageOrderValue = purchaseEvents.length > 0 
      ? totalSpent / purchaseEvents.length 
      : 0;

    const daysSinceLastPurchase = lastPurchase 
      ? Math.floor((Date.now() - new Date(lastPurchase.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const purchaseFrequency = purchaseEvents.length > 1
      ? purchaseEvents.length / 
        ((new Date(lastPurchase.timestamp).getTime() - 
          new Date(firstPurchase.timestamp).getTime()) / 
          (1000 * 60 * 60 * 24 * 365))
      : 0;

    // Determine segment
    const segment = this.determineCustomerSegment({
      totalSpent,
      purchaseFrequency,
      daysSinceLastPurchase,
      totalTickets
    });

    // Predict lifetime value (simplified)
    const predictedLifetimeValue = averageOrderValue * purchaseFrequency * 3; // 3 year horizon

    // Calculate churn probability
    const churnProbability = this.calculateChurnProbability(
      daysSinceLastPurchase,
      purchaseFrequency
    );

    // Analyze preferences
    const attributes = await this.analyzeCustomerAttributes(events);

    return {
      customerId,
      venueId,
      firstSeen: new Date(firstPurchase?.timestamp || Date.now()),
      lastSeen: new Date(lastPurchase?.timestamp || Date.now()),
      totalSpent,
      totalTickets,
      averageOrderValue,
      purchaseFrequency,
      daysSinceLastPurchase,
      segment,
      predictedLifetimeValue,
      churnProbability,
      attributes
    };
  }

  private determineCustomerSegment(metrics: {
    totalSpent: number;
    purchaseFrequency: number;
    daysSinceLastPurchase: number;
    totalTickets: number;
  }): CustomerSegment {
    const { totalSpent, purchaseFrequency, daysSinceLastPurchase, totalTickets } = metrics;

    if (totalTickets === 0) {
      return CustomerSegment.NEW;
    }

    if (daysSinceLastPurchase > 365) {
      return CustomerSegment.LOST;
    }

    if (daysSinceLastPurchase > 180) {
      return CustomerSegment.DORMANT;
    }

    if (daysSinceLastPurchase > 90) {
      return CustomerSegment.AT_RISK;
    }

    if (totalSpent > 1000 && purchaseFrequency > 4) {
      return CustomerSegment.VIP;
    }

    if (purchaseFrequency > 2) {
      return CustomerSegment.REGULAR;
    }

    return CustomerSegment.OCCASIONAL;
  }

  private calculateChurnProbability(
    daysSinceLastPurchase: number,
    purchaseFrequency: number
  ): number {
    // Simplified churn calculation
    let probability = 0;

    if (daysSinceLastPurchase > 180) {
      probability = 0.8;
    } else if (daysSinceLastPurchase > 90) {
      probability = 0.6;
    } else if (daysSinceLastPurchase > 60) {
      probability = 0.4;
    } else if (daysSinceLastPurchase > 30) {
      probability = 0.2;
    } else {
      probability = 0.1;
    }

    // Adjust based on purchase frequency
    if (purchaseFrequency > 4) {
      probability *= 0.5;
    } else if (purchaseFrequency > 2) {
      probability *= 0.7;
    }

    return Math.min(probability, 1);
  }

  private async analyzeCustomerAttributes(events: any[]): Promise<any> {
    const attributes: any = {
      preferences: {},
      behavior: {}
    };

    // Analyze event types
    const eventTypes = new Map<string, number>();
    events.forEach(e => {
      const type = e.properties?.eventType || 'unknown';
      eventTypes.set(type, (eventTypes.get(type) || 0) + 1);
    });

    // Find favorite event type
    let maxCount = 0;
    let favoriteType = '';
    eventTypes.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        favoriteType = type;
      }
    });

    if (favoriteType) {
      attributes.preferences.eventTypes = [favoriteType];
    }

    // Analyze purchase times
    const purchaseTimes = events
      .filter(e => e.eventType === 'ticket.purchased')
      .map(e => new Date(e.timestamp).getHours());

    if (purchaseTimes.length > 0) {
      const avgHour = Math.round(
        purchaseTimes.reduce((sum, hour) => sum + hour, 0) / purchaseTimes.length
      );
      
      if (avgHour < 12) {
        attributes.behavior.purchaseTime = 'morning';
      } else if (avgHour < 17) {
        attributes.behavior.purchaseTime = 'afternoon';
      } else {
        attributes.behavior.purchaseTime = 'evening';
      }
    }

    return attributes;
  }

  // Fixed generateCustomerInsights method
  async generateCustomerInsights(
    venueId: string,
    customerId: string
  ): Promise<CustomerInsight[]> {
    try {
      const profile = await this.getCustomerProfile(venueId, customerId);
      if (!profile) {
        return [];
      }

      const insights: CustomerInsight[] = [];

      // Churn risk insight
      if (profile.churnProbability > 0.6) {
        insights.push({
          customerId: profile.customerId,
          type: InsightType.CHURN_RISK,
          title: "High Churn Risk",
          description: `Customer has ${profile.churnProbability * 100}% chance of churning`,
          impact: "high" as const,
          actionable: true,
          suggestedActions: [
            "Send personalized retention offer",
            "Reach out with exclusive event previews",
            "Offer loyalty program upgrade"
          ],
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          metadata: {
            daysSinceLastPurchase: profile.daysSinceLastPurchase,
            previousPurchaseCount: profile.totalPurchases
          }
        });
      }

      // Low engagement insight
      if (profile.daysSinceLastPurchase > 90) {
        insights.push({
          customerId: profile.customerId,
          type: InsightType.LOW_ENGAGEMENT,
          title: "Inactive Customer",
          description: `No purchases in ${profile.daysSinceLastPurchase} days`,
          impact: "medium" as const,
          actionable: true,
          suggestedActions: [
            "Send re-engagement campaign",
            "Offer special discount"
          ],
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        });
      }

      // High value customer insight
      if (profile.totalSpent > 1000) {
        insights.push({
          customerId: profile.customerId,
          type: InsightType.HIGH_VALUE,
          title: "VIP Customer",
          description: `Customer has spent $${profile.totalSpent.toFixed(2)} lifetime`,
          impact: "high" as const,
          actionable: true,
          suggestedActions: [
            "Provide VIP treatment",
            "Offer exclusive experiences",
            "Personal account manager"
          ],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
      }

      return insights;
    } catch (error) {
      this.log.error('Failed to generate customer insights', { error, venueId });
      throw error;
    }
  }
  async performRFMAnalysis(
    venueId: string,
    customerId: string
  ): Promise<RFMAnalysis> {
    try {
      const profile = await this.getCustomerProfile(venueId, customerId);
      if (!profile) {
        throw new Error('Customer profile not found');
      }

      // Score each dimension (1-5)
      const recencyScore = this.scoreRecency(profile.daysSinceLastPurchase);
      const frequencyScore = this.scoreFrequency(profile.purchaseFrequency);
      const monetaryScore = this.scoreMonetary(profile.totalSpent);

      // Determine RFM segment
      const segment = this.getRFMSegment(recencyScore, frequencyScore, monetaryScore);

      return {
        customerId: profile.customerId,
        recency: profile.daysSinceLastPurchase,
        frequency: profile.totalTickets,
        monetary: profile.totalSpent,
        recencyScore,
        frequencyScore,
        monetaryScore,
        segment
      };
    } catch (error) {
      this.log.error('Failed to perform RFM analysis', { error, venueId });
      throw error;
    }
  }

  private scoreRecency(days: number): number {
    if (days <= 30) return 5;
    if (days <= 60) return 4;
    if (days <= 90) return 3;
    if (days <= 180) return 2;
    return 1;
  }

  private scoreFrequency(frequency: number): number {
    if (frequency >= 10) return 5;
    if (frequency >= 6) return 4;
    if (frequency >= 3) return 3;
    if (frequency >= 1) return 2;
    return 1;
  }

  private scoreMonetary(amount: number): number {
    if (amount >= 1000) return 5;
    if (amount >= 500) return 4;
    if (amount >= 200) return 3;
    if (amount >= 50) return 2;
    return 1;
  }

  private getRFMSegment(r: number, f: number, m: number): string {
    const score = `${r}${f}${m}`;
    
    const segments: Record<string, string> = {
      '555': 'Champions',
      '554': 'Champions',
      '544': 'Champions',
      '545': 'Champions',
      '454': 'Loyal Customers',
      '455': 'Loyal Customers',
      '444': 'Loyal Customers',
      '445': 'Loyal Customers',
      '543': 'Potential Loyalists',
      '443': 'Potential Loyalists',
      '434': 'Potential Loyalists',
      '343': 'Potential Loyalists',
      '533': 'Recent Customers',
      '433': 'Recent Customers',
      '423': 'Recent Customers',
      '332': 'Promising',
      '322': 'Promising',
      '311': 'New Customers',
      '211': 'Hibernating',
      '112': 'At Risk',
      '111': 'Lost'
    };

    // Find closest match
    return segments[score] || 'Other';
  }

  async getCustomerSegments(
    venueId: string
  ): Promise<Array<{ segment: CustomerSegment; count: number; percentage: number }>> {
    try {
      // This would query aggregated segment data
      // For now, return mock data
      const segments = [
        { segment: CustomerSegment.NEW, count: 1500, percentage: 30 },
        { segment: CustomerSegment.OCCASIONAL, count: 2000, percentage: 40 },
        { segment: CustomerSegment.REGULAR, count: 1000, percentage: 20 },
        { segment: CustomerSegment.VIP, count: 300, percentage: 6 },
        { segment: CustomerSegment.AT_RISK, count: 150, percentage: 3 },
        { segment: CustomerSegment.DORMANT, count: 40, percentage: 0.8 },
        { segment: CustomerSegment.LOST, count: 10, percentage: 0.2 }
      ];

      return segments;
    } catch (error) {
      this.log.error('Failed to get customer segments', { error, venueId });
      throw error;
    }
  }
}

export const customerIntelligenceService = CustomerIntelligenceService.getInstance();
```

### FILE: src/services/message-gateway.service.ts
```typescript
import { AlertInstance } from '../types';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { logger } from '../utils/logger';
import { getChannel } from '../config/rabbitmq';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  subject?: string;
  body: string;
  variables: string[];
}

export interface Message {
  id: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
  scheduledFor?: Date;
  status: 'pending' | 'sent' | 'failed';
}

export class MessageGatewayService {
  private static instance: MessageGatewayService;
  private log = logger.child({ component: 'MessageGatewayService' });
  private templates: Map<string, MessageTemplate> = new Map();

  static getInstance(): MessageGatewayService {
    if (!this.instance) {
      this.instance = new MessageGatewayService();
    }
    return this.instance;
  }

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Alert templates
    this.templates.set('alert-email', {
      id: 'alert-email',
      name: 'Alert Email',
      channel: 'email',
      subject: 'Analytics Alert: {{alertName}}',
      body: `
        <h2>{{alertName}}</h2>
        <p>{{alertDescription}}</p>
        <p><strong>Severity:</strong> {{severity}}</p>
        <p><strong>Triggered at:</strong> {{triggeredAt}}</p>
        <p><strong>Current value:</strong> {{currentValue}}</p>
        <p><strong>Threshold:</strong> {{threshold}}</p>
        <a href="{{dashboardUrl}}">View Dashboard</a>
      `,
      variables: ['alertName', 'alertDescription', 'severity', 'triggeredAt', 'currentValue', 'threshold', 'dashboardUrl']
    });

    this.templates.set('alert-sms', {
      id: 'alert-sms',
      name: 'Alert SMS',
      channel: 'sms',
      body: 'Analytics Alert: {{alertName}} - {{severity}}. Value: {{currentValue}}. Check dashboard for details.',
      variables: ['alertName', 'severity', 'currentValue']
    });

    this.templates.set('alert-slack', {
      id: 'alert-slack',
      name: 'Alert Slack',
      channel: 'slack',
      body: JSON.stringify({
        text: 'Analytics Alert',
        attachments: [{
          color: '{{color}}',
          title: '{{alertName}}',
          text: '{{alertDescription}}',
          fields: [
            { title: 'Severity', value: '{{severity}}', short: true },
            { title: 'Current Value', value: '{{currentValue}}', short: true },
            { title: 'Threshold', value: '{{threshold}}', short: true },
            { title: 'Time', value: '{{triggeredAt}}', short: true }
          ],
          actions: [{
            type: 'button',
            text: 'View Dashboard',
            url: '{{dashboardUrl}}'
          }]
        }]
      }),
      variables: ['color', 'alertName', 'alertDescription', 'severity', 'currentValue', 'threshold', 'triggeredAt', 'dashboardUrl']
    });

    // Report templates
    this.templates.set('report-ready-email', {
      id: 'report-ready-email',
      name: 'Report Ready Email',
      channel: 'email',
      subject: 'Your Analytics Report is Ready',
      body: `
        <h2>Your report is ready for download</h2>
        <p>Report: {{reportName}}</p>
        <p>Generated: {{generatedAt}}</p>
        <p>Size: {{fileSize}}</p>
        <a href="{{downloadUrl}}">Download Report</a>
        <p><em>This link will expire in {{expirationDays}} days.</em></p>
      `,
      variables: ['reportName', 'generatedAt', 'fileSize', 'downloadUrl', 'expirationDays']
    });

    // Customer insight templates
    this.templates.set('customer-insight-email', {
      id: 'customer-insight-email',
      name: 'Customer Insight Email',
      channel: 'email',
      subject: 'New Customer Insights Available',
      body: `
        <h2>New insights for your venue</h2>
        <ul>
        {{#insights}}
          <li>
            <strong>{{title}}</strong>: {{description}}
            <br>Impact: {{impact}}
            {{#actionable}}
            <br>Suggested actions:
            <ul>
              {{#suggestedActions}}
              <li>{{.}}</li>
              {{/suggestedActions}}
            </ul>
            {{/actionable}}
          </li>
        {{/insights}}
        </ul>
        <a href="{{dashboardUrl}}">View Full Analytics</a>
      `,
      variables: ['insights', 'dashboardUrl']
    });
  }

  async sendMessage(
    channel: 'email' | 'sms' | 'push' | 'slack',
    recipient: string,
    templateId: string,
    variables: Record<string, any>
  ): Promise<Message> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      const message: Message = {
        id: `msg-${Date.now()}`,
        channel,
        recipient,
        subject: this.interpolateTemplate(template.subject || '', variables),
        body: this.interpolateTemplate(template.body, variables),
        metadata: { templateId, variables },
        status: 'pending'
      };

      // Queue message for delivery
      await this.queueMessage(message);

      this.log.info('Message queued', { 
        messageId: message.id, 
        channel, 
        recipient: this.maskRecipient(recipient) 
      });

      return message;
    } catch (error) {
      this.log.error('Failed to send message', { error, channel, templateId });
      throw error;
    }
  }

  async sendAlertNotification(
    alert: AlertInstance,
    channel: 'email' | 'sms' | 'slack',
    recipient: string
  ): Promise<void> {
    try {
      const templateId = `alert-${channel}`;
      const variables = {
        alertName: alert.message,
        alertDescription: alert.message,
        severity: alert.severity,
        triggeredAt: alert.triggeredAt.toISOString(),
        currentValue: JSON.stringify(alert.triggerValues),
        threshold: 'Configured threshold',
        dashboardUrl: `${process.env.APP_URL}/dashboard/alerts/${alert.alertId}`,
        color: alert.severity === 'critical' ? '#ff0000' : 
               alert.severity === 'error' ? '#ff6600' : 
               alert.severity === 'warning' ? '#ffcc00' : '#0066cc'
      };

      await this.sendMessage(channel, recipient, templateId, variables);
    } catch (error) {
      this.log.error('Failed to send alert notification', { error, alertId: alert.id });
      throw error;
    }
  }

  async sendBulkMessages(
    messages: Array<{
      channel: 'email' | 'sms' | 'push' | 'slack';
      recipient: string;
      templateId: string;
      variables: Record<string, any>;
    }>
  ): Promise<Message[]> {
    try {
      const results = await Promise.allSettled(
        messages.map(msg => 
          this.sendMessage(msg.channel, msg.recipient, msg.templateId, msg.variables)
        )
      );

      const successful = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<Message>).value);

      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        this.log.warn(`Bulk send completed with ${failed} failures`, {
          total: messages.length,
          successful: successful.length,
          failed
        });
      }

      return successful;
    } catch (error) {
      this.log.error('Failed to send bulk messages', { error });
      throw error;
    }
  }

  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    
    // Simple variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    });

    // Handle arrays and conditionals (simplified)
    // In production, use a proper template engine like Handlebars
    
    return result;
  }

  private async queueMessage(message: Message): Promise<void> {
    try {
      const channel = getChannel();
      const routingKey = `messages.${message.channel}`;
      
      channel.publish(
        'tickettoken_events',
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    } catch (error) {
      this.log.error('Failed to queue message', { error, messageId: message.id });
      throw error;
    }
  }

  private maskRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      // Email
      const [user, domain] = recipient.split('@');
      return `${user.substring(0, 2)}***@${domain}`;
    } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
      // Phone
      return `***${recipient.slice(-4)}`;
    }
    return '***';
  }

  async getMessageStatus(_messageId: string): Promise<Message | null> {
    // In production, this would query the message queue or database
    return null;
  }

  async retryFailedMessages(_since: Date): Promise<number> {
    // In production, this would retry failed messages
    return 0;
  }
}

export const messageGatewayService = MessageGatewayService.getInstance();
```

### FILE: src/services/event-stream.service.ts
```typescript
import { EventEmitter } from 'events';
import Bull from 'bull';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { emitMetricUpdate } from '../config/websocket';
import { getAnalyticsDb } from '../config/database';

export interface StreamEvent {
  type: string;
  venueId: string;
  data: any;
  timestamp: Date;
}

export class EventStreamService extends EventEmitter {
  private queues: Map<string, Bull.Queue> = new Map();
  private redis: any; // Lazy loaded
  private analyticsDb: any; // Lazy loaded
  private initialized = false;

  constructor() {
    super();
  }

  private async initialize() {
    if (this.initialized) return;
    
    this.redis = getRedis();
    this.analyticsDb = getAnalyticsDb();
    this.initializeQueues();
    this.initialized = true;
  }

  private initializeQueues() {
    // Create queues for different event types
    const eventTypes = [
      'ticket-purchase',
      'ticket-scan', 
      'page-view',
      'cart-update',
      'venue-update'
    ];

    eventTypes.forEach(type => {
      const queue = new Bull(type, {
        redis: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      queue.process(async (job) => {
        await this.processEvent(type, job.data);
      });

      this.queues.set(type, queue);
    });
  }

  // Process incoming events
  async processEvent(type: string, data: StreamEvent) {
    try {
      logger.debug('Processing event', { type, venueId: data.venueId });

      // Emit event for real-time processing
      this.emit(type, data);

      // Update real-time metrics
      await this.updateRealTimeMetrics(type, data);

      // Emit to WebSocket clients (only if WebSocket is initialized)
      try {
        emitMetricUpdate(data.venueId, type, data);
      } catch (e) {
        // WebSocket might not be initialized in tests
      }

      // Store raw event for later processing
      await this.storeRawEvent(type, data);

    } catch (error) {
      logger.error('Failed to process event', { type, error });
    }
  }

  private async updateRealTimeMetrics(type: string, event: StreamEvent) {
    const { venueId, data } = event;

    switch (type) {
      case 'ticket-purchase':
        await this.updatePurchaseMetrics(venueId, data);
        break;
      
      case 'ticket-scan':
        await this.updateScanMetrics(venueId, data);
        break;
      
      case 'page-view':
        await this.updateTrafficMetrics(venueId, data);
        break;
    }
  }

  private async updatePurchaseMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    
    // Update real-time purchase metrics
    const key = `metrics:purchase:${venueId}:${new Date().toISOString().split('T')[0]}`;
    
    await this.redis.hincrby(key, 'total_sales', 1);
    await this.redis.hincrbyfloat(key, 'revenue', data.amount);
    await this.redis.expire(key, 86400); // 24 hour TTL

    // Update database with aggregated metrics
    if (!this.analyticsDb) return;
    
    const hour = new Date().getHours();
    await this.analyticsDb('venue_analytics')
      .insert({
        venue_id: venueId,
        date: new Date(),
        hour: hour,
        tickets_sold: 1,
        revenue: data.amount
      })
      .onConflict(['venue_id', 'date', 'hour'])
      .merge({
        tickets_sold: this.analyticsDb.raw('venue_analytics.tickets_sold + 1'),
        revenue: this.analyticsDb.raw('venue_analytics.revenue + ?', [data.amount]),
        updated_at: new Date()
      });
  }

  private async updateScanMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:scan:${venueId}:${data.eventId}`;
    await this.redis.hincrby(key, 'scanned', 1);
    await this.redis.expire(key, 86400);
  }

  private async updateTrafficMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:traffic:${venueId}:${new Date().toISOString().split('T')[0]}`;
    await this.redis.hincrby(key, 'page_views', 1);
    await this.redis.pfadd(`unique_visitors:${venueId}`, data.sessionId);
    await this.redis.expire(key, 86400);
  }

  private async storeRawEvent(type: string, event: StreamEvent) {
    // Store in MongoDB for later analysis
    // We'll implement this when MongoDB is configured
    logger.debug('Storing raw event', { type, venueId: event.venueId });
  }

  // Public method to push events
  async pushEvent(type: string, event: StreamEvent) {
    await this.initialize();
    
    const queue = this.queues.get(type);
    if (queue) {
      await queue.add(event, {
        removeOnComplete: true,
        removeOnFail: false
      });
    }
  }

  // Subscribe to external events (from other services)
  async subscribeToExternalEvents() {
    await this.initialize();
    
    // Subscribe to Redis pub/sub for cross-service events
    const subscriber = this.redis.duplicate();
    
    subscriber.subscribe('analytics:events');
    
    subscriber.on('message', async (channel: string, message: string) => {
      try {
        const event = JSON.parse(message);
        await this.pushEvent(event.type, event);
      } catch (error) {
        logger.error('Failed to process external event', error);
      }
    });
  }
}

export const eventStreamService = new EventStreamService();
```

### FILE: src/services/prediction.service.ts
```typescript
import { 
  ModelType,
  DemandForecast,
  PriceOptimization,
  ChurnPrediction,
  CustomerLifetimeValue,
  NoShowPrediction,
  WhatIfScenario
} from '../types';
import { logger } from '../utils/logger';
import { customerIntelligenceService } from './customer-intelligence.service';
import * as tf from '@tensorflow/tfjs-node';

export class PredictionService {
  private static instance: PredictionService;
  private log = logger.child({ component: 'PredictionService' });
  private models: Map<ModelType, tf.LayersModel> = new Map();

  static getInstance(): PredictionService {
    if (!this.instance) {
      this.instance = new PredictionService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load pre-trained models
      // In production, these would be loaded from model storage
      this.log.info('Initializing prediction models...');
      
      // For now, we'll create simple placeholder models
      await this.initializePlaceholderModels();
      
      this.log.info('Prediction models initialized');
    } catch (error) {
      this.log.error('Failed to initialize prediction models', { error });
    }
  }

  private async initializePlaceholderModels(): Promise<void> {
    // Create simple neural networks for each model type
    const modelTypes = Object.values(ModelType);
    
    for (const modelType of modelTypes) {
      const model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' })
        ]
      });
      
      model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });
      
      this.models.set(modelType, model);
    }
  }

  async predictDemand(
    venueId: string,
    eventId: string,
    daysAhead: number = 30
  ): Promise<DemandForecast> {
    try {
      // Get historical data
      
      // Generate predictions
      const predictions = [];
      const today = new Date();
      
      for (let i = 0; i < daysAhead; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        
        // Simple demand prediction based on day of week and historical average
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const baseDemand = isWeekend ? 150 : 100;
        const variance = Math.random() * 50 - 25;
        const predictedDemand = Math.max(0, baseDemand + variance);
        
        predictions.push({
          date,
          ticketTypeId: 'general',
          predictedDemand: Math.round(predictedDemand),
          confidenceInterval: {
            lower: Math.round(predictedDemand * 0.8),
            upper: Math.round(predictedDemand * 1.2)
          },
          factors: [
            { name: 'Day of Week', impact: isWeekend ? 1.5 : 1.0 },
            { name: 'Seasonality', impact: 1.0 },
            { name: 'Marketing', impact: 1.1 }
          ]
        });
      }
      
      const totalPredictedDemand = predictions.reduce((sum, p) => sum + p.predictedDemand, 0);
      const peakDemand = Math.max(...predictions.map(p => p.predictedDemand));
      const peakDemandDate = predictions.find(p => p.predictedDemand === peakDemand)?.date || today;
      
      return {
        eventId,
        predictions,
        aggregated: {
          totalPredictedDemand,
          peakDemandDate,
          sellOutProbability: totalPredictedDemand > 1000 ? 0.8 : 0.3
        }
      };
    } catch (error) {
      this.log.error('Failed to predict demand', { error, venueId, eventId });
      throw error;
    }
  }

  async optimizePrice(
    venueId: string,
    eventId: string,
    ticketTypeId: string,
    currentPrice: number
  ): Promise<PriceOptimization> {
    try {
      // Simple price optimization based on elasticity
      const elasticity = -1.5; // Price elasticity of demand
      const recommendations = [];
      
      // Test different price points
      const pricePoints = [0.8, 0.9, 1.0, 1.1, 1.2].map(factor => currentPrice * factor);
      
      for (const price of pricePoints) {
        const priceChange = (price - currentPrice) / currentPrice;
        const demandChange = elasticity * priceChange;
        const expectedDemand = 100 * (1 + demandChange);
        const expectedRevenue = price * expectedDemand;
        
        recommendations.push({
          price,
          expectedDemand: Math.round(expectedDemand),
          expectedRevenue: Math.round(expectedRevenue),
          elasticity,
          confidence: 0.7 + Math.random() * 0.2
        });
      }
      
      // Find optimal price
      const optimal = recommendations.reduce((best, current) => 
        current.expectedRevenue > best.expectedRevenue ? current : best
      );
      
      return {
        eventId,
        ticketTypeId,
        currentPrice,
        recommendations,
        optimalPrice: optimal.price,
        priceRange: {
          min: Math.min(...pricePoints),
          max: Math.max(...pricePoints)
        },
        factors: [
          { factor: 'Demand Level', weight: 0.4, direction: 'positive' },
          { factor: 'Competition', weight: 0.3, direction: 'negative' },
          { factor: 'Day of Week', weight: 0.2, direction: 'positive' },
          { factor: 'Seasonality', weight: 0.1, direction: 'positive' }
        ]
      };
    } catch (error) {
      this.log.error('Failed to optimize price', { error, venueId, eventId });
      throw error;
    }
  }

  async predictChurn(
    venueId: string,
    customerId: string
  ): Promise<ChurnPrediction> {
    try {
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      if (!profile) {
        throw new Error('Customer profile not found');
      }
      
      // Simple churn prediction based on recency and frequency
      const churnProbability = profile.churnProbability;
      const riskLevel = churnProbability > 0.7 ? 'high' : 
                       churnProbability > 0.4 ? 'medium' : 'low';
      
      const reasons = [];
      
      if (profile.daysSinceLastPurchase > 90) {
        reasons.push({
          factor: 'Long time since last purchase',
          weight: 0.4,
          description: `${profile.daysSinceLastPurchase} days since last purchase`
        });
      }
      
      if (profile.purchaseFrequency < 2) {
        reasons.push({
          factor: 'Low purchase frequency',
          weight: 0.3,
          description: `Only ${profile.purchaseFrequency.toFixed(1)} purchases per year`
        });
      }
      
      const recommendedActions: Array<{
        action: string;
        expectedImpact: number;
        effort: 'low' | 'medium' | 'high';
      }> = [];
      
      if (riskLevel === 'high') {
        recommendedActions.push(
          { action: 'Send win-back email campaign', expectedImpact: 0.3, effort: 'low' },
          { action: 'Offer personalized discount', expectedImpact: 0.4, effort: 'medium' },
          { action: 'Call customer directly', expectedImpact: 0.5, effort: 'high' }
        );
      } else if (riskLevel === 'medium') {
        recommendedActions.push(
          { action: 'Include in re-engagement campaign', expectedImpact: 0.2, effort: 'low' },
          { action: 'Send event recommendations', expectedImpact: 0.3, effort: 'low' }
        );
      }
      
      return {
        customerId: profile.customerId,
        churnProbability,
        riskLevel: riskLevel as any,
        timeframe: 90,
        reasons,
        recommendedActions
      };
    } catch (error) {
      this.log.error('Failed to predict churn', { error, venueId, customerId });
      throw error;
    }
  }

  async predictCustomerLifetimeValue(
    venueId: string,
    customerId: string
  ): Promise<CustomerLifetimeValue> {
    try {
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      if (!profile) {
        throw new Error('Customer profile not found');
      }
      
      // Simple CLV calculation
      const monthlySpend = profile.averageOrderValue * (profile.purchaseFrequency / 12);
      const retentionRate = 1 - profile.churnProbability;
      const timeHorizon = 36; // 3 years in months
      
      let clv = 0;
      let cumulativeRetention = 1;
      
      for (let month = 1; month <= timeHorizon; month++) {
        cumulativeRetention *= retentionRate;
        clv += monthlySpend * cumulativeRetention;
      }
      
      const growthPotential = profile.segment === 'new' ? 1.5 :
                             profile.segment === 'occasional' ? 1.3 :
                             profile.segment === 'regular' ? 1.1 : 1.0;
      
      return {
        customerId: profile.customerId,
        predictedCLV: Math.round(clv),
        confidence: 0.75,
        timeHorizon,
        breakdown: {
          expectedPurchases: Math.round(profile.purchaseFrequency * 3),
          averageOrderValue: profile.averageOrderValue,
          retentionProbability: retentionRate
        },
        segment: profile.segment,
        growthPotential
      };
    } catch (error) {
      this.log.error('Failed to predict CLV', { error, venueId, customerId });
      throw error;
    }
  }

  async predictNoShow(
    venueId: string,
    ticketId: string,
    customerId: string,
    eventId: string
  ): Promise<NoShowPrediction> {
    try {
      // Get customer profile
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      // Simple no-show prediction based on customer behavior
      const riskFactors = [];
      let noShowProbability = 0.1; // Base probability
      
      if (profile) {
        if (profile.daysSinceLastPurchase > 180) {
          noShowProbability += 0.2;
          riskFactors.push({
            factor: 'Inactive customer',
            value: profile.daysSinceLastPurchase,
            contribution: 0.2
          });
        }
        
        if (profile.averageOrderValue < 50) {
          noShowProbability += 0.1;
          riskFactors.push({
            factor: 'Low-value tickets',
            value: profile.averageOrderValue,
            contribution: 0.1
          });
        }
      }
      
      // Add weather factor (mock)
      const weatherRisk = Math.random() * 0.2;
      if (weatherRisk > 0.1) {
        noShowProbability += weatherRisk;
        riskFactors.push({
          factor: 'Weather conditions',
          value: 'Rain expected',
          contribution: weatherRisk
        });
      }
      
      const recommendedActions = noShowProbability > 0.3 ? [
        'Send reminder 24 hours before event',
        'Offer easy parking information',
        'Enable ticket transfer option'
      ] : [];
      
      return {
        ticketId,
        customerId,
        eventId,
        noShowProbability: Math.min(noShowProbability, 1),
        riskFactors,
        recommendedActions
      };
    } catch (error) {
      this.log.error('Failed to predict no-show', { error, venueId, ticketId });
      throw error;
    }
  }

  async runWhatIfScenario(
    venueId: string,
    scenario: Partial<WhatIfScenario>
  ): Promise<WhatIfScenario> {
    try {
      const baselineMetrics = {
        revenue: 100000,
        attendance: 1000,
        conversionRate: 0.05,
        averageTicketPrice: 100
      };
      
      const scenarios = [];
      
      // Price change scenarios
      if (scenario.type === 'pricing') {
        const priceChanges = [-20, -10, 0, 10, 20];
        
        for (const change of priceChanges) {
          const newPrice = baselineMetrics.averageTicketPrice * (1 + change / 100);
          const elasticity = -1.5;
          const demandChange = elasticity * (change / 100);
          const newAttendance = baselineMetrics.attendance * (1 + demandChange);
          const newRevenue = newPrice * newAttendance;
          
          scenarios.push({
            name: `${change > 0 ? '+' : ''}${change}% price`,
            parameters: { priceChange: change },
            predictions: {
              revenue: Math.round(newRevenue),
              attendance: Math.round(newAttendance),
              averageTicketPrice: newPrice
            },
            impact: {
              revenue: ((newRevenue - baselineMetrics.revenue) / baselineMetrics.revenue) * 100,
              attendance: ((newAttendance - baselineMetrics.attendance) / baselineMetrics.attendance) * 100
            }
          });
        }
      }
      
      return {
        id: scenario.id || 'scenario-' + Date.now(),
        name: scenario.name || 'What-If Analysis',
        type: scenario.type as any || 'pricing',
        baselineMetrics,
        scenarios,
        recommendations: [
          'Consider moderate price increases for high-demand events',
          'Monitor competitor pricing regularly',
          'Test dynamic pricing strategies'
        ]
      };
    } catch (error) {
      this.log.error('Failed to run what-if scenario', { error, venueId });
      throw error;
    }
  }

}

export const predictionService = PredictionService.getInstance();
```

### FILE: src/services/aggregation.service.ts
```typescript
import { AggregationModel, MetricModel } from '../models';
import { 
  MetricAggregation, 
  MetricType, 
  TimeGranularity,
  DateRange 
} from '../types';
import { logger } from '../utils/logger';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class AggregationService {
  private static instance: AggregationService;
  private log = logger.child({ component: 'AggregationService' });

  static getInstance(): AggregationService {
    if (!this.instance) {
      this.instance = new AggregationService();
    }
    return this.instance;
  }

  async aggregateMetrics(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    granularity: TimeGranularity
  ): Promise<MetricAggregation> {
    try {
      // Check cache
      const cacheKey = CacheModel.getCacheKey(
        'aggregation',
        venueId,
        metricType,
        dateRange.startDate.toISOString(),
        dateRange.endDate.toISOString(),
        JSON.stringify(granularity)
      );

      const cached = await CacheModel.get<MetricAggregation>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get raw metrics
      const metrics = await MetricModel.getMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate
      );

      // Aggregate by time periods
      const aggregated = this.aggregateByGranularity(
        metrics,
        granularity
      );

      // Calculate summary statistics
      const values = aggregated.map(d => d.value);
      const summary = {
        total: values.reduce((sum, val) => sum + val, 0),
        average: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
        trend: this.calculateTrend(aggregated)
      };

      const aggregation: MetricAggregation = {
        metricType,
        period: dateRange,
        granularity,
        data: aggregated,
        summary
      };

      // Store in database
      await AggregationModel.upsertAggregation(venueId, aggregation);

      // Cache result
      await CacheModel.set(cacheKey, aggregation, CONSTANTS.CACHE_TTL.INSIGHTS);

      return aggregation;
    } catch (error) {
      this.log.error('Failed to aggregate metrics', { 
        error, 
        venueId, 
        metricType 
      });
      throw error;
    }
  }

  private aggregateByGranularity(
    metrics: any[],
    granularity: TimeGranularity
  ): Array<{ timestamp: Date; value: number; change?: number; changePercent?: number }> {
    const buckets = new Map<string, number>();
    
    // Group metrics into time buckets
    metrics.forEach(metric => {
      const bucketKey = this.getBucketKey(metric.timestamp, granularity);
      const currentValue = buckets.get(bucketKey) || 0;
      buckets.set(bucketKey, currentValue + metric.value);
    });

    // Convert to array and sort
    const result: Array<{ timestamp: Date; value: number; change?: number; changePercent?: number }> = 
      Array.from(buckets.entries())
        .map(([key, value]) => ({
          timestamp: new Date(key),
          value,
          change: undefined,
          changePercent: undefined
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate changes
    for (let i = 1; i < result.length; i++) {
      const current = result[i];
      const previous = result[i - 1];
      
      current.change = current.value - previous.value;
      current.changePercent = previous.value > 0 
        ? ((current.change / previous.value) * 100)
        : 0;
    }

    return result;
  }

  private getBucketKey(date: Date, granularity: TimeGranularity): string {
    const d = new Date(date);
    
    switch (granularity.unit) {
      case 'minute':
        d.setSeconds(0, 0);
        break;
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        break;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        const month = d.getMonth();
        d.setMonth(Math.floor(month / 3) * 3);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'year':
        d.setMonth(0, 1);
        d.setHours(0, 0, 0, 0);
        break;
    }
    
    return d.toISOString();
  }

  private calculateTrend(data: Array<{ value: number }>): number {
    if (data.length < 2) return 0;

    // Simple linear regression
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    data.forEach((point, index) => {
      sumX += index;
      sumY += point.value;
      sumXY += index * point.value;
      sumX2 += index * index;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  async performHourlyAggregation(venueId: string): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const metricTypes = Object.values(MetricType);

      await Promise.all(
        metricTypes.map(metricType =>
          this.aggregateMetrics(
            venueId,
            metricType,
            { startDate: oneHourAgo, endDate: now },
            { unit: 'hour', value: 1 }
          )
        )
      );

      this.log.info('Hourly aggregation completed', { venueId });
    } catch (error) {
      this.log.error('Failed to perform hourly aggregation', { error, venueId });
      throw error;
    }
  }

  async performDailyAggregation(venueId: string): Promise<void> {
    try {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const metricTypes = Object.values(MetricType);

      await Promise.all(
        metricTypes.map(metricType =>
          this.aggregateMetrics(
            venueId,
            metricType,
            { startDate: yesterday, endDate: today },
            { unit: 'day', value: 1 }
          )
        )
      );

      this.log.info('Daily aggregation completed', { venueId });
    } catch (error) {
      this.log.error('Failed to perform daily aggregation', { error, venueId });
      throw error;
    }
  }

  async getComparativeMetrics(
    venueId: string,
    metricType: MetricType,
    currentPeriod: DateRange,
    comparisonPeriod: DateRange,
    granularity: TimeGranularity
  ): Promise<{
    current: MetricAggregation;
    previous: MetricAggregation;
    change: number;
    changePercent: number;
  }> {
    try {
      const [current, previous] = await Promise.all([
        this.aggregateMetrics(venueId, metricType, currentPeriod, granularity),
        this.aggregateMetrics(venueId, metricType, comparisonPeriod, granularity)
      ]);

      const change = current.summary.total - previous.summary.total;
      const changePercent = previous.summary.total > 0
        ? (change / previous.summary.total) * 100
        : 0;

      return {
        current,
        previous,
        change,
        changePercent
      };
    } catch (error) {
      this.log.error('Failed to get comparative metrics', { 
        error, 
        venueId, 
        metricType 
      });
      throw error;
    }
  }
}

export const aggregationService = AggregationService.getInstance();
```

### FILE: src/services/cache.service.ts
```typescript
import { CacheModel } from '../models';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export class CacheService {
  private static instance: CacheService;
  private log = logger.child({ component: 'CacheService' });
  
  // Cache integrity configuration
  private readonly CACHE_SECRET = process.env.CACHE_SECRET || 'default-cache-secret-change-in-production';
  private readonly SIGNATURE_ALGORITHM = 'sha256';
  private readonly PROTECTED_PREFIXES = ['stats:', 'metrics:', 'aggregate:', 'event:'];

  static getInstance(): CacheService {
    if (!this.instance) {
      this.instance = new CacheService();
    }
    return this.instance;
  }

  private generateSignature(key: string, value: any): string {
    const data = JSON.stringify({ key, value });
    return crypto
      .createHmac(this.SIGNATURE_ALGORITHM, this.CACHE_SECRET)
      .update(data)
      .digest('hex');
  }

  private validateSignature(key: string, value: any, signature: string): boolean {
    const expectedSignature = this.generateSignature(key, value);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private isProtectedKey(key: string): boolean {
    return this.PROTECTED_PREFIXES.some(prefix => key.startsWith(prefix));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isProtectedKey(key)) {
        // Get signed data for protected keys
        const signedData = await CacheModel.get<{ value: T; signature: string }>(key);
        if (!signedData) return null;

        // Validate signature
        if (!this.validateSignature(key, signedData.value, signedData.signature)) {
          this.log.warn('Cache signature validation failed', { key });
          await this.delete(key); // Remove corrupted data
          return null;
        }

        return signedData.value;
      }
      
      // Non-protected keys don't need signature validation
      return await CacheModel.get<T>(key);
    } catch (error) {
      this.log.error('Cache get error', { error, key });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      // Validate write permissions for protected keys
      if (this.isProtectedKey(key)) {
        // Check if caller has permission to write to protected cache
        // This would normally check request context or service identity
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache write attempt to protected key: ${key}`);
        }

        // Sign and store protected data
        const signature = this.generateSignature(key, value);
        const signedData = { value, signature };
        await CacheModel.set(key, signedData, ttl);
      } else {
        // Non-protected keys can be written directly
        await CacheModel.set(key, value, ttl);
      }
    } catch (error) {
      this.log.error('Cache set error', { error, key });
      throw error; // Re-throw to prevent silent failures
    }
  }

  private validateWritePermission(key: string): boolean {
    // Check if the current service/user has permission to write to this cache key
    // This should be enhanced based on your authentication context
    
    // For now, we'll implement basic service-level validation
    const serviceId = process.env.SERVICE_ID || 'analytics-service';
    
    // Statistics and metrics should only be written by analytics service
    if (key.startsWith('stats:') || key.startsWith('metrics:')) {
      return serviceId === 'analytics-service';
    }
    
    // Event data should only be written by event service or analytics service
    if (key.startsWith('event:')) {
      return ['event-service', 'analytics-service'].includes(serviceId);
    }
    
    // Aggregate data should only be written by analytics service
    if (key.startsWith('aggregate:')) {
      return serviceId === 'analytics-service';
    }
    
    return true; // Allow writes to non-protected keys
  }

  async delete(key: string): Promise<void> {
    try {
      // Validate permission to delete protected keys
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache delete attempt for protected key: ${key}`);
        }
      }
      
      await CacheModel.delete(key);
    } catch (error) {
      this.log.error('Cache delete error', { error, key });
      throw error;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      // Check if pattern includes protected keys
      const affectsProtected = this.PROTECTED_PREFIXES.some(prefix => 
        pattern.includes(prefix) || pattern === '*'
      );
      
      if (affectsProtected) {
        const hasPermission = this.validateWritePermission(pattern);
        if (!hasPermission) {
          throw new Error(`Unauthorized pattern delete for protected keys: ${pattern}`);
        }
      }
      
      return await CacheModel.deletePattern(pattern);
    } catch (error) {
      this.log.error('Cache delete pattern error', { error, pattern });
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return await CacheModel.exists(key);
    } catch (error) {
      this.log.error('Cache exists error', { error, key });
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      // Validate permission for protected keys
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache expire attempt for protected key: ${key}`);
        }
      }
      
      await CacheModel.expire(key, ttl);
    } catch (error) {
      this.log.error('Cache expire error', { error, key });
      throw error;
    }
  }

  async increment(key: string, by: number = 1): Promise<number> {
    try {
      // Increments on protected keys need validation
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache increment for protected key: ${key}`);
        }
        
        // For protected numeric values, maintain integrity
        const current = await this.get<number>(key) || 0;
        const newValue = current + by;
        await this.set(key, newValue);
        return newValue;
      }
      
      return await CacheModel.increment(key, by);
    } catch (error) {
      this.log.error('Cache increment error', { error, key });
      return 0;
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Generate value
      const value = await factory();

      // Store in cache with appropriate validation
      await this.set(key, value, ttl);

      return value;
    } catch (error) {
      this.log.error('Cache getOrSet error', { error, key });
      // Return factory result even if cache fails
      return await factory();
    }
  }

  async invalidateVenueCache(venueId: string): Promise<void> {
    try {
      // Validate permission to invalidate venue cache
      const hasPermission = this.validateWritePermission(`venue:${venueId}`);
      if (!hasPermission) {
        throw new Error(`Unauthorized venue cache invalidation for: ${venueId}`);
      }
      
      await CacheModel.invalidateVenueCache(venueId);
      this.log.info('Venue cache invalidated', { venueId });
    } catch (error) {
      this.log.error('Failed to invalidate venue cache', { error, venueId });
      throw error;
    }
  }

  async warmupCache(venueId: string): Promise<void> {
    try {
      // This would pre-populate commonly accessed data
      this.log.info('Cache warmup started', { venueId });

      // In production, this would:
      // - Load venue settings
      // - Pre-calculate common metrics
      // - Load dashboard configurations
      // - Cache widget data

      this.log.info('Cache warmup completed', { venueId });
    } catch (error) {
      this.log.error('Cache warmup failed', { error, venueId });
    }
  }

  async getCacheStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    keys: number;
    memory: number;
  }> {
    // In production, this would track cache statistics
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      keys: 0,
      memory: 0
    };
  }

  async flushAll(): Promise<void> {
    try {
      // Only allow flush from admin or during tests
      const isTest = process.env.NODE_ENV === 'test';
      const isAdmin = process.env.SERVICE_ID === 'admin-service';
      
      if (!isTest && !isAdmin) {
        throw new Error('Unauthorized cache flush attempt');
      }
      
      // Warning: This clears all cache data
      await CacheModel.deletePattern('*');
      this.log.warn('All cache data flushed');
    } catch (error) {
      this.log.error('Failed to flush cache', { error });
      throw error;
    }
  }
}

export const cacheService = CacheService.getInstance();
```

### FILE: src/services/export.service.ts
```typescript
import { ExportModel } from '../models';
import {
  ExportRequest,
  ExportStatus,
  ExportFormat,
  FinancialExportData,
  CustomerExportData
} from '../types';
import { logger } from '../utils/logger';
import { messageGatewayService } from './message-gateway.service';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import Excel from 'exceljs';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';

export class ExportService {
  private static instance: ExportService;
  private log = logger.child({ component: 'ExportService' });

  static getInstance(): ExportService {
    if (!this.instance) {
      this.instance = new ExportService();
    }
    return this.instance;
  }

  async createExport(
    request: Omit<ExportRequest, 'id' | 'createdAt' | 'status'>
  ): Promise<ExportRequest> {
    try {
      const exportRequest = await ExportModel.createExport({
        ...request,
        status: ExportStatus.PENDING
      });

      // Queue export for processing
      this.processExportAsync(exportRequest.id);

      return exportRequest;
    } catch (error) {
      this.log.error('Failed to create export', { error });
      throw error;
    }
  }

  private async processExportAsync(exportId: string): Promise<void> {
    try {
      // Update status to processing
      await ExportModel.updateExportStatus(exportId, ExportStatus.PROCESSING);

      // Get export details
      const exportRequest = await ExportModel.findById(exportId);
      if (!exportRequest) {
        throw new Error('Export request not found');
      }

      // Generate export based on type
      let filePath: string;
      switch (exportRequest.type) {
        case 'analytics_report':
          filePath = await this.generateAnalyticsReport(exportRequest);
          break;
        case 'customer_list':
          filePath = await this.generateCustomerList(exportRequest);
          break;
        case 'financial_report':
          filePath = await this.generateFinancialReport(exportRequest);
          break;
        default:
          throw new Error(`Unsupported export type: ${exportRequest.type}`);
      }

      // Upload to storage (mock)
      const fileUrl = await this.uploadToStorage(filePath);
      const fileSize = (await fs.stat(filePath)).size;

      // Update export status
      await ExportModel.updateExportStatus(exportId, ExportStatus.COMPLETED, {
        fileUrl,
        fileSize,
        completedAt: new Date()
      });

      // Send notification
      await messageGatewayService.sendMessage(
        'email',
        exportRequest.userId,
        'report-ready-email',
        {
          reportName: exportRequest.type,
          generatedAt: new Date().toISOString(),
          fileSize: this.formatFileSize(fileSize),
          downloadUrl: fileUrl,
          expirationDays: 7
        }
      );

      // Clean up temp file
      await fs.unlink(filePath);
    } catch (error) {
      this.log.error('Failed to process export', { error, exportId });

      await ExportModel.updateExportStatus(exportId, ExportStatus.FAILED, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async generateAnalyticsReport(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchAnalyticsData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.CSV:
        return await this.generateCSV(data, 'analytics-report');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'analytics-report');
      case ExportFormat.PDF:
        return await this.generatePDF(data, 'analytics-report');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateCustomerList(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchCustomerData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.CSV:
        return await this.generateCSV(data.customers, 'customer-list');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'customer-list');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateFinancialReport(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchFinancialData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.PDF:
        return await this.generatePDF(data, 'financial-report');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'financial-report');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateCSV(data: any[], fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.csv`);

    const parser = new Parser();
    const csv = parser.parse(data);

    await fs.writeFile(filePath, csv);

    return filePath;
  }

  private async generateExcel(data: any, fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.xlsx`);

    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add data based on structure
    if (Array.isArray(data)) {
      // Simple array of objects
      if (data.length > 0) {
        worksheet.columns = Object.keys(data[0]).map(key => ({
          header: key,
          key: key,
          width: 15
        }));
        worksheet.addRows(data);
      }
    } else if (data.summary && data.customers) {
      // Customer report structure
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRow(['Metric', 'Value']);
      Object.entries(data.summary).forEach(([key, value]) => {
        summarySheet.addRow([key, value]);
      });

      worksheet.columns = Object.keys(data.customers[0] || {}).map(key => ({
        header: key,
        key: key,
        width: 15
      }));
      worksheet.addRows(data.customers);
    }

    await workbook.xlsx.writeFile(filePath);

    return filePath;
  }

  private async generatePDF(data: any, fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.pdf`);

    const doc = new PDFDocument();
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Add content based on report type
    doc.fontSize(20).text('Analytics Report', { align: 'center' });
    doc.moveDown();

    if (data.summary) {
      doc.fontSize(16).text('Summary', { underline: true });
      doc.moveDown();

      Object.entries(data.summary).forEach(([key, value]) => {
        doc.fontSize(12).text(`${key}: ${value}`);
      });
    }

    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => resolve(filePath));
    });
  }

  private async fetchAnalyticsData(_exportRequest: ExportRequest): Promise<any> {
    // Mock data - in production, fetch from analytics database
    return [
      { date: '2024-01-01', sales: 100, revenue: 10000 },
      { date: '2024-01-02', sales: 120, revenue: 12000 },
      { date: '2024-01-03', sales: 90, revenue: 9000 }
    ];
  }

  private async fetchCustomerData(_exportRequest: ExportRequest): Promise<CustomerExportData> {
    // Mock data - in production, fetch from customer database
    return {
      summary: {
        totalCustomers: 1000,
        newCustomers: 150,
        activeCustomers: 800
      },
      customers: [
        {
          customerId: 'hash-1',
          firstPurchase: new Date('2023-01-01'),
          lastPurchase: new Date('2024-01-01'),
          totalSpent: 500,
          totalTickets: 5,
          segment: 'regular'
        }
      ]
    };
  }

  private async fetchFinancialData(_exportRequest: ExportRequest): Promise<FinancialExportData> {
    // Mock data - in production, fetch from financial database
    return {
      summary: {
        totalRevenue: 100000,
        totalTransactions: 1000,
        averageOrderValue: 100,
        refundAmount: 5000,
        netRevenue: 95000
      },
      byPeriod: [],
      byEventType: [],
      transactions: []
    };
  }

  private async uploadToStorage(filePath: string): Promise<string> {
    // In production, upload to S3 or similar
    // For now, return a mock URL
    return `https://storage.example.com/exports/${path.basename(filePath)}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  async getExportStatus(exportId: string): Promise<ExportRequest | null> {
    return await ExportModel.findById(exportId);
  }

  async getUserExports(
    userId: string,
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    return await ExportModel.getExportsByUser(userId, venueId, limit);
  }
}

export const exportService = ExportService.getInstance();
```

### FILE: src/types/widget.types.ts
```typescript
import { MetricType, DateRange } from './common.types';

export enum WidgetType {
  // Real-time widgets
  LIVE_SALES_COUNTER = 'live_sales_counter',
  LIVE_REVENUE_COUNTER = 'live_revenue_counter',
  LIVE_ATTENDANCE_GAUGE = 'live_attendance_gauge',
  CAPACITY_TRACKER = 'capacity_tracker',
  
  // Chart widgets
  LINE_CHART = 'line_chart',
  BAR_CHART = 'bar_chart',
  PIE_CHART = 'pie_chart',
  AREA_CHART = 'area_chart',
  HEATMAP = 'heatmap',
  
  // KPI widgets
  KPI_CARD = 'kpi_card',
  COMPARISON_CARD = 'comparison_card',
  TREND_CARD = 'trend_card',
  
  // Table widgets
  DATA_TABLE = 'data_table',
  LEADERBOARD = 'leaderboard',
  
  // Custom widgets
  CUSTOM_METRIC = 'custom_metric',
  CUSTOM_VISUALIZATION = 'custom_visualization',
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  metrics: MetricType[];
  dateRange?: DateRange;
  refreshInterval?: number; // in seconds
  size: WidgetSize;
  position: WidgetPosition;
  settings: WidgetSettings;
  filters?: WidgetFilter[];
}

export interface WidgetSize {
  width: number; // grid units
  height: number; // grid units
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface WidgetSettings {
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showDataLabels?: boolean;
  animation?: boolean;
  customStyles?: Record<string, any>;
  thresholds?: Array<{
    value: number;
    color: string;
    label?: string;
  }>;
}

export interface WidgetFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
  value: any;
}

export interface WidgetData {
  widgetId: string;
  timestamp: Date;
  data: any; // Specific to widget type
  metadata?: Record<string, any>;
}

export interface RealTimeWidgetData extends WidgetData {
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  sparkline?: number[];
}

export interface ChartWidgetData extends WidgetData {
  series: Array<{
    name: string;
    data: Array<{
      x: string | number | Date;
      y: number;
      metadata?: any;
    }>;
  }>;
  categories?: string[];
}

export interface TableWidgetData extends WidgetData {
  columns: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    sortable?: boolean;
    format?: string;
  }>;
  rows: Array<Record<string, any>>;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface WidgetUpdate {
  widgetId: string;
  data: WidgetData;
  timestamp: Date;
}

export interface WidgetSubscription {
  widgetId: string;
  userId: string;
  config: WidgetConfig;
  lastUpdate?: Date;
  status: 'active' | 'paused' | 'error';
}
```

### FILE: src/types/dashboard.types.ts
```typescript
import { WidgetConfig } from './widget.types';
import { AuditInfo } from './common.types';

export interface Dashboard extends AuditInfo {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isPublic: boolean;
  layout: DashboardLayout;
  widgets: WidgetConfig[];
  filters: DashboardFilter[];
  settings: DashboardSettings;
  permissions: DashboardPermissions;
  tags?: string[];
}

export interface DashboardLayout {
  type: 'grid' | 'freeform' | 'responsive';
  columns: number;
  rows?: number;
  gap?: number;
  padding?: number;
  breakpoints?: Array<{
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    columns: number;
  }>;
}

export interface DashboardFilter {
  id: string;
  name: string;
  field: string;
  type: 'date_range' | 'select' | 'multi_select' | 'search';
  defaultValue?: any;
  options?: Array<{
    value: string;
    label: string;
  }>;
  isGlobal: boolean;
  appliesTo?: string[]; // widget IDs
}

export interface DashboardSettings {
  theme: 'light' | 'dark' | 'auto';
  refreshInterval?: number; // in seconds
  timezone?: string;
  dateFormat?: string;
  numberFormat?: string;
  currency?: string;
  animations: boolean;
  showFilters: boolean;
  showToolbar: boolean;
  fullscreenEnabled: boolean;
}

export interface DashboardPermissions {
  ownerId: string;
  public: boolean;
  sharedWith: Array<{
    userId?: string;
    roleId?: string;
    permission: 'view' | 'edit' | 'admin';
  }>;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail?: string;
  layout: DashboardLayout;
  widgets: Partial<WidgetConfig>[];
  industries?: string[];
  tags?: string[];
  popularity: number;
}

export interface DashboardSnapshot {
  id: string;
  dashboardId: string;
  name: string;
  description?: string;
  data: Record<string, any>;
  createdAt: Date;
  expiresAt?: Date;
  shareToken?: string;
  accessCount: number;
}

export interface DashboardExport {
  format: 'pdf' | 'png' | 'csv' | 'excel';
  dashboardId: string;
  includeData: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  widgets?: string[]; // specific widget IDs to export
  settings?: {
    paperSize?: 'A4' | 'Letter' | 'Legal';
    orientation?: 'portrait' | 'landscape';
    quality?: 'low' | 'medium' | 'high';
  };
}
```

### FILE: src/types/alert.types.ts
```typescript
export interface Alert {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  conditions: AlertCondition[];
  actions: AlertAction[];
  schedule?: AlertSchedule;
  lastTriggered?: Date;
  triggerCount: number;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum AlertType {
  THRESHOLD = 'threshold',
  ANOMALY = 'anomaly',
  TREND = 'trend',
  COMPARISON = 'comparison',
  CUSTOM = 'custom',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  ACTIVE = 'active',
  TRIGGERED = 'triggered',
  RESOLVED = 'resolved',
  SNOOZED = 'snoozed',
  DISABLED = 'disabled',
}

export interface AlertCondition {
  id: string;
  metric: string;
  operator: ComparisonOperator;
  value: number;
  aggregation?: {
    method: 'sum' | 'avg' | 'min' | 'max' | 'count';
    period: number; // minutes
  };
  filters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

export enum ComparisonOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_THAN_OR_EQUALS = 'greater_than_or_equals',
  LESS_THAN_OR_EQUALS = 'less_than_or_equals',
  BETWEEN = 'between',
  NOT_BETWEEN = 'not_between',
  CHANGE_PERCENT = 'change_percent',
}

export interface AlertAction {
  type: ActionType;
  config: ActionConfig;
  delay?: number; // minutes
  repeat?: {
    enabled: boolean;
    interval: number; // minutes
    maxCount?: number;
  };
}

export enum ActionType {
  EMAIL = 'email',
  SMS = 'sms',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  DASHBOARD = 'dashboard',
  LOG = 'log',
}

export interface ActionConfig {
  // Email action
  recipients?: string[];
  subject?: string;
  template?: string;
  
  // SMS action
  phoneNumbers?: string[];
  message?: string;
  
  // Webhook action
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  
  // Slack action
  channel?: string;
  webhookUrl?: string;
  
  // Dashboard action
  dashboardId?: string;
  widgetId?: string;
  highlight?: boolean;
}

export interface AlertSchedule {
  timezone: string;
  activeHours?: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
  activeDays?: number[]; // 0-6 (Sunday-Saturday)
  excludeDates?: Date[];
}

export interface AlertInstance {
  id: string;
  alertId: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  severity: AlertSeverity;
  status: 'active' | 'acknowledged' | 'resolved';
  triggerValues: Record<string, any>;
  message: string;
  actions: Array<{
    type: ActionType;
    status: 'pending' | 'sent' | 'failed';
    sentAt?: Date;
    error?: string;
  }>;
  acknowledgedBy?: string;
  notes?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultSeverity: AlertSeverity;
  requiredMetrics: string[];
  configSchema: any; // JSON Schema
  examples: Array<{
    name: string;
    config: any;
  }>;
}

export interface AlertSummary {
  venueId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalAlerts: number;
  byStatus: Record<AlertStatus, number>;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<AlertType, number>;
  topAlerts: Array<{
    alertId: string;
    name: string;
    triggerCount: number;
  }>;
  averageResolutionTime: number; // minutes
  falsePositiveRate: number;
}

export interface AlertNotification {
  id: string;
  alertInstanceId: string;
  type: ActionType;
  recipient: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}
```

### FILE: src/types/common.types.ts
```typescript
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  metadata?: Record<string, any>;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TimeGranularity {
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  value: number;
}

export interface VenueContext {
  venueId: string;
  tenantId?: string;
}

export interface UserContext {
  userId: string;
  venueId?: string;
  permissions: string[];
  role?: string;
}

export interface AuditInfo {
  createdAt: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
}

export enum MetricType {
  SALES = 'sales',
  REVENUE = 'revenue',
  ATTENDANCE = 'attendance',
  CAPACITY = 'capacity',
  CONVERSION = 'conversion',
  CART_ABANDONMENT = 'cart_abandonment',
  AVERAGE_ORDER_VALUE = 'average_order_value',
  CUSTOMER_LIFETIME_VALUE = 'customer_lifetime_value',
}

export enum EventType {
  // Ticket events
  TICKET_PURCHASED = 'ticket.purchased',
  TICKET_TRANSFERRED = 'ticket.transferred',
  TICKET_REFUNDED = 'ticket.refunded',
  TICKET_SCANNED = 'ticket.scanned',
  
  // Venue events
  VENUE_CREATED = 'venue.created',
  VENUE_UPDATED = 'venue.updated',
  EVENT_CREATED = 'event.created',
  EVENT_UPDATED = 'event.updated',
  EVENT_CANCELLED = 'event.cancelled',
  
  // Payment events
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  REFUND_PROCESSED = 'refund.processed',
  
  // Marketplace events
  LISTING_CREATED = 'listing.created',
  LISTING_SOLD = 'listing.sold',
  OFFER_MADE = 'offer.made',
  
  // User events
  USER_REGISTERED = 'user.registered',
  USER_LOGIN = 'user.login',
  USER_PROFILE_UPDATED = 'user.profile_updated',
}
```

### FILE: src/types/export.types.ts
```typescript
export interface ExportRequest {
  id: string;
  venueId: string;
  userId: string;
  type: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  filters: ExportFilters;
  options: ExportOptions;
  progress?: number;
  fileUrl?: string;
  fileSize?: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

export enum ExportType {
  ANALYTICS_REPORT = 'analytics_report',
  CUSTOMER_LIST = 'customer_list',
  TRANSACTION_HISTORY = 'transaction_history',
  EVENT_SUMMARY = 'event_summary',
  FINANCIAL_REPORT = 'financial_report',
  DASHBOARD_SNAPSHOT = 'dashboard_snapshot',
  RAW_DATA = 'raw_data',
  CUSTOM_REPORT = 'custom_report',
}

export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
  JSON = 'json',
  XML = 'xml',
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface ExportFilters {
  dateRange: {
    start: Date;
    end: Date;
  };
  venues?: string[];
  events?: string[];
  eventTypes?: string[];
  customerSegments?: string[];
  metrics?: string[];
  dimensions?: string[];
  customFilters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

export interface ExportOptions {
  includeHeaders?: boolean;
  timezone?: string;
  dateFormat?: string;
  numberFormat?: string;
  currency?: string;
  language?: string;
  compression?: boolean;
  encryption?: {
    enabled: boolean;
    password?: string;
  };
  scheduling?: {
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    endDate?: Date;
  };
  delivery?: {
    method: 'download' | 'email' | 's3' | 'ftp';
    destination?: string;
    recipients?: string[];
  };
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  type: ExportType;
  venueId?: string;
  isGlobal: boolean;
  sections: ReportSection[];
  filters: ExportFilters;
  options: ExportOptions;
  lastUsed?: Date;
  usageCount: number;
  createdBy: string;
  createdAt: Date;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'summary' | 'chart' | 'table' | 'text';
  order: number;
  config: {
    metrics?: string[];
    dimensions?: string[];
    visualization?: string;
    text?: string;
    formatting?: Record<string, any>;
  };
}

export interface ExportQueue {
  pending: ExportRequest[];
  processing: ExportRequest[];
  workers: ExportWorker[];
}

export interface ExportWorker {
  id: string;
  status: 'idle' | 'busy';
  currentExport?: string;
  startedAt?: Date;
  completedCount: number;
  errorCount: number;
}

export interface DataExportSchema {
  version: string;
  timestamp: Date;
  venue: {
    id: string;
    name: string;
  };
  metadata: Record<string, any>;
  data: any[]; // Specific to export type
}

export interface FinancialExportData {
  summary: {
    totalRevenue: number;
    totalTransactions: number;
    averageOrderValue: number;
    refundAmount: number;
    netRevenue: number;
  };
  byPeriod: Array<{
    period: string;
    revenue: number;
    transactions: number;
    refunds: number;
  }>;
  byEventType: Array<{
    eventType: string;
    revenue: number;
    ticketsSold: number;
  }>;
  transactions: Array<{
    date: Date;
    transactionId: string;
    amount: number;
    type: string;
    status: string;
  }>;
}

export interface CustomerExportData {
  summary: {
    totalCustomers: number;
    newCustomers: number;
    activeCustomers: number;
  };
  customers: Array<{
    customerId: string;
    firstPurchase: Date;
    lastPurchase: Date;
    totalSpent: number;
    totalTickets: number;
    segment: string;
    tags?: string[];
  }>;
}
```

### FILE: src/types/analytics.types.ts
```typescript
import { MetricType, EventType, DateRange, TimeGranularity } from './common.types';

export interface AnalyticsEvent {
  id: string;
  eventType: EventType;
  venueId: string;
  userId?: string;
  eventId?: string;
  ticketId?: string;
  timestamp: Date;
  properties: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface Metric {
  id: string;
  venueId: string;
  metricType: MetricType;
  value: number;
  timestamp: Date;
  granularity: TimeGranularity;
  dimensions?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface RealTimeMetric {
  metricType: MetricType;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  lastUpdated: Date;
}

export interface MetricAggregation {
  metricType: MetricType;
  period: DateRange;
  granularity: TimeGranularity;
  data: Array<{
    timestamp: Date;
    value: number;
    change?: number;
    changePercent?: number;
  }>;
  summary: {
    total: number;
    average: number;
    min: number;
    max: number;
    trend: number;
  };
}

export interface VenueAnalytics {
  venueId: string;
  overview: {
    totalEvents: number;
    totalTicketsSold: number;
    totalRevenue: number;
    averageTicketPrice: number;
    occupancyRate: number;
    customerSatisfaction: number;
  };
  trends: {
    sales: MetricAggregation;
    revenue: MetricAggregation;
    attendance: MetricAggregation;
  };
  topEvents: EventPerformance[];
  customerMetrics: CustomerMetrics;
}

export interface EventPerformance {
  eventId: string;
  eventName: string;
  eventDate: Date;
  ticketsSold: number;
  revenue: number;
  occupancyRate: number;
  averageTicketPrice: number;
  conversionRate: number;
  customerSatisfaction?: number;
}

export interface CustomerMetrics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  averageOrderValue: number;
  customerLifetimeValue: number;
  churnRate: number;
  segments: CustomerSegmentMetrics[];
}

export interface CustomerSegmentMetrics {
  segmentId: string;
  segmentName: string;
  customerCount: number;
  averageSpend: number;
  purchaseFrequency: number;
  lastPurchaseAvg: number;
}

export interface ConversionFunnel {
  steps: Array<{
    name: string;
    visitors: number;
    conversions: number;
    conversionRate: number;
    dropoffRate: number;
  }>;
  overallConversion: number;
  totalVisitors: number;
  totalConversions: number;
}

export interface GeographicDistribution {
  regions: Array<{
    region: string;
    country: string;
    state?: string;
    city?: string;
    customerCount: number;
    revenue: number;
    percentage: number;
  }>;
}

export interface DeviceAnalytics {
  devices: Array<{
    type: 'desktop' | 'mobile' | 'tablet';
    brand?: string;
    os?: string;
    browser?: string;
    sessions: number;
    conversions: number;
    conversionRate: number;
  }>;
}

export interface MarketingAttribution {
  channels: Array<{
    channel: string;
    source: string;
    medium: string;
    campaign?: string;
    visits: number;
    conversions: number;
    revenue: number;
    roi: number;
    costPerAcquisition: number;
  }>;
  multiTouchAttribution: Array<{
    touchpoint: string;
    attribution: number;
    revenue: number;
  }>;
}
```

### FILE: src/types/customer.types.ts
```typescript
export interface CustomerProfile {
  customerId: string; // Hashed customer ID
  venueId: string;
  firstSeen: Date;
  lastSeen: Date;
  totalSpent: number;
  totalTickets: number;
  totalPurchases?: number;
  averageOrderValue: number;
  purchaseFrequency: number;
  daysSinceLastPurchase: number;
  favoriteEventType?: string;
  segment: CustomerSegment;
  predictedLifetimeValue: number;
  churnProbability: number;
  tags?: string[];
  attributes: CustomerAttributes;
}

export interface CustomerAttributes {
  location?: {
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string; // First 3 digits only
  };
  demographics?: {
    ageGroup?: string;
    gender?: string;
    language?: string;
  };
  preferences?: {
    eventTypes?: string[];
    priceRange?: string;
    dayOfWeek?: string[];
    timeOfDay?: string[];
    seatingPreference?: string;
  };
  behavior?: {
    deviceType?: string;
    purchaseTime?: string;
    leadTime?: number; // Days before event
    groupSize?: number;
  };
}

export enum CustomerSegment {
  NEW = 'new',
  OCCASIONAL = 'occasional',
  REGULAR = 'regular',
  VIP = 'vip',
  AT_RISK = 'at_risk',
  DORMANT = 'dormant',
  LOST = 'lost',
}

export interface CustomerSegmentDefinition {
  segment: CustomerSegment;
  criteria: {
    minPurchases?: number;
    maxPurchases?: number;
    minSpend?: number;
    maxSpend?: number;
    minFrequency?: number; // purchases per year
    maxFrequency?: number;
    maxDaysSinceLastPurchase?: number;
    minDaysSinceLastPurchase?: number;
  };
  benefits?: string[];
  targetingRules?: Record<string, any>;
}

export interface CustomerInsight {
  customerId: string;
  type: InsightType;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  suggestedActions?: string[];
  validUntil: Date;
  metadata?: Record<string, any>;
}

export enum InsightType {
  PURCHASE_PATTERN = 'purchase_pattern',
  CHURN_RISK = 'churn_risk',
  UPSELL_OPPORTUNITY = 'upsell_opportunity',
  REACTIVATION = 'reactivation',
  MILESTONE = 'milestone',
  PREFERENCE_CHANGE = 'preference_change',
  LOW_ENGAGEMENT = 'low_engagement',
  HIGH_VALUE = 'high_value'
}

export interface CustomerCohort {
  cohortId: string;
  name: string;
  description: string;
  criteria: Record<string, any>;
  customerCount: number;
  metrics: {
    retention: Array<{
      period: number;
      rate: number;
    }>;
    averageLifetimeValue: number;
    averageOrderValue: number;
    totalRevenue: number;
  };
  createdAt: Date;
}

export interface CustomerJourney {
  customerId: string;
  touchpoints: Array<{
    timestamp: Date;
    type: string;
    channel: string;
    action: string;
    details?: Record<string, any>;
  }>;
  currentStage: string;
  nextBestAction?: string;
  conversionProbability?: number;
}

export interface RFMAnalysis {
  customerId: string;
  recency: number; // Days since last purchase
  frequency: number; // Number of purchases
  monetary: number; // Total spent
  recencyScore: number; // 1-5
  frequencyScore: number; // 1-5
  monetaryScore: number; // 1-5
  segment: string; // e.g., "Champions", "At Risk"
}
```

### FILE: src/types/prediction.types.ts
```typescript
export interface PredictionModel {
  id: string;
  venueId: string;
  modelType: ModelType;
  version: string;
  status: ModelStatus;
  accuracy?: number;
  lastTrained: Date;
  nextTraining: Date;
  parameters: ModelParameters;
  metrics: ModelMetrics;
  features: string[];
}

export enum ModelType {
  DEMAND_FORECAST = 'demand_forecast',
  PRICE_OPTIMIZATION = 'price_optimization',
  CHURN_PREDICTION = 'churn_prediction',
  LIFETIME_VALUE = 'lifetime_value',
  NO_SHOW_PREDICTION = 'no_show_prediction',
  FRAUD_DETECTION = 'fraud_detection',
}

export enum ModelStatus {
  TRAINING = 'training',
  READY = 'ready',
  FAILED = 'failed',
  OUTDATED = 'outdated',
  DISABLED = 'disabled',
}

export interface ModelParameters {
  algorithm: string;
  hyperparameters: Record<string, any>;
  trainingConfig: {
    batchSize?: number;
    epochs?: number;
    learningRate?: number;
    validationSplit?: number;
  };
}

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  rmse?: number;
  mae?: number;
  r2?: number;
  confusionMatrix?: number[][];
  featureImportance?: Array<{
    feature: string;
    importance: number;
  }>;
}

export interface DemandForecast {
  eventId: string;
  predictions: Array<{
    date: Date;
    ticketTypeId: string;
    predictedDemand: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    factors: Array<{
      name: string;
      impact: number;
    }>;
  }>;
  aggregated: {
    totalPredictedDemand: number;
    peakDemandDate: Date;
    sellOutProbability: number;
  };
}

export interface PriceOptimization {
  eventId: string;
  ticketTypeId: string;
  currentPrice: number;
  recommendations: Array<{
    price: number;
    expectedDemand: number;
    expectedRevenue: number;
    elasticity: number;
    confidence: number;
  }>;
  optimalPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  factors: Array<{
    factor: string;
    weight: number;
    direction: 'positive' | 'negative';
  }>;
}

export interface ChurnPrediction {
  customerId: string;
  churnProbability: number;
  riskLevel: 'low' | 'medium' | 'high';
  timeframe: number; // days
  reasons: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;
  recommendedActions: Array<{
    action: string;
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
  }>;
}

export interface CustomerLifetimeValue {
  customerId: string;
  predictedCLV: number;
  confidence: number;
  timeHorizon: number; // months
  breakdown: {
    expectedPurchases: number;
    averageOrderValue: number;
    retentionProbability: number;
  };
  segment: string;
  growthPotential: number;
}

export interface NoShowPrediction {
  ticketId: string;
  customerId: string;
  eventId: string;
  noShowProbability: number;
  riskFactors: Array<{
    factor: string;
    value: any;
    contribution: number;
  }>;
  recommendedActions?: string[];
}

export interface FraudDetection {
  transactionId: string;
  fraudProbability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anomalies: Array<{
    type: string;
    severity: number;
    description: string;
  }>;
  requiresReview: boolean;
  autoDecision: 'approve' | 'decline' | 'review';
}

export interface WhatIfScenario {
  id: string;
  name: string;
  type: 'pricing' | 'capacity' | 'timing' | 'marketing';
  baselineMetrics: Record<string, number>;
  scenarios: Array<{
    name: string;
    parameters: Record<string, any>;
    predictions: Record<string, number>;
    impact: Record<string, number>;
  }>;
  recommendations: string[];
}

export interface SeasonalityPattern {
  venueId: string;
  metricType: string;
  patterns: Array<{
    type: 'daily' | 'weekly' | 'monthly' | 'yearly';
    values: number[];
    strength: number;
    confidence: number;
  }>;
  holidays: Array<{
    name: string;
    impact: number;
    daysAffected: number;
  }>;
  events: Array<{
    type: string;
    averageImpact: number;
    frequency: number;
  }>;
}
```

### FILE: src/types/campaign.types.ts
```typescript

export interface Campaign {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate: Date;
  endDate: Date;
  budget?: number;
  targetAudience: TargetAudience;
  channels: CampaignChannel[];
  goals: CampaignGoal[];
  creativeAssets?: CreativeAsset[];
  attribution: AttributionSettings;
  results?: CampaignResults;
  createdAt: Date;
  createdBy: string;
}

export enum CampaignType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  SOCIAL = 'social',
  DISPLAY = 'display',
  SEARCH = 'search',
  MULTI_CHANNEL = 'multi_channel',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface TargetAudience {
  segments: string[];
  filters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
  estimatedReach: number;
  excludeSegments?: string[];
}

export interface CampaignChannel {
  channel: string;
  enabled: boolean;
  settings: Record<string, any>;
  budget?: number;
  schedule?: {
    days?: string[];
    hours?: number[];
    timezone?: string;
  };
}

export interface CampaignGoal {
  metric: string;
  target: number;
  current?: number;
  percentage?: number;
}

export interface CreativeAsset {
  id: string;
  type: 'image' | 'video' | 'text' | 'html';
  name: string;
  url?: string;
  content?: string;
  variations?: Array<{
    id: string;
    name: string;
    content: any;
    performance?: {
      impressions: number;
      clicks: number;
      conversions: number;
    };
  }>;
}

export interface AttributionSettings {
  model: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven';
  lookbackWindow: number; // days
  includedChannels: string[];
  excludedChannels?: string[];
}

export interface CampaignResults {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
  ctr: number; // Click-through rate
  conversionRate: number;
  costPerAcquisition: number;
  byChannel: Record<string, ChannelPerformance>;
  byDay: Array<{
    date: Date;
    metrics: Record<string, number>;
  }>;
}

export interface ChannelPerformance {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
}

export interface UTMParameters {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
}

export interface TouchPoint {
  customerId?: string;
  timestamp: Date;
  channel: string;
  campaign?: string;
  action: string;
  value?: number;
  attributes?: Record<string, any>;
}

export interface AttributionPath {
  customerId: string;
  conversionId: string;
  revenue: number;
  touchpoints: TouchPoint[];
  attribution: Array<{
    touchpointIndex: number;
    credit: number;
    revenue: number;
  }>;
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/analytics-engine/analytics-engine.ts
```typescript
import { getRedis } from '../config/redis';
import CacheManager from '../config/redis-cache-strategies';
import { logger } from '../utils/logger';

export interface TimeRange {
  start: Date;
  end: Date;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface AnalyticsQuery {
  venueId: string;
  metrics: string[];
  timeRange: TimeRange;
  filters?: Record<string, any>;
  groupBy?: string[];
}

export class AnalyticsEngine {
  private cache!: CacheManager;

  constructor() {
    // Cache will be initialized when needed
  }

  // Main query method
  async query(query: AnalyticsQuery): Promise<any> {
    if (!this.cache) this.cache = new CacheManager(getRedis());
    const cacheKey = this.generateCacheKey(query);

    // Try cache first
    const cached = await this.cache.get('analyticsQuery', cacheKey);
    if (cached) return cached;

    // Execute query based on metrics requested
    const results = await this.executeQuery(query);

    // Cache results
    await this.cache.set('analyticsQuery', cacheKey, results, 300); // 5 min cache

    return results;
  }

  private async executeQuery(query: AnalyticsQuery) {
    const results: Record<string, any> = {};

    for (const metric of query.metrics) {
      switch (metric) {
        case 'revenue':
          results.revenue = await this.calculateRevenue(query);
          break;
        case 'ticketSales':
          results.ticketSales = await this.calculateTicketSales(query);
          break;
        case 'conversionRate':
          results.conversionRate = await this.calculateConversionRate(query);
          break;
        case 'customerMetrics':
          results.customerMetrics = await this.calculateCustomerMetrics(query);
          break;
        case 'topEvents':
          results.topEvents = await this.getTopEvents(query);
          break;
        case 'salesTrends':
          results.salesTrends = await this.calculateSalesTrends(query);
          break;
        default:
          logger.warn(`Unknown metric requested: ${metric}`);
      }
    }

    return results;
  }

  private async calculateRevenue(query: AnalyticsQuery) {
    const { RevenueCalculator } = await import('./calculators/revenue-calculator');
    const calculator = new RevenueCalculator();
    
    const [byChannel, byEventType] = await Promise.all([
      calculator.calculateRevenueByChannel(query.venueId, query.timeRange.start, query.timeRange.end),
      calculator.calculateRevenueByEventType(query.venueId, query.timeRange.start, query.timeRange.end)
    ]);

    return { byChannel, byEventType };
  }

  private async calculateTicketSales(query: AnalyticsQuery) {
    const { MetricsAggregator } = await import('./aggregators/metrics-aggregator');
    const aggregator = new MetricsAggregator();
    
    return aggregator.aggregateSalesMetrics({
      venueId: query.venueId,
      startDate: query.timeRange.start,
      endDate: query.timeRange.end,
      granularity: query.timeRange.granularity || 'day'
    });
  }

  private async calculateConversionRate(query: AnalyticsQuery) {
    // Get page views from Redis
    const redis = getRedis();
    const dates = this.getDateRange(query.timeRange.start, query.timeRange.end);
    
    const conversionData = await Promise.all(dates.map(async (date: Date) => {
      const dateStr = date.toISOString().split('T')[0];
      const trafficKey = `metrics:traffic:${query.venueId}:${dateStr}`;
      const purchaseKey = `metrics:purchase:${query.venueId}:${dateStr}`;
      
      const [traffic, purchase] = await Promise.all([
        redis.hget(trafficKey, 'page_views'),
        redis.hget(purchaseKey, 'total_sales')
      ]);
      
      const views = parseInt(traffic || '0');
      const sales = parseInt(purchase || '0');
      
      return {
        date: dateStr,
        pageViews: views,
        conversions: sales,
        rate: views > 0 ? (sales / views * 100).toFixed(2) : '0.00'
      };
    }));
    
    return conversionData;
  }

  private async calculateCustomerMetrics(query: AnalyticsQuery) {
    const { CustomerAnalytics } = await import('./calculators/customer-analytics');
    const analytics = new CustomerAnalytics();
    
    const [clv, churnRisk, segmentation] = await Promise.all([
      analytics.calculateCustomerLifetimeValue(query.venueId),
      analytics.identifyChurnRisk(query.venueId),
      analytics.calculateCustomerSegmentation(query.venueId)
    ]);
    
    return { clv, churnRisk, segmentation };
  }

  private async getTopEvents(query: AnalyticsQuery) {
    const { MetricsAggregator } = await import('./aggregators/metrics-aggregator');
    const aggregator = new MetricsAggregator();
    
    return aggregator.aggregateEventPerformance(
      query.venueId,
      query.timeRange.start,
      query.timeRange.end
    );
  }

  private async calculateSalesTrends(query: AnalyticsQuery) {
    const { PredictiveAnalytics } = await import('./calculators/predictive-analytics');
    const predictor = new PredictiveAnalytics();
    
    const [seasonal, pricing] = await Promise.all([
      predictor.predictSeasonalTrends(query.venueId),
      predictor.predictOptimalPricing(query.venueId, 'concert') // Default to concert
    ]);
    
    return { seasonal, pricing };
  }

  private generateCacheKey(query: AnalyticsQuery): string {
    return `${query.venueId}:${query.metrics.join(',')}:${query.timeRange.start.toISOString()}:${query.timeRange.end.toISOString()}`;
  }

  private getDateRange(start: Date, end: Date): Date[] {
    const dates = [];
    const current = new Date(start);
    
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }
}

export const analyticsEngine = new AnalyticsEngine();
```

### FILE: src/analytics-engine/aggregators/metrics-aggregator.ts
```typescript
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

    // SECURITY FIX: Validate and whitelist granularity
    const validGranularities = ['hour', 'day', 'week', 'month'];
    if (!validGranularities.includes(granularity)) {
      throw new Error(`Invalid granularity: ${granularity}. Must be one of: ${validGranularities.join(', ')}`);
    }

    // Define date truncation based on granularity - now safe because granularity is validated
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
    // SECURITY: This is now safe because granularity is validated in aggregateSalesMetrics
    // But we'll still use a whitelist approach for defense in depth
    const expressions: Record<string, string> = {
      'hour': "DATE_TRUNC('hour', tickets.created_at)",
      'week': "DATE_TRUNC('week', tickets.created_at)",
      'month': "DATE_TRUNC('month', tickets.created_at)",
      'day': "DATE_TRUNC('day', tickets.created_at)"
    };
    
    return expressions[granularity] || expressions['day'];
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
```

### FILE: src/analytics-engine/calculators/customer-analytics.ts
```typescript
import { getDb } from '../../config/database';

interface CustomerData {
  user_id: string;
  purchase_count: number;
  total_revenue: string;
  first_purchase: Date;
  last_purchase: Date;
}

interface CLVData {
  customerId: string;
  totalRevenue: number;
  purchaseCount: number;
  avgOrderValue: number;
  customerLifespanDays: number;
  purchaseFrequency: number;
}

export class CustomerAnalytics {
  private mainDb = getDb();

  async calculateCustomerLifetimeValue(venueId: string) {
    const customerData = await this.mainDb('tickets')
      .select(
        'user_id',
        this.mainDb.raw('COUNT(*) as purchase_count'),
        this.mainDb.raw('SUM(price) as total_revenue'),
        this.mainDb.raw('MIN(tickets.created_at) as first_purchase'),
        this.mainDb.raw('MAX(tickets.created_at) as last_purchase')
      )
      .join('events', 'tickets.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .whereNotNull('user_id')
      .groupBy('user_id');

    // Calculate CLV metrics
    const clvData: CLVData[] = customerData.map((customer: CustomerData) => {
      const firstPurchase = new Date(customer.first_purchase);
      const lastPurchase = new Date(customer.last_purchase);
      const customerLifespan = (lastPurchase.getTime() - firstPurchase.getTime()) / (1000 * 60 * 60 * 24); // days

      return {
        customerId: customer.user_id,
        totalRevenue: parseFloat(customer.total_revenue),
        purchaseCount: customer.purchase_count,
        avgOrderValue: parseFloat(customer.total_revenue) / customer.purchase_count,
        customerLifespanDays: Math.max(1, customerLifespan),
        purchaseFrequency: customer.purchase_count / Math.max(1, customerLifespan / 30) // purchases per month
      };
    });

    // Calculate average CLV
    const avgClv = clvData.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / clvData.length;

    // Segment customers
    const segments = {
      high: clvData.filter((c: CLVData) => c.totalRevenue > avgClv * 2),
      medium: clvData.filter((c: CLVData) => c.totalRevenue > avgClv * 0.5 && c.totalRevenue <= avgClv * 2),
      low: clvData.filter((c: CLVData) => c.totalRevenue <= avgClv * 0.5)
    };

    return {
      averageClv: avgClv,
      totalCustomers: clvData.length,
      segments: {
        high: {
          count: segments.high.length,
          avgValue: segments.high.length > 0 ? segments.high.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / segments.high.length : 0
        },
        medium: {
          count: segments.medium.length,
          avgValue: segments.medium.length > 0 ? segments.medium.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / segments.medium.length : 0
        },
        low: {
          count: segments.low.length,
          avgValue: segments.low.length > 0 ? segments.low.reduce((sum: number, c: CLVData) => sum + c.totalRevenue, 0) / segments.low.length : 0
        }
      }
    };
  }

  async identifyChurnRisk(venueId: string, daysThreshold: number = 90) {
    const now = new Date();
    const thresholdDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);

    // Find customers who haven't purchased recently
    const atRiskCustomers = await this.mainDb('tickets')
      .select(
        'user_id',
        this.mainDb.raw('MAX(tickets.created_at) as last_purchase'),
        this.mainDb.raw('COUNT(*) as total_purchases'),
        this.mainDb.raw('AVG(price) as avg_order_value')
      )
      .join('events', 'tickets.event_id', 'events.id')
      .where('events.venue_id', venueId)
      .whereNotNull('user_id')
      .groupBy('user_id')
      .havingRaw('MAX(tickets.created_at) < ?', [thresholdDate])
      .orderBy('total_purchases', 'desc');

    // Calculate churn risk score
    const enrichedCustomers = atRiskCustomers.map((customer: any) => {
      const daysSinceLastPurchase = Math.floor((now.getTime() - new Date(customer.last_purchase).getTime()) / (1000 * 60 * 60 * 24));
      
      // Simple scoring: higher score = higher risk
      let riskScore = Math.min(100, (daysSinceLastPurchase / daysThreshold) * 50);
      
      // Adjust based on purchase history
      if (customer.total_purchases > 5) riskScore -= 10;
      if (customer.total_purchases > 10) riskScore -= 10;
      if (parseFloat(customer.avg_order_value) > 100) riskScore -= 5;
      
      return {
        customerId: customer.user_id,
        lastPurchase: customer.last_purchase,
        daysSinceLastPurchase,
        totalPurchases: customer.total_purchases,
        avgOrderValue: parseFloat(customer.avg_order_value),
        riskScore: Math.max(0, Math.min(100, riskScore))
      };
    });

    return {
      totalAtRisk: enrichedCustomers.length,
      highRisk: enrichedCustomers.filter((c: any) => c.riskScore > 70),
      mediumRisk: enrichedCustomers.filter((c: any) => c.riskScore > 40 && c.riskScore <= 70),
      lowRisk: enrichedCustomers.filter((c: any) => c.riskScore <= 40)
    };
  }

  async calculateCustomerSegmentation(venueId: string) {
    // RFM Analysis (Recency, Frequency, Monetary)
    const customers = await this.mainDb.raw(`
      WITH customer_metrics AS (
        SELECT 
          t.user_id,
          MAX(t.created_at) as last_purchase,
          COUNT(*) as purchase_frequency,
          SUM(t.price) as monetary_value,
          CURRENT_DATE - MAX(t.created_at::date) as recency_days
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE e.venue_id = ? AND t.user_id IS NOT NULL
        GROUP BY t.user_id
      ),
      rfm_scores AS (
        SELECT 
          user_id,
          recency_days,
          purchase_frequency,
          monetary_value,
          NTILE(5) OVER (ORDER BY recency_days DESC) as recency_score,
          NTILE(5) OVER (ORDER BY purchase_frequency) as frequency_score,
          NTILE(5) OVER (ORDER BY monetary_value) as monetary_score
        FROM customer_metrics
      )
      SELECT 
        *,
        CONCAT(recency_score, frequency_score, monetary_score) as rfm_segment
      FROM rfm_scores
    `, [venueId]);

    // Categorize segments
    const segments = {
      champions: customers.rows.filter((c: any) => c.rfm_segment.match(/[45][45][45]/)),
      loyalCustomers: customers.rows.filter((c: any) => c.rfm_segment.match(/[345][45][345]/)),
      potentialLoyalists: customers.rows.filter((c: any) => c.rfm_segment.match(/[45][23][345]/)),
      newCustomers: customers.rows.filter((c: any) => c.rfm_segment.match(/[45][12][12]/)),
      atRisk: customers.rows.filter((c: any) => c.rfm_segment.match(/[12][45][45]/)),
      cantLose: customers.rows.filter((c: any) => c.rfm_segment.match(/[12][45][45]/)),
      hibernating: customers.rows.filter((c: any) => c.rfm_segment.match(/[12][12][12]/))
    };

    return Object.entries(segments).map(([name, customers]) => ({
      segment: name,
      count: customers.length,
      avgValue: customers.length > 0 ? customers.reduce((sum: number, c: any) => sum + parseFloat(c.monetary_value), 0) / customers.length : 0,
      characteristics: this.getSegmentCharacteristics(name)
    }));
  }

  private getSegmentCharacteristics(segment: string) {
    const characteristics: Record<string, string> = {
      champions: 'Best customers - recent, frequent, high spenders',
      loyalCustomers: 'Spend good money, responsive to promotions',
      potentialLoyalists: 'Recent customers with average frequency',
      newCustomers: 'Recently acquired, need nurturing',
      atRisk: 'Were great customers, but slipping away',
      cantLose: 'Were champions, now at risk of churning',
      hibernating: 'Low engagement, may be lost'
    };
    
    return characteristics[segment] || 'Unknown segment';
  }
}
```

### FILE: src/config/dependencies.ts
```typescript
// This file will be used to manage service dependencies and dependency injection
// For now, it's a placeholder for future dependency injection setup

export interface Dependencies {
  // Services
  metricsService?: any;
  aggregationService?: any;
  customerIntelService?: any;
  predictionService?: any;
  messageGatewayService?: any;
  attributionService?: any;
  exportService?: any;
  alertService?: any;
  anonymizationService?: any;
  websocketService?: any;
}

const dependencies: Dependencies = {};

export function setDependency(key: keyof Dependencies, value: any) {
  dependencies[key] = value;
}

export function getDependency(key: keyof Dependencies) {
  return dependencies[key];
}

export function getAllDependencies(): Dependencies {
  return dependencies;
}
```

### FILE: src/config/redis-cache-strategies.ts
```typescript
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface CacheStrategy {
  ttl: number; // Time to live in seconds
  keyPrefix: string;
  version: number; // For cache invalidation
}

// Define caching strategies for different data types
export const cacheStrategies: Record<string, CacheStrategy> = {
  // Real-time metrics - very short TTL
  realTimeMetrics: {
    ttl: 5, // 5 seconds
    keyPrefix: 'rtm',
    version: 1
  },
  
  // Aggregated metrics - medium TTL
  aggregatedMetrics: {
    ttl: 300, // 5 minutes
    keyPrefix: 'agg',
    version: 1
  },
  
  // Customer profiles - longer TTL
  customerProfile: {
    ttl: 3600, // 1 hour
    keyPrefix: 'cust',
    version: 1
  },
  
  // Dashboard configs - long TTL
  dashboardConfig: {
    ttl: 86400, // 24 hours
    keyPrefix: 'dash',
    version: 1
  },
  
  // Widget data - varies by widget
  widgetData: {
    ttl: 60, // 1 minute default
    keyPrefix: 'widget',
    version: 1
  },
  
  // Session data - medium TTL
  sessionData: {
    ttl: 1800, // 30 minutes
    keyPrefix: 'sess',
    version: 1
  }
};

export class CacheManager {
  private redis: Redis;
  private prefix: string;
  
  constructor(redis: Redis, prefix: string = 'analytics') {
    this.redis = redis;
    this.prefix = prefix;
  }
  
  // Generate cache key with versioning
  private generateKey(strategy: CacheStrategy, identifier: string): string {
    return `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${identifier}`;
  }
  
  // Set cache with strategy
  async set(
    strategyName: string,
    identifier: string,
    data: any,
    customTTL?: number
  ): Promise<void> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      logger.warn(`Unknown cache strategy: ${strategyName}`);
      return;
    }
    
    const key = this.generateKey(strategy, identifier);
    const ttl = customTTL || strategy.ttl;
    
    try {
      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(data)
      );
      
      logger.debug(`Cached ${strategyName} for ${identifier} with TTL ${ttl}s`);
    } catch (error) {
      logger.error(`Cache set error for ${strategyName}:`, error);
    }
  }
  
  // Get from cache
  async get(strategyName: string, identifier: string): Promise<any | null> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return null;
    }
    
    const key = this.generateKey(strategy, identifier);
    
    try {
      const data = await this.redis.get(key);
      if (data) {
        logger.debug(`Cache hit for ${strategyName}: ${identifier}`);
        return JSON.parse(data);
      }
      logger.debug(`Cache miss for ${strategyName}: ${identifier}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error for ${strategyName}:`, error);
      return null;
    }
  }
  
  // Invalidate cache by pattern
  async invalidate(strategyName: string, pattern?: string): Promise<void> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return;
    }
    
    const keyPattern = pattern
      ? `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${pattern}*`
      : `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:*`;
    
    try {
      const keys = await this.redis.keys(keyPattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Invalidated ${keys.length} cache entries for ${strategyName}`);
      }
    } catch (error) {
      logger.error(`Cache invalidation error for ${strategyName}:`, error);
    }
  }
  
  // Implement cache-aside pattern
  async getOrSet<T>(
    strategyName: string,
    identifier: string,
    fetchFunction: () => Promise<T>,
    customTTL?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get(strategyName, identifier);
    if (cached !== null) {
      return cached;
    }
    
    // Fetch fresh data
    const data = await fetchFunction();
    
    // Cache the result
    await this.set(strategyName, identifier, data, customTTL);
    
    return data;
  }
  
  // Batch get with multi-get optimization
  async mget(strategyName: string, identifiers: string[]): Promise<Map<string, any>> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return new Map();
    }
    
    const keys = identifiers.map(id => this.generateKey(strategy, id));
    const results = new Map<string, any>();
    
    try {
      const values = await this.redis.mget(...keys);
      
      identifiers.forEach((id, index) => {
        const value = values[index];
        if (value) {
          try {
            results.set(id, JSON.parse(value));
          } catch (e) {
            logger.error(`Failed to parse cached value for ${id}:`, e);
          }
        }
      });
      
      logger.debug(`Cache multi-get: ${results.size}/${identifiers.length} hits`);
    } catch (error) {
      logger.error(`Cache mget error for ${strategyName}:`, error);
    }
    
    return results;
  }
  
  // Get cache statistics
  async getStats(): Promise<Record<string, any>> {
    const info = await this.redis.info('stats');
    const dbSize = await this.redis.dbsize();
    
    return {
      dbSize,
      info: info.split('\n').reduce((acc, line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>)
    };
  }
}

export default CacheManager;
```

### FILE: src/controllers/analytics.controller.ts
```typescript
// import { serviceCache } from '../services/cache-integration'; // TODO: Remove if not needed
import { Request, Response, NextFunction } from 'express';
import { analyticsEngine } from '../analytics-engine/analytics-engine';
import { getRedis } from '../config/redis';

interface AuthenticatedRequest extends Request {
  venue?: { id: string; name: string };
}

class AnalyticsController {
  async getRevenueSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.revenue
      });
    } catch (error) {
      next(error);
    }
  }

  async getRevenueByChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.revenue?.byChannel || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getRevenueProjections(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      const venueId = req.venue!.id;

      // Import revenue calculator directly for projections
      const { RevenueCalculator } = await import('../analytics-engine/calculators/revenue-calculator');
      const calculator = new RevenueCalculator();
      
      const projections = await calculator.projectRevenue(venueId, Number(days));

      res.json({
        success: true,
        data: projections
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerLifetimeValue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.clv || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerSegments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.segmentation || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getChurnRiskAnalysis(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.churnRisk || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, granularity = 'day' } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['ticketSales'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string),
          granularity: granularity as 'hour' | 'day' | 'week' | 'month'
        }
      });

      res.json({
        success: true,
        data: result.ticketSales || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesTrends(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['salesTrends'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.salesTrends || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getEventPerformance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.topEvents || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getTopPerformingEvents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, limit = 10 } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      const topEvents = (result.topEvents || []).slice(0, Number(limit));

      res.json({
        success: true,
        data: topEvents
      });
    } catch (error) {
      next(error);
    }
  }

  async getRealtimeSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;
      const redis = getRedis();
      
      const today = new Date().toISOString().split('T')[0];
      const purchaseKey = `metrics:purchase:${venueId}:${today}`;
      const trafficKey = `metrics:traffic:${venueId}:${today}`;
      
      const [purchases, traffic] = await Promise.all([
        redis.hgetall(purchaseKey),
        redis.hgetall(trafficKey)
      ]);

      res.json({
        success: true,
        data: {
          timestamp: new Date(),
          sales: {
            count: parseInt(purchases.total_sales || '0'),
            revenue: parseFloat(purchases.revenue || '0')
          },
          traffic: {
            pageViews: parseInt(traffic.page_views || '0')
          },
          conversionRate: traffic.page_views ? 
            ((parseInt(purchases.total_sales || '0') / parseInt(traffic.page_views)) * 100).toFixed(2) : '0.00'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getConversionFunnel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['conversionRate'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.conversionRate || []
      });
    } catch (error) {
      next(error);
    }
  }

  async executeCustomQuery(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { metrics, timeRange, filters, groupBy } = req.body;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics,
        timeRange: {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end),
          granularity: timeRange.granularity
        },
        filters,
        groupBy
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboardData(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { period = '7d' } = req.query;
      const venueId = req.venue!.id;

      // Calculate date range based on period
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Fetch multiple metrics in parallel
      const [revenueResult, salesResult, customerResult, eventsResult] = await Promise.all([
        analyticsEngine.query({
          venueId,
          metrics: ['revenue'],
          timeRange: { start: startDate, end: endDate }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['ticketSales'],
          timeRange: { 
            start: startDate, 
            end: endDate,
            granularity: period === '24h' ? 'hour' : 'day'
          }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['customerMetrics'],
          timeRange: { start: startDate, end: endDate }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['topEvents'],
          timeRange: { start: startDate, end: endDate }
        })
      ]);

      // Get real-time metrics
      const redis = getRedis();
      const today = new Date().toISOString().split('T')[0];
      const [todayPurchases, todayTraffic] = await Promise.all([
        redis.hgetall(`metrics:purchase:${venueId}:${today}`),
        redis.hgetall(`metrics:traffic:${venueId}:${today}`)
      ]);

      res.json({
        success: true,
        data: {
          period,
          summary: {
            totalRevenue: revenueResult.revenue?.byChannel?.total || 0,
            totalTicketsSold: salesResult.ticketSales?.reduce((sum: number, day: any) => sum + day.ticketsSold, 0) || 0,
            uniqueCustomers: customerResult.customerMetrics?.clv?.totalCustomers || 0,
            topEvent: eventsResult.topEvents?.[0] || null
          },
          realtime: {
            todayRevenue: parseFloat(todayPurchases.revenue || '0'),
            todaySales: parseInt(todayPurchases.total_sales || '0'),
            currentTraffic: parseInt(todayTraffic.page_views || '0')
          },
          charts: {
            revenue: revenueResult.revenue,
            sales: salesResult.ticketSales,
            customerSegments: customerResult.customerMetrics?.segmentation
          },
          topEvents: eventsResult.topEvents?.slice(0, 5)
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
```

### FILE: src/models/mongodb/user-behavior.schema.ts
```typescript
import { getMongoDB } from '../../config/mongodb';
import { v4 as uuidv4 } from 'uuid';

export interface UserBehavior {
  id: string;
  venueId: string;
  userId: string; // Hashed user ID
  sessionId: string;
  timestamp: Date;
  eventType: string;
  pageUrl?: string;
  referrer?: string;
  deviceInfo?: {
    type: string;
    os: string;
    browser: string;
    userAgent: string;
  };
  geoInfo?: {
    country: string;
    region: string;
    city: string;
  };
  properties?: Record<string, any>;
  duration?: number;
}

export class UserBehaviorSchema {
  private static collectionName = 'user_behavior';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<UserBehavior>(this.collectionName);
  }
  
  static async trackBehavior(behavior: Omit<UserBehavior, 'id'>): Promise<UserBehavior> {
    const collection = this.getCollection();
    const behaviorWithId = {
      id: uuidv4(),
      ...behavior,
      timestamp: new Date()
    };
    
    await collection.insertOne(behaviorWithId);
    return behaviorWithId;
  }
  
  static async getUserJourney(
    venueId: string,
    userId: string,
    limit: number = 100
  ): Promise<UserBehavior[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({ venueId, userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
  
  static async getSessionActivity(
    sessionId: string
  ): Promise<UserBehavior[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray();
  }
  
  static async aggregateUserBehavior(
    venueId: string,
    pipeline: any[]
  ): Promise<any[]> {
    const collection = this.getCollection();
    
    const fullPipeline = [
      { $match: { venueId } },
      ...pipeline
    ];
    
    return await collection.aggregate(fullPipeline).toArray();
  }
  
  static async getPageViews(
    venueId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ _id: string; views: number; uniqueUsers: number }>> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      {
        $group: {
          _id: '$pageUrl',
          views: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 1,
          views: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { views: -1 } }
    );
    
    return await this.aggregateUserBehavior(venueId, pipeline);
  }
  
  static async getDeviceStats(
    venueId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      {
        $group: {
          _id: {
            type: '$deviceInfo.type',
            os: '$deviceInfo.os',
            browser: '$deviceInfo.browser'
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 1,
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { count: -1 } }
    );
    
    return await this.aggregateUserBehavior(venueId, pipeline);
  }
}
```

### FILE: src/models/mongodb/raw-analytics.schema.ts
```typescript
import { getMongoDB } from '../../config/mongodb';
import { v4 as uuidv4 } from 'uuid';

export interface RawAnalyticsData {
  id: string;
  venueId: string;
  dataType: string;
  source: string;
  timestamp: Date;
  data: any;
  processed: boolean;
  processingAttempts: number;
  lastProcessingError?: string;
  metadata?: Record<string, any>;
}

export class RawAnalyticsSchema {
  private static collectionName = 'raw_analytics';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<RawAnalyticsData>(this.collectionName);
  }
  
  static async storeRawData(data: Omit<RawAnalyticsData, 'id'>): Promise<RawAnalyticsData> {
    const collection = this.getCollection();
    const rawData = {
      id: uuidv4(),
      ...data,
      timestamp: new Date(),
      processed: false,
      processingAttempts: 0
    };
    
    await collection.insertOne(rawData);
    return rawData;
  }
  
  static async bulkStoreRawData(dataArray: Omit<RawAnalyticsData, 'id'>[]): Promise<void> {
    const collection = this.getCollection();
    const rawDataWithIds = dataArray.map(data => ({
      id: uuidv4(),
      ...data,
      timestamp: new Date(),
      processed: false,
      processingAttempts: 0
    }));
    
    await collection.insertMany(rawDataWithIds);
  }
  
  static async getUnprocessedData(
    limit: number = 100,
    maxAttempts: number = 3
  ): Promise<RawAnalyticsData[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({
        processed: false,
        processingAttempts: { $lt: maxAttempts }
      })
      .sort({ timestamp: 1 })
      .limit(limit)
      .toArray();
  }
  
  static async markAsProcessed(
    id: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    const collection = this.getCollection();
    
    const update: any = {
      $inc: { processingAttempts: 1 }
    };
    
    if (success) {
      update.$set = { processed: true };
    } else {
      update.$set = { lastProcessingError: error };
    }
    
    await collection.updateOne({ id }, update);
  }
  
  static async getRawDataByType(
    venueId: string,
    dataType: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<RawAnalyticsData[]> {
    const collection = this.getCollection();
    const query: any = { venueId, dataType };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }
    
    return await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
  
  static async cleanupOldData(
    retentionDays: number
  ): Promise<number> {
    const collection = this.getCollection();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await collection.deleteMany({
      timestamp: { $lt: cutoffDate },
      processed: true
    });
    
    return result.deletedCount || 0;
  }
  
  static async getDataStats(
    venueId: string
  ): Promise<any> {
    const collection = this.getCollection();
    
    const pipeline = [
      { $match: { venueId } },
      {
        $group: {
          _id: {
            dataType: '$dataType',
            source: '$source',
            processed: '$processed'
          },
          count: { $sum: 1 },
          oldestRecord: { $min: '$timestamp' },
          newestRecord: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ];
    
    return await collection.aggregate(pipeline).toArray();
  }
}
```

### FILE: src/models/postgres/dashboard.model.ts
```typescript
import { BaseModel } from './base.model';
import { Dashboard } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class DashboardModel extends BaseModel {
  protected static tableName = 'analytics_dashboards';
  
  static async createDashboard(
    data: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Dashboard> {
    const dashboard = {
      id: uuidv4(),
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(dashboard);
  }
  
  static async getDashboardsByVenue(
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orWhere('is_public', true)
      .orderBy('name', 'asc');
  }
  
  static async getDashboardsForUser(
    userId: string,
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .andWhere((builder: any) => {
        builder.where('owner_id', userId)
          .orWhere('is_public', true)
          .orWhereRaw(`permissions->'sharedWith' @> '[{"userId": "${userId}"}]'`);
      })
      .orderBy('name', 'asc');
  }
  
  static async updateDashboard(
    id: string,
    data: Partial<Dashboard>
  ): Promise<Dashboard> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async duplicateDashboard(
    dashboardId: string,
    newName: string,
    userId: string
  ): Promise<Dashboard> {
    const original = await this.findById(dashboardId);
    
    if (!original) {
      throw new Error('Dashboard not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      name: newName,
      isDefault: false,
      permissions: {
        ownerId: userId,
        public: false,
        sharedWith: []
      },
      created_at: new Date(),
      updated_at: new Date(),
      created_by: userId,
      updated_by: userId
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async shareDashboard(
    dashboardId: string,
    shareWith: Array<{
      userId?: string;
      roleId?: string;
      permission: 'view' | 'edit' | 'admin';
    }>
  ): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId);
    
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }
    
    const permissions = dashboard.permissions;
    permissions.sharedWith = [
      ...permissions.sharedWith,
      ...shareWith
    ];
    
    return await this.update(dashboardId, { permissions });
  }
  
  static async getDefaultDashboard(
    venueId: string
  ): Promise<Dashboard | null> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('is_default', true)
      .first();
  }
}
```

### FILE: src/models/postgres/metric.model.ts
```typescript
import { BaseModel } from './base.model';
import { Metric, MetricType, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class MetricModel extends BaseModel {
  protected static tableName = 'analytics_metrics';

  static async createMetric(data: Omit<Metric, 'id'>): Promise<Metric> {
    const metric = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    return await this.create(metric);
  }

  static async getMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    const db = this.db();
    let query = db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .orderBy('timestamp', 'asc');

    if (granularity) {
      query = query.where('granularity', granularity);
    }

    return await query;
  }

  static async aggregateMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    const db = this.db();
    
    // SECURITY FIX: Whitelist aggregation functions
    const validAggregations: Record<string, string> = {
      'sum': 'SUM',
      'avg': 'AVG',
      'min': 'MIN',
      'max': 'MAX',
      'count': 'COUNT'
    };
    
    const aggFunction = validAggregations[aggregation];
    if (!aggFunction) {
      throw new Error(`Invalid aggregation function: ${aggregation}. Must be one of: ${Object.keys(validAggregations).join(', ')}`);
    }
    
    // Now safe to use the whitelisted aggregation function
    const result = await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .select(db.raw(`${aggFunction}(value) as result`))
      .first();

    return result?.result || 0;
  }

  static async getLatestMetric(
    venueId: string,
    metricType: MetricType
  ): Promise<Metric | null> {
    const db = this.db();
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .orderBy('timestamp', 'desc')
      .first();
  }

  static async bulkInsert(metrics: Omit<Metric, 'id'>[]): Promise<void> {
    const db = this.db();
    const metricsWithIds = metrics.map(metric => ({
      id: uuidv4(),
      ...metric,
      created_at: new Date()
    }));
    await db(this.tableName).insert(metricsWithIds);
  }

  static async deleteOldMetrics(
    retentionDays: number
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    return await db(this.tableName)
      .where('timestamp', '<', cutoffDate)
      .delete();
  }
}
```

### FILE: src/models/postgres/aggregation.model.ts
```typescript
import { BaseModel } from './base.model';
import { MetricAggregation, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AggregationModel extends BaseModel {
  protected static tableName = 'analytics_aggregations';
  
  static async createAggregation(
    venueId: string,
    data: MetricAggregation
  ): Promise<MetricAggregation> {
    const aggregation = {
      id: uuidv4(),
      venue_id: venueId,
      metric_type: data.metricType,
      period_start: data.period.startDate,
      period_end: data.period.endDate,
      granularity: JSON.stringify(data.granularity),
      data: JSON.stringify(data.data),
      summary: JSON.stringify(data.summary),
      created_at: new Date()
    };
    
    return await this.create(aggregation);
  }
  
  static async getAggregations(
    venueId: string,
    filters: {
      metricType?: string;
      granularity?: TimeGranularity;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<MetricAggregation[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (filters.metricType) {
      query = query.where('metric_type', filters.metricType);
    }
    
    if (filters.granularity) {
      query = query.where('granularity', JSON.stringify(filters.granularity));
    }
    
    if (filters.startDate && filters.endDate) {
      query = query.whereBetween('period_start', [
        filters.startDate,
        filters.endDate
      ]);
    }
    
    const results = await query.orderBy('period_start', 'asc');
    
    // Transform back to proper format
    return results.map((row: any) => ({
      metricType: row.metric_type,
      period: {
        startDate: row.period_start,
        endDate: row.period_end
      },
      granularity: JSON.parse(row.granularity),
      data: JSON.parse(row.data),
      summary: JSON.parse(row.summary)
    }));
  }
  
  static async upsertAggregation(
    venueId: string,
    aggregation: MetricAggregation
  ): Promise<MetricAggregation> {
    const db = this.db();
    
    const existing = await db(this.tableName)
      .where({
        venue_id: venueId,
        metric_type: aggregation.metricType,
        period_start: aggregation.period.startDate,
        period_end: aggregation.period.endDate,
        granularity: JSON.stringify(aggregation.granularity)
      })
      .first();
    
    if (existing) {
      return await this.update(existing.id, {
        data: JSON.stringify(aggregation.data),
        summary: JSON.stringify(aggregation.summary),
        updated_at: new Date()
      });
    } else {
      return await this.createAggregation(venueId, aggregation);
    }
  }
  
  static async getHourlyAggregations(
    venueId: string,
    date: Date
  ): Promise<MetricAggregation[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await this.getAggregations(venueId, {
      granularity: { unit: 'hour', value: 1 },
      startDate: startOfDay,
      endDate: endOfDay
    });
  }
  
  static async getDailyAggregations(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MetricAggregation[]> {
    return await this.getAggregations(venueId, {
      granularity: { unit: 'day', value: 1 },
      startDate,
      endDate
    });
  }
}
```

### FILE: src/models/postgres/widget.model.ts
```typescript
import { BaseModel } from './base.model';
import { WidgetConfig, WidgetData } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class WidgetModel extends BaseModel {
  protected static tableName = 'analytics_widgets';
  
  static async createWidget(
    data: Omit<WidgetConfig, 'id'>
  ): Promise<WidgetConfig> {
    const widget = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    
    return await this.create(widget);
  }
  
  static async getWidgetsByDashboard(
    dashboardId: string
  ): Promise<WidgetConfig[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('dashboard_id', dashboardId)
      .orderBy('position_y', 'asc')
      .orderBy('position_x', 'asc');
  }
  
  static async updateWidget(
    id: string,
    data: Partial<WidgetConfig>
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetPosition(
    id: string,
    position: { x: number; y: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      position,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetSize(
    id: string,
    size: { width: number; height: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      size,
      updated_at: new Date()
    });
  }
  
  static async duplicateWidget(
    widgetId: string
  ): Promise<WidgetConfig> {
    const original = await this.findById(widgetId);
    
    if (!original) {
      throw new Error('Widget not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      title: `${original.title} (Copy)`,
      position: {
        x: original.position.x + 1,
        y: original.position.y + 1
      },
      created_at: new Date()
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async getWidgetData(
    widgetId: string,
    limit: number = 1
  ): Promise<WidgetData[]> {
    const db = this.db();
    
    return await db('analytics_widget_data')
      .where('widget_id', widgetId)
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }
  
  static async saveWidgetData(
    widgetId: string,
    data: any
  ): Promise<void> {
    const db = this.db();
    
    await db('analytics_widget_data').insert({
      id: uuidv4(),
      widget_id: widgetId,
      data,
      timestamp: new Date()
    });
  }
}
```

### FILE: src/models/postgres/alert.model.ts
```typescript
import { BaseModel } from './base.model';
import { Alert, AlertInstance, AlertStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AlertModel extends BaseModel {
  protected static tableName = 'analytics_alerts';
  
  static async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    const alert = {
      id: uuidv4(),
      ...data,
      trigger_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(alert);
  }
  
  static async getAlertsByVenue(
    venueId: string,
    enabled?: boolean
  ): Promise<Alert[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (enabled !== undefined) {
      query = query.where('enabled', enabled);
    }
    
    return await query.orderBy('severity', 'desc');
  }
  
  static async updateAlert(
    id: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async toggleAlert(
    id: string,
    enabled: boolean
  ): Promise<Alert> {
    return await this.updateAlert(id, { enabled });
  }
  
  static async incrementTriggerCount(
    id: string
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .increment('trigger_count', 1)
      .update({
        last_triggered: new Date(),
        status: AlertStatus.TRIGGERED
      });
  }
  
  static async createAlertInstance(
    data: Omit<AlertInstance, 'id'>
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const instance = {
      id: uuidv4(),
      ...data,
      status: 'active'
    };
    
    const [result] = await db('analytics_alert_instances')
      .insert(instance)
      .returning('*');
    
    return result;
  }
  
  static async getAlertInstances(
    alertId: string,
    limit: number = 50
  ): Promise<AlertInstance[]> {
    const db = this.db();
    
    return await db('analytics_alert_instances')
      .where('alert_id', alertId)
      .orderBy('triggered_at', 'desc')
      .limit(limit);
  }
  
  static async acknowledgeAlertInstance(
    instanceId: string,
    userId: string,
    notes?: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'acknowledged',
        acknowledged_by: userId,
        notes,
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
  
  static async resolveAlertInstance(
    instanceId: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'resolved',
        resolved_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
}
```

### FILE: src/models/postgres/base.model.ts
```typescript
import { getDb } from '../../config/database';
import { logger } from '../../utils/logger';

export abstract class BaseModel {
  protected static tableName: string;
  protected static db = getDb;
  
  protected static async query(sql: string, params?: any[]): Promise<any> {
    try {
      const db = this.db();
      return await db.raw(sql, params);
    } catch (error) {
      logger.error(`Query error in ${this.tableName}:`, error);
      throw error;
    }
  }
  
  protected static async transaction<T>(
    callback: (trx: any) => Promise<T>
  ): Promise<T> {
    const db = this.db();
    return await db.transaction(callback);
  }
  
  static async findById(id: string): Promise<any> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .first();
    return result;
  }
  
  static async findAll(
    filters: Record<string, any> = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: 'asc' | 'desc';
    } = {}
  ): Promise<any[]> {
    const db = this.db();
    let query = db(this.tableName).where(filters);
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.order || 'asc');
    }
    
    return await query;
  }
  
  static async create(data: Record<string, any>): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .insert(data)
      .returning('*');
    return result;
  }
  
  static async update(
    id: string,
    data: Record<string, any>
  ): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');
    return result;
  }
  
  static async delete(id: string): Promise<boolean> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .delete();
    return result > 0;
  }
}
```

### FILE: src/models/postgres/export.model.ts
```typescript
import { BaseModel } from './base.model';
import { ExportRequest, ExportStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class ExportModel extends BaseModel {
  protected static tableName = 'analytics_exports';
  
  static async createExport(
    data: Omit<ExportRequest, 'id' | 'createdAt'>
  ): Promise<ExportRequest> {
    const exportRequest = {
      id: uuidv4(),
      ...data,
      status: ExportStatus.PENDING,
      progress: 0,
      created_at: new Date()
    };
    
    return await this.create(exportRequest);
  }
  
  static async getExportsByVenue(
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async getExportsByUser(
    userId: string,
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('user_id', userId)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async updateExportStatus(
    id: string,
    status: ExportStatus,
    data?: {
      progress?: number;
      fileUrl?: string;
      fileSize?: number;
      error?: string;
      completedAt?: Date;
    }
  ): Promise<ExportRequest> {
    return await this.update(id, {
      status,
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateProgress(
    id: string,
    progress: number
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .update({
        progress,
        updated_at: new Date()
      });
  }
  
  static async getPendingExports(
    limit: number = 10
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('status', ExportStatus.PENDING)
      .orderBy('created_at', 'asc')
      .limit(limit);
  }
  
  static async cleanupExpiredExports(
    expirationDays: number = 7
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - expirationDays);
    
    return await db(this.tableName)
      .where('status', ExportStatus.COMPLETED)
      .where('created_at', '<', cutoffDate)
      .delete();
  }
}
```

### FILE: src/models/redis/session.model.ts
```typescript
import { getRedis } from '../../config/redis';
import { v4 as uuidv4 } from 'uuid';

export interface AnalyticsSession {
  sessionId: string;
  userId: string;
  venueId: string;
  startTime: Date;
  lastActivity: Date;
  pageViews: number;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
  metadata?: Record<string, any>;
}

export class SessionModel {
  private static redis = getRedis;
  private static SESSION_TTL = 1800; // 30 minutes
  
  static async createSession(
    userId: string,
    venueId: string,
    metadata?: Record<string, any>
  ): Promise<AnalyticsSession> {
    const redis = this.redis();
    const sessionId = uuidv4();
    const key = `session:${sessionId}`;
    
    const session: AnalyticsSession = {
      sessionId,
      userId,
      venueId,
      startTime: new Date(),
      lastActivity: new Date(),
      pageViews: 0,
      events: [],
      metadata
    };
    
    await redis.set(key, JSON.stringify(session));
    await redis.expire(key, this.SESSION_TTL);
    
    // Add to user's active sessions
    await redis.sadd(`user:sessions:${userId}`, sessionId);
    await redis.expire(`user:sessions:${userId}`, this.SESSION_TTL);
    
    return session;
  }
  
  static async getSession(
    sessionId: string
  ): Promise<AnalyticsSession | null> {
    const redis = this.redis();
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    
    return data ? JSON.parse(data) : null;
  }
  
  static async updateSession(
    sessionId: string,
    updates: Partial<AnalyticsSession>
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    const redis = this.redis();
    const key = `session:${sessionId}`;
    
    const updated = {
      ...session,
      ...updates,
      lastActivity: new Date()
    };
    
    await redis.set(key, JSON.stringify(updated));
    await redis.expire(key, this.SESSION_TTL);
  }
  
  static async trackEvent(
    sessionId: string,
    eventType: string,
    eventData?: any
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.events.push({
      type: eventType,
      timestamp: new Date(),
      data: eventData
    });
    
    await this.updateSession(sessionId, {
      events: session.events,
      pageViews: eventType === 'page_view' ? session.pageViews + 1 : session.pageViews
    });
  }
  
  static async getUserSessions(
    userId: string
  ): Promise<string[]> {
    const redis = this.redis();
    return await redis.smembers(`user:sessions:${userId}`);
  }
  
  static async getActiveSessions(
    venueId: string
  ): Promise<number> {
    const redis = this.redis();
    const pattern = `session:*`;
    const keys = await redis.keys(pattern);
    
    let activeCount = 0;
    
    for (const key of keys) {
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.venueId === venueId) {
          activeCount++;
        }
      }
    }
    
    return activeCount;
  }
  
  static async endSession(
    sessionId: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return;
    }
    
    const redis = this.redis();
    
    // Remove from active sessions
    await redis.srem(`user:sessions:${session.userId}`, sessionId);
    
    // Store session summary for analytics
    const summaryKey = `session:summary:${sessionId}`;
    const summary = {
      sessionId,
      userId: session.userId,
      venueId: session.venueId,
      startTime: session.startTime,
      endTime: new Date(),
      duration: new Date().getTime() - new Date(session.startTime).getTime(),
      pageViews: session.pageViews,
      eventCount: session.events.length
    };
    
    await redis.set(summaryKey, JSON.stringify(summary));
    await redis.expire(summaryKey, 86400); // Keep for 24 hours
    
    // Delete session
    await redis.del(`session:${sessionId}`);
  }
  
  static async getSessionMetrics(
    venueId: string
  ): Promise<any> {
    const redis = this.redis();
    const pattern = `session:summary:*`;
    const keys = await redis.keys(pattern);
    
    const metrics = {
      totalSessions: 0,
      averageDuration: 0,
      averagePageViews: 0,
      totalDuration: 0
    };
    
    for (const key of keys) {
      const summaryData = await redis.get(key);
      if (summaryData) {
        const summary = JSON.parse(summaryData);
        if (summary.venueId === venueId) {
          metrics.totalSessions++;
          metrics.totalDuration += summary.duration;
          metrics.averagePageViews += summary.pageViews;
        }
      }
    }
    
    if (metrics.totalSessions > 0) {
      metrics.averageDuration = metrics.totalDuration / metrics.totalSessions;
      metrics.averagePageViews = metrics.averagePageViews / metrics.totalSessions;
    }
    
    return metrics;
  }
}
```

### FILE: src/models/redis/cache.model.ts
```typescript
import { getRedis } from '../../config/redis';
import { CONSTANTS } from '../../config/constants';

export class CacheModel {
  private static redis = getRedis;
  
  static async get<T>(key: string): Promise<T | null> {
    const redis = this.redis();
    const value = await redis.get(key);
    
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value as any;
      }
    }
    
    return null;
  }
  
  static async set(
    key: string,
    value: any,
    ttl?: number
  ): Promise<void> {
    const redis = this.redis();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  }
  
  static async delete(key: string): Promise<void> {
    const redis = this.redis();
    await redis.del(key);
  }
  
  static async deletePattern(pattern: string): Promise<number> {
    const redis = this.redis();
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    
    return 0;
  }
  
  static async exists(key: string): Promise<boolean> {
    const redis = this.redis();
    return (await redis.exists(key)) === 1;
  }
  
  static async expire(key: string, ttl: number): Promise<void> {
    const redis = this.redis();
    await redis.expire(key, ttl);
  }
  
  static async increment(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.incrby(key, by);
  }
  
  static async decrement(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.decrby(key, by);
  }
  
  // Cache helpers for specific data types
  static getCacheKey(type: string, ...parts: string[]): string {
    return `analytics:${type}:${parts.join(':')}`;
  }
  
  static async cacheMetric(
    venueId: string,
    metricType: string,
    value: any,
    ttl: number = CONSTANTS.CACHE_TTL.METRICS
  ): Promise<void> {
    const key = this.getCacheKey('metric', venueId, metricType);
    await this.set(key, value, ttl);
  }
  
  static async getCachedMetric<T>(
    venueId: string,
    metricType: string
  ): Promise<T | null> {
    const key = this.getCacheKey('metric', venueId, metricType);
    return await this.get<T>(key);
  }
  
  static async cacheWidget(
    widgetId: string,
    data: any,
    ttl: number = CONSTANTS.CACHE_TTL.DASHBOARD
  ): Promise<void> {
    const key = this.getCacheKey('widget', widgetId);
    await this.set(key, data, ttl);
  }
  
  static async getCachedWidget<T>(
    widgetId: string
  ): Promise<T | null> {
    const key = this.getCacheKey('widget', widgetId);
    return await this.get<T>(key);
  }
  
  static async invalidateVenueCache(venueId: string): Promise<void> {
    const pattern = this.getCacheKey('*', venueId, '*');
    await this.deletePattern(pattern);
  }
}
```

### FILE: src/models/redis/realtime.model.ts
```typescript
import { getRedis, getPubClient, getSubClient } from '../../config/redis';
import { RealTimeMetric } from '../../types';

export class RealtimeModel {
  private static redis = getRedis;
  private static pub = getPubClient;
  private static sub = getSubClient;
  
  static async updateRealTimeMetric(
    venueId: string,
    metricType: string,
    value: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    
    // Get previous value
    const previousValue = await redis.get(key);
    const prev = previousValue ? parseFloat(previousValue) : 0;
    
    // Update current value
    await redis.set(key, value.toString());
    await redis.expire(key, 300); // 5 minutes TTL
    
    // Calculate change
    const change = value - prev;
    const changePercent = prev > 0 ? ((change / prev) * 100) : 0;
    
    // Create metric object
    const metric: RealTimeMetric = {
      metricType: metricType as any,
      currentValue: value,
      previousValue: prev,
      change,
      changePercent,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      lastUpdated: new Date()
    };
    
    // Publish update
    await this.publishMetricUpdate(venueId, metricType, metric);
  }
  
  static async getRealTimeMetric(
    venueId: string,
    metricType: string
  ): Promise<RealTimeMetric | null> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    const value = await redis.get(key);
    const data = await redis.get(dataKey);
    
    if (value && data) {
      return JSON.parse(data);
    }
    
    return null;
  }
  
  static async incrementCounter(
    venueId: string,
    counterType: string,
    by: number = 1
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.incrby(key, by);
    
    // Update real-time metric
    await this.updateRealTimeMetric(venueId, counterType, value);
    
    return value;
  }
  
  static async getCounter(
    venueId: string,
    counterType: string
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.get(key);
    
    return value ? parseInt(value) : 0;
  }
  
  static async resetCounter(
    venueId: string,
    counterType: string
  ): Promise<void> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    await redis.set(key, '0');
  }
  
  static async publishMetricUpdate(
    venueId: string,
    metricType: string,
    data: any
  ): Promise<void> {
    const pub = this.pub();
    const channel = `metrics:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    // Store data for future requests
    const redis = this.redis();
    await redis.set(dataKey, JSON.stringify(data));
    await redis.expire(dataKey, 300);
    
    // Publish to subscribers
    await pub.publish(channel, JSON.stringify(data));
  }
  
  static async subscribeToMetric(
    venueId: string,
    metricType: string,
    callback: (data: any) => void
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    
    await sub.subscribe(channel);
    
    sub.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          console.error('Error parsing metric update:', error);
        }
      }
    });
  }
  
  static async unsubscribeFromMetric(
    venueId: string,
    metricType: string
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    await sub.unsubscribe(channel);
  }
  
  static async setGauge(
    venueId: string,
    gaugeName: string,
    value: number,
    max: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    
    const data = {
      current: value,
      max,
      percentage: (value / max) * 100,
      timestamp: new Date()
    };
    
    await redis.set(key, JSON.stringify(data));
    await redis.expire(key, 300);
    
    // Publish update
    await this.publishMetricUpdate(venueId, `gauge:${gaugeName}`, data);
  }
  
  static async getGauge(
    venueId: string,
    gaugeName: string
  ): Promise<any | null> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    const value = await redis.get(key);
    
    return value ? JSON.parse(value) : null;
  }
}
```

### FILE: src/middleware/auth.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    permissions: string[];
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // In production, this would validate JWT token
    // For now, mock authentication
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    // Mock user - in production, decode and verify JWT
    req.user = {
      id: 'user-123',
      venueId: req.params.venueId || req.body?.venueId,
      permissions: ['analytics.read', 'analytics.write', 'analytics.export']
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Not authenticated'));
    }

    const hasPermission = requiredPermissions.some(permission =>
      req.user!.permissions.includes(permission)
    );

    if (!hasPermission) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
  venue?: {
    id: string;
    name: string;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new ApiError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
    req.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    // Also set venue info if available
    if (decoded.venueId) {
      req.venue = {
        id: decoded.venueId,
        name: decoded.venueName || 'Venue'
      };
    }

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(new ApiError(401, 'Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      next(new ApiError(401, 'Invalid token'));
    } else {
      next(error);
    }
  }
};

export const authorize = (permissions: string[] | string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, 'Authentication required'));
      return;
    }

    const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
    const userPerms = req.user.permissions || [];
    
    // Check if user has admin role (bypass permissions)
    if (req.user.role === 'admin') {
      next();
      return;
    }
    
    // Check if user has required permissions
    const hasPermission = requiredPerms.some(perm => 
      userPerms.includes(perm) || userPerms.includes('*')
    );

    if (!hasPermission) {
      next(new ApiError(403, 'Insufficient permissions'));
      return;
    }

    next();
  };
};

// Legacy function name support
export const authenticateVenue = authenticate;
```

### FILE: src/services/realtime-aggregation.service.ts
```typescript
import { getRedis } from '../config/redis';
import { getAnalyticsDb } from '../config/database';
import { logger } from '../utils/logger';
import { emitMetricUpdate, emitAlert } from '../config/websocket';

interface AggregationWindow {
  interval: number; // in seconds
  retention: number; // in seconds
}

export class RealtimeAggregationService {
  private redis = getRedis();
  private analyticsDb = getAnalyticsDb();
  private intervalHandles: NodeJS.Timeout[] = [];
  
  private aggregationWindows: Record<string, AggregationWindow> = {
    '1min': { interval: 60, retention: 3600 },      // 1 hour retention
    '5min': { interval: 300, retention: 86400 },    // 24 hour retention
    '1hour': { interval: 3600, retention: 604800 }, // 7 day retention
  };

  async startAggregationPipeline() {
    logger.info('Starting real-time aggregation pipeline');

    // Set up aggregation intervals
    this.setupAggregationIntervals();

    // Set up alert monitoring
    this.setupAlertMonitoring();
  }

  private setupAggregationIntervals() {
    // Use the configuration to set up intervals
    if (this.aggregationWindows['1min']) {
      const interval = setInterval(
        () => this.aggregate1Minute(), 
        this.aggregationWindows['1min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 1-minute aggregation (interval: ${this.aggregationWindows['1min'].interval}s)`);
    }

    if (this.aggregationWindows['5min']) {
      const interval = setInterval(
        () => this.aggregate5Minutes(), 
        this.aggregationWindows['5min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 5-minute aggregation (interval: ${this.aggregationWindows['5min'].interval}s)`);
    }

    if (this.aggregationWindows['1hour']) {
      const interval = setInterval(
        () => this.aggregateHourly(), 
        this.aggregationWindows['1hour'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started hourly aggregation (interval: ${this.aggregationWindows['1hour'].interval}s)`);
    }
  }

  // Method to stop all intervals (useful for cleanup)
  stopAggregationPipeline() {
    this.intervalHandles.forEach(handle => clearInterval(handle));
    this.intervalHandles = [];
    logger.info('Stopped aggregation pipeline');
  }

  private async aggregate1Minute() {
    try {
      const venues = await this.getActiveVenues();
      const retention = this.aggregationWindows['1min'].retention;

      for (const venueId of venues) {
        const metrics = await this.calculate1MinuteMetrics(venueId);

        // Store in real-time metrics table with configured retention
        await this.analyticsDb('realtime_metrics')
          .insert({
            venue_id: venueId,
            metric_type: '1min_summary',
            metric_value: metrics,
            expires_at: new Date(Date.now() + retention * 1000)
          })
          .onConflict(['venue_id', 'metric_type'])
          .merge();

        // Emit to WebSocket
        emitMetricUpdate(venueId, 'realtime-summary', metrics);

        // Check for alerts
        await this.checkAlertConditions(venueId, metrics);
      }
    } catch (error) {
      logger.error('Failed to run 1-minute aggregation', error);
    }
  }

  private async calculate1MinuteMetrics(venueId: string) {
    const now = new Date();

    // Get Redis metrics
    const purchaseKey = `metrics:purchase:${venueId}:${now.toISOString().split('T')[0]}`;
    const trafficKey = `metrics:traffic:${venueId}:${now.toISOString().split('T')[0]}`;

    const [purchases, traffic] = await Promise.all([
      this.redis.hgetall(purchaseKey),
      this.redis.hgetall(trafficKey)
    ]);

    // Calculate rates
    const salesRate = parseInt(purchases.total_sales || '0') / 60; // per second
    const trafficRate = parseInt(traffic.page_views || '0') / 60;

    return {
      timestamp: now,
      sales: {
        count: parseInt(purchases.total_sales || '0'),
        revenue: parseFloat(purchases.revenue || '0'),
        rate: salesRate
      },
      traffic: {
        pageViews: parseInt(traffic.page_views || '0'),
        rate: trafficRate
      },
      conversion: {
        rate: trafficRate > 0 ? salesRate / trafficRate : 0
      }
    };
  }

  private async aggregate5Minutes() {
    // Similar to 1-minute but with 5-minute window
    logger.debug('Running 5-minute aggregation');
    // TODO: Implement 5-minute aggregation logic
  }

  private async aggregateHourly() {
    try {
      const venues = await this.getActiveVenues();

      for (const venueId of venues) {
        // Calculate hourly metrics
        const hour = new Date().getHours();
        const today = new Date().toISOString().split('T')[0];

        // Get all Redis metrics for the hour
        const hourlyMetrics = await this.calculateHourlyMetrics(venueId);

        // Update database
        await this.analyticsDb('venue_analytics')
          .where({
            venue_id: venueId,
            date: today,
            hour: hour
          })
          .update({
            unique_customers: hourlyMetrics.uniqueCustomers,
            events_active: hourlyMetrics.activeEvents,
            updated_at: new Date()
          });
      }
    } catch (error) {
      logger.error('Failed to run hourly aggregation', error);
    }
  }

  private async calculateHourlyMetrics(venueId: string) {
    // Implementation for hourly metrics
    return {
      uniqueCustomers: 0,
      activeEvents: 0
    };
  }

  private async getActiveVenues(): Promise<string[]> {
    // Get venues with recent activity
    const result = await this.analyticsDb('venue_analytics')
      .distinct('venue_id')
      .where('updated_at', '>', new Date(Date.now() - 86400000)) // Last 24 hours
      .pluck('venue_id');

    return result;
  }

  private setupAlertMonitoring() {
    // Monitor for alert conditions
    setInterval(() => this.monitorAlerts(), 30000); // Every 30 seconds
  }

  private async checkAlertConditions(venueId: string, metrics: any) {
    // High traffic alert
    if (metrics.traffic.rate > 100) { // 100 views per second
      await this.createAlert(venueId, {
        type: 'high_traffic',
        severity: 'info',
        message: `High traffic detected: ${metrics.traffic.rate.toFixed(2)} views/second`,
        data: metrics.traffic
      });
    }

    // Low conversion alert
    if (metrics.traffic.pageViews > 1000 && metrics.conversion.rate < 0.01) {
      await this.createAlert(venueId, {
        type: 'low_conversion',
        severity: 'warning',
        message: `Low conversion rate: ${(metrics.conversion.rate * 100).toFixed(2)}%`,
        data: metrics.conversion
      });
    }
  }

  private async createAlert(venueId: string, alert: any) {
    // Store alert
    await this.analyticsDb('venue_alerts')
      .insert({
        venue_id: venueId,
        alert_name: alert.type,
        is_active: true
      });

    // Emit alert via WebSocket
    emitAlert(venueId, alert);
  }

  private async monitorAlerts() {
    // Monitor and clear expired alerts
    logger.debug('Monitoring alerts');
  }
}

export const realtimeAggregationService = new RealtimeAggregationService();
```

### FILE: src/services/message-gateway.service.ts
```typescript
import { AlertInstance } from '../types';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { logger } from '../utils/logger';
import { getChannel } from '../config/rabbitmq';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  subject?: string;
  body: string;
  variables: string[];
}

export interface Message {
  id: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
  scheduledFor?: Date;
  status: 'pending' | 'sent' | 'failed';
}

export class MessageGatewayService {
  private static instance: MessageGatewayService;
  private log = logger.child({ component: 'MessageGatewayService' });
  private templates: Map<string, MessageTemplate> = new Map();

  static getInstance(): MessageGatewayService {
    if (!this.instance) {
      this.instance = new MessageGatewayService();
    }
    return this.instance;
  }

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Alert templates
    this.templates.set('alert-email', {
      id: 'alert-email',
      name: 'Alert Email',
      channel: 'email',
      subject: 'Analytics Alert: {{alertName}}',
      body: `
        <h2>{{alertName}}</h2>
        <p>{{alertDescription}}</p>
        <p><strong>Severity:</strong> {{severity}}</p>
        <p><strong>Triggered at:</strong> {{triggeredAt}}</p>
        <p><strong>Current value:</strong> {{currentValue}}</p>
        <p><strong>Threshold:</strong> {{threshold}}</p>
        <a href="{{dashboardUrl}}">View Dashboard</a>
      `,
      variables: ['alertName', 'alertDescription', 'severity', 'triggeredAt', 'currentValue', 'threshold', 'dashboardUrl']
    });

    this.templates.set('alert-sms', {
      id: 'alert-sms',
      name: 'Alert SMS',
      channel: 'sms',
      body: 'Analytics Alert: {{alertName}} - {{severity}}. Value: {{currentValue}}. Check dashboard for details.',
      variables: ['alertName', 'severity', 'currentValue']
    });

    this.templates.set('alert-slack', {
      id: 'alert-slack',
      name: 'Alert Slack',
      channel: 'slack',
      body: JSON.stringify({
        text: 'Analytics Alert',
        attachments: [{
          color: '{{color}}',
          title: '{{alertName}}',
          text: '{{alertDescription}}',
          fields: [
            { title: 'Severity', value: '{{severity}}', short: true },
            { title: 'Current Value', value: '{{currentValue}}', short: true },
            { title: 'Threshold', value: '{{threshold}}', short: true },
            { title: 'Time', value: '{{triggeredAt}}', short: true }
          ],
          actions: [{
            type: 'button',
            text: 'View Dashboard',
            url: '{{dashboardUrl}}'
          }]
        }]
      }),
      variables: ['color', 'alertName', 'alertDescription', 'severity', 'currentValue', 'threshold', 'triggeredAt', 'dashboardUrl']
    });

    // Report templates
    this.templates.set('report-ready-email', {
      id: 'report-ready-email',
      name: 'Report Ready Email',
      channel: 'email',
      subject: 'Your Analytics Report is Ready',
      body: `
        <h2>Your report is ready for download</h2>
        <p>Report: {{reportName}}</p>
        <p>Generated: {{generatedAt}}</p>
        <p>Size: {{fileSize}}</p>
        <a href="{{downloadUrl}}">Download Report</a>
        <p><em>This link will expire in {{expirationDays}} days.</em></p>
      `,
      variables: ['reportName', 'generatedAt', 'fileSize', 'downloadUrl', 'expirationDays']
    });

    // Customer insight templates
    this.templates.set('customer-insight-email', {
      id: 'customer-insight-email',
      name: 'Customer Insight Email',
      channel: 'email',
      subject: 'New Customer Insights Available',
      body: `
        <h2>New insights for your venue</h2>
        <ul>
        {{#insights}}
          <li>
            <strong>{{title}}</strong>: {{description}}
            <br>Impact: {{impact}}
            {{#actionable}}
            <br>Suggested actions:
            <ul>
              {{#suggestedActions}}
              <li>{{.}}</li>
              {{/suggestedActions}}
            </ul>
            {{/actionable}}
          </li>
        {{/insights}}
        </ul>
        <a href="{{dashboardUrl}}">View Full Analytics</a>
      `,
      variables: ['insights', 'dashboardUrl']
    });
  }

  async sendMessage(
    channel: 'email' | 'sms' | 'push' | 'slack',
    recipient: string,
    templateId: string,
    variables: Record<string, any>
  ): Promise<Message> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      const message: Message = {
        id: `msg-${Date.now()}`,
        channel,
        recipient,
        subject: this.interpolateTemplate(template.subject || '', variables),
        body: this.interpolateTemplate(template.body, variables),
        metadata: { templateId, variables },
        status: 'pending'
      };

      // Queue message for delivery
      await this.queueMessage(message);

      this.log.info('Message queued', { 
        messageId: message.id, 
        channel, 
        recipient: this.maskRecipient(recipient) 
      });

      return message;
    } catch (error) {
      this.log.error('Failed to send message', { error, channel, templateId });
      throw error;
    }
  }

  async sendAlertNotification(
    alert: AlertInstance,
    channel: 'email' | 'sms' | 'slack',
    recipient: string
  ): Promise<void> {
    try {
      const templateId = `alert-${channel}`;
      const variables = {
        alertName: alert.message,
        alertDescription: alert.message,
        severity: alert.severity,
        triggeredAt: alert.triggeredAt.toISOString(),
        currentValue: JSON.stringify(alert.triggerValues),
        threshold: 'Configured threshold',
        dashboardUrl: `${process.env.APP_URL}/dashboard/alerts/${alert.alertId}`,
        color: alert.severity === 'critical' ? '#ff0000' : 
               alert.severity === 'error' ? '#ff6600' : 
               alert.severity === 'warning' ? '#ffcc00' : '#0066cc'
      };

      await this.sendMessage(channel, recipient, templateId, variables);
    } catch (error) {
      this.log.error('Failed to send alert notification', { error, alertId: alert.id });
      throw error;
    }
  }

  async sendBulkMessages(
    messages: Array<{
      channel: 'email' | 'sms' | 'push' | 'slack';
      recipient: string;
      templateId: string;
      variables: Record<string, any>;
    }>
  ): Promise<Message[]> {
    try {
      const results = await Promise.allSettled(
        messages.map(msg => 
          this.sendMessage(msg.channel, msg.recipient, msg.templateId, msg.variables)
        )
      );

      const successful = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<Message>).value);

      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        this.log.warn(`Bulk send completed with ${failed} failures`, {
          total: messages.length,
          successful: successful.length,
          failed
        });
      }

      return successful;
    } catch (error) {
      this.log.error('Failed to send bulk messages', { error });
      throw error;
    }
  }

  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    
    // Simple variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    });

    // Handle arrays and conditionals (simplified)
    // In production, use a proper template engine like Handlebars
    
    return result;
  }

  private async queueMessage(message: Message): Promise<void> {
    try {
      const channel = getChannel();
      const routingKey = `messages.${message.channel}`;
      
      channel.publish(
        'tickettoken_events',
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    } catch (error) {
      this.log.error('Failed to queue message', { error, messageId: message.id });
      throw error;
    }
  }

  private maskRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      // Email
      const [user, domain] = recipient.split('@');
      return `${user.substring(0, 2)}***@${domain}`;
    } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
      // Phone
      return `***${recipient.slice(-4)}`;
    }
    return '***';
  }

  async getMessageStatus(_messageId: string): Promise<Message | null> {
    // In production, this would query the message queue or database
    return null;
  }

  async retryFailedMessages(_since: Date): Promise<number> {
    // In production, this would retry failed messages
    return 0;
  }
}

export const messageGatewayService = MessageGatewayService.getInstance();
```

### FILE: src/services/event-stream.service.ts
```typescript
import { EventEmitter } from 'events';
import Bull from 'bull';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { emitMetricUpdate } from '../config/websocket';
import { getAnalyticsDb } from '../config/database';

export interface StreamEvent {
  type: string;
  venueId: string;
  data: any;
  timestamp: Date;
}

export class EventStreamService extends EventEmitter {
  private queues: Map<string, Bull.Queue> = new Map();
  private redis: any; // Lazy loaded
  private analyticsDb: any; // Lazy loaded
  private initialized = false;

  constructor() {
    super();
  }

  private async initialize() {
    if (this.initialized) return;
    
    this.redis = getRedis();
    this.analyticsDb = getAnalyticsDb();
    this.initializeQueues();
    this.initialized = true;
  }

  private initializeQueues() {
    // Create queues for different event types
    const eventTypes = [
      'ticket-purchase',
      'ticket-scan', 
      'page-view',
      'cart-update',
      'venue-update'
    ];

    eventTypes.forEach(type => {
      const queue = new Bull(type, {
        redis: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      queue.process(async (job) => {
        await this.processEvent(type, job.data);
      });

      this.queues.set(type, queue);
    });
  }

  // Process incoming events
  async processEvent(type: string, data: StreamEvent) {
    try {
      logger.debug('Processing event', { type, venueId: data.venueId });

      // Emit event for real-time processing
      this.emit(type, data);

      // Update real-time metrics
      await this.updateRealTimeMetrics(type, data);

      // Emit to WebSocket clients (only if WebSocket is initialized)
      try {
        emitMetricUpdate(data.venueId, type, data);
      } catch (e) {
        // WebSocket might not be initialized in tests
      }

      // Store raw event for later processing
      await this.storeRawEvent(type, data);

    } catch (error) {
      logger.error('Failed to process event', { type, error });
    }
  }

  private async updateRealTimeMetrics(type: string, event: StreamEvent) {
    const { venueId, data } = event;

    switch (type) {
      case 'ticket-purchase':
        await this.updatePurchaseMetrics(venueId, data);
        break;
      
      case 'ticket-scan':
        await this.updateScanMetrics(venueId, data);
        break;
      
      case 'page-view':
        await this.updateTrafficMetrics(venueId, data);
        break;
    }
  }

  private async updatePurchaseMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    
    // Update real-time purchase metrics
    const key = `metrics:purchase:${venueId}:${new Date().toISOString().split('T')[0]}`;
    
    await this.redis.hincrby(key, 'total_sales', 1);
    await this.redis.hincrbyfloat(key, 'revenue', data.amount);
    await this.redis.expire(key, 86400); // 24 hour TTL

    // Update database with aggregated metrics
    if (!this.analyticsDb) return;
    
    const hour = new Date().getHours();
    await this.analyticsDb('venue_analytics')
      .insert({
        venue_id: venueId,
        date: new Date(),
        hour: hour,
        tickets_sold: 1,
        revenue: data.amount
      })
      .onConflict(['venue_id', 'date', 'hour'])
      .merge({
        tickets_sold: this.analyticsDb.raw('venue_analytics.tickets_sold + 1'),
        revenue: this.analyticsDb.raw('venue_analytics.revenue + ?', [data.amount]),
        updated_at: new Date()
      });
  }

  private async updateScanMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:scan:${venueId}:${data.eventId}`;
    await this.redis.hincrby(key, 'scanned', 1);
    await this.redis.expire(key, 86400);
  }

  private async updateTrafficMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:traffic:${venueId}:${new Date().toISOString().split('T')[0]}`;
    await this.redis.hincrby(key, 'page_views', 1);
    await this.redis.pfadd(`unique_visitors:${venueId}`, data.sessionId);
    await this.redis.expire(key, 86400);
  }

  private async storeRawEvent(type: string, event: StreamEvent) {
    // Store in MongoDB for later analysis
    // We'll implement this when MongoDB is configured
    logger.debug('Storing raw event', { type, venueId: event.venueId });
  }

  // Public method to push events
  async pushEvent(type: string, event: StreamEvent) {
    await this.initialize();
    
    const queue = this.queues.get(type);
    if (queue) {
      await queue.add(event, {
        removeOnComplete: true,
        removeOnFail: false
      });
    }
  }

  // Subscribe to external events (from other services)
  async subscribeToExternalEvents() {
    await this.initialize();
    
    // Subscribe to Redis pub/sub for cross-service events
    const subscriber = this.redis.duplicate();
    
    subscriber.subscribe('analytics:events');
    
    subscriber.on('message', async (channel: string, message: string) => {
      try {
        const event = JSON.parse(message);
        await this.pushEvent(event.type, event);
      } catch (error) {
        logger.error('Failed to process external event', error);
      }
    });
  }
}

export const eventStreamService = new EventStreamService();
```

### FILE: src/types/widget.types.ts
```typescript
import { MetricType, DateRange } from './common.types';

export enum WidgetType {
  // Real-time widgets
  LIVE_SALES_COUNTER = 'live_sales_counter',
  LIVE_REVENUE_COUNTER = 'live_revenue_counter',
  LIVE_ATTENDANCE_GAUGE = 'live_attendance_gauge',
  CAPACITY_TRACKER = 'capacity_tracker',
  
  // Chart widgets
  LINE_CHART = 'line_chart',
  BAR_CHART = 'bar_chart',
  PIE_CHART = 'pie_chart',
  AREA_CHART = 'area_chart',
  HEATMAP = 'heatmap',
  
  // KPI widgets
  KPI_CARD = 'kpi_card',
  COMPARISON_CARD = 'comparison_card',
  TREND_CARD = 'trend_card',
  
  // Table widgets
  DATA_TABLE = 'data_table',
  LEADERBOARD = 'leaderboard',
  
  // Custom widgets
  CUSTOM_METRIC = 'custom_metric',
  CUSTOM_VISUALIZATION = 'custom_visualization',
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  metrics: MetricType[];
  dateRange?: DateRange;
  refreshInterval?: number; // in seconds
  size: WidgetSize;
  position: WidgetPosition;
  settings: WidgetSettings;
  filters?: WidgetFilter[];
}

export interface WidgetSize {
  width: number; // grid units
  height: number; // grid units
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface WidgetSettings {
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showDataLabels?: boolean;
  animation?: boolean;
  customStyles?: Record<string, any>;
  thresholds?: Array<{
    value: number;
    color: string;
    label?: string;
  }>;
}

export interface WidgetFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
  value: any;
}

export interface WidgetData {
  widgetId: string;
  timestamp: Date;
  data: any; // Specific to widget type
  metadata?: Record<string, any>;
}

export interface RealTimeWidgetData extends WidgetData {
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  sparkline?: number[];
}

export interface ChartWidgetData extends WidgetData {
  series: Array<{
    name: string;
    data: Array<{
      x: string | number | Date;
      y: number;
      metadata?: any;
    }>;
  }>;
  categories?: string[];
}

export interface TableWidgetData extends WidgetData {
  columns: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    sortable?: boolean;
    format?: string;
  }>;
  rows: Array<Record<string, any>>;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface WidgetUpdate {
  widgetId: string;
  data: WidgetData;
  timestamp: Date;
}

export interface WidgetSubscription {
  widgetId: string;
  userId: string;
  config: WidgetConfig;
  lastUpdate?: Date;
  status: 'active' | 'paused' | 'error';
}
```

### FILE: src/types/dashboard.types.ts
```typescript
import { WidgetConfig } from './widget.types';
import { AuditInfo } from './common.types';

export interface Dashboard extends AuditInfo {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isPublic: boolean;
  layout: DashboardLayout;
  widgets: WidgetConfig[];
  filters: DashboardFilter[];
  settings: DashboardSettings;
  permissions: DashboardPermissions;
  tags?: string[];
}

export interface DashboardLayout {
  type: 'grid' | 'freeform' | 'responsive';
  columns: number;
  rows?: number;
  gap?: number;
  padding?: number;
  breakpoints?: Array<{
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    columns: number;
  }>;
}

export interface DashboardFilter {
  id: string;
  name: string;
  field: string;
  type: 'date_range' | 'select' | 'multi_select' | 'search';
  defaultValue?: any;
  options?: Array<{
    value: string;
    label: string;
  }>;
  isGlobal: boolean;
  appliesTo?: string[]; // widget IDs
}

export interface DashboardSettings {
  theme: 'light' | 'dark' | 'auto';
  refreshInterval?: number; // in seconds
  timezone?: string;
  dateFormat?: string;
  numberFormat?: string;
  currency?: string;
  animations: boolean;
  showFilters: boolean;
  showToolbar: boolean;
  fullscreenEnabled: boolean;
}

export interface DashboardPermissions {
  ownerId: string;
  public: boolean;
  sharedWith: Array<{
    userId?: string;
    roleId?: string;
    permission: 'view' | 'edit' | 'admin';
  }>;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail?: string;
  layout: DashboardLayout;
  widgets: Partial<WidgetConfig>[];
  industries?: string[];
  tags?: string[];
  popularity: number;
}

export interface DashboardSnapshot {
  id: string;
  dashboardId: string;
  name: string;
  description?: string;
  data: Record<string, any>;
  createdAt: Date;
  expiresAt?: Date;
  shareToken?: string;
  accessCount: number;
}

export interface DashboardExport {
  format: 'pdf' | 'png' | 'csv' | 'excel';
  dashboardId: string;
  includeData: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  widgets?: string[]; // specific widget IDs to export
  settings?: {
    paperSize?: 'A4' | 'Letter' | 'Legal';
    orientation?: 'portrait' | 'landscape';
    quality?: 'low' | 'medium' | 'high';
  };
}
```

### FILE: src/types/alert.types.ts
```typescript
export interface Alert {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  conditions: AlertCondition[];
  actions: AlertAction[];
  schedule?: AlertSchedule;
  lastTriggered?: Date;
  triggerCount: number;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum AlertType {
  THRESHOLD = 'threshold',
  ANOMALY = 'anomaly',
  TREND = 'trend',
  COMPARISON = 'comparison',
  CUSTOM = 'custom',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  ACTIVE = 'active',
  TRIGGERED = 'triggered',
  RESOLVED = 'resolved',
  SNOOZED = 'snoozed',
  DISABLED = 'disabled',
}

export interface AlertCondition {
  id: string;
  metric: string;
  operator: ComparisonOperator;
  value: number;
  aggregation?: {
    method: 'sum' | 'avg' | 'min' | 'max' | 'count';
    period: number; // minutes
  };
  filters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

export enum ComparisonOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_THAN_OR_EQUALS = 'greater_than_or_equals',
  LESS_THAN_OR_EQUALS = 'less_than_or_equals',
  BETWEEN = 'between',
  NOT_BETWEEN = 'not_between',
  CHANGE_PERCENT = 'change_percent',
}

export interface AlertAction {
  type: ActionType;
  config: ActionConfig;
  delay?: number; // minutes
  repeat?: {
    enabled: boolean;
    interval: number; // minutes
    maxCount?: number;
  };
}

export enum ActionType {
  EMAIL = 'email',
  SMS = 'sms',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  DASHBOARD = 'dashboard',
  LOG = 'log',
}

export interface ActionConfig {
  // Email action
  recipients?: string[];
  subject?: string;
  template?: string;
  
  // SMS action
  phoneNumbers?: string[];
  message?: string;
  
  // Webhook action
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  
  // Slack action
  channel?: string;
  webhookUrl?: string;
  
  // Dashboard action
  dashboardId?: string;
  widgetId?: string;
  highlight?: boolean;
}

export interface AlertSchedule {
  timezone: string;
  activeHours?: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
  activeDays?: number[]; // 0-6 (Sunday-Saturday)
  excludeDates?: Date[];
}

export interface AlertInstance {
  id: string;
  alertId: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  severity: AlertSeverity;
  status: 'active' | 'acknowledged' | 'resolved';
  triggerValues: Record<string, any>;
  message: string;
  actions: Array<{
    type: ActionType;
    status: 'pending' | 'sent' | 'failed';
    sentAt?: Date;
    error?: string;
  }>;
  acknowledgedBy?: string;
  notes?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultSeverity: AlertSeverity;
  requiredMetrics: string[];
  configSchema: any; // JSON Schema
  examples: Array<{
    name: string;
    config: any;
  }>;
}

export interface AlertSummary {
  venueId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalAlerts: number;
  byStatus: Record<AlertStatus, number>;
  bySeverity: Record<AlertSeverity, number>;
  byType: Record<AlertType, number>;
  topAlerts: Array<{
    alertId: string;
    name: string;
    triggerCount: number;
  }>;
  averageResolutionTime: number; // minutes
  falsePositiveRate: number;
}

export interface AlertNotification {
  id: string;
  alertInstanceId: string;
  type: ActionType;
  recipient: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}
```

### FILE: src/types/common.types.ts
```typescript
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  metadata?: Record<string, any>;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TimeGranularity {
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  value: number;
}

export interface VenueContext {
  venueId: string;
  tenantId?: string;
}

export interface UserContext {
  userId: string;
  venueId?: string;
  permissions: string[];
  role?: string;
}

export interface AuditInfo {
  createdAt: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
}

export enum MetricType {
  SALES = 'sales',
  REVENUE = 'revenue',
  ATTENDANCE = 'attendance',
  CAPACITY = 'capacity',
  CONVERSION = 'conversion',
  CART_ABANDONMENT = 'cart_abandonment',
  AVERAGE_ORDER_VALUE = 'average_order_value',
  CUSTOMER_LIFETIME_VALUE = 'customer_lifetime_value',
}

export enum EventType {
  // Ticket events
  TICKET_PURCHASED = 'ticket.purchased',
  TICKET_TRANSFERRED = 'ticket.transferred',
  TICKET_REFUNDED = 'ticket.refunded',
  TICKET_SCANNED = 'ticket.scanned',
  
  // Venue events
  VENUE_CREATED = 'venue.created',
  VENUE_UPDATED = 'venue.updated',
  EVENT_CREATED = 'event.created',
  EVENT_UPDATED = 'event.updated',
  EVENT_CANCELLED = 'event.cancelled',
  
  // Payment events
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  REFUND_PROCESSED = 'refund.processed',
  
  // Marketplace events
  LISTING_CREATED = 'listing.created',
  LISTING_SOLD = 'listing.sold',
  OFFER_MADE = 'offer.made',
  
  // User events
  USER_REGISTERED = 'user.registered',
  USER_LOGIN = 'user.login',
  USER_PROFILE_UPDATED = 'user.profile_updated',
}
```

### FILE: src/types/export.types.ts
```typescript
export interface ExportRequest {
  id: string;
  venueId: string;
  userId: string;
  type: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  filters: ExportFilters;
  options: ExportOptions;
  progress?: number;
  fileUrl?: string;
  fileSize?: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

export enum ExportType {
  ANALYTICS_REPORT = 'analytics_report',
  CUSTOMER_LIST = 'customer_list',
  TRANSACTION_HISTORY = 'transaction_history',
  EVENT_SUMMARY = 'event_summary',
  FINANCIAL_REPORT = 'financial_report',
  DASHBOARD_SNAPSHOT = 'dashboard_snapshot',
  RAW_DATA = 'raw_data',
  CUSTOM_REPORT = 'custom_report',
}

export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
  JSON = 'json',
  XML = 'xml',
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface ExportFilters {
  dateRange: {
    start: Date;
    end: Date;
  };
  venues?: string[];
  events?: string[];
  eventTypes?: string[];
  customerSegments?: string[];
  metrics?: string[];
  dimensions?: string[];
  customFilters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

export interface ExportOptions {
  includeHeaders?: boolean;
  timezone?: string;
  dateFormat?: string;
  numberFormat?: string;
  currency?: string;
  language?: string;
  compression?: boolean;
  encryption?: {
    enabled: boolean;
    password?: string;
  };
  scheduling?: {
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    endDate?: Date;
  };
  delivery?: {
    method: 'download' | 'email' | 's3' | 'ftp';
    destination?: string;
    recipients?: string[];
  };
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  type: ExportType;
  venueId?: string;
  isGlobal: boolean;
  sections: ReportSection[];
  filters: ExportFilters;
  options: ExportOptions;
  lastUsed?: Date;
  usageCount: number;
  createdBy: string;
  createdAt: Date;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'summary' | 'chart' | 'table' | 'text';
  order: number;
  config: {
    metrics?: string[];
    dimensions?: string[];
    visualization?: string;
    text?: string;
    formatting?: Record<string, any>;
  };
}

export interface ExportQueue {
  pending: ExportRequest[];
  processing: ExportRequest[];
  workers: ExportWorker[];
}

export interface ExportWorker {
  id: string;
  status: 'idle' | 'busy';
  currentExport?: string;
  startedAt?: Date;
  completedCount: number;
  errorCount: number;
}

export interface DataExportSchema {
  version: string;
  timestamp: Date;
  venue: {
    id: string;
    name: string;
  };
  metadata: Record<string, any>;
  data: any[]; // Specific to export type
}

export interface FinancialExportData {
  summary: {
    totalRevenue: number;
    totalTransactions: number;
    averageOrderValue: number;
    refundAmount: number;
    netRevenue: number;
  };
  byPeriod: Array<{
    period: string;
    revenue: number;
    transactions: number;
    refunds: number;
  }>;
  byEventType: Array<{
    eventType: string;
    revenue: number;
    ticketsSold: number;
  }>;
  transactions: Array<{
    date: Date;
    transactionId: string;
    amount: number;
    type: string;
    status: string;
  }>;
}

export interface CustomerExportData {
  summary: {
    totalCustomers: number;
    newCustomers: number;
    activeCustomers: number;
  };
  customers: Array<{
    customerId: string;
    firstPurchase: Date;
    lastPurchase: Date;
    totalSpent: number;
    totalTickets: number;
    segment: string;
    tags?: string[];
  }>;
}
```

### FILE: src/types/analytics.types.ts
```typescript
import { MetricType, EventType, DateRange, TimeGranularity } from './common.types';

export interface AnalyticsEvent {
  id: string;
  eventType: EventType;
  venueId: string;
  userId?: string;
  eventId?: string;
  ticketId?: string;
  timestamp: Date;
  properties: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface Metric {
  id: string;
  venueId: string;
  metricType: MetricType;
  value: number;
  timestamp: Date;
  granularity: TimeGranularity;
  dimensions?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface RealTimeMetric {
  metricType: MetricType;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  lastUpdated: Date;
}

export interface MetricAggregation {
  metricType: MetricType;
  period: DateRange;
  granularity: TimeGranularity;
  data: Array<{
    timestamp: Date;
    value: number;
    change?: number;
    changePercent?: number;
  }>;
  summary: {
    total: number;
    average: number;
    min: number;
    max: number;
    trend: number;
  };
}

export interface VenueAnalytics {
  venueId: string;
  overview: {
    totalEvents: number;
    totalTicketsSold: number;
    totalRevenue: number;
    averageTicketPrice: number;
    occupancyRate: number;
    customerSatisfaction: number;
  };
  trends: {
    sales: MetricAggregation;
    revenue: MetricAggregation;
    attendance: MetricAggregation;
  };
  topEvents: EventPerformance[];
  customerMetrics: CustomerMetrics;
}

export interface EventPerformance {
  eventId: string;
  eventName: string;
  eventDate: Date;
  ticketsSold: number;
  revenue: number;
  occupancyRate: number;
  averageTicketPrice: number;
  conversionRate: number;
  customerSatisfaction?: number;
}

export interface CustomerMetrics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  averageOrderValue: number;
  customerLifetimeValue: number;
  churnRate: number;
  segments: CustomerSegmentMetrics[];
}

export interface CustomerSegmentMetrics {
  segmentId: string;
  segmentName: string;
  customerCount: number;
  averageSpend: number;
  purchaseFrequency: number;
  lastPurchaseAvg: number;
}

export interface ConversionFunnel {
  steps: Array<{
    name: string;
    visitors: number;
    conversions: number;
    conversionRate: number;
    dropoffRate: number;
  }>;
  overallConversion: number;
  totalVisitors: number;
  totalConversions: number;
}

export interface GeographicDistribution {
  regions: Array<{
    region: string;
    country: string;
    state?: string;
    city?: string;
    customerCount: number;
    revenue: number;
    percentage: number;
  }>;
}

export interface DeviceAnalytics {
  devices: Array<{
    type: 'desktop' | 'mobile' | 'tablet';
    brand?: string;
    os?: string;
    browser?: string;
    sessions: number;
    conversions: number;
    conversionRate: number;
  }>;
}

export interface MarketingAttribution {
  channels: Array<{
    channel: string;
    source: string;
    medium: string;
    campaign?: string;
    visits: number;
    conversions: number;
    revenue: number;
    roi: number;
    costPerAcquisition: number;
  }>;
  multiTouchAttribution: Array<{
    touchpoint: string;
    attribution: number;
    revenue: number;
  }>;
}
```

### FILE: src/types/customer.types.ts
```typescript
export interface CustomerProfile {
  customerId: string; // Hashed customer ID
  venueId: string;
  firstSeen: Date;
  lastSeen: Date;
  totalSpent: number;
  totalTickets: number;
  totalPurchases?: number;
  averageOrderValue: number;
  purchaseFrequency: number;
  daysSinceLastPurchase: number;
  favoriteEventType?: string;
  segment: CustomerSegment;
  predictedLifetimeValue: number;
  churnProbability: number;
  tags?: string[];
  attributes: CustomerAttributes;
}

export interface CustomerAttributes {
  location?: {
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string; // First 3 digits only
  };
  demographics?: {
    ageGroup?: string;
    gender?: string;
    language?: string;
  };
  preferences?: {
    eventTypes?: string[];
    priceRange?: string;
    dayOfWeek?: string[];
    timeOfDay?: string[];
    seatingPreference?: string;
  };
  behavior?: {
    deviceType?: string;
    purchaseTime?: string;
    leadTime?: number; // Days before event
    groupSize?: number;
  };
}

export enum CustomerSegment {
  NEW = 'new',
  OCCASIONAL = 'occasional',
  REGULAR = 'regular',
  VIP = 'vip',
  AT_RISK = 'at_risk',
  DORMANT = 'dormant',
  LOST = 'lost',
}

export interface CustomerSegmentDefinition {
  segment: CustomerSegment;
  criteria: {
    minPurchases?: number;
    maxPurchases?: number;
    minSpend?: number;
    maxSpend?: number;
    minFrequency?: number; // purchases per year
    maxFrequency?: number;
    maxDaysSinceLastPurchase?: number;
    minDaysSinceLastPurchase?: number;
  };
  benefits?: string[];
  targetingRules?: Record<string, any>;
}

export interface CustomerInsight {
  customerId: string;
  type: InsightType;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  suggestedActions?: string[];
  validUntil: Date;
  metadata?: Record<string, any>;
}

export enum InsightType {
  PURCHASE_PATTERN = 'purchase_pattern',
  CHURN_RISK = 'churn_risk',
  UPSELL_OPPORTUNITY = 'upsell_opportunity',
  REACTIVATION = 'reactivation',
  MILESTONE = 'milestone',
  PREFERENCE_CHANGE = 'preference_change',
  LOW_ENGAGEMENT = 'low_engagement',
  HIGH_VALUE = 'high_value'
}

export interface CustomerCohort {
  cohortId: string;
  name: string;
  description: string;
  criteria: Record<string, any>;
  customerCount: number;
  metrics: {
    retention: Array<{
      period: number;
      rate: number;
    }>;
    averageLifetimeValue: number;
    averageOrderValue: number;
    totalRevenue: number;
  };
  createdAt: Date;
}

export interface CustomerJourney {
  customerId: string;
  touchpoints: Array<{
    timestamp: Date;
    type: string;
    channel: string;
    action: string;
    details?: Record<string, any>;
  }>;
  currentStage: string;
  nextBestAction?: string;
  conversionProbability?: number;
}

export interface RFMAnalysis {
  customerId: string;
  recency: number; // Days since last purchase
  frequency: number; // Number of purchases
  monetary: number; // Total spent
  recencyScore: number; // 1-5
  frequencyScore: number; // 1-5
  monetaryScore: number; // 1-5
  segment: string; // e.g., "Champions", "At Risk"
}
```

### FILE: src/types/prediction.types.ts
```typescript
export interface PredictionModel {
  id: string;
  venueId: string;
  modelType: ModelType;
  version: string;
  status: ModelStatus;
  accuracy?: number;
  lastTrained: Date;
  nextTraining: Date;
  parameters: ModelParameters;
  metrics: ModelMetrics;
  features: string[];
}

export enum ModelType {
  DEMAND_FORECAST = 'demand_forecast',
  PRICE_OPTIMIZATION = 'price_optimization',
  CHURN_PREDICTION = 'churn_prediction',
  LIFETIME_VALUE = 'lifetime_value',
  NO_SHOW_PREDICTION = 'no_show_prediction',
  FRAUD_DETECTION = 'fraud_detection',
}

export enum ModelStatus {
  TRAINING = 'training',
  READY = 'ready',
  FAILED = 'failed',
  OUTDATED = 'outdated',
  DISABLED = 'disabled',
}

export interface ModelParameters {
  algorithm: string;
  hyperparameters: Record<string, any>;
  trainingConfig: {
    batchSize?: number;
    epochs?: number;
    learningRate?: number;
    validationSplit?: number;
  };
}

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  rmse?: number;
  mae?: number;
  r2?: number;
  confusionMatrix?: number[][];
  featureImportance?: Array<{
    feature: string;
    importance: number;
  }>;
}

export interface DemandForecast {
  eventId: string;
  predictions: Array<{
    date: Date;
    ticketTypeId: string;
    predictedDemand: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    factors: Array<{
      name: string;
      impact: number;
    }>;
  }>;
  aggregated: {
    totalPredictedDemand: number;
    peakDemandDate: Date;
    sellOutProbability: number;
  };
}

export interface PriceOptimization {
  eventId: string;
  ticketTypeId: string;
  currentPrice: number;
  recommendations: Array<{
    price: number;
    expectedDemand: number;
    expectedRevenue: number;
    elasticity: number;
    confidence: number;
  }>;
  optimalPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  factors: Array<{
    factor: string;
    weight: number;
    direction: 'positive' | 'negative';
  }>;
}

export interface ChurnPrediction {
  customerId: string;
  churnProbability: number;
  riskLevel: 'low' | 'medium' | 'high';
  timeframe: number; // days
  reasons: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;
  recommendedActions: Array<{
    action: string;
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
  }>;
}

export interface CustomerLifetimeValue {
  customerId: string;
  predictedCLV: number;
  confidence: number;
  timeHorizon: number; // months
  breakdown: {
    expectedPurchases: number;
    averageOrderValue: number;
    retentionProbability: number;
  };
  segment: string;
  growthPotential: number;
}

export interface NoShowPrediction {
  ticketId: string;
  customerId: string;
  eventId: string;
  noShowProbability: number;
  riskFactors: Array<{
    factor: string;
    value: any;
    contribution: number;
  }>;
  recommendedActions?: string[];
}

export interface FraudDetection {
  transactionId: string;
  fraudProbability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anomalies: Array<{
    type: string;
    severity: number;
    description: string;
  }>;
  requiresReview: boolean;
  autoDecision: 'approve' | 'decline' | 'review';
}

export interface WhatIfScenario {
  id: string;
  name: string;
  type: 'pricing' | 'capacity' | 'timing' | 'marketing';
  baselineMetrics: Record<string, number>;
  scenarios: Array<{
    name: string;
    parameters: Record<string, any>;
    predictions: Record<string, number>;
    impact: Record<string, number>;
  }>;
  recommendations: string[];
}

export interface SeasonalityPattern {
  venueId: string;
  metricType: string;
  patterns: Array<{
    type: 'daily' | 'weekly' | 'monthly' | 'yearly';
    values: number[];
    strength: number;
    confidence: number;
  }>;
  holidays: Array<{
    name: string;
    impact: number;
    daysAffected: number;
  }>;
  events: Array<{
    type: string;
    averageImpact: number;
    frequency: number;
  }>;
}
```

### FILE: src/types/campaign.types.ts
```typescript

export interface Campaign {
  id: string;
  venueId: string;
  name: string;
  description?: string;
  type: CampaignType;
  status: CampaignStatus;
  startDate: Date;
  endDate: Date;
  budget?: number;
  targetAudience: TargetAudience;
  channels: CampaignChannel[];
  goals: CampaignGoal[];
  creativeAssets?: CreativeAsset[];
  attribution: AttributionSettings;
  results?: CampaignResults;
  createdAt: Date;
  createdBy: string;
}

export enum CampaignType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  SOCIAL = 'social',
  DISPLAY = 'display',
  SEARCH = 'search',
  MULTI_CHANNEL = 'multi_channel',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface TargetAudience {
  segments: string[];
  filters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
  estimatedReach: number;
  excludeSegments?: string[];
}

export interface CampaignChannel {
  channel: string;
  enabled: boolean;
  settings: Record<string, any>;
  budget?: number;
  schedule?: {
    days?: string[];
    hours?: number[];
    timezone?: string;
  };
}

export interface CampaignGoal {
  metric: string;
  target: number;
  current?: number;
  percentage?: number;
}

export interface CreativeAsset {
  id: string;
  type: 'image' | 'video' | 'text' | 'html';
  name: string;
  url?: string;
  content?: string;
  variations?: Array<{
    id: string;
    name: string;
    content: any;
    performance?: {
      impressions: number;
      clicks: number;
      conversions: number;
    };
  }>;
}

export interface AttributionSettings {
  model: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven';
  lookbackWindow: number; // days
  includedChannels: string[];
  excludedChannels?: string[];
}

export interface CampaignResults {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
  ctr: number; // Click-through rate
  conversionRate: number;
  costPerAcquisition: number;
  byChannel: Record<string, ChannelPerformance>;
  byDay: Array<{
    date: Date;
    metrics: Record<string, number>;
  }>;
}

export interface ChannelPerformance {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cost: number;
  roi: number;
}

export interface UTMParameters {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
}

export interface TouchPoint {
  customerId?: string;
  timestamp: Date;
  channel: string;
  campaign?: string;
  action: string;
  value?: number;
  attributes?: Record<string, any>;
}

export interface AttributionPath {
  customerId: string;
  conversionId: string;
  revenue: number;
  touchpoints: TouchPoint[];
  attribution: Array<{
    touchpointIndex: number;
    credit: number;
    revenue: number;
  }>;
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/analytics-service//src/routes/dashboard.routes.ts:50:// Update a dashboard
backend/services/analytics-service//src/routes/dashboard.routes.ts:61:  dashboardController.updateDashboard
backend/services/analytics-service//src/routes/realtime.routes.ts:57:// Update counter
backend/services/analytics-service//src/routes/realtime.routes.ts:66:  realtimeController.updateCounter
backend/services/analytics-service//src/routes/widget.routes.ts:66:// Update a widget
backend/services/analytics-service//src/routes/widget.routes.ts:77:  widgetController.updateWidget
backend/services/analytics-service//src/routes/alerts.routes.ts:56:// Update an alert
backend/services/analytics-service//src/routes/alerts.routes.ts:69:  alertsController.updateAlert
backend/services/analytics-service//src/routes/reports.routes.ts:76:// Update report schedule
backend/services/analytics-service//src/routes/reports.routes.ts:85:  reportsController.updateReportSchedule
backend/services/analytics-service//src/analytics-engine/aggregators/metrics-aggregator.ts:34:      .select(
backend/services/analytics-service//src/analytics-engine/aggregators/metrics-aggregator.ts:56:      .select(
backend/services/analytics-service//src/analytics-engine/aggregators/metrics-aggregator.ts:101:      .select(
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:25:      .select(
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:89:      .select(
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:136:        SELECT 
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:148:        SELECT 
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:158:      SELECT 
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:9:      SELECT 
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:64:        SELECT 
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:75:      SELECT 
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:102:        SELECT 
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:114:      SELECT * FROM price_bands
backend/services/analytics-service//src/analytics-engine/calculators/revenue-calculator.ts:10:      .select(
backend/services/analytics-service//src/analytics-engine/calculators/revenue-calculator.ts:34:      .select(
backend/services/analytics-service//src/analytics-engine/calculators/revenue-calculator.ts:54:      .select(
backend/services/analytics-service//src/config/mongodb-schemas.ts:103:        // Update existing collection validation
backend/services/analytics-service//src/config/mongodb-schemas.ts:110:        logger.info(`Updated schema validation for ${collectionName}`);
backend/services/analytics-service//src/config/index.ts:67:    updateInterval: parseInt(process.env.ML_UPDATE_INTERVAL || '86400', 10),
backend/services/analytics-service//src/config/redis.ts:25:    // Pub/Sub clients for real-time updates
backend/services/analytics-service//src/config/websocket.ts:58:// Emit real-time updates
backend/services/analytics-service//src/config/websocket.ts:59:export function emitMetricUpdate(venueId: string, metric: string, data: any) {
backend/services/analytics-service//src/config/websocket.ts:63:  io.to(`venue:${venueId}`).emit('metric-update', {
backend/services/analytics-service//src/config/websocket.ts:71:  io.to(`metric:${metric}:${venueId}`).emit(`${metric}-update`, data);
backend/services/analytics-service//src/config/websocket.ts:85:export function emitWidgetUpdate(widgetId: string, data: any) {
backend/services/analytics-service//src/config/websocket.ts:88:  io.to(`widget:${widgetId}`).emit("widget-update", {
backend/services/analytics-service//src/config/database.ts:71:    await db.raw('SELECT 1');
backend/services/analytics-service//src/config/database.ts:72:    await analyticsDb.raw('SELECT 1');
backend/services/analytics-service//src/controllers/realtime.controller.ts:39:  updateCounter = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
backend/services/analytics-service//src/controllers/dashboard.controller.ts:30:  updateDashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
backend/services/analytics-service//src/controllers/reports.controller.ts:46:  updateReportSchedule = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
backend/services/analytics-service//src/controllers/reports.controller.ts:72:      this.success(res, { message: 'Schedule updated' });
backend/services/analytics-service//src/controllers/alerts.controller.ts:30:  updateAlert = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
backend/services/analytics-service//src/controllers/widget.controller.ts:38:  updateWidget = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
backend/services/analytics-service//src/utils/scheduler.ts:11:  // - ML model updates
backend/services/analytics-service//src/models/mongodb/campaign.schema.ts:31:  static async updateCampaign(
backend/services/analytics-service//src/models/mongodb/campaign.schema.ts:33:    updates: Partial<Campaign>
backend/services/analytics-service//src/models/mongodb/campaign.schema.ts:37:    const result = await collection.findOneAndUpdate(
backend/services/analytics-service//src/models/mongodb/campaign.schema.ts:39:      { $set: updates },
backend/services/analytics-service//src/models/mongodb/raw-analytics.schema.ts:75:    const update: any = {
backend/services/analytics-service//src/models/mongodb/raw-analytics.schema.ts:80:      update.$set = { processed: true };
backend/services/analytics-service//src/models/mongodb/raw-analytics.schema.ts:82:      update.$set = { lastProcessingError: error };
backend/services/analytics-service//src/models/mongodb/raw-analytics.schema.ts:85:    await collection.updateOne({ id }, update);
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:9:    data: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:15:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:48:  static async updateDashboard(
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:52:    return await this.update(id, {
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:54:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:80:      updated_at: new Date(),
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:82:      updated_by: userId
backend/services/analytics-service//src/models/postgres/dashboard.model.ts:110:    return await this.update(dashboardId, { permissions });
backend/services/analytics-service//src/models/postgres/metric.model.ts:66:      .select(db.raw(`${aggFunction}(value) as result`))
backend/services/analytics-service//src/models/postgres/aggregation.model.ts:86:      return await this.update(existing.id, {
backend/services/analytics-service//src/models/postgres/aggregation.model.ts:89:        updated_at: new Date()
backend/services/analytics-service//src/models/postgres/widget.model.ts:31:  static async updateWidget(
backend/services/analytics-service//src/models/postgres/widget.model.ts:35:    return await this.update(id, {
backend/services/analytics-service//src/models/postgres/widget.model.ts:37:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/widget.model.ts:41:  static async updateWidgetPosition(
backend/services/analytics-service//src/models/postgres/widget.model.ts:45:    return await this.update(id, {
backend/services/analytics-service//src/models/postgres/widget.model.ts:47:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/widget.model.ts:51:  static async updateWidgetSize(
backend/services/analytics-service//src/models/postgres/widget.model.ts:55:    return await this.update(id, {
backend/services/analytics-service//src/models/postgres/widget.model.ts:57:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/alert.model.ts:9:    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
backend/services/analytics-service//src/models/postgres/alert.model.ts:16:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/alert.model.ts:36:  static async updateAlert(
backend/services/analytics-service//src/models/postgres/alert.model.ts:40:    return await this.update(id, {
backend/services/analytics-service//src/models/postgres/alert.model.ts:42:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/alert.model.ts:50:    return await this.updateAlert(id, { enabled });
backend/services/analytics-service//src/models/postgres/alert.model.ts:61:      .update({
backend/services/analytics-service//src/models/postgres/alert.model.ts:106:      .update({
backend/services/analytics-service//src/models/postgres/alert.model.ts:110:        updated_at: new Date()
backend/services/analytics-service//src/models/postgres/alert.model.ts:124:      .update({
backend/services/analytics-service//src/models/postgres/alert.model.ts:127:        updated_at: new Date()
backend/services/analytics-service//src/models/postgres/base.model.ts:68:  static async update(
backend/services/analytics-service//src/models/postgres/base.model.ts:75:      .update({
backend/services/analytics-service//src/models/postgres/base.model.ts:77:        updated_at: new Date()
backend/services/analytics-service//src/models/postgres/export.model.ts:48:  static async updateExportStatus(
backend/services/analytics-service//src/models/postgres/export.model.ts:59:    return await this.update(id, {
backend/services/analytics-service//src/models/postgres/export.model.ts:62:      updated_at: new Date()
backend/services/analytics-service//src/models/postgres/export.model.ts:66:  static async updateProgress(
backend/services/analytics-service//src/models/postgres/export.model.ts:74:      .update({
backend/services/analytics-service//src/models/postgres/export.model.ts:76:        updated_at: new Date()
backend/services/analytics-service//src/models/redis/session.model.ts:63:  static async updateSession(
backend/services/analytics-service//src/models/redis/session.model.ts:65:    updates: Partial<AnalyticsSession>
backend/services/analytics-service//src/models/redis/session.model.ts:76:    const updated = {
backend/services/analytics-service//src/models/redis/session.model.ts:78:      ...updates,
backend/services/analytics-service//src/models/redis/session.model.ts:82:    await redis.set(key, JSON.stringify(updated));
backend/services/analytics-service//src/models/redis/session.model.ts:103:    await this.updateSession(sessionId, {
backend/services/analytics-service//src/models/redis/realtime.model.ts:9:  static async updateRealTimeMetric(
backend/services/analytics-service//src/models/redis/realtime.model.ts:21:    // Update current value
backend/services/analytics-service//src/models/redis/realtime.model.ts:37:      lastUpdated: new Date()
backend/services/analytics-service//src/models/redis/realtime.model.ts:40:    // Publish update
backend/services/analytics-service//src/models/redis/realtime.model.ts:41:    await this.publishMetricUpdate(venueId, metricType, metric);
backend/services/analytics-service//src/models/redis/realtime.model.ts:71:    // Update real-time metric
backend/services/analytics-service//src/models/redis/realtime.model.ts:72:    await this.updateRealTimeMetric(venueId, counterType, value);
backend/services/analytics-service//src/models/redis/realtime.model.ts:97:  static async publishMetricUpdate(
backend/services/analytics-service//src/models/redis/realtime.model.ts:131:          console.error('Error parsing metric update:', error);
backend/services/analytics-service//src/models/redis/realtime.model.ts:165:    // Publish update
backend/services/analytics-service//src/models/redis/realtime.model.ts:166:    await this.publishMetricUpdate(venueId, `gauge:${gaugeName}`, data);
backend/services/analytics-service//src/services/realtime-aggregation.service.ts:4:import { emitMetricUpdate, emitAlert } from '../config/websocket';
backend/services/analytics-service//src/services/realtime-aggregation.service.ts:89:        emitMetricUpdate(venueId, 'realtime-summary', metrics);
backend/services/analytics-service//src/services/realtime-aggregation.service.ts:150:        // Update database
backend/services/analytics-service//src/services/realtime-aggregation.service.ts:157:          .update({
backend/services/analytics-service//src/services/realtime-aggregation.service.ts:160:            updated_at: new Date()
backend/services/analytics-service//src/services/realtime-aggregation.service.ts:180:      .where('updated_at', '>', new Date(Date.now() - 86400000)) // Last 24 hours
backend/services/analytics-service//src/services/metrics.service.ts:43:      // Update real-time counter
backend/services/analytics-service//src/services/metrics.service.ts:44:      await RealtimeModel.updateRealTimeMetric(venueId, metricType, value);
backend/services/analytics-service//src/services/metrics.service.ts:251:      // Update real-time metrics
backend/services/analytics-service//src/services/metrics.service.ts:254:          RealtimeModel.updateRealTimeMetric(m.venueId, m.metricType, m.value)
backend/services/analytics-service//src/services/websocket.service.ts:1:import { getIO, emitMetricUpdate, emitWidgetUpdate } from '../config/websocket';
backend/services/analytics-service//src/services/websocket.service.ts:17:  async broadcastMetricUpdate(
backend/services/analytics-service//src/services/websocket.service.ts:24:      emitMetricUpdate(metricType, venueId, data);
backend/services/analytics-service//src/services/websocket.service.ts:26:      // Also update Redis for future connections
backend/services/analytics-service//src/services/websocket.service.ts:27:      await RealtimeModel.publishMetricUpdate(venueId, metricType, data);
backend/services/analytics-service//src/services/websocket.service.ts:29:      this.log.debug('Metric update broadcasted', { venueId, metricType });
backend/services/analytics-service//src/services/websocket.service.ts:31:      this.log.error('Failed to broadcast metric update', { error, venueId, metricType });
backend/services/analytics-service//src/services/websocket.service.ts:35:  async broadcastWidgetUpdate(
backend/services/analytics-service//src/services/websocket.service.ts:40:      emitWidgetUpdate(widgetId, data);
backend/services/analytics-service//src/services/websocket.service.ts:41:      this.log.debug('Widget update broadcasted', { widgetId });
backend/services/analytics-service//src/services/websocket.service.ts:43:      this.log.error('Failed to broadcast widget update', { error, widgetId });
backend/services/analytics-service//src/services/websocket.service.ts:147:          socket.emit('metric:update', {
backend/services/analytics-service//src/services/alert.service.ts:41:    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
backend/services/analytics-service//src/services/alert.service.ts:53:  async updateAlert(
backend/services/analytics-service//src/services/alert.service.ts:58:      const alert = await AlertModel.updateAlert(alertId, data);
backend/services/analytics-service//src/services/alert.service.ts:59:      this.log.info('Alert updated', { alertId });
backend/services/analytics-service//src/services/alert.service.ts:62:      this.log.error('Failed to update alert', { error, alertId });
backend/services/analytics-service//src/services/data-aggregation.service.ts:30:          updated_at: new Date()
backend/services/analytics-service//src/services/event-stream.service.ts:5:import { emitMetricUpdate } from '../config/websocket';
backend/services/analytics-service//src/services/event-stream.service.ts:40:      'cart-update',
backend/services/analytics-service//src/services/event-stream.service.ts:41:      'venue-update'
backend/services/analytics-service//src/services/event-stream.service.ts:68:      // Update real-time metrics
backend/services/analytics-service//src/services/event-stream.service.ts:69:      await this.updateRealTimeMetrics(type, data);
backend/services/analytics-service//src/services/event-stream.service.ts:73:        emitMetricUpdate(data.venueId, type, data);
backend/services/analytics-service//src/services/event-stream.service.ts:86:  private async updateRealTimeMetrics(type: string, event: StreamEvent) {
backend/services/analytics-service//src/services/event-stream.service.ts:91:        await this.updatePurchaseMetrics(venueId, data);
backend/services/analytics-service//src/services/event-stream.service.ts:95:        await this.updateScanMetrics(venueId, data);
backend/services/analytics-service//src/services/event-stream.service.ts:99:        await this.updateTrafficMetrics(venueId, data);
backend/services/analytics-service//src/services/event-stream.service.ts:104:  private async updatePurchaseMetrics(venueId: string, data: any) {
backend/services/analytics-service//src/services/event-stream.service.ts:107:    // Update real-time purchase metrics
backend/services/analytics-service//src/services/event-stream.service.ts:114:    // Update database with aggregated metrics
backend/services/analytics-service//src/services/event-stream.service.ts:130:        updated_at: new Date()
backend/services/analytics-service//src/services/event-stream.service.ts:134:  private async updateScanMetrics(venueId: string, data: any) {
backend/services/analytics-service//src/services/event-stream.service.ts:141:  private async updateTrafficMetrics(venueId: string, data: any) {
backend/services/analytics-service//src/services/validation.service.ts:177:    const sqlPatterns = /(\b(union|select|insert|update|delete|drop|create)\b)|(-{2})|\/\*|\*\//i;
backend/services/analytics-service//src/services/cache.service.ts:25:      .update(data)
backend/services/analytics-service//src/services/export.service.ts:50:      // Update status to processing
backend/services/analytics-service//src/services/export.service.ts:51:      await ExportModel.updateExportStatus(exportId, ExportStatus.PROCESSING);
backend/services/analytics-service//src/services/export.service.ts:79:      // Update export status
backend/services/analytics-service//src/services/export.service.ts:80:      await ExportModel.updateExportStatus(exportId, ExportStatus.COMPLETED, {
backend/services/analytics-service//src/services/export.service.ts:105:      await ExportModel.updateExportStatus(exportId, ExportStatus.FAILED, {
backend/services/analytics-service//src/services/anonymization.service.ts:27:      .update(`${config.privacy.customerHashSalt}-${date}`)
backend/services/analytics-service//src/services/anonymization.service.ts:31:  private checkAndUpdateSalt(): void {
backend/services/analytics-service//src/services/anonymization.service.ts:44:    this.checkAndUpdateSalt();
backend/services/analytics-service//src/services/anonymization.service.ts:48:      .update(`${customerId}-${this.dailySalt}`)
backend/services/analytics-service//src/services/anonymization.service.ts:54:    this.checkAndUpdateSalt();
backend/services/analytics-service//src/services/anonymization.service.ts:59:      .update(`${normalizedEmail}-${this.dailySalt}`)
backend/services/analytics-service//src/types/widget.types.ts:124:export interface WidgetUpdate {
backend/services/analytics-service//src/types/widget.types.ts:134:  lastUpdate?: Date;
backend/services/analytics-service//src/types/dashboard.types.ts:35:  type: 'date_range' | 'select' | 'multi_select' | 'search';
backend/services/analytics-service//src/types/alert.types.ts:17:  updatedAt: Date;
backend/services/analytics-service//src/types/common.types.ts:49:  updatedAt?: Date;
backend/services/analytics-service//src/types/common.types.ts:50:  updatedBy?: string;
backend/services/analytics-service//src/types/common.types.ts:73:  VENUE_UPDATED = 'venue.updated',
backend/services/analytics-service//src/types/common.types.ts:75:  EVENT_UPDATED = 'event.updated',
backend/services/analytics-service//src/types/common.types.ts:91:  USER_PROFILE_UPDATED = 'user.profile_updated',
backend/services/analytics-service//src/types/analytics.types.ts:33:  lastUpdated: Date;

### All JOIN operations:
backend/services/analytics-service//src/analytics-engine/analytics-engine.ts:165:    return `${query.venueId}:${query.metrics.join(',')}:${query.timeRange.start.toISOString()}:${query.timeRange.end.toISOString()}`;
backend/services/analytics-service//src/analytics-engine/aggregators/metrics-aggregator.ts:27:      throw new Error(`Invalid granularity: ${granularity}. Must be one of: ${validGranularities.join(', ')}`);
backend/services/analytics-service//src/analytics-engine/aggregators/metrics-aggregator.ts:41:      .join('events', 'tickets.event_id', 'events.id')
backend/services/analytics-service//src/analytics-engine/aggregators/metrics-aggregator.ts:63:      .join('events', 'tickets.event_id', 'events.id')
backend/services/analytics-service//src/analytics-engine/aggregators/metrics-aggregator.ts:110:      .leftJoin('tickets', 'events.id', 'tickets.event_id')
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:32:      .join('events', 'tickets.event_id', 'events.id')
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:95:      .join('events', 'tickets.event_id', 'events.id')
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:143:        JOIN events e ON t.event_id = e.id
backend/services/analytics-service//src/analytics-engine/calculators/revenue-calculator.ts:39:      .join('events', 'event_analytics.event_id', 'events.id')
backend/services/analytics-service//src/config/websocket.ts:22:      // Join venue-specific room
backend/services/analytics-service//src/config/websocket.ts:23:      socket.join(`venue:${venueId}`);
backend/services/analytics-service//src/config/websocket.ts:25:      // Join metric-specific rooms
backend/services/analytics-service//src/config/websocket.ts:27:        socket.join(`metric:${metric}:${venueId}`);
backend/services/analytics-service//src/models/postgres/metric.model.ts:58:      throw new Error(`Invalid aggregation function: ${aggregation}. Must be one of: ${Object.keys(validAggregations).join(', ')}`);
backend/services/analytics-service//src/models/redis/cache.model.ts:75:    return `analytics:${type}:${parts.join(':')}`;
backend/services/analytics-service//src/middleware/validation.ts:13:      const errorMessage = errorArray.map(error => error.msg).join(", ");
backend/services/analytics-service//src/services/websocket.service.ts:138:      // Join metric rooms
backend/services/analytics-service//src/services/websocket.service.ts:140:        socket.join(`metrics:${metric}:${venueId}`);
backend/services/analytics-service//src/services/export.service.ts:159:    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.csv`);
backend/services/analytics-service//src/services/export.service.ts:170:    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.xlsx`);
backend/services/analytics-service//src/services/export.service.ts:208:    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.pdf`);

### All WHERE clauses:
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:144:        WHERE e.venue_id = ? AND t.user_id IS NOT NULL
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:17:      WHERE venue_id = ?
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:71:        WHERE venue_id = ?
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:109:        WHERE venue_id = ?

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex from 'knex';
import { config } from './index';
import { logger } from '../utils/logger';

let db: any;
let analyticsDb: any;

export async function connectDatabases() {
  try {
    // Main database connection (through PgBouncer)
    db = knex({
      client: 'postgresql',
      connection: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
      },
      pool: {
        min: config.database.pool.min,
        max: config.database.pool.max,
        createTimeoutMillis: 3000,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
      },
      acquireConnectionTimeout: 30000,
    });

    // Analytics database connection (direct for read replicas)
    analyticsDb = knex({
      client: 'postgresql',
      connection: {
        host: config.analyticsDatabase.host,
        port: config.analyticsDatabase.port,
        database: config.analyticsDatabase.database,
        user: config.analyticsDatabase.user,
        password: config.analyticsDatabase.password,
      },
      pool: {
        min: 2,
        max: 10,
      },
    });

    // SECURITY FIX: Set tenant context using parameterized query
    db.on('query', (query: any) => {
      if ((global as any).currentTenant) {
        query.on('query', async () => {
          // Use parameterized query to prevent SQL injection
          // PostgreSQL doesn't allow parameterization of SET statements directly,
          // but we can validate the tenant ID format
          const tenantId = (global as any).currentTenant;
          
          // Validate tenant ID (should be UUID or similar safe format)
          if (!isValidTenantId(tenantId)) {
            logger.error(`Invalid tenant ID format: ${tenantId}`);
            throw new Error('Invalid tenant ID');
          }
          
          // Since SET doesn't support parameters, we validate and escape
          const escapedTenantId = escapeTenantId(tenantId);
          await db.raw(`SET app.current_tenant = ?`, [escapedTenantId]);
        });
      }
    });

    // Test connections
    await db.raw('SELECT 1');
    await analyticsDb.raw('SELECT 1');

    logger.info('Database connections established');
  } catch (error) {
    logger.error('Failed to connect to databases:', error);
    throw error;
  }
}

// Validate tenant ID format (adjust regex based on your tenant ID format)
function isValidTenantId(tenantId: string): boolean {
  // Example: UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Or alphanumeric with underscores/hyphens
  const alphanumericRegex = /^[a-zA-Z0-9_-]+$/;
  
  return uuidRegex.test(tenantId) || alphanumericRegex.test(tenantId);
}

// Escape tenant ID for safe SQL usage
function escapeTenantId(tenantId: string): string {
  // Remove any potentially dangerous characters
  // This is a backup in case validation fails
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function getAnalyticsDb() {
  if (!analyticsDb) {
    throw new Error('Analytics database not initialized');
  }
  return analyticsDb;
}

export async function closeDatabases() {
  if (db) {
    await db.destroy();
  }
  if (analyticsDb) {
    await analyticsDb.destroy();
  }
  logger.info('Database connections closed');
}
```
### .env.example
```
# ================================================
# ANALYTICS-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: analytics-service
# Port: 3007
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=analytics-service           # Service identifier

# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Analytics Database (Optional) ====
ANALYTICS_DB_HOST=localhost                    # Analytics DB host
ANALYTICS_DB_PORT=5432                        # Analytics DB port
ANALYTICS_DB_NAME=tickettoken_analytics       # Analytics DB name
ANALYTICS_DB_USER=analytics_user              # Analytics DB user
ANALYTICS_DB_PASSWORD=<CHANGE_ME>             # Analytics DB password

# ==== MongoDB Configuration (Optional) ====
MONGODB_URI=mongodb://localhost:27017/analytics
MONGODB_HOST=localhost                        # MongoDB host
MONGODB_PORT=27017                           # MongoDB port
MONGODB_DB=tickettoken_analytics             # MongoDB database
MONGODB_USER=<MONGO_USER>                    # MongoDB user
MONGODB_PASSWORD=<MONGO_PASSWORD>            # MongoDB password

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/realtime-aggregation.service.ts
```typescript
import { getRedis } from '../config/redis';
import { getAnalyticsDb } from '../config/database';
import { logger } from '../utils/logger';
import { emitMetricUpdate, emitAlert } from '../config/websocket';

interface AggregationWindow {
  interval: number; // in seconds
  retention: number; // in seconds
}

export class RealtimeAggregationService {
  private redis = getRedis();
  private analyticsDb = getAnalyticsDb();
  private intervalHandles: NodeJS.Timeout[] = [];
  
  private aggregationWindows: Record<string, AggregationWindow> = {
    '1min': { interval: 60, retention: 3600 },      // 1 hour retention
    '5min': { interval: 300, retention: 86400 },    // 24 hour retention
    '1hour': { interval: 3600, retention: 604800 }, // 7 day retention
  };

  async startAggregationPipeline() {
    logger.info('Starting real-time aggregation pipeline');

    // Set up aggregation intervals
    this.setupAggregationIntervals();

    // Set up alert monitoring
    this.setupAlertMonitoring();
  }

  private setupAggregationIntervals() {
    // Use the configuration to set up intervals
    if (this.aggregationWindows['1min']) {
      const interval = setInterval(
        () => this.aggregate1Minute(), 
        this.aggregationWindows['1min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 1-minute aggregation (interval: ${this.aggregationWindows['1min'].interval}s)`);
    }

    if (this.aggregationWindows['5min']) {
      const interval = setInterval(
        () => this.aggregate5Minutes(), 
        this.aggregationWindows['5min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 5-minute aggregation (interval: ${this.aggregationWindows['5min'].interval}s)`);
    }

    if (this.aggregationWindows['1hour']) {
      const interval = setInterval(
        () => this.aggregateHourly(), 
        this.aggregationWindows['1hour'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started hourly aggregation (interval: ${this.aggregationWindows['1hour'].interval}s)`);
    }
  }

  // Method to stop all intervals (useful for cleanup)
  stopAggregationPipeline() {
    this.intervalHandles.forEach(handle => clearInterval(handle));
    this.intervalHandles = [];
    logger.info('Stopped aggregation pipeline');
  }

  private async aggregate1Minute() {
    try {
      const venues = await this.getActiveVenues();
      const retention = this.aggregationWindows['1min'].retention;

      for (const venueId of venues) {
        const metrics = await this.calculate1MinuteMetrics(venueId);

        // Store in real-time metrics table with configured retention
        await this.analyticsDb('realtime_metrics')
          .insert({
            venue_id: venueId,
            metric_type: '1min_summary',
            metric_value: metrics,
            expires_at: new Date(Date.now() + retention * 1000)
          })
          .onConflict(['venue_id', 'metric_type'])
          .merge();

        // Emit to WebSocket
        emitMetricUpdate(venueId, 'realtime-summary', metrics);

        // Check for alerts
        await this.checkAlertConditions(venueId, metrics);
      }
    } catch (error) {
      logger.error('Failed to run 1-minute aggregation', error);
    }
  }

  private async calculate1MinuteMetrics(venueId: string) {
    const now = new Date();

    // Get Redis metrics
    const purchaseKey = `metrics:purchase:${venueId}:${now.toISOString().split('T')[0]}`;
    const trafficKey = `metrics:traffic:${venueId}:${now.toISOString().split('T')[0]}`;

    const [purchases, traffic] = await Promise.all([
      this.redis.hgetall(purchaseKey),
      this.redis.hgetall(trafficKey)
    ]);

    // Calculate rates
    const salesRate = parseInt(purchases.total_sales || '0') / 60; // per second
    const trafficRate = parseInt(traffic.page_views || '0') / 60;

    return {
      timestamp: now,
      sales: {
        count: parseInt(purchases.total_sales || '0'),
        revenue: parseFloat(purchases.revenue || '0'),
        rate: salesRate
      },
      traffic: {
        pageViews: parseInt(traffic.page_views || '0'),
        rate: trafficRate
      },
      conversion: {
        rate: trafficRate > 0 ? salesRate / trafficRate : 0
      }
    };
  }

  private async aggregate5Minutes() {
    // Similar to 1-minute but with 5-minute window
    logger.debug('Running 5-minute aggregation');
    // TODO: Implement 5-minute aggregation logic
  }

  private async aggregateHourly() {
    try {
      const venues = await this.getActiveVenues();

      for (const venueId of venues) {
        // Calculate hourly metrics
        const hour = new Date().getHours();
        const today = new Date().toISOString().split('T')[0];

        // Get all Redis metrics for the hour
        const hourlyMetrics = await this.calculateHourlyMetrics(venueId);

        // Update database
        await this.analyticsDb('venue_analytics')
          .where({
            venue_id: venueId,
            date: today,
            hour: hour
          })
          .update({
            unique_customers: hourlyMetrics.uniqueCustomers,
            events_active: hourlyMetrics.activeEvents,
            updated_at: new Date()
          });
      }
    } catch (error) {
      logger.error('Failed to run hourly aggregation', error);
    }
  }

  private async calculateHourlyMetrics(venueId: string) {
    // Implementation for hourly metrics
    return {
      uniqueCustomers: 0,
      activeEvents: 0
    };
  }

  private async getActiveVenues(): Promise<string[]> {
    // Get venues with recent activity
    const result = await this.analyticsDb('venue_analytics')
      .distinct('venue_id')
      .where('updated_at', '>', new Date(Date.now() - 86400000)) // Last 24 hours
      .pluck('venue_id');

    return result;
  }

  private setupAlertMonitoring() {
    // Monitor for alert conditions
    setInterval(() => this.monitorAlerts(), 30000); // Every 30 seconds
  }

  private async checkAlertConditions(venueId: string, metrics: any) {
    // High traffic alert
    if (metrics.traffic.rate > 100) { // 100 views per second
      await this.createAlert(venueId, {
        type: 'high_traffic',
        severity: 'info',
        message: `High traffic detected: ${metrics.traffic.rate.toFixed(2)} views/second`,
        data: metrics.traffic
      });
    }

    // Low conversion alert
    if (metrics.traffic.pageViews > 1000 && metrics.conversion.rate < 0.01) {
      await this.createAlert(venueId, {
        type: 'low_conversion',
        severity: 'warning',
        message: `Low conversion rate: ${(metrics.conversion.rate * 100).toFixed(2)}%`,
        data: metrics.conversion
      });
    }
  }

  private async createAlert(venueId: string, alert: any) {
    // Store alert
    await this.analyticsDb('venue_alerts')
      .insert({
        venue_id: venueId,
        alert_name: alert.type,
        is_active: true
      });

    // Emit alert via WebSocket
    emitAlert(venueId, alert);
  }

  private async monitorAlerts() {
    // Monitor and clear expired alerts
    logger.debug('Monitoring alerts');
  }
}

export const realtimeAggregationService = new RealtimeAggregationService();
```

### FILE: src/services/metrics.service.ts
```typescript
import { MetricModel } from '../models';
import { RealtimeModel, CacheModel } from '../models';
import { 
  Metric, 
  MetricType, 
  RealTimeMetric, 
  TimeGranularity,
  DateRange 
} from '../types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

export class MetricsService {
  private static instance: MetricsService;
  private log = logger.child({ component: 'MetricsService' });

  static getInstance(): MetricsService {
    if (!this.instance) {
      this.instance = new MetricsService();
    }
    return this.instance;
  }

  async recordMetric(
    venueId: string,
    metricType: MetricType,
    value: number,
    dimensions?: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<Metric> {
    try {
      // Create metric
      const metric = await MetricModel.createMetric({
        venueId,
        metricType,
        value,
        timestamp: new Date(),
        granularity: { unit: 'minute', value: 1 },
        dimensions,
        metadata
      });

      // Update real-time counter
      await RealtimeModel.updateRealTimeMetric(venueId, metricType, value);

      // Invalidate cache
      await CacheModel.invalidateVenueCache(venueId);

      this.log.debug('Metric recorded', {
        venueId,
        metricType,
        value
      });

      return metric;
    } catch (error) {
      this.log.error('Failed to record metric', { error, venueId, metricType });
      throw error;
    }
  }

  async getMetrics(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    try {
      // Check cache first
      const cacheKey = CacheModel.getCacheKey(
        'metrics',
        venueId,
        metricType,
        dateRange.startDate.toISOString(),
        dateRange.endDate.toISOString()
      );
      
      const cached = await CacheModel.get<Metric[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get from database
      const metrics = await MetricModel.getMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        granularity
      );

      // Cache results
      await CacheModel.set(cacheKey, metrics, CONSTANTS.CACHE_TTL.METRICS);

      return metrics;
    } catch (error) {
      this.log.error('Failed to get metrics', { error, venueId, metricType });
      throw error;
    }
  }

  async getRealTimeMetric(
    venueId: string,
    metricType: MetricType
  ): Promise<RealTimeMetric | null> {
    try {
      return await RealtimeModel.getRealTimeMetric(venueId, metricType);
    } catch (error) {
      this.log.error('Failed to get real-time metric', { error, venueId, metricType });
      throw error;
    }
  }

  async getRealTimeMetrics(
    venueId: string
  ): Promise<Record<string, RealTimeMetric>> {
    try {
      const metricTypes = Object.values(MetricType);
      const metrics: Record<string, RealTimeMetric> = {};

      await Promise.all(
        metricTypes.map(async (type) => {
          const metric = await this.getRealTimeMetric(venueId, type);
          if (metric) {
            metrics[type] = metric;
          }
        })
      );

      return metrics;
    } catch (error) {
      this.log.error('Failed to get real-time metrics', { error, venueId });
      throw error;
    }
  }

  async incrementCounter(
    venueId: string,
    counterType: string,
    by: number = 1
  ): Promise<number> {
    try {
      return await RealtimeModel.incrementCounter(venueId, counterType, by);
    } catch (error) {
      this.log.error('Failed to increment counter', { error, venueId, counterType });
      throw error;
    }
  }

  async aggregateMetric(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    try {
      return await MetricModel.aggregateMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        aggregation
      );
    } catch (error) {
      this.log.error('Failed to aggregate metric', { 
        error, 
        venueId, 
        metricType,
        aggregation 
      });
      throw error;
    }
  }

  async getMetricTrend(
    venueId: string,
    metricType: MetricType,
    periods: number,
    periodUnit: 'hour' | 'day' | 'week' | 'month'
  ): Promise<Array<{ period: Date; value: number; change: number }>> {
    try {
      const now = new Date();
      const results = [];

      for (let i = periods - 1; i >= 0; i--) {
        const periodStart = new Date(now);
        const periodEnd = new Date(now);

        switch (periodUnit) {
          case 'hour':
            periodStart.setHours(periodStart.getHours() - i - 1);
            periodEnd.setHours(periodEnd.getHours() - i);
            break;
          case 'day':
            periodStart.setDate(periodStart.getDate() - i - 1);
            periodEnd.setDate(periodEnd.getDate() - i);
            break;
          case 'week':
            periodStart.setDate(periodStart.getDate() - (i + 1) * 7);
            periodEnd.setDate(periodEnd.getDate() - i * 7);
            break;
          case 'month':
            periodStart.setMonth(periodStart.getMonth() - i - 1);
            periodEnd.setMonth(periodEnd.getMonth() - i);
            break;
        }

        const value = await this.aggregateMetric(
          venueId,
          metricType,
          { startDate: periodStart, endDate: periodEnd },
          'sum'
        );

        const previousValue: number = results[results.length - 1]?.value || 0;
        const change: number = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;

        results.push({
          period: periodEnd,
          value,
          change
        });
      }

      return results;
    } catch (error) {
      this.log.error('Failed to get metric trend', { error, venueId, metricType });
      throw error;
    }
  }

  async bulkRecordMetrics(
    metrics: Array<{
      venueId: string;
      metricType: MetricType;
      value: number;
      timestamp?: Date;
      dimensions?: Record<string, string>;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      const metricsToInsert = metrics.map(m => ({
        ...m,
        timestamp: m.timestamp || new Date(),
        granularity: { unit: 'minute' as const, value: 1 }
      }));

      await MetricModel.bulkInsert(metricsToInsert);

      // Update real-time metrics
      await Promise.all(
        metrics.map(m => 
          RealtimeModel.updateRealTimeMetric(m.venueId, m.metricType, m.value)
        )
      );

      this.log.debug('Bulk metrics recorded', { count: metrics.length });
    } catch (error) {
      this.log.error('Failed to bulk record metrics', { error });
      throw error;
    }
  }

  async getCapacityMetrics(
    venueId: string,
    eventId: string
  ): Promise<{
    totalCapacity: number;
    soldTickets: number;
    availableTickets: number;
    occupancyRate: number;
  }> {
    try {
      // This would integrate with the venue and ticket services
      // For now, return mock data
      const totalCapacity = 1000;
      const soldTickets = 750;
      const availableTickets = totalCapacity - soldTickets;
      const occupancyRate = (soldTickets / totalCapacity) * 100;

      return {
        totalCapacity,
        soldTickets,
        availableTickets,
        occupancyRate
      };
    } catch (error) {
      this.log.error('Failed to get capacity metrics', { error, venueId, eventId });
      throw error;
    }
  }
}

export const metricsService = MetricsService.getInstance();
```

### FILE: src/services/attribution.service.ts
```typescript
import { CampaignSchema } from '../models';
import {
  MarketingAttribution,
  AttributionPath,
  TouchPoint,
} from '../types';
import { logger } from '../utils/logger';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class AttributionService {
  private static instance: AttributionService;
  private log = logger.child({ component: 'AttributionService' });

  static getInstance(): AttributionService {
    if (!this.instance) {
      this.instance = new AttributionService();
    }
    return this.instance;
  }

  async trackTouchpoint(
    venueId: string,
    customerId: string,
    touchpoint: TouchPoint
  ): Promise<void> {
    try {
      await CampaignSchema.trackTouchpoint({
        ...touchpoint,
        venueId,
        customerId
      } as any);

      this.log.debug('Touchpoint tracked', {
        venueId,
        customerId,
        channel: touchpoint.channel
      });
    } catch (error) {
      this.log.error('Failed to track touchpoint', { error, venueId });
      throw error;
    }
  }

  async getCustomerJourney(
    venueId: string,
    customerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TouchPoint[]> {
    try {
      return await CampaignSchema.getCustomerTouchpoints(
        venueId,
        customerId,
        startDate,
        endDate
      );
    } catch (error) {
      this.log.error('Failed to get customer journey', { error, venueId });
      throw error;
    }
  }

  async calculateAttribution(
    venueId: string,
    conversionId: string,
    revenue: number,
    model: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven' = 'last_touch'
  ): Promise<AttributionPath> {
    try {
      // Get all touchpoints for this conversion
      const touchpoints = await this.getConversionTouchpoints(venueId, conversionId);

      if (touchpoints.length === 0) {
        throw new Error('No touchpoints found for conversion');
      }

      const attribution = this.applyAttributionModel(touchpoints, revenue, model);

      const path: AttributionPath = {
        customerId: touchpoints[0].customerId || '',
        conversionId,
        revenue,
        touchpoints,
        attribution
      };

      // Cache attribution result
      const cacheKey = CacheModel.getCacheKey('attribution', venueId, conversionId);
      await CacheModel.set(cacheKey, path, CONSTANTS.CACHE_TTL.INSIGHTS);

      return path;
    } catch (error) {
      this.log.error('Failed to calculate attribution', { error, venueId });
      throw error;
    }
  }

  private applyAttributionModel(
    touchpoints: TouchPoint[],
    revenue: number,
    model: string
  ): Array<{ touchpointIndex: number; credit: number; revenue: number }> {
    const attribution = [];
    const n = touchpoints.length;

    switch (model) {
      case 'first_touch':
        attribution.push({
          touchpointIndex: 0,
          credit: 1.0,
          revenue: revenue
        });
        break;

      case 'last_touch':
        attribution.push({
          touchpointIndex: n - 1,
          credit: 1.0,
          revenue: revenue
        });
        break;

      case 'linear':
        const linearCredit = 1.0 / n;
        for (let i = 0; i < n; i++) {
          attribution.push({
            touchpointIndex: i,
            credit: linearCredit,
            revenue: revenue * linearCredit
          });
        }
        break;

      case 'time_decay':
        const halfLife = 7; // days
        const lastTouch = touchpoints[n - 1].timestamp;
        let totalWeight = 0;
        const weights = touchpoints.map(tp => {
          const daysFromLast = (lastTouch.getTime() - tp.timestamp.getTime()) / (1000 * 60 * 60 * 24);
          const weight = Math.pow(2, -daysFromLast / halfLife);
          totalWeight += weight;
          return weight;
        });

        touchpoints.forEach((_, i) => {
          const credit = weights[i] / totalWeight;
          attribution.push({
            touchpointIndex: i,
            credit,
            revenue: revenue * credit
          });
        });
        break;

      case 'data_driven':
        // Simplified data-driven model
        // In production, this would use ML models
        const channelWeights: Record<string, number> = {
          'organic': 0.3,
          'paid_search': 0.25,
          'social': 0.2,
          'email': 0.15,
          'direct': 0.1
        };

        let totalChannelWeight = 0;
        const credits = touchpoints.map(tp => {
          const weight = channelWeights[tp.channel] || 0.1;
          totalChannelWeight += weight;
          return weight;
        });

        touchpoints.forEach((_, i) => {
          const credit = credits[i] / totalChannelWeight;
          attribution.push({
            touchpointIndex: i,
            credit,
            revenue: revenue * credit
          });
        });
        break;
    }

    return attribution;
  }

  async getChannelPerformance(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MarketingAttribution> {
    try {
      // Get all conversions and their touchpoints
      const conversions = await this.getConversions(venueId, startDate, endDate);
      const channelMetrics = new Map<string, any>();

      for (const conversion of conversions) {
        const attribution = await this.calculateAttribution(
          venueId,
          conversion.id,
          conversion.revenue,
          'linear'
        );

        // Aggregate by channel
        attribution.attribution.forEach((attr) => {
          const touchpoint = attribution.touchpoints[attr.touchpointIndex];
          const channel = touchpoint.channel;

          if (!channelMetrics.has(channel)) {
            channelMetrics.set(channel, {
              channel,
              source: touchpoint.channel,
              medium: touchpoint.channel,
              visits: 0,
              conversions: 0,
              revenue: 0,
              cost: 0
            });
          }

          const metrics = channelMetrics.get(channel);
          metrics.visits += attr.credit;
          metrics.conversions += attr.credit;
          metrics.revenue += attr.revenue;
        });
      }

      // Calculate ROI and CPA
      const channels = Array.from(channelMetrics.values()).map(metrics => ({
        ...metrics,
        roi: metrics.cost > 0 ? ((metrics.revenue - metrics.cost) / metrics.cost) * 100 : 0,
        costPerAcquisition: metrics.conversions > 0 ? metrics.cost / metrics.conversions : 0
      }));

      // Multi-touch attribution summary
      const multiTouchAttribution = channels.map(ch => ({
        touchpoint: ch.channel,
        attribution: ch.conversions,
        revenue: ch.revenue
      }));

      return {
        channels,
        multiTouchAttribution
      };
    } catch (error) {
      this.log.error('Failed to get channel performance', { error, venueId });
      throw error;
    }
  }

  async getCampaignROI(
    venueId: string,
    campaignId: string
  ): Promise<{
    revenue: number;
    cost: number;
    roi: number;
    conversions: number;
    costPerAcquisition: number;
  }> {
    try {
      const performance = await CampaignSchema.getCampaignPerformance(campaignId);

      const totals = performance.reduce((acc: any, channel: any) => ({
        revenue: acc.revenue + channel.revenue,
        conversions: acc.conversions + channel.conversions,
        cost: acc.cost + (channel.cost || 0)
      }), { revenue: 0, conversions: 0, cost: 0 });

      return {
        ...totals,
        roi: totals.cost > 0 ? ((totals.revenue - totals.cost) / totals.cost) * 100 : 0,
        costPerAcquisition: totals.conversions > 0 ? totals.cost / totals.conversions : 0
      };
    } catch (error) {
      this.log.error('Failed to get campaign ROI', { error, venueId, campaignId });
      throw error;
    }
  }

  private async getConversionTouchpoints(
    _venueId: string,
    _conversionId: string
  ): Promise<TouchPoint[]> {
    // In production, this would query the actual conversion data
    // For now, return mock touchpoints
    return [
      {
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        channel: 'organic',
        action: 'visit',
        value: 0,
        campaign: 'none',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        channel: 'email',
        action: 'click',
        value: 0,
        campaign: 'weekly-newsletter',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        channel: 'paid_search',
        action: 'click',
        value: 0,
        campaign: 'brand-campaign',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(),
        channel: 'direct',
        action: 'conversion',
        value: 150,
        campaign: 'none',
        customerId: 'cust-1'
      }
    ];
  }

  private async getConversions(
    _venueId: string,
    _startDate: Date,
    _endDate: Date
  ): Promise<Array<{ id: string; revenue: number; customerId: string }>> {
    // In production, this would query actual conversion data
    // For now, return mock data
    return [
      { id: 'conv-1', revenue: 150, customerId: 'cust-1' },
      { id: 'conv-2', revenue: 200, customerId: 'cust-2' },
      { id: 'conv-3', revenue: 100, customerId: 'cust-3' }
    ];
  }
}

export const attributionService = AttributionService.getInstance();
```

### FILE: src/services/websocket.service.ts
```typescript
import { getIO, emitMetricUpdate, emitWidgetUpdate } from '../config/websocket';
import { RealTimeMetric, WidgetData } from '../types';
import { logger } from '../utils/logger';
import { RealtimeModel } from '../models';

export class WebSocketService {
  private static instance: WebSocketService;
  private log = logger.child({ component: 'WebSocketService' });

  static getInstance(): WebSocketService {
    if (!this.instance) {
      this.instance = new WebSocketService();
    }
    return this.instance;
  }

  async broadcastMetricUpdate(
    venueId: string,
    metricType: string,
    data: RealTimeMetric
  ): Promise<void> {
    try {
      // Emit to all subscribers of this metric
      emitMetricUpdate(metricType, venueId, data);
      
      // Also update Redis for future connections
      await RealtimeModel.publishMetricUpdate(venueId, metricType, data);
      
      this.log.debug('Metric update broadcasted', { venueId, metricType });
    } catch (error) {
      this.log.error('Failed to broadcast metric update', { error, venueId, metricType });
    }
  }

  async broadcastWidgetUpdate(
    widgetId: string,
    data: WidgetData
  ): Promise<void> {
    try {
      emitWidgetUpdate(widgetId, data);
      this.log.debug('Widget update broadcasted', { widgetId });
    } catch (error) {
      this.log.error('Failed to broadcast widget update', { error, widgetId });
    }
  }

  async broadcastToVenue(
    venueId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      io.to(`venue:${venueId}`).emit(event, data);
      this.log.debug('Event broadcasted to venue', { venueId, event });
    } catch (error) {
      this.log.error('Failed to broadcast to venue', { error, venueId, event });
    }
  }

  async broadcastToUser(
    userId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      // Find sockets for this user
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);
      
      userSockets.forEach(socket => {
        socket.emit(event, data);
      });
      
      this.log.debug('Event broadcasted to user', { userId, event, socketCount: userSockets.length });
    } catch (error) {
      this.log.error('Failed to broadcast to user', { error, userId, event });
    }
  }

  async getConnectedClients(): Promise<{
    total: number;
    byVenue: Record<string, number>;
  }> {
    try {
      const io = getIO();
      const sockets = await io.fetchSockets();
      
      const byVenue: Record<string, number> = {};
      
      sockets.forEach(socket => {
        const venueId = socket.data.venueId;
        if (venueId) {
          byVenue[venueId] = (byVenue[venueId] || 0) + 1;
        }
      });
      
      return {
        total: sockets.length,
        byVenue
      };
    } catch (error) {
      this.log.error('Failed to get connected clients', { error });
      return { total: 0, byVenue: {} };
    }
  }

  async disconnectUser(userId: string, reason?: string): Promise<void> {
    try {
      const io = getIO();
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);
      
      userSockets.forEach(socket => {
        socket.disconnect(true);
      });
      
      this.log.info('User disconnected', { userId, reason, socketCount: userSockets.length });
    } catch (error) {
      this.log.error('Failed to disconnect user', { error, userId });
    }
  }

  async subscribeToMetrics(
    socketId: string,
    venueId: string,
    metrics: string[]
  ): Promise<void> {
    try {
      const io = getIO();
      const socket = io.sockets.sockets.get(socketId);
      
      if (!socket) {
        throw new Error('Socket not found');
      }
      
      // Join metric rooms
      metrics.forEach(metric => {
        socket.join(`metrics:${metric}:${venueId}`);
      });
      
      // Send current values
      for (const metric of metrics) {
        const currentValue = await RealtimeModel.getRealTimeMetric(venueId, metric);
        if (currentValue) {
          socket.emit('metric:update', {
            type: metric,
            venueId,
            data: currentValue,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      this.log.debug('Socket subscribed to metrics', { socketId, venueId, metrics });
    } catch (error) {
      this.log.error('Failed to subscribe to metrics', { error, socketId });
    }
  }

  async unsubscribeFromMetrics(
    socketId: string,
    venueId: string,
    metrics: string[]
  ): Promise<void> {
    try {
      const io = getIO();
      const socket = io.sockets.sockets.get(socketId);
      
      if (!socket) {
        return;
      }
      
      // Leave metric rooms
      metrics.forEach(metric => {
        socket.leave(`metrics:${metric}:${venueId}`);
      });
      
      this.log.debug('Socket unsubscribed from metrics', { socketId, venueId, metrics });
    } catch (error) {
      this.log.error('Failed to unsubscribe from metrics', { error, socketId });
    }
  }

  async getRoomSubscribers(room: string): Promise<number> {
    try {
      const io = getIO();
      const sockets = await io.in(room).fetchSockets();
      return sockets.length;
    } catch (error) {
      this.log.error('Failed to get room subscribers', { error, room });
      return 0;
    }
  }
}

export const websocketService = WebSocketService.getInstance();
```

### FILE: src/services/alert.service.ts
```typescript
import { AlertModel } from '../models';
import {
  Alert,
  AlertInstance,
  ComparisonOperator
} from '../types';
import { logger } from '../utils/logger';
import { messageGatewayService } from './message-gateway.service';
import { metricsService } from './metrics.service';

export class AlertService {
  private static instance: AlertService;
  private log = logger.child({ component: 'AlertService' });
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): AlertService {
    if (!this.instance) {
      this.instance = new AlertService();
    }
    return this.instance;
  }

  async startMonitoring(): Promise<void> {
    // Check alerts every minute
    this.checkInterval = setInterval(() => {
      this.checkAllAlerts();
    }, 60000);

    this.log.info('Alert monitoring started');
  }

  async stopMonitoring(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.log.info('Alert monitoring stopped');
  }

  async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    try {
      const alert = await AlertModel.createAlert(data);
      this.log.info('Alert created', { alertId: alert.id, name: alert.name });
      return alert;
    } catch (error) {
      this.log.error('Failed to create alert', { error });
      throw error;
    }
  }

  async updateAlert(
    alertId: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    try {
      const alert = await AlertModel.updateAlert(alertId, data);
      this.log.info('Alert updated', { alertId });
      return alert;
    } catch (error) {
      this.log.error('Failed to update alert', { error, alertId });
      throw error;
    }
  }

  async toggleAlert(alertId: string, enabled: boolean): Promise<Alert> {
    try {
      const alert = await AlertModel.toggleAlert(alertId, enabled);
      this.log.info('Alert toggled', { alertId, enabled });
      return alert;
    } catch (error) {
      this.log.error('Failed to toggle alert', { error, alertId });
      throw error;
    }
  }

  private async checkAllAlerts(): Promise<void> {
    try {
      // Get all enabled alerts
      const venues = await this.getMonitoredVenues();

      for (const venueId of venues) {
        const alerts = await AlertModel.getAlertsByVenue(venueId, true);

        for (const alert of alerts) {
          await this.checkAlert(alert);
        }
      }
    } catch (error) {
      this.log.error('Failed to check alerts', { error });
    }
  }

  private async checkAlert(alert: Alert): Promise<void> {
    try {
      // Check if within schedule
      if (!this.isWithinSchedule(alert)) {
        return;
      }

      // Evaluate all conditions
      const triggered = await this.evaluateConditions(alert);

      if (triggered) {
        // Check if already triggered recently
        const recentInstance = await this.getRecentAlertInstance(alert.id);
        if (recentInstance && recentInstance.status === 'active') {
          return; // Already triggered
        }

        // Create alert instance
        const instance = await this.triggerAlert(alert);

        // Execute actions
        await this.executeActions(alert, instance);
      } else {
        // Check if we need to resolve an active alert
        const activeInstance = await this.getActiveAlertInstance(alert.id);
        if (activeInstance) {
          await this.resolveAlert(activeInstance);
        }
      }
    } catch (error) {
      this.log.error('Failed to check alert', { error, alertId: alert.id });
    }
  }

  private async evaluateConditions(alert: Alert): Promise<boolean> {
    try {
      for (const condition of alert.conditions) {
        const currentValue = await this.getMetricValue(
          alert.venueId,
          condition.metric
        );

        if (!this.evaluateCondition(currentValue, condition.operator, condition.value)) {
          return false; // All conditions must be met
        }
      }

      return true;
    } catch (error) {
      this.log.error('Failed to evaluate conditions', { error, alertId: alert.id });
      return false;
    }
  }

  private evaluateCondition(
    currentValue: number,
    operator: ComparisonOperator,
    threshold: number
  ): boolean {
    switch (operator) {
      case ComparisonOperator.EQUALS:
        return currentValue === threshold;
      case ComparisonOperator.NOT_EQUALS:
        return currentValue !== threshold;
      case ComparisonOperator.GREATER_THAN:
        return currentValue > threshold;
      case ComparisonOperator.LESS_THAN:
        return currentValue < threshold;
      case ComparisonOperator.GREATER_THAN_OR_EQUALS:
        return currentValue >= threshold;
      case ComparisonOperator.LESS_THAN_OR_EQUALS:
        return currentValue <= threshold;
      default:
        return false;
    }
  }

  private async getMetricValue(venueId: string, metric: string): Promise<number> {
    // Get current metric value from real-time metrics
    const realTimeMetric = await metricsService.getRealTimeMetric(venueId, metric as any);
    return realTimeMetric?.currentValue || 0;
  }

  private async triggerAlert(alert: Alert): Promise<AlertInstance> {
    try {
      // Increment trigger count
      await AlertModel.incrementTriggerCount(alert.id);

      // Create alert instance
      const instance = await AlertModel.createAlertInstance({
        alertId: alert.id,
        triggeredAt: new Date(),
        severity: alert.severity,
        status: 'active',
        triggerValues: await this.getCurrentTriggerValues(alert),
        message: this.generateAlertMessage(alert),
        actions: alert.actions.map(action => ({
          type: action.type,
          status: 'pending'
        }))
      });

      this.log.info('Alert triggered', {
        alertId: alert.id,
        instanceId: instance.id,
        severity: alert.severity
      });

      return instance;
    } catch (error) {
      this.log.error('Failed to trigger alert', { error, alertId: alert.id });
      throw error;
    }
  }

  private async executeActions(alert: Alert, instance: AlertInstance): Promise<void> {
    for (const action of alert.actions) {
      try {
        // Apply delay if specified
        if (action.delay) {
          await new Promise(resolve => setTimeout(resolve, action.delay! * 60000));
        }

        switch (action.type) {
          case 'email':
            await messageGatewayService.sendAlertNotification(
              instance,
              'email',
              action.config.recipients?.[0] || ''
            );
            break;

          case 'sms':
            await messageGatewayService.sendAlertNotification(
              instance,
              'sms',
              action.config.phoneNumbers?.[0] || ''
            );
            break;

          case 'slack':
            await messageGatewayService.sendAlertNotification(
              instance,
              'slack',
              action.config.channel || ''
            );
            break;

          case 'webhook':
            await this.sendWebhook(action.config, instance);
            break;
        }
      } catch (error) {
        this.log.error('Failed to execute alert action', {
          error,
          alertId: alert.id,
          actionType: action.type
        });
      }
    }
  }

  private async sendWebhook(config: any, _instance: AlertInstance): Promise<void> {
    // In production, make actual HTTP request
    this.log.info('Webhook sent', { url: config.url });
  }

  private async resolveAlert(instance: AlertInstance): Promise<void> {
    try {
      await AlertModel.resolveAlertInstance(instance.id);
      this.log.info('Alert resolved', { instanceId: instance.id });
    } catch (error) {
      this.log.error('Failed to resolve alert', { error, instanceId: instance.id });
    }
  }

  private isWithinSchedule(alert: Alert): boolean {
    if (!alert.schedule) return true;

    const now = new Date();
    const { activeHours, activeDays } = alert.schedule;

    // Check active days
    if (activeDays && !activeDays.includes(now.getDay())) {
      return false;
    }

    // Check active hours
    if (activeHours) {
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [startHour, startMin] = activeHours.start.split(':').map(Number);
      const [endHour, endMin] = activeHours.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }

    return true;
  }

  private async getCurrentTriggerValues(alert: Alert): Promise<Record<string, any>> {
    const values: Record<string, any> = {};

    for (const condition of alert.conditions) {
      values[condition.metric] = await this.getMetricValue(alert.venueId, condition.metric);
    }

    return values;
  }

  private generateAlertMessage(alert: Alert): string {
    return `Alert: ${alert.name} - ${alert.description || 'Threshold exceeded'}`;
  }

  private async getRecentAlertInstance(alertId: string): Promise<AlertInstance | null> {
    const instances = await AlertModel.getAlertInstances(alertId, 1);
    return instances[0] || null;
  }

  private async getActiveAlertInstance(alertId: string): Promise<AlertInstance | null> {
    const instances = await AlertModel.getAlertInstances(alertId, 10);
    return instances.find(i => i.status === 'active') || null;
  }

  private async getMonitoredVenues(): Promise<string[]> {
    // In production, get list of venues with active alerts
    // For now, return mock data
    return ['venue-1', 'venue-2'];
  }

  async getAlertsByVenue(venueId: string): Promise<Alert[]> {
    return await AlertModel.getAlertsByVenue(venueId);
  }

  async getAlertInstances(alertId: string, limit: number = 50): Promise<AlertInstance[]> {
    return await AlertModel.getAlertInstances(alertId, limit);
  }

  async acknowledgeAlert(instanceId: string, userId: string, notes?: string): Promise<AlertInstance> {
    return await AlertModel.acknowledgeAlertInstance(instanceId, userId, notes);
  }
}

export const alertService = AlertService.getInstance();
```

### FILE: src/services/customer-intelligence.service.ts
```typescript
import { EventSchema } from '../models';
import { 
  CustomerProfile,
  CustomerSegment,
  CustomerInsight,
  InsightType,
  RFMAnalysis,
} from '../types';
import { logger } from '../utils/logger';
import { anonymizationService } from './anonymization.service';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class CustomerIntelligenceService {
  private static instance: CustomerIntelligenceService;
  private log = logger.child({ component: 'CustomerIntelligenceService' });

  static getInstance(): CustomerIntelligenceService {
    if (!this.instance) {
      this.instance = new CustomerIntelligenceService();
    }
    return this.instance;
  }

  async getCustomerProfile(
    venueId: string,
    customerId: string
  ): Promise<CustomerProfile | null> {
    try {
      // Hash the customer ID for privacy
      const hashedCustomerId = await anonymizationService.hashCustomerId(customerId);

      // Check cache
      const cacheKey = CacheModel.getCacheKey('customer', venueId, hashedCustomerId);
      const cached = await CacheModel.get<CustomerProfile>(cacheKey);
      if (cached) {
        return cached;
      }

      // Aggregate customer data from events
      const events = await EventSchema.getEvents(venueId, {
        userId: hashedCustomerId,
        limit: 10000
      });

      if (events.length === 0) {
        return null;
      }

      // Calculate metrics
      const profile = await this.calculateCustomerMetrics(
        venueId,
        hashedCustomerId,
        events
      );

      // Cache profile
      await CacheModel.set(cacheKey, profile, CONSTANTS.CACHE_TTL.CUSTOMER_PROFILE);

      return profile;
    } catch (error) {
      this.log.error('Failed to get customer profile', { error, venueId });
      throw error;
    }
  }

  private async calculateCustomerMetrics(
    venueId: string,
    customerId: string,
    events: any[]
  ): Promise<CustomerProfile> {
    const purchaseEvents = events.filter(e => e.eventType === 'ticket.purchased');
    const firstPurchase = purchaseEvents[0];
    const lastPurchase = purchaseEvents[purchaseEvents.length - 1];

    const totalSpent = purchaseEvents.reduce((sum, e) => 
      sum + (e.properties?.amount || 0), 0
    );
    
    const totalTickets = purchaseEvents.reduce((sum, e) => 
      sum + (e.properties?.quantity || 1), 0
    );

    const averageOrderValue = purchaseEvents.length > 0 
      ? totalSpent / purchaseEvents.length 
      : 0;

    const daysSinceLastPurchase = lastPurchase 
      ? Math.floor((Date.now() - new Date(lastPurchase.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const purchaseFrequency = purchaseEvents.length > 1
      ? purchaseEvents.length / 
        ((new Date(lastPurchase.timestamp).getTime() - 
          new Date(firstPurchase.timestamp).getTime()) / 
          (1000 * 60 * 60 * 24 * 365))
      : 0;

    // Determine segment
    const segment = this.determineCustomerSegment({
      totalSpent,
      purchaseFrequency,
      daysSinceLastPurchase,
      totalTickets
    });

    // Predict lifetime value (simplified)
    const predictedLifetimeValue = averageOrderValue * purchaseFrequency * 3; // 3 year horizon

    // Calculate churn probability
    const churnProbability = this.calculateChurnProbability(
      daysSinceLastPurchase,
      purchaseFrequency
    );

    // Analyze preferences
    const attributes = await this.analyzeCustomerAttributes(events);

    return {
      customerId,
      venueId,
      firstSeen: new Date(firstPurchase?.timestamp || Date.now()),
      lastSeen: new Date(lastPurchase?.timestamp || Date.now()),
      totalSpent,
      totalTickets,
      averageOrderValue,
      purchaseFrequency,
      daysSinceLastPurchase,
      segment,
      predictedLifetimeValue,
      churnProbability,
      attributes
    };
  }

  private determineCustomerSegment(metrics: {
    totalSpent: number;
    purchaseFrequency: number;
    daysSinceLastPurchase: number;
    totalTickets: number;
  }): CustomerSegment {
    const { totalSpent, purchaseFrequency, daysSinceLastPurchase, totalTickets } = metrics;

    if (totalTickets === 0) {
      return CustomerSegment.NEW;
    }

    if (daysSinceLastPurchase > 365) {
      return CustomerSegment.LOST;
    }

    if (daysSinceLastPurchase > 180) {
      return CustomerSegment.DORMANT;
    }

    if (daysSinceLastPurchase > 90) {
      return CustomerSegment.AT_RISK;
    }

    if (totalSpent > 1000 && purchaseFrequency > 4) {
      return CustomerSegment.VIP;
    }

    if (purchaseFrequency > 2) {
      return CustomerSegment.REGULAR;
    }

    return CustomerSegment.OCCASIONAL;
  }

  private calculateChurnProbability(
    daysSinceLastPurchase: number,
    purchaseFrequency: number
  ): number {
    // Simplified churn calculation
    let probability = 0;

    if (daysSinceLastPurchase > 180) {
      probability = 0.8;
    } else if (daysSinceLastPurchase > 90) {
      probability = 0.6;
    } else if (daysSinceLastPurchase > 60) {
      probability = 0.4;
    } else if (daysSinceLastPurchase > 30) {
      probability = 0.2;
    } else {
      probability = 0.1;
    }

    // Adjust based on purchase frequency
    if (purchaseFrequency > 4) {
      probability *= 0.5;
    } else if (purchaseFrequency > 2) {
      probability *= 0.7;
    }

    return Math.min(probability, 1);
  }

  private async analyzeCustomerAttributes(events: any[]): Promise<any> {
    const attributes: any = {
      preferences: {},
      behavior: {}
    };

    // Analyze event types
    const eventTypes = new Map<string, number>();
    events.forEach(e => {
      const type = e.properties?.eventType || 'unknown';
      eventTypes.set(type, (eventTypes.get(type) || 0) + 1);
    });

    // Find favorite event type
    let maxCount = 0;
    let favoriteType = '';
    eventTypes.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        favoriteType = type;
      }
    });

    if (favoriteType) {
      attributes.preferences.eventTypes = [favoriteType];
    }

    // Analyze purchase times
    const purchaseTimes = events
      .filter(e => e.eventType === 'ticket.purchased')
      .map(e => new Date(e.timestamp).getHours());

    if (purchaseTimes.length > 0) {
      const avgHour = Math.round(
        purchaseTimes.reduce((sum, hour) => sum + hour, 0) / purchaseTimes.length
      );
      
      if (avgHour < 12) {
        attributes.behavior.purchaseTime = 'morning';
      } else if (avgHour < 17) {
        attributes.behavior.purchaseTime = 'afternoon';
      } else {
        attributes.behavior.purchaseTime = 'evening';
      }
    }

    return attributes;
  }

  // Fixed generateCustomerInsights method
  async generateCustomerInsights(
    venueId: string,
    customerId: string
  ): Promise<CustomerInsight[]> {
    try {
      const profile = await this.getCustomerProfile(venueId, customerId);
      if (!profile) {
        return [];
      }

      const insights: CustomerInsight[] = [];

      // Churn risk insight
      if (profile.churnProbability > 0.6) {
        insights.push({
          customerId: profile.customerId,
          type: InsightType.CHURN_RISK,
          title: "High Churn Risk",
          description: `Customer has ${profile.churnProbability * 100}% chance of churning`,
          impact: "high" as const,
          actionable: true,
          suggestedActions: [
            "Send personalized retention offer",
            "Reach out with exclusive event previews",
            "Offer loyalty program upgrade"
          ],
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          metadata: {
            daysSinceLastPurchase: profile.daysSinceLastPurchase,
            previousPurchaseCount: profile.totalPurchases
          }
        });
      }

      // Low engagement insight
      if (profile.daysSinceLastPurchase > 90) {
        insights.push({
          customerId: profile.customerId,
          type: InsightType.LOW_ENGAGEMENT,
          title: "Inactive Customer",
          description: `No purchases in ${profile.daysSinceLastPurchase} days`,
          impact: "medium" as const,
          actionable: true,
          suggestedActions: [
            "Send re-engagement campaign",
            "Offer special discount"
          ],
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        });
      }

      // High value customer insight
      if (profile.totalSpent > 1000) {
        insights.push({
          customerId: profile.customerId,
          type: InsightType.HIGH_VALUE,
          title: "VIP Customer",
          description: `Customer has spent $${profile.totalSpent.toFixed(2)} lifetime`,
          impact: "high" as const,
          actionable: true,
          suggestedActions: [
            "Provide VIP treatment",
            "Offer exclusive experiences",
            "Personal account manager"
          ],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
      }

      return insights;
    } catch (error) {
      this.log.error('Failed to generate customer insights', { error, venueId });
      throw error;
    }
  }
  async performRFMAnalysis(
    venueId: string,
    customerId: string
  ): Promise<RFMAnalysis> {
    try {
      const profile = await this.getCustomerProfile(venueId, customerId);
      if (!profile) {
        throw new Error('Customer profile not found');
      }

      // Score each dimension (1-5)
      const recencyScore = this.scoreRecency(profile.daysSinceLastPurchase);
      const frequencyScore = this.scoreFrequency(profile.purchaseFrequency);
      const monetaryScore = this.scoreMonetary(profile.totalSpent);

      // Determine RFM segment
      const segment = this.getRFMSegment(recencyScore, frequencyScore, monetaryScore);

      return {
        customerId: profile.customerId,
        recency: profile.daysSinceLastPurchase,
        frequency: profile.totalTickets,
        monetary: profile.totalSpent,
        recencyScore,
        frequencyScore,
        monetaryScore,
        segment
      };
    } catch (error) {
      this.log.error('Failed to perform RFM analysis', { error, venueId });
      throw error;
    }
  }

  private scoreRecency(days: number): number {
    if (days <= 30) return 5;
    if (days <= 60) return 4;
    if (days <= 90) return 3;
    if (days <= 180) return 2;
    return 1;
  }

  private scoreFrequency(frequency: number): number {
    if (frequency >= 10) return 5;
    if (frequency >= 6) return 4;
    if (frequency >= 3) return 3;
    if (frequency >= 1) return 2;
    return 1;
  }

  private scoreMonetary(amount: number): number {
    if (amount >= 1000) return 5;
    if (amount >= 500) return 4;
    if (amount >= 200) return 3;
    if (amount >= 50) return 2;
    return 1;
  }

  private getRFMSegment(r: number, f: number, m: number): string {
    const score = `${r}${f}${m}`;
    
    const segments: Record<string, string> = {
      '555': 'Champions',
      '554': 'Champions',
      '544': 'Champions',
      '545': 'Champions',
      '454': 'Loyal Customers',
      '455': 'Loyal Customers',
      '444': 'Loyal Customers',
      '445': 'Loyal Customers',
      '543': 'Potential Loyalists',
      '443': 'Potential Loyalists',
      '434': 'Potential Loyalists',
      '343': 'Potential Loyalists',
      '533': 'Recent Customers',
      '433': 'Recent Customers',
      '423': 'Recent Customers',
      '332': 'Promising',
      '322': 'Promising',
      '311': 'New Customers',
      '211': 'Hibernating',
      '112': 'At Risk',
      '111': 'Lost'
    };

    // Find closest match
    return segments[score] || 'Other';
  }

  async getCustomerSegments(
    venueId: string
  ): Promise<Array<{ segment: CustomerSegment; count: number; percentage: number }>> {
    try {
      // This would query aggregated segment data
      // For now, return mock data
      const segments = [
        { segment: CustomerSegment.NEW, count: 1500, percentage: 30 },
        { segment: CustomerSegment.OCCASIONAL, count: 2000, percentage: 40 },
        { segment: CustomerSegment.REGULAR, count: 1000, percentage: 20 },
        { segment: CustomerSegment.VIP, count: 300, percentage: 6 },
        { segment: CustomerSegment.AT_RISK, count: 150, percentage: 3 },
        { segment: CustomerSegment.DORMANT, count: 40, percentage: 0.8 },
        { segment: CustomerSegment.LOST, count: 10, percentage: 0.2 }
      ];

      return segments;
    } catch (error) {
      this.log.error('Failed to get customer segments', { error, venueId });
      throw error;
    }
  }
}

export const customerIntelligenceService = CustomerIntelligenceService.getInstance();
```

### FILE: src/services/data-aggregation.service.ts
```typescript
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
```

### FILE: src/services/message-gateway.service.ts
```typescript
import { AlertInstance } from '../types';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { logger } from '../utils/logger';
import { getChannel } from '../config/rabbitmq';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  subject?: string;
  body: string;
  variables: string[];
}

export interface Message {
  id: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
  scheduledFor?: Date;
  status: 'pending' | 'sent' | 'failed';
}

export class MessageGatewayService {
  private static instance: MessageGatewayService;
  private log = logger.child({ component: 'MessageGatewayService' });
  private templates: Map<string, MessageTemplate> = new Map();

  static getInstance(): MessageGatewayService {
    if (!this.instance) {
      this.instance = new MessageGatewayService();
    }
    return this.instance;
  }

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Alert templates
    this.templates.set('alert-email', {
      id: 'alert-email',
      name: 'Alert Email',
      channel: 'email',
      subject: 'Analytics Alert: {{alertName}}',
      body: `
        <h2>{{alertName}}</h2>
        <p>{{alertDescription}}</p>
        <p><strong>Severity:</strong> {{severity}}</p>
        <p><strong>Triggered at:</strong> {{triggeredAt}}</p>
        <p><strong>Current value:</strong> {{currentValue}}</p>
        <p><strong>Threshold:</strong> {{threshold}}</p>
        <a href="{{dashboardUrl}}">View Dashboard</a>
      `,
      variables: ['alertName', 'alertDescription', 'severity', 'triggeredAt', 'currentValue', 'threshold', 'dashboardUrl']
    });

    this.templates.set('alert-sms', {
      id: 'alert-sms',
      name: 'Alert SMS',
      channel: 'sms',
      body: 'Analytics Alert: {{alertName}} - {{severity}}. Value: {{currentValue}}. Check dashboard for details.',
      variables: ['alertName', 'severity', 'currentValue']
    });

    this.templates.set('alert-slack', {
      id: 'alert-slack',
      name: 'Alert Slack',
      channel: 'slack',
      body: JSON.stringify({
        text: 'Analytics Alert',
        attachments: [{
          color: '{{color}}',
          title: '{{alertName}}',
          text: '{{alertDescription}}',
          fields: [
            { title: 'Severity', value: '{{severity}}', short: true },
            { title: 'Current Value', value: '{{currentValue}}', short: true },
            { title: 'Threshold', value: '{{threshold}}', short: true },
            { title: 'Time', value: '{{triggeredAt}}', short: true }
          ],
          actions: [{
            type: 'button',
            text: 'View Dashboard',
            url: '{{dashboardUrl}}'
          }]
        }]
      }),
      variables: ['color', 'alertName', 'alertDescription', 'severity', 'currentValue', 'threshold', 'triggeredAt', 'dashboardUrl']
    });

    // Report templates
    this.templates.set('report-ready-email', {
      id: 'report-ready-email',
      name: 'Report Ready Email',
      channel: 'email',
      subject: 'Your Analytics Report is Ready',
      body: `
        <h2>Your report is ready for download</h2>
        <p>Report: {{reportName}}</p>
        <p>Generated: {{generatedAt}}</p>
        <p>Size: {{fileSize}}</p>
        <a href="{{downloadUrl}}">Download Report</a>
        <p><em>This link will expire in {{expirationDays}} days.</em></p>
      `,
      variables: ['reportName', 'generatedAt', 'fileSize', 'downloadUrl', 'expirationDays']
    });

    // Customer insight templates
    this.templates.set('customer-insight-email', {
      id: 'customer-insight-email',
      name: 'Customer Insight Email',
      channel: 'email',
      subject: 'New Customer Insights Available',
      body: `
        <h2>New insights for your venue</h2>
        <ul>
        {{#insights}}
          <li>
            <strong>{{title}}</strong>: {{description}}
            <br>Impact: {{impact}}
            {{#actionable}}
            <br>Suggested actions:
            <ul>
              {{#suggestedActions}}
              <li>{{.}}</li>
              {{/suggestedActions}}
            </ul>
            {{/actionable}}
          </li>
        {{/insights}}
        </ul>
        <a href="{{dashboardUrl}}">View Full Analytics</a>
      `,
      variables: ['insights', 'dashboardUrl']
    });
  }

  async sendMessage(
    channel: 'email' | 'sms' | 'push' | 'slack',
    recipient: string,
    templateId: string,
    variables: Record<string, any>
  ): Promise<Message> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      const message: Message = {
        id: `msg-${Date.now()}`,
        channel,
        recipient,
        subject: this.interpolateTemplate(template.subject || '', variables),
        body: this.interpolateTemplate(template.body, variables),
        metadata: { templateId, variables },
        status: 'pending'
      };

      // Queue message for delivery
      await this.queueMessage(message);

      this.log.info('Message queued', { 
        messageId: message.id, 
        channel, 
        recipient: this.maskRecipient(recipient) 
      });

      return message;
    } catch (error) {
      this.log.error('Failed to send message', { error, channel, templateId });
      throw error;
    }
  }

  async sendAlertNotification(
    alert: AlertInstance,
    channel: 'email' | 'sms' | 'slack',
    recipient: string
  ): Promise<void> {
    try {
      const templateId = `alert-${channel}`;
      const variables = {
        alertName: alert.message,
        alertDescription: alert.message,
        severity: alert.severity,
        triggeredAt: alert.triggeredAt.toISOString(),
        currentValue: JSON.stringify(alert.triggerValues),
        threshold: 'Configured threshold',
        dashboardUrl: `${process.env.APP_URL}/dashboard/alerts/${alert.alertId}`,
        color: alert.severity === 'critical' ? '#ff0000' : 
               alert.severity === 'error' ? '#ff6600' : 
               alert.severity === 'warning' ? '#ffcc00' : '#0066cc'
      };

      await this.sendMessage(channel, recipient, templateId, variables);
    } catch (error) {
      this.log.error('Failed to send alert notification', { error, alertId: alert.id });
      throw error;
    }
  }

  async sendBulkMessages(
    messages: Array<{
      channel: 'email' | 'sms' | 'push' | 'slack';
      recipient: string;
      templateId: string;
      variables: Record<string, any>;
    }>
  ): Promise<Message[]> {
    try {
      const results = await Promise.allSettled(
        messages.map(msg => 
          this.sendMessage(msg.channel, msg.recipient, msg.templateId, msg.variables)
        )
      );

      const successful = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<Message>).value);

      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        this.log.warn(`Bulk send completed with ${failed} failures`, {
          total: messages.length,
          successful: successful.length,
          failed
        });
      }

      return successful;
    } catch (error) {
      this.log.error('Failed to send bulk messages', { error });
      throw error;
    }
  }

  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    
    // Simple variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    });

    // Handle arrays and conditionals (simplified)
    // In production, use a proper template engine like Handlebars
    
    return result;
  }

  private async queueMessage(message: Message): Promise<void> {
    try {
      const channel = getChannel();
      const routingKey = `messages.${message.channel}`;
      
      channel.publish(
        'tickettoken_events',
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
    } catch (error) {
      this.log.error('Failed to queue message', { error, messageId: message.id });
      throw error;
    }
  }

  private maskRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      // Email
      const [user, domain] = recipient.split('@');
      return `${user.substring(0, 2)}***@${domain}`;
    } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
      // Phone
      return `***${recipient.slice(-4)}`;
    }
    return '***';
  }

  async getMessageStatus(_messageId: string): Promise<Message | null> {
    // In production, this would query the message queue or database
    return null;
  }

  async retryFailedMessages(_since: Date): Promise<number> {
    // In production, this would retry failed messages
    return 0;
  }
}

export const messageGatewayService = MessageGatewayService.getInstance();
```

### FILE: src/services/event-stream.service.ts
```typescript
import { EventEmitter } from 'events';
import Bull from 'bull';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { emitMetricUpdate } from '../config/websocket';
import { getAnalyticsDb } from '../config/database';

export interface StreamEvent {
  type: string;
  venueId: string;
  data: any;
  timestamp: Date;
}

export class EventStreamService extends EventEmitter {
  private queues: Map<string, Bull.Queue> = new Map();
  private redis: any; // Lazy loaded
  private analyticsDb: any; // Lazy loaded
  private initialized = false;

  constructor() {
    super();
  }

  private async initialize() {
    if (this.initialized) return;
    
    this.redis = getRedis();
    this.analyticsDb = getAnalyticsDb();
    this.initializeQueues();
    this.initialized = true;
  }

  private initializeQueues() {
    // Create queues for different event types
    const eventTypes = [
      'ticket-purchase',
      'ticket-scan', 
      'page-view',
      'cart-update',
      'venue-update'
    ];

    eventTypes.forEach(type => {
      const queue = new Bull(type, {
        redis: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      queue.process(async (job) => {
        await this.processEvent(type, job.data);
      });

      this.queues.set(type, queue);
    });
  }

  // Process incoming events
  async processEvent(type: string, data: StreamEvent) {
    try {
      logger.debug('Processing event', { type, venueId: data.venueId });

      // Emit event for real-time processing
      this.emit(type, data);

      // Update real-time metrics
      await this.updateRealTimeMetrics(type, data);

      // Emit to WebSocket clients (only if WebSocket is initialized)
      try {
        emitMetricUpdate(data.venueId, type, data);
      } catch (e) {
        // WebSocket might not be initialized in tests
      }

      // Store raw event for later processing
      await this.storeRawEvent(type, data);

    } catch (error) {
      logger.error('Failed to process event', { type, error });
    }
  }

  private async updateRealTimeMetrics(type: string, event: StreamEvent) {
    const { venueId, data } = event;

    switch (type) {
      case 'ticket-purchase':
        await this.updatePurchaseMetrics(venueId, data);
        break;
      
      case 'ticket-scan':
        await this.updateScanMetrics(venueId, data);
        break;
      
      case 'page-view':
        await this.updateTrafficMetrics(venueId, data);
        break;
    }
  }

  private async updatePurchaseMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    
    // Update real-time purchase metrics
    const key = `metrics:purchase:${venueId}:${new Date().toISOString().split('T')[0]}`;
    
    await this.redis.hincrby(key, 'total_sales', 1);
    await this.redis.hincrbyfloat(key, 'revenue', data.amount);
    await this.redis.expire(key, 86400); // 24 hour TTL

    // Update database with aggregated metrics
    if (!this.analyticsDb) return;
    
    const hour = new Date().getHours();
    await this.analyticsDb('venue_analytics')
      .insert({
        venue_id: venueId,
        date: new Date(),
        hour: hour,
        tickets_sold: 1,
        revenue: data.amount
      })
      .onConflict(['venue_id', 'date', 'hour'])
      .merge({
        tickets_sold: this.analyticsDb.raw('venue_analytics.tickets_sold + 1'),
        revenue: this.analyticsDb.raw('venue_analytics.revenue + ?', [data.amount]),
        updated_at: new Date()
      });
  }

  private async updateScanMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:scan:${venueId}:${data.eventId}`;
    await this.redis.hincrby(key, 'scanned', 1);
    await this.redis.expire(key, 86400);
  }

  private async updateTrafficMetrics(venueId: string, data: any) {
    if (!this.redis) return;
    const key = `metrics:traffic:${venueId}:${new Date().toISOString().split('T')[0]}`;
    await this.redis.hincrby(key, 'page_views', 1);
    await this.redis.pfadd(`unique_visitors:${venueId}`, data.sessionId);
    await this.redis.expire(key, 86400);
  }

  private async storeRawEvent(type: string, event: StreamEvent) {
    // Store in MongoDB for later analysis
    // We'll implement this when MongoDB is configured
    logger.debug('Storing raw event', { type, venueId: event.venueId });
  }

  // Public method to push events
  async pushEvent(type: string, event: StreamEvent) {
    await this.initialize();
    
    const queue = this.queues.get(type);
    if (queue) {
      await queue.add(event, {
        removeOnComplete: true,
        removeOnFail: false
      });
    }
  }

  // Subscribe to external events (from other services)
  async subscribeToExternalEvents() {
    await this.initialize();
    
    // Subscribe to Redis pub/sub for cross-service events
    const subscriber = this.redis.duplicate();
    
    subscriber.subscribe('analytics:events');
    
    subscriber.on('message', async (channel: string, message: string) => {
      try {
        const event = JSON.parse(message);
        await this.pushEvent(event.type, event);
      } catch (error) {
        logger.error('Failed to process external event', error);
      }
    });
  }
}

export const eventStreamService = new EventStreamService();
```

### FILE: src/services/prediction.service.ts
```typescript
import { 
  ModelType,
  DemandForecast,
  PriceOptimization,
  ChurnPrediction,
  CustomerLifetimeValue,
  NoShowPrediction,
  WhatIfScenario
} from '../types';
import { logger } from '../utils/logger';
import { customerIntelligenceService } from './customer-intelligence.service';
import * as tf from '@tensorflow/tfjs-node';

export class PredictionService {
  private static instance: PredictionService;
  private log = logger.child({ component: 'PredictionService' });
  private models: Map<ModelType, tf.LayersModel> = new Map();

  static getInstance(): PredictionService {
    if (!this.instance) {
      this.instance = new PredictionService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load pre-trained models
      // In production, these would be loaded from model storage
      this.log.info('Initializing prediction models...');
      
      // For now, we'll create simple placeholder models
      await this.initializePlaceholderModels();
      
      this.log.info('Prediction models initialized');
    } catch (error) {
      this.log.error('Failed to initialize prediction models', { error });
    }
  }

  private async initializePlaceholderModels(): Promise<void> {
    // Create simple neural networks for each model type
    const modelTypes = Object.values(ModelType);
    
    for (const modelType of modelTypes) {
      const model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' })
        ]
      });
      
      model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });
      
      this.models.set(modelType, model);
    }
  }

  async predictDemand(
    venueId: string,
    eventId: string,
    daysAhead: number = 30
  ): Promise<DemandForecast> {
    try {
      // Get historical data
      
      // Generate predictions
      const predictions = [];
      const today = new Date();
      
      for (let i = 0; i < daysAhead; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        
        // Simple demand prediction based on day of week and historical average
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const baseDemand = isWeekend ? 150 : 100;
        const variance = Math.random() * 50 - 25;
        const predictedDemand = Math.max(0, baseDemand + variance);
        
        predictions.push({
          date,
          ticketTypeId: 'general',
          predictedDemand: Math.round(predictedDemand),
          confidenceInterval: {
            lower: Math.round(predictedDemand * 0.8),
            upper: Math.round(predictedDemand * 1.2)
          },
          factors: [
            { name: 'Day of Week', impact: isWeekend ? 1.5 : 1.0 },
            { name: 'Seasonality', impact: 1.0 },
            { name: 'Marketing', impact: 1.1 }
          ]
        });
      }
      
      const totalPredictedDemand = predictions.reduce((sum, p) => sum + p.predictedDemand, 0);
      const peakDemand = Math.max(...predictions.map(p => p.predictedDemand));
      const peakDemandDate = predictions.find(p => p.predictedDemand === peakDemand)?.date || today;
      
      return {
        eventId,
        predictions,
        aggregated: {
          totalPredictedDemand,
          peakDemandDate,
          sellOutProbability: totalPredictedDemand > 1000 ? 0.8 : 0.3
        }
      };
    } catch (error) {
      this.log.error('Failed to predict demand', { error, venueId, eventId });
      throw error;
    }
  }

  async optimizePrice(
    venueId: string,
    eventId: string,
    ticketTypeId: string,
    currentPrice: number
  ): Promise<PriceOptimization> {
    try {
      // Simple price optimization based on elasticity
      const elasticity = -1.5; // Price elasticity of demand
      const recommendations = [];
      
      // Test different price points
      const pricePoints = [0.8, 0.9, 1.0, 1.1, 1.2].map(factor => currentPrice * factor);
      
      for (const price of pricePoints) {
        const priceChange = (price - currentPrice) / currentPrice;
        const demandChange = elasticity * priceChange;
        const expectedDemand = 100 * (1 + demandChange);
        const expectedRevenue = price * expectedDemand;
        
        recommendations.push({
          price,
          expectedDemand: Math.round(expectedDemand),
          expectedRevenue: Math.round(expectedRevenue),
          elasticity,
          confidence: 0.7 + Math.random() * 0.2
        });
      }
      
      // Find optimal price
      const optimal = recommendations.reduce((best, current) => 
        current.expectedRevenue > best.expectedRevenue ? current : best
      );
      
      return {
        eventId,
        ticketTypeId,
        currentPrice,
        recommendations,
        optimalPrice: optimal.price,
        priceRange: {
          min: Math.min(...pricePoints),
          max: Math.max(...pricePoints)
        },
        factors: [
          { factor: 'Demand Level', weight: 0.4, direction: 'positive' },
          { factor: 'Competition', weight: 0.3, direction: 'negative' },
          { factor: 'Day of Week', weight: 0.2, direction: 'positive' },
          { factor: 'Seasonality', weight: 0.1, direction: 'positive' }
        ]
      };
    } catch (error) {
      this.log.error('Failed to optimize price', { error, venueId, eventId });
      throw error;
    }
  }

  async predictChurn(
    venueId: string,
    customerId: string
  ): Promise<ChurnPrediction> {
    try {
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      if (!profile) {
        throw new Error('Customer profile not found');
      }
      
      // Simple churn prediction based on recency and frequency
      const churnProbability = profile.churnProbability;
      const riskLevel = churnProbability > 0.7 ? 'high' : 
                       churnProbability > 0.4 ? 'medium' : 'low';
      
      const reasons = [];
      
      if (profile.daysSinceLastPurchase > 90) {
        reasons.push({
          factor: 'Long time since last purchase',
          weight: 0.4,
          description: `${profile.daysSinceLastPurchase} days since last purchase`
        });
      }
      
      if (profile.purchaseFrequency < 2) {
        reasons.push({
          factor: 'Low purchase frequency',
          weight: 0.3,
          description: `Only ${profile.purchaseFrequency.toFixed(1)} purchases per year`
        });
      }
      
      const recommendedActions: Array<{
        action: string;
        expectedImpact: number;
        effort: 'low' | 'medium' | 'high';
      }> = [];
      
      if (riskLevel === 'high') {
        recommendedActions.push(
          { action: 'Send win-back email campaign', expectedImpact: 0.3, effort: 'low' },
          { action: 'Offer personalized discount', expectedImpact: 0.4, effort: 'medium' },
          { action: 'Call customer directly', expectedImpact: 0.5, effort: 'high' }
        );
      } else if (riskLevel === 'medium') {
        recommendedActions.push(
          { action: 'Include in re-engagement campaign', expectedImpact: 0.2, effort: 'low' },
          { action: 'Send event recommendations', expectedImpact: 0.3, effort: 'low' }
        );
      }
      
      return {
        customerId: profile.customerId,
        churnProbability,
        riskLevel: riskLevel as any,
        timeframe: 90,
        reasons,
        recommendedActions
      };
    } catch (error) {
      this.log.error('Failed to predict churn', { error, venueId, customerId });
      throw error;
    }
  }

  async predictCustomerLifetimeValue(
    venueId: string,
    customerId: string
  ): Promise<CustomerLifetimeValue> {
    try {
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      if (!profile) {
        throw new Error('Customer profile not found');
      }
      
      // Simple CLV calculation
      const monthlySpend = profile.averageOrderValue * (profile.purchaseFrequency / 12);
      const retentionRate = 1 - profile.churnProbability;
      const timeHorizon = 36; // 3 years in months
      
      let clv = 0;
      let cumulativeRetention = 1;
      
      for (let month = 1; month <= timeHorizon; month++) {
        cumulativeRetention *= retentionRate;
        clv += monthlySpend * cumulativeRetention;
      }
      
      const growthPotential = profile.segment === 'new' ? 1.5 :
                             profile.segment === 'occasional' ? 1.3 :
                             profile.segment === 'regular' ? 1.1 : 1.0;
      
      return {
        customerId: profile.customerId,
        predictedCLV: Math.round(clv),
        confidence: 0.75,
        timeHorizon,
        breakdown: {
          expectedPurchases: Math.round(profile.purchaseFrequency * 3),
          averageOrderValue: profile.averageOrderValue,
          retentionProbability: retentionRate
        },
        segment: profile.segment,
        growthPotential
      };
    } catch (error) {
      this.log.error('Failed to predict CLV', { error, venueId, customerId });
      throw error;
    }
  }

  async predictNoShow(
    venueId: string,
    ticketId: string,
    customerId: string,
    eventId: string
  ): Promise<NoShowPrediction> {
    try {
      // Get customer profile
      const profile = await customerIntelligenceService.getCustomerProfile(venueId, customerId);
      
      // Simple no-show prediction based on customer behavior
      const riskFactors = [];
      let noShowProbability = 0.1; // Base probability
      
      if (profile) {
        if (profile.daysSinceLastPurchase > 180) {
          noShowProbability += 0.2;
          riskFactors.push({
            factor: 'Inactive customer',
            value: profile.daysSinceLastPurchase,
            contribution: 0.2
          });
        }
        
        if (profile.averageOrderValue < 50) {
          noShowProbability += 0.1;
          riskFactors.push({
            factor: 'Low-value tickets',
            value: profile.averageOrderValue,
            contribution: 0.1
          });
        }
      }
      
      // Add weather factor (mock)
      const weatherRisk = Math.random() * 0.2;
      if (weatherRisk > 0.1) {
        noShowProbability += weatherRisk;
        riskFactors.push({
          factor: 'Weather conditions',
          value: 'Rain expected',
          contribution: weatherRisk
        });
      }
      
      const recommendedActions = noShowProbability > 0.3 ? [
        'Send reminder 24 hours before event',
        'Offer easy parking information',
        'Enable ticket transfer option'
      ] : [];
      
      return {
        ticketId,
        customerId,
        eventId,
        noShowProbability: Math.min(noShowProbability, 1),
        riskFactors,
        recommendedActions
      };
    } catch (error) {
      this.log.error('Failed to predict no-show', { error, venueId, ticketId });
      throw error;
    }
  }

  async runWhatIfScenario(
    venueId: string,
    scenario: Partial<WhatIfScenario>
  ): Promise<WhatIfScenario> {
    try {
      const baselineMetrics = {
        revenue: 100000,
        attendance: 1000,
        conversionRate: 0.05,
        averageTicketPrice: 100
      };
      
      const scenarios = [];
      
      // Price change scenarios
      if (scenario.type === 'pricing') {
        const priceChanges = [-20, -10, 0, 10, 20];
        
        for (const change of priceChanges) {
          const newPrice = baselineMetrics.averageTicketPrice * (1 + change / 100);
          const elasticity = -1.5;
          const demandChange = elasticity * (change / 100);
          const newAttendance = baselineMetrics.attendance * (1 + demandChange);
          const newRevenue = newPrice * newAttendance;
          
          scenarios.push({
            name: `${change > 0 ? '+' : ''}${change}% price`,
            parameters: { priceChange: change },
            predictions: {
              revenue: Math.round(newRevenue),
              attendance: Math.round(newAttendance),
              averageTicketPrice: newPrice
            },
            impact: {
              revenue: ((newRevenue - baselineMetrics.revenue) / baselineMetrics.revenue) * 100,
              attendance: ((newAttendance - baselineMetrics.attendance) / baselineMetrics.attendance) * 100
            }
          });
        }
      }
      
      return {
        id: scenario.id || 'scenario-' + Date.now(),
        name: scenario.name || 'What-If Analysis',
        type: scenario.type as any || 'pricing',
        baselineMetrics,
        scenarios,
        recommendations: [
          'Consider moderate price increases for high-demand events',
          'Monitor competitor pricing regularly',
          'Test dynamic pricing strategies'
        ]
      };
    } catch (error) {
      this.log.error('Failed to run what-if scenario', { error, venueId });
      throw error;
    }
  }

}

export const predictionService = PredictionService.getInstance();
```

### FILE: src/services/aggregation.service.ts
```typescript
import { AggregationModel, MetricModel } from '../models';
import { 
  MetricAggregation, 
  MetricType, 
  TimeGranularity,
  DateRange 
} from '../types';
import { logger } from '../utils/logger';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class AggregationService {
  private static instance: AggregationService;
  private log = logger.child({ component: 'AggregationService' });

  static getInstance(): AggregationService {
    if (!this.instance) {
      this.instance = new AggregationService();
    }
    return this.instance;
  }

  async aggregateMetrics(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    granularity: TimeGranularity
  ): Promise<MetricAggregation> {
    try {
      // Check cache
      const cacheKey = CacheModel.getCacheKey(
        'aggregation',
        venueId,
        metricType,
        dateRange.startDate.toISOString(),
        dateRange.endDate.toISOString(),
        JSON.stringify(granularity)
      );

      const cached = await CacheModel.get<MetricAggregation>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get raw metrics
      const metrics = await MetricModel.getMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate
      );

      // Aggregate by time periods
      const aggregated = this.aggregateByGranularity(
        metrics,
        granularity
      );

      // Calculate summary statistics
      const values = aggregated.map(d => d.value);
      const summary = {
        total: values.reduce((sum, val) => sum + val, 0),
        average: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
        trend: this.calculateTrend(aggregated)
      };

      const aggregation: MetricAggregation = {
        metricType,
        period: dateRange,
        granularity,
        data: aggregated,
        summary
      };

      // Store in database
      await AggregationModel.upsertAggregation(venueId, aggregation);

      // Cache result
      await CacheModel.set(cacheKey, aggregation, CONSTANTS.CACHE_TTL.INSIGHTS);

      return aggregation;
    } catch (error) {
      this.log.error('Failed to aggregate metrics', { 
        error, 
        venueId, 
        metricType 
      });
      throw error;
    }
  }

  private aggregateByGranularity(
    metrics: any[],
    granularity: TimeGranularity
  ): Array<{ timestamp: Date; value: number; change?: number; changePercent?: number }> {
    const buckets = new Map<string, number>();
    
    // Group metrics into time buckets
    metrics.forEach(metric => {
      const bucketKey = this.getBucketKey(metric.timestamp, granularity);
      const currentValue = buckets.get(bucketKey) || 0;
      buckets.set(bucketKey, currentValue + metric.value);
    });

    // Convert to array and sort
    const result: Array<{ timestamp: Date; value: number; change?: number; changePercent?: number }> = 
      Array.from(buckets.entries())
        .map(([key, value]) => ({
          timestamp: new Date(key),
          value,
          change: undefined,
          changePercent: undefined
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate changes
    for (let i = 1; i < result.length; i++) {
      const current = result[i];
      const previous = result[i - 1];
      
      current.change = current.value - previous.value;
      current.changePercent = previous.value > 0 
        ? ((current.change / previous.value) * 100)
        : 0;
    }

    return result;
  }

  private getBucketKey(date: Date, granularity: TimeGranularity): string {
    const d = new Date(date);
    
    switch (granularity.unit) {
      case 'minute':
        d.setSeconds(0, 0);
        break;
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        break;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        const month = d.getMonth();
        d.setMonth(Math.floor(month / 3) * 3);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'year':
        d.setMonth(0, 1);
        d.setHours(0, 0, 0, 0);
        break;
    }
    
    return d.toISOString();
  }

  private calculateTrend(data: Array<{ value: number }>): number {
    if (data.length < 2) return 0;

    // Simple linear regression
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    data.forEach((point, index) => {
      sumX += index;
      sumY += point.value;
      sumXY += index * point.value;
      sumX2 += index * index;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  async performHourlyAggregation(venueId: string): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const metricTypes = Object.values(MetricType);

      await Promise.all(
        metricTypes.map(metricType =>
          this.aggregateMetrics(
            venueId,
            metricType,
            { startDate: oneHourAgo, endDate: now },
            { unit: 'hour', value: 1 }
          )
        )
      );

      this.log.info('Hourly aggregation completed', { venueId });
    } catch (error) {
      this.log.error('Failed to perform hourly aggregation', { error, venueId });
      throw error;
    }
  }

  async performDailyAggregation(venueId: string): Promise<void> {
    try {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const metricTypes = Object.values(MetricType);

      await Promise.all(
        metricTypes.map(metricType =>
          this.aggregateMetrics(
            venueId,
            metricType,
            { startDate: yesterday, endDate: today },
            { unit: 'day', value: 1 }
          )
        )
      );

      this.log.info('Daily aggregation completed', { venueId });
    } catch (error) {
      this.log.error('Failed to perform daily aggregation', { error, venueId });
      throw error;
    }
  }

  async getComparativeMetrics(
    venueId: string,
    metricType: MetricType,
    currentPeriod: DateRange,
    comparisonPeriod: DateRange,
    granularity: TimeGranularity
  ): Promise<{
    current: MetricAggregation;
    previous: MetricAggregation;
    change: number;
    changePercent: number;
  }> {
    try {
      const [current, previous] = await Promise.all([
        this.aggregateMetrics(venueId, metricType, currentPeriod, granularity),
        this.aggregateMetrics(venueId, metricType, comparisonPeriod, granularity)
      ]);

      const change = current.summary.total - previous.summary.total;
      const changePercent = previous.summary.total > 0
        ? (change / previous.summary.total) * 100
        : 0;

      return {
        current,
        previous,
        change,
        changePercent
      };
    } catch (error) {
      this.log.error('Failed to get comparative metrics', { 
        error, 
        venueId, 
        metricType 
      });
      throw error;
    }
  }
}

export const aggregationService = AggregationService.getInstance();
```

### FILE: src/services/validation.service.ts
```typescript
import { ValidationError } from '../utils/errors';

export class ValidationService {
  private static instance: ValidationService;

  static getInstance(): ValidationService {
    if (!this.instance) {
      this.instance = new ValidationService();
    }
    return this.instance;
  }

  validateDateRange(startDate: Date, endDate: Date): void {
    if (startDate > endDate) {
      throw new ValidationError('Start date must be before end date');
    }

    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      throw new ValidationError('Date range cannot exceed 1 year');
    }
  }

  validatePaginationParams(page: number, limit: number): void {
    if (page < 1) {
      throw new ValidationError('Page must be greater than 0');
    }

    if (limit < 1 || limit > 1000) {
      throw new ValidationError('Limit must be between 1 and 1000');
    }
  }

  validateMetricType(metricType: string): void {
    const validTypes = [
      'sales', 'revenue', 'attendance', 'capacity', 
      'conversion', 'cart_abandonment', 'average_order_value',
      'customer_lifetime_value'
    ];

    if (!validTypes.includes(metricType)) {
      throw new ValidationError(`Invalid metric type: ${metricType}`);
    }
  }

  validateExportFormat(format: string): void {
    const validFormats = ['csv', 'xlsx', 'pdf', 'json', 'xml'];
    
    if (!validFormats.includes(format.toLowerCase())) {
      throw new ValidationError(`Invalid export format: ${format}`);
    }
  }

  validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email address');
    }
  }

  validatePhoneNumber(phone: string): void {
    const phoneRegex = /^\+?[\d\s-()]+$/;
    if (!phoneRegex.test(phone) || phone.length < 10) {
      throw new ValidationError('Invalid phone number');
    }
  }

  validateUUID(uuid: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      throw new ValidationError('Invalid UUID format');
    }
  }

  validateTimeGranularity(unit: string, value: number): void {
    const validUnits = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
    
    if (!validUnits.includes(unit)) {
      throw new ValidationError(`Invalid time unit: ${unit}`);
    }

    if (value < 1 || value > 100) {
      throw new ValidationError('Time value must be between 1 and 100');
    }
  }

  validateAlertThreshold(value: number, min?: number, max?: number): void {
    if (min !== undefined && value < min) {
      throw new ValidationError(`Threshold must be at least ${min}`);
    }

    if (max !== undefined && value > max) {
      throw new ValidationError(`Threshold must be at most ${max}`);
    }
  }

  validateWidgetConfig(config: any): void {
    if (!config.type) {
      throw new ValidationError('Widget type is required');
    }

    if (!config.title || config.title.length < 1) {
      throw new ValidationError('Widget title is required');
    }

    if (!config.metrics || !Array.isArray(config.metrics) || config.metrics.length === 0) {
      throw new ValidationError('At least one metric is required');
    }

    if (!config.size || !config.size.width || !config.size.height) {
      throw new ValidationError('Widget size is required');
    }

    if (config.size.width < 1 || config.size.width > 12) {
      throw new ValidationError('Widget width must be between 1 and 12');
    }

    if (config.size.height < 1 || config.size.height > 12) {
      throw new ValidationError('Widget height must be between 1 and 12');
    }
  }

  validateDashboardName(name: string): void {
    if (!name || name.trim().length < 1) {
      throw new ValidationError('Dashboard name is required');
    }

    if (name.length > 100) {
      throw new ValidationError('Dashboard name must be less than 100 characters');
    }

    const validNameRegex = /^[a-zA-Z0-9\s\-_]+$/;
    if (!validNameRegex.test(name)) {
      throw new ValidationError('Dashboard name contains invalid characters');
    }
  }

  validateCampaignDates(startDate: Date, endDate: Date): void {
    const now = new Date();
    
    if (startDate < now) {
      throw new ValidationError('Campaign start date cannot be in the past');
    }

    this.validateDateRange(startDate, endDate);
  }

  validateBudget(budget: number): void {
    if (budget < 0) {
      throw new ValidationError('Budget cannot be negative');
    }

    if (budget > 1000000000) {
      throw new ValidationError('Budget exceeds maximum allowed value');
    }
  }

  sanitizeInput(input: string): string {
    // Remove any potential XSS attempts
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  validateSearchQuery(query: string): void {
    if (!query || query.trim().length < 1) {
      throw new ValidationError('Search query cannot be empty');
    }

    if (query.length > 200) {
      throw new ValidationError('Search query is too long');
    }

    // Check for SQL injection patterns
    const sqlPatterns = /(\b(union|select|insert|update|delete|drop|create)\b)|(-{2})|\/\*|\*\//i;
    if (sqlPatterns.test(query)) {
      throw new ValidationError('Invalid search query');
    }
  }
}

export const validationService = ValidationService.getInstance();
```

### FILE: src/services/cache.service.ts
```typescript
import { CacheModel } from '../models';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export class CacheService {
  private static instance: CacheService;
  private log = logger.child({ component: 'CacheService' });
  
  // Cache integrity configuration
  private readonly CACHE_SECRET = process.env.CACHE_SECRET || 'default-cache-secret-change-in-production';
  private readonly SIGNATURE_ALGORITHM = 'sha256';
  private readonly PROTECTED_PREFIXES = ['stats:', 'metrics:', 'aggregate:', 'event:'];

  static getInstance(): CacheService {
    if (!this.instance) {
      this.instance = new CacheService();
    }
    return this.instance;
  }

  private generateSignature(key: string, value: any): string {
    const data = JSON.stringify({ key, value });
    return crypto
      .createHmac(this.SIGNATURE_ALGORITHM, this.CACHE_SECRET)
      .update(data)
      .digest('hex');
  }

  private validateSignature(key: string, value: any, signature: string): boolean {
    const expectedSignature = this.generateSignature(key, value);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private isProtectedKey(key: string): boolean {
    return this.PROTECTED_PREFIXES.some(prefix => key.startsWith(prefix));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isProtectedKey(key)) {
        // Get signed data for protected keys
        const signedData = await CacheModel.get<{ value: T; signature: string }>(key);
        if (!signedData) return null;

        // Validate signature
        if (!this.validateSignature(key, signedData.value, signedData.signature)) {
          this.log.warn('Cache signature validation failed', { key });
          await this.delete(key); // Remove corrupted data
          return null;
        }

        return signedData.value;
      }
      
      // Non-protected keys don't need signature validation
      return await CacheModel.get<T>(key);
    } catch (error) {
      this.log.error('Cache get error', { error, key });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      // Validate write permissions for protected keys
      if (this.isProtectedKey(key)) {
        // Check if caller has permission to write to protected cache
        // This would normally check request context or service identity
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache write attempt to protected key: ${key}`);
        }

        // Sign and store protected data
        const signature = this.generateSignature(key, value);
        const signedData = { value, signature };
        await CacheModel.set(key, signedData, ttl);
      } else {
        // Non-protected keys can be written directly
        await CacheModel.set(key, value, ttl);
      }
    } catch (error) {
      this.log.error('Cache set error', { error, key });
      throw error; // Re-throw to prevent silent failures
    }
  }

  private validateWritePermission(key: string): boolean {
    // Check if the current service/user has permission to write to this cache key
    // This should be enhanced based on your authentication context
    
    // For now, we'll implement basic service-level validation
    const serviceId = process.env.SERVICE_ID || 'analytics-service';
    
    // Statistics and metrics should only be written by analytics service
    if (key.startsWith('stats:') || key.startsWith('metrics:')) {
      return serviceId === 'analytics-service';
    }
    
    // Event data should only be written by event service or analytics service
    if (key.startsWith('event:')) {
      return ['event-service', 'analytics-service'].includes(serviceId);
    }
    
    // Aggregate data should only be written by analytics service
    if (key.startsWith('aggregate:')) {
      return serviceId === 'analytics-service';
    }
    
    return true; // Allow writes to non-protected keys
  }

  async delete(key: string): Promise<void> {
    try {
      // Validate permission to delete protected keys
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache delete attempt for protected key: ${key}`);
        }
      }
      
      await CacheModel.delete(key);
    } catch (error) {
      this.log.error('Cache delete error', { error, key });
      throw error;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      // Check if pattern includes protected keys
      const affectsProtected = this.PROTECTED_PREFIXES.some(prefix => 
        pattern.includes(prefix) || pattern === '*'
      );
      
      if (affectsProtected) {
        const hasPermission = this.validateWritePermission(pattern);
        if (!hasPermission) {
          throw new Error(`Unauthorized pattern delete for protected keys: ${pattern}`);
        }
      }
      
      return await CacheModel.deletePattern(pattern);
    } catch (error) {
      this.log.error('Cache delete pattern error', { error, pattern });
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return await CacheModel.exists(key);
    } catch (error) {
      this.log.error('Cache exists error', { error, key });
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      // Validate permission for protected keys
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache expire attempt for protected key: ${key}`);
        }
      }
      
      await CacheModel.expire(key, ttl);
    } catch (error) {
      this.log.error('Cache expire error', { error, key });
      throw error;
    }
  }

  async increment(key: string, by: number = 1): Promise<number> {
    try {
      // Increments on protected keys need validation
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache increment for protected key: ${key}`);
        }
        
        // For protected numeric values, maintain integrity
        const current = await this.get<number>(key) || 0;
        const newValue = current + by;
        await this.set(key, newValue);
        return newValue;
      }
      
      return await CacheModel.increment(key, by);
    } catch (error) {
      this.log.error('Cache increment error', { error, key });
      return 0;
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Generate value
      const value = await factory();

      // Store in cache with appropriate validation
      await this.set(key, value, ttl);

      return value;
    } catch (error) {
      this.log.error('Cache getOrSet error', { error, key });
      // Return factory result even if cache fails
      return await factory();
    }
  }

  async invalidateVenueCache(venueId: string): Promise<void> {
    try {
      // Validate permission to invalidate venue cache
      const hasPermission = this.validateWritePermission(`venue:${venueId}`);
      if (!hasPermission) {
        throw new Error(`Unauthorized venue cache invalidation for: ${venueId}`);
      }
      
      await CacheModel.invalidateVenueCache(venueId);
      this.log.info('Venue cache invalidated', { venueId });
    } catch (error) {
      this.log.error('Failed to invalidate venue cache', { error, venueId });
      throw error;
    }
  }

  async warmupCache(venueId: string): Promise<void> {
    try {
      // This would pre-populate commonly accessed data
      this.log.info('Cache warmup started', { venueId });

      // In production, this would:
      // - Load venue settings
      // - Pre-calculate common metrics
      // - Load dashboard configurations
      // - Cache widget data

      this.log.info('Cache warmup completed', { venueId });
    } catch (error) {
      this.log.error('Cache warmup failed', { error, venueId });
    }
  }

  async getCacheStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    keys: number;
    memory: number;
  }> {
    // In production, this would track cache statistics
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      keys: 0,
      memory: 0
    };
  }

  async flushAll(): Promise<void> {
    try {
      // Only allow flush from admin or during tests
      const isTest = process.env.NODE_ENV === 'test';
      const isAdmin = process.env.SERVICE_ID === 'admin-service';
      
      if (!isTest && !isAdmin) {
        throw new Error('Unauthorized cache flush attempt');
      }
      
      // Warning: This clears all cache data
      await CacheModel.deletePattern('*');
      this.log.warn('All cache data flushed');
    } catch (error) {
      this.log.error('Failed to flush cache', { error });
      throw error;
    }
  }
}

export const cacheService = CacheService.getInstance();
```

### FILE: src/services/export.service.ts
```typescript
import { ExportModel } from '../models';
import {
  ExportRequest,
  ExportStatus,
  ExportFormat,
  FinancialExportData,
  CustomerExportData
} from '../types';
import { logger } from '../utils/logger';
import { messageGatewayService } from './message-gateway.service';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import Excel from 'exceljs';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';

export class ExportService {
  private static instance: ExportService;
  private log = logger.child({ component: 'ExportService' });

  static getInstance(): ExportService {
    if (!this.instance) {
      this.instance = new ExportService();
    }
    return this.instance;
  }

  async createExport(
    request: Omit<ExportRequest, 'id' | 'createdAt' | 'status'>
  ): Promise<ExportRequest> {
    try {
      const exportRequest = await ExportModel.createExport({
        ...request,
        status: ExportStatus.PENDING
      });

      // Queue export for processing
      this.processExportAsync(exportRequest.id);

      return exportRequest;
    } catch (error) {
      this.log.error('Failed to create export', { error });
      throw error;
    }
  }

  private async processExportAsync(exportId: string): Promise<void> {
    try {
      // Update status to processing
      await ExportModel.updateExportStatus(exportId, ExportStatus.PROCESSING);

      // Get export details
      const exportRequest = await ExportModel.findById(exportId);
      if (!exportRequest) {
        throw new Error('Export request not found');
      }

      // Generate export based on type
      let filePath: string;
      switch (exportRequest.type) {
        case 'analytics_report':
          filePath = await this.generateAnalyticsReport(exportRequest);
          break;
        case 'customer_list':
          filePath = await this.generateCustomerList(exportRequest);
          break;
        case 'financial_report':
          filePath = await this.generateFinancialReport(exportRequest);
          break;
        default:
          throw new Error(`Unsupported export type: ${exportRequest.type}`);
      }

      // Upload to storage (mock)
      const fileUrl = await this.uploadToStorage(filePath);
      const fileSize = (await fs.stat(filePath)).size;

      // Update export status
      await ExportModel.updateExportStatus(exportId, ExportStatus.COMPLETED, {
        fileUrl,
        fileSize,
        completedAt: new Date()
      });

      // Send notification
      await messageGatewayService.sendMessage(
        'email',
        exportRequest.userId,
        'report-ready-email',
        {
          reportName: exportRequest.type,
          generatedAt: new Date().toISOString(),
          fileSize: this.formatFileSize(fileSize),
          downloadUrl: fileUrl,
          expirationDays: 7
        }
      );

      // Clean up temp file
      await fs.unlink(filePath);
    } catch (error) {
      this.log.error('Failed to process export', { error, exportId });

      await ExportModel.updateExportStatus(exportId, ExportStatus.FAILED, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async generateAnalyticsReport(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchAnalyticsData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.CSV:
        return await this.generateCSV(data, 'analytics-report');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'analytics-report');
      case ExportFormat.PDF:
        return await this.generatePDF(data, 'analytics-report');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateCustomerList(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchCustomerData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.CSV:
        return await this.generateCSV(data.customers, 'customer-list');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'customer-list');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateFinancialReport(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchFinancialData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.PDF:
        return await this.generatePDF(data, 'financial-report');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'financial-report');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateCSV(data: any[], fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.csv`);

    const parser = new Parser();
    const csv = parser.parse(data);

    await fs.writeFile(filePath, csv);

    return filePath;
  }

  private async generateExcel(data: any, fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.xlsx`);

    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add data based on structure
    if (Array.isArray(data)) {
      // Simple array of objects
      if (data.length > 0) {
        worksheet.columns = Object.keys(data[0]).map(key => ({
          header: key,
          key: key,
          width: 15
        }));
        worksheet.addRows(data);
      }
    } else if (data.summary && data.customers) {
      // Customer report structure
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRow(['Metric', 'Value']);
      Object.entries(data.summary).forEach(([key, value]) => {
        summarySheet.addRow([key, value]);
      });

      worksheet.columns = Object.keys(data.customers[0] || {}).map(key => ({
        header: key,
        key: key,
        width: 15
      }));
      worksheet.addRows(data.customers);
    }

    await workbook.xlsx.writeFile(filePath);

    return filePath;
  }

  private async generatePDF(data: any, fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.pdf`);

    const doc = new PDFDocument();
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Add content based on report type
    doc.fontSize(20).text('Analytics Report', { align: 'center' });
    doc.moveDown();

    if (data.summary) {
      doc.fontSize(16).text('Summary', { underline: true });
      doc.moveDown();

      Object.entries(data.summary).forEach(([key, value]) => {
        doc.fontSize(12).text(`${key}: ${value}`);
      });
    }

    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => resolve(filePath));
    });
  }

  private async fetchAnalyticsData(_exportRequest: ExportRequest): Promise<any> {
    // Mock data - in production, fetch from analytics database
    return [
      { date: '2024-01-01', sales: 100, revenue: 10000 },
      { date: '2024-01-02', sales: 120, revenue: 12000 },
      { date: '2024-01-03', sales: 90, revenue: 9000 }
    ];
  }

  private async fetchCustomerData(_exportRequest: ExportRequest): Promise<CustomerExportData> {
    // Mock data - in production, fetch from customer database
    return {
      summary: {
        totalCustomers: 1000,
        newCustomers: 150,
        activeCustomers: 800
      },
      customers: [
        {
          customerId: 'hash-1',
          firstPurchase: new Date('2023-01-01'),
          lastPurchase: new Date('2024-01-01'),
          totalSpent: 500,
          totalTickets: 5,
          segment: 'regular'
        }
      ]
    };
  }

  private async fetchFinancialData(_exportRequest: ExportRequest): Promise<FinancialExportData> {
    // Mock data - in production, fetch from financial database
    return {
      summary: {
        totalRevenue: 100000,
        totalTransactions: 1000,
        averageOrderValue: 100,
        refundAmount: 5000,
        netRevenue: 95000
      },
      byPeriod: [],
      byEventType: [],
      transactions: []
    };
  }

  private async uploadToStorage(filePath: string): Promise<string> {
    // In production, upload to S3 or similar
    // For now, return a mock URL
    return `https://storage.example.com/exports/${path.basename(filePath)}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  async getExportStatus(exportId: string): Promise<ExportRequest | null> {
    return await ExportModel.findById(exportId);
  }

  async getUserExports(
    userId: string,
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    return await ExportModel.getExportsByUser(userId, venueId, limit);
  }
}

export const exportService = ExportService.getInstance();
```

### FILE: src/services/anonymization.service.ts
```typescript
import * as crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

export class AnonymizationService {
  private static instance: AnonymizationService;
  private log = logger.child({ component: 'AnonymizationService' });
  private dailySalt: string;
  private saltGeneratedAt: Date;

  static getInstance(): AnonymizationService {
    if (!this.instance) {
      this.instance = new AnonymizationService();
    }
    return this.instance;
  }

  constructor() {
    this.dailySalt = this.generateDailySalt();
    this.saltGeneratedAt = new Date();
  }

  private generateDailySalt(): string {
    const date = new Date().toISOString().split('T')[0];
    return crypto
      .createHash('sha256')
      .update(`${config.privacy.customerHashSalt}-${date}`)
      .digest('hex');
  }

  private checkAndUpdateSalt(): void {
    const now = new Date();
    const lastGenerated = new Date(this.saltGeneratedAt);
    
    // Check if we're in a new day
    if (now.getDate() !== lastGenerated.getDate()) {
      this.dailySalt = this.generateDailySalt();
      this.saltGeneratedAt = now;
      this.log.info('Daily salt rotated');
    }
  }

  async hashCustomerId(customerId: string): Promise<string> {
    this.checkAndUpdateSalt();
    
    return crypto
      .createHash('sha256')
      .update(`${customerId}-${this.dailySalt}`)
      .digest('hex')
      .substring(0, 16); // Take first 16 chars for shorter IDs
  }

  async hashEmail(email: string): Promise<string> {
    this.checkAndUpdateSalt();
    
    const normalizedEmail = email.toLowerCase().trim();
    return crypto
      .createHash('sha256')
      .update(`${normalizedEmail}-${this.dailySalt}`)
      .digest('hex');
  }

  anonymizeLocation(location: any): any {
    if (!location) return null;

    return {
      country: location.country,
      region: location.region || location.state,
      // Only keep first 3 digits of postal code
      postalCode: location.postalCode?.substring(0, 3)
    };
  }

  anonymizeDeviceInfo(deviceInfo: any): any {
    if (!deviceInfo) return null;

    return {
      type: deviceInfo.type || 'unknown',
      os: this.generalizeOS(deviceInfo.os),
      browser: this.generalizeBrowser(deviceInfo.browser)
    };
  }

  private generalizeOS(os: string | undefined): string {
    if (!os) return 'unknown';
    
    const osLower = os.toLowerCase();
    if (osLower.includes('windows')) return 'Windows';
    if (osLower.includes('mac') || osLower.includes('darwin')) return 'macOS';
    if (osLower.includes('linux')) return 'Linux';
    if (osLower.includes('android')) return 'Android';
    if (osLower.includes('ios') || osLower.includes('iphone')) return 'iOS';
    
    return 'Other';
  }

  private generalizeBrowser(browser: string | undefined): string {
    if (!browser) return 'unknown';
    
    const browserLower = browser.toLowerCase();
    if (browserLower.includes('chrome')) return 'Chrome';
    if (browserLower.includes('firefox')) return 'Firefox';
    if (browserLower.includes('safari')) return 'Safari';
    if (browserLower.includes('edge')) return 'Edge';
    if (browserLower.includes('opera')) return 'Opera';
    
    return 'Other';
  }

  aggregateAgeGroup(age: number | undefined): string | undefined {
    if (!age) return undefined;
    
    if (age < 18) return 'under-18';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    if (age < 65) return '55-64';
    
    return '65+';
  }

  anonymizeCustomerData(data: any): any {
    const anonymized = { ...data };
    
    // Remove all PII fields
    delete anonymized.firstName;
    delete anonymized.lastName;
    delete anonymized.email;
    delete anonymized.phone;
    delete anonymized.address;
    delete anonymized.dateOfBirth;
    delete anonymized.socialSecurityNumber;
    delete anonymized.creditCard;
    
    // Anonymize remaining fields
    if (anonymized.location) {
      anonymized.location = this.anonymizeLocation(anonymized.location);
    }
    
    if (anonymized.deviceInfo) {
      anonymized.deviceInfo = this.anonymizeDeviceInfo(anonymized.deviceInfo);
    }
    
    if (anonymized.age) {
      anonymized.ageGroup = this.aggregateAgeGroup(anonymized.age);
      delete anonymized.age;
    }
    
    return anonymized;
  }

  generateAnonymousId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}

export const anonymizationService = AnonymizationService.getInstance();
```

