// =============================================================================
// TEST SUITE - validation.ts
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate, Schemas } from '../../../src/middleware/validation';

describe('validation middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('validate()', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number().min(0),
    });

    it('should pass valid data', async () => {
      mockRequest.body = { name: 'John', age: 30 };

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should update request body with validated data', async () => {
      mockRequest.body = { name: 'John', age: 30, extra: 'field' };

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({ name: 'John', age: 30 });
    });

    it('should return 400 for invalid data', async () => {
      mockRequest.body = { name: 'John' };

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return validation error details', async () => {
      mockRequest.body = { name: 'John' };

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.any(Array),
      });
    });

    it('should include error issues in response', async () => {
      mockRequest.body = { name: 123, age: -5 };

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.details.length).toBeGreaterThan(0);
    });

    it('should handle missing required fields', async () => {
      mockRequest.body = {};

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should handle wrong data types', async () => {
      mockRequest.body = { name: 123, age: 'thirty' };

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should pass errors to next if not ZodError', async () => {
      const errorSchema = z.object({}).refine(() => {
        throw new Error('Custom error');
      });

      mockRequest.body = {};

      const middleware = validate(errorSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should work with different schemas', async () => {
      const otherSchema = z.object({
        email: z.string().email(),
      });

      mockRequest.body = { email: 'test@example.com' };

      const middleware = validate(otherSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should strip unknown fields', async () => {
      mockRequest.body = {
        name: 'John',
        age: 30,
        unknown: 'field',
        another: 'extra',
      };

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({ name: 'John', age: 30 });
    });
  });

  describe('Schemas.purchase', () => {
    it('should validate correct purchase data', async () => {
      mockRequest.body = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 2,
      };

      const middleware = validate(Schemas.purchase);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require eventId as UUID', async () => {
      mockRequest.body = {
        eventId: 'not-a-uuid',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 2,
      };

      const middleware = validate(Schemas.purchase);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should validate quantity between 1 and 10', async () => {
      mockRequest.body = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 0,
      };

      const middleware = validate(Schemas.purchase);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should reject quantity over 10', async () => {
      mockRequest.body = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 11,
      };

      const middleware = validate(Schemas.purchase);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should allow optional paymentMethodId', async () => {
      mockRequest.body = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        ticketTypeId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 2,
        paymentMethodId: 'pm_123',
      };

      const middleware = validate(Schemas.purchase);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Schemas.refund', () => {
    it('should validate correct refund data', async () => {
      mockRequest.body = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const middleware = validate(Schemas.refund);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require orderId as UUID', async () => {
      mockRequest.body = {
        orderId: 'not-a-uuid',
      };

      const middleware = validate(Schemas.refund);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should allow optional reason', async () => {
      mockRequest.body = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Customer request',
      };

      const middleware = validate(Schemas.refund);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Schemas.transfer', () => {
    it('should validate correct transfer data', async () => {
      mockRequest.body = {
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientAddress: '0x1234567890123456789012345678901234567890',
      };

      const middleware = validate(Schemas.transfer);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require ticketId as UUID', async () => {
      mockRequest.body = {
        ticketId: 'not-a-uuid',
        recipientAddress: '0x1234567890123456789012345678901234567890',
      };

      const middleware = validate(Schemas.transfer);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should require recipientAddress', async () => {
      mockRequest.body = {
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const middleware = validate(Schemas.transfer);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });
});
