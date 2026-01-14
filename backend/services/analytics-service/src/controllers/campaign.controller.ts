import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { attributionService } from '../services/attribution.service';
import { CampaignSchema } from '../models';

interface VenueParams {
  venueId: string;
}

interface CampaignParams {
  campaignId: string;
  venueId?: string;
}

interface GetCampaignsQuery {
  status?: 'draft' | 'active' | 'paused' | 'completed';
  type?: string;
  page?: number;
  limit?: number;
}

interface PerformanceQuery {
  startDate?: string;
  endDate?: string;
}

interface AttributionQuery {
  model?: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven';
}

interface ChannelPerformanceQuery {
  startDate: string;
  endDate: string;
}

interface TrackTouchpointBody {
  venueId: string;
  customerId: string;
  channel: string;
  action: string;
  value?: number;
  campaign?: string;
  metadata?: Record<string, any>;
}

class CampaignController extends BaseController {
  getCampaigns = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: GetCampaignsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { status, type } = request.query;
      
      const campaigns = await CampaignSchema.getCampaigns(venueId, {
        status,
        type
      });
      
      return this.success(reply, { campaigns });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCampaign = async (
    request: FastifyRequest<{ Params: CampaignParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { campaignId, venueId } = request.params;
      
      // Get campaigns for the venue and find the specific one
      const campaigns = await CampaignSchema.getCampaigns(venueId || '');
      const campaign = campaigns.find(c => c.id === campaignId);
      
      if (!campaign) {
        return this.notFound(reply, 'Campaign not found');
      }
      return this.success(reply, { campaign });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCampaignPerformance = async (
    request: FastifyRequest<{ Params: CampaignParams; Querystring: PerformanceQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { campaignId } = request.params;
      
      const performance = await CampaignSchema.getCampaignPerformance(campaignId);
      
      return this.success(reply, { performance });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCampaignAttribution = async (
    request: FastifyRequest<{ Params: CampaignParams; Querystring: AttributionQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { campaignId, venueId } = request.params;
      const { model = 'last_touch' } = request.query;
      
      if (!venueId) {
        return this.badRequest(reply, 'Venue ID is required');
      }
      
      // Get campaign performance which contains conversion data
      const performance = await CampaignSchema.getCampaignPerformance(campaignId);
      
      // Calculate attribution based on performance data
      const attribution = performance.map((channel: any) => ({
        channel: channel._id,
        impressions: channel.impressions,
        clicks: channel.clicks,
        conversions: channel.conversions,
        revenue: channel.revenue,
        conversionRate: channel.clicks > 0 ? (channel.conversions / channel.clicks) * 100 : 0
      }));
      
      const totalRevenue = attribution.reduce((sum: number, a: any) => sum + a.revenue, 0);
      const totalConversions = attribution.reduce((sum: number, a: any) => sum + a.conversions, 0);
      
      return this.success(reply, { 
        attribution,
        model,
        totalConversions,
        totalRevenue
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getChannelPerformance = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: ChannelPerformanceQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { startDate, endDate } = request.query;
      
      const performance = await attributionService.getChannelPerformance(
        venueId,
        new Date(startDate),
        new Date(endDate)
      );
      
      return this.success(reply, { channels: performance.channels });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  trackTouchpoint = async (
    request: FastifyRequest<{ Body: TrackTouchpointBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, customerId, channel, action, value, campaign, metadata } = request.body;
      
      await attributionService.trackTouchpoint(venueId, customerId, {
        timestamp: new Date(),
        channel,
        action,
        value: value || 0,
        campaign: campaign || 'none',
        customerId,
        ...metadata
      });
      
      return this.success(reply, { message: 'Touchpoint tracked' }, 201);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCampaignROI = async (
    request: FastifyRequest<{ Params: CampaignParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { campaignId, venueId } = request.params;
      
      if (!venueId) {
        return this.badRequest(reply, 'Venue ID is required');
      }
      
      const roi = await attributionService.getCampaignROI(venueId, campaignId);
      
      return this.success(reply, { roi });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const campaignController = new CampaignController();
