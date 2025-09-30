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
