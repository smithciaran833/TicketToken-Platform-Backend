import { FastifyRequest, FastifyReply } from 'fastify';

// Mock shared library BEFORE importing controller
jest.mock('@tickettoken/shared', () => ({
  percentOfCents: jest.fn((amount, bps) => Math.round(amount * bps / 10000)),
  addCents: jest.fn((...args) => args.reduce((a, b) => a + b, 0)),
  formatCents: jest.fn((cents: number) => `$${(cents / 100).toFixed(2)}`),
  createAxiosInstance: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  })),
  getCacheManager: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  })),
  auditService: {
    logAction: jest.fn()
  }
}));

// Track mock call sequences
let mockFirstCallResults: any[] = [];
let mockFirstCallIndex = 0;
let mockUpdateResult = 1;

const mockChainable = {
  where: jest.fn().mockReturnThis(),
  first: jest.fn().mockImplementation(() => {
    const result = mockFirstCallResults[mockFirstCallIndex] ?? null;
    mockFirstCallIndex++;
    return Promise.resolve(result);
  }),
  insert: jest.fn().mockResolvedValue([1]),
  update: jest.fn().mockImplementation(() => Promise.resolve(mockUpdateResult)),
  select: jest.fn().mockReturnThis()
};

const mockTrx: any = jest.fn().mockImplementation(() => mockChainable);
mockTrx.commit = jest.fn().mockResolvedValue(undefined);
mockTrx.rollback = jest.fn().mockResolvedValue(undefined);
mockTrx.raw = jest.fn((sql, params) => `RAW: ${sql}`);

const mockKnexInstance: any = jest.fn().mockImplementation(() => mockChainable);
mockKnexInstance.transaction = jest.fn().mockResolvedValue(mockTrx);

jest.mock('knex', () => jest.fn(() => mockKnexInstance));

