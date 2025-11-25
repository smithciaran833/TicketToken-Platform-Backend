import { MintBatcherService } from '../../../../src/services/blockchain/mint-batcher.service';

// Mock blockchain config
jest.mock('../../../../src/config/blockchain', () => ({
  blockchainConfig: {
    batchSizes: {
      solana: 10,
      polygon: 20
    },
    retryConfig: {
      maxAttempts: 3,
      baseDelay: 1000
    }
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('MintBatcherService', () => {
  let service: MintBatcherService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new MintBatcherService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('addToBatch', () => {
    it('should create a new batch for first request', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1', 'ticket_2'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const batchId = await service.addToBatch(request);

      expect(batchId).toBeDefined();
      expect(batchId).toContain('batch_');
      expect(batchId).toContain('event_1_solana');
    });

    it('should add to existing batch', async () => {
      const request1 = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const request2 = {
        paymentId: 'payment_2',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_2'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const batchId1 = await service.addToBatch(request1);
      const batchId2 = await service.addToBatch(request2);

      // Both should be added to same batch
      expect(batchId1).toBe(batchId2);
    });

    it('should create separate batches for different events', async () => {
      const request1 = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const request2 = {
        paymentId: 'payment_2',
        eventId: 'event_2',
        venueId: 'venue_1',
        ticketIds: ['ticket_2'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const batchId1 = await service.addToBatch(request1);
      const batchId2 = await service.addToBatch(request2);

      expect(batchId1).not.toBe(batchId2);
    });

    it('should create separate batches for different blockchains', async () => {
      const request1 = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const request2 = {
        paymentId: 'payment_2',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_2'],
        blockchain: 'polygon',
        priority: 'standard'
      };

      const batchId1 = await service.addToBatch(request1);
      const batchId2 = await service.addToBatch(request2);

      expect(batchId1).not.toBe(batchId2);
    });

    it('should process batch when size limit reached', async () => {
      const requests = Array(10).fill(null).map((_, i) => ({
        paymentId: `payment_${i}`,
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: [`ticket_${i}`],
        blockchain: 'solana',
        priority: 'standard'
      }));

      // Add 10 tickets (batch size limit for Solana)
      for (const request of requests) {
        await service.addToBatch(request);
      }

      // Advance timers to allow processing
      await jest.advanceTimersByTimeAsync(100);

      // Batch should be processed and removed from pending
      const status = service.getBatchStatus();
      expect(status.pending).toBe(0);
    });

    it('should delay processing for partial batch', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1', 'ticket_2'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.addToBatch(request);

      // Should still be pending before timer expires
      const statusBefore = service.getBatchStatus();
      expect(statusBefore.pending).toBe(1);

      // Advance past the batch delay (5 seconds)
      await jest.advanceTimersByTimeAsync(6000);

      // Should be processed after delay
      const statusAfter = service.getBatchStatus();
      expect(statusAfter.pending).toBe(0);
    });
  });

  describe('getBatchStatus', () => {
    it('should return zero pending initially', () => {
      const status = service.getBatchStatus();

      expect(status.pending).toBe(0);
      expect(status.processing).toBe(0);
      expect(status.averageSize).toBe(0);
    });

    it('should track pending batches', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1', 'ticket_2', 'ticket_3'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.addToBatch(request);

      const status = service.getBatchStatus();
      expect(status.pending).toBe(1);
      expect(status.averageSize).toBe(3);
    });

    it('should calculate average batch size correctly', async () => {
      const request1 = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1', 'ticket_2'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const request2 = {
        paymentId: 'payment_2',
        eventId: 'event_2',
        venueId: 'venue_1',
        ticketIds: ['ticket_3', 'ticket_4', 'ticket_5', 'ticket_6'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.addToBatch(request1);
      await service.addToBatch(request2);

      const status = service.getBatchStatus();
      expect(status.pending).toBe(2);
      expect(status.averageSize).toBe(3); // (2 + 4) / 2 = 3
    });
  });

  describe('Batch Processing', () => {
    it('should process batch successfully', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1', 'ticket_2'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.addToBatch(request);

      // Mock Math.random to avoid random failure
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      await jest.advanceTimersByTimeAsync(6000);

      // Batch should be processed
      const status = service.getBatchStatus();
      expect(status.pending).toBe(0);
    });

    it('should handle processing failures with retry', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.addToBatch(request);

      // Mock Math.random to force failure
      jest.spyOn(Math, 'random').mockReturnValue(0.05);

      await jest.advanceTimersByTimeAsync(6000);

      // Should schedule retry
      expect(setTimeout).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ticket arrays', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: [],
        blockchain: 'solana',
        priority: 'standard'
      };

      const batchId = await service.addToBatch(request);

      expect(batchId).toBeDefined();
    });

    it('should handle concurrent batch additions', async () => {
      const requests = Array(5).fill(null).map((_, i) => ({
        paymentId: `payment_${i}`,
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: [`ticket_${i}`],
        blockchain: 'solana',
        priority: 'standard'
      }));

      const batchIds = await Promise.all(
        requests.map(r => service.addToBatch(r))
      );

      // All should be in same batch
      const uniqueBatchIds = new Set(batchIds);
      expect(uniqueBatchIds.size).toBe(1);
    });

    it('should handle multiple blockchains simultaneously', async () => {
      const solanaRequest = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const polygonRequest = {
        paymentId: 'payment_2',
        eventId: 'event_1',
        venueId: 'venue_1',
        ticketIds: ['ticket_2'],
        blockchain: 'polygon',
        priority: 'standard'
      };

      await service.addToBatch(solanaRequest);
      await service.addToBatch(polygonRequest);

      const status = service.getBatchStatus();
      expect(status.pending).toBe(2);
    });
  });
});
