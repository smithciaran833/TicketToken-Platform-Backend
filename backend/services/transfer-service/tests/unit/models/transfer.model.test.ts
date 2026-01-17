import {
  TransferError,
  TransferNotFoundError,
  TransferExpiredError,
  TicketNotFoundError,
  TicketNotTransferableError,
  Transfer,
  CreateGiftTransferRequest,
  AcceptTransferRequest
} from '../../../src/models/transfer.model';

describe('Transfer Model - Unit Tests', () => {
  describe('TransferError', () => {
    it('should create error with message, code, and statusCode', () => {
      const error = new TransferError('Test error', 'TEST_CODE', 400);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('TransferError');
    });

    it('should default to statusCode 400', () => {
      const error = new TransferError('Test error', 'TEST_CODE');

      expect(error.statusCode).toBe(400);
    });

    it('should be instance of Error', () => {
      const error = new TransferError('Test error', 'TEST_CODE', 400);

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instance of TransferError', () => {
      const error = new TransferError('Test error', 'TEST_CODE', 400);

      expect(error).toBeInstanceOf(TransferError);
    });

    it('should have stack trace', () => {
      const error = new TransferError('Test error', 'TEST_CODE', 400);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TransferError');
    });

    it('should work with different status codes', () => {
      const statusCodes = [400, 401, 403, 404, 409, 422, 500];

      for (const statusCode of statusCodes) {
        const error = new TransferError('Test', 'TEST', statusCode);
        expect(error.statusCode).toBe(statusCode);
      }
    });

    it('should preserve custom messages', () => {
      const messages = [
        'Short message',
        'A much longer error message with details',
        'Message with special chars: !@#$%^&*()',
        'Unicode message: 你好世界 🚀'
      ];

      for (const message of messages) {
        const error = new TransferError(message, 'TEST', 400);
        expect(error.message).toBe(message);
      }
    });

    it('should preserve error codes', () => {
      const codes = [
        'SIMPLE_CODE',
        'CODE_WITH_UNDERSCORES',
        'code_lowercase',
        'MixedCase123'
      ];

      for (const code of codes) {
        const error = new TransferError('Test', code, 400);
        expect(error.code).toBe(code);
      }
    });
  });

  describe('TransferNotFoundError', () => {
    it('should create error with default message', () => {
      const error = new TransferNotFoundError();

      expect(error.message).toBe('Transfer not found');
      expect(error.code).toBe('TRANSFER_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('TransferError');
    });

    it('should accept custom message', () => {
      const error = new TransferNotFoundError('Custom not found message');

      expect(error.message).toBe('Custom not found message');
      expect(error.code).toBe('TRANSFER_NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should be instance of TransferError', () => {
      const error = new TransferNotFoundError();

      expect(error).toBeInstanceOf(TransferError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should be catchable as TransferError', () => {
      try {
        throw new TransferNotFoundError();
      } catch (error) {
        expect(error).toBeInstanceOf(TransferError);
        expect((error as TransferError).code).toBe('TRANSFER_NOT_FOUND');
      }
    });

    it('should have correct statusCode for 404', () => {
      const error = new TransferNotFoundError();

      expect(error.statusCode).toBe(404);
    });
  });

  describe('TransferExpiredError', () => {
    it('should create error with default message', () => {
      const error = new TransferExpiredError();

      expect(error.message).toBe('Transfer has expired');
      expect(error.code).toBe('TRANSFER_EXPIRED');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('TransferError');
    });

    it('should accept custom message', () => {
      const error = new TransferExpiredError('This transfer expired yesterday');

      expect(error.message).toBe('This transfer expired yesterday');
      expect(error.code).toBe('TRANSFER_EXPIRED');
      expect(error.statusCode).toBe(400);
    });

    it('should be instance of TransferError', () => {
      const error = new TransferExpiredError();

      expect(error).toBeInstanceOf(TransferError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct statusCode for 400', () => {
      const error = new TransferExpiredError();

      expect(error.statusCode).toBe(400);
    });
  });

  describe('TicketNotFoundError', () => {
    it('should create error with default message', () => {
      const error = new TicketNotFoundError();

      expect(error.message).toBe('Ticket not found or not owned by user');
      expect(error.code).toBe('TICKET_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('TransferError');
    });

    it('should accept custom message', () => {
      const error = new TicketNotFoundError('Ticket ABC123 not found');

      expect(error.message).toBe('Ticket ABC123 not found');
      expect(error.code).toBe('TICKET_NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should be instance of TransferError', () => {
      const error = new TicketNotFoundError();

      expect(error).toBeInstanceOf(TransferError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('TicketNotTransferableError', () => {
    it('should create error with default message', () => {
      const error = new TicketNotTransferableError();

      expect(error.message).toBe('This ticket type is not transferable');
      expect(error.code).toBe('TICKET_NOT_TRANSFERABLE');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('TransferError');
    });

    it('should accept custom message', () => {
      const error = new TicketNotTransferableError('VIP tickets cannot be transferred');

      expect(error.message).toBe('VIP tickets cannot be transferred');
      expect(error.code).toBe('TICKET_NOT_TRANSFERABLE');
      expect(error.statusCode).toBe(400);
    });

    it('should be instance of TransferError', () => {
      const error = new TicketNotTransferableError();

      expect(error).toBeInstanceOf(TransferError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Error Hierarchy', () => {
    it('should maintain proper instanceof checks', () => {
      const errors = [
        new TransferNotFoundError(),
        new TransferExpiredError(),
        new TicketNotFoundError(),
        new TicketNotTransferableError()
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(TransferError);
      }
    });

    it('should distinguish different error types', () => {
      const notFound = new TransferNotFoundError();
      const expired = new TransferExpiredError();
      const ticketNotFound = new TicketNotFoundError();
      const notTransferable = new TicketNotTransferableError();

      expect(notFound.code).not.toBe(expired.code);
      expect(expired.code).not.toBe(ticketNotFound.code);
      expect(ticketNotFound.code).not.toBe(notTransferable.code);
    });

    it('should be catchable by type', () => {
      const testError = (error: Error) => {
        if (error instanceof TransferNotFoundError) {
          return 'not-found';
        } else if (error instanceof TransferExpiredError) {
          return 'expired';
        } else if (error instanceof TicketNotFoundError) {
          return 'ticket-not-found';
        } else if (error instanceof TicketNotTransferableError) {
          return 'not-transferable';
        }
        return 'unknown';
      };

      expect(testError(new TransferNotFoundError())).toBe('not-found');
      expect(testError(new TransferExpiredError())).toBe('expired');
      expect(testError(new TicketNotFoundError())).toBe('ticket-not-found');
      expect(testError(new TicketNotTransferableError())).toBe('not-transferable');
    });
  });

  describe('Error Usage Patterns', () => {
    it('should work with try-catch blocks', () => {
      expect(() => {
        throw new TransferNotFoundError();
      }).toThrow(TransferNotFoundError);

      expect(() => {
        throw new TransferNotFoundError();
      }).toThrow(TransferError);

      expect(() => {
        throw new TransferNotFoundError();
      }).toThrow(Error);
    });

    it('should preserve stack trace through throw', () => {
      try {
        throw new TransferExpiredError();
      } catch (error) {
        expect((error as Error).stack).toBeDefined();
        expect((error as Error).stack).toContain('transfer.model.test.ts');
      }
    });

    it('should work with async/await', async () => {
      const asyncFunc = async () => {
        throw new TransferNotFoundError();
      };

      await expect(asyncFunc()).rejects.toThrow(TransferNotFoundError);
      await expect(asyncFunc()).rejects.toThrow(TransferError);
    });

    it('should work with Promise.reject', async () => {
      const promise = Promise.reject(new TransferExpiredError());

      await expect(promise).rejects.toBeInstanceOf(TransferExpiredError);
      await expect(promise).rejects.toBeInstanceOf(TransferError);
    });
  });

  describe('Error Properties', () => {
    it('should expose all properties publicly', () => {
      const error = new TransferError('Test', 'CODE', 500);

      expect(error.message).toBeDefined();
      expect(error.code).toBeDefined();
      expect(error.statusCode).toBeDefined();
      expect(error.name).toBeDefined();
      expect(error.stack).toBeDefined();
    });

    it('should have readonly code property', () => {
      const error = new TransferError('Test', 'CODE', 400);

      expect(() => {
        (error as any).code = 'NEW_CODE';
      }).toThrow();
    });

    it('should have readonly statusCode property', () => {
      const error = new TransferError('Test', 'CODE', 400);

      expect(() => {
        (error as any).statusCode = 500;
      }).toThrow();
    });

    it('should allow message modification', () => {
      const error = new TransferError('Original', 'CODE', 400);
      error.message = 'Modified';

      expect(error.message).toBe('Modified');
    });
  });

  describe('Error Serialization', () => {
    it('should serialize to JSON', () => {
      const error = new TransferError('Test error', 'TEST_CODE', 400);
      const json = JSON.stringify(error);

      expect(json).toContain('Test error');
    });

    it('should work with Object.assign', () => {
      const error = new TransferNotFoundError();
      const copy = Object.assign({}, error);

      expect(copy.message).toBe('Transfer not found');
      expect(copy.code).toBe('TRANSFER_NOT_FOUND');
      expect(copy.statusCode).toBe(404);
    });

    it('should preserve properties in error handlers', () => {
      const error = new TransferExpiredError('Custom message');

      const handler = (err: TransferError) => ({
        message: err.message,
        code: err.code,
        statusCode: err.statusCode
      });

      const result = handler(error);

      expect(result.message).toBe('Custom message');
      expect(result.code).toBe('TRANSFER_EXPIRED');
      expect(result.statusCode).toBe(400);
    });
  });

  describe('TypeScript Type Guards', () => {
    it('should work with type guards', () => {
      const isTransferError = (error: unknown): error is TransferError => {
        return error instanceof TransferError;
      };

      expect(isTransferError(new TransferError('Test', 'CODE', 400))).toBe(true);
      expect(isTransferError(new TransferNotFoundError())).toBe(true);
      expect(isTransferError(new Error('Regular error'))).toBe(false);
      expect(isTransferError('not an error')).toBe(false);
    });

    it('should narrow types correctly', () => {
      const handleError = (error: unknown) => {
        if (error instanceof TransferError) {
          // TypeScript should know error has code and statusCode here
          return {
            code: error.code,
            statusCode: error.statusCode
          };
        }
        return { code: 'UNKNOWN', statusCode: 500 };
      };

      const result1 = handleError(new TransferNotFoundError());
      const result2 = handleError(new Error('Generic'));

      expect(result1.code).toBe('TRANSFER_NOT_FOUND');
      expect(result1.statusCode).toBe(404);
      expect(result2.code).toBe('UNKNOWN');
      expect(result2.statusCode).toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string message', () => {
      const error = new TransferError('', 'CODE', 400);

      expect(error.message).toBe('');
      expect(error.code).toBe('CODE');
    });

    it('should handle empty string code', () => {
      const error = new TransferError('Message', '', 400);

      expect(error.message).toBe('Message');
      expect(error.code).toBe('');
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new TransferError(longMessage, 'CODE', 400);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Error: \n\t\r"quotes"\' and more';
      const error = new TransferError(specialMessage, 'CODE', 400);

      expect(error.message).toBe(specialMessage);
    });

    it('should handle zero statusCode', () => {
      const error = new TransferError('Test', 'CODE', 0);

      expect(error.statusCode).toBe(0);
    });

    it('should handle negative statusCode', () => {
      const error = new TransferError('Test', 'CODE', -1);

      expect(error.statusCode).toBe(-1);
    });
  });
});
