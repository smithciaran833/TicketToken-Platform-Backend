// Mock dependencies BEFORE imports
const mockDbWhere = jest.fn();
const mockDbFirst = jest.fn();
const mockDbUpdate = jest.fn();
const mockDbInsert = jest.fn();
const mockDbSelect = jest.fn();
const mockDbRaw = jest.fn();
const mockDbCount = jest.fn();
const mockDbGroupBy = jest.fn();

const mockQueryBuilder: any = {
  where: mockDbWhere,
  first: mockDbFirst,
  update: mockDbUpdate,
  insert: mockDbInsert,
  select: mockDbSelect,
  count: mockDbCount,
  groupBy: mockDbGroupBy,
};

mockDbWhere.mockReturnValue(mockQueryBuilder);
mockDbSelect.mockReturnValue(mockQueryBuilder);
mockDbCount.mockReturnValue(mockQueryBuilder);
mockDbGroupBy.mockReturnValue(mockQueryBuilder);

const mockDb: any = jest.fn(() => mockQueryBuilder);
mockDb.raw = mockDbRaw;

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock Redis
const mockRedisGet = jest.fn();
const mockRedisSetex = jest.fn();

jest.mock('../../../src/config/redis', () => ({
  redisClient: {
    get: mockRedisGet,
    setex: mockRedisSetex,
  },
}));

// Mock logger
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn,
    debug: jest.fn(),
  },
}));

// Mock providers
const mockProviderInitialize = jest.fn();
const mockProviderTestConnection = jest.fn();

jest.mock('../../../src/providers/square/square.provider', () => ({
  SquareProvider: jest.fn().mockImplementation(() => ({
    initialize: mockProviderInitialize,
    testConnection: mockProviderTestConnection,
  })),
}));

jest.mock('../../../src/providers/stripe/stripe.provider', () => ({
  StripeProvider: jest.fn().mockImplementation(() => ({
    initialize: mockProviderInitialize,
    testConnection: mockProviderTestConnection,
  })),
}));

jest.mock('../../../src/providers/mailchimp/mailchimp.provider', () => ({
  MailchimpProvider: jest.fn().mockImplementation(() => ({
    initialize: mockProviderInitialize,
    testConnection: mockProviderTestConnection,
  })),
}));

jest.mock('../../../src/providers/quickbooks/quickbooks.provider', () => ({
  QuickBooksProvider: jest.fn().mockImplementation(() => ({
    initialize: mockProviderInitialize,
    testConnection: mockProviderTestConnection,
  })),
}));

// Mock token vault
const mockGetToken = jest.fn();
const mockGetApiKey = jest.fn();

jest.mock('../../../src/services/token-vault.service', () => ({
  tokenVault: {
    getToken: mockGetToken,
    getApiKey: mockGetApiKey,
  },
}));

