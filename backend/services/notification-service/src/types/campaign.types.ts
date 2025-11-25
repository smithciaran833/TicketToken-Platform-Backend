/**
 * Campaign Management Request Types
 * 
 * Type definitions for campaign route request bodies
 */

export interface CreateCampaignRequest {
  venueId: string;
  name: string;
  templateId: string;
  segmentId?: string;
  audienceFilter?: any;
  scheduledFor?: Date;
  type?: 'transactional' | 'marketing' | 'system';
  channel?: 'email' | 'sms' | 'push' | 'webhook';
}

export interface CreateSegmentRequest {
  venueId: string;
  name: string;
  description?: string;
  filterCriteria: any;
  isDynamic?: boolean;
}

export interface CreateAutomationTriggerRequest {
  venueId: string;
  name: string;
  triggerType: string;
  templateId: string;
  triggerConditions: any;
  delayMinutes?: number;
}

export interface TrackAbandonedCartRequest {
  userId: string;
  venueId: string;
  eventId: string;
  cartItems: any[];
  totalAmountCents: number;
}

export interface CreateABTestRequest {
  venueId: string;
  name: string;
  description?: string;
  testType: string;
  variantCount: number;
  sampleSizePerVariant: number;
  winningMetric: string;
  variants: Array<{
    name: string;
    templateId?: string;
    variantData: any;
  }>;
}
