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
