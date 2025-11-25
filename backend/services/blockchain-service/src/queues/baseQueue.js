"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseQueue = void 0;
const bull_1 = __importDefault(require("bull"));
const events_1 = require("events");
const queue_1 = __importDefault(require("../config/queue"));
const logger_1 = require("../utils/logger");
class BaseQueue extends events_1.EventEmitter {
    queueName;
    queue;
    metrics;
    constructor(queueName, options = {}) {
        super();
        this.queueName = queueName;
        this.queue = new bull_1.default(queueName, {
            redis: queue_1.default.redis,
            defaultJobOptions: {
                ...queue_1.default.defaultJobOptions,
                ...options.defaultJobOptions
            }
        });
        this.setupEventHandlers();
        this.metrics = {
            processed: 0,
            failed: 0,
            completed: 0,
            active: 0
        };
    }
    setupEventHandlers() {
        this.queue.on('completed', (job, result) => {
            this.metrics.completed++;
            logger_1.logger.info('Queue job completed', {
                queue: this.queueName,
                jobId: job.id
            });
            this.emit('job:completed', { job, result });
        });
        this.queue.on('failed', (job, err) => {
            this.metrics.failed++;
            logger_1.logger.error('Queue job failed', {
                queue: this.queueName,
                jobId: job.id,
                error: err.message
            });
            this.emit('job:failed', { job, error: err });
        });
        this.queue.on('active', (job) => {
            this.metrics.active++;
            logger_1.logger.info('Queue job started', {
                queue: this.queueName,
                jobId: job.id
            });
            this.emit('job:active', { job });
        });
        this.queue.on('stalled', (job) => {
            logger_1.logger.warn('Queue job stalled', {
                queue: this.queueName,
                jobId: job.id
            });
            this.emit('job:stalled', { job });
        });
        this.queue.on('error', (error) => {
            logger_1.logger.error('Queue error', {
                queue: this.queueName,
                error: error.message
            });
            this.emit('queue:error', error);
        });
    }
    async addJob(data, options = {}) {
        const job = await this.queue.add(data, options);
        return {
            id: job.id,
            data: job.data,
            opts: job.opts
        };
    }
    async getJob(jobId) {
        return await this.queue.getJob(jobId);
    }
    async getJobStatus(jobId) {
        const job = await this.getJob(jobId);
        if (!job)
            return null;
        const state = await job.getState();
        const progress = job.progress();
        return {
            id: job.id,
            state,
            progress,
            data: job.data,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn
        };
    }
    async retryJob(jobId) {
        const job = await this.getJob(jobId);
        if (!job)
            throw new Error('Job not found');
        await job.retry();
        return { success: true, jobId };
    }
    async removeJob(jobId) {
        const job = await this.getJob(jobId);
        if (!job)
            throw new Error('Job not found');
        await job.remove();
        return { success: true, jobId };
    }
    async getQueueStats() {
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
            this.queue.getWaitingCount(),
            this.queue.getActiveCount(),
            this.queue.getCompletedCount(),
            this.queue.getFailedCount(),
            this.queue.getDelayedCount(),
            this.queue.getPausedCount()
        ]);
        return {
            name: this.queueName,
            counts: {
                waiting,
                active,
                completed,
                failed,
                delayed,
                paused,
                total: waiting + active + completed + failed + delayed + paused
            },
            metrics: this.metrics
        };
    }
    async pause() {
        await this.queue.pause();
        logger_1.logger.info('Queue paused', { queue: this.queueName });
    }
    async resume() {
        await this.queue.resume();
        logger_1.logger.info('Queue resumed', { queue: this.queueName });
    }
    async clean(grace = 0) {
        const cleaned = await this.queue.clean(grace);
        logger_1.logger.info('Queue cleaned', {
            queue: this.queueName,
            cleanedCount: cleaned.length
        });
        return cleaned;
    }
    async close() {
        await this.queue.close();
        logger_1.logger.info('Queue closed', { queue: this.queueName });
    }
}
exports.BaseQueue = BaseQueue;
exports.default = BaseQueue;
//# sourceMappingURL=baseQueue.js.map