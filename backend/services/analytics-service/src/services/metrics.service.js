"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsService = exports.MetricsService = void 0;
const models_1 = require("../models");
const models_2 = require("../models");
const influxdb_service_1 = require("./influxdb.service");
const config_1 = require("../config");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const constants_1 = require("../config/constants");
class MetricsService {
    static instance;
    log = logger_1.logger.child({ component: 'MetricsService' });
    metricsBackend = config_1.config.metrics.backend;
    failSilently = config_1.config.metrics.failSilently;
    static getInstance() {
        if (!this.instance) {
            this.instance = new MetricsService();
        }
        return this.instance;
    }
    mapDBMetricToMetric(dbMetric) {
        return {
            id: dbMetric.id,
            venueId: dbMetric.tenant_id,
            metricType: dbMetric.metric_type,
            value: dbMetric.value,
            timestamp: dbMetric.timestamp,
            granularity: { unit: 'minute', value: 1 },
            dimensions: dbMetric.dimensions,
            metadata: dbMetric.metadata
        };
    }
    async writeToPostgres(venueId, metricType, value, timestamp, dimensions, metadata) {
        return await models_1.MetricModel.createMetric({
            venueId,
            metricType,
            value,
            timestamp,
            dimensions,
            metadata
        });
    }
    async writeToInfluxDB(venueId, metricType, value, timestamp, dimensions, metadata) {
        await influxdb_service_1.influxDBService.writeMetric(venueId, metricType, value, dimensions, metadata, timestamp);
    }
    async recordMetric(venueId, metricType, value, dimensions, metadata) {
        const timestamp = new Date();
        let dbMetric = null;
        try {
            if (this.metricsBackend === 'postgres' || this.metricsBackend === 'dual') {
                dbMetric = await this.writeToPostgres(venueId, metricType, value, timestamp, dimensions, metadata);
            }
            if (this.metricsBackend === 'influxdb' || this.metricsBackend === 'dual') {
                try {
                    await this.writeToInfluxDB(venueId, metricType, value, timestamp, dimensions, metadata);
                    await influxdb_service_1.influxDBService.flush();
                }
                catch (error) {
                    if (this.metricsBackend === 'dual' && this.failSilently) {
                        this.log.warn('InfluxDB write failed in dual mode, continuing...', {
                            error,
                            venueId,
                            metricType
                        });
                    }
                    else {
                        throw error;
                    }
                }
            }
            await models_2.RealtimeModel.updateRealTimeMetric(venueId, metricType, value);
            await models_2.CacheModel.invalidateVenueCache(venueId);
            this.log.debug('Metric recorded', {
                venueId,
                metricType,
                value,
                backend: this.metricsBackend
            });
            if (dbMetric) {
                return this.mapDBMetricToMetric(dbMetric);
            }
            else {
                return {
                    id: `${venueId}-${metricType}-${timestamp.getTime()}`,
                    venueId,
                    metricType,
                    value,
                    timestamp,
                    granularity: { unit: 'minute', value: 1 },
                    dimensions,
                    metadata
                };
            }
        }
        catch (error) {
            this.log.error('Failed to record metric', error, { venueId, metricType });
            throw error;
        }
    }
    async getMetrics(venueId, metricType, dateRange, granularity) {
        try {
            const cacheKey = models_2.CacheModel.getCacheKey('metrics', venueId, metricType, dateRange.startDate.toISOString(), dateRange.endDate.toISOString());
            const cached = await models_2.CacheModel.get(cacheKey);
            if (cached) {
                return cached;
            }
            const dbMetrics = await models_1.MetricModel.getMetrics(venueId, metricType, dateRange.startDate, dateRange.endDate, granularity);
            const metrics = dbMetrics.map(m => this.mapDBMetricToMetric(m));
            await models_2.CacheModel.set(cacheKey, metrics, constants_1.CONSTANTS.CACHE_TTL.METRICS);
            return metrics;
        }
        catch (error) {
            this.log.error('Failed to get metrics', error, { venueId, metricType });
            throw error;
        }
    }
    async getRealTimeMetric(venueId, metricType) {
        try {
            return await models_2.RealtimeModel.getRealTimeMetric(venueId, metricType);
        }
        catch (error) {
            this.log.error('Failed to get real-time metric', error, { venueId, metricType });
            throw error;
        }
    }
    async getRealTimeMetrics(venueId) {
        try {
            const metricTypes = Object.values(types_1.MetricType);
            const metrics = {};
            await Promise.all(metricTypes.map(async (type) => {
                const metric = await this.getRealTimeMetric(venueId, type);
                if (metric) {
                    metrics[type] = metric;
                }
            }));
            return metrics;
        }
        catch (error) {
            this.log.error('Failed to get real-time metrics', error, { venueId });
            throw error;
        }
    }
    async incrementCounter(venueId, counterType, by = 1) {
        try {
            return await models_2.RealtimeModel.incrementCounter(venueId, counterType, by);
        }
        catch (error) {
            this.log.error('Failed to increment counter', error, { venueId, counterType });
            throw error;
        }
    }
    async aggregateMetric(venueId, metricType, dateRange, aggregation) {
        try {
            const result = await models_1.MetricModel.aggregateMetrics(venueId, metricType, aggregation, dateRange.startDate, dateRange.endDate);
            return result[aggregation] || 0;
        }
        catch (error) {
            this.log.error('Failed to aggregate metric', error, {
                venueId,
                metricType,
                aggregation
            });
            throw error;
        }
    }
    async getMetricTrend(venueId, metricType, periods, periodUnit) {
        try {
            const now = new Date();
            const results = [];
            for (let i = periods - 1; i >= 0; i--) {
                const periodStart = new Date(now);
                const periodEnd = new Date(now);
                switch (periodUnit) {
                    case 'hour':
                        periodStart.setHours(periodStart.getHours() - i - 1);
                        periodEnd.setHours(periodEnd.getHours() - i);
                        break;
                    case 'day':
                        periodStart.setDate(periodStart.getDate() - i - 1);
                        periodEnd.setDate(periodEnd.getDate() - i);
                        break;
                    case 'week':
                        periodStart.setDate(periodStart.getDate() - (i + 1) * 7);
                        periodEnd.setDate(periodEnd.getDate() - i * 7);
                        break;
                    case 'month':
                        periodStart.setMonth(periodStart.getMonth() - i - 1);
                        periodEnd.setMonth(periodEnd.getMonth() - i);
                        break;
                }
                const value = await this.aggregateMetric(venueId, metricType, { startDate: periodStart, endDate: periodEnd }, 'sum');
                const previousValue = results[results.length - 1]?.value || 0;
                const change = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;
                results.push({
                    period: periodEnd,
                    value,
                    change
                });
            }
            return results;
        }
        catch (error) {
            this.log.error('Failed to get metric trend', error, { venueId, metricType });
            throw error;
        }
    }
    async bulkRecordMetrics(metrics) {
        try {
            const metricsWithTimestamp = metrics.map(m => ({
                ...m,
                timestamp: m.timestamp || new Date()
            }));
            if (this.metricsBackend === 'postgres' || this.metricsBackend === 'dual') {
                await models_1.MetricModel.bulkInsert(metricsWithTimestamp);
            }
            if (this.metricsBackend === 'influxdb' || this.metricsBackend === 'dual') {
                try {
                    await influxdb_service_1.influxDBService.bulkWriteMetrics(metricsWithTimestamp);
                    await influxdb_service_1.influxDBService.flush();
                }
                catch (error) {
                    if (this.metricsBackend === 'dual' && this.failSilently) {
                        this.log.warn('InfluxDB bulk write failed in dual mode, continuing...', { error });
                    }
                    else {
                        throw error;
                    }
                }
            }
            await Promise.all(metrics.map(m => models_2.RealtimeModel.updateRealTimeMetric(m.venueId, m.metricType, m.value)));
            this.log.debug('Bulk metrics recorded', {
                count: metrics.length,
                backend: this.metricsBackend
            });
        }
        catch (error) {
            this.log.error('Failed to bulk record metrics', error);
            throw error;
        }
    }
    async getCapacityMetrics(venueId, eventId) {
        try {
            const totalCapacity = 1000;
            const soldTickets = 750;
            const availableTickets = totalCapacity - soldTickets;
            const occupancyRate = (soldTickets / totalCapacity) * 100;
            return {
                totalCapacity,
                soldTickets,
                availableTickets,
                occupancyRate
            };
        }
        catch (error) {
            this.log.error('Failed to get capacity metrics', error, { venueId, eventId });
            throw error;
        }
    }
    async healthCheck() {
        return {
            postgres: this.metricsBackend !== 'influxdb',
            influxdb: await influxdb_service_1.influxDBService.healthCheck(),
            backend: this.metricsBackend
        };
    }
}
exports.MetricsService = MetricsService;
exports.metricsService = MetricsService.getInstance();
//# sourceMappingURL=metrics.service.js.map