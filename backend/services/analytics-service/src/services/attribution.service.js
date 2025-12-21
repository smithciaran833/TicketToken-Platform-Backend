"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attributionService = exports.AttributionService = void 0;
const models_1 = require("../models");
const logger_1 = require("../utils/logger");
const models_2 = require("../models");
const constants_1 = require("../config/constants");
class AttributionService {
    static instance;
    log = logger_1.logger.child({ component: 'AttributionService' });
    static getInstance() {
        if (!this.instance) {
            this.instance = new AttributionService();
        }
        return this.instance;
    }
    async trackTouchpoint(venueId, customerId, touchpoint) {
        try {
            await models_1.CampaignSchema.trackTouchpoint({
                ...touchpoint,
                venueId,
                customerId
            });
            this.log.debug('Touchpoint tracked', {
                venueId,
                customerId,
                channel: touchpoint.channel
            });
        }
        catch (error) {
            this.log.error('Failed to track touchpoint', { error, venueId });
            throw error;
        }
    }
    async getCustomerJourney(venueId, customerId, startDate, endDate) {
        try {
            return await models_1.CampaignSchema.getCustomerTouchpoints(venueId, customerId, startDate, endDate);
        }
        catch (error) {
            this.log.error('Failed to get customer journey', { error, venueId });
            throw error;
        }
    }
    async calculateAttribution(venueId, conversionId, revenue, model = 'last_touch') {
        try {
            const touchpoints = await this.getConversionTouchpoints(venueId, conversionId);
            if (touchpoints.length === 0) {
                throw new Error('No touchpoints found for conversion');
            }
            const attribution = this.applyAttributionModel(touchpoints, revenue, model);
            const path = {
                customerId: touchpoints[0].customerId || '',
                conversionId,
                revenue,
                touchpoints,
                attribution
            };
            const cacheKey = models_2.CacheModel.getCacheKey('attribution', venueId, conversionId);
            await models_2.CacheModel.set(cacheKey, path, constants_1.CONSTANTS.CACHE_TTL.INSIGHTS);
            return path;
        }
        catch (error) {
            this.log.error('Failed to calculate attribution', { error, venueId });
            throw error;
        }
    }
    applyAttributionModel(touchpoints, revenue, model) {
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
                const halfLife = 7;
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
                const channelWeights = {
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
    async getChannelPerformance(venueId, startDate, endDate) {
        try {
            const conversions = await this.getConversions(venueId, startDate, endDate);
            const channelMetrics = new Map();
            for (const conversion of conversions) {
                const attribution = await this.calculateAttribution(venueId, conversion.id, conversion.revenue, 'linear');
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
            const channels = Array.from(channelMetrics.values()).map(metrics => ({
                ...metrics,
                roi: metrics.cost > 0 ? ((metrics.revenue - metrics.cost) / metrics.cost) * 100 : 0,
                costPerAcquisition: metrics.conversions > 0 ? metrics.cost / metrics.conversions : 0
            }));
            const multiTouchAttribution = channels.map(ch => ({
                touchpoint: ch.channel,
                attribution: ch.conversions,
                revenue: ch.revenue
            }));
            return {
                channels,
                multiTouchAttribution
            };
        }
        catch (error) {
            this.log.error('Failed to get channel performance', { error, venueId });
            throw error;
        }
    }
    async getCampaignROI(venueId, campaignId) {
        try {
            const performance = await models_1.CampaignSchema.getCampaignPerformance(campaignId);
            const totals = performance.reduce((acc, channel) => ({
                revenue: acc.revenue + channel.revenue,
                conversions: acc.conversions + channel.conversions,
                cost: acc.cost + (channel.cost || 0)
            }), { revenue: 0, conversions: 0, cost: 0 });
            return {
                ...totals,
                roi: totals.cost > 0 ? ((totals.revenue - totals.cost) / totals.cost) * 100 : 0,
                costPerAcquisition: totals.conversions > 0 ? totals.cost / totals.conversions : 0
            };
        }
        catch (error) {
            this.log.error('Failed to get campaign ROI', { error, venueId, campaignId });
            throw error;
        }
    }
    async getConversionTouchpoints(_venueId, _conversionId) {
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
    async getConversions(_venueId, _startDate, _endDate) {
        return [
            { id: 'conv-1', revenue: 150, customerId: 'cust-1' },
            { id: 'conv-2', revenue: 200, customerId: 'cust-2' },
            { id: 'conv-3', revenue: 100, customerId: 'cust-3' }
        ];
    }
}
exports.AttributionService = AttributionService;
exports.attributionService = AttributionService.getInstance();
//# sourceMappingURL=attribution.service.js.map