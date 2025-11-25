/**
 * Base error class for all TicketToken SDK errors
 */
export class TicketTokenError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly details?: any;

  constructor(message: string, statusCode?: number, code?: string, details?: any) {
    super(message);
    this.name = 'TicketTokenError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends TicketTokenError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when authorization fails
 */
export class AuthorizationError extends TicketTokenError {
  constructor(message: string = 'Authorization failed', details?: any) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends TicketTokenError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when request validation fails
 */
export class ValidationError extends TicketTokenError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends TicketTokenError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number, details?: any) {
    super(message, 429, 'RATE_LIMIT_ERROR', details);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error thrown when server returns 5xx error
 */
export class ServerError extends TicketTokenError {
  constructor(message: string = 'Server error occurred', statusCode: number = 500, details?: any) {
    super(message, statusCode, 'SERVER_ERROR', details);
    this.name = 'ServerError';
  }
}

/**
 * Error thrown when network request fails
 */
export class NetworkError extends TicketTokenError {
  constructor(message: string = 'Network request failed', details?: any) {
    super(message, undefined, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends TicketTokenError {
  constructor(message: string = 'Request timeout', details?: any) {
    super(message, 408, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when SDK configuration is invalid
 */
export class ConfigurationError extends TicketTokenError {
  constructor(message: string = 'Invalid SDK configuration', details?: any) {
    super(message, undefined, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

/**
 * Parse error response from API and throw appropriate error
 */
export function handleAPIError(error: any): never {
  const response = error.response;
  const request = error.request;

  if (response) {
    // Server responded with error status
    const { status, data } = response;
    const message = data?.message || data?.error || 'An error occurred';
    const details = data?.details || data;

    switch (status) {
      case 400:
        throw new ValidationError(message, details);
      case 401:
        throw new AuthenticationError(message, details);
      case 403:
        throw new AuthorizationError(message, details);
      case 404:
        throw new NotFoundError(message, details);
      case 429:
        const retryAfter = response.headers['retry-after'];
        throw new RateLimitError(message, retryAfter ? parseInt(retryAfter) : undefined, details);
      case 408:
        throw new TimeoutError(message, details);
      default:
        if (status >= 500) {
          throw new ServerError(message, status, details);
        }
        throw new TicketTokenError(message, status, 'API_ERROR', details);
    }
  } else if (request) {
    // Request was made but no response received
    if (error.code === 'ECONNABORTED') {
      throw new TimeoutError('Request timeout');
    }
    throw new NetworkError('No response received from server', { code: error.code });
  } else {
    // Error in setting up request
    throw new NetworkError(error.message || 'Request failed');
  }
}
