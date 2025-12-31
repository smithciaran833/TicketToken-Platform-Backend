import { logger } from './logger';

/**
 * SECURITY FIX (SL7): Error wrapper utilities for external service errors
 * Provides context wrapping for better debugging and prevents information leakage
 */

const log = logger.child({ component: 'ErrorWrapper' });

/**
 * Standard error types for categorization
 */
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  DATABASE = 'DATABASE',
  INTERNAL = 'INTERNAL',
}

/**
 * Wrapped error with context
 */
export class WrappedError extends Error {
  public readonly category: ErrorCategory;
  public readonly originalError: Error | null;
  public readonly context: Record<string, any>;
  public readonly timestamp: Date;
  public readonly correlationId?: string;

  constructor(
    message: string,
    category: ErrorCategory,
    options?: {
      originalError?: Error;
      context?: Record<string, any>;
      correlationId?: string;
    }
  ) {
    super(message);
    this.name = 'WrappedError';
    this.category = category;
    this.originalError = options?.originalError || null;
    this.context = options?.context || {};
    this.timestamp = new Date();
    this.correlationId = options?.correlationId;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      context: this.context,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
    };
  }
}

/**
 * SECURITY FIX (SL7): Wrap external service errors with context
 * Prevents leaking internal details while preserving debugging info
 */
export function wrapExternalError(
  service: string,
  operation: string,
  error: any,
  context?: Record<string, any>
): WrappedError {
  // Log the full error for debugging
  log.error({
    service,
    operation,
    error: error.message,
    stack: error.stack,
    context,
  }, `External service error: ${service}.${operation}`);

  // Create wrapped error without exposing internals
  const safeMessage = `${service} service error during ${operation}`;
  
  return new WrappedError(safeMessage, ErrorCategory.EXTERNAL_SERVICE, {
    originalError: error,
    context: {
      service,
      operation,
      ...context,
    },
  });
}

/**
 * SECURITY FIX (SL7): Wrap database errors with context
 */
export function wrapDatabaseError(
  operation: string,
  error: any,
  context?: Record<string, any>
): WrappedError {
  log.error({
    operation,
    error: error.message,
    code: error.code,
    context,
  }, `Database error: ${operation}`);

  // Check for specific PostgreSQL errors
  let message = 'Database operation failed';
  let category = ErrorCategory.DATABASE;

  if (error.code === '23505') {
    message = 'Resource already exists';
    category = ErrorCategory.CONFLICT;
  } else if (error.code === '23503') {
    message = 'Referenced resource not found';
    category = ErrorCategory.NOT_FOUND;
  } else if (error.code === '40001' || error.code === '40P01') {
    message = 'Transaction conflict, please retry';
    category = ErrorCategory.CONFLICT;
  }

  return new WrappedError(message, category, {
    originalError: error,
    context: {
      operation,
      pgCode: error.code,
      ...context,
    },
  });
}

/**
 * SECURITY FIX (SL7): Wrap Stripe errors with context
 */
export function wrapStripeError(
  operation: string,
  error: any,
  context?: Record<string, any>
): WrappedError {
  log.error({
    operation,
    error: error.message,
    type: error.type,
    code: error.code,
    stripeCode: error.code,
    context,
  }, `Stripe error: ${operation}`);

  // Map Stripe error types to categories
  let category = ErrorCategory.EXTERNAL_SERVICE;
  let message = 'Payment processing error';

  if (error.type === 'StripeCardError') {
    message = 'Card was declined';
  } else if (error.type === 'StripeRateLimitError') {
    category = ErrorCategory.RATE_LIMIT;
    message = 'Payment service temporarily unavailable';
  } else if (error.type === 'StripeInvalidRequestError') {
    category = ErrorCategory.VALIDATION;
    message = 'Invalid payment request';
  } else if (error.type === 'StripeAuthenticationError') {
    category = ErrorCategory.AUTHENTICATION;
    message = 'Payment configuration error';
  }

  return new WrappedError(message, category, {
    originalError: error,
    context: {
      operation,
      stripeType: error.type,
      stripeCode: error.code,
      ...context,
    },
  });
}

/**
 * Safe error handler that doesn't expose internals
 */
export function toSafeErrorResponse(error: any): {
  error: string;
  message: string;
  code?: string;
} {
  if (error instanceof WrappedError) {
    return {
      error: error.category,
      message: error.message,
      code: error.correlationId,
    };
  }

  // Don't expose internal error details
  return {
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
}

/**
 * Create an async error wrapper function
 */
export function withErrorWrapping<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  return fn().catch((error) => {
    throw wrapExternalError(service, operation, error, context);
  });
}
