import { FastifyReply } from 'fastify';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  requestId?: string;
}

export class ErrorResponseBuilder {
  static send(reply: FastifyReply, statusCode: number, error: string, code: string, details?: any) {
    const response: ErrorResponse = {
      success: false,
      error,
      code,
      details,
      requestId: (reply.request as any).id
    };
    
    return reply.status(statusCode).send(response);
  }

  static validation(reply: FastifyReply, details: any) {
    return this.send(reply, 422, 'Validation failed', 'VALIDATION_ERROR', details);
  }

  static unauthorized(reply: FastifyReply, message: string = 'Unauthorized') {
    return this.send(reply, 401, message, 'UNAUTHORIZED');
  }

  static forbidden(reply: FastifyReply, message: string = 'Forbidden') {
    return this.send(reply, 403, message, 'FORBIDDEN');
  }

  static notFound(reply: FastifyReply, resource: string) {
    return this.send(reply, 404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(reply: FastifyReply, message: string) {
    return this.send(reply, 409, message, 'CONFLICT');
  }

  static tooManyRequests(reply: FastifyReply, message: string = 'Too many requests') {
    return this.send(reply, 429, message, 'RATE_LIMIT_EXCEEDED');
  }

  static internal(reply: FastifyReply, message: string = 'Internal server error') {
    return this.send(reply, 500, message, 'INTERNAL_ERROR');
  }
}

// Error codes enum for consistency
export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
