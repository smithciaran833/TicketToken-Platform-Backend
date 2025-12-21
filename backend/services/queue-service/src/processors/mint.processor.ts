import { BullJobData } from '../adapters/bull-job-adapter';
import { nftService, MintNFTRequest, MintNFTResult } from '../services/nft.service';
import { emailService } from '../services/email.service';
import { webhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';

/**
 * Mint Processor
 * Handles async NFT minting jobs for Solana tickets
 */

export interface MintJobData extends MintNFTRequest {
  ticketId?: string;
  orderId?: string;
  userId?: string;
  tenantId?: string;
  eventId?: string;
}

export interface MintJobResult extends MintNFTResult {
  ticketId?: string;
  orderId?: string;
  userId?: string;
  processingTime: number;
}

/**
 * Process NFT mint job
 * Creates a Solana NFT ticket and handles the result
 */
export async function processMint(job: BullJobData<MintJobData>): Promise<MintJobResult> {
  const startTime = Date.now();
  const { ticketId, orderId, userId, tenantId, eventId, ...mintRequest } = job.data;

  logger.info('Processing NFT mint job', {
    jobId: job.id,
    ticketId,
    orderId,
    userId,
    tenantId,
    eventId,
    recipient: mintRequest.recipientAddress,
    nftName: mintRequest.metadata.name,
    attempt: (job.attemptsMade || 0) + 1,
  });

  try {
    // Check wallet balance before minting
    const balance = await nftService.getWalletBalance();
    if (balance < 0.01) {
      logger.warn('Low wallet balance for minting', {
        balance,
        jobId: job.id,
      });
    }

    // Update job progress
    await job.progress?.(10);

    // Mint NFT via Solana/Metaplex
    const result = await nftService.mintNFT(mintRequest);

    await job.progress?.(90);

    const processingTime = Date.now() - startTime;

    if (result.success) {
      logger.info('NFT minted successfully', {
        jobId: job.id,
        ticketId,
        orderId,
        mintAddress: result.mintAddress,
        explorerUrl: result.explorerUrl,
        processingTime,
      });

      // Update job progress
      await job.progress?.(100);

      return {
        ...result,
        ticketId,
        orderId,
        userId,
        processingTime,
      };
    } else {
      logger.error('NFT minting failed', {
        jobId: job.id,
        ticketId,
        orderId,
        error: result.error,
        processingTime,
      });

      // Throw error to trigger retry
      throw new Error(result.error || 'NFT minting failed');
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;

    logger.error('Mint job failed', {
      jobId: job.id,
      ticketId,
      orderId,
      userId,
      error: error.message,
      attempt: (job.attemptsMade || 0) + 1,
      processingTime,
    });

    // Re-throw to let Bull handle retries
    throw error;
  }
}

/**
 * Handle mint job failure
 * Called when all retry attempts have been exhausted
 */
export async function onMintFailed(job: BullJobData<MintJobData>, error: Error): Promise<void> {
  const { ticketId, orderId, userId, tenantId, eventId } = job.data;

  logger.error('Mint job failed permanently', {
    jobId: job.id,
    ticketId,
    orderId,
    userId,
    tenantId,
    eventId,
    error: error.message,
    attempts: job.attemptsMade,
  });

  // Send admin alert
  await emailService.sendAdminAlert(
    'NFT Minting Failed',
    `NFT minting failed after ${job.attemptsMade} attempts`,
    {
      jobId: job.id,
      ticketId,
      orderId,
      userId,
      tenantId,
      eventId,
      error: error.message,
      attempts: job.attemptsMade,
    }
  );

  // Send failure webhook
  await webhookService.sendOperationFailed({
    operation: 'nft_mint',
    orderId,
    userId,
    error: error.message,
  });
}

/**
 * Handle mint job completion
 */
export async function onMintCompleted(job: BullJobData<MintJobData>, result: MintJobResult): Promise<void> {
  const { ticketId, orderId, userId, tenantId, eventId } = job.data;

  logger.info('Mint job completed', {
    jobId: job.id,
    ticketId,
    orderId,
    userId,
    tenantId,
    eventId,
    mintAddress: result.mintAddress,
    explorerUrl: result.explorerUrl,
    processingTime: result.processingTime,
  });

  // Send NFT minted confirmation email (if user data available)
  const userEmail = (job.data.metadata as any)?.userEmail;
  const userName = (job.data.metadata as any)?.userName;
  
  if (userEmail && userName) {
    await emailService.sendNFTMintedConfirmation({
      recipientEmail: userEmail,
      recipientName: userName,
      ticketName: job.data.metadata.name,
      mintAddress: result.mintAddress || '',
      explorerUrl: result.explorerUrl || '',
      imageUrl: job.data.metadata.image,
    });
  }

  // Send webhook notification
  if (result.mintAddress && result.metadataUri) {
    await webhookService.sendNFTMinted({
      ticketId: ticketId || '',
      orderId: orderId || '',
      userId: userId || '',
      mintAddress: result.mintAddress,
      metadataUri: result.metadataUri,
      explorerUrl: result.explorerUrl || '',
      webhookUrl: (job.data as any).webhookUrl,
    });
  }
}

/**
 * Handle mint job progress
 */
export async function onMintProgress(job: BullJobData<MintJobData>, progress: number): Promise<void> {
  logger.debug('Mint job progress', {
    jobId: job.id,
    ticketId: job.data.ticketId,
    progress,
  });
}

/**
 * Process NFT transfer job
 */
export interface TransferJobData {
  mintAddress: string;
  recipientAddress: string;
  ticketId?: string;
  orderId?: string;
  userId?: string;
  tenantId?: string;
}

export async function processTransfer(job: BullJobData<TransferJobData>): Promise<any> {
  const startTime = Date.now();
  const { mintAddress, recipientAddress, ticketId, orderId, userId } = job.data;

  logger.info('Processing NFT transfer job', {
    jobId: job.id,
    ticketId,
    orderId,
    mintAddress,
    recipient: recipientAddress,
    attempt: (job.attemptsMade || 0) + 1,
  });

  try {
    const result = await nftService.transferNFT(mintAddress, recipientAddress);

    const processingTime = Date.now() - startTime;

    if (result.success) {
      logger.info('NFT transferred successfully', {
        jobId: job.id,
        ticketId,
        signature: result.signature,
        processingTime,
      });

      return {
        ...result,
        ticketId,
        orderId,
        userId,
        processingTime,
      };
    } else {
      throw new Error(result.error || 'NFT transfer failed');
    }
  } catch (error: any) {
    const processingTime = Date.now() - startTime;

    logger.error('Transfer job failed', {
      jobId: job.id,
      ticketId,
      error: error.message,
      processingTime,
    });

    throw error;
  }
}
