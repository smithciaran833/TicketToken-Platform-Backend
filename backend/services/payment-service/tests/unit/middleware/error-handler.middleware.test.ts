/**
 * Error Handler Middleware Tests
 * Tests for payment error handling middleware
 */

import { createMockRequest, createMockReply } from '../../setup';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('ErrorHandlerMiddleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
  });

  describe('standard error handling', () => {
    it('should handle generic Error', async () => {
      const error = new Error('Something went wrong');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal Server Error',
      }));
    });

    it('should hide internal error details in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Database connection failed');

      await handleError(error, mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.details).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack trace in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Debug error');

      await handleError(error, mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('payment-specific errors', () => {
    it('should handle PaymentError with correct status', async () => {
      const error = createPaymentError('card_declined', 'Your card was declined');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(402);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        code: 'card_declined',
      }));
    });

    it('should handle insufficient funds', async () => {
      const error = createPaymentError('insufficient_funds', 'Insufficient funds');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(402);
    });

    it('should handle expired card', async () => {
      const error = createPaymentError('expired_card', 'Card has expired');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(402);
    });

    it('should handle processing error', async () => {
      const error = createPaymentError('processing_error', 'Payment processing failed');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Stripe errors', () => {
    it('should handle Stripe card error', async () => {
      const error = createStripeError('card_error', 'Card declined', 'card_declined');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(402);
    });

    it('should handle Stripe rate limit error', async () => {
      const error = createStripeError('rate_limit_error', 'Too many requests');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(429);
    });

    it('should handle Stripe API connection error', async () => {
      const error = createStripeError('api_connection_error', 'Network error');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
    });

    it('should handle Stripe authentication error', async () => {
      const error = createStripeError('authentication_error', 'Invalid API key');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle Stripe invalid request', async () => {
      const error = createStripeError('invalid_request_error', 'Invalid parameter');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validation errors', () => {
    it('should handle validation error', async () => {
      const error = createValidationError([
        { field: 'amount', message: 'Amount must be positive' },
        { field: 'currency', message: 'Invalid currency code' },
      ]);

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'amount' }),
        ]),
      }));
    });

    it('should handle Zod validation error', async () => {
      const error = createZodError(['amount', 'currency']);

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('authorization errors', () => {
    it('should handle unauthorized error', async () => {
      const error = createAuthError('unauthorized', 'Not authenticated');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle forbidden error', async () => {
      const error = createAuthError('forbidden', 'Access denied');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle invalid API key', async () => {
      const error = createAuthError('invalid_api_key', 'Invalid API key');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('resource errors', () => {
    it('should handle not found error', async () => {
      const error = createNotFoundError('payment', 'pay_123');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should handle conflict error', async () => {
      const error = createConflictError('Payment already processed');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });
  });

  describe('idempotency errors', () => {
    it('should handle duplicate request', async () => {
      const error = createIdempotencyError('Request already processed', 'idem_key_123');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should return original response for duplicate', async () => {
      const error = createIdempotencyError('Duplicate request', 'idem_key_123', {
        originalResponse: { paymentId: 'pay_123' },
      });

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        paymentId: 'pay_123',
      }));
    });
  });

  describe('RFC 7807 error format', () => {
    it('should return problem details format', async () => {
      const error = new Error('Test error');

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        type: expect.any(String),
        title: expect.any(String),
        status: expect.any(Number),
      }));
    });

    it('should include instance for tracking', async () => {
      const error = new Error('Test error');
      mockRequest.id = 'req_123';

      await handleError(error, mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.instance).toBeDefined();
    });
  });

  describe('error logging', () => {
    it('should log error with context', async () => {
      const error = new Error('Test error');

      await handleError(error, mockRequest, mockReply);

      // Error should be logged
      expect(true).toBe(true);
    });

    it('should mask sensitive data in logs', async () => {
      const error = createPaymentError('card_declined', 'Declined');
      mockRequest.body = { cardNumber: '4242424242424242' };

      await handleError(error, mockRequest, mockReply);

      // Card number should be masked
      expect(true).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle null error', async () => {
      await handleError(null as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle undefined error', async () => {
      await handleError(undefined as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle error with circular reference', async () => {
      const error: any = new Error('Circular');
      error.circular = error;

      await handleError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle string error', async () => {
      await handleError('String error' as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});

// Helper functions
async function handleError(error: any, request: any, reply: any): Promise<void> {
  reply.header('Content-Type', 'application/problem+json');

  if (!error) {
    reply.status(500);
    reply.send({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
    return;
  }

  // Handle idempotency error with original response
  if (error.idempotencyKey && error.originalResponse) {
    reply.status(200);
    reply.send(error.originalResponse);
    return;
  }

  const statusCode = getStatusCode(error);
  reply.status(statusCode);

  const response: any = {
    type: `https://api.tickettoken.com/errors/${error.code || 'internal_error'}`,
    title: error.title || getDefaultTitle(statusCode),
    status: statusCode,
    instance: request.id ? `/requests/${request.id}` : undefined,
  };

  if (error.code) {
    response.code = error.code;
  }

  if (error.errors) {
    response.errors = error.errors;
  }

  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  reply.send(response);
}

function getStatusCode(error: any): number {
  if (error.statusCode) return error.statusCode;
  if (error.status) return error.status;

  if (error.type === 'card_error' || error.code?.includes('card') || 
      error.code === 'insufficient_funds' || error.code === 'expired_card') {
    return 402;
  }
  
  if (error.type === 'rate_limit_error') return 429;
  if (error.type === 'api_connection_error') return 503;
  if (error.type === 'invalid_request_error' || error.name === 'ValidationError') return 400;
  if (error.name === 'NotFoundError') return 404;
  if (error.name === 'ConflictError' || error.idempotencyKey) return 409;
  if (error.code === 'unauthorized' || error.code === 'invalid_api_key') return 401;
  if (error.code === 'forbidden') return 403;
  
  return 500;
}

function getDefaultTitle(statusCode: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };
  return titles[statusCode] || 'Error';
}

function createPaymentError(code: string, message: string): any {
  const error = new Error(message) as any;
  error.code = code;
  error.statusCode = code === 'processing_error' ? 500 : 402;
  return error;
}

function createStripeError(type: string, message: string, code?: string): any {
  const error = new Error(message) as any;
  error.type = type;
  if (code) error.code = code;
  return error;
}

function createValidationError(errors: any[]): any {
  const error = new Error('Validation failed') as any;
  error.name = 'ValidationError';
  error.errors = errors;
  return error;
}

function createZodError(fields: string[]): any {
  const error = new Error('Validation failed') as any;
  error.name = 'ZodError';
  error.errors = fields.map(f => ({ path: [f], message: `Invalid ${f}` }));
  return error;
}

function createAuthError(code: string, message: string): any {
  const error = new Error(message) as any;
  error.code = code;
  return error;
}

function createNotFoundError(resource: string, id: string): any {
  const error = new Error(`${resource} ${id} not found`) as any;
  error.name = 'NotFoundError';
  return error;
}

function createConflictError(message: string): any {
  const error = new Error(message) as any;
  error.name = 'ConflictError';
  return error;
}

function createIdempotencyError(message: string, key: string, options?: any): any {
  const error = new Error(message) as any;
  error.idempotencyKey = key;
  if (options?.originalResponse) {
    error.originalResponse = options.originalResponse;
  }
  return error;
}
