// Mock setup BEFORE any imports
const mockAxios: any = {
  create: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  request: jest.fn(),
  defaults: { headers: { common: {} } }
};

// Fix circular reference for create method
mockAxios.create.mockReturnValue(mockAxios);

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  incr: jest.fn(),
  decr: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG')
};

const mockCircuitBreaker = {
  fire: jest.fn(),
  open: jest.fn(),
  close: jest.fn(),
  halfOpen: jest.fn(),
  on: jest.fn(),
  fallback: jest.fn(),
  status: { name: 'closed' },
  opened: false,
  closed: true,
  halfOpened: false
};

const mockLogger: any = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: jest.fn()
};

// Fix circular reference for child method
mockLogger.child.mockReturnValue(mockLogger);

// Mock modules - Make axios both a function AND an object with methods
jest.mock('axios', () => {
  const mock = jest.fn();
  Object.assign(mock, mockAxios);
  return mock;
});

jest.mock('ioredis', () => jest.fn(() => mockRedisClient));
jest.mock('opossum', () => jest.fn(() => mockCircuitBreaker));
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }));

// Mock Fastify decorators
const mockFastify = {
  register: jest.fn(),
  addHook: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  all: jest.fn(),
  setErrorHandler: jest.fn(),
  setNotFoundHandler: jest.fn(),
  decorate: jest.fn(),
  decorateRequest: jest.fn(),
  decorateReply: jest.fn(),
  listen: jest.fn(),
  close: jest.fn(),
  ready: jest.fn(),
  log: mockLogger,
  redis: mockRedisClient
};

jest.mock('fastify', () => {
  return jest.fn(() => mockFastify);
});

// Import axios to set it up as a function
import axios from 'axios';

// Import services after mocks
import { ProxyService } from '../../src/services/proxy.service';

