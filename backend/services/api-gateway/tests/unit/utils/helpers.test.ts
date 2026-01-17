import crypto from 'crypto';
import {
  generateId,
  sleep,
  retry,
  parseBoolean,
  chunk,
  deepMerge,
  maskSensitiveData,
  formatBytes,
} from '../../../src/utils/helpers';

jest.mock('crypto');

describe('helpers.ts', () => {
  describe('generateId', () => {
    beforeEach(() => {
      (crypto.randomBytes as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue('abc123def456'),
      });
    });

    it('generates ID without prefix', () => {
      const id = generateId();
      expect(id).toBe('abc123def456');
      expect(crypto.randomBytes).toHaveBeenCalledWith(16);
    });

    it('generates ID with prefix', () => {
      const id = generateId('user');
      expect(id).toBe('user_abc123def456');
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves after specified milliseconds', async () => {
      const promise = sleep(1000);
      jest.advanceTimersByTime(1000);
      await promise;
      expect(true).toBe(true); // If we get here, sleep worked
    });
  });

  describe('retry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and eventually succeeds', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');

      const promise = retry(fn, 3, 100);

      // First attempt fails, wait for retry delay
      await jest.advanceTimersByTimeAsync(100);
      // Second attempt fails, wait for retry delay (doubled)
      await jest.advanceTimersByTimeAsync(200);
      // Third attempt succeeds

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws error after all retries exhausted', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

      // Start the retry and immediately handle the rejection
      const promise = retry(fn, 2, 100).catch((e: Error) => e);
      
      // Run all timers to completion
      await jest.runAllTimersAsync();

      // Now check that it rejected with the right error
      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('parseBoolean', () => {
    it('returns true for "true" string', () => {
      expect(parseBoolean('true')).toBe(true);
    });

    it('returns true for "TRUE" string (case insensitive)', () => {
      expect(parseBoolean('TRUE')).toBe(true);
    });

    it('returns false for "false" string', () => {
      expect(parseBoolean('false')).toBe(false);
    });

    it('returns false for non-boolean string', () => {
      expect(parseBoolean('yes')).toBe(false);
    });

    it('returns default value when undefined', () => {
      expect(parseBoolean(undefined)).toBe(false);
      expect(parseBoolean(undefined, true)).toBe(true);
    });
  });

  describe('chunk', () => {
    it('splits array into chunks of specified size', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const result = chunk(array, 3);
      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    });

    it('handles array not evenly divisible by chunk size', () => {
      const array = [1, 2, 3, 4, 5];
      const result = chunk(array, 2);
      expect(result).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('returns empty array for empty input', () => {
      const result = chunk([], 3);
      expect(result).toEqual([]);
    });

    it('returns single chunk when size >= array length', () => {
      const array = [1, 2, 3];
      const result = chunk(array, 5);
      expect(result).toEqual([[1, 2, 3]]);
    });
  });

  describe('deepMerge', () => {
    it('merges two simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('deeply merges nested objects', () => {
      const target = { a: { x: 1, y: 2 }, b: 3 };
      const source = { a: { y: 3, z: 4 }, c: 5 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 3, c: 5 });
    });

    it('overwrites non-object values', () => {
      const target = { a: 1 };
      const source = { a: { b: 2 } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { b: 2 } });
    });

    it('does not merge arrays (overwrites instead)', () => {
      const target = { a: [1, 2, 3] };
      const source = { a: [4, 5] };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: [4, 5] });
    });

    it('does not mutate original objects', () => {
      const target = { a: 1 };
      const source = { b: 2 };
      const result = deepMerge(target, source);
      expect(target).toEqual({ a: 1 });
      expect(source).toEqual({ b: 2 });
      expect(result).toEqual({ a: 1, b: 2 });
    });
  });

  describe('maskSensitiveData', () => {
    it('masks all but last 4 characters by default', () => {
      const result = maskSensitiveData('1234567890');
      expect(result).toBe('******7890');
    });

    it('masks all but specified visible characters', () => {
      const result = maskSensitiveData('1234567890', 2);
      expect(result).toBe('********90');
    });

    it('masks entire string if length <= visible chars', () => {
      const result = maskSensitiveData('123', 4);
      expect(result).toBe('***');
    });

    it('masks empty string', () => {
      const result = maskSensitiveData('');
      expect(result).toBe('');
    });
  });

  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('formats bytes', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(5242880)).toBe('5 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('respects decimal places', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 3)).toBe('1.5 KB');
    });
  });
});
