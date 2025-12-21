/**
 * Retry Utility Integration Tests
 */

import { withRetry } from '../../../src/utils/retry';

describe('Retry Utility Integration Tests', () => {
  describe('withRetry', () => {
    it('should return result on success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('First fail'))
        .mockResolvedValueOnce('success');
      
      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(withRetry(fn, { maxAttempts: 3, initialDelay: 10 }))
        .rejects.toThrow('Always fails');
      
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx errors', async () => {
      const error: any = new Error('Bad request');
      error.response = { status: 400 };
      const fn = jest.fn().mockRejectedValue(error);
      
      await expect(withRetry(fn, { maxAttempts: 3, initialDelay: 10 }))
        .rejects.toThrow('Bad request');
      
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx errors', async () => {
      const error: any = new Error('Server error');
      error.response = { status: 500 };
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('recovered');
      
      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 });
      
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on connection refused', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('connected');
      
      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 });
      
      expect(result).toBe('connected');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');
      
      await withRetry(fn, { maxAttempts: 3, initialDelay: 10, onRetry });
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should use custom shouldRetry function', async () => {
      const shouldRetry = jest.fn().mockReturnValue(false);
      const fn = jest.fn().mockRejectedValue(new Error('Custom error'));
      
      await expect(withRetry(fn, { maxAttempts: 3, initialDelay: 10, shouldRetry }))
        .rejects.toThrow('Custom error');
      
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalled();
    });

    it('should respect maxDelay option', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const start = Date.now();
      await withRetry(fn, { 
        maxAttempts: 3, 
        initialDelay: 100,
        maxDelay: 150,
        factor: 10 // Would normally make delay very large
      });
      const elapsed = Date.now() - start;
      
      // Should be less than if maxDelay wasn't applied
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
