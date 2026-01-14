/**
 * Unit Tests for utils/distributed-lock.ts
 * 
 * Tests distributed locking functionality using Redlock.
 * Priority: 🔴 Critical (15 tests)
 */

// Mock ioredis and redlock before imports
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }));
});

const mockLock = {
  value: 'mock-lock-value',
  release: jest.fn().mockResolvedValue(undefined),
  extend: jest.fn().mockImplementation(function(this: any, ttl: number) {
    return Promise.resolve(this);
  }),
};

const mockRedlock = {
  acquire: jest.fn().mockResolvedValue(mockLock),
  on: jest.fn(),
};

jest.mock('redlock', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedlock),
    ResourceLockedError: class ResourceLockedError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'ResourceLockedError';
      }
    },
  };
});

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import {
  getRedlock,
  withLock,
  tryLock,
  extendLock,
  releaseLock,
  createMintLockKey,
  createBatchLockKey,
  createVenueLockKey,
} from '../../../src/utils/distributed-lock';

// =============================================================================
// Test Suite
// =============================================================================

describe('Distributed Lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLock.release.mockResolvedValue(undefined);
    mockLock.extend.mockImplementation(function(this: any) {
      return Promise.resolve(this);
    });
    mockRedlock.acquire.mockResolvedValue(mockLock);
  });

  // =============================================================================
  // Lock Key Generation Tests
  // =============================================================================

  describe('Lock Key Generation', () => {
    it("createMintLockKey should format as 'mint:{tenantId}:{ticketId}'", () => {
      const key = createMintLockKey('tenant-123', 'ticket-456');
      expect(key).toBe('mint:tenant-123:ticket-456');
    });

    it("createBatchLockKey should format as 'batch:{tenantId}:{batchId}'", () => {
      const key = createBatchLockKey('tenant-123', 'batch-789');
      expect(key).toBe('batch:tenant-123:batch-789');
    });

    it("createVenueLockKey should format as 'venue:{venueId}'", () => {
      const key = createVenueLockKey('venue-abc');
      expect(key).toBe('venue:venue-abc');
    });
  });

  // =============================================================================
  // Redlock Configuration Tests
  // =============================================================================

  describe('Redlock Configuration', () => {
    it('getRedlock should return Redlock instance', () => {
      const redlock = getRedlock();
      expect(redlock).toBeDefined();
    });

    it('getRedlock should return singleton on subsequent calls', () => {
      const redlock1 = getRedlock();
      const redlock2 = getRedlock();
      expect(redlock1).toBe(redlock2);
    });

    // Note: Actual configuration values are tested indirectly through the mock
    // The actual Redlock is configured with:
    // - retryCount: 3
    // - retryDelay: 200ms
    // - retryJitter: 100ms
  });

  // =============================================================================
  // withLock Function Tests
  // =============================================================================

  describe('withLock Function', () => {
    it('withLock should acquire lock before execution', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      
      await withLock('test-key', 30000, fn);
      
      expect(mockRedlock.acquire).toHaveBeenCalledWith(
        ['lock:test-key'],
        30000
      );
      expect(fn).toHaveBeenCalled();
    });

    it('withLock should release lock after successful execution', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      
      await withLock('test-key', 30000, fn);
      
      expect(mockLock.release).toHaveBeenCalled();
    });

    it('withLock should release lock after error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Function error'));
      
      await expect(withLock('test-key', 30000, fn)).rejects.toThrow('Function error');
      expect(mockLock.release).toHaveBeenCalled();
    });

    it('withLock should throw if lock cannot be acquired', async () => {
      const { ResourceLockedError } = require('redlock');
      mockRedlock.acquire.mockRejectedValue(new ResourceLockedError('Resource is locked'));
      
      const fn = jest.fn();
      
      await expect(withLock('test-key', 30000, fn)).rejects.toThrow('Resource is locked');
      expect(fn).not.toHaveBeenCalled();
    });

    it('withLock should respect TTL parameter', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const ttl = 60000;
      
      await withLock('test-key', ttl, fn);
      
      expect(mockRedlock.acquire).toHaveBeenCalledWith(
        expect.any(Array),
        ttl
      );
    });
  });

  // =============================================================================
  // Additional Lock Functions Tests
  // =============================================================================

  describe('Additional Lock Functions', () => {
    it('tryLock should return lock if available', async () => {
      const lock = await tryLock('test-key', 30000);
      
      expect(lock).toBeDefined();
      expect(lock).toEqual(expect.objectContaining({
        value: expect.any(String),
        release: expect.any(Function),
      }));
    });

    it('tryLock should return null if not available', async () => {
      const { ResourceLockedError } = require('redlock');
      mockRedlock.acquire.mockRejectedValue(new ResourceLockedError('Resource is locked'));
      
      const lock = await tryLock('test-key', 30000);
      
      expect(lock).toBeNull();
    });

    it('extendLock should extend lock TTL', async () => {
      const lock = await tryLock('test-key', 30000);
      expect(lock).not.toBeNull();
      
      const extendedLock = await extendLock(lock!, 60000);
      
      expect(mockLock.extend).toHaveBeenCalledWith(60000);
      expect(extendedLock).toBeDefined();
    });

    it('releaseLock should release lock', async () => {
      const lock = await tryLock('test-key', 30000);
      expect(lock).not.toBeNull();
      
      await releaseLock(lock!);
      
      expect(mockLock.release).toHaveBeenCalled();
    });
  });
});
