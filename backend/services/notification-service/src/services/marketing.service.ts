import { MarketingContentModel, IMarketingContent, CampaignStatus } from '../models/mongodb/marketing-content.model';
import { logger } from '../utils/logger';

export class MarketingService {
  async createCampaign(data: Partial<IMarketingContent>): Promise<IMarketingContent> {
    try {
      const campaign = new MarketingContentModel(data);
      await campaign.save();
      logger.info(`[Marketing] Campaign created: ${campaign._id}`);
      return campaign;
    } catch (error) {
      logger.error('[Marketing] Create campaign error:', error);
      throw error;
    }
  }

  async updateCampaign(campaignId: string, data: Partial<IMarketingContent>): Promise<IMarketingContent | null> {
    try {
      const campaign = await MarketingContentModel.findByIdAndUpdate(
        campaignId,
        { ...data, updatedAt: new Date() },
        { new: true }
      );
      return campaign;
    } catch (error) {
      logger.error('[Marketing] Update campaign error:', error);
      throw error;
    }
  }

  async deleteCampaign(campaignId: string): Promise<boolean> {
    const result = await MarketingContentModel.findByIdAndDelete(campaignId);
    return !!result;
  }

  async getCampaign(campaignId: string): Promise<IMarketingContent | null> {
    return await MarketingContentModel.findById(campaignId);
  }

  async getCampaigns(filters: any = {}): Promise<IMarketingContent[]> {
    return await MarketingContentModel.find(filters).sort({ createdAt: -1 });
  }

  async publishCampaign(campaignId: string, userId: string): Promise<IMarketingContent | null> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    campaign.status = 'active';
    campaign.publishedAt = new Date();
    campaign.updatedBy = userId;
    await campaign.save();
    
    logger.info(`[Marketing] Campaign ${campaignId} published`);
    return campaign;
  }

  async pauseCampaign(campaignId: string, userId: string): Promise<IMarketingContent | null> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    campaign.status = 'paused';
    campaign.pausedAt = new Date();
    campaign.updatedBy = userId;
    await campaign.save();
    
    return campaign;
  }

  async createABTest(campaignId: string, variants: any[], testDuration: number): Promise<IMarketingContent | null> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    campaign.abTest = {
      enabled: true,
      variants: variants.map(v => ({
        ...v,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      })),
      testDuration,
    };
    
    await campaign.save();
    logger.info(`[Marketing] A/B test created for campaign ${campaignId}`);
    return campaign;
  }

  async getABTestResults(campaignId: string): Promise<any> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign || !campaign.abTest) throw new Error('A/B test not found');
    
    const variants = campaign.abTest.variants.map(v => ({
      variantId: v.variantId,
      name: v.name,
      impressions: v.impressions,
      clicks: v.clicks,
      conversions: v.conversions,
      revenue: v.revenue,
      ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
      conversionRate: v.clicks > 0 ? (v.conversions / v.clicks) * 100 : 0,
    }));
    
    return { campaignId, variants, winnerVariantId: campaign.abTest.winnerVariantId };
  }

  async declareWinner(campaignId: string, variantId: string, userId: string): Promise<IMarketingContent | null> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign || !campaign.abTest) throw new Error('A/B test not found');
    
    campaign.abTest.winnerVariantId = variantId;
    campaign.abTest.winnerDeclaredAt = new Date();
    campaign.updatedBy = userId;
    await campaign.save();
    
    logger.info(`[Marketing] Winner declared for ${campaignId}: ${variantId}`);
    return campaign;
  }

  async trackImpression(campaignId: string, variantId?: string): Promise<void> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign) return;
    
    campaign.performance.impressions += 1;
    
    if (variantId && campaign.abTest?.enabled) {
      const variant = campaign.abTest.variants.find(v => v.variantId === variantId);
      if (variant) variant.impressions += 1;
    }
    
    campaign.performance.lastUpdated = new Date();
    await campaign.save();
  }

  async trackClick(campaignId: string, variantId?: string): Promise<void> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign) return;
    
    campaign.performance.clicks += 1;
    campaign.performance.ctr = (campaign.performance.clicks / campaign.performance.impressions) * 100;
    
    if (variantId && campaign.abTest?.enabled) {
      const variant = campaign.abTest.variants.find(v => v.variantId === variantId);
      if (variant) variant.clicks += 1;
    }
    
    campaign.performance.lastUpdated = new Date();
    await campaign.save();
  }

  async trackConversion(campaignId: string, revenue: number, variantId?: string): Promise<void> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign) return;
    
    campaign.performance.conversions += 1;
    campaign.performance.revenue += revenue;
    campaign.performance.conversionRate = (campaign.performance.conversions / campaign.performance.clicks) * 100;
    
    if (variantId && campaign.abTest?.enabled) {
      const variant = campaign.abTest.variants.find(v => v.variantId === variantId);
      if (variant) {
        variant.conversions += 1;
        variant.revenue += revenue;
      }
    }
    
    campaign.performance.lastUpdated = new Date();
    await campaign.save();
  }

  async getPerformanceMetrics(campaignId: string): Promise<any> {
    const campaign = await MarketingContentModel.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    return {
      campaignId,
      status: campaign.status,
      performance: campaign.performance,
      budget: campaign.budget,
      roi: campaign.budget.spent > 0 
        ? ((campaign.performance.revenue - campaign.budget.spent) / campaign.budget.spent) * 100 
        : 0,
    };
  }
}
