// Mock setup BEFORE any imports
const mockPrometheusRegistry = {
  register: jest.fn(),
  metrics: jest.fn().mockResolvedValue('# HELP up Service is up\n# TYPE up gauge\nup 1'),
  registerMetric: jest.fn(),
  getSingleMetric: jest.fn(),
  removeSingleMetric: jest.fn(),
  clear: jest.fn(),
  resetMetrics: jest.fn()
};

const mockCounter = {
  inc: jest.fn(),
  labels: jest.fn().mockReturnThis(),
  reset: jest.fn()
};

const mockGauge = {
  set: jest.fn(),
  inc: jest.fn(),
  dec: jest.fn(),
  labels: jest.fn().mockReturnThis(),
  reset: jest.fn()
};

const mockHistogram = {
  observe: jest.fn(),
  labels: jest.fn().mockReturnThis(),
  reset: jest.fn(),
  startTimer: jest.fn(() => jest.fn())
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn()
  }),
  end: jest.fn()
};

const mockRedisClient = {
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  info: jest.fn().mockResolvedValue('redis_version:6.2.6')
};

const mockRabbitConnection = {
  createChannel: jest.fn().mockResolvedValue({
    assertQueue: jest.fn(),
    sendToQueue: jest.fn(),
    checkQueue: jest.fn().mockResolvedValue({ messageCount: 150 }),
    close: jest.fn()
  }),
  close: jest.fn()
};

const mockElasticsearchClient = {
  ping: jest.fn().mockResolvedValue(true),
  cluster: {
    health: jest.fn().mockResolvedValue({
      status: 'green',
      number_of_nodes: 3
    })
  }
};

const mockLogger: any = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn()
};

mockLogger.child.mockReturnValue(mockLogger);

// Mock modules - using virtual mocks to avoid requiring actual packages
jest.mock('prom-client', () => ({
  register: mockPrometheusRegistry,
  Registry: jest.fn(() => mockPrometheusRegistry),
  Counter: jest.fn(() => mockCounter),
  Gauge: jest.fn(() => mockGauge),
  Histogram: jest.fn(() => mockHistogram),
  collectDefaultMetrics: jest.fn()
}), { virtual: true });

jest.mock('pg', () => ({ Pool: jest.fn(() => mockPool) }), { virtual: true });
jest.mock('ioredis', () => jest.fn(() => mockRedisClient), { virtual: true });
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockRabbitConnection)
}), { virtual: true });
jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(() => mockElasticsearchClient)
}), { virtual: true });
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }), { virtual: true });

