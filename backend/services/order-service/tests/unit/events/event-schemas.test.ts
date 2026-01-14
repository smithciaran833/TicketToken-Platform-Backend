import Joi from 'joi';
import {
  OrderCreatedSchema,
  OrderReservedSchema,
  OrderConfirmedSchema,
  OrderCancelledSchema,
  OrderExpiredSchema,
  OrderRefundedSchema,
  OrderFailedSchema,
  EventSchemaMap,
} from '../../../src/events/event-schemas';
import { OrderEvents } from '../../../src/events/event-types';

describe('EventSchemas', () => {
  // Valid base payload that satisfies base schema requirements
  const validBasePayload = {
    orderId: '123e4567-e89b-12d3-a456-426614174000',
    userId: '987e6543-e21b-12d3-a456-426614174001',
    eventId: '456e7890-e12b-12d3-a456-426614174002',
    orderNumber: 'ORD-2024-001',
    status: 'PENDING',
    totalCents: 10000,
    currency: 'USD',
    items: [
      {
        ticketTypeId: '789e0123-e45b-12d3-a456-426614174003',
        quantity: 2,
        unitPriceCents: 5000,
      },
    ],
    timestamp: new Date('2024-01-15T10:00:00Z'),
  };

  describe('OrderCreatedSchema', () => {
    it('should validate a valid order created payload', () => {
      const result = OrderCreatedSchema.validate(validBasePayload);
      expect(result.error).toBeUndefined();
      expect(result.value).toMatchObject(validBasePayload);
    });

    it('should validate with optional metadata', () => {
      const payloadWithMetadata = {
        ...validBasePayload,
        metadata: { source: 'web', userAgent: 'Mozilla/5.0' },
      };

      const result = OrderCreatedSchema.validate(payloadWithMetadata);
      expect(result.error).toBeUndefined();
      expect(result.value.metadata).toEqual(payloadWithMetadata.metadata);
    });

    it('should fail validation for missing required fields', () => {
      const { orderId, ...payloadWithoutOrderId } = validBasePayload;

      const result = OrderCreatedSchema.validate(payloadWithoutOrderId);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('orderId');
    });

    it('should fail validation for invalid UUID format', () => {
      const invalidPayload = {
        ...validBasePayload,
        orderId: 'not-a-valid-uuid',
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('GUID');
    });

    it('should fail validation for negative totalCents', () => {
      const invalidPayload = {
        ...validBasePayload,
        totalCents: -100,
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('greater than or equal to 0');
    });

    it('should fail validation for totalCents exceeding maximum', () => {
      const invalidPayload = {
        ...validBasePayload,
        totalCents: 100000001, // Exceeds max of 100000000
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('less than or equal to');
    });

    it('should fail validation for invalid currency format', () => {
      const invalidPayload = {
        ...validBasePayload,
        currency: 'US', // Should be 3 characters
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
    });

    it('should fail validation for empty items array', () => {
      const invalidPayload = {
        ...validBasePayload,
        items: [],
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('at least 1 items');
    });

    it('should fail validation for items array exceeding maximum', () => {
      const invalidPayload = {
        ...validBasePayload,
        items: Array(51).fill(validBasePayload.items[0]), // Exceeds max of 50
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('less than or equal to 50');
    });

    it('should fail validation for invalid item quantity', () => {
      const invalidPayload = {
        ...validBasePayload,
        items: [
          {
            ticketTypeId: '789e0123-e45b-12d3-a456-426614174003',
            quantity: 0, // Should be at least 1
            unitPriceCents: 5000,
          },
        ],
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
    });

    it('should convert string numbers to integers', () => {
      const payloadWithStringNumbers = {
        ...validBasePayload,
        totalCents: '10000' as any,
        items: [
          {
            ticketTypeId: '789e0123-e45b-12d3-a456-426614174003',
            quantity: '2' as any,
            unitPriceCents: '5000' as any,
          },
        ],
      };

      const result = OrderCreatedSchema.validate(payloadWithStringNumbers);
      expect(result.error).toBeUndefined();
      expect(typeof result.value.totalCents).toBe('number');
      expect(result.value.totalCents).toBe(10000);
    });

    it('should strip unknown fields', () => {
      const payloadWithUnknown = {
        ...validBasePayload,
        unknownField: 'should be removed',
      };

      const result = OrderCreatedSchema.validate(payloadWithUnknown, {
        stripUnknown: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.value).not.toHaveProperty('unknownField');
    });
  });

  describe('OrderReservedSchema', () => {
    it('should validate a valid order reserved payload', () => {
      const payload = {
        ...validBasePayload,
        expiresAt: new Date('2024-01-15T10:15:00Z'),
      };

      const result = OrderReservedSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.expiresAt).toBeInstanceOf(Date);
    });

    it('should fail validation without expiresAt', () => {
      const result = OrderReservedSchema.validate(validBasePayload);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('expiresAt');
    });

    it('should convert valid date strings to Date objects', () => {
      const payload = {
        ...validBasePayload,
        expiresAt: '2024-01-15T10:15:00Z',
      };

      const result = OrderReservedSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.expiresAt).toBeInstanceOf(Date);
    });

    it('should fail validation for invalid date format', () => {
      const payload = {
        ...validBasePayload,
        expiresAt: 'not-a-date',
      };

      const result = OrderReservedSchema.validate(payload);
      expect(result.error).toBeDefined();
    });
  });

  describe('OrderConfirmedSchema', () => {
    it('should validate a valid order confirmed payload', () => {
      const payload = {
        ...validBasePayload,
        paymentIntentId: 'pi_1234567890',
      };

      const result = OrderConfirmedSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.paymentIntentId).toBe('pi_1234567890');
    });

    it('should fail validation without paymentIntentId', () => {
      const result = OrderConfirmedSchema.validate(validBasePayload);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('paymentIntentId');
    });

    it('should fail validation for empty paymentIntentId', () => {
      const payload = {
        ...validBasePayload,
        paymentIntentId: '',
      };

      const result = OrderConfirmedSchema.validate(payload);
      expect(result.error).toBeDefined();
    });

    it('should fail validation for paymentIntentId exceeding max length', () => {
      const payload = {
        ...validBasePayload,
        paymentIntentId: 'a'.repeat(256), // Exceeds max of 255
      };

      const result = OrderConfirmedSchema.validate(payload);
      expect(result.error).toBeDefined();
    });
  });

  describe('OrderCancelledSchema', () => {
    it('should validate a valid order cancelled payload with refund', () => {
      const payload = {
        ...validBasePayload,
        reason: 'Customer requested cancellation',
        refundAmountCents: 10000,
      };

      const result = OrderCancelledSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.reason).toBe('Customer requested cancellation');
      expect(result.value.refundAmountCents).toBe(10000);
    });

    it('should validate a valid order cancelled payload without refund', () => {
      const payload = {
        ...validBasePayload,
        reason: 'Event cancelled by organizer',
      };

      const result = OrderCancelledSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.refundAmountCents).toBeUndefined();
    });

    it('should fail validation without reason', () => {
      const result = OrderCancelledSchema.validate(validBasePayload);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('reason');
    });

    it('should fail validation for empty reason', () => {
      const payload = {
        ...validBasePayload,
        reason: '',
      };

      const result = OrderCancelledSchema.validate(payload);
      expect(result.error).toBeDefined();
    });

    it('should fail validation for reason exceeding max length', () => {
      const payload = {
        ...validBasePayload,
        reason: 'a'.repeat(501), // Exceeds max of 500
      };

      const result = OrderCancelledSchema.validate(payload);
      expect(result.error).toBeDefined();
    });

    it('should fail validation for negative refundAmountCents', () => {
      const payload = {
        ...validBasePayload,
        reason: 'Cancelled',
        refundAmountCents: -100,
      };

      const result = OrderCancelledSchema.validate(payload);
      expect(result.error).toBeDefined();
    });
  });

  describe('OrderExpiredSchema', () => {
    it('should validate a valid order expired payload', () => {
      const payload = {
        ...validBasePayload,
        reason: 'Payment not completed within time limit',
      };

      const result = OrderExpiredSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.reason).toBe('Payment not completed within time limit');
    });

    it('should fail validation without reason', () => {
      const result = OrderExpiredSchema.validate(validBasePayload);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('reason');
    });

    it('should fail validation for reason exceeding max length', () => {
      const payload = {
        ...validBasePayload,
        reason: 'a'.repeat(501),
      };

      const result = OrderExpiredSchema.validate(payload);
      expect(result.error).toBeDefined();
    });
  });

  describe('OrderRefundedSchema', () => {
    it('should validate a valid order refunded payload', () => {
      const payload = {
        ...validBasePayload,
        refundAmountCents: 10000,
        reason: 'Event cancelled',
      };

      const result = OrderRefundedSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.refundAmountCents).toBe(10000);
      expect(result.value.reason).toBe('Event cancelled');
    });

    it('should fail validation without refundAmountCents', () => {
      const payload = {
        ...validBasePayload,
        reason: 'Event cancelled',
      };

      const result = OrderRefundedSchema.validate(payload);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('refundAmountCents');
    });

    it('should fail validation without reason', () => {
      const payload = {
        ...validBasePayload,
        refundAmountCents: 10000,
      };

      const result = OrderRefundedSchema.validate(payload);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('reason');
    });

    it('should fail validation for negative refundAmountCents', () => {
      const payload = {
        ...validBasePayload,
        refundAmountCents: -100,
        reason: 'Refund',
      };

      const result = OrderRefundedSchema.validate(payload);
      expect(result.error).toBeDefined();
    });
  });

  describe('OrderFailedSchema', () => {
    it('should validate a valid order failed payload', () => {
      const payload = {
        ...validBasePayload,
        error: 'Payment processing failed: Insufficient funds',
      };

      const result = OrderFailedSchema.validate(payload);
      expect(result.error).toBeUndefined();
      expect(result.value.error).toBe('Payment processing failed: Insufficient funds');
    });

    it('should fail validation without error', () => {
      const result = OrderFailedSchema.validate(validBasePayload);
      expect(result.error).toBeDefined();
      expect(result.error?.details[0].path).toContain('error');
    });

    it('should fail validation for empty error', () => {
      const payload = {
        ...validBasePayload,
        error: '',
      };

      const result = OrderFailedSchema.validate(payload);
      expect(result.error).toBeDefined();
    });

    it('should fail validation for error exceeding max length', () => {
      const payload = {
        ...validBasePayload,
        error: 'a'.repeat(1001), // Exceeds max of 1000
      };

      const result = OrderFailedSchema.validate(payload);
      expect(result.error).toBeDefined();
    });
  });

  describe('EventSchemaMap', () => {
    it('should contain all order event types', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_CREATED]).toBeDefined();
      expect(EventSchemaMap[OrderEvents.ORDER_RESERVED]).toBeDefined();
      expect(EventSchemaMap[OrderEvents.ORDER_CONFIRMED]).toBeDefined();
      expect(EventSchemaMap[OrderEvents.ORDER_CANCELLED]).toBeDefined();
      expect(EventSchemaMap[OrderEvents.ORDER_EXPIRED]).toBeDefined();
      expect(EventSchemaMap[OrderEvents.ORDER_REFUNDED]).toBeDefined();
      expect(EventSchemaMap[OrderEvents.ORDER_FAILED]).toBeDefined();
    });

    it('should map ORDER_CREATED to OrderCreatedSchema', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_CREATED]).toBe(OrderCreatedSchema);
    });

    it('should map ORDER_RESERVED to OrderReservedSchema', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_RESERVED]).toBe(OrderReservedSchema);
    });

    it('should map ORDER_CONFIRMED to OrderConfirmedSchema', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_CONFIRMED]).toBe(OrderConfirmedSchema);
    });

    it('should map ORDER_CANCELLED to OrderCancelledSchema', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_CANCELLED]).toBe(OrderCancelledSchema);
    });

    it('should map ORDER_EXPIRED to OrderExpiredSchema', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_EXPIRED]).toBe(OrderExpiredSchema);
    });

    it('should map ORDER_REFUNDED to OrderRefundedSchema', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_REFUNDED]).toBe(OrderRefundedSchema);
    });

    it('should map ORDER_FAILED to OrderFailedSchema', () => {
      expect(EventSchemaMap[OrderEvents.ORDER_FAILED]).toBe(OrderFailedSchema);
    });

    it('should have exactly 7 schemas', () => {
      expect(Object.keys(EventSchemaMap)).toHaveLength(7);
    });

    it('should have all schemas as Joi objects', () => {
      Object.values(EventSchemaMap).forEach(schema => {
        expect(schema).toBeDefined();
        expect(schema.validate).toBeDefined();
        expect(typeof schema.validate).toBe('function');
      });
    });
  });

  describe('Status field validation', () => {
    it('should accept valid status values', () => {
      const validStatuses = [
        'PENDING',
        'RESERVED',
        'CONFIRMED',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED',
        'REFUNDED',
      ];

      validStatuses.forEach(status => {
        const payload = { ...validBasePayload, status };
        const result = OrderCreatedSchema.validate(payload);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid status values', () => {
      const invalidPayload = {
        ...validBasePayload,
        status: 'INVALID_STATUS',
      };

      const result = OrderCreatedSchema.validate(invalidPayload);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('must be one of');
    });
  });

  describe('Currency field validation', () => {
    it('should accept valid 3-letter uppercase currency codes', () => {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

      validCurrencies.forEach(currency => {
        const payload = { ...validBasePayload, currency };
        const result = OrderCreatedSchema.validate(payload);
        expect(result.error).toBeUndefined();
      });
    });

    it('should convert lowercase currency codes to uppercase', () => {
      const payload = { ...validBasePayload, currency: 'usd' };
      const result = OrderCreatedSchema.validate(payload);
      // Joi uppercase() converts it, so it should be valid
      expect(result.error).toBeUndefined();
      expect(result.value.currency).toBe('USD');
    });

    it('should reject currency codes with wrong length', () => {
      const payload = { ...validBasePayload, currency: 'US' };
      const result = OrderCreatedSchema.validate(payload);
      expect(result.error).toBeDefined();
    });
  });
});
