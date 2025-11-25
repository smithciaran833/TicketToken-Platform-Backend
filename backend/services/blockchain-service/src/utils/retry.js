"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryOperation = retryOperation;
const logger_1 = require("./logger");
const DEFAULT_CONFIG = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
        'timeout',
        'network',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        '429',
        '503',
        '504',
        'fetch failed',
        'blockhash',
    ]
};
function isRetryableError(error, retryableErrors) {
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase()));
}
function calculateDelay(attempt, initialDelay, maxDelay, multiplier) {
    const delay = initialDelay * Math.pow(multiplier, attempt - 1);
    return Math.min(delay, maxDelay);
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function retryOperation(operation, operationName, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    let lastError;
    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        try {
            logger_1.logger.debug(`Attempting ${operationName} (attempt ${attempt}/${cfg.maxAttempts})`);
            const result = await operation();
            if (attempt > 1) {
                logger_1.logger.info(`${operationName} succeeded after ${attempt} attempts`);
            }
            return result;
        }
        catch (error) {
            lastError = error;
            const isLastAttempt = attempt === cfg.maxAttempts;
            const shouldRetry = isRetryableError(lastError, cfg.retryableErrors);
            if (isLastAttempt || !shouldRetry) {
                logger_1.logger.error({
                    operation: operationName,
                    attempt,
                    maxAttempts: cfg.maxAttempts,
                    error: lastError.message,
                    retryable: shouldRetry
                }, `${operationName} failed ${isLastAttempt ? 'after all retries' : '(non-retryable error)'}`);
                throw lastError;
            }
            const delayMs = calculateDelay(attempt, cfg.initialDelayMs, cfg.maxDelayMs, cfg.backoffMultiplier);
            logger_1.logger.warn({
                operation: operationName,
                attempt,
                maxAttempts: cfg.maxAttempts,
                error: lastError.message,
                nextRetryInMs: delayMs
            }, `${operationName} failed, retrying...`);
            await sleep(delayMs);
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry.js.map