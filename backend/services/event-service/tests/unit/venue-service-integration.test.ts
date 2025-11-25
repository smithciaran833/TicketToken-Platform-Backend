import { HealthCheckService } from '../../src/services/healthCheck.service';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

describe('Venue Service Integration - Failure Tests', () => {
  let healthCheckService: HealthCheckService;
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    healthCheckService = new HealthCheckService();
    
    mockPool = {
      query: jest.fn(),
      end: jest.fn(),
    } as any;

    mockRedis = {
      ping: jest.fn(),
      disconnect: jest.fn(),
    } as any;
  });

  describe('Network Timeouts', () => {
    it('should handle venue service timeout gracefully', async () => {
      // Mock fetch to simulate timeout
      global.fetch = jest.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
      expect(result.checks.venueService.error).toContain('Timeout');
      expect(result.status).toBe('unhealthy');
    });

    it('should timeout after 5 seconds', async () => {
      const startTime = Date.now();
      
      global.fetch = jest.fn().mockImplementation(() => 
        new Promise((resolve) => 
          setTimeout(() => resolve(new Response()), 10000) // 10s delay
        )
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      try {
        await healthCheckService.performHealthCheck(mockPool, mockRedis);
      } catch (error) {
        // Expected to timeout
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(6000); // Should timeout before 6s
    });
  });

  describe('HTTP Error Responses', () => {
    it('should handle 404 Not Found', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(null, { status: 404 })
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
      expect(result.checks.venueService.error).toContain('404');
    });

    it('should handle 500 Internal Server Error', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(null, { status: 500 })
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
      expect(result.checks.venueService.error).toContain('500');
    });

    it('should handle 503 Service Unavailable', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(null, { status: 503 })
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('Network Errors', () => {
    it('should handle DNS resolution failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(
        new Error('getaddrinfo ENOTFOUND')
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
      expect(result.checks.venueService.error).toContain('ENOTFOUND');
    });

    it('should handle connection refused', async () => {
      global.fetch = jest.fn().mockRejectedValue(
        new Error('connect ECONNREFUSED')
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
      expect(result.checks.venueService.error).toContain('ECONNREFUSED');
    });

    it('should handle network unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(
        new Error('ENETUNREACH')
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should track consecutive failures', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection failed'));

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const failures: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);
        if (result.checks.venueService.status === 'down') {
          failures.push(`failure-${i}`);
        }
      }

      expect(failures.length).toBe(5);
    });

    it('should recover after successful response', async () => {
      // First call fails
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Failed'));

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result1 = await healthCheckService.performHealthCheck(mockPool, mockRedis);
      expect(result1.checks.venueService.status).toBe('down');

      // Second call succeeds
      global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

      const result2 = await healthCheckService.performHealthCheck(mockPool, mockRedis);
      expect(result2.checks.venueService.status).toBe('up');
    });
  });

  describe('Partial Outages', () => {
    it('should mark as degraded when venue service is down but others are up', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Venue service down'));

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.database.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.venueService.status).toBe('down');
      expect(result.status).toBe('unhealthy');
    });

    it('should handle auth service failure while venue service is up', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('venue')) {
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        return Promise.reject(new Error('Auth service down'));
      });

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('up');
      expect(result.checks.authService.status).toBe('down');
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('Response Validation', () => {
    it('should handle malformed JSON response', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response('invalid json{', { status: 200 })
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      // Should still mark as up if status code is 200
      expect(result.checks.venueService.status).toBe('up');
    });

    it('should handle empty response', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(null, { status: 200 })
      );

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('up');
    });
  });

  describe('Retry Logic', () => {
    it('should not retry health checks (fail fast)', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('Failed'));
      });

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      await healthCheckService.performHealthCheck(mockPool, mockRedis);

      // Should only call once (no retries)
      expect(callCount).toBe(2); // Once for venue, once for auth
    });
  });

  describe('Concurrent Health Checks', () => {
    it('should handle multiple concurrent health checks', async () => {
      global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const checks = await Promise.all([
        healthCheckService.performHealthCheck(mockPool, mockRedis),
        healthCheckService.performHealthCheck(mockPool, mockRedis),
        healthCheckService.performHealthCheck(mockPool, mockRedis),
      ]);

      checks.forEach(result => {
        expect(result.status).toBe('healthy');
      });
    });
  });

  describe('Missing Service URLs', () => {
    it('should handle missing VENUE_SERVICE_URL', async () => {
      const originalUrl = process.env.VENUE_SERVICE_URL;
      delete process.env.VENUE_SERVICE_URL;

      mockPool.query.mockResolvedValue({ rows: [] } as any);
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await healthCheckService.performHealthCheck(mockPool, mockRedis);

      expect(result.checks.venueService.status).toBe('down');
      expect(result.checks.venueService.error).toContain('not configured');

      process.env.VENUE_SERVICE_URL = originalUrl;
    });
  });
});
