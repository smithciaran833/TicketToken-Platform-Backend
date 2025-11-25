import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { PromotionalCampaign, CreateCampaignRequest, CampaignStatus, CampaignPerformance } from '../types/campaign.types';
import { CreatePromoCodeRequest, DiscountType } from '../types/promo-code.types';
import { promoCodeService } from './promo-code.service';

export class CampaignService {
  async createCampaign(tenantId: string, createdBy: string, request: CreateCampaignRequest): Promise<PromotionalCampaign> {
    const db = getDatabase();
    try {
      const result = await db.query(
        `INSERT INTO promotional_campaigns (tenant_id, name, description, start_date, end_date, target_audience, budget_limit_cents, ab_test_enabled, ab_test_config, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [tenantId, request.name, request.description, request.startDate, request.endDate, JSON.stringify(request.targetAudience || {}), request.budgetLimitCents, request.abTestEnabled || false, JSON.stringify(request.abTestConfig || {}), createdBy]
      );
      return this.mapToCampaign(result.rows[0]);
    } catch (error) {
      logger.error('Error creating campaign', { error, request });
      throw error;
    }
  }

  async generatePromoCodes(tenantId: string, campaignId: string, count: number, codeRequest: CreatePromoCodeRequest): Promise<string[]> {
    const db = getDatabase();
    const generatedCodes: string[] = [];
    
    try {
      for (let i = 0; i < count; i++) {
        const code = this.generateRandomCode(8);
        const promoCode = await promoCodeService.createPromoCode(tenantId, campaignId, { ...codeRequest, code });
        await db.query('INSERT INTO campaign_promo_codes (campaign_id, promo_code_id) VALUES ($1, $2)', [campaignId, promoCode.id]);
        generatedCodes.push(code);
      }
      
      await db.query('UPDATE promotional_campaigns SET generated_codes_count = generated_codes_count + $1 WHERE id = $2', [count, campaignId]);
      logger.info('Generated promo codes for campaign', { campaignId, count });
      return generatedCodes;
    } catch (error) {
      logger.error('Error generating promo codes', { error, campaignId, count });
      throw error;
    }
  }

  async activateCampaign(campaignId: string): Promise<void> {
    const db = getDatabase();
    try {
      await db.query('UPDATE promotional_campaigns SET status = $1, updated_at = NOW() WHERE id = $2', [CampaignStatus.ACTIVE, campaignId]);
      logger.info('Campaign activated', { campaignId });
    } catch (error) {
      logger.error('Error activating campaign', { error, campaignId });
      throw error;
    }
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    const db = getDatabase();
    try {
      await db.query('UPDATE promotional_campaigns SET status = $1, updated_at = NOW() WHERE id = $2', [CampaignStatus.PAUSED, campaignId]);
      logger.info('Campaign paused', { campaignId });
    } catch (error) {
      logger.error('Error pausing campaign', { error, campaignId });
      throw error;
    }
  }

  async getCampaignPerformance(campaignId: string): Promise<CampaignPerformance> {
    const db = getDatabase();
    try {
      const result = await db.query(
        `SELECT c.id, COUNT(r.id) as total_redemptions, COALESCE(SUM(r.discount_applied_cents), 0) as total_revenue FROM promotional_campaigns c LEFT JOIN campaign_promo_codes cpc ON c.id = cpc.campaign_id LEFT JOIN promo_code_redemptions r ON cpc.promo_code_id = r.promo_code_id WHERE c.id = $1 GROUP BY c.id`,
        [campaignId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Campaign not found');
      }
      
      const row = result.rows[0];
      const totalRedemptions = parseInt(row.total_redemptions);
      const totalRevenue = parseInt(row.total_revenue);
      
      return {
        campaignId,
        totalRedemptions,
        totalRevenue,
        redemptionRate: totalRedemptions > 0 ? 100 : 0,
        averageOrderValue: totalRedemptions > 0 ? totalRevenue / totalRedemptions : 0,
        roi: 0,
      };
    } catch (error) {
      logger.error('Error getting campaign performance', { error, campaignId });
      throw error;
    }
  }

  private generateRandomCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private mapToCampaign(row: any): PromotionalCampaign {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      targetAudience: row.target_audience,
      budgetLimitCents: row.budget_limit_cents,
      totalSpentCents: row.total_spent_cents,
      generatedCodesCount: row.generated_codes_count,
      abTestEnabled: row.ab_test_enabled,
      abTestConfig: row.ab_test_config,
      performanceMetrics: row.performance_metrics,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const campaignService = new CampaignService();
