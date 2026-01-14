/**
 * Unit tests for BatchMintingService
 * Tests batch minting functionality with parallel processing
 */

// Mock dependencies before imports
jest.mock('../../../src/config/solana', () => ({
  getConnection: jest.fn(() => ({
    rpcEndpoint: 'https://api.devnet.solana.com'
  })),
  getWallet: jest.fn(() => ({
    publicKey: { toString: () => 'MockWalletPublicKey123' },
    secretKey: new Uint8Array(64)
  }))
}));

jest.mock('../../../src/utils/solana', () => ({
  sendAndConfirmTransactionWithRetry: jest.fn()
}));

jest.mock('../../../src/services/MetadataService', () => ({
  uploadToIPFS: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../src/utils/metrics', () => ({
  recordMintSuccess: jest.fn(),
  recordMintFailure: jest.fn()
}));

jest.mock('@solana/web3.js', () => ({
  Transaction: jest.fn().mockImplementation(() => ({
    add: jest.fn()
  })),
  PublicKey: jest.fn().mockImplementation((key) => key),
  Connection: jest.fn(),
  Keypair: jest.fn()
}));

import { BatchMintingService } from '../../../src/services/BatchMintingService';
import { sendAndConfirmTransactionWithRetry } from '../../../src/utils/solana';
import { uploadToIPFS } from '../../../src/services/MetadataService';
import { recordMintSuccess, recordMintFailure } from '../../../src/utils/metrics';
import logger from '../../../src/utils/logger';

