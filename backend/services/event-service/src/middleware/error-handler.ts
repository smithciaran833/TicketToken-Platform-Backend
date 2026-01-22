import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';
import { incrementErrorMetric } from '../utils/metrics';

/**
 * RFC 7807 Problem Details response format.
 *
 * This is the standard format for HTTP API error responses as defined in:
 * https://datatracker.ietf.org/doc/html/rfc7807
 *
 * CRITICAL FIX for audit findings:
 * - RH5: Consistent error format (RFC 7807)
 * - RH10: Don't expose internal state in errors
 */
export interface RFC7807Error {
  /** URI reference identifying the problem type */
  type: string;
  /** Short, human-readable summary */
  title: string;
  /** HTTP status code */
  status: number;
  /** Detailed explanation of the problem */
  detail: string;
  /** URI reference identifying the specific occurrence */
  instance: string;
  /** Machine-readable error code for client handling */
  code?: string;
  /** Array of validation errors (for 400/422 responses) */
  errors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

// Error type URIs (should be absolute URIs in production)
const ERROR_TYPE_BASE = 'https://api.tickettoken.com/errors';
const ERROR_TYPES = {
  VALIDATION: `${ERROR_TYPE_BASE}/validation-error`,
  NOT_FOUND: `${ERROR_TYPE_BASE}/not-found`,
  UNAUTHORIZED: `${ERROR_TYPE_BASE}/unauthorized`,
  FORBIDDEN: `${ERROR_TYPE_BASE}/forbidden`,
  CONFLICT: `${ERROR_TYPE_BASE}/conflict`,
  RATE_LIMITED: `${ERROR_TYPE_BASE}/rate-limited`,
  INTERNAL: `${ERROR_TYPE_BASE}/internal-error`,
  BAD_GATEWAY: `${ERROR_TYPE_BASE}/bad-gateway`,
  UNAVAILABLE: `${ERROR_TYPE_BASE}/service-unavailable`,
  TIMEOUT: `${ERROR_TYPE_BASE}/timeout`,
  TENANT_INVALID: `${ERROR_TYPE_BASE}/tenant-invalid`,
};

/**
 * Production-safe RFC 7807 error handler
 *
 * Formats all errors according to RFC 7807 Problem Details spec
 * and sanitizes error responses to prevent information leakage.
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = (request.id || generateRequestId()) as string;
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();

  // Log the full error details (never sent to client)
  logger.error(
    {
      error: {
        message: error.message,
        stack: isProduction ? undefined : error.stack,
        code: error.code,
        statusCode: error.statusCode,
        name: error.name,
      },
      request: {
        id: requestId,
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        // Never log full headers/body in production
        headers: isProduction ? undefined : redactSensitiveHeaders(request.headers),
        body: isProduction ? undefined : redactSensitiveBody(request.body),
      },
      timestamp,
    },
    'Request error occurred'
  );

  // Determine the appropriate response based on error type
  const rfc7807Response = buildRFC7807Response(error, request, requestId, isProduction);

  // Track error metric for monitoring and alerting
  const errorType = getErrorTypeFromStatus(rfc7807Response.status, error);
  const tenantId = (request as any).user?.tenant_id; // ✅ FIXED: Extract tenantId from request
  incrementErrorMetric(errorType, rfc7807Response.status, request.url, tenantId); // ✅ FIXED: Pass tenantId

  // Set headers for RFC 7807 response
  reply.header('Content-Type', 'application/problem+json');
  // Prevent caching of error responses
  reply.header('Cache-Control', 'no-store');
  reply.status(rfc7807Response.status).send(rfc7807Response);
}

/**
 * Get error type string for metrics from status code and error
 */
function getErrorTypeFromStatus(statusCode: number, error: FastifyError): string {
  // Check for specific error names first
  const errorName = (error as any).name;
  if (errorName === 'ValidationError') return 'validation';
  if (errorName === 'NotFoundError') return 'not_found';
  if (errorName === 'UnauthorizedError') return 'unauthorized';
  if (errorName === 'ForbiddenError') return 'forbidden';
  if (errorName === 'ConflictError') return 'conflict';

  // Fall back to status code mapping
  if (statusCode === 400) return 'bad_request';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 409) return 'conflict';
  if (statusCode === 422) return 'validation';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === 502) return 'bad_gateway';
  if (statusCode === 503) return 'service_unavailable';
  if (statusCode === 504) return 'timeout';
  if (statusCode >= 500) return 'internal';

  return 'other';
}

