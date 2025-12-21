"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregationService = exports.AggregationService = void 0;
const models_1 = require("../models");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const models_2 = require("../models");
const constants_1 = require("../config/constants");
class AggregationService {
    static instance;
    log = logger_1.logger.child({ component: 'AggregationService' });
    static getInstance() {
        if (!this.instance) {
            this.instance = new AggregationService();
        }
        return this.instance;
    }
    async aggregateMetrics(venueId, metricType, dateRange, granularity) {
        try {
            const cacheKey = models_2.CacheModel.getCacheKey('aggregation', venueId, metricType, dateRange.startDate.toISOString(), dateRange.endDate.toISOString(), JSON.stringify(granularity));
            const cached = await models_2.CacheModel.get(cacheKey);
            if (cached) {
                return cached;
            }
            const metrics = await models_1.MetricModel.getMetrics(venueId, metricType, dateRange.startDate, dateRange.endDate);
            const aggregated = this.aggregateByGranularity(metrics, granularity);
            const values = aggregated.map(d => d.value);
            const summary = {
                total: values.reduce((sum, val) => sum + val, 0),
                average: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0,
                min: values.length > 0 ? Math.min(...values) : 0,
                max: values.length > 0 ? Math.max(...values) : 0,
                trend: this.calculateTrend(aggregated)
            };
            const aggregation = {
                metricType,
                period: dateRange,
                granularity,
                data: aggregated,
                summary
            };
            await models_1.AggregationModel.upsertAggregation(venueId, aggregation);
            await models_2.CacheModel.set(cacheKey, aggregation, constants_1.CONSTANTS.CACHE_TTL.INSIGHTS);
            return aggregation;
        }
        catch (error) {
            this.log.error('Failed to aggregate metrics', {
                error,
                venueId,
                metricType
            });
            throw error;
        }
    }
    aggregateByGranularity(metrics, granularity) {
        const buckets = new Map();
        metrics.forEach(metric => {
            const bucketKey = this.getBucketKey(metric.timestamp, granularity);
            const currentValue = buckets.get(bucketKey) || 0;
            buckets.set(bucketKey, currentValue + metric.value);
        });
        const result = Array.from(buckets.entries())
            .map(([key, value]) => ({
            timestamp: new Date(key),
            value,
            change: undefined,
            changePercent: undefined
        }))
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        for (let i = 1; i < result.length; i++) {
            const current = result[i];
            const previous = result[i - 1];
            current.change = current.value - previous.value;
            current.changePercent = previous.value > 0
                ? ((current.change / previous.value) * 100)
                : 0;
        }
        return result;
    }
    getBucketKey(date, granularity) {
        const d = new Date(date);
        switch (granularity.unit) {
            case 'minute':
                d.setSeconds(0, 0);
                break;
            case 'hour':
                d.setMinutes(0, 0, 0);
                break;
            case 'day':
                d.setHours(0, 0, 0, 0);
                break;
            case 'week':
                const day = d.getDay();
                d.setDate(d.getDate() - day);
                d.setHours(0, 0, 0, 0);
                break;
            case 'month':
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                break;
            case 'quarter':
                const month = d.getMonth();
                d.setMonth(Math.floor(month / 3) * 3);
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                break;
            case 'year':
                d.setMonth(0, 1);
                d.setHours(0, 0, 0, 0);
                break;
        }
        return d.toISOString();
    }
    calculateTrend(data) {
        if (data.length < 2)
            return 0;
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        data.forEach((point, index) => {
            sumX += index;
            sumY += point.value;
            sumXY += index * point.value;
            sumX2 += index * index;
        });
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }
    async performHourlyAggregation(venueId) {
        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const metricTypes = Object.values(types_1.MetricType);
            await Promise.all(metricTypes.map(metricType => this.aggregateMetrics(venueId, metricType, { startDate: oneHourAgo, endDate: now }, { unit: 'hour', value: 1 })));
            this.log.info('Hourly aggregation completed', { venueId });
        }
        catch (error) {
            this.log.error('Failed to perform hourly aggregation', { error, venueId });
            throw error;
        }
    }
    async performDailyAggregation(venueId) {
        try {
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const metricTypes = Object.values(types_1.MetricType);
            await Promise.all(metricTypes.map(metricType => this.aggregateMetrics(venueId, metricType, { startDate: yesterday, endDate: today }, { unit: 'day', value: 1 })));
            this.log.info('Daily aggregation completed', { venueId });
        }
        catch (error) {
            this.log.error('Failed to perform daily aggregation', { error, venueId });
            throw error;
        }
    }
    async getComparativeMetrics(venueId, metricType, currentPeriod, comparisonPeriod, granularity) {
        try {
            const [current, previous] = await Promise.all([
                this.aggregateMetrics(venueId, metricType, currentPeriod, granularity),
                this.aggregateMetrics(venueId, metricType, comparisonPeriod, granularity)
            ]);
            const change = current.summary.total - previous.summary.total;
            const changePercent = previous.summary.total > 0
                ? (change / previous.summary.total) * 100
                : 0;
            return {
                current,
                previous,
                change,
                changePercent
            };
        }
        catch (error) {
            this.log.error('Failed to get comparative metrics', {
                error,
                venueId,
                metricType
            });
            throw error;
        }
    }
}
exports.AggregationService = AggregationService;
exports.aggregationService = AggregationService.getInstance();
//# sourceMappingURL=aggregation.service.js.map