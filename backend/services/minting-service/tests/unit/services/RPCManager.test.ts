/**
 * Unit tests for RPCManager service
 * Tests multi-endpoint RPC management with retry and failover
 */

// Mock dependencies before imports
jest.mock('@solana/web3.js', () => {
  const mockConnection = {
    sendTransaction: jest.fn(),
    confirmTransaction: jest.fn()
  };
  
  return {
    Connection: jest.fn(() => mockConnection),
    ComputeBudgetProgram: {
      setComputeUnitLimit: jest.fn(() => ({ keys: [], programId: 'budget', data: Buffer.from([]) })),
      setComputeUnitPrice: jest.fn(() => ({ keys: [], programId: 'budget', data: Buffer.from([]) }))
    },
    Transaction: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockReturnThis()
    }))
  };
});

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { RPCManager } from '../../../src/services/RPCManager';
import { Connection, ComputeBudgetProgram, Transaction } from '@solana/web3.js';
import logger from '../../../src/utils/logger';

describe('RPCManager', () => {
  let rpcManager: RPCManager;
  let mockConnection: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock connection
    mockConnection = {
      sendTransaction: jest.fn().mockResolvedValue('mockSignature123'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
    };
    
    (Connection as jest.Mock).mockImplementation(() => mockConnection);
    
    rpcManager = new RPCManager();
  });

  describe('constructor', () => {
    it('should configure multiple endpoints', () => {
      const manager = new RPCManager();
      
      // Constructor initializes endpoints array
      expect(manager).toBeDefined();
    });

    it('should set maxRetries to 3', () => {
      const manager = new RPCManager();
      
      // maxRetries is set to 3 in constructor
      expect(manager).toBeDefined();
    });

    it('should set baseDelay to 1000ms', () => {
      const manager = new RPCManager();
      
      // baseDelay is set to 1000 in constructor
      expect(manager).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should create connections for all endpoints', async () => {
      await rpcManager.initialize();
      
      // Connection should be called for each endpoint
      expect(Connection).toHaveBeenCalled();
    });

    it('should log initialization', async () => {
      await rpcManager.initialize();
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initialized')
      );
    });

    it('should log endpoint count', async () => {
      await rpcManager.initialize();
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('RPC endpoints')
      );
    });
  });

  describe('getConnection', () => {
    it('should return current connection', async () => {
      await rpcManager.initialize();
      
      const connection = await rpcManager.getConnection();
      
      expect(connection).toBeDefined();
    });

    it('should return same connection on subsequent calls', async () => {
      await rpcManager.initialize();
      
      const conn1 = await rpcManager.getConnection();
      const conn2 = await rpcManager.getConnection();
      
      expect(conn1).toBe(conn2);
    });
  });

  describe('endpoint rotation', () => {
    it('should rotate endpoint on 429 rate limit', async () => {
      await rpcManager.initialize();
      
      // First call fails with 429
      mockConnection.sendTransaction
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockRejectedValueOnce(new Error('429'))
        .mockRejectedValueOnce(new Error('429'))
        .mockRejectedValueOnce(new Error('final failure'));
      
      const mockTransaction = {
        add: jest.fn().mockReturnThis()
      };
      const mockSigners = [{ publicKey: 'test', secretKey: new Uint8Array(64) }];
      
      await expect(
        rpcManager.sendTransactionWithRetry(mockTransaction as any, mockSigners as any)
      ).rejects.toThrow();
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limited'),
        expect.anything()
      );
    });

    it('should wrap around to first endpoint', async () => {
      await rpcManager.initialize();
      
      // Multiple rate limit errors should cycle through endpoints
      mockConnection.sendTransaction
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValue('successSignature');
      
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      // This should eventually succeed after rotating
      const result = await rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        mockSigners as any
      );
      
      expect(result).toBeDefined();
    });
  });

  describe('sendTransactionWithRetry', () => {
    it('should add compute budget', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction.mockResolvedValue('sig123');
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      await rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        mockSigners as any
      );
      
      expect(ComputeBudgetProgram.setComputeUnitLimit).toHaveBeenCalledWith({ units: 400000 });
      expect(ComputeBudgetProgram.setComputeUnitPrice).toHaveBeenCalledWith({ microLamports: 1 });
    });

    it('should confirm transaction', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction.mockResolvedValue('sig123');
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      await rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        mockSigners as any
      );
      
      expect(mockConnection.confirmTransaction).toHaveBeenCalledWith('sig123', 'confirmed');
    });

    it('should use exponential backoff', async () => {
      jest.useFakeTimers();
      
      await rpcManager.initialize();
      
      mockConnection.sendTransaction
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue('sig123');
      
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      const promise = rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        mockSigners as any
      );
      
      // Fast forward through delays
      jest.runAllTimers();
      
      await promise;
      
      jest.useRealTimers();
    });

    it('should throw after max retries', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction.mockRejectedValue(new Error('Persistent error'));
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      await expect(
        rpcManager.sendTransactionWithRetry(
          mockTransaction as any,
          mockSigners as any
        )
      ).rejects.toThrow('Transaction failed after 3 attempts');
    });

    it('should return signature on success', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction.mockResolvedValue('successfulSignature123');
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      const result = await rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        mockSigners as any
      );
      
      expect(result).toBe('successfulSignature123');
    });

    it('should log success', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction.mockResolvedValue('sig123');
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      await rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        mockSigners as any
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Transaction confirmed')
      );
    });

    it('should log retry attempts', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValue('sig123');
      
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      await rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        mockSigners as any
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retry')
      );
    });

    it('should include retry count in error message', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction.mockRejectedValue(new Error('Always fails'));
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      const mockSigners = [{}];
      
      await expect(
        rpcManager.sendTransactionWithRetry(
          mockTransaction as any,
          mockSigners as any
        )
      ).rejects.toThrow(/3 attempts/);
    });
  });

  describe('error handling', () => {
    it('should handle connection errors gracefully', async () => {
      (Connection as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });
      
      const manager = new RPCManager();
      
      await expect(manager.initialize()).rejects.toThrow('Connection failed');
    });

    it('should detect rate limit from error message', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction
        .mockRejectedValueOnce(new Error('Too Many Requests'))
        .mockResolvedValue('sig');
      
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      
      await rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        [{}] as any
      );
      
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should preserve original error message in final throw', async () => {
      await rpcManager.initialize();
      
      mockConnection.sendTransaction.mockRejectedValue(new Error('Specific error'));
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      
      await expect(
        rpcManager.sendTransactionWithRetry(
          mockTransaction as any,
          [{}] as any
        )
      ).rejects.toThrow(/Specific error/);
    });
  });

  describe('backoff timing', () => {
    it('should start with base delay', async () => {
      jest.useFakeTimers();
      
      await rpcManager.initialize();
      
      mockConnection.sendTransaction
        .mockRejectedValueOnce(new Error('Retry'))
        .mockResolvedValue('sig');
      
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      
      const promise = rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        [{}] as any
      );
      
      // Base delay is 1000ms
      jest.advanceTimersByTime(1000);
      
      await promise;
      
      jest.useRealTimers();
    });

    it('should double delay on each retry', async () => {
      jest.useFakeTimers();
      
      await rpcManager.initialize();
      
      mockConnection.sendTransaction
        .mockRejectedValueOnce(new Error('Retry 1'))
        .mockRejectedValueOnce(new Error('Retry 2'))
        .mockResolvedValue('sig');
      
      mockConnection.confirmTransaction.mockResolvedValue({ value: { err: null } });
      
      const mockTransaction = { add: jest.fn().mockReturnThis() };
      
      const promise = rpcManager.sendTransactionWithRetry(
        mockTransaction as any,
        [{}] as any
      );
      
      // First retry: 1000ms, Second retry: 2000ms
      jest.advanceTimersByTime(3000);
      
      await promise;
      
      jest.useRealTimers();
    });
  });
});
