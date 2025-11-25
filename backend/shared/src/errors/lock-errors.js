"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_FACING_MESSAGES = exports.LockSystemError = exports.LockContentionError = exports.LockTimeoutError = void 0;
exports.getLockErrorMessage = getLockErrorMessage;
exports.isLockError = isLockError;
class LockTimeoutError extends Error {
    lockKey;
    timeoutMs;
    attemptedAt;
    code = 'LOCK_TIMEOUT';
    statusCode = 409;
    retryable = true;
    constructor(message, lockKey, timeoutMs, attemptedAt = new Date()) {
        super(message);
        this.lockKey = lockKey;
        this.timeoutMs = timeoutMs;
        this.attemptedAt = attemptedAt;
        this.name = 'LockTimeoutError';
        Object.setPrototypeOf(this, LockTimeoutError.prototype);
    }
    toJSON() {
        return {
            error: this.name,
            code: this.code,
            message: this.message,
            lockKey: this.lockKey,
            timeoutMs: this.timeoutMs,
            attemptedAt: this.attemptedAt.toISOString(),
            retryable: this.retryable
        };
    }
}
exports.LockTimeoutError = LockTimeoutError;
class LockContentionError extends Error {
    lockKey;
    attemptedAt;
    code = 'LOCK_CONTENTION';
    statusCode = 409;
    retryable = true;
    constructor(message, lockKey, attemptedAt = new Date()) {
        super(message);
        this.lockKey = lockKey;
        this.attemptedAt = attemptedAt;
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
            retryable: this.retryable
        };
    }
}
exports.LockContentionError = LockContentionError;
class LockSystemError extends Error {
    lockKey;
    originalError;
    code = 'LOCK_SYSTEM_ERROR';
    statusCode = 503;
    retryable = true;
    constructor(message, lockKey, originalError) {
        super(message);
        this.lockKey = lockKey;
        this.originalError = originalError;
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
            retryable: this.retryable
        };
    }
}
exports.LockSystemError = LockSystemError;
exports.USER_FACING_MESSAGES = {
    TIMEOUT_GENERIC: 'This item is currently being processed by another request. Please try again in a moment.',
    TIMEOUT_HIGH_DEMAND: 'Unable to process your request due to high demand. Please try again.',
    CONTENTION_GENERIC: 'This resource is currently locked by another operation. Please wait and retry.',
    SYSTEM_ERROR: 'A system error occurred while processing your request. Please try again or contact support if the issue persists.',
    RETRY_SUGGESTION: 'Please retry your request. If the problem continues, contact support.',
};
function getLockErrorMessage(error, context) {
    if (error instanceof LockTimeoutError) {
        return context
            ? `${context}: ${exports.USER_FACING_MESSAGES.TIMEOUT_GENERIC}`
            : exports.USER_FACING_MESSAGES.TIMEOUT_GENERIC;
    }
    if (error instanceof LockContentionError) {
        return context
            ? `${context}: ${exports.USER_FACING_MESSAGES.CONTENTION_GENERIC}`
            : exports.USER_FACING_MESSAGES.CONTENTION_GENERIC;
    }
    if (error instanceof LockSystemError) {
        return exports.USER_FACING_MESSAGES.SYSTEM_ERROR;
    }
    return exports.USER_FACING_MESSAGES.RETRY_SUGGESTION;
}
function isLockError(error) {
    return (error instanceof LockTimeoutError ||
        error instanceof LockContentionError ||
        error instanceof LockSystemError);
}
//# sourceMappingURL=lock-errors.js.map