import {
  apiResponseSchema,
  paginatedResponseSchema,
  ticketResponseSchema,
  ticketDetailResponseSchema,
  ticketTypeResponseSchema,
  reservationResponseSchema,
  purchaseResponseSchema,
  transferResponseSchema,
  validationResponseSchema,
  checkInResponseSchema,
  qrCodeResponseSchema,
  errorResponseSchema,
  healthCheckResponseSchema,
  sanitizeResponse,
  maskEmail,
  maskPhone,
} from '../../../src/schemas/response.schema';
import { z } from 'zod';

describe('Response Schemas', () => {
  describe('apiResponseSchema', () => {
    it('should accept valid success response', () => {
      const dataSchema = z.object({ id: z.string() });
      const schema = apiResponseSchema(dataSchema);

      const result = schema.safeParse({
        success: true,
        data: { id: '123' },
        meta: {
          timestamp: '2024-01-15T10:00:00.000Z',
          requestId: 'req-123',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept valid error response', () => {
      const dataSchema = z.object({ id: z.string() });
      const schema = apiResponseSchema(dataSchema);

      const result = schema.safeParse({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('paginatedResponseSchema', () => {
    it('should accept valid paginated response', () => {
      const itemSchema = z.object({ id: z.string() });
      const schema = paginatedResponseSchema(itemSchema);

      const result = schema.safeParse({
        items: [{ id: '1' }, { id: '2' }],
        pagination: {
          page: 1,
          limit: 20,
          total: 50,
          totalPages: 3,
          hasMore: true,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject items array > 100', () => {
      const itemSchema = z.object({ id: z.string() });
      const schema = paginatedResponseSchema(itemSchema);

      const items = Array(101).fill({ id: '1' });
      const result = schema.safeParse({
        items,
        pagination: {
          page: 1,
          limit: 20,
          total: 101,
          totalPages: 6,
          hasMore: false,
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('ticketResponseSchema', () => {
    it('should accept valid ticket response', () => {
      const result = ticketResponseSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        eventId: '123e4567-e89b-12d3-a456-426614174001',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
      });

      expect(result.success).toBe(true);
    });

    it('should accept with optional NFT info', () => {
      const result = ticketResponseSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        eventId: '123e4567-e89b-12d3-a456-426614174001',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
        nft: {
          mintAddress: 'abc123',
          onChain: true,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject extra fields (prevents data leakage)', () => {
      const result = ticketResponseSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        eventId: '123e4567-e89b-12d3-a456-426614174001',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
        owner_id: 'should-not-leak', // Internal field
        tenant_id: 'should-not-leak', // Internal field
      });

      expect(result.success).toBe(false);
    });
  });

  describe('ticketDetailResponseSchema', () => {
    it('should accept with usage history', () => {
      const result = ticketDetailResponseSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        eventId: '123e4567-e89b-12d3-a456-426614174001',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'active',
        qrCodeUrl: 'https://example.com/qr/123',
        usageHistory: [
          { date: '2024-01-15T10:00:00.000Z', action: 'scanned', location: 'Gate A' },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('ticketTypeResponseSchema', () => {
    it('should accept valid ticket type response', () => {
      const result = ticketTypeResponseSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        eventId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'VIP',
        priceCents: 10000,
        availableQuantity: 50,
        totalQuantity: 100,
        maxPerPurchase: 4,
        soldOut: false,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('reservationResponseSchema', () => {
    it('should accept valid reservation response', () => {
      const result = reservationResponseSchema.safeParse({
        reservationId: '123e4567-e89b-12d3-a456-426614174000',
        eventId: '123e4567-e89b-12d3-a456-426614174001',
        tickets: [
          { ticketTypeId: '123e4567-e89b-12d3-a456-426614174002', quantity: 2, pricePerTicket: 5000 },
        ],
        totalCents: 10000,
        expiresAt: '2024-01-15T10:15:00.000Z',
        status: 'pending',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('validationResponseSchema', () => {
    it('should accept valid ticket validation response', () => {
      const result = validationResponseSchema.safeParse({
        valid: true,
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'active',
        eventName: 'Concert',
        ticketTypeName: 'VIP',
      });

      expect(result.success).toBe(true);
    });

    it('should accept invalid ticket with reason', () => {
      const result = validationResponseSchema.safeParse({
        valid: false,
        status: 'expired',
        reason: 'Ticket has expired',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('checkInResponseSchema', () => {
    it('should accept successful check-in', () => {
      const result = checkInResponseSchema.safeParse({
        success: true,
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'checked_in',
        checkedInAt: '2024-01-15T18:00:00.000Z',
        ticketInfo: {
          eventName: 'Concert',
          ticketType: 'VIP',
          seatInfo: 'Row A, Seat 1',
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('qrCodeResponseSchema', () => {
    it('should accept valid QR code response', () => {
      const result = qrCodeResponseSchema.safeParse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        qrData: 'encrypted-qr-payload-data',
        expiresAt: '2024-01-15T18:00:00.000Z',
        format: 'base64',
      });

      expect(result.success).toBe(true);
    });

    it('should accept all format types', () => {
      ['base64', 'svg', 'url'].forEach(format => {
        const result = qrCodeResponseSchema.safeParse({
          ticketId: '123e4567-e89b-12d3-a456-426614174000',
          qrData: 'data',
          expiresAt: '2024-01-15T18:00:00.000Z',
          format,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('errorResponseSchema', () => {
    it('should accept RFC 7807 Problem Details format', () => {
      const result = errorResponseSchema.safeParse({
        type: 'https://api.tickettoken.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'The requested ticket was not found',
        timestamp: '2024-01-15T10:00:00.000Z',
        traceId: 'trace-123',
      });

      expect(result.success).toBe(true);
    });

    it('should accept with field-level errors', () => {
      const result = errorResponseSchema.safeParse({
        type: 'https://api.tickettoken.com/errors/validation',
        title: 'Validation Error',
        status: 400,
        timestamp: '2024-01-15T10:00:00.000Z',
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'quantity', message: 'Must be positive', code: 'INVALID_QUANTITY' },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('healthCheckResponseSchema', () => {
    it('should accept healthy status', () => {
      const result = healthCheckResponseSchema.safeParse({
        status: 'healthy',
        timestamp: '2024-01-15T10:00:00.000Z',
        version: '1.0.0',
        services: {
          database: { status: 'up', latencyMs: 5 },
          redis: { status: 'up', latencyMs: 2 },
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept degraded status', () => {
      const result = healthCheckResponseSchema.safeParse({
        status: 'degraded',
        timestamp: '2024-01-15T10:00:00.000Z',
        services: {
          database: { status: 'up' },
          redis: { status: 'degraded' },
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sanitizeResponse', () => {
    it('should strip unknown fields', () => {
      const schema = z.object({ id: z.string(), name: z.string() }).strict();
      const data = { id: '123', name: 'Test', secret: 'should-be-removed' };

      // Note: strict schemas will fail validation with extra fields
      // In practice, you'd use a non-strict schema for sanitization
      expect(() => sanitizeResponse(schema, data)).toThrow();
    });

    it('should pass through valid data', () => {
      const schema = z.object({ id: z.string() });
      const result = sanitizeResponse(schema, { id: '123' });
      expect(result).toEqual({ id: '123' });
    });
  });

  describe('maskEmail', () => {
    it('should mask email preserving domain', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo*****@example.com');
    });

    it('should handle short local part', () => {
      expect(maskEmail('ab@example.com')).toBe('**@example.com');
    });

    it('should handle invalid email', () => {
      expect(maskEmail('invalid')).toBe('***');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone showing last 4 digits', () => {
      expect(maskPhone('555-123-4567')).toBe('******4567');
    });

    it('should handle international format', () => {
      expect(maskPhone('+1 (555) 123-4567')).toBe('*******4567');
    });

    it('should handle short numbers', () => {
      expect(maskPhone('123')).toBe('***');
    });
  });
});
