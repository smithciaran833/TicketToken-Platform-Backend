// =============================================================================
// TEST SUITE - validation.ts
// =============================================================================

import { ticketSchemas, validate } from '../../../src/utils/validation';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('Validation utils', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {
      body: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  // =============================================================================
  // ticketSchemas.purchaseTickets - 10 test cases
  // =============================================================================

  describe('ticketSchemas.purchaseTickets', () => {
    it('should validate correct purchase data', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
          },
        ],
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeUndefined();
    });

    it('should require eventId', () => {
      const data = {
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
          },
        ],
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeDefined();
      expect(error?.message).toContain('eventId');
    });

    it('should validate eventId as UUID', () => {
      const data = {
        eventId: 'not-a-uuid',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
          },
        ],
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeDefined();
    });

    it('should require tickets array', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeDefined();
      expect(error?.message).toContain('tickets');
    });

    it('should require at least one ticket', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [],
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeDefined();
    });

    it('should validate ticket quantity between 1 and 10', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 0,
          },
        ],
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeDefined();
    });

    it('should reject quantity over 10', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 11,
          },
        ],
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeDefined();
    });

    it('should allow optional paymentIntentId', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
          },
        ],
        paymentIntentId: 'pi_123',
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeUndefined();
    });

    it('should allow optional seatNumbers', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
            seatNumbers: ['A1', 'A2'],
          },
        ],
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeUndefined();
    });

    it('should allow optional metadata', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
          },
        ],
        metadata: { source: 'web' },
      };

      const { error } = ticketSchemas.purchaseTickets.validate(data);

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // ticketSchemas.createTicketType - 10 test cases
  // =============================================================================

  describe('ticketSchemas.createTicketType', () => {
    it('should validate correct ticket type data', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'VIP Pass',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeUndefined();
    });

    it('should require eventId', () => {
      const data = {
        name: 'VIP Pass',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeDefined();
    });

    it('should validate name length', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: '',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeDefined();
    });

    it('should validate price is non-negative', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'VIP Pass',
        priceCents: -100,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeDefined();
    });

    it('should require quantity at least 1', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'VIP Pass',
        priceCents: 10000,
        quantity: 0,
        maxPerPurchase: 5,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeDefined();
    });

    it('should validate maxPerPurchase between 1 and 10', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'VIP Pass',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 0,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeDefined();
    });

    it('should require saleEndDate after saleStartDate', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'VIP Pass',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: '2024-12-31T23:59:59Z',
        saleEndDate: '2024-01-01T00:00:00Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeDefined();
    });

    it('should validate ISO date format', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'VIP Pass',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: 'invalid-date',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeDefined();
    });

    it('should allow optional description', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'VIP Pass',
        description: 'Premium access',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeUndefined();
    });

    it('should allow zero price for free tickets', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Free Pass',
        priceCents: 0,
        quantity: 100,
        maxPerPurchase: 5,
        saleStartDate: '2024-01-01T00:00:00Z',
        saleEndDate: '2024-12-31T23:59:59Z',
      };

      const { error } = ticketSchemas.createTicketType.validate(data);

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // ticketSchemas.transferTicket - 5 test cases
  // =============================================================================

  describe('ticketSchemas.transferTicket', () => {
    it('should validate correct transfer data', () => {
      const data = {
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        toUserId: '123e4567-e89b-12d3-a456-426614174001',
      };

      const { error } = ticketSchemas.transferTicket.validate(data);

      expect(error).toBeUndefined();
    });

    it('should require ticketId', () => {
      const data = {
        toUserId: '123e4567-e89b-12d3-a456-426614174001',
      };

      const { error } = ticketSchemas.transferTicket.validate(data);

      expect(error).toBeDefined();
    });

    it('should require toUserId', () => {
      const data = {
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const { error } = ticketSchemas.transferTicket.validate(data);

      expect(error).toBeDefined();
    });

    it('should validate UUIDs', () => {
      const data = {
        ticketId: 'not-a-uuid',
        toUserId: 'also-not-a-uuid',
      };

      const { error } = ticketSchemas.transferTicket.validate(data);

      expect(error).toBeDefined();
    });

    it('should allow optional reason', () => {
      const data = {
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        toUserId: '123e4567-e89b-12d3-a456-426614174001',
        reason: 'Gift to friend',
      };

      const { error } = ticketSchemas.transferTicket.validate(data);

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // ticketSchemas.validateQR - 5 test cases
  // =============================================================================

  describe('ticketSchemas.validateQR', () => {
    it('should validate correct QR data', () => {
      const data = {
        qrCode: 'QR123456789',
        eventId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const { error } = ticketSchemas.validateQR.validate(data);

      expect(error).toBeUndefined();
    });

    it('should require qrCode', () => {
      const data = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const { error } = ticketSchemas.validateQR.validate(data);

      expect(error).toBeDefined();
    });

    it('should require eventId', () => {
      const data = {
        qrCode: 'QR123456789',
      };

      const { error } = ticketSchemas.validateQR.validate(data);

      expect(error).toBeDefined();
    });

    it('should allow optional entrance', () => {
      const data = {
        qrCode: 'QR123456789',
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        entrance: 'Gate A',
      };

      const { error } = ticketSchemas.validateQR.validate(data);

      expect(error).toBeUndefined();
    });

    it('should allow optional deviceId', () => {
      const data = {
        qrCode: 'QR123456789',
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        deviceId: 'DEVICE-001',
      };

      const { error} = ticketSchemas.validateQR.validate(data);

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // validate() middleware - 10 test cases
  // =============================================================================

  describe('validate() middleware', () => {
    it('should return validation function', () => {
      const middleware = validate(ticketSchemas.purchaseTickets);

      expect(typeof middleware).toBe('function');
    });

    it('should pass valid data', async () => {
      mockRequest.body = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
          },
        ],
      };

      const middleware = validate(ticketSchemas.purchaseTickets);
      const result = await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should return 400 for invalid data', async () => {
      mockRequest.body = {
        eventId: 'not-a-uuid',
      };

      const middleware = validate(ticketSchemas.purchaseTickets);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should send error details', async () => {
      mockRequest.body = {};

      const middleware = validate(ticketSchemas.purchaseTickets);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation error',
        details: expect.any(Array),
      });
    });

    it('should include validation messages', async () => {
      mockRequest.body = {};

      const middleware = validate(ticketSchemas.purchaseTickets);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.details.length).toBeGreaterThan(0);
    });

    it('should work with different schemas', async () => {
      mockRequest.body = {
        ticketId: 'not-a-uuid',
      };

      const middleware = validate(ticketSchemas.transferTicket);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should validate against correct schema', async () => {
      mockRequest.body = {
        qrCode: 'QR123',
        eventId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const middleware = validate(ticketSchemas.validateQR);
      const result = await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle null body as invalid', async () => {
      mockRequest.body = null as any;

      const middleware = validate(ticketSchemas.purchaseTickets);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle empty body', async () => {
      mockRequest.body = {};

      const middleware = validate(ticketSchemas.purchaseTickets);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should be reusable', async () => {
      const middleware = validate(ticketSchemas.purchaseTickets);

      mockRequest.body = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        tickets: [
          {
            ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
            quantity: 2,
          },
        ],
      };

      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      
      mockRequest.body = {};
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });
});
