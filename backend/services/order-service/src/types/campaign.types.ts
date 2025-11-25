export enum CampaignStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}

export interface PromotionalCampaign {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  status: CampaignStatus;
  targetAudience?: Record<string, any>;
  budgetLimitCents?: number;
  totalSpentCents: number;
  generatedCodesCount: number;
  abTestEnabled: boolean;
  abTestConfig?: Record<string, any>;
  performanceMetrics?: Record<string, any>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCampaignRequest {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  targetAudience?: Record<string, any>;
  budgetLimitCents?: number;
  abTestEnabled?: boolean;
  abTestConfig?: Record<string, any>;
}

export interface CampaignPerformance {
  campaignId: string;
  totalRedemptions: number;
  totalRevenue: number;
  redemptionRate: number;
  averageOrderValue: number;
  roi: number;
}
