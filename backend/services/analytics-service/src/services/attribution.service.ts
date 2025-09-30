import { CampaignSchema } from '../models';
import {
  MarketingAttribution,
  AttributionPath,
  TouchPoint,
} from '../types';
import { logger } from '../utils/logger';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class AttributionService {
  private static instance: AttributionService;
  private log = logger.child({ component: 'AttributionService' });

  static getInstance(): AttributionService {
    if (!this.instance) {
      this.instance = new AttributionService();
    }
    return this.instance;
  }

  async trackTouchpoint(
    venueId: string,
    customerId: string,
    touchpoint: TouchPoint
  ): Promise<void> {
    try {
      await CampaignSchema.trackTouchpoint({
        ...touchpoint,
        venueId,
        customerId
      } as any);

      this.log.debug('Touchpoint tracked', {
        venueId,
        customerId,
        channel: touchpoint.channel
      });
    } catch (error) {
      this.log.error('Failed to track touchpoint', { error, venueId });
      throw error;
    }
  }

  async getCustomerJourney(
    venueId: string,
    customerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TouchPoint[]> {
    try {
      return await CampaignSchema.getCustomerTouchpoints(
        venueId,
        customerId,
        startDate,
        endDate
      );
    } catch (error) {
      this.log.error('Failed to get customer journey', { error, venueId });
      throw error;
    }
  }

  async calculateAttribution(
    venueId: string,
    conversionId: string,
    revenue: number,
    model: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven' = 'last_touch'
  ): Promise<AttributionPath> {
    try {
      // Get all touchpoints for this conversion
      const touchpoints = await this.getConversionTouchpoints(venueId, conversionId);

      if (touchpoints.length === 0) {
        throw new Error('No touchpoints found for conversion');
      }

      const attribution = this.applyAttributionModel(touchpoints, revenue, model);

      const path: AttributionPath = {
        customerId: touchpoints[0].customerId || '',
        conversionId,
        revenue,
        touchpoints,
        attribution
      };

      // Cache attribution result
      const cacheKey = CacheModel.getCacheKey('attribution', venueId, conversionId);
      await CacheModel.set(cacheKey, path, CONSTANTS.CACHE_TTL.INSIGHTS);

      return path;
    } catch (error) {
      this.log.error('Failed to calculate attribution', { error, venueId });
      throw error;
    }
  }

  private applyAttributionModel(
    touchpoints: TouchPoint[],
    revenue: number,
    model: string
  ): Array<{ touchpointIndex: number; credit: number; revenue: number }> {
    const attribution = [];
    const n = touchpoints.length;

    switch (model) {
      case 'first_touch':
        attribution.push({
          touchpointIndex: 0,
          credit: 1.0,
          revenue: revenue
        });
        break;

      case 'last_touch':
        attribution.push({
          touchpointIndex: n - 1,
          credit: 1.0,
          revenue: revenue
        });
        break;

      case 'linear':
        const linearCredit = 1.0 / n;
        for (let i = 0; i < n; i++) {
          attribution.push({
            touchpointIndex: i,
            credit: linearCredit,
            revenue: revenue * linearCredit
          });
        }
        break;

      case 'time_decay':
        const halfLife = 7; // days
        const lastTouch = touchpoints[n - 1].timestamp;
        let totalWeight = 0;
        const weights = touchpoints.map(tp => {
          const daysFromLast = (lastTouch.getTime() - tp.timestamp.getTime()) / (1000 * 60 * 60 * 24);
          const weight = Math.pow(2, -daysFromLast / halfLife);
          totalWeight += weight;
          return weight;
        });

        touchpoints.forEach((_, i) => {
          const credit = weights[i] / totalWeight;
          attribution.push({
            touchpointIndex: i,
            credit,
            revenue: revenue * credit
          });
        });
        break;

      case 'data_driven':
        // Simplified data-driven model
        // In production, this would use ML models
        const channelWeights: Record<string, number> = {
          'organic': 0.3,
          'paid_search': 0.25,
          'social': 0.2,
          'email': 0.15,
          'direct': 0.1
        };

        let totalChannelWeight = 0;
        const credits = touchpoints.map(tp => {
          const weight = channelWeights[tp.channel] || 0.1;
          totalChannelWeight += weight;
          return weight;
        });

        touchpoints.forEach((_, i) => {
          const credit = credits[i] / totalChannelWeight;
          attribution.push({
            touchpointIndex: i,
            credit,
            revenue: revenue * credit
          });
        });
        break;
    }

    return attribution;
  }

  async getChannelPerformance(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MarketingAttribution> {
    try {
      // Get all conversions and their touchpoints
      const conversions = await this.getConversions(venueId, startDate, endDate);
      const channelMetrics = new Map<string, any>();

      for (const conversion of conversions) {
        const attribution = await this.calculateAttribution(
          venueId,
          conversion.id,
          conversion.revenue,
          'linear'
        );

        // Aggregate by channel
        attribution.attribution.forEach((attr) => {
          const touchpoint = attribution.touchpoints[attr.touchpointIndex];
          const channel = touchpoint.channel;

          if (!channelMetrics.has(channel)) {
            channelMetrics.set(channel, {
              channel,
              source: touchpoint.channel,
              medium: touchpoint.channel,
              visits: 0,
              conversions: 0,
              revenue: 0,
              cost: 0
            });
          }

          const metrics = channelMetrics.get(channel);
          metrics.visits += attr.credit;
          metrics.conversions += attr.credit;
          metrics.revenue += attr.revenue;
        });
      }

      // Calculate ROI and CPA
      const channels = Array.from(channelMetrics.values()).map(metrics => ({
        ...metrics,
        roi: metrics.cost > 0 ? ((metrics.revenue - metrics.cost) / metrics.cost) * 100 : 0,
        costPerAcquisition: metrics.conversions > 0 ? metrics.cost / metrics.conversions : 0
      }));

      // Multi-touch attribution summary
      const multiTouchAttribution = channels.map(ch => ({
        touchpoint: ch.channel,
        attribution: ch.conversions,
        revenue: ch.revenue
      }));

      return {
        channels,
        multiTouchAttribution
      };
    } catch (error) {
      this.log.error('Failed to get channel performance', { error, venueId });
      throw error;
    }
  }

  async getCampaignROI(
    venueId: string,
    campaignId: string
  ): Promise<{
    revenue: number;
    cost: number;
    roi: number;
    conversions: number;
    costPerAcquisition: number;
  }> {
    try {
      const performance = await CampaignSchema.getCampaignPerformance(campaignId);

      const totals = performance.reduce((acc: any, channel: any) => ({
        revenue: acc.revenue + channel.revenue,
        conversions: acc.conversions + channel.conversions,
        cost: acc.cost + (channel.cost || 0)
      }), { revenue: 0, conversions: 0, cost: 0 });

      return {
        ...totals,
        roi: totals.cost > 0 ? ((totals.revenue - totals.cost) / totals.cost) * 100 : 0,
        costPerAcquisition: totals.conversions > 0 ? totals.cost / totals.conversions : 0
      };
    } catch (error) {
      this.log.error('Failed to get campaign ROI', { error, venueId, campaignId });
      throw error;
    }
  }

  private async getConversionTouchpoints(
    _venueId: string,
    _conversionId: string
  ): Promise<TouchPoint[]> {
    // In production, this would query the actual conversion data
    // For now, return mock touchpoints
    return [
      {
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        channel: 'organic',
        action: 'visit',
        value: 0,
        campaign: 'none',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        channel: 'email',
        action: 'click',
        value: 0,
        campaign: 'weekly-newsletter',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        channel: 'paid_search',
        action: 'click',
        value: 0,
        campaign: 'brand-campaign',
        customerId: 'cust-1'
      },
      {
        timestamp: new Date(),
        channel: 'direct',
        action: 'conversion',
        value: 150,
        campaign: 'none',
        customerId: 'cust-1'
      }
    ];
  }

  private async getConversions(
    _venueId: string,
    _startDate: Date,
    _endDate: Date
  ): Promise<Array<{ id: string; revenue: number; customerId: string }>> {
    // In production, this would query actual conversion data
    // For now, return mock data
    return [
      { id: 'conv-1', revenue: 150, customerId: 'cust-1' },
      { id: 'conv-2', revenue: 200, customerId: 'cust-2' },
      { id: 'conv-3', revenue: 100, customerId: 'cust-3' }
    ];
  }
}

export const attributionService = AttributionService.getInstance();
