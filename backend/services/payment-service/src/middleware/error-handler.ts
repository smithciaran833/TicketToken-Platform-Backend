import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'ErrorHandler' });

export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Default error values
  let statusCode = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details = undefined;

  // Handle Fastify validation errors
  if ((error as FastifyError).validation) {
    statusCode = 400;
    message = 'Validation error';
    code = 'VALIDATION_ERROR';
    details = (error as FastifyError).validation;
  }
  // Handle known error types
  else if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    code = 'VALIDATION_ERROR';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
    code = 'UNAUTHORIZED';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  }
  // Handle Fastify-specific status codes
  else if ((error as FastifyError).statusCode) {
    statusCode = (error as FastifyError).statusCode!;
  }

  // Log error
  log.error('Request error', {
    message: error.message,
    stack: error.stack,
    statusCode,
    code,
    path: request.url,
    method: request.method,
    ip: request.ip,
    user: (request as any).user?.id
  });

  // Prepare error response
  const errorResponse: any = {
    error: message,
    code,
    timestamp: new Date().toISOString(),
    path: request.url
  };

  // Include stack trace in development
  if (config.server.env === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = details;
  }

  reply.status(statusCode).send(errorResponse);
};

// Note: Fastify handles async errors automatically, no asyncHandler needed!

// Not found handler (register as 404 handler in Fastify)
export const notFoundHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  reply.status(404).send({
    error: 'Resource not found',
    code: 'NOT_FOUND',
    path: request.url,
    method: request.method
  });
};
