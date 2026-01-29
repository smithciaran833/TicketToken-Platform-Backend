/**
 * COMPONENT TEST: MintBatcherService
 *
 * Tests NFT minting batch collection and processing
 */

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock blockchain config
jest.mock('../../../../src/config/blockchain', () => ({
  blockchainConfig: {
    batchSizes: {
      solana: 10,
      polygon: 20,
    },
    retryConfig: {
      maxAttempts: 3,
      baseDelay: 1000,
    },
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    child: () => ({ info: jest.fn(), error: jest.fn() }),
  },
}));

import { MintBatcherService } from '../../../../src/services/blockchain/mint-batcher.service';

describe('MintBatcherService Component Tests', () => {
  let service: MintBatcherService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new MintBatcherService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===========================================================================
  // ADD TO BATCH
  // ===========================================================================
  describe('addToBatch()', () => {
    it('should create new batch for first request', async () => {
      const batchId = await service.addToBatch({
        paymentId: 'pay_123',
        ticketIds: ['ticket_1', 'ticket_2'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      expect(batchId).toMatch(/^batch_/);
    });

    it('should add to existing batch for same event/blockchain', async () => {
      const batchId1 = await service.addToBatch({
        paymentId: 'pay_1',
        ticketIds: ['ticket_1'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      const batchId2 = await service.addToBatch({
        paymentId: 'pay_2',
        ticketIds: ['ticket_2'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      expect(batchId1).toBe(batchId2);
    });

    it('should create separate batches for different events', async () => {
      const batchId1 = await service.addToBatch({
        paymentId: 'pay_1',
        ticketIds: ['ticket_1'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      const batchId2 = await service.addToBatch({
        paymentId: 'pay_2',
        ticketIds: ['ticket_2'],
        venueId: 'venue_1',
        eventId: 'event_2',
        blockchain: 'solana',
        priority: 'standard',
      });

      expect(batchId1).not.toBe(batchId2);
    });

    it('should create separate batches for different blockchains', async () => {
      const batchId1 = await service.addToBatch({
        paymentId: 'pay_1',
        ticketIds: ['ticket_1'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      const batchId2 = await service.addToBatch({
        paymentId: 'pay_2',
        ticketIds: ['ticket_2'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'polygon',
        priority: 'standard',
      });

      expect(batchId1).not.toBe(batchId2);
    });

    it('should trigger batch processing when max size reached', async () => {
      // Add 10 tickets (max batch size for solana)
      for (let i = 0; i < 10; i++) {
        await service.addToBatch({
          paymentId: `pay_${i}`,
          ticketIds: [`ticket_${i}`],
          venueId: 'venue_1',
          eventId: 'event_1',
          blockchain: 'solana',
          priority: 'standard',
        });
      }

      // The batch timer should be cleared when max size is reached
      // Advance timers to let processBatch run (includes 2s blockchain submit)
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
      await Promise.resolve();

      // Batch should be removed from pending
      const status = service.getBatchStatus();
      expect(status.pending).toBe(0);
    }, 10000);
  });

  // ===========================================================================
  // GET BATCH STATUS
  // ===========================================================================
  describe('getBatchStatus()', () => {
    it('should return empty status initially', () => {
      const status = service.getBatchStatus();

      expect(status.pending).toBe(0);
      expect(status.processing).toBe(0);
      expect(status.averageSize).toBe(0);
    });

    it('should track pending batches', async () => {
      await service.addToBatch({
        paymentId: 'pay_1',
        ticketIds: ['ticket_1', 'ticket_2'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      const status = service.getBatchStatus();

      expect(status.pending).toBe(1);
      expect(status.averageSize).toBe(2);
    });

    it('should calculate average batch size', async () => {
      await service.addToBatch({
        paymentId: 'pay_1',
        ticketIds: ['ticket_1', 'ticket_2'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      await service.addToBatch({
        paymentId: 'pay_2',
        ticketIds: ['ticket_3', 'ticket_4', 'ticket_5', 'ticket_6'],
        venueId: 'venue_1',
        eventId: 'event_2',
        blockchain: 'solana',
        priority: 'standard',
      });

      const status = service.getBatchStatus();

      expect(status.pending).toBe(2);
      expect(status.averageSize).toBe(3); // (2 + 4) / 2
    });
  });

  // ===========================================================================
  // BATCH TIMER
  // ===========================================================================
  describe('batch timer', () => {
    it('should process batch after delay', async () => {
      await service.addToBatch({
        paymentId: 'pay_1',
        ticketIds: ['ticket_1'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      expect(service.getBatchStatus().pending).toBe(1);

      // Fast-forward past batch delay (5s) + blockchain submit (2s)
      jest.advanceTimersByTime(8000);
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(service.getBatchStatus().pending).toBe(0);
    });
  });
});
