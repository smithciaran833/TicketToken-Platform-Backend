/**
 * Database Configuration Tests
 */

// Mock logger first
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../../../src/config/logger', () => ({
  logger: mockLogger,
}));

// Mock metrics service
const mockMetricsService = {
  setGauge: jest.fn(),
  incrementCounter: jest.fn(),
};
jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: mockMetricsService,
}));

// Create mock pool
const createMockPool = () => ({
  numUsed: jest.fn().mockReturnValue(5),
  numFree: jest.fn().mockReturnValue(3),
  numPendingAcquires: jest.fn().mockReturnValue(1),
  numPendingCreates: jest.fn().mockReturnValue(0),
});

// Create mock knex instance
const mockKnexInstance = {
  raw: jest.fn().mockResolvedValue({}),
  destroy: jest.fn().mockResolvedValue(undefined),
  client: {
    pool: createMockPool(),
  },
};

// Mock knex constructor - capture the config
let capturedKnexConfig: any = null;
const knexMock = jest.fn((config) => {
  capturedKnexConfig = config;
  return mockKnexInstance;
});
jest.mock('knex', () => knexMock);

// NOW import the database module
import { 
  db, 
  connectDatabase, 
  closeDatabaseConnections, 
  getPoolStats, 
  isDatabaseConnected, 
  dbHealthMonitor,
  stopPoolMetrics 
} from '../../../src/config/database';

