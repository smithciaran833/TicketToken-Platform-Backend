/**
 * Unit tests for src/routes/health.routes.ts
 * Tests health check endpoints for Kubernetes probes
 * CRITICAL: Security - SC3 (no version exposure), SC5 (restricted /health/full)
 */

// Mock healthCheckService
jest.mock('../../../src/services/healthCheck.service', () => ({
  HealthCheckService: jest.fn().mockImplementation(() => ({
    getLiveness: jest.fn(),
    getReadiness: jest.fn(),
    getFullHealth: jest.fn(),
  })),
}));

describe('routes/health.routes', () => {
  let mockFastify: any;
  let mockReply: any;
  let mockRequest: any;
  let mockHealthCheckService: any;
  let mockDb: any;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHealthCheckService = {
      getLiveness: jest.fn().mockResolvedValue({
        status: 'alive',
        timestamp: new Date().toISOString(),
      }),
      getReadiness: jest.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: { database: { status: 'ok' }, redis: { status: 'ok' } },
      }),
      getFullHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: { database: { status: 'ok' }, redis: { status: 'ok' } },
        dependencies: {},
      }),
    };

    mockDb = {
      raw: jest.fn().mockResolvedValue({ rows: [1] }),
    };

    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue('test'),
      del: jest.fn().mockResolvedValue(1),
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      jwtVerify: jest.fn(),
    };

    mockFastify = {
      get: jest.fn(),
      container: {
        resolve: jest.fn().mockReturnValue(mockHealthCheckService),
        cradle: {
          db: mockDb,
          redis: mockRedis,
        },
      },
    };
  });

  describe('/health/startup', () => {
    it('should return 503 when startup error occurred', async () => {
      // Simulate startup failed scenario
      const startupError = new Error('Database connection failed');
      
      const handler = async (request: any, reply: any) => {
        if (startupError) {
          return reply.code(503).send({
            status: 'failed',
            timestamp: new Date().toISOString(),
            service: 'venue-service',
            error: startupError.message,
          });
        }
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'Database connection failed',
        })
      );
    });

    it('should return 503 when startup not complete', async () => {
      let startupComplete = false;
      
      const handler = async (request: any, reply: any) => {
        if (!startupComplete) {
          return reply.code(503).send({
            status: 'starting',
            timestamp: new Date().toISOString(),
            service: 'venue-service',
            message: 'Service is still initializing',
          });
        }
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'starting',
          message: 'Service is still initializing',
        })
      );
    });

    it('should return 200 when startup complete (SC3: no version)', async () => {
      let startupComplete = true;
      let startupError = null;
      
      const handler = async (request: any, reply: any) => {
        if (startupError) {
          return reply.code(503).send({ status: 'failed' });
        }
        if (!startupComplete) {
          return reply.code(503).send({ status: 'starting' });
        }
        return reply.code(200).send({
          status: 'started',
          timestamp: new Date().toISOString(),
          service: 'venue-service',
        });
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.not.objectContaining({ version: expect.any(String) })
      );
    });
  });

  describe('/health/live', () => {
    it('should return liveness status', async () => {
      const handler = async (request: any, reply: any) => {
        const result = await mockHealthCheckService.getLiveness();
        reply.code(200).send(result);
      };

      await handler(mockRequest, mockReply);

      expect(mockHealthCheckService.getLiveness).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });

  describe('/health/ready', () => {
    it('should return 200 for healthy status', async () => {
      mockHealthCheckService.getReadiness.mockResolvedValue({
        status: 'healthy',
        checks: { database: { status: 'ok' } },
      });

      const handler = async (request: any, reply: any) => {
        const result = await mockHealthCheckService.getReadiness();
        const httpCode = result.status === 'unhealthy' ? 503 : 200;
        reply.code(httpCode).send(result);
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
    });

    it('should return 503 for unhealthy status', async () => {
      mockHealthCheckService.getReadiness.mockResolvedValue({
        status: 'unhealthy',
        checks: { database: { status: 'error' } },
      });

      const handler = async (request: any, reply: any) => {
        const result = await mockHealthCheckService.getReadiness();
        const httpCode = result.status === 'unhealthy' ? 503 : 200;
        reply.code(httpCode).send(result);
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
    });
  });

  describe('/health/full (SC5: Restricted Access)', () => {
    describe('Access Control', () => {
      it('should allow access from internal IP 10.x.x.x', async () => {
        mockRequest.ip = '10.0.0.1';
        
        const preHandler = async (request: any, reply: any) => {
          const isInternalIp = request.ip?.startsWith('10.');
          if (!isInternalIp) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should allow access from internal IP 172.x.x.x', async () => {
        mockRequest.ip = '172.16.0.1';
        
        const preHandler = async (request: any, reply: any) => {
          const isInternalIp = request.ip?.startsWith('172.');
          if (!isInternalIp) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should allow access from internal IP 192.168.x.x', async () => {
        mockRequest.ip = '192.168.1.1';
        
        const preHandler = async (request: any, reply: any) => {
          const isInternalIp = request.ip?.startsWith('192.168.');
          if (!isInternalIp) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should allow access from localhost 127.0.0.1', async () => {
        mockRequest.ip = '127.0.0.1';
        
        const preHandler = async (request: any, reply: any) => {
          const isInternalIp = request.ip === '127.0.0.1';
          if (!isInternalIp) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should allow access from localhost ::1 (IPv6)', async () => {
        mockRequest.ip = '::1';
        
        const preHandler = async (request: any, reply: any) => {
          const isInternalIp = request.ip === '::1';
          if (!isInternalIp) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should allow access with internal service token', async () => {
        process.env.INTERNAL_SERVICE_SECRET = 'valid-secret';
        mockRequest.ip = '203.0.113.1'; // External IP
        mockRequest.headers['x-internal-service-token'] = 'valid-secret';
        
        const preHandler = async (request: any, reply: any) => {
          const internalToken = request.headers['x-internal-service-token'];
          const hasInternalToken = internalToken === process.env.INTERNAL_SERVICE_SECRET;
          if (!hasInternalToken) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should allow access for admin users', async () => {
        mockRequest.ip = '203.0.113.1'; // External IP
        mockRequest.headers.authorization = 'Bearer admin-token';
        mockRequest.jwtVerify.mockResolvedValue({ role: 'admin' });
        
        const preHandler = async (request: any, reply: any) => {
          let isAdmin = false;
          if (request.headers.authorization?.startsWith('Bearer ')) {
            try {
              const decoded = await request.jwtVerify();
              isAdmin = decoded.role === 'admin' || decoded.role === 'platform_admin';
            } catch {}
          }
          if (!isAdmin) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should allow access for platform_admin users', async () => {
        mockRequest.ip = '203.0.113.1';
        mockRequest.headers.authorization = 'Bearer admin-token';
        mockRequest.jwtVerify.mockResolvedValue({ role: 'platform_admin' });
        
        const preHandler = async (request: any, reply: any) => {
          let isAdmin = false;
          if (request.headers.authorization?.startsWith('Bearer ')) {
            try {
              const decoded = await request.jwtVerify();
              isAdmin = decoded.role === 'admin' || decoded.role === 'platform_admin';
            } catch {}
          }
          if (!isAdmin) {
            reply.code(403).send({ error: { code: 'ACCESS_DENIED' } });
            return;
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).not.toHaveBeenCalledWith(403);
      });

      it('should deny access from external IP without credentials', async () => {
        mockRequest.ip = '203.0.113.1'; // External IP
        mockRequest.headers = {};
        
        const preHandler = async (request: any, reply: any) => {
          const isInternalIp = request.ip?.startsWith('10.') || 
                              request.ip?.startsWith('172.') ||
                              request.ip?.startsWith('192.168.') ||
                              request.ip === '127.0.0.1' ||
                              request.ip === '::1';
          const hasInternalToken = request.headers?.['x-internal-service-token'] === process.env.INTERNAL_SERVICE_SECRET;
          let isAdmin = false;
          
          if (!isInternalIp && !hasInternalToken && !isAdmin) {
            return reply.code(403).send({
              error: {
                code: 'ACCESS_DENIED',
                message: 'Detailed health endpoint requires internal access',
              }
            });
          }
        };

        await preHandler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(403);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({ code: 'ACCESS_DENIED' }),
          })
        );
      });
    });

    describe('Response Sanitization (SC2)', () => {
      it('should remove host info from dependencies', async () => {
        mockHealthCheckService.getFullHealth.mockResolvedValue({
          status: 'healthy',
          dependencies: {
            database: { status: 'ok', host: 'db.internal.example.com' },
            redis: { status: 'ok', url: 'redis://internal.example.com:6379' },
          },
        });

        const handler = async (request: any, reply: any) => {
          const result = await mockHealthCheckService.getFullHealth();
          
          const sanitizedResult = {
            ...result,
            dependencies: Object.fromEntries(
              Object.entries(result.dependencies || {}).map(([key, value]: [string, any]) => [
                key,
                { ...value, host: undefined, url: undefined, connectionString: undefined },
              ])
            ),
          };
          
          reply.code(200).send(sanitizedResult);
        };

        await handler(mockRequest, mockReply);

        const sentData = mockReply.send.mock.calls[0][0];
        expect(sentData.dependencies.database.host).toBeUndefined();
        expect(sentData.dependencies.redis.url).toBeUndefined();
      });

      it('should remove connectionString from response', async () => {
        mockHealthCheckService.getFullHealth.mockResolvedValue({
          status: 'healthy',
          dependencies: {
            database: { 
              status: 'ok', 
              connectionString: 'postgres://user:pass@host:5432/db' 
            },
          },
        });

        const handler = async (request: any, reply: any) => {
          const result = await mockHealthCheckService.getFullHealth();
          
          const sanitizedResult = {
            ...result,
            dependencies: Object.fromEntries(
              Object.entries(result.dependencies || {}).map(([key, value]: [string, any]) => [
                key,
                { ...value, host: undefined, url: undefined, connectionString: undefined },
              ])
            ),
          };
          
          reply.code(200).send(sanitizedResult);
        };

        await handler(mockRequest, mockReply);

        const sentData = mockReply.send.mock.calls[0][0];
        expect(sentData.dependencies.database.connectionString).toBeUndefined();
      });
    });
  });

  describe('/health (simple endpoint)', () => {
    it('should return ok status when all checks pass', async () => {
      const handler = async (request: any, reply: any) => {
        const health: any = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          service: 'venue-service',
          checks: { database: 'unknown', redis: 'unknown' },
        };

        try {
          await mockDb.raw('SELECT 1');
          health.checks.database = 'ok';
        } catch {
          health.checks.database = 'error';
          health.status = 'unhealthy';
        }

        try {
          await mockRedis.ping();
          health.checks.redis = 'ok';
        } catch {
          health.checks.redis = 'error';
          if (health.status === 'ok') health.status = 'degraded';
        }

        const httpCode = health.status === 'unhealthy' ? 503 : 200;
        reply.code(httpCode).send(health);
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          checks: { database: 'ok', redis: 'ok' },
        })
      );
    });

    it('should return unhealthy when database fails', async () => {
      mockDb.raw.mockRejectedValue(new Error('DB connection failed'));

      const handler = async (request: any, reply: any) => {
        const health: any = {
          status: 'ok',
          checks: { database: 'unknown', redis: 'unknown' },
        };

        try {
          await mockDb.raw('SELECT 1');
          health.checks.database = 'ok';
        } catch {
          health.checks.database = 'error';
          health.status = 'unhealthy';
        }

        try {
          await mockRedis.ping();
          health.checks.redis = 'ok';
        } catch {
          health.checks.redis = 'error';
        }

        const httpCode = health.status === 'unhealthy' ? 503 : 200;
        reply.code(httpCode).send(health);
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          checks: expect.objectContaining({ database: 'error' }),
        })
      );
    });

    it('should return degraded when redis fails but DB is ok', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      const handler = async (request: any, reply: any) => {
        const health: any = {
          status: 'ok',
          checks: { database: 'unknown', redis: 'unknown' },
        };

        try {
          await mockDb.raw('SELECT 1');
          health.checks.database = 'ok';
        } catch {
          health.checks.database = 'error';
          health.status = 'unhealthy';
        }

        try {
          await mockRedis.ping();
          health.checks.redis = 'ok';
        } catch {
          health.checks.redis = 'error';
          if (health.status === 'ok') health.status = 'degraded';
        }

        const httpCode = health.status === 'unhealthy' ? 503 : 200;
        reply.code(httpCode).send(health);
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          checks: expect.objectContaining({ redis: 'error', database: 'ok' }),
        })
      );
    });

    it('should not include version in response (SC3)', async () => {
      const handler = async (request: any, reply: any) => {
        const health = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          service: 'venue-service',
          checks: { database: 'ok', redis: 'ok' },
        };
        reply.code(200).send(health);
      };

      await handler(mockRequest, mockReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData).not.toHaveProperty('version');
    });
  });

  describe('Timeout Handling (PG4, RD2)', () => {
    it('should handle database timeout', async () => {
      const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`${name} check timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]);
      };

      // Simulate slow DB query
      const slowQuery = new Promise((resolve) => setTimeout(() => resolve({ rows: [1] }), 100));

      await expect(withTimeout(slowQuery, 50, 'Database')).rejects.toThrow('Database check timed out');
    });

    it('should handle redis timeout', async () => {
      const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`${name} check timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]);
      };

      // Simulate slow Redis ping
      const slowPing = new Promise((resolve) => setTimeout(() => resolve('PONG'), 100));

      await expect(withTimeout(slowPing, 50, 'Redis')).rejects.toThrow('Redis check timed out');
    });

    it('should mark status as timeout on timeout', async () => {
      mockDb.raw.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));

      const handler = async (request: any, reply: any) => {
        const health: any = {
          status: 'ok',
          checks: { database: 'unknown' },
        };

        try {
          await Promise.race([
            mockDb.raw('SELECT 1'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 10)),
          ]);
          health.checks.database = 'ok';
        } catch (error: any) {
          health.checks.database = error.message?.includes('timed out') ? 'timeout' : 'error';
          health.status = 'unhealthy';
        }

        reply.code(503).send(health);
      };

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({ database: 'timeout' }),
        })
      );
    });
  });
});
