const logger = require('../utils/logger');
const db = require('../utils/database');

class HistoricalSync {
    constructor(connection, processor) {
        this.connection = connection;
        this.processor = processor;
        this.batchSize = 1000;
        this.maxConcurrent = 5;
    }
    
    async syncRange(startSlot, endSlot) {
        logger.info({ startSlot, endSlot }, 'Starting historical sync');
        
        const totalSlots = endSlot - startSlot;
        let processed = 0;
        let currentSlot = startSlot;
        
        while (currentSlot < endSlot) {
            const batches = [];
            
            // Create concurrent batches
            for (let i = 0; i < this.maxConcurrent; i++) {
                const batchStart = currentSlot + (i * this.batchSize);
                const batchEnd = Math.min(batchStart + this.batchSize, endSlot);
                
                if (batchStart < endSlot) {
                    batches.push({
                        start: batchStart,
                        end: batchEnd
                    });
                }
            }
            
            // Process batches in parallel
            const results = await Promise.allSettled(
                batches.map(batch => this.processBatch(batch))
            );
            
            // Count successes and failures
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            if (failed > 0) {
                logger.warn({ failed, succeeded }, 'Some batches failed');
            }
            
            // Update progress
            currentSlot = batches[batches.length - 1].end;
            processed += batches.reduce((sum, b) => sum + (b.end - b.start), 0);
            
            const progress = (processed / totalSlots * 100).toFixed(2);
            logger.info({
                progress: `${progress}%`,
                processed,
                total: totalSlots,
                currentSlot
            }, 'Historical sync progress');
            
            // Save progress to database
            await this.saveProgress(currentSlot);
            
            // Small delay to avoid overwhelming RPC
            await this.sleep(100);
        }
        
        logger.info('Historical sync completed');
    }
    
    async processBatch({ start, end }) {
        try {
            logger.debug({ start, end }, 'Processing batch');
            
            // Get signatures in this slot range
            const signatures = await this.getSignaturesInRange(start, end);
            
            for (const sigInfo of signatures) {
                try {
                    await this.processor.processTransaction(sigInfo);
                } catch (error) {
                    logger.error({ 
                        error: error.message, 
                        signature: sigInfo.signature 
                    }, 'Failed to process transaction');
                }
            }
            
            logger.debug({ 
                start, 
                end, 
                processed: signatures.length 
            }, 'Batch completed');
            
            return { start, end, processed: signatures.length };
            
        } catch (error) {
            logger.error({ error, start, end }, 'Batch processing failed');
            throw error;
        }
    }
    
    async getSignaturesInRange(startSlot, endSlot) {
        const allSignatures = [];
        
        try {
            // Get signatures for our program in this range
            // Note: This is limited by RPC capabilities
            const signatures = await this.connection.getSignaturesForAddress(
                this.processor.programId,
                {
                    limit: 1000,
                    before: null,
                    until: null
                },
                'confirmed'
            );
            
            // Filter by slot range
            const inRange = signatures.filter(sig => 
                sig.slot >= startSlot && sig.slot < endSlot
            );
            
            allSignatures.push(...inRange);
            
        } catch (error) {
            logger.error({ 
                error: error.message, 
                startSlot, 
                endSlot 
            }, 'Failed to get signatures');
        }
        
        return allSignatures;
    }
    
    async saveProgress(slot) {
        await db.query(`
            UPDATE indexer_state 
            SET last_processed_slot = $1,
                updated_at = NOW()
            WHERE id = 1
        `, [slot]);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async estimateTimeRemaining(startSlot, endSlot, slotsPerSecond = 100) {
        const totalSlots = endSlot - startSlot;
        const estimatedSeconds = totalSlots / slotsPerSecond;
        
        const hours = Math.floor(estimatedSeconds / 3600);
        const minutes = Math.floor((estimatedSeconds % 3600) / 60);
        
        logger.info({
            totalSlots,
            slotsPerSecond,
            estimatedTime: `${hours}h ${minutes}m`
        }, 'Estimated sync time');
        
        return { hours, minutes };
    }
}

module.exports = HistoricalSync;
