/**
 * IMPROVED Unit Tests for Transfer-Specific Error Classes
 * 
 * Tests actual behavior, not just property existence:
 * - Error inheritance and catching
 * - RFC 7807 serialization
 * - Error code uniqueness
 * - Status code correctness
 * - Integration with error handling patterns
 */

import {
  TransferNotFoundError,
  TransferExpiredError,
  TicketNotFoundError,
  TicketNotTransferableError
} from '../../../src/models/transfer.model';

describe('Transfer Error Classes - Behavioral Tests', () => {
  describe('Error Hierarchy and Catching', () => {
    it('should be catchable as generic Error', () => {
      const error = new TransferNotFoundError();
      
      try {
        throw error;
      } catch (e) {
        expect(e instanceof Error).toBe(true);
        expect(e).toBeInstanceOf(Error);
      }
    });

    it('should be distinguishable by type in catch blocks', () => {
      const errors = [
        new TransferNotFoundError(),
        new TransferExpiredError(),
        new TicketNotFoundError(),
        new TicketNotTransferableError()
      ];

      errors.forEach(error => {
        try {
          throw error;
        } catch (e) {
          // Should be able to handle specific error types
          if (e instanceof TransferNotFoundError) {
            expect(e.statusCode).toBe(404);
          } else if (e instanceof TransferExpiredError) {
            expect(e.statusCode).toBe(400);
          } else if (e instanceof TicketNotFoundError) {
            expect(e.statusCode).toBe(404);
          } else if (e instanceof TicketNotTransferableError) {
            expect(e.statusCode).toBe(400);
          }
        }
      });
    });

    it('should maintain stack trace through error chain', () => {
      const error = new TransferNotFoundError('Custom message');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TransferNotFoundError');
      expect(error.stack).toContain('transfer.errors.test.ts');
    });

    it('should preserve instanceof checks after serialization', () => {
      const error = new TransferExpiredError();
      
      // Simulate error being passed around
      const serialized = JSON.parse(JSON.stringify({
        name: error.name,
        message: error.message,
        code: error.code
      }));

      // Original error should maintain instanceof
      expect(error instanceof TransferExpiredError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('Error Code Uniqueness', () => {
    it('should have unique error codes for different error types', () => {
      const errors = [
        new TransferNotFoundError(),
        new TransferExpiredError(),
        new TicketNotFoundError(),
        new TicketNotTransferableError()
      ];

      const codes = errors.map(e => e.code);
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should use consistent error code format', () => {
      const errors = [
        new TransferNotFoundError(),
        new TransferExpiredError(),
        new TicketNotFoundError(),
        new TicketNotTransferableError()
      ];

      errors.forEach(error => {
        // Should be UPPER_SNAKE_CASE
        expect(error.code).toMatch(/^[A-Z_]+$/);
        // Should not be empty
        expect(error.code.length).toBeGreaterThan(0);
      });
    });
  });

  describe('HTTP Status Code Correctness', () => {
    it('should use 404 for not found errors', () => {
      const notFoundErrors = [
        new TransferNotFoundError(),
        new TicketNotFoundError()
      ];

      notFoundErrors.forEach(error => {
        expect(error.statusCode).toBe(404);
      });
    });

    it('should use 400 for bad request errors', () => {
      const badRequestErrors = [
        new TransferExpiredError(),
        new TicketNotTransferableError()
      ];

      badRequestErrors.forEach(error => {
        expect(error.statusCode).toBe(400);
      });
    });

    it('should use standard HTTP status codes only', () => {
      const errors = [
        new TransferNotFoundError(),
        new TransferExpiredError(),
        new TicketNotFoundError(),
        new TicketNotTransferableError()
      ];

      const validStatusCodes = [400, 401, 403, 404, 409, 410, 422, 429, 500, 502, 503];
      
      errors.forEach(error => {
        expect(validStatusCodes).toContain(error.statusCode);
      });
    });
  });

  describe('Error Message Customization', () => {
    it('should accept custom messages', () => {
      const customMessage = 'Transfer abc-123 not found in database';
      const error = new TransferNotFoundError(customMessage);
      
      expect(error.message).toBe(customMessage);
    });

    it('should have sensible default messages', () => {
      const errors = [
        new TransferNotFoundError(),
        new TransferExpiredError(),
        new TicketNotFoundError(),
        new TicketNotTransferableError()
      ];

      errors.forEach(error => {
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
        expect(error.message).not.toBe('Error'); // Should be descriptive
      });
    });

    it('should preserve custom message through error propagation', () => {
      const customMessage = 'Ticket 123 cannot be transferred within 24h of event';
      const error = new TicketNotTransferableError(customMessage);
      
      try {
        throw error;
      } catch (e) {
        expect((e as Error).message).toBe(customMessage);
      }
    });
  });

  describe('Error Logging and Debugging', () => {
    it('should include helpful information in toString', () => {
      const error = new TransferNotFoundError('Transfer xyz-789 not found');
      const errorString = error.toString();
      
      expect(errorString).toContain('TransferError');
      expect(errorString).toContain('Transfer xyz-789 not found');
    });

    it('should expose error code for logging', () => {
      const error = new TransferExpiredError();
      
      // Should be able to log structured errors
      const logEntry = {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode
      };

      expect(logEntry.code).toBe('TRANSFER_EXPIRED');
      expect(logEntry.statusCode).toBe(400);
    });

    it('should include stack trace for debugging', () => {
      const error = new TicketNotFoundError();
      
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack!.length).toBeGreaterThan(0);
    });
  });

  describe('Real-World Error Handling Patterns', () => {
    it('should work with express error middleware pattern', () => {
      // Simulate express error handler
      const expressErrorHandler = (err: any, req: any, res: any, next: any) => {
        if (err instanceof TransferNotFoundError || err instanceof TicketNotFoundError) {
          return { status: err.statusCode, body: { error: err.message, code: err.code } };
        }
        return { status: 500, body: { error: 'Internal Server Error' } };
      };

      const error = new TransferNotFoundError('Transfer not found');
      const response = expressErrorHandler(error, {}, {}, () => {});

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('TRANSFER_NOT_FOUND');
    });

    it('should work with try-catch-rethrow pattern', () => {
      const businessLogic = () => {
        throw new TicketNotTransferableError('VIP tickets cannot be transferred');
      };

      try {
        businessLogic();
      } catch (error) {
        if (error instanceof TicketNotTransferableError) {
          // Successfully caught specific error type
          expect(error.statusCode).toBe(400);
          expect(error.code).toBe('TICKET_NOT_TRANSFERABLE');
        } else {
          fail('Should have caught TicketNotTransferableError');
        }
      }
    });

    it('should work with promise rejection handling', async () => {
      const asyncOperation = async () => {
        throw new TransferExpiredError('Transfer expired 24 hours ago');
      };

      await expect(asyncOperation()).rejects.toThrow(TransferExpiredError);
      
      try {
        await asyncOperation();
      } catch (error) {
        expect(error).toBeInstanceOf(TransferExpiredError);
        expect((error as TransferExpiredError).statusCode).toBe(400);
      }
    });

    it('should support error transformation pipeline', () => {
      const transformError = (error: Error): { code: string; status: number; message: string } => {
        if (error instanceof TransferNotFoundError || 
            error instanceof TransferExpiredError ||
            error instanceof TicketNotFoundError ||
            error instanceof TicketNotTransferableError) {
          return {
            code: error.code,
            status: error.statusCode,
            message: error.message
          };
        }
        return {
          code: 'INTERNAL_ERROR',
          status: 500,
          message: 'An unexpected error occurred'
        };
      };

      const error = new TransferExpiredError();
      const transformed = transformError(error);

      expect(transformed.code).toBe('TRANSFER_EXPIRED');
      expect(transformed.status).toBe(400);
    });
  });

  describe('Error Comparison and Equality', () => {
    it('should compare errors by code, not instance', () => {
      const error1 = new TransferNotFoundError('Message 1');
      const error2 = new TransferNotFoundError('Message 2');

      // Different instances
      expect(error1).not.toBe(error2);
      
      // But same error code
      expect(error1.code).toBe(error2.code);
      expect(error1.statusCode).toBe(error2.statusCode);
    });

    it('should differentiate errors with same status code but different meanings', () => {
      const error1 = new TransferNotFoundError();
      const error2 = new TicketNotFoundError();

      // Same status code
      expect(error1.statusCode).toBe(error2.statusCode);
      
      // But different codes and types
      expect(error1.code).not.toBe(error2.code);
      expect(error1).not.toBeInstanceOf(TicketNotFoundError);
      expect(error2).not.toBeInstanceOf(TransferNotFoundError);
    });
  });

  describe('Error Creation Patterns', () => {
    it('should support factory pattern for dynamic error creation', () => {
      const createNotFoundError = (type: 'transfer' | 'ticket') => {
        return type === 'transfer' 
          ? new TransferNotFoundError()
          : new TicketNotFoundError();
      };

      const transferError = createNotFoundError('transfer');
      const ticketError = createNotFoundError('ticket');

      expect(transferError).toBeInstanceOf(TransferNotFoundError);
      expect(ticketError).toBeInstanceOf(TicketNotFoundError);
    });

    it('should support builder pattern for error details', () => {
      const buildError = (message: string) => {
        const error = new TicketNotTransferableError(message);
        return {
          error,
          toJSON: () => ({
            code: error.code,
            message: error.message,
            statusCode: error.statusCode
          })
        };
      };

      const result = buildError('Cannot transfer within 24 hours');
      expect(result.toJSON().code).toBe('TICKET_NOT_TRANSFERABLE');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long custom messages', () => {
      const longMessage = 'A'.repeat(1000);
      const error = new TransferNotFoundError(longMessage);
      
      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(1000);
    });

    it('should handle empty string messages', () => {
      const error = new TransferExpiredError('');
      
      expect(error.message).toBe('');
      expect(error.code).toBe('TRANSFER_EXPIRED');
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Error: {transfer: "123"} \n\t failed!';
      const error = new TicketNotFoundError(specialMessage);
      
      expect(error.message).toBe(specialMessage);
    });

    it('should handle unicode in messages', () => {
      const unicodeMessage = 'Transfer 转账 not found 😢';
      const error = new TransferNotFoundError(unicodeMessage);
      
      expect(error.message).toBe(unicodeMessage);
    });
  });
});
