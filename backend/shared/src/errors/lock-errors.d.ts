export declare class LockTimeoutError extends Error {
    readonly lockKey: string;
    readonly timeoutMs: number;
    readonly attemptedAt: Date;
    readonly code = "LOCK_TIMEOUT";
    readonly statusCode = 409;
    readonly retryable = true;
    constructor(message: string, lockKey: string, timeoutMs: number, attemptedAt?: Date);
    toJSON(): {
        error: string;
        code: string;
        message: string;
        lockKey: string;
        timeoutMs: number;
        attemptedAt: string;
        retryable: boolean;
    };
}
export declare class LockContentionError extends Error {
    readonly lockKey: string;
    readonly attemptedAt: Date;
    readonly code = "LOCK_CONTENTION";
    readonly statusCode = 409;
    readonly retryable = true;
    constructor(message: string, lockKey: string, attemptedAt?: Date);
    toJSON(): {
        error: string;
        code: string;
        message: string;
        lockKey: string;
        attemptedAt: string;
        retryable: boolean;
    };
}
export declare class LockSystemError extends Error {
    readonly lockKey: string;
    readonly originalError?: Error | undefined;
    readonly code = "LOCK_SYSTEM_ERROR";
    readonly statusCode = 503;
    readonly retryable = true;
    constructor(message: string, lockKey: string, originalError?: Error | undefined);
    toJSON(): {
        error: string;
        code: string;
        message: string;
        lockKey: string;
        originalError: string | undefined;
        retryable: boolean;
    };
}
export declare const USER_FACING_MESSAGES: {
    readonly TIMEOUT_GENERIC: "This item is currently being processed by another request. Please try again in a moment.";
    readonly TIMEOUT_HIGH_DEMAND: "Unable to process your request due to high demand. Please try again.";
    readonly CONTENTION_GENERIC: "This resource is currently locked by another operation. Please wait and retry.";
    readonly SYSTEM_ERROR: "A system error occurred while processing your request. Please try again or contact support if the issue persists.";
    readonly RETRY_SUGGESTION: "Please retry your request. If the problem continues, contact support.";
};
export declare function getLockErrorMessage(error: Error, context?: string): string;
export declare function isLockError(error: unknown): error is LockTimeoutError | LockContentionError | LockSystemError;
//# sourceMappingURL=lock-errors.d.ts.map