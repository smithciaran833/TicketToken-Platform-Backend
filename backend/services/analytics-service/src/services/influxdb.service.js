"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.influxDBService = exports.InfluxDBService = void 0;
const influxdb_client_1 = require("@influxdata/influxdb-client");
const logger_1 = require("../utils/logger");
class InfluxDBService {
    static instance;
    client;
    writeApi;
    config;
    log = logger_1.logger.child({ component: 'InfluxDBService' });
    isConnected = false;
    constructor() {
        this.config = {
            url: process.env.INFLUXDB_URL || 'http://influxdb:8086',
            token: process.env.INFLUXDB_TOKEN || 'my-super-secret-auth-token',
            org: process.env.INFLUXDB_ORG || 'tickettoken',
            bucket: process.env.INFLUXDB_BUCKET || 'metrics',
        };
        this.client = new influxdb_client_1.InfluxDB({
            url: this.config.url,
            token: this.config.token,
        });
        this.writeApi = this.client.getWriteApi(this.config.org, this.config.bucket, 'ms');
        this.writeApi.useDefaultTags({ service: 'analytics' });
        this.log.info('InfluxDB client initialized', {
            url: this.config.url,
            org: this.config.org,
            bucket: this.config.bucket,
        });
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new InfluxDBService();
        }
        return this.instance;
    }
    async writeMetric(venueId, metricType, value, dimensions, metadata, timestamp) {
        try {
            const point = new influxdb_client_1.Point(metricType)
                .tag('venue_id', venueId)
                .floatField('value', value)
                .timestamp(timestamp || new Date());
            if (dimensions) {
                Object.entries(dimensions).forEach(([key, val]) => {
                    point.tag(key, val);
                });
            }
            if (metadata) {
                Object.entries(metadata).forEach(([key, val]) => {
                    if (typeof val === 'number') {
                        point.floatField(key, val);
                    }
                    else if (typeof val === 'string') {
                        point.stringField(key, val);
                    }
                    else if (typeof val === 'boolean') {
                        point.booleanField(key, val);
                    }
                });
            }
            this.writeApi.writePoint(point);
            this.isConnected = true;
            this.log.debug('Metric written to InfluxDB', {
                venueId,
                metricType,
                value,
            });
        }
        catch (error) {
            this.isConnected = false;
            this.log.error('Failed to write metric to InfluxDB', error, {
                venueId,
                metricType,
            });
            throw error;
        }
    }
    async bulkWriteMetrics(metrics) {
        try {
            metrics.forEach((metric) => {
                const point = new influxdb_client_1.Point(metric.metricType)
                    .tag('venue_id', metric.venueId)
                    .floatField('value', metric.value)
                    .timestamp(metric.timestamp || new Date());
                if (metric.dimensions) {
                    Object.entries(metric.dimensions).forEach(([key, val]) => {
                        point.tag(key, val);
                    });
                }
                if (metric.metadata) {
                    Object.entries(metric.metadata).forEach(([key, val]) => {
                        if (typeof val === 'number') {
                            point.floatField(key, val);
                        }
                        else if (typeof val === 'string') {
                            point.stringField(key, val);
                        }
                        else if (typeof val === 'boolean') {
                            point.booleanField(key, val);
                        }
                    });
                }
                this.writeApi.writePoint(point);
            });
            this.isConnected = true;
            this.log.debug('Bulk metrics written to InfluxDB', {
                count: metrics.length,
            });
        }
        catch (error) {
            this.isConnected = false;
            this.log.error('Failed to bulk write metrics to InfluxDB', error);
            throw error;
        }
    }
    async flush() {
        try {
            await this.writeApi.flush();
            this.log.debug('InfluxDB write buffer flushed');
        }
        catch (error) {
            this.log.error('Failed to flush InfluxDB write buffer', error);
            throw error;
        }
    }
    async close() {
        try {
            await this.writeApi.close();
            this.isConnected = false;
            this.log.info('InfluxDB connection closed');
        }
        catch (error) {
            this.log.error('Failed to close InfluxDB connection', error);
            throw error;
        }
    }
    getConnectionStatus() {
        return this.isConnected;
    }
    async healthCheck() {
        try {
            const testPoint = new influxdb_client_1.Point('health_check')
                .tag('service', 'analytics')
                .floatField('value', 1)
                .timestamp(new Date());
            this.writeApi.writePoint(testPoint);
            await this.writeApi.flush();
            this.isConnected = true;
            return true;
        }
        catch (error) {
            this.isConnected = false;
            this.log.error('InfluxDB health check failed', error);
            return false;
        }
    }
}
exports.InfluxDBService = InfluxDBService;
exports.influxDBService = InfluxDBService.getInstance();
//# sourceMappingURL=influxdb.service.js.map