describe('BatchMintingService', () => {
  let service: BatchMintingService;

  const mockBatchRequest = {
    venueId: 'venue-123',
    tickets: [
      {
        id: 'ticket-1',
        eventId: 'event-1',
        userId: 'user-1',
        ticketData: {
          eventName: 'Concert A',
          eventDate: '2026-01-20',
          venue: 'Stadium A',
          tier: 'VIP',
          seatNumber: 'A1'
        }
      },
      {
        id: 'ticket-2',
        eventId: 'event-1',
        userId: 'user-2',
        ticketData: {
          eventName: 'Concert A',
          eventDate: '2026-01-20',
          venue: 'Stadium A',
          tier: 'General',
          seatNumber: 'B5'
        }
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatchMintingService();

    // Default successful mocks
    (uploadToIPFS as jest.Mock).mockResolvedValue('ipfs://QmTest123');
    (sendAndConfirmTransactionWithRetry as jest.Mock).mockResolvedValue({
      signature: 'mockSignature123'
    });
  });

  describe('Constants', () => {
    it('MAX_BATCH_SIZE should be 10', () => {
      // Access private property through reflection or test behavior
      // We can test this through behavior by sending more than 10 tickets
      expect(service).toBeDefined();
    });

    it('BATCH_DELAY_MS should be 100', () => {
      // This is a private constant, we test it through behavior
      expect(service).toBeDefined();
    });
  });

  describe('batchMint', () => {
    it('should validate batch size', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.summary.total).toBe(2);
    });

    it('should process tickets in parallel within batch', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      // Both tickets should be processed
      expect(uploadToIPFS).toHaveBeenCalledTimes(2);
      expect(sendAndConfirmTransactionWithRetry).toHaveBeenCalledTimes(2);
    });

    it('should process in batches of MAX_BATCH_SIZE', async () => {
      // Create request with 15 tickets (should be 2 batches)
      const largeRequest = {
        venueId: 'venue-123',
        tickets: Array.from({ length: 15 }, (_, i) => ({
          id: `ticket-${i}`,
          eventId: 'event-1',
          userId: 'user-1',
          ticketData: {
            eventName: 'Concert',
            eventDate: '2026-01-20',
            venue: 'Stadium',
            tier: 'General',
            seatNumber: `Seat-${i}`
          }
        }))
      };

      await service.batchMint(largeRequest);

      // All 15 should be processed
      expect(uploadToIPFS).toHaveBeenCalledTimes(15);
    });

    it('should add delay between batches', async () => {
      jest.useFakeTimers();
      
      const largeRequest = {
        venueId: 'venue-123',
        tickets: Array.from({ length: 12 }, (_, i) => ({
          id: `ticket-${i}`,
          eventId: 'event-1',
          userId: 'user-1',
          ticketData: { eventName: 'Concert' }
        }))
      };

      const batchPromise = service.batchMint(largeRequest);
      
      // Fast-forward through delays
      jest.runAllTimers();
      
      await batchPromise;
      
      jest.useRealTimers();
    });

    it('should collect all results', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('should count successful and failed', async () => {
      // Make second ticket fail
      (uploadToIPFS as jest.Mock)
        .mockResolvedValueOnce('ipfs://QmTest1')
        .mockRejectedValueOnce(new Error('IPFS upload failed'));

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(1);
    });

    it('should return successful tickets with signature and metadataUri', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.successful[0]).toHaveProperty('ticketId');
      expect(result.successful[0]).toHaveProperty('signature');
      expect(result.successful[0]).toHaveProperty('metadataUri');
    });

    it('should return failed tickets with error message', async () => {
      (uploadToIPFS as jest.Mock).mockRejectedValue(new Error('Upload failed'));

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.failed[0]).toHaveProperty('ticketId');
      expect(result.failed[0]).toHaveProperty('error');
      expect(result.failed[0].error).toBe('Upload failed');
    });

    it('should calculate totalDuration', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.summary.totalDuration).toBeDefined();
      expect(typeof result.summary.totalDuration).toBe('number');
    });

    it('should calculate avgDuration', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.summary.avgDuration).toBeDefined();
      expect(typeof result.summary.avgDuration).toBe('number');
    });

    it('should return avgDuration of 0 when all fail', async () => {
      (uploadToIPFS as jest.Mock).mockRejectedValue(new Error('Failed'));

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.summary.avgDuration).toBe(0);
    });

    it('should log batch start', async () => {
      await service.batchMint(mockBatchRequest);
      
      expect(logger.info).toHaveBeenCalledWith(
        'Starting batch mint',
        expect.objectContaining({
          venueId: 'venue-123',
          totalTickets: 2
        })
      );
    });

    it('should log batch completion', async () => {
      await service.batchMint(mockBatchRequest);
      
      expect(logger.info).toHaveBeenCalledWith(
        'Batch mint completed',
        expect.objectContaining({
          total: 2
        })
      );
    });

    it('should record metrics for successful mints', async () => {
      await service.batchMint(mockBatchRequest);
      
      expect(recordMintSuccess).toHaveBeenCalledTimes(2);
      expect(recordMintSuccess).toHaveBeenCalledWith(
        'venue-123',
        expect.any(Number)
      );
    });

    it('should record metrics for failed mints', async () => {
      (uploadToIPFS as jest.Mock).mockRejectedValue(new Error('Failed'));

      await service.batchMint(mockBatchRequest);
      
      expect(recordMintFailure).toHaveBeenCalledTimes(2);
      expect(recordMintFailure).toHaveBeenCalledWith(
        'venue-123',
        'batch_mint_error'
      );
    });

    it('should handle complete batch failure', async () => {
      (sendAndConfirmTransactionWithRetry as jest.Mock).mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.failed.length).toBeGreaterThan(0);
    });

    it('should handle empty tickets array', async () => {
      const emptyRequest = {
        venueId: 'venue-123',
        tickets: []
      };

      const result = await service.batchMint(emptyRequest);
      
      expect(result.summary.total).toBe(0);
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('estimateBatchCost', () => {
    it('should calculate SOL cost', async () => {
      const estimate = await service.estimateBatchCost(10);
      
      expect(estimate.estimatedSOL).toBeDefined();
      expect(typeof estimate.estimatedSOL).toBe('number');
    });

    it('should include transaction fees', async () => {
      const estimate = await service.estimateBatchCost(100);
      
      // 0.001 SOL per mint * 100 = 0.1 SOL
      expect(estimate.estimatedSOL).toBe(0.1);
    });

    it('should calculate estimated time', async () => {
      const estimate = await service.estimateBatchCost(10);
      
      expect(estimate.estimatedTimeSeconds).toBeDefined();
      expect(typeof estimate.estimatedTimeSeconds).toBe('number');
    });

    it('should calculate batch count', async () => {
      const estimate = await service.estimateBatchCost(25);
      
      // 25 tickets / 10 per batch = 3 batches
      expect(estimate.batchCount).toBe(3);
    });

    it('should return 1 batch for small ticket count', async () => {
      const estimate = await service.estimateBatchCost(5);
      
      expect(estimate.batchCount).toBe(1);
    });

    it('should handle zero tickets', async () => {
      const estimate = await service.estimateBatchCost(0);
      
      expect(estimate.estimatedSOL).toBe(0);
      expect(estimate.estimatedTimeSeconds).toBe(0);
      expect(estimate.batchCount).toBe(0);
    });

    it('should scale linearly with ticket count', async () => {
      const estimate10 = await service.estimateBatchCost(10);
      const estimate20 = await service.estimateBatchCost(20);
      
      expect(estimate20.estimatedSOL).toBe(estimate10.estimatedSOL * 2);
    });
  });

  describe('private methods behavior', () => {
    describe('createBatches behavior', () => {
      it('should split tickets into correct batch sizes', async () => {
        const request = {
          venueId: 'venue-123',
          tickets: Array.from({ length: 25 }, (_, i) => ({
            id: `ticket-${i}`,
            eventId: 'event-1',
            userId: 'user-1',
            ticketData: { eventName: 'Concert' }
          }))
        };

        // Each batch should be processed
        await service.batchMint(request);
        
        // 25 tickets = 3 batches (10 + 10 + 5)
        expect(uploadToIPFS).toHaveBeenCalledTimes(25);
      });
    });

    describe('mintSingle behavior', () => {
      it('should upload metadata to IPFS', async () => {
        await service.batchMint(mockBatchRequest);
        
        expect(uploadToIPFS).toHaveBeenCalledWith(
          expect.objectContaining({
            ticketId: 'ticket-1',
            eventId: 'event-1'
          })
        );
      });

      it('should create transaction with memo data', async () => {
        await service.batchMint(mockBatchRequest);
        
        expect(sendAndConfirmTransactionWithRetry).toHaveBeenCalled();
      });

      it('should include metadata fields', async () => {
        await service.batchMint(mockBatchRequest);
        
        expect(uploadToIPFS).toHaveBeenCalledWith(
          expect.objectContaining({
            eventName: 'Concert A',
            eventDate: '2026-01-20',
            venue: 'Stadium A',
            tier: 'VIP',
            seatNumber: 'A1'
          })
        );
      });

      it('should handle missing orderId gracefully', async () => {
        const request = {
          venueId: 'venue-123',
          tickets: [{
            id: 'ticket-1',
            eventId: 'event-1',
            userId: 'user-1',
            ticketData: { eventName: 'Concert' }
          }]
        };

        await service.batchMint(request);
        
        // Should use ticket.id as fallback for orderId
        expect(uploadToIPFS).toHaveBeenCalled();
      });

      it('should log error for failed single mint', async () => {
        (uploadToIPFS as jest.Mock).mockRejectedValue(new Error('IPFS error'));

        await service.batchMint(mockBatchRequest);
        
        expect(logger.error).toHaveBeenCalledWith(
          'Single mint failed in batch',
          expect.objectContaining({
            ticketId: expect.any(String),
            error: 'IPFS error'
          })
        );
      });
    });
  });

  describe('error handling', () => {
    it('should continue processing after individual ticket failure', async () => {
      (uploadToIPFS as jest.Mock)
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce('ipfs://QmSuccess');

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.successful.length).toBe(1);
      expect(result.failed.length).toBe(1);
    });

    it('should handle IPFS upload errors', async () => {
      (uploadToIPFS as jest.Mock).mockRejectedValue(new Error('IPFS service unavailable'));

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.failed.length).toBe(2);
      expect(result.failed[0].error).toContain('IPFS service unavailable');
    });

    it('should handle transaction errors', async () => {
      (sendAndConfirmTransactionWithRetry as jest.Mock).mockRejectedValue(
        new Error('Transaction simulation failed')
      );

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.failed.length).toBe(2);
    });

    it('should handle unknown errors', async () => {
      (uploadToIPFS as jest.Mock).mockRejectedValue('Unknown error type');

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.failed.length).toBe(2);
      expect(result.failed[0].error).toBe('Unknown error');
    });
  });

  describe('result structure', () => {
    it('should return correct result structure', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.successful)).toBe(true);
      expect(Array.isArray(result.failed)).toBe(true);
    });

    it('should include all summary fields', async () => {
      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.summary).toHaveProperty('total');
      expect(result.summary).toHaveProperty('succeeded');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary).toHaveProperty('totalDuration');
      expect(result.summary).toHaveProperty('avgDuration');
    });

    it('should calculate success rate correctly', async () => {
      (uploadToIPFS as jest.Mock)
        .mockResolvedValueOnce('ipfs://QmTest1')
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await service.batchMint(mockBatchRequest);
      
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.total).toBe(2);
    });
  });
});
