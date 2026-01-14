// Mock knex
const mockTransaction = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockUpdate = jest.fn();
const mockFirst = jest.fn();
const mockInsert = jest.fn();
const mockRaw = jest.fn((sql, params) => ({ sql, params }));

const mockTrx = jest.fn((table: string) => ({
  where: mockWhere,
  update: mockUpdate,
  first: mockFirst,
  insert: mockInsert,
}));
mockTrx.raw = mockRaw;
mockTrx.commit = jest.fn();
mockTrx.rollback = jest.fn();

jest.mock('knex', () => {
  return jest.fn(() => ({
    transaction: jest.fn().mockResolvedValue(mockTrx),
    raw: mockRaw,
  }));
});

// Mock OrderServiceClient
const mockCreateOrder = jest.fn();
const mockCancelOrder = jest.fn();

jest.mock('../../../src/clients/OrderServiceClient', () => ({
  orderServiceClient: {
    createOrder: mockCreateOrder,
    cancelOrder: mockCancelOrder,
  },
  OrderServiceError: class OrderServiceError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'OrderServiceError';
    }
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Mock shared library
jest.mock('@tickettoken/shared', () => ({
  percentOfCents: jest.fn((cents, percent) => Math.round(cents * percent / 100)),
  addCents: jest.fn((a, b) => a + b),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import { PurchaseSaga } from '../../../src/sagas/PurchaseSaga';

describe('PurchaseSaga', () => {
  let saga: PurchaseSaga;

  const mockRequest = {
    userId: 'user-123',
    eventId: 'event-456',
    tenantId: 'tenant-789',
    items: [
      { ticketTypeId: 'type-1', quantity: 2 },
      { ticketTypeId: 'type-2', quantity: 1 },
    ],
    discountCodes: ['SAVE10'],
    idempotencyKey: 'idem-key-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    saga = new PurchaseSaga();

    // Default mock implementations
    mockWhere.mockReturnThis();
    mockUpdate.mockResolvedValue(1); // 1 row updated
    mockFirst.mockResolvedValue({
      id: 'type-1',
      price_cents: 5000,
      available_quantity: 10,
      name: 'General Admission',
    });
    mockInsert.mockResolvedValue([1]);
    mockCreateOrder.mockResolvedValue({
      orderId: 'order-123',
      orderNumber: 'ORD-001',
      status: 'pending',
      totalCents: 15000,
    });
  });

  describe('execute', () => {
    it('should complete purchase saga successfully', async () => {
      const result = await saga.execute(mockRequest);

      expect(result.orderId).toBe('order-123');
      expect(result.orderNumber).toBe('ORD-001');
      expect(result.tickets).toBeDefined();
      expect(mockTrx.commit).toHaveBeenCalled();
    });

    it('should reserve inventory in step 1', async () => {
      await saga.execute(mockRequest);

      // Should call update for each ticket type
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should create order via order service in step 2', async () => {
      await saga.execute(mockRequest);

      expect(mockCreateOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          eventId: 'event-456',
          idempotencyKey: 'idem-key-123',
        })
      );
    });

    it('should create tickets in step 3', async () => {
      await saga.execute(mockRequest);

      // Should insert tickets (2 + 1 = 3 tickets total)
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should rollback on inventory reservation failure', async () => {
      mockUpdate.mockResolvedValue(0); // No rows updated = insufficient inventory

      await expect(saga.execute(mockRequest)).rejects.toThrow('INSUFFICIENT_INVENTORY');
      expect(mockTrx.rollback).toHaveBeenCalled();
    });

    it('should compensate when order creation fails', async () => {
      mockCreateOrder.mockRejectedValue(new Error('Order service unavailable'));

      await expect(saga.execute(mockRequest)).rejects.toThrow('Order service unavailable');
      expect(mockTrx.rollback).toHaveBeenCalled();
    });

    it('should compensate when ticket creation fails', async () => {
      mockInsert.mockRejectedValueOnce(new Error('DB error'));

      await expect(saga.execute(mockRequest)).rejects.toThrow('DB error');
      expect(mockTrx.rollback).toHaveBeenCalled();
      expect(mockCancelOrder).toHaveBeenCalled();
    });

    it('should include discount codes in order metadata', async () => {
      await saga.execute(mockRequest);

      expect(mockCreateOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            discountCodes: ['SAVE10'],
          }),
        })
      );
    });
  });

  describe('compensation', () => {
    it('should release inventory on compensation', async () => {
      // Force failure after inventory reserved
      mockCreateOrder.mockRejectedValue(new Error('Failed'));

      await expect(saga.execute(mockRequest)).rejects.toThrow();

      // Inventory compensation should be triggered
      // (via compensateInventory which updates ticket_types)
    });

    it('should cancel order on compensation', async () => {
      // Force failure after order created
      mockInsert.mockRejectedValueOnce(new Error('Ticket creation failed'));

      await expect(saga.execute(mockRequest)).rejects.toThrow();

      expect(mockCancelOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123',
          reason: expect.stringContaining('compensation'),
        })
      );
    });

    it('should handle compensation failures gracefully', async () => {
      mockInsert.mockRejectedValueOnce(new Error('Ticket creation failed'));
      mockCancelOrder.mockRejectedValue(new Error('Cancel failed'));

      // Should not throw additional error from compensation
      await expect(saga.execute(mockRequest)).rejects.toThrow('Ticket creation failed');
    });
  });
});
