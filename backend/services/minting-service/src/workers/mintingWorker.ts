import { Job } from 'bull';
import { getMintQueue } from '../queues/mintQueue';
import { MintingOrchestrator } from '../services/MintingOrchestrator';
import logger from '../utils/logger';

interface MintJobData {
  ticketId: string;
  orderId: string;
  eventId: string;
  tenantId: string;
  metadata?: Record<string, any>;
}

export async function startMintingWorker(): Promise<void> {
  const mintQueue = getMintQueue();
  const orchestrator = new MintingOrchestrator();

  // Process mint jobs
  mintQueue.process('mint-ticket', async (job: Job<MintJobData>) => {
    const { ticketId, orderId, eventId, tenantId, metadata } = job.data;

    logger.info(`Processing mint for ticket ${ticketId}`);

    try {
      const result = await orchestrator.mintCompressedNFT({
        ticketId,
        orderId,
        eventId,
        tenantId,
        metadata
      });

      logger.info(`Successfully minted ticket ${ticketId}`, result);
      return result;
    } catch (error) {
      logger.error(`Failed to mint ticket ${ticketId}:`, error);
      throw error;
    }
  });

  logger.info('Minting worker started');
}