import { MonitoringService, monitoringService } from '../../../src/services/monitoring.service';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockDbWhere.mockReturnValue(mockQueryBuilder);
    mockDbSelect.mockReturnValue(mockQueryBuilder);
    mockDbCount.mockReturnValue(mockQueryBuilder);
    mockDbGroupBy.mockReturnValue(mockQueryBuilder);
    service = new MonitoringService();
  });

  afterEach(() => {
    service.stopHealthChecks();
    jest.useRealTimers();
  });

  describe('startHealthChecks', () => {
    it('should log start message', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 0, connected: 0, healthy: 0, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Starting health monitoring...');
    });

    it('should run initial checks', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 0, connected: 0, healthy: 0, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
    });

    it('should set up periodic health checks', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 0, connected: 0, healthy: 0, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();
      jest.clearAllMocks();

      // Advance by 1 minute (health check interval)
      jest.advanceTimersByTime(60000);

      // Should trigger another health check
      expect(mockDb).toHaveBeenCalled();
    });

    it('should set up periodic metrics calculation', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 0, connected: 0, healthy: 0, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();
      jest.clearAllMocks();

      // Advance by 5 minutes (metrics interval)
      jest.advanceTimersByTime(300000);

      expect(mockDb).toHaveBeenCalled();
    });
  });

  describe('stopHealthChecks', () => {
    it('should stop all intervals', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 0, connected: 0, healthy: 0, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();
      await service.stopHealthChecks();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Health monitoring stopped');
    });

    it('should not run checks after stopping', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 0, connected: 0, healthy: 0, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();
      await service.stopHealthChecks();
      jest.clearAllMocks();

      jest.advanceTimersByTime(60000);

      expect(mockDb).not.toHaveBeenCalled();
    });
  });

  describe('getHealthSummary', () => {
    it('should return cached metrics from Redis', async () => {
      const cachedData = JSON.stringify({
        integrations: { total: 10, connected: 8 },
        timestamp: new Date(),
      });
      mockRedisGet.mockResolvedValue(cachedData);

      const result = await service.getHealthSummary();

      expect(mockRedisGet).toHaveBeenCalledWith('integration:metrics:platform');
      expect(result).toEqual(JSON.parse(cachedData));
    });

    it('should calculate fresh metrics if not cached', async () => {
      mockRedisGet
        .mockResolvedValueOnce(null) // First call returns null
        .mockResolvedValueOnce(JSON.stringify({ fresh: true })); // After calculation

      mockDbFirst.mockResolvedValue({ total: 5, connected: 3, healthy: 2, degraded: 1, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      const result = await service.getHealthSummary();

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(result).toEqual({ fresh: true });
    });

    it('should return null on error', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis error'));

      const result = await service.getHealthSummary();

      expect(result).toBeNull();
      expect(mockLoggerError).toHaveBeenCalledWith('Failed to get health summary', expect.any(Error));
    });
  });

  describe('health check logic', () => {
    it('should check connected integrations', async () => {
      const integrations = [
        { id: '1', venue_id: 'v1', integration_type: 'stripe', status: 'connected', health_status: 'healthy' },
      ];

      mockDbWhere.mockImplementation(() => {
        return {
          ...mockQueryBuilder,
          then: (cb: any) => Promise.resolve(integrations).then(cb),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      mockGetToken.mockResolvedValue({ access_token: 'token' });
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(true);
      mockDbFirst.mockResolvedValue(null);

      const mockLogsQuery: any = Promise.resolve([]);
      mockLogsQuery.where = jest.fn().mockReturnValue(mockLogsQuery);

      const mockQueueQuery = {
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ count: '0' }),
      };

      mockDb
        .mockReturnValueOnce({ where: jest.fn().mockResolvedValue(integrations) })
        .mockReturnValueOnce(mockLogsQuery)
        .mockReturnValueOnce(mockQueueQuery)
        .mockReturnValueOnce(mockQueryBuilder);

      mockDbFirst.mockResolvedValue({ total: 1, connected: 1, healthy: 1, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
    });

    it('should handle health check errors gracefully', async () => {
      mockDbWhere.mockRejectedValue(new Error('Database error'));
      mockDbFirst.mockResolvedValue({ total: 0, connected: 0, healthy: 0, degraded: 0, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();

      expect(mockLoggerError).toHaveBeenCalledWith('Health check failed', expect.any(Error));
    });
  });

  describe('calculateMetrics', () => {
    it('should store metrics in Redis', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 5, connected: 4, healthy: 3, degraded: 1, unhealthy: 0 });
      mockDbGroupBy.mockResolvedValue([{ status: 'pending', count: 2 }]);

      await service.startHealthChecks();

      expect(mockRedisSetex).toHaveBeenCalledWith(
        'integration:metrics:platform',
        300,
        expect.any(String)
      );
    });

    it('should log platform metrics', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockResolvedValue({ total: 10, connected: 8, healthy: 6, degraded: 1, unhealthy: 1 });
      mockDbGroupBy.mockResolvedValue([]);

      await service.startHealthChecks();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Platform metrics calculated', {
        total: 10,
        connected: 8,
        healthy: 6,
      });
    });

    it('should handle metrics calculation errors', async () => {
      mockDbWhere.mockResolvedValue([]);
      mockDbFirst.mockRejectedValue(new Error('Metrics query failed'));

      await service.startHealthChecks();

      expect(mockLoggerError).toHaveBeenCalledWith('Failed to calculate metrics', expect.any(Error));
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(monitoringService).toBeInstanceOf(MonitoringService);
    });
  });
});
