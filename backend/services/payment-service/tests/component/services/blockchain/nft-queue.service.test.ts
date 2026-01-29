/**
 * COMPONENT TEST: NFTQueueService
 *
 * Tests NFT minting queue management
 */

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Bull queue
const mockAdd = jest.fn();
const mockProcess = jest.fn();
const mockGetWaitingCount = jest.fn();
const mockGetActiveCount = jest.fn();
const mockGetCompletedCount = jest.fn();
const mockCount = jest.fn();

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: mockAdd,
    process: mockProcess,
    getWaitingCount: mockGetWaitingCount,
    getActiveCount: mockGetActiveCount,
    getCompletedCount: mockGetCompletedCount,
    count: mockCount,
  }));
});

// Mock Solana
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({})),
  PublicKey: jest.fn(),
  Transaction: jest.fn(),
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: '',
    },
  },
}));

// Mock blockchain config
jest.mock('../../../../src/config/blockchain', () => ({
  blockchainConfig: {
    solana: {
      rpcUrl: 'https://api.devnet.solana.com',
      commitment: 'confirmed',
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

import { NFTQueueService } from '../../../../src/services/blockchain/nft-queue.service';

describe('NFTQueueService Component Tests', () => {
  let service: NFTQueueService;

  beforeEach(() => {
    mockAdd.mockReset();
    mockProcess.mockReset();
    mockGetWaitingCount.mockReset();
    mockGetActiveCount.mockReset();
    mockGetCompletedCount.mockReset();
    mockCount.mockReset();

    // Default mocks
    mockAdd.mockResolvedValue({ id: 'job_123' });
    mockGetWaitingCount.mockResolvedValue(5);
    mockGetActiveCount.mockResolvedValue(2);
    mockGetCompletedCount.mockResolvedValue(100);
    mockCount.mockResolvedValue(5);

    service = new NFTQueueService();
  });

  // ===========================================================================
  // QUEUE MINTING
  // ===========================================================================
  describe('queueMinting()', () => {
    it('should add mint request to queue', async () => {
      const jobId = await service.queueMinting({
        paymentId: 'pay_123',
        ticketIds: ['ticket_1', 'ticket_2'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      expect(jobId).toBe('job_123');
      expect(mockAdd).toHaveBeenCalledWith(
        'mint-tickets',
        expect.objectContaining({
          paymentId: 'pay_123',
          ticketIds: ['ticket_1', 'ticket_2'],
        }),
        expect.objectContaining({
          attempts: 3,
          removeOnComplete: true,
        })
      );
    });

    it('should set priority based on request', async () => {
      await service.queueMinting({
        paymentId: 'pay_123',
        ticketIds: ['ticket_1'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'urgent',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'mint-tickets',
        expect.any(Object),
        expect.objectContaining({
          priority: 3, // urgent = 3
        })
      );
    });

    it('should configure exponential backoff', async () => {
      await service.queueMinting({
        paymentId: 'pay_123',
        ticketIds: ['ticket_1'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'mint-tickets',
        expect.any(Object),
        expect.objectContaining({
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        })
      );
    });
  });

  // ===========================================================================
  // QUEUE BATCH MINTING
  // ===========================================================================
  describe('queueBatchMinting()', () => {
    it('should group requests by event and blockchain', async () => {
      const jobIds = await service.queueBatchMinting([
        { paymentId: 'pay_1', ticketIds: ['t1'], venueId: 'v1', eventId: 'e1', blockchain: 'solana', priority: 'standard' },
        { paymentId: 'pay_2', ticketIds: ['t2'], venueId: 'v1', eventId: 'e1', blockchain: 'solana', priority: 'standard' },
        { paymentId: 'pay_3', ticketIds: ['t3'], venueId: 'v1', eventId: 'e2', blockchain: 'solana', priority: 'standard' },
      ]);

      // Should create 2 batches (e1_solana and e2_solana)
      expect(mockAdd).toHaveBeenCalledTimes(2);
      expect(jobIds).toContain('job_123');
    });

    it('should combine ticket IDs in batch', async () => {
      await service.queueBatchMinting([
        { paymentId: 'pay_1', ticketIds: ['t1', 't2'], venueId: 'v1', eventId: 'e1', blockchain: 'solana', priority: 'standard' },
        { paymentId: 'pay_2', ticketIds: ['t3'], venueId: 'v1', eventId: 'e1', blockchain: 'solana', priority: 'standard' },
      ]);

      expect(mockAdd).toHaveBeenCalledWith(
        'batch-mint',
        expect.objectContaining({
          ticketIds: expect.arrayContaining(['t1', 't2', 't3']),
        }),
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // GET QUEUE STATUS
  // ===========================================================================
  describe('getQueueStatus()', () => {
    it('should return queue statistics', async () => {
      const status = await service.getQueueStatus();

      expect(status.mintQueue).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
      });
      expect(status.batchQueue).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
      });
    });
  });

  // ===========================================================================
  // GET JOB STATUS
  // ===========================================================================
  describe('getJobStatus()', () => {
    it('should return job status', async () => {
      const status = await service.getJobStatus('job_123');

      expect(status.jobId).toBe('job_123');
      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
    });
  });

  // ===========================================================================
  // PRIORITY MAPPING
  // ===========================================================================
  describe('priority mapping', () => {
    it('should map urgent to priority 3', async () => {
      await service.queueMinting({
        paymentId: 'pay_1', ticketIds: ['t1'], venueId: 'v1', eventId: 'e1', blockchain: 'solana', priority: 'urgent',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'mint-tickets',
        expect.any(Object),
        expect.objectContaining({ priority: 3 })
      );
    });

    it('should map high to priority 2', async () => {
      await service.queueMinting({
        paymentId: 'pay_1', ticketIds: ['t1'], venueId: 'v1', eventId: 'e1', blockchain: 'solana', priority: 'high',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'mint-tickets',
        expect.any(Object),
        expect.objectContaining({ priority: 2 })
      );
    });

    it('should map standard to priority 1', async () => {
      await service.queueMinting({
        paymentId: 'pay_1', ticketIds: ['t1'], venueId: 'v1', eventId: 'e1', blockchain: 'solana', priority: 'standard',
      });

      expect(mockAdd).toHaveBeenCalledWith(
        'mint-tickets',
        expect.any(Object),
        expect.objectContaining({ priority: 1 })
      );
    });
  });
});
