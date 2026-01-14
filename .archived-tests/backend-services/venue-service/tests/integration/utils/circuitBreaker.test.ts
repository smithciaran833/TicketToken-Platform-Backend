/**
 * Circuit Breaker Integration Tests
 */

import { createCircuitBreaker, withCircuitBreaker } from '../../../src/utils/circuitBreaker';

describe('Circuit Breaker Integration Tests', () => {
  describe('createCircuitBreaker', () => {
    it('should create a circuit breaker instance', () => {
      const fn = async () => 'success';
      const breaker = createCircuitBreaker(fn, { name: 'test-breaker' });
      
      expect(breaker).toBeDefined();
      expect(typeof breaker.fire).toBe('function');
    });

    it('should execute function successfully through breaker', async () => {
      const fn = async (x: number) => x * 2;
      const breaker = createCircuitBreaker(fn, { name: 'multiply-breaker' });
      
      const result = await breaker.fire(5);
      expect(result).toBe(10);
    });

    it('should handle async function errors', async () => {
      const fn = async () => { throw new Error('Test error'); };
      const breaker = createCircuitBreaker(fn, { name: 'error-breaker' });
      
      await expect(breaker.fire()).rejects.toThrow('Test error');
    });

    it('should use custom options', () => {
      const fn = async () => 'test';
      const breaker = createCircuitBreaker(fn, {
        name: 'custom-breaker',
        timeout: 5000,
        errorThresholdPercentage: 60,
        resetTimeout: 60000
      });
      
      expect(breaker).toBeDefined();
    });
  });

  describe('withCircuitBreaker', () => {
    it('should wrap function with circuit breaker', async () => {
      const fn = async (a: number, b: number) => a + b;
      const wrapped = withCircuitBreaker(fn, { name: 'add-breaker' });
      
      const result = await wrapped(3, 4);
      expect(result).toBe(7);
    });

    it('should preserve function behavior', async () => {
      const fn = async (str: string) => str.toUpperCase();
      const wrapped = withCircuitBreaker(fn, { name: 'upper-breaker' });
      
      const result = await wrapped('hello');
      expect(result).toBe('HELLO');
    });
  });
});
