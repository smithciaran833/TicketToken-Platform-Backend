/**
 * Reusable Redis mock for Phase 2 tests
 */
export const createRedisMock = () => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  scan: jest.fn(),
  keys: jest.fn(),
  multi: jest.fn(() => ({
    exec: jest.fn(),
  })),
});

export type RedisMock = ReturnType<typeof createRedisMock>;
