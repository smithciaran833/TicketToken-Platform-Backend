
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
