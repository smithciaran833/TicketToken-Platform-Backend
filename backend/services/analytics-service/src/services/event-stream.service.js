"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventStreamService = exports.EventStreamService = void 0;
const events_1 = require("events");
const bull_1 = __importDefault(require("bull"));
const redis_1 = require("../config/redis");
const logger_1 = require("../utils/logger");
const websocket_1 = require("../config/websocket");
const database_1 = require("../config/database");
class EventStreamService extends events_1.EventEmitter {
    queues = new Map();
    redis;
    analyticsDb;
    initialized = false;
    constructor() {
        super();
    }
    async initialize() {
        if (this.initialized)
            return;
        this.redis = (0, redis_1.getRedis)();
        this.analyticsDb = (0, database_1.getAnalyticsDb)();
        this.initializeQueues();
        this.initialized = true;
    }
    initializeQueues() {
        const eventTypes = [
            'ticket-purchase',
            'ticket-scan',
            'page-view',
            'cart-update',
            'venue-update'
        ];
        eventTypes.forEach(type => {
            const queue = new bull_1.default(type, {
                redis: {
                    host: process.env.REDIS_HOST,
                    port: parseInt(process.env.REDIS_PORT || '6379')
                }
            });
            queue.process(async (job) => {
                await this.processEvent(type, job.data);
            });
            this.queues.set(type, queue);
        });
    }
    async processEvent(type, data) {
        try {
            logger_1.logger.debug('Processing event', { type, venueId: data.venueId });
            this.emit(type, data);
            await this.updateRealTimeMetrics(type, data);
            try {
                (0, websocket_1.emitMetricUpdate)(data.venueId, type, data);
            }
            catch (e) {
            }
            await this.storeRawEvent(type, data);
        }
        catch (error) {
            logger_1.logger.error('Failed to process event', { type, error });
        }
    }
    async updateRealTimeMetrics(type, event) {
        const { venueId, data } = event;
        switch (type) {
            case 'ticket-purchase':
                await this.updatePurchaseMetrics(venueId, data);
                break;
            case 'ticket-scan':
                await this.updateScanMetrics(venueId, data);
                break;
            case 'page-view':
                await this.updateTrafficMetrics(venueId, data);
                break;
        }
    }
    async updatePurchaseMetrics(venueId, data) {
        if (!this.redis)
            return;
        const key = `metrics:purchase:${venueId}:${new Date().toISOString().split('T')[0]}`;
        await this.redis.hincrby(key, 'total_sales', 1);
        await this.redis.hincrbyfloat(key, 'revenue', data.amount);
        await this.redis.expire(key, 86400);
        if (!this.analyticsDb)
            return;
        const hour = new Date().getHours();
        await this.analyticsDb('venue_analytics')
            .insert({
            venue_id: venueId,
            date: new Date(),
            hour: hour,
            tickets_sold: 1,
            revenue: data.amount
        })
            .onConflict(['venue_id', 'date', 'hour'])
            .merge({
            tickets_sold: this.analyticsDb.raw('venue_analytics.tickets_sold + 1'),
            revenue: this.analyticsDb.raw('venue_analytics.revenue + ?', [data.amount]),
            updated_at: new Date()
        });
    }
    async updateScanMetrics(venueId, data) {
        if (!this.redis)
            return;
        const key = `metrics:scan:${venueId}:${data.eventId}`;
        await this.redis.hincrby(key, 'scanned', 1);
        await this.redis.expire(key, 86400);
    }
    async updateTrafficMetrics(venueId, data) {
        if (!this.redis)
            return;
        const key = `metrics:traffic:${venueId}:${new Date().toISOString().split('T')[0]}`;
        await this.redis.hincrby(key, 'page_views', 1);
        await this.redis.pfadd(`unique_visitors:${venueId}`, data.sessionId);
        await this.redis.expire(key, 86400);
    }
    async storeRawEvent(type, event) {
        logger_1.logger.debug('Storing raw event', { type, venueId: event.venueId });
    }
    async pushEvent(type, event) {
        await this.initialize();
        const queue = this.queues.get(type);
        if (queue) {
            await queue.add(event, {
                removeOnComplete: true,
                removeOnFail: false
            });
        }
    }
    async subscribeToExternalEvents() {
        await this.initialize();
        const subscriber = this.redis.duplicate();
        subscriber.subscribe('analytics:events');
        subscriber.on('message', async (channel, message) => {
            try {
                const event = JSON.parse(message);
                await this.pushEvent(event.type, event);
            }
            catch (error) {
                logger_1.logger.error('Failed to process external event', error);
            }
        });
    }
}
exports.EventStreamService = EventStreamService;
exports.eventStreamService = new EventStreamService();
//# sourceMappingURL=event-stream.service.js.map