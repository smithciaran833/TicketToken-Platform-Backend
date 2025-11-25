/**
 * Distributed Lock Error Types
 *
 * These errors represent failures in distributed lock acquisition and management.
 * They are thrown by the distributed-lock utility and should be caught by services
 * to provide user-friendly error messages.
 */

/**
 * Thrown when a lock cannot be acquired within the specified timeout period.
 * This typically indicates high contention on the resource.
 */
export class LockTimeoutError extends Error {
  public readonly code = 'LOCK_TIMEOUT';
  public readonly statusCode = 409;
  public readonly retryable = true;

  constructor(
    message: string,
    public readonly lockKey: string,
    public readonly timeoutMs: number,
    public readonly attemptedAt: Date = new Date()
  ) {
    super(message);
    this.name = 'LockTimeoutError';
    Object.setPrototypeOf(this, LockTimeoutError.prototype);
  }

  // Alias properties for backward compatibility
  get key() {
    return this.lockKey;
  }
  get ttlMs() {
    return this.timeoutMs;
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      lockKey: this.lockKey,
      timeoutMs: this.timeoutMs,
      attemptedAt: this.attemptedAt.toISOString(),
      retryable: this.retryable,
    };
  }
}

/**
 * Thrown when lock acquisition fails due to resource contention.
 * The resource is locked by another process and cannot be acquired.
 */
export class LockContentionError extends Error {
  public readonly code = 'LOCK_CONTENTION';
  public readonly statusCode = 409;
  public readonly retryable = true;

  constructor(
    message: string,
    public readonly lockKey: string,
    public readonly attemptedAt: Date = new Date()
  ) {
    super(message);
    this.name = 'LockContentionError';
    Object.setPrototypeOf(this, LockContentionError.prototype);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      lockKey: this.lockKey,
      attemptedAt: this.attemptedAt.toISOString(),
      retryable: this.retryable,
    };
  }
}

/**
 * Thrown when lock operations fail due to system errors (Redis down, network issues, etc.)
 */
export class LockSystemError extends Error {
  public readonly code = 'LOCK_SYSTEM_ERROR';
  public readonly statusCode = 503;
  public readonly retryable = true;

  constructor(
    message: string,
    public readonly lockKey: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'LockSystemError';
    Object.setPrototypeOf(this, LockSystemError.prototype);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      lockKey: this.lockKey,
      originalError: this.originalError?.message,
      retryable: this.retryable,
    };
  }
}

/**
 * User-facing error messages for lock failures.
 * These are sanitized messages safe to return to end users.
 */
export const USER_FACING_MESSAGES = {
  TIMEOUT_GENERIC:
    'This item is currently being processed by another request. Please try again in a moment.',
  TIMEOUT_HIGH_DEMAND: 'Unable to process your request due to high demand. Please try again.',
  CONTENTION_GENERIC:
    'This resource is currently locked by another operation. Please wait and retry.',
  SYSTEM_ERROR:
    'A system error occurred while processing your request. Please try again or contact support if the issue persists.',
  RETRY_SUGGESTION: 'Please retry your request. If the problem continues, contact support.',
} as const;

/**
 * Helper function to convert lock errors to user-friendly messages
 */
export function getLockErrorMessage(error: Error, context?: string): string {
  if (error instanceof LockTimeoutError) {
    return context
      ? `${context}: ${USER_FACING_MESSAGES.TIMEOUT_GENERIC}`
      : USER_FACING_MESSAGES.TIMEOUT_GENERIC;
  }

  if (error instanceof LockContentionError) {
    return context
      ? `${context}: ${USER_FACING_MESSAGES.CONTENTION_GENERIC}`
      : USER_FACING_MESSAGES.CONTENTION_GENERIC;
  }

  if (error instanceof LockSystemError) {
    return USER_FACING_MESSAGES.SYSTEM_ERROR;
  }

  return USER_FACING_MESSAGES.RETRY_SUGGESTION;
}

/**
 * Type guard to check if an error is a lock-related error
 */
export function isLockError(
  error: unknown
): error is LockTimeoutError | LockContentionError | LockSystemError {
  return (
    error instanceof LockTimeoutError ||
    error instanceof LockContentionError ||
    error instanceof LockSystemError
  );
}