/**
 * Build RFC 7807 compliant error response
 */
function buildRFC7807Response(
  error: FastifyError,
  request: FastifyRequest,
  requestId: string,
  isProduction: boolean
): RFC7807Error {
  const statusCode = error.statusCode || (error as any).status || 500;
  const errorCode = (error as any).code || getDefaultErrorCode(statusCode);

  // Build instance URI (unique to this occurrence)
  const instance = `urn:uuid:${requestId}`;

  // Handle PostgreSQL-specific errors
  if (errorCode === '23503') {
    return {
      type: ERROR_TYPES.TENANT_INVALID,
      title: 'Invalid Reference',
      status: 400,
      detail: 'The specified reference ID does not exist.',
      instance,
      code: 'INVALID_REFERENCE',
    };
  }

  if (errorCode === '23505') {
    return {
      type: ERROR_TYPES.CONFLICT,
      title: 'Resource Conflict',
      status: 409,
      detail: 'A resource with these values already exists.',
      instance,
      code: 'DUPLICATE_RESOURCE',
    };
  }

  // Handle validation errors (Fastify schema validation)
  if (error.validation) {
    return {
      type: ERROR_TYPES.VALIDATION,
      title: 'Validation Failed',
      status: 400,
      detail: 'The request body contains invalid data.',
      instance,
      code: 'VALIDATION_ERROR',
      errors: error.validation.map((v: any) => ({
        field: v.instancePath?.replace(/^\//, '') || v.params?.missingProperty || 'unknown',
        message: v.message || 'Invalid value',
        code: getValidationErrorCode(v.keyword),
      })),
    };
  }

  // Handle known error types by name
  if ((error as any).name === 'ValidationError' || statusCode === 422) {
    const validationErrors = (error as any).errors || (error as any).details;
    return {
      type: ERROR_TYPES.VALIDATION,
      title: 'Validation Failed',
      status: 422,
      detail: getSafeDetail(error, 'The request contains invalid data.', isProduction),
      instance,
      code: 'VALIDATION_ERROR',
      errors: Array.isArray(validationErrors)
        ? validationErrors.map((e: any) => ({
            field: e.field || e.path || 'unknown',
            message: e.message || 'Invalid value',
            code: 'INVALID_VALUE',
          }))
        : undefined,
    };
  }

  if ((error as any).name === 'NotFoundError' || statusCode === 404) {
    return {
      type: ERROR_TYPES.NOT_FOUND,
      title: 'Resource Not Found',
      status: 404,
      detail: getSafeDetail(error, 'The requested resource was not found.', isProduction),
      instance,
      code: 'NOT_FOUND',
    };
  }

  if ((error as any).name === 'UnauthorizedError' || statusCode === 401) {
    return {
      type: ERROR_TYPES.UNAUTHORIZED,
      title: 'Authentication Required',
      status: 401,
      detail: 'Valid authentication credentials are required.',
      instance,
      code: 'UNAUTHORIZED',
    };
  }

  if ((error as any).name === 'ForbiddenError' || statusCode === 403) {
    return {
      type: ERROR_TYPES.FORBIDDEN,
      title: 'Access Denied',
      status: 403,
      detail: 'You do not have permission to perform this action.',
      instance,
      code: 'FORBIDDEN',
    };
  }

  // Handle rate limiting
  if (statusCode === 429) {
    return {
      type: ERROR_TYPES.RATE_LIMITED,
      title: 'Rate Limit Exceeded',
      status: 429,
      detail: 'Too many requests. Please wait before making another request.',
      instance,
      code: 'RATE_LIMITED',
    };
  }

  // Handle server errors - never expose internal details
  if (statusCode >= 500) {
    const serverErrorResponse: RFC7807Error = {
      type: getServerErrorType(statusCode),
      title: getServerErrorTitle(statusCode),
      status: statusCode,
      detail: getServerErrorDetail(statusCode),
      instance,
      code: getServerErrorCode(statusCode),
    };
    return serverErrorResponse;
  }

  // Default response for other status codes
  return {
    type: `${ERROR_TYPE_BASE}/error`,
    title: getErrorTitle(statusCode),
    status: statusCode,
    detail: getSafeDetail(error, getDefaultDetail(statusCode), isProduction),
    instance,
    code: errorCode?.toString() || 'ERROR',
  };
}

/**
 * Get safe error detail - never expose internal errors in production
 */
function getSafeDetail(error: FastifyError, defaultDetail: string, isProduction: boolean): string {
  if (isProduction) {
    return defaultDetail;
  }
  // In development, include actual error message
  return error.message || defaultDetail;
}

/**
 * Get error type URI for server errors
 */
function getServerErrorType(statusCode: number): string {
  switch (statusCode) {
    case 502: return ERROR_TYPES.BAD_GATEWAY;
    case 503: return ERROR_TYPES.UNAVAILABLE;
    case 504: return ERROR_TYPES.TIMEOUT;
    default: return ERROR_TYPES.INTERNAL;
  }
}

/**
 * Get error title for server errors
 */
function getServerErrorTitle(statusCode: number): string {
  switch (statusCode) {
    case 502: return 'Bad Gateway';
    case 503: return 'Service Unavailable';
    case 504: return 'Gateway Timeout';
    default: return 'Internal Server Error';
  }
}

/**
 * Get error detail for server errors (always generic)
 */
function getServerErrorDetail(statusCode: number): string {
  switch (statusCode) {
    case 502: return 'The upstream service returned an invalid response.';
    case 503: return 'The service is temporarily unavailable. Please try again later.';
    case 504: return 'The request timed out. Please try again.';
    default: return 'An unexpected error occurred. Please try again later.';
  }
}

/**
 * Get error code for server errors
 */
function getServerErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 502: return 'BAD_GATEWAY';
    case 503: return 'SERVICE_UNAVAILABLE';
    case 504: return 'GATEWAY_TIMEOUT';
    default: return 'INTERNAL_ERROR';
  }
}

