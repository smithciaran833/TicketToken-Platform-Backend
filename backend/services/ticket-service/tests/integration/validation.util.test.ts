import { ticketSchemas, validate } from '../../src/utils/validation';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR VALIDATION UTILITY
 * Tests Joi validation schemas and middleware
 */

describe('Validation Utility Integration Tests', () => {
  describe('ticketSchemas.purchaseTickets', () => {
    it('should validate valid purchase request', () => {
      const validPurchase = {
        eventId: uuidv4(),
        tickets: [
          {
            ticketTypeId: uuidv4(),
            quantity: 2
          }
        ]
      };

      const { error } = ticketSchemas.purchaseTickets.validate(validPurchase);
      expect(error).toBeUndefined();
    });

    it('should require eventId', () => {
      const invalid = {
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1 }]
      };

      const { error } = ticketSchemas.purchaseTickets.validate(invalid);
      expect(error).toBeDefined();
      expect(error?.message).toContain('eventId');
    });

    it('should require tickets array', () => {
      const invalid = {
        eventId: uuidv4()
      };

      const { error } = ticketSchemas.purchaseTickets.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should reject empty tickets array', () => {
      const invalid = {
        eventId: uuidv4(),
        tickets: []
      };

      const { error } = ticketSchemas.purchaseTickets.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should require ticketTypeId in each ticket', () => {
      const invalid = {
        eventId: uuidv4(),
        tickets: [{ quantity: 1 }]
      };

      const { error } = ticketSchemas.purchaseTickets.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should require quantity in each ticket', () => {
      const invalid = {
        eventId: uuidv4(),
        tickets: [{ ticketTypeId: uuidv4() }]
      };

      const { error } = ticketSchemas.purchaseTickets.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should reject quantity less than 1', () => {
      const invalid = {
        eventId: uuidv4(),
        tickets: [{ ticketTypeId: uuidv4(), quantity: 0 }]
      };

      const { error } = ticketSchemas.purchaseTickets.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should reject quantity greater than 10', () => {
      const invalid = {
        eventId: uuidv4(),
        tickets: [{ ticketTypeId: uuidv4(), quantity: 11 }]
      };

      const { error } = ticketSchemas.purchaseTickets.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should accept optional seatNumbers', () => {
      const valid = {
        eventId: uuidv4(),
        tickets: [{
          ticketTypeId: uuidv4(),
          quantity: 2,
          seatNumbers: ['A1', 'A2']
        }]
      };

      const { error } = ticketSchemas.purchaseTickets.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should accept optional metadata', () => {
      const valid = {
        eventId: uuidv4(),
        tickets: [{ ticketTypeId: uuidv4(), quantity: 1 }],
        metadata: { source: 'web', campaign: 'summer' }
      };

      const { error } = ticketSchemas.purchaseTickets.validate(valid);
      expect(error).toBeUndefined();
    });
  });

  describe('ticketSchemas.createTicketType', () => {
    it('should validate valid ticket type', () => {
      const valid = {
        eventId: uuidv4(),
        name: 'VIP Pass',
        priceCents: 10000,
        quantity: 100,
        maxPerPurchase: 4,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 86400000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should require name', () => {
      const invalid = {
        eventId: uuidv4(),
        priceCents: 5000,
        quantity: 50,
        maxPerPurchase: 2,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 86400000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should reject name longer than 100 characters', () => {
      const invalid = {
        eventId: uuidv4(),
        name: 'a'.repeat(101),
        priceCents: 5000,
        quantity: 50,
        maxPerPurchase: 2,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 86400000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should accept optional description', () => {
      const valid = {
        eventId: uuidv4(),
        name: 'General Admission',
        description: 'Standard entry ticket',
        priceCents: 5000,
        quantity: 200,
        maxPerPurchase: 5,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 86400000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should reject negative price', () => {
      const invalid = {
        eventId: uuidv4(),
        name: 'Free Ticket',
        priceCents: -100,
        quantity: 50,
        maxPerPurchase: 2,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 86400000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should accept zero price for free tickets', () => {
      const valid = {
        eventId: uuidv4(),
        name: 'Free Entry',
        priceCents: 0,
        quantity: 100,
        maxPerPurchase: 1,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 86400000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should require saleEndDate after saleStartDate', () => {
      const now = new Date();
      const invalid = {
        eventId: uuidv4(),
        name: 'Early Bird',
        priceCents: 5000,
        quantity: 50,
        maxPerPurchase: 2,
        saleStartDate: now.toISOString(),
        saleEndDate: new Date(now.getTime() - 1000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should reject maxPerPurchase greater than 10', () => {
      const invalid = {
        eventId: uuidv4(),
        name: 'Bulk Ticket',
        priceCents: 5000,
        quantity: 500,
        maxPerPurchase: 11,
        saleStartDate: new Date().toISOString(),
        saleEndDate: new Date(Date.now() + 86400000).toISOString()
      };

      const { error } = ticketSchemas.createTicketType.validate(invalid);
      expect(error).toBeDefined();
    });
  });

  describe('ticketSchemas.transferTicket', () => {
    it('should validate valid transfer request', () => {
      const valid = {
        ticketId: uuidv4(),
        toUserId: uuidv4()
      };

      const { error } = ticketSchemas.transferTicket.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should require ticketId', () => {
      const invalid = {
        toUserId: uuidv4()
      };

      const { error } = ticketSchemas.transferTicket.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should require toUserId', () => {
      const invalid = {
        ticketId: uuidv4()
      };

      const { error } = ticketSchemas.transferTicket.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should accept optional reason', () => {
      const valid = {
        ticketId: uuidv4(),
        toUserId: uuidv4(),
        reason: 'Gift for friend'
      };

      const { error } = ticketSchemas.transferTicket.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should reject reason longer than 200 characters', () => {
      const invalid = {
        ticketId: uuidv4(),
        toUserId: uuidv4(),
        reason: 'a'.repeat(201)
      };

      const { error } = ticketSchemas.transferTicket.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should require UUID format for ticketId', () => {
      const invalid = {
        ticketId: 'not-a-uuid',
        toUserId: uuidv4()
      };

      const { error } = ticketSchemas.transferTicket.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should require UUID format for toUserId', () => {
      const invalid = {
        ticketId: uuidv4(),
        toUserId: 'not-a-uuid'
      };

      const { error } = ticketSchemas.transferTicket.validate(invalid);
      expect(error).toBeDefined();
    });
  });

  describe('ticketSchemas.validateQR', () => {
    it('should validate valid QR validation request', () => {
      const valid = {
        qrCode: 'encrypted-qr-code-data',
        eventId: uuidv4()
      };

      const { error } = ticketSchemas.validateQR.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should require qrCode', () => {
      const invalid = {
        eventId: uuidv4()
      };

      const { error } = ticketSchemas.validateQR.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should require eventId', () => {
      const invalid = {
        qrCode: 'some-qr-code'
      };

      const { error } = ticketSchemas.validateQR.validate(invalid);
      expect(error).toBeDefined();
    });

    it('should accept optional entrance', () => {
      const valid = {
        qrCode: 'encrypted-qr-code',
        eventId: uuidv4(),
        entrance: 'Main Gate'
      };

      const { error } = ticketSchemas.validateQR.validate(valid);
      expect(error).toBeUndefined();
    });

    it('should accept optional deviceId', () => {
      const valid = {
        qrCode: 'encrypted-qr-code',
        eventId: uuidv4(),
        deviceId: 'scanner-001'
      };

      const { error } = ticketSchemas.validateQR.validate(valid);
      expect(error).toBeUndefined();
    });
  });

  describe('validate middleware', () => {
    it('should create validation middleware function', () => {
      const middleware = validate(ticketSchemas.purchaseTickets);
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should pass validation for valid data', async () => {
      const middleware = validate(ticketSchemas.purchaseTickets);
      
      const mockRequest = {
        body: {
          eventId: uuidv4(),
          tickets: [{ ticketTypeId: uuidv4(), quantity: 2 }]
        }
      } as any;

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid data', async () => {
      const middleware = validate(ticketSchemas.purchaseTickets);
      
      const mockRequest = {
        body: {
          eventId: 'not-a-uuid',
          tickets: []
        }
      } as any;

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          details: expect.any(Array)
        })
      );
    });

    it('should include validation error details', async () => {
      const middleware = validate(ticketSchemas.purchaseTickets);
      
      const mockRequest = {
        body: {
          tickets: [{ quantity: 0 }]
        }
      } as any;

      const mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          details: expect.arrayContaining([expect.any(String)])
        })
      );
    });
  });
});
