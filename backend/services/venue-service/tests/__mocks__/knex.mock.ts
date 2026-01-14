/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reusable Knex mock for venue-service unit tests
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
