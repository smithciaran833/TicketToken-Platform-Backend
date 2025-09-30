const MintQueue = require('./mintQueue');

class QueueManager {
    constructor() {
        this.queues = {};
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing queue system...');
        
        // Initialize NFT minting queue
        this.queues.minting = new MintQueue();
        
        // Future queues can be added here:
        // this.queues.transfer = new TransferQueue();
        // this.queues.burn = new BurnQueue();
        
        this.initialized = true;
        console.log('Queue system initialized');
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
        console.log('Shutting down queue system...');
        for (const queue of Object.values(this.queues)) {
            await queue.close();
        }
        this.initialized = false;
        console.log('Queue system shut down');
    }
}

// Export singleton instance
module.exports = new QueueManager();
