/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reusable Redis mock for venue-service Phase 2 tests
 */

// Jest globals are available in test environment
declare const jest: any;

export const createRedisMock = () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  scan: jest.fn().mockResolvedValue(['0', []]),
  keys: jest.fn().mockResolvedValue([]),
  exists: jest.fn(),
  multi: jest.fn(() => ({
    exec: jest.fn(),
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
  })),
  // For circuit breaker tests
  status: 'ready',
});

export type RedisMock = ReturnType<typeof createRedisMock>;

/**
 * Create a mock that simulates Redis errors
 */
export const createFailingRedisMock = () => {
  const mock = createRedisMock();
  mock.get.mockRejectedValue(new Error('Redis connection error'));
  mock.set.mockRejectedValue(new Error('Redis connection error'));
  mock.setex.mockRejectedValue(new Error('Redis connection error'));
  mock.del.mockRejectedValue(new Error('Redis connection error'));
  mock.scan.mockRejectedValue(new Error('Redis connection error'));
  return mock;
};
