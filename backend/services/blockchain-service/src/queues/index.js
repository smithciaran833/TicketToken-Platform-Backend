"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mintQueue_1 = __importDefault(require("./mintQueue"));
const logger_1 = require("../utils/logger");
class QueueManager {
    queues;
    initialized;
    constructor() {
        this.queues = {};
        this.initialized = false;
    }
    async initialize() {
        if (this.initialized)
            return;
        logger_1.logger.info('Initializing queue system...');
        this.queues.minting = new mintQueue_1.default();
        this.initialized = true;
        logger_1.logger.info('Queue system initialized', {
            queues: Object.keys(this.queues)
        });
    }
    getMintQueue() {
        if (!this.initialized) {
            throw new Error('Queue system not initialized. Call initialize() first.');
        }
        return this.queues.minting;
    }
    async getStats() {
        const stats = {};
        for (const [name, queue] of Object.entries(this.queues)) {
            stats[name] = await queue.getQueueStats();
        }
        return stats;
    }
    async shutdown() {
        logger_1.logger.info('Shutting down queue system...');
        for (const queue of Object.values(this.queues)) {
            await queue.close();
        }
        this.initialized = false;
        logger_1.logger.info('Queue system shut down');
    }
}
exports.default = new QueueManager();
//# sourceMappingURL=index.js.map