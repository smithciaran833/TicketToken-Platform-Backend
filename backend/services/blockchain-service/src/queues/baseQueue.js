const Bull = require('bull');
const { EventEmitter } = require('events');
const queueConfig = require('../config/queue');

class BaseQueue extends EventEmitter {
    constructor(queueName, options = {}) {
        super();
        this.queueName = queueName;
        this.queue = new Bull(queueName, {
            redis: queueConfig.redis,
            defaultJobOptions: {
                ...queueConfig.defaultJobOptions,
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
            console.log(`[${this.queueName}] Job ${job.id} completed`);
            this.emit('job:completed', { job, result });
        });
        
        this.queue.on('failed', (job, err) => {
            this.metrics.failed++;
            console.error(`[${this.queueName}] Job ${job.id} failed:`, err.message);
            this.emit('job:failed', { job, error: err });
        });
        
        this.queue.on('active', (job) => {
            this.metrics.active++;
            console.log(`[${this.queueName}] Job ${job.id} started`);
            this.emit('job:active', { job });
        });
        
        this.queue.on('stalled', (job) => {
            console.warn(`[${this.queueName}] Job ${job.id} stalled`);
            this.emit('job:stalled', { job });
        });
        
        this.queue.on('error', (error) => {
            console.error(`[${this.queueName}] Queue error:`, error);
            this.emit('queue:error', error);
        });
    }
    
    async addJob(data, options = {}) {
        const job = await this.queue.add(data, {
            ...this.queue.defaultJobOptions,
            ...options
        });
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
        if (!job) return null;
        
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
        if (!job) throw new Error('Job not found');
        
        await job.retry();
        return { success: true, jobId };
    }
    
    async removeJob(jobId) {
        const job = await this.getJob(jobId);
        if (!job) throw new Error('Job not found');
        
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
        console.log(`[${this.queueName}] Queue paused`);
    }
    
    async resume() {
        await this.queue.resume();
        console.log(`[${this.queueName}] Queue resumed`);
    }
    
    async clean(grace = 0) {
        // Clean jobs older than grace period (ms)
        const cleaned = await this.queue.clean(grace);
        console.log(`[${this.queueName}] Cleaned ${cleaned.length} jobs`);
        return cleaned;
    }
    
    async close() {
        await this.queue.close();
        console.log(`[${this.queueName}] Queue closed`);
    }
}

module.exports = BaseQueue;
