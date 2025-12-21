"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsController = void 0;
const analytics_engine_1 = require("../analytics-engine/analytics-engine");
const redis_1 = require("../config/redis");
class AnalyticsController {
    async getRevenueSummary(request, reply) {
        try {
            const { startDate, endDate } = request.query;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['revenue'],
                timeRange: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                }
            });
            return reply.send({
                success: true,
                data: result.revenue
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getRevenueByChannel(request, reply) {
        try {
            const { startDate, endDate } = request.query;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['revenue'],
                timeRange: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                }
            });
            return reply.send({
                success: true,
                data: result.revenue?.byChannel || []
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getRevenueProjections(request, reply) {
        try {
            const { days = 30 } = request.query;
            const venueId = request.venue.id;
            const { RevenueCalculator } = await Promise.resolve().then(() => __importStar(require('../analytics-engine/calculators/revenue-calculator')));
            const calculator = new RevenueCalculator();
            const projections = await calculator.projectRevenue(venueId, Number(days));
            return reply.send({
                success: true,
                data: projections
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getCustomerLifetimeValue(request, reply) {
        try {
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['customerMetrics'],
                timeRange: {
                    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                    end: new Date()
                }
            });
            return reply.send({
                success: true,
                data: result.customerMetrics?.clv || {}
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getCustomerSegments(request, reply) {
        try {
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['customerMetrics'],
                timeRange: {
                    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                    end: new Date()
                }
            });
            return reply.send({
                success: true,
                data: result.customerMetrics?.segmentation || []
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getChurnRiskAnalysis(request, reply) {
        try {
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['customerMetrics'],
                timeRange: {
                    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                    end: new Date()
                }
            });
            return reply.send({
                success: true,
                data: result.customerMetrics?.churnRisk || {}
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getSalesMetrics(request, reply) {
        try {
            const { startDate, endDate, granularity = 'day' } = request.query;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['ticketSales'],
                timeRange: {
                    start: new Date(startDate),
                    end: new Date(endDate),
                    granularity
                }
            });
            return reply.send({
                success: true,
                data: result.ticketSales || []
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getSalesTrends(request, reply) {
        try {
            const { startDate, endDate } = request.query;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['salesTrends'],
                timeRange: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                }
            });
            return reply.send({
                success: true,
                data: result.salesTrends || {}
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getEventPerformance(request, reply) {
        try {
            const { startDate, endDate } = request.query;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['topEvents'],
                timeRange: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                }
            });
            return reply.send({
                success: true,
                data: result.topEvents || []
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getTopPerformingEvents(request, reply) {
        try {
            const { startDate, endDate, limit = 10 } = request.query;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['topEvents'],
                timeRange: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                }
            });
            const topEvents = (result.topEvents || []).slice(0, Number(limit));
            return reply.send({
                success: true,
                data: topEvents
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getRealtimeSummary(request, reply) {
        try {
            const venueId = request.venue.id;
            const redis = (0, redis_1.getRedis)();
            const today = new Date().toISOString().split('T')[0];
            const purchaseKey = `metrics:purchase:${venueId}:${today}`;
            const trafficKey = `metrics:traffic:${venueId}:${today}`;
            const [purchases, traffic] = await Promise.all([
                redis.hgetall(purchaseKey),
                redis.hgetall(trafficKey)
            ]);
            return reply.send({
                success: true,
                data: {
                    timestamp: new Date(),
                    sales: {
                        count: parseInt(purchases.total_sales || '0'),
                        revenue: parseFloat(purchases.revenue || '0')
                    },
                    traffic: {
                        pageViews: parseInt(traffic.page_views || '0')
                    },
                    conversionRate: traffic.page_views ?
                        ((parseInt(purchases.total_sales || '0') / parseInt(traffic.page_views)) * 100).toFixed(2) : '0.00'
                }
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getConversionFunnel(request, reply) {
        try {
            const { startDate, endDate } = request.query;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics: ['conversionRate'],
                timeRange: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                }
            });
            return reply.send({
                success: true,
                data: result.conversionRate || []
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async executeCustomQuery(request, reply) {
        try {
            const { metrics, timeRange, filters, groupBy } = request.body;
            const venueId = request.venue.id;
            const result = await analytics_engine_1.analyticsEngine.query({
                venueId,
                metrics,
                timeRange: {
                    start: new Date(timeRange.start),
                    end: new Date(timeRange.end),
                    granularity: timeRange.granularity
                },
                filters,
                groupBy
            });
            return reply.send({
                success: true,
                data: result
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
    async getDashboardData(request, reply) {
        try {
            const { period = '7d' } = request.query;
            const venueId = request.venue.id;
            const endDate = new Date();
            let startDate = new Date();
            switch (period) {
                case '24h':
                    startDate.setDate(startDate.getDate() - 1);
                    break;
                case '7d':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case '30d':
                    startDate.setDate(startDate.getDate() - 30);
                    break;
                case '90d':
                    startDate.setDate(startDate.getDate() - 90);
                    break;
                default:
                    startDate.setDate(startDate.getDate() - 7);
            }
            const [revenueResult, salesResult, customerResult, eventsResult] = await Promise.all([
                analytics_engine_1.analyticsEngine.query({
                    venueId,
                    metrics: ['revenue'],
                    timeRange: { start: startDate, end: endDate }
                }),
                analytics_engine_1.analyticsEngine.query({
                    venueId,
                    metrics: ['ticketSales'],
                    timeRange: {
                        start: startDate,
                        end: endDate,
                        granularity: period === '24h' ? 'hour' : 'day'
                    }
                }),
                analytics_engine_1.analyticsEngine.query({
                    venueId,
                    metrics: ['customerMetrics'],
                    timeRange: { start: startDate, end: endDate }
                }),
                analytics_engine_1.analyticsEngine.query({
                    venueId,
                    metrics: ['topEvents'],
                    timeRange: { start: startDate, end: endDate }
                })
            ]);
            const redis = (0, redis_1.getRedis)();
            const today = new Date().toISOString().split('T')[0];
            const [todayPurchases, todayTraffic] = await Promise.all([
                redis.hgetall(`metrics:purchase:${venueId}:${today}`),
                redis.hgetall(`metrics:traffic:${venueId}:${today}`)
            ]);
            return reply.send({
                success: true,
                data: {
                    period,
                    summary: {
                        totalRevenue: revenueResult.revenue?.byChannel?.total || 0,
                        totalTicketsSold: salesResult.ticketSales?.reduce((sum, day) => sum + day.ticketsSold, 0) || 0,
                        uniqueCustomers: customerResult.customerMetrics?.clv?.totalCustomers || 0,
                        topEvent: eventsResult.topEvents?.[0] || null
                    },
                    realtime: {
                        todayRevenue: parseFloat(todayPurchases.revenue || '0'),
                        todaySales: parseInt(todayPurchases.total_sales || '0'),
                        currentTraffic: parseInt(todayTraffic.page_views || '0')
                    },
                    charts: {
                        revenue: revenueResult.revenue,
                        sales: salesResult.ticketSales,
                        customerSegments: customerResult.customerMetrics?.segmentation
                    },
                    topEvents: eventsResult.topEvents?.slice(0, 5)
                }
            });
        }
        catch (error) {
            request.log.error(error);
            throw error;
        }
    }
}
exports.analyticsController = new AnalyticsController();
//# sourceMappingURL=analytics.controller.js.map