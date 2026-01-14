/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reusable Redis mock for event-service unit tests
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
  setnx: jest.fn(),
  mget: jest.fn(),
  mset: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
  hgetall: jest.fn(),
  multi: jest.fn(() => ({
    exec: jest.fn(),
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
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
  mock.ping.mockRejectedValue(new Error('Redis connection error'));
  return mock;
};

/**
 * Create a mock with distributed lock support
 */
export const createRedisMockWithLock = () => {
  const mock = createRedisMock();
  
  // Track lock state
  const locks = new Map<string, string>();
  
  mock.setnx.mockImplementation(async (key: string, value: string) => {
    if (locks.has(key)) {
      return 0; // Lock already exists
    }
    locks.set(key, value);
    return 1; // Lock acquired
  });
  
  mock.del.mockImplementation(async (key: string) => {
    if (locks.has(key)) {
      locks.delete(key);
      return 1;
    }
    return 0;
  });
  
  mock.get.mockImplementation(async (key: string) => {
    return locks.get(key) || null;
  });
  
  // Helper to clear all locks
  (mock as any)._clearLocks = () => locks.clear();
  
  return mock;
};
