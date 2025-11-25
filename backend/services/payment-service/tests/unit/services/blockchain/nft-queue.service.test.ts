import { NFTQueueService } from '../../../../src/services/blockchain/nft-queue.service';

// Mock Bull queue
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job_123' }),
  process: jest.fn(),
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getCompletedCount: jest.fn().mockResolvedValue(0),
  count: jest.fn().mockResolvedValue(0)
};

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => mockQueue);
});

// Mock Solana
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({})),
  PublicKey: jest.fn(),
  Transaction: jest.fn()
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined
    }
  }
}));

jest.mock('../../../../src/config/blockchain', () => ({
  blockchainConfig: {
    solana: {
      rpcUrl: 'https://api.devnet.solana.com',
      commitment: 'confirmed'
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

describe('NFTQueueService', () => {
  let service: NFTQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NFTQueueService();
  });

  describe('queueMinting', () => {
    it('should queue an NFT minting request', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        ticketIds: ['ticket_1', 'ticket_2'],
        blockchain: 'solana',
        priority: 'standard'
      };

      const jobId = await service.queueMinting(request);

      expect(jobId).toBe('job_123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'mint-tickets',
        request,
        expect.objectContaining({
          priority: 1,
          attempts: 3
        })
      );
    });

    it('should set high priority for urgent requests', async () => {
      const request = {
        paymentId: 'payment_2',
        eventId: 'event_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'urgent'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'mint-tickets',
        request,
        expect.objectContaining({
          priority: 3
        })
      );
    });

    it('should configure retry logic', async () => {
      const request = {
        paymentId: 'payment_3',
        eventId: 'event_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'mint-tickets',
        request,
        expect.objectContaining({
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        })
      );
    });

    it('should configure job cleanup', async () => {
      const request = {
        paymentId: 'payment_4',
        eventId: 'event_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'mint-tickets',
        request,
        expect.objectContaining({
          removeOnComplete: true,
          removeOnFail: false
        })
      );
    });
  });

  describe('queueBatchMinting', () => {
    it('should queue batch minting requests', async () => {
      const requests = [
        {
          paymentId: 'payment_1',
          eventId: 'event_1',
          ticketIds: ['ticket_1', 'ticket_2'],
          blockchain: 'solana',
          priority: 'standard'
        },
        {
          paymentId: 'payment_2',
          eventId: 'event_1',
          ticketIds: ['ticket_3', 'ticket_4'],
          blockchain: 'solana',
          priority: 'standard'
        }
      ];

      mockQueue.add.mockResolvedValue({ id: 'batch_job_1' });

      const jobIds = await service.queueBatchMinting(requests);

      expect(jobIds).toBe('batch_job_1');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'batch-mint',
        expect.objectContaining({
          ticketIds: expect.arrayContaining(['ticket_1', 'ticket_2', 'ticket_3', 'ticket_4'])
        }),
        expect.any(Object)
      );
    });

    it('should group requests by event', async () => {
      const requests = [
        {
          paymentId: 'payment_1',
          eventId: 'event_1',
          ticketIds: ['ticket_1'],
          blockchain: 'solana',
          priority: 'standard'
        },
        {
          paymentId: 'payment_2',
          eventId: 'event_2',
          ticketIds: ['ticket_2'],
          blockchain: 'solana',
          priority: 'standard'
        }
      ];

      mockQueue.add
        .mockResolvedValueOnce({ id: 'batch_1' })
        .mockResolvedValueOnce({ id: 'batch_2' });

      const jobIds = await service.queueBatchMinting(requests);

      expect(jobIds).toBe('batch_1,batch_2');
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should handle single request in batch', async () => {
      const requests = [
        {
          paymentId: 'payment_1',
          eventId: 'event_1',
          ticketIds: ['ticket_1', 'ticket_2', 'ticket_3'],
          blockchain: 'solana',
          priority: 'standard'
        }
      ];

      mockQueue.add.mockResolvedValue({ id: 'batch_job_1' });

      await service.queueBatchMinting(requests);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should configure batch job settings', async () => {
      const requests = [
        {
          paymentId: 'payment_1',
          eventId: 'event_1',
          ticketIds: ['ticket_1'],
          blockchain: 'solana',
          priority: 'standard'
        }
      ];

      await service.queueBatchMinting(requests);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'batch-mint',
        expect.any(Object),
        expect.objectContaining({
          priority: 1,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000
          }
        })
      );
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue statistics', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getCompletedCount.mockResolvedValue(100);

      const status = await service.getQueueStatus();

      expect(status).toEqual({
        mintQueue: {
          waiting: 5,
          active: 2,
          completed: 100
        },
        batchQueue: {
          waiting: 5,
          active: 2,
          completed: 100
        }
      });
    });

    it('should handle empty queues', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getCompletedCount.mockResolvedValue(0);

      const status = await service.getQueueStatus();

      expect(status.mintQueue.waiting).toBe(0);
      expect(status.mintQueue.active).toBe(0);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      const status = await service.getJobStatus('job_123');

      expect(status).toEqual({
        jobId: 'job_123',
        status: 'completed',
        progress: 100
      });
    });
  });

  describe('Priority Management', () => {
    it('should correctly map urgent priority', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'urgent'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 3 })
      );
    });

    it('should correctly map high priority', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'high'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 2 })
      );
    });

    it('should correctly map standard priority', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 1 })
      );
    });

    it('should default to priority 0 for unknown priority', async () => {
      const request = {
        paymentId: 'payment_1',
        eventId: 'event_1',
        ticketIds: ['ticket_1'],
        blockchain: 'solana',
        priority: 'unknown'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: 0 })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle large batch requests', async () => {
      const requests = Array(100).fill(null).map((_, i) => ({
        paymentId: `payment_${i}`,
        eventId: 'event_1',
        ticketIds: [`ticket_${i}`],
        blockchain: 'solana',
        priority: 'standard'
      }));

      mockQueue.add.mockResolvedValue({ id: 'batch_large' });

      await service.queueBatchMinting(requests);

      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should handle multiple blockchains in batch', async () => {
      const requests = [
        {
          paymentId: 'payment_1',
          eventId: 'event_1',
          ticketIds: ['ticket_1'],
          blockchain: 'solana',
          priority: 'standard'
        },
        {
          paymentId: 'payment_2',
          eventId: 'event_1',
          ticketIds: ['ticket_2'],
          blockchain: 'ethereum',
          priority: 'standard'
        }
      ];

      mockQueue.add
        .mockResolvedValueOnce({ id: 'batch_1' })
        .mockResolvedValueOnce({ id: 'batch_2' });

      const jobIds = await service.queueBatchMinting(requests);

      // Should create separate batches for different blockchains
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(jobIds).toBe('batch_1,batch_2');
    });

    it('should handle empty ticket arrays', async () => {
      const request = {
        paymentId: 'payment_empty',
        eventId: 'event_1',
        ticketIds: [],
        blockchain: 'solana',
        priority: 'standard'
      };

      await service.queueMinting(request);

      expect(mockQueue.add).toHaveBeenCalled();
    });
  });
});