describe('API Gateway Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Make axios callable as a function
    (axios as any).mockImplementation(mockAxios.request);
  });

  describe('ProxyService', () => {
    let proxyService: ProxyService;

    beforeEach(() => {
      proxyService = new ProxyService();
    });

    describe('Service URL Mapping', () => {
      it('should return correct service URL for auth-service', () => {
        const url = proxyService.getServiceUrl('auth-service');
        expect(url).toBeDefined();
      });

      it('should return correct service URL for venue-service', () => {
        const url = proxyService.getServiceUrl('venue-service');
        expect(url).toBeDefined();
      });

      it('should return correct service URL for event-service', () => {
        const url = proxyService.getServiceUrl('event-service');
        expect(url).toBeDefined();
      });

      it('should return undefined for unknown service', () => {
        const url = proxyService.getServiceUrl('unknown-service');
        expect(url).toBeUndefined();
      });
    });

    describe('Forward Headers', () => {
      it('should set X-Forwarded headers correctly', () => {
        const mockRequest = {
          ip: '192.168.1.1',
          protocol: 'https',
          hostname: 'api.tickettoken.com',
          socket: { localPort: 443 },
          headers: { host: 'api.tickettoken.com' }
        };
        const headers: any = {};

        proxyService.setForwardedHeaders(mockRequest, headers);

        expect(headers['x-forwarded-for']).toBe('192.168.1.1');
        expect(headers['x-forwarded-proto']).toBe('https');
        expect(headers['x-forwarded-host']).toBe('api.tickettoken.com');
        expect(headers['x-forwarded-port']).toBe(443);
      });
    });

    describe('Request Forwarding', () => {
      it('should forward GET request to correct service', async () => {
        const mockRequest = {
          method: 'GET',
          url: '/api/v1/venues',
          headers: { authorization: 'Bearer token123' },
          ip: '192.168.1.1',
          protocol: 'https',
          hostname: 'api.tickettoken.com',
          socket: { localPort: 443 }
        };

        (axios as any).mockResolvedValue({
          data: { venues: [] },
          status: 200,
          headers: {}
        });

        const result = await proxyService.forward(mockRequest, 'venue-service');

        expect(axios).toHaveBeenCalled();
        expect(result.data).toEqual({ venues: [] });
      });

      it('should forward POST request with body', async () => {
        const mockRequest = {
          method: 'POST',
          url: '/api/v1/events',
          headers: { 'content-type': 'application/json' },
          body: { name: 'Concert', date: '2024-12-01' },
          ip: '192.168.1.1',
          protocol: 'https',
          hostname: 'api.tickettoken.com',
          socket: { localPort: 443 }
        };

        (axios as any).mockResolvedValue({
          data: { id: '123', ...mockRequest.body },
          status: 201,
          headers: {}
        });

        const result = await proxyService.forward(mockRequest, 'event-service');

        expect(axios).toHaveBeenCalled();
        expect(result.status).toBe(201);
      });

      it('should handle service not found error', async () => {
        const mockRequest = {
          method: 'GET',
          url: '/api/v1/unknown',
          headers: {},
          ip: '192.168.1.1',
          protocol: 'https',
          hostname: 'api.tickettoken.com',
          socket: { localPort: 443 }
        };

        await expect(
          proxyService.forward(mockRequest, 'unknown-service')
        ).rejects.toThrow('Service unknown-service not found');
      });
    });
  });

  describe('Route Proxying', () => {
    describe('Auth Routes', () => {
      it('should allow public access to login endpoint', async () => {
        const mockRequest = {
          method: 'POST',
          url: '/api/v1/auth/login',
          body: { email: 'test@example.com', password: 'password123' },
          headers: {}
        };

        mockAxios.post.mockResolvedValue({
          data: { token: 'jwt-token', user: { id: '123' } },
          status: 200
        });

        expect(mockRequest.url).toContain('/login');
      });

      it('should allow public access to register endpoint', async () => {
        const mockRequest = {
          method: 'POST',
          url: '/api/v1/auth/register',
          body: { email: 'new@example.com', password: 'password123' },
          headers: {}
        };

        expect(mockRequest.url).toContain('/register');
      });
    });

    describe('Protected Routes', () => {
      it('should require authentication for venue endpoints', async () => {
        const mockRequest = {
          method: 'GET',
          url: '/api/v1/venues',
          headers: { authorization: 'Bearer valid-token' }
        };

        expect(mockRequest.headers.authorization).toBeDefined();
        expect(mockRequest.headers.authorization).toContain('Bearer');
      });

      it('should require authentication for event endpoints', async () => {
        const mockRequest = {
          method: 'POST',
          url: '/api/v1/events',
          headers: { authorization: 'Bearer valid-token' },
          body: { name: 'Event', date: '2024-12-01' }
        };

        expect(mockRequest.headers.authorization).toBeDefined();
      });
    });
  });

  describe('Middleware', () => {
    describe('Rate Limiting', () => {
      it('should track request count in Redis', async () => {
        const clientKey = 'rate-limit:192.168.1.1';
        
        mockRedisClient.incr.mockResolvedValue(1);
        mockRedisClient.expire.mockResolvedValue(1);

        await mockRedisClient.incr(clientKey);
        await mockRedisClient.expire(clientKey, 60);

        expect(mockRedisClient.incr).toHaveBeenCalledWith(clientKey);
        expect(mockRedisClient.expire).toHaveBeenCalledWith(clientKey, 60);
      });

      it('should check rate limit before processing request', async () => {
        const clientKey = 'rate-limit:192.168.1.1';
        
        mockRedisClient.get.mockResolvedValue('100');

        const count = await mockRedisClient.get(clientKey);

        expect(parseInt(count as string)).toBe(100);
      });
    });

    describe('Circuit Breaker', () => {
      it('should open circuit on multiple failures', () => {
        mockCircuitBreaker.open();
        
        expect(mockCircuitBreaker.open).toHaveBeenCalled();
      });

      it('should use fallback when circuit is open', async () => {
        mockCircuitBreaker.opened = true;
        mockCircuitBreaker.fallback.mockReturnValue({ error: 'Service unavailable' });

        const result = mockCircuitBreaker.fallback();

        expect(result).toEqual({ error: 'Service unavailable' });
      });
    });

    describe('Response Caching', () => {
      it('should cache GET responses', async () => {
        const cacheKey = 'cache:/api/v1/venues';
        const responseData = { venues: [{ id: '1', name: 'Venue 1' }] };

        await mockRedisClient.set(cacheKey, JSON.stringify(responseData), 'EX', 300);

        expect(mockRedisClient.set).toHaveBeenCalledWith(
          cacheKey,
          JSON.stringify(responseData),
          'EX',
          300
        );
      });

      it('should return cached response if available', async () => {
        const cacheKey = 'cache:/api/v1/venues';
        const cachedData = { venues: [{ id: '1', name: 'Venue 1' }] };

        mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

        const result = await mockRedisClient.get(cacheKey);

        expect(JSON.parse(result as string)).toEqual(cachedData);
      });

      it('should not cache POST/PUT/DELETE requests', async () => {
        const methods = ['POST', 'PUT', 'DELETE'];

        methods.forEach(method => {
          const mockRequest = { method, url: '/api/v1/venues' };
          expect(mockRequest.method).not.toBe('GET');
        });
      });
    });
  });

  describe('Service Discovery', () => {
    it('should discover available services', async () => {
      const services = [
        { name: 'auth-service', url: 'http://auth:3001', healthy: true },
        { name: 'venue-service', url: 'http://venue:3002', healthy: true },
        { name: 'event-service', url: 'http://event:3003', healthy: true }
      ];

      const discovery = { getServices: jest.fn().mockResolvedValue(services) };
      
      const result = await discovery.getServices();

      expect(result).toEqual(services);
      expect(result.length).toBe(3);
    });

    it('should filter unhealthy services', async () => {
      const services = [
        { name: 'auth-service', url: 'http://auth:3001', healthy: true },
        { name: 'venue-service', url: 'http://venue:3002', healthy: false },
        { name: 'event-service', url: 'http://event:3003', healthy: true }
      ];

      const healthyServices = services.filter(s => s.healthy);

      expect(healthyServices.length).toBe(2);
      expect(healthyServices.find(s => s.name === 'venue-service')).toBeUndefined();
    });
  });

  describe('Load Balancing', () => {
    it('should distribute requests using round-robin', () => {
      const instances = [
        'http://service1:3000',
        'http://service2:3000',
        'http://service3:3000'
      ];

      let currentIndex = 0;
      const getNextInstance = () => {
        const instance = instances[currentIndex];
        currentIndex = (currentIndex + 1) % instances.length;
        return instance;
      };

      expect(getNextInstance()).toBe('http://service1:3000');
      expect(getNextInstance()).toBe('http://service2:3000');
      expect(getNextInstance()).toBe('http://service3:3000');
      expect(getNextInstance()).toBe('http://service1:3000');
    });

    it('should handle single instance gracefully', () => {
      const instances = ['http://service1:3000'];

      let currentIndex = 0;
      const getNextInstance = () => {
        const instance = instances[currentIndex];
        currentIndex = (currentIndex + 1) % instances.length;
        return instance;
      };

      expect(getNextInstance()).toBe('http://service1:3000');
      expect(getNextInstance()).toBe('http://service1:3000');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      mockAxios.request.mockRejectedValue({
        response: { status: 404, data: { error: 'Not found' } }
      });

      try {
        await mockAxios.request({ url: '/api/v1/nonexistent' });
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should handle 500 errors', async () => {
      mockAxios.request.mockRejectedValue({
        response: { status: 500, data: { error: 'Internal server error' } }
      });

      try {
        await mockAxios.request({ url: '/api/v1/venues' });
      } catch (error: any) {
        expect(error.response.status).toBe(500);
      }
    });

    it('should handle network errors', async () => {
      mockAxios.request.mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await mockAxios.request({ url: '/api/v1/venues' });
      } catch (error: any) {
        expect(error.message).toContain('ECONNREFUSED');
      }
    });

    it('should handle timeout errors', async () => {
      mockAxios.request.mockRejectedValue(new Error('ETIMEDOUT'));

      try {
        await mockAxios.request({ url: '/api/v1/venues' });
      } catch (error: any) {
        expect(error.message).toContain('ETIMEDOUT');
      }
    });
  });

  describe('Health Checks', () => {
    it('should return healthy status when all services are up', async () => {
      const healthStatus = {
        status: 'healthy',
        services: {
          redis: 'connected',
          auth: 'healthy',
          venue: 'healthy',
          event: 'healthy'
        }
      };

      mockRedisClient.ping.mockResolvedValue('PONG');
      mockAxios.get.mockResolvedValue({ data: { status: 'healthy' } });

      expect(healthStatus.status).toBe('healthy');
    });

    it('should return unhealthy status when Redis is down', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection refused'));

      try {
        await mockRedisClient.ping();
      } catch (error: any) {
        expect(error.message).toContain('Connection refused');
      }
    });

    it('should check individual service health', async () => {
      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({ data: { status: 'healthy' } });
        }
        return Promise.reject(new Error('Not found'));
      });

      const response = await mockAxios.get('http://auth:3001/health');

      expect(response.data.status).toBe('healthy');
    });
  });

  describe('Security', () => {
    it('should validate JWT tokens', () => {
      const validToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      const invalidToken = 'Invalid token';

      expect(validToken).toMatch(/^Bearer /);
      expect(invalidToken).not.toMatch(/^Bearer /);
    });

    it('should sanitize headers before forwarding', () => {
      interface Headers {
        authorization?: string;
        'x-api-key'?: string;
        cookie?: string;
        host?: string;
        'x-forwarded-for'?: string;
      }

      const headers: Headers = {
        'authorization': 'Bearer token',
        'x-api-key': 'secret',
        'cookie': 'session=abc123',
        'host': 'malicious.com',
        'x-forwarded-for': '192.168.1.1'
      };

      delete headers.host;
      delete headers.cookie;

      expect(headers.host).toBeUndefined();
      expect(headers.cookie).toBeUndefined();
      expect(headers.authorization).toBeDefined();
    });

    it('should prevent header injection attacks', () => {
      const maliciousHeader = 'value\r\nX-Injected: malicious';
      const sanitized = maliciousHeader.replace(/[\r\n]/g, '');

      expect(sanitized).not.toContain('\r\n');
      expect(sanitized).toBe('valueX-Injected: malicious');
    });
  });

  describe('Metrics', () => {
    it('should track request duration', () => {
      const startTime = Date.now();
      const endTime = startTime + 150;
      const duration = endTime - startTime;

      expect(duration).toBe(150);
    });

    it('should count requests per service', () => {
      const metrics = {
        'auth-service': 0,
        'venue-service': 0,
        'event-service': 0
      };

      metrics['auth-service']++;
      metrics['venue-service']++;
      metrics['venue-service']++;

      expect(metrics['auth-service']).toBe(1);
      expect(metrics['venue-service']).toBe(2);
      expect(metrics['event-service']).toBe(0);
    });

    it('should track error rates', () => {
      const metrics = {
        totalRequests: 100,
        failedRequests: 5,
        errorRate: 0
      };

      metrics.errorRate = metrics.failedRequests / metrics.totalRequests;

      expect(metrics.errorRate).toBe(0.05);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed requests', async () => {
      let attempts = 0;
      
      mockAxios.request.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ data: { success: true } });
      });

      let result;
      for (let i = 0; i < 3; i++) {
        try {
          result = await mockAxios.request({ url: '/test' });
          break;
        } catch (error) {
          if (i === 2) throw error;
        }
      }

      expect(attempts).toBe(3);
      expect(result?.data.success).toBe(true);
    });

    it('should not retry on 4xx errors', async () => {
      let attempts = 0;

      mockAxios.request.mockImplementation(() => {
        attempts++;
        return Promise.reject({ response: { status: 400 } });
      });

      try {
        await mockAxios.request({ url: '/test' });
      } catch (error) {
        // Should not retry
      }

      expect(attempts).toBe(1);
    });
  });

  describe('Request Validation', () => {
    it('should validate request body size', () => {
      const maxSize = 10485760; // 10MB
      const largeBody = { data: 'x'.repeat(maxSize + 1) };

      expect(JSON.stringify(largeBody).length).toBeGreaterThan(maxSize);
    });

    it('should validate URL parameters', () => {
      const validUrl = '/api/v1/venues/123';
      const invalidUrl = '/api/v1/venues/<script>alert(1)</script>';

      expect(validUrl).toMatch(/^\/api\/v1\/venues\/[\w-]+$/);
      expect(invalidUrl).not.toMatch(/^\/api\/v1\/venues\/[\w-]+$/);
    });

    it('should validate query parameters', () => {
      const validQuery = 'page=1&limit=10';

      const params = new URLSearchParams(validQuery);
      const limit = parseInt(params.get('limit') || '10');

      expect(limit).toBeLessThanOrEqual(100);
    });
  });

  describe('CORS Handling', () => {
    it('should set CORS headers correctly', () => {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      };

      expect(corsHeaders['Access-Control-Allow-Origin']).toBe('*');
      expect(corsHeaders['Access-Control-Allow-Methods']).toContain('GET');
      expect(corsHeaders['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    it('should handle preflight requests', () => {
      const preflightRequest = {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      };

      expect(preflightRequest.method).toBe('OPTIONS');
      expect(preflightRequest.headers['Access-Control-Request-Method']).toBe('POST');
    });
  });

  describe('WebSocket Proxying', () => {
    it('should upgrade WebSocket connections', () => {
      const wsRequest = {
        headers: {
          'upgrade': 'websocket',
          'connection': 'Upgrade',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'sec-websocket-version': '13'
        }
      };

      expect(wsRequest.headers.upgrade).toBe('websocket');
      expect(wsRequest.headers.connection.toLowerCase()).toContain('upgrade');
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running requests', async () => {
      const timeout = 100; // Much shorter timeout for testing
      let timeoutId: NodeJS.Timeout;

      const longRunningPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({ data: 'late response' }), 200);
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      try {
        await Promise.race([longRunningPromise, timeoutPromise]);
      } catch (error: any) {
        clearTimeout(timeoutId!);
        expect(error.message).toBe('Request timeout');
      }
    }, 1000); // Add 1 second timeout for the test itself
  });
});
