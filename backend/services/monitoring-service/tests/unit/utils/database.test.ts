// Mock logger first
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    database: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_pass',
    },
    redis: {
      host: 'localhost',
      port: 6379,
    },
    mongodb: {
      uri: 'mongodb://localhost:27017',
    },
    elasticsearch: {
      node: 'http://localhost:9200',
    },
    influxdb: {
      url: 'http://localhost:8086',
      token: 'test-token',
      org: 'test-org',
      bucket: 'test-bucket',
    },
  },
}));

// Create mock instances
const mockPgClient = {
  query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
  release: jest.fn(),
};

const mockPgPool = {
  connect: jest.fn().mockResolvedValue(mockPgClient),
  end: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
};

const mockMongoDb = { collection: jest.fn() };
const mockMongoClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  db: jest.fn().mockReturnValue(mockMongoDb),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockEsClient = {
  cluster: { health: jest.fn().mockResolvedValue({ status: 'green' }) },
};

const mockInfluxWriteApi = { writePoint: jest.fn(), flush: jest.fn() };
const mockInfluxQueryApi = { queryRows: jest.fn() };
const mockInfluxDB = {
  getWriteApi: jest.fn().mockReturnValue(mockInfluxWriteApi),
  getQueryApi: jest.fn().mockReturnValue(mockInfluxQueryApi),
};

// Mock the modules
jest.mock('pg', () => ({ Pool: jest.fn(() => mockPgPool) }));
jest.mock('ioredis', () => jest.fn(() => mockRedis));
jest.mock('mongodb', () => ({ MongoClient: jest.fn(() => mockMongoClient) }));
jest.mock('@elastic/elasticsearch', () => ({ Client: jest.fn(() => mockEsClient) }));
jest.mock('@influxdata/influxdb-client', () => ({
  InfluxDB: jest.fn(() => mockInfluxDB),
  Point: jest.fn(),
}));

import { logger } from '../../../src/utils/logger';

describe('Database Utils', () => {
  let dbModule: typeof import('../../../src/utils/database');

  beforeAll(async () => {
    dbModule = await import('../../../src/utils/database');
    // Wait for async initialization
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exports', () => {
    it('should export pgPool', () => {
      expect(dbModule.pgPool).toBe(mockPgPool);
    });

    it('should export redisClient', () => {
      expect(dbModule.redisClient).toBe(mockRedis);
    });

    it('should export mongoClient', () => {
      expect(dbModule.mongoClient).toBe(mockMongoClient);
    });

    it('should export mongoDB', () => {
      expect(dbModule.mongoDB).toBe(mockMongoDb);
    });

    it('should export esClient', () => {
      expect(dbModule.esClient).toBe(mockEsClient);
    });

    it('should export influxDB', () => {
      expect(dbModule.influxDB).toBe(mockInfluxDB);
    });

    it('should export influxWriteApi', () => {
      expect(dbModule.influxWriteApi).toBe(mockInfluxWriteApi);
    });

    it('should export influxQueryApi', () => {
      expect(dbModule.influxQueryApi).toBe(mockInfluxQueryApi);
    });

    it('should export initializeDatabases function', () => {
      expect(typeof dbModule.initializeDatabases).toBe('function');
    });

    it('should export closeDatabases function', () => {
      expect(typeof dbModule.closeDatabases).toBe('function');
    });
  });

  describe('initializeDatabases', () => {
    it('should resolve without throwing', async () => {
      await expect(dbModule.initializeDatabases()).resolves.toBeUndefined();
    });

    it('should attempt PostgreSQL connection', async () => {
      await dbModule.initializeDatabases();
      expect(mockPgPool.connect).toHaveBeenCalled();
    });

    it('should test PostgreSQL with SELECT NOW()', async () => {
      await dbModule.initializeDatabases();
      expect(mockPgClient.query).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should release PostgreSQL client after test', async () => {
      await dbModule.initializeDatabases();
      expect(mockPgClient.release).toHaveBeenCalled();
    });

    it('should ping Redis', async () => {
      await dbModule.initializeDatabases();
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should connect MongoDB', async () => {
      await dbModule.initializeDatabases();
      expect(mockMongoClient.connect).toHaveBeenCalled();
    });

    it('should select MongoDB database', async () => {
      await dbModule.initializeDatabases();
      expect(mockMongoClient.db).toHaveBeenCalledWith('tickettoken_monitoring');
    });

    it('should check Elasticsearch cluster health', async () => {
      await dbModule.initializeDatabases();
      expect(mockEsClient.cluster.health).toHaveBeenCalled();
    });

    it('should create InfluxDB write API', async () => {
      await dbModule.initializeDatabases();
      expect(mockInfluxDB.getWriteApi).toHaveBeenCalledWith('test-org', 'test-bucket', 'ns');
    });

    it('should create InfluxDB query API', async () => {
      await dbModule.initializeDatabases();
      expect(mockInfluxDB.getQueryApi).toHaveBeenCalledWith('test-org');
    });

    it('should handle PostgreSQL failure gracefully', async () => {
      mockPgPool.connect.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(dbModule.initializeDatabases()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to connect to PostgreSQL:',
        expect.any(Error)
      );
    });

    it('should handle Redis failure gracefully', async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(dbModule.initializeDatabases()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to connect to Redis:',
        expect.any(Error)
      );
    });

    it('should handle MongoDB failure gracefully', async () => {
      mockMongoClient.connect.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(dbModule.initializeDatabases()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to connect to MongoDB:',
        expect.any(Error)
      );
    });

    it('should handle Elasticsearch failure gracefully', async () => {
      mockEsClient.cluster.health.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(dbModule.initializeDatabases()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to connect to Elasticsearch:',
        expect.any(Error)
      );
    });
  });

  describe('closeDatabases', () => {
    it('should close PostgreSQL pool', async () => {
      await dbModule.closeDatabases();
      expect(mockPgPool.end).toHaveBeenCalled();
    });

    it('should close Redis connection', async () => {
      await dbModule.closeDatabases();
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should close MongoDB connection', async () => {
      await dbModule.closeDatabases();
      expect(mockMongoClient.close).toHaveBeenCalled();
    });

    it('should log success message', async () => {
      await dbModule.closeDatabases();
      expect(logger.info).toHaveBeenCalledWith('All database connections closed');
    });

    it('should handle close errors gracefully', async () => {
      mockPgPool.end.mockRejectedValueOnce(new Error('Close failed'));
      await expect(dbModule.closeDatabases()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Error closing database connections:',
        expect.any(Error)
      );
    });
  });
});
