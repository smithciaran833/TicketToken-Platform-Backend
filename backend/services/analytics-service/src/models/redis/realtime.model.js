"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeModel = void 0;
const redis_1 = require("../../config/redis");
const logger_1 = require("../../utils/logger");
class RealtimeModel {
    static redis = redis_1.getRedis;
    static pub = redis_1.getPubClient;
    static sub = redis_1.getSubClient;
    static async updateRealTimeMetric(venueId, metricType, value) {
        const redis = this.redis();
        const key = `realtime:${venueId}:${metricType}`;
        const previousValue = await redis.get(key);
        const prev = previousValue ? parseFloat(previousValue) : 0;
        await redis.set(key, value.toString());
        await redis.expire(key, 300);
        const change = value - prev;
        const changePercent = prev > 0 ? ((change / prev) * 100) : 0;
        const metric = {
            metricType: metricType,
            currentValue: value,
            previousValue: prev,
            change,
            changePercent,
            trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
            lastUpdated: new Date()
        };
        await this.publishMetricUpdate(venueId, metricType, metric);
    }
    static async getRealTimeMetric(venueId, metricType) {
        const redis = this.redis();
        const key = `realtime:${venueId}:${metricType}`;
        const dataKey = `realtime:data:${venueId}:${metricType}`;
        const value = await redis.get(key);
        const data = await redis.get(dataKey);
        if (value && data) {
            return JSON.parse(data);
        }
        return null;
    }
    static async incrementCounter(venueId, counterType, by = 1) {
        const redis = this.redis();
        const key = `counter:${venueId}:${counterType}`;
        const value = await redis.incrby(key, by);
        await this.updateRealTimeMetric(venueId, counterType, value);
        return value;
    }
    static async getCounter(venueId, counterType) {
        const redis = this.redis();
        const key = `counter:${venueId}:${counterType}`;
        const value = await redis.get(key);
        return value ? parseInt(value) : 0;
    }
    static async resetCounter(venueId, counterType) {
        const redis = this.redis();
        const key = `counter:${venueId}:${counterType}`;
        await redis.set(key, '0');
    }
    static async publishMetricUpdate(venueId, metricType, data) {
        const pub = this.pub();
        const channel = `metrics:${venueId}:${metricType}`;
        const dataKey = `realtime:data:${venueId}:${metricType}`;
        const redis = this.redis();
        await redis.set(dataKey, JSON.stringify(data));
        await redis.expire(dataKey, 300);
        await pub.publish(channel, JSON.stringify(data));
    }
    static async subscribeToMetric(venueId, metricType, callback) {
        const sub = this.sub();
        const channel = `metrics:${venueId}:${metricType}`;
        await sub.subscribe(channel);
        sub.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const data = JSON.parse(message);
                    callback(data);
                }
                catch (error) {
                    logger_1.logger.error('Error parsing metric update:', error);
                }
            }
        });
    }
    static async unsubscribeFromMetric(venueId, metricType) {
        const sub = this.sub();
        const channel = `metrics:${venueId}:${metricType}`;
        await sub.unsubscribe(channel);
    }
    static async setGauge(venueId, gaugeName, value, max) {
        const redis = this.redis();
        const key = `gauge:${venueId}:${gaugeName}`;
        const data = {
            current: value,
            max,
            percentage: (value / max) * 100,
            timestamp: new Date()
        };
        await redis.set(key, JSON.stringify(data));
        await redis.expire(key, 300);
        await this.publishMetricUpdate(venueId, `gauge:${gaugeName}`, data);
    }
    static async getGauge(venueId, gaugeName) {
        const redis = this.redis();
        const key = `gauge:${venueId}:${gaugeName}`;
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    }
}
exports.RealtimeModel = RealtimeModel;
//# sourceMappingURL=realtime.model.js.map