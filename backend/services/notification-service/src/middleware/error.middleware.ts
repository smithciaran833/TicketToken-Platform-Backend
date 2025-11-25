import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { logger } from '../config/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
): void => {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      success: false,
      error: error.message,
    });
    return;
  }

  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    path: request.url,
    method: request.method,
  });

  reply.status(500).send({
    success: false,
    error: 'Internal server error',
  });
};

export const notFoundHandler = (_request: FastifyRequest, reply: FastifyReply): void => {
  reply.status(404).send({
    success: false,
    error: 'Resource not found',
  });
};