/**
 * Get human-readable error title
 */
function getErrorTitle(statusCode: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    410: 'Gone',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return titles[statusCode] || 'Error';
}

/**
 * Get default error detail message
 */
function getDefaultDetail(statusCode: number): string {
  const details: Record<number, string> = {
    400: 'The request was invalid or cannot be processed.',
    401: 'Authentication is required to access this resource.',
    403: 'You do not have permission to access this resource.',
    404: 'The requested resource could not be found.',
    405: 'This HTTP method is not allowed for this endpoint.',
    409: 'The request conflicts with the current state of the resource.',
    410: 'The requested resource is no longer available.',
    422: 'The request data failed validation.',
    429: 'Rate limit exceeded. Please slow down.',
  };
  return details[statusCode] || 'An error occurred while processing your request.';
}

/**
 * Get default error code from status
 */
function getDefaultErrorCode(statusCode: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    410: 'GONE',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
  };
  return codes[statusCode] || 'ERROR';
}

/**
 * Get validation error code from keyword
 */
function getValidationErrorCode(keyword: string): string {
  const codes: Record<string, string> = {
    required: 'REQUIRED_FIELD',
    type: 'INVALID_TYPE',
    format: 'INVALID_FORMAT',
    pattern: 'INVALID_PATTERN',
    minimum: 'VALUE_TOO_SMALL',
    maximum: 'VALUE_TOO_LARGE',
    minLength: 'STRING_TOO_SHORT',
    maxLength: 'STRING_TOO_LONG',
    enum: 'INVALID_ENUM_VALUE',
    additionalProperties: 'UNEXPECTED_PROPERTY',
  };
  return codes[keyword] || 'INVALID_VALUE';
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Redact sensitive headers from logs
 */
function redactSensitiveHeaders(headers: any): any {
  if (!headers) return headers;
  const redacted = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  for (const header of sensitiveHeaders) {
    if (redacted[header]) {
      redacted[header] = '[REDACTED]';
    }
  }
  return redacted;
}

/**
 * Redact sensitive body fields from logs
 */
function redactSensitiveBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const redacted = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn'];
  for (const field of sensitiveFields) {
    if (redacted[field]) {
      redacted[field] = '[REDACTED]';
    }
  }
  return redacted;
}

/**
 * Set default error handler for Fastify
 */
export function registerErrorHandler(app: any) {
  app.setErrorHandler(errorHandler);
}

/**
 * Create an RFC 7807 error response helper
 * Use this in controllers to throw consistent errors
 */
export function createProblemError(
  status: number,
  code: string,
  detail: string,
  errors?: Array<{ field: string; message: string; code: string }>
): Error & { statusCode: number; code: string; errors?: any[] } {
  const error = new Error(detail) as any;
  error.statusCode = status;
  error.code = code;
  if (errors) {
    error.errors = errors;
  }
  return error;
}
