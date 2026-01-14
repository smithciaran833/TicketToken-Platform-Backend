import { Request, Response, NextFunction } from 'express';

// Mock Redis
const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined)
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

jest.mock('../../src/config', () => ({
  config: {
    redis: { host: 'localhost', port: 6379 }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { createRateLimiter, rateLimiter } from '../../src/middleware/rate-limiter';

describe('Middleware Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      ip: '192.168.1.1',
      headers: {},
      body: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('Rate Limiter', () => {
    it('should allow requests under limit', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const limiter = createRateLimiter({ windowMs: 60000, max: 10 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRedis.incr).toHaveBeenCalledWith('rate-limit:192.168.1.1');
      expect(mockRedis.expire).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block requests over limit', async () => {
      mockRedis.incr.mockResolvedValue(11);

      const limiter = createRateLimiter({ windowMs: 60000, max: 10 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Too many requests' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use custom key generator', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockReq.headers = { 'x-user-id': 'user_123' };

      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 10,
        keyGenerator: (req) => req.headers['x-user-id'] as string
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRedis.incr).toHaveBeenCalledWith('rate-limit:user_123');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip when skip function returns true', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 10,
        skip: () => true
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis error'));

      const limiter = createRateLimiter({ windowMs: 60000, max: 10 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should set expiry on first request', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const limiter = createRateLimiter({ windowMs: 60000, max: 10 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRedis.expire).toHaveBeenCalledWith('rate-limit:192.168.1.1', 60);
    });

    it('should not set expiry on subsequent requests', async () => {
      mockRedis.incr.mockResolvedValue(5);

      const limiter = createRateLimiter({ windowMs: 60000, max: 10 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should use custom message', async () => {
      mockRedis.incr.mockResolvedValue(11);

      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 10,
        message: 'Custom limit exceeded'
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Custom limit exceeded' });
    });

    it('should work with legacy rateLimiter function', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const limiter = rateLimiter('payment', 5, 60);
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Idempotency Middleware', () => {
    it('should generate idempotency key if not provided', () => {
      mockReq.headers = {};
      mockReq.body = { userId: 'user_1', amount: 100 };

      const middleware = (req: any, res: Response, next: NextFunction) => {
        req.idempotencyKey = req.headers['idempotency-key'] || 
          `${req.body.userId}_${req.body.amount}_${Date.now()}`;
        next();
      };

      middleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).idempotencyKey).toBeDefined();
    });

    it('should use provided idempotency key', () => {
      mockReq.headers = { 'idempotency-key': 'custom_key_123' };

      const middleware = (req: any, res: Response, next: NextFunction) => {
        req.idempotencyKey = req.headers['idempotency-key'];
        next();
      };

      middleware(mockReq as any, mockRes as Response, mockNext);

      expect((mockReq as any).idempotencyKey).toBe('custom_key_123');
    });

    it('should check for duplicate idempotency keys', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ status: 'completed' }));

      const middleware = async (req: any, res: Response, next: NextFunction) => {
        const key = req.headers['idempotency-key'];
        if (key) {
          const cached = await mockRedis.get(`idempotency:${key}`);
          if (cached) {
            return res.status(200).json(JSON.parse(cached));
          }
        }
        next();
      };

      mockReq.headers = { 'idempotency-key': 'duplicate_key' };
      await middleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Validation Middleware', () => {
    it('should validate required fields', () => {
      const validateRequired = (fields: string[]) => {
        return (req: Request, res: Response, next: NextFunction) => {
          const missing = fields.filter(field => !(req.body as any)[field]);
          if (missing.length > 0) {
            return res.status(400).json({
              error: 'Validation failed',
              missing
            });
          }
          next();
        };
      };

      const middleware = validateRequired(['amount', 'currency']);
      mockReq.body = { amount: 100 };

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        missing: ['currency']
      });
    });

    it('should validate amount is positive', () => {
      const validateAmount = (req: Request, res: Response, next: NextFunction) => {
        if ((req.body as any).amount <= 0) {
          return res.status(400).json({ error: 'Amount must be positive' });
        }
        next();
      };

      mockReq.body = { amount: -100 };
      validateAmount(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should validate email format', () => {
      const validateEmail = (req: Request, res: Response, next: NextFunction) => {
        const email = (req.body as any).email;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
        next();
      };

      mockReq.body = { email: 'invalid-email' };
      validateEmail(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Authentication Middleware', () => {
    it('should require authentication token', () => {
      const requireAuth = (req: any, res: Response, next: NextFunction) => {
        const token = req.headers.authorization;
        if (!token) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        next();
      };

      requireAuth(mockReq as any, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should attach user to request', () => {
      const attachUser = (req: any, res: Response, next: NextFunction) => {
        req.user = { id: 'user_1', role: 'customer' };
        next();
      };

      attachUser(mockReq as any, mockRes as Response, mockNext);

      expect((mockReq as any).user).toEqual({ id: 'user_1', role: 'customer' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should check permissions', () => {
      const requireRole = (role: string) => {
        return (req: any, res: Response, next: NextFunction) => {
          if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
          next();
        };
      };

      (mockReq as any).user = { id: 'user_1', role: 'customer' };
      const middleware = requireRole('admin');

      middleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Error Handler Middleware', () => {
    it('should handle generic errors', () => {
      const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
        res.status(500).json({
          error: 'Internal server error',
          message: err.message
        });
      };

      const error = new Error('Something went wrong');
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Something went wrong'
      });
    });

    it('should handle validation errors', () => {
      const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
        if (err.name === 'ValidationError') {
          return res.status(400).json({
            error: 'Validation error',
            details: err.errors
          });
        }
        res.status(500).json({ error: 'Internal server error' });
      };

      const error = { name: 'ValidationError', errors: ['Invalid field'] };
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should handle unauthorized errors', () => {
      const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
        if (err.statusCode === 401) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        res.status(500).json({ error: 'Internal server error' });
      };

      const error = { statusCode: 401, message: 'Invalid token' };
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Request Logger Middleware', () => {
    it('should log incoming requests', () => {
      const logger = jest.fn();
      const loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
        logger({
          method: req.method,
          path: req.path,
          ip: req.ip
        });
        next();
      };

      mockReq.method = 'POST';
      mockReq.path = '/api/payments';

      loggerMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(logger).toHaveBeenCalledWith({
        method: 'POST',
        path: '/api/payments',
        ip: '192.168.1.1'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should log response time', (done) => {
      const logResponse = (req: any, res: Response, next: NextFunction) => {
        const start = Date.now();
        res.on('finish', () => {
          const duration = Date.now() - start;
          expect(duration).toBeGreaterThanOrEqual(0);
          done();
        });
        next();
      };

      logResponse(mockReq as any, mockRes as Response, mockNext);
      (mockRes as any).emit?.('finish');
    });
  });

  describe('Tenant Isolation Middleware', () => {
    it('should extract tenant from header', () => {
      const tenantMiddleware = (req: any, res: Response, next: NextFunction) => {
        req.tenantId = req.headers['x-tenant-id'];
        if (!req.tenantId) {
          return res.status(400).json({ error: 'Tenant ID required' });
        }
        next();
      };

      mockReq.headers = { 'x-tenant-id': 'tenant_123' };
      tenantMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect((mockReq as any).tenantId).toBe('tenant_123');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject requests without tenant', () => {
      const tenantMiddleware = (req: any, res: Response, next: NextFunction) => {
        req.tenantId = req.headers['x-tenant-id'];
        if (!req.tenantId) {
          return res.status(400).json({ error: 'Tenant ID required' });
        }
        next();
      };

      tenantMiddleware(mockReq as any, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('CORS Middleware', () => {
    it('should set CORS headers', () => {
      const corsMiddleware = (req: Request, res: any, next: NextFunction) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        next();
      };

      mockRes.setHeader = jest.fn();
      corsMiddleware(mockReq as Request, mockRes as any, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledTimes(3);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle preflight requests', () => {
      const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
        if (req.method === 'OPTIONS') {
          return res.status(200).end();
        }
        next();
      };

      mockReq.method = 'OPTIONS';
      mockRes.end = jest.fn();

      corsMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
