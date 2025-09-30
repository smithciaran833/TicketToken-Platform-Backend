import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../types';
import { pino } from 'pino';

const logger = pino({ name: 'error-handler' });

export const errorHandler = (
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Log error
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    request: {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query
    }
  }, 'Request error');

  // Handle known errors
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details
    });
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    return reply.status(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.validation
    });
  }

  // Handle generic errors
  const statusCode = (error as any).statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : error.message;

  return reply.status(statusCode).send({
    success: false,
    error: message,
    code: 'INTERNAL_ERROR'
  });
};
