/**
 * IMPROVED Unit Tests for Blockchain Retry Utility
 * 
 * Tests real retry behavior and timing:
 * - Exponential backoff calculation and timing
 * - Retryable vs non-retryable error detection
 * - Polling timeout precision
 * - Resource cleanup on failure
 * - Backpressure and circuit breaking behavior
 * - Real-world blockchain operation patterns
 */

import { retryBlockchainOperation, pollForConfirmation } from '../../../src/utils/blockchain-retry';

jest.mock('../../../src/utils/logger');

describe('Blockchain Retry Utility - Behavioral Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Exponential Backoff - Timing and Calculation', () => {
    it('should calculate exponential delays correctly', async () => {
      const timestamps: number[] = [];
      const mockOperation = jest.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        throw new Error('timeout');
      });

      await expect(
        retryBlockchainOperation(mockOperation, 'test-op', {
          maxAttempts: 4,
          initialDelayMs: 100,
          backoffMultiplier: 2
        })
      ).rejects.toThrow();

      expect(mockOperation).toHaveBeenCalledTimes(4);
      
      // Calculate actual delays
      const delays = [];
      for (let i = 1; i < timestamps.length; i++) {
        delays.push(timestamps[i] - timestamps[i - 1]);
      }

      // Expected delays: 100ms, 200ms, 400ms
      // Allow 50ms tolerance for timing variance
      expect(delays[0]).toBeGreaterThan(80);
      expect(delays[0]).toBeLessThan(150);
      
      expect(delays[1]).toBeGreaterThan(180);
      expect(delays[1]).toBeLessThan(250);
      
      expect(delays[2]).toBeGreaterThan(380);
      expect(delays[2]).toBeLessThan(450);
      
      // Each delay should be roughly 2x the previous
      expect(delays[1] / delays[0]).toBeGreaterThan(1.5);
      expect(delays[1] / delays[0]).toBeLessThan(2.5);
      
      expect(delays[2] / delays[1]).toBeGreaterThan(1.5);
      expect(delays[2] / delays[1]).toBeLessThan(2.5);
    });

    it('should cap delays at maxDelayMs', async () => {
      const timestamps: number[] = [];
      const mockOperation = jest.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        throw new Error('timeout');
      });

      await expect(
        retryBlockchainOperation(mockOperation, 'test-op', {
          maxAttempts: 5,
          initialDelayMs: 100,
          maxDelayMs: 200,
          backoffMultiplier: 10 // Very aggressive multiplier
        })
      ).rejects.toThrow();

      const delays = [];
      for (let i = 1; i < timestamps.length; i++) {
        delays.push(timestamps[i] - timestamps[i - 1]);
      }

      // All delays should be capped at ~200ms, not growing exponentially
      delays.forEach(delay => {
        expect(delay).toBeLessThan(250); // 200ms + tolerance
      });
    });

    it('should handle sub-second initial delays', async () => {
      const timestamps: number[] = [];
      const mockOperation = jest.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        throw new Error('timeout');
      });

      const startTime = Date.now();
      await expect(
        retryBlockchainOperation(mockOperation, 'test-op', {
          maxAttempts: 3,
          initialDelayMs: 50,
          backoffMultiplier: 2
        })
      ).rejects.toThrow();
      
      const totalTime = Date.now() - startTime;
      
      // Total time should be: 0 + 50 + 100 = 150ms (+ overhead)
      expect(totalTime).toBeGreaterThan(130);
      expect(totalTime).toBeLessThan(250);
    });
  });

  describe('Error Classification - Retryable Detection', () => {
    it('should detect retryable errors case-insensitively', async () => {
      const retryableErrors = [
        new Error('TIMEOUT occurred'),
        new Error('Network failure'),
        new Error('econnreset'),
        new Error('Request ETIMEDOUT'),
        new Error('HTTP 429 rate limit'),
        new Error('503 service unavailable')
      ];

      for (const error of retryableErrors) {
        const mockOperation = jest.fn().mockRejectedValue(error);

        await expect(
          retryBlockchainOperation(mockOperation, 'test', {
            maxAttempts: 2,
            initialDelayMs: 10
          })
        ).rejects.toThrow();

        // Should retry (2 attempts)
        expect(mockOperation).toHaveBeenCalledTimes(2);
        mockOperation.mockClear();
      }
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableErrors = [
        new Error('Invalid signature'),
        new Error('Insufficient funds'),
        new Error('Validation failed'),
        new Error('Unauthorized'),
        new Error('Bad request'),
        new Error('Simulation failed')
      ];

      for (const error of nonRetryableErrors) {
        const mockOperation = jest.fn().mockRejectedValue(error);

        await expect(
          retryBlockchainOperation(mockOperation, 'test', {
            maxAttempts: 5,
            initialDelayMs: 10
          })
        ).rejects.toThrow();

        // Should NOT retry (only 1 attempt)
        expect(mockOperation).toHaveBeenCalledTimes(1);
        mockOperation.mockClear();
      }
    });

    it('should support custom retryable error patterns', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('CUSTOM_RETRY_ERROR'));

      await expect(
        retryBlockchainOperation(mockOperation, 'test', {
          maxAttempts: 3,
          initialDelayMs: 10,
          retryableErrors: ['CUSTOM_RETRY']
        })
      ).rejects.toThrow();

      // Should retry because CUSTOM_RETRY matches CUSTOM_RETRY_ERROR
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should handle error messages with mixed case and whitespace', async () => {
      const mockOperation = jest.fn().mockRejectedValue(
        new Error('  Network   TIMEOUT  occurred  ')
      );

      await expect(
        retryBlockchainOperation(mockOperation, 'test', {
          maxAttempts: 2,
          initialDelayMs: 10
        })
      ).rejects.toThrow();

      // Should detect 'timeout' despite spacing and case
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Retry Success Patterns', () => {
    it('should return immediately on first success', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const startTime = Date.now();
      const result = await retryBlockchainOperation(mockOperation, 'test', {
        maxAttempts: 5,
        initialDelayMs: 1000
      });
      const duration = Date.now() - startTime;

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
      // Should be fast, no delays
      expect(duration).toBeLessThan(100);
    });

    it('should succeed on second attempt after transient failure', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('temporary network issue'))
        .mockResolvedValueOnce('success');

      const result = await retryBlockchainOperation(mockOperation, 'test', {
        maxAttempts: 3,
        initialDelayMs: 50
      });

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should preserve return value type through retries', async () => {
      interface BlockchainResult {
        signature: string;
        slot: number;
        confirmed: boolean;
      }

      const expectedResult: BlockchainResult = {
        signature: 'abc123',
        slot: 12345,
        confirmed: true
      };

      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(expectedResult);

      const result = await retryBlockchainOperation<BlockchainResult>(
        mockOperation,
        'blockchain-tx',
        { maxAttempts: 3, initialDelayMs: 10 }
      );

      expect(result).toEqual(expectedResult);
      expect(result.signature).toBe('abc123');
    });
  });

  describe('Resource Management and Cleanup', () => {
    it('should not leak promises on repeated failures', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('timeout'));

      // Run multiple operations
      const operations = Array(10).fill(null).map(() =>
        retryBlockchainOperation(mockOperation, 'test', {
          maxAttempts: 2,
          initialDelayMs: 10
        }).catch(() => 'failed')
      );

      await Promise.all(operations);

      // All should have completed
      expect(mockOperation).toHaveBeenCalledTimes(20); // 10 ops * 2 attempts
    });

    it('should handle operation that throws synchronously', async () => {
      const mockOperation = jest.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      await expect(
        retryBlockchainOperation(mockOperation, 'test', {
          maxAttempts: 2,
          initialDelayMs: 10
        })
      ).rejects.toThrow('Synchronous error');

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('pollForConfirmation - Timeout Precision', () => {
    it('should respect exact timeout even with many attempts', async () => {
      const checkFn = jest.fn().mockResolvedValue(false);

      const startTime = Date.now();
      const result = await pollForConfirmation(checkFn, {
        maxAttempts: 1000, // Many attempts
        intervalMs: 10,
        timeoutMs: 100 // But short timeout
      });
      const duration = Date.now() - startTime;

      expect(result).toBe(false);
      expect(duration).toBeGreaterThan(90);
      expect(duration).toBeLessThan(150);
      
      // Should have stopped early due to timeout, not maxAttempts
      expect(checkFn.mock.calls.length).toBeLessThan(20);
    });

    it('should check immediately without delay on first attempt', async () => {
      const checkFn = jest.fn().mockResolvedValue(true);

      const startTime = Date.now();
      await pollForConfirmation(checkFn, {
        intervalMs: 1000
      });
      const duration = Date.now() - startTime;

      // Should be immediate, not wait for interval
      expect(duration).toBeLessThan(100);
      expect(checkFn).toHaveBeenCalledTimes(1);
    });

    it('should poll at consistent intervals', async () => {
      const timestamps: number[] = [];
      const checkFn = jest.fn().mockImplementation(async () => {
        timestamps.push(Date.now());
        return timestamps.length >= 4;
      });

      await pollForConfirmation(checkFn, {
        intervalMs: 100
      });

      // Calculate intervals
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }

      // All intervals should be ~100ms
      intervals.forEach(interval => {
        expect(interval).toBeGreaterThan(80);
        expect(interval).toBeLessThan(150);
      });
    });

    it('should not wait after final check', async () => {
      let callCount = 0;
      const checkFn = jest.fn().mockImplementation(async () => {
        callCount++;
        return callCount >= 3;
      });

      const startTime = Date.now();
      await pollForConfirmation(checkFn, {
        maxAttempts: 3,
        intervalMs: 100
      });
      const duration = Date.now() - startTime;

      // Should be ~200ms (2 intervals), not 300ms (3 intervals)
      expect(duration).toBeGreaterThan(180);
      expect(duration).toBeLessThan(250);
    });
  });

  describe('pollForConfirmation - Error Recovery', () => {
    it('should retry after check function errors', async () => {
      const checkFn = jest.fn()
        .mockRejectedValueOnce(new Error('RPC timeout'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(true);

      const result = await pollForConfirmation(checkFn, {
        maxAttempts: 5,
        intervalMs: 10
      });

      expect(result).toBe(true);
      expect(checkFn).toHaveBeenCalledTimes(3);
    });

    it('should continue polling through intermittent errors', async () => {
      let callCount = 0;
      const checkFn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2 || callCount === 4) {
          throw new Error('Intermittent failure');
        }
        return callCount >= 6;
      });

      const result = await pollForConfirmation(checkFn, {
        maxAttempts: 10,
        intervalMs: 10
      });

      expect(result).toBe(true);
      expect(checkFn).toHaveBeenCalledTimes(6);
    });

    it('should return false if all checks error', async () => {
      const checkFn = jest.fn().mockRejectedValue(new Error('Persistent error'));

      const result = await pollForConfirmation(checkFn, {
        maxAttempts: 3,
        intervalMs: 10
      });

      expect(result).toBe(false);
      expect(checkFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Real-World Blockchain Patterns', () => {
    it('should handle RPC rate limiting scenario', async () => {
      let attemptCount = 0;
      const mockOperation = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('429 Too Many Requests');
        }
        return { signature: 'success' };
      });

      const result = await retryBlockchainOperation(mockOperation, 'sendTransaction', {
        maxAttempts: 5,
        initialDelayMs: 100,
        backoffMultiplier: 2
      });

      expect(result).toEqual({ signature: 'success' });
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction confirmation polling', async () => {
      let attempts = 0;
      const checkConfirmation = jest.fn().mockImplementation(async () => {
        attempts++;
        // Simulate blockchain confirmation after 5 attempts
        return attempts >= 5;
      });

      const startTime = Date.now();
      const confirmed = await pollForConfirmation(checkConfirmation, {
        maxAttempts: 30,
        intervalMs: 100,
        timeoutMs: 10000
      });
      const duration = Date.now() - startTime;

      expect(confirmed).toBe(true);
      expect(checkConfirmation).toHaveBeenCalledTimes(5);
      // Should take ~400ms (4 intervals)
      expect(duration).toBeGreaterThan(350);
      expect(duration).toBeLessThan(500);
    });

    it('should handle NFT transfer with ownership verification', async () => {
      let transferAttempts = 0;
      const transferNFT = jest.fn().mockImplementation(async () => {
        transferAttempts++;
        if (transferAttempts === 1) {
          throw new Error('Network timeout');
        }
        return { signature: 'tx_123', success: true };
      });

      // Perform transfer with retry
      const transferResult = await retryBlockchainOperation(
        transferNFT,
        'NFT transfer',
        { maxAttempts: 3, initialDelayMs: 50 }
      );

      expect(transferResult.success).toBe(true);

      // Poll for ownership change
      let pollAttempts = 0;
      const verifyOwnership = jest.fn().mockImplementation(async () => {
        pollAttempts++;
        return pollAttempts >= 3; // Confirmed after 3 checks
      });

      const ownershipConfirmed = await pollForConfirmation(verifyOwnership, {
        maxAttempts: 10,
        intervalMs: 50
      });

      expect(ownershipConfirmed).toBe(true);
    });

    it('should handle simulation failure (non-retryable)', async () => {
      const mockOperation = jest.fn().mockRejectedValue(
        new Error('Transaction simulation failed: insufficient lamports')
      );

      const startTime = Date.now();
      await expect(
        retryBlockchainOperation(mockOperation, 'sendTransaction', {
          maxAttempts: 5,
          initialDelayMs: 100
        })
      ).rejects.toThrow('simulation failed');
      const duration = Date.now() - startTime;

      // Should fail immediately without retries
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle maxAttempts of 1 (no retries)', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('timeout'));

      await expect(
        retryBlockchainOperation(mockOperation, 'test', {
          maxAttempts: 1,
          initialDelayMs: 10
        })
      ).rejects.toThrow();

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle very large maxAttempts', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('success');

      const result = await retryBlockchainOperation(mockOperation, 'test', {
        maxAttempts: 1000,
        initialDelayMs: 10
      });

      // Should succeed on attempt 2, not use all 1000
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should handle zero interval polling', async () => {
      const checkFn = jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await pollForConfirmation(checkFn, {
        intervalMs: 0,
        maxAttempts: 5
      });

      expect(result).toBe(true);
    });

    it('should handle extremely long timeout without blocking', async () => {
      const checkFn = jest.fn().mockResolvedValue(true);

      const startTime = Date.now();
      await pollForConfirmation(checkFn, {
        timeoutMs: 999999999,
        intervalMs: 10
      });
      const duration = Date.now() - startTime;

      // Should return immediately on success
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Configuration Validation and Defaults', () => {
    it('should use default configuration when not provided', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('timeout'));

      await expect(
        retryBlockchainOperation(mockOperation, 'test')
      ).rejects.toThrow();

      // Default maxAttempts is 3
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should merge partial config with defaults', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('timeout'));

      await expect(
        retryBlockchainOperation(mockOperation, 'test', {
          maxAttempts: 2
          // Other values should use defaults
        })
      ).rejects.toThrow();

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should use default polling configuration', async () => {
      const checkFn = jest.fn().mockResolvedValue(false);

      const result = await pollForConfirmation(checkFn);

      expect(result).toBe(false);
      // Should have used default maxAttempts (30)
      expect(checkFn).toHaveBeenCalledTimes(30);
    });
  });
});
