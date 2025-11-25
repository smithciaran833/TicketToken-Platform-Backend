import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// =============================================================================
// MOCKS
// =============================================================================

const mockTaxCalculator = {
  calculateTax: jest.fn(),
};

jest.mock('../../../src/services/compliance/tax-calculator.service', () => ({
  TaxCalculatorService: jest.fn().mockImplementation(() => mockTaxCalculator),
}));

const mockInternalAuth = jest.fn((request, reply, done) => done());

jest.mock('../../../src/middleware/internal-auth', () => ({
  internalAuth: mockInternalAuth,
}));

// Import after mocking
import internalTaxRoutes from '../../../src/routes/internal-tax.routes';
import { TaxCalculatorService } from '../../../src/services/compliance/tax-calculator.service';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('internalTaxRoutes', () => {
  let mockFastify: any;
  let registeredRoutes: any[];
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = [];

    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    mockFastify = {
      post: jest.fn((path, options, handler) => {
        registeredRoutes.push({ method: 'POST', path, options, handler });
      }),
    };

    mockTaxCalculator.calculateTax.mockResolvedValue({
      taxAmount: 850,
      totalAmount: 10850,
      rate: 0.085,
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // Route Registration - 4 test cases
  // ===========================================================================

  describe('Route Registration', () => {
    it('should register POST /internal/calculate-tax route', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      expect(mockFastify.post).toHaveBeenCalledWith(
        '/internal/calculate-tax',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should create TaxCalculatorService instance', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      expect(TaxCalculatorService).toHaveBeenCalled();
    });

    it('should register route with internal auth middleware', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      expect(registeredRoutes[0].options.preHandler).toEqual([mockInternalAuth]);
    });

    it('should register exactly one route', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      expect(registeredRoutes).toHaveLength(1);
    });
  });

  // ===========================================================================
  // POST /internal/calculate-tax - Success Cases - 6 test cases
  // ===========================================================================

  describe('POST /internal/calculate-tax - Success', () => {
    it('should calculate tax with correct parameters', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: { city: 'New York', state: 'NY' },
          customerAddress: { city: 'Brooklyn', state: 'NY' },
        },
      } as any;
      const mockReply = {
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockTaxCalculator.calculateTax).toHaveBeenCalledWith(
        10000,
        { city: 'New York', state: 'NY' },
        { city: 'Brooklyn', state: 'NY' }
      );
    });

    it('should return tax calculation result', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: {},
          customerAddress: {},
        },
      } as any;
      const mockReply = {
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        taxAmount: 850,
        totalAmount: 10850,
        rate: 0.085,
      });
    });

    it('should log requesting service name', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: {},
          customerAddress: {},
        },
        internalService: 'order-service',
      } as any;
      const mockReply = {
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Tax calculation requested by:',
        'order-service'
      );
    });

    it('should handle requests with all address fields', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 5000,
          venueAddress: {
            street: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            zip: '90001',
          },
          customerAddress: {
            street: '456 Oak Ave',
            city: 'San Francisco',
            state: 'CA',
            zip: '94102',
          },
        },
      } as any;
      const mockReply = {
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockTaxCalculator.calculateTax).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should handle different amount values', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 25000,
          venueAddress: {},
          customerAddress: {},
        },
      } as any;
      const mockReply = {
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockTaxCalculator.calculateTax).toHaveBeenCalledWith(
        25000,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle undefined internalService gracefully', async () => {
      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: {},
          customerAddress: {},
        },
      } as any;
      const mockReply = {
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Tax calculation requested by:',
        undefined
      );
    });
  });

  // ===========================================================================
  // POST /internal/calculate-tax - Error Cases - 4 test cases
  // ===========================================================================

  describe('POST /internal/calculate-tax - Error', () => {
    it('should handle tax calculation errors', async () => {
      mockTaxCalculator.calculateTax.mockRejectedValue(new Error('Tax service unavailable'));

      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: {},
          customerAddress: {},
        },
      } as any;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Tax calculation failed',
      });
    });

    it('should log tax calculation errors', async () => {
      const errorSpy = jest.spyOn(console, 'error');
      const error = new Error('Tax service error');
      mockTaxCalculator.calculateTax.mockRejectedValue(error);

      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: {},
          customerAddress: {},
        },
      } as any;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(errorSpy).toHaveBeenCalledWith('Tax calculation error:', error);
    });

    it('should return 500 status on error', async () => {
      mockTaxCalculator.calculateTax.mockRejectedValue(new Error('Error'));

      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: {},
          customerAddress: {},
        },
      } as any;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should return error message on failure', async () => {
      mockTaxCalculator.calculateTax.mockRejectedValue(new Error('Failed'));

      await internalTaxRoutes(mockFastify as FastifyInstance);

      const handler = registeredRoutes[0].handler;
      const mockRequest = {
        body: {
          amount: 10000,
          venueAddress: {},
          customerAddress: {},
        },
      } as any;
      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Tax calculation failed',
      });
    });
  });
});
