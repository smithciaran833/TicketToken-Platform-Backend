import { z } from 'zod';
import {
  uuidSchema,
  iso8601DateTimeSchema,
  paginationSchema,
  ticketItemSchema,
  purchaseRequestSchema,
  reservationRequestSchema,
  confirmPurchaseSchema,
  createTicketTypeSchema,
  updateTicketTypeSchema,
  transferTicketSchema,
  acceptTransferSchema,
  validateQRSchema,
  checkInSchema,
  ticketStatusEnum,
  updateStatusSchema,
  ticketQuerySchema,
  validateRequest,
  safeValidateRequest,
  formatZodErrors,
  safeString,
} from '../../../src/schemas';

describe('Schemas Index', () => {
  describe('uuidSchema', () => {
    it('should accept valid UUID', () => {
      const result = uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000');
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = uuidSchema.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = uuidSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('iso8601DateTimeSchema', () => {
    it('should accept valid ISO 8601 datetime', () => {
      const result = iso8601DateTimeSchema.safeParse('2024-01-15T10:30:00.000Z');
      expect(result.success).toBe(true);
    });

    it('should reject invalid datetime format', () => {
      const result = iso8601DateTimeSchema.safeParse('01/15/2024');
      expect(result.success).toBe(false);
    });

    it('should reject plain date without time', () => {
      const result = iso8601DateTimeSchema.safeParse('2024-01-15');
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('should accept valid pagination', () => {
      const result = paginationSchema.safeParse({ page: 1, limit: 20 });
      expect(result.success).toBe(true);
    });

    it('should use defaults when not provided', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should reject page < 1', () => {
      const result = paginationSchema.safeParse({ page: 0, limit: 20 });
      expect(result.success).toBe(false);
    });

    it('should reject limit > 100', () => {
      const result = paginationSchema.safeParse({ page: 1, limit: 150 });
      expect(result.success).toBe(false);
    });

    it('should reject extra fields (strict mode)', () => {
      const result = paginationSchema.safeParse({ page: 1, limit: 20, extra: 'field' });
      expect(result.success).toBe(false);
    });
  });

  describe('ticketItemSchema', () => {
    it('should accept valid ticket item', () => {
      const result = ticketItemSchema.safeParse({
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 2,
      });
      expect(result.success).toBe(true);
    });

    it('should reject quantity > 10', () => {
      const result = ticketItemSchema.safeParse({
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 15,
      });
      expect(result.success).toBe(false);
    });

    it('should reject quantity < 1', () => {
      const result = ticketItemSchema.safeParse({
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer quantity', () => {
      const result = ticketItemSchema.safeParse({
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 2.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('purchaseRequestSchema', () => {
    const validPurchase = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      tickets: [
        { ticketTypeId: '123e4567-e89b-12d3-a456-426614174001', quantity: 2 },
      ],
    };

    it('should accept valid purchase request', () => {
      const result = purchaseRequestSchema.safeParse(validPurchase);
      expect(result.success).toBe(true);
    });

    it('should accept with optional fields', () => {
      const result = purchaseRequestSchema.safeParse({
        ...validPurchase,
        paymentMethodId: 'pm_123',
        idempotencyKey: 'abcdefghijklmnop',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty tickets array', () => {
      const result = purchaseRequestSchema.safeParse({
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject tickets array > 10 items', () => {
      const tickets = Array(11).fill({
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 1,
      });
      const result = purchaseRequestSchema.safeParse({
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets,
      });
      expect(result.success).toBe(false);
    });

    it('should reject idempotency key < 16 chars', () => {
      const result = purchaseRequestSchema.safeParse({
        ...validPurchase,
        idempotencyKey: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createTicketTypeSchema', () => {
    const validTicketType = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'General Admission',
      priceCents: 5000,
      quantity: 100,
    };

    it('should accept valid ticket type', () => {
      const result = createTicketTypeSchema.safeParse(validTicketType);
      expect(result.success).toBe(true);
    });

    it('should accept with optional fields', () => {
      const result = createTicketTypeSchema.safeParse({
        ...validTicketType,
        description: 'Standing room only',
        saleStartDate: '2024-01-15T10:00:00.000Z',
        saleEndDate: '2024-06-15T10:00:00.000Z',
        maxPerPurchase: 6,
      });
      expect(result.success).toBe(true);
    });

    it('should reject sale end date before start date', () => {
      const result = createTicketTypeSchema.safeParse({
        ...validTicketType,
        saleStartDate: '2024-06-15T10:00:00.000Z',
        saleEndDate: '2024-01-15T10:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative price', () => {
      const result = createTicketTypeSchema.safeParse({
        ...validTicketType,
        priceCents: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject price > $1,000,000', () => {
      const result = createTicketTypeSchema.safeParse({
        ...validTicketType,
        priceCents: 100000001,
      });
      expect(result.success).toBe(false);
    });

    it('should reject name > 100 chars', () => {
      const result = createTicketTypeSchema.safeParse({
        ...validTicketType,
        name: 'x'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('transferTicketSchema', () => {
    it('should accept valid transfer', () => {
      const result = transferTicketSchema.safeParse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'recipient@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with optional message', () => {
      const result = transferTicketSchema.safeParse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'recipient@example.com',
        message: 'Enjoy the show!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = transferTicketSchema.safeParse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject message > 500 chars', () => {
      const result = transferTicketSchema.safeParse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'recipient@example.com',
        message: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ticketStatusEnum', () => {
    it('should accept all valid statuses', () => {
      const statuses = [
        'available', 'reserved', 'sold', 'active', 'transferred',
        'checked_in', 'used', 'refunded', 'expired', 'cancelled',
      ];
      statuses.forEach(status => {
        const result = ticketStatusEnum.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      const result = ticketStatusEnum.safeParse('invalid_status');
      expect(result.success).toBe(false);
    });
  });

  describe('validateQRSchema', () => {
    it('should accept valid QR data', () => {
      const result = validateQRSchema.safeParse({
        qrData: 'QR-TKT-123456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty QR data', () => {
      const result = validateQRSchema.safeParse({
        qrData: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject QR data > 2048 chars', () => {
      const result = validateQRSchema.safeParse({
        qrData: 'x'.repeat(2049),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ticketQuerySchema', () => {
    it('should accept valid query with coercion', () => {
      const result = ticketQuerySchema.safeParse({
        page: '2',
        limit: '50',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
      }
    });

    it('should accept with eventId filter', () => {
      const result = ticketQuerySchema.safeParse({
        eventId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with status filter', () => {
      const result = ticketQuerySchema.safeParse({
        status: 'active',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('safeString', () => {
    it('should create string schema with min/max', () => {
      const schema = safeString({ min: 2, max: 10 });
      
      expect(schema.safeParse('ab').success).toBe(true);
      expect(schema.safeParse('a').success).toBe(false);
      expect(schema.safeParse('a'.repeat(11)).success).toBe(false);
    });

    it('should normalize unicode', () => {
      const schema = safeString();
      const result = schema.parse('cafe\u0301'); // e + combining accent
      expect(result).toBe('café'); // Normalized to single char
    });
  });

  describe('validateRequest', () => {
    it('should return parsed data for valid input', () => {
      const result = validateRequest(uuidSchema, '123e4567-e89b-12d3-a456-426614174000');
      expect(result).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should throw ZodError for invalid input', () => {
      expect(() => validateRequest(uuidSchema, 'invalid')).toThrow(z.ZodError);
    });
  });

  describe('safeValidateRequest', () => {
    it('should return success result for valid input', () => {
      const result = safeValidateRequest(uuidSchema, '123e4567-e89b-12d3-a456-426614174000');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('123e4567-e89b-12d3-a456-426614174000');
      }
    });

    it('should return failure result with field errors for invalid input', () => {
      const result = safeValidateRequest(purchaseRequestSchema, {
        eventId: 'invalid',
        tickets: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.fieldErrors).toBeDefined();
        expect(Object.keys(result.fieldErrors).length).toBeGreaterThan(0);
      }
    });
  });

  describe('formatZodErrors', () => {
    it('should format errors with field and message', () => {
      const result = purchaseRequestSchema.safeParse({
        eventId: 'invalid',
        tickets: [],
      });

      if (!result.success) {
        const formatted = formatZodErrors(result.error);
        expect(Array.isArray(formatted)).toBe(true);
        expect(formatted[0]).toHaveProperty('field');
        expect(formatted[0]).toHaveProperty('message');
      }
    });
  });
});
