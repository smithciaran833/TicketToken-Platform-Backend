import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// =============================================================================
// MOCKS
// =============================================================================

const mockController = {
  getTaxForm: jest.fn(),
  downloadTaxForm: jest.fn(),
  getTaxSummary: jest.fn(),
};

jest.mock('../../../src/controllers/compliance.controller', () => ({
  ComplianceController: jest.fn().mockImplementation(() => mockController),
}));

const mockAuthenticate = jest.fn((request, reply, done) => done());

jest.mock('../../../src/middleware/auth', () => ({
  authenticate: mockAuthenticate,
}));

// Import after mocking
import complianceRoutes from '../../../src/routes/compliance.routes';
import { ComplianceController } from '../../../src/controllers/compliance.controller';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('complianceRoutes', () => {
  let mockFastify: any;
  let registeredRoutes: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = [];

    mockFastify = {
      get: jest.fn((path, options, handler) => {
        registeredRoutes.push({ method: 'GET', path, options, handler });
      }),
    };

    mockController.getTaxForm.mockResolvedValue({ success: true });
    mockController.downloadTaxForm.mockResolvedValue({ success: true });
    mockController.getTaxSummary.mockResolvedValue({ success: true });
  });

  // ===========================================================================
  // Route Registration - 5 test cases
  // ===========================================================================

  describe('Route Registration', () => {
    it('should register GET /tax-forms/:year route', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/tax-forms/:year',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register GET /tax-forms/:year/download route', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/tax-forms/:year/download',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register GET /tax-summary route', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/tax-summary',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should create ComplianceController instance', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      expect(ComplianceController).toHaveBeenCalled();
    });

    it('should register exactly three routes', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      expect(registeredRoutes).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Authentication Middleware - 3 test cases
  // ===========================================================================

  describe('Authentication Middleware', () => {
    it('should use authenticate middleware on all routes', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      registeredRoutes.forEach(route => {
        expect(route.options.preHandler).toEqual([mockAuthenticate]);
      });
    });

    it('should apply authentication to tax forms route', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const taxFormsRoute = registeredRoutes.find(r => r.path === '/tax-forms/:year');
      expect(taxFormsRoute.options.preHandler).toContain(mockAuthenticate);
    });

    it('should apply authentication to download route', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const downloadRoute = registeredRoutes.find(r => r.path === '/tax-forms/:year/download');
      expect(downloadRoute.options.preHandler).toContain(mockAuthenticate);
    });
  });

  // ===========================================================================
  // GET /tax-forms/:year - 3 test cases
  // ===========================================================================

  describe('GET /tax-forms/:year', () => {
    it('should call controller getTaxForm method', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-forms/:year').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      await handler(mockRequest, mockReply);

      expect(mockController.getTaxForm).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should pass request and reply to controller', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-forms/:year').handler;
      const mockRequest = { params: { year: '2024' } } as any;
      const mockReply = { send: jest.fn() } as any;

      await handler(mockRequest, mockReply);

      expect(mockController.getTaxForm).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should return controller result', async () => {
      const expectedResult = { formData: 'test' };
      mockController.getTaxForm.mockResolvedValue(expectedResult);

      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-forms/:year').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual(expectedResult);
    });
  });

  // ===========================================================================
  // GET /tax-forms/:year/download - 3 test cases
  // ===========================================================================

  describe('GET /tax-forms/:year/download', () => {
    it('should call controller downloadTaxForm method', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-forms/:year/download').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      await handler(mockRequest, mockReply);

      expect(mockController.downloadTaxForm).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should pass request and reply to controller', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-forms/:year/download').handler;
      const mockRequest = { params: { year: '2023' } } as any;
      const mockReply = { send: jest.fn() } as any;

      await handler(mockRequest, mockReply);

      expect(mockController.downloadTaxForm).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should return controller result', async () => {
      const expectedResult = { download: 'url' };
      mockController.downloadTaxForm.mockResolvedValue(expectedResult);

      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-forms/:year/download').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual(expectedResult);
    });
  });

  // ===========================================================================
  // GET /tax-summary - 3 test cases
  // ===========================================================================

  describe('GET /tax-summary', () => {
    it('should call controller getTaxSummary method', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-summary').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      await handler(mockRequest, mockReply);

      expect(mockController.getTaxSummary).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should pass request and reply to controller', async () => {
      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-summary').handler;
      const mockRequest = { query: { year: '2024' } } as any;
      const mockReply = { send: jest.fn() } as any;

      await handler(mockRequest, mockReply);

      expect(mockController.getTaxSummary).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should return controller result', async () => {
      const expectedResult = { summary: 'data' };
      mockController.getTaxSummary.mockResolvedValue(expectedResult);

      await complianceRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes.find(r => r.path === '/tax-summary').handler;
      const mockRequest = {} as FastifyRequest;
      const mockReply = {} as FastifyReply;

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual(expectedResult);
    });
  });
});
