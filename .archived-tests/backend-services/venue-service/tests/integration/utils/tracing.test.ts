/**
 * Tracing Utility Integration Tests
 */

import { tracer, createSpan, context } from '../../../src/utils/tracing';

describe('Tracing Utility Integration Tests', () => {
  describe('Tracer', () => {
    it('should be defined', () => {
      expect(tracer).toBeDefined();
    });

    it('should have startSpan method', () => {
      expect(typeof tracer.startSpan).toBe('function');
    });

    it('should have startActiveSpan method', () => {
      expect(typeof tracer.startActiveSpan).toBe('function');
    });
  });

  describe('createSpan', () => {
    it('should be a function', () => {
      expect(typeof createSpan).toBe('function');
    });

    it('should execute wrapped function', async () => {
      const result = await createSpan('test-span', async () => {
        return 'test-result';
      });
      
      expect(result).toBe('test-result');
    });

    it('should handle async operations', async () => {
      const result = await createSpan('async-span', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 42;
      });
      
      expect(result).toBe(42);
    });

    it('should propagate errors', async () => {
      await expect(createSpan('error-span', async () => {
        throw new Error('Span error');
      })).rejects.toThrow('Span error');
    });
  });

  describe('Context', () => {
    it('should be defined', () => {
      expect(context).toBeDefined();
    });

    it('should have active method', () => {
      expect(typeof context.active).toBe('function');
    });
  });
});
