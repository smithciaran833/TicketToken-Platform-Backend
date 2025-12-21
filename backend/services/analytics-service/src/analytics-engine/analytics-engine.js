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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsEngine = exports.AnalyticsEngine = void 0;
const redis_1 = require("../config/redis");
const redis_cache_strategies_1 = __importDefault(require("../config/redis-cache-strategies"));
const logger_1 = require("../utils/logger");
class AnalyticsEngine {
    cache;
    constructor() {
    }
    async query(query) {
        if (!this.cache)
            this.cache = new redis_cache_strategies_1.default((0, redis_1.getRedis)());
        const cacheKey = this.generateCacheKey(query);
        const cached = await this.cache.get('analyticsQuery', cacheKey);
        if (cached)
            return cached;
        const results = await this.executeQuery(query);
        await this.cache.set('analyticsQuery', cacheKey, results, 300);
        return results;
    }
    async executeQuery(query) {
        const results = {};
        for (const metric of query.metrics) {
            switch (metric) {
                case 'revenue':
                    results.revenue = await this.calculateRevenue(query);
                    break;
                case 'ticketSales':
                    results.ticketSales = await this.calculateTicketSales(query);
                    break;
                case 'conversionRate':
                    results.conversionRate = await this.calculateConversionRate(query);
                    break;
                case 'customerMetrics':
                    results.customerMetrics = await this.calculateCustomerMetrics(query);
                    break;
                case 'topEvents':
                    results.topEvents = await this.getTopEvents(query);
                    break;
                case 'salesTrends':
                    results.salesTrends = await this.calculateSalesTrends(query);
                    break;
                default:
                    logger_1.logger.warn(`Unknown metric requested: ${metric}`);
            }
        }
        return results;
    }
    async calculateRevenue(query) {
        const { RevenueCalculator } = await Promise.resolve().then(() => __importStar(require('./calculators/revenue-calculator')));
        const calculator = new RevenueCalculator();
        const [byChannel, byEventType] = await Promise.all([
            calculator.calculateRevenueByChannel(query.venueId, query.timeRange.start, query.timeRange.end),
            calculator.calculateRevenueByEventType(query.venueId, query.timeRange.start, query.timeRange.end)
        ]);
        return { byChannel, byEventType };
    }
    async calculateTicketSales(query) {
        const { MetricsAggregator } = await Promise.resolve().then(() => __importStar(require('./aggregators/metrics-aggregator')));
        const aggregator = new MetricsAggregator();
        return aggregator.aggregateSalesMetrics({
            venueId: query.venueId,
            startDate: query.timeRange.start,
            endDate: query.timeRange.end,
            granularity: query.timeRange.granularity || 'day'
        });
    }
    async calculateConversionRate(query) {
        const redis = (0, redis_1.getRedis)();
        const dates = this.getDateRange(query.timeRange.start, query.timeRange.end);
        const conversionData = await Promise.all(dates.map(async (date) => {
            const dateStr = date.toISOString().split('T')[0];
            const trafficKey = `metrics:traffic:${query.venueId}:${dateStr}`;
            const purchaseKey = `metrics:purchase:${query.venueId}:${dateStr}`;
            const [traffic, purchase] = await Promise.all([
                redis.hget(trafficKey, 'page_views'),
                redis.hget(purchaseKey, 'total_sales')
            ]);
            const views = parseInt(traffic || '0');
            const sales = parseInt(purchase || '0');
            return {
                date: dateStr,
                pageViews: views,
                conversions: sales,
                rate: views > 0 ? (sales / views * 100).toFixed(2) : '0.00'
            };
        }));
        return conversionData;
    }
    async calculateCustomerMetrics(query) {
        const { CustomerAnalytics } = await Promise.resolve().then(() => __importStar(require('./calculators/customer-analytics')));
        const analytics = new CustomerAnalytics();
        const [clv, churnRisk, segmentation] = await Promise.all([
            analytics.calculateCustomerLifetimeValue(query.venueId),
            analytics.identifyChurnRisk(query.venueId),
            analytics.calculateCustomerSegmentation(query.venueId)
        ]);
        return { clv, churnRisk, segmentation };
    }
    async getTopEvents(query) {
        const { MetricsAggregator } = await Promise.resolve().then(() => __importStar(require('./aggregators/metrics-aggregator')));
        const aggregator = new MetricsAggregator();
        return aggregator.aggregateEventPerformance(query.venueId, query.timeRange.start, query.timeRange.end);
    }
    async calculateSalesTrends(query) {
        const { PredictiveAnalytics } = await Promise.resolve().then(() => __importStar(require('./calculators/predictive-analytics')));
        const predictor = new PredictiveAnalytics();
        const [seasonal, pricing] = await Promise.all([
            predictor.predictSeasonalTrends(query.venueId),
            predictor.predictOptimalPricing(query.venueId, 'concert')
        ]);
        return { seasonal, pricing };
    }
    generateCacheKey(query) {
        return `${query.venueId}:${query.metrics.join(',')}:${query.timeRange.start.toISOString()}:${query.timeRange.end.toISOString()}`;
    }
    getDateRange(start, end) {
        const dates = [];
        const current = new Date(start);
        while (current <= end) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }
}
exports.AnalyticsEngine = AnalyticsEngine;
exports.analyticsEngine = new AnalyticsEngine();
//# sourceMappingURL=analytics-engine.js.map