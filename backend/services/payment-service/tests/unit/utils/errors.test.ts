/**
 * Unit Tests for Error Utilities
 * 
 * Tests RFC 7807 Problem Details implementation and all error classes.
 */

import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PaymentFailedError,
  PaymentDeclinedError,
  DuplicatePaymentError,
  RefundFailedError,
  StripeError,
  RateLimitedError,
  TenantRequiredError,
  CrossTenantAccessError,
  InternalError,
  ErrorTypes,
  toAppError,
  sendProblemResponse,
} from '../../../src/utils/errors';
import { createMockReply } from '../../setup';

describe('Error Utilities', () => {
  describe('ErrorTypes', () => {
    it('should have all required error type URIs', () => {
      expect(ErrorTypes.BAD_REQUEST).toBe('https://api.tickettoken.com/problems/bad-request');
      expect(ErrorTypes.VALIDATION_ERROR).toBe('https://api.tickettoken.com/problems/validation-error');
      expect(ErrorTypes.UNAUTHORIZED).toBe('https://api.tickettoken.com/problems/unauthorized');
      expect(ErrorTypes.FORBIDDEN).toBe('https://api.tickettoken.com/problems/forbidden');
      expect(ErrorTypes.NOT_FOUND).toBe('https://api.tickettoken.com/problems/not-found');
      expect(ErrorTypes.CONFLICT).toBe('https://api.tickettoken.com/problems/conflict');
      expect(ErrorTypes.PAYMENT_FAILED).toBe('https://api.tickettoken.com/problems/payment-failed');
      expect(ErrorTypes.PAYMENT_DECLINED).toBe('https://api.tickettoken.com/problems/payment-declined');
      expect(ErrorTypes.INSUFFICIENT_FUNDS).toBe('https://api.tickettoken.com/problems/insufficient-funds');
      expect(ErrorTypes.DUPLICATE_PAYMENT).toBe('https://api.tickettoken.com/problems/duplicate-payment');
      expect(ErrorTypes.REFUND_FAILED).toBe('https://api.tickettoken.com/problems/refund-failed');
      expect(ErrorTypes.STRIPE_ERROR).toBe('https://api.tickettoken.com/problems/stripe-error');
      expect(ErrorTypes.RATE_LIMITED).toBe('https://api.tickettoken.com/problems/rate-limited');
      expect(ErrorTypes.SERVICE_UNAVAILABLE).toBe('https://api.tickettoken.com/problems/service-unavailable');
      expect(ErrorTypes.INTERNAL_ERROR).toBe('https://api.tickettoken.com/problems/internal-error');
      expect(ErrorTypes.TENANT_REQUIRED).toBe('https://api.tickettoken.com/problems/tenant-required');
      expect(ErrorTypes.CROSS_TENANT_ACCESS).toBe('https://api.tickettoken.com/problems/cross-tenant-access');
    });
  });

  describe('AppError', () => {
    it('should create an error with all required properties', () => {
      const error = new AppError({
        type: ErrorTypes.BAD_REQUEST,
        title: 'Bad Request',
        status: 400,
        detail: 'Invalid input provided',
        code: 'BAD_REQUEST',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.type).toBe(ErrorTypes.BAD_REQUEST);
      expect(error.title).toBe('Bad Request');
      expect(error.status).toBe(400);
      expect(error.detail).toBe('Invalid input provided');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.isOperational).toBe(true);
    });

    it('should use title as message when detail is not provided', () => {
      const error = new AppError({
        type: ErrorTypes.NOT_FOUND,
        title: 'Not Found',
        status: 404,
      });

      expect(error.message).toBe('Not Found');
    });

    it('should use detail as message when provided', () => {
      const error = new AppError({
        type: ErrorTypes.NOT_FOUND,
        title: 'Not Found',
        status: 404,
        detail: 'Resource with ID 123 not found',
      });

      expect(error.message).toBe('Resource with ID 123 not found');
    });

    it('should support field-level errors', () => {
      const error = new AppError({
        type: ErrorTypes.VALIDATION_ERROR,
        title: 'Validation Failed',
        status: 400,
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'amount', message: 'Amount must be positive' },
        ],
      });

      expect(error.errors).toHaveLength(2);
      expect(error.errors![0].field).toBe('email');
      expect(error.errors![1].field).toBe('amount');
    });

    it('should set isOperational to false when specified', () => {
      const error = new AppError({
        type: ErrorTypes.INTERNAL_ERROR,
        title: 'Internal Error',
        status: 500,
        isOperational: false,
      });

      expect(error.isOperational).toBe(false);
    });

    describe('toProblemDetails', () => {
      it('should convert error to RFC 7807 Problem Details format', () => {
        const error = new AppError({
          type: ErrorTypes.BAD_REQUEST,
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid input',
          code: 'INVALID_INPUT',
          errors: [{ field: 'name', message: 'Required' }],
        });

        const problem = error.toProblemDetails('trace-123', '/payments/123');

        expect(problem.type).toBe(ErrorTypes.BAD_REQUEST);
        expect(problem.title).toBe('Bad Request');
        expect(problem.status).toBe(400);
        expect(problem.detail).toBe('Invalid input');
        expect(problem.code).toBe('INVALID_INPUT');
        expect(problem.errors).toHaveLength(1);
        expect(problem.traceId).toBe('trace-123');
        expect(problem.instance).toBe('/payments/123');
        expect(problem.timestamp).toBeDefined();
      });

      it('should exclude optional fields when not set', () => {
        const error = new AppError({
          type: ErrorTypes.NOT_FOUND,
          title: 'Not Found',
          status: 404,
        });

        const problem = error.toProblemDetails();

        expect(problem.type).toBe(ErrorTypes.NOT_FOUND);
        expect(problem.title).toBe('Not Found');
        expect(problem.status).toBe(404);
        expect(problem.detail).toBeUndefined();
        expect(problem.code).toBeUndefined();
        expect(problem.errors).toBeUndefined();
        expect(problem.traceId).toBeUndefined();
        expect(problem.instance).toBeUndefined();
      });
    });
  });

  describe('BadRequestError', () => {
    it('should create a 400 error with default message', () => {
      const error = new BadRequestError();

      expect(error.status).toBe(400);
      expect(error.type).toBe(ErrorTypes.BAD_REQUEST);
      expect(error.title).toBe('Bad Request');
    });

    it('should accept custom detail and code', () => {
      const error = new BadRequestError('Invalid JSON', 'INVALID_JSON');

      expect(error.detail).toBe('Invalid JSON');
      expect(error.code).toBe('INVALID_JSON');
    });
  });

  describe('ValidationError', () => {
    it('should create a 400 error with field errors', () => {
      const errors = [
        { field: 'email', message: 'Invalid email', code: 'INVALID_FORMAT' },
        { field: 'amount', message: 'Must be positive' },
      ];
      const error = new ValidationError(errors);

      expect(error.status).toBe(400);
      expect(error.type).toBe(ErrorTypes.VALIDATION_ERROR);
      expect(error.title).toBe('Validation Failed');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual(errors);
      expect(error.detail).toBe('One or more fields failed validation');
    });

    it('should accept custom detail message', () => {
      const error = new ValidationError(
        [{ field: 'test', message: 'test' }],
        'Custom validation message'
      );

      expect(error.detail).toBe('Custom validation message');
    });

    describe('fromZod', () => {
      it('should create ValidationError from Zod error', () => {
        const zodError = {
          errors: [
            { path: ['email'], message: 'Invalid email', code: 'invalid_string' },
            { path: ['user', 'name'], message: 'Required', code: 'invalid_type' },
          ],
        };

        const error = ValidationError.fromZod(zodError);

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.errors).toHaveLength(2);
        expect(error.errors![0].field).toBe('email');
        expect(error.errors![1].field).toBe('user.name');
      });

      it('should handle empty Zod errors', () => {
        const zodError = { errors: undefined };
        const error = ValidationError.fromZod(zodError);

        expect(error.errors).toEqual([]);
      });
    });
  });

  describe('UnauthorizedError', () => {
    it('should create a 401 error', () => {
      const error = new UnauthorizedError();

      expect(error.status).toBe(401);
      expect(error.type).toBe(ErrorTypes.UNAUTHORIZED);
      expect(error.title).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.detail).toBe('Authentication required');
    });

    it('should accept custom detail', () => {
      const error = new UnauthorizedError('Token expired');

      expect(error.detail).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('should create a 403 error', () => {
      const error = new ForbiddenError();

      expect(error.status).toBe(403);
      expect(error.type).toBe(ErrorTypes.FORBIDDEN);
      expect(error.title).toBe('Forbidden');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.detail).toBe('You do not have permission to access this resource');
    });

    it('should accept custom detail', () => {
      const error = new ForbiddenError('Admin access required');

      expect(error.detail).toBe('Admin access required');
    });
  });

  describe('NotFoundError', () => {
    it('should create a 404 error with default message', () => {
      const error = new NotFoundError();

      expect(error.status).toBe(404);
      expect(error.type).toBe(ErrorTypes.NOT_FOUND);
      expect(error.title).toBe('Not Found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.detail).toBe('Resource not found');
    });

    it('should include resource name in detail', () => {
      const error = new NotFoundError('Payment');

      expect(error.detail).toBe('Payment not found');
    });

    it('should include resource name and ID in detail', () => {
      const error = new NotFoundError('Payment', 'pay_123');

      expect(error.detail).toBe("Payment with ID 'pay_123' not found");
    });
  });

  describe('ConflictError', () => {
    it('should create a 409 error', () => {
      const error = new ConflictError();

      expect(error.status).toBe(409);
      expect(error.type).toBe(ErrorTypes.CONFLICT);
      expect(error.title).toBe('Conflict');
      expect(error.code).toBe('CONFLICT');
      expect(error.detail).toBe('The request conflicts with current state');
    });

    it('should accept custom detail', () => {
      const error = new ConflictError('Payment already processed');

      expect(error.detail).toBe('Payment already processed');
    });
  });

  describe('PaymentFailedError', () => {
    it('should create a 402 error', () => {
      const error = new PaymentFailedError();

      expect(error.status).toBe(402);
      expect(error.type).toBe(ErrorTypes.PAYMENT_FAILED);
      expect(error.title).toBe('Payment Failed');
      expect(error.code).toBe('PAYMENT_FAILED');
      expect(error.detail).toBe('Payment could not be processed');
    });

    it('should accept custom detail and code', () => {
      const error = new PaymentFailedError('Card declined', 'CARD_DECLINED');

      expect(error.detail).toBe('Card declined');
      expect(error.code).toBe('CARD_DECLINED');
    });
  });

  describe('PaymentDeclinedError', () => {
    it('should create a 402 error with default values', () => {
      const error = new PaymentDeclinedError();

      expect(error.status).toBe(402);
      expect(error.type).toBe(ErrorTypes.PAYMENT_DECLINED);
      expect(error.title).toBe('Payment Declined');
      expect(error.code).toBe('PAYMENT_DECLINED');
      expect(error.detail).toBe('Your payment was declined');
    });

    it('should use decline code as error code', () => {
      const error = new PaymentDeclinedError('insufficient_funds', 'Insufficient funds');

      expect(error.code).toBe('insufficient_funds');
      expect(error.detail).toBe('Insufficient funds');
    });
  });

  describe('DuplicatePaymentError', () => {
    it('should create a 409 error', () => {
      const error = new DuplicatePaymentError();

      expect(error.status).toBe(409);
      expect(error.type).toBe(ErrorTypes.DUPLICATE_PAYMENT);
      expect(error.title).toBe('Duplicate Payment');
      expect(error.code).toBe('DUPLICATE_PAYMENT');
      expect(error.detail).toBe('This payment has already been processed');
    });

    it('should include order ID in detail', () => {
      const error = new DuplicatePaymentError('order_123');

      expect(error.detail).toBe('A payment for order order_123 has already been processed');
    });
  });

  describe('RefundFailedError', () => {
    it('should create a 422 error', () => {
      const error = new RefundFailedError();

      expect(error.status).toBe(422);
      expect(error.type).toBe(ErrorTypes.REFUND_FAILED);
      expect(error.title).toBe('Refund Failed');
      expect(error.code).toBe('REFUND_FAILED');
      expect(error.detail).toBe('The refund could not be processed');
    });

    it('should accept custom detail and code', () => {
      const error = new RefundFailedError('Refund window expired', 'REFUND_EXPIRED');

      expect(error.detail).toBe('Refund window expired');
      expect(error.code).toBe('REFUND_EXPIRED');
    });
  });

  describe('StripeError', () => {
    it('should map StripeCardError to 402', () => {
      const stripeError = {
        type: 'StripeCardError',
        message: 'Card was declined',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        param: 'card',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(402);
      expect(error.title).toBe('Card Error');
      expect(error.detail).toBe('Card was declined');
      expect(error.code).toBe('card_declined');
      expect(error.stripeCode).toBe('card_declined');
      expect(error.declineCode).toBe('insufficient_funds');
      expect(error.param).toBe('card');
    });

    it('should map StripeRateLimitError to 429', () => {
      const stripeError = {
        type: 'StripeRateLimitError',
        message: 'Too many requests',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(429);
      expect(error.title).toBe('Rate Limit Exceeded');
    });

    it('should map StripeInvalidRequestError to 400', () => {
      const stripeError = {
        type: 'StripeInvalidRequestError',
        message: 'Invalid parameter',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(400);
      expect(error.title).toBe('Invalid Request');
    });

    it('should map StripeAuthenticationError to 401', () => {
      const stripeError = {
        type: 'StripeAuthenticationError',
        message: 'Invalid API key',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(401);
      expect(error.title).toBe('Authentication Error');
    });

    it('should map StripePermissionError to 403', () => {
      const stripeError = {
        type: 'StripePermissionError',
        message: 'Permission denied',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(403);
      expect(error.title).toBe('Permission Error');
    });

    it('should map StripeConnectionError to 500', () => {
      const stripeError = {
        type: 'StripeConnectionError',
        message: 'Connection failed',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(500);
      expect(error.title).toBe('Connection Error');
    });

    it('should map StripeAPIError to 500', () => {
      const stripeError = {
        type: 'StripeAPIError',
        message: 'API error',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(500);
      expect(error.title).toBe('Payment Processor Error');
    });

    it('should use default values for unknown error types', () => {
      const stripeError = {
        type: 'UnknownError',
      };

      const error = new StripeError(stripeError);

      expect(error.status).toBe(500);
      expect(error.title).toBe('Payment Processor Error');
      expect(error.detail).toBe('An error occurred with the payment processor');
    });
  });

  describe('RateLimitedError', () => {
    it('should create a 429 error', () => {
      const error = new RateLimitedError();

      expect(error.status).toBe(429);
      expect(error.type).toBe(ErrorTypes.RATE_LIMITED);
      expect(error.title).toBe('Too Many Requests');
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.detail).toBe('Rate limit exceeded. Please try again later.');
    });

    it('should accept retry-after value', () => {
      const error = new RateLimitedError(60);

      expect(error.retryAfter).toBe(60);
    });
  });

  describe('TenantRequiredError', () => {
    it('should create a 401 error', () => {
      const error = new TenantRequiredError();

      expect(error.status).toBe(401);
      expect(error.type).toBe(ErrorTypes.TENANT_REQUIRED);
      expect(error.title).toBe('Tenant Required');
      expect(error.code).toBe('TENANT_REQUIRED');
      expect(error.detail).toBe('A valid tenant context is required for this operation');
    });
  });

  describe('CrossTenantAccessError', () => {
    it('should create a 403 error', () => {
      const error = new CrossTenantAccessError();

      expect(error.status).toBe(403);
      expect(error.type).toBe(ErrorTypes.CROSS_TENANT_ACCESS);
      expect(error.title).toBe('Cross-Tenant Access Denied');
      expect(error.code).toBe('CROSS_TENANT_ACCESS');
      expect(error.detail).toBe('You cannot access resources belonging to another tenant');
    });
  });

  describe('InternalError', () => {
    it('should create a 500 error', () => {
      const error = new InternalError();

      expect(error.status).toBe(500);
      expect(error.type).toBe(ErrorTypes.INTERNAL_ERROR);
      expect(error.title).toBe('Internal Server Error');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.detail).toBe('An unexpected error occurred');
      expect(error.isOperational).toBe(false);
    });

    it('should accept custom detail', () => {
      const error = new InternalError('Database connection failed');

      expect(error.detail).toBe('Database connection failed');
    });
  });

  describe('toAppError', () => {
    it('should return AppError instances unchanged', () => {
      const originalError = new NotFoundError('Payment', 'pay_123');
      const result = toAppError(originalError);

      expect(result).toBe(originalError);
    });

    it('should convert Stripe errors to StripeError', () => {
      const stripeError = {
        type: 'StripeCardError',
        message: 'Card declined',
        code: 'card_declined',
      };

      const result = toAppError(stripeError);

      expect(result).toBeInstanceOf(StripeError);
      expect(result.status).toBe(402);
    });

    it('should convert generic Error to InternalError', () => {
      const genericError = new Error('Something went wrong');
      const result = toAppError(genericError);

      expect(result).toBeInstanceOf(InternalError);
      expect(result.detail).toBe('Something went wrong');
    });

    it('should convert unknown types to InternalError', () => {
      const result = toAppError('string error');

      expect(result).toBeInstanceOf(InternalError);
      expect(result.detail).toBe('An unknown error occurred');
    });

    it('should handle null/undefined', () => {
      expect(toAppError(null)).toBeInstanceOf(InternalError);
      expect(toAppError(undefined)).toBeInstanceOf(InternalError);
    });
  });

  describe('sendProblemResponse', () => {
    it('should send RFC 7807 response with correct headers', () => {
      const reply = createMockReply();
      const error = new NotFoundError('Payment', 'pay_123');

      sendProblemResponse(reply, error, 'trace-123', '/payments/pay_123');

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorTypes.NOT_FOUND,
          title: 'Not Found',
          status: 404,
          detail: "Payment with ID 'pay_123' not found",
          traceId: 'trace-123',
          instance: '/payments/pay_123',
        })
      );
    });

    it('should work without optional traceId and instance', () => {
      const reply = createMockReply();
      const error = new BadRequestError('Invalid input');

      sendProblemResponse(reply, error);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorTypes.BAD_REQUEST,
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid input',
        })
      );
    });
  });
});
