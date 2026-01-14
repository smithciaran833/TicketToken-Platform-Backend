/**
 * RFC 7807 Problem Details Options
 */
export interface ProblemDetailOptions {
  detail?: string;
  instance?: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * RFC 7807 Problem Details Response
 */
export interface ProblemDetailResponse {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public detail?: string;
  public instance?: string;
  public type: string;
  public additionalProperties: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    codeOrOptions?: string | ProblemDetailOptions,
    options?: ProblemDetailOptions
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    
    // Handle both (message, status, code) and (message, status, options) signatures
    if (typeof codeOrOptions === 'string') {
      this.code = codeOrOptions;
      this.detail = options?.detail;
      this.instance = options?.instance;
      this.type = options?.type || `https://api.tickettoken.com/errors/${codeOrOptions}`;
      const { detail, instance, type, ...rest } = options || {};
      this.additionalProperties = rest;
    } else {
      this.code = 'INTERNAL_ERROR';
      this.detail = codeOrOptions?.detail;
      this.instance = codeOrOptions?.instance;
      this.type = codeOrOptions?.type || `https://api.tickettoken.com/errors/${this.code}`;
      const { detail, instance, type, ...rest } = codeOrOptions || {};
      this.additionalProperties = rest;
    }
    
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to RFC 7807 Problem Details JSON response
   */
  toJSON(): ProblemDetailResponse {
    return {
      type: this.type,
      title: this.message,
      status: this.statusCode,
      code: this.code,
      ...(this.detail && { detail: this.detail }),
      ...(this.instance && { instance: this.instance }),
      ...this.additionalProperties,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 400, codeOrOptions, options);
    } else {
      super(message, 400, 'VALIDATION_ERROR', codeOrOptions);
    }
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(`${resource} not found`, 404, codeOrOptions, options);
    } else {
      super(`${resource} not found`, 404, 'NOT_FOUND', codeOrOptions);
    }
  }
}

export class ConflictError extends AppError {
  constructor(message: string, codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 409, codeOrOptions, options);
    } else {
      super(message, 409, 'CONFLICT', codeOrOptions);
    }
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 401, codeOrOptions, options);
    } else {
      super(message, 401, 'UNAUTHORIZED', codeOrOptions);
    }
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 403, codeOrOptions, options);
    } else {
      super(message, 403, 'FORBIDDEN', codeOrOptions);
    }
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests', codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 429, codeOrOptions, options);
    } else {
      super(message, 429, 'TOO_MANY_REQUESTS', codeOrOptions);
    }
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 503, codeOrOptions, options);
    } else {
      super(message, 503, 'SERVICE_UNAVAILABLE', codeOrOptions);
    }
  }
}

export class BadGatewayError extends AppError {
  constructor(message: string = 'Bad gateway', codeOrOptions?: string | ProblemDetailOptions, options?: ProblemDetailOptions) {
    if (typeof codeOrOptions === 'string') {
      super(message, 502, codeOrOptions, options);
    } else {
      super(message, 502, 'BAD_GATEWAY', codeOrOptions);
    }
  }
}

// Alias for BadRequestError (commonly used name)
export { ValidationError as BadRequestError };
