/**
 * RFC 7807 Problem Details Error Handling for Notification Service
 * 
 * AUDIT FIXES:
 * - ERR-H1: Non-standard error responses → RFC 7807 compliant errors
 * - ERR-H2: Inconsistent error formats → Standardized error classes
 * 
 * RFC 7807: https://tools.ietf.org/html/rfc7807
 */

import { FastifyReply } from 'fastify';
import { logger } from '../config/logger';

// =============================================================================
// TYPES
// =============================================================================

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  [key: string]: any;
}

// =============================================================================
// BASE ERROR CLASS
// =============================================================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * AUDIT FIX ERR-H1: Convert to RFC 7807 Problem Details format
   */
  toProblemDetails(instance?: string): ProblemDetails {
    return {
      type: `https://api.tickettoken.com/errors/${this.code.toLowerCase()}`,
      title: this.code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      status: this.statusCode,
      detail: this.message,
      instance,
      code: this.code,
      ...(this.details || {})
    };
  }
}

// =============================================================================
// SPECIFIC ERROR CLASSES
// =============================================================================

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', true, { resource, id });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 409, 'CONFLICT', true, details);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', true, { retryAfter });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `Service ${service} is temporarily unavailable`,
      503,
      'SERVICE_UNAVAILABLE',
      true,
      { service }
    );
  }
}

// =============================================================================
// NOTIFICATION-SPECIFIC ERRORS
// =============================================================================

export class NotificationSendError extends AppError {
  constructor(channel: string, reason: string, details?: Record<string, any>) {
    super(
      `Failed to send ${channel} notification: ${reason}`,
      500,
      'NOTIFICATION_SEND_ERROR',
      true,
      { channel, reason, ...details }
    );
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string, details?: Record<string, any>) {
    super(
      `Provider ${provider} error: ${message}`,
      502,
      'PROVIDER_ERROR',
      true,
      { provider, ...details }
    );
  }
}

export class TemplateError extends AppError {
  constructor(templateId: string, message: string) {
    super(
      `Template error for ${templateId}: ${message}`,
      400,
      'TEMPLATE_ERROR',
      true,
      { templateId }
    );
  }
}

export class SuppressionError extends AppError {
  constructor(recipient: string, channel: string, reason: string) {
    super(
      `Recipient ${recipient} is suppressed for ${channel}: ${reason}`,
      422,
      'RECIPIENT_SUPPRESSED',
      true,
      { recipient, channel, reason }
    );
  }
}

export class TenantError extends AppError {
  constructor(message: string) {
    super(message, 400, 'TENANT_ERROR', true);
  }
}

export class IdempotencyError extends AppError {
  constructor(message: string, originalRequestId?: string) {
    super(message, 409, 'IDEMPOTENCY_CONFLICT', true, { originalRequestId });
  }
}

// =============================================================================
// ERROR HANDLER
// =============================================================================

/**
 * AUDIT FIX ERR-H1: Send RFC 7807 compliant error response
 */
export function sendError(
  reply: FastifyReply,
  error: Error | AppError,
  requestId?: string
): FastifyReply {
  // Check if it's our AppError
  if (error instanceof AppError) {
    const problemDetails = error.toProblemDetails(requestId);
    
    logger.warn('Application error', {
      code: error.code,
      status: error.statusCode,
      message: error.message,
      requestId,
      details: error.details
    });
    
    return reply
      .status(error.statusCode)
      .header('Content-Type', 'application/problem+json')
      .send(problemDetails);
  }
  
  // Unknown error - treat as internal server error
  const problemDetails: ProblemDetails = {
    type: 'https://api.tickettoken.com/errors/internal-error',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred',
    instance: requestId,
    code: 'INTERNAL_ERROR'
  };
  
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    requestId
  });
  
  return reply
    .status(500)
    .header('Content-Type', 'application/problem+json')
    .send(problemDetails);
}

/**
 * Create error handler for Fastify
 */
export function createErrorHandler() {
  return (error: Error, request: any, reply: FastifyReply) => {
    return sendError(reply, error, request.id);
  };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Check if error is operational (expected) or programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Wrap async route handlers for error handling
 */
export function asyncHandler<T>(
  fn: (...args: any[]) => Promise<T>
): (...args: any[]) => Promise<T | void> {
  return async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      const reply = args[1] as FastifyReply;
      const request = args[0];
      return sendError(reply, error as Error, request?.id);
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  NotificationSendError,
  ProviderError,
  TemplateError,
  SuppressionError,
  TenantError,
  IdempotencyError,
  sendError,
  createErrorHandler,
  isOperationalError,
  asyncHandler
};
