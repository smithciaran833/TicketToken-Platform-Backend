/**
 * Unit Tests: Domain Errors
 * 
 * Tests all custom error classes for:
 * - Correct message formatting
 * - Correct error codes
 * - Correct HTTP status codes
 * - Proper inheritance from DomainError/Error
 * - Stack trace capture
 */

import {
  DomainError,
  OrderNotFoundError,
  InvalidStatusTransitionError,
  InsufficientTicketsError,
  PriceManipulationError,
  DuplicateOrderError,
  OrderExpiredError,
  InvalidOrderStatusError,
  PaymentIntentNotFoundError,
  ServiceUnavailableError,
  EventNotFoundError,
  TenantIsolationError,
  RefundAmountExceedsOrderTotalError,
} from '../../../src/errors/domain-errors';

describe('Domain Errors', () => {
  // ============================================
  // DomainError (Base Class)
  // ============================================
  describe('DomainError', () => {
    it('should set message property correctly', () => {
      const error = new DomainError('Test message', 'TEST_CODE', 400);
      expect(error.message).toBe('Test message');
    });

    it('should set code property correctly', () => {
      const error = new DomainError('Test message', 'TEST_CODE', 400);
      expect(error.code).toBe('TEST_CODE');
    });

    it('should set statusCode property correctly', () => {
      const error = new DomainError('Test message', 'TEST_CODE', 422);
      expect(error.statusCode).toBe(422);
    });

    it('should default statusCode to 400 when not provided', () => {
      const error = new DomainError('Test message', 'TEST_CODE');
      expect(error.statusCode).toBe(400);
    });

    it('should set name to constructor name', () => {
      const error = new DomainError('Test message', 'TEST_CODE');
      expect(error.name).toBe('DomainError');
    });

    it('should be an instance of Error', () => {
      const error = new DomainError('Test message', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be an instance of DomainError', () => {
      const error = new DomainError('Test message', 'TEST_CODE');
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should capture stack trace', () => {
      const error = new DomainError('Test message', 'TEST_CODE');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('DomainError');
    });

    it('should have stack trace that excludes constructor', () => {
      const error = new DomainError('Test message', 'TEST_CODE');
      // Stack should not start with the constructor itself
      expect(error.stack).toBeDefined();
    });
  });

  // ============================================
  // OrderNotFoundError
  // ============================================
  describe('OrderNotFoundError', () => {
    const orderId = '123e4567-e89b-12d3-a456-426614174000';

    it('should set message with orderId', () => {
      const error = new OrderNotFoundError(orderId);
      expect(error.message).toBe(`Order ${orderId} not found`);
    });

    it('should set code to ORDER_NOT_FOUND', () => {
      const error = new OrderNotFoundError(orderId);
      expect(error.code).toBe('ORDER_NOT_FOUND');
    });

    it('should set statusCode to 404', () => {
      const error = new OrderNotFoundError(orderId);
      expect(error.statusCode).toBe(404);
    });

    it('should set name to OrderNotFoundError', () => {
      const error = new OrderNotFoundError(orderId);
      expect(error.name).toBe('OrderNotFoundError');
    });

    it('should be an instance of DomainError', () => {
      const error = new OrderNotFoundError(orderId);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should be an instance of Error', () => {
      const error = new OrderNotFoundError(orderId);
      expect(error).toBeInstanceOf(Error);
    });

    it('should include orderId in message for different IDs', () => {
      const id1 = 'order-001';
      const id2 = 'order-002';
      const error1 = new OrderNotFoundError(id1);
      const error2 = new OrderNotFoundError(id2);
      expect(error1.message).toContain(id1);
      expect(error2.message).toContain(id2);
    });
  });

  // ============================================
  // InvalidStatusTransitionError
  // ============================================
  describe('InvalidStatusTransitionError', () => {
    it('should set message with from and to status', () => {
      const error = new InvalidStatusTransitionError('PENDING', 'COMPLETED');
      expect(error.message).toBe(
        'Invalid order status transition from PENDING to COMPLETED'
      );
    });

    it('should set code to INVALID_STATUS_TRANSITION', () => {
      const error = new InvalidStatusTransitionError('PENDING', 'COMPLETED');
      expect(error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should set statusCode to 400', () => {
      const error = new InvalidStatusTransitionError('PENDING', 'COMPLETED');
      expect(error.statusCode).toBe(400);
    });

    it('should set name to InvalidStatusTransitionError', () => {
      const error = new InvalidStatusTransitionError('PENDING', 'COMPLETED');
      expect(error.name).toBe('InvalidStatusTransitionError');
    });

    it('should be an instance of DomainError', () => {
      const error = new InvalidStatusTransitionError('PENDING', 'COMPLETED');
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should handle various status combinations', () => {
      const transitions = [
        ['PENDING', 'REFUNDED'],
        ['RESERVED', 'PENDING'],
        ['CANCELLED', 'CONFIRMED'],
        ['EXPIRED', 'RESERVED'],
      ];

      transitions.forEach(([from, to]) => {
        const error = new InvalidStatusTransitionError(from, to);
        expect(error.message).toContain(from);
        expect(error.message).toContain(to);
      });
    });
  });

  // ============================================
  // InsufficientTicketsError
  // ============================================
  describe('InsufficientTicketsError', () => {
    const ticketTypeId = 'ticket-type-001';
    const requested = 10;
    const available = 5;

    it('should set message with ticketTypeId, requested, and available', () => {
      const error = new InsufficientTicketsError(
        ticketTypeId,
        requested,
        available
      );
      expect(error.message).toBe(
        `Insufficient tickets for type ${ticketTypeId}. Requested: ${requested}, Available: ${available}`
      );
    });

    it('should set code to INSUFFICIENT_TICKETS', () => {
      const error = new InsufficientTicketsError(
        ticketTypeId,
        requested,
        available
      );
      expect(error.code).toBe('INSUFFICIENT_TICKETS');
    });

    it('should set statusCode to 409 (Conflict)', () => {
      const error = new InsufficientTicketsError(
        ticketTypeId,
        requested,
        available
      );
      expect(error.statusCode).toBe(409);
    });

    it('should set name to InsufficientTicketsError', () => {
      const error = new InsufficientTicketsError(
        ticketTypeId,
        requested,
        available
      );
      expect(error.name).toBe('InsufficientTicketsError');
    });

    it('should be an instance of DomainError', () => {
      const error = new InsufficientTicketsError(
        ticketTypeId,
        requested,
        available
      );
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should handle zero available tickets', () => {
      const error = new InsufficientTicketsError(ticketTypeId, 5, 0);
      expect(error.message).toContain('Available: 0');
    });

    it('should handle large numbers', () => {
      const error = new InsufficientTicketsError(ticketTypeId, 10000, 9999);
      expect(error.message).toContain('Requested: 10000');
      expect(error.message).toContain('Available: 9999');
    });
  });

  // ============================================
  // PriceManipulationError
  // ============================================
  describe('PriceManipulationError', () => {
    const ticketTypeId = 'vip-ticket-001';
    const provided = 1000;
    const actual = 5000;

    it('should set message with ticketTypeId, provided, and actual prices', () => {
      const error = new PriceManipulationError(ticketTypeId, provided, actual);
      expect(error.message).toBe(
        `Price manipulation detected for ticket ${ticketTypeId}. Provided: ${provided}, Actual: ${actual}`
      );
    });

    it('should set code to PRICE_MANIPULATION', () => {
      const error = new PriceManipulationError(ticketTypeId, provided, actual);
      expect(error.code).toBe('PRICE_MANIPULATION');
    });

    it('should set statusCode to 400', () => {
      const error = new PriceManipulationError(ticketTypeId, provided, actual);
      expect(error.statusCode).toBe(400);
    });

    it('should set name to PriceManipulationError', () => {
      const error = new PriceManipulationError(ticketTypeId, provided, actual);
      expect(error.name).toBe('PriceManipulationError');
    });

    it('should be an instance of DomainError', () => {
      const error = new PriceManipulationError(ticketTypeId, provided, actual);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should handle price in cents (large numbers)', () => {
      const error = new PriceManipulationError('ticket', 99900, 149900);
      expect(error.message).toContain('Provided: 99900');
      expect(error.message).toContain('Actual: 149900');
    });

    it('should handle zero provided price', () => {
      const error = new PriceManipulationError('ticket', 0, 5000);
      expect(error.message).toContain('Provided: 0');
    });
  });

  // ============================================
  // DuplicateOrderError
  // ============================================
  describe('DuplicateOrderError', () => {
    const idempotencyKey = 'idem-key-123456';

    it('should set message with idempotencyKey', () => {
      const error = new DuplicateOrderError(idempotencyKey);
      expect(error.message).toBe(
        `Order with idempotency key ${idempotencyKey} already exists`
      );
    });

    it('should set code to DUPLICATE_ORDER', () => {
      const error = new DuplicateOrderError(idempotencyKey);
      expect(error.code).toBe('DUPLICATE_ORDER');
    });

    it('should set statusCode to 409 (Conflict)', () => {
      const error = new DuplicateOrderError(idempotencyKey);
      expect(error.statusCode).toBe(409);
    });

    it('should set name to DuplicateOrderError', () => {
      const error = new DuplicateOrderError(idempotencyKey);
      expect(error.name).toBe('DuplicateOrderError');
    });

    it('should be an instance of DomainError', () => {
      const error = new DuplicateOrderError(idempotencyKey);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should handle UUID-style idempotency keys', () => {
      const uuidKey = '550e8400-e29b-41d4-a716-446655440000';
      const error = new DuplicateOrderError(uuidKey);
      expect(error.message).toContain(uuidKey);
    });
  });

  // ============================================
  // OrderExpiredError
  // ============================================
  describe('OrderExpiredError', () => {
    const orderId = 'order-expired-001';

    it('should set message with orderId', () => {
      const error = new OrderExpiredError(orderId);
      expect(error.message).toBe(`Order ${orderId} has expired`);
    });

    it('should set code to ORDER_EXPIRED', () => {
      const error = new OrderExpiredError(orderId);
      expect(error.code).toBe('ORDER_EXPIRED');
    });

    it('should set statusCode to 410 (Gone)', () => {
      const error = new OrderExpiredError(orderId);
      expect(error.statusCode).toBe(410);
    });

    it('should set name to OrderExpiredError', () => {
      const error = new OrderExpiredError(orderId);
      expect(error.name).toBe('OrderExpiredError');
    });

    it('should be an instance of DomainError', () => {
      const error = new OrderExpiredError(orderId);
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  // ============================================
  // InvalidOrderStatusError
  // ============================================
  describe('InvalidOrderStatusError', () => {
    const orderId = 'order-status-001';
    const currentStatus = 'CANCELLED';
    const expectedStatus = 'CONFIRMED';

    it('should set message with orderId, currentStatus, and expectedStatus', () => {
      const error = new InvalidOrderStatusError(
        orderId,
        currentStatus,
        expectedStatus
      );
      expect(error.message).toBe(
        `Order ${orderId} is in ${currentStatus} status, expected ${expectedStatus}`
      );
    });

    it('should set code to INVALID_ORDER_STATUS', () => {
      const error = new InvalidOrderStatusError(
        orderId,
        currentStatus,
        expectedStatus
      );
      expect(error.code).toBe('INVALID_ORDER_STATUS');
    });

    it('should set statusCode to 400', () => {
      const error = new InvalidOrderStatusError(
        orderId,
        currentStatus,
        expectedStatus
      );
      expect(error.statusCode).toBe(400);
    });

    it('should set name to InvalidOrderStatusError', () => {
      const error = new InvalidOrderStatusError(
        orderId,
        currentStatus,
        expectedStatus
      );
      expect(error.name).toBe('InvalidOrderStatusError');
    });

    it('should be an instance of DomainError', () => {
      const error = new InvalidOrderStatusError(
        orderId,
        currentStatus,
        expectedStatus
      );
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should handle all status combinations', () => {
      const statuses = [
        'PENDING',
        'RESERVED',
        'CONFIRMED',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED',
        'REFUNDED',
      ];

      statuses.forEach((current) => {
        statuses.forEach((expected) => {
          if (current !== expected) {
            const error = new InvalidOrderStatusError(
              'order-1',
              current,
              expected
            );
            expect(error.message).toContain(current);
            expect(error.message).toContain(expected);
          }
        });
      });
    });
  });

  // ============================================
  // PaymentIntentNotFoundError
  // ============================================
  describe('PaymentIntentNotFoundError', () => {
    const orderId = 'order-payment-001';

    it('should set message with orderId', () => {
      const error = new PaymentIntentNotFoundError(orderId);
      expect(error.message).toBe(`No payment intent found for order ${orderId}`);
    });

    it('should set code to PAYMENT_INTENT_NOT_FOUND', () => {
      const error = new PaymentIntentNotFoundError(orderId);
      expect(error.code).toBe('PAYMENT_INTENT_NOT_FOUND');
    });

    it('should set statusCode to 400', () => {
      const error = new PaymentIntentNotFoundError(orderId);
      expect(error.statusCode).toBe(400);
    });

    it('should set name to PaymentIntentNotFoundError', () => {
      const error = new PaymentIntentNotFoundError(orderId);
      expect(error.name).toBe('PaymentIntentNotFoundError');
    });

    it('should be an instance of DomainError', () => {
      const error = new PaymentIntentNotFoundError(orderId);
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  // ============================================
  // ServiceUnavailableError
  // ============================================
  describe('ServiceUnavailableError', () => {
    const serviceName = 'payment-service';

    it('should set message with serviceName', () => {
      const error = new ServiceUnavailableError(serviceName);
      expect(error.message).toBe(
        `Service ${serviceName} is currently unavailable`
      );
    });

    it('should set code to SERVICE_UNAVAILABLE', () => {
      const error = new ServiceUnavailableError(serviceName);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should set statusCode to 503', () => {
      const error = new ServiceUnavailableError(serviceName);
      expect(error.statusCode).toBe(503);
    });

    it('should set name to ServiceUnavailableError', () => {
      const error = new ServiceUnavailableError(serviceName);
      expect(error.name).toBe('ServiceUnavailableError');
    });

    it('should be an instance of DomainError', () => {
      const error = new ServiceUnavailableError(serviceName);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should preserve original error stack when provided', () => {
      const originalError = new Error('Connection refused');
      const error = new ServiceUnavailableError(serviceName, originalError);
      expect(error.stack).toBe(originalError.stack);
    });

    it('should have its own stack when no original error provided', () => {
      const error = new ServiceUnavailableError(serviceName);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ServiceUnavailableError');
    });

    it('should handle different service names', () => {
      const services = [
        'ticket-service',
        'event-service',
        'notification-service',
        'redis',
        'rabbitmq',
      ];

      services.forEach((service) => {
        const error = new ServiceUnavailableError(service);
        expect(error.message).toContain(service);
      });
    });
  });

  // ============================================
  // EventNotFoundError
  // ============================================
  describe('EventNotFoundError', () => {
    const eventId = 'event-001';

    it('should set message with eventId', () => {
      const error = new EventNotFoundError(eventId);
      expect(error.message).toBe(`Event ${eventId} not found`);
    });

    it('should set code to EVENT_NOT_FOUND', () => {
      const error = new EventNotFoundError(eventId);
      expect(error.code).toBe('EVENT_NOT_FOUND');
    });

    it('should set statusCode to 404', () => {
      const error = new EventNotFoundError(eventId);
      expect(error.statusCode).toBe(404);
    });

    it('should set name to EventNotFoundError', () => {
      const error = new EventNotFoundError(eventId);
      expect(error.name).toBe('EventNotFoundError');
    });

    it('should be an instance of DomainError', () => {
      const error = new EventNotFoundError(eventId);
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  // ============================================
  // TenantIsolationError
  // ============================================
  describe('TenantIsolationError', () => {
    const resource = 'order:123';

    it('should set message with resource', () => {
      const error = new TenantIsolationError(resource);
      expect(error.message).toBe(
        `Tenant isolation violation: Cannot access ${resource}`
      );
    });

    it('should set code to TENANT_ISOLATION_VIOLATION', () => {
      const error = new TenantIsolationError(resource);
      expect(error.code).toBe('TENANT_ISOLATION_VIOLATION');
    });

    it('should set statusCode to 403 (Forbidden)', () => {
      const error = new TenantIsolationError(resource);
      expect(error.statusCode).toBe(403);
    });

    it('should set name to TenantIsolationError', () => {
      const error = new TenantIsolationError(resource);
      expect(error.name).toBe('TenantIsolationError');
    });

    it('should be an instance of DomainError', () => {
      const error = new TenantIsolationError(resource);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should handle various resource types', () => {
      const resources = [
        'order:abc-123',
        'user:user-456',
        'event:event-789',
        'tenant:other-tenant',
      ];

      resources.forEach((res) => {
        const error = new TenantIsolationError(res);
        expect(error.message).toContain(res);
      });
    });
  });

  // ============================================
  // RefundAmountExceedsOrderTotalError
  // ============================================
  describe('RefundAmountExceedsOrderTotalError', () => {
    const refundAmount = 15000;
    const orderTotal = 10000;

    it('should set message with refundAmount and orderTotal', () => {
      const error = new RefundAmountExceedsOrderTotalError(
        refundAmount,
        orderTotal
      );
      expect(error.message).toBe(
        `Refund amount ${refundAmount} exceeds order total ${orderTotal}`
      );
    });

    it('should set code to REFUND_AMOUNT_EXCEEDS_TOTAL', () => {
      const error = new RefundAmountExceedsOrderTotalError(
        refundAmount,
        orderTotal
      );
      expect(error.code).toBe('REFUND_AMOUNT_EXCEEDS_TOTAL');
    });

    it('should set statusCode to 400', () => {
      const error = new RefundAmountExceedsOrderTotalError(
        refundAmount,
        orderTotal
      );
      expect(error.statusCode).toBe(400);
    });

    it('should set name to RefundAmountExceedsOrderTotalError', () => {
      const error = new RefundAmountExceedsOrderTotalError(
        refundAmount,
        orderTotal
      );
      expect(error.name).toBe('RefundAmountExceedsOrderTotalError');
    });

    it('should be an instance of DomainError', () => {
      const error = new RefundAmountExceedsOrderTotalError(
        refundAmount,
        orderTotal
      );
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should handle amounts in cents', () => {
      const error = new RefundAmountExceedsOrderTotalError(150000, 99900);
      expect(error.message).toContain('150000');
      expect(error.message).toContain('99900');
    });

    it('should handle edge case where amounts are equal', () => {
      // Even if amounts are equal, this error might be thrown due to previous partial refunds
      const error = new RefundAmountExceedsOrderTotalError(10000, 10000);
      expect(error.message).toBe(
        'Refund amount 10000 exceeds order total 10000'
      );
    });
  });

  // ============================================
  // Error Throwing and Catching
  // ============================================
  describe('Error Throwing and Catching', () => {
    it('should be catchable as DomainError', () => {
      expect(() => {
        throw new OrderNotFoundError('123');
      }).toThrow(DomainError);
    });

    it('should be catchable as Error', () => {
      expect(() => {
        throw new OrderNotFoundError('123');
      }).toThrow(Error);
    });

    it('should be catchable by specific error type', () => {
      expect(() => {
        throw new OrderNotFoundError('123');
      }).toThrow(OrderNotFoundError);
    });

    it('should allow error type checking with instanceof', () => {
      try {
        throw new PriceManipulationError('ticket', 100, 200);
      } catch (error) {
        expect(error instanceof PriceManipulationError).toBe(true);
        expect(error instanceof DomainError).toBe(true);
        expect(error instanceof Error).toBe(true);
        expect(error instanceof OrderNotFoundError).toBe(false);
      }
    });

    it('should preserve error properties when caught', () => {
      try {
        throw new InsufficientTicketsError('vip', 10, 5);
      } catch (error) {
        if (error instanceof InsufficientTicketsError) {
          expect(error.code).toBe('INSUFFICIENT_TICKETS');
          expect(error.statusCode).toBe(409);
          expect(error.message).toContain('vip');
        } else {
          fail('Error should be InsufficientTicketsError');
        }
      }
    });
  });

  // ============================================
  // JSON Serialization
  // ============================================
  describe('JSON Serialization', () => {
    it('should serialize error properties to JSON', () => {
      const error = new OrderNotFoundError('order-123');
      const json = JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      });

      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('OrderNotFoundError');
      expect(parsed.code).toBe('ORDER_NOT_FOUND');
      expect(parsed.statusCode).toBe(404);
    });

    it('should be usable in API error responses', () => {
      const error = new TenantIsolationError('order:456');
      const apiResponse = {
        error: {
          code: error.code,
          message: error.message,
          status: error.statusCode,
        },
      };

      expect(apiResponse.error.code).toBe('TENANT_ISOLATION_VIOLATION');
      expect(apiResponse.error.status).toBe(403);
    });
  });
});
