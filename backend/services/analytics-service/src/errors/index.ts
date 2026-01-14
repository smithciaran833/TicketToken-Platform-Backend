/**
 * Error Classes Export
 * 
 * Re-exports all error classes and utilities from utils/errors.ts
 */

export {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
  ServiceUnavailableError,
  BadGatewayError,
  BadRequestError,
  ProblemDetailOptions,
  ProblemDetailResponse,
} from '../utils/errors';

import { AppError, ProblemDetailOptions } from '../utils/errors';

/**
 * Internal Server Error - compatible with AppError
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal Server Error', codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 500, codeOrOptions, options);
    } else {
      super(message, 500, 'INTERNAL_SERVER_ERROR', codeOrOptions);
    }
  }
}

/**
 * Convert any error to RFC 7807 Problem Details format
 */
export function toRFC7807Response(
  error: any,
  instance: string,
  requestId?: string
): {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId?: string;
  details?: any;
} {
  return {
    type: `https://api.tickettoken.com/errors/${error.code || 'UNKNOWN'}`,
    title: error.name || 'Error',
    status: error.statusCode || 500,
    detail: error.message,
    instance,
    ...(requestId && { requestId }),
    ...(error.details && { details: error.details }),
  };
}
