export class AppError extends Error {
  public details?: Record<string, any>;
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
  toJSON(): Record<string, any> {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details })
    };
  }
}
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}
export class NotFoundError extends AppError {
  constructor(resource: string, details?: Record<string, any>) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 409, 'CONFLICT', details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: Record<string, any>) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: Record<string, any>) {
    super(message, 403, 'FORBIDDEN', details);
  }
}
export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests', details?: Record<string, any>) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
  }
}
/**
 * State transition error for ticket state machine violations
 */
export class StateTransitionError extends ValidationError {
  constructor(
    fromStatus: string,
    toStatus: string,
    allowed?: string[],
    details?: Record<string, any>
  ) {
    const allowedStr = allowed?.length
      ? `Allowed transitions: [${allowed.join(', ')}]`
      : 'No transitions allowed (terminal state)';
    super(
      `Invalid status transition from '${fromStatus}' to '${toStatus}'. ${allowedStr}`,
      { from: fromStatus, to: toStatus, allowed, ...details }
    );
  }
}
