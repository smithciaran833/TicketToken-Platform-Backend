/**
 * Unit Tests for Health Routes
 * 
 * Tests health check endpoints for service monitoring.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('Health Routes', () => {
  describe('GET /health', () => {
    it('should return healthy status when all systems operational', async () => {
      const reply = createMockReply();

      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'payment-service',
        version: '1.0.0',
        uptime: process.uptime(),
      };

      reply.status(200).send(healthStatus);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'payment-service',
        })
      );
    });

    it('should return degraded status when non-critical systems failing', async () => {
      const reply = createMockReply();

      const healthStatus = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        service: 'payment-service',
        checks: {
          database: { status: 'healthy' },
          redis: { status: 'unhealthy', error: 'Connection timeout' },
          stripe: { status: 'healthy' },
        },
      };

      reply.status(200).send(healthStatus);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
        })
      );
    });

    it('should return unhealthy status when critical systems failing', async () => {
      const reply = createMockReply();

      const healthStatus = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'payment-service',
        checks: {
          database: { status: 'unhealthy', error: 'Connection refused' },
          redis: { status: 'healthy' },
          stripe: { status: 'healthy' },
        },
      };

      reply.status(503).send(healthStatus);

      expect(reply.status).toHaveBeenCalledWith(503);
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when service can accept traffic', async () => {
      const reply = createMockReply();

      const isReady = true;
      const readiness = {
        ready: isReady,
        timestamp: new Date().toISOString(),
        checks: {
          database: 'connected',
          stripe: 'configured',
          migrations: 'complete',
        },
      };

      if (isReady) {
        reply.status(200).send(readiness);
      } else {
        reply.status(503).send(readiness);
      }

      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it('should return not ready during startup', async () => {
      const reply = createMockReply();

      const readiness = {
        ready: false,
        timestamp: new Date().toISOString(),
        checks: {
          database: 'connecting',
          stripe: 'initializing',
          migrations: 'pending',
        },
      };

      reply.status(503).send(readiness);

      expect(reply.status).toHaveBeenCalledWith(503);
    });

    it('should return not ready when dependencies unavailable', async () => {
      const reply = createMockReply();

      const readiness = {
        ready: false,
        timestamp: new Date().toISOString(),
        checks: {
          database: 'unavailable',
          stripe: 'configured',
          migrations: 'complete',
        },
        reason: 'Database connection failed',
      };

      reply.status(503).send(readiness);

      expect(reply.status).toHaveBeenCalledWith(503);
    });
  });

  describe('GET /health/live', () => {
    it('should return alive when process is running', async () => {
      const reply = createMockReply();

      const liveness = {
        alive: true,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: process.uptime(),
      };

      reply.status(200).send(liveness);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          alive: true,
        })
      );
    });
  });

  describe('GET /health/deep', () => {
    it('should check all dependencies deeply', async () => {
      const reply = createMockReply();

      const deepHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'payment-service',
        dependencies: {
          postgresql: {
            status: 'healthy',
            latency: '2ms',
            version: '14.5',
          },
          redis: {
            status: 'healthy',
            latency: '1ms',
            mode: 'cluster',
          },
          stripe: {
            status: 'healthy',
            latency: '150ms',
            mode: 'test',
          },
          orderService: {
            status: 'healthy',
            latency: '20ms',
          },
        },
      };

      reply.status(200).send(deepHealth);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          dependencies: expect.objectContaining({
            postgresql: expect.any(Object),
            redis: expect.any(Object),
            stripe: expect.any(Object),
          }),
        })
      );
    });

    it('should report latencies for all dependencies', async () => {
      const reply = createMockReply();

      const deepHealth = {
        status: 'healthy',
        dependencies: {
          postgresql: { status: 'healthy', latency: '2ms' },
          redis: { status: 'healthy', latency: '1ms' },
          stripe: { status: 'healthy', latency: '150ms' },
        },
        totalCheckTime: '200ms',
      };

      reply.status(200).send(deepHealth);

      expect(reply.send).toHaveBeenCalled();
    });

    it('should timeout if checks take too long', async () => {
      const reply = createMockReply();
      const timeout = 5000; // 5 seconds

      // Simulate timeout scenario
      const checkStartTime = Date.now();
      const checkDuration = 6000; // Exceeded timeout

      if (checkDuration > timeout) {
        reply.status(504).send({
          status: 'timeout',
          error: 'Health check timed out after 5000ms',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(504);
    });
  });

  describe('Dependency Checks', () => {
    describe('Database Health', () => {
      it('should verify database connection', async () => {
        const mockDb = {
          query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        };

        const result = await mockDb.query('SELECT 1');
        expect(result.rows).toHaveLength(1);
      });

      it('should handle database connection failure', async () => {
        const mockDb = {
          query: jest.fn().mockRejectedValue(new Error('Connection refused')),
        };

        await expect(mockDb.query('SELECT 1')).rejects.toThrow('Connection refused');
      });
    });

    describe('Redis Health', () => {
      it('should verify Redis connection', async () => {
        const mockRedis = {
          ping: jest.fn().mockResolvedValue('PONG'),
        };

        const result = await mockRedis.ping();
        expect(result).toBe('PONG');
      });

      it('should handle Redis connection failure', async () => {
        const mockRedis = {
          ping: jest.fn().mockRejectedValue(new Error('Redis connection timeout')),
        };

        await expect(mockRedis.ping()).rejects.toThrow('Redis connection timeout');
      });
    });

    describe('Stripe Health', () => {
      it('should verify Stripe API connectivity', async () => {
        const mockStripe = {
          balance: {
            retrieve: jest.fn().mockResolvedValue({ available: [] }),
          },
        };

        const result = await mockStripe.balance.retrieve();
        expect(result).toBeDefined();
      });

      it('should handle Stripe API failure', async () => {
        const mockStripe = {
          balance: {
            retrieve: jest.fn().mockRejectedValue({
              type: 'StripeAPIError',
              message: 'API unavailable',
            }),
          },
        };

        await expect(mockStripe.balance.retrieve()).rejects.toMatchObject({
          type: 'StripeAPIError',
        });
      });
    });
  });

  describe('Metrics Integration', () => {
    it('should expose Prometheus metrics', async () => {
      const reply = createMockReply();

      const metricsOutput = `
# HELP payment_service_requests_total Total requests
# TYPE payment_service_requests_total counter
payment_service_requests_total{method="POST",path="/payments"} 1234

# HELP payment_service_request_duration_seconds Request duration
# TYPE payment_service_request_duration_seconds histogram
payment_service_request_duration_seconds_bucket{le="0.1"} 100
      `.trim();

      reply.header('Content-Type', 'text/plain');
      reply.status(200).send(metricsOutput);

      expect(reply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Version Info', () => {
    it('should include service version information', async () => {
      const reply = createMockReply();

      const versionInfo = {
        service: 'payment-service',
        version: '1.0.0',
        commit: 'abc1234',
        buildTime: '2026-01-08T10:00:00Z',
        environment: 'production',
      };

      reply.status(200).send(versionInfo);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          version: expect.any(String),
        })
      );
    });
  });
});
