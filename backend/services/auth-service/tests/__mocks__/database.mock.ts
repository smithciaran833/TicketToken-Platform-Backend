/**
 * Reusable Database (pool) mock for Phase 2 tests
 */
export const createPoolMock = () => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
});

export type PoolMock = ReturnType<typeof createPoolMock>;
