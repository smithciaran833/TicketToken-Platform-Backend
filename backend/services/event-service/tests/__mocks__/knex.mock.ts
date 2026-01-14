/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reusable Knex mock for event-service unit tests
 * Provides chainable query builder mocking
 */

declare const jest: any;

export interface KnexMockChain {
  where: any;
  whereIn: any;
  whereNull: any;
  whereNotNull: any;
  andWhere: any;
  orWhere: any;
  whereRaw: any;
  select: any;
  first: any;
  insert: any;
  update: any;
  del: any;
  delete: any;
  count: any;
  join: any;
  leftJoin: any;
  orderBy: any;
  groupBy: any;
  limit: any;
  offset: any;
  returning: any;
  raw: any;
  transacting: any;
  then: any;
  pluck: any;
  distinct: any;
  sum: any;
  avg: any;
  min: any;
  max: any;
  increment: any;
  decrement: any;
  truncate: any;
  columnInfo: any;
  modify: any;
  havingRaw: any;
  union: any;
  unionAll: any;
  intersect: any;
  except: any;
  whereExists: any;
  whereNotExists: any;
  whereBetween: any;
  whereNotBetween: any;
  whereLike: any;
  whereILike: any;
  whereJsonPath: any;
  onConflict: any;
  merge: any;
  ignore: any;
  forUpdate: any;
  forShare: any;
}

/**
 * Create a chainable knex mock
 * Each method returns the mock to enable chaining
 */
export const createKnexMock = () => {
  const mockChain: any = {};

  // Create mock methods that return the chain for chaining
  const chainableMethods = [
    'where', 'whereIn', 'whereNull', 'whereNotNull', 'andWhere', 'orWhere', 'whereRaw',
    'whereBetween', 'whereNotBetween', 'whereExists', 'whereNotExists', 'whereLike', 'whereILike',
    'select', 'insert', 'update', 'del', 'delete', 'count', 'sum', 'avg', 'min', 'max',
    'join', 'leftJoin', 'rightJoin', 'innerJoin', 'outerJoin', 'crossJoin',
    'orderBy', 'groupBy', 'havingRaw', 'having',
    'limit', 'offset', 'returning', 'distinct', 'pluck',
    'transacting', 'forUpdate', 'forShare',
    'increment', 'decrement', 'truncate',
    'union', 'unionAll', 'intersect', 'except',
    'onConflict', 'merge', 'ignore',
    'modify', 'with', 'withRecursive',
    'columnInfo', 'whereJsonPath'
  ];

  chainableMethods.forEach(method => {
    mockChain[method] = jest.fn().mockReturnThis();
  });

  // Terminal methods that resolve
  mockChain.first = jest.fn().mockResolvedValue(null);
  mockChain.then = jest.fn((resolve: any) => resolve([]));

  // The knex function that returns the query builder
  const knex: any = jest.fn().mockReturnValue(mockChain);

  // Raw query support
  knex.raw = jest.fn().mockResolvedValue({ rows: [] });

  // Transaction support
  knex.transaction = jest.fn().mockImplementation(async (callback: any) => {
    const trx = createKnexMock();
    trx.commit = jest.fn();
    trx.rollback = jest.fn();
    return callback(trx);
  });

  // Migration support for health checks
  knex.migrate = {
    currentVersion: jest.fn().mockResolvedValue(['20240101000000']),
    list: jest.fn().mockResolvedValue([[], []]),
  };

  // Expose chain for assertions and configuration
  knex._mockChain = mockChain;

  // Helper to reset all mocks
  knex._resetMocks = () => {
    chainableMethods.forEach(method => {
      mockChain[method].mockClear().mockReturnThis();
    });
    mockChain.first.mockClear().mockResolvedValue(null);
    mockChain.then.mockClear().mockImplementation((resolve: any) => resolve([]));
    knex.mockClear().mockReturnValue(mockChain);
  };

  return knex;
};

