// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { MoneyQueue } from '../../../src/queues/definitions/money.queue';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { PaymentProcessor } from '../../../src/workers/money/payment.processor';
import { RefundProcessor } from '../../../src/workers/money/refund.processor';
import { NFTMintProcessor } from '../../../src/workers/money/nft-mint.processor';
import { JOB_TYPES } from '../../../src/config/constants';
import { QUEUE_CONFIGS } from '../../../src/config/queues.config';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/queues/factories/queue.factory');
jest.mock('../../../src/workers/money/payment.processor');
jest.mock('../../../src/workers/money/refund.processor');
jest.mock('../../../src/workers/money/nft-mint.processor');
jest.mock('../../../src/config/constants', () => ({
  JOB_TYPES: {
    PAYMENT_PROCESS: 'payment:process',
    REFUND_PROCESS: 'refund:process',
    NFT_MINT: 'nft:mint',
  },
}));
jest.mock('../../../src/config/queues.config', () => ({
  QUEUE_CONFIGS: {
    MONEY_QUEUE: {
      retryLimit: 3,
      retryDelay: 5000,
      retryBackoff: true,
      expireInSeconds: 3600,
    },
  },
}));

describe('MoneyQueue', () => {
  let mockBoss: any;
  let mockPaymentProcessor: any;
  let mockRefundProcessor: any;
  let mockNftMintProcessor: any;
  let moneyQueue: MoneyQueue;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBoss = {
      work: jest.fn(),
      send: jest.fn(),
    };

    mockPaymentProcessor = { process: jest.fn() };
    mockRefundProcessor = { process: jest.fn() };
    mockNftMintProcessor = { process: jest.fn() };

    (QueueFactory.getBoss as jest.Mock).mockReturnValue(mockBoss);
    (PaymentProcessor as jest.Mock).mockImplementation(() => mockPaymentProcessor);
    (RefundProcessor as jest.Mock).mockImplementation(() => mockRefundProcessor);
    (NFTMintProcessor as jest.Mock).mockImplementation(() => mockNftMintProcessor);
  });

  describe('constructor', () => {
    it('should get boss instance from QueueFactory', () => {
      moneyQueue = new MoneyQueue();
      
      expect(QueueFactory.getBoss).toHaveBeenCalledTimes(1);
    });

    it('should instantiate PaymentProcessor', () => {
      moneyQueue = new MoneyQueue();
      
      expect(PaymentProcessor).toHaveBeenCalledTimes(1);
    });

    it('should instantiate RefundProcessor', () => {
      moneyQueue = new MoneyQueue();
      
      expect(RefundProcessor).toHaveBeenCalledTimes(1);
    });

    it('should instantiate NFTMintProcessor', () => {
      moneyQueue = new MoneyQueue();
      
      expect(NFTMintProcessor).toHaveBeenCalledTimes(1);
    });

    it('should call setupProcessors on initialization', () => {
      moneyQueue = new MoneyQueue();
      
      expect(mockBoss.work).toHaveBeenCalledTimes(3);
    });
  });

  describe('setupProcessors', () => {
    beforeEach(() => {
      moneyQueue = new MoneyQueue();
    });

    it('should register payment processor with correct job type', () => {
      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_TYPES.PAYMENT_PROCESS,
        expect.any(Function)
      );
    });

    it('should register refund processor with correct job type', () => {
      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_TYPES.REFUND_PROCESS,
        expect.any(Function)
      );
    });

    it('should register nft mint processor with correct job type', () => {
      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_TYPES.NFT_MINT,
        expect.any(Function)
      );
    });

    it('should log initialization message', () => {
      expect(logger.info).toHaveBeenCalledWith('Money queue processors initialized (payment, refund, nft)');
    });

    describe('payment worker callback', () => {
      let paymentCallback: Function;

      beforeEach(() => {
        const paymentCall = mockBoss.work.mock.calls.find(
          (call: any[]) => call[0] === JOB_TYPES.PAYMENT_PROCESS
        );
        paymentCallback = paymentCall[1];
      });

      it('should call paymentProcessor.process with job data', async () => {
        const mockJob = { data: { orderId: 'order-123', amount: 9999 } };
        mockPaymentProcessor.process.mockResolvedValue({ success: true });

        await paymentCallback(mockJob);

        expect(mockPaymentProcessor.process).toHaveBeenCalledWith({
          data: mockJob.data,
        });
      });

      it('should return processor result on success', async () => {
        const mockJob = { data: { orderId: 'order-456' } };
        const expectedResult = { success: true, transactionId: 'txn-123' };
        mockPaymentProcessor.process.mockResolvedValue(expectedResult);

        const result = await paymentCallback(mockJob);

        expect(result).toEqual(expectedResult);
      });

      it('should log and rethrow error when processor fails', async () => {
        const mockJob = { data: { orderId: 'fail-order' } };
        const mockError = new Error('Payment gateway timeout');
        mockPaymentProcessor.process.mockRejectedValue(mockError);

        await expect(paymentCallback(mockJob)).rejects.toThrow('Payment gateway timeout');
        expect(logger.error).toHaveBeenCalledWith('Payment job failed:', mockError);
      });
    });

    describe('refund worker callback', () => {
      let refundCallback: Function;

      beforeEach(() => {
        const refundCall = mockBoss.work.mock.calls.find(
          (call: any[]) => call[0] === JOB_TYPES.REFUND_PROCESS
        );
        refundCallback = refundCall[1];
      });

      it('should call refundProcessor.process with job data', async () => {
        const mockJob = { data: { orderId: 'order-789', refundAmount: 5000 } };
        mockRefundProcessor.process.mockResolvedValue({ success: true });

        await refundCallback(mockJob);

        expect(mockRefundProcessor.process).toHaveBeenCalledWith({
          data: mockJob.data,
        });
      });

      it('should return processor result on success', async () => {
        const mockJob = { data: { orderId: 'refund-order' } };
        const expectedResult = { success: true, refundId: 'ref-456' };
        mockRefundProcessor.process.mockResolvedValue(expectedResult);

        const result = await refundCallback(mockJob);

        expect(result).toEqual(expectedResult);
      });

      it('should log and rethrow error when processor fails', async () => {
        const mockJob = { data: { orderId: 'fail-refund' } };
        const mockError = new Error('Insufficient balance for refund');
        mockRefundProcessor.process.mockRejectedValue(mockError);

        await expect(refundCallback(mockJob)).rejects.toThrow('Insufficient balance for refund');
        expect(logger.error).toHaveBeenCalledWith('Refund job failed:', mockError);
      });
    });

    describe('nft mint worker callback', () => {
      let nftMintCallback: Function;

      beforeEach(() => {
        const nftCall = mockBoss.work.mock.calls.find(
          (call: any[]) => call[0] === JOB_TYPES.NFT_MINT
        );
        nftMintCallback = nftCall[1];
      });

      it('should call nftMintProcessor.process with job data', async () => {
        const mockJob = { data: { ticketId: 'ticket-123', walletAddress: '0xabc' } };
        mockNftMintProcessor.process.mockResolvedValue({ success: true });

        await nftMintCallback(mockJob);

        expect(mockNftMintProcessor.process).toHaveBeenCalledWith({
          data: mockJob.data,
        });
      });

      it('should return processor result on success', async () => {
        const mockJob = { data: { ticketId: 'ticket-456' } };
        const expectedResult = { success: true, mintAddress: 'nft-mint-address' };
        mockNftMintProcessor.process.mockResolvedValue(expectedResult);

        const result = await nftMintCallback(mockJob);

        expect(result).toEqual(expectedResult);
      });

      it('should log and rethrow error when processor fails', async () => {
        const mockJob = { data: { ticketId: 'fail-ticket' } };
        const mockError = new Error('Solana network congestion');
        mockNftMintProcessor.process.mockRejectedValue(mockError);

        await expect(nftMintCallback(mockJob)).rejects.toThrow('Solana network congestion');
        expect(logger.error).toHaveBeenCalledWith('NFT mint job failed:', mockError);
      });
    });
  });

  describe('addJob', () => {
    beforeEach(() => {
      moneyQueue = new MoneyQueue();
    });

    it('should send job to boss with correct job type and data', async () => {
      const jobType = 'payment:process';
      const jobData = { orderId: 'order-123', amount: 15000 };
      mockBoss.send.mockResolvedValue('job-123');

      await moneyQueue.addJob(jobType, jobData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        expect.any(Object)
      );
    });

    it('should merge default config with custom options', async () => {
      const jobType = 'payment:process';
      const jobData = { orderId: 'order-456' };
      const customOptions = { priority: 1, retryLimit: 5 };
      mockBoss.send.mockResolvedValue('job-456');

      await moneyQueue.addJob(jobType, jobData, customOptions);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        {
          retryLimit: 5,
          retryDelay: QUEUE_CONFIGS.MONEY_QUEUE.retryDelay,
          retryBackoff: QUEUE_CONFIGS.MONEY_QUEUE.retryBackoff,
          expireInSeconds: QUEUE_CONFIGS.MONEY_QUEUE.expireInSeconds,
          priority: 1,
        }
      );
    });

    it('should use default config when no options provided', async () => {
      const jobType = 'refund:process';
      const jobData = { orderId: 'refund-123' };
      mockBoss.send.mockResolvedValue('job-789');

      await moneyQueue.addJob(jobType, jobData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        jobType,
        jobData,
        {
          retryLimit: QUEUE_CONFIGS.MONEY_QUEUE.retryLimit,
          retryDelay: QUEUE_CONFIGS.MONEY_QUEUE.retryDelay,
          retryBackoff: QUEUE_CONFIGS.MONEY_QUEUE.retryBackoff,
          expireInSeconds: QUEUE_CONFIGS.MONEY_QUEUE.expireInSeconds,
        }
      );
    });

    it('should return job ID on success', async () => {
      const expectedJobId = 'money-job-uuid-123';
      mockBoss.send.mockResolvedValue(expectedJobId);

      const result = await moneyQueue.addJob('nft:mint', { ticketId: 'ticket-1' });

      expect(result).toBe(expectedJobId);
    });

    it('should return null when boss.send returns null', async () => {
      mockBoss.send.mockResolvedValue(null);

      const result = await moneyQueue.addJob('payment:process', {});

      expect(result).toBeNull();
    });

    it('should log success message with job type and ID', async () => {
      mockBoss.send.mockResolvedValue('logged-money-job');

      await moneyQueue.addJob('payment:process', { amount: 1000 });

      expect(logger.info).toHaveBeenCalled();
    });

    it('should log error and rethrow when send fails', async () => {
      const mockError = new Error('Database connection failed');
      mockBoss.send.mockRejectedValue(mockError);

      await expect(
        moneyQueue.addJob('payment:process', {})
      ).rejects.toThrow('Database connection failed');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should not catch and swallow errors', async () => {
      const customError = new Error('Unexpected money queue error');
      mockBoss.send.mockRejectedValue(customError);

      await expect(moneyQueue.addJob('refund:process', {})).rejects.toThrow(customError);
    });

    it('should handle payment jobs with high priority', async () => {
      const paymentData = { orderId: 'vip-order', amount: 100000 };
      mockBoss.send.mockResolvedValue('vip-job-id');

      await moneyQueue.addJob('payment:process', paymentData, { priority: 1 });

      expect(mockBoss.send).toHaveBeenCalledWith(
        'payment:process',
        paymentData,
        expect.objectContaining({ priority: 1 })
      );
    });

    it('should handle nft mint jobs', async () => {
      const mintData = { ticketId: 'ticket-xyz', walletAddress: 'sol123' };
      mockBoss.send.mockResolvedValue('mint-job-id');

      await moneyQueue.addJob('nft:mint', mintData);

      expect(mockBoss.send).toHaveBeenCalledWith(
        'nft:mint',
        mintData,
        expect.any(Object)
      );
    });
  });

  describe('getBoss', () => {
    it('should return the PgBoss instance', () => {
      moneyQueue = new MoneyQueue();

      const result = moneyQueue.getBoss();

      expect(result).toBe(mockBoss);
    });

    it('should return the same instance on multiple calls', () => {
      moneyQueue = new MoneyQueue();

      const result1 = moneyQueue.getBoss();
      const result2 = moneyQueue.getBoss();

      expect(result1).toBe(result2);
    });
  });
});
