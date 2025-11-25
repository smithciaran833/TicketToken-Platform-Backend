"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redlock = exports.lockRedisClient = exports.LockMetrics = exports.LockKeys = void 0;
exports.withLock = withLock;
exports.withLockRetry = withLockRetry;
exports.tryLock = tryLock;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
const lock_errors_1 = require("../errors/lock-errors");
const redisConfig = (0, config_1.getRedisConfig)();
const redis = typeof redisConfig === 'string'
    ? new ioredis_1.default(redisConfig)
    : new ioredis_1.default({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
    });
exports.lockRedisClient = redis;
redis.on('error', (err) => {
    console.error('Redis connection error for distributed locks:', err);
});
redis.on('connect', () => {
    console.log('Redis connected for distributed locks');
});
class LockKeys {
    static ENV_PREFIX = process.env.NODE_ENV || 'dev';
    static inventory(eventId, tierId) {
        return `${this.ENV_PREFIX}:lock:inventory:${eventId}:${tierId}`;
    }
    static listing(listingId) {
        return `${this.ENV_PREFIX}:lock:listing:${listingId}`;
    }
    static ticket(ticketId) {
        return `${this.ENV_PREFIX}:lock:ticket:${ticketId}`;
    }
    static userPurchase(userId) {
        return `${this.ENV_PREFIX}:lock:user:${userId}:purchase`;
    }
    static reservation(reservationId) {
        return `${this.ENV_PREFIX}:lock:reservation:${reservationId}`;
    }
    static payment(paymentId) {
        return `${this.ENV_PREFIX}:lock:payment:${paymentId}`;
    }
    static refund(paymentId) {
        return `${this.ENV_PREFIX}:lock:refund:${paymentId}`;
    }
}
exports.LockKeys = LockKeys;
async function withLock(key, ttlMs, fn, options) {
    const startTime = Date.now();
    const service = options?.service || 'unknown';
    const lockType = options?.lockType || parseLockType(key);
    const lockValue = `${process.pid}-${Date.now()}`;
    let acquired = false;
    try {
        const maxRetries = 50;
        const retryDelayMs = 100;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
            if (result === 'OK') {
                acquired = true;
                const acquisitionTime = Date.now() - startTime;
                console.log(`Lock acquired: ${key} (${acquisitionTime}ms)`);
                break;
            }
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }
        if (!acquired) {
            const acquisitionTime = Date.now() - startTime;
            console.error(`Lock timeout: ${key} after ${acquisitionTime}ms`, {
                service,
                lockType,
                ttlMs
            });
            throw new lock_errors_1.LockTimeoutError(`Failed to acquire lock after ${acquisitionTime}ms`, key, ttlMs);
        }
        const result = await fn();
        return result;
    }
    catch (error) {
        if (error instanceof lock_errors_1.LockTimeoutError ||
            error instanceof lock_errors_1.LockContentionError ||
            error instanceof lock_errors_1.LockSystemError) {
            throw error;
        }
        if (error.message && (error.message.includes('Redis') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT'))) {
            console.error(`Lock system error: ${key}`, {
                service,
                lockType,
                error: error.message
            });
            throw new lock_errors_1.LockSystemError('Lock system unavailable', key, error);
        }
        throw error;
    }
    finally {
        if (acquired) {
            try {
                const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
                await redis.eval(script, 1, key, lockValue);
                const totalTime = Date.now() - startTime;
                console.log(`Lock released: ${key} (held for ${totalTime}ms)`);
            }
            catch (err) {
                console.warn(`Failed to release lock ${key}:`, err.message);
            }
        }
    }
}
async function withLockRetry(key, ttlMs, fn, options) {
    const maxRetries = options?.maxRetries ?? 3;
    const backoffMultiplier = options?.backoffMultiplier ?? 2;
    const initialDelayMs = options?.initialDelayMs ?? 100;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await withLock(key, ttlMs, fn, options);
        }
        catch (error) {
            lastError = error;
            if (!(error instanceof lock_errors_1.LockTimeoutError) &&
                !(error instanceof lock_errors_1.LockContentionError)) {
                throw error;
            }
            if (attempt === maxRetries) {
                break;
            }
            const delayMs = initialDelayMs * Math.pow(backoffMultiplier, attempt);
            console.log(`Lock retry attempt ${attempt + 1}/${maxRetries} for ${key} after ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastError;
}
async function tryLock(key, ttlMs) {
    try {
        const lockValue = `${process.pid}-${Date.now()}`;
        const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
        return result === 'OK';
    }
    catch (error) {
        return false;
    }
}
function parseLockType(key) {
    const parts = key.split(':');
    return parts.length >= 3 ? parts[2] : 'unknown';
}
class LockMetrics {
    static lockAcquisitionTimes = new Map();
    static lockWaitTimes = new Map();
    static lockTimeouts = 0;
    static activeLocks = new Set();
    static startAcquisition(key) {
        this.lockAcquisitionTimes.set(key, Date.now());
    }
    static endAcquisition(key) {
        const startTime = this.lockAcquisitionTimes.get(key);
        if (startTime) {
            const waitTime = Date.now() - startTime;
            this.lockWaitTimes.set(key, waitTime);
            this.lockAcquisitionTimes.delete(key);
            console.log(`Lock wait time for ${key}: ${waitTime}ms`);
        }
        this.activeLocks.add(key);
    }
    static releaseLock(key) {
        this.activeLocks.delete(key);
    }
    static incrementTimeout() {
        this.lockTimeouts++;
    }
    static getMetrics() {
        return {
            activeLockCount: this.activeLocks.size,
            totalTimeouts: this.lockTimeouts,
            averageWaitTime: this.calculateAverageWaitTime(),
        };
    }
    static calculateAverageWaitTime() {
        const times = Array.from(this.lockWaitTimes.values());
        if (times.length === 0)
            return 0;
        return times.reduce((a, b) => a + b, 0) / times.length;
    }
}
exports.LockMetrics = LockMetrics;
exports.redlock = null;
//# sourceMappingURL=distributed-lock.js.map