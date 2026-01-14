import {
  createOrderSchema,
  reserveOrderSchema,
  cancelOrderSchema,
  refundOrderSchema,
  getOrdersQuerySchema,
  uuidParamSchema,
} from '../../../src/validators/order.schemas';

describe('Order Schemas', () => {
  describe('createOrderSchema', () => {
    const validOrder = {
      eventId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      items: [
        {
          ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
          quantity: 2,
          unitPriceCents: 5000,
        },
      ],
      currency: 'USD',
    };

    it('should validate a valid order', () => {
      const { error, value } = createOrderSchema.validate(validOrder);

      expect(error).toBeUndefined();
      expect(value).toMatchObject(validOrder);
    });

    it('should default currency to USD', () => {
      const orderWithoutCurrency = { ...validOrder };
      delete (orderWithoutCurrency as any).currency;

      const { error, value } = createOrderSchema.validate(orderWithoutCurrency);

      expect(error).toBeUndefined();
      expect(value.currency).toBe('USD');
    });

    it('should accept valid currencies', () => {
      const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

      currencies.forEach((currency) => {
        const { error } = createOrderSchema.validate({ ...validOrder, currency });
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid currency', () => {
      const { error } = createOrderSchema.validate({ ...validOrder, currency: 'JPY' });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Currency must be one of');
    });

    it('should require eventId', () => {
      const orderWithoutEventId = { ...validOrder };
      delete (orderWithoutEventId as any).eventId;

      const { error } = createOrderSchema.validate(orderWithoutEventId);

      expect(error).toBeDefined();
      expect(error?.message).toContain('Event ID is required');
    });

    it('should validate eventId as UUID', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        eventId: 'not-a-uuid',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid UUID');
    });

    it('should require items array', () => {
      const orderWithoutItems = { ...validOrder };
      delete (orderWithoutItems as any).items;

      const { error } = createOrderSchema.validate(orderWithoutItems);

      expect(error).toBeDefined();
      expect(error?.message).toContain('Items are required');
    });

    it('should require at least one item', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('At least one item is required');
    });

    it('should limit maximum items to 50', () => {
      const items = Array(51).fill({
        ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
        quantity: 1,
        unitPriceCents: 5000,
      });

      const { error } = createOrderSchema.validate({
        ...validOrder,
        items,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Maximum 50 items allowed');
    });

    it('should validate item ticketTypeId as UUID', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'not-a-uuid',
            quantity: 1,
            unitPriceCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid UUID');
    });

    it('should require quantity', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            unitPriceCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Quantity is required');
    });

    it('should enforce minimum quantity of 1', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 0,
            unitPriceCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Quantity must be at least 1');
    });

    it('should enforce maximum quantity of 20 per item', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 21,
            unitPriceCents: 5000,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Maximum 20 tickets allowed per ticket type');
    });

    it('should enforce maximum total quantity of 100 across all items', () => {
      const items = Array(6).fill({
        ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
        quantity: 20, // 6 * 20 = 120
        unitPriceCents: 5000,
      });

      const { error } = createOrderSchema.validate({
        ...validOrder,
        items,
      });

      expect(error).toBeDefined();
      // Custom validation messages appear as "failed custom validation"
      expect(error?.message).toMatch(/Total quantity|failed custom validation/);
    });

    it('should require unitPriceCents', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 1,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Unit price is required');
    });

    it('should enforce minimum unitPriceCents of 0', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 1,
            unitPriceCents: -1,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Unit price cannot be negative');
    });

    it('should enforce maximum unitPriceCents', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 1,
            unitPriceCents: 1000000001,
          },
        ],
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Unit price exceeds maximum allowed');
    });

    it('should enforce maximum total order value', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 11, // 11 * 1 billion = over limit
            unitPriceCents: 1000000000,
          },
        ],
      });

      expect(error).toBeDefined();
      // Custom validation messages appear as "failed custom validation"
      expect(error?.message).toMatch(/Total order value|failed custom validation/);
    });

    it('should accept optional idempotencyKey', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        idempotencyKey: 'a'.repeat(16),
      });

      expect(error).toBeUndefined();
    });

    it('should enforce minimum idempotencyKey length', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        idempotencyKey: 'short',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Idempotency key must be at least 16 characters');
    });

    it('should enforce maximum idempotencyKey length', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        idempotencyKey: 'a'.repeat(256),
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Idempotency key cannot exceed 255 characters');
    });

    it('should accept optional metadata', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        metadata: { source: 'mobile', campaign: 'summer2024' },
      });

      expect(error).toBeUndefined();
    });

    it('should enforce maximum metadata fields', () => {
      const metadata: any = {};
      for (let i = 0; i < 11; i++) {
        metadata[`field${i}`] = 'value';
      }

      const { error } = createOrderSchema.validate({
        ...validOrder,
        metadata,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Maximum 10 metadata fields allowed');
    });

    it('should accept multiple valid items', () => {
      const { error } = createOrderSchema.validate({
        ...validOrder,
        items: [
          {
            ticketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
            quantity: 2,
            unitPriceCents: 5000,
          },
          {
            ticketTypeId: 'c2ffcd99-9c0b-4ef8-bb6d-6bb9bd380a33',
            quantity: 3,
            unitPriceCents: 7500,
          },
        ],
      });

      expect(error).toBeUndefined();
    });
  });

  describe('reserveOrderSchema', () => {
    it('should validate valid order ID', () => {
      const { error } = reserveOrderSchema.validate({
        orderId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });

      expect(error).toBeUndefined();
    });

    it('should require orderId', () => {
      const { error } = reserveOrderSchema.validate({});

      expect(error).toBeDefined();
      expect(error?.message).toContain('Order ID is required');
    });

    it('should validate orderId as UUID', () => {
      const { error } = reserveOrderSchema.validate({ orderId: 'not-a-uuid' });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid UUID');
    });
  });

  describe('cancelOrderSchema', () => {
    it('should validate valid cancellation', () => {
      const { error } = cancelOrderSchema.validate({
        reason: 'Customer requested cancellation',
      });

      expect(error).toBeUndefined();
    });

    it('should require reason', () => {
      const { error } = cancelOrderSchema.validate({});

      expect(error).toBeDefined();
      expect(error?.message).toContain('Cancellation reason is required');
    });

    it('should reject empty reason', () => {
      const { error } = cancelOrderSchema.validate({ reason: '' });

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/not allowed to be empty|Cancellation reason is required/);
    });

    it('should enforce maximum reason length', () => {
      const { error } = cancelOrderSchema.validate({
        reason: 'a'.repeat(501),
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Cancellation reason cannot exceed 500 characters');
    });

    it('should accept reason at maximum length', () => {
      const { error } = cancelOrderSchema.validate({
        reason: 'a'.repeat(500),
      });

      expect(error).toBeUndefined();
    });
  });

  describe('refundOrderSchema', () => {
    it('should validate valid refund', () => {
      const { error } = refundOrderSchema.validate({
        amountCents: 5000,
        reason: 'Customer dissatisfied',
      });

      expect(error).toBeUndefined();
    });

    it('should require amountCents', () => {
      const { error } = refundOrderSchema.validate({
        reason: 'Customer dissatisfied',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Refund amount is required');
    });

    it('should enforce minimum amountCents', () => {
      const { error } = refundOrderSchema.validate({
        amountCents: 0,
        reason: 'Customer dissatisfied',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Refund amount must be greater than 0');
    });

    it('should require reason', () => {
      const { error } = refundOrderSchema.validate({
        amountCents: 5000,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Refund reason is required');
    });

    it('should reject empty reason', () => {
      const { error } = refundOrderSchema.validate({
        amountCents: 5000,
        reason: '',
      });

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/not allowed to be empty|Refund reason is required/);
    });

    it('should enforce maximum reason length', () => {
      const { error } = refundOrderSchema.validate({
        amountCents: 5000,
        reason: 'a'.repeat(501),
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Refund reason cannot exceed 500 characters');
    });

    it('should accept optional metadata', () => {
      const { error } = refundOrderSchema.validate({
        amountCents: 5000,
        reason: 'Customer dissatisfied',
        metadata: { processedBy: 'admin' },
      });

      expect(error).toBeUndefined();
    });
  });

  describe('getOrdersQuerySchema', () => {
    it('should validate valid query parameters', () => {
      const { error } = getOrdersQuerySchema.validate({
        limit: 25,
        offset: 0,
        status: 'CONFIRMED',
      });

      expect(error).toBeUndefined();
    });

    it('should default limit to 50', () => {
      const { error, value } = getOrdersQuerySchema.validate({});

      expect(error).toBeUndefined();
      expect(value.limit).toBe(50);
    });

    it('should default offset to 0', () => {
      const { error, value } = getOrdersQuerySchema.validate({});

      expect(error).toBeUndefined();
      expect(value.offset).toBe(0);
    });

    it('should enforce minimum limit', () => {
      const { error } = getOrdersQuerySchema.validate({ limit: 0 });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Limit must be at least 1');
    });

    it('should enforce maximum limit', () => {
      const { error } = getOrdersQuerySchema.validate({ limit: 101 });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Limit cannot exceed 100');
    });

    it('should enforce minimum offset', () => {
      const { error } = getOrdersQuerySchema.validate({ offset: -1 });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Offset cannot be negative');
    });

    it('should accept valid status values', () => {
      const statuses = [
        'PENDING',
        'RESERVED',
        'CONFIRMED',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED',
        'REFUNDED',
      ];

      statuses.forEach((status) => {
        const { error } = getOrdersQuerySchema.validate({ status });
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid status', () => {
      const { error } = getOrdersQuerySchema.validate({ status: 'INVALID' });

      expect(error).toBeDefined();
      expect(error?.message).toContain('Status must be one of');
    });

    it('should accept query without status', () => {
      const { error } = getOrdersQuerySchema.validate({
        limit: 10,
        offset: 20,
      });

      expect(error).toBeUndefined();
    });
  });

  describe('uuidParamSchema', () => {
    it('should validate valid UUID parameter', () => {
      const { error } = uuidParamSchema.validate({
        orderId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });

      expect(error).toBeUndefined();
    });

    it('should require orderId', () => {
      const { error } = uuidParamSchema.validate({});

      expect(error).toBeDefined();
      expect(error?.message).toContain('Order ID is required');
    });

    it('should validate orderId as UUID', () => {
      const { error } = uuidParamSchema.validate({ orderId: 'not-a-uuid' });

      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid UUID');
    });

    it('should reject non-v4 UUIDs', () => {
      const { error } = uuidParamSchema.validate({
        orderId: '00000000-0000-0000-0000-000000000000',
      });

      expect(error).toBeDefined();
    });
  });
});
