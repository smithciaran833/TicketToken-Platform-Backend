import { FastifyRequest, FastifyReply } from 'fastify';
import { MarketingService } from '../services/marketing.service';
import { logger } from '../utils/logger';

export class MarketingController {
  private marketingService: MarketingService;

  constructor() {
    this.marketingService = new MarketingService();
  }

  createCampaign = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const userId = (req as any).user?.id || 'system';
      const campaign = await this.marketingService.createCampaign({
        ...(req.body as Record<string, any>),
        createdBy: userId,
        updatedBy: userId,
      });
      return reply.status(201).send({ success: true, data: campaign });
    } catch (error: any) {
      logger.error('[MarketingController] Create campaign error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getCampaigns = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { status, contentType } = req.query as any;
      const filters: any = {};
      if (status) filters.status = status;
      if (contentType) filters.contentType = contentType;
      
      const campaigns = await this.marketingService.getCampaigns(filters);
      return reply.send({ success: true, data: campaigns });
    } catch (error: any) {
      logger.error('[MarketingController] Get campaigns error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getCampaign = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const campaign = await this.marketingService.getCampaign(campaignId);
      if (!campaign) {
        return reply.status(404).send({ success: false, error: 'Campaign not found' });
      }
      return reply.send({ success: true, data: campaign });
    } catch (error: any) {
      logger.error('[MarketingController] Get campaign error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  updateCampaign = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const userId = (req as any).user?.id || 'system';
      const campaign = await this.marketingService.updateCampaign(campaignId, {
        ...(req.body as Record<string, any>),
        updatedBy: userId,
      });
      if (!campaign) {
        return reply.status(404).send({ success: false, error: 'Campaign not found' });
      }
      return reply.send({ success: true, data: campaign });
    } catch (error: any) {
      logger.error('[MarketingController] Update campaign error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  deleteCampaign = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const success = await this.marketingService.deleteCampaign(campaignId);
      if (!success) {
        return reply.status(404).send({ success: false, error: 'Campaign not found' });
      }
      return reply.send({ success: true, message: 'Campaign deleted' });
    } catch (error: any) {
      logger.error('[MarketingController] Delete campaign error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  publishCampaign = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const userId = (req as any).user?.id || 'system';
      const campaign = await this.marketingService.publishCampaign(campaignId, userId);
      return reply.send({ success: true, data: campaign });
    } catch (error: any) {
      logger.error('[MarketingController] Publish campaign error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  pauseCampaign = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const userId = (req as any).user?.id || 'system';
      const campaign = await this.marketingService.pauseCampaign(campaignId, userId);
      return reply.send({ success: true, data: campaign });
    } catch (error: any) {
      logger.error('[MarketingController] Pause campaign error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  createABTest = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const { variants, testDuration } = req.body as any;
      const campaign = await this.marketingService.createABTest(campaignId, variants, testDuration);
      return reply.status(201).send({ success: true, data: campaign });
    } catch (error: any) {
      logger.error('[MarketingController] Create A/B test error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getABTestResults = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const results = await this.marketingService.getABTestResults(campaignId);
      return reply.send({ success: true, data: results });
    } catch (error: any) {
      logger.error('[MarketingController] Get A/B test results error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  declareWinner = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const { variantId } = req.body as any;
      const userId = (req as any).user?.id || 'system';
      const campaign = await this.marketingService.declareWinner(campaignId, variantId, userId);
      return reply.send({ success: true, data: campaign });
    } catch (error: any) {
      logger.error('[MarketingController] Declare winner error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  trackImpression = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const { variantId } = req.body as any;
      await this.marketingService.trackImpression(campaignId, variantId);
      return reply.send({ success: true });
    } catch (error: any) {
      logger.error('[MarketingController] Track impression error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  trackClick = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const { variantId } = req.body as any;
      await this.marketingService.trackClick(campaignId, variantId);
      return reply.send({ success: true });
    } catch (error: any) {
      logger.error('[MarketingController] Track click error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  trackConversion = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const { variantId, revenue } = req.body as any;
      await this.marketingService.trackConversion(campaignId, revenue, variantId);
      return reply.send({ success: true });
    } catch (error: any) {
      logger.error('[MarketingController] Track conversion error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getPerformanceMetrics = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { campaignId } = req.params as any;
      const metrics = await this.marketingService.getPerformanceMetrics(campaignId);
      return reply.send({ success: true, data: metrics });
    } catch (error: any) {
      logger.error('[MarketingController] Get metrics error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };
}
