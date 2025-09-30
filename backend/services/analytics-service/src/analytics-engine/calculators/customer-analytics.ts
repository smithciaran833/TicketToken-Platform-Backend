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