// Mock other dependencies
jest.mock('../../../src/services/discountService');
jest.mock('../../../src/sagas/PurchaseSaga');
jest.mock('../../../src/config', () => ({
  config: {
    features: {
      useOrderService: false
    }
  }
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

// Now import after mocks are set up
import { PurchaseController, purchaseController } from '../../../src/controllers/purchaseController';
import { discountService } from '../../../src/services/discountService';
import { PurchaseSaga } from '../../../src/sagas/PurchaseSaga';
import { config } from '../../../src/config';

// Helper to set up mock sequence
const setMockFirstResults = (results: any[]) => {
  mockFirstCallResults = results;
  mockFirstCallIndex = 0;
};

const setMockUpdateResult = (result: number) => {
  mockUpdateResult = result;
};

describe('PurchaseController', () => {
  let controller: PurchaseController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock state
    mockFirstCallResults = [];
    mockFirstCallIndex = 0;
    mockUpdateResult = 1;

    controller = new PurchaseController();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      status: mockStatus
    };

    mockRequest = {
      headers: { 'idempotency-key': 'test-idempotency-key' },
      body: {
        eventId: 'event-123',
        items: [{ ticketTypeId: 'tt-1', quantity: 2 }],
        tenantId: 'tenant-456'
      }
    } as any;

    (mockRequest as any).userId = 'user-123';

    // Reset config
    (config as any).features = { useOrderService: false };

    // Reset chainable mocks
    mockChainable.where.mockReturnThis();
    mockChainable.select.mockReturnThis();
    mockChainable.insert.mockResolvedValue([1]);
  });

  describe('createOrder', () => {
    it('should return 400 if idempotency key is missing', async () => {
      mockRequest.headers = {};

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header required'
      });
    });

    it('should return 400 if eventId is missing', async () => {
      (mockRequest.body as any).eventId = undefined;

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    });

    it('should return 400 if items is missing', async () => {
      (mockRequest.body as any).items = undefined;

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    });

    it('should return 400 if items is not an array', async () => {
      (mockRequest.body as any).items = 'not-an-array';

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    });

    it('should return 400 if items array is empty', async () => {
      (mockRequest.body as any).items = [];

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'eventId and items array required'
      });
    });

    it('should return 400 if tenantId is missing', async () => {
      (mockRequest.body as any).tenantId = undefined;

      await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'INVALID_REQUEST',
        message: 'tenantId required'
      });
    });

    describe('when useOrderService is true (saga mode)', () => {
      beforeEach(() => {
        (config as any).features = { useOrderService: true };
      });

      it('should create order via saga successfully', async () => {
        const mockSagaResult = {
          orderId: 'order-123',
          orderNumber: 'ORD-123',
          status: 'PENDING',
          totalCents: 5000,
          tickets: [{ id: 'ticket-1' }]
        };

        const mockSagaInstance = {
          execute: jest.fn().mockResolvedValue(mockSagaResult)
        };

        (PurchaseSaga as jest.Mock).mockImplementation(() => mockSagaInstance);
        setMockFirstResults([null]); // No cached idempotency

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith({
          orderId: 'order-123',
          orderNumber: 'ORD-123',
          status: 'PENDING',
          totalCents: 5000,
          totalFormatted: '$50.00',
          tickets: [{ id: 'ticket-1' }],
          message: 'Order created successfully via order-service'
        });
      });

      it('should return cached response for duplicate idempotency key', async () => {
        const cachedResponse = {
          orderId: 'cached-order-123',
          status: 'COMPLETED'
        };

        setMockFirstResults([
          { key: 'test-idempotency-key', response: JSON.stringify(cachedResponse) }
        ]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith(cachedResponse);
      });

      it('should handle INSUFFICIENT_INVENTORY error from saga', async () => {
        const mockSagaInstance = {
          execute: jest.fn().mockRejectedValue(new Error('INSUFFICIENT_INVENTORY: Only 1 ticket available'))
        };

        (PurchaseSaga as jest.Mock).mockImplementation(() => mockSagaInstance);
        setMockFirstResults([null]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(409);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'INSUFFICIENT_INVENTORY',
          message: 'INSUFFICIENT_INVENTORY: Only 1 ticket available'
        });
      });

      it('should handle OrderServiceUnavailableError from saga', async () => {
        const error = new Error('Service unavailable');
        error.name = 'OrderServiceUnavailableError';

        const mockSagaInstance = {
          execute: jest.fn().mockRejectedValue(error)
        };

        (PurchaseSaga as jest.Mock).mockImplementation(() => mockSagaInstance);
        setMockFirstResults([null]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(503);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'ORDER_SERVICE_UNAVAILABLE',
          message: 'Order service is temporarily unavailable. Please try again.'
        });
      });

      it('should handle OrderValidationError from saga', async () => {
        const error = new Error('Invalid order data');
        error.name = 'OrderValidationError';

        const mockSagaInstance = {
          execute: jest.fn().mockRejectedValue(error)
        };

        (PurchaseSaga as jest.Mock).mockImplementation(() => mockSagaInstance);
        setMockFirstResults([null]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'ORDER_VALIDATION_ERROR',
          message: 'Invalid order data'
        });
      });

      it('should handle generic errors from saga', async () => {
        const mockSagaInstance = {
          execute: jest.fn().mockRejectedValue(new Error('Unknown error'))
        };

        (PurchaseSaga as jest.Mock).mockImplementation(() => mockSagaInstance);
        setMockFirstResults([null]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'ORDER_CREATION_FAILED',
          message: 'Unknown error'
        });
      });

      it('should use tierId as fallback for ticketTypeId', async () => {
        (mockRequest.body as any).items = [{ tierId: 'tier-1', quantity: 1 }];

        const mockSagaInstance = {
          execute: jest.fn().mockResolvedValue({
            orderId: 'order-123',
            orderNumber: 'ORD-123',
            status: 'PENDING',
            totalCents: 2500,
            tickets: []
          })
        };

        (PurchaseSaga as jest.Mock).mockImplementation(() => mockSagaInstance);
        setMockFirstResults([null]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockSagaInstance.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [{ ticketTypeId: 'tier-1', quantity: 1 }]
          })
        );
      });

      it('should handle cached response that is already an object', async () => {
        const cachedResponse = {
          orderId: 'cached-order-123',
          status: 'COMPLETED'
        };

        setMockFirstResults([
          { key: 'test-idempotency-key', response: cachedResponse }
        ]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith(cachedResponse);
      });
    });

    describe('when useOrderService is false (legacy mode)', () => {
      beforeEach(() => {
        (config as any).features = { useOrderService: false };
      });

      it('should return cached response for duplicate idempotency key in legacy mode', async () => {
        const cachedResponse = {
          orderId: 'cached-order-123',
          status: 'COMPLETED'
        };

        setMockFirstResults([
          { key: 'test-idempotency-key', response: JSON.stringify(cachedResponse) }
        ]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockTrx.rollback).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith(cachedResponse);
      });

      it('should handle ticket type not found error', async () => {
        setMockFirstResults([
          null, // idempotency check - no cached
          null  // ticket type not found
        ]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockTrx.rollback).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(404);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'TICKET_TYPE_NOT_FOUND',
          message: expect.stringContaining('not found or does not belong to this tenant')
        });
      });

      it('should handle INSUFFICIENT_INVENTORY error in legacy mode', async () => {
        const ticketType = {
          id: 'tt-1',
          price: 25.00,
          tenant_id: 'tenant-456',
          name: 'GA',
          available_quantity: 10
        };

        setMockFirstResults([
          null,       // idempotency check
          ticketType, // ticket type found
          { available_quantity: 1, name: 'GA' } // current availability
        ]);
        setMockUpdateResult(0); // No rows updated = insufficient

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockTrx.rollback).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(409);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'INSUFFICIENT_INVENTORY',
          message: expect.stringContaining('INSUFFICIENT_INVENTORY')
        });
      });

      it('should apply discounts when discount codes provided', async () => {
        (mockRequest.body as any).discountCodes = ['SAVE10'];

        const ticketType = {
          id: 'tt-1',
          price: 25.00,
          tenant_id: 'tenant-456',
          name: 'GA',
          available_quantity: 10
        };

        setMockFirstResults([
          null,       // idempotency check
          ticketType  // ticket type found
        ]);
        setMockUpdateResult(1);

        (discountService.applyDiscounts as jest.Mock).mockResolvedValue({
          totalDiscountCents: 500,
          discountsApplied: [{
            discountId: 'discount-1',
            code: 'SAVE10',
            type: 'PERCENTAGE',
            amountInCents: 500
          }],
          finalAmountCents: 4500
        });

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(discountService.applyDiscounts).toHaveBeenCalledWith(
          5000,
          ['SAVE10'],
          'event-123'
        );
        expect(mockTrx.commit).toHaveBeenCalled();
      });

      it('should create order successfully in legacy mode', async () => {
        const ticketType = {
          id: 'tt-1',
          price: 25.00,
          tenant_id: 'tenant-456',
          name: 'GA',
          available_quantity: 10
        };

        setMockFirstResults([
          null,       // idempotency check
          ticketType  // ticket type found
        ]);
        setMockUpdateResult(1);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockTrx.commit).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'pending',
            message: 'Order created successfully'
          })
        );
      });

      it('should use tierId as fallback for ticketTypeId in legacy mode', async () => {
        (mockRequest.body as any).items = [{ tierId: 'tier-1', quantity: 1 }];

        const ticketType = {
          id: 'tier-1',
          price: 50.00,
          tenant_id: 'tenant-456',
          name: 'VIP',
          available_quantity: 5
        };

        setMockFirstResults([
          null,       // idempotency check
          ticketType  // ticket type found
        ]);
        setMockUpdateResult(1);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockTrx.commit).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(200);
      });

      it('should handle generic errors in legacy mode', async () => {
        mockChainable.first.mockRejectedValueOnce(new Error('Database connection failed'));

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockTrx.rollback).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockSend).toHaveBeenCalledWith({
          error: 'ORDER_CREATION_FAILED',
          message: 'Database connection failed'
        });
      });

      it('should handle cached response that is already an object in legacy mode', async () => {
        const cachedResponse = {
          orderId: 'cached-order-123',
          status: 'COMPLETED'
        };

        setMockFirstResults([
          { key: 'test-idempotency-key', response: cachedResponse }
        ]);

        await controller.createOrder(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockTrx.rollback).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith(cachedResponse);
      });
    });
  });

  describe('purchaseController singleton', () => {
    it('should export a singleton instance', () => {
      expect(purchaseController).toBeInstanceOf(PurchaseController);
    });
  });
});
