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
