// Mock dependencies
const mockDbRaw = jest.fn();
const mockRedisPing = jest.fn();
const mockRedisInfo = jest.fn();

jest.mock('../../../src/config/database', () => ({
  db: {
    raw: mockDbRaw,
  },
  pool: {
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  },
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    ping: mockRedisPing,
    info: mockRedisInfo,
  })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { markStartupComplete, markStartupFailed, MonitoringService } from '../../../src/services/monitoring.service';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MonitoringService();
    mockDbRaw.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockRedisPing.mockResolvedValue('PONG');
    mockRedisInfo.mockResolvedValue('connected_clients:10');
  });

  describe('markStartupComplete', () => {
    it('should mark startup as complete', () => {
      expect(() => markStartupComplete()).not.toThrow();
    });
  });

  describe('markStartupFailed', () => {
    it('should mark startup as failed with error', () => {
      expect(() => markStartupFailed('Test error')).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return formatted metrics string', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('auth_service_uptime_seconds');
      expect(metrics).toContain('auth_service_memory_heap_used_bytes');
      expect(metrics).toContain('auth_service_memory_rss_bytes');
      expect(metrics).toContain('auth_service_db_pool_total');
      expect(metrics).toContain('auth_service_db_pool_idle');
      expect(metrics).toContain('auth_service_db_pool_waiting');
      expect(metrics).toContain('auth_service_startup_complete');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should include actual pool values', () => {
      const metrics = service.getMetrics();
      expect(metrics).toContain('auth_service_db_pool_total 5');
      expect(metrics).toContain('auth_service_db_pool_idle 3');
      expect(metrics).toContain('auth_service_db_pool_waiting 0');
    });
  });
});
