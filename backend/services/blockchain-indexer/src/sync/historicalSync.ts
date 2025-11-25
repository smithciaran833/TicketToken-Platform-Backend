import { Connection } from '@solana/web3.js';
import logger from '../utils/logger';
import db from '../utils/database';
import TransactionProcessor from '../processors/transactionProcessor';

interface Batch {
    start: number;
    end: number;
}

interface BatchResult {
    start: number;
    end: number;
    processed: number;
}

export default class HistoricalSync {
    private connection: Connection;
    private processor: TransactionProcessor;
    private batchSize: number;
    private maxConcurrent: number;

    constructor(connection: Connection, processor: TransactionProcessor) {
        this.connection = connection;
        this.processor = processor;
        this.batchSize = 1000;
        this.maxConcurrent = 5;
    }

    async syncRange(startSlot: number, endSlot: number): Promise<void> {
        logger.info({ startSlot, endSlot }, 'Starting historical sync');

        const totalSlots = endSlot - startSlot;
        let processed = 0;
        let currentSlot = startSlot;

        while (currentSlot < endSlot) {
            const batches: Batch[] = [];

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

            const results = await Promise.allSettled(
                batches.map(batch => this.processBatch(batch))
            );

            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            if (failed > 0) {
                logger.warn({ failed, succeeded }, 'Some batches failed');
            }

            currentSlot = batches[batches.length - 1].end;
            processed += batches.reduce((sum, b) => sum + (b.end - b.start), 0);

            const progress = (processed / totalSlots * 100).toFixed(2);
            logger.info({
                progress: `${progress}%`,
                processed,
                total: totalSlots,
                currentSlot
            }, 'Historical sync progress');

            await this.saveProgress(currentSlot);

            await this.sleep(100);
        }

        logger.info('Historical sync completed');
    }

    async processBatch(batch: Batch): Promise<BatchResult> {
        try {
            logger.debug(batch, 'Processing batch');

            const signatures = await this.getSignaturesInRange(batch.start, batch.end);

            for (const sigInfo of signatures) {
                try {
                    await this.processor.processTransaction(sigInfo);
                } catch (error) {
                    logger.error({
                        error: (error as Error).message,
                        signature: sigInfo.signature
                    }, 'Failed to process transaction');
                }
            }

            logger.debug({
                ...batch,
                processed: signatures.length
            }, 'Batch completed');

            return { start: batch.start, end: batch.end, processed: signatures.length };

        } catch (error) {
            logger.error({ error, ...batch }, 'Batch processing failed');
            throw error;
        }
    }

    async getSignaturesInRange(startSlot: number, endSlot: number): Promise<any[]> {
        const allSignatures: any[] = [];

        try {
            const signatures = await this.connection.getSignaturesForAddress(
                (this.processor as any).programId,
                {
                    limit: 1000,
                    before: undefined,
                    until: undefined
                },
                'confirmed'
            );

            const inRange = signatures.filter(sig =>
                sig.slot >= startSlot && sig.slot < endSlot
            );

            allSignatures.push(...inRange);

        } catch (error) {
            logger.error({
                error: (error as Error).message,
                startSlot,
                endSlot
            }, 'Failed to get signatures');
        }

        return allSignatures;
    }

    async saveProgress(slot: number): Promise<void> {
        await db.query(`
            UPDATE indexer_state
            SET last_processed_slot = $1,
                updated_at = NOW()
            WHERE id = 1
        `, [slot]);
    }

    sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async estimateTimeRemaining(startSlot: number, endSlot: number, slotsPerSecond: number = 100): Promise<{ hours: number; minutes: number }> {
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
