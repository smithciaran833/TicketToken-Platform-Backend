import { MonitoringService } from '../../src/services/monitoring.service';
import { pool } from '../../src/config/database';
import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR MONITORING SERVICE
 * 
 * These tests verify monitoring and health check functionality:
 * - Database health checks
 * - Redis health checks
 * - Memory health checks
 * - Prometheus metrics
 * - Overall health status determination
 */

// Safety check
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running monitoring service integration tests against test environment`);
});

describe('MonitoringService Integration Tests', () => {
  let service: MonitoringService;

  beforeAll(async () => {
    service = new MonitoringService();
  });

  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  describe('performHealthCheck()', () => {
    it('should return healthy status when all checks pass', async () => {
      const health = await service.performHealthCheck();

      expect(health.status).toBe('healthy');
      expect(health.service).toBe('auth-service');
      expect(health.timestamp).toBeDefined();
      expect(health.version).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
    });

    it('should include database check results', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.database).toBeDefined();
      expect(health.checks.database.status).toBe('ok');
      expect(health.checks.database.latency).toBeGreaterThan(0);
      expect(health.checks.database.details).toBeDefined();
    });

    it('should include Redis check results', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.redis).toBeDefined();
      expect(health.checks.redis.status).toBe('ok');
      expect(health.checks.redis.latency).toBeGreaterThan(0);
    });

    it('should include memory check results', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.memory).toBeDefined();
      expect(health.checks.memory.status).toBe('ok');
      expect(health.checks.memory.details).toBeDefined();
      expect(health.checks.memory.details.heapUsedMB).toBeGreaterThan(0);
    });

    it('should return timestamp in ISO format', async () => {
      const health = await service.performHealthCheck();

      const timestamp = new Date(health.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(health.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include correct service name', async () => {
      const health = await service.performHealthCheck();

      expect(health.service).toBe('auth-service');
    });

    it('should include process uptime', async () => {
      const health = await service.performHealthCheck();

      expect(health.uptime).toBeGreaterThan(0);
      expect(typeof health.uptime).toBe('number');
    });
  });

  describe('checkDatabase()', () => {
    it('should return ok status with latency', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.database.status).toBe('ok');
      expect(health.checks.database.latency).toBeDefined();
      expect(health.checks.database.latency!).toBeGreaterThan(0);
      expect(health.checks.database.latency!).toBeLessThan(1000); // Should be under 1s
    });

    it('should include connection pool stats', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.database.details).toBeDefined();
      expect(health.checks.database.details.totalConnections).toBeDefined();
      expect(health.checks.database.details.idleConnections).toBeDefined();
      expect(health.checks.database.details.waitingConnections).toBeDefined();
    });

    it('should have valid connection pool numbers', async () => {
      const health = await service.performHealthCheck();

      const details = health.checks.database.details;
      expect(details.totalConnections).toBeGreaterThanOrEqual(0);
      expect(details.idleConnections).toBeGreaterThanOrEqual(0);
      expect(details.waitingConnections).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkRedis()', () => {
    it('should return ok status with latency', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.redis.status).toBe('ok');
      expect(health.checks.redis.latency).toBeDefined();
      expect(health.checks.redis.latency!).toBeGreaterThan(0);
      expect(health.checks.redis.latency!).toBeLessThan(1000); // Should be under 1s
    });

    it('should include connected clients count', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.redis.details).toBeDefined();
      expect(health.checks.redis.details.connectedClients).toBeDefined();
    });

    it('should have valid connected clients number', async () => {
      const health = await service.performHealthCheck();

      const clients = health.checks.redis.details.connectedClients;
      expect(typeof clients).toBe('number');
      expect(clients).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkMemory()', () => {
    it('should return ok status for normal memory usage', async () => {
      const health = await service.performHealthCheck();

      expect(health.checks.memory.status).toBe('ok');
    });

    it('should include heap memory details', async () => {
      const health = await service.performHealthCheck();

      const details = health.checks.memory.details;
      expect(details.heapUsedMB).toBeDefined();
      expect(details.heapTotalMB).toBeDefined();
      expect(details.rssMB).toBeDefined();
      expect(details.heapUsagePercent).toBeDefined();
    });

    it('should have valid memory values', async () => {
      const health = await service.performHealthCheck();

      const details = health.checks.memory.details;
      expect(details.heapUsedMB).toBeGreaterThan(0);
      expect(details.heapTotalMB).toBeGreaterThan(0);
      expect(details.rssMB).toBeGreaterThan(0);
      expect(details.heapUsagePercent).toBeGreaterThanOrEqual(0);
      expect(details.heapUsagePercent).toBeLessThanOrEqual(100);
    });

    it('should calculate heap usage percentage correctly', async () => {
      const health = await service.performHealthCheck();

      const details = health.checks.memory.details;
      const expectedPercent = Math.round((details.heapUsedMB / details.heapTotalMB) * 100);
      
      expect(details.heapUsagePercent).toBe(expectedPercent);
    });
  });

  describe('getMetrics()', () => {
    it('should return Prometheus-formatted metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(typeof metrics).toBe('string');
    });

    it('should include uptime metric', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('auth_service_uptime_seconds');
      expect(metrics).toMatch(/auth_service_uptime_seconds \d+/);
    });

    it('should include memory heap metric', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('auth_service_memory_heap_used_bytes');
      expect(metrics).toMatch(/auth_service_memory_heap_used_bytes \d+/);
    });

    it('should include database pool metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toContain('auth_service_db_pool_total');
      expect(metrics).toContain('auth_service_db_pool_idle');
      expect(metrics).toContain('auth_service_db_pool_waiting');
    });

    it('should have valid metric values', () => {
      const metrics = service.getMetrics();

      // Extract numeric values
      const uptimeMatch = metrics.match(/auth_service_uptime_seconds (\d+\.?\d*)/);
      const heapMatch = metrics.match(/auth_service_memory_heap_used_bytes (\d+)/);

      expect(uptimeMatch).not.toBeNull();
      expect(heapMatch).not.toBeNull();

      const uptime = parseFloat(uptimeMatch![1]);
      const heap = parseInt(heapMatch![1]);

      expect(uptime).toBeGreaterThan(0);
      expect(heap).toBeGreaterThan(0);
    });

    it('should format metrics correctly for Prometheus', () => {
      const metrics = service.getMetrics();

      // Should have HELP and TYPE declarations
      const lines = metrics.split('\n');
      const helpLines = lines.filter(l => l.startsWith('# HELP'));
      const typeLines = lines.filter(l => l.startsWith('# TYPE'));
      const metricLines = lines.filter(l => l.match(/^auth_service_\w+\s+\d+/));

      expect(helpLines.length).toBeGreaterThan(0);
      expect(typeLines.length).toBeGreaterThan(0);
      expect(metricLines.length).toBeGreaterThan(0);
    });
  });

  describe('Health status determination', () => {
    it('should return healthy when all checks are ok', async () => {
      const health = await service.performHealthCheck();

      if (health.checks.database.status === 'ok' && 
          health.checks.redis.status === 'ok' && 
          health.checks.memory.status === 'ok') {
        expect(health.status).toBe('healthy');
      }
    });

    it('should perform checks in parallel', async () => {
      const start = Date.now();
      await service.performHealthCheck();
      const duration = Date.now() - start;

      // If sequential, would take 3x longer
      // Parallel should be closer to the slowest single check
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Multiple health checks', () => {
    it('should handle consecutive health checks', async () => {
      const health1 = await service.performHealthCheck();
      const health2 = await service.performHealthCheck();

      expect(health1.status).toBe('healthy');
      expect(health2.status).toBe('healthy');
    });

    it('should have increasing timestamps', async () => {
      const health1 = await service.performHealthCheck();
      await new Promise(resolve => setTimeout(resolve, 10));
      const health2 = await service.performHealthCheck();

      const time1 = new Date(health1.timestamp).getTime();
      const time2 = new Date(health2.timestamp).getTime();

      expect(time2).toBeGreaterThan(time1);
    });

    it('should have increasing uptime', async () => {
      const health1 = await service.performHealthCheck();
      await new Promise(resolve => setTimeout(resolve, 100));
      const health2 = await service.performHealthCheck();

      expect(health2.uptime).toBeGreaterThan(health1.uptime);
    });
  });

  describe('Metrics consistency', () => {
    it('should have consistent values between health and metrics', async () => {
      const health = await service.performHealthCheck();
      const metrics = service.getMetrics();

      const uptimeMatch = metrics.match(/auth_service_uptime_seconds (\d+\.?\d*)/);
      const metricsUptime = parseFloat(uptimeMatch![1]);

      // Should be very close (within 1 second due to timing)
      expect(Math.abs(metricsUptime - health.uptime)).toBeLessThan(1);
    });

    it('should reflect current pool stats in metrics', () => {
      const metrics = service.getMetrics();

      const totalMatch = metrics.match(/auth_service_db_pool_total (\d+)/);
      const idleMatch = metrics.match(/auth_service_db_pool_idle (\d+)/);

      expect(totalMatch).not.toBeNull();
      expect(idleMatch).not.toBeNull();

      const total = parseInt(totalMatch![1]);
      const idle = parseInt(idleMatch![1]);

      expect(total).toBeGreaterThanOrEqual(idle);
    });
  });
});
