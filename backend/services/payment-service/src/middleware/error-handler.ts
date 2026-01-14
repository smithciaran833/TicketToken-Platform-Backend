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
  let statusCode = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details = undefined;

  if ((error as FastifyError).validation) {
    statusCode = 400;
    message = 'Validation error';
    code = 'VALIDATION_ERROR';
    details = (error as FastifyError).validation;
  } else if (error instanceof AppError) {
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
  } else if ((error as FastifyError).statusCode) {
    statusCode = (error as FastifyError).statusCode!;
  }

  log.error({
    message: error.message,
    stack: error.stack,
    statusCode,
    code,
    path: request.url,
    method: request.method,
    ip: request.ip,
    user: (request as any).user?.id
  }, 'Request error');

  const errorResponse: any = {
    error: message,
    code,
    timestamp: new Date().toISOString(),
    path: request.url
  };

  if (config.server.env === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = details;
  }

  reply.status(statusCode).send(errorResponse);
};

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
