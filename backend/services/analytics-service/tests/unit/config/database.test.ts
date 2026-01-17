/**
 * Database Configuration Tests
 */

// Mock knex FIRST
const mockKnex = {
  raw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  on: jest.fn(),
  destroy: jest.fn().mockResolvedValue(undefined),
};

jest.mock('knex', () => {
  return jest.fn().mockImplementation(() => mockKnex);
});

// Mock util.promisify to return our mock DNS function
jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn((fn) => {
    // Return a mock function that resolves immediately
    return jest.fn().mockResolvedValue(['127.0.0.1']);
  }),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    env: 'test',
    database: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'postgres',
      password: 'postgres',
      pool: { min: 2, max: 10 },
    },
    analyticsDatabase: {
      host: 'localhost',
      port: 5432,
      database: 'analytics_db',
      user: 'postgres',
      password: 'postgres',
    },
  },
}));

describe('Database Config', () => {
  let databaseModule: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex.raw.mockResolvedValue([{ '?column?': 1 }]);
    mockKnex.destroy.mockResolvedValue(undefined);
    
    // Reset modules and re-import
    jest.resetModules();
    
    // Re-apply mocks
    jest.doMock('knex', () => jest.fn().mockImplementation(() => mockKnex));
    jest.doMock('util', () => ({
      ...jest.requireActual('util'),
      promisify: jest.fn(() => jest.fn().mockResolvedValue(['127.0.0.1'])),
    }));
    jest.doMock('../../../src/utils/logger', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('../../../src/config/index', () => ({
      config: {
        env: 'test',
        database: {
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'postgres',
          password: 'postgres',
          pool: { min: 2, max: 10 },
        },
        analyticsDatabase: {
          host: 'localhost',
          port: 5432,
          database: 'analytics_db',
          user: 'postgres',
          password: 'postgres',
        },
      },
    }));
    
    databaseModule = require('../../../src/config/database');
  });

  describe('connectDatabases', () => {
    it('should connect to both databases successfully', async () => {
      const knex = require('knex');

      await databaseModule.connectDatabases();

      expect(knex).toHaveBeenCalledTimes(2);
    });

    it('should test database connections', async () => {
      await databaseModule.connectDatabases();

      expect(mockKnex.raw).toHaveBeenCalledWith('SELECT 1');
    });
  });

  describe('getDb', () => {
    it('should throw if database not initialized', () => {
      jest.resetModules();
      
      jest.doMock('knex', () => jest.fn());
      jest.doMock('util', () => ({
        ...jest.requireActual('util'),
        promisify: jest.fn(() => jest.fn().mockResolvedValue(['127.0.0.1'])),
      }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.doMock('../../../src/config/index', () => ({
        config: {
          env: 'test',
          database: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test', pool: { min: 2, max: 10 } },
          analyticsDatabase: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
        },
      }));

      const freshModule = require('../../../src/config/database');

      expect(() => freshModule.getDb()).toThrow('Database not initialized');
    });

    it('should return db after connection', async () => {
      await databaseModule.connectDatabases();
      const db = databaseModule.getDb();

      expect(db).toBeDefined();
    });
  });

  describe('getAnalyticsDb', () => {
    it('should throw if analytics database not initialized', () => {
      jest.resetModules();
      
      jest.doMock('knex', () => jest.fn());
      jest.doMock('util', () => ({
        ...jest.requireActual('util'),
        promisify: jest.fn(() => jest.fn().mockResolvedValue(['127.0.0.1'])),
      }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      }));
      jest.doMock('../../../src/config/index', () => ({
        config: {
          env: 'test',
          database: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test', pool: { min: 2, max: 10 } },
          analyticsDatabase: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
        },
      }));

      const freshModule = require('../../../src/config/database');

      expect(() => freshModule.getAnalyticsDb()).toThrow('Analytics database not initialized');
    });

    it('should return analytics db after connection', async () => {
      await databaseModule.connectDatabases();
      const db = databaseModule.getAnalyticsDb();

      expect(db).toBeDefined();
    });
  });

  describe('closeDatabases', () => {
    it('should close both database connections', async () => {
      await databaseModule.connectDatabases();
      await databaseModule.closeDatabases();

      expect(mockKnex.destroy).toHaveBeenCalledTimes(2);
    });
  });
});
