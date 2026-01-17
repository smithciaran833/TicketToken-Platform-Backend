import { RetryService } from '../../../src/services/retry.service';

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('RetryService', () => {
  let retryService: RetryService;
  let mockFn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    retryService = new RetryService();
    mockFn = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('executeWithRetry', () => {
    it('returns result on first successful attempt', async () => {
      mockFn.mockResolvedValue('success');

      const result = await retryService.executeWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error and eventually succeeds', async () => {
      mockFn
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValue('success');

      const promise = retryService.executeWithRetry(mockFn, { maxRetries: 3 });

      // Fast-forward through all timers
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('throws error after exhausting all retries', async () => {
      const error = { code: 'ETIMEDOUT', message: 'Timeout' };
      mockFn.mockRejectedValue(error);

      const promise = retryService.executeWithRetry(mockFn, { maxRetries: 3 }).catch(e => e);

      // Fast-forward through all timers
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toEqual(error);
      // maxRetries=3 means 3 attempts total
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('does not retry on 4xx client errors', async () => {
      const error = { response: { status: 400 }, message: 'Bad Request' };
      mockFn.mockRejectedValue(error);

      await expect(
        retryService.executeWithRetry(mockFn, { maxRetries: 3 })
      ).rejects.toEqual(error);

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('retries on 5xx server errors', async () => {
      mockFn
        .mockRejectedValueOnce({ response: { status: 500 } })
        .mockResolvedValue('success');

      const promise = retryService.executeWithRetry(mockFn, { maxRetries: 3 });

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('uses custom maxRetries option', async () => {
      mockFn.mockRejectedValue({ code: 'ETIMEDOUT' });

      const promise = retryService.executeWithRetry(mockFn, { maxRetries: 5 }).catch(e => e);

      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result).toMatchObject({ code: 'ETIMEDOUT' });
      // maxRetries=5 means 5 attempts total
      expect(mockFn).toHaveBeenCalledTimes(5);
    });

    it('uses custom retryable errors', async () => {
      const customError = { code: 'CUSTOM_ERROR' };
      mockFn
        .mockRejectedValueOnce(customError)
        .mockResolvedValue('success');

      const promise = retryService.executeWithRetry(mockFn, {
        maxRetries: 3,
        retryableErrors: ['CUSTOM_ERROR'],
      });

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('does not retry on non-retryable custom errors', async () => {
      const error = { code: 'NON_RETRYABLE' };
      mockFn.mockRejectedValue(error);

      await expect(
        retryService.executeWithRetry(mockFn, {
          maxRetries: 3,
          retryableErrors: ['CUSTOM_ERROR'],
        })
      ).rejects.toEqual(error);

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('retries on timeout message in error', async () => {
      mockFn
        .mockRejectedValueOnce({ message: 'Request timeout exceeded' })
        .mockResolvedValue('success');

      const promise = retryService.executeWithRetry(mockFn);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
    });

    it('applies exponential backoff between retries', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      global.setTimeout = jest.fn((callback: any, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(callback, delay);
      }) as any;

      mockFn
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValue('success');

      const promise = retryService.executeWithRetry(mockFn, {
        maxRetries: 4,
        baseDelay: 1000,
        multiplier: 2,
        jitter: false,
      });

      await jest.runAllTimersAsync();
      await promise;

      // Delays use formula: baseDelay * multiplier^(attempt-1)
      // First retry (attempt=1): 1000 * 2^0 = 1000
      // Second retry (attempt=2): 1000 * 2^1 = 2000
      // Third retry (attempt=3): 1000 * 2^2 = 4000
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);

      global.setTimeout = originalSetTimeout;
    });

    it('respects maxDelay cap', async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      global.setTimeout = jest.fn((callback: any, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(callback, delay);
      }) as any;

      mockFn
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValue('success');

      const promise = retryService.executeWithRetry(mockFn, {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 1500,
        multiplier: 10,
        jitter: false,
      });

      await jest.runAllTimersAsync();
      await promise;

      // First retry (attempt=1): 1000 * 10^0 = 1000 (not capped)
      // Second retry (attempt=2): 1000 * 10^1 = 10000 (capped to 1500)
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(1500);

      global.setTimeout = originalSetTimeout;
    });

    it('applies jitter to delay', async () => {
      jest.useRealTimers();

      const delays: number[] = [];
      const sleep = retryService['sleep'].bind(retryService);

      // Mock the sleep method to capture delays
      retryService['sleep'] = jest.fn((ms: number) => {
        delays.push(ms);
        return sleep(ms);
      });

      mockFn
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValue('success');

      await retryService.executeWithRetry(mockFn, {
        maxRetries: 2,
        baseDelay: 1000,
        jitter: true,
      });

      // With jitter, delay should be within 10% of base (900-1100)
      expect(delays[0]).toBeGreaterThanOrEqual(900);
      expect(delays[0]).toBeLessThanOrEqual(1100);

      jest.useFakeTimers();
    });

    it('handles errors without code or response', async () => {
      const error = new Error('Generic error');
      mockFn.mockRejectedValue(error);

      await expect(
        retryService.executeWithRetry(mockFn, { maxRetries: 2 })
      ).rejects.toEqual(error);

      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getServiceRetryConfig', () => {
    it('returns NFT service config', () => {
      const config = retryService.getServiceRetryConfig('nft-service');

      expect(config).toEqual({
        maxRetries: 5,
        baseDelay: 5000,
        maxDelay: 600000,
        multiplier: 2.5,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'GAS_PRICE_HIGH'],
      });
    });

    it('returns payment service config', () => {
      const config = retryService.getServiceRetryConfig('payment-service');

      expect(config).toEqual({
        maxRetries: 3,
        baseDelay: 2000,
        maxDelay: 60000,
        multiplier: 2,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'GATEWAY_TIMEOUT'],
      });
    });

    it('returns ticket service config', () => {
      const config = retryService.getServiceRetryConfig('ticket-service');

      expect(config).toEqual({
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        multiplier: 2,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
      });
    });

    it('returns empty config for unknown service', () => {
      const config = retryService.getServiceRetryConfig('unknown-service');

      expect(config).toEqual({});
    });
  });
});