/**
 * Helper to configure mock to return specific data for first()
 */
export const configureMockReturn = (knexMock: any, data: any) => {
  knexMock._mockChain.first.mockResolvedValue(data);
  knexMock._mockChain.then.mockImplementation((resolve: any) => 
    resolve(Array.isArray(data) ? data : [data])
  );
};

/**
 * Helper to configure mock to return array data
 */
export const configureMockArray = (knexMock: any, data: any[]) => {
  knexMock._mockChain.first.mockResolvedValue(data[0] || null);
  knexMock._mockChain.then.mockImplementation((resolve: any) => resolve(data));
  // Also make the chain itself resolve to data when awaited directly
  knexMock.mockReturnValue({
    ...knexMock._mockChain,
    then: (resolve: any) => resolve(data),
  });
};

/**
 * Helper to configure mock to reject with error
 */
export const configureMockError = (knexMock: any, error: Error) => {
  knexMock._mockChain.first.mockRejectedValue(error);
  knexMock._mockChain.then.mockRejectedValue(error);
};

export type KnexMock = ReturnType<typeof createKnexMock>;

/**
 * Shared mock instance for simpler test setup
 * Use mockKnexInstance to access the chain methods
 */
export const mockKnexInstance: KnexMockChain = {
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  whereNotNull: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  whereRaw: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  insert: jest.fn().mockResolvedValue([1]),
  update: jest.fn().mockResolvedValue(1),
  del: jest.fn().mockResolvedValue(1),
  delete: jest.fn().mockResolvedValue(1),
  count: jest.fn().mockReturnThis(),
  join: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  returning: jest.fn().mockReturnThis(),
  raw: jest.fn().mockReturnThis(),
  transacting: jest.fn().mockReturnThis(),
  then: jest.fn((resolve: any) => resolve([])),
  pluck: jest.fn().mockResolvedValue([]),
  distinct: jest.fn().mockReturnThis(),
  sum: jest.fn().mockReturnThis(),
  avg: jest.fn().mockReturnThis(),
  min: jest.fn().mockReturnThis(),
  max: jest.fn().mockReturnThis(),
  increment: jest.fn().mockReturnThis(),
  decrement: jest.fn().mockReturnThis(),
  truncate: jest.fn().mockResolvedValue(undefined),
  columnInfo: jest.fn().mockResolvedValue({}),
  modify: jest.fn().mockReturnThis(),
  havingRaw: jest.fn().mockReturnThis(),
  union: jest.fn().mockReturnThis(),
  unionAll: jest.fn().mockReturnThis(),
  intersect: jest.fn().mockReturnThis(),
  except: jest.fn().mockReturnThis(),
  whereExists: jest.fn().mockReturnThis(),
  whereNotExists: jest.fn().mockReturnThis(),
  whereBetween: jest.fn().mockReturnThis(),
  whereNotBetween: jest.fn().mockReturnThis(),
  whereLike: jest.fn().mockReturnThis(),
  whereILike: jest.fn().mockReturnThis(),
  whereJsonPath: jest.fn().mockReturnThis(),
  onConflict: jest.fn().mockReturnThis(),
  merge: jest.fn().mockReturnThis(),
  ignore: jest.fn().mockReturnThis(),
  forUpdate: jest.fn().mockReturnThis(),
  forShare: jest.fn().mockReturnThis(),
} as unknown as KnexMockChain;

/**
 * Create a mock knex function that returns mockKnexInstance
 * Alias for simpler test patterns
 */
export const createMockKnex = () => {
  const mockKnex = jest.fn().mockReturnValue(mockKnexInstance);
  mockKnex.raw = jest.fn().mockResolvedValue({ rows: [] });
  mockKnex.transaction = jest.fn().mockImplementation(async (callback: any) => {
    return callback(mockKnex);
  });
  mockKnex._mockChain = mockKnexInstance;
  return mockKnex;
};
