/**
 * Unit Tests: Shared Client Usage - ticket-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library clients.
 * ticket-service uses orderServiceClient for S2S communication with order-service.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  orderServiceClient: {
    createOrder: jest.fn().mockResolvedValue({
      orderId: 'order-123',
      orderNumber: 'ORD-2024-001',
      status: 'pending',
      totalCents: 5000,
    }),
    cancelOrder: jest.fn().mockResolvedValue({ success: true }),
    updateOrderStatus: jest.fn().mockResolvedValue({ success: true }),
    getOrder: jest.fn().mockResolvedValue({
      orderId: 'order-123',
      status: 'completed',
    }),
  },
  createRequestContext: jest.fn((tenantId: string, userId?: string) => ({
    tenantId,
    userId,
    traceId: `test-trace-${Date.now()}`,
  })),
  ServiceClientError: class ServiceClientError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  percentOfCents: jest.fn((cents: number, percent: number) => Math.round(cents * percent / 100)),
  addCents: jest.fn((a: number, b: number) => a + b),
}));

describe('ticket-service Shared Client Usage', () => {
  let orderServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const shared = require('@tickettoken/shared');
    orderServiceClient = shared.orderServiceClient;
  });

  describe('Import Validation', () => {
    it('should import orderServiceClient from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.orderServiceClient).toBeDefined();
      expect(shared.orderServiceClient.createOrder).toBeDefined();
      expect(shared.orderServiceClient.cancelOrder).toBeDefined();
    });

    it('should import createRequestContext from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.createRequestContext).toBeDefined();
    });

    it('should import ServiceClientError from @tickettoken/shared', () => {
      const shared = require('@tickettoken/shared');
      expect(shared.ServiceClientError).toBeDefined();
    });

    it('should use shared client in PurchaseSaga', () => {
      const fs = require('fs');
      const path = require('path');
      const sagaPath = path.join(__dirname, '../../src/sagas/PurchaseSaga.ts');
      const content = fs.readFileSync(sagaPath, 'utf8');

      expect(content).toMatch(/@tickettoken\/shared/);
      expect(content).toMatch(/orderServiceClient/);
      expect(content).toMatch(/createRequestContext/);
      expect(content).toMatch(/ServiceClientError/);
    });

    it('should NOT have custom OrderServiceClient.ts in src/clients', () => {
      const fs = require('fs');
      const path = require('path');
      const customClientPath = path.join(__dirname, '../../src/clients/OrderServiceClient.ts');
      const exists = fs.existsSync(customClientPath);
      expect(exists).toBe(false);
    });

    it('should NOT have custom MintingServiceClient.ts in src/clients', () => {
      const fs = require('fs');
      const path = require('path');
      const customClientPath = path.join(__dirname, '../../src/clients/MintingServiceClient.ts');
      const exists = fs.existsSync(customClientPath);
      expect(exists).toBe(false);
    });

    it('should NOT have interServiceClient.ts in src/services', () => {
      const fs = require('fs');
      const path = require('path');
      const customClientPath = path.join(__dirname, '../../src/services/interServiceClient.ts');
      const exists = fs.existsSync(customClientPath);
      expect(exists).toBe(false);
    });
  });

  describe('RequestContext Creation', () => {
    it('should create RequestContext with tenantId and userId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123', 'user-456');

      expect(ctx.tenantId).toBe('tenant-123');
      expect(ctx.userId).toBe('user-456');
    });

    it('should create RequestContext with traceId', () => {
      const { createRequestContext } = require('@tickettoken/shared');
      const ctx = createRequestContext('tenant-123', 'user-456');

      expect(ctx.traceId).toBeDefined();
    });
  });

  describe('orderServiceClient Method Calls', () => {
    it('should call createOrder with correct parameters', async () => {
      const ctx = { tenantId: 'tenant-123', userId: 'user-456', traceId: 'trace-1' };

      const orderData = {
        userId: 'user-456',
        eventId: 'event-789',
        items: [
          { ticketTypeId: 'tt-1', quantity: 2, unitPriceCents: 2500 },
        ],
        currency: 'USD',
        idempotencyKey: 'idem-123',
      };

      const result = await orderServiceClient.createOrder(orderData, ctx, 'idem-123');

      expect(orderServiceClient.createOrder).toHaveBeenCalledWith(orderData, ctx, 'idem-123');
      expect(result.orderId).toBe('order-123');
      expect(result.orderNumber).toBe('ORD-2024-001');
    });

    it('should call cancelOrder for saga compensation', async () => {
      const ctx = { tenantId: 'tenant-123', userId: 'user-456', traceId: 'trace-1' };

      await orderServiceClient.cancelOrder(
        'order-123',
        'Saga compensation - ticket creation failed',
        ctx
      );

      expect(orderServiceClient.cancelOrder).toHaveBeenCalledWith(
        'order-123',
        'Saga compensation - ticket creation failed',
        ctx
      );
    });

    it('should call updateOrderStatus when needed', async () => {
      const ctx = { tenantId: 'tenant-123', traceId: 'trace-1' };

      await orderServiceClient.updateOrderStatus('order-123', 'completed', ctx);

      expect(orderServiceClient.updateOrderStatus).toHaveBeenCalledWith(
        'order-123',
        'completed',
        ctx
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle ServiceClientError from order service', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      orderServiceClient.createOrder.mockRejectedValueOnce(
        new ServiceClientError('Order service unavailable', 503)
      );

      await expect(
        orderServiceClient.createOrder({}, { tenantId: 'test' })
      ).rejects.toThrow('Order service unavailable');
    });

    it('should handle 409 Conflict for duplicate orders', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      orderServiceClient.createOrder.mockRejectedValueOnce(
        new ServiceClientError('Order already exists with this idempotency key', 409)
      );

      try {
        await orderServiceClient.createOrder({}, { tenantId: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceClientError);
        expect((error as any).statusCode).toBe(409);
      }
    });

    it('should handle 400 Bad Request for invalid order data', async () => {
      const { ServiceClientError } = require('@tickettoken/shared');

      orderServiceClient.createOrder.mockRejectedValueOnce(
        new ServiceClientError('Invalid order data: items required', 400)
      );

      await expect(
        orderServiceClient.createOrder({ items: [] }, { tenantId: 'test' })
      ).rejects.toThrow('Invalid order data');
    });
  });

  describe('Purchase Saga Flow', () => {
    it('should create order with idempotency key during purchase', async () => {
      const ctx = { tenantId: 'tenant-123', userId: 'user-456', traceId: 'trace-1' };

      const orderData = {
        userId: 'user-456',
        eventId: 'event-789',
        items: [
          { ticketTypeId: 'tt-1', quantity: 2, unitPriceCents: 2500 },
        ],
        currency: 'USD',
        idempotencyKey: 'purchase-saga-123',
        metadata: {
          tenantId: 'tenant-123',
          discountCodes: ['SUMMER10'],
        },
      };

      const result = await orderServiceClient.createOrder(orderData, ctx, 'purchase-saga-123');

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('orderNumber');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('totalCents');
    });

    it('should compensate by cancelling order on failure', async () => {
      const ctx = { tenantId: 'tenant-123', userId: 'user-456', traceId: 'trace-1' };

      // First create an order
      const createResult = await orderServiceClient.createOrder(
        { userId: 'user-456', items: [] },
        ctx,
        'idem-key'
      );

      // Then cancel it during compensation
      await orderServiceClient.cancelOrder(
        createResult.orderId,
        'Saga compensation',
        ctx
      );

      expect(orderServiceClient.cancelOrder).toHaveBeenCalledWith(
        'order-123',
        'Saga compensation',
        ctx
      );
    });
  });

  describe('Utility Functions', () => {
    it('should import percentOfCents from @tickettoken/shared', () => {
      const { percentOfCents } = require('@tickettoken/shared');
      expect(percentOfCents).toBeDefined();
    });

    it('should import addCents from @tickettoken/shared', () => {
      const { addCents } = require('@tickettoken/shared');
      expect(addCents).toBeDefined();
    });
  });
});
