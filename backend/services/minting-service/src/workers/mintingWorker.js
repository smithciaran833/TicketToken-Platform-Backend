const { getMintQueue } = require('../queues/mintQueue');
const { MintingOrchestrator } = require('../services/MintingOrchestrator');
const logger = require('../utils/logger');

async function startMintingWorker() {
  const mintQueue = getMintQueue();
  const orchestrator = new MintingOrchestrator();
  
  // Process mint jobs
  mintQueue.process('mint-ticket', async (job) => {
    const { ticketId, orderId, eventId, metadata } = job.data;
    
    logger.info(`🎫 Processing mint for ticket ${ticketId}`);
    
    try {
      const result = await orchestrator.mintCompressedNFT({
        ticketId,
        orderId,
        eventId,
        metadata
      });
      
      logger.info(`✅ Successfully minted ticket ${ticketId}`, result);
      return result;
      
    } catch (error) {
      logger.error(`❌ Failed to mint ticket ${ticketId}:`, error);
      throw error;
    }
  });
  
  logger.info('✅ Minting worker started');
}

module.exports = { startMintingWorker };
