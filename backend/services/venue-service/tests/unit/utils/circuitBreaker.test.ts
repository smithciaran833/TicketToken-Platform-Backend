import { createCircuitBreaker, withCircuitBreaker } from '../../../src/utils/circuitBreaker';
import CircuitBreaker from 'opossum';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Circuit Breaker Utils', () => {
  describe('createCircuitBreaker', () => {
    it('should create a CircuitBreaker instance', () => {
      const fn = jest.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(fn);

      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('should execute function through breaker', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(fn);

      const result = await breaker.fire();

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should handle function errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Test error'));
      const breaker = createCircuitBreaker(fn);

      await expect(breaker.fire()).rejects.toThrow('Test error');
    });

    it('should set custom name', () => {
      const fn = jest.fn();
      const breaker = createCircuitBreaker(fn, { name: 'test-breaker' });

      expect(breaker.name).toBe('test-breaker');
    });
  });

  describe('withCircuitBreaker', () => {
    it('should wrap function', async () => {
      const fn = jest.fn().mockResolvedValue('wrapped');
      const wrapped = withCircuitBreaker(fn);

      const result = await wrapped();

      expect(result).toBe('wrapped');
      expect(fn).toHaveBeenCalled();
    });

    it('should pass arguments', async () => {
      const fn = jest.fn((a: number, b: number) => Promise.resolve(a + b));
      const wrapped = withCircuitBreaker(fn);

      const result = await wrapped(5, 10);

      expect(result).toBe(15);
      expect(fn).toHaveBeenCalledWith(5, 10);
    });

    it('should handle errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Wrapped error'));
      const wrapped = withCircuitBreaker(fn);

      await expect(wrapped()).rejects.toThrow('Wrapped error');
    });
  });

  describe('Circuit Breaker timeout', () => {
    it('should timeout slow functions', async () => {
      const slowFn = jest.fn(() => new Promise(resolve => setTimeout(resolve, 5000)));
      const breaker = createCircuitBreaker(slowFn, { timeout: 100 });

      await expect(breaker.fire()).rejects.toThrow();
    });
  });
});
