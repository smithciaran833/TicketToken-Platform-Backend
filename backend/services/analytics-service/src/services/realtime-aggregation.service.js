"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeAggregationService = exports.RealtimeAggregationService = void 0;
const redis_1 = require("../config/redis");
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const websocket_1 = require("../config/websocket");
class RealtimeAggregationService {
    redis = (0, redis_1.getRedis)();
    analyticsDb = (0, database_1.getAnalyticsDb)();
    intervalHandles = [];
    aggregationWindows = {
        '1min': { interval: 60, retention: 3600 },
        '5min': { interval: 300, retention: 86400 },
        '1hour': { interval: 3600, retention: 604800 },
    };
    async startAggregationPipeline() {
        logger_1.logger.info('Starting real-time aggregation pipeline');
        this.setupAggregationIntervals();
        this.setupAlertMonitoring();
    }
    setupAggregationIntervals() {
        if (this.aggregationWindows['1min']) {
            const interval = setInterval(() => this.aggregate1Minute(), this.aggregationWindows['1min'].interval * 1000);
            this.intervalHandles.push(interval);
            logger_1.logger.info(`Started 1-minute aggregation (interval: ${this.aggregationWindows['1min'].interval}s)`);
        }
        if (this.aggregationWindows['5min']) {
            const interval = setInterval(() => this.aggregate5Minutes(), this.aggregationWindows['5min'].interval * 1000);
            this.intervalHandles.push(interval);
            logger_1.logger.info(`Started 5-minute aggregation (interval: ${this.aggregationWindows['5min'].interval}s)`);
        }
        if (this.aggregationWindows['1hour']) {
            const interval = setInterval(() => this.aggregateHourly(), this.aggregationWindows['1hour'].interval * 1000);
            this.intervalHandles.push(interval);
            logger_1.logger.info(`Started hourly aggregation (interval: ${this.aggregationWindows['1hour'].interval}s)`);
        }
    }
    stopAggregationPipeline() {
        this.intervalHandles.forEach(handle => clearInterval(handle));
        this.intervalHandles = [];
        logger_1.logger.info('Stopped aggregation pipeline');
    }
    async aggregate1Minute() {
        try {
            const venues = await this.getActiveVenues();
            const retention = this.aggregationWindows['1min'].retention;
            for (const venueId of venues) {
                const metrics = await this.calculate1MinuteMetrics(venueId);
                await this.analyticsDb('realtime_metrics')
                    .insert({
                    venue_id: venueId,
                    metric_type: '1min_summary',
                    metric_value: metrics,
                    expires_at: new Date(Date.now() + retention * 1000)
                })
                    .onConflict(['venue_id', 'metric_type'])
                    .merge();
                (0, websocket_1.emitMetricUpdate)(venueId, 'realtime-summary', metrics);
                await this.checkAlertConditions(venueId, metrics);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to run 1-minute aggregation', error);
        }
    }
    async calculate1MinuteMetrics(venueId) {
        const now = new Date();
        const purchaseKey = `metrics:purchase:${venueId}:${now.toISOString().split('T')[0]}`;
        const trafficKey = `metrics:traffic:${venueId}:${now.toISOString().split('T')[0]}`;
        const [purchases, traffic] = await Promise.all([
            this.redis.hgetall(purchaseKey),
            this.redis.hgetall(trafficKey)
        ]);
        const salesRate = parseInt(purchases.total_sales || '0') / 60;
        const trafficRate = parseInt(traffic.page_views || '0') / 60;
        return {
            timestamp: now,
            sales: {
                count: parseInt(purchases.total_sales || '0'),
                revenue: parseFloat(purchases.revenue || '0'),
                rate: salesRate
            },
            traffic: {
                pageViews: parseInt(traffic.page_views || '0'),
                rate: trafficRate
            },
            conversion: {
                rate: trafficRate > 0 ? salesRate / trafficRate : 0
            }
        };
    }
    async aggregate5Minutes() {
        logger_1.logger.debug('Running 5-minute aggregation');
    }
    async aggregateHourly() {
        try {
            const venues = await this.getActiveVenues();
            for (const venueId of venues) {
                const hour = new Date().getHours();
                const today = new Date().toISOString().split('T')[0];
                const hourlyMetrics = await this.calculateHourlyMetrics(venueId);
                await this.analyticsDb('venue_analytics')
                    .where({
                    venue_id: venueId,
                    date: today,
                    hour: hour
                })
                    .update({
                    unique_customers: hourlyMetrics.uniqueCustomers,
                    events_active: hourlyMetrics.activeEvents,
                    updated_at: new Date()
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to run hourly aggregation', error);
        }
    }
    async calculateHourlyMetrics(venueId) {
        return {
            uniqueCustomers: 0,
            activeEvents: 0
        };
    }
    async getActiveVenues() {
        const result = await this.analyticsDb('venue_analytics')
            .distinct('venue_id')
            .where('updated_at', '>', new Date(Date.now() - 86400000))
            .pluck('venue_id');
        return result;
    }
    setupAlertMonitoring() {
        setInterval(() => this.monitorAlerts(), 30000);
    }
    async checkAlertConditions(venueId, metrics) {
        if (metrics.traffic.rate > 100) {
            await this.createAlert(venueId, {
                type: 'high_traffic',
                severity: 'info',
                message: `High traffic detected: ${metrics.traffic.rate.toFixed(2)} views/second`,
                data: metrics.traffic
            });
        }
        if (metrics.traffic.pageViews > 1000 && metrics.conversion.rate < 0.01) {
            await this.createAlert(venueId, {
                type: 'low_conversion',
                severity: 'warning',
                message: `Low conversion rate: ${(metrics.conversion.rate * 100).toFixed(2)}%`,
                data: metrics.conversion
            });
        }
    }
    async createAlert(venueId, alert) {
        await this.analyticsDb('venue_alerts')
            .insert({
            venue_id: venueId,
            alert_name: alert.type,
            is_active: true
        });
        (0, websocket_1.emitAlert)(venueId, alert);
    }
    async monitorAlerts() {
        logger_1.logger.debug('Monitoring alerts');
    }
}
exports.RealtimeAggregationService = RealtimeAggregationService;
exports.realtimeAggregationService = new RealtimeAggregationService();
//# sourceMappingURL=realtime-aggregation.service.js.map