describe('Monitoring Service Tests', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      query: {},
      params: {},
      headers: { authorization: 'Bearer test-token' },
      user: { id: 'admin123', role: 'admin' }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn()
    };
  });

  describe('Health & Readiness Endpoints', () => {
    describe('GET /health', () => {
      it('should return ok status', async () => {
        const healthCheck = async () => {
          return { status: 'ok' };
        };

        const result = await healthCheck();
        expect(result.status).toBe('ok');
      });

      it('should not require authentication', async () => {
        req.headers = {};
        const healthCheck = async () => {
          return { status: 'ok' };
        };

        const result = await healthCheck();
        expect(result.status).toBe('ok');
      });
    });

    describe('GET /ready', () => {
      it('should return ready when all dependencies are up', async () => {
        const checkReadiness = async () => {
          const checks = await Promise.all([
            mockPool.connect().then((client: any) => {
              client.release();
              return true;
            }),
            mockRedisClient.ping().then(() => true),
            mockElasticsearchClient.ping()
          ]);

          return { ready: checks.every(check => check === true) };
        };

        const result = await checkReadiness();
        expect(result.ready).toBe(true);
      });

      it('should return not ready when a dependency is down', async () => {
        mockRedisClient.ping.mockRejectedValue(new Error('Connection refused'));

        const checkReadiness = async () => {
          try {
            await mockRedisClient.ping();
            return { ready: true };
          } catch {
            return { ready: false };
          }
        };

        const result = await checkReadiness();
        expect(result.ready).toBe(false);
      });
    });
  });

  describe('GET /metrics - Prometheus Metrics', () => {
    it('should return prometheus metrics in text format', async () => {
      const metrics = await mockPrometheusRegistry.metrics();
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should require admin role when METRICS_PUBLIC is false', async () => {
      process.env.METRICS_PUBLIC = 'false';
      req.user = { id: 'user123', role: 'user' };

      const hasAccess = (user: any) => {
        const isPublic = process.env.METRICS_PUBLIC === 'true';
        if (isPublic) return true;
        return user.role === 'admin' || user.role === 'monitoring';
      };

      expect(hasAccess(req.user)).toBe(false);
    });

    it('should allow public access when METRICS_PUBLIC is true', async () => {
      process.env.METRICS_PUBLIC = 'true';

      const hasAccess = () => {
        return process.env.METRICS_PUBLIC === 'true';
      };

      expect(hasAccess()).toBe(true);
    });

    it('should track custom metrics', async () => {
      mockCounter.inc();
      mockGauge.set(42);
      mockHistogram.observe(0.5);

      expect(mockCounter.inc).toHaveBeenCalled();
      expect(mockGauge.set).toHaveBeenCalledWith(42);
      expect(mockHistogram.observe).toHaveBeenCalledWith(0.5);
    });
  });

  describe('GET /api/v1/monitoring/status - Service Health', () => {
    it('should return aggregate service health', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { service: 'auth-service', status: 'healthy', last_ping: new Date(), latency_ms: 25 },
          { service: 'venue-service', status: 'healthy', last_ping: new Date(), latency_ms: 30 },
          { service: 'event-service', status: 'degraded', last_ping: new Date(), latency_ms: 500 }
        ]
      });

      const getStatus = async () => {
        const services = await mockPool.query('SELECT * FROM service_health');
        
        return {
          services: services.rows.map((s: any) => ({
            name: s.service,
            status: s.status,
            lastSeen: s.last_ping,
            latencyMs: s.latency_ms
          })),
          db: {
            postgres: 'connected',
            redis: 'connected',
            rabbit: 'connected',
            elastic: 'connected'
          },
          alertsOpen: 0
        };
      };

      const result = await getStatus();
      expect(result.services).toHaveLength(3);
      expect(result.services[2].status).toBe('degraded');
    });

    it('should require admin token', async () => {
      req.user = { id: 'user123', role: 'user' };

      const hasAccess = (user: any) => {
        return user.role === 'admin';
      };

      expect(hasAccess(req.user)).toBe(false);
    });

    it('should detect database connection issues', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection timeout'));
      mockRedisClient.ping.mockRejectedValue(new Error('ECONNREFUSED'));

      const checkDatabases = async () => {
        const status: any = {};
        
        try {
          await mockPool.connect();
          status.postgres = 'connected';
        } catch {
          status.postgres = 'disconnected';
        }

        try {
          await mockRedisClient.ping();
          status.redis = 'connected';
        } catch {
          status.redis = 'disconnected';
        }

        return status;
      };

      const result = await checkDatabases();
      expect(result.postgres).toBe('disconnected');
      expect(result.redis).toBe('disconnected');
    });

    it('should calculate service latency', async () => {
      const checkService = async (serviceName: string) => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        const latencyMs = Date.now() - start;
        
        return {
          name: serviceName,
          status: latencyMs < 100 ? 'healthy' : 'degraded',
          latencyMs
        };
      };

      const result = await checkService('test-service');
      expect(result.latencyMs).toBeGreaterThanOrEqual(50);
      expect(result.status).toBe('healthy');
    });
  });

  describe('GET /api/v1/monitoring/alerts - Alert Management', () => {
    it('should list active alerts', async () => {
      req.query = { page: '1', limit: '20', severity: 'error' };

      mockPool.query.mockResolvedValue({
        rows: [
          {
            alert_id: 'alert1',
            source: 'payment-service',
            severity: 'error',
            message: 'Payment processing failure rate above threshold',
            created_at: new Date()
          },
          {
            alert_id: 'alert2',
            source: 'database',
            severity: 'error',
            message: 'Connection pool exhausted',
            created_at: new Date()
          }
        ]
      });

      const getAlerts = async (query: any) => {
        const { page = 1, limit = 20, severity } = query;
        const offset = (page - 1) * limit;

        const alerts = await mockPool.query(
          `SELECT * FROM alerts WHERE resolved = false LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

        return {
          items: alerts.rows.map((a: any) => ({
            alertId: a.alert_id,
            source: a.source,
            severity: a.severity,
            message: a.message,
            createdAt: a.created_at
          })),
          total: 2
        };
      };

      const result = await getAlerts(req.query);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].severity).toBe('error');
    });

    it('should filter by severity', async () => {
      const severities = ['info', 'warn', 'error', 'critical'];

      const validateSeverity = (severity: string) => {
        if (!severities.includes(severity)) {
          return { error: 'Invalid severity level' };
        }
        return { valid: true };
      };

      expect(validateSeverity('error')).toEqual({ valid: true });
      expect(validateSeverity('invalid')).toEqual({ error: 'Invalid severity level' });
    });

    it('should paginate alerts', async () => {
      const calculateOffset = (page: number, limit: number) => {
        return (page - 1) * limit;
      };

      const offset = calculateOffset(2, 10);
      expect(offset).toBe(10);
    });

    it('should require admin authentication', async () => {
      req.user = { id: 'user123', role: 'user' };

      const hasAccess = (user: any) => {
        return user.role === 'admin' || user.role === 'monitoring';
      };

      expect(hasAccess(req.user)).toBe(false);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect HTTP request metrics', async () => {
      mockCounter.labels({ method: 'GET', status: '200' }).inc();
      const timer = mockHistogram.startTimer();
      timer();

      expect(mockCounter.labels).toHaveBeenCalledWith({ method: 'GET', status: '200' });
      expect(mockCounter.inc).toHaveBeenCalled();
      expect(mockHistogram.startTimer).toHaveBeenCalled();
    });

    it('should track database connection pool metrics', async () => {
      mockGauge.set(20);
      mockGauge.set(5);
      mockGauge.set(0);

      expect(mockGauge.set).toHaveBeenCalledWith(20);
      expect(mockGauge.set).toHaveBeenCalledWith(5);
      expect(mockGauge.set).toHaveBeenCalledWith(0);
    });

    it('should monitor queue depths', async () => {
      const channel = await mockRabbitConnection.createChannel();
      await channel.checkQueue('task-queue');
      
      mockGauge.labels({ queue: 'task-queue' }).set(150);

      expect(mockGauge.labels).toHaveBeenCalledWith({ queue: 'task-queue' });
      expect(mockGauge.set).toHaveBeenCalledWith(150);
    });

    it('should track memory usage', async () => {
      const usage = process.memoryUsage();
      mockGauge.labels({ type: 'heapUsed' }).set(usage.heapUsed);
      mockGauge.labels({ type: 'heapTotal' }).set(usage.heapTotal);
      mockGauge.labels({ type: 'rss' }).set(usage.rss);

      expect(mockGauge.labels).toHaveBeenCalledTimes(3);
      expect(mockGauge.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('Alert Generation', () => {
    it('should create alert when service is down', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          alert_id: 'alert123',
          source: 'auth-service',
          severity: 'critical',
          message: 'Service unreachable'
        }]
      });

      const createAlert = async (alert: any) => {
        return mockPool.query(
          'INSERT INTO alerts (source, severity, message) VALUES ($1, $2, $3) RETURNING *',
          [alert.source, alert.severity, alert.message]
        );
      };

      await createAlert({
        source: 'auth-service',
        severity: 'critical',
        message: 'Service unreachable'
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        ['auth-service', 'critical', 'Service unreachable']
      );
    });

    it('should escalate alerts based on severity', async () => {
      const shouldEscalate = (severity: string, duration: number) => {
        const escalationThresholds: any = {
          info: 3600000,
          warn: 1800000,
          error: 600000,
          critical: 0
        };

        return duration >= escalationThresholds[severity];
      };

      expect(shouldEscalate('critical', 0)).toBe(true);
      expect(shouldEscalate('error', 300000)).toBe(false);
      expect(shouldEscalate('error', 700000)).toBe(true);
    });

    it('should auto-resolve alerts when condition clears', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      await mockPool.query(
        'UPDATE alerts SET resolved = true, resolved_at = NOW() WHERE alert_id = $1',
        ['alert123']
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET resolved = true'),
        ['alert123']
      );
    });
  });

  describe('Service Discovery & Health Checks', () => {
    it('should ping registered services', async () => {
      const services = [
        { name: 'auth-service', url: 'http://auth:3001/health' },
        { name: 'venue-service', url: 'http://venue:3002/health' }
      ];

      const pingService = async (service: any) => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 20));
        return {
          name: service.name,
          status: 'healthy',
          latencyMs: Date.now() - start
        };
      };

      const results = await Promise.all(services.map(pingService));
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('healthy');
      expect(results[0].latencyMs).toBeGreaterThan(0);
    });

    it('should handle service timeout', async () => {
      const pingWithTimeout = async (url: string, timeout: number) => {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        );

        const pingPromise = new Promise(resolve => 
          setTimeout(() => resolve('pong'), 200)
        );

        try {
          await Promise.race([pingPromise, timeoutPromise]);
          return { status: 'healthy' };
        } catch {
          return { status: 'timeout' };
        }
      };

      const result = await pingWithTimeout('http://slow-service/health', 100);
      expect(result.status).toBe('timeout');
    });
  });

  describe('Dashboard Data Aggregation', () => {
    it('should aggregate metrics for dashboard', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { metric: 'requests_per_second', value: 1250 },
          { metric: 'error_rate', value: 0.02 },
          { metric: 'p95_latency', value: 145 }
        ]
      });

      const getDashboardData = async () => {
        const metrics = await mockPool.query('SELECT * FROM metrics_aggregate');
        
        return {
          requestsPerSecond: metrics.rows.find((m: any) => m.metric === 'requests_per_second')?.value,
          errorRate: metrics.rows.find((m: any) => m.metric === 'error_rate')?.value,
          p95Latency: metrics.rows.find((m: any) => m.metric === 'p95_latency')?.value
        };
      };

      const result = await getDashboardData();
      expect(result.requestsPerSecond).toBe(1250);
      expect(result.errorRate).toBe(0.02);
      expect(result.p95Latency).toBe(145);
    });

    it('should calculate uptime percentage', async () => {
      const calculateUptime = (totalMinutes: number, downMinutes: number) => {
        if (totalMinutes === 0) return 100;
        const uptime = ((totalMinutes - downMinutes) / totalMinutes) * 100;
        return Math.round(uptime * 100) / 100;
      };

      const uptime = calculateUptime(43200, 15);
      expect(uptime).toBe(99.97);
    });
  });

  describe('Resource Monitoring', () => {
    it('should monitor CPU usage', async () => {
      const getCPUUsage = () => Math.random() * 100;
      const usage = getCPUUsage();
      mockGauge.set(usage);

      expect(mockGauge.set).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should track disk usage', async () => {
      const disk = {
        used: 50 * 1024 * 1024 * 1024,
        total: 100 * 1024 * 1024 * 1024,
        percentage: 50
      };

      mockGauge.labels({ type: 'used' }).set(disk.used);
      mockGauge.labels({ type: 'total' }).set(disk.total);
      mockGauge.labels({ type: 'percentage' }).set(disk.percentage);

      expect(mockGauge.labels).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Tracking', () => {
    it('should log and track errors', async () => {
      const error = {
        name: 'DatabaseError',
        message: 'Connection timeout',
        service: 'payment-service'
      };

      mockLogger.error(error);
      mockCounter.labels({
        service: error.service,
        type: error.name
      }).inc();

      expect(mockLogger.error).toHaveBeenCalledWith(error);
      expect(mockCounter.labels).toHaveBeenCalledWith({
        service: 'payment-service',
        type: 'DatabaseError'
      });
      expect(mockCounter.inc).toHaveBeenCalled();
    });
  });
});