describe('Database Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Restore pool if it was set to null
    if (!mockKnexInstance.client.pool) {
      mockKnexInstance.client.pool = createMockPool();
    }
    
    // Reset mock implementations
    mockKnexInstance.raw.mockResolvedValue({});
    mockKnexInstance.destroy.mockResolvedValue(undefined);
    mockKnexInstance.client.pool.numUsed.mockReturnValue(5);
    mockKnexInstance.client.pool.numFree.mockReturnValue(3);
    mockKnexInstance.client.pool.numPendingAcquires.mockReturnValue(1);
    mockKnexInstance.client.pool.numPendingCreates.mockReturnValue(0);
  });

  afterEach(async () => {
    dbHealthMonitor.stop();
    stopPoolMetrics();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Database Connection', () => {
    it('should create knex instance with correct configuration', () => {
      expect(capturedKnexConfig).toBeDefined();
      expect(capturedKnexConfig.client).toBe('postgresql');
      expect(capturedKnexConfig.connection).toBeDefined();
      expect(capturedKnexConfig.connection.host).toBeDefined();
      expect(capturedKnexConfig.pool).toBeDefined();
      expect(capturedKnexConfig.migrations.tableName).toBe('knex_migrations_notification');
    });

    it('should NOT include deprecated priorityRange in pool config', () => {
      expect(capturedKnexConfig.pool.priorityRange).toBeUndefined();
    });
  });

  describe('Connection Pool Configuration', () => {
    it('should configure pool with min and max connections', () => {
      expect(capturedKnexConfig.pool.min).toBeDefined();
      expect(capturedKnexConfig.pool.max).toBeDefined();
    });

    it('should configure pool timeouts', () => {
      expect(capturedKnexConfig.pool.acquireTimeoutMillis).toBeDefined();
      expect(capturedKnexConfig.pool.idleTimeoutMillis).toBeDefined();
      expect(capturedKnexConfig.pool.reapIntervalMillis).toBeDefined();
    });

    it('should validate connection after creation', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValue({}),
      };
      const mockDone = jest.fn();

      await capturedKnexConfig.pool.afterCreate(mockConn, mockDone);

      expect(mockConn.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockDone).toHaveBeenCalledWith(null, mockConn);
      expect(mockLogger.debug).toHaveBeenCalledWith('Database connection created and validated');
    });

    it('should handle connection validation failure', async () => {
      const error = new Error('Connection validation failed');
      const mockConn = {
        query: jest.fn().mockRejectedValue(error),
      };
      const mockDone = jest.fn();

      await capturedKnexConfig.pool.afterCreate(mockConn, mockDone);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to validate database connection',
        expect.objectContaining({ error })
      );
      expect(mockDone).toHaveBeenCalledWith(error, mockConn);
    });
  });

  describe('connectDatabase()', () => {
    it('should connect successfully on first attempt', async () => {
      mockKnexInstance.raw.mockResolvedValue({});

      await connectDatabase();

      expect(mockKnexInstance.raw).toHaveBeenCalledWith('SELECT 1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Database connected successfully',
        expect.any(Object)
      );
    });

    it('should retry connection on failure', async () => {
      mockKnexInstance.raw
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({});

      const connectPromise = connectDatabase();

      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);

      await connectPromise;

      expect(mockKnexInstance.raw).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      mockKnexInstance.raw.mockRejectedValue(new Error('Connection failed'));

      const connectPromise = connectDatabase();

      for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(10000);
      }

      await expect(connectPromise).rejects.toThrow('Failed to connect to database after maximum retries');
    });

    it('should start health monitor after successful connection', async () => {
      mockKnexInstance.raw.mockResolvedValue({});

      await connectDatabase();

      expect(mockLogger.info).toHaveBeenCalledWith('Database health monitor started');
    });
  });

  describe('closeDatabaseConnections()', () => {
    it('should destroy database connections', async () => {
      mockKnexInstance.destroy.mockResolvedValue(undefined);

      await closeDatabaseConnections();

      expect(mockKnexInstance.destroy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Database connections closed');
    });

    it('should handle close errors', async () => {
      const error = new Error('Close failed');
      mockKnexInstance.destroy.mockRejectedValue(error);

      await expect(closeDatabaseConnections()).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error closing database connections',
        expect.objectContaining({ error })
      );
    });
  });

  describe('isDatabaseConnected()', () => {
    it('should return true when connected', async () => {
      mockKnexInstance.raw.mockResolvedValue({});

      const result = await isDatabaseConnected();

      expect(result).toBe(true);
      expect(mockKnexInstance.raw).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return false when not connected', async () => {
      mockKnexInstance.raw.mockRejectedValue(new Error('Not connected'));

      const result = await isDatabaseConnected();

      expect(result).toBe(false);
    });
  });

  describe('getPoolStats()', () => {
    it('should return pool statistics', () => {
      const stats = getPoolStats();

      expect(stats).toEqual({
        size: 8,
        used: 5,
        free: 3,
        pending: 1,
        pendingCreates: 0,
      });
    });

    it('should return zeros when pool is not available', () => {
      mockKnexInstance.client.pool = null;

      const stats = getPoolStats();

      expect(stats).toEqual({
        size: 0,
        used: 0,
        free: 0,
        pending: 0,
        pendingCreates: 0,
      });
    });

    it('should handle errors gracefully', () => {
      mockKnexInstance.client.pool.numUsed.mockImplementation(() => {
        throw new Error('Pool error');
      });

      const stats = getPoolStats();

      expect(stats).toEqual({
        size: 0,
        used: 0,
        free: 0,
        pending: 0,
        pendingCreates: 0,
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get pool stats',
        expect.any(Object)
      );
    });
  });

  describe('DatabaseHealthMonitor', () => {
    it('should start health monitoring', () => {
      dbHealthMonitor.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Database health monitor started');
    });

    it('should stop health monitoring', () => {
      dbHealthMonitor.start();
      dbHealthMonitor.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Database health monitor stopped');
    });

    it('should check health and update metrics on success', async () => {
      mockKnexInstance.raw.mockResolvedValue({});

      const result = await dbHealthMonitor.checkHealth();

      expect(result).toBe(true);
      expect(mockKnexInstance.raw).toHaveBeenCalledWith('SELECT 1');
      expect(mockMetricsService.setGauge).toHaveBeenCalledWith('database_health', 1);
    });

    it('should check health and update metrics on failure', async () => {
      mockKnexInstance.raw.mockRejectedValue(new Error('Health check failed'));

      const result = await dbHealthMonitor.checkHealth();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Database health check failed',
        expect.any(Object)
      );
      expect(mockMetricsService.setGauge).toHaveBeenCalledWith('database_health', 0);
    });

    it('should return health status', async () => {
      mockKnexInstance.raw.mockResolvedValue({});

      await dbHealthMonitor.checkHealth();

      expect(dbHealthMonitor.getHealthStatus()).toBe(true);
    });

    it('should perform periodic health checks', async () => {
      mockKnexInstance.raw.mockResolvedValue({});

      dbHealthMonitor.start();

      await jest.advanceTimersByTimeAsync(30000);

      expect(mockKnexInstance.raw).toHaveBeenCalled();
    });
  });

  describe('Pool Metrics Tracking', () => {
    it('should track pool metrics periodically', async () => {
      mockKnexInstance.raw.mockResolvedValue({});
      await connectDatabase();

      mockMetricsService.setGauge.mockClear();

      await jest.advanceTimersByTimeAsync(10000);

      expect(mockMetricsService.setGauge).toHaveBeenCalledWith('db_pool_size', 8);
      expect(mockMetricsService.setGauge).toHaveBeenCalledWith('db_pool_used', 5);
      expect(mockMetricsService.setGauge).toHaveBeenCalledWith('db_pool_free', 3);
    });
  });
});
