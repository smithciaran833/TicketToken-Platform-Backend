// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock nftService
jest.mock('../../../src/services/nft.service', () => ({
  nftService: {
    mintNFT: jest.fn(),
    transferNFT: jest.fn(),
    getWalletBalance: jest.fn(),
  },
}));

// Mock emailService
jest.mock('../../../src/services/email.service', () => ({
  emailService: {
    sendAdminAlert: jest.fn().mockResolvedValue(undefined),
    sendNFTMintedConfirmation: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock webhookService
jest.mock('../../../src/services/webhook.service', () => ({
  webhookService: {
    sendOperationFailed: jest.fn().mockResolvedValue(undefined),
    sendNFTMinted: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  processMint,
  onMintFailed,
  onMintCompleted,
  onMintProgress,
  processTransfer,
  MintJobData,
  MintJobResult,
  TransferJobData,
} from '../../../src/processors/mint.processor';
import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { nftService } from '../../../src/services/nft.service';
import { emailService } from '../../../src/services/email.service';
import { webhookService } from '../../../src/services/webhook.service';
import { logger } from '../../../src/utils/logger';

describe('MintProcessor', () => {
  let mockJob: BullJobData<MintJobData>;

  beforeEach(() => {
    mockJob = {
      id: 'job-123',
      name: 'nft-mint',
      data: {
        recipientAddress: 'wallet-abc-123',
        metadata: {
          name: 'Test Ticket NFT',
          symbol: 'TKT',
          description: 'A test ticket',
          image: 'https://example.com/image.png',
          attributes: [{ trait_type: 'Event', value: 'Test Concert' }],
        },
        ticketId: 'ticket-456',
        orderId: 'order-789',
        userId: 'user-111',
        tenantId: 'tenant-222',
        eventId: 'event-333',
      },
      attemptsMade: 0,
      progress: jest.fn().mockResolvedValue(undefined),
    };

    (nftService.getWalletBalance as jest.Mock).mockResolvedValue(1.0);
    (nftService.mintNFT as jest.Mock).mockResolvedValue({
      success: true,
      mintAddress: 'mint-address-xyz',
      metadataUri: 'https://arweave.net/metadata-uri',
      explorerUrl: 'https://explorer.solana.com/tx/abc',
    });
  });

  describe('processMint', () => {
    it('should mint NFT successfully and return result', async () => {
      const result = await processMint(mockJob);

      expect(result.success).toBe(true);
      expect(result.mintAddress).toBe('mint-address-xyz');
      expect(result.metadataUri).toBe('https://arweave.net/metadata-uri');
      expect(result.explorerUrl).toBe('https://explorer.solana.com/tx/abc');
      expect(result.ticketId).toBe('ticket-456');
      expect(result.orderId).toBe('order-789');
      expect(result.userId).toBe('user-111');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should call nftService.mintNFT with correct parameters', async () => {
      await processMint(mockJob);

      expect(nftService.mintNFT).toHaveBeenCalledWith({
        recipientAddress: 'wallet-abc-123',
        metadata: mockJob.data.metadata,
      });
    });

    it('should update job progress during processing', async () => {
      await processMint(mockJob);

      expect(mockJob.progress).toHaveBeenCalledWith(10);
      expect(mockJob.progress).toHaveBeenCalledWith(90);
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should check wallet balance before minting', async () => {
      await processMint(mockJob);

      expect(nftService.getWalletBalance).toHaveBeenCalled();
    });

    it('should warn when wallet balance is low', async () => {
      (nftService.getWalletBalance as jest.Mock).mockResolvedValue(0.005);

      await processMint(mockJob);

      expect(logger.warn).toHaveBeenCalledWith(
        'Low wallet balance for minting',
        expect.objectContaining({
          balance: 0.005,
          jobId: 'job-123',
        })
      );
    });

    it('should log info when processing starts', async () => {
      await processMint(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing NFT mint job',
        expect.objectContaining({
          jobId: 'job-123',
          ticketId: 'ticket-456',
          orderId: 'order-789',
          userId: 'user-111',
          tenantId: 'tenant-222',
          eventId: 'event-333',
          recipient: 'wallet-abc-123',
          nftName: 'Test Ticket NFT',
          attempt: 1,
        })
      );
    });

    it('should log info on successful mint', async () => {
      await processMint(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'NFT minted successfully',
        expect.objectContaining({
          jobId: 'job-123',
          ticketId: 'ticket-456',
          orderId: 'order-789',
          mintAddress: 'mint-address-xyz',
        })
      );
    });

    it('should throw error when mintNFT returns failure', async () => {
      (nftService.mintNFT as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Insufficient SOL',
      });

      await expect(processMint(mockJob)).rejects.toThrow('Insufficient SOL');

      expect(logger.error).toHaveBeenCalledWith(
        'NFT minting failed',
        expect.objectContaining({
          jobId: 'job-123',
          error: 'Insufficient SOL',
        })
      );
    });

    it('should throw generic error when mintNFT fails without error message', async () => {
      (nftService.mintNFT as jest.Mock).mockResolvedValue({
        success: false,
      });

      await expect(processMint(mockJob)).rejects.toThrow('NFT minting failed');
    });

    it('should re-throw errors from mintNFT service', async () => {
      const error = new Error('Network timeout');
      (nftService.mintNFT as jest.Mock).mockRejectedValue(error);

      await expect(processMint(mockJob)).rejects.toThrow('Network timeout');

      expect(logger.error).toHaveBeenCalledWith(
        'Mint job failed',
        expect.objectContaining({
          jobId: 'job-123',
          error: 'Network timeout',
          attempt: 1,
        })
      );
    });

    it('should handle missing optional fields in job data', async () => {
      mockJob.data = {
        recipientAddress: 'wallet-abc',
        metadata: {
          name: 'Minimal NFT',
          symbol: 'MIN',
          description: 'Minimal',
          image: 'https://example.com/img.png',
          attributes: [],
        },
      };

      const result = await processMint(mockJob);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBeUndefined();
      expect(result.orderId).toBeUndefined();
      expect(result.userId).toBeUndefined();
    });

    it('should track attempt number correctly', async () => {
      mockJob.attemptsMade = 2;

      await processMint(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing NFT mint job',
        expect.objectContaining({
          attempt: 3,
        })
      );
    });

    it('should handle undefined attemptsMade', async () => {
      mockJob.attemptsMade = undefined as any;

      await processMint(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing NFT mint job',
        expect.objectContaining({
          attempt: 1,
        })
      );
    });

    it('should handle progress function being undefined', async () => {
      mockJob.progress = undefined;

      const result = await processMint(mockJob);

      expect(result.success).toBe(true);
    });
  });

  describe('onMintFailed', () => {
    it('should log permanent failure', async () => {
      const error = new Error('Blockchain unavailable');
      mockJob.attemptsMade = 5;

      await onMintFailed(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'Mint job failed permanently',
        expect.objectContaining({
          jobId: 'job-123',
          ticketId: 'ticket-456',
          orderId: 'order-789',
          userId: 'user-111',
          tenantId: 'tenant-222',
          eventId: 'event-333',
          error: 'Blockchain unavailable',
          attempts: 5,
        })
      );
    });

    it('should send admin alert on failure', async () => {
      const error = new Error('Critical failure');
      mockJob.attemptsMade = 3;

      await onMintFailed(mockJob, error);

      expect(emailService.sendAdminAlert).toHaveBeenCalledWith(
        'NFT Minting Failed',
        'NFT minting failed after 3 attempts',
        expect.objectContaining({
          jobId: 'job-123',
          ticketId: 'ticket-456',
          orderId: 'order-789',
          userId: 'user-111',
          tenantId: 'tenant-222',
          eventId: 'event-333',
          error: 'Critical failure',
          attempts: 3,
        })
      );
    });

    it('should send failure webhook', async () => {
      const error = new Error('Minting timeout');

      await onMintFailed(mockJob, error);

      expect(webhookService.sendOperationFailed).toHaveBeenCalledWith({
        operation: 'nft_mint',
        orderId: 'order-789',
        userId: 'user-111',
        error: 'Minting timeout',
      });
    });

    it('should handle missing optional fields gracefully', async () => {
      mockJob.data = {
        recipientAddress: 'wallet',
        metadata: { name: 'NFT', symbol: 'N', description: '', image: '', attributes: [] },
      };
      const error = new Error('Test error');

      await onMintFailed(mockJob, error);

      expect(webhookService.sendOperationFailed).toHaveBeenCalledWith({
        operation: 'nft_mint',
        orderId: undefined,
        userId: undefined,
        error: 'Test error',
      });
    });
  });

  describe('onMintCompleted', () => {
    let mockResult: MintJobResult;

    beforeEach(() => {
      mockResult = {
        success: true,
        mintAddress: 'mint-xyz',
        metadataUri: 'https://arweave.net/meta',
        explorerUrl: 'https://explorer.solana.com/tx/123',
        ticketId: 'ticket-456',
        orderId: 'order-789',
        userId: 'user-111',
        processingTime: 1500,
      };
    });

    it('should log completion with all details', async () => {
      await onMintCompleted(mockJob, mockResult);

      expect(logger.info).toHaveBeenCalledWith(
        'Mint job completed',
        expect.objectContaining({
          jobId: 'job-123',
          ticketId: 'ticket-456',
          orderId: 'order-789',
          userId: 'user-111',
          tenantId: 'tenant-222',
          eventId: 'event-333',
          mintAddress: 'mint-xyz',
          explorerUrl: 'https://explorer.solana.com/tx/123',
          processingTime: 1500,
        })
      );
    });

    it('should send NFT minted confirmation email when user data is available', async () => {
      mockJob.data.metadata = {
        ...mockJob.data.metadata,
        userEmail: 'user@example.com',
        userName: 'John Doe',
      } as any;

      await onMintCompleted(mockJob, mockResult);

      expect(emailService.sendNFTMintedConfirmation).toHaveBeenCalledWith({
        recipientEmail: 'user@example.com',
        recipientName: 'John Doe',
        ticketName: 'Test Ticket NFT',
        mintAddress: 'mint-xyz',
        explorerUrl: 'https://explorer.solana.com/tx/123',
        imageUrl: 'https://example.com/image.png',
      });
    });

    it('should not send email when user data is missing', async () => {
      await onMintCompleted(mockJob, mockResult);

      expect(emailService.sendNFTMintedConfirmation).not.toHaveBeenCalled();
    });

    it('should send webhook notification with mint details', async () => {
      await onMintCompleted(mockJob, mockResult);

      expect(webhookService.sendNFTMinted).toHaveBeenCalledWith({
        ticketId: 'ticket-456',
        orderId: 'order-789',
        userId: 'user-111',
        mintAddress: 'mint-xyz',
        metadataUri: 'https://arweave.net/meta',
        explorerUrl: 'https://explorer.solana.com/tx/123',
        webhookUrl: undefined,
      });
    });

    it('should use webhookUrl from job data if provided', async () => {
      (mockJob.data as any).webhookUrl = 'https://webhook.example.com/callback';

      await onMintCompleted(mockJob, mockResult);

      expect(webhookService.sendNFTMinted).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookUrl: 'https://webhook.example.com/callback',
        })
      );
    });

    it('should not send webhook when mintAddress is missing', async () => {
      mockResult.mintAddress = undefined;

      await onMintCompleted(mockJob, mockResult);

      expect(webhookService.sendNFTMinted).not.toHaveBeenCalled();
    });

    it('should not send webhook when metadataUri is missing', async () => {
      mockResult.metadataUri = undefined;

      await onMintCompleted(mockJob, mockResult);

      expect(webhookService.sendNFTMinted).not.toHaveBeenCalled();
    });

    it('should handle empty strings in result', async () => {
      mockResult.explorerUrl = '';

      await onMintCompleted(mockJob, mockResult);

      expect(webhookService.sendNFTMinted).toHaveBeenCalledWith(
        expect.objectContaining({
          explorerUrl: '',
        })
      );
    });
  });

  describe('onMintProgress', () => {
    it('should log progress updates', async () => {
      await onMintProgress(mockJob, 50);

      expect(logger.debug).toHaveBeenCalledWith(
        'Mint job progress',
        expect.objectContaining({
          jobId: 'job-123',
          ticketId: 'ticket-456',
          progress: 50,
        })
      );
    });

    it('should handle 0% progress', async () => {
      await onMintProgress(mockJob, 0);

      expect(logger.debug).toHaveBeenCalledWith(
        'Mint job progress',
        expect.objectContaining({ progress: 0 })
      );
    });

    it('should handle 100% progress', async () => {
      await onMintProgress(mockJob, 100);

      expect(logger.debug).toHaveBeenCalledWith(
        'Mint job progress',
        expect.objectContaining({ progress: 100 })
      );
    });
  });

  describe('processTransfer', () => {
    let mockTransferJob: BullJobData<TransferJobData>;

    beforeEach(() => {
      mockTransferJob = {
        id: 'transfer-job-123',
        name: 'nft-transfer',
        data: {
          mintAddress: 'mint-abc-123',
          recipientAddress: 'recipient-wallet-xyz',
          ticketId: 'ticket-789',
          orderId: 'order-456',
          userId: 'user-222',
          tenantId: 'tenant-333',
        },
        attemptsMade: 0,
      };

      (nftService.transferNFT as jest.Mock).mockResolvedValue({
        success: true,
        signature: 'transfer-sig-xyz',
      });
    });

    it('should transfer NFT successfully', async () => {
      const result = await processTransfer(mockTransferJob);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('transfer-sig-xyz');
      expect(result.ticketId).toBe('ticket-789');
      expect(result.orderId).toBe('order-456');
      expect(result.userId).toBe('user-222');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should call transferNFT with correct parameters', async () => {
      await processTransfer(mockTransferJob);

      expect(nftService.transferNFT).toHaveBeenCalledWith(
        'mint-abc-123',
        'recipient-wallet-xyz'
      );
    });

    it('should log transfer initiation', async () => {
      await processTransfer(mockTransferJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing NFT transfer job',
        expect.objectContaining({
          jobId: 'transfer-job-123',
          ticketId: 'ticket-789',
          orderId: 'order-456',
          mintAddress: 'mint-abc-123',
          recipient: 'recipient-wallet-xyz',
          attempt: 1,
        })
      );
    });

    it('should log successful transfer', async () => {
      await processTransfer(mockTransferJob);

      expect(logger.info).toHaveBeenCalledWith(
        'NFT transferred successfully',
        expect.objectContaining({
          jobId: 'transfer-job-123',
          ticketId: 'ticket-789',
          signature: 'transfer-sig-xyz',
        })
      );
    });

    it('should throw error when transfer fails', async () => {
      (nftService.transferNFT as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Transfer rejected',
      });

      await expect(processTransfer(mockTransferJob)).rejects.toThrow('Transfer rejected');

      expect(logger.error).toHaveBeenCalledWith(
        'Transfer job failed',
        expect.objectContaining({
          jobId: 'transfer-job-123',
          ticketId: 'ticket-789',
          error: 'Transfer rejected',
        })
      );
    });

    it('should throw generic error when transfer fails without message', async () => {
      (nftService.transferNFT as jest.Mock).mockResolvedValue({
        success: false,
      });

      await expect(processTransfer(mockTransferJob)).rejects.toThrow('NFT transfer failed');
    });

    it('should re-throw service errors', async () => {
      const error = new Error('Solana RPC error');
      (nftService.transferNFT as jest.Mock).mockRejectedValue(error);

      await expect(processTransfer(mockTransferJob)).rejects.toThrow('Solana RPC error');
    });

    it('should handle missing optional fields', async () => {
      mockTransferJob.data = {
        mintAddress: 'mint-123',
        recipientAddress: 'recipient-456',
      };

      const result = await processTransfer(mockTransferJob);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBeUndefined();
    });
  });
});
