import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// =============================================================================
// MOCKS
// =============================================================================

const mockPool = {
  query: jest.fn(),
};

jest.mock('../../../src/config/database', () => ({
  pool: mockPool,
}));

// Import after mocking
import healthRoutes from '../../../src/routes/health.routes';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('healthRoutes', () => {
  let mockFastify: any;
  let registeredRoutes: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = [];

    mockFastify = {
      get: jest.fn((path, handler) => {
        registeredRoutes.push({ method: 'GET', path, handler });
      }),
    };

    mockPool.query.mockResolvedValue({ rows: [{ result: 1 }] });
  });

  // ===========================================================================
  // Route Registration - 3 test cases
  // ===========================================================================

  describe('Route Registration', () => {
    it('should register GET /health route', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(mockFastify.get).toHaveBeenCalledWith('/health', expect.any(Function));
    });

    it('should register GET /health/db route', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(mockFastify.get).toHaveBeenCalledWith('/health/db', expect.any(Function));
    });

    it('should register exactly two routes', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      expect(registeredRoutes).toHaveLength(2);
    });
  });

  // ===========================================================================
  // GET /health - 3 test cases
  // ===========================================================================

  describe('GET /health', () => {
    it('should return ok status', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result.status).toBe('ok');
    });

    it('should return service name', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result.service).toBe('payment-service');
    });

    it('should return health check object', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual({
        status: 'ok',
        service: 'payment-service',
      });
    });
  });

  // ===========================================================================
  // GET /health/db - Success Cases - 4 test cases
  // ===========================================================================

  describe('GET /health/db - Success', () => {
    it('should query database with SELECT 1', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return ok status when database connected', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result.status).toBe('ok');
      expect(result.database).toBe('connected');
    });

    it('should return service name when database connected', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result.service).toBe('payment-service');
    });

    it('should return complete health object when connected', async () => {
      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual({
        status: 'ok',
        database: 'connected',
        service: 'payment-service',
      });
    });
  });

  // ===========================================================================
  // GET /health/db - Error Cases - 5 test cases
  // ===========================================================================

  describe('GET /health/db - Error', () => {
    it('should handle database connection error', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'));

      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
      } as any;

      const result = await handler(mockRequest, mockReply);

      expect(result.status).toBe('error');
      expect(result.database).toBe('disconnected');
    });

    it('should return 503 status code on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'));

      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });

    it('should include error message in response', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection timeout'));

      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
      } as any;

      const result = await handler(mockRequest, mockReply);

      expect(result.error).toBe('Connection timeout');
    });

    it('should return service name even on error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
      } as any;

      const result = await handler(mockRequest, mockReply);

      expect(result.service).toBe('payment-service');
    });

    it('should return complete error object', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));

      await healthRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/health/db').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
      } as any;

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual({
        status: 'error',
        database: 'disconnected',
        error: 'DB error',
        service: 'payment-service',
      });
    });
  });
});
